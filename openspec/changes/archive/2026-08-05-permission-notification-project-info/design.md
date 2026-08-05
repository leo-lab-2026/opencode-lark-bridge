## Context

动机见 proposal.md。当前 `permission.ask` hook（src/index.ts:184）直接调用 `mapPermissionEvent(input, ...)`，未注入 projectName；`enhanceEvent`（src/index.ts:113）只覆盖 session.*/question.asked，不含 `permission.asked`。`mapPermissionEvent`（permission-mapper.ts:99）模板仅支持 `{tool}`/`{operation}`/`{resource}`。其余五类 mapper 均已支持 `{projectName}` 且模板含 Project 行——本 change 让 permission 与它们对齐。

## Goals / Non-Goals

**Goals:**
- permission 两条路径（hook + event）均携带 projectName 进入模板渲染
- `{projectName}` 缺失降级 `unknown`，与 completion/question/error/retry/stall 行为一致

**Non-Goals:**
- 不修改 `resolveProjectName` 解析逻辑（ctx.project.name → worktree → directory 已存在）
- 不引入强制前缀/自动兜底机制——保持模板驱动
- 不改其余五类 mapper（已具备项目信息）

## Decisions

1. **模板驱动，与既有惯例一致**：`mapPermissionEvent` 增加 `{projectName}` 替换 + DEFAULT_TEMPLATE 补 Project 行。用户运行配置中的 permission.template 由用户按文档提示手动补 `{projectName}`。备选（渲染前强制插入项目前缀）被否决：会与模板中已有 Project 行重复，且破坏模板驱动一致性。
2. **复用 `enhanceEvent` 而非新建分支逻辑**：`permission.asked` 事件路径走 enhanceEvent 注入 projectName（与 question.asked 相同模式），保持事件预处理集中化；`permission.ask` hook 因不经过 enhanceEvent，在 hook 内直接构造带 projectName 的属性传给 mapper。
3. **projectName 来源统一**：两条路径都使用 `OpenCodeLarkBridge` 闭包内已解析的 `projectName`（resolveProjectName 结果），不重复解析。

## Risks / Trade-offs

- 用户现有运行配置（项目级 + 全局）若未补 `{projectName}`，permission 通知仍无项目行——通过示例配置、README 与变更文档提示缓解；这是模板驱动的固有代价
- `permission.ask` hook 输入结构为 OpenCode 内部对象，注入方式采用「构造属性对象后传给 mapper」而非修改 input（避免污染 hook 只读输入）
