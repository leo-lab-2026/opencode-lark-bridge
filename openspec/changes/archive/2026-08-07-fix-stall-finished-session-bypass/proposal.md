## Why

会话完成后（`session.idle`），飞书仍误收停滞通知。前两次修复（`fix-stall-reactivation-after-idle` 添加 `finishedSessions` 防护、`fix-stall-timer-leak-on-reload` 修复定时器泄漏）均未解决问题。

**根因**：入口逻辑使用 `isLifecycleEvent()` blocklist 判断是否放行已完成会话的事件。该 blocklist 仅覆盖 5 种 session 事件 + `session.status` idle，但 opencode 在会话完成后还会发送多种携带 `sessionID` 的非 lifecycle 事件（如 `permission.updated`、`message.removed`、`session.diff`、`session.compacted` 等）。这些事件命中 `!isLifecycleEvent` 分支，执行 `finishedSessions.delete()` 删除防护并调用 `touchActivity()` 重新激活停滞跟踪。后续的 `session.updated` 等事件因防护已被删除，也会无条件 `touchActivity`，导致已完成会话重新进入 `lastActive` 并最终误发停滞通知。

运行日志实证（2026-08-07 09:48）：`session.idle` 后 4.6 秒到达的第二个 `session.updated` 事件将 `lastActive` 时间戳精确设置为该事件时刻，200 秒后误发停滞通知，`idleMs` 回溯至该 `session.updated` 时刻。

## What Changes

- 将 `finishedSessions` 防护机制从 **blocklist**（`isLifecycleEvent`）改为 **allowlist**：仅当事件类型属于"真正代表用户/系统活动"的集合时，才允许重新激活已完成会话的停滞跟踪
- 允许重新激活的事件类型（activity events）：`permission.asked`、`question.asked`、`session.status`（`status.type === "busy"`）
- 所有其他事件类型（包括 `session.updated`、`session.created`、`message.updated`、`permission.updated`、`message.removed` 等）对已完成会话一律不重新激活停滞跟踪
- 活跃（未完成）会话的 `touchActivity` 行为不变
- 移除 `isLifecycleEvent` 函数，替换为 `isActivityEvent` allowlist 函数
- 移除入口逻辑中 `finishedSessions.delete()` 的"删除防护"行为：已完成会话只有收到 activity event 才清除防护并 touch

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `stall-notification`: "会话活动追踪"需求需补充：会话完成后，仅 activity events 可重新激活停滞跟踪；非 activity 事件（元数据、清理、状态更新等）不得重新激活。新增"已完成会话防护"需求。

## Impact

- **代码**：`src/events/event-handler.ts`（入口逻辑 + `isLifecycleEvent` -> `isActivityEvent`）
- **测试**：`tests/event-handler.test.ts`（新增已完成会话防护测试用例）
- **行为**：不改活跃会话的停滞跟踪行为；不改 completion/permission/question/retry 通知
- **兼容性**：无 BREAKING 变更；opencode 新增事件类型自动落入 allowlist 的"不重新激活"分支
