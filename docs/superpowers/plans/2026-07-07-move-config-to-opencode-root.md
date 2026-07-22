---
change: move-config-to-opencode-root
design-doc: docs/superpowers/specs/2026-07-07-move-config-to-opencode-root-design.md
base-ref: 245f86bcc5477b3f578be3460dadd0dbd7d195ee
archived-with: 2026-07-08-move-config-to-opencode-root
---

# Move Config to opencode Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Move `opencode-lark-bridge.config.jsonc` from the deployed plugin directory to the parent `.opencode/` root, with project-level priority, global-level fallback, and a lowest-priority compatibility path that keeps old plugin-directory configs working; additionally, make the package installable via npm/npx/bun so that `postinstall` (or an explicit `npx opencode-lark-bridge init` command) seeds the config at the correct `.opencode/` level without overwriting existing files.

**Architecture:** Refactor `resolveConfigPath` to be a pure, exported function that accepts an optional `pluginDir` parameter (so tests can simulate any deployment layout). Candidate order: `(1)` `ctx.directory/CONFIG_FILE` (project-level `.opencode` root, or `~/.opencode` when globally installed), `(2)` global `~/.opencode/CONFIG_FILE` (skipped when candidate 1 already covers it), `(3)` `pluginDir/CONFIG_FILE` (compat), `(4)` `pluginDir/../CONFIG_FILE` (compat). Update `install-local.sh` to stop backing up/restoring the plugin-dir config and instead seed the project-level config on first install. Add an npm package entry: `bin/opencode-lark-bridge` runs a small CLI for `npx opencode-lark-bridge init`, and `postinstall` seeds config automatically after `npm install` / `bun add`. Both install-time paths detect global vs. project scope and target `~/.opencode/` vs. `<project>/.opencode/` respectively. Update the README to document the new config location, priority, and all install methods.

**Tech Stack:** TypeScript, Bun runtime/test runner, Node `fs`/`os`/`path`/`url`/`child_process` modules, bash for the install script, npm/bun package publishing metadata.

## Global Constraints

- Config file name is fixed: `opencode-lark-bridge.config.jsonc` (constant `CONFIG_FILE`).
- Config format and validation are not modified; `loadConfig` and `getEffectiveTarget` stay as-is.
- No new runtime dependencies are introduced.
- Plugin source lives under `packages/opencode-lark-bridge/`; tests under `packages/opencode-lark-bridge/tests/`.
- Project-level install path: `<project>/.opencode/plugins/opencode-lark-bridge/` (unchanged).
- New project-level config path: `<project>/.opencode/opencode-lark-bridge.config.jsonc`.
- New global config path: `~/.opencode/opencode-lark-bridge.config.jsonc`.
- Log file path remains `path.resolve(path.dirname(configPath), config.log_file)` (no change).
- Build: `cd packages/opencode-lark-bridge && npm run build` (runs `tsc`).
- Tests: `cd packages/opencode-lark-bridge && bun test`.
- Per the change's `tasks.md`, the old plugin-directory config path is kept as a low-priority compatibility candidate (overrides the design doc's stricter "no compat path" wording; `tasks.md` is the source of truth for this plan).
- Per the design doc, do NOT auto-migrate old plugin-directory configs to the new location; the compatibility path simply keeps them readable.
- Install-time config seeding must never overwrite an existing config file.
- Install-time config seeding must create the target `.opencode/` directory if it does not exist.
- The published package must include compiled `dist/`, the example config, and the README so that `postinstall` and `npx` have the files they need.

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 1: Refactor `resolveConfigPath` for testability and new candidate order

**Files:**
- Modify: `packages/opencode-lark-bridge/src/index.ts` (lines 1-26)
- Modify: `packages/opencode-lark-bridge/tests/index.test.ts`

**Interfaces:**
- Consumes: `ctx: { directory: string }`; new optional `pluginDir: string` parameter (defaults to `path.dirname(fileURLToPath(import.meta.url))`); new optional `globalOpencodeDir: string` parameter (defaults to `path.join(os.homedir(), ".opencode")`); `existsSync`.
- Produces: `export function resolveConfigPath(ctx: { directory: string }, pluginDir?: string, globalOpencodeDir?: string): string | null` returning the first existing candidate in this order:
  1. `path.join(ctx.directory, CONFIG_FILE)`
  2. `path.join(globalOpencodeDir, CONFIG_FILE)` (only when normalized `ctx.directory` differs from normalized `globalOpencodeDir`)
  3. `path.join(pluginDir, CONFIG_FILE)` (compat)
  4. `path.join(pluginDir, "..", CONFIG_FILE)` (compat)
  Otherwise `null`.

