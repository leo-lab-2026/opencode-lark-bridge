## Context

opencode-lark-bridge 插件当前监听四类事件：`session.created`（子代理追踪）、`session.idle`（完成通知）、`question.asked`（问答通知）、`permission.asked`（权限通知）。事件处理集中在 `src/events/event-handler.ts` 的 `createEventHandler`，通过 `event` hook 统一接收，按 `event.type` 路由到各 mapper（`permission-mapper`、`completion-mapper`、`question-mapper`），经 `getEffectiveTarget` 解析 target 后调用 `notifier.send`。

OpenCode 的 `session.error` 事件由 `session/processor.ts` 的 `halt()` 函数在以下场景发布：
- `provider-error`（模型 API 返回 400/429/500 等）→ `throw` → `halt()` → `Bus.publish(Session.Event.Error, { sessionID, error })` → `status idle`
- `ContextOverflowError`（上下文溢出）→ `halt()` → `Bus.publish(Session.Event.Error, …)`
- 任何处理过程中未捕获的错误 → `halt()` → `Bus.publish(Session.Event.Error, …)`

事件 payload 结构：`{ sessionID?: string, error: { type: string, message: string } }`（源码 `session/session.ts` 中 `Event.Error` 的 schema）。

约束：
- 事件 hook 只读，不得修改 event 对象（OpenCode 插件约束）
- 通知失败不得阻塞 OpenCode 主流程
- 状态必须内存内（`lastSent`、`subagentSessionIds` 等不持久化）
- TypeScript strict 模式零错误

## Goals / Non-Goals

**Goals:**
- 当致命错误导致 OpenCode 会话停止时，自动推送飞书通知
- 覆盖模型 API 错误（400/429/500）、额度耗尽、上下文溢出等场景
- 子代理错误也通知（与 completion 跳过子代理的模式不同）
- 复用现有架构模式（event-handler 路由 + mapper 渲染 + notifier 发送）

**Non-Goals:**
- 不实现无活动超时检测（主动告警），仅处理已触发的 `session.error` 事件
- 不处理工具执行中的非致命错误（`tool-error`，工具内错误不触发 `session.error`）
- 不处理权限相关错误（已有 permission 通知覆盖）
- 不处理插件加载错误（OpenCode 已迁移到独立 `plugin.error` 事件）
- 不修改错误本身的行为或重试逻辑（只读通知）

## Decisions

### 决策 1：通过 `event` hook 接收 `session.error`，而非新增独立 hook

**选择**：在 `event-handler.ts` 的 `handle` 方法中新增 `eventType === "session.error"` 分支。

**理由**：OpenCode 当前未为 `session.error` 提供独立的 hook（如 `session.error` hook），该事件通过通用 `event` hook 透传。这与现有 `permission.asked`、`question.asked` 的接收路径一致。

**备选**：注册 `"session.error": async (input) => {…}` 独立 hook（类似 `session.idle`）。不采用，因为 `session.idle` hook 是历史遗留的直接 hook，而 `session.error` 无对应的直接 hook 定义，`event` hook 是标准入口。

### 决策 2：子代理错误也通知

**选择**：`session.error` 分支不检查 `isSubagent(event)`，所有 `session.error` 事件均发送通知。但需清理子代理的 `pendingChildren` 追踪状态（因为错误后子代理不再会 idle）。

**理由**：子代理错误可能阻塞父会话的 pendingChildren 检查——父会话的 completion 通知逻辑等待子代理 idle，但子代理因错误 idle 后已被 `session.idle` 分支清理。如果子代理错误而非正常 idle，需要确保 pendingChildren 不会永久阻塞父会话。通知子代理错误让用户能及时干预。

**备选**：跳过子代理错误（与 completion 一致）。不采用，因为错误比完成更关键，用户需要知晓任何导致停止的错误。

### 决策 3：去重使用 `debounce_ms` + sessionID

**选择**：以 `error:<sessionID>` 为去重 key，复用 `lastSent` Map 和 `debounce_ms` 配置，与 question 通知的去重模式一致。

**理由**：统一去重机制，保持代码一致性。`debounce_ms` 已在配置中存在，无需新增配置项。

**备选**：按 `sessionID + error.type` 组合去重。不采用，因为用户确认复用 `debounce_ms` 机制即可，避免过度设计。

### 决策 4：error-mapper 结构对齐现有 mapper 模式

**选择**：新增 `src/events/error-mapper.ts`，导出 `mapErrorEvent(event, target, template?): NotificationMessage`，与 `mapCompletionEvent`、`mapQuestionEvent` 签名一致。

**理由**：保持 mapper 层的统一接口模式，便于测试和维护。模板变量使用 `{errorType}`、`{errorMessage}`、`{sessionID}`、`{projectName}`，缺失字段降级为 `unknown`（与 `extractResource` 的降级策略一致）。

**备选**：在 event-handler 内联错误渲染逻辑。不采用，因为违反单一职责且现有模式已拆分 mapper。

### 决策 5：默认模板与 error category 配置

**选择**：
- 默认模板：`⚠️ OpenCode Error\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}\nProject: {projectName}`
- 在配置中新增 `"error"` category（与 `permission`、`completion`、`question` 同级），支持 `target` 和 `template` 覆盖

**理由**：错误通知需要醒目的前缀（⚠️）和完整的错误上下文。配置 category 模式让用户可以按类型路由错误通知到不同飞书群（如发送到告警群）。

## Risks / Trade-offs

- **[error.message 内容不可控]** → OpenCode 的 `error.message` 来自底层 provider 错误，格式和详细程度因 provider 而异。缓解：模板只做字符串替换，不解析 message 结构；用户可通过自定义 template 控制展示格式。
- **[session.error 可能包含非模型错误]** → 如插件加载错误（已迁移到 `plugin.error` 但旧版本可能仍触发）。缓解：不做类型过滤，所有 `session.error` 都通知——用户宁可多收一条误导性通知，也不愿漏收关键错误。
- **[子代理错误可能频繁]** → 并行多子代理同时失败可能产生多条通知。缓解：`debounce_ms` 去重按 sessionID 独立计算，不同子代理的 sessionID 不同所以仍会各自通知，但这正是用户需要的（确认）。如噪音过大可在后续迭代增加按 error.type 聚合。
- **[error 对象结构变化]** → OpenCode 更新可能改变 `error` 对象的 `{ type, message }` 结构。缓解：mapper 对 `error.type` 和 `error.message` 做 `typeof` 保护检查，缺失降级为 `unknown`，不抛异常。