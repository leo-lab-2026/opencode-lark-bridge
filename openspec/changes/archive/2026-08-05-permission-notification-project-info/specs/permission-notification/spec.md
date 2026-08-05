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
