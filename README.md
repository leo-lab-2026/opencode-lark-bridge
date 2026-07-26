# opencode-lark-bridge

OpenCode 插件：将权限申请通知与任务完成通知推送到 Lark（飞书）。

## 功能

- 监听 OpenCode `permission.asked` 事件
- 监听 OpenCode `session.idle` 事件，在主会话完成时发送通知
- 通过 `session.created` 的 `parentID` 自动识别并过滤子代理/子任务完成事件
- 通过 `lark-cli` 以 bot 身份向指定飞书用户或群聊发送通知
- 通知内容包含工具名、操作类型和受影响资源（如文件路径）
- 支持按事件类别配置通知目标与模板
- 毫秒级去重窗口，防止通知轰炸
- 所有日志写入文件，不干扰终端

## 安装

### 项目级安装（推荐）

配置文件初始化到当前项目根目录的 `.opencode/` 下：

```bash
npm install opencode-lark-bridge
# 或
bun add opencode-lark-bridge
```

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

## 配置

运行时按以下顺序查找 `opencode-lark-bridge.config.jsonc`，命中即返回：

1. `<ctx.directory>/.opencode/opencode-lark-bridge.config.jsonc`（项目级配置）
2. `~/.config/opencode/opencode-lark-bridge.config.jsonc`（全局配置，仅在 `ctx.directory` 不是 `~/.config/opencode` 时查找）

安装脚本会在对应配置目录首次创建示例配置；已存在则保留不覆盖。插件目录内不再存放配置文件。

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

配置项为 `categories.question`（见下方模板变量节）。模板变量如下：

| 变量               | 说明          | 示例                                         |
| ---------------- | ----------- | ------------------------------------------ |
| `{header}`       | 问题标题（截断至 200 字符） | `Which language?`                           |
| `{question}`     | 问题文本（截断至 200 字符） | `Select a language for the project`          |
| `{options}`      | 选项列表（最多 5 项，多余截断） | `- TypeScript\n- Rust\n- Python`          |
| `{projectName}` | 项目名         | `My Project`                               |

各字段缺失时降级为字符串 `unknown`。

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

### 插件入口配置

`package.json` 中的 `"main": "./index.js"` 对 OpenCode 正确加载插件入口至关重要。安装后需要在 `.opencode/opencode.jsonc`（或 `.opencode/opencode.json`）的 `plugin` 数组中注册插件路径：

```json
{
  "plugin": [
    ".opencode/plugins/opencode-lark-bridge"
  ]
}
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
