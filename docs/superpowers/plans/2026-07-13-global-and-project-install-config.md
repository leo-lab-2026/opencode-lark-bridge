---
change: global-and-project-install-config
design-doc: docs/superpowers/specs/2026-07-13-global-and-project-install-config-design.md
base-ref: 0e79d0b0648a81acfb3911e6af98fb25de809d21
archived-with: 2026-07-13-global-and-project-install-config
---

# 全局与项目级安装配置统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 `opencode-lark-bridge` 插件的项目级与全局级安装路径，将全局配置目录从 `~/.opencode/` 迁移到 `~/.config/opencode/`，项目级配置固定到 `<ctx.directory>/.opencode/`，并彻底移除插件目录内的配置依赖。

**Architecture:** 安装脚本负责把编译产物部署到约定插件目录并在对应配置目录首次生成示例配置；运行时 `resolveConfigPath` 只按 `<ctx.directory>/.opencode/` → `~/.config/opencode/` 顺序查找配置，找不到或校验失败则安全降级为 no-op Hooks。全局与项目级脚本共享构建/复制逻辑，仅顶部目标目录常量不同。

**Tech Stack:** TypeScript, Bash, Bun test, npm scripts

## Global Constraints

- 全局配置目录统一为 `~/.config/opencode/`，全局插件目录为 `~/.config/opencode/plugins/opencode-lark-bridge/`。
- 项目级配置目录固定为 `<ctx.directory>/.opencode/`。
- 插件目录内不再放置任何配置文件，也不再读取插件目录及其上级目录的兼容配置。
- 安装脚本使用 `mkdir -p` 递归创建缺失目录；配置示例文件首次生成，已存在则保留不覆盖。
- 不修改 `loadConfig` 校验逻辑，不改变对外暴露的 Hooks 接口。
- 所有路径变更必须同步更新 `tests/index.test.ts`、`tests/postinstall.test.ts` 与 `README.md`。
- 最终验证：`bun test` 全部通过，`npm run build`（根目录）退出码为 0。

archived-with: 2026-07-13-global-and-project-install-config
---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `packages/opencode-lark-bridge/scripts/install-global.sh` | 新建：全局安装脚本，部署到 `~/.config/opencode/plugins/opencode-lark-bridge/` 并在 `~/.config/opencode/` 初始化示例配置。 |
| `packages/opencode-lark-bridge/scripts/install-local.sh` | 修改：仅初始化 `<project>/.opencode/` 下配置，移除插件目录内 fallback 配置。 |
| `packages/opencode-lark-bridge/src/index.ts` | 修改：`GLOBAL_OPENCODE_DIR` 改为 `~/.config/opencode`；`resolveConfigPath` 仅查找 `.opencode/` 与全局目录。 |
| `packages/opencode-lark-bridge/src/postinstall.ts` | 修改：`resolveTargetDir` 全局分支返回 `~/.config/opencode/`。 |
| `packages/opencode-lark-bridge/tests/index.test.ts` | 修改：项目级配置写入 `.opencode/` 子目录，全局路径改为 `~/.config/opencode/`，移除插件目录兼容测试。 |
| `packages/opencode-lark-bridge/tests/postinstall.test.ts` | 修改：全局目标目录断言改为 `~/.config/opencode`。 |
| `packages/opencode-lark-bridge/README.md` | 修改：更新全局路径、配置优先级、安装说明，移除插件目录必须有配置的描述。 |
| `packages/opencode-lark-bridge/package.json` | 可选修改：如需要可增加 `install:global` 脚本（非强制，按需添加）。 |

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 1: 创建全局安装脚本 `scripts/install-global.sh`

**Files:**
- Create: `packages/opencode-lark-bridge/scripts/install-global.sh`
- Source reference: `packages/opencode-lark-bridge/scripts/install-local.sh`

