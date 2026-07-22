---
change: permission-notification-coverage
design-doc: docs/superpowers/specs/2026-07-08-permission-notification-coverage-design.md
base-ref: 714d88196b3f943a6e520751e16ccefc4607d9ba
archived-with: 2026-07-08-permission-notification-coverage
---

# Permission Notification Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 `opencode-lark-bridge` 的 `extractResource`，让权限申请通知覆盖 OpenCode 全部权限类型（`read` / `edit` / `glob` / `grep` / `bash` / `task` / `skill` / `lsp` / `webfetch` / `websearch` / `external_directory` / `doom_loop`），并让 `dedupeKey` 使用同一提取结果。

**Architecture:** 在 `permission-mapper.ts` 的 `extractResource` 顶部加入 tool-aware 分支（`webfetch` / `websearch` / `task` / `skill` / `external_directory` / `doom_loop`），命中后早退；未命中走原有 fallback chain。`extractResource` 改为 `export`，`event-handler.ts` 的 `dedupeKey` 改用同一函数以保证通知和去重 key 看到一致的资源。

**Tech Stack:** TypeScript 5.5+（strict）、Bun 测试运行器（`bun:test`）、`tsc` 编译。

## Global Constraints

- 包名：`opencode-lark-bridge`，源码根目录 `packages/opencode-lark-bridge/`
- 测试命令：`bun test`（从包目录运行）
- 构建命令：`npm run build`（等价于 `tsc`，从包目录运行）
- 模板变量契约保持不变：`{tool}` / `{operation}` / `{resource}`，所有新字段都填入 `{resource}`
- 既有 `bash` / `edit` / `read` / `glob` / `grep` / `lsp` 行为不变（继续走 fallback chain 即可）
- `bash` 不进入 `extractResource` 的 switch：`mapPermissionEvent` 中已通过 `commandParts.args` 短路
- 提取字段找不到时优雅降级为字符串 `"unknown"`，不抛错
- tsconfig 开启 `strict: true`，所有改动必须零类型错误
- 现有 4 个 `permission-mapper.test.ts` 用例和 3 个 `event-handler.test.ts` 用例必须继续通过
- 每个任务以 `git commit` 结尾；commit 消息遵循 repo 现有风格 `feat(opencode-lark-bridge): ...` / `test(opencode-lark-bridge): ...` / `docs(opencode-lark-bridge): ...`

archived-with: 2026-07-08-permission-notification-coverage
---

## File Structure

实施过程中涉及的所有文件：

| 文件 | 角色 | 任务 |
|---|---|---|
| `packages/opencode-lark-bridge/src/events/permission-mapper.ts` | 工具感知资源提取 + 模板渲染 | Task 1, 2, 3 |
| `packages/opencode-lark-bridge/src/events/event-handler.ts` | 去重 key 改用 `extractResource` | Task 4 |
| `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc` | 默认模板展示新变量 | Task 5 |
| `packages/opencode-lark-bridge/README.md` | 权限类型覆盖表 | Task 6 |
| `packages/opencode-lark-bridge/tests/permission-mapper.test.ts` | 6 个新类型用例 | Task 1, 2, 3 |
| `packages/opencode-lark-bridge/tests/event-handler.test.ts` | 2 个新去重用例 | Task 4 |

archived-with: 2026-07-08-permission-notification-coverage
---

