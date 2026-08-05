## Why

用一个飞书账号同时运行多个 opencode 实例时，通知无法区分来自哪个项目。completion/question/error/retry/stall 五类通知均已包含 `Project: {projectName}`，唯独 permission 通知缺项目信息——用户收到权限申请时不知道是哪个项目发起的。

## What Changes

- `mapPermissionEvent` 支持 `{projectName}` 模板变量，缺失时降级为 `unknown`（与其余 mapper 一致）
- permission 通知默认模板新增 `Project: {projectName}` 行
- `permission.ask` hook 与 `permission.asked` event 两条路径均注入 projectName（复用现有 `resolveProjectName`，不修改解析逻辑）
- 示例配置 `opencode-lark-bridge.config.example.jsonc` 的 permission 模板补上 `Project: {projectName}`
- 运行中配置文件（项目级 `.opencode/` 与全局 `~/.config/opencode/`）的 permission 模板同步更新
- README/文档补充说明：permission 模板现支持 `{projectName}`

## Capabilities

### New Capabilities
- `permission-notification`: permission 通知的渲染行为——通知文本由模板驱动，支持 `{tool}`/`{operation}`/`{resource}`/`{projectName}` 变量；projectName 从事件或 hook 输入注入，缺失降级 `unknown`

### Modified Capabilities
<!-- 无：现有 spec 的 REQUIREMENTS 不发生变化，仅新增 permission-notification capability -->

## Impact

- `src/events/permission-mapper.ts`：DEFAULT_TEMPLATE 增加 Project 行；渲染时替换 `{projectName}`
- `src/index.ts`：`permission.ask` hook 注入 projectName；`enhanceEvent` 增加 `permission.asked` 分支注入 projectName
- `opencode-lark-bridge.config.example.jsonc`：permission 模板示例更新
- 用户运行配置（项目级 + 全局）：permission.template 需手动补 `{projectName}`
- 测试：`tests/permission-mapper.test.ts`、`tests/index.test.ts` 更新；README 与配置说明文档更新
