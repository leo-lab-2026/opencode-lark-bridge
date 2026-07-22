# src/events/

事件处理核心：去重、子代理过滤、事件 → 消息映射。父级 `AGENTS.md` 已覆盖整体架构与入口。

## OVERVIEW

`createEventHandler` 是唯一对外工厂，按 `event.type` 路由到 3 个 mapper；维护内存状态实现毫秒级去重与子代理完成等待。

## STRUCTURE

```
src/events/
├── event-handler.ts        # createEventHandler：路由 + 去重 + 子代理过滤
├── permission-mapper.ts    # mapPermissionEvent + extractResource（按 tool 类型分派）
├── completion-mapper.ts    # mapCompletionEvent（projectName/sessionTitle）
└── question-mapper.ts      # mapQuestionEvent（多问题合并 + 选项截断）
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 加新事件类型 | `event-handler.ts` `handle()` | 在 eventType 分支链中加 `if`；新增对应 mapper；不得改现有 permission 路径 |
| 改去重逻辑 | `event-handler.ts` `lastSent` Map + `dedupeKey()` | permission 用 `tool:resource`，completion/question 用 `sessionID`/`question:id` |
| 改子代理过滤 | `event-handler.ts` `trackSubagent`/`isSubagent`/`pendingChildren` | 靠 `session.created` 的 `info.parentID` 识别 |
| 改资源提取 | `permission-mapper.ts` `extractResource()` | 按 tool 名分派，新增 tool 类型在此加分支 |
| 改问题格式 | `question-mapper.ts` | 单问题 vs 多问题分支；MAX_QUESTION_LEN=200, MAX_OPTIONS=5 |
| 改完成模板变量 | `completion-mapper.ts` | 仅 `{projectName}`/`{sessionTitle}`，缺失降级 `unknown` |

## CONVENTIONS

- **mapper 签名统一**: `(event: any, target: NotificationTarget, template?: string): NotificationMessage`
- **props 解析统一**: `const props = (event?.properties ?? event) as Record<string, unknown>`，兼容事件被包裹或裸传
- **字段缺失降级**: 一律降级为字符串 `unknown`，不抛错
- **模板变量替换**: `String.replace(/{var}/g, value)`，模板未提供用 `DEFAULT_TEMPLATE`
- **tool 名解析**: 见父级 UNIQUE STYLES；`extractToolName` 在 `permission-mapper.ts:5` 和 `event-handler.ts:24` 各有一份副本，改时需同步

## ANTI-PATTERNS

- **状态必须内存内**：`lastSent`/`subagentSessionIds`/`subagentParentMap`/`pendingChildren` 不得持久化或跨进程
- **不得为子代理 idle 单独发通知**：`isSubagent` 为真时直接 return
- **主会话有未完成子代理时不发 completion**：`pendingChildren.get(sessionID).size > 0` 时 return，等最终 idle
- **不得改 permission 通知行为**：permission 路径独立于 completion/question
- **事件类型白名单**：仅处理 `session.created`/`session.idle`/`question.asked`/`permission.asked`，其余 return
- **completion 去重按 sessionID**：同一 session 在 `debounce_ms` 内只发一次

## NOTES

- `enhanceEvent`（在 `src/index.ts`，非本目录）在 event 进入 handler 前注入 `projectName`/`sessionTitle`，并缓存 `session.created`/`session.updated` 的标题
- `dedupeKey` 依赖 `extractResource`，resource 提取失败返回 `unknown` 会导致不同资源同 key 去重
