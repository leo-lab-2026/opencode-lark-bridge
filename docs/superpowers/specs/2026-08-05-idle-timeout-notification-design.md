---
comet_change: add-idle-timeout-notification
role: technical-design
canonical_spec: openspec
archived-with: 2026-08-05-add-idle-timeout-notification
status: final
---

# 会话停滞（Stall）通知 — 技术设计

## 1. 背景与目标

opencode 事件流是异步推送制：模型挂起、SSE 超时、网络黑洞等场景下，会话持续 `busy` 但不产生任何事件（无 `message.part.delta`、无工具调用、无 retry 信号）。纯事件驱动无法感知"没有事件发生"，用户收不到任何飞书通知（429 无限重试由 `retry-notification` 能力覆盖，本 change 覆盖完全静默的停滞）。

目标：通过**事件驱动的活动追踪 + 内存定时器扫描**，对"距最后活动超过 `stall_timeout_ms`（默认 10 分钟）"的活跃会话发送飞书提醒，并按 `stall_interval_ms`（默认 60 分钟）节流防刷屏。

非目标：不做进程外监控（进程崩溃插件随之消亡，无法自通知）；不持久化活动状态；不改变现有四类通知与 retry 通知行为。

## 2. 事件流与状态模型

```
事件（任何类型）→ handle() 入口统一提取 sessionID → touchActivity(sessionID)
                                                  → 子代理事件沿 subagentParentMap 级联 touch 父会话
session.created / session.updated → 缓存 title 到 stallMeta
session.idle / session.error / session.deleted → 移除追踪 + 清理条目

定时器（index.ts setInterval, stall_check_interval_ms）→ scanStalledSessions()
  for (sessionID, lastActiveAt) of lastActive:
    if 子代理会话: continue                       // 不单独提醒
    if now - lastActiveAt < stall_timeout_ms: continue
    if lastSent 且 now - lastSent < stall_interval_ms: continue
    send(mapStallEvent(stallMeta, target, template))  // 失败仅记日志
```

状态表（`createEventHandler` 闭包内，内存内、不持久化）：

| 表 | 键 | 值 | 生命周期 |
|---|---|---|---|
| `lastActive` | sessionID | 最后活动时间戳 | created 加入，idle/error/deleted 删除 |
| `stallLastSent` | sessionID | 上次提醒时间戳 | 首次提醒时写入，会话结束时清理 |
| `stallMeta` | sessionID | `{ projectName, sessionTitle }` | created/updated 更新，会话结束时清理 |

## 3. 实现设计

### 3.1 配置（src/types.ts + src/config.ts）

`CategoryConfig` 增加 3 个可选字段（仅 stall 扫描分支读取）：

```typescript
export interface CategoryConfig {
  // ...existing...
  // stall 类别专用
  stall_timeout_ms?: number          // 超时阈值，默认 600_000（10 分钟）
  stall_interval_ms?: number         // 重复提醒节流窗口，默认 3_600_000（60 分钟）
  stall_check_interval_ms?: number   // 定时器扫描间隔，默认 60_000（1 分钟）
}
```

默认值策略：**分支内兜底**（`?? 600_000` / `?? 3_600_000` / `?? 60_000`），不预填 `categories`——与 retry-notification 先例一致，`loadConfig` 无需改动。`getEffectiveTarget(config, "stall")` 复用现有回退逻辑（`categories.stall.target` → `default_target`）。

### 3.2 活动追踪（src/events/event-handler.ts）

`handle()` 入口（`eventType` 解析之后、各分支分派之前）统一插入活动追踪：

```
const sessionID = extractSessionID(props) ?? "unknown"
if (sessionID !== "unknown") {
  touchActivity(sessionID, event)   // 更新 lastActive；有 title 时更新 stallMeta
  if (sessionID 是子代理) 级联 touch 父会话链
}
```

- **`touchActivity(sessionID)`**：`lastActive.set(sessionID, Date.now())`；从 event 提取 `title`（复用 `info.title ?? info.sessionTitle ?? properties.sessionTitle`）写入 `stallMeta`（非空时）
- **级联 touch**：若 `subagentParentMap.has(sessionID)`，沿父链向上（父会话也可能本身是子代理）逐个 `lastActive.set(parentID, now)`——子代理活跃 = 任务有进展，防止子代理长任务期间父会话误报 stall
- **`session.created`**：现有 `trackSubagent` 分支之后追加 `lastActive.set(sessionID, Date.now())` + title 缓存（created 事件本身也应 touch，因为它表示开始工作）；同时注意 created 事件在入口统一 touch 时已覆盖，但子代理 created 在 `trackSubagent` 分支 return——需要确保入口 touch 在 `trackSubagent` 之前执行即可统一覆盖
- **`session.idle` / `session.error` / `session.deleted`**：在对应分支处理时删除 `lastActive`/`stallLastSent`/`stallMeta` 条目。idle/error 分支现有逻辑已存在，追加清理调用；`session.deleted` 为新增轻量分支（仅清理，不发送通知）
- **`"unknown"` sessionID 不追踪**：无法解析 ID 的会话不纳入扫描，避免条目污染

**实现顺序注意**：`session.created` 分支目前直接 `trackSubagent(event)` 后 `return`，入口统一 touch 需放在 `eventType` 判断之后、`session.created` 分支之前——所有事件（包括 created）都先 touch，再走分支逻辑。

### 3.3 stall-mapper（新增 src/events/stall-mapper.ts）

```typescript
const DEFAULT_TEMPLATE = "⚠️ OpenCode 会话停滞\nProject: {projectName}\nSession: {sessionTitle}\n无进展时长: {idleDuration}"

export function mapStallEvent(
  meta: { projectName?: string; sessionTitle?: string; idleDuration: string },
  target: NotificationTarget,
  template?: string
): NotificationMessage
```

