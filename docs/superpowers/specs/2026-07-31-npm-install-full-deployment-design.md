---
comet_change: npm-install-full-deployment
role: technical-design
canonical_spec: openspec
---

# Design Doc: npm-install-full-deployment

## 概述

将 opencode-lark-bridge 插件的安装流程升级为 npm 包发布 + postinstall 自动完整安装，并提供 CLI `install` 子命令作为手动备选。同时整改项目为符合 npm 发布要求，形成发布流程文档和本地测试安装方案。

## 架构

### 模块组织

```
src/
├── installer.ts          # 新增：installPlugin + copyPluginFiles + installDependencies
├── config-register.ts    # 新增：registerPluginConfig（comment-json 实现）
├── postinstall.ts        # 保留增强：isGlobalInstall + resolveTargetDir + initConfig + main
└── cli.ts                # 增强：新增 install 子命令
```

### 调用关系

```
npm install opencode-lark-bridge
  └─> postinstall (package.json postinstall 脚本)
        └─> dist/postinstall.js main()
              └─> installPlugin({ global: isGlobalInstall() })
                    ├─> copyPluginFiles(pluginDir, sourceDir)
                    ├─> installDependencies(pluginDir)
                    ├─> initConfig({ targetDir })           # 配置种子
                    └─> registerPluginConfig({ global, pluginPath })

npx opencode-lark-bridge install [--global]
  └─> cli.ts install 命令分支
        └─> installPlugin({ global: flag })
              └─> (同上)
```

## 核心函数设计

### installer.ts

```typescript
interface InstallOptions {
  global?: boolean
  execFn?: (cmd: string, opts?: ExecSyncOptions) => string
}

// 完整安装入口：文件复制 + 依赖安装 + 配置种子 + 注册
function installPlugin(options: InstallOptions): void

// 复制 dist/* + package.json + bun.lock + example config 到目标 plugins 目录
function copyPluginFiles(pluginDir: string, sourceDir: string): void

// 在目标目录执行 bun install --production，回退 npm install --production
function installDependencies(pluginDir: string, execFn?: Function): void
```

**路径解析**：
- 包根目录：`path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')`
- 项目级目标：`<INIT_CWD || cwd>/.opencode/plugins/opencode-lark-bridge/`
- 全局目标：`~/.config/opencode/plugins/opencode-lark-bridge/`

**容错策略**：每个步骤独立 try-catch，失败输出 `console.warn`，不抛出非零退出码。

### config-register.ts

使用 `comment-json`（已是项目依赖）解析 JSONC：

```typescript
interface RegisterOptions {
  global: boolean
  pluginPath: string  // 项目级: ./plugins/opencode-lark-bridge，全局: 绝对路径
}

function registerPluginConfig(options: RegisterOptions): void
```

**统一处理流程**：
1. 选择目标配置文件（项目级或全局，按优先级 jsonc > json）
2. 用 `comment-json.parse()` 读取（保留注释）
3. 检查 `plugin` 数组是否已包含路径 -> 已注册则跳过
4. 未注册时：添加 `plugin` 字段或追加到数组
5. 用 `JSON.stringify`（comment-json 版本）序列化回去，保留注释

**目标配置优先级**：
- 项目级：`.opencode/opencode.jsonc` > `opencode.jsonc` > `.opencode/opencode.json` > `opencode.json`
- 全局：`~/.config/opencode/opencode.jsonc` > `~/.config/opencode/opencode.json`

### cli.ts install 子命令

```typescript
// 新增命令分支
if (command === "install") {
  const globalFlag = args.includes("--global") || args.includes("-g")
  installPlugin({ global: globalFlag })
}
```

更新 `printHelp()` 增加 install 命令说明。

## npm 发布整改

### package.json 补充字段

