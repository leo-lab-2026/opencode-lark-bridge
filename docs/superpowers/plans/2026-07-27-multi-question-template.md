---
change: multi-question-template-support
design-doc: docs/superpowers/specs/2026-07-27-multi-question-template-design.md
base-ref: f455a84ae80d495abd08bb71f06b1c262a290c21
archived-with: 2026-07-27-multi-question-template-support
---

# 多问题通知模板配置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为 question 事件新增多问题模板配置能力，支持自定义整体框架和问题项格式

**Architecture:** 扩展 CategoryConfig 接口新增两个模板字段；重构 question-mapper.ts 实现多问题模板渲染；通过 applyIndent 函数自动处理选项缩进；保持向后兼容

**Tech Stack:** TypeScript, Bun test, comment-json

## Global Constraints

- 语言: 中文（所有注释、测试、文档）
- 向后兼容: 新字段可选，现有配置继续工作
- 测试框架: Bun test (`import { describe, it, expect } from "bun:test"`)
- ESM 模块: 相对导入必须带 `.js` 扩展名
- 无破坏性变更: 现有测试必须继续通过

---

## 文件结构

**新建文件:** 无

**修改文件:**
- `src/types.ts:21-24` - 扩展 CategoryConfig 接口
- `src/events/question-mapper.ts:1-131` - 核心功能重构
- `tests/question-mapper.test.ts` - 新增 8 个测试场景
- `opencode-lark-bridge.config.example.jsonc` - 添加新字段示例
- `README.md` - 更新文档说明

---

## Task 1: 类型定义扩展

**Files:**
- Modify: `src/types.ts:21-24`

**Interfaces:**
- Consumes: 无
- Produces: `CategoryConfig.template_multiple?: string`, `CategoryConfig.question_item_template?: string`

- [x] **Step 1: 扩展 CategoryConfig 接口**

打开 `src/types.ts`，在 `CategoryConfig` 接口中添加两个新字段：

```typescript
export interface CategoryConfig {
  target?: NotificationTarget
  template?: string
  template_multiple?: string           // 新增：多问题整体框架模板
  question_item_template?: string      // 新增：多问题中每个问题项的模板
}
```

- [x] **Step 2: 验证类型定义**

运行: `npm run build`
预期: 编译通过，无类型错误

- [x] **Step 3: 提交类型定义变更**

```bash
git add src/types.ts
git commit -m "feat: 扩展 CategoryConfig 接口，新增多问题模板字段"
```

---

## Task 2: 默认模板定义

**Files:**
- Modify: `src/events/question-mapper.ts:1-6`

**Interfaces:**
- Consumes: 无
- Produces: `DEFAULT_TEMPLATE`, `DEFAULT_TEMPLATE_MULTIPLE`, `DEFAULT_QUESTION_ITEM_TEMPLATE` 三个常量

- [x] **Step 1: 定义多问题默认模板常量**

在 `src/events/question-mapper.ts` 顶部，在 `DEFAULT_TEMPLATE` 之后添加：

```typescript
const DEFAULT_TEMPLATE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n{question}\nOptions:\n{options}\n{suffix}"
const DEFAULT_TEMPLATE_MULTIPLE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n\n{questions}"
const DEFAULT_QUESTION_ITEM_TEMPLATE = "{number}. {header}\n   {question}\n   Options:\n   {options}\n   {suffix}"
const MAX_QUESTION_LEN = 200
const MAX_OPTIONS = 5
```

注意: 同时更新 `DEFAULT_TEMPLATE`，将 `Options: {options}` 改为 `Options:\n{options}\n{suffix}`

- [x] **Step 2: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 3: 提交默认模板定义**

```bash
git add src/events/question-mapper.ts
git commit -m "feat: 定义多问题默认模板常量"
```

---

## Task 3: 实现 applyIndent 函数

**Files:**
- Modify: `src/events/question-mapper.ts:36-41` (在 truncate 函数之后插入)

**Interfaces:**
- Consumes: 无
- Produces: `applyIndent(template: string, varName: string, content: string): string`

- [x] **Step 1: 编写 applyIndent 函数**

在 `truncate` 函数之后添加：