- [x] **Step 1: Add failing tests for the new candidate order**

Append the following `describe` block to `packages/opencode-lark-bridge/tests/index.test.ts` (keep all existing tests intact):

```typescript
import { resolveConfigPath } from "../src/index"

describe("resolveConfigPath", () => {
  let projectDir: string
  let globalDir: string
  let compatPluginDir: string
  let compatParentDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), "lark-project-"))
    globalDir = mkdtempSync(path.join(tmpdir(), "lark-global-"))
    compatPluginDir = mkdtempSync(path.join(tmpdir(), "lark-plugin-"))
    compatParentDir = mkdtempSync(path.join(tmpdir(), "lark-plugin-parent-"))
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(globalDir, { recursive: true, force: true })
    rmSync(compatPluginDir, { recursive: true, force: true })
    rmSync(compatParentDir, { recursive: true, force: true })
  })

  function writeConfig(dir: string, suffix = ""): string {
    const file = path.join(dir, "opencode-lark-bridge.config.jsonc")
    writeFileSync(
      file,
      JSON.stringify({
        app_id: "a",
        app_secret: "b",
        default_target: { chat_id: "c" },
        log_file: path.join(dir, `app${suffix}.log`),
      })
    )
    return file
  }

  it("returns null when no candidate exists", () => {
    const result = resolveConfigPath(
      { directory: projectDir },
      compatPluginDir
    )
    expect(result).toBeNull()
  })

  it("prefers project-level .opencode config over global and compat", () => {
    const projectFile = writeConfig(projectDir, "-project")
    const globalFile = writeConfig(globalDir, "-global")
    const compatFile = writeConfig(compatPluginDir, "-compat")
    const compatParentFile = writeConfig(compatParentDir, "-compat-parent")

    const result = resolveConfigPath(
      { directory: projectDir },
      compatPluginDir
    )

    expect(result).toBe(path.resolve(projectFile))
    // Sanity: other candidates must have been written but not chosen.
    expect(existsSync(globalFile)).toBe(true)
    expect(existsSync(compatFile)).toBe(true)
    expect(existsSync(compatParentFile)).toBe(true)
  })

  it("falls back to global ~/.opencode when project-level missing", () => {
    const globalFile = writeConfig(globalDir, "-global")

    const result = resolveConfigPath(
      { directory: projectDir },
      compatPluginDir
    )

    expect(result).toBe(path.resolve(globalFile))
  })

  it("falls back to plugin-dir compat when project and global missing", () => {
    const compatFile = writeConfig(compatPluginDir, "-compat")

    const result = resolveConfigPath(
      { directory: projectDir },
      compatPluginDir
    )

    expect(result).toBe(path.resolve(compatFile))
  })

  it("falls back to plugin parent compat when only that exists", () => {
    const compatParentFile = writeConfig(compatParentDir, "-compat-parent")

    const result = resolveConfigPath(
      { directory: projectDir },
      compatPluginDir
    )

    expect(result).toBe(path.resolve(compatParentFile))
  })

  it("skips global candidate when ctx.directory already points at the global .opencode path", () => {
    // Simulate global install by treating `globalDir` as both the global .opencode
    // location and the ctx.directory. The global candidate must be skipped
    // (otherwise we'd re-resolve the same file), so the function must still
    // return the ctx.directory config and not the compat fallback.
    const globalFile = writeConfig(globalDir, "-global-as-ctx")

    const result = resolveConfigPath(
      { directory: globalDir },
      compatPluginDir,
      globalDir
    )

    expect(result).toBe(path.resolve(globalFile))
    // Sanity: function did not fall through to a compat candidate.
    expect(result).not.toBe(path.resolve(path.join(compatPluginDir, "opencode-lark-bridge.config.jsonc")))
  })
})
```

Also add `existsSync` to the existing `node:fs` import line at the top of the test file:

```typescript
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
```

- [x] **Step 2: Run new tests, expect FAIL**

