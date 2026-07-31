---
change: npm-install-full-deployment
design-doc: docs/superpowers/specs/2026-07-31-npm-install-full-deployment-design.md
base-ref: 6ff3edab15bd3a27cfd4667b232e9b041f046f70
---
# npm-install-full-deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 opencode-lark-bridge 的安装流程升级为「npm 包发布 + postinstall 自动完整安装」，并提供 CLI `install` 子命令作为手动备选；同时整改项目符合 npm 发布合规要求，配套发布流程文档与本地测试安装方案。

**Architecture:** 安装核心逻辑抽取到 `src/installer.ts`（`installPlugin` + `copyPluginFiles` + `installDependencies`），JSONC 配置注册逻辑抽取到 `src/config-register.ts`（用 comment-json 保留注释）。`postinstall.ts` 的 `main()` 改为调用 `installPlugin`；`cli.ts` 新增 `install` 子命令复用同一入口。shell 安装脚本（`install-local.sh`/`install-global.sh`）保留作为开发者本地部署路径，与 TS 实现并存（Design Doc §风险表接受此重复）。

**Tech Stack:** TypeScript（strict, ESM, target/module ESNext, moduleResolution bundler）、Bun runtime、Node fs API（`cpSync` Node 16.7+）、`comment-json`（已是依赖）、Bun test

## Global Constraints

- **运行时**: Bun；`"type": "module"` ESM；相对导入必须带 `.js` 扩展名（bundler resolution）
- **Node 内置模块**: 一律 `node:` 前缀（`node:fs`、`node:path`、`node:os`、`node:url`、`node:child_process`）
- **strict 零类型错误**: 所有改动必须通过 `tsc`
- **容错策略**: installer 内每步独立 try-catch，失败 `console.warn` 后继续，**不得抛非零退出码**（避免污染 `npm install` 主流程）
- **事件 hook 只读**: 不改 `src/index.ts` 的事件处理逻辑
- **无 console.log 干扰主流程**: installer 内允许 `console.warn`/`console.log`（面向安装用户），但不得在运行时插件代码中新增
- **路径解析**:
  - 包根目录：`path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')`（dist/ 上一级即包根）
  - 项目级目标：`<INIT_CWD || cwd>/.opencode/plugins/opencode-lark-bridge/`
  - 全局目标：`~/.config/opencode/plugins/opencode-lark-bridge/`
- **配置注册路径约定**:
  - 项目级注册到 `.opencode/opencode.jsonc` 的 `plugin` 数组，路径为 `./plugins/opencode-lark-bridge`（相对于 `.opencode/` 目录）
  - 全局注册到 `~/.config/opencode/opencode.jsonc`，路径为绝对路径 `~/.config/opencode/plugins/opencode-lark-bridge`
- **测试**: Bun test，`tests/*.test.ts` 与源码同名映射；注入 mock `execFn` 避免真实 `bun install`/`npm install`；临时目录隔离
- **保留现有 shell 脚本**: `scripts/install-local.sh`、`scripts/install-global.sh`、`scripts/lib/config-register.sh` 不删除，作为开发者本地源码部署路径；TS 版本服务于 npm 发布包

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/installer.ts` | 新建 | `installPlugin` + `copyPluginFiles` + `installDependencies` + 包根路径解析 |
| `src/config-register.ts` | 新建 | `registerPluginConfig`（comment-json 解析+序列化，保留注释） |
| `src/postinstall.ts` | 修改 | `main()` 改调 `installPlugin`；保留 `isGlobalInstall`/`resolveTargetDir`/`initConfig` |
| `src/cli.ts` | 修改 | 新增 `install` 子命令分支 + 更新 `printHelp()` |
| `package.json` | 修改 | 补充 description/keywords/license/repository/homepage/bugs/author/engines/files + prepublishOnly/pack:dry/test:install scripts |
| `LICENSE` | 新建 | MIT 许可证，2026 leo-lab-2026 |
| `docs/PUBLISH.md` | 新建 | 发布前检查清单 + 发布步骤 + 版本管理 + 回滚策略 |
| `scripts/test-install.sh` | 新建 | 本地 npm pack + install 端到端验证 |
| `README.md` | 修改 | npm install 用法 + 指向 docs/PUBLISH.md |
| `tests/installer.test.ts` | 新建 | installPlugin/copyPluginFiles/installDependencies 单元测试 |
| `tests/config-register.test.ts` | 新建 | registerPluginConfig 项目级/全局、已注册/新建/追加场景 |
| `tests/cli.test.ts` | 新建 | install 子命令分支测试 |
| `tests/postinstall.test.ts` | 保留 | 现有测试不变，验证未回归 |

---

## Task 1: installer.ts 核心安装逻辑

**Files:**
- Create: `src/installer.ts`
- Create: `tests/installer.test.ts`
- Modify: `src/postinstall.ts`（仅 `main()`，Task 1.5）
- Reference: `src/postinstall.ts`（复用 `isGlobalInstall`/`resolveTargetDir`/`initConfig`）

**Dependencies:** 无（基础模块，被 Task 2、Task 1.5 依赖）

**Interfaces:**
```typescript
// src/installer.ts
import type { ExecSyncOptions } from "node:child_process"

