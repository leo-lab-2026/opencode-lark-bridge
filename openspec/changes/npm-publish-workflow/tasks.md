## 1. 认证与配置准备

- [ ] 1.1 创建项目级 `.npmrc`，使用 `${NPM_TOKEN}` 占位符（不写入明文 token），并确认 `.gitignore` 不忽略必要文件、明文 token 不入库
- [ ] 1.2 验证 `npm whoami` 与账户 `leo-lab-2026`，确认当前认证可用

## 2. 发布脚本 scripts/publish.sh

- [ ] 2.1 创建脚本骨架（`set -euo pipefail`、参数解析 `--dry-run`/`--bump <type>`/`--help`、阶段函数与 trap ERR 注册）
- [ ] 2.2 实现认证检查函数（校验 `NPM_TOKEN` 已设置 + `npm whoami` 通过，失败时输出 granular automation token 创建指引并退出非零）
- [ ] 2.3 实现发布前验证函数（`npm run build` + `bun test` + `npm run pack:dry` 校验包内容 + `npm run test:install`）
- [ ] 2.4 实现版本写入与 tag 函数（接收 `--bump patch|minor|major`，校验类型合法性，执行 `npm version <type>` 写入并创建 `v<version>` tag）
- [ ] 2.5 实现发布与推送函数（`npm publish` + `git push --follow-tags` + `gh release create v<version>`）
- [ ] 2.6 实现 `--dry-run` 模式（认证检查 + 验证 + 预览将发布的包内容与当前版本号，不发布/不 tag/不推送）
- [ ] 2.7 实现 `--bump <type>` 完整模式（认证检查 + 验证 + 版本写入 + 发布 + 推送 + GitHub Release）
- [ ] 2.8 实现失败回滚清理（trap ERR：版本写入后、发布前失败时回退 `package.json` 版本号并删除未推送的本地 tag；输出失败原因与已清理项）

## 3. package.json 脚本入口

- [ ] 3.1 新增 `publish:dry`（`bash scripts/publish.sh --dry-run`）与 `publish:auto`（`bash scripts/publish.sh`，文档说明需配合 `--bump <type>` 参数由 agent 在暂停确认后传入）

## 4. 发布流程文档 docs/PUBLISH.md

- [ ] 4.1 重写文档结构：概述、发布前检查清单、手动发布方案、自动化发布方案、认证管理、版本管理、回滚策略、provenance 说明、npm 官方流程依据
- [ ] 4.2 编写手动发布方案章节（基于 npm 官方流程的分步操作：工作区检查 → 验证 → `npm version` → `npm publish` → `git push --follow-tags` → GitHub Release，每步含命令、预期结果、失败处理）
- [ ] 4.3 编写自动化发布方案章节（触发短语"按流程文档自动发布到 npm"、前置条件、SOP 编号步骤序列、版本号决策暂停点、最终发布确认暂停点、agent 执行指引：读取本章节后调用 `scripts/publish.sh`）
- [ ] 4.4 编写认证管理章节（granular automation token 创建流程、`NPM_TOKEN` 环境变量注入、`npm whoami` 验证、禁止明文存储、2FA 说明）
- [ ] 4.5 编写版本管理（SemVer 递增规则）、回滚策略（72h 内 `npm unpublish` / 72h 后 `git revert` + patch）、provenance 说明（需 GitHub Actions OIDC，暂不启用，给出未来路径）、npm 官方流程依据（引用 `npm publish`/`npm version`/`npm token`/`npm profile enable-2fa`/`--access`/`--provenance`/dist-tags 及官方文档来源）

## 5. README 与链接

- [ ] 5.1 在 `README.md` 安装/发布说明中增加指向 `docs/PUBLISH.md` 的链接

## 6. 验证

- [ ] 6.1 运行 `npm run publish:dry` 验证 `--dry-run` 正常执行（build + test + pack:dry + test:install + 包内容预览）
- [ ] 6.2 校验 `docs/PUBLISH.md` 章节完整性，对照 `npm-publish-workflow` 与 `npm-publish-preparation` spec 的验收场景逐项确认
- [ ] 6.3 运行 `tsc` 类型检查（`package.json` 改动后无类型错误）+ `bun test` 全通过
