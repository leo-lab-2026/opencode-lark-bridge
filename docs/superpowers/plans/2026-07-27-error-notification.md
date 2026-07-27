# Error Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

---
change: error-notification
design-doc: docs/superpowers/specs/2026-07-27-error-notification-design.md
base-ref: 568c351e9aeb0b02f744cdd61236268a05380fc1
---

**Goal:** 为 opencode-lark-bridge 插件新增 session.error 事件通知功能，在致命错误导致会话停止时推送飞书通知。

**Architecture:** 在 event-handler.ts 新增 session.error 路由分支，新增 error-mapper.ts 提取错误信息并渲染通知模板，复用现有 notifier 层和 debounce_ms 去重机制。子代理错误也通知（与 completion 跳过子代理不同）。

**Tech Stack:** TypeScript (strict), Bun runtime, Bun test, comment-json (JSONC)

## Global Constraints

- TypeScript strict mode 零类型错误（`npm run build` 通过）
- ESM 导入必须带 `.js` 扩展名（bundler resolution）
- 测试用 Bun test：`import { describe, it, expect } from "bun:test"`
- 事件 hook 只读，不得修改 event 对象
- 通知失败不得阻塞主流程（lark-cli 不可用/失败 → 记日志 + 跳过）
- 状态必须内存内（不持久化）
- 避免 console.log，用 createFileLogger

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/events/error-mapper.ts` | 新建 | 从 session.error 事件提取错误信息并渲染通知模板 |
| `tests/error-mapper.test.ts` | 新建 | error-mapper 单元测试 |
| `src/events/event-handler.ts` | 修改 | 新增 session.error 路由分支 + 导入 mapErrorEvent |
| `tests/event-handler.test.ts` | 修改 | 新增 session.error 测试用例 |
| `src/index.ts` | 修改 | enhanceEvent 新增 session.error 分支注入 projectName |
| `opencode-lark-bridge.config.example.jsonc` | 修改 | 新增 error category 示例 |

---

### Task 1: Error Mapper（TDD）

**Files:**
- Create: `src/events/error-mapper.ts`
- Test: `tests/error-mapper.test.ts`

**Interfaces:**
- Produces: `mapErrorEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage` — 后续 Task 2 的 event-handler 会导入此函数
- Consumes: `NotificationMessage`、`NotificationTarget` from `../types`（已存在）

- [x] **Step 1: Write the failing test**

Create `tests/error-mapper.test.ts`:

```typescript
import { describe, it, expect } from "bun:test"
import { mapErrorEvent } from "../src/events/error-mapper"
import type { NotificationTarget } from "../src/types"

const target: NotificationTarget = { chat_id: "oc_test" }

