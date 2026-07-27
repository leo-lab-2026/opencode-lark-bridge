---
comet_change: multi-question-template-support
role: technical-design
canonical_spec: openspec
---

# 多问题通知模板配置技术设计

## 概述

为 opencode-lark-bridge 插件的 question 事件新增多问题模板配置能力，支持用户自定义多问题通知的整体框架和每个问题项的格式，并改进默认模板以提供清晰层次的通知格式。

## 问题背景

当前 question 事件模板系统仅支持单一 `template` 字段，适用于单问题场景。对于多问题（Multiple Questions）场景，代码中硬编码了格式逻辑，存在以下问题：

1. **Options 对齐问题**：`Options: • 选项1` 格式导致选项不对齐，影响可读性
2. **缺少多问题模板配置**：无法自定义整体框架和问题项格式
3. **选项缩进不可控**：无法通过模板控制选项列表的缩进位置
4. **后缀位置固定**：选择方式说明（如"可多选"）的位置不可自定义

## 技术方案

### 1. 配置字段扩展

扩展 `CategoryConfig` 接口，新增两个可选字段：

```typescript
// src/types.ts
export interface CategoryConfig {
  target?: NotificationTarget
  template?: string                    // 现有：单问题模板
  template_multiple?: string           // 新增：多问题整体框架模板
  question_item_template?: string      // 新增：多问题中每个问题项的模板
}
```

**设计理由**：
- 独立字段 vs 嵌套对象：独立字段更简洁，避免配置嵌套过深
- 可选字段：所有字段都是可选的，保持向后兼容
- 命名清晰：`template_multiple` 表达"多问题模板"，`question_item_template` 表达"问题项模板"

**配置优先级原则**：
- 所有 category 的所有模板字段都遵循"配置 > 默认"优先级
- 未配置时使用默认硬编码值
- 只配置部分字段时，未配置字段使用默认值

### 2. 默认模板定义

定义三个默认模板常量：

```typescript
// src/events/question-mapper.ts

// 单问题默认模板：Options 单独一行
const DEFAULT_TEMPLATE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n{question}\nOptions:\n{options}\n{suffix}"

// 多问题整体框架默认模板
const DEFAULT_TEMPLATE_MULTIPLE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n\n{questions}"

// 问题项默认模板：层次清晰
const DEFAULT_QUESTION_ITEM_TEMPLATE = "{number}. {header}\n   {question}\n   Options:\n   {options}\n   {suffix}"
```

**关键改进**：
- Options 单独一行：解决当前 `Options: • 选项1` 不对齐问题
- 统一 `{suffix}` 变量：单问题和多问题都支持后缀变量
- 清晰层次：问题项模板使用编号、缩进、段落分隔

**模板变量说明**：

| 变量 | 单问题模板 | 多问题模板 | 问题项模板 | 说明 |
|------|-----------|-----------|-----------|------|
| `{projectName}` | ✓ | ✓ | - | 项目名 |
| `{header}` | ✓ | ✓ | ✓ | 标题 |
| `{question}` | ✓ | - | ✓ | 问题文本 |
| `{questions}` | - | ✓ | - | 所有问题项拼接 |
| `{options}` | ✓ | - | ✓ | 选项列表（自动缩进） |
| `{suffix}` | ✓ | - | ✓ | 选择方式说明 |
| `{number}` | - | - | ✓ | 问题序号 |

### 3. 核心功能实现

#### 3.1 选项自动缩进

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

**使用示例**：
```typescript
const template = "Options:\n   {options}"
const optionsText = "• 选项1: 描述\n• 选项2: 描述"
const result = applyIndent(template, 'options', optionsText)
// 结果: "• 选项1: 描述\n   • 选项2: 描述"
```

#### 3.2 单个问题项渲染

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

#### 3.3 后缀格式化

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

#### 3.4 mapQuestionEvent 重构

```typescript
export function mapQuestionEvent(
  event: any, 
  target: NotificationTarget, 
  template?: string,
  templateMultiple?: string,
  questionItemTemplate?: string
): NotificationMessage {
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

### 4. 调用链改造

```typescript
// src/events/event-handler.ts
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

**配置加载**：
- `src/config.ts` 使用 `comment-json` 解析 JSONC
- `CategoryConfig` 接口已扩展，新字段会自动加载
- 无需额外代码，解析器会处理

## 测试策略

### 核心测试场景

| 场景 | 测试内容 | 验证点 |
|------|---------|--------|
| 1 | 单问题 + 自定义模板 | 模板变量替换正确 |
| 2 | 多问题 + 自定义模板 | 整体框架 + 问题项模板生效 |
| 3 | 选项自动缩进 | 缩进正确应用到每行 |
| 4 | 空选项处理 | Options 行被移除，suffix 正确显示 |
| 5 | 选项截断 | 前 5 个显示，剩余计数正确 |
| 6 | 后缀变量定位 | 可放在模板任意位置 |
| 7 | 默认模板格式 | Options 单独一行，层次清晰 |
| 8 | 配置优先级 | 配置值 > 默认值 |

