## Context

现有事件路由见 `src/events/event-handler.ts`：`handle(event)` 按 `event.type` 分派。插件为纯事件驱动（无定时器）；状态全部内存内（`lastSent`、`subagentSessionIds`、`pendingChildren`、`erroredSessions`），不持久化、不跨进程。插件运行在 opencode 进程内（`src/index.ts` 的 `OpenCodeLarkBridge(ctx)`）。

问题：busy 挂起（模型静默/SSE 超时/网络黑洞）时不产生任何事件，纯事件驱动无法感知"没有事件发生"。见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- 事件驱动 + 内存定时器混合：定时器只做"扫描与检查"，活动时间更新仍由事件驱动
- 定时器生命周期绑定 opencode 进程（创建于插件初始化，无需显式销毁——进程退出即回收）
- 与 retry 通知分工明确（retry 有事件流，不触发 stall）

**Non-Goals:**
- 不做进程外监控（opencode 进程崩溃时插件随之消亡，stall 定时器也无法运行——如实文档说明，不伪实现）
- 不持久化活动状态（跨进程恢复不属于本插件能力）
- 不改变现有四类通知与 retry 通知行为

## Decisions

**D1: 活动追踪表 + 内存定时器**

新增 `lastActive: Map<sessionID, number>`（最后活动时间戳）与 `stallLastSent: Map<sessionID, number>`（上次提醒时间）。事件分支统一调用 `touchActivity(sessionID)` 更新活动时间；`setInterval`（间隔 `stall_check_interval_ms`，默认 60s）扫描 `lastActive`：

```
scan():
  for (sessionID, lastActiveAt) of lastActive:
    if not 仍在追踪: continue
    idleMs = now - lastActiveAt
    if idleMs < stall_timeout_ms: continue
    if lastSent 且 now - lastSent < stall_interval_ms: continue
    send(stall-mapper(...))  // 失败仅记日志
```

**D2: 新增独立 category `stall`，默认开启**

```
stall: {
  target?: string             // 回退 default_target
  template?: string           // 默认模板含 {projectName} {sessionTitle} {idleDuration}
  stall_timeout_ms?: number   // 默认 600_000（10 分钟）
  stall_interval_ms?: number  // 默认 3_600_000（60 分钟，超时后重复提醒间隔）
  stall_check_interval_ms?: number // 默认 60_000（扫描间隔）
}
```

默认开启符合"静默停滞也要知情"的诉求；`stall_interval_ms` 默认 60 分钟防止刷屏。

**D3: 追踪生命周期挂在 event-handler**

`session.created` → 加入追踪；`session.idle` / `session.error` → 移除追踪（同时清理 `lastActive`/`stallLastSent` 条目防内存泄漏）。活动事件（message/tool/permission/question/session.status 等）→ `touchActivity`。子代理会话同样追踪（父会话等待子代理时，子代理静默也会卡住整体任务），但不单独区分（stall 通知含 sessionTitle，子代理标题可辨识）。

**D4: retry 事件流天然防误触发**

`session.status`（retry）是活动事件之一（`touchActivity` 更新），重试期间每 2-30s 一次事件流，永不超时——stall 只在完全静默时触发，与 retry 通知零重叠（spec: 与重试通知分工）。

**D5: 定时器由 index.ts 创建，handler 暴露扫描函数**

`createEventHandler` 返回 `scanStalledSessions()` 供 `OpenCodeLarkBridge` 在 `setInterval` 中调用（间隔来自配置）。保持 handler 纯逻辑、定时器归入口管理，便于测试（测试直接调用 `scanStalledSessions` 注入时间，无需等待真实定时器）。

**D6: stall 不污染 erroredSessions**

stall 只是提醒，不改会话状态语义；停滞恢复后的 `session.idle` 正常发 completion（spec: 停滞不干扰完成通知）。

## Risks / Trade-offs

- **误报**：长任务"正常思考"也可能无事件（如模型单次长推理，SSE 流式通常有 delta，但极端场景可能静默）。默认 10 分钟阈值 + 首次提醒后可等待，接受误报概率；阈值可配置
- **定时器与进程生命周期**：opencode 进程退出后定时器自然消亡；若 opencode 崩溃，stall 无法自救（无通知）——属能力边界，文档明示
- **内存增长**：长期运行的 opencode 进程若大量会话创建后未 idle/error，`lastActive` 持续增长；D3 的 idle/error 清理已覆盖常规路径，`session.deleted` 也纳入清理可进一步收敛（实现时补）
- **与 retry 通知的配置耦合**：两个 change 独立配置、独立默认值，用户可分别开关；文档说明二者关系