describe("mapErrorEvent", () => {
  it("extracts standard error payload", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "sess-123",
        error: { type: "ProviderError", message: "429 Too Many Requests" },
        projectName: "My Project",
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("ProviderError")
    expect(result.text).toContain("429 Too Many Requests")
    expect(result.text).toContain("sess-123")
    expect(result.text).toContain("My Project")
    expect(result.target).toEqual(target)
  })

  it("degrades to unknown when sessionID is missing", () => {
    const event = {
      type: "session.error",
      properties: { error: { type: "Error", message: "something" } },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("unknown")
  })

  it("degrades to unknown when error object is missing", () => {
    const event = { type: "session.error", properties: { sessionID: "s1" } }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("unknown")
  })

  it("uses default template when no template provided", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { type: "T", message: "M" },
        projectName: "P",
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("⚠️ OpenCode Error")
    expect(result.text).toContain("Project: P")
    expect(result.text).toContain("Session: s1")
    expect(result.text).toContain("Type: T")
    expect(result.text).toContain("Message: M")
  })

  it("uses custom template when provided", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { type: "T", message: "M" },
        projectName: "P",
      },
    }
    const result = mapErrorEvent(event, target, "ERR [{errorType}] {errorMessage}")
    expect(result.text).toBe("ERR [T] M")
  })

  it("handles top-level event without properties wrapper", () => {
    const event = {
      type: "session.error",
      sessionID: "s1",
      error: { type: "T", message: "M" },
      projectName: "P",
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("s1")
    expect(result.text).toContain("T")
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/error-mapper.test.ts`
Expected: FAIL — `Cannot find module '../src/events/error-mapper'`

- [x] **Step 3: Write minimal implementation**

Create `src/events/error-mapper.ts`:

```typescript
import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}"

export function mapErrorEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const props = (event?.properties ?? event) as Record<string, unknown>
  const sessionID = (typeof props.sessionID === "string" ? props.sessionID : undefined)
    ?? (typeof props.id === "string" ? props.id : undefined)
    ?? "unknown"
  const error = props.error as Record<string, unknown> | undefined
  const errorType = typeof error?.type === "string" ? error.type : "unknown"
  const errorMessage = typeof error?.message === "string" ? error.message : "unknown"
  const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"

  const text = (template ?? DEFAULT_TEMPLATE)
    .replace(/{sessionID}/g, sessionID)
    .replace(/{errorType}/g, errorType)
    .replace(/{errorMessage}/g, errorMessage)
    .replace(/{projectName}/g, projectName)

  return { text, target }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/error-mapper.test.ts`
Expected: PASS — all 6 tests pass

- [x] **Step 5: Commit**

```bash
git add src/events/error-mapper.ts tests/error-mapper.test.ts
git commit -m "feat: add error-mapper for session.error event notifications"
```

---

### Task 2: Event Handler Integration（TDD）

**Files:**
- Modify: `src/events/event-handler.ts` (add import + session.error branch)
- Test: `tests/event-handler.test.ts` (add session.error test cases)

**Interfaces:**
- Consumes: `mapErrorEvent` from Task 1
- Produces: event-handler now routes `session.error` events to error notification

- [x] **Step 1: Write the failing tests**

Add these test cases to `tests/event-handler.test.ts` (after existing tests, inside the `describe("EventHandler", ...)` block):

```typescript
  it("sends notification for main session error", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.error",
      properties: { sessionID: "s1", error: { type: "ProviderError", message: "500 Internal Server Error" }, projectName: "Proj" },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("ProviderError")
    expect(sent[0].text).toContain("500 Internal Server Error")
  })

  it("sends notification for subagent session error (does not skip)", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    // Track a subagent session first
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    // Subagent error should still send notification
    await handler.handle({
      type: "session.error",
      properties: { sessionID: "sub1", error: { type: "Error", message: "failed" } },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("failed")
  })

  it("deduplicates error within debounce window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = {
      type: "session.error",
      properties: { sessionID: "s1", error: { type: "T", message: "M" } },
    }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("sends error notifications for different sessions independently", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    await handler.handle({ type: "session.error", properties: { sessionID: "s1", error: { type: "T", message: "M1" } } })
    await handler.handle({ type: "session.error", properties: { sessionID: "s2", error: { type: "T", message: "M2" } } })
    expect(sent).toHaveLength(2)
  })

  it("falls back to default_target for error category when not configured", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.error", properties: { sessionID: "s1", error: { type: "T", message: "M" } } })
    expect(sent).toHaveLength(1)
    expect(sent[0].target).toEqual({ chat_id: "oc_1" })
  })
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/event-handler.test.ts`
Expected: FAIL — error test cases fail (session.error not handled, no notification sent)

- [x] **Step 3: Write minimal implementation**

Modify `src/events/event-handler.ts`:

Add import at the top (after existing imports):
```typescript
import { mapErrorEvent } from "./error-mapper.js"
```

Add session.error branch in the `handle` method, after the `question.asked` block and before the `permission.asked` default return:

```typescript
      if (eventType === "session.error") {
        logger.debug("Received session.error event", { eventType, event })
        const props = (event?.properties ?? event) as Record<string, unknown>
        const sessionID = extractSessionID(props) ?? "unknown"

        if (isSubagent(event)) {
          const parentID = subagentParentMap.get(sessionID)
          if (parentID) {
            pendingChildren.get(parentID)?.delete(sessionID)
            logger.debug("Removed error session from pendingChildren", { parentID, sessionID })
          }
        }

        const key = `error:${sessionID}`
        const now = Date.now()
        const last = lastSent.get(key)
        if (last && now - last < config.debounce_ms) {
          logger.debug("Skipping duplicate error notification", { key })
          return
        }
        lastSent.set(key, now)

        const category = "error"
        const target = getEffectiveTarget(config, category)
        const categoryConfig = config.categories[category] || {}
        const message = mapErrorEvent(event, target, categoryConfig.template)
        logger.info("Sending error notification", { target, text: message.text })
        await notifier.send(message)
        return
      }
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/event-handler.test.ts`
Expected: PASS — all tests including new error cases pass

- [x] **Step 5: Commit**

```bash
git add src/events/event-handler.ts tests/event-handler.test.ts
git commit -m "feat: route session.error events to error notification in event-handler"
```

---

### Task 3: EnhanceEvent session.error Branch

**Files:**
- Modify: `src/index.ts` (add session.error branch in enhanceEvent function)

**Interfaces:**
- Consumes: `projectName` variable (already in scope in index.ts)
- Produces: enhanced event with `projectName` injected for session.error events

- [x] **Step 1: Add session.error branch to enhanceEvent**

In `src/index.ts`, in the `enhanceEvent` function, add a `session.error` branch BEFORE the `if (type !== "session.idle") return event` line:

```typescript
    if (type === "session.error") {
      const props = event?.properties ?? event ?? {}
      const sessionID = props?.sessionID ?? props?.id ?? "unknown"
      return {
        ...event,
        properties: {
          ...props,
          sessionID,
          projectName: props?.projectName ?? projectName,
        },
      }
    }
