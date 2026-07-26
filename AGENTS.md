# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-22
**Repo:** opencode-lark-bridge (非 git 仓库)

## OVERVIEW

OpenCode 插件（TypeScript + Bun, ESM），将 OpenCode 的权限申请/任务完成/问答事件通过 `lark-cli` 以 bot 身份推送到飞书用户或群聊。事件监听层与发送层通过 `Notifier` 接口解耦。

## STRUCTURE

```
opencode-lark-bridge/
├── src/
│   ├── index.ts              # 插件主入口 OpenCodeLarkBridge，注册 hooks + 增强 event
│   ├── cli.ts                # CLI bin 入口（init 命令，生成示例配置）
│   ├── postinstall.ts        # npm postinstall 钩子，全局/项目安装识别 + 配置种子
│   ├── config.ts             # JSONC 配置加载 + target 解析
│   ├── types.ts              # Notifier/Logger/PluginConfig 接口
│   ├── logger.ts             # 文件日志（北京时区，静默降级）
│   ├── events/               # 事件处理核心，见子目录 AGENTS.md
│   └── notifier/lark-notifier.ts  # 构造 lark-cli shell 命令并执行
├── tests/                    # Bun test，*.test.ts，与源码同名映射
├── dist/                     # tsc 构建产物（.js + .d.ts + .d.ts.map）
├── scripts/                  # install-local.sh / install-global.sh
├── docs/                     # lark-cli 速查、superpowers 开发历史、插件开发指南
├── openspec/                 # spec-driven 开发配置（config.yaml）
├── .omo/                     # OpenCode 运行时状态
├── .codegraph -> ~/.omo/...  # 符号链接到集中式 CodeGraph 索引
├── opencode-lark-bridge.config.example.jsonc  # 运行时配置模板
└── package.json              # bin: ./dist/cli.js，type: module
```

## WHERE TO LOOK

| Task        | Location                                                                         | Notes                                                          |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 新增/修改事件处理   | `src/events/`                                                                    | 见 `src/events/AGENTS.md`                                       |
| 改通知发送方式     | `src/notifier/lark-notifier.ts`                                                  | 构造 `lark-cli im +messages-send` 命令                             |
| 改配置加载/校验    | `src/config.ts` + `src/types.ts`                                                 | `comment-json` 解析 JSONC                                        |
| 改插件 hook 注册 | `src/index.ts`                                                                   | `OpenCodeLarkBridge(ctx)` 返回 event/permission.ask/session.idle |
| 改安装/配置初始化   | `src/postinstall.ts` + `src/cli.ts`                                              | 全局识别靠 `npm_config_global` + 路径探测                               |
| 改日志格式       | `src/logger.ts`                                                                  | 北京时区 `zh-CN`，`appendFileSync`，失败静默                             |
| 加测试         | `tests/<module>.test.ts`                                                         | Bun test，同名映射                                                  |
| 配置运行时凭证     | `.opencode/opencode-lark-bridge.config.jsonc`（项目级）或 `~/.config/opencode/...`（全局） | 查找顺序见 README                                                   |

## CODE MAP

来源：codegraph + 源码直读。Refs 为调用方/测试覆盖数。