type ExecFn = (cmd: string, opts?: ExecSyncOptions) => string

interface InstallOptions {
  global?: boolean
  execFn?: ExecFn  // 注入用于测试；默认用 execSync
}

export function installPlugin(options?: InstallOptions): void
export function copyPluginFiles(pluginDir: string, sourceDir?: string): void
export function installDependencies(pluginDir: string, execFn?: ExecFn): void
export function getPackageRoot(): string  // 暴露便于测试
```

### Step 1.1: 创建 installer.ts 骨架 + getPackageRoot

- [ ] **创建 `src/installer.ts`**，实现包根目录解析函数：

```typescript
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync, type ExecSyncOptions } from "node:child_process"
import { fileURLToPath } from "node:url"
import { isGlobalInstall, resolveTargetDir, initConfig } from "./postinstall.js"
import { registerPluginConfig } from "./config-register.js"

type ExecFn = (cmd: string, opts?: ExecSyncOptions) => string

export interface InstallOptions {
  global?: boolean
  execFn?: ExecFn
}

const PLUGIN_NAME = "opencode-lark-bridge"

// 包根目录：dist/ 的上一级（发布包结构 dist/ + package.json + ... ）
export function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
}

// 插件目标目录：.opencode/plugins/<name>/
export function getPluginDir(global: boolean): string {
  const base = global
    ? path.join(os.homedir(), ".config", "opencode")
    : path.join(process.env.INIT_CWD || process.cwd(), ".opencode")
  return path.join(base, "plugins", PLUGIN_NAME)
}
```

**Verify:** `npm run build` 编译通过，无类型错误。

### Step 1.2: 实现 copyPluginFiles

- [ ] **实现 `copyPluginFiles(pluginDir, sourceDir?)`**，用 Node fs API（`cpSync`）复制文件：

```typescript
const FILES_TO_COPY = [
  "dist",
  "package.json",
  "bun.lock",
  "opencode-lark-bridge.config.example.jsonc",
]

