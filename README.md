# opencode-lark-bridge

OpenCode 插件：将权限申请、任务完成、问答与错误信息通知推送到 Lark（飞书）。

## 功能

- 监听 OpenCode `permission.asked` 事件
- 监听 OpenCode `session.idle` 事件，在主会话完成时发送通知
- 监听 OpenCode `session.error` 事件，在致命错误（模型 API 400/429/500、额度耗尽、上下文溢出等）导致会话停止时发送通知
- 监听 OpenCode `session.status` 事件的重试状态（429 限流、额度耗尽、5xx 服务器错误等可重试错误），达到配置阈值后按节流窗口发送重试提醒；支持子代理开关（`notify_subagent`）与内容详略开关（`retry_detail`）
- 通过 `session.created` 的 `parentID` 自动识别并过滤子代理/子任务完成事件
- 通过 `lark-cli` 以 bot 身份向指定飞书用户或群聊发送通知
- 通知内容包含工具名、操作类型和受影响资源（如文件路径）
- 支持按事件类别配置通知目标与模板
- 毫秒级去重窗口，防止通知轰炸
- 所有日志写入文件，不干扰终端

## 安装

### 项目级安装（推荐）

配置文件初始化到当前项目根目录的 `.opencode/` 下，并在项目级 `opencode.jsonc`/`opencode.json` 中注册插件（优先级 `.opencode/opencode.jsonc` > `.opencode/opencode.json` > `./opencode.jsonc` > `./opencode.json`；已存在的配置文件只追加本插件条目，不会覆盖其他内容）：

```bash
npm install opencode-lark-bridge
# 或
bun add opencode-lark-bridge
```

> **npm 11+ 的 allow-scripts 警告**：`npm install` 时可能出现
> `npm warn allow-scripts ... opencode-lark-bridge@0.1.0 (postinstall: ...)` 提示。
> 这是 npm 11 的安全机制，**postinstall 仍会自动执行**，插件安装与注册不受影响。
> 如需消除该警告，可运行：`npm approve-scripts opencode-lark-bridge`。

### 全局安装

配置文件初始化到用户主目录的 `~/.config/opencode/` 下，所有项目共享：

```bash
npm install -g opencode-lark-bridge
# 或
bun add -g opencode-lark-bridge
```

### 不安装，一次性初始化（npx）

只想在当前项目生成配置文件而不把包加入 `package.json`：

```bash
npx opencode-lark-bridge init
```

全局初始化：

```bash
npx opencode-lark-bridge init --global
```

### 卸载

按安装方式选择对应的卸载步骤。`npx opencode-lark-bridge uninstall` 只删除插件文件并清理配置注册（`opencode.jsonc`/`opencode.json` 中的本插件**本地路径**条目，其他内容保留），**不会**卸载 npm 包本身，也**不会**清理 OpenCode 的插件缓存目录（见下）。注意在项目根目录运行（项目级），插件目录按当前目录定位。

#### npm install / bun add 安装的卸载

```bash
# 1. 删除插件文件并清理配置注册
npx opencode-lark-bridge uninstall
# 全局安装的：
npx opencode-lark-bridge uninstall --global

# 2. 从依赖中移除 npm 包
npm uninstall opencode-lark-bridge
# 或
bun remove opencode-lark-bridge
```

#### 开发者本地安装的卸载

本地脚本安装（`npm run install:local` / `install:global`）没有 npm 包，只需删除插件文件与注册：

```bash
npx opencode-lark-bridge uninstall
# 全局：
npx opencode-lark-bridge uninstall --global
```

也可以手动删除并清理注册：

```bash
rm -rf .opencode/plugins/opencode-lark-bridge
# 全局：
rm -rf ~/.config/opencode/plugins/opencode-lark-bridge
```

同时从 `opencode.jsonc`/`opencode.json` 的 `plugin` 数组中移除本插件条目（项目级为 `"./plugins/opencode-lark-bridge"` 相对路径；全局安装注册的是绝对路径 `~/.config/opencode/plugins/opencode-lark-bridge`），其他内容保留。

#### opencode.jsonc 声明 npm 包名的卸载

