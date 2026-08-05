# Brainstorm Summary

- Change: permission-notification-project-info
- Date: 2026-08-05

## 确认的技术方案

- `permission-mapper.ts`：DEFAULT_TEMPLATE 增加 `Project: {projectName}` 行；渲染替换 `{projectName}`，缺失降级 `unknown`
- `index.ts`：`permission.ask` hook 用 `{ ...input, projectName }` 传给 mapper（顶层展开，不改 input 对象）；`enhanceEvent` 增加 `permission.asked` 分支（与 question.asked 同模式）
- projectName 统一使用闭包内 resolveProjectName 结果，不重复解析
- 模板驱动生效：用户运行配置（项目级 + 全局）permission.template 需补 `{projectName}`

## 关键取舍与风险

- 模板驱动而非强制前缀：保持既有惯例，避免与模板内已有 Project 行重复；代价是用户需手动更新运行配置模板（已确认接受）
- enhanceEvent 返回新对象，不修改原 event（遵守事件 hook 只读约束）
- 用户模板无 `{projectName}` 时原样输出，不报错

## 测试策略

- `tests/permission-mapper.test.ts`：默认模板 Project 行、`{projectName}` 替换、缺失/空白降级 unknown、自定义模板替换
- `tests/index.test.ts`：permission.ask hook 文本含项目名；enhanceEvent 对 permission.asked 注入且不修改原事件
- `npm run build`（tsc 零错误）+ `bun test` 全绿

## Spec Patch

无。open 阶段 delta spec 已含两条路径验收场景，无需回写。