export function copyPluginFiles(pluginDir: string, sourceDir?: string): void {
  const src = sourceDir || getPackageRoot()
  mkdirSync(pluginDir, { recursive: true })

  for (const item of FILES_TO_COPY) {
    const from = path.join(src, item)
    const to = path.join(pluginDir, item)
    if (!existsSync(from)) continue  // bun.lock 可能不存在，跳过
    if (item === "dist") {
      rmSync(to, { recursive: true, force: true })
      cpSync(from, to, { recursive: true })
    } else {
      cpSync(from, to, { force: true })
    }
  }
}
```

关键点：
- `dist/` 目录先删后复制，确保覆盖旧产物
- `bun.lock` 可能不存在（纯 npm 项目），用 `existsSync` 守卫跳过
- `sourceDir` 参数用于测试时注入临时源目录

**Verify:** 单独 `tsc` 编译通过。

### Step 1.3: 实现 installDependencies

- [ ] **实现 `installDependencies(pluginDir, execFn?)`**，优先 bun，回退 npm：

```typescript
export function installDependencies(pluginDir: string, execFn?: ExecFn): void {
  const exec = execFn || ((cmd: string, opts?: ExecSyncOptions) =>
    execSync(cmd, { cwd: pluginDir, stdio: "pipe", encoding: "utf-8", ...opts }))

  const tryCmd = (cmd: string): boolean => {
    try {
      exec(cmd, { cwd: pluginDir, stdio: "pipe", encoding: "utf-8" })
      return true
    } catch {
      return false
    }
  }

  // 优先 bun install --production
  if (tryCmd("bun install --production")) {
    console.log("Dependencies installed via bun")
    return
  }

  // 回退 npm install --production
  if (tryCmd("npm install --production")) {
    console.log("Dependencies installed via npm")
    return
  }

  console.warn("Could not install dependencies: neither bun nor npm available. Plugin may not work until deps are installed manually.")
}
```

关键点：
- `execFn` 注入点：测试时传入 mock 验证命令调用，避免真实安装
- 两个都失败只 `console.warn`，不抛异常
- `stdio: "pipe"` 避免污染安装方终端输出

**Verify:** 单独 `tsc` 编译通过。

### Step 1.4: 实现 installPlugin 主入口

- [ ] **实现 `installPlugin(options?)`**，编排完整安装流程：

```typescript
export function installPlugin(options?: InstallOptions): void {
  const global = options?.global ?? isGlobalInstall()
  const execFn = options?.execFn

  try {
    const pluginDir = getPluginDir(global)
    console.log(`Installing opencode-lark-bridge to ${pluginDir} (${global ? "global" : "project"})`)

    // 1. 复制文件
    try {
      copyPluginFiles(pluginDir)
    } catch (err) {
      console.warn(`Warning: Failed to copy plugin files: ${err}`)
      return
    }

    // 2. 安装依赖
    try {
      installDependencies(pluginDir, execFn)
    } catch (err) {
      console.warn(`Warning: Dependency installation failed: ${err}`)
    }

    // 3. 配置种子（initConfig 保留现有逻辑）
    try {
      const targetDir = global
        ? path.join(os.homedir(), ".config", "opencode")
        : path.join(process.env.INIT_CWD || process.cwd(), ".opencode")
      const result = initConfig({ targetDir })
      console.log(result.created
        ? `Created example config at ${result.path}`
        : `Preserved existing config at ${result.path}`)
    } catch (err) {
      console.warn(`Warning: Config seed failed: ${err}`)
    }

    // 4. 注册插件到 opencode.jsonc
    try {
      const pluginPath = global
        ? pluginDir  // 绝对路径
        : `./plugins/${PLUGIN_NAME}`  // 相对于 .opencode/ 的路径
      registerPluginConfig({ global, pluginPath })
    } catch (err) {
      console.warn(`Warning: Plugin config registration failed: ${err}`)
    }

    console.log(`✓ opencode-lark-bridge installed to ${pluginDir}`)
  } catch (err) {
    // 顶层兜底：任何未捕获错误都降级为警告
    console.warn(`Warning: Installation incomplete: ${err}`)
  }
}
```

关键点：
- 每个步骤独立 try-catch，互不阻塞
- `pluginPath` 项目级用相对路径 `./plugins/opencode-lark-bridge`，全局用绝对路径
- 顶层 try-catch 兜底，保证 `process.exit(1)` 永不触发

**Verify:** `npm run build` 编译通过。

### Step 1.5: 重写 postinstall.ts main()

- [ ] **修改 `src/postinstall.ts`** 的 `main()` 函数，改为调用 `installPlugin`：

将现有 `main()`（102-110 行）替换为：

```typescript
async function main(): Promise<void> {
  // 动态导入避免循环依赖（installer.ts 导入了 postinstall.ts 的函数）
  const { installPlugin } = await import("./installer.js")
  installPlugin({ global: isGlobalInstall() })
}
```

保留以下函数**不变**：
- `getGlobalPrefix()`、`getCurrentDir()`、`isInsideGlobalPath()`、`isGlobalInstall()`、`resolveTargetDir()`、`initConfig()`（均 `export`，被 installer.ts 复用 + 被现有测试覆盖）

保留底部的直接执行入口：
```typescript
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
```

关键点：
- 用动态 `import()` 避免循环依赖（installer.ts 静态导入 postinstall.ts，postinstall.ts 不能静态导入 installer.ts）
- `main()` 改为 `async`，但调用处不需要 await（fire-and-forget，postinstall 脚本退出即可）

**Verify:**
```bash
npm run build  # 编译通过
bun test tests/postinstall.test.ts  # 现有测试仍通过（未回归）
```

### Step 1.6: 编写 installer.test.ts

- [ ] **创建 `tests/installer.test.ts`**，覆盖以下场景：

```typescript
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { copyPluginFiles, installDependencies } from "../src/installer"
```

**测试用例设计：**

1. **`copyPluginFiles` 测试组**：
   - `creates target dir and copies dist/ + package.json + example config`
     - 准备临时 sourceDir：创建 `dist/`（内含 `index.js`）、`package.json`、`opencode-lark-bridge.config.example.jsonc`、`bun.lock`
     - 调用 `copyPluginFiles(targetPluginDir, sourceDir)`
     - 断言 `existsSync(targetPluginDir/dist/index.js)` 为 true
     - 断言 `existsSync(targetPluginDir/package.json)` 为 true
     - 断言 `existsSync(targetPluginDir/opencode-lark-bridge.config.example.jsonc)` 为 true
   - `overwrites existing dist/ on re-install`
     - 先复制一次，修改 dist/index.js 内容，再复制，断言内容被覆盖
   - `skips missing bun.lock gracefully`
     - sourceDir 不含 bun.lock，调用不报错

2. **`installDependencies` 测试组**：
   - `calls bun install first`
     - 注入 mock execFn，记录调用命令
     - 断言首次调用命令包含 `bun install`
   - `falls back to npm install when bun fails`
     - mock execFn：首次（bun）抛错，二次（npm）成功
     - 断言 npm 被调用
   - `warns when both fail`
     - mock execFn 总抛错
     - 断言 `console.warn` 被调用（用 `mock` 拦截）

3. **`installPlugin` 集成测试组**（需 mock `registerPluginConfig`，或用临时目录全流程）：
   - `project-level install creates plugin dir and config`
     - 设 `INIT_CWD` 为临时目录，调用 `installPlugin({ global: false, execFn: mockExec })`
     - 断言 `<tmpdir>/.opencode/plugins/opencode-lark-bridge/dist/` 存在
     - 断言 `<tmpdir>/.opencode/opencode-lark-bridge.config.jsonc` 存在
   - `global install targets ~/.config/opencode`
     - 设 `npm_config_global=true`，调用 `installPlugin({ global: true, execFn: mockExec })`
     - 断言 `~/.config/opencode/plugins/opencode-lark-bridge/` 路径被使用（可能需 mock `os.homedir` 或用环境变量隔离）
   - `does not throw when copy fails`
     - 注入不存在的 sourceDir（通过 mock getPackageRoot 或直接测 installPlugin 的 try-catch）
     - 断言不抛异常

**Verify:**
```bash
bun test tests/installer.test.ts  # 全部通过
npm run build  # 编译通过
```

---

## Task 2: config-register.ts（JSONC 配置注册）

**Files:**
- Create: `src/config-register.ts`
- Create: `tests/config-register.test.ts`

**Dependencies:** 无（被 Task 1.4 的 `installPlugin` 调用）

**Interfaces:**
```typescript
// src/config-register.ts
export interface RegisterOptions {
  global: boolean
  pluginPath: string  // 项目级: "./plugins/opencode-lark-bridge"，全局: 绝对路径
}

