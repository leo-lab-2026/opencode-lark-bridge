---
comet_change: permission-notification-project-info
role: technical-design
canonical_spec: openspec
---

# 深度设计：permission 通知携带项目信息

## 背景

proposal.md 与 design.md 已覆盖动机与高层方案。本设计细化实现层面：两条 permission 路径（`permission.ask` hook 与 `permission.asked` 事件）如何注入 projectName、mapper 渲染如何对齐既有惯例、测试如何覆盖。

## 相关代码现状

- `mapPermissionEvent`（`src/events/permission-mapper.ts:99`）：props 解析 `event?.properties ?? event`；模板仅替换 `{tool}`/`{operation}`/`{resource}`；DEFAULT_TEMPLATE 无 Project 行
- `permission.ask` hook（`src/index.ts:184`）：`mapPermissionEvent(input, target, categoryConfig.template)` 直接传 OpenCode 输入，无 projectName
- `enhanceEvent`（`src/index.ts:113`）：覆盖 session.created/updated、question.asked、session.error、session.status、session.idle，不含 permission.asked

## 实现设计

### 1. mapper 支持 `{projectName}`（permission-mapper.ts）

```ts
const DEFAULT_TEMPLATE = "🔔 OpenCode Permission Request\nProject: {projectName}\nTool: {tool}\nOperation: {operation}\nTarget: {resource}"

// mapPermissionEvent 渲染尾部追加：
.replace(/{projectName}/g, projectName)
```

- `projectName` 提取与其余 mapper 一致：`typeof props.projectName === "string" && props.projectName.trim() ? props.projectName.trim() : "unknown"`
- 用户自定义模板未含 `{projectName}` 时 replace 无匹配，文本原样输出（模板驱动预期行为）

### 2. 两条路径注入 projectName（index.ts）

**permission.ask hook**：不修改 OpenCode 传入的 input（hook 输入只读约束），构造新对象后传入：

```ts
const message = mapPermissionEvent({ ...input, projectName }, target, categoryConfig.template)
```

mapper 的 props 解析为 `event?.properties ?? event`：Permission 对象无 properties 字段时 props 即对象本身，顶层 `projectName` 可被提取。

**permission.asked 事件**：`enhanceEvent` 增加分支，与 question.asked 完全同模式：

```ts
if (type === "permission.asked") {
  const props = event?.properties ?? event ?? {}
  return { ...event, properties: { ...props, projectName: nonEmpty(props?.projectName) ?? projectName } }
}
```

### 3. projectName 来源

统一使用 `OpenCodeLarkBridge` 闭包内已解析的 `projectName`（`resolveProjectName`：`ctx.project.name` → `ctx.worktree` basename → `ctx.directory` basename → `"unknown"`），不新增解析逻辑。

## 数据流

```
permission.ask hook ──┐
                      ├─→ mapPermissionEvent({...input, projectName}) ─→ 通知文本含 Project: xxx
permission.asked event─┴─→ enhanceEvent 注入 → handler → mapPermissionEvent
```

## 边界条件

| 条件 | 行为 |
|------|------|
| projectName 缺失/空白 | 渲染 `unknown`，通知正常发送 |
| 用户模板无 `{projectName}` | 文本原样输出，无 Project 行 |
| OpenCode 输入自带 projectName（未来兼容） | `nonEmpty(props?.projectName) ?? projectName` 优先用事件值 |
| 去重 key（`tool:resource`） | 不受影响 |

## 测试策略

- `tests/permission-mapper.test.ts`：
  - 默认模板渲染结果包含 `Project: <name>` 行
  - 显式 `{projectName}` 替换成功
  - projectName 缺失 → `unknown`；空白字符串 → `unknown`
  - 自定义模板无 `{projectName}` 时文本原样（无 Project 行）
- `tests/index.test.ts`：
  - `permission.ask` hook 通知文本含项目名
  - `enhanceEvent` 对 `permission.asked` 注入 projectName，且原事件对象未被修改（对象身份/引用断言）
- 验证命令：`npm run build`（tsc 零错误）+ `bun test`

## 风险与缓解

- **用户运行配置未更新** → permission 通知仍无项目行。缓解：示例配置与 README 更新，变更文档醒目提示项目级 + 全局两个配置文件的手动同步点
- **hook 输入结构漂移**（OpenCode 升级改变 Permission 对象结构）→ mapper 的 `event?.properties ?? event` 兼容两种形态，漂移时降级 unknown，不影响主流程