通过 `"plugin": ["opencode-lark-bridge"]` 声明安装的插件由 OpenCode 自动安装到缓存目录，卸载分三步：

1. **移除配置条目**：从配置文件（项目级 `.opencode/opencode.jsonc`、`.opencode/opencode.json`、`./opencode.jsonc`、`./opencode.json`，或全局 `~/.config/opencode/opencode.json(c)`）的 `plugin` 数组中删除 `"opencode-lark-bridge"`。若该数组中还保留着本地路径条目（项目级 `"./plugins/opencode-lark-bridge"`，全局为绝对路径 `~/.config/opencode/plugins/opencode-lark-bridge`，比如之前用 `install:local`/`install:global` 装过），也一并移除。
2. **删除插件缓存**（可选，释放磁盘空间；不删则文件残留但不再加载）：

   ```bash
   rm -rf ~/.cache/opencode/packages/opencode-lark-bridge@latest
   rm -rf ~/.cache/opencode/packages/opencode-lark-bridge
   ```

   缓存目录名随声明的版本 spec 变化（如指定版本 `opencode-lark-bridge@0.2.2`），可用 `ls ~/.cache/opencode/packages/ | grep opencode-lark-bridge` 确认实际目录。
3. **删除运行时配置**（可选）：`.opencode/opencode-lark-bridge.config.jsonc`（项目级）或 `~/.config/opencode/opencode-lark-bridge.config.jsonc`（全局）。

重启 OpenCode 后生效。

> ⚠️ **注意**：`opencode plugin <module>` 命令只支持安装、**没有卸载子命令**；而 `opencode uninstall` 卸载的是 **OpenCode 本体**（连同所有相关文件），不是单个插件，切勿误用。

#### 彻底清理清单（曾混用多种安装方式时）

如果先 `npm install`（或 `install:local`）装过、后来又改用 `opencode.jsonc` 声明方式，卸载时需逐一确认以下位置都已清理，避免残留或双重加载：

| 位置                                                               | 说明                          |
| ---------------------------------------------------------------- | --------------------------- |
| `plugin` 数组中的 `"opencode-lark-bridge"`（npm 包名）条目                   | 配置声明方式                    |
| `plugin` 数组中的本地路径条目（项目级 `"./plugins/opencode-lark-bridge"`，全局为绝对路径）    | npm install / 本地脚本方式       |
| `.opencode/plugins/opencode-lark-bridge/` 或 `~/.config/opencode/plugins/opencode-lark-bridge/` | 本地插件目录                     |
| `~/.cache/opencode/packages/` 下的 `opencode-lark-bridge*` 缓存目录         | OpenCode 自动安装缓存             |
| `.opencode/opencode-lark-bridge.config.jsonc` 或 `~/.config/opencode/opencode-lark-bridge.config.jsonc` | 运行时配置（含飞书凭证，卸载时一并删除）    |

### 开发者本地安装

源码在仓库内时，使用本地脚本进行项目级部署：

```bash
cd opencode-lark-bridge
npm run build
npm run install:local
```

进行全局部署：

```bash
cd opencode-lark-bridge
npm run build
npm run install:global
```

### 通过 opencode.jsonc 声明（免手动安装）

OpenCode 原生支持在配置文件中直接声明 npm 包名，启动时自动安装插件，**无需手动执行 `npm install`**。适合不想把插件加入 `package.json`、或想让 OpenCode 自管理插件生命周期的场景。

#### 基本写法

