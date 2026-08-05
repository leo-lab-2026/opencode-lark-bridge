# Comet Spec Context

- Change: permission-notification-project-info
- Phase: design
- Mode: beta
- Context hash: 6b6f58424bad9159f423e9767617b288a3d8f042d53e21e0d2e639189d56d367

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: openspec/changes/permission-notification-project-info/proposal.md
- SHA256: fffb1917b552e895327c9a3f60b68c70a6fb107fd26affc099a5481008598a10
- Source: openspec/changes/permission-notification-project-info/design.md
- SHA256: 9cd8fea594ceb1398ac30ce8a7317c5cb33ec4645ad9807b28b354ca4853bdcb
- Source: openspec/changes/permission-notification-project-info/tasks.md
- SHA256: 0bff94365c38349cd699f604e8b79d3df38dc5829c9b955b3f1c69a138c88ddd
- Source: openspec/changes/permission-notification-project-info/specs/permission-notification/spec.md
- SHA256: 541cda9b2920f917ce9537c5395bdae82426eef4cbc031d9c6cff1fcd320e3b4

## Acceptance Projection

## openspec/changes/permission-notification-project-info/specs/permission-notification/spec.md

- Source: openspec/changes/permission-notification-project-info/specs/permission-notification/spec.md
- Lines: 1-33
- SHA256: 541cda9b2920f917ce9537c5395bdae82426eef4cbc031d9c6cff1fcd320e3b4

```md
## Purpose

permission 通知的渲染行为契约：通知文本由模板驱动，支持项目信息变量，使多项目并发运行时每条权限申请都能标识来源项目。

## ADDED Requirements

### Requirement: permission 通知模板支持项目信息

permission 通知默认模板 SHALL 包含 `Project: {projectName}` 行；渲染 SHALL 支持 `{projectName}` 模板变量，事件或 hook 输入中缺少 projectName 时 SHALL 降级为 `unknown`，不抛错。

#### Scenario: 默认模板包含项目行
- **WHEN** 未配置自定义 permission 模板时触发权限申请通知
- **THEN** 通知文本包含 `Project: {projectName}` 行，且 projectName 替换为注入的项目名

#### Scenario: 自定义模板使用 projectName 变量
- **WHEN** 用户配置的 `categories.permission.template` 包含 `{projectName}`
- **THEN** 渲染结果中该变量替换为注入的项目名

#### Scenario: projectName 缺失降级
- **WHEN** 权限申请事件不携带 projectName
- **THEN** 通知中 `{projectName}` 渲染为 `unknown`，且通知仍正常发送

### Requirement: permission 两条路径均注入项目信息

插件 SHALL 在 `permission.ask` hook 与 `permission.asked` 事件两条路径上均注入当前项目的 projectName（来源为插件已解析的项目名，缺失时为 `unknown`），使两条路径的模板渲染都能使用 `{projectName}`。

#### Scenario: permission.ask hook 携带项目名
- **WHEN** OpenCode 触发 `permission.ask` hook
- **THEN** 渲染 permission 通知时 `{projectName}` 使用当前 opencode 实例解析出的项目名

#### Scenario: permission.asked 事件携带项目名
- **WHEN** OpenCode 派发 `permission.asked` 事件
- **THEN** 渲染 permission 通知时 `{projectName}` 使用当前 opencode 实例解析出的项目名

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.