export function registerPluginConfig(options: RegisterOptions): void
```

### Step 2.1: 实现 registerPluginConfig

- [ ] **创建 `src/config-register.ts`**，用 `comment-json` 解析+序列化：

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { parse, stringify } from "comment-json"

export interface RegisterOptions {
  global: boolean
  pluginPath: string
}

const SCHEMA_URL = "https://opencode.ai/config.json"

// 按优先级查找目标配置文件
function findConfigFile(global: boolean): string {
  const candidates = global
    ? [
        path.join(os.homedir(), ".config", "opencode", "opencode.jsonc"),
        path.join(os.homedir(), ".config", "opencode", "opencode.json"),
      ]
    : [
        path.join(process.cwd(), ".opencode", "opencode.jsonc"),
        path.join(process.cwd(), "opencode.jsonc"),
        path.join(process.cwd(), ".opencode", "opencode.json"),
        path.join(process.cwd(), "opencode.json"),
      ]

  for (const f of candidates) {
    if (existsSync(f)) return f
  }
  // 都不存在 -> 默认创建 .opencode/opencode.jsonc（项目级）或全局对应路径
  return global
    ? path.join(os.homedir(), ".config", "opencode", "opencode.jsonc")
    : path.join(process.cwd(), ".opencode", "opencode.jsonc")
}

export function registerPluginConfig(options: RegisterOptions): void {
  const { global, pluginPath } = options
  const configFile = findConfigFile(global)

  // 文件不存在 -> 创建新配置
  if (!existsSync(configFile)) {
    mkdirSync(path.dirname(configFile), { recursive: true })
    const newConfig: Record<string, unknown> = {
      $schema: SCHEMA_URL,
      plugin: [pluginPath],
    }
    writeFileSync(configFile, stringify(newConfig, null, 2))
    console.log(`Created config with plugin registration: ${configFile}`)
    return
  }

  // 文件存在 -> 读取并检查
  const raw = readFileSync(configFile, "utf-8")
  const isJsonc = configFile.endsWith(".jsonc")
  let config: any
  try {
    config = isJsonc ? parse(raw) : JSON.parse(raw)
  } catch (err) {
    console.warn(`Warning: Could not parse ${configFile}, skipping registration: ${err}`)
    return
  }

  // 检查是否已注册
  const plugins: string[] = Array.isArray(config.plugin) ? config.plugin : []
  const alreadyRegistered = plugins.some(
    (p: string) => p === pluginPath || (typeof p === "string" && p.endsWith(pluginPath))
  )
  if (alreadyRegistered) {
    console.log(`Plugin already registered in ${configFile}`)
    return
  }

  // 追加到 plugin 数组（若字段不存在则创建）
  if (!config.plugin) {
    config.plugin = [pluginPath]
  } else {
    config.plugin.push(pluginPath)
  }

  // 序列化回写（jsonc 用 comment-json stringify 保留注释）
  const output = isJsonc ? stringify(config, null, 2) : JSON.stringify(config, null, 2)
  writeFileSync(configFile, output)
  console.log(`Added plugin to: ${configFile}`)
}
```

关键点：
- `comment-json` 的 `parse()` 保留注释为 symbol 属性，`stringify()` 能还原注释
- 项目级路径优先级：`.opencode/opencode.jsonc` > `opencode.jsonc` > `.opencode/opencode.json` > `opencode.json`
- 全局路径优先级：`~/.config/opencode/opencode.jsonc` > `~/.config/opencode/opencode.json`
- 已注册检查用 `endsWith` 兼容绝对/相对路径差异
- 解析失败降级为 warn，不抛异常

**Verify:** `npm run build` 编译通过。

### Step 2.2: 编写 config-register.test.ts