Run: `cd packages/opencode-lark-bridge && bun test tests/index.test.ts`
Expected: the new `resolveConfigPath` cases fail with `ReferenceError: resolveConfigPath is not a function` (or `Cannot find module "../src/index"` if the export isn't added yet).

- [x] **Step 3: Refactor `src/index.ts` to export `resolveConfigPath` with the new order**

Replace lines 1-26 of `packages/opencode-lark-bridge/src/index.ts` with:

```typescript
import path from "node:path"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import os from "node:os"
import { loadConfig, getEffectiveTarget } from "./config"
import { createFileLogger } from "./logger"
import { createLarkNotifier } from "./notifier/lark-notifier"
import { createEventHandler } from "./events/event-handler"
import { mapPermissionEvent } from "./events/permission-mapper"

const CONFIG_FILE = "opencode-lark-bridge.config.jsonc"
const GLOBAL_OPENCODE_DIR = path.join(os.homedir(), ".opencode")

export function resolveConfigPath(
  ctx: { directory: string },
  pluginDir: string = path.dirname(fileURLToPath(import.meta.url)),
  globalOpencodeDir: string = GLOBAL_OPENCODE_DIR
): string | null {
  const normalizedCtx = path.resolve(ctx.directory)
  const normalizedGlobal = path.resolve(globalOpencodeDir)
  const candidates: string[] = [path.join(ctx.directory, CONFIG_FILE)]
  if (normalizedCtx !== normalizedGlobal) {
    candidates.push(path.join(globalOpencodeDir, CONFIG_FILE))
  }
  candidates.push(path.join(pluginDir, CONFIG_FILE))
  candidates.push(path.join(pluginDir, "..", CONFIG_FILE))
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return path.resolve(candidate)
    }
  }
  return null
}

export const OpenCodeLarkBridge = async (ctx: any) => {
  const configPath = resolveConfigPath(ctx)
  if (!configPath) {
    return { event: async () => {} }
  }
  // ...existing body unchanged from this point down...
```

Keep the rest of the file (the `OpenCodeLarkBridge` body from line 28 onward) byte-identical, including the existing `return { event: async () => {} }` no-op branches.

- [x] **Step 4: Run tests, expect PASS**

Run: `cd packages/opencode-lark-bridge && bun test tests/index.test.ts`
Expected: all tests pass (both the original entry-point cases and the new `resolveConfigPath` cases).

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/index.ts packages/opencode-lark-bridge/tests/index.test.ts
git commit -m "refactor: move config resolution to .opencode root with project>global>compat priority"
```

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 2: Update `install-local.sh` to seed `.opencode` root config

**Files:**
- Modify: `packages/opencode-lark-bridge/scripts/install-local.sh`

**Interfaces:**
- Produces: `install-local.sh` that compiles, deploys to `.opencode/plugins/opencode-lark-bridge/`, runs `bun install --production` there, and seeds `<PROJECT_ROOT>/.opencode/opencode-lark-bridge.config.jsonc` from `opencode-lark-bridge.config.example.jsonc` only if absent (never overwrites, no plugin-dir backup/restore).

- [x] **Step 1: Replace `install-local.sh` with the new logic**

Overwrite `packages/opencode-lark-bridge/scripts/install-local.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PLUGIN_DIR="$PROJECT_ROOT/.opencode/plugins/opencode-lark-bridge"
SOURCE_DIR="$PROJECT_ROOT/packages/opencode-lark-bridge"
CONFIG_FILE="opencode-lark-bridge.config.jsonc"
PROJECT_CONFIG="$PROJECT_ROOT/.opencode/$CONFIG_FILE"

cd "$SOURCE_DIR"
npm run build

rm -rf "$PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
cp -r dist/* "$PLUGIN_DIR/"
cp package.json bun.lock opencode-lark-bridge.config.example.jsonc "$PLUGIN_DIR/"

(
  cd "$PLUGIN_DIR"
  bun install --production
)

# Seed project-level config at .opencode root on first install; preserve user edits on subsequent runs.
mkdir -p "$PROJECT_ROOT/.opencode"
if [ ! -f "$PROJECT_CONFIG" ]; then
  cp "$SOURCE_DIR/opencode-lark-bridge.config.example.jsonc" "$PROJECT_CONFIG"
  echo "Created example config at $PROJECT_CONFIG"
else
  echo "Preserved existing config at $PROJECT_CONFIG"
fi

echo "Plugin installed to $PLUGIN_DIR"
```

- [x] **Step 2: Verify shell syntax**

Run: `bash -n packages/opencode-lark-bridge/scripts/install-local.sh`
Expected: exit code 0, no output.

- [x] **Step 3: Smoke-test first-install behavior in a throwaway project**

Run:
```bash
TMP_PROJECT="$(mktemp -d)"
mkdir -p "$TMP_PROJECT/packages/opencode-lark-bridge"
cp -r packages/opencode-lark-bridge/. "$TMP_PROJECT/packages/opencode-lark-bridge/"
cd "$TMP_PROJECT/packages/opencode-lark-bridge"
bash scripts/install-local.sh
ls "$TMP_PROJECT/.opencode/opencode-lark-bridge.config.jsonc"
cat "$TMP_PROJECT/.opencode/opencode-lark-bridge.config.jsonc"
```
Expected: the `ls` prints the file path; the `cat` prints JSONC starting with `{` containing `app_id`, `app_secret`, `default_target`. Then clean up:
```bash
rm -rf "$TMP_PROJECT"
cd /home/lifxue/src/lark-plugin-opencode
```

- [x] **Step 4: Smoke-test re-run preserves existing config**

Run:
```bash
TMP_PROJECT="$(mktemp -d)"
mkdir -p "$TMP_PROJECT/packages/opencode-lark-bridge"
cp -r packages/opencode-lark-bridge/. "$TMP_PROJECT/packages/opencode-lark-bridge/"
cd "$TMP_PROJECT/packages/opencode-lark-bridge"
bash scripts/install-local.sh
echo "USER_EDITED=keep-me" >> "$TMP_PROJECT/.opencode/opencode-lark-bridge.config.jsonc"
bash scripts/install-local.sh
tail -n 1 "$TMP_PROJECT/.opencode/opencode-lark-bridge.config.jsonc"
```
Expected: the final `tail` prints `USER_EDITED=keep-me`, confirming the second install did not overwrite the existing config. Clean up:
```bash
rm -rf "$TMP_PROJECT"
cd /home/lifxue/src/lark-plugin-opencode
```

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/scripts/install-local.sh
git commit -m "chore: seed .opencode root config from install script, preserve on re-run"
```

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 3: Update README to reflect new config location, priority, and all install methods

**Files:**
- Modify: `packages/opencode-lark-bridge/README.md`

**Interfaces:**
- Produces: README that documents `npm install`/`-g`, `npx`, and `bun` install methods; global vs. project config paths; the project>global>compat priority; and the updated developer-verification steps.

- [x] **Step 1: Replace the `## 安装` and `## 配置` sections**

In `packages/opencode-lark-bridge/README.md`, replace the entire `## 安装` and `## 配置` sections (currently lines 14-49) with:

```markdown
## 安装

### 项目级安装（推荐）

配置文件初始化到当前项目根目录的 `.opencode/` 下：

```bash
npm install opencode-lark-bridge
# 或
bun add opencode-lark-bridge
```

### 全局安装

配置文件初始化到用户主目录的 `~/.opencode/` 下，所有项目共享：

```bash
npm install -g opencode-lark-bridge
# 或
bun add -g opencode-lark-bridge
```

### 不安装，一次性初始化（npx）

只想在当前项目生成配置文件而不把包加入 `package.json`：

```bash
npx opencode-lark-bridge init
```

全局初始化：

```bash
npx opencode-lark-bridge init --global
```

### 开发者本地安装

源码在仓库内时，使用本地脚本进行项目级部署：

```bash
cd packages/opencode-lark-bridge
npm run build
npm run install:local
```

## 配置

运行时按以下顺序查找 `opencode-lark-bridge.config.jsonc`，命中即返回：

1. `<ctx.directory>/opencode-lark-bridge.config.jsonc`（项目级安装时为 `<project>/.opencode/`，全局安装时为 `~/.opencode/`）
2. `~/.opencode/opencode-lark-bridge.config.jsonc`（仅在第 1 步未命中且 `ctx.directory` 不是 `~/.opencode` 时查找）
3. `<pluginDir>/opencode-lark-bridge.config.jsonc`（兼容旧部署：插件目录内）
4. `<pluginDir>/../opencode-lark-bridge.config.jsonc`（兼容旧部署：插件上级目录）

安装脚本会在对应层级的 `.opencode/` 目录下首次创建示例配置；已存在则保留不覆盖。

### 项目级配置

```bash
<project>/.opencode/opencode-lark-bridge.config.jsonc
```

### 全局配置

```bash
~/.opencode/opencode-lark-bridge.config.jsonc
```

### 开发期配置（可选）

```bash
cp opencode-lark-bridge.config.example.jsonc opencode-lark-bridge.config.jsonc
```

编辑配置文件，填入以下信息：

| 字段 | 说明 | 示例 |
|------|------|------|
| `app_id` | 飞书应用 App ID | `cli_xxxx` |
| `app_secret` | 飞书应用 App Secret | `xxxx` |
| `default_target.chat_id` | 默认通知群聊 ID | `oc_xxxx` |
| `default_target.user_id` | 默认通知用户 ID | `ou_xxxx` |
| `debounce_ms` | 去重窗口（毫秒） | `3000` |
| `log_file` | 日志文件路径 | `./logs/app.log` |
| `categories.permission.template` | 权限通知模板 | `🔔 {tool} {operation} {resource}` |

**注意**：`opencode-lark-bridge.config.jsonc` 已被 `.gitignore` 排除，不会提交到版本控制。
```

- [x] **Step 2: Update the `## 编译与项目级安装` section**

Replace the `## 编译与项目级安装` section (currently lines 51-61) with:

```markdown
## 编译与项目级安装（开发者）

```bash
npm run build
npm run install:local
```

这会：
1. 编译 TypeScript 源码到 `dist/`
2. 复制编译产物到 `.opencode/plugins/opencode-lark-bridge/`
3. 首次运行时，在项目根目录 `.opencode/` 下创建示例配置（已存在则保留）
4. **不修改** `opencode.json` 或任何全局配置
```

- [x] **Step 3: Update developer-verification steps**

In the same README, replace the numbered "开发者端到端验证" list (currently lines 71-79) so it reads:

```markdown
### 开发者端到端验证

1. 确保 `lark-cli` 已安装并登录：`lark-cli auth status`
2. 运行 `npm run install:local`（或 `npm install opencode-lark-bridge`）
3. 编辑 `.opencode/opencode-lark-bridge.config.jsonc`，填入真实凭证
4. 在项目根目录启动 OpenCode
5. 触发一个需要权限的操作（例如让 AI 执行 `rm /tmp/test.txt`）
6. 检查飞书目标是否收到通知
7. 检查 `.opencode/logs/opencode-lark-bridge.log` 是否记录了发送行为
```

- [x] **Step 4: Commit**

```bash
git add packages/opencode-lark-bridge/README.md
git commit -m "docs: document npm/npx/bun install, config locations, and project>global>compat priority"
```

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 4: Add npm package entry (`bin` and `postinstall`) to `package.json`

**Files:**
- Modify: `packages/opencode-lark-bridge/package.json`

**Interfaces:**
- Consumes: existing `scripts`, `dependencies`, `devDependencies`.
- Produces: `package.json` with `"bin"`, `"postinstall"` script, and `"files"` entries so that `npm install`, `npm install -g`, `bun add`, and `npx opencode-lark-bridge` all work without shipping source code.

- [x] **Step 1: Update `package.json`**

Replace the contents of `packages/opencode-lark-bridge/package.json` with:

```json
{
  "name": "opencode-lark-bridge",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "opencode-lark-bridge": "./dist/cli.js"
  },
  "files": [
    "dist",
    "opencode-lark-bridge.config.example.jsonc",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "test": "bun test",
    "install:local": "bash scripts/install-local.sh",
    "postinstall": "node ./dist/postinstall.js"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.17.7",
    "comment-json": "^4.2.3"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "typescript": "^5.5.0"
  }
}
```

- [x] **Step 2: Verify JSON syntax**

Run: `cd packages/opencode-lark-bridge && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/package.json
git commit -m "chore: add bin entry, postinstall script, and files field for npm/npx/bun distribution"
```

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 5: Implement install-time config initialization (`postinstall`)

**Files:**
- Create: `packages/opencode-lark-bridge/src/postinstall.ts`
- Modify: `packages/opencode-lark-bridge/tsconfig.json` (if `include` excludes it; verify)

**Interfaces:**
- Consumes: `node:fs`, `node:path`, `node:os`, `node:child_process`.
- Produces: `export function initConfig(options: { targetDir: string; exampleFile?: string; configFile?: string }): { created: boolean; path: string }` and a self-executing `main()` that decides the target directory based on install scope.

- [x] **Step 1: Create `src/postinstall.ts`**

Create `packages/opencode-lark-bridge/src/postinstall.ts` with:

```typescript
import { existsSync, mkdirSync, copyFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const CONFIG_FILE = "opencode-lark-bridge.config.jsonc"
const EXAMPLE_FILE = "opencode-lark-bridge.config.example.jsonc"

function getGlobalPrefix(): string | null {
  try {
    return execSync("npm prefix -g", { encoding: "utf-8" }).trim()
  } catch {
    return null
  }
}

function getCurrentDir(): string {
  return path.dirname(fileURLToPath(import.meta.url))
}

function isInsideGlobalPath(candidate: string): boolean {
  const resolvedCandidate = path.resolve(candidate)
  const prefixes: string[] = []

  const npmPrefix = getGlobalPrefix()
  if (npmPrefix) prefixes.push(npmPrefix)

  // Common global install locations for bun and npm.
  const home = os.homedir()
  prefixes.push(
    path.join(home, ".bun", "install", "global"),
    path.join(home, ".local", "share", "pnpm", "global"),
    path.join(home, ".config", "yarn", "global"),
    path.join(home, ".npm", "global"),
    "/usr/local/lib/node_modules",
    "/usr/lib/node_modules"
  )

  for (const prefix of prefixes) {
    if (resolvedCandidate.startsWith(path.resolve(prefix))) {
      return true
    }
  }
  return false
}

export function isGlobalInstall(): boolean {
  // npm sets npm_config_global=true for -g installs.
  if (process.env.npm_config_global === "true") {
    return true
  }

  // If INIT_CWD is provided and points inside a global location, treat as global.
  if (process.env.INIT_CWD && isInsideGlobalPath(process.env.INIT_CWD)) {
    return true
  }

  // Fallback: if the package itself is installed inside a global location.
  return isInsideGlobalPath(getCurrentDir())
}

export function resolveTargetDir(): string {
  if (isGlobalInstall()) {
    return path.join(os.homedir(), ".opencode")
  }
  const projectRoot = process.env.INIT_CWD || process.cwd()
  return path.join(projectRoot, ".opencode")
}

export function initConfig(options: {
  targetDir: string
  exampleFile?: string
  configFile?: string
}): { created: boolean; path: string } {
  const configFile = options.configFile || CONFIG_FILE
  const exampleFile = options.exampleFile || EXAMPLE_FILE
  mkdirSync(options.targetDir, { recursive: true })

  const targetPath = path.resolve(options.targetDir, configFile)
  if (existsSync(targetPath)) {
    return { created: false, path: targetPath }
  }

  // In a published package, the script is at dist/ and the example is at package root.
  const currentDir = getCurrentDir()
  const sourcePath = path.resolve(currentDir, "..", exampleFile)
  if (!existsSync(sourcePath)) {
    // Fallback for local source runs: example lives next to src/.
    const localFallback = path.resolve(currentDir, "..", "..", exampleFile)
    if (existsSync(localFallback)) {
      copyFileSync(localFallback, targetPath)
      return { created: true, path: targetPath }
    }
    throw new Error(`Example config not found at ${sourcePath} or ${localFallback}`)
  }

  copyFileSync(sourcePath, targetPath)
  return { created: true, path: targetPath }
}

function main(): void {
  const targetDir = resolveTargetDir()
  const result = initConfig({ targetDir })
  if (result.created) {
    console.log(`Created example config at ${result.path}`)
  } else {
    console.log(`Preserved existing config at ${result.path}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
```

- [x] **Step 2: Verify `tsconfig.json` includes the new file**

Run: `cat packages/opencode-lark-bridge/tsconfig.json`
Expected: `include` covers `src/**/*.ts` (if it does not, modify `tsconfig.json` to include `"src/**/*.ts"`).

- [x] **Step 3: Build and run postinstall locally**

Run:
```bash
cd packages/opencode-lark-bridge
npm run build
node ./dist/postinstall.js
```
Expected: output similar to `Created example config at /home/lifxue/src/lark-plugin-opencode/.opencode/opencode-lark-bridge.config.jsonc` (because local source run detects project-level install). Verify the file exists and contains example content. If this was an accidental overwrite of your real config, restore it from backup or re-create it; the plan assumes this test is run in a clean/safe environment.

- [x] **Step 4: Clean up generated test config if desired**

If `.opencode/opencode-lark-bridge.config.jsonc` was created and you do not want it in the repo, remove it:
```bash
rm -f /home/lifxue/src/lark-plugin-opencode/.opencode/opencode-lark-bridge.config.jsonc
```

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/src/postinstall.ts
git commit -m "feat: add postinstall config initialization with global/project scope detection"
```

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 6: Implement CLI `init` command for `npx opencode-lark-bridge`

**Files:**
- Create: `packages/opencode-lark-bridge/src/cli.ts`

**Interfaces:**
- Consumes: `initConfig` and `resolveTargetDir` logic from `postinstall.ts`.
- Produces: executable `dist/cli.js` that supports `npx opencode-lark-bridge init [--global|-g]`.

- [x] **Step 1: Create `src/cli.ts`**

Create `packages/opencode-lark-bridge/src/cli.ts` with:

```typescript
#!/usr/bin/env node
import os from "node:os"
import path from "node:path"
import { initConfig } from "./postinstall"

function printHelp(): void {
  console.log(`Usage: opencode-lark-bridge <command> [options]

Commands:
  init                Create example config in current project (.opencode/)
  init --global, -g   Create example config in global ~/.opencode/
  help                Show this help message
`)
}

function main(): void {
  const args = process.argv.slice(2)
  const command = args[0] || "init"

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp()
    return
  }

  if (command !== "init") {
    console.error(`Unknown command: ${command}`)
    printHelp()
    process.exit(1)
  }

  const globalFlag = args.includes("--global") || args.includes("-g")
  const targetDir = globalFlag
    ? path.join(os.homedir(), ".opencode")
    : path.join(process.cwd(), ".opencode")

  const result = initConfig({ targetDir })
  if (result.created) {
    console.log(`Created example config at ${result.path}`)
  } else {
    console.log(`Config already exists at ${result.path}; nothing changed.`)
  }
}

main()
```

- [x] **Step 2: Rebuild and test the CLI locally**

Run:
```bash
cd packages/opencode-lark-bridge
npm run build
node ./dist/cli.js init
```
Expected: prints that it created or preserved `.opencode/opencode-lark-bridge.config.jsonc` in the current working directory.

Run:
```bash
node ./dist/cli.js init --global
```
Expected: prints that it created or preserved `~/.opencode/opencode-lark-bridge.config.jsonc`.

Run:
```bash
node ./dist/cli.js help
```
Expected: prints usage help.

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/src/cli.ts
git commit -m "feat: add CLI init command for npx opencode-lark-bridge"
```

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 7: Add unit tests for install-time config initialization

**Files:**
- Create: `packages/opencode-lark-bridge/tests/postinstall.test.ts`

**Interfaces:**
- Consumes: `isGlobalInstall`, `resolveTargetDir`, `initConfig` from `../src/postinstall`.
- Produces: passing tests covering global detection heuristics, target directory resolution, and config seeding behavior (create vs. preserve).

- [x] **Step 1: Write tests**

Create `packages/opencode-lark-bridge/tests/postinstall.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { isGlobalInstall, resolveTargetDir, initConfig } from "../src/postinstall"

describe("isGlobalInstall", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.npm_config_global
    delete process.env.INIT_CWD
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns true when npm_config_global is 'true'", () => {
    process.env.npm_config_global = "true"
    expect(isGlobalInstall()).toBe(true)
  })

  it("returns false for a normal project install", () => {
    process.env.INIT_CWD = "/home/user/project"
    expect(isGlobalInstall()).toBe(false)
  })
})

