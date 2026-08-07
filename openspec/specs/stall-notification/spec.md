# stall-notification Specification

## Purpose
模型挂起、SSE 超时、网络黑洞等场景下，会话持续处于 busy 状态但不产生任何事件，opencode 工作流程被静默卡住；本 capability 通过追踪会话活动时间与定时扫描，对长时间无进展的活跃会话发送超时提醒。
## Requirements
### Requirement: 会话活动追踪

插件 SHALL 维护每个会话的最后活动时间：会话开始（`session.created`）记录起点，会话产生的任何事件（消息增量、工具执行、权限申请、问题提问、重试状态、会话状态变化）均更新最后活动时间；会话结束（`session.idle`/`session.error`）后停止追踪，并将该会话标记为已完成。

已完成会话收到事件时，仅当该事件属于"活动事件"（`permission.asked`、`question.asked`、`session.status` 且 `status.type === "busy"`）时，才清除已完成标记并恢复活动追踪；非活动事件（包括但不限于 `session.updated`、`session.created`、`session.deleted`、`message.updated`、`message.removed`、`permission.updated`、`session.diff`、`session.compacted`、`session.status` idle 等）不得清除已完成标记，也不得更新活动时间。

#### Scenario: 会话开始记录活动起点

- **WHEN** 收到某 sessionID 的 `session.created` 事件
- **THEN** 插件记录该会话的活动起点时间并纳入扫描范围

#### Scenario: 事件更新活动时间

- **WHEN** 已追踪且未完成的会话收到任何事件
- **THEN** 插件更新该会话的最后活动时间

#### Scenario: 会话结束停止追踪

- **WHEN** 已追踪会话收到 `session.idle` 或 `session.error`
- **THEN** 插件停止追踪该会话（从活动时间表中移除），将其标记为已完成，不再纳入超时扫描

#### Scenario: 已完成会话收到非活动事件不恢复追踪

- **WHEN** 已完成的会话收到非活动事件（如 `session.updated`、`message.updated`、`permission.updated`、`message.removed` 等）
- **THEN** 插件不更新该会话的活动时间，不将其重新纳入超时扫描，不清除已完成标记

#### Scenario: 已完成会话收到活动事件恢复追踪

- **WHEN** 已完成的会话收到活动事件（`permission.asked`、`question.asked`、`session.status` busy）
- **THEN** 插件清除该会话的已完成标记，重新记录活动时间并纳入超时扫描

#### Scenario: 活动时间与停留时长计算

- **WHEN** 扫描会话时
- **THEN** 插件 SHALL 计算"距最后活动的时长"并用于超时判定与通知文案

### Requirement: 无进展超时提醒

插件 SHALL 通过内存定时器周期性扫描活跃会话，对"距最后活动超过 `stall_timeout_ms`（默认 10 分钟）"的会话发送飞书提醒，并防重复：同一会话的超时提醒按 `stall_interval_ms`（默认 60 分钟）节流，避免反复刷屏。

#### Scenario: 超时会话触发提醒

- **WHEN** 活跃会话距最后活动超过 `stall_timeout_ms` 且此前未提醒过（或距上次提醒超过 `stall_interval_ms`）
- **THEN** 插件构造包含项目、会话标题和无进展时长的飞书通知并发送到 `categories.stall` 配置的 target

#### Scenario: 未超时会话不提醒

- **WHEN** 活跃会话距最后活动未超过 `stall_timeout_ms`
- **THEN** 插件跳过该会话，仅记录 debug 日志

#### Scenario: 节流窗口内不重复提醒

- **WHEN** 同一会话在距上次提醒不足 `stall_interval_ms` 内仍超时
- **THEN** 插件跳过提醒

#### Scenario: 恢复活动重置超时计时

- **WHEN** 已被提醒的会话重新产生活动事件
- **THEN** 插件更新最后活动时间；若再次超时，按节流规则重新进入提醒流程

### Requirement: 与重试通知分工

