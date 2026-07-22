# opencode-lark-bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an OpenCode local plugin that forwards `permission.asked` events to a Lark chat/user via `lark-cli`, using a standalone JSONC config and file-based logging.

**Architecture:** TypeScript plugin split into focused modules: `config`, `logger`, `types`, `notifier/lark-notifier`, `events/event-handler`, `events/permission-mapper`, and `index`. Events are mapped to messages, rendered with templates, deduplicated by milliseconds, and sent asynchronously through Lark CLI without blocking OpenCode.

**Tech Stack:** TypeScript, Bun runtime/test runner, `@opencode-ai/plugin`, `comment-json`.

## Global Constraints

- Plugin source lives under `packages/opencode-lark-bridge/`.
- Runtime config file is `packages/opencode-lark-bridge/opencode-lark-bridge.config.jsonc`, excluded from git.
- No terminal output: all logs write to a configurable log file.
- Project-level install copies compiled `dist/` to `.opencode/plugins/opencode-lark-bridge/` without touching `opencode.json`.
- `lark-cli` is invoked as bot identity; failures are logged, never thrown in the hot path.
- Debounce window is configured in milliseconds.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `packages/opencode-lark-bridge/package.json`
- Create: `packages/opencode-lark-bridge/tsconfig.json`
- Create: `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc`
- Create: `packages/opencode-lark-bridge/.gitignore` (local plugin-level ignores)
- Modify: root `.gitignore`

**Interfaces:**
- Produces: package scripts `build`, `test`, `install:local`; TypeScript target `ESNext`/`NodeNext`.

- [x] **Step 1: Create `package.json`**

```json
{
  "name": "opencode-lark-bridge",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "bun test",
    "install:local": "npm run build && rm -rf ../../.opencode/plugins/opencode-lark-bridge && mkdir -p ../../.opencode/plugins/opencode-lark-bridge && cp -r dist/* ../../.opencode/plugins/opencode-lark-bridge/ && cp opencode-lark-bridge.config.example.jsonc ../../.opencode/plugins/opencode-lark-bridge/"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.17.7",
    "comment-json": "^4.2.3"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [x] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [x] **Step 3: Create example config**

```jsonc
// 将本文件复制为 opencode-lark-bridge.config.jsonc 并填入真实凭证
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
      "template": "🔔 OpenCode 权限申请\\n工具：{tool}\\n操作：{operation}\\n目标：{resource}"
    }
  }
}
```

- [x] **Step 4: Update root `.gitignore`**

Add:
```
packages/opencode-lark-bridge/opencode-lark-bridge.config.jsonc
packages/opencode-lark-bridge/logs/
packages/opencode-lark-bridge/dist/
.opencode/plugins/opencode-lark-bridge/
```

- [x] **Step 5: Install dependencies**

Run: `cd packages/opencode-lark-bridge && bun install`
Expected: `node_modules/` created locally.

- [x] **Step 6: Commit**

```bash
git add packages/opencode-lark-bridge/package.json packages/opencode-lark-bridge/tsconfig.json packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc .gitignore
git commit -m "chore: scaffold opencode-lark-bridge package"
```

---

### Task 2: Shared Types

**Files:**
- Create: `packages/opencode-lark-bridge/src/types.ts`

**Interfaces:**
- Produces: `NotificationMessage`, `NotificationTarget`, `PluginConfig`, `CategoryConfig`, `Notifier`, `Logger`.

- [x] **Step 1: Write `src/types.ts`**

```typescript
export interface NotificationTarget {
  chat_id?: string
  user_id?: string
}

export interface NotificationMessage {
  text: string
  target: NotificationTarget
}

export interface Notifier {
  send(message: NotificationMessage): Promise<void>
}

