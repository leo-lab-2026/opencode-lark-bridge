# error-notification Specification

## Purpose
TBD - created by archiving change error-notification. Update Purpose after archive.
## Requirements
### Requirement: 错误事件监听与通知

插件 SHALL 通过 `event` hook 监听 OpenCode 的 `session.error` 事件，在致命错误（模型 API 错误 400/429/500、额度耗尽、上下文溢出等）导致会话停止时，通过飞书通知用户。

#### Scenario: 模型 API 错误触发通知

- **WHEN** OpenCode 调用模型 API 返回 429（限流）、500（服务器错误）或 400（请求错误），导致 `session.error` 事件发布
- **THEN** 插件构造包含错误类型（`error.type`）和错误消息（`error.message`）的飞书通知并发送到配置的 target

#### Scenario: 额度耗尽触发通知

- **WHEN** 模型 API 返回 quota exceeded / rate limit exceeded 错误，触发 `session.error` 事件
- **THEN** 插件发送包含错误消息的飞书通知

#### Scenario: 上下文溢出触发通知

- **WHEN** 会话上下文超出模型限制，触发 `ContextOverflowError` 类型的 `session.error` 事件
- **THEN** 插件发送包含错误类型和上下文溢出信息的飞书通知

#### Scenario: 事件 hook 接收 session.error

- **WHEN** OpenCode 通过 `event` hook 传入 `event.type === "session.error"` 的事件
- **THEN** event-handler SHALL 将事件路由到 error-mapper 构造通知消息，并调用 notifier 发送

### Requirement: 错误信息提取与模板渲染

error-mapper SHALL 从 `session.error` 事件 payload 中提取错误信息并渲染通知模板。opencode 错误对象形状为 `{ name, data: { message, ... } }`（如 `{ name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429, isRetryable: true } }`）；提取规则：错误类型取 `error.name`，错误消息取 `error.data.message`，同时**兼容旧形状** `{ type, message }`（`error.type`/`error.message` 存在时优先使用）。`error.data.statusCode` 为 number 时附加到类型显示（如 `APIError (429)`）。提取字段还包括：`sessionID`（会话标识，可为空）、`projectName`（项目名称，可为空）。

#### Scenario: 标准 error payload 提取

- **WHEN** 事件 properties 包含 `error: { type: "ProviderError", message: "429 Too Many Requests" }` 和 `sessionID: "sess-123"`
- **THEN** 模板中的 `{errorType}` 替换为 `"ProviderError"`，`{errorMessage}` 替换为 `"429 Too Many Requests"`，`{sessionID}` 替换为 `"sess-123"`

#### Scenario: 标准 error payload 提取（opencode 实际形状）

- **WHEN** 事件 properties 包含 `error: { name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429 } }` 和 `sessionID: "sess-123"`
- **THEN** 模板中的 `{errorType}` 替换为 `"APIError (429)"`（statusCode 附加显示），`{errorMessage}` 替换为 `"429 Too Many Requests"`，`{sessionID}` 替换为 `"sess-123"`

#### Scenario: 实际形状无 statusCode 提取

- **WHEN** 事件 properties 包含 `error: { name: "ProviderAuthError", data: { message: "Invalid API key" } }`
- **THEN** `{errorType}` 替换为 `"ProviderAuthError"`（无 statusCode 不附加），`{errorMessage}` 替换为 `"Invalid API key"`

#### Scenario: 旧形状与基本形状同时存在时旧形状优先

- **WHEN** 事件 properties 包含 `error: { type: "LegacyType", message: "legacy message", name: "APIError", data: { message: "data message" } }`
- **THEN** `{errorType}` 替换为 `"LegacyType"`，`{errorMessage}` 替换为 `"legacy message"`（旧形状字段优先，不采用 name/data）

#### Scenario: 缺失字段降级

- **WHEN** `error` 缺失、或 `name`/`data.message` 与旧形状字段均缺失
- **THEN** `{errorType}`/`{errorMessage}` 替换为 `"unknown"`，通知仍然发送

#### Scenario: 缺失 sessionID 的降级处理

- **WHEN** 事件 properties 中的 `sessionID` 缺失或为空
- **THEN** 模板中的 `{sessionID}` 替换为 `"unknown"`，通知仍然发送

#### Scenario: 自定义模板渲染

- **WHEN** 配置中 error category 提供了自定义 `template` 字符串
- **THEN** 使用自定义模板渲染；未配置时使用默认模板；`{statusCode}` 占位符在自定义模板中可用（缺失为空）

#### Scenario: 项目名称注入

- **WHEN** event-handler 处理 session.error 事件时
- **THEN** SHALL 将当前 `projectName` 注入到通知消息中

### Requirement: 子代理错误通知

插件 SHALL 对子代理（subagent）产生的 `session.error` 事件发送通知。此行为与 completion 通知跳过子代理的模式不同——子代理错误可能阻塞父会话，用户需及时知晓。

#### Scenario: 子代理错误触发通知

- **WHEN** 子代理会话的 `session.error` 事件发布，且该 sessionID 存在于 `subagentSessionIds` 集合中
- **THEN** 插件 SHALL 发送飞书通知（不跳过），并清理对应的 pendingChildren 追踪状态

#### Scenario: 非子代理错误触发通知

- **WHEN** 主会话的 `session.error` 事件发布
- **THEN** 插件 SHALL 发送飞书通知

### Requirement: 错误通知去重

插件 SHALL 使用配置的 `debounce_ms` 对同一 sessionID 的重复 `session.error` 事件去重，避免短时间内连续相同错误导致通知轰炸。

#### Scenario: 同一会话短时间重复错误去重

- **WHEN** 同一 sessionID 在 `debounce_ms` 时间窗内再次发布 `session.error` 事件
- **THEN** 插件 SHALL 跳过该次通知，仅记录 debug 日志

#### Scenario: 不同会话错误独立通知

- **WHEN** 两个不同 sessionID 分别发布 `session.error` 事件
- **THEN** 插件 SHALL 对两个会话各自独立发送通知

### Requirement: Error 配置 Category

插件 SHALL 支持在配置文件中定义 `"error"` category，包含可选的 `target` 和 `template` 字段。未配置 target 时回退到 `default_target`，未配置 template 时使用默认错误通知模板。

#### Scenario: 配置自定义 error target

- **WHEN** 配置文件中 `categories.error.target` 定义了 `chat_id` 或 `user_id`
- **THEN** 错误通知发送到该自定义 target，而非 `default_target`

#### Scenario: 未配置 error category 回退到 default_target

- **WHEN** 配置文件中未定义 `categories.error` 或 `categories.error.target` 为空
- **THEN** 错误通知 SHALL 回退发送到 `default_target`

#### Scenario: 默认错误通知模板

- **WHEN** 配置文件中未定义 `categories.error.template`
- **THEN** 插件 SHALL 使用默认模板：`⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}`