- [ ] **创建 `tests/config-register.test.ts`**，覆盖所有场景：

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { registerPluginConfig } from "../src/config-register"
```

**测试用例设计：**

1. **项目级场景**（mock `process.cwd()` 为临时目录）：
   - `creates new .opencode/opencode.jsonc when none exists`
     - 空临时目录，调用 `registerPluginConfig({ global: false, pluginPath: "./plugins/opencode-lark-bridge" })`
     - 断言 `.opencode/opencode.jsonc` 被创建
     - 断言内容含 `"plugin": ["./plugins/opencode-lark-bridge"]`
   - `appends to existing opencode.jsonc with comments preserved`
     - 预置 `.opencode/opencode.jsonc` 内容含 `// my comment` 和 `"plugin": ["./other-plugin"]`
     - 调用注册
     - 断言注释 `// my comment` 仍在
     - 断言 `plugin` 数组含两个元素
   - `skips when already registered`
     - 预置配置已含 `./plugins/opencode-lark-bridge`
     - 调用注册
     - 断言文件内容未变（用 mtime 或内容比较）
   - `appends plugin field when config exists but has no plugin key`
     - 预置 `.opencode/opencode.jsonc` 含 `{"$schema": "..."}` 无 plugin 字段
     - 调用注册
     - 断言新增 `plugin: ["./plugins/opencode-lark-bridge"]`
   - `prefers .opencode/opencode.jsonc over opencode.json`
     - 同时存在两个文件，调用注册
     - 断言写入的是 `.opencode/opencode.jsonc`

2. **全局场景**（mock `os.homedir()` 或用环境变量）：
   - `creates global config at ~/.config/opencode/opencode.jsonc`
   - `uses absolute path for global registration`
     - 断言写入的路径是绝对路径

3. **容错场景**：
   - `warns on unparseable jsonc`
     - 预置损坏的 JSONC 内容
     - 调用不抛异常，`console.warn` 被调用

**Verify:**
```bash
bun test tests/config-register.test.ts  # 全部通过
npm run build
```

---

## Task 3: cli.ts install 子命令

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli.test.ts`

**Dependencies:** Task 1（`installPlugin`）

### Step 3.1: 新增 install 命令分支

- [ ] **修改 `src/cli.ts`**，在 `main()` 中新增 `install` 命令分支：

当前 `cli.ts` 只支持 `init` 命令。修改 `main()` 函数，在 `init` 分支之后、`Unknown command` 之前插入：

```typescript
import { initConfig } from "./postinstall.js"
// 新增导入（动态，避免 cli 启动时加载 installer 依赖链）
// 在 install 分支内动态 import

function main(): void {
  const args = process.argv.slice(2)
  const command = args[0] || "init"

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp()
    return
  }

  if (command === "init") {
    // ... 现有 init 逻辑保持不变 ...
    return
  }

  if (command === "install") {
    const globalFlag = args.includes("--global") || args.includes("-g")
    runInstall(globalFlag)
    return
  }

  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
}

async function runInstall(global: boolean): Promise<void> {
  try {
    const { installPlugin } = await import("./installer.js")
    installPlugin({ global })
  } catch (err) {
    console.error(`Install failed: ${err}`)
    // 不 process.exit(1)，让错误可见但不崩溃
  }
}
```

关键点：
- 动态 `import("./installer.js")` 避免 cli 启动时加载全部安装依赖（init 命令不需要）
- `runInstall` 用 try-catch 包裹，失败输出错误但不 `process.exit(1)`
- `init` 逻辑保持完全不变

### Step 3.2: 更新 printHelp()

- [ ] **更新 `printHelp()`** 增加 install 命令说明：

```typescript
function printHelp(): void {
  console.log(`Usage: opencode-lark-bridge <command> [options]

Commands:
  init                Create example config in current project (.opencode/)
  init --global, -g   Create example config in global ~/.config/opencode/
  install             Install plugin files + deps + config registration (project)
  install --global, -g  Install to ~/.config/opencode/ (global)
  help                Show this help message
`)
}
```

注意修正：原 `printHelp` 中全局 init 路径写的是 `~/.opencode/`（错误），应为 `~/.config/opencode/`，一并修正。

### Step 3.3: 编写 cli.test.ts

- [ ] **创建 `tests/cli.test.ts`**，验证 install 命令分支：

```typescript
import { describe, it, expect, mock } from "bun:test"
```

**测试策略**：由于 `main()` 调用 `process.exit`，测试需要 mock `process.argv` + 拦截 `console.log/error` + mock `installPlugin`。

**测试用例设计：**

1. `install command without --global calls installPlugin({ global: false })`
   - mock `import("./installer.js")` 的 `installPlugin`（用 `mock.module` 或 spy）
   - 设 `process.argv = ["node", "cli.js", "install"]`
   - 调用 main()
   - 断言 `installPlugin` 被调用且 `global === false`

2. `install --global calls installPlugin({ global: true })`
   - 同上，argv 含 `--global`

3. `install -g (short flag) works`
   - argv 含 `-g`

4. `help command shows install in output`
   - 拦截 `console.log`
   - 调用 help 分支
   - 断言输出含 `install`

5. `unknown command still exits with error`
   - argv = ["node", "cli.js", "foobar"]
   - 断言 `process.exit` 被调用（mock）

**Verify:**
```bash
bun test tests/cli.test.ts
npm run build
```

---

## Task 4: package.json npm 发布合规整改

**Files:**
- Modify: `package.json`
- Create: `LICENSE`

**Dependencies:** 无（可并行于 Task 1-3）

### Step 4.1: 补充发布合规字段

- [ ] **修改 `package.json`**，在现有字段基础上补充：

```json
{
  "name": "opencode-lark-bridge",
  "version": "0.1.0",
  "description": "OpenCode plugin to push permission/task/question events to Feishu (Lark) via lark-cli",
  "license": "MIT",
  "author": "leo-lab-2026",
  "homepage": "https://github.com/leo-lab-2026/opencode-lark-bridge",
  "repository": {
    "type": "git",
    "url": "https://github.com/leo-lab-2026/opencode-lark-bridge.git"
  },
  "bugs": {
    "url": "https://github.com/leo-lab-2026/opencode-lark-bridge/issues"
  },
  "keywords": [
    "opencode",
    "lark",
    "feishu",
    "plugin",
    "notification",
    "bot"
  ],
  "type": "module",
  "main": "./index.js",
  "bin": {
    "opencode-lark-bridge": "./dist/cli.js"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "dist",
    "opencode-lark-bridge.config.example.jsonc",
    "README.md",
    "package.json",
    "bun.lock"
  ],
  ...
}
```

关键点：
- `main` 字段当前是 `"./index.js"`，但实际入口在 `dist/index.js`，需确认是否修正为 `"./dist/index.js"`（**待执行者确认 OpenCode 插件加载机制**；若 OpenCode 按插件目录的 `package.json.main` 解析，则需为 `./dist/index.js`）
- `files` 新增 `package.json`（默认包含，但显式声明更安全）和 `bun.lock`
- `engines.node >= 18` 因为用到 `fs.cpSync`（Node 16.7+，但 18 是 LTS）

### Step 4.2: 新增 npm scripts

- [ ] **在 `package.json` 的 `scripts` 中新增**：

```json
{
  "scripts": {
    "build": "tsc",
    "test": "bun test",
    "install:local": "bash scripts/install-local.sh",
    "install:global": "bash scripts/install-global.sh",
    "prepublishOnly": "npm run build && bun test",
    "pack:dry": "npm pack --dry-run",
    "test:install": "bash scripts/test-install.sh",
    "postinstall": "node -e \"if (require('fs').existsSync('./dist/postinstall.js')) require('child_process').execFileSync(process.execPath, ['./dist/postinstall.js'], {stdio: 'inherit'})\""
  }
}
```

关键点：
- `prepublishOnly` 在 `npm publish` 前自动执行 build + test，防止发布坏包
- `pack:dry` 验证包内容
- `test:install` 运行本地端到端测试脚本（Task 5）
- `postinstall` 保持现有逻辑不变（条件检查 `dist/postinstall.js` 存在才执行）

### Step 4.3: 创建 LICENSE 文件

- [ ] **创建 `LICENSE`** 文件（MIT，2026，leo-lab-2026）：

```
MIT License

