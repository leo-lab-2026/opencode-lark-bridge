---
comet_change: fix-stall-finished-session-bypass
role: technical-design
canonical_spec: openspec
archived-with: 2026-08-07-fix-stall-finished-session-bypass
status: final
---

# 修复已完成会话被非活动事件重新激活停滞跟踪

## 问题根因

### 事件流分析

opencode 在会话完成后发送的事件序列（基于运行日志实证）：

```
session.status idle  ──► entry: touchActivity（会话尚未完成）
session.idle         ──► entry: touchActivity → handler: clearStallTracking + finishedSessions.add
session.updated (×N) ──► entry: finishedSessions.has=true, isLifecycle=true → 阻止 ✓
??? (非 lifecycle)   ──► entry: finishedSessions.has=true, isLifecycle=false → delete + touchActivity ✗
session.updated      ──► entry: finishedSessions.has=false → touchActivity ✗（防护已被删除）
...
200秒后              ──► scanStalledSessions → 误发停滞通知
```

### 根因链

1. `isLifecycleEvent` blocklist 仅覆盖 `session.created/updated/deleted/idle/error` + `session.status` idle
2. opencode 发送的 `permission.updated`、`message.removed` 等事件携带 `sessionID` 但不在 blocklist 中
3. 这些事件命中 `!isLifecycleEvent` 分支，执行 `finishedSessions.delete()` 删除防护
4. 防护被删除后，后续 `session.updated` 等事件无条件 `touchActivity`，会话重新进入 `lastActive`
5. 200 秒后（`stall_timeout_ms: 200000`），`scanStalledSessions` 误发停滞通知

### 日志实证

2026-08-07 09:48 实例：
- `session.idle` at 09:48:29.347 → `clearStallTracking` + `finishedSessions.add`
- `session.updated` at 09:48:29.360 → 被阻止（lifecycle event）
- `session.updated` at 09:48:33.994 → `lastActive` 时间戳精确设为此时刻
- 停滞扫描 at 09:48:50.419 → `idleMs: 16425`（回溯至 09:48:33.994）
- 停滞通知 at 09:52:50.428 → 误发

`lastActiveAt` 精确等于第二个 `session.updated` 时刻，证明在两个 `session.updated` 之间有非 lifecycle 事件删除了 `finishedSessions` 防护。

## 技术方案

### 核心变更：Allowlist 替换 Blocklist

**新增 `isActivityEvent` 函数**（`src/events/event-handler.ts`）：

```typescript
function isActivityEvent(event: any): boolean {
  const eventType = event?.type ?? event?.name
  if (eventType === "permission.asked" || eventType === "question.asked") {
    return true
  }
  if (eventType === "session.status") {
    const status = (event?.properties ?? event)?.status
    return typeof status === "object" && status?.type === "busy"
  }
  return false
}
```

**入口逻辑变更**（`src/events/event-handler.ts` `handle()` 内）：

```typescript
// 变更前（blocklist - 有 bug）
if (finishedSessions.has(entrySessionID)) {
  if (!isLifecycleEvent(event)) {
    finishedSessions.delete(entrySessionID)
    touchActivity(entrySessionID, event)
  }
}

// 变更后（allowlist - 修复）
if (finishedSessions.has(entrySessionID)) {
  if (isActivityEvent(event)) {
    finishedSessions.delete(entrySessionID)
    touchActivity(entrySessionID, event)
  }
}
```

**删除 `isLifecycleEvent` 函数**（不再使用）。

### Allowlist 事件选择依据

| 事件类型 | 在 allowlist 中 | 理由 |
|---------|:---:|------|
| `permission.asked` | ✓ | 用户需审批权限 = 新任务开始 |
| `question.asked` | ✓ | 用户需回答问题 = 会话活跃 |
| `session.status` (busy) | ✓ | 会话开始处理 = 新任务开始 |
| `session.updated` | ✗ | 元数据变更，不代表活动 |
| `session.created` | ✗ | 会话创建，不代表恢复活动 |
| `session.deleted` | ✗ | 会话删除，生命周期事件 |
| `session.idle` | ✗ | 会话结束，已由 idle handler 处理 |
| `session.error` | ✗ | 错误事件，已由 error handler 独立处理 |
| `session.status` (idle) | ✗ | 空闲状态，不代表活动 |
| `session.status` (retry) | ✗ | 重试状态，由 retry handler 独立处理 |
| `permission.updated` | ✗ | 权限变更（系统响应），恢复信号由 `session.status busy` 覆盖 |
| `message.updated` | ✗ | 消息内容变更，元数据 |
| `message.removed` | ✗ | 消息删除，清理事件 |
| 未知事件类型 | ✗ | 默认安全（不重新激活） |

### 边界条件处理

1. **用户在同一会话恢复操作**：opencode 发送 `session.status busy` → allowlist 捕获 → 恢复跟踪 ✓
2. **`session.idle` 后立即 `session.status busy`**（用户快速恢复）：allowlist 捕获 → 恢复跟踪；若立即 idle，completion debounce 防重复 ✓
3. **`session.error` 后事件到达**：error handler 独立清除跟踪 + 添加 erroredSessions，不需要 allowlist ✓
4. **子代理完成**：子代理 idle 添加到 `finishedSessions`，主会话 idle 时检查 `pendingChildren`；子代理的 `session.updated` 不在 allowlist 中，不会重新激活 ✓
5. **`session.idle` hook（死代码）**：opencode 1.18.11 不调用此 hook；若未来调用，构造的合成事件 type 为 `session.idle`（不在 allowlist 中），入口逻辑不重新激活，idle handler 正常处理 ✓

### 不变的行为

- 活跃（未完成）会话的 `touchActivity` 行为不变
- `scanStalledSessions` 扫描逻辑不变
- completion/permission/question/retry/error 通知行为不变
- `clearStallTracking` 逻辑不变
- `enhanceEvent` 逻辑不变
- 定时器管理（`stallTimer`）不变

## 测试策略

### 新增测试用例

1. **`isActivityEvent` 单元测试**：验证对每种事件类型的返回值
2. **已完成会话 + `session.updated` → 不重新激活**：`lastActive` 不含该 sessionID，`finishedSessions` 仍包含
3. **已完成会话 + `permission.asked` → 重新激活**：`finishedSessions` 删除，`lastActive` 包含
4. **已完成会话 + `question.asked` → 重新激活**
5. **已完成会话 + `session.status` busy → 重新激活**
6. **已完成会话 + 未知事件类型 → 不重新激活**：模拟 `message.removed`、`permission.updated`
7. **活跃会话 + 任意事件 → 正常 `touchActivity`**：回归保护

### 回归测试

运行 `bun test` 确保现有全部测试通过。

### 端到端验证

构建安装后触发会话完成，观察日志：
- `session.idle` 后不再出现 `Skipping session, not stalled yet` 或 `Sending stall notification`
- 调试日志（如保留）显示非活动事件被阻止

## 实现清单

1. 新增 `isActivityEvent` 函数
2. 修改入口逻辑（`isLifecycleEvent` → `isActivityEvent`）
3. 删除 `isLifecycleEvent` 函数
4. 移除临时调试日志
5. 新增 6 个测试用例
6. 运行测试 + 编译 + 安装验证