export interface Logger {
  info(message: string, extra?: Record<string, unknown>): void
  debug(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
}

export interface CategoryConfig {
  target?: NotificationTarget
  template?: string
}

export interface PluginConfig {
  app_id: string
  app_secret: string
  default_target: NotificationTarget
  debounce_ms: number
  log_file: string
  categories: Record<string, CategoryConfig>
}
```

- [x] **Step 2: Commit**

---

### Task 3: File Logger

**Files:**
- Create: `packages/opencode-lark-bridge/src/logger.ts`
- Create: `packages/opencode-lark-bridge/tests/logger.test.ts`

**Interfaces:**
- Consumes: `Logger` from `types.ts`.
- Produces: `createFileLogger(logFile: string): Logger`.

- [x] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, rm, readFile } from "node:fs/promises"
import { createFileLogger } from "../src/logger"

const TEST_LOG_DIR = "tests/fixtures/logs"
const TEST_LOG_FILE = `${TEST_LOG_DIR}/test.log`

describe("FileLogger", () => {
  beforeEach(async () => {
    await mkdir(TEST_LOG_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_LOG_DIR, { recursive: true, force: true })
  })

  it("writes info message to file", async () => {
    const logger = createFileLogger(TEST_LOG_FILE)
    logger.info("hello")
    const content = await readFile(TEST_LOG_FILE, "utf-8")
    expect(content).toContain("hello")
  })

  it("does not write to stdout", () => {
    const logger = createFileLogger(TEST_LOG_FILE)
    // implementation must avoid console.log
    logger.info("should not print")
    expect(true).toBe(true)
  })
})
```

- [x] **Step 2: Run test, expect FAIL**

Run: `cd packages/opencode-lark-bridge && bun test tests/logger.test.ts`
Expected: `error: Cannot find module "../src/logger"`.

- [x] **Step 3: Implement `src/logger.ts`**

```typescript
import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { Logger } from "./types"

function formatLine(level: string, message: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const payload = extra ? ` ${JSON.stringify(extra)}` : ""
  return `${ts} [${level}] ${message}${payload}\n`
}

export function createFileLogger(logFile: string): Logger {
  function write(level: string, message: string, extra?: Record<string, unknown>) {
    try {
      mkdirSync(dirname(logFile), { recursive: true })
      appendFileSync(logFile, formatLine(level, message, extra))
    } catch {
      // silent degrade
    }
  }

  return {
    info: (message, extra) => write("INFO", message, extra),
    debug: (message, extra) => write("DEBUG", message, extra),
    error: (message, extra) => write("ERROR", message, extra),
  }
}
```

- [x] **Step 4: Run test, expect PASS**

Run: `cd packages/opencode-lark-bridge && bun test tests/logger.test.ts`
Expected: 2 passing.

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/logger.ts packages/opencode-lark-bridge/tests/logger.test.ts
git commit -m "feat: add file logger"
```

---

### Task 4: JSONC Config Loader

**Files:**
- Create: `packages/opencode-lark-bridge/src/config.ts`
- Create: `packages/opencode-lark-bridge/tests/config.test.ts`

**Interfaces:**
- Consumes: `PluginConfig`, `NotificationTarget` from `types.ts`.
- Produces: `loadConfig(path: string): PluginConfig`, `getEffectiveTarget(config, category?): NotificationTarget`.

- [x] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { loadConfig, getEffectiveTarget } from "../src/config"

const TEST_DIR = "tests/fixtures/config"

describe("loadConfig", () => {
  beforeEach(async () => await mkdir(TEST_DIR, { recursive: true }))
  afterEach(async () => await rm(TEST_DIR, { recursive: true, force: true }))

  it("parses JSONC with comments", async () => {
    const path = `${TEST_DIR}/valid.jsonc`
    await writeFile(path, `{
      // app credentials
      "app_id": "a",
      "app_secret": "b",
      "default_target": { "chat_id": "c" }
    }`)
    const cfg = loadConfig(path)
    expect(cfg.app_id).toBe("a")
    expect(cfg.default_target.chat_id).toBe("c")
    expect(cfg.debounce_ms).toBe(3000)
  })

  it("throws when app_id missing", async () => {
    const path = `${TEST_DIR}/invalid.jsonc`
    await writeFile(path, `{}`)
    expect(() => loadConfig(path)).toThrow()
  })
})

describe("getEffectiveTarget", () => {
  const cfg: any = {
    default_target: { chat_id: "default" },
    categories: { permission: { target: { user_id: "u" } } }
  }
  it("falls back to default when category has no target", () => {
    expect(getEffectiveTarget(cfg, "other").chat_id).toBe("default")
  })
  it("uses category target when available", () => {
    expect(getEffectiveTarget(cfg, "permission").user_id).toBe("u")
  })
})
```

- [x] **Step 2: Run test, expect FAIL**

Run: `bun test tests/config.test.ts`
Expected: module not found.

- [x] **Step 3: Implement `src/config.ts`**

```typescript
import { readFileSync, existsSync } from "node:fs"
import { parse } from "comment-json"
import type { PluginConfig, NotificationTarget } from "./types"

const DEFAULT_CONFIG = {
  debounce_ms: 3000,
  log_file: "./logs/opencode-lark-bridge.log",
  categories: {}
}

export function loadConfig(configPath: string): PluginConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }
  const raw = readFileSync(configPath, "utf-8")
  const parsed = parse(raw, null, true)
  const config = { ...DEFAULT_CONFIG, ...(parsed as object) } as PluginConfig

  if (!config.app_id || !config.app_secret) {
    throw new Error("Missing required fields: app_id and/or app_secret")
  }
  if (!config.default_target?.chat_id && !config.default_target?.user_id) {
    throw new Error("Missing default_target.chat_id or default_target.user_id")
  }
  return config
}

export function getEffectiveTarget(config: PluginConfig, category?: string): NotificationTarget {
  if (category && config.categories[category]?.target) {
    return config.categories[category].target!
  }
  return config.default_target
}
```

- [x] **Step 4: Run test, expect PASS**

Run: `bun test tests/config.test.ts`
Expected: 4 passing.

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/config.ts packages/opencode-lark-bridge/tests/config.test.ts
git commit -m "feat: add JSONC config loader"
```

---

### Task 5: Lark Notifier

**Files:**
- Create: `packages/opencode-lark-bridge/src/notifier/lark-notifier.ts`
- Create: `packages/opencode-lark-bridge/tests/lark-notifier.test.ts`

**Interfaces:**
- Consumes: `Notifier`, `NotificationMessage`, `Logger` from `types.ts`.
- Produces: `createLarkNotifier(logger: Logger): Notifier`.

- [x] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createLarkNotifier } from "../src/notifier/lark-notifier"
import type { Logger, NotificationMessage } from "../src/types"

const noopLogger: Logger = { info: () => {}, debug: () => {}, error: () => {} }

describe("LarkNotifier", () => {
  it("builds chat_id command", async () => {
    let captured = ""
    const notifier = createLarkNotifier(noopLogger, async (cmd) => { captured = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    await notifier.send({ text: "hi", target: { chat_id: "oc_123" } })
    expect(captured).toContain("lark-cli im +messages-send")
    expect(captured).toContain("--chat-id oc_123")
    expect(captured).toContain("--as bot")
  })

  it("logs error without throwing", async () => {
    let err = ""
    const logger: Logger = { info: () => {}, debug: () => {}, error: (m) => { err = m } }
    const notifier = createLarkNotifier(logger, async () => { throw new Error("boom") })
    await notifier.send({ text: "hi", target: { chat_id: "oc_123" } })
    expect(err).toContain("boom")
  })
})
```

- [x] **Step 2: Run test, expect FAIL**

Run: `bun test tests/lark-notifier.test.ts`
Expected: module not found.

- [x] **Step 3: Implement `src/notifier/lark-notifier.ts`**

```typescript
import type { Logger, Notifier, NotificationMessage } from "../types"

export type ShellExecutor = (command: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>

function escapeShellArg(arg: string): string {
  return `"${arg.replace(/"/g, '\\"')}"`
}

