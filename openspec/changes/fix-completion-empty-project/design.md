# Design: fix-completion-empty-project

## 修复方案

### 根因链（运行时日志 + OpenCode 源码实证）

**日志证据** `~/.config/opencode/logs/opencode-lark-bridge.log`：

| 行 | 项目 | ctxWorktree | ctxDirectory | 事件 projectName | 渲染结果 |
|----|------|-------------|--------------|------------------|----------|
| 65 | opencode-lark-bridge | `/home/lifxu/src/opencode-lark-bridge` | 同上 | `"opencode-lark-bridge"` | `Project: opencode-lark-bridge` ✓ |
| 83 | test1（无 git） | `/` | `/home/lifxu/src/test1` | `""` | `Project: ` ✗ |

**OpenCode 源码证据**：
- `packages/plugin/src/index.ts:51`：`PluginInput` 中 `directory: string`、`worktree: string` 均为**必填 string**（非 optional），运行时恒为字符串。
- `packages/core/test/database-migration.test.ts:432`：`expect(... project WHERE id='global').toEqual({ worktree: "/" })` —— **全局/无 git 项目的 worktree 既定值为 `"/"`**。
- `packages/opencode/src/project/project.ts:232`：`worktree: projectID === ProjectV2.ID.global ? worktree : existing.worktree` —— 全局项目走 worktree 分支。
- `packages/opencode/src/session/session.ts:166`：`path.relative(path.resolve(worktree), cwd)` —— directory 是 cwd，worktree 是仓库根；有 git 时 directory 可能是 worktree 的子目录。

**三层缺陷叠加**：
1. `resolveProjectName`（src/index.ts:65-75）取 `ctx?.worktree ?? ctx?.directory`，worktree 优先。无 git 项目 worktree=`"/"`，`path.basename("/") === ""`，函数只校验 `dir` 非空、未校验 basename 非空，返回 `""`。
2. OpenCode `session.idle` 事件载荷始终携带 `properties.projectName`，无 git 项目时为 `""`。`enhanceEvent`（src/index.ts:141）`props?.projectName ?? projectName` 用 `??`，空串不被视为缺失，`"" ?? projectName === ""`，闭包回退不触发。
3. `mapCompletionEvent`（src/events/completion-mapper.ts:7）`typeof props.projectName === "string" ? props.projectName : "unknown"`，空串是 string，返回 `""`。

### 组合矩阵分析（worktree/directory 字段恒为 string）

`PluginInput.worktree` 与 `directory` 恒为 string，但取值随 git 状态变化。下表穷举所有现实组合，验证修复方案：

| # | 场景 | ctx.worktree | ctx.directory | ctx.project.name | 修复后 resolveProjectName | 正确? |
|---|------|--------------|---------------|------------------|---------------------------|-------|
| 1 | git 仓库根目录 | `/home/x/repo` | `/home/x/repo` | (任意) | basename(worktree)=`repo` | ✓ |
| 2 | git 仓库子目录 | `/home/x/repo` | `/home/x/repo/sub` | (任意) | basename(worktree)=`repo`（仓库根，正确） | ✓ |
| 3 | git worktree 子树 | `/home/x/wt` | `/home/x/wt` 或子目录 | (任意) | basename(worktree)=`wt` | ✓ |
| 4 | 无 git 项目（全局） | `/` | `/home/x/proj` | (任意) | basename("/")=""跳过 → basename(directory)=`proj` | ✓ |
| 5 | 无 git 项目，directory 也是根 | `/` | `/` | (任意) | 两 basename 均空 → `"unknown"` | ✓ |
| 6 | directory 为空串（边界） | `/home/x/repo` | `""` | (任意) | basename(worktree)=`repo`（directory 被跳过） | ✓ |
| 7 | 显式 project.name | (任意) | (任意) | `"MyProj"` | `"MyProj"` | ✓ |
| 8 | project.name 空串 | `/` | `/home/x/proj` | `""` | 跳过空名 → basename(directory)=`proj` | ✓ |
| 9 | 全空 | `/` | `/` | `""` | → `"unknown"` | ✓ |

**关键结论**：worktree 优先（git 仓库根才是项目名），basename 为空则回退 directory，再回退 `unknown`。覆盖有/无 git、有/无 worktree 子树、directory 为根/子目录/空、project.name 有/无/空全部组合。

**事件载荷侧**（`enhanceEvent`/`session.idle` hook）：OpenCode 对无 git 项目发送 `projectName:""`。修复把空串/纯空白视为缺失 → 回退闭包（已由上表保证非空）。覆盖事件 projectName 为非空/空串/缺失全部情况。

### 修复点

#### 1. `resolveProjectName`（src/index.ts）

依次尝试 worktree、directory 的 basename，跳过 basename 为空者：

```typescript
function resolveProjectName(ctx: any): string {
  const explicitName = ctx?.project?.name
  if (typeof explicitName === "string" && explicitName.trim()) {
    return explicitName.trim()
  }
  for (const dir of [ctx?.worktree, ctx?.directory]) {
    if (typeof dir === "string" && dir.trim()) {
      const base = path.basename(dir.trim())
      if (base) return base
    }
  }
  return "unknown"
}
```

效果：worktree=`/` → basename 空跳过 → 取 directory basename（`test1`）；仍空 → `"unknown"`。

#### 2. 空串识别助手 + `enhanceEvent` / `session.idle` hook（src/index.ts）

引入局部助手，统一把空串/纯空白视为缺失：

```typescript
function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
```

替换四处 `?? projectName`：
- `enhanceEvent` 的 `question.asked`、`session.error`、`session.idle` 分支：`projectName: nonEmpty(props?.projectName) ?? projectName`
- `session.idle` hook：`projectName: nonEmpty(input?.projectName) ?? projectName`

效果：事件载荷 `projectName:""` → `nonEmpty` 返回 `undefined` → 回退闭包（已由修复点 1 保证非空）。

#### 3. `mapCompletionEvent`（src/events/completion-mapper.ts）

```typescript
const projectName = typeof props.projectName === "string" && props.projectName.trim()
  ? props.projectName
  : "unknown"
const sessionTitle = typeof props.sessionTitle === "string" && props.sessionTitle.trim()
  ? props.sessionTitle
  : "unknown"
```

防御性兜底，符合 events 目录"字段缺失降级 unknown"约定。

### 不改动项

- permission/question/error mapper 的核心提取逻辑不动；`enhanceEvent` 对这三类事件的注入修复是同源正向收益。
- 去重、子代理过滤、状态管理不动。
- 配置/schema/接口不动。

### 验证策略

- 回归测试：模拟 test1 场景（`ctx.worktree="/"`、`ctx.directory="/.../test1"`、事件 `projectName:""`），断言通知含 directory basename。
- 单元测试：`mapCompletionEvent` 空串 → `"unknown"`。
- 全量 `bun test` + `tsc` 编译通过。
