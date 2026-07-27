# OpenCode Lark Bridge 配置指南

本文档详细介绍 `opencode-lark-bridge.config.jsonc` 配置文件的使用方法，包括所有可用字段、模板变量和自定义示例。

## 配置文件位置

插件按以下顺序查找配置文件：

1. **项目级配置**：`<project-root>/.opencode/opencode-lark-bridge.config.jsonc`
2. **全局配置**：`~/.config/opencode/opencode-lark-bridge.config.jsonc`

项目级配置优先于全局配置。

## 配置文件结构

```jsonc
{
  // 必填字段
  "app_id": "cli_xxxxxxxxxxxxxxxx",           // 飞书应用 ID
  "app_secret": "xxxxxxxxxxxxxxxx",           // 飞书应用 Secret
  "default_target": {                         // 默认通知目标
    "chat_id": "oc_xxxxxxxxxxxxxxxx"          // 群聊 ID
    // 或 "user_id": "ou_xxxxxxxxxxxxxxxx"    // 用户 ID
  },
  
  // 可选字段
  "debounce_ms": 3000,                        // 去重时间窗口（毫秒）
  "log_file": "./logs/opencode-lark-bridge.log",  // 日志文件路径
  
  // 类别配置（每个类别可独立设置 target 和 template）
  "categories": {
    "permission": { ... },
    "completion": { ... },
    "question": { ... },
    "error": { ... }
  }
}
```

## 必填字段说明

### `app_id` 和 `app_secret`

飞书应用的凭证，从飞书开放平台获取。用于 bot 身份发送消息。

### `default_target`

默认的通知目标，支持两种格式：

- **群聊**：`{ "chat_id": "oc_xxxx" }`
- **用户**：`{ "user_id": "ou_xxxx" }`

获取方式：
- 群聊 ID：在飞书群设置中查看，或使用 `lark-cli chat list`
- 用户 ID：使用 `lark-cli user info`

## 可选字段说明

### `debounce_ms`

去重时间窗口，单位毫秒。默认 3000ms。

用于防止短时间内重复发送相同通知。例如，同一权限请求在 3 秒内只会通知一次。

### `log_file`

日志文件路径。默认 `./logs/opencode-lark-bridge.log`。

日志使用北京时区时间戳，失败时静默降级（不中断主流程）。

## 类别配置详解

每个通知类别可以独立配置 `target` 和 `template`：

```jsonc
"categories": {
  "<category>": {
    "target": { "chat_id": "oc_xxxx" },  // 可选，未设置则使用 default_target
    "template": "自定义模板字符串"          // 可选，未设置则使用内置默认模板
  }
}
```

### permission（权限申请通知）

**触发时机**：OpenCode 需要执行敏感操作时（如 bash 命令、文件编辑等）

**模板变量**：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{tool}` | 工具名 | `bash`, `edit`, `read`, `webfetch` |
| `{operation}` | 操作类型 | `rm`, `write`, `read` |
| `{resource}` | 资源描述 | 文件路径、URL、命令参数等 |

**默认模板**：
```
🔔 OpenCode Permission Request
Tool: {tool}
Operation: {operation}
Target: {resource}
```

**自定义示例**：
```jsonc
"template": "⚠️ 权限申请\n工具: {tool}\n操作: {operation}\n目标: {resource}\n请审批"
```

**resource 变量取值规则**：

| tool | resource 值 |
|------|------------|
| `bash` | 命令参数（如 `-rf /tmp/cache`） |
| `read` / `edit` | 文件路径 |
| `glob` / `grep` | 匹配模式 |
| `webfetch` | URL 或 URI |
| `websearch` | 搜索查询词 |
| `task` | 子代理类型（如 `explore`, `general`） |
| `skill` | 技能名 |
| `external_directory` | 外部路径 |
| `doom_loop` | `<innerTool>: <input>` |

### completion（任务完成通知）

**触发时机**：OpenCode 会话进入 idle 状态（任务完成）时

**模板变量**：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{projectName}` | 项目名 | `my-project` |
| `{sessionTitle}` | 会话标题 | `Refactor authentication module` |

**默认模板**：
```
✅ Task Completed
Project: {projectName}
Session: {sessionTitle}
```

**自定义示例**：
```jsonc
"template": "🎉 任务完成\n项目: {projectName}\n标题: {sessionTitle}"
```

### question（问题通知）

**触发时机**：OpenCode 需要用户选择或输入时

**模板变量**：

| 变量 | 说明 | 单问题模式 | 多问题模式 |
|------|------|-----------|-----------|
| `{projectName}` | 项目名 | `my-project` | `my-project` |
| `{header}` | 问题标题 | 问题 header | `Multiple Questions (N)` |
| `{question}` | 问题文本 | 问题内容 | 编号列表，每个问题带选项内联 |
| `{options}` | 选项列表 | 所有选项 | **空字符串**（已在 {question} 中内联） |

**默认模板**：
```
❓ OpenCode Question
Project: {projectName}
Header: {header}
{question}
Options: {options}
```