```

- [x] **Step 2: Run full test suite to verify no regressions**

Run: `bun test`
Expected: PASS — all existing + new tests pass

- [x] **Step 3: Run TypeScript build**

Run: `npm run build`
Expected: PASS — tsc compiles with zero errors

- [x] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: inject projectName into session.error events via enhanceEvent"
```

---

### Task 4: Config Example + Documentation

**Files:**
- Modify: `opencode-lark-bridge.config.example.jsonc` (add error category)
- Modify: `README.md` (add error notification to supported types, if applicable)

- [x] **Step 1: Add error category to config example**

In `opencode-lark-bridge.config.example.jsonc`, add error template variable documentation comment block before the `{` (after the existing question/completion docs), and add `"error"` category inside `"categories"`:

Add comment block after the existing completion template docs:
```
// 错误通知模板变量：
//   {errorType}   错误类型（如 ProviderError、ContextOverflowError）
//   {errorMessage} 错误消息文本（可能包含 HTTP 状态码）
//   {sessionID}   会话 ID（缺失时为 unknown）
//   {projectName} 项目名
```

Add error category after the `"question"` entry in `"categories"`:
```jsonc
    "error": {
      // "target": { "chat_id": "oc_xxxx" },  // 可选：错误通知发送到指定群，未设置则用 default_target
      // "template": "⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}"
    }
```

- [x] **Step 2: Run full test suite**

Run: `bun test`
Expected: PASS

- [x] **Step 3: Run TypeScript build**

Run: `npm run build`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add opencode-lark-bridge.config.example.jsonc
git commit -m "docs: add error notification category to config example"
```

---

### Task 5: Full Build + Test Verification

- [x] **Step 1: Run complete test suite**

Run: `bun test`
Expected: ALL PASS — existing tests + new error-mapper tests + event-handler error tests

- [x] **Step 2: Run TypeScript strict build**

Run: `npm run build`
Expected: PASS — tsc compiles with zero errors

- [x] **Step 3: Verify all tasks.md checkboxes can be checked**

Confirm all 16 tasks from `openspec/changes/error-notification/tasks.md` are addressed by the implementation.