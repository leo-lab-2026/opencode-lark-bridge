# 修复：任务完成后仍发送停滞通知

## 问题描述

在一个 session 中，任务完成后不再有任何操作，到达会话停滞阈值时仍会收到飞书通知：

```
OpenCode 会话停滞
Project: opencode-lark-bridge
Session: 检查 Git 是否干净
无进展时长: 4 分钟 15 秒
```

预期行为：任务已完成（`session.idle`），会话已结束，不应再发送停滞通知。只有任务未完成（会话持续无进展）时才应发送。

## 根因分析

停滞追踪（`createEventHandler`）维护每个会话的最后活动时间 `lastActive`，`session.idle` / `session.error` 时调用 `clearStallTracking` 移除该会话，从而退出超时扫描。

但会话 ID 解析存在两处不一致：

1. 活动记录（`extractTrackedSessionID`，event-handler.ts:27）支持三种来源：`props.sessionID`、`props.data.sessionID`、`props.info.id`
2. 结束清理（`extractSessionID`，event-handler.ts:21）只支持两种来源：`props.sessionID`、`props.id`、`props.data.sessionID` —— **缺少 `props.info.id`**

OpenCode 真实事件形状以 `properties.info.id` 携带会话 ID（`session.created` 事件已确认，测试 fixture 同构）。当 `session.idle` / `session.error` 事件仅携带 `info.id` 时：

- `handle()` 开头用 `extractTrackedSessionID` 正常记录该会话活动 → `lastActive[ses_1]` 更新
- `session.idle` 分支用 `extractSessionID` 解析为 `"unknown"` → 命中 `sessionID === "unknown"` 提前 return（event-handler.ts:193-196），**`clearStallTracking` 从未执行**
- 已完成会话残留在 `lastActive` 扫描集合中 → 超时后 `scanStalledSessions` 继续发送停滞通知

此外 `enhanceEvent`（index.ts）对 `session.idle` / `session.error` 的 sessionID 注入同样缺少 `info.id` 来源，会在入口处就把 ID 解析为 `"unknown"`，问题在插件主入口即已发生。

## 修复目标

- `session.idle` / `session.error` 事件无论以 `sessionID` 还是 `info.id` 形状到达，都能正确解析会话 ID 并清除停滞追踪
- 任务完成（idle）或出错（error）后不再发送停滞通知
- 不改变其他通知行为（completion、permission、question、retry、stall 节流等）
