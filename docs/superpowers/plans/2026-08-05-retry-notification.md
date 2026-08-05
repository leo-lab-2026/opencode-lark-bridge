---
change: add-retry-notification
design-doc: docs/superpowers/specs/2026-08-05-retry-notification-design.md
base-ref: 9ab5c8c3b9e400f01729d221427447eec552e293
---

# Retry Notification & Error Field Extraction Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 opencode-lark-bridge 插件新增 `session.status` retry 状态监听与飞书通知（配置化阈值、首次 + 定期提醒、子代理开关、内容详略开关），并修复 `error-mapper` 字段提取 bug（opencode 实际错误形状为 `{ name, data: { message, statusCode } }`，现状导致生产环境 Type/Message 恒为 "unknown"）。

**Architecture:** 在 event-handler 新增 `session.status` 分支（仅处理 `status.type === "retry"`），用独立的 `lastRetrySent` Map 做会话级节流；新增 `retry-mapper.ts` 提取 `message`/`attempt`/`next` 并渲染模板（北京时间格式化 `MM-DD HH:mm`，`retry_detail=false` 移除详情行）；`enhanceEvent` 对 `session.status` 注入 sessionID/projectName/sessionTitle；`error-mapper` 改为旧形状 `{type,message}` 优先、新形状 `{name,data}` 兜底、statusCode 附加显示。retry 分支不写 `erroredSessions`、不动 `pendingChildren`，429 恢复后 `session.idle` 仍发 completion。

**Tech Stack:** TypeScript (strict), Bun runtime, Bun test, comment-json (JSONC)

## Global Constraints

- TypeScript strict 零类型错误（`npm run build` 通过）
- ESM 相对导入必须带 `.js` 扩展名（源码）；测试导入不带扩展名（现有测试模式）
- 测试用 Bun test：`import { describe, it, expect } from "bun:test"`；单文件运行 `bun test tests/<file>.test.ts`
- 事件 hook 只读：enhanceEvent 返回新对象，不修改原 event
- 状态必须内存内：`lastRetrySent` 不持久化、不跨进程
- 通知失败不得阻塞主流程（notifier.send 内部已降级）
- 避免 console.log，用 createFileLogger
- 无 lint 工具：质量靠 tsc strict + 测试
- retry 分支不变量（设计文档 3.2）：不写入 `erroredSessions`；不动 `pendingChildren`；不改变 permission/error/completion 现有行为
- 配置默认值策略（设计文档 3.1）：**分支内兜底**（`?? 1` / `?? 900_000` 等），`loadConfig` 不预先填充 `categories`
- commit 用 conventional commits（feat/fix/test/docs/chore）

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/types.ts` | 修改 | `CategoryConfig` 增加 4 个 retry 配置字段 |
| `src/events/retry-mapper.ts` | 新建 | `mapRetryEvent`：提取 retry 信息渲染模板 |
| `src/events/error-mapper.ts` | 修改 | 修复字段提取（旧形状优先 + `{name, data}` 兜底 + statusCode 附加） |
| `src/events/event-handler.ts` | 修改 | `session.status` retry 分支 + `lastRetrySent` 节流 + 子代理开关 |
| `src/index.ts` | 修改 | `enhanceEvent` 对 `session.status` 注入上下文 |
| `opencode-lark-bridge.config.example.jsonc` | 修改 | `categories.retry` 注释化示例 |
| `README.md` | 修改 | retry 通知说明 + errorType statusCode 说明 |
| `tests/retry-mapper.test.ts` | 新建 | mapper 单元测试 |
| `tests/error-mapper.test.ts` | 修改 | 新形状提取用例 |
| `tests/event-handler.test.ts` | 修改 | retry 分支用例 + 实际形状 error 用例 |
| `tests/index.test.ts` | 修改 | enhanceEvent 注入 + 恢复场景 |
| `tests/integration.test.ts` | 修改 | 端到端 retry 链路 |
| `tests/config.test.ts` | 修改 | getEffectiveTarget retry 类别回退用例 |

任务顺序按依赖：类型/配置 → mapper → event-handler → index → 集成 → 文档 → 全量验证。覆盖 openspec tasks.md 全部 13 项（1.1–1.3, 2.1–2.5, 3.1–3.5, 4.1–4.2），对应关系见各任务标题括号标注。

---

### Task 1: 类型与配置声明（tasks 1.1, 1.2, 1.3）

**Files:**
- Modify: `src/types.ts`（`CategoryConfig`，当前 21-26 行）
- Modify: `tests/config.test.ts`（`getEffectiveTarget` describe 块，32-42 行）
- Modify: `opencode-lark-bridge.config.example.jsonc`（`categories` 块，47-72 行）

**Interfaces:**
- Consumes: 现有 `CategoryConfig`、`PluginConfig`（已存在）
- Produces: `CategoryConfig` 新增 4 个可选字段 `retry_threshold?: number`、`retry_interval_ms?: number`、`notify_subagent?: boolean`、`retry_detail?: boolean` — Task 4 的 event-handler 与 Task 2 的 mapper 读取

**设计决策（tasks 1.2 落地方式）：** 设计文档 3.1 明确"默认值策略：分支内兜底（`?? 1` / `?? 900_000` 等），不预先填充 `categories`，`loadConfig` 无需改动默认配置逻辑"。因此 `src/config.ts` **不需要改代码**：`getEffectiveTarget` 已按 category 泛化回退（现有实现 28-33 行），retry 类别自动生效。本任务用测试固化该行为；`retry_threshold`/`retry_interval_ms`/`notify_subagent`/`retry_detail` 的默认值兜底分别落在 Task 4（`?? 1`、`?? 900_000`、`!== true`）与 Task 2（`detail !== false`）。

- [x] **Step 1: 修改 `src/types.ts` 增加 retry 字段**

```typescript
export interface CategoryConfig {
  target?: NotificationTarget
  template?: string
  template_multiple?: string           // 多问题整体框架模板
  question_item_template?: string      // 多问题中每个问题项的模板
  retry_threshold?: number             // retry 类别：attempt 触发阈值，默认 1
  retry_interval_ms?: number           // retry 类别：重复提醒节流窗口，默认 900_000（15 分钟）
  notify_subagent?: boolean            // retry 类别：子代理重试是否通知，默认 false
  retry_detail?: boolean               // retry 类别：是否包含 attempt/next 详情，默认 true
}
```

- [x] **Step 2: 在 `tests/config.test.ts` 增加 retry 回退用例**

在 `describe("getEffectiveTarget")` 块末尾追加：

```typescript
  it("falls back to default target for retry category when not configured", () => {
    expect(getEffectiveTarget(cfg, "retry").chat_id).toBe("default")
  })
  it("uses retry category target when configured", () => {
    const withRetry = { ...cfg, categories: { ...cfg.categories, retry: { target: { chat_id: "oc_retry" } } } }
    expect(getEffectiveTarget(withRetry, "retry").chat_id).toBe("oc_retry")
  })
