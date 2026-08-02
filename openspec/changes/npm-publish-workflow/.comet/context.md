# Comet Spec Context

- Change: npm-publish-workflow
- Phase: design
- Mode: beta
- Context hash: d84c335d4e7203e9660bbab2c465479fad651d5e6969ba3f9f77155394b27aea

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: openspec/changes/npm-publish-workflow/proposal.md
- SHA256: b2e032b176e1f01f6d95e61ac437507d50f119211d898b9bf57f4918afb879c6
- Source: openspec/changes/npm-publish-workflow/design.md
- SHA256: 1041ba2bf4a34879c1cdfaf10d83004624c9ccbc9ada4ffd145a9fbf4d1e5b06
- Source: openspec/changes/npm-publish-workflow/tasks.md
- SHA256: 30226aa2093c68fd374937e6de651c77fb14d8bd4b7ac3a82be46ff84dbec0b0
- Source: openspec/changes/npm-publish-workflow/specs/npm-publish-preparation/spec.md
- SHA256: f897393fb09584fa23b84519ef471f41c9921034c82c642eb2da068d16a2cdb5
- Source: openspec/changes/npm-publish-workflow/specs/npm-publish-workflow/spec.md
- SHA256: 11ea66bc9db00491dc236ae2d9e302b03b1e54eb10d6a380079c0c965a0712b5

## Acceptance Projection

## openspec/changes/npm-publish-workflow/specs/npm-publish-preparation/spec.md

- Source: openspec/changes/npm-publish-workflow/specs/npm-publish-preparation/spec.md
- Lines: 1-21
- SHA256: f897393fb09584fa23b84519ef471f41c9921034c82c642eb2da068d16a2cdb5

```md
## MODIFIED Requirements

### Requirement: 发布流程文档

项目 SHALL 包含完善的 npm 发布流程文档，覆盖手动与自动化两套发布方案，包含发布前检查、发布步骤、版本管理、认证管理、失败回滚、供应链安全说明与 npm 官方流程依据。

#### Scenario: 文档存在且内容完整
- **WHEN** 检查 `docs/PUBLISH.md`
- **THEN** 文档包含以下章节：发布前检查清单、手动发布方案（发布步骤、版本管理、GitHub Release 关联、回滚策略）、自动化发布方案（触发短语、SOP 步骤、版本号决策点、最终确认点）、认证管理（granular token、NPM_TOKEN、2FA）、供应链安全（provenance 说明）、npm 官方流程依据

#### Scenario: 自动化方案章节存在
- **WHEN** 检查 `docs/PUBLISH.md` 自动化发布方案章节
- **THEN** 章节定义触发短语"按流程文档自动发布到 npm"、前置条件、执行步骤序列、版本号决策暂停点、最终发布确认暂停点与 agent 执行指引

#### Scenario: 认证管理章节存在
- **WHEN** 检查 `docs/PUBLISH.md` 认证管理章节
- **THEN** 章节说明 granular automation token 创建流程、`NPM_TOKEN` 环境变量注入方式、`npm whoami` 验证步骤，并禁止在仓库存储明文 token

#### Scenario: README 链接发布文档
- **WHEN** 检查 README.md
- **THEN** 包含指向 `docs/PUBLISH.md` 的链接或在安装说明中引用发布流程

```

## openspec/changes/npm-publish-workflow/specs/npm-publish-workflow/spec.md

- Source: openspec/changes/npm-publish-workflow/specs/npm-publish-workflow/spec.md
- Lines: 1-125
- SHA256: 11ea66bc9db00491dc236ae2d9e302b03b1e54eb10d6a380079c0c965a0712b5