describe("resolveTargetDir", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("resolves to ~/.opencode for global install", () => {
    process.env.npm_config_global = "true"
    expect(resolveTargetDir()).toEndWith(path.join(".opencode"))
  })

  it("resolves to INIT_CWD/.opencode for project install", () => {
    const project = "/home/user/project"
    process.env.INIT_CWD = project
    delete process.env.npm_config_global
    expect(resolveTargetDir()).toBe(path.join(project, ".opencode"))
  })
})

describe("initConfig", () => {
  let tempDir: string
  let exampleFile: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "lark-init-"))
    exampleFile = path.join(tempDir, "opencode-lark-bridge.config.example.jsonc")
    writeFileSync(exampleFile, '{ "app_id": "example" }')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("creates config when it does not exist", () => {
    const targetDir = path.join(tempDir, "target")
    const result = initConfig({ targetDir, exampleFile })

    expect(result.created).toBe(true)
    expect(existsSync(result.path)).toBe(true)
    expect(readFileSync(result.path, "utf-8")).toContain('"app_id"')
  })

  it("preserves existing config and does not overwrite", () => {
    const targetDir = path.join(tempDir, "target")
    mkdirSync(targetDir, { recursive: true })
    const existing = path.join(targetDir, "opencode-lark-bridge.config.jsonc")
    writeFileSync(existing, '{ "app_id": "user" }')

    const result = initConfig({ targetDir, exampleFile })

    expect(result.created).toBe(false)
    expect(readFileSync(result.path, "utf-8")).toContain('"user"')
  })

  it("creates the .opencode directory if missing", () => {
    const targetDir = path.join(tempDir, "nested", "target")
    const result = initConfig({ targetDir, exampleFile })

    expect(existsSync(targetDir)).toBe(true)
    expect(existsSync(result.path)).toBe(true)
  })
})
```

- [x] **Step 2: Run tests, expect PASS**

Run: `cd packages/opencode-lark-bridge && bun test tests/postinstall.test.ts`
Expected: all tests pass.

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/tests/postinstall.test.ts
git commit -m "test: add postinstall config initialization tests"
```

