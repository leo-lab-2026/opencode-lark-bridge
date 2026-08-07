# Comet Spec Context

- Change: fix-stall-finished-session-bypass
- Phase: design
- Mode: beta
- Context hash: 23e116f88bef4151ec0ac420fac21f2a575264ad803f3a4ac68b22e1cf3d016d

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: openspec/changes/fix-stall-finished-session-bypass/proposal.md
- SHA256: aa159ba6b212201096a5ffee591d672d95aa059e07b8a7024d20eaa7df82154f
- Source: openspec/changes/fix-stall-finished-session-bypass/design.md
- SHA256: 191f7bff40ef22fd91b6e725623ae51ada933163f5e0f265fd8cb9ed83f1e7b1
- Source: openspec/changes/fix-stall-finished-session-bypass/tasks.md
- SHA256: 5cc0a013ba2b6240acfde88ca75e42d3b5b6204ff011242043b2a38a3f322c5e
- Source: openspec/changes/fix-stall-finished-session-bypass/specs/stall-notification/spec.md
- SHA256: 4ef57623d4aa358a9a5cee5eb830eb070fdf5d3aa95c180ec6c4fcc80e352678

## Acceptance Projection

## openspec/changes/fix-stall-finished-session-bypass/specs/stall-notification/spec.md

- Source: openspec/changes/fix-stall-finished-session-bypass/specs/stall-notification/spec.md
- Lines: 1-68
- SHA256: 4ef57623d4aa358a9a5cee5eb830eb070fdf5d3aa95c180ec6c4fcc80e352678

```md
## MODIFIED Requirements

### Requirement: 会话活动追踪

插件 SHALL 维护每个会话的最后活动时间：会话开始（`session.created`）记录起点，会话产生的任何事件（消息增量、工具执行、权限申请、问题提问、重试状态、会话状态变化）均更新最后活动时间；会话结束（`session.idle`/`session.error`）后停止追踪，并将该会话标记为已完成。

已完成会话收到事件时，仅当该事件属于"活动事件"（`permission.asked`、`question.asked`、`session.status` 且 `status.type === "busy"`）时，才清除已完成标记并恢复活动追踪；非活动事件（包括但不限于 `session.updated`、`session.created`、`session.deleted`、`message.updated`、`message.removed`、`permission.updated`、`session.diff`、`session.compacted`、`session.status` idle 等）不得清除已完成标记，也不得更新活动时间。

#### Scenario: 会话开始记录活动起点

- **WHEN** 收到某 sessionID 的 `session.created` 事件
- **THEN** 插件记录该会话的活动起点时间并纳入扫描范围

#### Scenario: 活跃会话事件更新活动时间

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

## ADDED Requirements

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

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.