```md
## Purpose

定义 opencode-lark-bridge npm 包的发布工作流执行能力，覆盖手动与自动化两套发布路径，包括发布前验证、版本递增决策、认证检查、发布执行、推送与 GitHub Release 关联、失败回滚，以及基于流程文档的 agent 自动触发机制。

## ADDED Requirements

### Requirement: 手动发布工作流

项目 SHALL 提供基于 npm 官方流程的手动发布工作流文档，覆盖从发布前检查到发布后推送的完整路径，每步含可执行命令、预期结果与失败处理说明。

#### Scenario: 手动发布完整路径
- **WHEN** 开发者按 `docs/PUBLISH.md` 手动发布方案执行
- **THEN** 流程依次覆盖：工作区干净检查、发布前验证（build + test + pack:dry + test:install）、版本号更新（`npm version patch|minor|major`）、发布到 npm（`npm publish`）、推送代码与标签（`git push --follow-tags`）、创建 GitHub Release

#### Scenario: 手动发布引用 npm 官方流程
- **WHEN** 检查 `docs/PUBLISH.md` 的命令与说明
- **THEN** 引用 npm 官方发布流程关键点：`npm publish`、`npm version`、`npm whoami`、`npm token`、`npm profile enable-2fa`、`--access`、`--provenance`、dist-tags，并标注官方文档来源

### Requirement: 自动化发布工作流

项目 SHALL 提供自动化发布工作流，当用户发出触发短语"按流程文档自动发布到 npm"（或等价表述）时，agent 读取 `docs/PUBLISH.md` 自动化方案章节并按 SOP 逐步执行，在版本号决策点和最终发布确认点暂停等待用户输入。

#### Scenario: 自动化发布触发
- **WHEN** 用户在 agent 会话中输入"按流程文档自动发布到 npm"或等价触发短语
- **THEN** agent 读取 `docs/PUBLISH.md` 自动化方案章节，按定义的前置条件、执行步骤与暂停点逐步执行

#### Scenario: 版本号决策点暂停
- **WHEN** 自动化发布流程运行到版本号更新步骤
- **THEN** agent 暂停并询问用户版本递增类型（patch/minor/major 或具体版本号），用户确认后才写入版本并继续

#### Scenario: 最终发布确认点暂停
- **WHEN** 自动化发布流程完成发布前验证并准备执行 `npm publish`
- **THEN** agent 暂停并展示即将发布的版本号与包内容摘要，等待用户最终确认后才执行发布

#### Scenario: 自动化方案与手动方案并存
- **WHEN** 检查 `docs/PUBLISH.md`
- **THEN** 文档同时包含手动发布方案章节与自动化发布方案章节，两者步骤一致但自动化方案额外定义触发短语、暂停点与 agent 执行指引

### Requirement: 发布脚本确定性执行

项目 SHALL 提供 `scripts/publish.sh` 封装确定性发布步骤（构建、测试、pack 预检、test:install、版本写入、tag、发布、推送），支持 `--dry-run` 预演模式与失败回滚清理；交互步骤（版本类型选择、最终确认）不写入脚本，由 agent 在 SOP 暂停点处理。

#### Scenario: 正常发布执行
- **WHEN** 执行 `scripts/publish.sh`（已设置 `NPM_TOKEN` 并完成版本写入）
- **THEN** 脚本依次执行：build、test、pack:dry 校验、test:install、`npm publish`、`git push --follow-tags`，任一步失败则中止并清理中间状态

#### Scenario: 预演模式
- **WHEN** 执行 `scripts/publish.sh --dry-run`
- **THEN** 脚本执行发布前验证（build、test、pack:dry、test:install）并展示将发布的包内容与版本号，但不执行 `npm publish`、不创建 git tag、不推送

#### Scenario: 失败回滚清理
- **WHEN** 脚本在版本写入后、发布前失败，或在发布后、推送前失败
- **THEN** 脚本清理已创建的中间状态（回退版本号变更、删除未推送的本地 tag），并输出失败原因与已清理项，不留下半完成状态

#### Scenario: npm script 入口
- **WHEN** 检查 `package.json` 的 scripts
- **THEN** 包含 `publish:auto`（调用 `scripts/publish.sh`）和 `publish:dry`（调用 `scripts/publish.sh --dry-run`）入口

#### Scenario: 三子命令接口与暂停点映射
- **WHEN** 检查 `scripts/publish.sh` 的子命令
- **THEN** 提供 `verify`（认证检查 + 发布前验证）、`prepare --bump <type>`（验证 + 版本写入 + tag，不发布）、`release`（发布 + 推送 + GitHub Release）三个子命令；agent 工作流在 `verify` 后暂停询问版本号，在 `prepare` 后做最终确认，确认后调用 `release`

#### Scenario: release 阶段 npm publish 成功后不自动回滚
- **WHEN** `release` 子命令中 `npm publish` 成功但后续步骤（git push 或 gh release）失败
- **THEN** 脚本不回滚已发布的 npm 版本（不可逆），而是提示后续手动处理（重试失败步骤或走 72h unpublish 策略）

### Requirement: 发布认证管理

发布工作流 SHALL 使用 granular automation token（bypass 2FA）通过环境变量 `NPM_TOKEN` 注入认证，禁止在仓库或文档中存储明文 token；发布前验证认证状态。

#### Scenario: 认证通过环境变量注入
- **WHEN** 执行发布流程
- **THEN** npm 认证通过 `NPM_TOKEN` 环境变量与 `.npmrc` 的 `${NPM_TOKEN}` 占位符注入，不在仓库存储明文 token

#### Scenario: 发布前认证检查
- **WHEN** 发布流程启动
- **THEN** 执行 `npm whoami` 验证当前认证身份，未认证或 token 无效时中止流程并给出创建 granular automation token 的指引

#### Scenario: 未配置 NPM_TOKEN 的指引
- **WHEN** 发布前检查发现 `NPM_TOKEN` 未设置或 `npm whoami` 失败
- **THEN** 流程输出指引：登录 npm 网站 → Access Tokens → 创建 Granular Access Token（勾选 bypass 2FA、packages 读写权限）→ 导出 `NPM_TOKEN` 环境变量

### Requirement: 版本管理与 SemVer

发布工作流 SHALL 遵循语义化版本（SemVer），手动方案由开发者显式指定递增类型，自动化方案在暂停点由用户确认递增类型。

#### Scenario: SemVer 递增规则
- **WHEN** 更新版本号
- **THEN** patch 用于 bug 修复，minor 用于向后兼容的新功能，major 用于不兼容变更

#### Scenario: 版本号写入与 tag
- **WHEN** 确定版本递增类型
- **THEN** 通过 `npm version <type>` 写入版本并创建对应 git tag，tag 格式为 `v<version>`

### Requirement: 发布后推送与 GitHub Release

发布成功后 SHALL 推送代码与标签到远程，并创建关联 tag 的 GitHub Release。

#### Scenario: 推送代码与标签
- **WHEN** `npm publish` 成功
- **THEN** 执行 `git push --follow-tags` 推送代码与版本标签到远程仓库

#### Scenario: 创建 GitHub Release
- **WHEN** 标签推送成功
- **THEN** 使用 `gh release create v<version>` 从刚推送的 tag 创建 GitHub Release，附带 changelog 说明

### Requirement: 发布失败回滚策略

发布工作流 SHALL 提供发布失败回滚策略，区分 npm unpublish 时效与 git revert 修复路径。

#### Scenario: 72 小时内回滚
- **WHEN** 发布后 72 小时内发现严重问题需撤回
- **THEN** 执行 `npm unpublish opencode-lark-bridge@<version>` 撤回该版本（npm 限制发布 72h 后不可 unpublish）

#### Scenario: 72 小时后回滚
- **WHEN** 发布超过 72 小时后发现严重问题
- **THEN** 通过 `git revert` 回退变更并发布递增 patch 的修复版本

### Requirement: 供应链安全 provenance 说明

发布工作流文档 SHALL 说明 npm provenance（SLSA 供应链来源声明）的启用条件与当前状态，项目无 CI/CD 时不强制启用，但给出未来接入路径。

#### Scenario: provenance 状态说明
- **WHEN** 检查 `docs/PUBLISH.md`
- **THEN** 文档说明 provenance 需要 GitHub Actions OIDC 环境，项目当前无 CI/CD 故暂不启用 `--provenance`，并给出未来通过 GitHub Actions 接入的路径

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.