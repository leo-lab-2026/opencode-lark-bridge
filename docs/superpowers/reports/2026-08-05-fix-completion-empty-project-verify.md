# 验证报告：fix-completion-empty-project

## 变更概述

修复 completion 飞书通知 `Project` 字段在非 git 项目下为空的问题。根因：`resolveProjectName` 未校验 `path.basename("/")` 空结果 + `enhanceEvent` 用 `??` 不识别空串 + `mapCompletionEvent` 空串穿透。运行时日志与 OpenCode 源码实证（`PluginInput.worktree` 恒为 string，无 git/全局项目 worktree 既定为 `"/"`）。

## 验证模式

轻量验证（light）。规模评估自动判定 full（7 tasks、16 文件含 openspec/comet 产物），手动覆盖为 light：实际实现改动仅 4 文件、0 delta spec、单点 bug 修复。`review_mode: off`（hotfix 默认），跳过自动代码审查。

## 轻量验证检查项

| 检查项 | 结果 | 证据 |
|--------|------|------|
| tasks.md 全部完成 | PASS | 7 项 `[x]`，0 项 `[ ]` |
| 改动文件与 tasks 描述一致 | PASS | `git diff --stat main...HEAD -- src/ tests/`：4 文件（src/index.ts、src/events/completion-mapper.ts、tests/index.test.ts、tests/completion-mapper.test.ts），与 tasks 3-5 描述一致 |
| 编译通过 | PASS | `npm run build`（tsc）exit 0 |
| 相关测试通过 | PASS | `bun test`：163 pass / 0 fail / 340 expect() calls / exit 0 |
| 无明显安全问题 | PASS | `git diff main...HEAD -- src/` 无硬编码密钥、无 unsafe 操作、无外部输入执行；仅 `path.basename` 处理本地路径与 `nonEmpty` 字符串校验 |
| 代码审查 | SKIP | review_mode=off（hotfix 默认值）；本次为单点 bug 修复，范围 4 文件 |

## 根因消除检查

三处缺陷代码均已消除（grep 确认）：
1. `?? projectName` 空串缺陷：4 处全部包裹 `nonEmpty()`（src/index.ts:122,134,149,183）
2. `path.basename("/")` 空串缺陷：`resolveProjectName` 改为循环 worktree→directory，跳过空 basename（src/index.ts:65-76）
3. `mapCompletionEvent` 空串穿透：加 `.trim()` 校验（src/events/completion-mapper.ts:7-8）

## 测试覆盖

- completion-mapper 单元：空串/纯空白/缺失 projectName 与 sessionTitle -> `unknown`
- 端到端组合矩阵（index.test.ts）：
  - 无 git 项目（worktree=`/`、directory=项目目录、事件 projectName=`""`）-> 通知含 directory basename
  - git 仓库子目录（worktree=仓库根、directory=子目录、事件 projectName=`""`）-> 通知含 worktree basename
  - 显式 project.name 非空 -> 用显式名

## 测试稳定性

回归测试 timeout 设为 30s，容纳 lark-cli 真实网络调用偶发超时（exit code 4 network timeout）。日志在 `notifier.send` 前写，断言不依赖 lark-cli 成功。

## 分支处理

待归档阶段处理（branch_status: pending）。

## 结论

验证通过，可进入归档阶段。
