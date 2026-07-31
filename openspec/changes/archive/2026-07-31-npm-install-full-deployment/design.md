## Context

当前 `postinstall.ts` 仅做配置种子（`initConfig`），不复制文件、不安装依赖。完整安装逻辑分散在 `install-local.sh` 和 `install-global.sh` 中（build + cp dist + bun install + config seed + register）。`cli.ts` 仅有 `init` 子命令生成示例配置。

发布到 npm 后，包结构为：`dist/`（编译产物）、`package.json`、`bun.lock`、`opencode-lark-bridge.config.example.jsonc`。`postinstall` 运行时 `process.cwd()` 指向目标项目根目录（npm install 的目标），`INIT_CWD` 也指向目标项目。

项目已在 GitHub 上，但 package.json 缺少 npm 发布合规字段（description、keywords、license、repository、homepage、bugs、author），无 `prepublishOnly` 钩子，无发布流程文档。需要整改为符合 npm 发布要求。

## Goals / Non-Goals

**Goals:**
- postinstall 成为 npm 包的完整安装入口，复用 sh 脚本的核心逻辑（文件复制 + 依赖 + 配置 + 注册）但用 TypeScript 实现
- CLI `install` 子命令复用同一安装函数，确保行为一致
- 安装逻辑可测试（函数化、可注入参数）
- package.json 符合 npm 发布规范，包含全部合规字段
- 发布前自动测试验证，发布流程有文档可循

**Non-Goals:**
- 不实现跨进程持久化状态
- 不删除现有 sh 脚本（保留用于源码开发期）
- 不支持安装到任意指定目录（仅项目级或全局）
- 不引入额外环境变量控制安装模式
- 不实现 CI/CD 自动发布（发布手动执行）

## Decisions

### 决策 1：抽取共享 `installPlugin` 函数

**选择**：在 `postinstall.ts` 中抽取 `installPlugin(options)` 函数，封装完整安装逻辑（文件复制 + 依赖安装 + 配置种子 + 注册）。`postinstall` 入口和 `cli.ts install` 子命令均调用此函数。

**理由**：确保两条入口路径行为一致，避免逻辑重复。现有 `initConfig` 保留为 `installPlugin` 的一个子步骤。

**替代方案**：在 sh 脚本中调用 `node dist/postinstall.js` -- 但 sh 脚本已保留用于源码开发期，npm 包场景需要纯 Node 实现。

### 决策 2：安装模式检测基于 `npm_config_global`

**选择**：复用现有 `isGlobalInstall()` 函数（检测 `npm_config_global` env + INIT_CWD 路径探测 + 当前文件路径）。项目级时目标为 `<INIT_CWD>/.opencode/plugins/opencode-lark-bridge/`，全局时为 `~/.config/opencode/plugins/opencode-lark-bridge/`。

**理由**：现有 `isGlobalInstall()` 已经过测试，三重探测覆盖 npm/bun/pnpm 等场景。

### 决策 3：文件复制用 Node `fs` API

**选择**：用 `node:fs` 的 `cpSync` 或 `readdirSync + copyFileSync` 替代 sh 的 `cp -r`。复制范围：`dist/*`、`package.json`、`bun.lock`、`opencode-lark-bridge.config.example.jsonc`。

**理由**：跨平台兼容（Windows），不依赖 shell 命令。

### 决策 4：依赖安装优先 bun，回退 npm

**选择**：在目标 plugins 目录内执行依赖安装。优先使用 `bun install --production`；bun 不可用时回退 `npm install --production`；两者均不可用时输出警告并跳过。

**理由**：项目约定 Bun 为运行时，但 npm 包安装场景无法保证用户已安装 bun。

### 决策 5：CLI `install` 子命令实现

**选择**：在 `cli.ts` 中新增 `install` 命令分支，接受 `--global`/`-g` 标志。不带 `--global` 时调用 `installPlugin({ global: false })`，带时调用 `installPlugin({ global: true })`。

**理由**：用户手动调用时可能不在 npm install 上下文中，`npm_config_global` 不可靠，需要显式参数。

### 决策 6：配置注册逻辑复用 sh 中的 `config-register.sh` 逻辑

**选择**：将 `config-register.sh` 的核心逻辑（检查已注册 + 选择写入目标 + 写入 plugin 字段）用 TypeScript 重新实现，作为 `installPlugin` 的子步骤。项目级写入项目级 opencode.jsonc，全局写入全局 opencode.jsonc。

**理由**：postinstall 是纯 Node 进程，无法 source sh 脚本。需要用 `comment-json`（已是项目依赖）解析 JSONC。

### 决策 7：package.json 发布合规字段整改

**选择**：补充以下字段：`description`、`keywords`（opencode、lark、feishu、plugin、notification）、`license: MIT`、`repository`（指向 GitHub 仓库的对象）、`homepage`、`bugs`、`author`。新增 `engines` 字段声明 Node >= 18。

**理由**：npm 官方推荐字段，缺失会影响包可发现性和可维护性。`engines` 约束防止不兼容 Node 版本安装。

**替代方案**：使用 `.npmrc` 的 `access` 配置 -- 但 scope 包才需要，本项目用无 scope 公共包。

### 决策 8：发布前测试钩子

**选择**：新增 npm scripts：`prepublishOnly`（执行 build + test，失败中止发布）、`pack:dry`（npm pack --dry-run 验证包内容）。`prepublishOnly` 在 `npm publish` 时自动触发。

**理由**：`prepublishOnly` 是 npm 发布前最后的安全网，确保不会发布编译失败或测试不过的包。`pack:dry` 供开发者手动验证包内容。

### 决策 9：发布流程文档

**选择**：新增 `docs/PUBLISH.md`，覆盖：发布前检查清单、发布步骤（bump version -> build -> test -> npm publish -> git tag -> GitHub release）、版本管理策略（语义化版本）、回滚策略（npm unpublish 72h 内、git revert）。README 增加指向该文档的链接。

**理由**：用户明确要求"形成明确的帮助文档"。GitHub Release 与 npm publish 关联便于追踪。

## Risks / Trade-offs

- **[风险] postinstall 在不同包管理器下行为差异** -> pnpm/yarn 的 `INIT_CWD` 和 `npm_config_global` 可能不同；通过现有三重探测 + `process.cwd()` 回退缓解
- **[风险] Windows 兼容性** -> 使用 Node fs API 替代 shell 命令；`cpSync` 在 Node 16.7+ 可用
- **[权衡] 配置注册逻辑重复** -> sh 脚本和 TypeScript 各有一份 config-register 实现；接受此重复以保留 sh 脚本独立性
- **[风险] postinstall 失败影响 npm install** -> 所有步骤 catch 静默降级，输出 console.warn，不抛出非零退出码
- **[风险] bun.lock 复制到目标后 bun install 可能因版本不匹配失败** -> 依赖安装失败时降级为警告，不阻塞安装
- **[风险] npm 发布后 postinstall 在用户环境失败** -> 提供 CLI `install` 子命令作为备选入口；文档中说明手动安装方式
- **[风险] 首次发布 package.json 字段遗漏** -> `prepublishOnly` + `pack:dry` 双重验证；发布前用 `npm pack` 本地安装测试
