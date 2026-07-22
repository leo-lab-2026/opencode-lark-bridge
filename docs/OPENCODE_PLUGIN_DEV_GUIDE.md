# OpenCode 插件开发完整指南

> 基于官方文档 (https://opencode.ai/docs/zh-cn/plugins/) 和源码 (https://github.com/anomalyco/opencode) 整理
> 版本: @opencode-ai/plugin v1.17.7

---

## 目录

1. [概述](#概述)
2. [快速开始](#快速开始)
3. [插件基础](#插件基础)
4. [API 参考](#api-参考)
5. [钩子系统](#钩子系统)
6. [自定义工具](#自定义工具)
7. [TypeScript 支持](#typescript-支持)
8. [实战示例](#实战示例)
9. [最佳实践](#最佳实践)
10. [常见问题](#常见问题)

---

## 概述

OpenCode 插件系统允许你通过挂钩各种事件和自定义行为来扩展 OpenCode。你可以创建插件来：

- 添加新功能
- 集成外部服务
- 修改 OpenCode 的默认行为
- 添加自定义工具供 AI 使用
- 拦截和处理各种生命周期事件

### 插件类型

1. **本地插件** - 放置在插件目录中的 JavaScript/TypeScript 文件
2. **npm 插件** - 通过 npm 安装的插件包

---

## 快速开始

### 创建你的第一个插件

```typescript
// .opencode/plugins/my-first-plugin.ts
export const MyFirstPlugin = async ({ project, client, $, directory, worktree }) => {
  console.log("插件已初始化!")
  console.log(`当前项目: ${project.name}`)
  console.log(`工作目录: ${directory}`)

  return {
    // 钩子实现放在这里
    "session.created": async ({ session }) => {
      console.log(`新会话创建: ${session.id}`)
    }
  }
}
```

### 加载插件

**方式一：本地文件**
将插件文件放置在：

- `.opencode/plugins/` - 项目级插件
- `~/.config/opencode/plugins/` - 全局插件

**方式二：npm 包**
在 `opencode.json` 中配置：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-helicone-session",
    "opencode-wakatime",
    "@my-org/custom-plugin"
  ]
}
```

---

## 插件基础

### 插件函数签名

```typescript
export const MyPlugin = async (ctx: PluginInput, options?: PluginOptions): Promise<Hooks> => {
  // 初始化逻辑

  return {
    // 钩子实现
  }
}
```

### 上下文对象 (PluginInput)

| 属性                       | 类型                                        | 描述               |
| ------------------------ | ----------------------------------------- | ---------------- |
| `client`                 | `ReturnType<typeof createOpencodeClient>` | OpenCode SDK 客户端 |
| `project`                | `Project`                                 | 当前项目信息           |
| `directory`              | `string`                                  | 当前工作目录           |
| `worktree`               | `string`                                  | git 工作树路径        |
| `$`                      | `BunShell`                                | Bun 的 Shell API  |
| `serverUrl`              | `URL`                                     | 服务器 URL          |
| `experimental_workspace` | `object`                                  | 工作区适配器注册接口       |

### Bun Shell API

使用 `$` 执行命令：

```typescript
// 执行命令
await $`echo "Hello World"`

// 获取输出
const result = await $`git status`.text()

// 管道
await $`cat file.txt | grep "pattern"`
```

---

## API 参考

### SDK 客户端方法

通过 `client` 访问 OpenCode SDK：

#### Global

```typescript
// 检查服务器健康状态
const health = await client.global.health()
```

#### App

```typescript
// 写入日志
await client.app.log({
  body: {
    service: "my-plugin",
    level: "info", // debug | info | warn | error
    message: "操作完成",
    extra: { foo: "bar" }
  }
})

// 列出可用代理
const agents = await client.app.agents()
```

#### Project

```typescript
// 列出所有项目
const projects = await client.project.list()

// 获取当前项目
const currentProject = await client.project.current()
```

#### Session

```typescript
// 创建会话
const session = await client.session.create({
  body: { title: "我的会话" }
})

// 发送提示词
const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    parts: [{ type: "text", text: "你好!" }]
  }
})

// 注入上下文（不触发 AI 响应）
await client.session.prompt({
  path: { id: session.id },
  body: {
    noReply: true,
    parts: [{ type: "text", text: "你是一个有帮助的助手。" }]
  }
})
```

#### Files

```typescript
// 搜索文件内容
const textResults = await client.find.text({
  query: { pattern: "function.*opencode" }
})

// 查找文件
const files = await client.find.files({
  query: { query: "*.ts", type: "file" }
})

// 读取文件
const content = await client.file.read({
  query: { path: "src/index.ts" }
})
```

#### TUI

```typescript
// 追加提示词
await client.tui.appendPrompt({
  body: { text: "添加到提示词" }
})

// 显示 Toast 通知
await client.tui.showToast({
  body: { 
    message: "任务完成", 
    variant: "success" // success | error | warning | info
  }
})
```

---

## 钩子系统

### 重要概念：钩子 vs 事件

OpenCode 插件系统中有**两种不同概念**，容易混淆：

| 概念             | 类型   | 定义位置            | 触发时机              | 能否拦截/修改       | 典型命名           |
| -------------- | ---- | --------------- | ----------------- | ------------- | -------------- |
| **钩子 (Hook)**  | 函数   | 返回的 Hooks 对象中   | 操作**执行前**或**执行时** | ✅ **可以**拦截或修改 | `名词.动词` 或 `动词` |
| **事件 (Event)** | 数据对象 | 通过 `event` 钩子接收 | 操作**完成后**         | ❌ **只读**，仅通知  | `名词.动词的过去式`    |

**记忆技巧：**

- **钩子**是"拦截器"，可以改变事情的发生
- **事件**是"广播"，告诉你事情已经发生

### 钩子类型概览

#### 拦截型钩子（可修改行为）

这些钩子在操作执行**前/中**触发，可以拦截或修改：

- `tool.execute.before` - 工具执行前
- `tool.execute.after` - 工具执行后
- `permission.ask` - 权限请求时（可自动拒绝/允许）
- `shell.env` - 注入环境变量
- `chat.message` - 消息发送前
- `chat.params` - 修改 LLM 参数
- `chat.headers` - 修改请求头
- `tool.definition` - 修改工具定义
- `experimental.chat.messages.transform` - 转换消息列表
- `experimental.chat.system.transform` - 转换系统提示词

#### 监听型钩子（只读通知）

这些钩子只能接收信息，**不能修改**：

- `command.executed` - 命令已执行
- `file.edited` - 文件已编辑
- `file.watcher.updated` - 文件监视器更新
- `installation.updated` - 安装已更新
- `lsp.client.diagnostics` - LSP 诊断信息
- `lsp.updated` - LSP 已更新
- `message.part.removed` - 消息部分已删除
- `message.part.updated` - 消息部分已更新
- `message.removed` - 消息已删除
- `message.updated` - 消息已更新
- `permission.replied` - 权限已响应
- `server.connected` - 服务器已连接
- `session.created` - 会话已创建
- `session.compacted` - 会话已压缩
- `session.deleted` - 会话已删除
- `session.diff` - 会话差异
- `session.error` - 会话错误
- `session.idle` - 会话空闲
- `session.status` - 会话状态变化
- `session.updated` - 会话已更新
- `todo.updated` - 待办已更新
- `tui.prompt.append` - TUI 提示词追加
- `tui.command.execute` - TUI 命令执行
- `tui.toast.show` - TUI Toast 显示

#### 通用事件钩子

- `event` - **接收所有事件的统一入口**，通过 `event.type` 判断具体事件类型

### 常见混淆点澄清

#### ❌ 错误理解

```typescript
// 错误的：以为 permission.asked 是钩子
"permission.asked": async (event) => {  // ❌ 这样写无效！
  // 这不会工作，因为 permission.asked 是事件，不是钩子名
}
```

#### ✅ 正确用法

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    // === 钩子：拦截权限请求 ===
    "permission.ask": async (input, output) => {
      // 可以修改 output.status 来允许/拒绝
      if (input.tool === "bash" && input.args.command.includes("rm -rf")) {
        output.status = "deny"  // 自动拒绝危险命令
      }
    },

    // === 钩子：接收所有事件 ===
    event: async ({ event }) => {
      // 通过 event.type 判断具体事件
      switch (event.type) {
        // 事件：权限已请求（只读，不能修改）
        case "permission.asked":
          await notify("需要权限确认")
          break

        // 事件：权限已响应（只读）
        case "permission.replied":
          console.log(`用户${event.properties.status}了权限`)
          break
      }
    }
  }
}
```

### 钩子详细说明

#### `tool.execute.before`【拦截型】

在工具执行**前**触发，可修改参数或阻止执行。

```typescript
"tool.execute.before": async (input, output) => {
  // input: { tool: string, sessionID: string, callID: string }
  // output: { args: any } - 修改此对象来改变参数

  if (input.tool === "read" && output.args.filePath.includes(".env")) {
    throw new Error("禁止读取 .env 文件")
  }
}
```

#### `tool.execute.after`【拦截型】

在工具执行**后**触发，可修改结果。

```typescript
"tool.execute.after": async (input, output) => {
  // input: { tool: string, sessionID: string, callID: string, args: any }
  // output: { title: string, output: string, metadata: any }

  if (input.tool === "bash") {
    output.title = "🚀 " + output.title
  }
}
```

#### `permission.ask`【拦截型】⚠️ 重要

**这是钩子！** 在权限请求**时**触发，可自动响应。

```typescript
"permission.ask": async (input, output) => {
  // input: Permission 对象
  // output: { status: "ask" | "deny" | "allow" } - 可修改！

  // 自动拒绝危险命令
  if (input.tool === "bash" && input.args.command.includes("rm -rf /")) {
    output.status = "deny"
  }

  // 自动允许安全命令
  if (input.tool === "read" && input.args.filePath.endsWith(".md")) {
    output.status = "allow"
  }
}
```

#### `event`【监听型】

**统一的事件接收器**，通过 `event.type` 判断事件类型。

```typescript
event: async ({ event }) => {
  // event.type 是字符串，表示事件类型
  console.log(event.type)  // "session.idle", "permission.asked", 等

  // event.properties 包含事件详情
  console.log(event.properties.sessionID)
}
```

**常见事件类型：**

| 事件类型                 | 说明      | 触发时机       |
| -------------------- | ------- | ---------- |
| `permission.asked`   | 权限已请求   | 用户看到权限弹窗时  |
| `permission.replied` | 权限已响应   | 用户选择允许/拒绝后 |
| `permission.updated` | 权限状态已更新 | 权限状态变化时    |
| `session.idle`       | 会话已空闲   | AI 响应完成时   |
| `session.error`      | 会话错误    | 发生错误时      |
| `session.created`    | 会话已创建   | 新会话建立时     |
| `file.edited`        | 文件已编辑   | 文件被修改后     |

#### `session.idle`【监听型】

会话空闲时触发（AI 响应完成）。

```typescript
"session.idle": async ({ session }) => {
  // 注意：这是事件，session 是只读的
  console.log(`会话 ${session.id} 已完成`)

  // 发送通知
  await $`osascript -e 'display notification "会话完成!" with title "OpenCode"'`
}
```

#### `session.created`【监听型】

新会话创建时触发。

```typescript
"session.created": async ({ session }) => {
  console.log(`新会话: ${session.id}`)
  // 可以读取 session 信息，但不能修改
}
```

#### `shell.env`【拦截型】

向所有 Shell 执行注入环境变量。

```typescript
"shell.env": async (input, output) => {
  // input: { cwd: string, sessionID?: string, callID?: string }
  // output: { env: Record<string, string> } - 可修改！

  output.env.MY_API_KEY = process.env.MY_API_KEY
  output.env.PROJECT_ROOT = input.cwd
}
```

#### `experimental.session.compacting`【拦截型】

自定义会话压缩提示词。

```typescript
"experimental.session.compacting": async (input, output) => {
  // input: { sessionID: string }
  // output: { context: string[], prompt?: string } - 可修改！

  // 添加额外上下文
  output.context.push(`## 当前任务状态
- 正在实现: 用户认证系统
- 已完成: 数据库模型
- 阻塞: 等待 API 密钥`)

  // 或完全替换提示词
  // output.prompt = "自定义压缩提示词..."
}
```

---

## 自定义工具

### 基础工具定义

```typescript
import { tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "这是一个自定义工具",
        args: {
          foo: tool.schema.string(),
          bar: tool.schema.number().optional(),
        },
        async execute(args, context) {
          const { directory, worktree, sessionID, messageID, agent } = context

          return `Hello ${args.foo} from ${directory}`
        },
      }),
    },
  }
}
```

### 工具上下文

`execute` 函数的 `context` 参数包含：

| 属性          | 类型            | 描述         |
| ----------- | ------------- | ---------- |
| `sessionID` | `string`      | 会话 ID      |
| `messageID` | `string`      | 消息 ID      |
| `agent`     | `string`      | 当前代理名称     |
| `directory` | `string`      | 当前项目目录     |
| `worktree`  | `string`      | git 工作树根目录 |
| `abort`     | `AbortSignal` | 中止信号       |
| `metadata`  | `function`    | 添加元数据      |
| `ask`       | `function`    | 请求权限       |

### Schema 类型

使用 Zod 定义参数：

```typescript
args: {
  // 字符串
  name: tool.schema.string(),

  // 可选字符串
  description: tool.schema.string().optional(),

  // 数字
  count: tool.schema.number(),

  // 布尔值
  enabled: tool.schema.boolean(),

  // 数组
  tags: tool.schema.array(tool.schema.string()),

  // 枚举
  priority: tool.schema.enum(["low", "medium", "high"]),

  // 对象
  config: tool.schema.object({
    timeout: tool.schema.number(),
    retries: tool.schema.number()
  }),

  // 联合类型
  value: tool.schema.union([
    tool.schema.string(),
    tool.schema.number()
  ])
}
```

### 工具返回值

工具可以返回：

```typescript
// 简单字符串
return "操作成功"

// 结构化结果
return {
  title: "操作完成",
  output: "详细输出内容",
  metadata: { 
    duration: 1000,
    itemsProcessed: 42 
  }
}

// 带附件
return {
  title: "文件已生成",
  output: "PDF 报告已创建",
  attachments: [{
    type: "file",
    mime: "application/pdf",
    url: "file:///path/to/report.pdf",
    filename: "report.pdf"
  }]
}
```

---

## TypeScript 支持

### 安装类型包

```bash
npm install @opencode-ai/plugin
```

### 完整类型示例

```typescript
import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

// 定义插件选项
interface MyPluginOptions {
  apiKey?: string
  endpoint?: string
}

export const MyTypedPlugin: Plugin = async (
  ctx: PluginInput, 
  options?: MyPluginOptions
): Promise<Hooks> => {
  const { client, project, directory, $ } = ctx

  // 初始化
  await client.app.log({
    body: {
      service: "my-plugin",
      level: "info",
      message: "插件初始化"
    }
  })

  return {
    "session.created": async ({ session }) => {
      console.log(`会话 ${session.id} 已创建`)
    },

    "tool.execute.before": async (input, output) => {
      // 类型安全的钩子实现
      console.log(`工具 ${input.tool} 即将执行`)
    },

    tool: {
      customTool: tool({
        description: "示例工具",
        args: {
          query: tool.schema.string()
        },
        async execute(args, context) {
          // args.query 是类型安全的
          return `搜索: ${args.query}`
        }
      })
    }
  }
}
```

### 类型导出

从 `@opencode-ai/plugin` 导出：

```typescript
export type {
  Plugin,
  PluginInput,
  PluginOptions,
  Hooks,
  Config,
  PluginModule,
  WorkspaceInfo,
  WorkspaceAdapter,
  WorkspaceTarget,
  AuthHook,
  AuthOAuthResult,
  ProviderHook,
  ProviderHookContext,
  ProviderContext,
} from "@opencode-ai/plugin"

export type {
  ToolContext,
  ToolDefinition,
  ToolResult,
  ToolAttachment,
} from "@opencode-ai/plugin/tool"
```

---

## 实战示例

> ⚠️ **注意**：以下示例已标注【事件监听】或【拦截型钩子】，帮助区分两者的使用场景

### 示例 1：会话完成通知【事件监听】

当 OpenCode 会话完成时发送通知。`session.idle` 是**事件**，只能读取信息：

```typescript
// .opencode/plugins/notification.ts
export const NotificationPlugin = async ({ $ }) => {
  return {
    // session.idle 是事件钩子，只读
    "session.idle": async ({ session }) => {
      // ✅ 正确：读取会话信息
      console.log(`会话 ${session.id} 已完成`)

      // ✅ 正确：发送通知（这是副作用，不是修改事件）
      await $`osascript -e 'display notification "会话完成!" with title "OpenCode"'`

      // ❌ 错误：不能修改事件
      // session.status = "completed"  // 这是无效的！
    }
  }
}
```

**类型说明**：`session.idle` 是事件，触发于 AI 响应完成后，只读。

### 示例 2：.env 文件保护【拦截型钩子】

使用 `tool.execute.before` **拦截型钩子**阻止读取敏感文件。这是一个可以**修改行为**的钩子：

```typescript
// .opencode/plugins/env-protection.ts
export const EnvProtection = async () => {
  return {
    // tool.execute.before 是拦截型钩子
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read") {
        const filePath = output.args.filePath

        // ✅ 正确：可以修改 output.args 来改变行为
        if (filePath.includes(".env") && !filePath.includes(".env.example")) {
          // 方式1：抛出错误阻止执行
          throw new Error("安全策略: 禁止读取 .env 文件")

          // 方式2：修改参数（重定向到 .env.example）
          // output.args.filePath = filePath.replace(".env", ".env.example")
        }

        // ✅ 正确：可以添加元数据
        output.metadata = { ...output.metadata, securityChecked: true }
      }
    }
  }
}
```

**类型说明**：`tool.execute.before` 是拦截型钩子，在工具执行前触发，可以修改 `output` 对象或抛出错误阻止执行。

### 示例 3：自动权限处理【拦截型钩子 + 事件】

结合使用 `permission.ask` **拦截型钩子**（可修改）和 `event` **事件监听**（只读）：

```typescript
// .opencode/plugins/permission-handler.ts
export const PermissionHandlerPlugin = async ({ client }) => {
  return {
    // === 拦截型钩子：可以自动处理权限 ===
    "permission.ask": async (input, output) => {
      // 这是一个钩子！可以修改 output.status
      console.log(`收到权限请求: ${input.tool}`)

      // 自动拒绝危险命令
      if (input.tool === "bash") {
        const cmd = input.args.command
        if (cmd.includes("rm -rf") || cmd.includes("sudo")) {
          output.status = "deny"  // ✅ 自动拒绝，不询问用户
          console.log("🛡️ 自动拒绝危险命令")
          return
        }
      }

      // 自动允许安全的读取
      if (input.tool === "read") {
        const path = input.args.filePath
        if (path?.startsWith("src/") || path?.endsWith(".md")) {
          output.status = "allow"  // ✅ 自动允许
          console.log("✅ 自动允许安全读取")
          return
        }
      }

      // 其他情况：询问用户
      output.status = "ask"  // ✅ 询问用户
    },

    // === 事件监听：只能通知，不能修改 ===
    event: async ({ event }) => {
      switch (event.type) {
        // event 是只读的，只能读取 event.properties
        case "permission.asked":
          // ❌ 错误：不能修改 event
          // event.properties.status = "allow"

          // ✅ 正确：只能读取和通知
          await client.tui.showToast({
            body: { message: "🔔 等待权限确认...", variant: "info" }
          })
          break

        case "permission.replied":
          const status = event.properties.status
          await client.tui.showToast({
            body: { 
              message: `权限已${status === "allow" ? "✅ 允许" : "❌ 拒绝"}`, 
              variant: status === "allow" ? "success" : "warning" 
            }
          })
          break
      }
    }
  }
}
```

**关键区别：**

- `permission.ask` (钩子) - 在请求**时**触发，可修改 `output.status`
- `permission.asked` (事件) - 在请求**已发送**后触发，只读
- `permission.replied` (事件) - 在用户**响应后**触发，只读

**命名规律：**

- 钩子名：`名词.动词`（现在时）如 `permission.ask`
- 事件名：`名词.动词的过去式` 如 `permission.asked`, `permission.replied`

### 示例 4：自动注入环境变量【拦截型钩子】

使用 `shell.env` **拦截型钩子**向所有 Shell 命令注入环境变量：

```typescript
// .opencode/plugins/inject-env.ts
export const InjectEnvPlugin = async () => {
  return {
    // shell.env 是拦截型钩子
    "shell.env": async (input, output) => {
      // ✅ 正确：可以修改 output.env 来注入变量
      output.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
      output.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY
      output.env.PROJECT_ROOT = input.cwd
      output.env.NODE_ENV = "development"

      // 甚至可以根据当前目录动态设置
      if (input.cwd.includes("frontend")) {
        output.env.API_BASE_URL = "http://localhost:3000"
      } else if (input.cwd.includes("backend")) {
        output.env.API_BASE_URL = "http://localhost:8080"
      }
    }
  }
}
```

**类型说明**：`shell.env` 是拦截型钩子，在所有 Shell 执行前触发，通过修改 `output.env` 来注入环境变量。

### 示例 5：Git 信息工具【自定义工具】

创建自定义工具供 OpenCode 调用：

```typescript
// .opencode/plugins/git-tools.ts
import { tool } from "@opencode-ai/plugin"

export const GitToolsPlugin = async ({ $ }) => {
  return {
    // tool 对象定义自定义工具
    tool: {
      git_summary: tool({
        description: "获取当前分支的 Git 提交摘要",
        args: {
          count: tool.schema.number().default(5).describe("显示的提交数量")
        },
        async execute(args, context) {
          const { worktree } = context

          try {
            const log = await $`git -C ${worktree} log --oneline -${args.count}`.text()
            const branch = await $`git -C ${worktree} branch --show-current`.text()
            const status = await $`git -C ${worktree} status --short`.text()

            return {
              title: "📊 Git 状态",
              output: `当前分支: ${branch}\n\n最近提交:\n${log}\n\n未提交更改:\n${status || "无"}`,
              metadata: { branch: branch.trim(), commits: args.count }
            }
          } catch (error) {
            return {
              title: "❌ Git 错误",
              output: `获取 Git 信息失败: ${error.message}`
            }
          }
        }
      })
    }
  }
}
```

### 示例 6：代码审查助手【事件监听 + 自定义工具】

结合使用 `file.edited` **事件**和自定义工具：

```typescript
// .opencode/plugins/code-review.ts
import { tool } from "@opencode-ai/plugin"

export const CodeReviewPlugin = async ({ client }) => {
  return {
    // file.edited 是事件，只读
    "file.edited": async ({ file, sessionID }) => {
      // ✅ 正确：读取文件信息
      if (file.path.endsWith('.ts') || file.path.endsWith('.js')) {
        // ✅ 正确：触发副作用（发送通知）
        await client.tui.showToast({
          body: { 
            message: `已编辑: ${file.path}`, 
            variant: "info" 
          }
        })
      }
    },

    // 自定义工具
    tool: {
      review_changes: tool({
        description: "审查当前工作区的代码更改",
        args: {},
        async execute(args, context) {
          const { $, worktree } = context

          const diff = await $`git -C ${worktree} diff`.text()

          if (!diff) {
            return "没有待审查的更改"
          }

          return {
            title: "🔍 代码审查",
            output: diff,
            metadata: { linesChanged: diff.split('\n').length }
          }
        }
      })
    }
  }
}
```

### 示例 7：会话压缩自定义【拦截型钩子】

使用 `experimental.session.compacting` **拦截型钩子**自定义会话压缩行为：

```typescript
// .opencode/plugins/compaction.ts
import type { Plugin } from "@opencode-ai/plugin"

export const CompactionPlugin: Plugin = async (ctx) => {
  return {
    // experimental.session.compacting 是拦截型钩子
    "experimental.session.compacting": async (input, output) => {
      // ✅ 正确：可以修改 output.context 来添加上下文
      output.context.push(`## 项目特定上下文
- 当前架构: 微服务
- 主要语言: TypeScript
- 数据库: PostgreSQL
- 重要文件: src/config, src/services, src/models`)

      // ✅ 正确：甚至可以完全替换压缩提示词
      // output.prompt = `自定义压缩提示词...`
    }
  }
}
```

### 示例 8：完全自定义压缩提示词【拦截型钩子】

```typescript
// .opencode/plugins/custom-compaction.ts
import type { Plugin } from "@opencode-ai/plugin"

export const CustomCompactionPlugin: Plugin = async (ctx) => {
  return {
    // 完全替换默认压缩提示词
    "experimental.session.compacting": async (input, output) => {
      // ✅ 正确：修改 output.prompt 完全替换默认提示词
      output.prompt = `你是一个为 AI 编码助手生成延续提示的专家。

请总结当前会话状态:
1. 当前任务和目标
2. 已修改的文件和更改摘要
3. 遇到的任何问题或错误
4. 下一步计划

格式要求:
- 使用结构化格式
- 包含关键文件路径
- 保持技术细节的准确性
- 突出显示任何阻塞问题`
    }
  }
}
```

### 示例 9：带权限请求的工具【自定义工具】

在自定义工具中使用 `ask` 函数请求权限：

```typescript
// .opencode/plugins/secure-tool.ts
import { tool } from "@opencode-ai/plugin"

export const SecureToolPlugin = async () => {
  return {
    // 自定义工具
    tool: {
      delete_files: tool({
        description: "删除指定模式的文件（需要确认）",
        args: {
          pattern: tool.schema.string().describe("文件匹配模式，如 '*.log'"),
          dryRun: tool.schema.boolean().default(true).describe("仅预览，不实际删除")
        },
        async execute(args, context) {
          const { $, ask, directory } = context

          // 查找匹配的文件
          const files = await $`find ${directory} -name "${args.pattern}" -type f`.text()
          const fileList = files.split('\n').filter(f => f)

          if (fileList.length === 0) {
            return "未找到匹配的文件"
          }

          if (args.dryRun) {
            return {
              title: "🔍 预览模式",
              output: `将删除以下 ${fileList.length} 个文件:\n${fileList.join('\n')}`,
              metadata: { files: fileList.length, dryRun: true }
            }
          }

          // ✅ 正确：使用 ask 函数请求权限
          // 这会触发 permission.ask 钩子（如果存在）
          // 然后显示权限对话框给用户
          await ask({
            permission: "delete_files",
            patterns: fileList,
            always: [],
            metadata: { count: fileList.length }
          })

          // 执行删除
          for (const file of fileList) {
            await $`rm "${file}"`
          }

          return {
            title: "🗑️ 文件已删除",
            output: `成功删除 ${fileList.length} 个文件`,
            metadata: { deleted: fileList.length }
          }
        }
      })
    }
  }
}
```

**执行流程：**

1. 工具调用 `ask()` 请求权限
2. 触发 `permission.ask` **钩子**（如果有插件拦截）
3. 如果钩子返回 `ask`，显示权限对话框给用户
4. 用户选择后触发 `permission.replied` **事件**
5. 工具继续执行或取消

---

## 最佳实践

### 1. 错误处理

始终妥善处理错误：

```typescript
async execute(args, context) {
  try {
    const result = await someOperation()
    return result
  } catch (error) {
    return {
      title: "❌ 错误",
      output: `操作失败: ${error.message}`,
      metadata: { error: true }
    }
  }
}
```

### 2. 日志记录

使用结构化日志而非 console.log：

```typescript
// ✅ 推荐
await client.app.log({
  body: {
    service: "my-plugin",
    level: "info",
    message: "操作完成",
    extra: { duration: 1000 }
  }
})

// ❌ 避免
console.log("操作完成")
```

### 3. 类型安全

为复杂插件使用 TypeScript：

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  // 完整的类型支持
}
```

### 4. 性能考虑

- 避免在钩子中进行长时间同步操作
- 使用 `Promise.all` 并行处理
- 缓存重复使用的数据

```typescript
// ✅ 并行处理
const [result1, result2] = await Promise.all([
  operation1(),
  operation2()
])

// ❌ 串行处理
const result1 = await operation1()
const result2 = await operation2()
```

### 5. 资源清理

使用 `dispose` 钩子清理资源：

```typescript
const connections = []

return {
  async dispose() {
    // 清理所有连接
    for (const conn of connections) {
      await conn.close()
    }
  }
}
```

### 6. 配置管理

为插件提供配置选项：

```typescript
interface PluginConfig {
  enabled: boolean
  timeout: number
}

export const ConfigurablePlugin = async (ctx, options?: PluginConfig) => {
  const config = {
    enabled: true,
    timeout: 5000,
    ...options
  }

  if (!config.enabled) {
    return {} // 返回空钩子
  }

  // 插件逻辑
}
```

在 `opencode.json` 中配置：

```json
{
  "plugin": [
    ["my-plugin", { "enabled": true, "timeout": 10000 }]
  ]
}
```

### 7. 插件加载顺序

了解加载顺序以避免冲突：

1. 全局配置 (`~/.config/opencode/opencode.json`)
2. 项目配置 (`opencode.json`)
3. 全局插件目录 (`~/.config/opencode/plugins/`)
4. 项目插件目录 (`.opencode/plugins/`)

同名 npm 包只会加载一次，但本地插件和 npm 插件分别独立加载。

### 8. 测试插件

创建测试脚本验证插件：

```typescript
// test-plugin.ts
import { MyPlugin } from "./my-plugin"

async function test() {
  const mockCtx = {
    client: {
      app: { log: console.log }
    },
    project: { name: "test", id: "123" },
    directory: "/tmp",
    worktree: "/tmp",
    $: async (strings: TemplateStringsArray, ...values: any[]) => ({
      text: async () => "mock output"
    }),
    serverUrl: new URL("http://localhost:4096"),
    experimental_workspace: { register: () => {} }
  }

  const hooks = await MyPlugin(mockCtx as any)

  // 测试钩子
  if (hooks["session.created"]) {
    await hooks["session.created"]({ session: { id: "test-123" } } as any)
  }
}

test()
```

---

## 常见问题

### Q: 钩子(Hook)和事件(Event)有什么区别？

**A:** 这是两个容易混淆的概念：

| 概念       | 钩子 (Hook)                           | 事件 (Event)                          |
| -------- | ----------------------------------- | ----------------------------------- |
| **命名**   | `名词.动词` (现在时)<br>如 `permission.ask` | `名词.动词的过去式`<br>如 `permission.asked` |
| **触发时机** | 操作**执行前/中**                         | 操作**完成后**                           |
| **能否拦截** | ✅ **可以**拦截或修改                       | ❌ **不能**，只读                         |
| **典型用途** | 自动处理、拦截危险操作                         | 通知、日志、统计                            |

**常见组合：**

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    // === 钩子：可以拦截 ===
    "permission.ask": async (input, output) => {
      // 在权限请求时触发
      // 可以修改 output.status 来控制权限
      if (input.tool === "bash" && input.args.command.includes("rm -rf")) {
        output.status = "deny"  // 自动拒绝
      }
    },

    // === 事件：只能监听 ===
    event: async ({ event }) => {
      switch (event.type) {
        case "permission.asked":
          // 权限已请求（只读）
          console.log("权限已发送给用户")
          break
        case "permission.replied":
          // 用户已响应（只读）
          console.log(`用户${event.properties.status}了权限`)
          break
      }
    }
  }
}
```

**完整对照表：**

| 操作       | 钩子（可拦截）               | 事件（只读）                                                         |
| -------- | --------------------- | -------------------------------------------------------------- |
| 权限请求     | `permission.ask`      | `permission.asked`, `permission.replied`, `permission.updated` |
| 会话完成     | -                     | `session.idle`                                                 |
| 文件编辑     | -                     | `file.edited`                                                  |
| 工具执行     | `tool.execute.before` | -                                                              |
| 工具完成     | `tool.execute.after`  | -                                                              |
| Shell 执行 | `shell.env`           | -                                                              |

### Q: 插件可以使用外部 npm 包吗？

**A:** 可以。在配置目录创建 `package.json`：

```json
{
  "dependencies": {
    "axios": "^1.0.0",
    "lodash": "^4.17.0"
  }
}
```

OpenCode 启动时会自动运行 `bun install`。

### Q: TypeScript 插件需要编译吗？

**A:** 不需要。OpenCode 使用 Bun 直接运行 TypeScript，无需预编译。

### Q: 如何调试插件？

**A:** 使用 `console.log` 或结构化日志：

```typescript
await client.app.log({
  body: {
    service: "my-plugin",
    level: "debug",
    message: "调试信息",
    extra: { variable: value }
  }
})
```

### Q: 插件之间可以通信吗？

**A:** 插件是独立的，但可以通过共享状态（如文件、环境变量）或使用 SDK API 间接通信。

### Q: 如何处理异步初始化？

**A:** 插件函数是 async 的，可以在返回前进行异步初始化：

```typescript
export const AsyncPlugin = async ({ client }) => {
  // 异步加载配置
  const config = await loadConfig()

  // 建立连接
  const connection = await createConnection(config)

  return {
    // 钩子...
    async dispose() {
      await connection.close()
    }
  }
}
```

### Q: 插件可以修改 OpenCode 的核心行为吗？

**A:** 有限制地可以。通过 `tool.execute.before` 钩子可以拦截和修改工具调用，但不能修改 OpenCode 的内部状态。

### Q: 如何发布 npm 插件？

**A:** 

1. 创建 npm 包，导出插件函数
2. 确保包名以 `opencode-` 开头便于发现
3. 发布到 npm
4. 用户可以在 `opencode.json` 中引用

```typescript
// npm 包的入口文件
export { MyPlugin } from "./my-plugin"
```

### Q: 插件冲突怎么办？

**A:** 

- 检查插件加载顺序
- 使用工具名称前缀避免冲突
- 通过配置禁用冲突插件

### Q: 如何获取当前会话的上下文？

**A:** 钩子函数的 `input` 参数包含上下文信息：

```typescript
"tool.execute.before": async (input, output) => {
  console.log(input.sessionID)  // 当前会话 ID
  console.log(input.callID)     // 调用 ID
}
```

---

## 参考资源

- **官方文档**: https://opencode.ai/docs/zh-cn/plugins/
- **SDK 文档**: https://opencode.ai/docs/zh-cn/sdk/
- **源码**: https://github.com/anomalyco/opencode
- **插件包**: https://github.com/anomalyco/opencode/tree/dev/packages/plugin
- **社区插件**: https://opencode.ai/docs/ecosystem#plugins
- **Discord 社区**: https://opencode.ai/discord

---

## 更新日志

### 2026-06-17 (v2)

- **重要更新**：明确区分**钩子(Hook)**和**事件(Event)**概念
- 添加钩子和事件的对比表和详细说明
- 修正 `permission.ask`（钩子）和 `permission.asked`（事件）的混淆
- 所有示例添加【事件监听】/【拦截型钩子】标签
- 添加新的 FAQ 专门解释钩子和事件的区别
- 添加完整的钩子和事件对照表

### 2026-06-17 (v1)

- 初始版本整理
- 包含所有官方文档内容
- 添加源码级别的 API 参考
- 补充 9 个实战示例

---

## 附录：钩子与事件速查表

### 拦截型钩子（可修改行为）

| 钩子名                               | 触发时机      | 可修改                                            | 典型用途      |
| --------------------------------- | --------- | ---------------------------------------------- | --------- |
| `tool.execute.before`             | 工具执行前     | `output.args`                                  | 修改参数、阻止执行 |
| `tool.execute.after`              | 工具执行后     | `output.title`, `output.output`                | 修改结果      |
| `permission.ask`                  | 权限请求时     | `output.status`                                | 自动允许/拒绝权限 |
| `shell.env`                       | Shell 执行前 | `output.env`                                   | 注入环境变量    |
| `chat.message`                    | 消息发送前     | `output.message`, `output.parts`               | 修改消息      |
| `chat.params`                     | LLM 调用前   | `output.temperature`, `output.maxOutputTokens` | 修改参数      |
| `chat.headers`                    | HTTP 请求前  | `output.headers`                               | 添加请求头     |
| `tool.definition`                 | 工具定义发送前   | `output.description`, `output.parameters`      | 修改工具定义    |
| `experimental.session.compacting` | 会话压缩前     | `output.context`, `output.prompt`              | 自定义压缩     |

### 监听型钩子/事件（只读）

| 钩子/事件名               | 类型    | 触发时机    | 典型用途     |
| -------------------- | ----- | ------- | -------- |
| `event`              | 通用接收器 | 任何事件发生时 | 统一处理所有事件 |
| `session.idle`       | 事件    | 会话完成时   | 发送完成通知   |
| `session.error`      | 事件    | 会话出错时   | 错误通知     |
| `session.created`    | 事件    | 会话创建时   | 初始化      |
| `file.edited`        | 事件    | 文件被编辑后  | 触发检查     |
| `permission.asked`   | 事件    | 权限已请求   | 通知用户     |
| `permission.replied` | 事件    | 权限已响应   | 记录结果     |
| `permission.updated` | 事件    | 权限状态更新  | 状态同步     |

### 命名规律

```
拦截型钩子：名词.动词（现在时）
├── permission.ask      （询问权限）
├── tool.execute.before （执行前）
└── shell.env           （设置环境）

事件（只读）：名词.动词的过去式
├── permission.asked    （已询问）
├── permission.replied  （已回复）
├── session.idle        （已空闲）
└── file.edited         （已编辑）
```

---

*本文档由 AI 助手基于官方文档和源码整理生成，如有更新请以官方文档为准。*