**Interfaces:**
- Consumes: 仓库根目录结构（`packages/opencode-lark-bridge` 为源码包），`npm run build`，`bun install --production`。
- Produces: 可执行脚本，部署全局插件目录并在 `~/.config/opencode/` 初始化示例配置。

- [x] **Step 1: 新建脚本文件**

在 `packages/opencode-lark-bridge/scripts/install-global.sh` 写入以下内容：

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
GLOBAL_OPENCODE_DIR="${HOME}/.config/opencode"
PLUGIN_DIR="$GLOBAL_OPENCODE_DIR/plugins/opencode-lark-bridge"
SOURCE_DIR="$PROJECT_ROOT/packages/opencode-lark-bridge"
CONFIG_FILE="opencode-lark-bridge.config.jsonc"
EXAMPLE_FILE="opencode-lark-bridge.config.example.jsonc"
GLOBAL_CONFIG="$GLOBAL_OPENCODE_DIR/$CONFIG_FILE"

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

# Seed global config at ~/.config/opencode/ on first install; preserve user edits on subsequent runs.
mkdir -p "$GLOBAL_OPENCODE_DIR"
if [ ! -f "$GLOBAL_CONFIG" ]; then
  cp "$SOURCE_DIR/$EXAMPLE_FILE" "$GLOBAL_CONFIG"
  echo "Created example config at $GLOBAL_CONFIG"
else
  echo "Preserved existing config at $GLOBAL_CONFIG"
fi

echo "Plugin installed to $PLUGIN_DIR"
```

- [x] **Step 2: 赋予执行权限**

Run:
```bash
chmod +x packages/opencode-lark-bridge/scripts/install-global.sh
```

Expected: 脚本文件具有可执行权限，无输出。

- [x] **Step 3: 语法检查**

Run:
```bash
bash -n packages/opencode-lark-bridge/scripts/install-global.sh
```

Expected: 退出码 0，无错误输出。

- [x] **Step 4: Commit**

```bash
git add packages/opencode-lark-bridge/scripts/install-global.sh
git commit -m "feat(install): add global install script targeting ~/.config/opencode"
```

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 2: 调整项目级安装脚本 `scripts/install-local.sh`

**Files:**
- Modify: `packages/opencode-lark-bridge/scripts/install-local.sh`

**Interfaces:**
- Consumes: 仓库根目录结构，与 Task 1 相同的构建/复制逻辑。
- Produces: 项目级脚本不再创建插件目录内 fallback 配置。

- [x] **Step 1: 修改项目级配置路径并移除 fallback**

将 `packages/opencode-lark-bridge/scripts/install-local.sh` 的以下内容：

```bash
PROJECT_CONFIG="$PROJECT_ROOT/.opencode/$CONFIG_FILE"
```

保持不变；将文件末尾的 fallback 配置创建逻辑（第 33-39 行）删除：

```bash
# OpenCode requires a config file at the plugin root; provide a fallback so the
# server doesn't fail to start when the example file is removed.
PLUGIN_CONFIG="$PLUGIN_DIR/$CONFIG_FILE"
if [ ! -f "$PLUGIN_CONFIG" ]; then
  cp "$SOURCE_DIR/$EXAMPLE_FILE" "$PLUGIN_CONFIG"
  echo "Created fallback config at $PLUGIN_CONFIG"
fi
```

修改后文件完整内容应为：

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PLUGIN_DIR="$PROJECT_ROOT/.opencode/plugins/opencode-lark-bridge"
SOURCE_DIR="$PROJECT_ROOT/packages/opencode-lark-bridge"
CONFIG_FILE="opencode-lark-bridge.config.jsonc"
EXAMPLE_FILE="opencode-lark-bridge.config.example.jsonc"
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
  cp "$SOURCE_DIR/$EXAMPLE_FILE" "$PROJECT_CONFIG"
  echo "Created example config at $PROJECT_CONFIG"
else
  echo "Preserved existing config at $PROJECT_CONFIG"
fi

echo "Plugin installed to $PLUGIN_DIR"
```

