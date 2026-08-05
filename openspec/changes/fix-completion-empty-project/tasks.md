# Tasks: fix-completion-empty-project

- [x] 1. 新增失败回归测试：`tests/index.test.ts` 覆盖组合矩阵
  - 无 git 项目（worktree=`/`、directory=`<tmp>/proj`、事件 projectName=`""`）-> 通知含 directory basename
  - git 仓库子目录（worktree=`/repo`、directory=`/repo/sub`）-> 通知含 worktree basename（仓库根）
  - 显式 project.name 非空 -> 用显式名
- [x] 2. 新增失败单元测试：`tests/completion-mapper.test.ts` 断言 projectName/sessionTitle 为 `""`、`"  "`、undefined 时均渲染为 `unknown`
- [x] 3. 修复 `resolveProjectName`（src/index.ts）：依次尝试 worktree、directory 的 basename，跳过 basename 为空者，回退 `"unknown"`
- [x] 4. 修复 `enhanceEvent` 与 `session.idle` hook（src/index.ts）：引入 `nonEmpty` 助手，空串/纯空白视为缺失回退闭包
- [x] 5. 修复 `mapCompletionEvent`（src/events/completion-mapper.ts）：空串/纯空白降级 `unknown`
- [x] 6. 运行 `bun test` 全量通过、`tsc` 编译零错误
- [x] 7. 根因消除检查：确认 `??` 空串缺陷、`path.basename("/")` 空串缺陷、`mapCompletionEvent` 空串穿透三处均已消除