```

- [x] **Step 3: 运行测试确认现有实现已满足（该测试应为直接通过，证明泛化已覆盖 retry）**

Run: `bun test tests/config.test.ts`
Expected: 全部 PASS（此用例为回归护栏，无需新实现代码）

- [x] **Step 4: 修改示例配置 `opencode-lark-bridge.config.example.jsonc`**

在 `categories` 对象末尾（`"error"` 块之后）追加：

```jsonc
    "retry": {
      // "target": { "chat_id": "oc_xxxx" },  // 可选：未设置则用 default_target
      "template": "⚠️ OpenCode 重试中\nProject: {projectName}\nSession: {sessionTitle}\n原因: {message}\n尝试: {attempt} 次\n下次重试: {next}",
      // "retry_threshold": 1,          // 可选：attempt 达到该值才通知，默认 1（首次即通知）
      // "retry_interval_ms": 900000,   // 可选：同一会话重复提醒间隔，默认 900000（15 分钟）
      // "notify_subagent": false,      // 可选：子代理重试是否通知，默认 false
      // "retry_detail": true           // 可选：是否包含尝试次数与下次重试时间，默认 true
    }
```

并在文件头模板变量注释区（"错误通知模板变量"注释块之后）追加：

```jsonc
// === 重试通知模板变量（retry） ===
//   {projectName}  项目名
//   {sessionTitle} 会话标题（未缓存时回退会话 ID）
//   {message}      重试原因（如 "Provider is overloaded"）
//   {attempt}      当前尝试次数（缺失或 retry_detail=false 时为空）
//   {next}         下次重试时间，北京时间 MM-DD HH:mm（缺失或 retry_detail=false 时为空）
```

- [x] **Step 5: 运行全量测试确认无回归 + 构建通过**

Run: `bun test` 和 `npm run build`
Expected: 全部 PASS；tsc 零错误

- [x] **Step 6: Commit**

```bash
git add src/types.ts tests/config.test.ts opencode-lark-bridge.config.example.jsonc
git commit -m "feat: add retry category config fields to types and example config"
```

---

### Task 2: retry-mapper 新增（tasks 2.1, 3.1）

**Files:**
- Create: `src/events/retry-mapper.ts`
- Create: `tests/retry-mapper.test.ts`

**Interfaces:**
- Produces: `mapRetryEvent(event: any, target: NotificationTarget, template?: string, detail?: boolean): NotificationMessage` — Task 4 的 event-handler 导入并调用（第 4 参传 `categoryConfig.retry_detail`）
- Consumes: `NotificationMessage`、`NotificationTarget` from `../types`（已存在）

**实现要点（设计文档 3.3）：** 提取 `status.message`（缺失 → "unknown"）、`status.attempt`（非 number → ""）、`status.next`（非 number → ""）；`next` 用 `Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })` 格式化，**注意**：zh-CN locale 实际输出 `"06/15 23:06"`（`/` 分隔，已实测验证），需 `replaceAll("/", "-")` 归一为设计要求的 `MM-DD HH:mm`。`detail === false` 时：默认模板移除含 `{attempt}`/`{next}` 的行（设计文档"对应行变为空行"的落地：直接移除更干净），自定义模板按原样渲染、占位符替换为空。

- [x] **Step 1: 写失败测试 `tests/retry-mapper.test.ts`**

```typescript
import { describe, it, expect } from "bun:test"
import { mapRetryEvent } from "../src/events/retry-mapper"
import type { NotificationTarget } from "../src/types"