```typescript
/**
 * 自动应用模板中变量前的缩进到变量内容的每一行
 * @param template 完整模板字符串
 * @param varName 变量名（如 "options"）
 * @param content 多行内容（如选项列表）
 * @returns 应用缩进后的内容
 */
function applyIndent(template: string, varName: string, content: string): string {
  // 提取模板中 {varName} 前的缩进
  const indentMatch = template.match(new RegExp(`([ \\t]*)\\{${varName}\\}`))
  const indent = indentMatch ? indentMatch[1] : ''
  
  // 如果内容为空或只有一行，直接返回
  if (!content || !content.includes('\n')) {
    return content
  }
  
  // 对每个后续行应用缩进（第一行已有模板缩进）
  const lines = content.split('\n')
  return lines.map((line, i) => i === 0 ? line : indent + line).join('\n')
}
```

- [x] **Step 2: 编写 applyIndent 单元测试**

在 `tests/question-mapper.test.ts` 中添加：

```typescript
it("applyIndent 应对多行内容应用模板缩进", () => {
  const template = "Options:\n   {options}"
  const content = "• A: 描述A\n• B: 描述B"
  const result = applyIndent(template, 'options', content)
  expect(result).toBe("• A: 描述A\n   • B: 描述B")
})

it("applyIndent 对单行内容直接返回", () => {
  const template = "Options:\n   {options}"
  const content = "• A: 描述A"
  const result = applyIndent(template, 'options', content)
  expect(result).toBe("• A: 描述A")
})

it("applyIndent 对空内容返回空字符串", () => {
  const template = "Options:\n   {options}"
  const result = applyIndent(template, 'options', '')
  expect(result).toBe('')
})
```

注意: 由于 `applyIndent` 是私有函数，需要暂时导出或在文件内测试。建议在文件内编写测试函数，或者跳过此步骤，在集成测试中验证。

- [x] **Step 3: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 4: 提交 applyIndent 实现**

```bash
git add src/events/question-mapper.ts tests/question-mapper.test.ts
git commit -m "feat: 实现 applyIndent 函数用于自动缩进"
```

---

## Task 4: 实现 formatSuffix 函数

**Files:**
- Modify: `src/events/question-mapper.ts:41-53` (在 applyIndent 之后插入)

**Interfaces:**
- Consumes: `QuestionInfo.multiple`, `QuestionInfo.custom`
- Produces: `formatSuffix(q: QuestionInfo): string`

- [x] **Step 1: 编写 formatSuffix 函数**

在 `applyIndent` 函数之后添加：

```typescript
/**
 * 格式化后缀（选择方式说明）
 */
function formatSuffix(q: QuestionInfo): string {
  const suffix: string[] = []
  if (q.multiple) suffix.push("(可多选)")
  if (q.custom) suffix.push("(可自定义输入)")
  return suffix.join(" ")
}
```

- [x] **Step 2: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 3: 提交 formatSuffix 实现**

```bash
git add src/events/question-mapper.ts
git commit -m "feat: 实现 formatSuffix 函数"
```

---

## Task 5: 实现 formatQuestionOptions 函数

**Files:**
- Modify: `src/events/question-mapper.ts:53-73` (重构 formatSingleQuestionOptions)

**Interfaces:**
- Consumes: `QuestionInfo`, `MAX_OPTIONS`, `formatSuffix`
- Produces: `formatQuestionOptions(q: QuestionInfo): string` - 仅返回选项列表，不含后缀

- [x] **Step 1: 重构 formatSingleQuestionOptions 为 formatQuestionOptions**

将原有的 `formatSingleQuestionOptions` 函数重构为 `formatQuestionOptions`，仅返回选项列表：

```typescript
/**
 * 格式化单个问题的选项列表（不含后缀）
 */
function formatQuestionOptions(q: QuestionInfo): string {
  if (q.options.length === 0) return ""

  const visibleOptions = q.options.slice(0, MAX_OPTIONS)
  const optionsText = visibleOptions
    .map((o) => `• ${o.label}: ${o.description}`)
    .join("\n")

  let result = optionsText
  if (q.options.length > MAX_OPTIONS) {
    result += `\n... 还有 ${q.options.length - MAX_OPTIONS} 个选项`
  }
  return result
}
```

- [x] **Step 2: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 3: 提交 formatQuestionOptions 重构**

```bash
git add src/events/question-mapper.ts
git commit -m "refactor: 重构 formatQuestionOptions，分离后缀逻辑"
```

---

