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
