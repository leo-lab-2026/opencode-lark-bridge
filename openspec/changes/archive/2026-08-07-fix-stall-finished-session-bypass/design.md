## Context

当前 `createEventHandler` 的入口逻辑（`src/events/event-handler.ts:184-194`）对每个事件无条件提取 sessionID 并调用 `touchActivity`。为防止已完成会话被尾随事件重新激活，第一个修复（`fix-stall-reactivation-after-idle`）添加了 `finishedSessions` 集合 + `isLifecycleEvent` blocklist：

```ts
if (finishedSessions.has(entrySessionID)) {
  if (!isLifecycleEvent(event)) {       // blocklist: 仅阻止 5 种 session 事件
    finishedSessions.delete(entrySessionID)  // 删除防护 -> 后续事件可无条件 touch
    touchActivity(entrySessionID, event)
  }
}
```

`isLifecycleEvent` 仅覆盖 `session.created/updated/deleted/idle/error` + `session.status` idle。opencode 在会话完成后还发送 `permission.updated`、`message.removed`、`session.diff`、`session.compacted` 等携带 `sessionID` 的事件，这些事件命中 `!isLifecycleEvent` 分支，删除 `finishedSessions` 防护并 `touchActivity`，导致后续事件（包括 `session.updated`）也能 `touchActivity`，已完成会话重新进入 `lastActive` 并误发停滞通知。

## Goals / Non-Goals

**Goals:**
- 彻底阻止非活动事件重新激活已完成会话的停滞跟踪
- 使用 allowlist 确保 opencode 未来新增的事件类型默认安全（不重新激活）
- 保持活跃会话的停滞跟踪行为完全不变
- 保持 `permission.asked`、`question.asked`、`session.status busy` 能正确恢复已完成会话的跟踪

**Non-Goals:**
- 不修复跨进程旧实例问题（已在前一个 change 处理）
- 不持久化状态跨进程/跨重载
- 不修改 `enhanceEvent`、mapper、notifier 或 config 逻辑
- 不修改 `scanStalledSessions` 扫描逻辑

## Decisions

### Decision 1: 用 `isActivityEvent` allowlist 替换 `isLifecycleEvent` blocklist

**选择**：定义 `isActivityEvent(event)` 函数，仅返回 `true` 对于：
- `permission.asked`
- `question.asked`
- `session.status` 且 `status.type === "busy"`

入口逻辑改为：
```ts
if (finishedSessions.has(entrySessionID)) {
  if (isActivityEvent(event)) {
    finishedSessions.delete(entrySessionID)
    touchActivity(entrySessionID, event)
  }
  // 非 activity event: 不删除防护，不 touch
} else {
  touchActivity(entrySessionID, event)
}
```

**理由**：
- Allowlist 默认安全：未知/新事件类型自动落入"不重新激活"分支
- Blocklist 需要持续维护，每次 opencode 新增事件类型都可能引入漏洞
- 语义更准确：我们关心的是"是否有真实活动"，不是"是否是生命周期事件"

**备选方案 A**：扩展 `isLifecycleEvent` 添加所有已知非活动事件类型
- 否决：维护负担高，新事件类型仍会绕过

**备选方案 B**：完全不使用 `finishedSessions`，在 `session.idle` 后将 sessionID 加入"已完成"集合，扫描时跳过
- 否决：无法处理用户在同一会话恢复操作的场景（需要 activity event 清除"已完成"标记）

### Decision 2: 允许列表的选择依据

`permission.asked`：用户需要审批权限 = 新任务开始
`question.asked`：用户需要回答问题 = 会话活跃
`session.status busy`：会话开始处理 = 新任务开始

不包含 `session.status retry`：retry 事件由 retry-notification 独立处理，且 retry 不代表用户主动恢复；retry 期间会话仍在"未完成"状态（没有收到 `session.idle`），所以不需要在 allowlist 中。

不包含 `session.error`：error 事件在 handler 中独立处理（清除跟踪 + 添加到 erroredSessions），不需要通过 entry 逻辑。

### Decision 3: `isActivityEvent` 不依赖 `enhanceEvent` 注入的字段

`isActivityEvent` 直接检查原始事件结构（`event.type` 和 `event.properties.status.type`），不依赖 `enhanceEvent` 注入的 `sessionID`。这确保即使 `enhanceEvent` 逻辑变化，allowlist 判断仍然稳定。

## Risks / Trade-offs

- **[Risk] 用户在已完成会话中恢复操作但事件类型不在 allowlist 中** -> 当前已知的恢复信号（`session.status busy`、`permission.asked`、`question.asked`）覆盖了主要场景。如果 opencode 未来引入新的恢复信号，需要手动添加到 allowlist。
- **[Risk] `session.status busy` 在 idle 后立即到达导致误恢复** -> 这是正确行为：`session.status busy` 代表会话开始新任务，应该恢复跟踪。如果用户立即再次 idle，completion 通知会去重（debounce），不会重复发送。
- **[Trade-off] allowlist 可能过于严格** -> 选择了保守策略：宁可漏激活（用户不收到停滞通知），也不误激活（用户收到误发通知）。前者可接受（用户可以手动检查），后者是当前 bug 的直接表现。
