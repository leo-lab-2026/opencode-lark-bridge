---
change: add-idle-timeout-notification
design-doc: docs/superpowers/specs/2026-08-05-idle-timeout-notification-design.md
base-ref: ab20190ce4cc41581280f0c7ea99a3dda0d68938
archived-with: 2026-08-05-add-idle-timeout-notification
---

# 会话停滞（Stall）通知实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 opencode-lark-bridge 新增会话停滞（stall）通知能力：通过事件驱动活动追踪 + 内存定时器扫描，对"距最后活动超过 `stall_timeout_ms`"的活跃会话发送飞书提醒，并按 `stall_interval_ms` 节流防刷屏。

**Architecture:** 在 `createEventHandler` 闭包内新增 `lastActive`/`stallLastSent`/`stallMeta` 三个内存表；`handle()` 入口统一提取 sessionID 调用 `touchActivity`（含子代理父链级联 touch），idle/error/deleted 分支清理追踪；`scanStalledSessions()` 导出由 `src/index.ts` 的 `setInterval` 定时调用，超时判定 + 节流后经新的 `stall-mapper.ts` 渲染模板发送。配置默认值采用分支内兜底（`?? 600_000`），与 retry-notification 先例一致，`loadConfig` 无需改动。

**Tech Stack:** TypeScript (strict) + Bun（ESM，`node:` 前缀导入，相对导入带 `.js` 扩展名）；测试框架 Bun test（`tests/*.test.ts`，与源码同名映射）。

## Global Constraints

- 运行时不改：Bun（非 Node.js），`"type": "module"` ESM
- `tsc` strict 零类型错误：`npm run build` 必须通过
- 导入规范：Node 内置用 `node:` 前缀；相对导入必须带 `.js` 扩展名
- 事件 hook 只读，不得修改 event 对象
- 状态必须内存内：`lastActive`/`stallLastSent`/`stallMeta` 不持久化、不跨进程
- 通知失败不得阻塞主流程：发送失败仅记日志，扫描继续
- 不得为子代理单独发 stall 通知；不得把 stall 会话写入 `erroredSessions`；不得动 `pendingChildren`
- 不改现有四类通知（permission/completion/question/error）与 retry 通知行为
- 默认值分支内兜底（`?? 600_000` / `?? 3_600_000` / `?? 60_000`），不预填 `categories`，`loadConfig` 不新增逻辑
- 避免 `console.log`，用 `createFileLogger`
- `getEffectiveTarget(config, "stall")` 复用现有回退逻辑，无需改动 `src/config.ts`

---

### Task 1: stall 配置类型与示例配置

对应 openspec tasks.md 1.1、1.2（验证面）、1.3。类型先行，是后续 Task 的编译基础。

**Files:**
- Modify: `src/types.ts:21-30`（`CategoryConfig` 接口）
- Modify: `tests/config.test.ts:32-49`（`getEffectiveTarget` describe 块）
- Modify: `opencode-lark-bridge.config.example.jsonc`

**Interfaces:**
- Consumes: 无（纯类型与配置面）
- Produces: `CategoryConfig` 新增三个可选字段 `stall_timeout_ms?`、`stall_interval_ms?`、`stall_check_interval_ms?`，供 Task 3/4/5 的 `config.categories.stall` 读取

- [x] **Step 1: 在 `src/types.ts` 的 `CategoryConfig` 中追加 stall 字段**

在 `retry_detail?: boolean` 之后追加（保留原有注释风格）：

```typescript
  retry_detail?: boolean               // retry 类别：是否包含 attempt/next 详情，默认 true
  // stall 类别专用
  stall_timeout_ms?: number            // 无进展超时阈值，默认 600_000（10 分钟）
  stall_interval_ms?: number           // 重复提醒节流窗口，默认 3_600_000（60 分钟）
  stall_check_interval_ms?: number     // 定时器扫描间隔，默认 60_000（1 分钟）
```

- [x] **Step 2: 在 `tests/config.test.ts` 的 `getEffectiveTarget` describe 块末尾追加两个用例**

