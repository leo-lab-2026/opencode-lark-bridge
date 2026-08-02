---
comet_change: npm-publish-workflow
role: technical-design
canonical_spec: openspec
---

# Design Doc: npm-publish-workflow

## 概述

为 opencode-lark-bridge 建立完善且可执行的 npm 发布工作流，包含手动与自动化两套方案，并实现"按流程文档自动发布到 npm"的 agent 可执行 SOP。基于 npm 官方发布流程，覆盖认证管理、版本递增、失败回滚与供应链安全说明。

动机与范围见 `openspec/changes/npm-publish-workflow/proposal.md`，能力规格见 `openspec/changes/npm-publish-workflow/specs/`。本 Design Doc 是对 open 阶段 `design.md` 高层框架的深度技术细化。

## 架构

### 组件划分

```
┌─────────────────────────────────────────────────────────────┐
│                    发布工作流系统                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌──────────────────┐               │
│  │ docs/PUBLISH.md │    │ scripts/         │               │
│  │ (双方案 SOP)    │    │  publish.sh      │               │
│  │                 │    │ (三子命令)       │               │
│  │ - 手动方案      │    │                  │               │
│  │ - 自动化方案    │    │ verify           │               │
│  │ - 认证管理      │    │ prepare --bump   │               │
│  │ - 回滚策略      │    │ release          │               │
│  │ - provenance    │    │ --dry-run        │               │
│  └────────┬────────┘    └────────┬─────────┘               │
│           │                      │                         │
│           │   agent 读取 SOP     │                         │
│           │   并调用脚本         │                         │
│           ▼                      ▼                         │
│  ┌────────────────────────────────────────┐                │
│  │           Agent SOP 工作流             │                │
│  │  触发短语 -> verify -> 暂停版本 ->      │                │
│  │  prepare -> 最终确认 -> release ->     │                │
│  │  报告(npm URL + GitHub Release URL)     │                │
│  └────────────────────────────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户触发 "按流程文档自动发布到 npm"
        │
        ▼
[agent] 读取 docs/PUBLISH.md 自动化方案章节
        │
        ▼
[agent] 调用 publish.sh verify
        │  ├─ 检查 NPM_TOKEN 环境变量
        │  ├─ npm whoami 验证身份
        │  ├─ npm run build
        │  ├─ bun test
        │  ├─ npm run pack:dry (校验包内容)
        │  └─ npm run test:install (安装验证)
        │
        ▼  verify 通过
[agent] 【暂停点 A】询问版本递增类型 patch/minor/major
        │  用户确认
        ▼
[agent] 调用 publish.sh prepare --bump <type>
        │  ├─ verify (幂等重跑)
        │  ├─ npm version <type> (写入 package.json + 创建 v<tag>)
        │  └─ 展示新版本号
        │
        ▼  prepare 完成
[agent] 【暂停点 B】展示版本号与包内容，最终发布确认
        │  用户确认
        ▼
[agent] 调用 publish.sh release
        │  ├─ npm publish
        │  ├─ git push --follow-tags
        │  └─ gh release create v<version>
        │
        ▼
[agent] 报告发布结果
        ├─ npm 包 URL
        └─ GitHub Release URL
```

## 子命令接口设计

### `scripts/publish.sh` 接口

```
用法:
  scripts/publish.sh verify                # 认证检查 + 发布前验证
  scripts/publish.sh prepare --bump <type>  # verify + 版本写入 + tag（不发布）
  scripts/publish.sh release               # npm publish + 推送 + GitHub Release
  scripts/publish.sh --dry-run             # verify + 预览包内容与版本号
  scripts/publish.sh --help                # 用法说明

<type>: patch | minor | major
```

### 各子命令职责

| 子命令 | 步骤 | 副作用 | 幂等性 |
|--------|------|--------|--------|
| `verify` | 认证检查 + build + test + pack:dry + test:install | 无 | 可重复执行 |
| `prepare --bump` | verify + `npm version <type>` + 创建 tag | package.json 版本号变更 + 本地 git tag | 重复执行会报错（版本已变更） |
| `release` | `npm publish` + `git push --follow-tags` + `gh release create` | npm 发布 + 远程推送 + GitHub Release | npm publish 重复会报错（版本已存在） |
| `--dry-run` | verify + 预览包内容与当前版本号 | 无 | 可重复执行 |

## 失败回滚边界

按子命令划分回滚策略，避免不可逆操作被误回滚：

