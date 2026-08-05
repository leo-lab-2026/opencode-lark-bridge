# Verification Report: doc-plugin-uninstall

**日期：** 2026-08-05
**Change：** doc-plugin-uninstall（tweak）
**Verify mode：** light（3 tasks、0 delta spec、1 改动文件）

## 轻量验证 6 项检查

| # | 检查项 | 结果 | 证据 |
| - | ------ | ---- | ---- |
| 1 | tasks.md 全部任务已完成 `[x]` | PASS | 3/3 勾选，`openspec instructions apply` 返回 `state: all_done` |
| 2 | 改动文件与 tasks.md 描述一致 | PASS | 仅 `README.md`（卸载章节扩充），与 tasks 1.1-1.3 对应；另含 change 自身 artifacts |
| 3 | 编译通过 | PASS | `npm run build`（tsc）exit 0，经 `comet guard build --apply` 验证 |
| 4 | 相关测试通过 | PASS | `bun test`：163 pass / 0 fail（首次运行 1 个 installer 测试偶发失败，重跑通过，与本次纯文档变更无关） |
| 5 | 无明显安全问题 | PASS | 纯文档变更，无密钥、无代码；补充了运行时配置含飞书凭证需一并删除的安全提示 |
| 6 | 轻量代码审查（review_mode: standard） | PASS | 子代理审查发现 1 Important（全局安装注册的是绝对路径条目，文档此前只写相对路径）+ 3 Minor；Important 与 2 个 Minor 已修复并提交（commit 8aabd92），1 个 Minor（配置候选列举）已在修复中一并补齐 |

## 审查修复记录

- **Important 修复**：全局安装的 `plugin` 条目是绝对路径 `~/.config/opencode/plugins/opencode-lark-bridge`，文档三处（手动清理、声明方式步骤 1、清理清单表）补充了绝对路径条目说明，避免全局用户手动卸载时残留注册导致加载报错
- **Minor 修复**：首段「本插件条目」限定为「本地路径条目」（`uninstall` 不清理 npm 包名条目）；提示在项目根目录运行；配置候选列举补齐 4 级优先级

## 结论

6 项检查全部通过，无 CRITICAL/IMPORTANT 遗留问题。实现与 proposal 目标（三种安装方式卸载步骤 + 命令作用边界）一致。