export function createLarkNotifier(logger: Logger, execute: ShellExecutor): Notifier {
  return {
    async send(message: NotificationMessage) {
      try {
        const targetArg = message.target.chat_id
          ? `--chat-id ${message.target.chat_id}`
          : `--user-id ${message.target.user_id}`
        const command = `lark-cli im +messages-send ${targetArg} --as bot --text ${escapeShellArg(message.text)}`
        logger.debug("Executing lark-cli command", { command })
        const result = await execute(command)
        if (result.exitCode !== 0) {
          logger.error("lark-cli failed", { stderr: result.stderr, exitCode: result.exitCode })
        }
      } catch (err) {
        logger.error("Failed to send Lark notification", { error: (err as Error).message })
      }
    }
  }
}
```

- [x] **Step 4: Run test, expect PASS**

Run: `bun test tests/lark-notifier.test.ts`
Expected: 2 passing.

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/notifier/lark-notifier.ts packages/opencode-lark-bridge/tests/lark-notifier.test.ts
git commit -m "feat: add lark notifier"
```

---

### Task 6: Permission Event Mapper

**Files:**
- Create: `packages/opencode-lark-bridge/src/events/permission-mapper.ts`
- Create: `packages/opencode-lark-bridge/tests/permission-mapper.test.ts`