## Task 6: 实现 formatQuestionItem 函数

**Files:**
- Modify: `src/events/question-mapper.ts` (在 formatQuestionOptions 之后插入)

**Interfaces:**
- Consumes: `QuestionInfo`, `MAX_QUESTION_LEN`, `formatSuffix`, `formatQuestionOptions`, `applyIndent`
- Produces: `formatQuestionItem(q: QuestionInfo, index: number, template?: string): string`

- [x] **Step 1: 编写 removeOptionsLine 辅助函数**

在 `formatQuestionOptions` 之后添加：

```typescript
/**
 * 移除模板中的 Options 行（当选项为空时）
 */
function removeOptionsLine(template: string): string {
  return template
    .replace(/\n[ \t]*Options:[ \t]*\n?[ \t]*\{options\}/g, "")
    .replace(/[ \t]*Options:[ \t]*\n?[ \t]*\{options\}\n?/g, "")
}
```

- [x] **Step 2: 编写 formatQuestionItem 函数**

在 `removeOptionsLine` 之后添加：

```typescript
/**
 * 渲染单个问题项
 */
function formatQuestionItem(q: QuestionInfo, index: number, template?: string): string {
  const effectiveTemplate = template || DEFAULT_QUESTION_ITEM_TEMPLATE
  
  const number = (index + 1).toString()
  const question = truncate(q.question, MAX_QUESTION_LEN)
  const suffix = formatSuffix(q)
  const options = formatQuestionOptions(q)
  
  // 应用缩进到选项
  const indentedOptions = applyIndent(effectiveTemplate, 'options', options)
  
  // 处理空选项：移除 Options 行
  let finalTemplate = effectiveTemplate
  if (!indentedOptions) {
    finalTemplate = removeOptionsLine(finalTemplate)
  }
  
  return finalTemplate
    .replace(/{number}/g, number)
    .replace(/{header}/g, q.header)
    .replace(/{question}/g, question)
    .replace(/{options}/g, indentedOptions)
    .replace(/{suffix}/g, suffix)
}
```

- [x] **Step 3: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 4: 提交 formatQuestionItem 实现**

```bash
git add src/events/question-mapper.ts
git commit -m "feat: 实现 formatQuestionItem 函数"
```

---

## Task 7: 实现 formatQuestions 函数

**Files:**
- Modify: `src/events/question-mapper.ts` (在 formatQuestionItem 之后插入)

**Interfaces:**
- Consumes: `QuestionInfo[]`, `formatQuestionItem`
- Produces: `formatQuestions(questions: QuestionInfo[], itemTemplate?: string): string`

- [x] **Step 1: 编写 formatQuestions 函数**

在 `formatQuestionItem` 之后添加：

```typescript
/**
 * 拼接所有问题项
 */
function formatQuestions(questions: QuestionInfo[], itemTemplate?: string): string {
  return questions
    .map((q, i) => formatQuestionItem(q, i, itemTemplate))
    .join("\n\n")
}
```

- [x] **Step 2: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 3: 提交 formatQuestions 实现**

```bash
git add src/events/question-mapper.ts
git commit -m "feat: 实现 formatQuestions 函数"
```

---

## Task 8: 重构 mapQuestionEvent 函数

**Files:**
- Modify: `src/events/question-mapper.ts:104-131`

**Interfaces:**
- Consumes: 所有辅助函数
- Produces: `mapQuestionEvent(event: any, target: NotificationTarget, template?: string, templateMultiple?: string, questionItemTemplate?: string): NotificationMessage`

- [x] **Step 1: 重构 mapQuestionEvent 函数签名**

更新函数签名，新增两个可选参数：

```typescript
export function mapQuestionEvent(
  event: any, 
  target: NotificationTarget, 
  template?: string,
  templateMultiple?: string,
  questionItemTemplate?: string
): NotificationMessage {
```

- [x] **Step 2: 重构单问题分支**

在 `mapQuestionEvent` 函数中，重构单问题逻辑：