在项目级 `.opencode/opencode.jsonc`（或 `./opencode.jsonc`）或全局 `~/.config/opencode/opencode.json` 中：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-lark-bridge"]
}
```

- 包名必须是 **`opencode-lark-bridge`**（无 scope）。注意 `@leo-lab-2026/opencode-lark-bridge` 这类 scoped 名在 npm 上不存在，会导致 404。
- 不带版本时 OpenCode 自动解析为 `@latest`；也可指定版本如 `"opencode-lark-bridge@0.2.2"`。

#### 自动安装机制

OpenCode 启动时通过 `@npmcli/arborist` 把插件安装到缓存目录 `~/.cache/opencode/packages/<spec>/node_modules/`，并设置 `ignoreScripts: true`：

| 行为          | 说明                                                                  |
| ----------- | ------------------------------------------------------------------- |
| 安装位置        | `~/.cache/opencode/packages/opencode-lark-bridge@latest/node_modules/opencode-lark-bridge/` |
| 依赖          | 插件 `dependencies`（如 `comment-json`）一并安装到同目录                          |
| postinstall | **不执行**（`ignoreScripts: true`）                                      |
| 版本兼容检查      | 插件未声明 `engines.opencode`，跳过                                         |
| 升级          | 改版本号或删除缓存目录后重启 OpenCode 触发重装                                        |

> ⚠️ **与 `npm install` 方式的关键差异**：`npm install opencode-lark-bridge`（或 `npx opencode-lark-bridge init`）会执行 `postinstall`，自动把插件复制到 `.opencode/plugins/` 并注册到 `opencode.jsonc`；而本方式 postinstall 被跳过，**配置文件需手动创建**（见下文）。

#### 手动创建配置文件

由于 postinstall 不执行，需手动把示例配置放到 OpenCode 会查找的位置。配置查找顺序（命中即停）：

1. `<项目目录>/.opencode/opencode-lark-bridge.config.jsonc`
2. `~/.config/opencode/opencode-lark-bridge.config.jsonc`（仅当项目目录不是 `~/.config/opencode` 时）

若本地已 `npm install opencode-lark-bridge`，可从 `node_modules` 复制示例配置：

```bash
# 项目级配置
mkdir -p .opencode
cp node_modules/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc \
   .opencode/opencode-lark-bridge.config.jsonc

# 或全局配置
mkdir -p ~/.config/opencode
cp node_modules/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc \
   ~/.config/opencode/opencode-lark-bridge.config.jsonc
```

> 若未 `npm install`，也可从 [GitHub 示例](https://github.com/leo-lab-2026/opencode-lark-bridge/blob/main/opencode-lark-bridge.config.example.jsonc) 复制内容。配置字段说明见下方 [配置](#配置) 章节。

编辑配置文件填入飞书 `app_id` / `app_secret` / `default_target` 等凭证，并确保 `lark-cli` 已安装并登录（`lark-cli auth status`）。

#### 避免双重注册

OpenCode 会分别加载 local plugin 和 npm plugin，**同名也会分别加载**。如果之前用过 `npm run install:local` 或 `install:global`，改用本方式前请清理旧注册：

- 删除 `.opencode/plugins/opencode-lark-bridge/` 目录（项目级）或 `~/.config/opencode/plugins/opencode-lark-bridge/`（全局）
- 从 `opencode.jsonc` 中移除 `"./plugins/opencode-lark-bridge"` 本地路径条目，只保留 `"opencode-lark-bridge"` npm 包名条目

否则每次事件会收到**两条通知**。

### OpenCode agent 自动安装提示词

把下面提示词粘贴给 OpenCode agent，让它自动完成安装与配置。提示词区分全局与项目级。两种方式都基于「在 `opencode.jsonc` 声明 npm 包名」，OpenCode 启动时自动安装，无需手动 `npm install`。

#### 项目级安装提示词

```
请帮我配置 opencode-lark-bridge 插件（项目级，通过 opencode.jsonc 声明 npm 包名方式）。

步骤：
1. 检查 lark-cli 是否已安装并登录：运行 `lark-cli auth status`。若未登录，提示我先执行 `lark-cli auth login` 完成登录。
2. 检查项目级 opencode 配置文件（优先级 .opencode/opencode.jsonc > .opencode/opencode.json > ./opencode.jsonc > ./opencode.json），找到已存在的文件；都不存在则在 .opencode/opencode.jsonc 新建。
3. 在配置文件的 plugin 数组中加入 "opencode-lark-bridge"（无 scope；不要写成 @leo-lab-2026/opencode-lark-bridge，该 scoped 名不存在）。若已有 "./plugins/opencode-lark-bridge" 本地路径条目，请删除该本地条目以避免双重通知。
4. 创建插件运行时配置：把 opencode-lark-bridge.config.example.jsonc 内容复制到 .opencode/opencode-lark-bridge.config.jsonc。示例可从 https://github.com/leo-lab-2026/opencode-lark-bridge/blob/main/opencode-lark-bridge.config.example.jsonc 获取。
5. 提示我编辑 .opencode/opencode-lark-bridge.config.jsonc，填入飞书 app_id / app_secret / default_target（chat_id 或 user_id）。
6. 完成后告诉我重启 OpenCode 即可生效——OpenCode 启动时会自动从 npm 安装插件到缓存目录，无需手动 npm install。
```

#### 全局安装提示词

```
请帮我配置 opencode-lark-bridge 插件（全局，通过 opencode.jsonc 声明 npm 包名方式，所有项目共享）。