Copyright (c) 2026 leo-lab-2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Step 4.4: 验证 postinstall 在发布包内正确执行

- [ ] **验证 postinstall 条件检查逻辑**：

当前 postinstall 脚本：`node -e "if (require('fs').existsSync('./dist/postinstall.js')) require('child_process').execFileSync(process.execPath, ['./dist/postinstall.js'], {stdio: 'inherit'})"`

验证点：
- `files` 字段包含 `dist`，所以 `dist/postinstall.js` 会被打包
- 安装时 `cwd` 为消费者项目的 `node_modules/opencode-lark-bridge/`，`./dist/postinstall.js` 相对路径正确
- 若从 git 直接安装（非 npm pack），`dist/` 可能不存在 -> postinstall 静默跳过（符合预期）

验证方法：
```bash
npm run build
npm pack --dry-run 2>&1 | grep -E "dist/postinstall|dist/cli|package.json|README|example.jsonc|bun.lock"
```

**Verify:**
```bash
npm run build
npm pack --dry-run  # 确认文件列表只含 files 声明
```

---

## Task 5: 发布流程文档 + 本地测试脚本 + README 更新

**Files:**
- Create: `docs/PUBLISH.md`
- Create: `scripts/test-install.sh`
- Modify: `README.md`

**Dependencies:** Task 4（package.json 整改完成）

### Step 5.1: 创建 docs/PUBLISH.md

- [ ] **创建 `docs/PUBLISH.md`**，内容覆盖：

```markdown
# 发布流程

本文档描述 opencode-lark-bridge npm 包的发布流程。

## 发布前检查清单

- [ ] `npm run build` 编译无错误
- [ ] `bun test` 全部测试通过
- [ ] `npm run test:install` 本地安装验证通过
- [ ] `npm run pack:dry` 包内容只含 files 声明的文件
- [ ] `package.json` 的 `version` 已更新
- [ ] CHANGELOG 已更新（如有）

## 发布步骤

1. 确认工作区干净：`git status`
2. 更新版本号：
   ```bash
   npm version patch  # 或 minor / major
   ```
   此命令会自动 git commit + tag。
3. 发布到 npm：
   ```bash
   npm publish
   ```
   `prepublishOnly` 脚本会自动执行 build + test。
4. 推送代码和标签：
   ```bash
   git push --follow-tags
   ```
5. 创建 GitHub Release：
   - 从刚推送的 tag 创建 Release
   - 附 changelog 说明

## 版本管理

遵循语义化版本（SemVer）：

- **patch**（0.1.0 -> 0.1.1）：bug 修复
- **minor**（0.1.0 -> 0.2.0）：向后兼容的新功能
- **major**（0.1.0 -> 1.0.0）：不兼容的变更

## 回滚策略

- **72 小时内**：`npm unpublish opencode-lark-bridge@<version>`（npm 限制发布 72h 后不可 unpublish）
- **72 小时后**：`git revert` + 发布修复版本（递增 patch）

## 本地测试安装

发布前用 `scripts/test-install.sh` 验证完整安装流程：

```bash
npm run test:install
```

该脚本会：
1. `npm pack` 生成 tarball
2. 在临时目录执行项目级 `npm install <tarball>`
3. 验证插件文件、配置种子、plugin 注册
4. 清理后执行全局安装验证
5. 清理临时目录和全局安装
```

