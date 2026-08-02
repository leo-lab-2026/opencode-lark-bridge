# 发布流程

本文档描述 opencode-lark-bridge npm 包的发布流程，提供手动与自动化两套方案。

## 概述

本项目提供两种发布路径：

- **手动发布方案**：开发者按文档步骤手动执行每条命令，适用于调试或特殊场景。
- **自动化发布方案**：在 OpenCode agent 会话中发出触发短语，agent 读取本文档并按 SOP 调用 `scripts/publish.sh` 执行，在版本号决策点和最终发布确认点暂停等待用户输入。

两种方案的步骤一致，自动化方案额外定义触发短语、暂停点与 agent 执行指引。

## 发布前检查清单

以下检查在两种方案中均需通过（`scripts/publish.sh verify` 自动执行）：

- [ ] `NPM_TOKEN` 环境变量已设置
- [ ] `npm whoami` 验证认证身份通过
- [ ] `npm run build` 编译无错误
- [ ] `bun test` 全部测试通过
- [ ] `npm run pack:dry` 包内容只含 `files` 声明的文件
- [ ] `npm run test:install` 本地安装验证通过

## 手动发布方案

### 前置：设置 NPM_TOKEN

项目级 `.npmrc` 使用 `${NPM_TOKEN}` 占位符，所有发布均需设置环境变量：

```bash
export NPM_TOKEN=<your-granular-token>
npm whoami  # 验证认证，预期输出 leo-lab-2026
```

### 1. 确认工作区干净

```bash
git status
```

预期：working tree clean。如有未提交更改，先处理。

### 2. 发布前验证

```bash
bash scripts/publish.sh verify
```

预期：依次执行认证检查 -> build -> test -> pack:dry -> test:install，全部通过后输出 `发布前验证通过`。

任一失败则中止，修复后重试。

### 3. 更新版本号

```bash
npm version patch  # 或 minor / major
```

此命令会：
- 更新 `package.json` 的 `version` 字段
- 创建 git commit（message 为版本号）
- 创建 git tag（格式 `v<version>`）

**SemVer 递增规则**：
- `patch`：bug 修复（0.1.0 -> 0.1.1）
- `minor`：向后兼容的新功能（0.1.0 -> 0.2.0）
- `major`：不兼容变更（0.1.0 -> 1.0.0）

失败处理：若 `npm version` 失败，package.json 未变更，直接重试。

### 4. 发布到 npm

```bash
npm publish
```

`prepublishOnly` 脚本会自动执行 build + test。

预期：发布成功，输出包 URL。

失败处理：若 `npm publish` 失败，npm 上不会有该版本。修复后重新执行 `npm publish`。版本号和 tag 已创建（步骤 3），无需重新 `npm version`。

### 5. 推送代码和标签

```bash
git push --follow-tags
```

预期：代码和版本标签推送到远程仓库。

失败处理：若推送失败但 npm 已发布，**不要回滚 npm**（已发布不可撤回）。修复网络或权限问题后重试 `git push --follow-tags`。

### 6. 创建 GitHub Release

```bash
gh release create v<version> --title "v<version>" --notes "Release <version>"
```

预期：从刚推送的 tag 创建 GitHub Release。

失败处理：不影响 npm 发布。手动重试即可。

## 自动化发布方案

### 触发短语

在 OpenCode agent 会话中输入：

> 按流程文档自动发布到 npm

或等价表述（如"发布新版本到 npm"）。

### 前置条件

- `NPM_TOKEN` 环境变量已设置（granular automation token）
- 工作区干净（无未提交更改）
- 远程仓库可推送

### SOP 步骤

agent 读取本章节后，按以下步骤执行：

1. **调用 verify**：执行 `bash scripts/publish.sh verify`
   - 脚本自动检查认证 + build + test + pack:dry + test:install
   - 失败则中止，报告失败原因

2. **【暂停点 A】版本号决策**：agent 暂停并询问用户：
   > 发布前验证通过。请选择版本递增类型：
   > - patch（bug 修复）
   > - minor（向后兼容的新功能）
   > - major（不兼容变更）

   用户确认 patch/minor/major 后继续。

3. **调用 prepare**：执行 `bash scripts/publish.sh prepare --bump <type>`
   - 脚本自动执行 verify（幂等重跑）+ `npm version <type>` + 创建 tag
   - 失败则自动回滚（回退版本号、删除本地 tag），报告失败原因

4. **【暂停点 B】最终发布确认**：agent 暂停并展示：
   > 即将发布版本：v<version>
   > 包内容已通过验证。
   > 确认发布？(yes/no)

   用户确认后继续。

5. **调用 release**：执行 `bash scripts/publish.sh release`
   - 脚本自动执行 `npm publish` + `git push --follow-tags` + `gh release create`
   - `npm publish` 成功后不回滚（不可逆操作）
   - 后续步骤失败则提示手动处理

6. **报告结果**：agent 输出：
   - npm 包 URL：`https://www.npmjs.com/package/opencode-lark-bridge/v/<version>`
   - GitHub Release URL：`https://github.com/leo-lab-2026/opencode-lark-bridge/releases/tag/v<version>`

### Agent 执行指引

