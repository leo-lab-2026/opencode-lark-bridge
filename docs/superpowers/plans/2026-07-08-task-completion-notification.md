---
archived-with: 2026-07-08-task-completion-notification
status: final
---
# Task Completion Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Extend `opencode-lark-bridge` to send Lark notifications when a user-facing OpenCode session completes, while filtering out subagent/sub-task completions.

**Architecture:** The `event-handler.ts` will listen to both `session.created` (to track subagent session IDs) and `session.idle` (to detect completion). A new `completion-mapper.ts` will render completion messages using a configurable template. The plugin entry in `index.ts` will register the `session.idle` hook. All behavior is configurable under `categories.completion`.

**Tech Stack:** TypeScript, Bun, Lark CLI, JSONC config

---

## Global Constraints

- Keep existing permission notification behavior unchanged.
- Do not introduce persistent state; subagent tracking is in-memory only.
- All new code must pass `bun test` and `npm run build`.
- Follow existing file naming and import conventions (`.js` extensions for ESM).
- Commit after each independently testable task.

---

## File Structure

- **Modify** `packages/opencode-lark-bridge/src/events/event-handler.ts`
  - Track subagent session IDs from `session.created` events.
  - Add `session.idle` handling, skip subagents, send completion notifications.
- **Create** `packages/opencode-lark-bridge/src/events/completion-mapper.ts`
  - Export `mapCompletionEvent(event, target, template?)`.
- **Modify** `packages/opencode-lark-bridge/src/index.ts`
  - Register `session.idle` hook that delegates to `event-handler.handle`.
- **Modify** `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc`
  - Add `categories.completion` example.
- **Modify** `packages/opencode-lark-bridge/README.md`
  - Document completion notification behavior, subagent filtering, and configuration.
- **Modify** `packages/opencode-lark-bridge/tests/event-handler.test.ts`
  - Add tests for main-session completion, subagent completion skip, dedupe.
- **Create** `packages/opencode-lark-bridge/tests/completion-mapper.test.ts`
  - Add tests for template rendering and variable extraction.

---

