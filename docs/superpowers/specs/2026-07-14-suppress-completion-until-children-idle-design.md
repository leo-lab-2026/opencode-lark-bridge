---
comet_change: suppress-completion-until-children-idle
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-15-suppress-completion-until-children-idle
status: final
---

## Context

`packages/opencode-lark-bridge/src/events/event-handler.ts` 当前通过 `session.created` 事件的 `properties.info.parentID` 维护一个 `subagentSessionIds` 集合，用于在 `session.idle` 时识别并跳过子代理自身的完成通知。然而，该实现不会判断主会话 idle 时其下是否还有未完成的子代理，因此会在子代理仍在执行时过早发送"任务完成"通知。

根据 OpenCode 当前架构的源码分析：
- 子代理完成会触发自身的 `session.idle`（dev 版本行为）。
- 父会话在子代理完成后会被重新 prompt 并生成最终总结，因此会再次触发一次"最终" `session.idle`。
- 在前台 Task 模式下，父会话在子代理运行期间保持 `busy`；在后台 Task 模式下，父会话会先短暂 idle，但子代理完成后会被重新唤醒并再次 idle。

因此，只需在主会话 `session.idle` 时检查其是否还有未完成的子代理，即可准确判断是否为真正的最终完成。

## Goals

- 主会话 `session.idle` 且其下所有子会话/子代理均已完成时，发送飞书完成通知。
- 主会话 `session.idle` 但仍有未完成子会话/子代理时，跳过通知。
- 子代理自身的 `session.idle` 不发送通知。
- 保持所有状态跟踪在事件处理器内存中，不引入持久化。

## Non-Goals

- 不修改权限通知行为。
- 不修改通知模板、目标配置或 Lark 通知投递层。
- 不监听额外事件类型（仍只依赖 `session.created` 与 `session.idle`）。
- 不为子代理完成单独发送通知。
- 不处理子代理创建/idle 事件丢失等极端异常（当前事件顺序由 OpenCode 保证）。

## Decisions

### 1. 数据结构：父→子映射 + 子代理集合

- 保留 `Set<string> subagentSessionIds`：所有通过 `session.created` 识别的子代理会话 ID，用于快速判断 `session.idle` 事件是否来自子代理。
- 新增 `Map<string, Set<string>> pendingChildren`：父会话 ID → 该父会话下尚未 `idle` 的子代理会话 ID 集合。

Rationale：与现有代码兼容，判断主会话是否还有未完成子代理的时间复杂度为 O(1)，且能自然表达"多个子代理并行"的场景。

### 2. 事件处理逻辑

- `session.created`：若 `properties.info.parentID` 存在，将子代理 ID 加入 `subagentSessionIds`，并加入 `pendingChildren.get(parentID)`（不存在则创建 Set）。
- 子代理 `session.idle`：`isSubagent(event)` 为 true，跳过通知；同时从对应父会话的 `pendingChildren` 集合中移除该子代理 ID。
- 主会话 `session.idle`：若 `pendingChildren.get(sessionID)?.size > 0`，跳过通知；否则按原有 `sessionID` + `debounce_ms` 去重逻辑发送完成通知。

Rationale："直接丢弃中间主 idle"策略依赖 OpenCode 父会话在子代理完成后必然再次 idle 的语义，避免引入延迟队列、定时器或待发送状态。

### 3. 不处理子代理 idle 事件丢失

若 OpenCode 未发送某个子代理的 `session.idle` 事件，`pendingChildren` 会残留该子代理 ID，导致对应主会话后续 idle 被抑制。本次变更不添加 TTL 或计数器清理机制。

Rationale：该场景概率极低，且由 OpenCode 事件顺序保证；添加清理机制会增加复杂度并可能引入误报（在子代理确实仍在运行时发送通知）。

## Data Flow

```
session.created (parentID present)
  → subagentSessionIds.add(childID)
  → pendingChildren[parentID].add(childID)

child session.idle
  → isSubagent = true → skip notification
  → pendingChildren[parentID].delete(childID)

main session.idle
  → pendingChildren[mainID]?.size > 0 → skip notification
  → pendingChildren[mainID] empty/missing
    → dedupe by sessionID
    → mapCompletionEvent
    → notifier.send
```

## Testing Strategy

在 `packages/opencode-lark-bridge/tests/event-handler.test.ts` 中新增以下测试：

1. 主会话无子代理时 `session.idle` → 发送通知。
2. 主会话有一个未完成子代理时 `session.idle` → 跳过；子代理 `session.idle` 后最终主 `session.idle` → 发送。
3. 主会话有多个未完成子代理时 `session.idle` → 跳过；全部子代理 `session.idle` 后最终主 `session.idle` → 只发送一次。
4. 子代理自身 `session.idle` → 从不发送通知。
5. `permission.asked` 事件 → 不受影响，正常发送权限通知。

## Risks / Trade-offs

- **[Risk] 子代理 `session.idle` 事件丢失** → 对应父会话后续通知被永久抑制。Mitigation：本次不处理，依赖 OpenCode 事件顺序保证；未来若出现可引入 TTL 或心跳检测。
- **[Risk] `pendingChildren` 长期残留** → 字符串占用极小，对内存影响可忽略。Mitigation：未来可考虑在父会话收到最终 idle 后清理空集合，或在集合长期未变化时 TTL 清理。
- **[Trade-off] 无单独配置项** → "子代理全部完成"不单独配置通知目标/模板，仍复用 `categories.completion`。