const target: NotificationTarget = { chat_id: "oc_test" }

// 固定时间戳：1750000000000 ms = 北京时间 2025-06-15 23:06
function retryEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "session.status",
    properties: {
      sessionID: "sess-123",
      status: { type: "retry", attempt: 3, message: "Provider is overloaded", next: 1750000000000 },
      projectName: "My Project",
      sessionTitle: "Fix login bug",
      ...overrides,
    },
  }
}

describe("mapRetryEvent", () => {
  it("extracts standard retry payload", () => {
    const result = mapRetryEvent(retryEvent(), target)
    expect(result.text).toContain("Provider is overloaded")
    expect(result.text).toContain("尝试: 3 次")
    expect(result.text).toContain("06-15 23:06")
    expect(result.text).toContain("My Project")
    expect(result.text).toContain("Fix login bug")
    expect(result.target).toEqual(target)
  })

  it("formats next timestamp in Beijing time MM-DD HH:mm", () => {
    const result = mapRetryEvent(retryEvent(), target)
    expect(result.text).toMatch(/\d{2}-\d{2} \d{2}:\d{2}/)
    expect(result.text).toContain("06-15 23:06")
  })

  it("degrades missing fields safely", () => {
    const result = mapRetryEvent({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry" } },
    }, target)
    expect(result.text).toContain("unknown")      // message 降级
    expect(result.text).toContain("尝试:  次")      // attempt 缺失 → 空
    expect(result.text).toContain("下次重试: ")     // next 缺失 → 空
  })

  it("omits detail lines when detail is false with default template", () => {
    const result = mapRetryEvent(retryEvent(), target, undefined, false)
    expect(result.text).toContain("Provider is overloaded")
    expect(result.text).not.toContain("尝试")
    expect(result.text).not.toContain("下次重试")
    expect(result.text).not.toContain("06-15")
  })

  it("replaces attempt/next placeholders with empty when detail false with custom template", () => {
    const result = mapRetryEvent(retryEvent(), target, "RETRY {message} [{attempt}] {next}", false)
    expect(result.text).toBe("RETRY Provider is overloaded [] ")
  })

  it("uses custom template when provided", () => {
    const result = mapRetryEvent(retryEvent(), target, "RETRY {message} {attempt} {next}")
    expect(result.text).toContain("RETRY Provider is overloaded 3 06-15 23:06")
  })

  it("supports {sessionID} placeholder", () => {
    const result = mapRetryEvent(retryEvent(), target, "SID {sessionID}")
    expect(result.text).toBe("SID sess-123")
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/retry-mapper.test.ts`
Expected: FAIL（`mapRetryEvent` 未定义 / 模块不存在）

- [x] **Step 3: 实现 `src/events/retry-mapper.ts`**

```typescript
import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode 重试中\nProject: {projectName}\nSession: {sessionTitle}\n原因: {message}\n尝试: {attempt} 次\n下次重试: {next}"

const NEXT_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

function formatNext(ts: number): string {
  try {
    // zh-CN 输出 "06/15 23:06"，归一为设计要求的 MM-DD HH:mm
    return NEXT_FORMATTER.format(new Date(ts)).replaceAll("/", "-")
  } catch {
    return ""
  }
}

export function mapRetryEvent(
  event: any,
  target: NotificationTarget,
  template?: string,
  detail?: boolean
): NotificationMessage {
  const props = (event?.properties ?? event) ?? {}
  const status = (props.status as Record<string, unknown> | undefined) ?? {}
  const sessionID = (typeof props.sessionID === "string" ? props.sessionID : undefined) ?? "unknown"
  const projectName = typeof props.projectName === "string" && props.projectName.trim() ? props.projectName : "unknown"
  const sessionTitle = typeof props.sessionTitle === "string" && props.sessionTitle.trim() ? props.sessionTitle : "unknown"
  const message = typeof status.message === "string" ? status.message : "unknown"
  const showDetail = detail !== false
  const attempt = showDetail && typeof status.attempt === "number" ? String(status.attempt) : ""
  const next = showDetail && typeof status.next === "number" ? formatNext(status.next) : ""

  let effective = template ?? DEFAULT_TEMPLATE
  if (!showDetail && !template) {
    effective = effective
      .split("\n")
      .filter((line) => !line.includes("{attempt}") && !line.includes("{next}"))
      .join("\n")
  }

  const text = effective
    .replace(/{projectName}/g, projectName)
    .replace(/{sessionTitle}/g, sessionTitle)
    .replace(/{sessionID}/g, sessionID)
    .replace(/{message}/g, message)
    .replace(/{attempt}/g, attempt)
    .replace(/{next}/g, next)

  return { text, target }
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `bun test tests/retry-mapper.test.ts`
Expected: 全部 PASS

- [x] **Step 5: Commit**

```bash
git add src/events/retry-mapper.ts tests/retry-mapper.test.ts
git commit -m "feat: add retry-mapper for session.status retry events"
```

---

### Task 3: error-mapper 字段提取修复（tasks 2.5, 3.5）

**Files:**
- Modify: `src/events/error-mapper.ts`（全文重写，当前 22 行）
- Modify: `tests/error-mapper.test.ts`（追加用例）
- Modify: `tests/event-handler.test.ts`（追加实际形状 error 用例）

**Interfaces:**
- Consumes: 现有 `mapErrorEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage` 签名不变（event-handler 调用处无需改动）
- Produces: 提取逻辑改为：`error.type`/`error.message` 旧形状优先 → `error.name`/`error.data.message` 兜底；`error.data.statusCode` 为 number 时附加 `(statusCode)`；模板新增 `{statusCode}` 占位符支持（默认模板不含该占位符，行为不变）

- [x] **Step 1: 在 `tests/error-mapper.test.ts` 追加失败测试**

在文件末尾追加：

```typescript
  it("extracts opencode namedError shape with statusCode appended", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "sess-123",
        error: { name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429, isRetryable: true } },
        projectName: "My Project",
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("APIError (429)")
    expect(result.text).toContain("429 Too Many Requests")
    expect(result.text).toContain("sess-123")
  })

  it("extracts namedError shape without statusCode", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { name: "ProviderAuthError", data: { message: "Invalid API key" } },
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("ProviderAuthError")
    expect(result.text).toContain("Invalid API key")
  })

  it("prefers legacy type/message over name/data when both present", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: {
          type: "LegacyType",
          message: "legacy message",
          name: "APIError",
          data: { message: "data message" },
        },
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("LegacyType")
    expect(result.text).toContain("legacy message")
    expect(result.text).not.toContain("APIError")
    expect(result.text).not.toContain("data message")
  })

  it("supports {statusCode} placeholder in custom template", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { name: "APIError", data: { message: "boom", statusCode: 500 } },
      },
    }
    const result = mapErrorEvent(event, target, "SC={statusCode} TYPE={errorType}")
    expect(result.text).toBe("SC=500 TYPE=APIError (500)")
  })
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/error-mapper.test.ts`
Expected: 新增 4 个用例 FAIL（现有 7 个用例 PASS）

- [x] **Step 3: 重写 `src/events/error-mapper.ts` 实现修复**

```typescript
import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}"

export function mapErrorEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const props = (event?.properties ?? event) as Record<string, unknown>
  const sessionID = (typeof props.sessionID === "string" ? props.sessionID : undefined)
    ?? (typeof props.id === "string" ? props.id : undefined)
    ?? "unknown"
  const error = props.error as Record<string, unknown> | undefined
  const errorData = (error?.data as Record<string, unknown> | undefined) ?? {}
  const rawType = typeof error?.type === "string" ? error.type
    : typeof error?.name === "string" ? error.name
    : "unknown"
  const errorMessage = typeof error?.message === "string" ? error.message
    : typeof errorData?.message === "string" ? errorData.message
    : "unknown"
  const statusCode = typeof errorData?.statusCode === "number" ? errorData.statusCode : undefined
  const errorType = statusCode !== undefined ? `${rawType} (${statusCode})` : rawType
  const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"

  const text = (template ?? DEFAULT_TEMPLATE)
    .replace(/{sessionID}/g, sessionID)
    .replace(/{errorType}/g, errorType)
    .replace(/{errorMessage}/g, errorMessage)
    .replace(/{projectName}/g, projectName)
    .replace(/{statusCode}/g, statusCode !== undefined ? String(statusCode) : "")

  return { text, target }
}
```

- [x] **Step 4: 在 `tests/event-handler.test.ts` 追加实际形状 error 用例（tasks 3.5 第二部分）**

在 `describe("EventHandler")` 块末尾追加：

```typescript
  it("sends error notification for opencode namedError shape", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429 } },
        projectName: "Proj",
      },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("APIError (429)")
    expect(sent[0].text).toContain("429 Too Many Requests")
  })
```

- [x] **Step 5: 运行相关测试确认通过且无回归**

Run: `bun test tests/error-mapper.test.ts tests/event-handler.test.ts`
Expected: 全部 PASS（现有旧形状用例不受影响）

- [x] **Step 6: Commit**

```bash
git add src/events/error-mapper.ts tests/error-mapper.test.ts tests/event-handler.test.ts
git commit -m "fix: extract error type/message from opencode namedError shape"
```

---

### Task 4: event-handler `session.status` retry 分支（tasks 2.2, 2.3, 3.2）

**Files:**
- Modify: `src/events/event-handler.ts`（导入 + 状态声明 + 分支插入）
- Modify: `tests/event-handler.test.ts`（追加 retry 用例）

**Interfaces:**
- Consumes: `mapRetryEvent(event, target, template?, detail?)`（Task 2）；`CategoryConfig.retry_threshold`/`retry_interval_ms`/`notify_subagent`（Task 1）
- Produces: `session.status` 分支行为（含 `lastRetrySent` Map 节流、子代理开关、不变量）— Task 5/6 的端到端测试依赖此行为

**分支插入位置（设计文档 3.2）：** `session.error` 分支之后（当前 161-191 行）、`permission.asked` 兜底检查（当前 193 行）之前。**不变量：** 不写 `erroredSessions`、不动 `pendingChildren`、不抛错。

- [x] **Step 1: 在 `tests/event-handler.test.ts` 追加失败测试**

在 `describe("EventHandler")` 块末尾追加：

```typescript
  it("sends retry notification on session.status retry at default threshold", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "Provider is overloaded", next: 1750000000000 }, projectName: "P", sessionTitle: "T" },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("Provider is overloaded")
    expect(sent[0].target).toEqual({ chat_id: "oc_1" })
  })

  it("skips retry notification below configured threshold", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_threshold: 3 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 2, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(0)
  })

  it("sends retry notification when attempt reaches configured threshold", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_threshold: 3 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 3, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
  })

  it("skips non-retry session.status types (busy/idle)", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.status", properties: { sessionID: "s1", status: { type: "busy" } } })
    await handler.handle({ type: "session.status", properties: { sessionID: "s1", status: { type: "idle" } } })
    expect(sent).toHaveLength(0)
  })

  it("skips safely when status is missing or malformed", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.status", properties: { sessionID: "s1" } })
    await handler.handle({ type: "session.status", properties: { sessionID: "s2", status: "retry" } })
    expect(sent).toHaveLength(0)
  })

  it("throttles repeated retries within interval window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_interval_ms: 60_000 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    const event = {
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 2, message: "m", next: 1750000000000 } },
    }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("sends again after throttle interval elapses", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_interval_ms: 50 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    const event = {
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 2, message: "m", next: 1750000000000 } },
    }
    await handler.handle(event)
    await new Promise((resolve) => setTimeout(resolve, 120))
    await handler.handle(event)
    expect(sent).toHaveLength(2)
  })

  it("throttles retry independently per session", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_interval_ms: 60_000 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    const mkEvent = (sessionID: string) => ({
      type: "session.status",
      properties: { sessionID, status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    await handler.handle(mkEvent("s1"))
    await handler.handle(mkEvent("s1"))
    await handler.handle(mkEvent("s2"))
    expect(sent).toHaveLength(2)
  })

  it("skips subagent retry notification by default", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "sub1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(0)
  })

  it("sends subagent retry notification when notify_subagent enabled", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { notify_subagent: true } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "sub1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
  })

  it("subagent retry does not remove child from pendingChildren", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { notify_subagent: true } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "sub1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
    await handler.handle({ type: "session.idle", properties: { sessionID: "parent1", projectName: "P", sessionTitle: "T" } })
    expect(sent).toHaveLength(1)
  })

  it("retry does not pollute erroredSessions and completion still sent", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
    await handler.handle({ type: "session.idle", properties: { sessionID: "s1", projectName: "P", sessionTitle: "T" } })
    expect(sent).toHaveLength(2)
    expect(sent[1].text).toContain("Task Completed")
  })

  it("uses categories.retry.target when configured", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { target: { user_id: "ou_retry" }, retry_detail: false } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].target.user_id).toBe("ou_retry")
    expect(sent[0].text).not.toContain("尝试")
  })
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/event-handler.test.ts`
Expected: 新增 retry 用例 FAIL（`session.status` 被忽略，`sent` 为空；现有用例 PASS）

- [x] **Step 3: 实现 `src/events/event-handler.ts` 修改**

修改 1 — 新增导入（第 5 行 `error-mapper` 导入之后）：

```typescript
import { mapRetryEvent } from "./retry-mapper.js"
```

修改 2 — 新增状态（第 13 行 `erroredSessions` 声明之后）：

```typescript
  const lastRetrySent = new Map<string, number>()
```

修改 3 — 在 `session.error` 分支之后（第 191 行 `return` 之后）、`if (eventType !== "permission.asked")`（第 193 行）之前插入：

```typescript
      if (eventType === "session.status") {
        logger.debug("Received session.status event", { eventType, event })
        const props = (event?.properties ?? event) as Record<string, unknown>
        const status = props.status
        if (!status || typeof status !== "object") {
          logger.debug("Skipping session.status without valid status object", { eventType })
          return
        }
        const statusRecord = status as Record<string, unknown>
        if (statusRecord.type !== "retry") {
          logger.debug("Skipping non-retry session.status", { statusType: statusRecord.type })
          return
        }
        const sessionID = extractSessionID(props) ?? "unknown"
        const category = "retry"
        const categoryConfig = config.categories[category] || {}

        if (isSubagent(event) && categoryConfig.notify_subagent !== true) {
          logger.debug("Skipping subagent retry notification", { sessionID })
          return
        }

        const attempt = typeof statusRecord.attempt === "number" ? statusRecord.attempt : 0
        const threshold = categoryConfig.retry_threshold ?? 1
        if (attempt < threshold) {
          logger.debug("Retry attempt below threshold", { sessionID, attempt, threshold })
          return
        }

        const key = `retry:${sessionID}`
        const now = Date.now()
        const interval = categoryConfig.retry_interval_ms ?? 900_000
        const last = lastRetrySent.get(key)
        if (last && now - last < interval) {
          logger.debug("Skipping retry notification within throttle window", { key })
          return
        }
        lastRetrySent.set(key, now)

        const target = getEffectiveTarget(config, category)
        const message = mapRetryEvent(event, target, categoryConfig.template, categoryConfig.retry_detail)
        logger.info("Sending retry notification", { target, text: message.text })
        await notifier.send(message)
        return
      }
```

- [x] **Step 4: 运行测试确认通过**

Run: `bun test tests/event-handler.test.ts`
Expected: 全部 PASS

- [x] **Step 5: Commit**

```bash
git add src/events/event-handler.ts tests/event-handler.test.ts
git commit -m "feat: notify session.status retry events with threshold and throttle"
```

---

### Task 5: enhanceEvent 对 `session.status` 注入上下文（tasks 2.4, 3.4）

**Files:**
- Modify: `src/index.ts`（`enhanceEvent` 内，当前 110-153 行）
- Modify: `tests/index.test.ts`（追加用例）

**Interfaces:**
- Consumes: `resolveSessionTitle`（src/index.ts 96-108 行，已存在）、`sessionTitles` 缓存、`projectName`（闭包变量）
- Produces: `enhanceEvent` 对 `type === "session.status"` 返回注入 `sessionID`/`projectName`/`sessionTitle` 的新事件对象 — 与 `session.idle` 分支同构（设计文档 3.4），注入的字段被 Task 2 的 mapper 消费

- [x] **Step 1: 在 `tests/index.test.ts` 追加失败测试**

在 `describe("deployed plugin config resolution")` 块末尾（最后一个 `it` 之后）追加：

```typescript
    it("injects sessionID/projectName/sessionTitle for session.status retry events", async () => {
      const projectDir = mkdtempSync(path.join(tmpdir(), "retry-project-"))
      mkdirSync(path.join(projectDir, ".opencode"), { recursive: true })
      const logFileForProject = path.join(projectDir, "plugin.log")

      writeFileSync(
        path.join(projectDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFileForProject,
          categories: { retry: { target: { chat_id: "oc_retry" } } },
        })
      )

      const hooks = await plugin({
        directory: projectDir,
        worktree: projectDir,
        project: { name: "Retry Project" },
      } as any)

      await hooks.event({
        event: {
          type: "session.created",
          properties: { info: { id: "ses_r1", title: "Fix retry" } },
        },
      })

      await hooks.event({
        event: {
          type: "session.status",
          properties: {
            sessionID: "ses_r1",
            status: { type: "retry", attempt: 1, message: "Provider is overloaded", next: 1750000000000 },
          },
        },
      })

      const logs = readFileSync(logFileForProject, "utf-8")
      expect(logs).toContain("Sending retry notification")
      expect(logs).toContain("Retry Project")
      expect(logs).toContain("Fix retry")

      rmSync(projectDir, { recursive: true, force: true })
    }, 10000)

    it("sends completion notification after retry recovery via event hook", async () => {
      const projectDir = mkdtempSync(path.join(tmpdir(), "retry-recover-"))
      mkdirSync(path.join(projectDir, ".opencode"), { recursive: true })
      const logFileForProject = path.join(projectDir, "plugin.log")

      writeFileSync(
        path.join(projectDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFileForProject,
          categories: { retry: { target: { chat_id: "oc_retry" } } },
        })
      )

      const hooks = await plugin({
        directory: projectDir,
        worktree: projectDir,
        project: { name: "Recover Project" },
      } as any)

      await hooks.event({
        event: {
          type: "session.status",
          properties: {
            sessionID: "ses_r2",
            status: { type: "retry", attempt: 1, message: "Provider is overloaded", next: 1750000000000 },
          },
        },
      })

      await hooks.event({
        event: {
          type: "session.idle",
          properties: { sessionID: "ses_r2" },
        },
      })

      const logs = readFileSync(logFileForProject, "utf-8")
      expect(logs).toContain("Sending retry notification")
      expect(logs).toContain("Sending completion notification")
      expect(logs).toContain("Recover Project")

      rmSync(projectDir, { recursive: true, force: true })
    }, 10000)
```

- [x] **Step 2: 运行测试确认失败**

Run: `bun test tests/index.test.ts`
Expected: 新增 2 个用例 FAIL（无 "Sending retry notification" 日志；现有用例 PASS）

- [x] **Step 3: 实现 `src/index.ts` 的 `enhanceEvent` 修改**

在 `type === "session.error"` 分支（当前 126-137 行）之后、`if (type !== "session.idle") return event`（当前 138 行）之前插入：

```typescript
    if (type === "session.status") {
      const props = event?.properties ?? event ?? {}
      const sessionID = props?.sessionID ?? props?.id ?? "unknown"
      return {
        ...event,
        properties: {
          ...props,
          sessionID,
          projectName: nonEmpty(props?.projectName) ?? projectName,
          sessionTitle: resolveSessionTitle(sessionID, event),
        },
      }
    }
```

- [x] **Step 4: 运行测试确认通过**

Run: `bun test tests/index.test.ts`
Expected: 全部 PASS

- [x] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: inject session context for session.status events"
```

---

### Task 6: 端到端集成测试（tasks 3.3）

**Files:**
- Modify: `tests/integration.test.ts`（追加用例）

**Interfaces:**
- Consumes: `loadConfig`、`createFileLogger`、`createLarkNotifier`、`createEventHandler`（均已存在，见现有测试 1-6 行的导入）
- Produces: 验证 `session.status(retry)` → `mapRetryEvent` → `notifier.send`（捕获 lark-cli 命令）的完整链路，含节流与恢复后 completion

- [x] **Step 1: 在 `tests/integration.test.ts` 追加测试**

在 `describe("end-to-end flow")` 块末尾追加：

```typescript
  it("sends retry notification end-to-end with throttle and recovery completion", async () => {
    const configPath = `${TEST_DIR}/config-retry.jsonc`
    await writeFile(configPath, JSON.stringify({
      app_id: "a", app_secret: "b",
      default_target: { chat_id: "oc_target" },
      debounce_ms: 0,
      log_file: `${TEST_DIR}/app-retry.log`,
      categories: { retry: { target: { chat_id: "oc_retry" }, retry_interval_ms: 60_000 } },
    }))
    const config = loadConfig(configPath)
    const logger = createFileLogger(config.log_file)
    let calls = 0
    let command = ""
    const notifier = createLarkNotifier(logger, async (cmd) => { calls++; command = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    const handler = createEventHandler(config, notifier, logger)

    const retryEvent = {
      type: "session.status",
      properties: {
        sessionID: "sess-1",
        status: { type: "retry", attempt: 1, message: "Provider is overloaded", next: 1750000000000 },
        projectName: "P",
        sessionTitle: "T",
      },
    }

    await handler.handle(retryEvent)
    expect(calls).toBe(1)
    expect(command).toContain("oc_retry")
    expect(command).toContain("Provider is overloaded")

    await handler.handle(retryEvent)
    expect(calls).toBe(1)

    await handler.handle({ type: "session.idle", properties: { sessionID: "sess-1", projectName: "P", sessionTitle: "T" } })
    expect(calls).toBe(2)
    expect(command).toContain("Task Completed")
  })
```

- [x] **Step 2: 运行测试确认通过**

Run: `bun test tests/integration.test.ts`
Expected: 全部 PASS（含既有 permission 用例）

- [x] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: cover retry notification end-to-end with throttle"
```

---

### Task 7: README 文档（tasks 4.1）

**Files:**
- Modify: `README.md`

- [x] **Step 1: 更新"功能"列表**

在 `## 功能` 列表中"错误通知"条目（第 9 行）之后追加：

```markdown
- 监听 OpenCode `session.status` 事件的重试状态（429 限流、额度耗尽、5xx 服务器错误等可重试错误），达到配置阈值后按节流窗口发送重试提醒；支持子代理开关（`notify_subagent`）与内容详略开关（`retry_detail`）
```

- [x] **Step 2: 更新配置项表格**

在配置表 `categories.error.template` 行（第 286 行）之后追加：

```markdown
| `categories.retry.target`          | 重试通知目标          | `{ "chat_id": "oc_xxxx" }`              |
| `categories.retry.template`        | 重试通知模板          | `⚠️ 重试中：{message}（第 {attempt} 次）`  |
| `categories.retry.retry_threshold` | attempt 触发阈值（达到才通知） | `1`（首次即通知）               |
| `categories.retry.retry_interval_ms` | 同一会话重复提醒间隔 | `900000`（15 分钟）                 |
| `categories.retry.notify_subagent` | 子代理重试是否通知      | `false`                                |
| `categories.retry.retry_detail`    | 是否包含尝试次数与下次重试时间 | `true`                          |
```

- [x] **Step 3: 新增"重试通知"小节（放在"错误通知"小节之后，约第 357 行模板表之后）**

```markdown
### 重试通知

插件监听 OpenCode `session.status` 事件中 `status.type === "retry"` 的状态（模型 API 返回 429 限流、额度耗尽、5xx 服务器错误等可重试错误时，opencode 会无限重试且不触发 `session.error`）。首次达到 `retry_threshold`（默认 1，即首次重试）立即发送通知；重试持续期间，同一会话最多每 `retry_interval_ms`（默认 15 分钟）提醒一次，避免通知轰炸。

与错误通知的边界：retry 通知仅在"重试进行中"发送，重试恢复（状态变回 busy/idle）后，会话的 `session.idle` 仍按 `categories.completion` 正常发送完成通知，且不会因曾发生重试而跳过（retry 不写入错误会话标记）。

子代理会话的重试默认不通知（`notify_subagent: false`），可配置开启；开启后按子代理自身 sessionID 独立节流。`retry_detail: false` 时通知不包含尝试次数与下次重试时间。

配置项为 `categories.retry`。模板变量如下：

| 变量            | 说明                                       | 示例              |
| --------------- | ------------------------------------------ | ----------------- |
| `{projectName}` | 项目名                                     | `my-project`      |
| `{sessionTitle}`| 会话标题（未缓存时回退会话 ID）              | `Fix login bug`   |
| `{message}`     | 重试原因                                   | `Provider is overloaded` |
| `{attempt}`     | 当前尝试次数（缺失或 `retry_detail=false` 时为空） | `3`         |
| `{next}`        | 下次重试时间（北京时间 `MM-DD HH:mm`，缺失或 `retry_detail=false` 时为空） | `06-15 23:06` |
```

- [x] **Step 4: 更新"错误通知"小节 `{errorType}` 说明**

将第 356 行 `{errorType}` 行的说明列更新为：

```markdown
| `{errorType}`    | 错误类型（opencode 实际形状下附加 HTTP 状态码，如 `APIError (429)`） | `ProviderError` |
```

- [x] **Step 5: 目视检查渲染效果**

Run: 无命令（markdown 静态检查）— 确认表格对齐、无遗漏占位符
Expected: 无

- [x] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document retry notification config and error type statusCode"
```

---

### Task 8: 全量验证（tasks 4.2）

**Files:**
- 无代码改动（本任务仅验证；所有改动已随 Task 1-7 提交）

- [x] **Step 1: 构建验证（tsc strict 零错误）**

Run: `npm run build`
Expected: 无错误、无警告输出（dist/ 产物更新）

- [x] **Step 2: 全量测试**

Run: `bun test`
Expected: 全部 PASS（含新增 retry-mapper / event-handler / index / integration 用例与全部既有用例）

- [x] **Step 3: 自查 spec 覆盖（对照增量 spec）**

逐条核对（应全部已实现）：

- retry-notification spec：监听与通知 / 非 retry 状态不通知 / status 缺失安全跳过 / 阈值配置 / 节流（首次、窗口内、超时、跨会话独立）/ 恢复不干扰 completion / retry 不污染 errored / 提取与模板渲染 / 缺失降级 / 自定义模板 / 上下文注入 / 子代理开关与不清理 pendingChildren / retry_detail 详略 — 由 Task 2、4、5 实现
- error-notification spec：`{name, data:{message, statusCode}}` 提取与 `(429)` 附加 / 无 statusCode 不附加 / 旧形状优先 / 缺失降级 — 由 Task 3 实现（缺失降级与自定义模板为既有用例，未改动）

- [x] **Step 4: 可选端到端验证（需真实凭证，不做则跳过）**

Run: `lark-cli auth status` 确认已登录，配置真实 `app_id`/`app_secret`/`default_target` 后触发一次 429 重试观察飞书消息（手动验证，不计入测试）

- [x] **Step 5: 收尾确认**

Run: `git status` 确认工作区干净；如 Task 8 过程发现任何问题，回到对应 Task 修复并重新验证
Expected: 工作区无未提交改动

---

## Self-Review 结论（写计划时已执行）

- **Spec 覆盖：** retry-notification 全部 6 个 Requirement 的 23 个场景与 error-notification 增量 7 个场景均有对应任务（见 Task 8 Step 3 核对表）；tasks.md 13 项全覆盖：1.1/1.2/1.3→Task 1，2.1/3.1→Task 2，2.5/3.5→Task 3，2.2/2.3/3.2→Task 4，2.4/3.4→Task 5，3.3→Task 6，4.1→Task 7，4.2→Task 8
- **占位符扫描：** 无 TBD/TODO；所有代码步骤含完整可粘贴代码
- **类型一致性：** `mapRetryEvent(event, target, template?, detail?)` 在 Task 2 定义、Task 4 以 `categoryConfig.retry_detail` 为第 4 参调用；`CategoryConfig` 字段名（`retry_threshold`/`retry_interval_ms`/`notify_subagent`/`retry_detail`）在 Task 1 定义、Task 4/2 读取，命名一致；`{statusCode}` 占位符在 Task 3 实现与测试中一致
