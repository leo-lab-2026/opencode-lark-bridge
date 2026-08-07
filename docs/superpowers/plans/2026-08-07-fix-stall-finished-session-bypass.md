---
change: fix-stall-finished-session-bypass
design-doc: docs/superpowers/specs/2026-08-07-fix-stall-finished-session-bypass-design.md
base-ref: e0aae06ee0b13d7f9f00143d0f66d4185cc88615
---

# 修复已完成会话被非活动事件重新激活停滞跟踪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `event-handler.ts` 中的 `isLifecycleEvent` blocklist 替换为 `isActivityEvent` allowlist，阻止 `permission.updated`、`message.removed` 等非活动事件在会话完成后误删 `finishedSessions` 防护并重新激活停滞跟踪。

**Architecture:** 新增 `isActivityEvent` 闭包函数（仅 `permission.asked`、`question.asked`、`session.status` busy 返回 true），替换入口逻辑中的 `!isLifecycleEvent(event)` 判断为 `isActivityEvent(event)`，删除 `isLifecycleEvent` 函数及两行临时调试日志。活跃（未完成）会话的 `touchActivity` 行为不变（else 分支不受影响）。

**Tech Stack:** TypeScript (strict), Bun runtime, Bun test

## Global Constraints

- TypeScript strict 零类型错误（`npm run build` 通过）
- ESM 相对导入必须带 `.js` 扩展名（源码）；测试导入不带扩展名（现有模式）
- 测试用 Bun test：`import { describe, it, expect } from "bun:test"`；单文件运行 `bun test tests/event-handler.test.ts`
- 事件 hook 只读，不得修改 event 对象
- 状态必须内存内：`finishedSessions`/`lastActive` 不持久化、不跨进程
- 通知失败不得阻塞主流程
- 避免 console.log，用 createFileLogger
- 无 lint 工具：质量靠 tsc strict + 测试
- commit 用 conventional commits（feat/fix/test/chore）
- `isActivityEvent`/`isLifecycleEvent` 均为 `createEventHandler` 内闭包，不导出，通过 `handle()` 行为测试

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/events/event-handler.ts` | 修改 | 新增 `isActivityEvent`；替换入口逻辑；删除 `isLifecycleEvent`；移除 DEBUG 日志 |
| `tests/event-handler.test.ts` | 修改 | 新增 4 个测试用例（2 个 bug 验证 + 2 个回归），现有 2 个测试覆盖 tasks 2.1/2.4 |

tasks.md 覆盖映射：
- 1.1–1.4 → Task 2
- 2.1（session.updated 不重新激活）→ 已存在于 `tests/event-handler.test.ts:721`，回归覆盖
- 2.4（session.status busy 重新激活）→ 已存在于 `tests/event-handler.test.ts:757`，回归覆盖
- 2.2, 2.3, 2.5, 2.6 → Task 1（2.5）+ Task 3（2.2, 2.3, 2.6）
- 3.1–3.3 → Task 4

---

### Task 1: 编写失败测试验证 Bug 存在（tasks 2.5）

**Files:**
- Modify: `tests/event-handler.test.ts`（在 `stall tracking` describe 块末尾，当前约第 924 行 `})` 之前追加）

**Interfaces:**
- Consumes: `createEventHandler`、`makeStallConfig`、`stallOnly` 辅助函数（已存在于测试文件）
- Produces: 2 个失败测试，验证 `permission.updated` 和 `message.removed` 事件在会话完成后错误重新激活停滞跟踪

**Context:** 当前 `isLifecycleEvent` blocklist 不包含 `permission.updated`、`message.removed` 等事件类型。这些事件命中 `!isLifecycleEvent` 为 true 的分支，执行 `finishedSessions.delete()` 删除防护并 `touchActivity`，导致会话重新进入 `lastActive`，200 秒后误发停滞通知。

- [x] **Step 1: 编写 `permission.updated` 失败测试**

在 `tests/event-handler.test.ts` 的 `describe("stall tracking", ...)` 块内、最后一个 `it(...)` 之后追加：

```typescript
  it("permission.updated trailing session.idle does not re-activate stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({ type: "permission.updated", properties: { sessionID: "ses_1" } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })
```

- [x] **Step 2: 编写 `message.removed` 失败测试**

紧接上一个测试之后追加：

```typescript
  it("message.removed trailing session.idle does not re-activate stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({ type: "message.removed", properties: { sessionID: "ses_1" } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })
```

- [x] **Step 3: 运行新增测试，验证它们失败（确认 Bug 存在）**

Run: `bun test tests/event-handler.test.ts --test-name-pattern "permission.updated trailing session.idle|message.removed trailing session.idle"`

Expected: 2 个测试 FAIL。`permission.updated` / `message.removed` 不在 `isLifecycleEvent` blocklist 中 → `!isLifecycleEvent` 为 true → `finishedSessions.delete` + `touchActivity` → `scanStalledSessions` 发送停滞通知 → `stallOnly(sent)` 长度为 1 ≠ 0。

> 若测试通过（PASS），说明 Bug 已被修复或测试有误，需排查后再继续。

---

### Task 2: 实现 isActivityEvent allowlist 替换（tasks 1.1, 1.2, 1.3, 1.4）

**Files:**
- Modify: `src/events/event-handler.ts`（`isLifecycleEvent` 当前 22-36 行；入口逻辑当前 185-197 行）

**Interfaces:**
- Consumes: 无（首个实现任务）
- Produces: `isActivityEvent(event: any): boolean` 闭包函数；修改后的 `handle()` 入口逻辑

- [x] **Step 1: 新增 `isActivityEvent` 函数（tasks 1.1）**

在 `src/events/event-handler.ts` 中，将 `isLifecycleEvent` 函数（第 22-36 行）替换为 `isActivityEvent`：

删除：
```typescript
  function isLifecycleEvent(event: any): boolean {
    const eventType = event?.type ?? event?.name
    if (
      eventType === "session.created"
      || eventType === "session.updated"
      || eventType === "session.deleted"
      || eventType === "session.idle"
      || eventType === "session.error"
    ) return true
    if (eventType === "session.status") {
      const status = (event?.properties ?? event)?.status
      return typeof status === "object" && status?.type === "idle"
    }
    return false
  }
```

替换为：
```typescript
  function isActivityEvent(event: any): boolean {
    const eventType = event?.type ?? event?.name
    if (eventType === "permission.asked" || eventType === "question.asked") {
      return true
    }
    if (eventType === "session.status") {
      const status = (event?.properties ?? event)?.status
      return typeof status === "object" && status?.type === "busy"
    }
    return false
  }
```

- [x] **Step 2: 修改入口逻辑 + 移除调试日志（tasks 1.2, 1.4）**

在 `src/events/event-handler.ts` 的 `handle()` 方法中，将入口逻辑（当前第 185-197 行）：

```typescript
      if (entrySessionID !== "unknown") {
        if (finishedSessions.has(entrySessionID)) {
          const lifecycle = isLifecycleEvent(event)
          logger.debug("DEBUG: event for finished session", { sessionID: entrySessionID, eventType, isLifecycle: lifecycle })
          if (!lifecycle) {
            logger.debug("DEBUG: re-activating finished session via non-lifecycle event", { sessionID: entrySessionID, eventType })
            finishedSessions.delete(entrySessionID)
            touchActivity(entrySessionID, event)
          }
        } else {
          touchActivity(entrySessionID, event)
        }
      }
```

替换为：
```typescript
      if (entrySessionID !== "unknown") {
        if (finishedSessions.has(entrySessionID)) {
          if (isActivityEvent(event)) {
            finishedSessions.delete(entrySessionID)
            touchActivity(entrySessionID, event)
          }
        } else {
          touchActivity(entrySessionID, event)
        }
      }
```

- [x] **Step 3: 运行 Task 1 的失败测试，验证它们现在通过**

Run: `bun test tests/event-handler.test.ts --test-name-pattern "permission.updated trailing session.idle|message.removed trailing session.idle"`

Expected: 2 个测试 PASS。`isActivityEvent` 对 `permission.updated` / `message.removed` 返回 false → 不执行 `finishedSessions.delete` + `touchActivity` → `lastActive` 不含该 sessionID → `scanStalledSessions` 不发送 → `stallOnly(sent)` 长度为 0。

- [x] **Step 4: 运行全量测试，验证无回归（tasks 3.1 部分）**

Run: `bun test`

Expected: 全部 PASS。重点关注 `stall tracking` describe 块中以下既有测试：
- `session.updated trailing session.idle does not re-activate stall tracking`（第 721 行）：`session.updated` 不在 allowlist → 不重新激活 ✓
- `session.status idle trailing session.idle does not re-activate stall tracking`（第 733 行）：`session.status` idle 不在 allowlist → 不重新激活 ✓
- `session.created trailing session.idle does not re-activate stall tracking`（第 745 行）：`session.created` 不在 allowlist → 不重新激活 ✓
- `activity after session.idle re-activates stall tracking`（第 757 行）：`session.status` busy 在 allowlist → 重新激活 ✓

- [x] **Step 5: 提交**

```bash
git add src/events/event-handler.ts tests/event-handler.test.ts
git commit -m "fix: replace isLifecycleEvent blocklist with isActivityEvent allowlist

Non-activity events (permission.updated, message.removed, etc.) were
bypassing the finishedSessions guard via the blocklist's open default,
re-activating stall tracking and causing false stall notifications.

Switch to an allowlist that only re-activates on genuine activity signals:
permission.asked, question.asked, and session.status busy.

Remove temporary DEBUG logs."
```

---

### Task 3: 补充回归测试（tasks 2.2, 2.3, 2.6）

**Files:**
- Modify: `tests/event-handler.test.ts`（在 `stall tracking` describe 块内追加）

**Interfaces:**
- Consumes: `isActivityEvent` allowlist（Task 2 产物）、`createEventHandler`、`makeStallConfig`、`stallOnly`
- Produces: 3 个回归测试，验证 allowlist 中的活动事件正确重新激活、活跃会话不受影响

- [ ] **Step 1: 编写 `permission.asked` 重新激活测试（tasks 2.2）**

在 `tests/event-handler.test.ts` 的 `describe("stall tracking", ...)` 块内、`message.removed` 测试之后追加：

```typescript
  it("permission.asked after session.idle re-activates stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({ type: "permission.asked", properties: { sessionID: "ses_1", tool: "bash", args: { command: "rm x" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })
```

- [ ] **Step 2: 编写 `question.asked` 重新激活测试（tasks 2.3）**

紧接上一个测试之后追加：

```typescript
  it("question.asked after session.idle re-activates stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({
      type: "question.asked",
      properties: { sessionID: "ses_1", id: "q1", projectName: "P", questions: [{ question: "Q?", header: "H", options: [] }] }
    })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })
```

- [ ] **Step 3: 编写活跃会话回归测试（tasks 2.6）**

紧接上一个测试之后追加：

```typescript
  it("active session tracks activity on non-activity events (regression)", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 80))
    await handler.handle({ type: "message.removed", properties: { sessionID: "ses_1" } })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 100))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })
```

- [ ] **Step 4: 运行全量测试，验证全部通过（tasks 3.1）**

Run: `bun test`

Expected: 全部 PASS，包含新增 5 个测试（2 个 bug 验证 + 3 个回归）+ 既有全部测试。新增测试总数确认：`stall tracking` describe 块内原有测试数 + 5。

- [ ] **Step 5: 提交**

```bash
git add tests/event-handler.test.ts
git commit -m "test: add regression tests for isActivityEvent allowlist

- permission.asked/question.asked re-activate finished sessions
- message.removed on active session still touches activity
- permission.updated/message.removed do NOT re-activate finished sessions"
```

---

### Task 4: 编译与安装验证（tasks 3.2, 3.3）

**Files:**
- 无文件修改

- [ ] **Step 1: TypeScript 编译验证（tasks 3.2）**

Run: `npm run build`

Expected: 零错误，`dist/` 目录更新。`isActivityEvent` 使用 `any` 参数类型，符合现有 `isLifecycleEvent` 的类型风格，strict 模式无额外报错。

- [ ] **Step 2: 全量测试最终确认（tasks 3.1 最终）**

Run: `bun test`

Expected: 全部 PASS。

- [ ] **Step 3: 安装插件到本地（tasks 3.3）**

Run: `npm run install:local`

Expected: 构建 + 复制到 `.opencode/plugins/opencode-lark-bridge/` + 配置种子成功。

- [ ] **Step 4: 端到端验证（tasks 3.3，手动）**

触发一次 opencode 会话完成（如执行一个简单任务并等待 `session.idle`），观察插件日志文件：

```bash
# 日志路径取决于配置的 log_file，默认在插件目录下
# 观察 session.idle 后是否出现误发的 "Sending stall notification"
```

Expected:
- `session.idle` 后不再出现 `Sending stall notification`（除非用户真正恢复操作并发送 `permission.asked`/`question.asked`/`session.status busy`）
- 不再出现 `DEBUG:` 前缀的日志行

> 此步骤为手动验证，无法自动化。若日志确认无误发，可标记完成。

---

## Self-Review

### 1. Spec coverage

| 设计文档/ tasks.md 条目 | 覆盖任务 | 状态 |
|---|---|---|
| 1.1 新增 `isActivityEvent` 函数 | Task 2 Step 1 | ✓ |
| 1.2 修改入口逻辑 `isLifecycleEvent` → `isActivityEvent` | Task 2 Step 2 | ✓ |
| 1.3 删除 `isLifecycleEvent` 函数 | Task 2 Step 1（替换式删除） | ✓ |
| 1.4 移除临时调试日志 | Task 2 Step 2 | ✓ |
| 2.1 session.updated 不重新激活测试 | 已存在于 `tests/event-handler.test.ts:721` | ✓ 既有 |
| 2.2 permission.asked 重新激活测试 | Task 3 Step 1 | ✓ |
| 2.3 question.asked 重新激活测试 | Task 3 Step 2 | ✓ |
| 2.4 session.status busy 重新激活测试 | 已存在于 `tests/event-handler.test.ts:757` | ✓ 既有 |
| 2.5 未知事件类型不重新激活测试 | Task 1 Step 1-2 | ✓ |
| 2.6 活跃会话 touchActivity 回归测试 | Task 3 Step 3 | ✓ |
| 3.1 `bun test` 全量通过 | Task 2 Step 4 + Task 3 Step 4 + Task 4 Step 2 | ✓ |
| 3.2 `npm run build` 编译通过 | Task 4 Step 1 | ✓ |
| 3.3 `npm run install:local` + 端到端 | Task 4 Step 3-4 | ✓ |

### 2. Placeholder scan

无 TBD/TODO/"implement later"/"similar to Task N"。所有步骤包含具体代码或命令。

### 3. Type consistency

- `isActivityEvent(event: any): boolean` — 签名与设计文档一致
- 入口逻辑中 `isActivityEvent(event)` 调用参数为 `handle(event: any)` 的 `event`，类型匹配
- `isLifecycleEvent` 被完全删除，无残留引用（仅入口逻辑第 187 行引用，已在 Step 2 中替换）