- [x] **Step 2: 语法检查**

Run:
```bash
bash -n packages/opencode-lark-bridge/scripts/install-local.sh
```

Expected: 退出码 0，无错误输出。

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/scripts/install-local.sh
git commit -m "feat(install): local install only seeds .opencode root config, drop plugin fallback"
```

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 3: 调整配置解析 `src/index.ts`

**Files:**
- Modify: `packages/opencode-lark-bridge/src/index.ts`

**Interfaces:**
- Consumes: `loadConfig` from `./config.js`，`os.homedir()`，Node `path`/`fs`。
- Produces: `GLOBAL_OPENCODE_DIR = path.join(os.homedir(), ".config", "opencode")`；`resolveConfigPath(ctx, globalOpencodeDir?)` 仅返回项目级 `.opencode/` 或全局目录下的配置路径；找不到时返回 `null`。`OpenCodeLarkBridge` 在 `configPath` 为 `null` 或 `loadConfig` 失败时返回 no-op Hooks。

- [x] **Step 1: 重写 `resolveConfigPath` 与 `GLOBAL_OPENCODE_DIR`**

将 `packages/opencode-lark-bridge/src/index.ts` 中第 11-33 行替换为：

```typescript
const CONFIG_FILE = "opencode-lark-bridge.config.jsonc"
const GLOBAL_OPENCODE_DIR = path.join(os.homedir(), ".config", "opencode")

export function resolveConfigPath(
  ctx: { directory: string },
  globalOpencodeDir: string = GLOBAL_OPENCODE_DIR
): string | null {
  const projectConfig = path.join(ctx.directory, ".opencode", CONFIG_FILE)
  if (existsSync(projectConfig)) {
    return path.resolve(projectConfig)
  }

  const resolvedCtx = path.resolve(ctx.directory)
  const resolvedGlobal = path.resolve(globalOpencodeDir)
  if (resolvedCtx !== resolvedGlobal) {
    const globalConfig = path.join(globalOpencodeDir, CONFIG_FILE)
    if (existsSync(globalConfig)) {
      return path.resolve(globalConfig)
    }
  }

  return null
}
```

- [x] **Step 2: 清理未使用的 `fileURLToPath` 导入**

由于 `resolveConfigPath` 不再需要默认的 `pluginDir` 参数，`fileURLToPath` 在 `src/index.ts` 中不再被使用。将第 3 行：

```typescript
import { fileURLToPath } from "node:url"
```

删除。

- [x] **Step 3: 验证 TypeScript 无错误**

Run:
```bash
cd packages/opencode-lark-bridge && npx tsc --noEmit
```

Expected: 退出码 0，无诊断输出。

- [x] **Step 4: Commit**

```bash
git add packages/opencode-lark-bridge/src/index.ts
git commit -m "feat(config): resolve config from .opencode/ then ~/.config/opencode only"
```

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 4: 调整 Postinstall 目标目录 `src/postinstall.ts`

**Files:**
- Modify: `packages/opencode-lark-bridge/src/postinstall.ts`

**Interfaces:**
- Consumes: `isGlobalInstall()` 判断。
- Produces: `resolveTargetDir()` 全局安装时返回 `path.join(os.homedir(), ".config", "opencode")`。

- [x] **Step 1: 修改全局分支目标目录**

将 `packages/opencode-lark-bridge/src/postinstall.ts` 第 63-69 行：

```typescript
export function resolveTargetDir(): string {
  if (isGlobalInstall()) {
    return path.join(os.homedir(), ".opencode")
  }
  const projectRoot = process.env.INIT_CWD || process.cwd()
  return path.join(projectRoot, ".opencode")
}
```

替换为：

```typescript
export function resolveTargetDir(): string {
  if (isGlobalInstall()) {
    return path.join(os.homedir(), ".config", "opencode")
  }
  const projectRoot = process.env.INIT_CWD || process.cwd()
  return path.join(projectRoot, ".opencode")
}
```

- [x] **Step 2: 验证 TypeScript 无错误**

Run:
```bash
cd packages/opencode-lark-bridge && npx tsc --noEmit
```

Expected: 退出码 0，无诊断输出。

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/src/postinstall.ts
git commit -m "feat(postinstall): global install target dir is ~/.config/opencode"
```

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 5: 更新测试 `tests/index.test.ts`

