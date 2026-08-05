# Verify Report: fix-stall-after-completion

日期：2026-08-05
Change：`fix-stall-after-completion`（hotfix）
验证模式：light（覆盖理由：真实源码改动 4 个文件，其余为 Comet change 产物；无 delta spec、单 capability；scale 自动评估按工作区文件数统计为 full，经复核提交区间后手动覆盖）

## 轻量验证检查表

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | tasks.md 全部任务已完成 | PASS | 9/9 复选框 `[x]`，0 未完成 |
| 2 | 改动文件与 tasks.md 描述一致 | PASS | `git diff --stat d9c5e982...HEAD -- src tests`：event-handler.ts（+2）、index.ts（+6/-2）、event-handler.test.ts（+22）、index.test.ts（+38），共 4 文件，与 tasks.md 的 Task 1（回归测试）/Task 2（三处解析修复）完全对应 |
| 3 | 编译通过 | PASS | `npm run build`（tsc）exit 0 |
| 4 | 相关测试通过 | PASS | `bun test` 全量 239 pass / 0 fail；期间两次时间相关测试超时（30000ms 上限）为重跑即通过的既有 flake（与本次改动无关，单独重跑 index.test.ts 30/30 通过） |
| 5 | 无明显安全问题 | PASS | diff 仅扩展会话 ID 解析来源（新增 `info.id` 兜底），无密钥、无 unsafe、无新权限操作 |
| 6 | 代码审查 | SKIP | `review_mode: off`（hotfix 默认），跳过自动代码审查 |

## 修复验证（RED-GREEN）

- 复现（RED）：新增 3 个回归测试，修复前运行——「clears tracking on session.idle with info.id shape」实测收到 1 条停滞通知（复现用户报告的「任务完成后仍发送停滞通知」）；「clears tracking on session.error with info.id shape」同样失败；「sends completion notification when session.idle arrives with info.id shape only」未发完成通知
- 修复（GREEN）：三处解析对齐后全部转绿，全量 239 通过

## 根因与修复

根因：`extractSessionID`（src/events/event-handler.ts:21）与 `enhanceEvent` 的 `session.idle`/`session.error` 分支（src/index.ts）解析会话 ID 时缺少 `info.id` 来源，而活动跟踪 `extractTrackedSessionID` 支持该来源。OpenCode 真实事件以 `properties.info.id` 携带会话 ID，idle/error 事件到达时解析为 `"unknown"` 并提前 return，`clearStallTracking` 未执行，已完成会话残留在 `lastActive` 扫描集合，超时后仍发停滞通知。

修复：三处解析统一增加 `info.id` 兜底（优先级 sessionID → id → data.sessionID → info.id），与 `extractTrackedSessionID` 对齐。

## 结论

全部检查项通过，无 CRITICAL/IMPORTANT 问题，验证通过。