### 测试示例

```typescript
// 场景 3：选项自动缩进
it("选项自动应用模板缩进", () => {
  const event = {
    properties: {
      projectName: "test",
      questions: [{
        header: "测试",
        question: "问题",
        options: [
          { label: "A", description: "描述A" },
          { label: "B", description: "描述B" }
        ]
      }]
    }
  }
  
  const template = "Options:\n   {options}"
  const message = mapQuestionEvent(event, defaultTarget, template)
  
  // 第二行选项应该有 3 个空格缩进
  expect(message.text).toBe("Options:\n   • A: 描述A\n   • B: 描述B")
})

// 场景 2：多问题 + 自定义模板
it("多问题使用自定义模板", () => {
  const event = {
    properties: {
      projectName: "my-project",
      questions: [
        {
          header: "问题1",
          question: "第一个问题",
          options: [{ label: "A", description: "选项A" }],
          multiple: true
        },
        {
          header: "问题2", 
          question: "第二个问题",
          options: [],
          custom: true
        }
      ]
    }
  }
  
  const templateMultiple = "项目: {projectName}\n共 {header} 个问题\n\n{questions}"
  const questionItemTemplate = "{number}. [{header}]\n   内容: {question}\n   选项:\n   {options}\n   {suffix}"
  
  const message = mapQuestionEvent(
    event, 
    defaultTarget, 
    undefined,
    templateMultiple,
    questionItemTemplate
  )
  
  expect(message.text).toContain("项目: my-project")
  expect(message.text).toContain("1. [问题1]")
  expect(message.text).toContain("(可多选)")
  expect(message.text).toContain("2. [问题2]")
  expect(message.text).toContain("(可自定义输入)")
})
```

## 风险与缓解

### 风险 1：模板变量拼错

**风险描述**：用户在配置中写错变量名（如 `{option}` 而非 `{options}`），导致变量不被替换

**缓解措施**：
- 在文档中提供清晰的变量列表和示例
- 可考虑在日志中警告未替换的 `{...}` 模式（可选优化）

### 风险 2：空选项问题

**风险描述**：问题无选项但模板中有 `Options:\n{options}` 行，导致出现空行或孤立的 "Options:"

**缓解措施**：
- 复用当前代码中的 Options 行移除逻辑（已实现）
- 多问题场景在问题项模板中同样处理

### 风险 3：配置文件格式错误

**风险描述**：JSONC 解析失败或字段类型错误

**缓解措施**：
- 使用 comment-json 解析器（已在 config.ts 中使用）
- 添加类型检查和错误提示

### 风险 4：上下文复杂度增加

**风险描述**：新增函数和逻辑增加了代码复杂度

**缓解措施**：
- 函数职责单一，每个函数只做一件事
- 充分的单元测试覆盖
- 清晰的函数命名和注释

## 实现影响

### 代码修改

| 文件 | 修改内容 | 行数估算 |
|------|---------|---------|
| `src/types.ts` | 扩展 `CategoryConfig` 接口 | +2 字段 |
| `src/events/question-mapper.ts` | 重构核心函数 | +5 函数，~50 行新增 |
| `src/events/event-handler.ts` | 传递新配置字段 | +2 行 |
| `tests/question-mapper.test.ts` | 新增测试场景 | +8 测试，~100 行 |

### 配置文件

- `opencode-lark-bridge.config.example.jsonc`：添加新字段示例
- `README.md`：更新文档说明

### 向后兼容性

- ✅ 现有配置继续工作（新字段可选）
- ✅ 现有代码继续工作（参数可选）
- ✅ 无破坏性变更

### 依赖影响

- 无新增外部依赖
- 使用现有依赖：`comment-json`（配置解析）、Bun test（测试框架）

## 实施计划

详见 `openspec/changes/multi-question-template-support/tasks.md`：

1. 类型定义扩展（1 个子任务）
2. 默认模板定义（3 个子任务）
3. 核心功能实现（4 个子任务）
4. 配置加载增强（1 个子任务）
5. 单元测试（8 个子任务）
6. 配置示例更新（1 个子任务）
7. 文档更新（2 个子任务）
8. 验证与集成测试（3 个子任务）

总计：22 个子任务

## 验收标准

1. ✅ 所有 8 个测试场景通过
2. ✅ 现有测试继续通过（向后兼容）
3. ✅ 单问题通知使用配置模板或默认模板
4. ✅ 多问题通知使用配置模板或默认模板
5. ✅ 选项自动缩进正确应用
6. ✅ 后缀变量可在模板中自由定位
7. ✅ 空选项正确处理
8. ✅ 选项截断正确显示
9. ✅ 配置优先级正确（配置 > 默认）
10. ✅ 编译通过（`npm run build`）
11. ✅ 端到端测试通过（飞书通知格式正确）