- agent 不直接执行 npm/git 命令，而是调用 `scripts/publish.sh` 子命令
- 交互步骤（版本选择、最终确认）在 SOP 暂停点由 agent 向用户询问
- `scripts/publish.sh` 的 `--help` 可查看所有子命令
- `npm run publish:dry` 可用于预演（等价于 `scripts/publish.sh --dry-run`）

## 认证管理

### Granular Automation Token 创建

1. 登录 [npmjs.com](https://www.npmjs.com) -> 头像 -> Access Tokens
2. 点击 **Create New Token** -> 选择 **Granular Access Token**
3. 配置：
   - Token name: `opencode-lark-bridge-publish`
   - Expiration: 按需设置
   - Packages and scopes: 选择 `Read and write`
   - 勾选 **bypass 2FA**（适用于自动化发布）
4. 创建后复制 token（仅显示一次）
5. 导出环境变量：
   ```bash
   export NPM_TOKEN=<your-token>
   ```
   建议添加到 shell 配置文件（`~/.bashrc` / `~/.zshrc`）。

### NPM_TOKEN 注入

项目级 `.npmrc` 使用占位符：

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

npm 在读取 `.npmrc` 时，会将 `${NPM_TOKEN}` 替换为环境变量 `NPM_TOKEN` 的值。

### npm whoami 验证

发布前执行 `npm whoami` 验证当前认证身份：

```bash
npm whoami
```

预期输出：`leo-lab-2026`（或你的 npm 用户名）。

### 禁止明文存储

- **禁止**在 `.npmrc`、文档或任何文件中写入明文 token
- **禁止**将 `NPM_TOKEN` 的值提交到 git
- `.npmrc` 只能包含 `${NPM_TOKEN}` 占位符
- 现有 `~/.npmrc` 的明文 token 可继续用于不使用项目级 `.npmrc` 的场景，建议迁移到 granular token + 环境变量方式

### 2FA 说明

- granular automation token 勾选 bypass 2FA 后，发布时无需输入 2FA 验证码
- 手动发布时若启用了 2FA，`npm publish` 会提示输入验证码
- 启用 2FA（推荐）：`npm profile enable-2fa`

## 版本管理

遵循语义化版本（SemVer 2.0.0）：

| 递增类型 | 适用场景 | 示例 |
|---------|---------|------|
| `patch` | bug 修复 | 0.1.0 -> 0.1.1 |
| `minor` | 向后兼容的新功能 | 0.1.0 -> 0.2.0 |
| `major` | 不兼容的变更 | 0.1.0 -> 1.0.0 |

版本号写入与 tag：

```bash
npm version <type>
```

此命令会更新 `package.json` 的 `version` 字段，并创建格式为 `v<version>` 的 git tag。

## 回滚策略

### 72 小时内回滚

发布后 72 小时内发现严重问题需撤回：

```bash
npm unpublish opencode-lark-bridge@<version>
```

npm 限制发布 72 小时后不可 unpublish。

### 72 小时后回滚

发布超过 72 小时后发现严重问题：

1. `git revert` 回退变更
2. 发布递增 patch 的修复版本

## 供应链安全（provenance）

npm provenance（SLSA 供应链来源声明）提供包的构建来源证明，增强供应链安全。

### 当前状态

暂不启用。provenance 需要 GitHub Actions OIDC 环境，项目当前无 CI/CD，本地发布无法生成 provenance。

### 未来接入路径

1. 配置 GitHub Actions workflow
2. 在 workflow 中设置 `NPM_TOKEN` 和 OIDC 权限
3. 发布时添加 `--provenance` 参数：
   ```bash
   npm publish --provenance
   ```

参考：[npm provenance 文档](https://docs.npmjs.com/generating-provenance-statements)

## npm 官方流程依据

本文档基于 npm 官方发布流程，引用以下关键命令与文档：

| 命令 | 用途 | 官方文档 |
|------|------|---------|
| `npm publish` | 发布包到 npm registry | [npm publish](https://docs.npmjs.com/cli/v10/commands/npm-publish) |
| `npm version` | 更新版本号并创建 git tag | [npm version](https://docs.npmjs.com/cli/v10/commands/npm-version) |
| `npm whoami` | 验证当前认证身份 | [npm whoami](https://docs.npmjs.com/cli/v10/commands/npm-whoami) |
| `npm token create` | 创建 access token | [npm token](https://docs.npmjs.com/cli/v10/commands/npm-token) |
| `npm profile enable-2fa` | 启用双因素认证 | [npm profile](https://docs.npmjs.com/cli/v10/commands/npm-profile) |
| `npm unpublish` | 撤回已发布的包（72h 内） | [npm unpublish](https://docs.npmjs.com/cli/v10/commands/npm-unpublish) |
| `npm dist-tag` | 管理 dist-tags | [npm dist-tag](https://docs.npmjs.com/cli/v10/commands/npm-dist-tag) |
| `--access` | 控制包可见性（public/private） | [npm publish --access](https://docs.npmjs.com/cli/v10/commands/npm-publish#access) |
| `--provenance` | 生成供应链来源声明 | [npm provenance](https://docs.npmjs.com/generating-provenance-statements) |
