# Comet Spec Context

- Change: add-retry-notification
- Phase: design
- Mode: beta
- Context hash: c89ee75291f2f0689b48b98a793b0c2a71dfc4e00d74706d6522b6e368213cfc

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: openspec/changes/add-retry-notification/proposal.md
- SHA256: 7639127855ef1e5f49403c84606f4b01abba667674d3acec08f767f32bfaf50c
- Source: openspec/changes/add-retry-notification/design.md
- SHA256: e279a61356d24ce0459dd6170d1ce82261cfb5dc7438a7ac9881cd0eec7a7550
- Source: openspec/changes/add-retry-notification/tasks.md
- SHA256: 6199369d7e01048bd2fb44ca59d849c7c38fd158d8fe83d5734f31364e4051b9
- Source: openspec/changes/add-retry-notification/specs/error-notification/spec.md
- SHA256: 275e36fbcee15646671513cd06cd0a4219f7ffb1d0a6bf7d472d1a7d911d14e9
- Source: openspec/changes/add-retry-notification/specs/retry-notification/spec.md
- SHA256: f58026bbe959a0b2399479412bde9f46b0f9adb3903677b81fabc6fc17c84029

## Acceptance Projection

## openspec/changes/add-retry-notification/specs/error-notification/spec.md

- Source: openspec/changes/add-retry-notification/specs/error-notification/spec.md
- Lines: 1-42
- SHA256: 275e36fbcee15646671513cd06cd0a4219f7ffb1d0a6bf7d472d1a7d911d14e9

```md
# error-notification Specification (Delta)

## MODIFIED Requirements

### Requirement: 错误信息提取与模板渲染

error-mapper SHALL 从 `session.error` 事件 payload 中提取错误信息并渲染通知模板。opencode 错误对象形状为 `{ name, data: { message, ... } }`（如 `{ name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429, isRetryable: true } }`）；提取规则：错误类型取 `error.name`，错误消息取 `error.data.message`，同时**兼容旧形状** `{ type, message }`（`error.type`/`error.message` 存在时优先使用）。提取字段还包括：`sessionID`（会话标识，可为空）、`projectName`（项目名称，可为空）。

#### Scenario: 标准 error payload 提取（opencode 实际形状）

- **WHEN** 事件 properties 包含 `error: { name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429 } }` 和 `sessionID: "sess-123"`
- **THEN** 模板中的 `{errorType}` 替换为 `"APIError (429)"`（statusCode 附加显示），`{errorMessage}` 替换为 `"429 Too Many Requests"`，`{sessionID}` 替换为 `"sess-123"`

#### Scenario: 实际形状无 statusCode 提取

- **WHEN** 事件 properties 包含 `error: { name: "ProviderAuthError", data: { message: "Invalid API key" } }`
- **THEN** `{errorType}` 替换为 `"ProviderAuthError"`（无 statusCode 不附加），`{errorMessage}` 替换为 `"Invalid API key"`

#### Scenario: 旧形状 error payload 兼容

- **WHEN** 事件 properties 包含 `error: { type: "ProviderError", message: "500 Internal Server Error" }`
- **THEN** `{errorType}` 替换为 `"ProviderError"`，`{errorMessage}` 替换为 `"500 Internal Server Error"`（旧形状字段优先）

#### Scenario: 缺失字段降级

- **WHEN** `error` 缺失、或 `name`/`data.message` 与旧形状字段均缺失
- **THEN** `{errorType}`/`{errorMessage}` 替换为 `"unknown"`，通知仍然发送

#### Scenario: 会话标识缺失降级

- **WHEN** 事件 properties 中的 `sessionID` 缺失或为空
- **THEN** 模板中的 `{sessionID}` 替换为 `"unknown"`，通知仍然发送

#### Scenario: 自定义模板渲染

- **WHEN** 配置中 error category 提供了自定义 `template` 字符串
- **THEN** 使用自定义模板渲染；未配置时使用默认模板

#### Scenario: 项目名称注入

- **WHEN** event-handler 处理 session.error 事件时
- **THEN** SHALL 将当前 `projectName` 注入到通知消息中

```