| 失败位置 | 副作用状态 | 回滚动作 |
|---------|-----------|---------|
| `verify` 中 | 无 | 无需回滚，直接报告失败原因 |
| `prepare` 版本写入后、tag 创建前 | package.json 已改 | `git checkout -- package.json` 回退版本号 |
| `prepare` tag 创建后 | package.json + 本地 tag | 回退版本号 + `git tag -d v<version>` 删除本地 tag |
| `release` 中 `npm publish` 失败 | package.json + tag（prepare 已完成） | 不回滚（npm 未发布），提示修复后重试 release |
| `release` 中 `npm publish` 成功但 `git push` 失败 | npm 已发布、tag 未推送 | **不回滚 npm**（不可逆），提示手动 `git push --follow-tags` 或走 72h unpublish |
| `release` 中 `gh release` 失败 | npm 已发布、tag 已推送 | 提示手动重试 `gh release create`，不影响发布 |

**关键约束**：`release` 的 `npm publish` 成功后不再自动回滚。这是不可逆操作，与 spec 的 72h unpublish 策略一致。`prepare` 失败可安全回滚（版本未发布）。

## 认证管理设计

### 认证流程

```
┌──────────────────────────────────────────────┐
│  认证检查 (verify 子命令开头)                 │
└──────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  NPM_TOKEN 已设置?         npm whoami 成功?
        │                       │
        ├──否──> 输出指引       ├──否──> 输出指引
        │       退出非零        │       退出非零
        ▼                       ▼
              通过，继续验证阶段
```

### 配置

- **项目级 `.npmrc`**：`//registry.npmjs.org/:_authToken=${NPM_TOKEN}`（占位符，不入库明文 token）
- **granular automation token 创建指引**（写入 docs/PUBLISH.md 认证管理章节）：
  1. 登录 npmjs.com -> 头像 -> Access Tokens
  2. 创建 Granular Access Token
  3. 勾选 bypass 2FA（适用于自动化）
  4. 配置 packages 读写权限
  5. 导出 `NPM_TOKEN` 环境变量
- **现有 `~/.npmrc` 明文 token**：保留用于手动发布，文档说明迁移路径

## 文档结构设计

`docs/PUBLISH.md` 重写为以下章节：

1. **概述**：文档目的与两套方案并存说明
2. **发布前检查清单**：通用检查项（build/test/pack:dry/test:install/版本号/认证）
3. **手动发布方案**：基于 npm 官方流程的分步操作，每步含命令、预期结果、失败处理
4. **自动化发布方案**：触发短语、前置条件、SOP 编号步骤、暂停点 A/B、agent 执行指引
5. **认证管理**：granular token 创建、NPM_TOKEN 注入、npm whoami 验证、禁止明文存储
6. **版本管理**：SemVer 递增规则
7. **回滚策略**：72h 内 unpublish / 72h 后 git revert + patch
8. **供应链安全（provenance）**：需 GitHub Actions OIDC，暂不启用，未来路径
9. **npm 官方流程依据**：引用官方命令与文档来源

## 测试策略

### 测试分层

| 层级 | 方法 | 验证目标 |
|------|------|---------|
| 脚本语法 | `bash -n scripts/publish.sh` | 语法正确性 |
| dry-run 端到端 | `npm run publish:dry` | verify 链路完整（build+test+pack:dry+test:install+预览） |
| prepare 预演 | 临时分支 `prepare --bump patch` 后 `git reset --hard` 清理 | 版本写入与 tag 创建正确，可清理 |
| 文档完整性 | 对照 spec 验收场景逐项校验 | PUBLISH.md 章节齐全 |
| 回归 | `tsc` + `bun test` | 现有功能不受影响 |

### 关键验证点

- `--dry-run` 不产生任何副作用（不 tag、不 publish、不 push）
- `prepare` 创建的 tag 为 `v<version>` 格式
- `verify` 未配置 NPM_TOKEN 时给出清晰指引并退出非零
- `release` 失败时 npm 已发布的版本不被回滚

## Spec Patch

回写 `openspec/changes/npm-publish-workflow/specs/npm-publish-workflow/spec.md` 的"发布脚本确定性执行"requirement，补充两个 scenario 使验收场景与三子命令实现一致：

1. **三子命令接口与暂停点映射**：verify/prepare/release + 两个暂停点
2. **release 阶段 npm publish 成功后不自动回滚**：不可逆操作走人工/72h 策略

## 风险与权衡

- **[风险] NPM_TOKEN 泄露** -> `.npmrc` 仅用占位符，脚本不回显 token，文档禁止明文入库。
- **[风险] prepare 后忘记 release** -> agent SOP 流程化串联，prepare 后立即进入最终确认，避免版本写入后长期悬空。
- **[权衡] dry-run 包含 test:install 较慢** -> 保证发布前安装可用性，优于快速但遗漏安装验证。
- **[权衡] 不做 commit 推断版本** -> SemVer 安全性优先，版本号由用户显式确认。
- **[权衡] 不引入 CI/CD** -> 本次聚焦本地/agent 自动发布，provenance 留待未来。
