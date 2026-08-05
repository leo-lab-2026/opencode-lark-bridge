---
comet_change: add-retry-notification
role: technical-design
canonical_spec: openspec
archived-with: 2026-08-05-add-retry-notification
status: final
---

# 重试通知与错误字段提取修复 — 技术设计

## 1. 背景与目标

opencode 对可重试错误（429/5xx/ECONNRESET 等，`isRetryable` 或 statusCode >= 500）采用无限重试（`session/retry.ts` 的 `Schedule.fromStepWithMetadata`，无放弃路径），重试期间唯一事件是 `session.status`（`status.type === "retry"`，携带 `attempt`/`message`/`action`/`next`）。现有插件只监听 `permission.asked`/`session.idle`/`question.asked`/`session.error`，429 重试期间完全静默。

本设计实现：
1. 新增 `session.status` retry 状态监听与飞书通知（配置化阈值、首次 + 定期提醒、子代理开关、内容详略开关）
2. 修复 `error-mapper` 字段提取 bug：opencode 错误对象形状为 `{ name, data: { message, statusCode, ... } }`（schema `namedError`），现有提取 `error.type`/`error.message` 导致生产环境 Type/Message 恒为 "unknown"

## 2. 事件流与数据形状

```
opencode 事件: session.status
properties: {
  sessionID: string,
  status: {
    type: "retry",
    attempt: number,          // 当前尝试次数（从 1 递增）
    message: string,          // 如 "Provider is overloaded" / "credits quota exhausted"
    action?: { reason, provider, title, message, label, link },  // upsell 等
    next: number              // 下次重试 epoch ms
  }
}

错误事件: session.error
properties: {
  sessionID?: string,
  error: {                    // namedError 形状
    name: string,             // "APIError" | "ProviderAuthError" | ...
    data: { message: string, statusCode?: number, isRetryable?: boolean, ... }
  }
}
```

## 3. 实现设计

### 3.1 配置（src/types.ts + src/config.ts）

`CategoryConfig` 增加 4 个可选字段（仅 retry 分支读取，其他类别忽略）：

```typescript
export interface CategoryConfig {
  target?: NotificationTarget
  template?: string
  template_multiple?: string
  question_item_template?: string
  // retry 类别专用
  retry_threshold?: number      // 默认 1
  retry_interval_ms?: number    // 默认 900_000（15 分钟）
  notify_subagent?: boolean     // 默认 false
  retry_detail?: boolean        // 默认 true
}
```

默认值策略：**分支内兜底**（`?? 1` / `?? 900_000` 等），不预先填充 `categories`（与现有"类别缺失即回退"模式一致，`loadConfig` 无需改动默认配置逻辑）。`getEffectiveTarget(config, "retry")` 复用现有回退。

### 3.2 事件路由（src/events/event-handler.ts）

在 `handle()` 中新增 `session.status` 分支（放在 `session.error` 分支之后、`permission.asked` 之前）：

```
if (eventType === "session.status") {
  status = props.status
  if (!status || status.type !== "retry") return       // busy/idle 忽略
  sessionID = extractSessionID(props) ?? "unknown"

  if (isSubagent(event) && categoryConfig.notify_subagent !== true) {
    debug log; return                                    // 子代理默认不通知
  }

  attempt = typeof status.attempt === "number" ? status.attempt : 0
  threshold = categoryConfig.retry_threshold ?? 1
  if (attempt < threshold) { debug log; return }        // 阈值未达

  key = `retry:${sessionID}`; now = Date.now()
  interval = categoryConfig.retry_interval_ms ?? 900_000
  last = lastRetrySent.get(key)
  if (last && now - last < interval) { debug log; return }  // 节流窗口内
  lastRetrySent.set(key, now)

  message = mapRetryEvent(event, target, template, categoryConfig.retry_detail)
  await notifier.send(message)
  return
}
```

新增状态：`const lastRetrySent = new Map<string, number>()`（createEventHandler 闭包内，与 `lastSent` 同模式：内存内、不持久化、每会话一条目）。

**不变量**：
- 不写入 `erroredSessions`（429 恢复后 `session.idle` 仍发 completion）
- 不动 `pendingChildren`（子代理重试未结束，父会话仍在等待）
- 通知失败不抛出（`notifier.send` 内部已降级，与现有分支一致）

### 3.3 retry-mapper（新增 src/events/retry-mapper.ts）

