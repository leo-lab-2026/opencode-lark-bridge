---
archived-with: 2026-07-08-task-completion-notification
status: final
status: final
---
## Context

OpenCode 在每次 AI 响应完成后会广播 `session.idle` 事件。该事件既会在用户主会话结束时触发，也会在子代理/子任务会话结束时触发。插件需要区分这两种情况，只通知用户关心的主会话完成。

根据 OpenCode 插件开发指南和现有通知插件实践，子代理在创建时可通过 `session.created` 事件的 `properties.info.parentID` 字段识别。因此可以在 `event-handler.ts` 内部维护一个 `subagentSessionIds` 集合，在 `session.idle` 到来时判断该会话 ID 是否在集合中。

## Goals / Non-Goals

**Goals:**

- 主会话完成时发送飞书通知
- 子代理/子任务完成时不发送通知
- 通知内容可配置（目标、模板）
- 对现有权限通知零影响

**Non-Goals:**

- 不通知子代理完成
- 不新增除 `session.idle` 外的事件监听
- 不修改权限相关代码
- 不引入持久化状态或跨会话记忆

## Decisions

1. **子代理识别：在内存中跟踪 `session.created`**
   
   - `event-handler.ts` 内部维护 `Set<string> subagentSessionIds`
   - 当 `session.created` 事件的 `properties.info.parentID` 存在时，将 `properties.info.id` 加入集合
   - `session.idle` 时检查 `properties.sessionID` 是否在集合中，在则跳过
   - 理由：无需持久化，插件生命周期与会话生命周期一致；不依赖 OpenCode 版本细节字段，兼容性好

2. **使用 `completion` 类别承载配置**
   
   - 在 `categories` 下新增 `completion`，支持 `target` 与 `template`
   - 模板变量初步支持 `{projectName}`、`{sessionTitle}`、`{duration}`（如事件提供）
   - 理由：与现有 `permission` 类别保持对称，用户可按事件类型独立配置目标与模板

3. **事件到消息映射独立函数**
   
   - 新增 `mapCompletionEvent(event, target, template?)`，与 `mapPermissionEvent` 对称
   - 理由：保持 `event-handler.ts` 只负责路由与去重，具体消息渲染交给 mapper

4. **去重策略**
   
   - 主会话完成通知按 `sessionID` 去重
   - 使用与权限通知相同的 `debounce_ms` 窗口
   - 理由：避免同一 session 因多次 `session.idle` 重复通知

## Risks / Trade-offs

- **[Risk] 子代理识别字段在不同 OpenCode 版本中可能变化** → Mitigation：对 `properties.info.parentID` 和 `properties.parentID` 都做兼容；若都无法识别，则保守地发送通知（宁可误报子代理也不漏报主会话，但可通过配置关闭）
- **[Risk] 长时间运行的插件进程可能导致 `subagentSessionIds` 集合无限增长** → Mitigation：集合只存 session ID 字符串，内存占用极小；若后续需要，可增加 TTL 清理
- **[Trade-off] 若用户期望子代理完成也通知，当前设计不支持** → 可在后续变更中增加 `categories.subagent-completion` 配置项

## Open Questions

1. `session.idle` 事件是否一定包含 `properties.sessionID`？若使用 `properties.id` 作为备选更安全。
2. 是否需要根据会话持续时间过滤掉极短会话（如小于 1 秒）的完成通知？