```typescript
  it("falls back to default target for stall category when not configured", () => {
    expect(getEffectiveTarget(cfg, "stall").chat_id).toBe("default")
  })
  it("uses stall category target when configured", () => {
    const withStall = { ...cfg, categories: { ...cfg.categories, stall: { target: { chat_id: "oc_stall" } } } }
    expect(getEffectiveTarget(withStall, "stall").chat_id).toBe("oc_stall")
  })
```

- [x] **Step 3: 运行测试确认失败**

Run: `bun test tests/config.test.ts`
Expected: FAIL —— 现有 4 个用例通过，但新增用例 `expect(getEffectiveTarget(cfg, "stall")...)` 实际会通过（`getEffectiveTarget` 已通用），所以本步只确认无回归。真正"先红后绿"的 TDD 不适用于纯类型/通用函数验证，本 Task 以新增测试固化行为为准。

- [x] **Step 4: 更新示例配置 `opencode-lark-bridge.config.example.jsonc`**

在文件头注释的 `=== 重试通知模板变量（retry） ===` 块之后追加：

```jsonc
// === 停滞通知模板变量（stall） ===
//   {projectName}  项目名（未缓存时降级 unknown）
//   {sessionTitle} 会话标题（未缓存时降级 unknown）
//   {idleDuration} 无进展时长（如 "10 分钟"、"1 小时 30 分钟"）
```

在 `"retry"` 类别对象之后追加：

```jsonc
    "stall": {
      // "target": { "chat_id": "oc_xxxx" },  // 可选：未设置则用 default_target
      "template": "⚠️ OpenCode 会话停滞\nProject: {projectName}\nSession: {sessionTitle}\n无进展时长: {idleDuration}",
      // "stall_timeout_ms": 600000,        // 可选：无进展多久算停滞，默认 600000（10 分钟）
      // "stall_interval_ms": 3600000,      // 可选：同一会话重复提醒间隔，默认 3600000（60 分钟）
      // "stall_check_interval_ms": 60000   // 可选：定时器扫描间隔，默认 60000（1 分钟）
    }
```

- [x] **Step 5: 运行全量测试确认无回归**

Run: `bun test tests/config.test.ts`
Expected: PASS（新增 2 个用例 + 原有 4 个用例全绿）

- [x] **Step 6: Commit**

```bash
git add src/types.ts tests/config.test.ts opencode-lark-bridge.config.example.jsonc
git commit -m "feat: add stall category config types and example"
```

---

### Task 2: stall-mapper（模板渲染 + 时长格式化）

对应 openspec tasks.md 2.1、3.1。完全独立的纯函数模块，TDD 先行。

**Files:**
- Create: `src/events/stall-mapper.ts`
- Test: `tests/stall-mapper.test.ts`

**Interfaces:**
- Consumes: `NotificationTarget`/`NotificationMessage`（来自 `src/types.ts`）
- Produces:
  - `formatDuration(ms: number): string` —— 中文可读时长；`< 60s` → `"N 秒"`；`< 60min` → `"X 分钟"`（整分）或 `"X 分钟 Y 秒"`（Y>0）；`≥ 1h` → `"X 小时"`（整时）或 `"X 小时 Y 分钟"`（Y>0）
  - `mapStallEvent(meta: { projectName?: string; sessionTitle?: string; idleDuration: string }, target: NotificationTarget, template?: string): NotificationMessage` —— 占位符 `{projectName}`/`{sessionTitle}`/`{idleDuration}` 替换，缺失降级 `"unknown"`

- [x] **Step 1: 编写失败测试 `tests/stall-mapper.test.ts`**

