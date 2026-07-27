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

function formatOptions(questions: QuestionInfo[]): string {
  if (questions.length === 0) return ""

  if (questions.length === 1) {
    return formatSingleQuestionOptions(questions[0])
  }

  // 多问题模式：选项已内联到 questionText 中，这里返回空
  return ""
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

  // 多问题模式：每个问题文本后追加选项
  return questions.map((q, i) => {
    const text = truncate(q.question, MAX_QUESTION_LEN)
    const prefix = `${i + 1}. ${q.header}\n   ${text}`
    const opts = formatSingleQuestionOptions(q)
    if (opts) {
      return `${prefix}\n   Options: ${opts}`
    }
    // 无选项但有 custom，显示 (可自定义输入)
    if (q.custom) {
      return `${prefix}\n   Options: (可自定义输入)`
    }
    return prefix
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

  let effectiveTemplate = template || DEFAULT_TEMPLATE

  // 当 options 为空时，在变量替换前移除模板中的 Options 行
  // 支持格式: "Options: {options}" 或 "Options:\n {options}" 或 "Options:\n{options}"
  if (!optionsText) {
    effectiveTemplate = effectiveTemplate
      .replace(/\nOptions:[ \t]*\n?[ \t]*\{options\}/g, "")
      .replace(/Options:[ \t]*\n?[ \t]*\{options\}\n?/g, "")
  }

  const text = effectiveTemplate
    .replace(/{projectName}/g, projectName)
    .replace(/{header}/g, header)
    .replace(/{question}/g, questionText)
    .replace(/{options}/g, optionsText)
    .trimEnd()

  return { text, target }
}