```typescript
  const props = (event?.properties ?? event) as Record<string, unknown>
  const questions = extractQuestions(props)
  const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"
  const header = formatHeader(questions)
  
  let text: string
  
  if (questions.length === 0) {
    // 无问题：使用单问题模板，变量替换为空/默认值
    const effectiveTemplate = template || DEFAULT_TEMPLATE
    text = effectiveTemplate
      .replace(/{projectName}/g, projectName)
      .replace(/{header}/g, "No Questions")
      .replace(/{question}/g, "")
      .replace(/{options}/g, "")
      .replace(/{suffix}/g, "")
  } else if (questions.length === 1) {
    // 单问题：使用单问题模板
    const effectiveTemplate = template || DEFAULT_TEMPLATE
    const q = questions[0]
    const questionText = truncate(q.question, MAX_QUESTION_LEN)
    const options = formatQuestionOptions(q)
    const suffix = formatSuffix(q)
    
    // 应用缩进到选项
    const indentedOptions = applyIndent(effectiveTemplate, 'options', options)
    
    // 处理空选项
    let finalTemplate = effectiveTemplate
    if (!indentedOptions) {
      finalTemplate = removeOptionsLine(finalTemplate)
    }
    
    text = finalTemplate
      .replace(/{projectName}/g, projectName)
      .replace(/{header}/g, header)
      .replace(/{question}/g, questionText)
      .replace(/{options}/g, indentedOptions)
      .replace(/{suffix}/g, suffix)
  } else {
    // 多问题：使用多问题模板
    const effectiveTemplateMultiple = templateMultiple || DEFAULT_TEMPLATE_MULTIPLE
    const questionsText = formatQuestions(questions, questionItemTemplate)
    
    text = effectiveTemplateMultiple
      .replace(/{projectName}/g, projectName)
      .replace(/{header}/g, header)
      .replace(/{questions}/g, questionsText)
  }
  
  return { text: text.trimEnd(), target }
}
```

- [x] **Step 3: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 4: 提交 mapQuestionEvent 重构**

```bash
git add src/events/question-mapper.ts
git commit -m "refactor: 重构 mapQuestionEvent 支持多问题模板配置"
```

---

## Task 9: 更新 event-handler 调用链

**Files:**
- Modify: `src/events/event-handler.ts`

**Interfaces:**
- Consumes: `mapQuestionEvent` 新签名
- Produces: 无新接口

- [x] **Step 1: 更新 mapQuestionEvent 调用**

找到 `event-handler.ts` 中调用 `mapQuestionEvent` 的位置，传递新参数：

```typescript
if (eventType === "question.asked") {
  // ... 去重逻辑 ...
  
  const category = "question"
  const target = getEffectiveTarget(config, category)
  const categoryConfig = config.categories[category] || {}
  
  // 传递新字段（从 CategoryConfig 中读取）
  const message = mapQuestionEvent(
    event, 
    target, 
    categoryConfig.template,
    categoryConfig.template_multiple,           // 新增
    categoryConfig.question_item_template       // 新增
  )
  logger.info("Sending question notification", { target, text: message.text })
  await notifier.send(message)
  return
}
```

- [x] **Step 2: 验证编译**

运行: `npm run build`
预期: 编译通过

- [x] **Step 3: 提交 event-handler 更新**

```bash
git add src/events/event-handler.ts
git commit -m "feat: 更新 event-handler 传递多问题模板参数"
```

---

## Task 10: 单元测试 - 单问题场景

**Files:**
- Modify: `tests/question-mapper.test.ts`

**Interfaces:**
- Consumes: `mapQuestionEvent`
- Produces: 无

- [x] **Step 1: 测试单问题 + 自定义模板**

```typescript
it("单问题使用自定义模板", () => {
  const event = {
    properties: {
      projectName: "my-project",
      questions: [{
        header: "测试问题",
        question: "这是一个问题？",
        options: [
          { label: "A", description: "选项A" },
          { label: "B", description: "选项B" }
        ],
        multiple: true
      }]
    }
  }
  
  const customTemplate = "项目: {projectName}\n问题: {question}\n选项:\n{options}\n备注: {suffix}"
  const message = mapQuestionEvent(event, defaultTarget, customTemplate)
  
  expect(message.text).toContain("项目: my-project")
  expect(message.text).toContain("问题: 这是一个问题？")
  expect(message.text).toContain("选项:\n• A: 选项A\n• B: 选项B")
  expect(message.text).toContain("备注: (可多选)")
})
```

- [x] **Step 2: 运行测试验证**

运行: `bun test tests/question-mapper.test.ts`
预期: 测试通过

- [x] **Step 3: 提交单问题测试**

