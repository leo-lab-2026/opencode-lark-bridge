## Why

`opencode-lark-bridge@0.2.1` 通过 `npm install -g` 全局安装后，opencode 无法收到任何飞书通知。项目级安装（`npm install opencode-lark-bridge`）功能正常（opencode 1.18.5 和 1.18.11 均正常）。

**根因**：全局安装时 postinstall 运行了 `copyPluginFiles`（插件目录有 dist/package.json/bun.lock/example config）和 `registerPluginConfig`（全局 opencode.jsonc 已注册 plugin 路径），但 `installDependencies` 中的 `bun install --production --ignore-scripts` 失败，导致插件目录 `~/.config/opencode/plugins/opencode-lark-bridge/` **没有 node_modules**。`comment-json` 缺失使 `dist/config.js` 的 `import { parse } from "comment-json"` 抛异常，opencode `import()` 入口文件失败，插件无法加载。

**验证证据**（分开测试，避免全局/项目级互相干扰）：
- 删除全局插件目录的 node_modules -> `/tmp/opencode-lark-bridge-debug.log` 不存在（插件入口从未执行）
- 恢复 node_modules -> 调试日志立即出现，插件成功加载
- 项目级安装在独立目录测试 -> `installDependencies` 成功，插件正常加载

`installDependencies` 使用 `stdio: "pipe"` 捕获输出 + `try-catch` 返回 false 静默吞掉错误，外层 `installPlugin` 也只打印 `Warning: Dependency installation failed`，不中断流程，用户无法察觉依赖安装失败。

**关于 opencode 1.18.11**：经分开测试验证，opencode 1.18.11 对插件入口解析无变化，仍使用 `main` 字段，不需要 `exports["./server"]`。项目级安装在 1.18.11 下正常工作。opencode 升级不是本 bug 的根因。

## What Changes

- **`copyPluginFiles` 增加从源目录复制 production `node_modules`**：npm `install -g` 后全局包目录已有 npm 安装的 production 依赖，postinstall 直接复制到插件目录，不依赖 `bun install`/`npm install` 二次安装
- **`@opencode-ai/plugin` 从 `dependencies` 移到 `devDependencies`**：该包只提供类型定义，dist 产物不 import 它；移到 devDependencies 后 npm 全局包目录的 node_modules 只剩 `comment-json`（92K）+ `esprima`（336K），共约 428K，复制开销可忽略
- **`installDependencies` 改进错误处理**：失败时打印 stdout/stderr/exitCode；降级为 fallback（`copyPluginFiles` 已复制 node_modules 时跳过）
- **移除 `src/index.ts` 中的调试代码**：`/tmp/opencode-lark-bridge-debug.log` 的 `appendFileSync` 调试代码不应留在生产环境

## Capabilities

### New Capabilities
无

### Modified Capabilities
无（纯安装路径修复，不改变插件行为规格）

## Impact

- **`package.json`**: `@opencode-ai/plugin` 从 `dependencies` 移到 `devDependencies`；npm 全局安装后 node_modules 体积从 63M 降至约 428K
- **`src/installer.ts`**: `FILES_TO_COPY` 增加 `node_modules`；`copyPluginFiles` 对 `node_modules` 用 `rmSync + cpSync`（类似 dist）；`installDependencies` 改进错误日志，降级为 fallback
- **`src/index.ts`**: 移除 `/tmp/opencode-lark-bridge-debug.log` 调试代码
- **测试**: `tests/installer.test.ts` 需新增 `node_modules` 复制断言；`tests/index.test.ts` 需确认移除调试代码后行为不变
- **向后兼容**: 项目级安装（源目录无 node_modules 时）仍走 `installDependencies` fallback，行为不变
