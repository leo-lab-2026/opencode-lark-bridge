---
change: suppress-completion-until-children-idle
design-doc: docs/superpowers/specs/2026-07-14-suppress-completion-until-children-idle-design.md
base-ref: 171b31c1be90426f1856705961da7a21df11d29a
archived-with: 2026-07-15-suppress-completion-until-children-idle
---

# Suppress Completion Notification Until Children Idle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify `event-handler.ts` so completion notifications are sent only when a main session goes idle and all of its child subagent/subtask sessions have already gone idle.

**Architecture:** Extend the existing in-memory subagent tracking with a `Map<string, Set<string>> pendingChildren` that maps parent session IDs to their unfinished child session IDs. Register children on `session.created`, remove them on child `session.idle`, and suppress main-session `session.idle` notifications while any child is still pending.

**Tech Stack:** TypeScript, Bun test runner, `packages/opencode-lark-bridge`

## Global Constraints

- All state tracking MUST remain in-memory inside `createEventHandler`; no persistence or cross-process state.
- Permission notification behavior MUST NOT change.
- No new event types beyond `session.created` and `session.idle` may be introduced.
- Implementation MUST follow the existing patterns in `event-handler.ts` and `event-handler.test.ts`.
- Every behavior change MUST be covered by a test in `event-handler.test.ts`.

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 1: Add pending-children tracking data structure

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/event-handler.ts:8`

**Interfaces:**
- Consumes: existing `subagentSessionIds: Set<string>`
- Produces: `pendingChildren: Map<string, Set<string>>` available to `trackSubagent`, child idle cleanup, and main idle check

- [x] **Step 1: Declare `pendingChildren` map**

Add a new map alongside `subagentSessionIds`:

```typescript
const pendingChildren = new Map<string, Set<string>>()
```

- [x] **Step 2: Verify the file still type-checks**

Run: `bun test --run`
Expected: existing tests still pass

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/src/events/event-handler.ts
git commit -m "chore(event-handler): add pendingChildren map for parent-child tracking"
```

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 2: Register child sessions on `session.created`

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/event-handler.ts:30-38`

**Interfaces:**
- Consumes: `pendingChildren` map, `trackSubagent` event parsing
- Produces: updated `trackSubagent` that populates both `subagentSessionIds` and `pendingChildren`

- [x] **Step 1: Update `trackSubagent` to populate `pendingChildren`**

Change the function body so that after adding to `subagentSessionIds`, it also adds the child ID to the parent's pending set:

```typescript
function trackSubagent(event: any) {
  const info = event?.properties?.info ?? event?.info
  const parentID = info?.parentID ?? event?.properties?.parentID
  const id = info?.id ?? event?.properties?.id ?? event?.properties?.sessionID
  if (parentID && id) {
    subagentSessionIds.add(id as string)
    if (!pendingChildren.has(parentID as string)) {
      pendingChildren.set(parentID as string, new Set())
    }
    pendingChildren.get(parentID as string)!.add(id as string)
    logger.debug("Tracked subagent session", { id, parentID })
  }
}
```

- [x] **Step 2: Run existing tests**

Run: `bun test --run packages/opencode-lark-bridge/tests/event-handler.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/src/events/event-handler.ts
git commit -m "feat(event-handler): register child sessions in pendingChildren map"
```

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 3: Remove child sessions on child `session.idle`

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/event-handler.ts:55-60`

**Interfaces:**
- Consumes: `pendingChildren`, child session ID from `isSubagent`
- Produces: cleaned-up `pendingChildren` after child idle

- [x] **Step 1: Add helper to extract parentID from tracked subagent**

Add a small helper that reads the parent-child relationship from the event (same path as `trackSubagent`):

```typescript
function extractParentID(event: any): string | undefined {
  const info = event?.properties?.info ?? event?.info
  return info?.parentID ?? event?.properties?.parentID
}
```

- [x] **Step 2: Remove child from `pendingChildren` when child goes idle**

Inside the `session.idle` branch, before returning for a subagent, remove the child from its parent's pending set:

```typescript
if (isSubagent(event)) {
  const parentID = extractParentID(event)
  const props = event?.properties ?? event
  const sessionID = props?.sessionID ?? props?.id ?? "unknown"
  if (parentID) {
    pendingChildren.get(parentID)?.delete(sessionID as string)
  }
  logger.debug("Skipping subagent session.idle", { event })
  return
}
```

- [x] **Step 3: Run existing tests**

Run: `bun test --run packages/opencode-lark-bridge/tests/event-handler.test.ts`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add packages/opencode-lark-bridge/src/events/event-handler.ts
git commit -m "feat(event-handler): remove child from pendingChildren on child idle"
```

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 4: Suppress main-session notification while children are pending

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/event-handler.ts:61-77`

