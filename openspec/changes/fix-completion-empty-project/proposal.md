## Why

任务完成（completion）飞书通知中 `Project` 字段在非 `opencode-lark-bridge` 项目下偶尔为空。运行时日志证实：当项目所在 git worktree 被解析为根路径 `/`（如 `test1` 项目，`ctxWorktree="/"`）时，`projectName` 解析为空字符串；叠加事件载荷回退逻辑用 `??` 不识别空字符串，导致通知渲染出 `Project: `（空）。仅当 worktree 与 directory 都指向本项目目录时才偶然正确。

## What Changes

- 修正 `resolveProjectName`（src/index.ts）：当 `ctx.worktree` 的 basename 为空（根路径 `/` 等）时，回退到 `ctx.directory` 的 basename，再回退 `"unknown"`，保证闭包 `projectName` 永不为空。
- 修正 `enhanceEvent` 与 `session.idle` hook（src/index.ts）：把空串/纯空白视为缺失，使空的事件载荷 `projectName` 能回退到闭包值（当前用 `??` 仅识别 null/undefined）。
- 修正 `mapCompletionEvent`（src/events/completion-mapper.ts）：空串降级为 `"unknown"`（防御，符合"字段缺失降级 unknown"约定）。
- 新增回归测试覆盖：worktree 为根路径 `/` 且事件载荷 `projectName` 为空串时，通知应包含 directory basename 而非空。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无。本次为 bug 修复，使实现回归预期行为（projectName 非空），不改变 spec 级别验收场景。`.openspec.yaml` 设置 `skip_specs: true`。

## Impact

- 代码：`src/index.ts`（`resolveProjectName`、`enhanceEvent`、`session.idle` hook）、`src/events/completion-mapper.ts`（`mapCompletionEvent`）。
- 测试：`tests/index.test.ts`、`tests/completion-mapper.test.ts` 新增回归用例。
- 影响范围：仅 completion 通知的 `projectName` 渲染；不动 permission/question/error 路径的核心逻辑（`enhanceEvent` 注入逻辑同源修复，对它们也是正向）。
- 无接口/配置/schema 变更，无破坏性改动。