```json
{
  "description": "OpenCode plugin to push permission/task/question events to Feishu (Lark) via lark-cli",
  "license": "MIT",
  "keywords": ["opencode", "lark", "feishu", "plugin", "notification", "bot"],
  "repository": {
    "type": "git",
    "url": "https://github.com/leo-lab-2026/opencode-lark-bridge.git"
  },
  "homepage": "https://github.com/leo-lab-2026/opencode-lark-bridge",
  "bugs": {
    "url": "https://github.com/leo-lab-2026/opencode-lark-bridge/issues"
  },
  "author": "leo-lab-2026",
  "engines": {
    "node": ">=18"
  }
}
```

### files 字段

```json
{
  "files": [
    "dist",
    "opencode-lark-bridge.config.example.jsonc",
    "README.md",
    "package.json",
    "bun.lock"
  ]
}
```

### npm scripts 新增

```json
{
  "prepublishOnly": "npm run build && bun test",
  "pack:dry": "npm pack --dry-run",
  "test:install": "bash scripts/test-install.sh"
}
```

### LICENSE 文件

新增 MIT 许可证文件，版权年份 2026，版权人 leo-lab-2026。

## 发布前本地测试安装方案

### scripts/test-install.sh

自动化验证脚本流程：

1. `npm run build` 编译
2. `npm pack` 生成 tarball
3. 创建临时项目目录
4. **项目级测试**：`npm install <tarball>`
   - 验证 `.opencode/plugins/opencode-lark-bridge/dist/` 存在
   - 验证 `.opencode/plugins/opencode-lark-bridge/package.json` 存在
   - 验证 `.opencode/opencode-lark-bridge.config.jsonc` 配置种子生成
   - 验证 `.opencode/opencode.jsonc` 包含 plugin 注册
5. 清理，创建新临时目录
6. **全局测试**：`npm install -g <tarball>`
   - 验证 `~/.config/opencode/plugins/opencode-lark-bridge/` 存在
   - 验证全局 opencode.jsonc 注册
7. 清理临时目录和全局安装

脚本以 `set -euo pipefail` 开头，验证失败时退出码非零。

## 测试策略

### 单元测试

| 测试文件 | 覆盖范围 | mock 策略 |
|---------|---------|----------|
| `tests/installer.test.ts` | installPlugin, copyPluginFiles, installDependencies | 注入 mock execFn 避免真实安装 |
| `tests/config-register.test.ts` | 已注册/新建/追加，项目级/全局 | 临时目录 + 真实文件操作 |
| `tests/cli.test.ts` | install 命令分支 | mock installPlugin |
| `tests/postinstall.test.ts` | isGlobalInstall, resolveTargetDir, initConfig | 保留现有测试不变 |

### 端到端测试

`scripts/test-install.sh` 作为 `npm run test:install` 执行，验证真实 npm pack + install 流程。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| postinstall 在 pnpm/yarn 下 INIT_CWD 差异 | 三重探测 + process.cwd() 回退 |
| Windows 兼容性 | Node fs API（cpSync Node 16.7+）替代 shell |
| postinstall 失败影响 npm install | 全步骤 catch 静默降级，不抛非零退出码 |
| bun.lock 版本不匹配 | 依赖安装失败降级为警告 |
| config-register 逻辑重复（sh + TS） | 接受重复以保留 sh 脚本独立性 |
| 首次发布字段遗漏 | prepublishOnly + pack:dry + test:install 三重验证 |

## 发布流程文档（docs/PUBLISH.md）

### 发布前检查清单
- [ ] `npm run build` 编译无错误
- [ ] `bun test` 全部测试通过
- [ ] `npm run test:install` 本地安装验证通过
- [ ] `npm run pack:dry` 包内容只含 files 声明文件
- [ ] package.json version 已更新
- [ ] CHANGELOG 已更新（如有）

### 发布步骤
1. `npm version patch|minor|major`（自动 git commit + tag）
2. `npm publish`（触发 prepublishOnly -> build + test）
3. `git push --follow-tags`
4. GitHub Release：从 tag 创建，附 changelog

### 版本管理
- 遵循语义化版本（SemVer）
- patch: bug 修复
- minor: 向后兼容的新功能
- major: 不兼容的变更

### 回滚策略
- npm unpublish（72 小时内）
- git revert + 重新发布修复版本
