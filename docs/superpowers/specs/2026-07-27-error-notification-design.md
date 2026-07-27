---
comet_change: error-notification
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-27-error-notification
status: final
---

# Error Notification 技术设计 Doc

> Change: error-notification
> 日期: 2026-07-27
> 阶段: design（对 open 阶段 design.md 的深度技术细化）

## 1. 背景与上下文

opencode-lark-bridge 插件当前通过 `event` hook 接收 OpenCode 事件，按 `event.type` 路由到各 mapper 后经 `notifier.send` 推送飞书。现有事件：`session.created`（子代理追踪）、`session.idle`（完成通知）、`question.asked`（问答通知）、`permission.asked`（权限通知）。

OpenCode 的 `session.error` 事件在以下场景由 `session/processor.ts` 的 `halt()` 函数发布：
- `provider-error`（模型 API 返回 400/429/500）→ throw → halt → `Bus.publish(Session.Event.Error, {sessionID, error})` → status idle
- `ContextOverflowError`（上下文溢出）→ halt → publish error
- 任何处理过程中未捕获的错误 → halt → publish error

事件 payload（源码 `session/session.ts` `Event.Error` schema）：
```typescript
{ sessionID?: string, error: { type: string, message: string } }
```

事件通过通用 `event` hook 透传，无独立直接 hook。

## 2. 目标与非目标

**目标**：
- 监听 `session.error` 事件并推送飞书通知
- 覆盖模型 API 错误、额度耗尽、上下文溢出
- 子代理错误也通知（与 completion 跳过子代理不同）
- 复用现有架构模式（mapper + handler + notifier）

**非目标**：
- 超时检测（主动告警）、tool-error、权限错误、插件加载错误
- 修改错误行为或重试逻辑（只读通知）

## 3. 架构与数据流

```
OpenCode 发布 session.error 事件
  │
  ▼
index.ts: event hook → enhanceEvent(event)
  │  └─ 新增 session.error 分支：注入 sessionID(normalize) + projectName
  ▼
event-handler.ts: handle(enhancedEvent)
  │  ├─ eventType === "session.error" (新增分支)
  │  │   ├─ 提取 sessionID
  │  │   ├─ 子代理检查：清理 pendingChildren（不跳过通知）
  │  │   ├─ 去重：error:<sessionID> + debounce_ms
  │  │   ├─ getEffectiveTarget(config, "error")
  │  │   ├─ mapErrorEvent(event, target, template)
  │  │   └─ notifier.send(message)
  │  └─ ...
  ▼
lark-notifier.ts: 构造 lark-cli 命令 → 执行 → 飞书通知
```

## 4. 组件设计

### 4.1 error-mapper.ts（新文件）

**职责**：从 `session.error` 事件提取错误信息并渲染通知模板。

**接口**（对齐现有 mapper 模式）：
```typescript
export function mapErrorEvent(
  event: any,
  target: NotificationTarget,
  template?: string
): NotificationMessage
```

**字段提取逻辑**：
```typescript
const props = (event?.properties ?? event) as Record<string, unknown>
const sessionID = (typeof props.sessionID === "string" ? props.sessionID : undefined)
  ?? (typeof props.id === "string" ? props.id : undefined)
  ?? "unknown"
const error = props.error as Record<string, unknown> | undefined
const errorType = typeof error?.type === "string" ? error.type : "unknown"
const errorMessage = typeof error?.message === "string" ? error.message : "unknown"
const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"
```

**默认模板**：
```
⚠️ OpenCode Error
Project: {projectName}
Session: {sessionID}
Type: {errorType}
Message: {errorMessage}
```

**模板渲染**：`.replace(/{sessionID}/g, …).replace(/{errorType}/g, …).replace(/{errorMessage}/g, …).replace(/{projectName}/g, …)`

**设计要点**：
- `error` 对象缺失或字段类型不符 → 降级 `unknown`，不抛异常
- `sessionID` 优先 `props.sessionID`，回退 `props.id`，再降级 `unknown`
- `projectName` 由 `enhanceEvent` 注入，缺失时 `unknown`

### 4.2 event-handler.ts 集成

**新增分支位置**：在 `handle` 方法中 `question.asked` 分支之后，`permission.asked` 默认 `return` 之前。

