# 验证报告：fix-task-completed-project-unknown

## 变更概述

修复飞书 "task completed" 会话结束通知中 `Project` 字段显示为 `unknown` 的问题。当 OpenCode 插件上下文 `ctx.project.name` 缺失或为空时，使用 `ctx.worktree`/`ctx.directory` 的目录名作为项目名回退。

## 变更文件

- `packages/opencode-lark-bridge/src/index.ts`
- `packages/opencode-lark-bridge/tests/index.test.ts`

## 轻量验证检查项

| 检查项 | 结果 | 证据 |
|--------|------|------|
| tasks.md 全部完成 | PASS | openspec/changes/fix-task-completed-project-unknown/tasks.md 中 3 项均为 `[x]` |
| 改动文件与 tasks 描述一致 | PASS | git diff --stat HEAD~1 HEAD 显示仅修改 2 个文件，与 tasks 描述一致 |
| 编译通过 | PASS | `bun run build`（tsc）退出码 0 |
| 相关测试通过 | PASS | `bun test` 59 pass, 0 fail, 95 expect() calls |
| 无明显安全问题 | PASS | 未引入硬编码密钥、unsafe 操作或外部输入执行；仅使用 `path.basename` 处理本地路径 |
| 代码审查 | SKIP | review_mode 为 off（hotfix 默认值），本次为单点 bug 修复，范围 ≤ 2 文件 |

## 测试结果详情

```
bun test v1.3.13 (bf2e2cec)

 59 pass
 0 fail
 95 expect() calls
Ran 59 tests across 9 files. [3.92s]
```

新增测试覆盖：
- `falls back to directory basename when project name is missing`
- `falls back to directory basename when project name is empty`

## 分支处理

用户选择：保持当前状态（提交已在 master 分支上）。

## 结论

验证通过，可进入归档阶段。
