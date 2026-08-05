# Proposal: 补充插件卸载文档

## Why

README 的「卸载」章节目前只覆盖 `npx opencode-lark-bridge uninstall` 一种方式，且未说明该命令的作用边界。用户通过 `opencode.jsonc` 声明 npm 包名方式安装插件（OpenCode 自动从 npm 安装到缓存目录）时，没有对应的卸载说明，容易留下残留文件或缓存。

## What Changes

- 在 README「卸载」章节按安装方式拆分子节，覆盖三种场景：
  - **npm install 安装**（项目级/全局）：`npm uninstall`/`bun remove` + `npx opencode-lark-bridge uninstall [--global]` 清理插件目录与配置注册
  - **开发者本地安装**（`npm run install:local` / `install:global`）：`npx opencode-lark-bridge uninstall [--global]` 或手动删除插件目录 + 移除 `opencode.jsonc` 注册条目
  - **opencode.jsonc 声明 npm 包名**：从配置 `plugin` 数组移除 `"opencode-lark-bridge"` 条目、删除 OpenCode 缓存目录 `~/.cache/opencode/packages/opencode-lark-bridge@latest/`（及旧版本遗留目录）、删除运行时配置文件，重启 OpenCode 生效
- 明确 `npx opencode-lark-bridge uninstall` 的作用边界：只清理插件目录与配置文件注册，**不**卸载 npm 包本身，也**不**清理 OpenCode 缓存
- 明确 OpenCode CLI 的边界：`opencode plugin <module>` 仅支持安装、无卸载子命令；`opencode uninstall` 卸载的是 OpenCode 本体而非插件，避免误用

## Capabilities

### New Capabilities

无（纯文档变更）

### Modified Capabilities

无（不改动插件行为，仅补充文档说明）

## Impact

- `README.md`：「卸载」章节扩充
- 无代码、无测试、无依赖变更