| Symbol               | Type  | Location                           | Refs                         | Role                                                                           |
| -------------------- | ----- | ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `OpenCodeLarkBridge` | fn    | src/index.ts:35                    | index.test.ts                | 插件主入口；解析配置路径、建 notifier/handler、注册 hooks、增强 event（注入 projectName/sessionTitle） |
| `resolveConfigPath`  | fn    | src/index.ts:14                    | index.test.ts                | 项目级 → 全局配置查找顺序                                                                 |
| `createEventHandler` | fn    | src/events/event-handler.ts:7      | index.ts, 2 tests            | 去重 + 子代理过滤 + 路由到 mappers（见子目录 AGENTS.md）                                       |
| `createLarkNotifier` | fn    | src/notifier/lark-notifier.ts:9    | index.ts, 2 tests            | 构造 `lark-cli im +messages-send --as bot --text` 命令                             |
| `escapeShellArg`     | fn    | src/notifier/lark-notifier.ts:5    | lark-notifier.ts             | 双引号包裹 + 转义内嵌双引号                                                                |
| `mapPermissionEvent` | fn    | src/events/permission-mapper.ts:99 | event-handler, index, test   | 提取 tool/operation/resource，渲染模板                                                |
| `extractResource`    | fn    | src/events/permission-mapper.ts:49 | event-handler, test          | 按 tool 类型（bash/read/webfetch/task/skill/...）提取资源字段                             |
| `mapCompletionEvent` | fn    | src/events/completion-mapper.ts:5  | event-handler, test          | 提取 projectName/sessionTitle                                                    |
| `mapQuestionEvent`   | fn    | src/events/question-mapper.ts:104  | event-handler, test          | 多问题合并、选项截断（MAX_OPTIONS=5）、模板移除空 Options 行                                      |
| `loadConfig`         | fn    | src/config.ts:11                   | index.ts, test               | JSONC 解析 + 必填校验（app_id/app_secret/default_target）                              |
| `getEffectiveTarget` | fn    | src/config.ts:28                   | event-handler, index, test   | category.target → default_target 回退                                            |
| `createFileLogger`   | fn    | src/logger.ts:25                   | index.ts, 2 tests            | 北京时区时间戳，mkdir + appendFileSync，catch 静默降级                                      |
| `Notifier`           | iface | src/types.ts:11                    | event-handler, lark-notifier | `send(message): Promise<void>` 解耦事件层与发送层                                       |
| `initConfig`         | fn    | src/postinstall.ts:71              | cli.ts, test                 | 复制示例配置到目标目录，已存在则保留                                                             |
| `isGlobalInstall`    | fn    | src/postinstall.ts:48              | test                         | `npm_config_global` + INIT_CWD 路径探测                                            |
| `resolveTargetDir`   | fn    | src/postinstall.ts:63              | postinstall main             | 全局→`~/.config/opencode`，项目→`<INIT_CWD>/.opencode`                              |
| `main` (cli)         | fn    | src/cli.ts:16                      | (无测试)                        | 解析 `init [--global                                                             |
| `main` (postinstall) | fn    | src/postinstall.ts:102             | (无测试)                        | postinstall 入口，仅直接执行时调用                                                        |

## CONVENTIONS

- **运行时**: Bun（非 Node.js）；`"type": "module"` ESM
- **TypeScript**: `strict: true`，`target/module: ESNext`，`moduleResolution: bundler`，`declaration + declarationMap`
- **导入**: Node 内置用 `node:` 前缀；相对导入必须带 `.js` 扩展名（ESM + bundler resolution）
- **测试**: Bun test，`tests/*.test.ts` 与源码同名映射，`tests/fixtures/` 放夹具；`import { describe, it, expect, beforeEach, afterEach } from "bun:test"`
- **配置**: JSONC（`comment-json` 解析），文件名 `opencode-lark-bridge.config.jsonc`，查找顺序：项目 `.opencode/` → 全局 `~/.config/opencode/`（仅当 ctx.directory 非全局目录时回退）
- **日志**: 北京时区 `zh-CN`，写文件不写终端；`catch {}` 静默降级，绝不影响主流程
- **无 lint/format 配置**：无 ESLint/Prettier/Biome；风格靠 tsconfig strict 约束

## ANTI-PATTERNS (THIS PROJECT)

- **禁止读取 .env 文件**（见 docs/OPENCODE_PLUGIN_DEV_GUIDE.md 安全策略）
- **事件 hook 只读，不得修改 event 对象**（OpenCode 插件约束）
- **状态必须内存内**：`createEventHandler` 内的 `lastSent`/`subagentSessionIds`/`pendingChildren` 不持久化、不跨进程
- **不得为子代理完成单独发通知**：仅主会话 idle 且待完成子集合为空时发 completion
- **不得修改权限通知行为**：permission 通知路径独立于 completion
- **通知失败不得阻塞 OpenCode 主流程**：lark-cli 不可用/失败 → 记日志 + 跳过
- **避免 `console.log`**：用 `createFileLogger`，不干扰终端
- **strict 零类型错误**：所有改动必须通过 `tsc`
- **路径变更必须同步**：改安装路径时同步更新 `tests/index.test.ts`、`tests/postinstall.test.ts`、`README.md`

## UNIQUE STYLES

- **`{resource}` 按 tool 类型分派提取**：bash→命令参数，read/edit→filepath，webfetch→url，task→type，skill→name，doom_loop→`<innerTool>: <input>`，缺失降级为 `unknown`（见 permission-mapper.ts:49）
- **工具名解析兼容 `functions.bash:14` 格式**：OpenCode 新格式，正则 `^functions\.([^.:]+)(?::\d+)?$` 提取（permission-mapper.ts + event-handler.ts 均有副本）
- **子代理识别靠 `session.created` 的 `properties.info.parentID`**：加入父会话 pendingChildren 集合，idle 时移除
- **配置初始化不覆盖**：`initConfig` 检测目标存在则保留用户修改
- **postinstall 条件执行**：package.json `postinstall` 仅在 `dist/postinstall.js` 存在时调用，源码运行不触发
- **全局安装三重探测**：`npm_config_global` env → `INIT_CWD` 路径 → 当前文件路径

## COMMANDS

```bash
npm run build              # tsc 编译 src/ → dist/
bun test                   # 运行全部测试（等同 npm test）
npm run install:local      # 构建 + 复制到 .opencode/plugins/opencode-lark-bridge/ + 配置种子
npm run install:global     # 构建 + 复制到 ~/.config/opencode/plugins/... + 配置种子
npx opencode-lark-bridge init [--global|-g]  # 仅生成示例配置不装包
```

无 CI/CD、无 Makefile、无 Dockerfile。发布手动 `npm publish`。

## NOTES

- **非 git 仓库**：当前工作目录未初始化 git，无 commit/branch 元数据
- **`src/logs/plugin-load.marker`**：日志目录在源码树内（非标准），内含标记文件
- **`.codegraph` 是符号链接**：指向 `~/.omo/codegraph/projects/opencode-lark-bridge-b027196311ad82f9`，集中式索引
- **`docs/superpowers/{plans,reports,specs}/`**：Obra Superpowers 工作流的历史开发记录，按日期命名，非运行时代码
- **`skills-lock.json`**：锁定 obra/superpowers 15 个开发技能（TDD/计划/调试等）
- **`cli.ts` 的 `main` 无测试覆盖**：codegraph 标注 ⚠️；postinstall 的 `main` 也无直接测试
- **端到端验证**：需 `lark-cli auth status` 已登录 + 真实凭证配置 + 触发权限操作（如 `rm /tmp/test.txt`）

<comet-ambient-resume>
<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->
<!-- Contract: comet.resume_probe.v2 -->

## Comet Ambient Resume

在这个仓库中，开始处理需要改动或调查的任务前，如果可能存在活跃 Comet workflow，把当前用户请求传入只读探针：`comet resume-probe . --stdin --json`。

- 如果用户通过宿主明确调用任意 Comet Skill（例如 `@comet`、`/comet`、`@comet-native` 或 `/comet-hotfix`），显式调用优先于本恢复协议；不要运行 resume probe，直接进入被调用的 Skill。
- 只信任返回的 `workflow`、`skill` 和 `entrySource`；它们只由项目配置或无配置兼容回退决定。不得扫描或切换另一套 workflow。
- 如果 probe 返回 `auto_resume`，简短说明选中的 active change，并进入 `nextCommand` 指向的永久入口。不要把状态命令当作恢复入口直接推进。
- 如果 probe 返回 `ask_user`，只问一个简短问题并等待用户回复。
- 如果当前请求未明确调用 Comet Skill，且 probe 返回 `out_of_scope` 或 `none`，不要进入 Comet workflow。
- 如果配置或状态无效且没有 `nextCommand`，停止并报告原因；不要猜测另一个 workflow。
- 不能只因为存在 active change 就把无关任务挂到该 change。Native 的未提交改动由 Native 入口检查，不由探针自动归因。
</comet-ambient-resume>