**Interfaces:**
- Consumes: `pendingChildren` map, main session ID
- Produces: notification skipped when `pendingChildren.get(sessionID)` is non-empty

- [x] **Step 1: Add pending-children check before sending notification**

After computing `sessionID` and before the dedupe check, add:

```typescript
const pending = pendingChildren.get(sessionID as string)
if (pending && pending.size > 0) {
  logger.debug("Skipping completion notification, children still pending", { sessionID, pending: Array.from(pending) })
  return
}
```

- [x] **Step 2: Run existing tests**

Run: `bun test --run packages/opencode-lark-bridge/tests/event-handler.test.ts`
Expected: PASS (existing tests should still pass because they have no pending children)

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/src/events/event-handler.ts
git commit -m "feat(event-handler): suppress main idle notification while children pending"
```

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 5: Add test for single child suppression

**Files:**
- Modify: `packages/opencode-lark-bridge/tests/event-handler.test.ts:115`

**Interfaces:**
- Consumes: `createEventHandler`, existing test helpers
- Produces: new test verifying single child scenario

- [x] **Step 1: Write the failing test**

Append to `event-handler.test.ts`:

```typescript
  it("skips main session idle while child is pending and sends after child idle", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(1000),
      categories: { completion: {} }
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.created",
      properties: { info: { id: "ses_sub_1", parentID: "ses_main_1" } }
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "My Project", sessionTitle: "Main task" }
    })
    expect(sent).toHaveLength(0)
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_sub_1", projectName: "My Project", sessionTitle: "Sub task" }
    })
    expect(sent).toHaveLength(0)
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "My Project", sessionTitle: "Main task" }
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("Main task")
  })
```

- [x] **Step 2: Run test to verify it passes**

Run: `bun test --run packages/opencode-lark-bridge/tests/event-handler.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/tests/event-handler.test.ts
git commit -m "test(event-handler): cover single child suppression scenario"
```

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 6: Add test for multiple children suppression

**Files:**
- Modify: `packages/opencode-lark-bridge/tests/event-handler.test.ts`

**Interfaces:**
- Consumes: existing test helpers
- Produces: new test verifying multiple children scenario

- [x] **Step 1: Write the failing test**

Append to `event-handler.test.ts`:

```typescript
  it("skips main session idle until all children are idle", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(1000),
      categories: { completion: {} }
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.created",
      properties: { info: { id: "ses_sub_1", parentID: "ses_main_1" } }
    })
    await handler.handle({
      type: "session.created",
      properties: { info: { id: "ses_sub_2", parentID: "ses_main_1" } }
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "My Project", sessionTitle: "Main task" }
    })
    expect(sent).toHaveLength(0)
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_sub_1", projectName: "My Project", sessionTitle: "Sub 1" }
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "My Project", sessionTitle: "Main task" }
    })
    expect(sent).toHaveLength(0)
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_sub_2", projectName: "My Project", sessionTitle: "Sub 2" }
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "My Project", sessionTitle: "Main task" }
    })
    expect(sent).toHaveLength(1)
  })
```

- [x] **Step 2: Run test to verify it passes**

Run: `bun test --run packages/opencode-lark-bridge/tests/event-handler.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/tests/event-handler.test.ts
git commit -m "test(event-handler): cover multiple children suppression scenario"
```

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 7: Update README description

**Files:**
- Modify: `packages/opencode-lark-bridge/README.md`

**Interfaces:**
- Consumes: new notification behavior
- Produces: updated README text

- [x] **Step 1: Update the task completion notification section**

Locate the section that says "当用户主会话完成时，会发送 `categories.completion` 配置的通知；子代理或子任务完成时不会发送。" and update it to:

```markdown
当用户主会话完成，且其下所有子代理/子任务均已完成时，会发送 `categories.completion` 配置的通知；子代理或子任务自身完成时不会发送。若主会话进入 idle 时仍有未完成的子代理/子任务，插件会等待最终 idle 后再统一发送通知。
```

- [x] **Step 2: Commit**

```bash
git add packages/opencode-lark-bridge/README.md
git commit -m "docs(bridge): update completion notification behavior description"
```

archived-with: 2026-07-15-suppress-completion-until-children-idle
---

### Task 8: Final verification

**Files:**
- Verify: `packages/opencode-lark-bridge/src/events/event-handler.ts`
- Verify: `packages/opencode-lark-bridge/tests/event-handler.test.ts`
- Verify: `packages/opencode-lark-bridge/README.md`

- [x] **Step 1: Run full test suite**

Run: `bun test`
Expected: all tests pass

- [x] **Step 2: Run TypeScript build**

Run: `npm run build`
Expected: exit 0

- [x] **Step 3: Verify tasks.md is complete**

Check that all tasks in `openspec/changes/suppress-completion-until-children-idle/tasks.md` are checked.

- [x] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification for suppress-completion-until-children-idle"
```