### Task 1: TDD extractResource for webfetch + websearch

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/permission-mapper.ts:35-52`
- Modify: `packages/opencode-lark-bridge/tests/permission-mapper.test.ts:4-51`

**Interfaces:**
- Consumes: 既有 `extractResource(props: Record<string, unknown>): string`，既有 `mapPermissionEvent` 公共 API
- Produces: 扩展后的 `extractResource` —— 工具名为 `webfetch` 时优先返回 `args.url`，其次 `args.uri`；工具名为 `websearch` 时优先返回 `args.query`；以上分支不命中时 fallback chain 行为不变

- [ ] **Step 1: 在 `tests/permission-mapper.test.ts` 末尾追加两个失败用例**

在最后一个 `it(...)` 后追加：

```typescript
  it("extracts URL for webfetch permission", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "webfetch",
        args: { url: "https://example.com/api" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: https://example.com/api")
  })

  it("falls back from webfetch url to uri", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "webfetch",
        args: { uri: "https://example.com/v2" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: https://example.com/v2")
  })

  it("extracts query for websearch permission", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "websearch",
        args: { query: "lark cli auth" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: lark cli auth")
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 3 个新用例 FAIL；剩余 4 个既有用例 PASS

- [ ] **Step 3: 在 `permission-mapper.ts` 的 `extractResource` 顶部插入 tool-aware 分支**

把当前第 35-52 行的 `extractResource` 整体替换为：

```typescript
function extractResource(props: Record<string, unknown>): string {
  const tool = extractToolName(props?.tool)
  const metadata = props.metadata as Record<string, unknown> | undefined
  const args = (props.args ?? {}) as Record<string, unknown>

  // Tool-aware extraction (new permission types)
  if (tool === "webfetch") {
    if (typeof args.url === "string") return args.url
    if (typeof args.uri === "string") return args.uri
  }
  if (tool === "websearch") {
    if (typeof args.query === "string") return args.query
  }

  // Existing fallback chain
  if (typeof metadata?.filepath === "string") {
    return metadata.filepath
  }
  if (typeof args.filePath === "string") {
    return args.filePath
  }
  const commandParts = extractCommandParts(props)
  if (commandParts) {
    return commandParts.args || commandParts.command
  }
  if (Array.isArray(props.patterns) && props.patterns.length > 0) {
    return props.patterns.join(", ")
  }
  return "unknown"
}
```

- [ ] **Step 4: 重新运行测试确认通过**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 7 个用例全部 PASS

- [ ] **Step 5: Commit**

```bash
cd packages/opencode-lark-bridge
git add src/events/permission-mapper.ts tests/permission-mapper.test.ts
git commit -m "feat(opencode-lark-bridge): extract webfetch URL and websearch query"
```

archived-with: 2026-07-08-permission-notification-coverage
---

### Task 2: TDD extractResource for task + skill

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/permission-mapper.ts:35-67`
- Modify: `packages/opencode-lark-bridge/tests/permission-mapper.test.ts`

**Interfaces:**
- Consumes: Task 1 完成的 `extractResource`
- Produces: 工具名为 `task` 时优先 `args.type`，其次 `args.agent`；工具名为 `skill` 时优先 `args.name`，其次 `args.skill`

- [ ] **Step 1: 在 `tests/permission-mapper.test.ts` 末尾追加两个失败用例**

```typescript
  it("extracts task subagent type", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "task",
        args: { type: "explore" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: explore")
  })

  it("falls back from task type to agent", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "task",
        args: { agent: "librarian" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: librarian")
  })

  it("extracts skill name", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "skill",
        args: { name: "git-master" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: git-master")
  })

  it("falls back from skill name to skill field", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "skill",
        args: { skill: "test-driven-development" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: test-driven-development")
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 4 个新用例 FAIL；前 7 个 PASS

- [ ] **Step 3: 在 `extractResource` 中追加 `task` / `skill` 分支**

在 Task 1 插入的 `websearch` 分支之后追加：

```typescript
  if (tool === "task") {
    if (typeof args.type === "string") return args.type
    if (typeof args.agent === "string") return args.agent
  }
  if (tool === "skill") {
    if (typeof args.name === "string") return args.name
    if (typeof args.skill === "string") return args.skill
  }
```

- [ ] **Step 4: 重新运行测试确认通过**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 11 个用例全部 PASS

- [ ] **Step 5: Commit**

```bash
cd packages/opencode-lark-bridge
git add src/events/permission-mapper.ts tests/permission-mapper.test.ts
git commit -m "feat(opencode-lark-bridge): extract task subagent and skill name"
```

archived-with: 2026-07-08-permission-notification-coverage
---

### Task 3: TDD extractResource for external_directory + doom_loop

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/permission-mapper.ts:35-79`
- Modify: `packages/opencode-lark-bridge/tests/permission-mapper.test.ts`

**Interfaces:**
- Consumes: Task 2 完成的 `extractResource`
- Produces: 工具名为 `external_directory` 时优先 `args.path`，其次 `args.directory`；工具名为 `doom_loop` 时组合 `args.tool` 和 `args.input`（任一缺失时只取存在的那个），格式为 `"<tool>: <input>"` 或单独一个字段值

- [ ] **Step 1: 在 `tests/permission-mapper.test.ts` 末尾追加三个失败用例**

```typescript
  it("extracts external_directory path", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "external_directory",
        args: { path: "/tmp/external" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: /tmp/external")
  })

  it("falls back from external_directory path to directory", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "external_directory",
        args: { directory: "/var/log" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: /var/log")
  })

  it("extracts doom_loop tool and input", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "doom_loop",
        args: { tool: "bash", input: "rm -rf /tmp/cache" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("bash")
    expect(msg.text).toContain("rm -rf /tmp/cache")
    expect(msg.text).toContain("Target: bash: rm -rf /tmp/cache")
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 3 个新用例 FAIL；前 11 个 PASS

- [ ] **Step 3: 在 `extractResource` 中追加 `external_directory` / `doom_loop` 分支**

在 Task 2 插入的 `skill` 分支之后追加：

```typescript
  if (tool === "external_directory") {
    if (typeof args.path === "string") return args.path
    if (typeof args.directory === "string") return args.directory
  }
  if (tool === "doom_loop") {
    const innerTool = args.tool
    const input = args.input
    if (typeof innerTool === "string" && typeof input === "string") {
      return `${innerTool}: ${input}`
    }
    if (typeof innerTool === "string") return innerTool
    if (typeof input === "string") return input
  }
```

- [ ] **Step 4: 重新运行测试确认通过**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 14 个用例全部 PASS

- [ ] **Step 5: Commit**

```bash
cd packages/opencode-lark-bridge
git add src/events/permission-mapper.ts tests/permission-mapper.test.ts
git commit -m "feat(opencode-lark-bridge): extract external_directory path and doom_loop context"
```

archived-with: 2026-07-08-permission-notification-coverage
---

### Task 4: TDD dedupeKey uses shared resource extraction

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/permission-mapper.ts:35`（加 `export`）
- Modify: `packages/opencode-lark-bridge/src/events/event-handler.ts:1-14`
- Modify: `packages/opencode-lark-bridge/tests/event-handler.test.ts`

**Interfaces:**
- Consumes: 既有 `extractResource`（已扩展），`createEventHandler` 公共 API
- Produces: `extractResource` 改为 named export；`dedupeKey` 改为调用 `extractResource`，保证 `webfetch:https://a.com` 与 `webfetch:https://b.com` 是不同 key，相同 URL 则被去重

- [ ] **Step 1: 在 `tests/event-handler.test.ts` 末尾追加两个失败用例**

```typescript
  it("dedupes webfetch events with the same URL", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = { type: "permission.asked", properties: { tool: "webfetch", args: { url: "https://example.com/api" } } }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("does not dedupe webfetch events with different URLs", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event1 = { type: "permission.asked", properties: { tool: "webfetch", args: { url: "https://a.example.com" } } }
    const event2 = { type: "permission.asked", properties: { tool: "webfetch", args: { url: "https://b.example.com" } } }
    await handler.handle(event1)
    await handler.handle(event2)
    expect(sent).toHaveLength(2)
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/event-handler.test.ts`
Expected: 2 个新用例 FAIL；前 3 个既有用例 PASS

- [ ] **Step 3: 在 `permission-mapper.ts` 把 `extractResource` 改为 named export**

把第 35 行：

```typescript
function extractResource(props: Record<string, unknown>): string {
```

改为：

```typescript
export function extractResource(props: Record<string, unknown>): string {
```

- [ ] **Step 4: 改写 `event-handler.ts` 让 `dedupeKey` 复用 `extractResource`**

把整个 `event-handler.ts` 替换为：

```typescript
import type { PluginConfig, Notifier, Logger } from "../types"
import { mapPermissionEvent, extractResource } from "./permission-mapper.js"
import { getEffectiveTarget } from "../config.js"

export function createEventHandler(config: PluginConfig, notifier: Notifier, logger: Logger) {
  const lastSent = new Map<string, number>()

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

  return {
    async handle(event: any) {
      const eventType = event?.type ?? event?.name
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

说明：tool 名解析复刻 `permission-mapper.ts` 的 `extractToolName` 行为但不直接调用（保持模块职责最小耦合）；`resource` 走 `extractResource`，与通知渲染共享逻辑。

- [ ] **Step 5: 重新运行 `event-handler` 与 `permission-mapper` 测试**

Run: `bun test tests/event-handler.test.ts tests/permission-mapper.test.ts`
Expected: 5 + 14 = 19 个用例全部 PASS

- [ ] **Step 6: 运行 TypeScript 编译验证类型**

Run: `npm run build`
Expected: 无输出，exit code 0

- [ ] **Step 7: Commit**

```bash
cd packages/opencode-lark-bridge
git add src/events/permission-mapper.ts src/events/event-handler.ts tests/event-handler.test.ts
git commit -m "refactor(opencode-lark-bridge): dedupe key uses shared extractResource"
```

archived-with: 2026-07-08-permission-notification-coverage
---

### Task 5: Update example config to demonstrate new resource descriptors

**Files:**
- Modify: `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc`

**Interfaces:**
- Consumes: 既有 `categories.permission` 字段结构
- Produces: 默认 `template` 中显式列出所有变量与一个示例渲染注释（放在模板上方 JSONC 注释中）

- [ ] **Step 1: 替换示例模板并加上注释**

把整个文件替换为：

```jsonc
// 将本文件复制为 opencode-lark-bridge.config.jsonc 并填入真实凭证
//
// 权限通知模板变量：
//   {tool}      工具名（bash / edit / read / glob / grep / task / skill / lsp /
//              webfetch / websearch / external_directory / doom_loop）
//   {operation} 操作类型（permission 名或 command 起始词）
//   {resource}  资源描述：
//                - bash:        命令参数
//                - read/edit:   文件路径
//                - glob/grep:   匹配模式
//                - webfetch:    URL 或 URI
//                - websearch:   搜索查询词
//                - task:        子代理类型
//                - skill:       技能名
//                - external_directory: 外部路径
//                - doom_loop:   "<innerTool>: <input>"
{
  "app_id": "cli_xxxxxxxxxxxxxxxx",
  "app_secret": "xxxxxxxxxxxxxxxx",
  "default_target": {
    "chat_id": "oc_xxxxxxxxxxxxxxxx"
  },
  "debounce_ms": 3000,
  "log_file": "./logs/opencode-lark-bridge.log",
  "categories": {
    "permission": {
      "target": { "chat_id": "oc_xxxxxxxxxxxxxxxx" },
      "template": "🔔 OpenCode Permission Request\nTool: {tool}\nOperation: {operation}\nTarget: {resource}"
    }
  }
}
```

- [ ] **Step 2: 校验 JSONC 合法（Node 解析）**

Run: `node -e "const s=require('fs').readFileSync('opencode-lark-bridge.config.example.jsonc','utf8'); const c=require('comment-json'); JSON.stringify(c.parse(s))"`
Expected: 输出一行 JSON 字符串（无异常）

- [ ] **Step 3: 跑一次完整测试确保没有连带回归**

Run: `bun test`
Expected: 36 个用例全部 PASS（34 + Task 1-4 新增的 14 个新测试中 2 个 event-handler；4 + 14 = 18 个 mapper 测试...实际计 36 包括既有 34 减去没动的）

实际数字核对：原 34 个 → Task 1 加 3、Task 2 加 4、Task 3 加 3、Task 4 加 2 = 34 + 12 = 46 个。如果数字不符，跑一次 `bun test` 看实际计数。

- [ ] **Step 4: Commit**

```bash
cd packages/opencode-lark-bridge
git add opencode-lark-bridge.config.example.jsonc
git commit -m "docs(opencode-lark-bridge): document resource variables in example config"
```

archived-with: 2026-07-08-permission-notification-coverage
---

### Task 6: Update README permission notification section

**Files:**
- Modify: `packages/opencode-lark-bridge/README.md`

**Interfaces:**
- Consumes: 既有 README 表格与"配置文件示例"章节
- Produces: 权限通知章节追加"已覆盖的权限类型"表，列出每种类型的 `{resource}` 取值来源

- [ ] **Step 1: 在 README "配置" 章节的 `categories.permission.template` 表格后面插入"权限类型覆盖"小节**

定位当前 README 中"`categories.permission.template` | 权限通知模板"那一行后，追加如下内容（保留原表格与下文）：

```markdown

### 权限类型覆盖

`{tool}` / `{operation}` / `{resource}` 三个模板变量对所有 OpenCode 权限类型都生效。`{resource}` 的取值规则：

| 权限类型 | `{resource}` 提取字段 | 示例 |
| --- | --- | --- |
| `bash` | `args.command` 的参数部分 | `-f /tmp/foo.txt` |
| `read` / `edit` | `metadata.filepath` → `args.filePath` | `/home/project/a.md` |
| `glob` / `grep` | `args.patterns[0]` 或命令参数 | `**/*.ts` |
| `webfetch` | `args.url` → `args.uri` | `https://example.com/api` |
| `websearch` | `args.query` | `lark cli auth` |
| `task` | `args.type` → `args.agent` | `explore` |
| `skill` | `args.name` → `args.skill` | `git-master` |
| `external_directory` | `args.path` → `args.directory` | `/tmp/external` |
| `doom_loop` | `args.tool` + `args.input` | `bash: rm -rf /tmp/cache` |
| `lsp` | 走 fallback chain（`metadata.filepath` 等） | 视 LSP 请求而定 |

字段找不到时 `{resource}` 优雅降级为字符串 `unknown`，不会抛错。
```

- [ ] **Step 2: 用 markdownlint 或简单 grep 校验表格列对齐（可选）**

Run: `grep -c "^| " README.md`
Expected: 至少 7（原有 `app_id` 等 6 行 + 权限类型表表头 1 行 = 7；视实际行数变化可能更高）

- [ ] **Step 3: Commit**

```bash
cd packages/opencode-lark-bridge
git add README.md
git commit -m "docs(opencode-lark-bridge): list covered permission types in README"
```

archived-with: 2026-07-08-permission-notification-coverage
---

### Task 7: Full verification

**Files:** (no code changes; verification only)

- [ ] **Step 1: 运行完整测试套件**

Run: `bun test`
Expected: 全部测试 PASS；记录实际通过 / 失败 / expect() 调用数

- [ ] **Step 2: 运行 TypeScript 编译**

Run: `npm run build`
Expected: 无输出，exit code 0；`dist/events/permission-mapper.js` 和 `dist/events/event-handler.js` 已更新

- [ ] **Step 3: 用 Node 跑一次手动渲染验证示例输出**

Run:

```bash
node --input-type=module -e '
import { mapPermissionEvent } from "./dist/events/permission-mapper.js"
const cases = [
  { name: "webfetch",  props: { type: "permission.asked", properties: { tool: "webfetch", args: { url: "https://example.com" } } } },
  { name: "websearch", props: { type: "permission.asked", properties: { tool: "websearch", args: { query: "lark auth" } } } },
  { name: "task",      props: { type: "permission.asked", properties: { tool: "task", args: { type: "explore" } } } },
  { name: "skill",     props: { type: "permission.asked", properties: { tool: "skill", args: { name: "git-master" } } } },
  { name: "ext_dir",   props: { type: "permission.asked", properties: { tool: "external_directory", args: { path: "/tmp/x" } } } },
  { name: "doom_loop", props: { type: "permission.asked", properties: { tool: "doom_loop", args: { tool: "bash", input: "rm -rf /tmp/cache" } } } },
  { name: "bash(keep)",props: { type: "permission.asked", properties: { tool: "bash", args: { command: "rm -f /tmp/foo.txt" } } } },
]
for (const c of cases) {
  console.log("--- " + c.name + " ---")
  console.log(mapPermissionEvent(c.props, { chat_id: "oc_1" }).text)
}
'
```

Expected: 7 段输出，每段 `Target:` 行对应：
- `webfetch`  → `https://example.com`
- `websearch` → `lark auth`
- `task`      → `explore`
- `skill`     → `git-master`
- `ext_dir`   → `/tmp/x`
- `doom_loop` → `bash: rm -rf /tmp/cache`
- `bash(keep)`→ `-f /tmp/foo.txt`（回归保护：原行为不变）

- [ ] **Step 4: 收集最终证据**

把 Step 1 的测试计数和 Step 2 的 build 退出码记录下来，作为完成证明。

如果出现 FAIL：
- 回到对应 Task 检查 TDD 步骤
- 不得删测试以让 CI 变绿
- 修复后重新跑该 Task 末尾的验证命令

- [ ] **Step 5: 最终 commit（如有遗漏）**

```bash
cd packages/opencode-lark-bridge
git status
```

如果有未提交的改动（例如 Step 3 留下的临时脚本——确认 `node -e` 没有写入文件，不应产生改动），按实际产物 commit。如果没有未提交改动，跳过此步。

archived-with: 2026-07-08-permission-notification-coverage
---

## Self-Review Checklist

实施完成后，按以下清单逐项核验：

- [ ] Task 1-3 的 11 个新 `permission-mapper` 用例全部 PASS
- [ ] Task 4 的 2 个新 `event-handler` 用例全部 PASS
- [ ] 既有 7 个测试用例（4 mapper + 3 handler）继续 PASS
- [ ] `npm run build` 零错误
- [ ] 7 个手动渲染输出与 Step 3 期望一致
- [ ] 示例配置和 README 的资源表覆盖所有 12 个权限类型
- [ ] 7 个 commit 按时间顺序出现在 `git log`

archived-with: 2026-07-08-permission-notification-coverage
---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-permission-notification-coverage.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
