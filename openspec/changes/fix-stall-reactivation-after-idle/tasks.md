# Tasks

## Task 1: 为尾随事件重新激活停滞跟踪写失败回归测试

- [x] 在 `tests/event-handler.test.ts` stall 部分新增：
  - 「session.updated trailing session.idle does not re-activate stall tracking」：`session.created` → `session.idle` → `session.updated` → 等待超时 → `scanStalledSessions` → 断言无停滞通知
  - 「session.status idle trailing session.idle does not re-activate stall tracking」：`session.created` → `session.idle` → `session.status`（type=idle）→ 等待超时 → 扫描 → 无停滞通知
  - 「session.created trailing session.idle does not re-activate stall tracking」：`session.created` → `session.idle` → 再次 `session.created`（杂散）→ 等待超时 → 扫描 → 无停滞通知
  - 「activity after session.idle re-activates stall tracking」：`session.created` → `session.idle` → `session.status`（busy 活动）→ 等待超时 → 扫描 → **有**停滞通知（恢复语义）
- [x] 运行 `bun test tests/event-handler.test.ts` 确认新测试失败（RED），失败原因对应「idle 后尾随事件重新 touch 会话」

## Task 2: 实现 finishedSessions 防护

- [x] `createEventHandler` 内新增 `finishedSessions` 集合与 `isLifecycleEvent` 判定
- [x] `handle()` 入口 touch 增加 finished 防护（活动事件解除并恢复，元数据事件跳过）
- [x] `touchActivity` 父链冒泡跳过已完成父会话
- [x] `session.idle` 分支（子代理 idle、主会话 pending 为空）标记 finished；主会话 pending 非空不标记
- [x] `session.deleted` 分支标记 finished
- [x] 重新运行上述测试确认转绿（GREEN）
- [x] 运行 `npm run build`（tsc strict）与 `bun test` 全量回归
- [x] 提交 commit：`fix: prevent trailing session events from re-activating stall tracking`