**Files:**
- Modify: `packages/opencode-lark-bridge/tests/index.test.ts`

**Interfaces:**
- Consumes: `plugin()` 与 `resolveConfigPath()` 的新行为（Task 3）。
- Produces: 测试用例覆盖项目级 `.opencode/` 配置、全局 `~/.config/opencode/` 配置、无配置时返回 `null`；不再覆盖插件目录兼容路径。

- [x] **Step 1: 调整已部署插件配置路径**

将 `describe("deployed plugin config resolution")` 内所有写入配置文件的调用：

```typescript
path.join(tempDir, "opencode-lark-bridge.config.jsonc")
```

替换为：

```typescript
path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc")
```

该 describe 块中共有 4 处（第 34、53、68、83 行）。

- [x] **Step 2: 重写 `resolveConfigPath` 测试块**

将第 107-234 行的整个 `describe.serial("resolveConfigPath", () => { ... })` 替换为：

```typescript
describe.serial("resolveConfigPath", () => {
  let projectDir: string
  let globalDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), "lark-project-"))
    globalDir = mkdtempSync(path.join(tmpdir(), "lark-global-"))
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(globalDir, { recursive: true, force: true })
  })

  function writeConfig(dir: string, suffix = ""): string {
    const configDir = path.join(dir, ".opencode")
    mkdirSync(configDir, { recursive: true })
    const file = path.join(configDir, "opencode-lark-bridge.config.jsonc")
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
      globalDir
    )
    expect(result).toBeNull()
  })

  it("prefers project-level .opencode config over global", () => {
    const projectFile = writeConfig(projectDir, "-project")
    const globalFile = writeConfig(globalDir, "-global")

    const result = resolveConfigPath(
      { directory: projectDir },
      globalDir
    )

    expect(result).toBe(path.resolve(projectFile))
    expect(existsSync(globalFile)).toBe(true)
  })

  it("falls back to global ~/.config/opencode when project-level missing", () => {
    mkdirSync(path.join(globalDir, ".opencode"), { recursive: true })
    const globalFile = path.join(globalDir, ".opencode", "opencode-lark-bridge.config.jsonc")
    writeFileSync(
      globalFile,
      JSON.stringify({
        app_id: "a",
        app_secret: "b",
        default_target: { chat_id: "c" },
        log_file: path.join(globalDir, "app-global.log"),
      })
    )

    const result = resolveConfigPath(
      { directory: projectDir },
      globalDir
    )

    expect(result).toBe(path.resolve(globalFile))
  })

  it("skips global candidate when ctx.directory already points at the global path", () => {
    const globalFile = writeConfig(globalDir, "-global-as-ctx")

    const result = resolveConfigPath(
      { directory: globalDir },
      globalDir
    )

    expect(result).toBe(path.resolve(globalFile))
  })
})
```

- [x] **Step 3: 运行相关测试**

Run:
```bash
cd packages/opencode-lark-bridge && bun test tests/index.test.ts
```

Expected: 全部通过，无失败。

- [x] **Step 4: Commit**

```bash
git add packages/opencode-lark-bridge/tests/index.test.ts
git commit -m "test(config): update path resolution tests for .opencode and ~/.config/opencode"
```

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 6: 更新测试 `tests/postinstall.test.ts`

**Files:**
- Modify: `packages/opencode-lark-bridge/tests/postinstall.test.ts`

