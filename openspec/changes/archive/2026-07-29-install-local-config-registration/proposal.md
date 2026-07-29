## Why

当前 `scripts/install-local.sh` 只负责复制插件产物和种子插件配置，但不检查 opencode 主配置文件（`opencode.jsonc`/`opencode.json`）是否已注册此插件。用户每次安装后必须手动在配置文件的 `plugin` 数组中添加插件路径，体验割裂且容易遗漏。需要让安装脚本自动检测并智能写入插件注册信息，同时严格避免污染全局配置。

## What Changes

- 新增配置文件检查逻辑：扫描全局和项目级的 `opencode.jsonc`/`opencode.json`，判断 `plugin` 数组是否已包含本插件路径
- 新增智能写入逻辑：当所有配置文件都未注册插件时，按优先级写入项目级配置文件
- 项目级配置文件优先级：`.opencode/opencode.jsonc` > `.opencode/opencode.json` > `./opencode.jsonc` > `./opencode.json`
- 写入类型偏好：优先写入 jsonc 类型文件；若项目级配置文件都不存在，创建 `.opencode/opencode.jsonc`
- 新建配置文件骨架包含 `$schema` 和 `plugin` 字段
- 严格约束：不修改全局配置文件（`~/.config/opencode/`）

## Capabilities

### New Capabilities

- `install-config-registration`: 安装脚本智能配置注册能力，覆盖配置文件检查、插件注册状态判定、按优先级写入项目级配置文件

### Modified Capabilities

无（现有插件配置种子逻辑 `initConfig` 不受影响，本次变更仅作用于 opencode 主配置文件）

## Impact

**代码影响**：
- `scripts/install-local.sh`：新增配置检查和写入逻辑（bash 脚本）
- 不涉及 TypeScript 源码修改

**配置影响**：
- 用户运行 `npm run install:local` 后，opencode 主配置文件自动包含插件注册
- 已手动注册的用户不受影响（检测到已注册则跳过）
- 全局配置文件保持不变

**依赖影响**：
- 无新增外部依赖
- 可能需要 `jq` 或纯 bash 解析 JSONC（需在 design 阶段确定）
