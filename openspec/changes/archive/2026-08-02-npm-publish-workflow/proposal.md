## Why

当前 `docs/PUBLISH.md` 仅覆盖基础手动发布步骤（`npm version` + `npm publish` + `git push`），未提供自动化发布方案，也未覆盖 npm 官方发布流程要求的认证管理（granular automation token、2FA）、版本递增决策、失败回滚执行和供应链安全（provenance）说明。开发者每次发布需手工拼装多步命令，易遗漏检查或推送顺序，且无法支持"按流程文档自动发布到 npm"的 agent 可执行诉求。本次变更基于 npm 官方发布文档，为项目建立两套完善且可执行的发布工作流（手动 + 自动化），并通过结构化 SOP + 确定性脚本实现 agent 触发的自动化发布。

## What Changes

- 重写 `docs/PUBLISH.md` 为双方案发布工作流文档：
  - **手动发布方案**：基于 npm 官方流程的分步操作（发布前检查、版本更新、发布、推送、GitHub Release、回滚），每步含命令、预期结果与失败处理。
  - **自动化发布方案**：结构化、agent 可读的 SOP 章节，定义触发短语（"按流程文档自动发布到 npm"）、前置条件、执行步骤、版本号决策点（暂停询问用户）、最终确认点和认证检查流程。
- 新增 `scripts/publish.sh`：封装确定性发布步骤（构建、测试、pack 预检、test:install、版本写入、tag、发布、推送），支持 `--dry-run` 预演模式与失败回滚清理；交互步骤（版本类型选择、最终确认）由 agent 在 SOP 暂停点处理，不写入脚本。
- 更新 `package.json`：新增 `publish:auto`（调用 `scripts/publish.sh`）和 `publish:dry`（`--dry-run`）脚本。
- 新增认证管理指引：引导使用 granular automation token（bypass 2FA）+ 环境变量 `NPM_TOKEN` 注入，禁止在仓库存储明文 token；文档说明 provenance 需 GitHub Actions OIDC，项目当前无 CI/CD 故暂不启用，给出未来接入路径。
- 更新 `README.md`：在安装/发布说明中链接到 `docs/PUBLISH.md`。
- 补充 npm 官方流程依据：文档引用 npm 官方关键命令（`npm publish`、`npm version`、`npm token create`、`npm profile enable-2fa`、`npm whoami`、`npm dist-tag`、`--provenance`、`--access`）。

## Capabilities

### New Capabilities
- `npm-publish-workflow`: npm 包发布工作流执行能力，覆盖手动与自动化两套发布路径，包括发布前验证、版本递增决策、认证检查、发布执行、推送与 GitHub Release 关联、失败回滚执行，以及基于流程文档的 agent 自动触发机制。

### Modified Capabilities
- `npm-publish-preparation`: "发布流程文档"需求的验收场景扩展，新增自动化方案章节、认证管理、自动触发机制与 npm 官方流程依据等完整性要求。

## Impact

- **文档**：`docs/PUBLISH.md` 重写为双方案结构；`README.md` 增加发布文档链接。
- **脚本**：新增 `scripts/publish.sh`（确定性发布步骤封装，幂等 + 失败清理）。
- **配置**：`package.json` 新增 `publish:auto`、`publish:dry` 脚本入口。
- **认证**：引导用户创建 granular automation token 并通过 `NPM_TOKEN` 环境变量注入；不改动 `~/.npmrc` 现有明文 token，文档说明迁移路径。
- **运行时代码**：不涉及 `src/` 插件运行时逻辑变更。
- **依赖**：不新增运行时依赖；`scripts/publish.sh` 仅依赖 bash、npm、git、gh（GitHub Release 可选）。
- **CI/CD**：不引入 GitHub Actions；provenance 仅文档说明未来路径。