```typescript
import { describe, it, expect } from "bun:test"
import { mapStallEvent, formatDuration } from "../src/events/stall-mapper"
import type { NotificationTarget } from "../src/types"

const target: NotificationTarget = { chat_id: "oc_test" }

describe("formatDuration", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatDuration(0)).toBe("0 秒")
    expect(formatDuration(45_000)).toBe("45 秒")
  })
  it("formats minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1 分钟")
    expect(formatDuration(90_000)).toBe("1 分钟 30 秒")
  })
  it("formats hours and minutes", () => {
    expect(formatDuration(5_400_000)).toBe("1 小时 30 分钟")
  })
  it("formats full hours without minutes suffix", () => {
    expect(formatDuration(3_600_000)).toBe("1 小时")
    expect(formatDuration(7_230_000)).toBe("2 小时")
  })
})

describe("mapStallEvent", () => {
  it("renders default template with all fields", () => {
    const msg = mapStallEvent(
      { projectName: "my-proj", sessionTitle: "Fix bug", idleDuration: "10 分钟" },
      target
    )
    expect(msg.text).toContain("⚠️ OpenCode 会话停滞")
    expect(msg.text).toContain("Project: my-proj")
    expect(msg.text).toContain("Session: Fix bug")
    expect(msg.text).toContain("无进展时长: 10 分钟")
    expect(msg.target).toEqual(target)
  })

  it("degrades missing fields to unknown", () => {
    const msg = mapStallEvent({ idleDuration: "1 小时" }, target)
    expect(msg.text).toContain("Project: unknown")
    expect(msg.text).toContain("Session: unknown")
  })

  it("degrades blank fields to unknown", () => {
    const msg = mapStallEvent({ projectName: "  ", sessionTitle: "", idleDuration: "3 秒" }, target)
    expect(msg.text).toContain("Project: unknown")
    expect(msg.text).toContain("Session: unknown")
  })

  it("uses custom template when provided", () => {
    const msg = mapStallEvent(
      { projectName: "p", sessionTitle: "s", idleDuration: "5 分钟" },
      target,
      "STALL {projectName} {sessionTitle} {idleDuration}"
    )
    expect(msg.text).toBe("STALL p s 5 分钟")
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/stall-mapper.test.ts`
Expected: FAIL —— 找不到模块 `../src/events/stall-mapper`（模块不存在）

- [x] **Step 3: 实现 `src/events/stall-mapper.ts`**