**Interfaces:**
- Consumes: `NotificationMessage`, `NotificationTarget` from `types.ts`.
- Produces: `mapPermissionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage`.

- [x] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { mapPermissionEvent } from "../src/events/permission-mapper"

describe("mapPermissionEvent", () => {
  it("extracts delete file path from bash command", () => {
    const event = {
      properties: {
        tool: "bash",
        args: { command: "rm -f /tmp/foo.txt" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("bash")
    expect(msg.text).toContain("/tmp/foo.txt")
  })

  it("uses custom template", () => {
    const event = { properties: { tool: "read", args: { filePath: "/etc/hosts" } } }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" }, "{tool} wants {resource}")
    expect(msg.text).toBe("read wants /etc/hosts")
  })
})
```

- [x] **Step 2: Run test, expect FAIL**

- [x] **Step 3: Implement `src/events/permission-mapper.ts`**

```typescript
import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "🔔 OpenCode 权限申请\\n工具：{tool}\\n操作：{operation}\\n目标：{resource}"

function detectOperation(tool: string, args: Record<string, unknown>): { operation: string; resource: string } {
  if (tool === "bash" && typeof args.command === "string") {
    const cmd = args.command
    const deleteMatch = cmd.match(/rm\s+(?:-[a-zA-Z]+\s+)?(.+)/)
    if (deleteMatch) return { operation: "删除文件", resource: deleteMatch[1].trim() }
    return { operation: "执行命令", resource: cmd }
  }
  if (tool === "read" && typeof args.filePath === "string") {
    return { operation: "读取文件", resource: args.filePath }
  }
  if (tool === "write" && typeof args.filePath === "string") {
    return { operation: "写入文件", resource: args.filePath }
  }
  return { operation: tool, resource: "未知" }
}

export function mapPermissionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const tool = event?.properties?.tool ?? "unknown"
  const args = event?.properties?.args ?? {}
  const { operation, resource } = detectOperation(tool, args)
  const text = (template || DEFAULT_TEMPLATE)
    .replace(/{tool}/g, tool)
    .replace(/{operation}/g, operation)
    .replace(/{resource}/g, resource)
  return { text, target }
}
```

- [x] **Step 4: Run test, expect PASS**

Run: `bun test tests/permission-mapper.test.ts`

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/events/permission-mapper.ts packages/opencode-lark-bridge/tests/permission-mapper.test.ts
git commit -m "feat: add permission event mapper"
```

---

### Task 7: Event Handler with Dedupe

**Files:**
- Create: `packages/opencode-lark-bridge/src/events/event-handler.ts`
- Create: `packages/opencode-lark-bridge/tests/event-handler.test.ts`

**Interfaces:**
- Consumes: `Notifier`, `PluginConfig`, `Logger`, `NotificationTarget` from `types.ts`; `mapPermissionEvent` from `permission-mapper`; `getEffectiveTarget` from `config`.
- Produces: `createEventHandler(config, notifier, logger)` returning `{ handle(event: any): Promise<void> }`.

- [x] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createEventHandler } from "../src/events/event-handler"
import type { Logger, Notifier, PluginConfig } from "../src/types"

const noopLogger: Logger = { info: () => {}, debug: () => {}, error: () => {} }

function makeConfig(debounce_ms: number): PluginConfig {
  return {
    app_id: "a", app_secret: "b",
    default_target: { chat_id: "oc_1" },
    debounce_ms,
    log_file: "",
    categories: {}
  }
}

describe("EventHandler", () => {
  it("sends permission event", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "permission.asked", properties: { tool: "bash", args: { command: "rm x" } } })
    expect(sent).toHaveLength(1)
  })

  it("deduplicates within window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = { type: "permission.asked", properties: { tool: "bash", args: { command: "rm x" } } }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })
})
```

- [x] **Step 2: Run test, expect FAIL**

- [x] **Step 3: Implement `src/events/event-handler.ts`**

```typescript
import type { PluginConfig, Notifier, Logger } from "../types"
import { mapPermissionEvent } from "./permission-mapper"
import { getEffectiveTarget } from "../config"