## openspec/changes/add-retry-notification/specs/retry-notification/spec.md

- Source: openspec/changes/add-retry-notification/specs/retry-notification/spec.md
- Lines: 1-144
- SHA256: f58026bbe959a0b2399479412bde9f46b0f9adb3903677b81fabc6fc17c84029

```md
# retry-notification Specification

## Purpose
模型 API 返回可重试错误（如 429 限流、额度耗尽）时，opencode 会无限重试且不触发 `session.error`；本 capability 通过监听 `session.status` 的 retry 状态，在重试进行中主动通知用户。

## ADDED Requirements

### Requirement: retry 状态监听与通知

插件 SHALL 通过 `event` hook 监听 OpenCode 的 `session.status` 事件，当 `status.type === "retry"` 时（即模型 API 错误触发重试，如 429 限流、额度耗尽、5xx 服务器错误），按配置向飞书发送重试通知。

#### Scenario: 重试开始触发通知

- **WHEN** OpenCode 发布 `session.status` 事件且 `status.type === "retry"`、`attempt` 达到配置阈值（默认 1）
- **THEN** 插件构造包含重试消息、尝试次数和下次重试时间的飞书通知并发送到 `categories.retry` 配置的 target

#### Scenario: 非重试状态不触发通知

- **WHEN** `session.status` 事件的 `status.type` 为 `busy` 或 `idle`
- **THEN** 插件不发送重试通知

#### Scenario: status 字段缺失或异常安全跳过

- **WHEN** `session.status` 事件缺少 `status` 字段、或 `status` 不是对象、或 `status.type` 不是字符串
- **THEN** 插件安全跳过，不发送通知、不抛错，仅记录 debug 日志

#### Scenario: 其他事件类型不受影响

- **WHEN** 事件类型不是 `session.status`
- **THEN** 重试通知逻辑不介入，事件按原有路由处理

### Requirement: 配置化触发阈值

插件 SHALL 支持通过 `categories.retry` 配置 `retry_threshold`（attempt 触发阈值，默认 1），仅当重试次数达到阈值时才发送通知。

#### Scenario: 阈值未达到不通知

- **WHEN** `retry_threshold` 配置为 3 且当前 `attempt` 为 1 或 2
- **THEN** 插件跳过通知，仅记录 debug 日志

#### Scenario: 阈值达到触发通知

- **WHEN** `retry_threshold` 配置为 3 且当前 `attempt` 为 3
- **THEN** 插件发送重试通知

#### Scenario: 默认阈值首次即通知

- **WHEN** 未配置 `retry_threshold`
- **THEN** 插件按默认值 1 处理，首次重试（attempt=1）即发送通知

### Requirement: 首次通知与定期提醒节流

插件 SHALL 在重试持续期间按会话进行节流：首次达到阈值的重试立即通知，此后仅当距上次通知超过 `retry_interval_ms`（默认 15 分钟）时才再次提醒，防止无限重试导致通知轰炸。

#### Scenario: 首次重试立即通知

- **WHEN** 某会话首次收到达到阈值的 retry 状态
- **THEN** 插件立即发送通知

#### Scenario: 节流窗口内重复重试不通知

- **WHEN** 同一会话在距上次通知不足 `retry_interval_ms` 内再次收到 retry 状态
- **THEN** 插件跳过通知，仅记录 debug 日志

#### Scenario: 超过节流窗口再次提醒

- **WHEN** 同一会话的重试持续超过 `retry_interval_ms` 且再次收到 retry 状态
- **THEN** 插件再次发送通知，提醒用户重试仍在进行

#### Scenario: 不同会话节流独立

- **WHEN** 两个不同 sessionID 分别处于重试状态
- **THEN** 插件按各自会话独立计算节流窗口，互不影响

### Requirement: 重试恢复不干扰完成通知

retry 通知 SHALL 仅用于"重试进行中"阶段，不得影响现有 completion 通知逻辑：重试恢复（状态变为 busy/idle）后，会话的 `session.idle` 仍按原有逻辑发送 completion 通知，且不得将该会话标记为错误会话。

#### Scenario: 429 恢复后 completion 正常发送

- **WHEN** 会话经历 retry 状态后恢复（`status.type` 变为 `busy`/`idle`），随后发布 `session.idle`
- **THEN** 插件正常发送 completion 通知，且不因曾发生 retry 而跳过

#### Scenario: retry 不污染错误会话标记

- **WHEN** 会话发生 retry 但未触发 `session.error`
- **THEN** 该会话不得被标记为 errored 状态，后续 completion 通知不被跳过

### Requirement: 重试信息提取与模板渲染

retry-mapper SHALL 从 `session.status` 事件 payload 中提取重试信息并渲染通知模板。提取字段包括：`status.message`（重试原因文本，如 "Provider is overloaded"、"credits quota exhausted"）、`status.attempt`（当前尝试次数）、`status.next`（下次重试时间戳）、`sessionID`（会话标识）。

#### Scenario: 标准 retry payload 提取

- **WHEN** 事件 properties 包含 `status: { type: "retry", attempt: 3, message: "Provider is overloaded", next: 1750000000000 }` 和 `sessionID: "sess-123"`
- **THEN** 模板中的 `{message}` 替换为 `"Provider is overloaded"`，`{attempt}` 替换为 `"3"`，`{sessionID}` 替换为 `"sess-123"`，`{next}` 渲染为可读时间

#### Scenario: 缺失字段降级

- **WHEN** `attempt` 或 `next` 缺失
- **THEN** 模板中对应占位符替换为安全降级值，通知仍然发送

#### Scenario: 自定义模板渲染

- **WHEN** 配置中 retry category 提供了自定义 `template`
- **THEN** 使用自定义模板渲染；未配置时使用默认模板

#### Scenario: 项目与会话上下文注入

- **WHEN** event-handler 处理 session.status 的 retry 状态时
- **THEN** SHALL 将当前 `projectName` 与可解析的 `sessionTitle` 注入到通知消息中

### Requirement: 子代理重试通知

插件 SHALL 默认不通知子代理（subagent）会话的 retry 状态（与 completion 的子代理策略一致），并支持通过 `categories.retry.notify_subagent` 配置开启。开启后，子代理重试按子代理自身 sessionID 独立节流发送通知；子代理重试可能阻塞父会话，用户可自行决定是否需要知晓。

#### Scenario: 默认不通知子代理重试

- **WHEN** 子代理会话（存在于子代理追踪集合中）发布达到阈值的 retry 状态，且 `notify_subagent` 未配置或为 false
- **THEN** 插件跳过通知，仅记录 debug 日志

#### Scenario: 开启后子代理重试通知

- **WHEN** `notify_subagent` 配置为 true，且子代理会话发布达到阈值的 retry 状态
- **THEN** 插件按该子代理 sessionID 独立节流并发送重试通知

#### Scenario: 子代理重试通知不清理待完成状态

- **WHEN** 子代理会话发布 retry 状态（无论是否通知）
- **THEN** 插件不得将其从父会话的 pendingChildren 追踪中移除（重试尚未结束，父会话仍在等待）

### Requirement: 通知内容详略可配置

插件 SHALL 支持通过 `categories.retry.retry_detail` 配置控制通知内容的详细程度：开启（默认）时包含尝试次数（`{attempt}`）与下次重试时间（`{next}`），关闭时仅包含重试原因（`{message}`）与项目/会话上下文。

#### Scenario: 默认包含详情字段

- **WHEN** `retry_detail` 未配置或为 true
- **THEN** 通知模板中的 `{attempt}` 与 `{next}` 占位符正常渲染

#### Scenario: 关闭详情字段

- **WHEN** `retry_detail` 配置为 false
- **THEN** 通知中不渲染 `{attempt}` 与 `{next}`（模板对应占位符替换为空或按模板缺失处理）

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.