```typescript
import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode 会话停滞\nProject: {projectName}\nSession: {sessionTitle}\n无进展时长: {idleDuration}"

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours >= 1) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  }
  if (minutes >= 1) {
    return seconds > 0 ? `${minutes} 分钟 ${seconds} 秒` : `${minutes} 分钟`
  }
  return `${seconds} 秒`
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function mapStallEvent(
  meta: { projectName?: string; sessionTitle?: string; idleDuration: string },
  target: NotificationTarget,
  template?: string
): NotificationMessage {
  const projectName = nonEmpty(meta.projectName) ?? "unknown"
  const sessionTitle = nonEmpty(meta.sessionTitle) ?? "unknown"
  const idleDuration = nonEmpty(meta.idleDuration) ?? "unknown"
  const text = (template ?? DEFAULT_TEMPLATE)
    .replace(/{projectName}/g, projectName)
    .replace(/{sessionTitle}/g, sessionTitle)
    .replace(/{idleDuration}/g, idleDuration)
  return { text, target }
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `bun test tests/stall-mapper.test.ts`
Expected: PASS（4 + 4 个用例全绿）

- [x] **Step 5: Commit**

```bash
git add src/events/stall-mapper.ts tests/stall-mapper.test.ts
git commit -m "feat: add stall event mapper with duration formatting"
```

---

### Task 3: 活动追踪 + 扫描骨架（created 加入 / 事件 touch / 清理 / 级联 / 子代理跳过 / 超时发送）

对应 openspec tasks.md 2.2、2.3（骨架部分）、3.2（追踪部分）。`scanStalledSessions` 是追踪表的唯一观测点，因此本 Task 一并提供超时判定 + 发送的最小扫描实现；节流与失败容错在 Task 4 补全。

**Files:**
- Modify: `src/events/event-handler.ts`（import 区、闭包状态表、`trackSubagent` 之后新增辅助函数、`handle()` 入口与 idle/error 分支、`session.deleted` 新分支、返回对象）
- Test: `tests/event-handler.test.ts`（追加 stall 追踪用例）

**Interfaces:**
- Consumes: Task 2 的 `mapStallEvent`、`formatDuration`（`src/events/stall-mapper.js`）
- Produces: `createEventHandler` 返回对象新增 `scanStalledSessions(): Promise<void>`，供 Task 5 `src/index.ts` 定时器调用、供 Task 6 集成测试直接调用

- [x] **Step 1: 编写失败测试（追加到 `tests/event-handler.test.ts` 末尾）**

先在被追加用例上方新增辅助工厂（放在现有 `makeConfig` 之后）：

```typescript
function makeStallConfig(timeout_ms: number, interval_ms = 60_000): PluginConfig {
  return {
    ...makeConfig(100),
    categories: { stall: { stall_timeout_ms: timeout_ms, stall_interval_ms: interval_ms } }
  }
}
```

追加用例：

```typescript
describe("stall tracking", () => {
  const stallOnly = (sent: any[]) => sent.filter((s) => typeof s.text === "string" && s.text.includes("会话停滞"))

  it("tracks created session and sends stall notification after timeout", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "Long task" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    expect(stallOnly(sent)[0].text).toContain("Long task")
    expect(stallOnly(sent)[0].text).toContain("无进展时长")
  })

  it("resets stall timer on activity events", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 100))
    await handler.handle({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "busy" } } })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 100))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })

  it("retry event flow updates activity and does not trigger stall", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 100))
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "ses_1", status: { type: "retry", attempt: 1, message: "m" }, projectName: "P" },
    })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 100))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })

  it("clears tracking on session.idle", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("clears tracking on session.error", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.error", properties: { sessionID: "ses_1", error: { type: "T", message: "M" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("clears tracking on session.deleted", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.deleted", properties: { sessionID: "ses_1" } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(sent).toHaveLength(0)
  })

  it("does not notify for stalled subagent sessions", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_child", parentID: "ses_parent" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("cascades touch from subagent to parent session", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_parent", title: "Parent" } } })
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_child", parentID: "ses_parent" } } })
    await new Promise((r) => setTimeout(r, 80))
    await handler.handle({ type: "session.status", properties: { sessionID: "ses_child", status: { type: "busy" } } })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("stall notification does not pollute erroredSessions, completion still sent", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    const completion = sent.filter((s) => typeof s.text === "string" && s.text.includes("Task Completed"))
    expect(completion).toHaveLength(1)
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/event-handler.test.ts`
Expected: FAIL —— `handler.scanStalledSessions is not a function`（返回对象尚无该方法）

- [x] **Step 3: 实现活动追踪与扫描骨架**

3a. 在 `src/events/event-handler.ts` 的 import 区追加：

```typescript
import { mapStallEvent, formatDuration } from "./stall-mapper.js"
```

3b. 在闭包状态表区（`lastRetrySent` 之后）追加：

```typescript
  const lastActive = new Map<string, number>()
  const stallLastSent = new Map<string, number>()
  const stallMeta = new Map<string, { projectName?: string; sessionTitle?: string }>()
```

3c. 在 `trackSubagent` 函数之后、`isSubagent` 之前追加两个辅助函数：

```typescript
  function clearStallTracking(sessionID: string) {
    lastActive.delete(sessionID)
    stallLastSent.delete(sessionID)
    stallMeta.delete(sessionID)
  }

  function touchActivity(sessionID: string, event: any) {
    const now = Date.now()
    lastActive.set(sessionID, now)

    const props = (event?.properties ?? event) as Record<string, unknown>
    const info = props.info as Record<string, unknown> | undefined
    const title = info?.title ?? info?.sessionTitle ?? props.sessionTitle
    const projectName = props.projectName
    if (
      (typeof title === "string" && title.trim())
      || (typeof projectName === "string" && projectName.trim())
    ) {
      const prev = stallMeta.get(sessionID) ?? {}
      stallMeta.set(sessionID, {
        projectName: typeof projectName === "string" && projectName.trim() ? projectName.trim() : prev.projectName,
        sessionTitle: typeof title === "string" && title.trim() ? title.trim() : prev.sessionTitle,
      })
    }

    let current = sessionID
    const visited = new Set<string>()
    while (current && !visited.has(current)) {
      visited.add(current)
      const parentID = subagentParentMap.get(current)
      if (!parentID) break
      lastActive.set(parentID, now)
      current = parentID
    }
  }
```

3d. `handle()` 入口：在 `const eventType = event?.type ?? event?.name` 之后、`session.created` 分支之前插入统一 touch：

```typescript
      const props = (event?.properties ?? event) as Record<string, unknown>
      const entrySessionID = extractSessionID(props) ?? "unknown"
      if (entrySessionID !== "unknown") {
        touchActivity(entrySessionID, event)
      }
```

3e. 新增 `session.deleted` 轻量分支（放在 `session.created` 分支之后、`session.idle` 分支之前）：

```typescript
      if (eventType === "session.deleted") {
        const props = (event?.properties ?? event) as Record<string, unknown>
        const sessionID = extractSessionID(props) ?? "unknown"
        if (sessionID !== "unknown") {
          clearStallTracking(sessionID)
          logger.debug("Cleared stall tracking for deleted session", { sessionID })
        }
        return
      }
```

3f. `session.idle` 分支：在 `const sessionID = extractSessionID(props) ?? "unknown"` 之后追加清理调用：

```typescript
        if (sessionID !== "unknown") {
          clearStallTracking(sessionID)
        }
```

3g. `session.error` 分支：在 `const sessionID = extractSessionID(props) ?? "unknown"` 之后追加同样清理调用：

```typescript
        if (sessionID !== "unknown") {
          clearStallTracking(sessionID)
        }
```

3h. 在 `isSubagent` 函数之后、`return {` 之前追加扫描骨架（本 Task 版：超时判定 + 子代理跳过 + 发送；节流与失败容错由 Task 4 补全）：

```typescript
  async function scanStalledSessions() {
    const now = Date.now()
    const category = "stall"
    const categoryConfig = config.categories[category] || {}
    const timeout = categoryConfig.stall_timeout_ms ?? 600_000
    for (const [sessionID, lastActiveAt] of lastActive) {
      if (subagentSessionIds.has(sessionID)) continue
      if (now - lastActiveAt < timeout) continue
      const target = getEffectiveTarget(config, category)
      const meta = stallMeta.get(sessionID) ?? {}
      const idleDuration = formatDuration(now - lastActiveAt)
      const message = mapStallEvent({ ...meta, idleDuration }, target, categoryConfig.template)
      logger.info("Sending stall notification", { sessionID, text: message.text })
      await notifier.send(message)
    }
  }
```

3i. 返回对象追加 `scanStalledSessions`（`handle` 之后）：

```typescript
  return {
    async handle(event: any) {
      ...
    },
    scanStalledSessions,
  }
```

- [x] **Step 4: 运行测试确认通过**

Run: `bun test tests/event-handler.test.ts`
Expected: PASS（原有全部用例 + 新增 9 个 stall 追踪用例全绿）

- [x] **Step 5: Commit**

```bash
git add src/events/event-handler.ts tests/event-handler.test.ts
git commit -m "feat: track session activity and scan for stalled sessions"
```

---

### Task 4: 扫描完整化（节流 + 失败容错）

对应 openspec tasks.md 2.3（完整实现）、3.2（节流/容错部分）。

**Files:**
- Modify: `src/events/event-handler.ts`（`scanStalledSessions` 函数体）
- Test: `tests/event-handler.test.ts`（追加节流/容错用例）

**Interfaces:**
- Consumes: Task 3 的状态表 `lastActive`/`stallLastSent`/`stallMeta` 与 `scanStalledSessions` 骨架
- Produces: 完整版 `scanStalledSessions(): Promise<void>` —— 超时判定（`stall_timeout_ms ?? 600_000`）+ 节流（`stall_interval_ms ?? 3_600_000`，首次提醒写入 `stallLastSent`）+ 发送失败仅记日志不中断扫描

- [x] **Step 1: 编写失败测试（追加到 `tests/event-handler.test.ts` 的 `describe("stall tracking")` 块内）**

```typescript
  it("throttles repeated stall notifications within interval", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    await handler.scanStalledSessions()
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })

  it("re-sends after throttle interval elapses", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50, 50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(2)
  })

  it("throttles stall independently per session", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_a", title: "A" } } })
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_b", title: "B" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(2)
  })

  it("continues scanning when send fails", async () => {
    const sent: any[] = []
    const errors: string[] = []
    const logger: Logger = {
      info: () => {},
      debug: () => {},
      error: (msg: string) => { errors.push(msg) },
    }
    const notifier: Notifier = {
      send: async (m) => {
        if (m.text.includes("ses_a") || m.text.includes("A")) throw new Error("lark-cli failed")
        sent.push(m)
      },
    }
    const handler = createEventHandler(makeStallConfig(50), notifier, logger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_a", title: "A" } } })
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_b", title: "B" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    expect(stallOnly(sent)[0].text).toContain("B")
    expect(errors.some((e) => e.includes("Stall notification send failed"))).toBe(true)
  })

  it("uses categories.stall.target when configured", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { stall: { stall_timeout_ms: 50, stall_interval_ms: 60_000, target: { user_id: "ou_stall" } } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    expect(stallOnly(sent)[0].target.user_id).toBe("ou_stall")
  })
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/event-handler.test.ts`
Expected: FAIL —— "throttles repeated stall notifications within interval" 用例如预期连发 3 条（骨架无节流）；"continues scanning when send fails" 抛错导致用例失败（骨架无 try/catch）

- [x] **Step 3: 补全 `scanStalledSessions`**

将 Task 3 的骨架函数体整体替换为完整版：

```typescript
  async function scanStalledSessions() {
    const now = Date.now()
    const category = "stall"
    const categoryConfig = config.categories[category] || {}
    const timeout = categoryConfig.stall_timeout_ms ?? 600_000
    const interval = categoryConfig.stall_interval_ms ?? 3_600_000
    for (const [sessionID, lastActiveAt] of lastActive) {
      if (subagentSessionIds.has(sessionID)) continue
      if (now - lastActiveAt < timeout) continue
      const lastSent = stallLastSent.get(sessionID)
      if (lastSent && now - lastSent < interval) continue
      stallLastSent.set(sessionID, now)
      const target = getEffectiveTarget(config, category)
      const meta = stallMeta.get(sessionID) ?? {}
      const idleDuration = formatDuration(now - lastActiveAt)
      const message = mapStallEvent({ ...meta, idleDuration }, target, categoryConfig.template)
      logger.info("Sending stall notification", { sessionID, text: message.text })
      try {
        await notifier.send(message)
      } catch (err) {
        logger.error("Stall notification send failed", { sessionID, error: String(err) })
      }
    }
  }
```

- [x] **Step 4: 运行测试确认通过**

Run: `bun test tests/event-handler.test.ts`
Expected: PASS（原有用例 + Task 3 的 9 个 + 本 Task 5 个全绿）

- [x] **Step 5: Commit**

```bash
git add src/events/event-handler.ts tests/event-handler.test.ts
git commit -m "feat: throttle stall notifications and tolerate send failures"
```

---

### Task 5: index.ts 定时器接入

对应 openspec tasks.md 2.4、3.4。`setInterval` 按 `stall_check_interval_ms`（默认 60_000）调用 `handler.scanStalledSessions()`；定时器随进程生命周期，无需 `clearInterval`。

**Files:**
- Modify: `src/index.ts`（`handler` 创建之后）
- Test: `tests/index.test.ts`（新增 describe 块）

**Interfaces:**
- Consumes: Task 4 的 `handler.scanStalledSessions(): Promise<void>`；Task 1 的 `config.categories.stall?.stall_check_interval_ms`
- Produces: 插件启动即建立定时扫描循环

- [x] **Step 1: 编写失败测试（追加到 `tests/index.test.ts` 顶部 describe 之后）**

```typescript
describe("stall scan timer", () => {
  let tempDir: string
  let logFile: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "lark-stall-timer-"))
    mkdirSync(path.join(tempDir, ".opencode"), { recursive: true })
    logFile = path.join(tempDir, "plugin.log")
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeConfig(overrides: Record<string, unknown> = {}) {
    writeFileSync(
      path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
      JSON.stringify({
        app_id: "test-app",
        app_secret: "test-secret",
        default_target: { chat_id: "test-chat" },
        log_file: logFile,
        ...overrides,
      })
    )
  }

  it("creates timer with configured stall_check_interval_ms", async () => {
    writeConfig({ categories: { stall: { stall_check_interval_ms: 5_000 } } })
    const original = globalThis.setInterval
    const intervals: number[] = []
    globalThis.setInterval = ((_fn: () => void, ms?: number) => { intervals.push(ms ?? 0); return 0 as any }) as any
    try {
      await plugin({ directory: tempDir, worktree: tempDir } as any)
      expect(intervals).toContain(5_000)
    } finally {
      globalThis.setInterval = original
    }
  })

  it("creates timer with default interval when stall category unset", async () => {
    writeConfig()
    const original = globalThis.setInterval
    const intervals: number[] = []
    globalThis.setInterval = ((_fn: () => void, ms?: number) => { intervals.push(ms ?? 0); return 0 as any }) as any
    try {
      await plugin({ directory: tempDir, worktree: tempDir } as any)
      expect(intervals).toContain(60_000)
    } finally {
      globalThis.setInterval = original
    }
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/index.test.ts`
Expected: FAIL —— `intervals` 为空（`src/index.ts` 尚未创建定时器）

- [x] **Step 3: 在 `src/index.ts` 的 `const handler = createEventHandler(...)` 之后接入定时器**

```typescript
  const handler = createEventHandler(config, notifier, logger)

  const stallCheckMs = config.categories.stall?.stall_check_interval_ms ?? 60_000
  setInterval(() => { void handler.scanStalledSessions() }, stallCheckMs)
```

注意：无配置文件分支（`return { event: async () => {} }`）在 `createEventHandler` 之前，定时器只在配置有效时创建。

- [x] **Step 4: 运行测试确认通过**

Run: `bun test tests/index.test.ts`
Expected: PASS（原有用例 + 2 个定时器用例全绿）

- [x] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: schedule periodic stalled-session scan in plugin entry"
```

---

### Task 6: 集成测试（静默会话 → 端到端通知）

对应 openspec tasks.md 3.3。沿用 `tests/integration.test.ts` 现有模式（真实 `loadConfig` + `createFileLogger` + `createLarkNotifier` 捕获命令）。

**Files:**
- Modify: `tests/integration.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `handler.scanStalledSessions()`；`loadConfig`/`createFileLogger`/`createLarkNotifier` 现有导出

- [x] **Step 1: 追加集成测试用例（`end-to-end flow` describe 块内）**

```typescript
  it("sends stall notification end-to-end after silent timeout", async () => {
    const configPath = `${TEST_DIR}/config-stall.jsonc`
    await writeFile(configPath, JSON.stringify({
      app_id: "a", app_secret: "b",
      default_target: { chat_id: "oc_target" },
      debounce_ms: 0,
      log_file: `${TEST_DIR}/app-stall.log`,
      categories: { stall: { target: { chat_id: "oc_stall" }, stall_timeout_ms: 100, stall_interval_ms: 60_000 } },
    }))
    const config = loadConfig(configPath)
    const logger = createFileLogger(config.log_file)
    let calls = 0
    let command = ""
    const notifier = createLarkNotifier(logger, async (cmd) => { calls++; command = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    const handler = createEventHandler(config, notifier, logger)

    await handler.handle({
      type: "session.created",
      properties: { info: { id: "sess-stall-1", title: "Long silent task" }, projectName: "P" },
    })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()

    expect(calls).toBe(1)
    expect(command).toContain("oc_stall")
    expect(command).toContain("Long silent task")
  })
```

- [x] **Step 2: 运行测试确认通过**

Run: `bun test tests/integration.test.ts`
Expected: PASS（原有 2 个用例 + 新增 1 个全绿）

- [x] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: add end-to-end stall notification integration case"
```

---

### Task 7: README 文档

对应 openspec tasks.md 4.1。补齐 stall 通知说明、配置表、与 retry 分工、进程崩溃能力边界。

**Files:**
- Modify: `README.md`

- [x] **Step 1: 功能列表追加条目**

在 `README.md` 的功能列表（`## 功能`）末尾追加：

```markdown
- 监听会话活动，对无进展超过 `stall_timeout_ms`（默认 10 分钟）的会话发送停滞提醒（stall），并按 `stall_interval_ms`（默认 60 分钟）节流防刷屏；由内存定时器按 `stall_check_interval_ms`（默认 1 分钟）扫描
```

- [x] **Step 2: 配置表追加 stall 字段**

在 `### 开发期配置（可选）` 的字段表中、`categories.retry.retry_detail` 行之后追加：

```markdown
| `categories.stall.target` | 停滞通知目标 | `{ "chat_id": "oc_xxxx" }` |
| `categories.stall.template` | 停滞通知模板 | `⚠️ OpenCode 会话停滞\nProject: {projectName}\nSession: {sessionTitle}\n无进展时长: {idleDuration}` |
| `categories.stall.stall_timeout_ms` | 无进展多久算停滞 | `600000`（10 分钟） |
| `categories.stall.stall_interval_ms` | 同一会话重复提醒间隔 | `3600000`（60 分钟） |
| `categories.stall.stall_check_interval_ms` | 定时器扫描间隔 | `60000`（1 分钟） |
```

- [x] **Step 3: 在"重试通知"章节之后新增"停滞通知"章节**

```markdown
### 停滞通知

opencode 事件流是异步推送制：模型挂起、SSE 超时、网络黑洞等场景下，会话持续 busy 但不产生任何事件，纯事件驱动无法感知"没有事件发生"。插件维护会话活动追踪表，收到任意事件（含 `session.created`、`session.status`、消息增量等）都会刷新该会话的最后活动时间；子代理事件会级联刷新父会话。内存定时器按 `stall_check_interval_ms`（默认 1 分钟）扫描：距最后活动超过 `stall_timeout_ms`（默认 10 分钟）的活跃会话发送停滞提醒；同一会话提醒后 `stall_interval_ms`（默认 60 分钟）内不重复。会话 idle/error/deleted 时自动清理追踪。

配置项为 `categories.stall`。模板变量如下：

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `{projectName}` | 项目名（未缓存时降级 unknown） | `my-project` |
| `{sessionTitle}` | 会话标题（未缓存时降级 unknown） | `Fix login bug` |
| `{idleDuration}` | 无进展时长（中文可读） | `10 分钟` / `1 小时 30 分钟` |

与重试通知的分工：重试期间 `session.status`（retry）事件持续发布，属于"有活动"，不会触发停滞提醒；停滞通知仅覆盖完全静默的场景（无任何事件）。停滞提醒不会改变会话语义——恢复后 `session.idle` 仍正常发送完成通知。

> **能力边界**：停滞检测为插件进程内内存定时器，进程崩溃（如 OpenCode 崩溃）时插件随之消亡，无法自救发通知；子代理会话自身不单独提醒，其卡住由父会话超时覆盖。
```

- [x] **Step 4: 确认渲染**

Run: 人工阅读新增章节，确认表格列对齐、链接与既有文风一致（无命令可运行）。

- [x] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document stalled session notification feature"
```

---

### Task 8: 全量验证

对应 openspec tasks.md 4.2。最终 gate。

**Files:** 无（只运行验证）

- [x] **Step 1: 运行 tsc 构建**

Run: `npm run build`
Expected: PASS —— tsc strict 零错误，`dist/` 产物更新（`dist/events/stall-mapper.js` + `.d.ts` 存在）

- [x] **Step 2: 运行全量测试**

Run: `bun test`
Expected: PASS —— 全部测试文件绿（含新增 `tests/stall-mapper.test.ts`、扩展的 `tests/event-handler.test.ts`、`tests/index.test.ts`、`tests/integration.test.ts`、`tests/config.test.ts`）

- [x] **Step 3: 对照 openspec tasks.md 勾选全部任务**

在 `openspec/changes/add-idle-timeout-notification/tasks.md` 中勾选 1.1–4.2 全部 13 项。

- [x] **Step 4: Commit（如存在遗留文件）**

```bash
git add -A
git commit -m "chore: complete add-idle-timeout-notification tasks"
```

（若前序任务已全部提交且无遗留，跳过本步。）

---

## 任务 ↔ openspec tasks.md 对照表

| openspec tasks.md | 实施任务 |
| --- | --- |
| 1.1 类型 | Task 1 |
| 1.2 默认值/回退 | Task 1（按设计 §3.1 分支内兜底实现，`loadConfig` 不改；`getEffectiveTarget` stall 回退以测试固化） |
| 1.3 示例配置 | Task 1 |
| 2.1 stall-mapper | Task 2 |
| 2.2 活动追踪 | Task 3 |
| 2.3 scanStalledSessions | Task 3（骨架）+ Task 4（节流/容错） |
| 2.4 定时器 | Task 5 |
| 3.1 mapper 测试 | Task 2 |
| 3.2 handler 测试 | Task 3 + Task 4 |
| 3.3 集成测试 | Task 6 |
| 3.4 定时器测试 | Task 5 |
| 4.1 README | Task 7 |
| 4.2 build + test | Task 8 |
