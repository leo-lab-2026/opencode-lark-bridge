---
archived-with: 2026-07-17-question-notification
status: final
---
# Question Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 opencode-lark-bridge 插件新增问答停顿通知功能，当 opencode 提问并等待用户应答时发送飞书通知。

**Architecture:** 完全遵循现有架构模式：event-handler.ts 路由 + question-mapper.ts 渲染 + LarkNotifier 发送。在 event-handler 中新增 `question.asked` 事件分支，新建 question-mapper 提取问题信息并渲染通知文本。

**Tech Stack:** TypeScript, Bun, opencode plugin API, lark-cli

## Global Constraints

- 只监听 V1 事件 `question.asked`（V2 作为后续扩展）
- 去重 key 使用 `question:${requestId}` + debounce_ms 兜底
- 不过滤子代理提问（与 permission.asked 一致）
- 模板变量：`{header}`, `{question}`, `{options}`, `{projectName}`
- 截断保护：question 文本 max 200 字符，options max 5 个
- 选项格式：换行列表 `• label: description`
- 多问题合并为一条通知，编号列出

```yaml
---
change: question-notification
design-doc: docs/superpowers/specs/2026-07-16-question-notification-design.md
base-ref: 7c7370c609612f9d350edf7638b12f31c14b7772
---
```

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/opencode-lark-bridge/src/events/question-mapper.ts` | 新建 | 从 question 事件提取问题信息，渲染通知文本 |
| `packages/opencode-lark-bridge/src/events/event-handler.ts` | 修改 | 新增 question.asked 事件分支（路由 + 去重） |
| `packages/opencode-lark-bridge/src/index.ts` | 修改 | enhanceEvent 为 question.asked 注入 projectName + 更新日志 |
| `packages/opencode-lark-bridge/tests/question-mapper.test.ts` | 新建 | question-mapper 单元测试 |
| `packages/opencode-lark-bridge/tests/event-handler.test.ts` | 修改 | 补充 question.asked 事件处理测试 |
| `packages/opencode-lark-bridge/README.md` | 修改 | 新增问答通知章节 |
| `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc` | 修改 | 添加 categories.question 配置示例 |

---

### Task 1: Question Mapper 核心实现

**Files:**
- Create: `packages/opencode-lark-bridge/src/events/question-mapper.ts`
- Test: `packages/opencode-lark-bridge/tests/question-mapper.test.ts`

**Interfaces:**
- Produces: `mapQuestionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage`

- [x] **Step 1: 编写 question-mapper 测试文件**

创建 `packages/opencode-lark-bridge/tests/question-mapper.test.ts`，覆盖以下场景：
- 单问题渲染（header + question + options）
- 多问题渲染（Multiple Questions (N) + 编号列出）
- 多选提示（`(可多选)`）
- 自定义输入提示（`(可自定义输入)`）
- 无选项（不显示 Options 行）
- 截断保护（question > 200 字符截断 + `...`，options > 5 个截断 + `... (N more)`）
- 自定义模板
- 默认模板
- 字段缺失降级（projectName 降级为 `unknown`）

测试结构参考 `packages/opencode-lark-bridge/tests/permission-mapper.test.ts` 和 `tests/completion-mapper.test.ts`。

- [x] **Step 2: 运行测试确认失败**

Run: `cd packages/opencode-lark-bridge && bun test tests/question-mapper.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现 question-mapper.ts**

创建 `packages/opencode-lark-bridge/src/events/question-mapper.ts`：

```typescript
import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "❓ OpenCode Question\nProject: {projectName}\n{header}\n{question}\nOptions: {options}"
const MAX_QUESTION_LEN = 200
const MAX_OPTIONS = 5

interface QuestionInfo {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiple?: boolean
  custom?: boolean
}

function extractQuestions(props: Record<string, unknown>): QuestionInfo[] {
  const raw = props.questions
  if (!Array.isArray(raw)) return []
  return raw.map((q) => {
    const qObj = q as Record<string, unknown>
    const options = Array.isArray(qObj.options) ? qObj.options.map((o) => {
      const oObj = o as Record<string, unknown>
      return {
        label: typeof oObj.label === "string" ? oObj.label : "unknown",
        description: typeof oObj.description === "string" ? oObj.description : "",
      }
    }) : []
    return {
      question: typeof qObj.question === "string" ? qObj.question : "unknown",
      header: typeof qObj.header === "string" ? qObj.header : "unknown",
      options,
      multiple: typeof qObj.multiple === "boolean" ? qObj.multiple : false,
      custom: typeof qObj.custom === "boolean" ? qObj.custom : true,
    }
  })
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + "..."
}

function formatOptions(questions: QuestionInfo[]): string {
  if (questions.length === 0) return ""

  if (questions.length === 1) {
    return formatSingleQuestionOptions(questions[0])
  }

  return questions.map((q, i) => {
    const opts = formatSingleQuestionOptions(q)
    return opts ? `${i + 1}. ${opts}` : `${i + 1}. (无选项)`
  }).join("\n")
}

function formatSingleQuestionOptions(q: QuestionInfo): string {
  if (q.options.length === 0) return ""

  const suffix: string[] = []
  if (q.multiple) suffix.push("(可多选)")
  if (q.custom) suffix.push("(可自定义输入)")

  const visibleOptions = q.options.slice(0, MAX_OPTIONS)
  const optionsText = visibleOptions
    .map((o) => `• ${o.label}: ${o.description}`)
    .join("\n")

  let result = optionsText
  if (q.options.length > MAX_OPTIONS) {
    result += `\n... (${q.options.length - MAX_OPTIONS} more)`
  }
  if (suffix.length > 0) {
    result += ` ${suffix.join(" ")}`
  }
  return result
}

function formatQuestionText(questions: QuestionInfo[]): string {
  if (questions.length === 0) return ""

  if (questions.length === 1) {
    return truncate(questions[0].question, MAX_QUESTION_LEN)
  }

  return questions.map((q, i) => {
    const text = truncate(q.question, MAX_QUESTION_LEN)
    return `${i + 1}. ${q.header}\n   ${text}`
  }).join("\n")
}

function formatHeader(questions: QuestionInfo[]): string {
  if (questions.length === 0) return "No Questions"
  if (questions.length === 1) return questions[0].header
  return `Multiple Questions (${questions.length})`
}

export function mapQuestionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const props = (event?.properties ?? event) as Record<string, unknown>
  const questions = extractQuestions(props)
  const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"

  const header = formatHeader(questions)
  const questionText = formatQuestionText(questions)
  const optionsText = formatOptions(questions)

  const text = (template || DEFAULT_TEMPLATE)
    .replace(/{projectName}/g, projectName)
    .replace(/{header}/g, header)
    .replace(/{question}/g, questionText)
    .replace(/{options}/g, optionsText)

  return { text, target }
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `cd packages/opencode-lark-bridge && bun test tests/question-mapper.test.ts`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/opencode-lark-bridge/src/events/question-mapper.ts packages/opencode-lark-bridge/tests/question-mapper.test.ts
git commit -m "feat(bridge): add question-mapper for question event notification rendering"
```

