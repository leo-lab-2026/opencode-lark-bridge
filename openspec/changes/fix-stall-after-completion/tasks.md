# Tasks

## Task 1: 为 info.id 形状的 idle/error 事件写失败回归测试

- [x] 在 `tests/event-handler.test.ts` 的 stall tracking 部分新增：
  - 「clears tracking on session.idle with info.id shape」：`session.created`（`properties.info.id`）→ `session.idle`（仅 `properties.info.id`，无 sessionID）→ 等待超时 → `scanStalledSessions` → 断言无停滞通知
  - 「clears tracking on session.error with info.id shape」：同上，用 `session.error`（仅 `properties.info.id`）
- [x] 在 `tests/index.test.ts` 新增：`session.created`（info.id）→ event hook 发送 `session.idle`（仅 info.id）→ 日志包含 `Sending completion notification`（证明 enhanceEvent 正确解析 info.id）
- [x] 运行 `bun test tests/event-handler.test.ts tests/index.test.ts` 确认新测试失败（RED），失败原因对应本 bug

## Task 2: 修复会话 ID 解析

- [x] `src/events/event-handler.ts` `extractSessionID`：增加 `props.info.id` 来源（与 `extractTrackedSessionID` 对齐）
- [x] `src/index.ts` `enhanceEvent` 的 `session.idle` 分支：sessionID 解析增加 `info.id` 兜底
- [x] `src/index.ts` `enhanceEvent` 的 `session.error` 分支：sessionID 解析增加 `info.id` 兜底
- [x] 重新运行上述测试确认转绿（GREEN）
- [x] 运行 `npm run build`（tsc strict 零错误）与 `bun test` 全量回归
- [x] 提交 commit：`fix: stop stall notification after session completes (info.id shape)`
