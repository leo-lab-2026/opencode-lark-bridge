## Why

README 现有「安装」章节仅覆盖 `npm install` / `npx init`（依赖 postinstall 自动注册插件到 `.opencode/plugins/` 并写入 `opencode.jsonc`），未说明 OpenCode 原生支持的「在 `opencode.jsonc` 的 `plugin` 字段直接声明 npm 包名」方式。该方式下 OpenCode 启动时自动用 Bun/Arborist 安装插件到缓存目录（`~/.cache/opencode/packages/`），用户无需手动执行 `npm install`；但由于安装时 `ignoreScripts: true`，postinstall 不会执行，配置文件需用户手动创建。同时仓库缺少一段可供 OpenCode agent 读取的提示词，使其能自动区分全局/项目级完成安装与配置。

## What Changes

- 在 `README.md` 新增「通过 `opencode.jsonc` 声明 npm 插件（免手动安装）」章节：说明在 `plugin` 数组中填写 `opencode-lark-bridge`，OpenCode 启动时自动安装，无需手动 `npm install`
- 说明该方式下 postinstall 不执行，配置文件 `opencode-lark-bridge.config.jsonc` 需手动创建（项目级 `.opencode/` 或全局 `~/.config/opencode/`），并给出从包内示例文件复制的方法
- 提示避免与本地插件注册（`./plugins/opencode-lark-bridge`）并存，否则会导致双重通知
- 在 `README.md` 新增「OpenCode agent 自动安装提示词」章节：提供一段供 OpenCode agent 读取的提示词，区分全局安装与项目级安装，覆盖配置文件创建、`lark-cli` 前置依赖、避免双重注册

## Capabilities

本次变更为纯文档更新，不改变插件任何 spec 级行为，已在 `.openspec.yaml` 设置 `skip_specs: true`。

### New Capabilities

无

### Modified Capabilities

无

## Impact

- 受影响文件：仅 `README.md`
- 不影响插件源码、安装脚本（`install:local` / `install:global` / `postinstall`）、配置文件格式、CLI 命令
- 不影响现有 `npm install` / `npx init` / 开发者本地安装路径，新增章节与现有「安装」章节并列
