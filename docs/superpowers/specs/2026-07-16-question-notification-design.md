---
comet_change: question-notification
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-17-question-notification
status: final
---

# Design Doc: Question Notification

## 概述

为 opencode-lark-bridge 插件新增问答停顿通知功能。当 OpenCode 向用户提问并停顿等待应答时，插件自动发送飞书通知，让用户及时知道需要回去应答。

## 架构

完全遵循现有架构模式（event-handler 路由 + mapper 渲染 + Notifier 发送）：

```
question.asked 事件
    → index.ts enhanceEvent()（注入 projectName）
    → event-handler.ts（新增 question 分支，request ID 去重 + 路由）
    → question-mapper.ts（新建：提取问题信息，渲染通知文本）
    → 模板渲染（{header}, {question}, {options}, {projectName}）
    → LarkNotifier（现有：构建 lark-cli 命令）
    → lark-cli im +messages-send
```

## 组件设计

### 1. question-mapper.ts（新建）

**位置**：`packages/opencode-lark-bridge/src/events/question-mapper.ts`

**导出函数**：`mapQuestionEvent(event, target, template?) -> NotificationMessage`

**默认模板**：
```
❓ OpenCode Question
Project: {projectName}
{header}
{question}
Options: {options}
```

**模板变量**：

| 变量 | 单问题 | 多问题 |
|------|--------|--------|
| `{header}` | 问题 header | `Multiple Questions (N)` |
| `{question}` | 问题文本 | 编号列出所有问题文本 |
| `{options}` | 选项列表 | 编号列出所有选项 |
| `{projectName}` | 项目名 | 项目名 |

**渲染规则**：

1. **选项格式化**：换行列表 `• label: description`
2. **多选提示**：options 后添加 `(可多选)`
3. **自定义输入提示**：options 后添加 `(可自定义输入)`
4. **无选项**：不显示 Options 行（模板中 `{options}` 替换为空字符串）
5. **截断保护**：
   - question 文本截断到 200 字符（超出添加 `...`）
   - options 最多显示前 5 个（超出添加 `... (N more)`）
6. **字段缺失降级**：projectName 降级为 `unknown`，header/question 降级为 `unknown`

**通知文本示例**：

单问题 + 选项：
```
❓ OpenCode Question
Project: my-project
选择部署方案
你希望使用哪种部署方式？
Options:
• Docker: 使用容器化部署
• Kubernetes: 使用 K8s 集群部署
• Bare Metal: 直接部署到物理机
```

多问题 + 多选 + 自定义输入：
```
❓ OpenCode Question
Project: my-project
Multiple Questions (2)
1. 选择部署方案
   你希望使用哪种部署方式？
   Options: (可多选)
   • Docker: 使用容器化部署
   • Kubernetes: 使用 K8s 集群部署
2. 配置数据库名称
   请输入数据库名称：
   Options: (可自定义输入)
```

### 2. event-handler.ts 修改

在 `session.idle` 分支之后、`permission.asked` 检查之前插入 `question.asked` 分支：

```typescript
if (eventType === "question.asked") {
  logger.debug("Received question.asked event", { eventType, event })
  const props = (event?.properties ?? event) as Record<string, unknown>
  const questionId = typeof props.id === "string" ? props.id : "unknown"

  const key = `question:${questionId}`
  const now = Date.now()
  const last = lastSent.get(key)
  if (last && now - last < config.debounce_ms) {
    logger.debug("Skipping duplicate question notification", { key })
    return
  }
  lastSent.set(key, now)

  const category = "question"
  const target = getEffectiveTarget(config, category)
  const categoryConfig = config.categories[category] || {}
  const message = mapQuestionEvent(event, target, categoryConfig.template)
  logger.info("Sending question notification", { target, text: message.text })
  await notifier.send(message)
  return
}
```

**去重 key 设计**：`question:${requestId}`（格式 `question:que_xxx`），与现有 permission 的 `tool:resource` key 格式一致。`debounce_ms` 作为兜底防护。

**子代理处理**：不过滤子代理提问（与 permission.asked 一致）。

### 3. index.ts 修改

`enhanceEvent()` 需为 `question.asked` 事件注入 `projectName`：