stall 提醒 SHALL 仅覆盖"完全无事件"的静默停滞：重试（`session.status` retry）期间持续发布事件，活动时间不断更新，不得触发 stall 提醒；stall 与 retry 通知互不重叠。

#### Scenario: 重试期间不触发 stall

- **WHEN** 会话持续发布 `session.status`（retry）事件
- **THEN** 插件更新其活动时间，不触发 stall 提醒（重试通知由 retry-notification capability 负责）

#### Scenario: 完全静默触发 stall

- **WHEN** 会话既不发布 retry 事件，也不产生任何其他事件，且超过 `stall_timeout_ms`
- **THEN** 插件触发 stall 提醒

### Requirement: 停滞不干扰完成通知

stall 提醒 SHALL 不改变会话的完成语义：停滞会话恢复后（产生事件或最终 `session.idle`），completion 通知按原有逻辑发送；stall 不得将会话标记为 errored。

#### Scenario: 停滞恢复后 completion 正常发送

- **WHEN** 会话经历停滞提醒后恢复并发布 `session.idle`
- **THEN** 插件正常发送 completion 通知，不因曾触发 stall 提醒而跳过

#### Scenario: 停滞不污染错误会话标记

- **WHEN** 会话触发 stall 提醒但未产生 `session.error`
- **THEN** 该会话不得被标记为 errored 状态

### Requirement: 停滞信息提取与模板渲染

stall-mapper SHALL 从追踪状态渲染通知模板，字段包括：`projectName`、`sessionTitle`、`idleDuration`（无进展时长，格式化为可读文本）。

#### Scenario: 模板渲染

- **WHEN** 会话无进展时长超过阈值且模板包含 `{projectName}` `{sessionTitle}` `{idleDuration}`
- **THEN** 模板中对应占位符替换为实际值；未配置模板时使用默认模板

#### Scenario: 会话上下文缺失降级

- **WHEN** `sessionTitle` 无法解析
- **THEN** 模板中对应占位符替换为 `"unknown"`，通知仍然发送

### Requirement: 定时器生命周期

插件 SHALL 在初始化时创建扫描定时器，随 opencode 进程生命周期运行；扫描间隔由 `stall_check_interval_ms`（默认 1 分钟）控制；通知失败不得影响定时器与主流程。

#### Scenario: 扫描间隔可配置

- **WHEN** `stall_check_interval_ms` 配置为其他值
- **THEN** 定时器按配置间隔执行扫描

#### Scenario: 通知失败不影响扫描

- **WHEN** 某会话的 stall 提醒发送失败
- **THEN** 插件记录日志并继续后续扫描，主流程不受影响

### Requirement: 已完成会话防护机制

插件 SHALL 使用 allowlist 机制（而非 blocklist）判断事件是否可重新激活已完成会话的停滞跟踪。allowlist 仅包含代表用户/系统真实活动的事件类型；任何不在 allowlist 中的事件类型，无论当前还是未来 opencode 新增的，都不得重新激活已完成会话。

#### Scenario: allowlist 覆盖活动事件

- **WHEN** 已完成会话收到 `permission.asked` 事件
- **THEN** 插件清除已完成标记并恢复活动追踪

#### Scenario: allowlist 覆盖问题事件

- **WHEN** 已完成会话收到 `question.asked` 事件
- **THEN** 插件清除已完成标记并恢复活动追踪

#### Scenario: allowlist 覆盖忙碌状态

- **WHEN** 已完成会话收到 `session.status` 事件且 `status.type === "busy"`
- **THEN** 插件清除已完成标记并恢复活动追踪

#### Scenario: 非活动事件不重新激活

- **WHEN** 已完成会话收到不在 allowlist 中的事件（包括 opencode 未来新增的事件类型）
- **THEN** 插件不修改已完成标记，不更新活动时间，不将该会话重新纳入超时扫描

#### Scenario: 新事件类型自动安全

- **WHEN** opencode 发送插件未知的全新事件类型，且该事件携带已完成会话的 sessionID
- **THEN** 该事件默认不重新激活已完成会话（因为不在 allowlist 中）