**自定义示例**：
```jsonc
// 单问题模板
"template": "❓ {header}\n{question}\n选项:\n{options}"

// 支持换行格式（无选项时自动移除 Options 行）
"template": "❓ {header}\n{question}:\nOptions:\n {options}"
```

**特殊行为**：

当无选项时，模板中的 Options 行会被自动移除，支持以下格式：
- `Options: {options}`（同行）
- `Options:\n {options}`（换行+空格缩进）
- `Options:\n{options}`（换行无缩进）
- `Options:\t{options}`（制表符缩进）

### error（错误通知）

**触发时机**：OpenCode 会话发生错误时

**模板变量**：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{projectName}` | 项目名 | `my-project` |
| `{sessionID}` | 会话 ID | `sess-123`，缺失时为 `unknown` |
| `{errorType}` | 错误类型 | `ProviderError`, `ContextOverflowError` |
| `{errorMessage}` | 错误消息 | `429 Too Many Requests` |

**默认模板**：
```
⚠️ OpenCode Error
Project: {projectName}
Session: {sessionID}
Type: {errorType}
Message: {errorMessage}
```

**自定义示例**：
```jsonc
"template": "🚨 错误告警\n项目: {projectName}\n会话: {sessionID}\n错误: [{errorType}] {errorMessage}"
```

## 模板自定义规则

### 基本规则

1. **变量替换**：模板中的 `{variable}` 会被实际值替换
2. **字面量保留**：模板中除变量外的所有文本保持不变
3. **缺失降级**：变量值缺失时降级为 `unknown`
4. **默认模板**：未设置 template 时使用内置默认模板

### 模板语法

```
模板 = 任意文本 + 变量替换
变量 = {variableName}
```

### 示例对比

**配置**：
```jsonc
"template": "🔔 [{tool}] {operation} on {resource}"
```

**事件数据**：
```json
{
  "tool": "bash",
  "operation": "rm",
  "resource": "/tmp/cache"
}
```

**输出**：
```
🔔 [bash] rm on /tmp/cache
```

## 完整配置示例

### 最小配置

```jsonc
{
  "app_id": "cli_xxxxxxxxxxxxxxxx",
  "app_secret": "xxxxxxxxxxxxxxxx",
  "default_target": {
    "chat_id": "oc_xxxxxxxxxxxxxxxx"
  }
}
```

### 完整配置

```jsonc
{
  "app_id": "cli_xxxxxxxxxxxxxxxx",
  "app_secret": "xxxxxxxxxxxxxxxx",
  "default_target": {
    "chat_id": "oc_xxxxxxxxxxxxxxxx"
  },
  "debounce_ms": 5000,
  "log_file": "/var/log/opencode-lark-bridge.log",
  "categories": {
    "permission": {
      "target": { "chat_id": "oc_permission_group" },
      "template": "⚠️ 权限申请\n工具: {tool}\n操作: {operation}\n目标: {resource}\n请审批"
    },
    "completion": {
      "target": { "chat_id": "oc_completion_group" },
      "template": "🎉 任务完成\n项目: {projectName}\n标题: {sessionTitle}"
    },
    "question": {
      "target": { "chat_id": "oc_question_group" },
      "template": "❓ {header}\n{question}\n选项:\n{options}"
    },
    "error": {
      "target": { "chat_id": "oc_error_group" },
      "template": "🚨 错误告警\n项目: {projectName}\n会话: {sessionID}\n错误: [{errorType}] {errorMessage}"
    }
  }
}
```

### 按类别分流通知

将不同类型的通知发送到不同的群聊：

```jsonc
{
  "app_id": "cli_xxxxxxxxxxxxxxxx",
  "app_secret": "xxxxxxxxxxxxxxxx",
  "default_target": {
    "chat_id": "oc_default_group"
  },
  "categories": {
    "permission": {
      "target": { "chat_id": "oc_admin_group" }
    },
    "error": {
      "target": { "chat_id": "oc_alert_group" }
    }
  }
}
```

## 常见问题

### 修改模板后不生效？

**可能原因**：

1. **配置文件路径错误**：确保修改的是正确的配置文件（项目级或全局级）
2. **JSONC 语法错误**：使用 JSONC 解析器验证配置文件语法
3. **question 模板格式问题**：如果修改了 Options 行格式，确保符合支持的格式（见上文 question 部分）

### 如何测试配置？

手动触发测试事件：

```bash
# 测试权限通知
opencode-permission-test

# 测试完成通知
opencode-completion-test
```

### 变量值显示 unknown？

表示该字段在事件数据中缺失，通常是正常行为。例如：
- `projectName` 缺失时降级为 `unknown`
- `sessionID` 缺失时降级为 `unknown`

## 参考文档

- [飞书开放平台](https://open.feishu.cn/)
- [lark-cli 命令速查](./lark-cli/commands-cheatsheet.md)
- [OpenCode 插件开发指南](./OPENCODE_PLUGIN_DEV_GUIDE.md)