```typescript
function enhanceEvent(event: any): any {
  const type = event?.type ?? event?.name
  if (type === "session.created" || type === "session.updated") {
    cacheSessionTitle(event)
    return event
  }
  if (type === "question.asked") {
    const props = event?.properties ?? event ?? {}
    return {
      ...event,
      properties: {
        ...props,
        projectName: props?.projectName ?? projectName,
      },
    }
  }
  if (type !== "session.idle") return event
  // ... existing session.idle logic unchanged
}
```

同时更新日志注册行，添加 `question.asked`：
```typescript
logger.info("Plugin hooks registered", { hooks: ["event", "permission.ask", "session.idle", "question.asked"] })
```

## 数据流

```
OpenCode 发布 question.asked 事件
    ↓
index.ts event hook 接收
    ↓
enhanceEvent() 注入 projectName
    ↓
handler.handle(enhancedEvent)
    ↓
event-handler.ts 匹配 eventType === "question.asked"
    ↓
去重检查（question:requestId + debounce_ms）
    ↓
mapQuestionEvent(event, target, template)
    ↓
模板变量替换（{header}, {question}, {options}, {projectName}）
    ↓
notifier.send(message)
    ↓
lark-cli im +messages-send --chat-id/--user-id --as bot --text "..."
```

## 事件数据结构（question.asked）

```typescript
{
  type: "question.asked",
  properties: {
    id: "que_xxx",           // question request ID（去重 key）
    sessionID: "ses_xxx",
    questions: [
      {
        question: "完整问题文本",
        header: "简短标签（max 30 chars）",
        options: [
          { label: "选项显示文本", description: "选项说明" }
        ],
        multiple?: boolean,   // 是否允许多选
        custom?: boolean      // 是否允许自定义输入（默认 true）
      }
    ],
    tool?: { messageID: string, callID: string }
  }
}
```

## 测试策略

### question-mapper.test.ts（新建）

| 测试用例 | 输入 | 预期 |
|---------|------|------|
| 单问题渲染 | 1 个问题，3 个选项 | 通知包含 header、question、3 个选项 |
| 多问题渲染 | 2 个问题 | header = "Multiple Questions (2)"，编号列出 |
| 多选提示 | multiple: true | options 后显示 `(可多选)` |
| 自定义输入提示 | custom: true | options 后显示 `(可自定义输入)` |
| 无选项 | options: [] | 不显示 Options 行 |
| 截断保护 | question > 200 字符 | 截断到 200 字符 + `...` |
| 选项截断 | 7 个选项 | 只显示前 5 个 + `... (2 more)` |
| 自定义模板 | 传入 template | 使用自定义模板 |
| 默认模板 | 不传 template | 使用默认模板 |
| 字段缺失 | 无 projectName | 降级为 `unknown` |

### event-handler.test.ts（补充）

| 测试用例 | 输入 | 预期 |
|---------|------|------|
| 发送 question 通知 | question.asked 事件 | notifier.send 被调用 |
| 去重 | 相同 request ID，在 debounce 窗口内 | notifier.send 不被调用 |
| 配置 target | categories.question.target | 发送到自定义 target |

## 边界条件

- **questions 数组为空**：降级处理，`{header}` = "No Questions"，`{question}` = ""，`{options}` = ""
- **options 为空数组**：`{options}` 替换为空字符串，不显示 Options 行
- **超长 question 文本**：截断到 200 字符
- **超过 5 个选项**：只显示前 5 个，添加 `... (N more)`
- **缺失 projectName**：降级为 `unknown`
- **缺失 id**：去重 key 使用 `question:unknown`

## 配置

`opencode-lark-bridge.config.jsonc` 新增 `categories.question` 配置项：

```jsonc
{
  "categories": {
    "question": {
      "target": { "chat_id": "oc_xxxx" },
      "template": "❓ {header}\n{question}\nOptions: {options}"
    }
  }
}
```

| 字段 | 说明 | 示例 |
|------|------|------|
| `categories.question.target` | 问答通知目标 | `{ "chat_id": "oc_xxxx" }` |
| `categories.question.template` | 问答通知模板 | `❓ {header}\n{question}\nOptions: {options}` |

## V2 事件后续扩展

OpenCode schema 中定义了 V2 事件 `question.v2.asked`（数据结构与 V1 一致），但当前运行时发布的是 V1 事件。本次只监听 V1。

后续扩展方式：在 event-handler.ts 的 question 分支中添加 V2 事件类型匹配：
```typescript
if (eventType === "question.asked" || eventType === "question.v2.asked") {
```
question-mapper.ts 无需修改。