### Task 1: Track subagent sessions and handle session.idle in event-handler.ts

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/event-handler.ts`
- Test: `packages/opencode-lark-bridge/tests/event-handler.test.ts`

**Interfaces:**
- Consumes: `PluginConfig`, `Notifier`, `Logger`, `mapPermissionEvent`, `extractResource`, `getEffectiveTarget`
- Produces: `createEventHandler(config, notifier, logger)` with expanded `handle(event)` supporting `session.created` and `session.idle`

- [x] **Step 1: Write failing tests for subagent tracking and session.idle handling**

  Add to `tests/event-handler.test.ts`:

  ```ts
  import { describe, it, expect } from "bun:test"
  import { createEventHandler } from "../src/events/event-handler"

  function createMocks() {
    const sent: any[] = []
    const notifier = { send: async (msg: any) => { sent.push(msg) } }
    const logs: any[] = []
    const logger = {
      info: (_msg: string, extra?: any) => { logs.push(["info", extra]) },
      debug: (_msg: string, extra?: any) => { logs.push(["debug", extra]) },
      error: (_msg: string, extra?: any) => { logs.push(["error", extra]) },
    }
    return { sent, notifier, logger, logs }
  }

  describe("EventHandler completion notifications", () => {
    it("sends notification on main session idle", async () => {
      const { sent, notifier, logger } = createMocks()
      const config = {
        app_id: "x",
        app_secret: "x",
        default_target: { chat_id: "oc_default" },
        debounce_ms: 3000,
        log_file: "./logs/test.log",
        categories: {
          completion: { target: { chat_id: "oc_completion" } }
        }
      }
      const handler = createEventHandler(config, notifier, logger)
      await handler.handle({
        type: "session.idle",
        properties: {
          sessionID: "ses_main_1",
          projectName: "My Project",
          sessionTitle: "Refactor auth"
        }
      })
      expect(sent).toHaveLength(1)
      expect(sent[0].target.chat_id).toBe("oc_completion")
      expect(sent[0].text).toContain("Refactor auth")
    })

    it("skips notification for subagent session idle", async () => {
      const { sent, notifier, logger } = createMocks()
      const config = {
        app_id: "x",
        app_secret: "x",
        default_target: { chat_id: "oc_default" },
        debounce_ms: 3000,
        log_file: "./logs/test.log",
        categories: { completion: {} }
      }
      const handler = createEventHandler(config, notifier, logger)
      await handler.handle({
        type: "session.created",
        properties: {
          info: { id: "ses_sub_1", parentID: "ses_main_1" }
        }
      })
      await handler.handle({
        type: "session.idle",
        properties: {
          sessionID: "ses_sub_1",
          projectName: "My Project",
          sessionTitle: "Sub task"
        }
      })
      expect(sent).toHaveLength(0)
    })

    it("deduplicates main session idle within debounce window", async () => {
      const { sent, notifier, logger } = createMocks()
      const config = {
        app_id: "x",
        app_secret: "x",
        default_target: { chat_id: "oc_default" },
        debounce_ms: 3000,
        log_file: "./logs/test.log",
        categories: { completion: {} }
      }
      const handler = createEventHandler(config, notifier, logger)
      const event = {
        type: "session.idle",
        properties: { sessionID: "ses_main_1", sessionTitle: "Task" }
      }
      await handler.handle(event)
      await handler.handle(event)
      expect(sent).toHaveLength(1)
    })
  })
  ```

  Run: `bun test tests/event-handler.test.ts`
  Expected: FAIL (new tests fail because session.idle is not handled)

- [x] **Step 2: Implement subagent tracking and session.idle routing**

  Modify `src/events/event-handler.ts`:

  ```ts
  import type { PluginConfig, Notifier, Logger } from "../types"
  import { mapPermissionEvent, extractResource } from "./permission-mapper.js"
  import { mapCompletionEvent } from "./completion-mapper.js"
  import { getEffectiveTarget } from "../config.js"

  export function createEventHandler(config: PluginConfig, notifier: Notifier, logger: Logger) {
    const lastSent = new Map<string, number>()
    const subagentSessionIds = new Set<string>()

    function dedupeKey(event: any): string {
      const props = event?.properties ?? event
      const tool = (() => {
        const t = props?.tool
        if (typeof t === "string") return t
        if (t && typeof t === "object") {
          const record = t as Record<string, unknown>
          if (typeof record.callID === "string") {
            const prefix = record.callID.split("_")[0]
            if (prefix) return prefix
          }
          const candidate = record.name ?? record.tool ?? record.id ?? record.type
          if (typeof candidate === "string") return candidate
        }
        return "unknown"
      })()
      const resource = extractResource(props)
      return `${tool}:${resource}`
    }

    function trackSubagent(event: any) {
      const info = event?.properties?.info ?? event?.info
      const parentID = info?.parentID ?? event?.properties?.parentID
      const id = info?.id ?? event?.properties?.id ?? event?.properties?.sessionID
      if (parentID && id) {
        subagentSessionIds.add(id as string)
        logger.debug("Tracked subagent session", { id, parentID })
      }
    }

    function isSubagent(event: any): boolean {
      const props = event?.properties ?? event
      const sessionID = props?.sessionID ?? props?.id
      return typeof sessionID === "string" && subagentSessionIds.has(sessionID)
    }

    return {
      async handle(event: any) {
        const eventType = event?.type ?? event?.name

        if (eventType === "session.created") {
          trackSubagent(event)
          return
        }

        if (eventType === "session.idle") {
          logger.debug("Received session.idle event", { eventType, event })
          if (isSubagent(event)) {
            logger.debug("Skipping subagent session.idle", { event })
            return
          }
          const props = event?.properties ?? event
          const sessionID = props?.sessionID ?? props?.id ?? "unknown"
          const now = Date.now()
          const last = lastSent.get(sessionID)
          if (last && now - last < config.debounce_ms) {
            logger.debug("Skipping duplicate completion notification", { sessionID })
            return
          }
          lastSent.set(sessionID, now)

          const category = "completion"
          const target = getEffectiveTarget(config, category)
          const categoryConfig = config.categories[category] || {}
          const message = mapCompletionEvent(event, target, categoryConfig.template)
          logger.info("Sending completion notification", { target, text: message.text })
          await notifier.send(message)
          return
        }

        if (eventType !== "permission.asked") {
          return
        }

        logger.debug("Received permission.asked event", { eventType, event })

        const key = dedupeKey(event)
        const now = Date.now()
        const last = lastSent.get(key)
        if (last && now - last < config.debounce_ms) {
          logger.debug("Skipping duplicate notification", { key })
          return
        }
        lastSent.set(key, now)

        const category = "permission"
        const target = getEffectiveTarget(config, category)
        const categoryConfig = config.categories[category] || {}
        const message = mapPermissionEvent(event, target, categoryConfig.template)
        logger.info("Sending notification", { target, text: message.text })
        await notifier.send(message)
      }
    }
  }
  ```

  Run: `bun test tests/event-handler.test.ts`
  Expected: Tests may still fail until completion-mapper is implemented.

- [x] **Step 3: Commit**

  ```bash
  git add packages/opencode-lark-bridge/src/events/event-handler.ts
  git add packages/opencode-lark-bridge/tests/event-handler.test.ts
  git commit -m "feat(opencode-lark-bridge): track subagents and route session.idle events"
  ```

---

### Task 2: Create completion-mapper.ts

**Files:**
- Create: `packages/opencode-lark-bridge/src/events/completion-mapper.ts`
- Test: `packages/opencode-lark-bridge/tests/completion-mapper.test.ts`

**Interfaces:**
- Consumes: `NotificationTarget`
- Produces: `mapCompletionEvent(event, target, template?): NotificationMessage`

- [x] **Step 1: Write failing tests for completion mapper**

  Create `tests/completion-mapper.test.ts`:

  ```ts
  import { describe, it, expect } from "bun:test"
  import { mapCompletionEvent } from "../src/events/completion-mapper"

  describe("mapCompletionEvent", () => {
    it("renders default template with session title", () => {
      const event = {
        properties: {
          sessionID: "ses_1",
          projectName: "My Project",
          sessionTitle: "Refactor auth"
        }
      }
      const msg = mapCompletionEvent(event, { chat_id: "oc_1" })
      expect(msg.text).toContain("Task Completed")
      expect(msg.text).toContain("My Project")
      expect(msg.text).toContain("Refactor auth")
    })

    it("uses custom template", () => {
      const event = {
        properties: {
          sessionID: "ses_1",
          projectName: "My Project",
          sessionTitle: "Refactor auth"
        }
      }
      const msg = mapCompletionEvent(event, { chat_id: "oc_1" }, "{projectName}: {sessionTitle}")
      expect(msg.text).toBe("My Project: Refactor auth")
    })

    it("falls back to unknown for missing fields", () => {
      const event = { properties: { sessionID: "ses_1" } }
      const msg = mapCompletionEvent(event, { chat_id: "oc_1" })
      expect(msg.text).toContain("unknown")
    })
  })
  ```

  Run: `bun test tests/completion-mapper.test.ts`
  Expected: FAIL (file does not exist)

- [x] **Step 2: Implement completion-mapper.ts**

  Create `src/events/completion-mapper.ts`:

  ```ts
  import type { NotificationMessage, NotificationTarget } from "../types"

  const DEFAULT_TEMPLATE = "✅ Task Completed\nProject: {projectName}\nSession: {sessionTitle}"

  export function mapCompletionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
    const props = event?.properties ?? event ?? {}
    const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"
    const sessionTitle = typeof props.sessionTitle === "string" ? props.sessionTitle : "unknown"

    const text = (template || DEFAULT_TEMPLATE)
      .replace(/{projectName}/g, projectName)
      .replace(/{sessionTitle}/g, sessionTitle)

    return { text, target }
  }
  ```

  Run: `bun test tests/completion-mapper.test.ts`
  Expected: PASS

- [x] **Step 3: Commit**

  ```bash
  git add packages/opencode-lark-bridge/src/events/completion-mapper.ts
  git add packages/opencode-lark-bridge/tests/completion-mapper.test.ts
  git commit -m "feat(opencode-lark-bridge): add completion notification mapper"
  ```

---

### Task 3: Register session.idle hook in plugin entry

**Files:**
- Modify: `packages/opencode-lark-bridge/src/index.ts`
- Test: `packages/opencode-lark-bridge/tests/index.test.ts`

**Interfaces:**
- Consumes: `createEventHandler`
- Produces: returned hooks object includes `session.idle`

- [x] **Step 1: Write failing test for session.idle hook**

  Add to `tests/index.test.ts`:

  ```ts
  it("exposes session.idle hook", async () => {
    const plugin = await OpenCodeLarkBridge({ directory: tempProjectDir })
    expect(plugin["session.idle"]).toBeDefined()
    expect(typeof plugin["session.idle"]).toBe("function")
  })
  ```

  Run: `bun test tests/index.test.ts`
  Expected: FAIL

- [x] **Step 2: Register session.idle hook**

  Modify `src/index.ts`. Add to the returned object:

  ```ts
  return {
    event: async ({ event }: { event: any }) => {
      await handler.handle(event)
    },
    "permission.ask": async (input: any, _output: any) => { ... },
    "session.idle": async (input: any, _output: any) => {
      try {
        logger.debug("Received session.idle", { raw: JSON.stringify(input) })
      } catch {}
      await handler.handle(input)
    },
  }
  ```

  Also update the registered hooks log:

  ```ts
  logger.info("Plugin hooks registered", { hooks: ["event", "permission.ask", "session.idle"] })
  ```

  Run: `bun test tests/index.test.ts`
  Expected: PASS

- [x] **Step 3: Commit**

  ```bash
  git add packages/opencode-lark-bridge/src/index.ts
  git add packages/opencode-lark-bridge/tests/index.test.ts
  git commit -m "feat(opencode-lark-bridge): register session.idle hook"
  ```

---

### Task 4: Update example config and README

**Files:**
- Modify: `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc`
- Modify: `packages/opencode-lark-bridge/README.md`

**Interfaces:**
- Produces: documented `categories.completion` configuration

- [x] **Step 1: Update example config**

  Add inside `categories` in `opencode-lark-bridge.config.example.jsonc`:

  ```jsonc
  "completion": {
    "target": { "chat_id": "oc_xxxxxxxxxxxxxxxx" },
    "template": "✅ Task Completed\nProject: {projectName}\nSession: {sessionTitle}"
  }
  ```

- [x] **Step 2: Update README**

  Add a "任务完成通知" subsection under `## 功能` or `## 配置`. Include:

  - 监听 `session.idle` 事件
  - 通过 `session.created` 的 `parentID` 识别并过滤子代理
  - 配置项 `categories.completion.target` 和 `categories.completion.template`
  - 模板变量 `{projectName}` 和 `{sessionTitle}`

