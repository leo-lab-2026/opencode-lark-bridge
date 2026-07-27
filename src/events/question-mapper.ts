import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n{question}\nOptions:\n{options}\n{suffix}"
const DEFAULT_TEMPLATE_MULTIPLE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n\n{questions}"
const DEFAULT_QUESTION_ITEM_TEMPLATE = "{number}. {header}\n   {question}\n   Options:\n   {options}\n   {suffix}"
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

function formatSuffix(q: QuestionInfo): string {
  const suffix: string[] = []
  if (q.multiple) suffix.push("(可多选)")
  if (q.custom) suffix.push("(可自定义输入)")
  return suffix.join(" ")
}

function formatQuestionOptions(q: QuestionInfo): string {
  if (q.options.length === 0) return ""

  const visibleOptions = q.options.slice(0, MAX_OPTIONS)
  const optionsText = visibleOptions
    .map((o) => `• ${o.label}: ${o.description}`)
    .join("\n")

  let result = optionsText
  if (q.options.length > MAX_OPTIONS) {
    result += `\n... (${q.options.length - MAX_OPTIONS} more)`
  }
  return result
}

function formatQuestionItem(q: QuestionInfo, index: number, template?: string): string {
  const effectiveTemplate = template || DEFAULT_QUESTION_ITEM_TEMPLATE
  const questionText = truncate(q.question, MAX_QUESTION_LEN)
  const optionsText = formatQuestionOptions(q)
  const suffixText = formatSuffix(q)

  let processedTemplate = effectiveTemplate

  // 当 options 为空时，移除模板中的 Options 行
  if (!optionsText) {
    processedTemplate = processedTemplate
      .replace(/\n[ \t]*Options:[ \t]*\n?[ \t]*\{options\}/gi, "")
      .replace(/[ \t]*Options:[ \t]*\n?[ \t]*\{options\}\n?/gi, "")
  }

  const text = processedTemplate
    .replace(/{number}/g, String(index + 1))
    .replace(/{header}/g, q.header)
    .replace(/{question}/g, questionText)
    .replace(/{options}/g, optionsText)
    .replace(/{suffix}/g, suffixText)
    .trimEnd()

  return text
}

function formatQuestions(questions: QuestionInfo[], itemTemplate?: string): string {
  if (questions.length === 0) return ""
  if (questions.length === 1) {
    return truncate(questions[0].question, MAX_QUESTION_LEN)
  }
  return questions
    .map((q, i) => formatQuestionItem(q, i, itemTemplate))
    .join("\n")
}

function formatOptions(questions: QuestionInfo[]): string {
  if (questions.length === 0) return ""

  if (questions.length === 1) {
    const q = questions[0]
    const optionsText = formatQuestionOptions(q)
    const suffixText = formatSuffix(q)
    if (!optionsText && !suffixText) return ""
    let result = optionsText
    if (suffixText) {
      result += (optionsText ? " " : "") + suffixText
    }
    return result
  }

  // 多问题模式：选项已内联到 questionText 中，这里返回空
  return ""
}

function formatHeader(questions: QuestionInfo[]): string {
  if (questions.length === 0) return "No Questions"
  if (questions.length === 1) return questions[0].header
  return `Multiple Questions (${questions.length})`
}

function applyIndent(template: string, varName: string, content: string): string {
  const lines = template.split("\n")
  const regex = new RegExp(`^([ \\t]*)\\{${varName}\\}`)
  
  const match = lines.find(line => line.match(regex))?.match(regex)
  const indent = match?.[1] || ""
  
  if (!indent) {
    return content
  }
  
  const contentLines = content.split("\n")
  return contentLines
    .map((line, index) => index === 0 ? line : indent + line)
    .join("\n")
}

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

  // 三种场景分支
  if (questions.length === 0) {
    // 无问题：使用单问题模板，变量为空
    const effectiveTemplate = template || DEFAULT_TEMPLATE
    const text = effectiveTemplate
      .replace(/{projectName}/g, projectName)
      .replace(/{header}/g, header)
      .replace(/{question}/g, "")
      .replace(/{options}/g, "")
      .replace(/{suffix}/g, "")
      .replace(/\n[ \t]*Options:[ \t]*\n?/gi, "")
      .trimEnd()
    return { text, target }
  }

  if (questions.length === 1) {
    // 单问题：使用单问题模板
    const effectiveTemplate = template || DEFAULT_TEMPLATE
    const questionText = truncate(questions[0].question, MAX_QUESTION_LEN)
    const optionsText = formatQuestionOptions(questions[0])
    const suffixText = formatSuffix(questions[0])

    let processedTemplate = effectiveTemplate

    // 当 options 为空时，移除模板中的 Options 行
    // 注意：suffix 是单独的变量，不应该影响 Options 行的移除
    if (!optionsText) {
      processedTemplate = processedTemplate
        .replace(/\n[ \t]*Options:[ \t]*\n?[ \t]*\{options\}/gi, "")
        .replace(/[ \t]*Options:[ \t]*\n?[ \t]*\{options\}\n?/gi, "")
    }

    // 应用缩进到 options 内容
    const indentedOptions = optionsText ? applyIndent(processedTemplate, "options", optionsText) : ""

    const text = processedTemplate
      .replace(/{projectName}/g, projectName)
      .replace(/{header}/g, header)
      .replace(/{question}/g, questionText)
      .replace(/{options}/g, indentedOptions)
      .replace(/{suffix}/g, suffixText)
      .trimEnd()

    return { text, target }
  }

  // 多问题：使用多问题模板
  const effectiveTemplateMultiple = templateMultiple || DEFAULT_TEMPLATE_MULTIPLE
  const questionsText = formatQuestions(questions, questionItemTemplate)

  const text = effectiveTemplateMultiple
    .replace(/{projectName}/g, projectName)
    .replace(/{header}/g, header)
    .replace(/{questions}/g, questionsText)
    .trimEnd()

  return { text, target }
}
