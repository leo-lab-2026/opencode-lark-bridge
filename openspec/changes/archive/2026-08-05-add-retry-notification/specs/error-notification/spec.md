# error-notification Specification (Delta)

## MODIFIED Requirements

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