---

### Task 2: Event Handler 集成

**Files:**
- Modify: `packages/opencode-lark-bridge/src/events/event-handler.ts`
- Modify: `packages/opencode-lark-bridge/tests/event-handler.test.ts`

**Interfaces:**
- Consumes: `mapQuestionEvent` from Task 1
- Produces: question.asked event handling in event-handler

- [x] **Step 1: 在 event-handler.test.ts 中添加 question.asked 测试用例**

添加以下测试：
- 收到 question.asked 事件时发送通知
- 相同 request ID 在 debounce 窗口内去重
- 配置 categories.question.target 时发送到自定义目标

参考现有 `permission.asked` 的测试模式。

- [x] **Step 2: 运行测试确认失败**

Run: `cd packages/opencode-lark-bridge && bun test tests/event-handler.test.ts`
Expected: FAIL（question.asked 分支不存在）

- [x] **Step 3: 在 event-handler.ts 中添加 question.asked 分支**

在 `session.idle` 分支之后、`permission.asked` 检查之前（即 `if (eventType !== "permission.asked")` 之前）插入：

```typescript
// 导入 mapQuestionEvent（在文件顶部添加）
import { mapQuestionEvent } from "./question-mapper.js"

// 在 handle 函数中，session.idle 分支之后添加：
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

- [x] **Step 4: 运行测试确认通过**

Run: `cd packages/opencode-lark-bridge && bun test tests/event-handler.test.ts`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/opencode-lark-bridge/src/events/event-handler.ts packages/opencode-lark-bridge/tests/event-handler.test.ts
git commit -m "feat(bridge): add question.asked event handling in event-handler"
```

---

### Task 3: 插件入口更新

**Files:**
- Modify: `packages/opencode-lark-bridge/src/index.ts`

- [x] **Step 1: 修改 enhanceEvent 为 question.asked 注入 projectName**

在 `enhanceEvent` 函数中，`session.idle` 检查之前添加 `question.asked` 分支：

```typescript
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
```

- [x] **Step 2: 更新日志注册行**

将：
```typescript
logger.info("Plugin hooks registered", { hooks: ["event", "permission.ask", "session.idle"] })
```
改为：
```typescript
logger.info("Plugin hooks registered", { hooks: ["event", "permission.ask", "session.idle", "question.asked"] })
```

- [x] **Step 3: 运行全部测试确认无回归**

Run: `cd packages/opencode-lark-bridge && bun test`
Expected: ALL PASS

- [x] **Step 4: 提交**

```bash
git add packages/opencode-lark-bridge/src/index.ts
git commit -m "feat(bridge): inject projectName for question.asked events in enhanceEvent"
```

---

### Task 4: 文档和配置更新

**Files:**
- Modify: `packages/opencode-lark-bridge/README.md`
- Modify: `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc`

- [x] **Step 1: 在 README.md 中新增"问答通知"章节**

在"任务完成通知"章节之后添加"问答通知"章节，说明：
- 监听 `question.asked` 事件
- 通知内容：问题标题、问题文本、选项列表
- 配置项 `categories.question`
- 模板变量：`{header}`, `{question}`, `{options}`, `{projectName}`
- 截断保护说明

- [x] **Step 2: 在配置示例文件中添加 categories.question**

在 `opencode-lark-bridge.config.example.jsonc` 的 `categories` 对象中添加：

```jsonc
"question": {
  // "target": { "chat_id": "oc_xxxx" },
  // "template": "❓ {header}\n{question}\nOptions: {options}"
}
```

- [x] **Step 3: 运行全部测试确认无回归**

Run: `cd packages/opencode-lark-bridge && bun test`
Expected: ALL PASS

- [x] **Step 4: 提交**

```bash
git add packages/opencode-lark-bridge/README.md packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc
git commit -m "docs(bridge): add question notification documentation and config example"
```

---

### Task 5: 最终验证

- [x] **Step 1: 运行完整测试套件**

Run: `cd packages/opencode-lark-bridge && bun test`
Expected: ALL PASS, 0 FAIL

- [x] **Step 2: 运行 TypeScript 类型检查**

Run: `cd packages/opencode-lark-bridge && bunx tsc --noEmit`
Expected: No errors

- [x] **Step 3: 检查 tasks.md 全部勾选**

确认 `openspec/changes/question-notification/tasks.md` 中所有任务已勾选。