```typescript
const DEFAULT_TEMPLATE = "⚠️ OpenCode 重试中\nProject: {projectName}\nSession: {sessionTitle}\n原因: {message}\n尝试: {attempt} 次\n下次重试: {next}"

export function mapRetryEvent(event, target, template?, detail?: boolean): NotificationMessage
```

- 提取：`status.message`（缺失 → "unknown"）、`status.attempt`（非 number → ""）、`status.next`（非 number → ""；否则格式化）
- `next` 格式化：`Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })` → `MM-DD HH:mm`
- `detail === false` 时：`{attempt}` 与 `{next}` 替换为空字符串（默认模板中对应行变为空行，用户自定义模板时按模板原样）
- `projectName`/`sessionTitle` 从 properties 取（由 enhanceEvent 注入），缺失 → "unknown"
- 兼容 `{sessionID}` 占位符（从 properties.sessionID）

### 3.4 enhanceEvent（src/index.ts）

新增 `session.status` 分支（与 `session.idle` 分支同构）：

```typescript
if (type === "session.status") {
  const props = event?.properties ?? event ?? {}
  const sessionID = props?.sessionID ?? props?.id ?? "unknown"
  return { ...event, properties: { ...props, sessionID, projectName: ..., sessionTitle: resolveSessionTitle(sessionID, event) } }
}
```

（`session.status` 的 `props.sessionID` 由 schema 保证存在，extractSessionID 直接命中。）

### 3.5 error-mapper 修复（src/events/error-mapper.ts）

```typescript
const error = props.error as Record<string, unknown> | undefined
const errorData = (error?.data as Record<string, unknown>) ?? {}
const rawType = typeof error?.type === "string" ? error.type
  : typeof error?.name === "string" ? error.name
  : "unknown"
const errorMessage = typeof error?.message === "string" ? error.message
  : typeof errorData?.message === "string" ? errorData.message
  : "unknown"
const statusCode = typeof errorData?.statusCode === "number" ? errorData.statusCode : undefined
const errorType = statusCode !== undefined ? `${rawType} (${statusCode})` : rawType
```

- 旧形状（`{type, message}`）优先——测试与历史事件兼容；新形状（`{name, data:{message}}`）兜底
- `statusCode` 附加到类型显示（如 `APIError (429)`），默认模板不变
- 默认模板增加 `{statusCode}` 占位符可选支持（自定义模板可用）

## 4. 测试策略

| 文件 | 用例 |
|---|---|
| `tests/retry-mapper.test.ts`（新） | 标准提取、detail=false 跳过详情、缺失字段降级、next 格式化（固定时间戳断言 MM-DD HH:mm）、sessionID 缺失 |
| `tests/event-handler.test.ts` | busy/idle 状态不通知、阈值未达/达到、节流窗口内跳过、超时再提醒、不同会话独立节流、子代理默认不通知/开关开启后通知、子代理不清理 pendingChildren、retry 后 idle 仍发 completion、不污染 erroredSessions |
| `tests/integration.test.ts` | session.status(retry) → notifier 端到端（含节流、恢复后 completion） |
| `tests/index.test.ts` | enhanceEvent 对 session.status 注入 sessionID/projectName/sessionTitle |
| `tests/error-mapper.test.ts` | 新形状 `{name, data:{message,statusCode}}` 提取、旧形状优先、statusCode 附加、缺失降级 |

## 5. Spec Patch（回写 delta spec）

1. `specs/retry-notification/spec.md`：新增边界场景"status 字段缺失或类型异常时安全跳过，不发送通知、不抛错"
2. `specs/error-notification/spec.md`：标准提取场景补充 statusCode 附加显示（`APIError (429)`）

## 6. 风险与边界

- **事件频率**：重试指数退避 2s→30s 持续产生 `session.status`；15 分钟节流保证最多每会话每 15 分钟一条
- **attempt 语义**：每轮流（一次失败重试循环）内递增；阈值按 attempt 判定，恢复后新一轮从 1 重新计数
- **opencode 版本演进**：`status` 字段形状若变化，防御性类型检查（非 number attempt/next 降级）保证不 crash；`action` 字段当前未使用（upsell 链接不纳入通知，避免模板膨胀，后续可按需扩展）
- **内存**：`lastRetrySent` 每会话一条目，与会话数线性；会话恢复后条目保留（再次重试时若超过间隔立即通知，行为合理）
