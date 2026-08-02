# Design: fix-npm-install-entry-point

## 根因分析

### opencode 插件加载机制

opencode 源码 (`packages/opencode/src/plugin/shared.ts`) 的插件入口解析流程：

1. `resolvePathPluginTarget(spec)` — 路径型插件 spec（如 `./plugins/opencode-lark-bridge`）解析为目录 URL（目录含 `package.json` 时返回目录本身）
2. `createPluginEntry(spec, target, "server")` — 读取 `package.json`
3. `resolvePackageEntrypoint(spec, kind, pkg)` — 解析顺序：
   - 先查 `exports["./server"]`
   - 再查 `main` 字段
   - `main` 存在时直接返回解析路径（**不检查文件是否存在**）
4. `PluginLoader.load(row)` — `await import(row.entry)` — 尝试动态导入入口文件，文件不存在则抛异常，插件加载失败

### 三种安装路径的目录结构差异

| 安装路径 | dist 复制方式 | index.js 位置 | main 解析结果 |
|---------|-------------|-------------|-------------|
| `install-local.sh` | `cp -r dist/* $DIR/`（扁平化到根） | `$DIR/index.js` | `./index.js` -> 存在 ✓ |
| `install-global.sh` | `cp -r dist/* $DIR/`（扁平化到根） | `$DIR/index.js` | `./index.js` -> 存在 ✓ |
| npm postinstall (`installer.ts`) | `cpSync(dist, dist)`（保留子目录） | `$DIR/dist/index.js` | `./index.js` -> **不存在** ✗ |

npm 发布包的 `files` 数组只含 `dist`（子目录），不含根级 `index.js`。npm 安装后 `installer.ts` 正确地将 `dist` 作为子目录复制，但 `main: "./index.js"` 指向根级，导致 opencode 解析到不存在的文件，`import()` 失败。

## 修复方案

**统一为嵌套结构**，使 `main` 指向 `./dist/index.js`：

1. `package.json`: `"main": "./index.js"` -> `"main": "./dist/index.js"`
2. `install-local.sh`: `cp -r dist/* "$PLUGIN_DIR/"` -> `cp -r dist "$PLUGIN_DIR/"`
3. `install-global.sh`: 同上

修复后三种安装路径产出一致结构：

```
.opencode/plugins/opencode-lark-bridge/
├── dist/
│   ├── index.js        <- main 指向此处
│   ├── cli.js
│   └── ...
├── package.json        <- main: "./dist/index.js"
├── node_modules/
├── bun.lock
└── opencode-lark-bridge.config.example.jsonc
```

## 为什么不反过来（让 installer.ts 扁平化）

- `installer.ts` 的 `copyPluginFiles` 已正确使用嵌套结构，且有测试覆盖（`tests/installer.test.ts` 断言 `dist/index.js`）
- npm 发布包的 `files` 数组天然以 `dist` 子目录组织，`main` 指向 `./dist/index.js` 是 Node.js 标准约定
- 扁平化复制（`dist/*` 到根）是非标准做法，会导致根目录污染
