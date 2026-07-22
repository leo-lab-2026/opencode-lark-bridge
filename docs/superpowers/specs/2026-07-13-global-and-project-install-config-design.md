---
comet_change: global-and-project-install-config
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-13-global-and-project-install-config
status: final
---

# 全局与项目级安装配置统一设计

## 背景

`opencode-lark-bridge` 插件的配置最初位于插件目录内，后迁移到 `.opencode/` 根目录。当前仍缺少独立的全局安装脚本，且 `install-local.sh` 在插件目录内保留了一份 fallback 配置文件。用户进一步明确：

- `ctx.directory` 是 OpenCode 启动时所在的项目根目录。
- 全局配置目录应为 `~/.config/opencode/`，全局插件目录应为 `~/.config/opencode/plugins/`。
- 插件目录内不应再放置任何配置文件。

## 安装阶段与运行阶段的解耦

安装脚本的责任是**部署插件代码**并在**约定的配置目录**中首次生成示例配置文件。运行阶段（OpenCode 启动并加载插件）与安装阶段相互独立：插件被加载时，只负责按约定路径查找配置文件；能否找到配置文件都不应影响 OpenCode 的正常启动。

因此：

- 安装脚本不保证运行时一定能读取到有效配置（用户可能尚未编辑示例文件）。
- 插件代码必须能处理“找到有效配置”和“未找到/配置无效”两种情况，后者安全降级为 no-op。

## 目标

1. 提供 `scripts/install-global.sh`，将插件部署到 `~/.config/opencode/plugins/opencode-lark-bridge/`，并在 `~/.config/opencode/` 下首次创建示例配置（不覆盖已有配置）。
2. 调整 `scripts/install-local.sh`，仅在 `<project>/.opencode/` 下初始化配置，移除插件目录内的 fallback 配置。
3. 调整 `src/index.ts` 的 `resolveConfigPath`，仅按 `<ctx.directory>/.opencode/` → `~/.config/opencode/` 的顺序查找配置。
4. 调整 `src/postinstall.ts`，全局安装时目标目录为 `~/.config/opencode/`。
5. 更新测试与 README，反映新的路径约定。

## 非目标

- 不修改 `loadConfig` 的校验逻辑。
- 不改变插件对外暴露的 Hooks 接口。
- 不保留插件目录及其上级目录的兼容配置路径。
- 不自动迁移旧插件目录内的配置。

## 技术方案

### 1. 配置解析（`src/index.ts`）

`resolveConfigPath` 仅保留以下候选：

1. `path.join(ctx.directory, ".opencode", CONFIG_FILE)`
2. `path.join(GLOBAL_OPENCODE_DIR, CONFIG_FILE)`，其中 `GLOBAL_OPENCODE_DIR = path.join(os.homedir(), ".config", "opencode")`

当候选 1 未命中时返回候选 2；全部未命中返回 `null`。`OpenCodeLarkBridge` 入口在 `configPath` 为 `null` 或 `loadConfig` 校验失败时，均返回一个无操作的 Hooks 对象，确保 OpenCode 启动不受影响。

### 2. 项目级安装脚本（`scripts/install-local.sh`）

- 构建 TypeScript 源码。
- 清空并创建 `<project>/.opencode/plugins/opencode-lark-bridge/`。
- 复制 `dist/*`、`package.json`、`bun.lock`、`opencode-lark-bridge.config.example.jsonc` 到插件目录。
- 在插件目录内执行 `bun install --production`。
- 若 `<project>/.opencode/opencode-lark-bridge.config.jsonc` 不存在，则从 example 复制一份；已存在则保留。
- 不再向插件目录内复制 fallback 配置。

### 3. 全局安装脚本（`scripts/install-global.sh`）

逻辑与 `install-local.sh` 相同，但目标目录改为：

- 插件目录：`~/.config/opencode/plugins/opencode-lark-bridge/`
- 配置目录：`~/.config/opencode/`

### 4. Postinstall 初始化（`src/postinstall.ts`）

`resolveTargetDir()` 在全局安装时返回 `~/.config/opencode/`，项目级安装时返回 `path.join(INIT_CWD || cwd(), ".opencode")`。

### 5. 测试更新

- `tests/index.test.ts`：项目级配置写入 `projectDir/.opencode/`，全局路径使用 `~/.config/opencode/`，移除 pluginDir 兼容路径的测试用例。
- `tests/postinstall.test.ts`：全局目标目录断言改为 `~/.config/opencode`。

### 6. README 更新

- 增加全局安装脚本使用说明。
- 说明新的全局路径 `~/.config/opencode/`。
- 更新配置优先级描述。
- 移除“插件目录必须有配置文件”的相关描述。

## 风险与缓解

| 风险                        | 缓解                                           |
| ------------------------- | -------------------------------------------- |
| 旧部署的插件目录内配置失效             | README 中说明迁移方式；旧配置仅为过渡方案                     |
| `~/.config/opencode/` 不存在 | 安装脚本和 `initConfig` 均使用 `mkdir -p` 递归创建       |
| 多处路径变更导致测试失效              | 同步更新 `index.test.ts` 和 `postinstall.test.ts` |

## 迁移说明

旧部署中位于插件目录内的 `opencode-lark-bridge.config.jsonc` 需要手动迁移到项目级 `<project>/.opencode/` 或全局级 `~/.config/opencode/`。安装脚本不再主动创建或读取插件目录内的配置。
