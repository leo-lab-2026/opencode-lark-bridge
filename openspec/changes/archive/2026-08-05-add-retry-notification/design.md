## Context

现有事件路由见 `src/events/event-handler.ts`：`handle(event)` 按 `event.type` 分派，已处理 `session.created` / `session.idle` / `question.asked` / `session.error` / `permission.asked`。节流统一走内存 Map `lastSent` + `debounce_ms`；子代理用 `subagentSessionIds` / `pendingChildren` 追踪；`erroredSessions` 用于跳过已错误会话的 completion。

opencode 对可重试错误（429/5xx）无限重试，重试期间唯一事件是 `session.status`（`properties: { sessionID, status: { type: "retry", attempt, message, next } }`），每次尝试都会发布（attempt 递增）。见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- 复用现有 `lastSent` 式内存节流模式，新增 per-session retry 通知状态，保持"状态必须内存内"约定
- 配置形态与现有 category 机制一致（`getEffectiveTarget` 回退 `default_target`）
- 重试通知与 completion/error 逻辑互不干扰

**Non-Goals:**
- 不引入后台定时器或持久化状态（事件驱动节流足够）
- 不修改 opencode 重试行为，不实现模型 fallback
- 不改变 `debounce_ms` 语义（retry 用独立 `retry_interval_ms`）

## Decisions

**D1: 事件驱动节流，无后台定时器**

定期提醒的实现：每次收到 retry 事件时检查"距上次通知是否超过 `retry_interval_ms`"，超过则再次发送。无需定时器：重试本身会持续产生事件流（指数退避，最多 30s 一次），事件驱动的检查频率足够及时。新增内存 Map `lastRetrySent: Map<sessionID, number>`，与 `lastSent` 同模式，无持久化、不跨进程。

**D2: 新增独立 category `retry`，默认开启**

`categories.retry` 结构：

```
retry: {
  target?: string            // 回退 default_target
  template?: string          // 默认模板含 {projectName} {sessionTitle} {message} {attempt} {next}
  retry_threshold?: number   // 默认 1（首次重试即通知）
  retry_interval_ms?: number // 默认 900_000（15 分钟）
  notify_subagent?: boolean  // 默认 false（子代理重试不通知，与 completion 策略一致）
  retry_detail?: boolean     // 默认 true（包含 attempt/next 详情；false 时通知只含原因与上下文）
}
```

未配置 `categories.retry` 时按上述默认值启用——改进的初衷是"用户不再静默"，默认开启符合预期；节流默认值（首次 + 15 分钟）已防刷屏。`notify_subagent` 默认关闭避免子代理通知噪音，需要时用户显式开启；`retry_detail` 关闭时 mapper 跳过 `{attempt}`/`{next}` 渲染。

**D3: 路由与阈值判断在 event-handler 内完成**

`handle()` 新增 `session.status` 分支：`status.type !== "retry"` 直接返回；`attempt < retry_threshold` 跳过；`notify_subagent === false` 且为子代理会话时跳过；通过节流检查后调用新 `retry-mapper.ts` 渲染并发送。阈值/节流/子代理开关属于行为控制逻辑，保留在 handler；mapper 只负责字段提取与模板渲染（与 permission/error mapper 职责一致）。

**D4: retry 不污染 `erroredSessions`，不清理 pendingChildren**

- 重试只是"进行中"状态，不标记 errored——429 恢复后 `session.idle` 仍发 completion（spec: 重试恢复不干扰完成通知）
- 子代理 retry 通知按子代理自身 sessionID 节流发送（开启时），但**不**从父会话 `pendingChildren` 移除（重试未结束，父会话仍在等待；移除操作仅发生在 `session.idle` / `session.error` 分支）

**D5: 事件增强复用现有 `enhanceEvent`**

`src/index.ts` 的 `enhanceEvent` 对 `session.status` 注入 `sessionID`/`projectName`/`sessionTitle`（`sessionTitle` 从 `sessionTitles` 缓存解析），与 `session.idle` 分支一致；`sessionID` 提取统一走 `extractSessionID`。

**D6: fallback 机制定位**

opencode 社区 fallback 方案（omo/oms）通过监听 `session.status` 等事件在 429 时切换备选模型，与重试通知共用同一信号源。本 change 不实现 fallback（属用户侧 opencode 配置），仅在 README 说明关联：fallback 减少重试发生频率，重试通知兜底"重试进行中"的知情权，二者互补。

**D7: 修复 error-mapper 字段提取**

opencode 错误对象（`namedError` schema）形状为 `{ name, data: { message, statusCode, isRetryable, ... } }`，现有 error-mapper 提取 `error.type`/`error.message` 与实际不符，导致生产环境 Type/Message 恒为 "unknown"。修复：提取优先级 `error.type`/`error.message`（旧形状，测试与历史兼容）→ `error.name`/`error.data.message`（opencode 实际形状）。可选扩展：`error.data.statusCode` 可用时附加到消息（如 "APIError (429)"），保持默认模板不变。同步更新 `tests/error-mapper.test.ts` 与 `tests/event-handler.test.ts` 中按旧形状假设的用例，补充实际形状用例。

## Risks / Trade-offs

- **通知时机与误报**：`retry_interval_ms` 过小或 `retry_threshold` 过低可能造成打扰；默认值（首次 + 15 分钟）经权衡选择，均可配置调整
- **event 形状依赖**：`session.status` 的 retry 载荷基于 opencode `packages/schema/src/session-status-event.ts`，字段 `attempt`/`message`/`next` 为该 schema 明确字段，但未来 opencode 版本可能调整；mapper 对缺失字段做降级处理（spec: 缺失字段降级）
- **消息可读性**：`next` 为 epoch 毫秒时间戳，mapper 需格式化为可读时间（北京时区，与 logger 一致）
- **与 error 通知的边界**：429 走 retry 路径（无限重试）；若最终重试被放弃或错误不可重试，`session.error` 仍会触发 error 通知，两者互补不重叠