**Interfaces:**
- Consumes: `resolveTargetDir()` 的新行为（Task 4）。
- Produces: 全局安装断言路径为 `~/.config/opencode`。

- [x] **Step 1: 修改全局目标目录断言**

将第 42-45 行：

```typescript
  it("resolves to ~/.opencode for global install", () => {
    process.env.npm_config_global = "true"
    expect(resolveTargetDir()).toEndWith(path.join(".opencode"))
  })
```

替换为：

```typescript
  it("resolves to ~/.config/opencode for global install", () => {
    process.env.npm_config_global = "true"
    expect(resolveTargetDir()).toBe(path.join(os.homedir(), ".config", "opencode"))
  })
```

注意需要在文件顶部确认已导入 `os` 模块。当前文件第 3 行已导入 `os`，无需新增。

- [x] **Step 2: 运行相关测试**

Run:
```bash
cd packages/opencode-lark-bridge && bun test tests/postinstall.test.ts
```

Expected: 全部通过，无失败。

- [x] **Step 3: Commit**

```bash
git add packages/opencode-lark-bridge/tests/postinstall.test.ts
git commit -m "test(postinstall): assert global target dir is ~/.config/opencode"
```

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 7: 更新 README 文档

**Files:**
- Modify: `packages/opencode-lark-bridge/README.md`

**Interfaces:**
- Consumes: 设计文档中对路径和优先级的描述。
- Produces: README 中全局路径、配置优先级、安装说明与实际情况一致。

- [x] **Step 1: 更新全局安装说明**

将第 28-36 行：

```markdown
### 全局安装

配置文件初始化到用户主目录的 `~/.opencode/` 下，所有项目共享：

```bash
npm install -g opencode-lark-bridge
# 或
bun add -g opencode-lark-bridge
```
```

替换为：

```markdown
### 全局安装

配置文件初始化到用户主目录的 `~/.config/opencode/` 下，所有项目共享：

```bash
npm install -g opencode-lark-bridge
# 或
bun add -g opencode-lark-bridge
```
```

- [x] **Step 2: 更新开发者本地安装说明，增加全局脚本**

将第 52-60 行：

```markdown
### 开发者本地安装

源码在仓库内时，使用本地脚本进行项目级部署：

```bash
cd packages/opencode-lark-bridge
npm run build
npm run install:local
```
```

替换为：

```markdown
### 开发者本地安装

源码在仓库内时，使用本地脚本进行项目级部署：

```bash
cd packages/opencode-lark-bridge
npm run build
npm run install:local
```

进行全局部署：

```bash
cd packages/opencode-lark-bridge
npm run build
bash scripts/install-global.sh
```
```

- [x] **Step 3: 更新配置查找顺序**

将第 64-71 行：

```markdown
运行时按以下顺序查找 `opencode-lark-bridge.config.jsonc`，命中即返回：

1. `<ctx.directory>/opencode-lark-bridge.config.jsonc`（项目级安装时为 `<project>/.opencode/`，全局安装时为 `~/.opencode/`）
2. `~/.opencode/opencode-lark-bridge.config.jsonc`（仅在第 1 步未命中且 `ctx.directory` 不是 `~/.opencode` 时查找）
3. `<pluginDir>/opencode-lark-bridge.config.jsonc`（兼容旧部署：插件目录内）
4. `<pluginDir>/../opencode-lark-bridge.config.jsonc`（兼容旧部署：插件上级目录）

安装脚本会在对应层级的 `.opencode/` 目录下首次创建示例配置；已存在则保留不覆盖。
```

替换为：

```markdown
运行时按以下顺序查找 `opencode-lark-bridge.config.jsonc`，命中即返回：

1. `<ctx.directory>/.opencode/opencode-lark-bridge.config.jsonc`（项目级配置）
2. `~/.config/opencode/opencode-lark-bridge.config.jsonc`（全局配置，仅在 `ctx.directory` 不是 `~/.config/opencode` 时查找）

安装脚本会在对应配置目录首次创建示例配置；已存在则保留不覆盖。插件目录内不再存放配置文件。
```