### Step 5.2: 创建 scripts/test-install.sh

- [ ] **创建 `scripts/test-install.sh`**，自动化验证安装流程：

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR_BASE="$(mktemp -d)"
trap 'cleanup' EXIT

cleanup() {
  rm -rf "$TMPDIR_BASE"
  # 清理可能的全局安装
  npm uninstall -g opencode-lark-bridge 2>/dev/null || true
}

cd "$PROJECT_ROOT"

echo "=== 1. Build ==="
npm run build

echo "=== 2. Test ==="
bun test

echo "=== 3. Pack ==="
TARBALL=$(npm pack | tail -1)
TARBALL_PATH="$PROJECT_ROOT/$TARBALL"
echo "Tarball: $TARBALL_PATH"

echo "=== 4. Project-level install test ==="
PROJ_TEST="$TMPDIR_BASE/project-test"
mkdir -p "$PROJ_TEST"
cd "$PROJ_TEST"
npm init -y >/dev/null
npm install "$TARBALL_PATH"

echo "--- Verifying project-level install ---"
test -d ".opencode/plugins/opencode-lark-bridge/dist/" || { echo "FAIL: plugin dist/ not found"; exit 1; }
test -f ".opencode/plugins/opencode-lark-bridge/package.json" || { echo "FAIL: plugin package.json not found"; exit 1; }
test -f ".opencode/opencode-lark-bridge.config.jsonc" || { echo "FAIL: config seed not found"; exit 1; }
test -f ".opencode/opencode.jsonc" || { echo "FAIL: opencode.jsonc not created"; exit 1; }
grep -q "opencode-lark-bridge" ".opencode/opencode.jsonc" || { echo "FAIL: plugin not registered"; exit 1; }
echo "PASS: project-level install"

echo "=== 5. Global install test ==="
npm install -g "$TARBALL_PATH"

echo "--- Verifying global install ---"
GLOBAL_PLUGIN_DIR="$HOME/.config/opencode/plugins/opencode-lark-bridge"
test -d "$GLOBAL_PLUGIN_DIR/dist/" || { echo "FAIL: global plugin dist/ not found"; exit 1; }
test -f "$HOME/.config/opencode/opencode.jsonc" || { echo "FAIL: global opencode.jsonc not found"; exit 1; }
grep -q "opencode-lark-bridge" "$HOME/.config/opencode/opencode.jsonc" || { echo "FAIL: global plugin not registered"; exit 1; }
echo "PASS: global install"

echo "=== 6. CLI install command test ==="
cd "$TMPDIR_BASE"
mkdir -p cli-test && cd cli-test
npx opencode-lark-bridge install
test -d ".opencode/plugins/opencode-lark-bridge/dist/" || { echo "FAIL: CLI install did not create plugin dir"; exit 1; }
echo "PASS: CLI install command"

echo ""
echo "✓ All install tests passed"
```

关键点：
- `set -euo pipefail` 严格模式
- `trap cleanup EXIT` 确保临时目录清理
- 全局安装后尝试 `npm uninstall -g` 清理
- 每步失败立即 `exit 1`
- 验证三个入口：postinstall（项目级/全局）+ CLI install

### Step 5.3: 更新 README.md 安装说明

- [ ] **修改 `README.md`** 的安装章节，增加 npm install 用法和发布文档链接：

在现有「安装」章节后补充说明 postinstall 自动安装行为，并在末尾添加：

```markdown
## 发布

若要自行发布此包，请参考 [docs/PUBLISH.md](./docs/PUBLISH.md)。

## 本地测试安装

发布前验证完整安装流程：