- [x] **Step 3: Commit**

  ```bash
  git add packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc
  git add packages/opencode-lark-bridge/README.md
  git commit -m "docs(opencode-lark-bridge): document completion notification category"
  ```

---

### Task 5: Final verification

**Files:**
- All files above

- [x] **Step 1: Run full test suite**

  ```bash
  cd packages/opencode-lark-bridge
  bun test
  ```
  Expected: all pass

- [x] **Step 2: Run TypeScript build**

  ```bash
  npm run build
  ```
  Expected: exit 0

- [x] **Step 3: Manual sanity check**

  Verify the example config renders the completion template with a mock event.

- [x] **Step 4: Commit any remaining tasks.md updates**

  Mark all tasks in `openspec/changes/task-completion-notification/tasks.md` as complete and commit.

  ```bash
  git add openspec/changes/task-completion-notification/tasks.md
  git commit -m "docs(task-completion-notification): mark all tasks complete"
  ```

---

## Spec Coverage Checklist

- [x] Requirement: 主会话完成时发送飞书通知 → Task 1, Task 2
- [x] Requirement: 完成通知内容可配置 → Task 2, Task 4
- [x] Scenario: 主会话完成 → Task 1 tests
- [x] Scenario: 子代理完成不通知 → Task 1 tests
- [x] Scenario: 同一主会话去重 → Task 1 tests
- [x] Scenario: 自定义完成通知模板 → Task 2 tests
- [x] Scenario: 使用默认完成通知模板 → Task 2 tests
- [x] Modified lark-notification scenario: 处理会话完成事件 → Task 1, Task 3
- [x] Modified lark-notification scenario: 过滤子代理完成事件 → Task 1
