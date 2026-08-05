# Verify Report: fix-stall-reactivation-after-idle

日期：2026-08-05
Change：`fix-stall-reactivation-after-idle`（hotfix）
验证模式：light（覆盖理由：真实源码改动 2 个文件，其余为 Comet change 产物；无 delta spec；scale 自动评估按工作区文件数统计为 full，经提交区间复核后手动覆盖）

## 轻量验证检查表

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | tasks.md 全部任务已完成 | PASS | 10/10 复选框 `[x]`，0 未完成 |
| 2 | 改动文件与 tasks.md 描述一致 | PASS | `git diff --stat dfbff21...HEAD -- src tests`：event-handler.ts（+30/-1）、event-handler.test.ts（+48），共 2 文件，与 Task 1（4 个回归测试）/Task 2（finishedSessions 防护）对应 |
| 3 | 编译通过 | PASS | `npm run build`（tsc）exit 0 |
| 4 | 相关测试通过 | PASS | `bun test` 全量 243 pass / 0 fail；event-handler.test.ts 63/63（含 4 个新测试） |
| 5 | 无明显安全问题 | PASS | 新增逻辑为内存集合（finishedSessions）+ 事件分类判定，无密钥、无 unsafe、无外部 IO 变更 |
| 6 | 代码审查 | SKIP | `review_mode: off`（hotfix 默认），跳过自动代码审查 |

## 修复验证（RED-GREEN，基于真实日志实证）

- 日志实证（2026-08-05 22:58:54 / 23:05:39）：`session.idle` 后 6-10ms 尾随 `session.updated`（Cached session title），通用 `touchActivity` 把已清除会话重新加入 `lastActive`，200s 后误发停滞通知（无进展时长 3分57秒 / 4分16秒）
- 复现（RED）：3 个新回归测试失败——`session.updated` / `session.status(idle)` / `session.created` 尾随 `session.idle` 均重新激活停滞跟踪（收到停滞通知）
- 修复（GREEN）：`finishedSessions` 防护后全部转绿；恢复语义测试（busy 活动解除防护）通过

## 根因与修复

根因：`handle()` 入口对全部事件无条件 `touchActivity`；OpenCode 在会话 idle 后尾随发送 `session.updated`（标题缓存），把刚被 `clearStallTracking` 清除的会话重新加回 `lastActive`，停滞计时重新起算。上一个 change（info.id 解析）未触及此路径。

修复（src/events/event-handler.ts）：新增 `finishedSessions` 集合——`session.idle`（主会话 pending 为空或子代理）/`session.deleted` 标记完成；已完成会话收到元数据/结束类事件（`session.updated`、`session.created` 杂散、`session.status` idle 等）跳过 touch 不复活；真正活动事件（busy/permission/question/工具）解除防护并恢复跟踪；`touchActivity` 父链冒泡跳过已完成父会话。

## 已知局限（记录不修复）

插件/opencode 进程重载后新实例内存状态为空，无法得知历史会话已完成（日志 22:56:52/23:04:57 两次重载后旧会话 23:15:21 重新活动即重建跟踪）。修复需持久化会话状态，超出 hotfix 范围，已在 proposal.md 记录。

## 结论

全部检查项通过，无 CRITICAL/IMPORTANT 问题，验证通过。
