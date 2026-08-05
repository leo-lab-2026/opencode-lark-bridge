# 修复方案：完成态会话防护（finishedSessions）

## 方案

在 `createEventHandler`（src/events/event-handler.ts）新增「会话已完成」集合 `finishedSessions`，结束事件标记、活动事件解除、元数据事件跳过：

### 1. 新增状态与判定

```ts
const finishedSessions = new Set<string>()

// 元数据/结束类事件：不算活动，不得重新激活已完成会话的停滞跟踪
function isLifecycleEvent(event: any): boolean {
  const eventType = event?.type ?? event?.name
  if (eventType === "session.created" || eventType === "session.updated"
    || eventType === "session.deleted" || eventType === "session.idle"
    || eventType === "session.error") return true
  if (eventType === "session.status") {
    const status = (event?.properties ?? event)?.status
    return typeof status === "object" && status?.type === "idle"
  }
  return false
}
```

### 2. `handle()` 入口 touch 增加防护（event-handler.ts:165-168）

```ts
const entrySessionID = extractTrackedSessionID(props) ?? "unknown"
if (entrySessionID !== "unknown") {
  if (finishedSessions.has(entrySessionID)) {
    if (!isLifecycleEvent(event)) {
      // 会话已完成后真正恢复活动：解除防护并恢复跟踪
      finishedSessions.delete(entrySessionID)
      touchActivity(entrySessionID, event)
    }
    // 元数据/结束类尾随事件：跳过，不激活跟踪
  } else {
    touchActivity(entrySessionID, event)
  }
}
```

### 3. `touchActivity` 父链冒泡增加防护

子代理活动冒泡更新父会话时，若父会话已完成（finishedSessions 含 parentID），跳过冒泡，不得复活父会话的停滞跟踪。

### 4. 结束事件标记 finished

- `session.idle` 分支：子代理 idle 或主会话 idle 且 pendingChildren 为空 → `finishedSessions.add(sessionID)`
- 主会话 idle 但 pendingChildren 非空 → **不标记**（任务未完成，子代理活动冒泡继续维持父会话跟踪）
- `session.deleted` 分支：`finishedSessions.add(sessionID)`（会话已删除，永不复活）
- `session.error`：**不标记**（会话可能恢复，恢复后重新活动应继续提醒）

### 5. 不修改的内容

- `extractSessionID` / `extractTrackedSessionID` / `enhanceEvent`（上个 change 的修复保留）
- `scanStalledSessions`、completion/permission/question/retry 各分支逻辑

## 影响面

- 仅修改 `src/events/event-handler.ts`（1 个源文件）+ 测试文件
- 行为变化仅限「已完成会话收到尾随元数据事件」的场景：不再重新激活停滞跟踪；用户恢复活动（busy/permission/question/工具事件）时跟踪正常恢复
- 新会话（全新 sessionID）不受影响：不在 finishedSessions 中，created 事件正常建立跟踪（保留 spec「会话开始记录活动起点」语义）

## 已知局限（记录不修复）

插件/opencode 进程重载后新实例内存状态为空，无法得知历史会话已完成；若旧会话重新活动会重建跟踪并可能误发。修复需持久化会话状态，超出 hotfix 范围。