```bash
git add tests/question-mapper.test.ts
git commit -m "test: 添加单问题自定义模板测试"
```

---

## Task 11: 单元测试 - 多问题场景

**Files:**
- Modify: `tests/question-mapper.test.ts`

**Interfaces:**
- Consumes: `mapQuestionEvent`
- Produces: 无

- [x] **Step 1: 测试多问题 + 自定义所有模板**

```typescript
it("多问题使用自定义模板", () => {
  const event = {
    properties: {
      projectName: "my-project",
      questions: [
        {
          header: "问题1",
          question: "第一个问题？",
          options: [{ label: "A", description: "选项A" }],
          multiple: true
        },
        {
          header: "问题2",
          question: "第二个问题？",
          options: [],
          custom: true
        }
      ]
    }
  }
  
  const templateMultiple = "项目: {projectName}\n共 {header} 个问题\n\n{questions}"
  const questionItemTemplate = "{number}. [{header}]\n   内容: {question}\n   选项:\n   {options}\n   备注: {suffix}"
  
  const message = mapQuestionEvent(
    event, 
    defaultTarget, 
    undefined,
    templateMultiple,
    questionItemTemplate
  )
  
  expect(message.text).toContain("项目: my-project")
  expect(message.text).toContain("共 Multiple Questions (2) 个问题")
  expect(message.text).toContain("1. [问题1]")
  expect(message.text).toContain("内容: 第一个问题？")
  expect(message.text).toContain("备注: (可多选)")
  expect(message.text).toContain("2. [问题2]")
  expect(message.text).toContain("备注: (可自定义输入)")
})
```

- [x] **Step 2: 测试多问题 + 只配置单问题模板**

```typescript
it("多问题只配置单问题模板时使用默认多问题模板", () => {
  const event = {
    properties: {
      projectName: "test",
      questions: [
        { header: "Q1", question: "问题1", options: [] },
        { header: "Q2", question: "问题2", options: [] }
      ]
    }
  }
  
  const singleTemplate = "项目: {projectName}\n{question}"
  const message = mapQuestionEvent(event, defaultTarget, singleTemplate)
  
  // 应该使用默认的多问题模板，忽略单问题模板
  expect(message.text).toContain("❓ OpenCode Question")
  expect(message.text).toContain("1. Q1")
  expect(message.text).toContain("2. Q2")
})
```

- [x] **Step 3: 测试不配置任何模板**

```typescript
it("不配置模板时使用默认模板", () => {
  const event = {
    properties: {
      projectName: "test",
      questions: [
        { header: "Q1", question: "问题1", options: [{ label: "A", description: "选项A" }] },
        { header: "Q2", question: "问题2", options: [] }
      ]
    }
  }
  
  const message = mapQuestionEvent(event, defaultTarget)
  
  expect(message.text).toContain("❓ OpenCode Question")
  expect(message.text).toContain("1. Q1")
  expect(message.text).toContain("Options:")
  expect(message.text).toContain("• A: 选项A")
  expect(message.text).toContain("2. Q2")
})
```

- [x] **Step 4: 运行测试验证**

运行: `bun test tests/question-mapper.test.ts`
预期: 测试通过

- [x] **Step 5: 提交多问题测试**

```bash
git add tests/question-mapper.test.ts
git commit -m "test: 添加多问题模板测试"
```

---

## Task 12: 单元测试 - 边界场景

**Files:**
- Modify: `tests/question-mapper.test.ts`

**Interfaces:**
- Consumes: `mapQuestionEvent`
- Produces: 无

- [x] **Step 1: 测试空选项问题**

```typescript
it("空选项问题正确处理", () => {
  const event = {
    properties: {
      projectName: "test",
      questions: [{
        header: "测试",
        question: "问题？",
        options: [],
        custom: true
      }]
    }
  }
  
  const message = mapQuestionEvent(event, defaultTarget)
  
  // Options 行应该被移除
  expect(message.text).not.toContain("Options:")
  expect(message.text).toContain("(可自定义输入)")
})
```

- [x] **Step 2: 测试选项截断**