- `idleDuration` 格式化：`formatDuration(ms)` → 中文可读时长
  - `< 60s` → `"N 秒"`
  - `< 60min` → `"X 分钟 Y 秒"`（Y>0 时）
  - `≥ 1h` → `"X 小时 Y 分钟"`（Y>0 时；否则 `"X 小时"`）
- `{projectName}` / `{sessionTitle}` 缺失 → `"unknown"`（spec: 会话上下文缺失降级，通知仍然发送）
- 占位符替换逻辑与其他 mapper 一致（`replaceAll` 式）

### 3.4 扫描函数（src/events/event-handler.ts）

```typescript
async function scanStalledSessions() {
  const now = Date.now()
  const category = "stall"
  const categoryConfig = config.categories[category] || {}
  const timeout = categoryConfig.stall_timeout_ms ?? 600_000
  const interval = categoryConfig.stall_interval_ms ?? 3_600_000
  for (const [sessionID, lastActiveAt] of lastActive) {
    if (subagentSessionIds.has(sessionID)) continue        // 子代理不单独提醒
    if (now - lastActiveAt < timeout) continue             // 未超时
    const lastSent = stallLastSent.get(sessionID)
    if (lastSent && now - lastSent < interval) continue    // 节流窗口内
    stallLastSent.set(sessionID, now)
    const target = getEffectiveTarget(config, category)
    const meta = stallMeta.get(sessionID) ?? {}
    const idleDuration = formatDuration(now - lastActiveAt)
    const message = mapStallEvent({ ...meta, idleDuration }, target, categoryConfig.template)
    logger.info("Sending stall notification", { sessionID, text: message.text })
    await notifier.send(message)                            // 失败内部已降级，不中断扫描
  }
}
```

- 不写入 `erroredSessions`（stall 只是提醒，不改会话语义；恢复后 `session.idle` 正常发 completion）
- 不动 `pendingChildren`（stall 不影响子代理等待关系）
- 返回类型：`scanStalledSessions(): Promise<void>`，供 `createEventHandler` 返回对象暴露

### 3.5 定时器（src/index.ts）

```typescript
const stallCheckMs = config.categories.stall?.stall_check_interval_ms ?? 60_000
const timer = setInterval(() => { void handler.scanStalledSessions() }, stallCheckMs)
```

- 定时器在 `OpenCodeLarkBridge` 内创建，随 opencode 进程生命周期（进程退出即回收，无需显式 `clearInterval`）
- 测试可注入：`tests/index.test.ts` 通过构造带 `stall_check_interval_ms` 的配置 + 伪 `setInterval`（或直接断言返回值），验证间隔读取正确（实现细节以测试覆盖为准）

### 3.6 enhanceEvent（src/index.ts）

无需改动：stall 通知的 `projectName`/`sessionTitle` 来自 handler 内 `stallMeta` 缓存（`session.created`/`session.updated` 时由 `cacheSessionTitle` 与入口 touch 共同填充），不依赖 enhanceEvent 注入。`stallMeta` 在 handler 内部自维护，index.ts 的 `sessionTitles` 缓存保持不变。

## 4. 测试策略

| 文件 | 用例 |
|---|---|
| `tests/stall-mapper.test.ts`（新） | 默认模板渲染、idleDuration 格式化（秒/分钟+秒/小时+分钟）、缺失字段降级为 "unknown" |
| `tests/event-handler.test.ts` | 活动追踪：created 加入、任意事件更新、idle/error/deleted 清理；scanStalledSessions：超时触发、未超时跳过、节流窗口内不重复、恢复活动重置、retry 事件流不触发 stall、**子代理级联 touch（子代理事件更新父会话）**、**子代理不单独提醒**、stall 不污染 erroredSessions、通知失败不中断扫描 |
| `tests/integration.test.ts` | 静默会话超时 → notifier 端到端（注入短超时阈值，手动调用 scan） |
| `tests/index.test.ts` | 定时器按 `stall_check_interval_ms` 创建（间隔注入可测） |

测试模式：`createEventHandler` 返回对象新增 `scanStalledSessions`，测试直接调用并注入 `Date.now`（通过配置短阈值 + 真实等待或 mock 时间，参照现有测试的 notifier mock 模式）。

## 5. Spec Patch

无。delta spec（`specs/stall-notification/spec.md`）已含：会话活动追踪、无进展超时提醒、与重试通知分工、停滞不干扰完成通知、停滞信息提取与模板渲染、定时器生命周期——与设计一致，无需回写。

## 6. 风险与边界

- **误报**：模型单次长推理（极端场景无 delta）可能触发；10 分钟默认阈值 + 60 分钟节流 + 阈值可配置，接受误报概率
- **子代理误报防护**：级联 touch 保证子代理活跃期间父会话不触发；子代理自身不单独提醒，父会话超时已覆盖"子代理卡住"场景
- **内存增长**：长期进程大量会话创建后未结束 → `lastActive` 持续增长；idle/error/deleted 清理覆盖常规路径，`session.deleted` 新增轻量分支兜底
- **定时器与进程生命周期**：opencode 崩溃 → stall 无法自救（无通知），能力边界文档明示
- **`session.status` 非 retry 类型**：现有分支已忽略 busy 等状态；但入口统一 touch 会更新活动时间——busy 状态事件频繁时 stall 不触发，语义正确（busy 事件=有活动）
- **与 retry 分工**：retry 期间 `session.status` 事件持续发布 → 活动时间持续更新 → 不触发 stall；stall 仅覆盖完全静默