export function createEventHandler(config: PluginConfig, notifier: Notifier, logger: Logger) {
  const lastSent = new Map<string, number>()

  function dedupeKey(event: any): string {
    const tool = event?.properties?.tool ?? "unknown"
    const args = event?.properties?.args ?? {}
    const resource = typeof args.command === "string" ? args.command : (args.filePath ?? "unknown")
    return `${tool}:${resource}`
  }

  return {
    async handle(event: any) {
      if (event?.type !== "permission.asked") return
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

- [x] **Step 4: Run test, expect PASS**

Run: `bun test tests/event-handler.test.ts`

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/events/event-handler.ts packages/opencode-lark-bridge/tests/event-handler.test.ts
git commit -m "feat: add event handler with dedupe"
```

---

### Task 8: Plugin Entry

**Files:**
- Create: `packages/opencode-lark-bridge/src/index.ts`
- Create: `packages/opencode-lark-bridge/tests/index.test.ts`

**Interfaces:**
- Consumes: `loadConfig` from `config`, `createFileLogger` from `logger`, `createLarkNotifier` from `notifier/lark-notifier`, `createEventHandler` from `events/event-handler`, Bun `$` for shell execution, `@opencode-ai/plugin` types.
- Produces: default export plugin function.

- [x] **Step 1: Write failing smoke test**

```typescript
import { describe, it, expect } from "bun:test"
import plugin from "../src/index"

describe("plugin entry", () => {
  it("returns hooks object", async () => {
    const hooks = await plugin({ directory: "/tmp", worktree: "/tmp" } as any)
    expect(hooks.event).toBeFunction()
  })
})
```

- [x] **Step 2: Run test, expect FAIL**

- [x] **Step 3: Implement `src/index.ts`**

```typescript
import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin"
import { $ } from "bun"
import path from "node:path"
import { loadConfig } from "./config"
import { createFileLogger } from "./logger"
import { createLarkNotifier } from "./notifier/lark-notifier"
import { createEventHandler } from "./events/event-handler"

const CONFIG_FILE = "opencode-lark-bridge.config.jsonc"

const OpenCodeLarkBridge: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
  const configPath = path.join(ctx.directory, "packages", "opencode-lark-bridge", CONFIG_FILE)
  let config
  let logger
  try {
    config = loadConfig(configPath)
    logger = createFileLogger(path.resolve(path.dirname(configPath), config.log_file))
    logger.info("Plugin initialized", { configPath })
  } catch (err) {
    // No terminal output; plugin silently disables itself on missing/invalid config
    return { event: async () => {} }
  }

  const notifier = createLarkNotifier(logger, async (command) => {
    const proc = $`bash -c ${command}`.quiet()
    const result = await proc
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
  })

  const handler = createEventHandler(config, notifier, logger)

  return {
    event: async ({ event }: { event: any }) => {
      await handler.handle(event)
    }
  }
}

export default OpenCodeLarkBridge
```

- [x] **Step 4: Run test, expect PASS**

Run: `bun test tests/index.test.ts`

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/index.ts packages/opencode-lark-bridge/tests/index.test.ts
git commit -m "feat: add plugin entry point"
```

---

### Task 9: Integration Test

**Files:**
- Create: `packages/opencode-lark-bridge/tests/integration.test.ts`

**Interfaces:**
- Consumes: all modules.

- [x] **Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { loadConfig } from "../src/config"
import { createFileLogger } from "../src/logger"
import { createLarkNotifier } from "../src/notifier/lark-notifier"
import { createEventHandler } from "../src/events/event-handler"

const TEST_DIR = "tests/fixtures/integration"

describe("end-to-end flow", () => {
  beforeEach(async () => await mkdir(TEST_DIR, { recursive: true }))
  afterEach(async () => await rm(TEST_DIR, { recursive: true, force: true }))

  it("configures handler and captures command", async () => {
    const configPath = `${TEST_DIR}/config.jsonc`
    await writeFile(configPath, JSON.stringify({
      app_id: "a", app_secret: "b",
      default_target: { chat_id: "oc_target" },
      debounce_ms: 0,
      log_file: `${TEST_DIR}/app.log`,
      categories: {}
    }))
    const config = loadConfig(configPath)
    const logger = createFileLogger(config.log_file)
    let command = ""
    const notifier = createLarkNotifier(logger, async (cmd) => { command = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    const handler = createEventHandler(config, notifier, logger)
    await handler.handle({ type: "permission.asked", properties: { tool: "bash", args: { command: "rm /tmp/a.txt" } } })
    expect(command).toContain("oc_target")
    expect(command).toContain("rm /tmp/a.txt")
  })
})
```

- [x] **Step 2: Run test, expect PASS**

Run: `bun test tests/integration.test.ts`

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/tests/integration.test.ts
git commit -m "test: add integration test"
```

---

### Task 10: Build and Project-Level Install Scripts

**Files:**
- Modify: `packages/opencode-lark-bridge/package.json`

**Interfaces:**
- Produces: working `npm run build` and `npm run install:local`.

- [x] **Step 1: Update `package.json` scripts**

```json
{
  "scripts": {
    "build": "tsc",
    "test": "bun test",
    "install:local": "npm run build && rm -rf ../../.opencode/plugins/opencode-lark-bridge && mkdir -p ../../.opencode/plugins/opencode-lark-bridge && cp -r dist/* ../../.opencode/plugins/opencode-lark-bridge/ && cp opencode-lark-bridge.config.example.jsonc ../../.opencode/plugins/opencode-lark-bridge/"
  }
}
```

- [x] **Step 2: Run build**

Run: `cd packages/opencode-lark-bridge && npm run build`
Expected: `dist/` created with compiled `.js` and `.d.ts` files.

- [x] **Step 3: Run install:local**

Run: `cd packages/opencode-lark-bridge && npm run install:local`
Expected: `.opencode/plugins/opencode-lark-bridge/` exists with compiled files and example config.

- [x] **Step 4: Commit**

```bash
git add packages/opencode-lark-bridge/package.json
git commit -m "chore: add build and local install scripts"
```

---

### Task 11: README and Developer Test Manual

**Files:**
- Create: `packages/opencode-lark-bridge/README.md`

**Interfaces:**
- Produces: setup, config, build, install, test instructions.

- [x] **Step 1: Write README**

```markdown
# opencode-lark-bridge

OpenCode 插件：将权限申请通知推送到 Lark。

## 安装

```bash
cd packages/opencode-lark-bridge
bun install
```

## 配置

```bash
cp opencode-lark-bridge.config.example.jsonc opencode-lark-bridge.config.jsonc
# 编辑 opencode-lark-bridge.config.jsonc，填入 app_id、app_secret、目标 chat_id
```

## 编译与安装

```bash
npm run build
npm run install:local
```

这会复制编译产物到 `.opencode/plugins/opencode-lark-bridge/`，不修改 `opencode.json`。

## 测试

```bash
bun test
```

## 开发者端到端验证

1. 确保 `lark-cli` 已安装并登录：`lark-cli auth status`
2. 配置真实凭证到 `opencode-lark-bridge.config.jsonc`
3. 运行 `npm run install:local`
4. 在项目根目录启动 OpenCode
5. 触发一个需要权限的操作（例如让 AI 执行 `rm /tmp/test.txt`）
6. 检查 Lark 目标收到通知，并检查 `logs/opencode-lark-bridge.log`
```

- [x] **Step 2: Commit**

---

### Task 12: Final Verification

- [x] **Step 1: Run all tests**

Run: `cd packages/opencode-lark-bridge && bun test`
Expected: all tests pass.

- [x] **Step 2: Run TypeScript build**

Run: `cd packages/opencode-lark-bridge && npm run build`
Expected: no errors.

- [x] **Step 3: Confirm `.gitignore` excludes sensitive files**

Run: `git check-ignore packages/opencode-lark-bridge/opencode-lark-bridge.config.jsonc packages/opencode-lark-bridge/logs/opencode-lark-bridge.log`
Expected: both paths reported as ignored.

- [x] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification artifacts" || echo "nothing to commit"
```
