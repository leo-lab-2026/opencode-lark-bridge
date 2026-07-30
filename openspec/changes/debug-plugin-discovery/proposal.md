## Why

插件通过 `install-local.sh` 安装到 `.opencode/plugins/opencode-lark-bridge/` 后，OpenCode V1 的自动发现机制不稳定，导致插件未加载。显式配置插件路径时工作正常，说明问题在于自动发现机制而非插件代码。

## What Changes

- 更新 `scripts/lib/config-register.sh`，移除误导性的"无需手动注册"声明
- 在 `install-local.sh` 中主动注册插件到 `.opencode/opencode.jsonc`
- 更新 README 和注释，明确说明 OpenCode V1 需要显式注册插件

## Capabilities

### New Capabilities

无

### Modified Capabilities

无

此变更为安装/配置流程改进，不涉及 spec 级行为变更。

## Impact

- 安装脚本 `scripts/install-local.sh` 和 `scripts/install-global.sh`
- 配置注册辅助脚本 `scripts/lib/config-register.sh`
- 用户配置文件 `.opencode/opencode.jsonc`（如不存在则创建）
- README 文档中的插件安装说明
