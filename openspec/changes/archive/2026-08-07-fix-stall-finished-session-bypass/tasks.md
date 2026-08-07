## 1. 核心实现

- [x] 1.1 在 `src/events/event-handler.ts` 中新增 `isActivityEvent(event)` 函数：仅对 `permission.asked`、`question.asked`、`session.status`（`status.type === "busy"`）返回 true
- [x] 1.2 修改入口逻辑：将 `isLifecycleEvent` 替换为 `isActivityEvent`，仅当 `isActivityEvent` 返回 true 时才 `finishedSessions.delete` + `touchActivity`
- [x] 1.3 删除 `isLifecycleEvent` 函数（不再使用）
- [x] 1.4 移除临时调试日志（`DEBUG:` 前缀的 `logger.debug` 调用）

## 2. 测试

- [x] 2.1 新增测试：已完成会话收到 `session.updated` 事件后不重新激活停滞跟踪（`lastActive` 不含该 sessionID）
- [x] 2.2 新增测试：已完成会话收到 `permission.asked` 事件后恢复停滞跟踪
- [x] 2.3 新增测试：已完成会话收到 `question.asked` 事件后恢复停滞跟踪
- [x] 2.4 新增测试：已完成会话收到 `session.status` busy 事件后恢复停滞跟踪
- [x] 2.5 新增测试：已完成会话收到未知事件类型（如 `message.removed`、`permission.updated`）后不重新激活
- [x] 2.6 新增测试：活跃（未完成）会话收到任意事件仍正常 `touchActivity`

## 3. 验证

- [x] 3.1 运行 `bun test` 确保全部测试通过（含新增测试）
- [x] 3.2 运行 `npm run build` 确保 TypeScript 编译零错误
- [x] 3.3 运行 `npm run install:local` 安装插件，触发会话完成，观察日志确认无停滞通知误发
