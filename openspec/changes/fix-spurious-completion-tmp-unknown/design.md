# Design: fix-spurious-completion-tmp-unknown

## 根因（运行时日志实证）

日志 `~/.config/opencode/logs/opencode-lark-bridge.log`（16:42-17:01 段）：

```
[INFO] Plugin initialized {"ctxDirectory":"/tmp","ctxWorktree":"/tmp"}
[DEBUG] Received session.idle event {"event":{"type":"session.idle","properties":{"type":"session.idle","sessionID":"unknown","projectName":"tmp","sessionTitle":"unknown"}}}
[INFO] Sending completion notification {"text":"✅ 任务完成\nProject: tmp\nSession: unknown"}
```

特征：
1. `ctxDirectory:"/tmp"` -- OpenCode 以 `/tmp`（非项目目录）为 cwd 启动（用户在 /tmp 下调试时启动的 opencode 会话）。
2. 畸形 `session.idle` 事件：`sessionID:"unknown"`（无真实会话 ID）、`properties.type:"session.idle"`（非标准嵌套，正常事件 properties 无 type）。每次紧跟 `Plugin initialized`，无前置 `session.created`。
3. 非子代理：无 `session.created` -> `trackSubagent` 未跟踪 -> `isSubagent` 为 false -> 子代理过滤未命中。
4. 去重失效：`lastSent` key 用 sessionID="unknown"，但每次插件重新初始化 `lastSent` 清空，去重无效。

## 修复方案

在 `event-handler.ts` 的 `session.idle` 分支，`extractSessionID` 回退 `"unknown"` 时跳过通知：

```typescript
const sessionID = extractSessionID(props) ?? "unknown"

if (sessionID === "unknown") {
  logger.debug("Skipping completion notification, sessionID unresolvable", { event })
  return
}
```

放置位置：在 `extractSessionID` 之后、`isSubagent` 检查之前。畸形事件 sessionID 不可解析，先于子代理/去重/完成逻辑过滤。

## 为何安全

- 真实 OpenCode 会话 idle 事件 sessionID 一定是 `ses_xxx`（见日志正常事件），不会是 `"unknown"`。
- `extractSessionID` 只在 props 无 `sessionID`/`id`/`data.sessionID` 时回退 `"unknown"`，真实事件必含其一。
- 不影响子代理过滤、error 抑制、去重等既有逻辑（过滤在其后）。

## 不改动项

- `session.idle` hook（src/index.ts）的 input 解析不动。
- enhanceEvent、mapCompletionEvent 不动（上一次 change 已修）。
- 去重逻辑不动（unknown 过滤后不会再到达去重）。

## 验证策略

- 回归测试：畸形事件（sessionID unknown / 缺失）不发通知；真实 sessionID 仍发。
- 全量 `bun test` + `tsc` 编译通过。
