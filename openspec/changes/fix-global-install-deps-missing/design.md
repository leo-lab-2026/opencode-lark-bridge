# Design: fix-global-install-deps-missing

## 根因分析

### 全局安装流程

`npm install -g opencode-lark-bridge@latest` 的执行流程：

1. npm 把包解压到 `$(npm prefix -g)/lib/node_modules/opencode-lark-bridge/`（含 dist/、package.json、bun.lock、example config）
2. npm 在该目录安装 `dependencies`（`@opencode-ai/plugin` + `comment-json` 及其传递依赖，共 63M）
3. npm 运行 `postinstall` 脚本：`node -e "... execFileSync(node, ['./dist/postinstall.js'])"`
4. `postinstall.js` 的 `main()` 调用 `installPlugin({ global: isGlobalInstall() })`
5. `installPlugin` 依次执行：
   - `copyPluginFiles(pluginDir)` - 复制 dist/package.json/bun.lock/example config 到 `~/.config/opencode/plugins/opencode-lark-bridge/`
   - `installDependencies(pluginDir)` - 在插件目录运行 `bun install --production --ignore-scripts`
   - `initConfig({ targetDir })` - 种子配置
   - `registerPluginConfig({ global, pluginPath })` - 注册到全局 opencode.jsonc

### 失败点

`installDependencies` 中的 `bun install` 失败（具体原因可能是 npm postinstall 环境的 PATH/环境变量差异，或网络/缓存问题）。`installDependencies` 的错误处理设计缺陷导致失败被静默吞掉：

```typescript
// installer.ts:55-79
const tryCmd = (cmd: string): boolean => {
  try {
    exec(cmd, { cwd: pluginDir, stdio: "pipe", encoding: "utf-8" })  // stdio: "pipe" 捕获输出
    return true
  } catch {
    return false  // 静默返回 false，不打印错误
  }
}
if (tryCmd("bun install --production --ignore-scripts")) { ... }
if (tryCmd("npm install --production --ignore-scripts")) { ... }
console.warn("Could not install dependencies: ...")  // 只打印 warning，不中断
```

外层 `installPlugin` 也用 try-catch 包裹，只打印 `Warning: Dependency installation failed`，继续执行后续步骤。

### 连锁反应

依赖缺失 -> `dist/config.js` 的 `import { parse } from "comment-json"` 失败 -> opencode `PluginLoader.load` 的 `await import(row.entry)` 抛异常 -> 插件加载失败 -> 通知失效。

### 验证证据

通过分开测试（避免全局/项目级互相干扰）确认：

1. **全局安装无 node_modules -> 插件不加载**：删除 `~/.config/opencode/plugins/opencode-lark-bridge/node_modules`，在独立目录运行 opencode 1.18.11，`/tmp/opencode-lark-bridge-debug.log` 不存在（入口函数从未执行）
2. **恢复 node_modules -> 插件加载**：`bun install --production --ignore-scripts` 恢复依赖后，调试日志立即出现，插件成功加载
3. **项目级安装正常**：在独立目录 `/tmp/test-project` 做 `npm install opencode-lark-bridge`，插件目录有 node_modules（`installDependencies` 成功），opencode 1.18.11 正常加载插件

### opencode 1.18.11 无影响

经分开测试验证，opencode 1.18.11 对插件入口解析无变化，仍使用 `package.json` 的 `main` 字段，不需要 `exports["./server"]`。项目级安装在 1.18.11 下正常工作。opencode 升级不是本 bug 的根因。

### 为什么项目级安装正常

项目级安装时 `installDependencies` 能成功（用户确认通知正常，独立测试也确认）。差异可能是 npm postinstall 环境的 PATH/环境变量在项目级和全局级之间不同。但依赖 `bun install` 二次安装本身是脆弱设计--npm 已经在全局包目录安装了 production 依赖，没有必要再在插件目录重新安装。

## 修复方案

**核心思路**：利用 npm 已安装的 production node_modules，postinstall 直接复制到插件目录，避免二次 `bun install`。

### 改动 1：`@opencode-ai/plugin` 移到 devDependencies

`@opencode-ai/plugin` 只提供类型定义，dist 产物和 src 源码均不 import 它（`src/types.ts` 自定义所有接口）。移到 devDependencies 后：
- npm `install -g` 不再安装 `@opencode-ai/plugin` 及其传递依赖（`@ai-sdk`、`effect`、`esprima` 等）
- 全局包目录的 node_modules 只剩 `comment-json`（92K）+ `esprima`（336K），共约 428K
- 复制开销可忽略

### 改动 2：`copyPluginFiles` 复制 node_modules

在 `FILES_TO_COPY` 中增加 `node_modules`，复制方式与 `dist` 一致（`rmSync + cpSync`）：

```typescript
const FILES_TO_COPY = [
  "dist",
  "package.json",
  "bun.lock",
  "opencode-lark-bridge.config.example.jsonc",
  "node_modules",  // 新增
]
```

`copyPluginFiles` 中 `node_modules` 走 `rmSync + cpSync` 分支（`item === "dist"` 改为 `item === "dist" || item === "node_modules"`）。

源目录（`getPackageRoot()`）没有 `node_modules` 时（如项目级安装依赖被 hoist），`existsSync(from)` 为 false，`continue` 跳过，不影响后续 `installDependencies` fallback。

### 改动 3：`installDependencies` 降级为 fallback + 改进错误处理

- `installPlugin` 中，`copyPluginFiles` 后检查 `<pluginDir>/node_modules/comment-json` 是否存在；存在则跳过 `installDependencies`
- `installDependencies` 的 `tryCmd` 失败时打印 stdout/stderr/exitCode（通过 `execSync` 的异常对象 `error.stdout`/`error.stderr`）

### 改动 4：移除 `src/index.ts` 调试代码

移除 `/tmp/opencode-lark-bridge-debug.log` 的 4 处 `appendFileSync` 调试代码（行 36-41、44-46、48-52、62-64）。这些是之前排查配置路径问题时留下的，不应留在生产环境。

## 为什么不反过来（让 installDependencies 更可靠）

- `bun install`/`npm install` 在 postinstall 环境中受 PATH、环境变量、网络、缓存等多种因素影响，难以保证 100% 成功
- npm 已经在全局包目录安装了 production 依赖，复制比重新安装更可靠、更快
- 复制 node_modules 是文件操作，不依赖外部命令，确定性高
