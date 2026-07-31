## Why

当前安装机制分散在四条路径上（`install-local.sh`、`install-global.sh`、`postinstall` 仅配置种子、`cli.ts init` 仅示例配置），彼此逻辑重复且 `postinstall` 不做文件复制和依赖安装。用户无法通过一条 `npm install` 命令在任意目标项目中完成插件完整部署（文件复制 + 依赖安装 + 配置种子 + opencode.jsonc 注册）。需要将 `postinstall` 升级为完整安装入口，并提供 CLI `install` 子命令作为手动备选。

同时，项目尚未发布到 npm，缺少 npm 发布所需的 package.json 合规字段、发布前测试流程、发布步骤和帮助文档。需要将项目整改为符合 npm 发布要求，并形成明确的发布指南文档。

## What Changes

- 重写 `src/postinstall.ts`：从仅配置种子升级为完整安装（复制 dist 文件到目标 `.opencode/plugins/` + 安装生产依赖 + 生成示例配置 + 注册 opencode.jsonc）
- 增强 `src/cli.ts`：新增 `install` 子命令，复用 postinstall 安装逻辑，作为 postinstall 失败时的手动备选入口
- 整改 `package.json`：补充 npm 发布合规字段（description、keywords、license、repository、homepage、bugs、author），确保 `files` 字段包含发布所需全部文件
- 新增发布前测试脚本：`npm pack` dry-run 验证包内容、`npm publish --dry-run` 验证发布
- 新增 `docs/PUBLISH.md`：npm 发布流程文档（发布前检查、发布步骤、版本管理、回滚策略）
- 项目级 vs 全局安装模式仅靠 `npm install` vs `npm install -g` 区分，postinstall 通过 `npm_config_global` env 自动检测
- 全局安装时插件注册写入全局 `~/.config/opencode/opencode.jsonc`（与现有 spec "不修改全局配置文件" 冲突，需修改该 requirement）
- **保留**现有 `install-local.sh` / `install-global.sh` 及对应 npm scripts，用于源码开发期快速安装
- 更新测试覆盖新增安装逻辑
- 更新 README.md 安装说明，增加 npm install 用法和发布指南链接

## Capabilities

### New Capabilities
- `npm-package-install`: npm 包通过 postinstall 自动完成插件完整部署（文件复制 + 依赖安装 + 配置种子 + opencode.jsonc 注册），支持项目级和全局两种模式，并提供 CLI `install` 子命令作为手动备选入口
- `npm-publish-preparation`: npm 发布前项目整改合规性（package.json 字段、files 声明、发布前测试验证）和发布流程文档

### Modified Capabilities
- `install-config-registration`: 全局安装模式下，安装脚本 SHALL 向全局配置文件（`~/.config/opencode/opencode.jsonc` 或 `~/.config/opencode/opencode.json`）写入插件注册信息，不再受"不修改全局配置文件"约束

## Impact

- **代码**：`src/postinstall.ts`（重写）、`src/cli.ts`（增强）、`package.json`（合规字段 + files）
- **API**：CLI 新增 `install` 子命令；postinstall 行为变更（从仅配置种子变为完整安装）
- **依赖**：发布包需包含 dist/、example config、package.json、bun.lock
- **测试**：`tests/postinstall.test.ts`、`tests/cli.test.ts`（新增）需覆盖完整安装逻辑
- **现有 sh 脚本**：保持不变，不受影响
- **文档**：新增 `docs/PUBLISH.md`，更新 `README.md` 安装说明
- **npm scripts**：新增 `prepublishOnly`（build + test）、`pack:dry`（npm pack dry-run）等发布辅助脚本