**分支逻辑**：
```typescript
if (eventType === "session.error") {
  logger.debug("Received session.error event", { eventType, event })
  const props = (event?.properties ?? event) as Record<string, unknown>
  const sessionID = extractSessionID(props) ?? "unknown"

  // 子代理错误：清理追踪状态但不跳过通知
  if (isSubagent(event)) {
    const parentID = subagentParentMap.get(sessionID)
    if (parentID) {
      pendingChildren.get(parentID)?.delete(sessionID)
      logger.debug("Removed error session from pendingChildren", { parentID, sessionID })
    }
  }

  // 去重
  const key = `error:${sessionID}`
  const now = Date.now()
  const last = lastSent.get(key)
  if (last && now - last < config.debounce_ms) {
    logger.debug("Skipping duplicate error notification", { key })
    return
  }
  lastSent.set(key, now)

  const category = "error"
  const target = getEffectiveTarget(config, category)
  const categoryConfig = config.categories[category] || {}
  const message = mapErrorEvent(event, target, categoryConfig.template)
  logger.info("Sending error notification", { target, text: message.text })
  await notifier.send(message)
  return
}
```

**设计要点**：
- 子代理错误清理 `pendingChildren` 但**不跳过通知**（与 completion 跳过子代理不同），因为错误可能阻塞父会话
- 去重 key `error:<sessionID>`，与 question 的 `question:<id>` 模式一致
- 复用 `extractSessionID` 和 `isSubagent` 内部函数

### 4.3 index.ts enhanceEvent 更新

**新增 session.error 分支**（在 `type !== "session.idle"` return 之前）：
```typescript
if (type === "session.error") {
  const props = event?.properties ?? event ?? {}
  const sessionID = props?.sessionID ?? props?.id ?? "unknown"
  return {
    ...event,
    properties: {
      ...props,
      sessionID,
      projectName: props?.projectName ?? projectName,
    },
  }
}
```

**设计要点**：与 `question.asked` 分支模式一致，注入 `projectName` 供 mapper 使用。`sessionID` 做 normalize 以保证 mapper 提取一致性。

### 4.4 hook 注册日志更新

```typescript
// 旧
logger.info("Plugin hooks registered", { hooks: ["event", "permission.ask", "session.idle", "question.asked"] })
// 新
logger.info("Plugin hooks registered", { hooks: ["event", "permission.ask", "session.idle", "question.asked"] })
```
注：hooks 列表不变（session.error 通过 event hook 接收，无需新增直接 hook），但可在日志中补充说明 event hook 处理的事件类型。

## 5. 配置设计

### config example 新增 error category

`opencode-lark-bridge.config.example.jsonc` 在 `categories` 中新增：
```jsonc
"error": {
  // "target": { "chat_id": "..." },  // 可选：错误通知发送到指定群，未设置则用 default_target
  // "template": "⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}"
}
```

**类型兼容**：`PluginConfig.categories` 为 `Record<string, CategoryConfig>`，`"error"` category 无需新增类型。

**target 解析**：`getEffectiveTarget(config, "error")` 已在 `config.ts` 通用实现，回退到 `default_target`。

## 6. Spec Patch

回写 `specs/error-notification/spec.md` 的「默认错误通知模板」场景，将模板从：
```
`⚠️ OpenCode Error\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}`
```
更新为：
```
`⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}`
```
以与「项目名称注入」需求保持一致。

## 7. 测试策略

### 7.1 tests/error-mapper.test.ts（新文件）

| 测试用例 | 验证点 |
|---------|--------|
| 标准 payload 提取 | `error.type`/`error.message`/`sessionID` 正确替换 |
| 缺失 sessionID 降级 | `{sessionID}` → `unknown` |
| 缺失 error 对象降级 | `{errorType}`/`{errorMessage}` → `unknown` |
| 自定义模板渲染 | 传入 template 参数正确渲染 |
| 默认模板渲染 | 未传 template 时使用默认模板含 `{projectName}` |

### 7.2 tests/event-handler.test.ts 新增用例

| 测试用例 | 验证点 |
|---------|--------|
| 主会话错误通知 | session.error → notifier.send 被调用 |
| 子代理错误通知不跳过 | 子代理 sessionID 的 error → send 被调用 + pendingChildren 清理 |
| 去重 debounce_ms 内跳过 | 同 sessionID 短时间内第二次 error → send 仅一次 |
| 不同会话独立通知 | 两个 sessionID 各发送 |
| target 回退 | 未配 error category target → 回退 default_target |

### 7.3 构建验证

- `npm run build`（tsc strict）零类型错误
- `bun test` 全部通过

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| `error.message` 内容因 provider 而异 | 只做字符串替换不解析结构；用户可自定义 template |
| `session.error` 可能含非模型错误（旧版插件加载错误） | 不过滤类型，所有 error 都通知（宁多勿漏） |
| 子代理错误可能频繁（并行失败） | debounce_ms 按 sessionID 独立去重，不同子代理各自通知 |
| `error` 对象结构随 OpenCode 更新变化 | `typeof` 守卫 + `unknown` 降级，不抛异常 |