archived-with: 2026-07-08-move-config-to-opencode-root
---

### Task 8: Final verification

**Files:** (no file changes; verification only)

- [x] **Step 1: Run full test suite**

Run: `cd packages/opencode-lark-bridge && bun test`
Expected: all tests pass (existing entry-point cases + new `resolveConfigPath` cases + new postinstall cases).

- [x] **Step 2: Run TypeScript build**

Run: `cd packages/opencode-lark-bridge && npm run build`
Expected: exit code 0, no TypeScript errors, `dist/index.js`, `dist/postinstall.js`, and `dist/cli.js` regenerated.

- [x] **Step 3: Confirm gitignore still covers the sensitive paths**

Run (from repo root): `git check-ignore packages/opencode-lark-bridge/opencode-lark-bridge.config.jsonc .opencode/plugins/opencode-lark-bridge/ packages/opencode-lark-bridge/dist/`
Expected: every path reported as ignored (each prints the path).

- [x] **Step 4: Smoke-test the published package locally**

Run:
```bash
cd packages/opencode-lark-bridge
npm pack
TMP_DIR="$(mktemp -d)"
cd "$TMP_DIR"
npm init -y
npm install /home/lifxue/src/lark-plugin-opencode/packages/opencode-lark-bridge/opencode-lark-bridge-0.1.0.tgz
ls "$TMP_DIR/.opencode/opencode-lark-bridge.config.jsonc"
```
Expected: the `ls` shows the example config was created in the temporary project's `.opencode/` directory. Clean up:
```bash
rm -rf "$TMP_DIR"
cd /home/lifxue/src/lark-plugin-opencode/packages/opencode-lark-bridge
rm -f opencode-lark-bridge-0.1.0.tgz
cd /home/lifxue/src/lark-plugin-opencode
```