- [x] **Step 4: 更新项目级/全局配置路径示例**

将第 73-83 行：

```markdown
### 项目级配置

```bash
<project>/.opencode/opencode-lark-bridge.config.jsonc
```

### 全局配置

```bash
~/.opencode/opencode-lark-bridge.config.jsonc
```
```

替换为：

```markdown
### 项目级配置

```bash
<project>/.opencode/opencode-lark-bridge.config.jsonc
```

### 全局配置

```bash
~/.config/opencode/opencode-lark-bridge.config.jsonc
```
```

- [x] **Step 5: Commit**

```bash
git add packages/opencode-lark-bridge/README.md
git commit -m "docs(readme): update config paths to ~/.config/opencode and .opencode/"
```

archived-with: 2026-07-13-global-and-project-install-config
---

### Task 8: 全量验证

**Files:**
- 涉及：所有已修改文件。

**Interfaces:**
- Consumes: 前述全部实现。
- Produces: `bun test` 全部通过，`npm run build` 退出码 0。

- [x] **Step 1: 运行单元测试与集成测试**

Run:
```bash
cd packages/opencode-lark-bridge && bun test
```

Expected: 所有测试通过，终端输出类似：
```
PASS  tests/index.test.ts
PASS  tests/postinstall.test.ts
...
```
最终统计无失败。

- [x] **Step 2: 运行构建**

Run（在仓库根目录）：
```bash
npm run build
```

Expected: 退出码 0，`packages/opencode-lark-bridge/dist/` 下的文件已更新。

- [x] **Step 3: 运行脚本语法检查（可选但推荐）**

Run:
```bash
bash -n packages/opencode-lark-bridge/scripts/install-global.sh
bash -n packages/opencode-lark-bridge/scripts/install-local.sh
```

Expected: 均退出码 0。

- [x] **Step 4: Commit（如需要）**

如验证过程中未产生新变更则无需提交；如 `dist/` 有更新则提交：

```bash
git add packages/opencode-lark-bridge/dist
git commit -m "chore(build): rebuild dist for global-and-project-install-config"
```

archived-with: 2026-07-13-global-and-project-install-config
---

## Self-Review

**1. Spec coverage:**

| 设计需求 | 覆盖任务 |
| --- | --- |
| 提供 `scripts/install-global.sh`，部署到 `~/.config/opencode/plugins/opencode-lark-bridge/` 并初始化全局配置 | Task 1 |
| 调整 `scripts/install-local.sh`，仅初始化 `<project>/.opencode/` 配置，移除插件目录 fallback | Task 2 |
| 调整 `src/index.ts` 的 `resolveConfigPath`，仅查找 `.opencode/` 与 `~/.config/opencode/` | Task 3 |
| 调整 `src/postinstall.ts`，全局目标目录为 `~/.config/opencode/` | Task 4 |
| 更新测试 | Task 5、Task 6 |
| 更新 README | Task 7 |
| 验证 `bun test` 与 `npm run build` | Task 8 |

无遗漏。

**2. Placeholder scan:**

- 无 "TBD"、"TODO"、"implement later"。
- 无 "Add appropriate error handling" 等模糊描述。
- 每个代码步骤均包含完整可运行代码。
- 无未定义的类型/函数引用。

**3. Type consistency：**

- `resolveConfigPath` 新签名：`(ctx, globalOpencodeDir?)`，与 Task 5 测试调用一致。
- `GLOBAL_OPENCODE_DIR` 在 `src/index.ts` 与测试注入的 `globalDir` 语义一致。
- `resolveTargetDir()` 返回值在 Task 4 实现与 Task 6 断言中均为 `path.join(os.homedir(), ".config", "opencode")`。

archived-with: 2026-07-13-global-and-project-install-config
---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-13-global-and-project-install-config.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
