# 修复方案：统一会话 ID 解析来源

## 方案

将 `session.idle` / `session.error` 的会话 ID 解析与活动跟踪对齐，补齐 `info.id` 来源：

### 1. `src/events/event-handler.ts` — `extractSessionID`（第 21-25 行）

增加 `props.info.id` 来源，与 `extractTrackedSessionID` 保持同一解析集合：

```ts
function extractSessionID(props: Record<string, unknown>): string | undefined {
  const info = props.info as Record<string, unknown> | undefined
  return (typeof props.sessionID === "string" ? props.sessionID : undefined)
    ?? (typeof props.id === "string" ? props.id : undefined)
    ?? (typeof (props.data as Record<string, unknown>)?.sessionID === "string" ? (props.data as Record<string, unknown>).sessionID as string : undefined)
    ?? (typeof info?.id === "string" ? info.id as string : undefined)
}
```

### 2. `src/index.ts` — `enhanceEvent` 的 `session.idle` 分支（第 174 行）

```ts
const info = props.info as Record<string, unknown> | undefined
const sessionID = props?.sessionID ?? props?.id ?? info?.id ?? "unknown"
```

### 3. `src/index.ts` — `enhanceEvent` 的 `session.error` 分支（第 148 行）

同样的 `info.id` 兜底（与 `session.idle` 分支同构），避免同类根因在 error 事件上复发。

## 影响面

- 修改 2 个文件（event-handler.ts、index.ts），均为解析来源的增量扩展，不改变既有解析优先级（sessionID → id → data.sessionID → info.id）
- 既有行为不变：`sessionID` 形状事件仍按原路径解析；无任何 ID 的事件仍降级为 `"unknown"` 并跳过 completion 通知（既有测试语义）
- 不涉及配置、模板、发送层
