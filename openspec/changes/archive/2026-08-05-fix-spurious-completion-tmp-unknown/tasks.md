# Tasks: fix-spurious-completion-tmp-unknown

- [x] 1. 新增失败回归测试：`tests/event-handler.test.ts` 覆盖畸形 session.idle 事件（sessionID 为 `"unknown"` / 缺失）不发完成通知；真实 sessionID 仍发
- [x] 2. 修复 `event-handler.ts` session.idle 分支：`extractSessionID` 回退 `"unknown"` 时跳过通知
- [x] 3. 运行 `bun test` 全量通过、`tsc` 编译零错误
- [x] 4. 根因消除检查：确认畸形事件被过滤、真实事件不受影响