```bash
npm run test:install
```
```

同时更新「安装」章节，说明 `npm install opencode-lark-bridge` 后 postinstall 会自动：
1. 复制插件文件到 `.opencode/plugins/opencode-lark-bridge/`
2. 安装插件依赖
3. 创建示例配置（已存在则保留）
4. 注册插件到 `.opencode/opencode.jsonc`

**Verify:**
```bash
bash scripts/test-install.sh  # 完整端到端验证（需 bun/npm 可用）
```

---

## Task 6: 验证与收尾

**Files:** 无新增（全量验证）

**Dependencies:** Task 1-5 全部完成

### Step 6.1: TypeScript 编译验证

- [ ] **运行全量编译**：

```bash
npm run build
```

预期：`tsc` 无错误，`dist/` 下生成 `installer.js`、`installer.d.ts`、`config-register.js`、`config-register.d.ts`、更新后的 `postinstall.js`、`cli.js`。

### Step 6.2: 全量测试

- [ ] **运行全部单元测试**：

```bash
bun test
```

预期：所有测试通过，包括：
- `tests/postinstall.test.ts`（现有，未回归）
- `tests/installer.test.ts`（新增）
- `tests/config-register.test.ts`（新增）
- `tests/cli.test.ts`（新增）
- 其他现有测试（config.test.ts、index.test.ts 等）

### Step 6.3: npm pack 验证包内容

- [ ] **验证发布包内容**：

```bash
npm run pack:dry
```

预期输出只包含 `files` 字段声明的文件：
- `dist/**`（含 installer.js、config-register.js、postinstall.js、cli.js、index.js 等）
- `opencode-lark-bridge.config.example.jsonc`
- `README.md`
- `package.json`
- `bun.lock`
- `LICENSE`（npm 默认包含，无需声明）

**不应包含**：`src/`、`tests/`、`scripts/`、`docs/`、`.opencode/`、`openspec/`、`.codegraph` 等。

### Step 6.4: 本地端到端安装验证

- [ ] **运行完整安装测试脚本**：

```bash
npm run test:install
```

预期：所有步骤 PASS（项目级安装、全局安装、CLI install 命令）。

若全局安装步骤因权限/环境影响失败，可接受降级为仅验证项目级 + CLI install。

### Step 6.5: CLI install 命令手动验证

- [ ] **手动验证 CLI install**：

```bash
# 在临时项目目录
mkdir -p /tmp/cli-verify && cd /tmp/cli-verify
npx opencode-lark-bridge install
ls -la .opencode/plugins/opencode-lark-bridge/dist/
cat .opencode/opencode.jsonc
```

预期：插件文件就位，`opencode.jsonc` 含 plugin 注册。

### Step 6.6: 回归确认

- [ ] **确认现有功能未回归**：

```bash
# 现有 shell 安装脚本仍可用
npm run install:local  # 开发者本地路径
ls .opencode/plugins/opencode-lark-bridge/dist/index.js
```

预期：shell 脚本路径与 TS installer 路径并存，都能正常工作。

---

## 任务依赖关系总览

```
Task 2 (config-register.ts) ──┐
                              ├──> Task 1 (installer.ts) ──> Task 1.5 (postinstall main)
Task 4 (package.json)  ────────────┘                                 │
                                                                    v
Task 3 (cli.ts install) ──> 依赖 Task 1 (installPlugin)        Task 6 (验证)
                                                                    ^
Task 5 (文档+脚本) ──> 依赖 Task 4 (package.json scripts) ───────┘
```

**推荐执行顺序**：
1. Task 2（config-register.ts，无依赖）
2. Task 1.1-1.4（installer.ts 核心）
3. Task 1.5（postinstall main 重写）
4. Task 1.6（installer 测试）
5. Task 3（cli.ts install 子命令）
6. Task 4（package.json + LICENSE，可与 Task 1-3 并行）
7. Task 5（文档 + test-install.sh + README）
8. Task 6（全量验证）

**可并行**：Task 4 与 Task 1-3 无依赖；Task 2 与 Task 1.1-1.3 可并行。

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| postinstall 在 pnpm/yarn 下 `INIT_CWD` 差异 | 三重探测（`npm_config_global` + `INIT_CWD` 路径 + 当前文件路径）+ `process.cwd()` 回退 |
| Windows 兼容性 | 全用 Node fs API（`cpSync` Node 16.7+），无 shell 调用（`installDependencies` 除外，但 bun/npm 本身跨平台） |
| postinstall 失败影响 `npm install` | 全步骤 try-catch 静默降级，顶层兜底，永不 `process.exit(1)` |
| `bun.lock` 在纯 npm 项目中不存在 | `copyPluginFiles` 用 `existsSync` 守卫跳过 |
| config-register 逻辑重复（sh + TS） | Design Doc §风险表已接受此重复以保留 sh 脚本独立性 |
| `comment-json` stringify 丢失注释 | comment-json 设计即保留注释；测试用例明确验证注释保留 |
| 首次发布字段遗漏 | `prepublishOnly`（build+test）+ `pack:dry` + `test:install` 三重验证 |
| 循环依赖（installer ↔ postinstall） | postinstall 的 `main()` 用动态 `import()` 拉取 installer |

---

## 完成标准

- [ ] `npm run build` 零错误
- [ ] `bun test` 全部通过（含新增 3 个测试文件）
- [ ] `npm run pack:dry` 包内容只含 `files` 声明
- [ ] `npm run test:install` 端到端验证通过
- [ ] `npx opencode-lark-bridge install` 手动验证可用
- [ ] `docs/PUBLISH.md` 发布流程文档完整
- [ ] `LICENSE` MIT 文件就位
- [ ] `package.json` 合规字段齐全
- [ ] 现有 `tests/postinstall.test.ts` 未回归