步骤：
1. 检查 lark-cli 是否已安装并登录：运行 `lark-cli auth status`。若未登录，提示我先执行 `lark-cli auth login` 完成登录。
2. 检查全局 opencode 配置文件 ~/.config/opencode/opencode.json（或 ~/.config/opencode/opencode.jsonc），不存在则新建 ~/.config/opencode/opencode.json。
3. 在配置文件的 plugin 数组中加入 "opencode-lark-bridge"（无 scope；不要写成 @leo-lab-2026/opencode-lark-bridge，该 scoped 名不存在）。若已有 "./plugins/opencode-lark-bridge" 本地路径条目，请删除该本地条目以避免双重通知。
4. 创建插件运行时配置：把 opencode-lark-bridge.config.example.jsonc 内容复制到 ~/.config/opencode/opencode-lark-bridge.config.jsonc。示例可从 https://github.com/leo-lab-2026/opencode-lark-bridge/blob/main/opencode-lark-bridge.config.example.jsonc 获取。
5. 提示我编辑 ~/.config/opencode/opencode-lark-bridge.config.jsonc，填入飞书 app_id / app_secret / default_target（chat_id 或 user_id）。
6. 完成后告诉我重启 OpenCode 即可生效——OpenCode 启动时会自动从 npm 安装插件到缓存目录，无需手动 npm install。
```

## 配置

运行时按以下顺序查找 `opencode-lark-bridge.config.jsonc`，命中即返回：

1. `<ctx.directory>/.opencode/opencode-lark-bridge.config.jsonc`（项目级配置）
2. `~/.config/opencode/opencode-lark-bridge.config.jsonc`（全局配置，仅在 `ctx.directory` 不是 `~/.config/opencode` 时查找）

安装脚本会在对应配置目录首次创建示例配置；已存在则保留不覆盖。插件目录内不再存放配置文件。

**详细配置指南**：参见 [docs/CONFIG_GUIDE.md](./docs/CONFIG_GUIDE.md)，包含所有模板变量的详细说明和自定义示例。

### 项目级配置

```bash
<project>/.opencode/opencode-lark-bridge.config.jsonc
```

### 全局配置

```bash
~/.config/opencode/opencode-lark-bridge.config.jsonc
```

### 开发期配置（可选）

```bash
cp opencode-lark-bridge.config.example.jsonc opencode-lark-bridge.config.jsonc
```

编辑配置文件，填入以下信息：

| 字段                               | 说明              | 示例                                 |
| -------------------------------- | --------------- | ---------------------------------- |
| `app_id`                         | 飞书应用 App ID     | `cli_xxxx`                         |
| `app_secret`                     | 飞书应用 App Secret | `xxxx`                             |
| `default_target.chat_id`         | 默认通知群聊 ID       | `oc_xxxx`                          |
| `default_target.user_id`         | 默认通知用户 ID       | `ou_xxxx`                          |
| `debounce_ms`                    | 去重窗口（毫秒）        | `3000`                             |
| `log_file`                       | 日志文件路径          | `./logs/app.log`                   |
| `categories.permission.template` | 权限通知模板          | `🔔 {tool} {operation} {resource}` |
| `categories.completion.target`   | 完成通知目标          | `{ "chat_id": "oc_xxxx" }`         |
| `categories.completion.template` | 完成通知模板          | `✅ {projectName}: {sessionTitle}`  |
| `categories.error.target`        | 错误通知目标          | `{ "chat_id": "oc_xxxx" }`         |
| `categories.error.template`      | 错误通知模板          | `⚠️ {errorType}: {errorMessage}`   |
| `categories.retry.target`        | 重试通知目标          | `{ "chat_id": "oc_xxxx" }`         |
| `categories.retry.template`      | 重试通知模板          | `⚠️ 重试中：{message}（第 {attempt} 次）` |
| `categories.retry.retry_threshold` | attempt 触发阈值（达到才通知） | `1`（首次即通知）            |
| `categories.retry.retry_interval_ms` | 同一会话重复提醒间隔 | `900000`（15 分钟）              |
| `categories.retry.notify_subagent` | 子代理重试是否通知      | `false`                             |
| `categories.retry.retry_detail`  | 是否包含尝试次数与下次重试时间 | `true`                       |

### 权限类型覆盖

`{tool}` / `{operation}` / `{resource}` 三个模板变量对所有 OpenCode 权限类型都生效。`{resource}` 的取值规则：

| 权限类型                 | `{resource}` 提取字段                       | 示例                        |
| -------------------- | --------------------------------------- | ------------------------- |
| `bash`               | `args.command` 的参数部分                    | `-f /tmp/foo.txt`         |
| `read` / `edit`      | `metadata.filepath` → `args.filePath`   | `/home/project/a.md`      |
| `glob` / `grep`      | `args.patterns[0]` 或命令参数                | `**/*.ts`                 |
| `webfetch`           | `args.url` → `args.uri`                 | `https://example.com/api` |
| `websearch`          | `args.query`                            | `lark cli auth`           |
| `task`               | `args.type` → `args.agent`              | `explore`                 |
| `skill`              | `args.name` → `args.skill`              | `git-master`              |
| `external_directory` | `args.path` → `args.directory`          | `/tmp/external`           |
| `doom_loop`          | `args.tool` + `args.input`              | `bash: rm -rf /tmp/cache` |
| `lsp`                | 走 fallback chain（`metadata.filepath` 等） | 视 LSP 请求而定                |

字段找不到时 `{resource}` 优雅降级为字符串 `unknown`，不会抛错。

### 任务完成通知

插件同时监听 `session.idle` 事件。当用户主会话完成，且其下所有子代理/子任务均已完成时，会发送 `categories.completion` 配置的通知；子代理或子任务自身完成时不会发送。若主会话进入 idle 时仍有未完成的子代理/子任务，插件会等待最终 idle 后再统一发送通知。

子代理识别逻辑：当收到 `session.created` 事件时，若 `properties.info.parentID` 存在，则将该会话 ID 记录为子代理并加入父会话的待完成集合；子代理 `session.idle` 时从集合中移除；主会话 `session.idle` 时仅当待完成集合为空才发送通知。

完成通知模板变量：

| 变量               | 说明   | 示例              |
| ---------------- | ---- | --------------- |
| `{projectName}`  | 项目名  | `My Project`    |
| `{sessionTitle}` | 会话标题 | `Refactor auth` |

字段缺失时模板变量降级为字符串 `unknown`。

### 问答通知

插件监听 OpenCode `question.asked` 事件。当 agent 向用户提出多选问题时，会推送包含问题标题、问题文本和选项列表的通知。若短时间内有多个问题同时进入，将合并为一条通知，避免重复骚扰。

配置项为 `categories.question`。支持以下模板字段：

| 字段                        | 说明                       | 默认值                                            |
| ------------------------- | ------------------------ | ---------------------------------------------- |
| `template`                | 单问题通知模板                  | `❓ OpenCode Question\nProject: {projectName}…`  |
| `template_multiple`       | 多问题通知整体框架模板（可选）          | `❓ OpenCode Question\nProject: {projectName}…`  |
| `question_item_template`  | 多问题中每个问题项的模板（可选，配合上方字段） | `{number}. {header}\n   {question}\n   Options…` |

模板变量如下：

| 变量              | 说明                          | 示例                               |
| --------------- | --------------------------- | -------------------------------- |
| `{header}`      | 问题标题（截断至 200 字符）            | `Which language?`                 |
| `{question}`    | 问题文本（截断至 200 字符）            | `Select a language for the project` |
| `{options}`     | 选项列表（最多 5 项，多余截断）           | `- TypeScript\n- Rust\n- Python`  |
| `{projectName}` | 项目名                         | `My Project`                      |
| `{suffix}`      | 问题后缀文本（可选，如补充说明）            | `Please select one option`        |
| `{questions}`   | 多问题时，所有问题项的渲染结果（仅多问题模板）     | `1. Header 1\n   Question 1…`     |
| `{number}`      | 问题编号（仅 `question_item_template` 使用） | `1`                               |

各字段缺失时降级为字符串 `unknown`。

### 错误通知

插件监听 OpenCode `session.error` 事件。当致命错误（模型 API 错误 400/401/402/422/500、额度耗尽、上下文溢出等不可重试错误）导致会话停止时，会发送 `categories.error` 配置的通知。与完成通知不同，子代理产生的错误也会推送通知——子代理错误可能阻塞父会话，用户需及时知晓。

opencode 的错误对象形状为 `{ name, data: { message, statusCode } }`（如 `APIError (429)`）；`{errorType}` 在存在 `statusCode` 时附加状态码显示。兼容旧形状 `{ type, message }`（存在时优先）。

配置项为 `categories.error`（见下方模板变量节）。模板变量如下：

| 变量               | 说明               | 示例                           |
| ---------------- | ---------------- | ---------------------------- |
| `{errorType}`    | 错误类型（opencode 实际形状下附加 HTTP 状态码，如 `APIError (429)`） | `ProviderError`              |
| `{errorMessage}` | 错误消息（可能含 HTTP 状态码） | `429 Too Many Requests`       |
| `{sessionID}`    | 会话 ID（缺失为 unknown） | `sess-123`                   |
| `{projectName}`  | 项目名             | `My Project`                 |

各字段缺失时降级为字符串 `unknown`。

### 重试通知

插件监听 OpenCode `session.status` 事件中 `status.type === "retry"` 的状态。模型 API 返回 429 限流、额度耗尽、5xx 服务器错误等可重试错误时，opencode 会**无限重试**且不触发 `session.error`——重试期间插件原先完全静默。现在首次达到 `retry_threshold`（默认 1，即首次重试）立即发送通知；重试持续期间，同一会话最多每 `retry_interval_ms`（默认 15 分钟）提醒一次，避免通知轰炸。

与错误通知的边界：retry 通知仅在"重试进行中"发送；重试恢复（状态变回 busy/idle）后，会话的 `session.idle` 仍按 `categories.completion` 正常发送完成通知，且不会因曾发生重试而跳过（retry 不写入错误会话标记）。

子代理会话的重试默认不通知（`notify_subagent: false`），可配置开启；开启后按子代理自身 sessionID 独立节流。`retry_detail: false` 时通知不包含尝试次数与下次重试时间。

配置项为 `categories.retry`。模板变量如下：

| 变量            | 说明                                       | 示例              |
| --------------- | ------------------------------------------ | ----------------- |
| `{projectName}` | 项目名                                     | `my-project`      |
| `{sessionTitle}`| 会话标题（未缓存时回退会话 ID）              | `Fix login bug`   |
| `{message}`     | 重试原因                                   | `Provider is overloaded` |
| `{attempt}`     | 当前尝试次数（缺失或 `retry_detail=false` 时为空） | `3`         |
| `{next}`        | 下次重试时间（北京时间 `MM-DD HH:mm`，缺失或 `retry_detail=false` 时为空） | `06-15 23:06` |

> **与模型 fallback 机制的关系**：社区 fallback 方案（如 omo/oms）在 429 时自动切换备选模型，减少重试发生频率；本功能是通知层兜底——无论是否配置 fallback，重试进行中用户都能及时知晓。二者互补：fallback 负责"让工作继续"，通知负责"让用户知情"。本插件不实现 fallback，模型切换属 opencode 侧配置。

**注意**：`opencode-lark-bridge.config.jsonc` 已被 `.gitignore` 排除，不会提交到版本控制。

## 编译与项目级安装（开发者）

```bash
npm run build
npm run install:local
```

这会：

1. 编译 TypeScript 源码到 `dist/`
2. 复制编译产物到 `.opencode/plugins/opencode-lark-bridge/`
3. 首次运行时，在项目根目录 `.opencode/` 下创建示例配置（已存在则保留）

### 插件注册机制

OpenCode V1 需要在配置文件中显式注册插件路径。安装脚本（`npm run install:local` 或 `npm run install:global`）会自动将插件注册到 `.opencode/opencode.jsonc`：

```jsonc
{
  "plugin": ["./plugins/opencode-lark-bridge"]
}
```

#### 插件导出格式要求

OpenCode 要求插件模块必须有**默认导出**（`export default`）。本插件同时提供：
- **默认导出**：`export default OpenCodeLarkBridge`（OpenCode 要求）
- **命名导出**：`export const OpenCodeLarkBridge`（向后兼容）

#### 手动配置（如需要）

安装脚本通常会自动完成配置。如果需要手动配置，**注意路径应相对于 `.opencode/` 目录**：

```jsonc
{
  "plugin": ["./plugins/opencode-lark-bridge"]
}
```

**重要**：当配置文件位于 `.opencode/opencode.jsonc` 时：
- ❌ 错误：`.opencode/plugins/opencode-lark-bridge`（会被错误解析为 `.opencode/.opencode/plugins/opencode-lark-bridge`）
- ✅ 正确：`./plugins/opencode-lark-bridge`（相对于 `.opencode/` 目录）

参考：[OpenCode Plugin Documentation](https://opencode.ai/v2/docs/build/plugins)、[Path Resolution Issue #28384](https://github.com/anomalyco/opencode/issues/28384)

#### 可选依赖：jq

脚本使用 `jq` 进行 JSON 解析（更精确的插件注册检测）。若系统未安装 `jq`，自动回退到 `grep` 模式（仍可正常工作，但精确度稍低）。建议安装 `jq` 以获得最佳体验：

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install jq

# 通过 mise（推荐）
mise use jq@latest
```

也可以使用 `opencode plugin <module>` 命令自动配置。

## 测试

### 单元测试与集成测试

```bash
bun test
```

### 开发者端到端验证

1. 确保 `lark-cli` 已安装并登录：`lark-cli auth status`
2. 运行 `npm run install:local`（或 `npm install opencode-lark-bridge`）
3. 编辑 `.opencode/opencode-lark-bridge.config.jsonc`，填入真实凭证
4. 在项目根目录启动 OpenCode
5. 触发一个需要权限的操作（例如让 AI 执行 `rm /tmp/test.txt`）
6. 检查飞书目标是否收到通知
7. 检查 `.opencode/logs/opencode-lark-bridge.log` 是否记录了发送行为

## 架构

```
OpenCode permission.asked 事件
    → EventHandler（毫秒级去重 + 路由）
    → PermissionMapper（提取工具名/操作/资源）
    → 模板渲染
    → LarkNotifier（构建 lark-cli 命令）
    → lark-cli im +messages-send

OpenCode session.created / session.idle 事件
    → EventHandler（子代理过滤 + 去重 + 路由）
    → CompletionMapper（提取项目名/会话标题）
    → 模板渲染
    → LarkNotifier（构建 lark-cli 命令）
    → lark-cli im +messages-send
```

事件监听层与 Lark 消息发送层通过 `Notifier` 接口解耦，便于后续扩展 `question` 等事件类型。

## 配置文件示例

参见 `opencode-lark-bridge.config.example.jsonc`。

## 发布

本项目支持手动与自动化两种发布方案。详细流程参见 [docs/PUBLISH.md](./docs/PUBLISH.md)。

- **手动发布**：按 `docs/PUBLISH.md` 手动发布方案章节执行
- **自动化发布**：在 OpenCode agent 会话中输入"按流程文档自动发布到 npm"，agent 按 SOP 自动执行

发布前预演验证：

```bash
npm run publish:dry  # 验证 + 预览包内容，不发布
```

## 本地测试安装

发布前验证完整安装流程：

```bash
npm run test:install
```

该脚本会自动执行以下验证：
1. 编译和测试
2. 打包生成 tarball
3. 项目级安装验证
4. 全局安装验证
5. CLI install 命令验证