```typescript
it("选项超过 5 个时截断并显示计数", () => {
  const event = {
    properties: {
      projectName: "test",
      questions: [{
        header: "测试",
        question: "问题？",
        options: [
          { label: "A", description: "选项A" },
          { label: "B", description: "选项B" },
          { label: "C", description: "选项C" },
          { label: "D", description: "选项D" },
          { label: "E", description: "选项E" },
          { label: "F", description: "选项F" },
          { label: "G", description: "选项G" }
        ]
      }]
    }
  }
  
  const message = mapQuestionEvent(event, defaultTarget)
  
  expect(message.text).toContain("• A: 选项A")
  expect(message.text).toContain("• E: 选项E")
  expect(message.text).not.toContain("• F: 选项F")
  expect(message.text).toContain("还有 2 个选项")
})
```

- [x] **Step 3: 测试选项自动缩进**

```typescript
it("选项自动应用模板缩进", () => {
  const event = {
    properties: {
      projectName: "test",
      questions: [{
        header: "测试",
        question: "问题？",
        options: [
          { label: "A", description: "描述A" },
          { label: "B", description: "描述B" }
        ]
      }]
    }
  }
  
  const template = "项目: {projectName}\nOptions:\n   {options}"
  const message = mapQuestionEvent(event, defaultTarget, template)
  
  // 第二行选项应该有 3 个空格缩进
  expect(message.text).toContain("Options:\n   • A: 描述A\n   • B: 描述B")
})
```

- [x] **Step 4: 测试后缀变量定位**

```typescript
it("后缀变量可在模板任意位置", () => {
  const event = {
    properties: {
      projectName: "test",
      questions: [{
        header: "测试",
        question: "问题？",
        options: [{ label: "A", description: "选项A" }],
        multiple: true,
        custom: true
      }]
    }
  }
  
  const template = "项目: {projectName}\n备注: {suffix}\n问题: {question}\nOptions:\n{options}"
  const message = mapQuestionEvent(event, defaultTarget, template)
  
  const lines = message.text.split('\n')
  const suffixLine = lines.findIndex(l => l.includes("备注:"))
  const questionLine = lines.findIndex(l => l.includes("问题:"))
  
  // 后缀应该在问题之前
  expect(suffixLine).toBeLessThan(questionLine)
  expect(message.text).toContain("(可多选) (可自定义输入)")
})
```

- [x] **Step 5: 运行测试验证**

运行: `bun test tests/question-mapper.test.ts`
预期: 测试通过

- [x] **Step 6: 提交边界场景测试**

```bash
git add tests/question-mapper.test.ts
git commit -m "test: 添加边界场景测试"
```

---

## Task 13: 验证现有测试通过

**Files:**
- 无修改

**Interfaces:**
- Consumes: 无
- Produces: 无

- [x] **Step 1: 运行全部测试**

运行: `bun test`
预期: 所有测试通过（包括现有测试）

- [x] **Step 2: 运行编译检查**

运行: `npm run build`
预期: 编译通过，无类型错误

---

## Task 14: 更新配置示例

**Files:**
- Modify: `opencode-lark-bridge.config.example.jsonc`

**Interfaces:**
- Consumes: 无
- Produces: 无

- [x] **Step 1: 添加新字段示例**

在 `opencode-lark-bridge.config.example.jsonc` 的 `categories.question` 配置中添加：

```jsonc
"categories": {
  "question": {
    "target": { "user_id": "your_user_id" },
    // 单问题模板
    "template": "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n{question}\nOptions:\n{options}\n{suffix}",
    // 多问题整体框架模板（可选）
    "template_multiple": "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n\n{questions}",
    // 多问题中每个问题项的模板（可选）
    "question_item_template": "{number}. {header}\n   {question}\n   Options:\n   {options}\n   {suffix}"
  },
  // ...
}
```

- [x] **Step 2: 提交配置示例更新**

```bash
git add opencode-lark-bridge.config.example.jsonc
git commit -m "docs: 添加多问题模板配置示例"
```

---

## Task 15: 更新文档

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: 无

- [x] **Step 1: 更新 README.md 模板配置说明**

在 README.md 的模板配置章节添加：

