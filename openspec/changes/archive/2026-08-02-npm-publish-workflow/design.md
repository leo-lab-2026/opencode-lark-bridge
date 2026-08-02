## Context

项目当前 `docs/PUBLISH.md` 仅有基础手动发布步骤，`package.json` 已有 `prepublishOnly`（build+test）、`pack:dry`、`test:install` 脚本，npm 已登录（`leo-lab-2026`），无 CI/CD，git remote 指向 GitHub。现有 `npm-publish-preparation` spec 已约束发布前准备（package.json 字段、files 声明、测试验证、文档存在）。本次在此基础上新增发布工作流执行能力，不改动 `src/` 运行时逻辑。动机见 `proposal.md - Why`。

## Goals / Non-Goals

**Goals:**
- 建立可执行的自动化发布路径，支持"按流程文档自动发布到 npm"的触发短语
- 自动化方案与手动方案步骤一致，仅交互点不同（暂停询问版本号、最终确认）
- 发布步骤确定性封装为脚本，避免手工拼装遗漏
- 认证安全化：granular token + 环境变量，不存储明文

**Non-Goals:**
- 不引入 CI/CD 或 GitHub Actions（provenance 仅文档说明未来路径）
- 不改动插件运行时逻辑（`src/`）
- 不改动 OpenSpec spec 的发布前准备核心要求
- 不实现 commit message 自动推断版本类型（版本号由用户在暂停点确认）

## Decisions

### Decision 1: 自动化触发机制采用"文档即 SOP + 确定性脚本 + agent 处理交互"三者结合

**选择**：`docs/PUBLISH.md` 自动化方案章节写成结构化、agent 可读的 SOP（定义触发短语、前置条件、步骤序列、暂停点）；`scripts/publish.sh` 封装确定性步骤（build/test/pack/test:install/publish/push）；agent 读取文档后调用脚本，并在版本号决策点、最终确认点暂停询问用户。

**理由**：用户诉求是"按流程文档自动发布"，文档作为流程定义最贴近字面语义；但纯 agent 执行每条命令易遗漏且不可复用于非 agent 场景，脚本封装确定性步骤保证幂等与可独立调用；交互步骤（版本选择、确认）本质需人类决策，不应硬编码进脚本。

**备选**：
- 纯文档 SOP + agent 逐步执行命令：灵活但不可复用，且 agent 每步单独执行易中断后留下半完成状态。
- 纯可执行脚本：流程逻辑集中在脚本，文档仅说明；但版本选择与最终确认需交互，脚本难以干净处理交互暂停，且"按文档执行"的语义弱化。

### Decision 2: 版本号决策采用 agent 暂停询问用户

**选择**：自动发布流程运行到版本更新步骤时暂停，agent 询问用户 patch/minor/major 或具体版本号，用户确认后 agent 调用 `npm version <type>` 写入并继续。

**理由**：版本号是发布的核心决策，误判会导致 SemVer 违规；commit message 推断在无规范 commit 约束的项目中不可靠；默认 patch 在有新功能时会欠递增。

**备选**：commit message 推断（conventional commits）自动化程度高但本项目无规范 commit 约束，误判风险高；默认 patch 最简但可能与变更不匹配。

### Decision 3: 认证采用 granular automation token + NPM_TOKEN 环境变量

**选择**：引导用户在 npm 网站创建 Granular Access Token（勾选 bypass 2FA、packages 读写权限），通过 `NPM_TOKEN` 环境变量 + `.npmrc` 的 `${NPM_TOKEN}` 占位符注入；发布前 `npm whoami` 验证。

**理由**：granular token 可 bypass 2FA 适用于自动化场景，权限受限降低泄露风险；环境变量注入避免明文进仓库；与 npm 官方 CI/CD 推荐做法一致。

**备选**：维持现有 `~/.npmrc` 明文 token，最简但不适合长期自动化方案，且明文存储有泄露风险。

### Decision 4: publish.sh 设计为幂等 + --dry-run + 失败清理

**选择**：脚本分阶段执行（验证阶段、版本阶段、发布阶段、推送阶段），每阶段开始前检查前置条件；`--dry-run` 仅执行验证阶段并预览包内容；版本阶段后失败则回退 `package.json` 版本号并删除未推送的本地 tag。

**理由**：发布是副作用操作，幂等与失败清理避免半完成状态污染仓库与 npm；预演模式让用户在确认前看到将发布的实际内容。

**备选**：无回滚的线性脚本最简但失败后需手工清理，风险高。

### Decision 5: provenance 仅文档说明，暂不启用

**选择**：文档说明 provenance 需 GitHub Actions OIDC，项目无 CI/CD 故暂不启用 `--provenance`，给出未来接入路径。

**理由**：本地发布无法生成 provenance（需 OIDC token）；强行启用会发布失败。文档记录避免未来遗漏。

## Risks / Trade-offs

- **[风险] NPM_TOKEN 泄露** -> 文档禁止写入仓库与文档；`.npmrc` 仅用 `${NPM_TOKEN}` 占位符；脚本不回显 token。
- **[风险] 失败回滚不彻底** -> 脚本仅在版本写入后、发布前的窗口回退版本号与本地 tag；已发布的 npm 版本无法撤回（依赖 72h unpublish 策略），文档明确此边界。
- **[风险] agent 读取文档后执行偏差** -> SOP 章节采用结构化编号步骤 + 明确暂停点标记，降低 agent 解析歧义；脚本封装确定性步骤减少 agent 直接执行命令的范围。
- **[权衡] 不做 commit 推断版本** -> 自动化程度低于纯推断方案，但 SemVer 安全性更高，版本号由用户在暂停点显式确认。
- **[权衡] 不引入 CI/CD** -> 无法支持 provenance 与纯推送式自动发布；本次聚焦本地/agent 会话自动发布，CI/CD 留待未来。