- [x] **Step 5: Smoke-test global install of the packed tarball**

Run:
```bash
cd packages/opencode-lark-bridge
npm pack
npm install -g /home/lifxue/src/lark-plugin-opencode/packages/opencode-lark-bridge/opencode-lark-bridge-0.1.0.tgz
ls ~/.opencode/opencode-lark-bridge.config.jsonc
```
Expected: the example config is created at `~/.opencode/opencode-lark-bridge.config.jsonc`. Clean up:
```bash
npm uninstall -g opencode-lark-bridge
rm -f /home/lifxue/src/lark-plugin-opencode/packages/opencode-lark-bridge/opencode-lark-bridge-0.1.0.tgz
rm -f ~/.opencode/opencode-lark-bridge.config.jsonc
cd /home/lifxue/src/lark-plugin-opencode
```

- [x] **Step 6: Smoke-test `npx opencode-lark-bridge init`**

Run:
```bash
TMP_DIR="$(mktemp -d)"
cd "$TMP_DIR"
npx /home/lifxue/src/lark-plugin-opencode/packages/opencode-lark-bridge/dist/cli.js init
ls "$TMP_DIR/.opencode/opencode-lark-bridge.config.jsonc"
```
Expected: the example config is created in the temporary project's `.opencode/` directory. Clean up:
```bash
rm -rf "$TMP_DIR"
cd /home/lifxue/src/lark-plugin-opencode
```

- [x] **Step 7: Commit any leftover artifacts (only if needed)**

If any verification artifacts were generated and not already ignored, decide explicitly:
- If they are real config/log files meant to persist, leave them as-is (do not commit).
- If anything else surfaces, run:
  ```bash
  git status
  ```
  and either `git add` intentional files with a follow-up commit or `rm` stray files. Do not run a blanket `git add -A`.
