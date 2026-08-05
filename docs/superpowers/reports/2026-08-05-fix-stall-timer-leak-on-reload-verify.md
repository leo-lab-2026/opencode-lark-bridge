# Verify Report: fix-stall-timer-leak-on-reload

日期：2026-08-06
Change：`fix-stall-timer-leak-on-reload`（hotfix）
验证模式：light（覆盖理由：真实源码改动 2 个文件，其余为 Comet change 产物；无 delta spec；scale 自动评估按工作区文件数统计为 full，经提交区间复核后手动覆盖）

## 轻量验证检查表

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | tasks.md 全部任务已完成 | PASS | 7/7 复选框 `[x]`，0 未完成 |
| 2 | 改动文件与 tasks.md 描述一致 | PASS | `git diff --stat <base_ref>...HEAD -- src tests`：src/index.ts（+7/-1）、tests/index.test.ts（+23/-1），共 2 文件，与 Task 1（定时器清理回归测试）/Task 2（模块级 stallTimer 实现）对应 |
| 3 | 编译通过 | PASS | `npm run build`（tsc）exit 0 |
| 4 | 相关测试通过 | PASS | `bun test tests/index.test.ts` 31/31 通过；全量 `bun test` 244/244 通过（另有 2 次运行受环境负载影响出现既有时间相关测试超时，对照实验证实与本次修改无关） |
| 5 | 无明显安全问题 | PASS | 改动仅模块级定时器句柄管理（clearInterval + setInterval），无密钥、无 unsafe、无外部 IO 变更 |
| 6 | 代码审查 | SKIP | `review_mode: off`（hotfix 默认），跳过自动代码审查 |

## 修复验证（RED-GREEN）

- 复现（RED）：新增回归测试「clears previous stall timer on plugin re-initialization」（spyOn 全局 `clearInterval`，连续两次 `plugin()` 初始化），修复前失败——当前实现从不清理旧定时器（clearInterval 未被调用）
- 修复（GREEN）：模块级 `stallTimer` + 初始化前 `clearInterval(stallTimer)` 后测试转绿

## 根因与修复

根因（日志 + 进程实证）：运行中的 opencode 旧进程（PID 60859，20:09 启动）加载旧插件代码，新部署代码未生效；同时 `src/index.ts` 每次插件初始化都无条件 `setInterval` 且从不清理，同进程内插件重载（日志 22:56:52 / 23:04:57 / 23:38:45 三次注册）时旧实例定时器泄漏，持续扫描旧实例内存状态（旧会话的 lastActive），误发停滞通知。旧实例的误发无法被新实例的 finishedSessions 防护拦截——这正是「修复了但没效果」的代码层根因。

修复（src/index.ts）：模块级 `stallTimer` 句柄，`OpenCodeLarkBridge` 每次初始化先 `clearInterval` 旧句柄再创建新定时器，同进程内任意时刻仅一个激活的扫描定时器；旧 handler 实例随定时器清理被 GC 回收。

## 用户侧行动（代码无法覆盖）

- 关闭旧 opencode 进程（PID 60859），使用新进程（23:38:43 启动的 PID 93591）或重启后重新打开
- 重新部署插件：`npm run install:local`（dist 已更新至 23:38）

## 结论

全部检查项通过，无 CRITICAL/IMPORTANT 问题，验证通过。
