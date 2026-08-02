# Brainstorm Summary

- Change: npm-publish-workflow
- Date: 2026-08-02

## 确认的技术方案

采用三子命令架构的 `scripts/publish.sh`，配合 agent SOP 工作流：

- **`verify`**：认证检查（NPM_TOKEN + npm whoami）+ 发布前验证（build + test + pack:dry + test:install）
- **`prepare --bump <type>`**：verify + 版本写入（npm version）+ 创建 v<tag>，不发布
- **`release`**：npm publish + git push --follow-tags + gh release create

agent SOP 工作流：用户触发短语 -> 读取 docs/PUBLISH.md 自动化方案 -> verify -> 暂停点 A 询问版本类型 -> prepare --bump -> 暂停点 B 最终确认 -> release -> 报告结果（npm URL + GitHub Release URL）。

文档即 SOP：`docs/PUBLISH.md` 自动化方案章节写成结构化 agent 可读流程定义，手动方案与自动化方案并存。

认证：granular automation token（bypass 2FA）+ NPM_TOKEN 环境变量注入，禁止明文入库。

GitHub Release 是发布必要一环（release 子命令含 `gh release create`，用户明确强调）。

## 关键取舍与风险

- **三子命令使暂停点与脚本边界一一对应**：verify/prepare 间是版本号决策暂停点，prepare/release 间是最终确认暂停点，回滚边界最清晰。
- **release 的 npm publish 成功后不自动回滚**（不可逆）：仅提示后续手动处理（重试失败步骤或走 72h unpublish 策略）。
- **dry-run 包含 test:install**：完整验证，较慢但保证发布前安装可用性。
- **不做 commit 推断版本**：版本号由用户在暂停点显式确认，SemVer 安全性优先于自动化程度。
- **不引入 CI/CD**：本次聚焦本地/agent 会话自动发布，provenance 仅文档说明未来路径。

## 测试策略

- 脚本语法检查：`bash -n scripts/publish.sh`
- dry-run 端到端：`npm run publish:dry` 验证 verify 链路
- prepare 预演：临时分支测试版本写入与 tag 创建后 `git reset` 清理
- 文档完整性：对照 spec 验收场景逐项校验
- 回归：`tsc` + `bun test`

## Spec Patch

回写 `specs/npm-publish-workflow/spec.md` 的"发布脚本确定性执行"requirement，补充两个 scenario：
1. 三子命令接口与暂停点映射（verify/prepare/release + 两个暂停点）
2. release 阶段 npm publish 成功后不自动回滚（不可逆，走人工/72h 策略）