```markdown
### Question 事件模板

支持三种模板配置：

1. **template**: 单问题模板（单个问题时使用）
2. **template_multiple**: 多问题整体框架模板（多个问题时使用）
3. **question_item_template**: 多问题中每个问题项的模板

**模板变量：**

| 变量 | 单问题模板 | 多问题模板 | 问题项模板 | 说明 |
|------|-----------|-----------|-----------|------|
| `{projectName}` | ✓ | ✓ | - | 项目名 |
| `{header}` | ✓ | ✓ | ✓ | 标题 |
| `{question}` | ✓ | - | ✓ | 问题文本 |
| `{questions}` | - | ✓ | - | 所有问题项拼接 |
| `{options}` | ✓ | - | ✓ | 选项列表（自动缩进） |
| `{suffix}` | ✓ | - | ✓ | 选择方式说明 |
| `{number}` | - | - | ✓ | 问题序号 |

**配置示例：**

```jsonc
"categories": {
  "question": {
    "template": "项目: {projectName}\n问题: {question}\n选项:\n{options}\n{suffix}",
    "template_multiple": "项目: {projectName}\n共 {header} 个问题\n\n{questions}",
    "question_item_template": "{number}. {header}\n   {question}\n   选项:\n   {options}"
  }
}
```
```

- [x] **Step 2: 提交文档更新**

```bash
git add README.md
git commit -m "docs: 更新 README 模板配置说明"
```

---

## Task 16: 集成测试

**Files:**
- 无修改

**Interfaces:**
- Consumes: 完整实现
- Produces: 无

- [x] **Step 1: 创建测试配置文件**

在项目根目录创建临时测试配置：

```bash
cat > test-config.jsonc << 'EOF'
{
  "app_id": "test_app_id",
  "app_secret": "test_app_secret",
  "default_target": { "user_id": "test_user" },
  "debounce_ms": 0,
  "log_file": "/tmp/test.log",
  "categories": {
    "question": {
      "template": "项目: {projectName}\n问题: {question}\n选项:\n{options}\n{suffix}",
      "template_multiple": "项目: {projectName}\n共 {header} 个问题\n\n{questions}",
      "question_item_template": "{number}. [{header}]\n   {question}\n   选项:\n   {options}\n   {suffix}"
    }
  }
}
EOF
```

- [x] **Step 2: 手动测试单问题场景**

构造单问题事件，验证模板替换正确：

```bash
# 使用 node 或 bun 运行测试脚本
bun -e "
import { mapQuestionEvent } from './dist/events/question-mapper.js';

const event = {
  properties: {
    projectName: 'test-project',
    questions: [{
      header: '测试问题',
      question: '这是一个问题？',
      options: [
        { label: 'A', description: '选项A' },
        { label: 'B', description: '选项B' }
      ],
      multiple: true
    }]
  }
};

const message = mapQuestionEvent(event, {}, undefined, undefined, undefined);
console.log(message.text);
"
```

预期输出包含:
- "项目: test-project"
- "问题: 这是一个问题？"
- "选项:\n• A: 选项A\n• B: 选项B"
- "(可多选)"

- [x] **Step 3: 手动测试多问题场景**

构造多问题事件，验证模板替换正确：

```bash
bun -e "
import { mapQuestionEvent } from './dist/events/question-mapper.js';

const event = {
  properties: {
    projectName: 'test-project',
    questions: [
      {
        header: '问题1',
        question: '第一个问题？',
        options: [{ label: 'A', description: '选项A' }],
        multiple: true
      },
      {
        header: '问题2',
        question: '第二个问题？',
        options: [],
        custom: true
      }
    ]
  }
};

const customMultiple = '项目: {projectName}\n共 {header} 个问题\n\n{questions}';
const customItem = '{number}. [{header}]\n   {question}\n   选项:\n   {options}\n   {suffix}';

const message = mapQuestionEvent(event, {}, undefined, customMultiple, customItem);
console.log(message.text);
"
```

预期输出包含:
- "项目: test-project"
- "1. [问题1]"
- "(可多选)"
- "2. [问题2]"
- "(可自定义输入)"

- [x] **Step 4: 清理测试配置**

```bash
rm -f test-config.jsonc
```

- [x] **Step 5: 最终验证**

运行: `bun test && npm run build`
预期: 全部通过

---

## 验收清单

- [x] 所有 16 个任务完成
- [x] 所有单元测试通过
- [x] 编译通过无类型错误
- [x] 配置示例已更新
- [x] README 文档已更新
- [x] 手动测试验证模板替换正确
- [x] 向后兼容：现有测试继续通过

---

## 执行选择

**Plan complete and saved to `docs/superpowers/plans/2026-07-27-multi-question-template.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
