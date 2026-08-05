import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "🔔 OpenCode Permission Request\nProject: {projectName}\nTool: {tool}\nOperation: {operation}\nTarget: {resource}"

function extractToolName(tool: unknown): string {
  if (typeof tool === "string") {
    // 处理 OpenCode 新格式: "functions.bash:14" → "bash"
    const funcMatch = tool.match(/^functions\.([^.:]+)(?::\d+)?$/)
    if (funcMatch) return funcMatch[1]
    return tool
  }
  if (tool && typeof tool === "object") {
    const t = tool as Record<string, unknown>
    if (typeof t.callID === "string") {
      const prefix = t.callID.split("_")[0]
      if (prefix) {
        const funcMatch = prefix.match(/^functions\.([^.:]+)(?::\d+)?$/)
        if (funcMatch) return funcMatch[1]
        return prefix
      }
    }
    const candidate = t.name ?? t.tool ?? t.id ?? t.type
    if (typeof candidate === "string") {
      const funcMatch = candidate.match(/^functions\.([^.:]+)(?::\d+)?$/)
      if (funcMatch) return funcMatch[1]
      return candidate
    }
  }
  return "unknown"
}

function extractCommandParts(props: Record<string, unknown>): { command: string; args: string } | null {
  const metadata = props.metadata as Record<string, unknown> | undefined
  const args = (props.args ?? {}) as Record<string, unknown>
  const rawCommand = typeof metadata?.command === "string"
    ? metadata.command
    : (typeof args.command === "string"
        ? args.command
        : (Array.isArray(props.patterns) && typeof props.patterns[0] === "string"
            ? props.patterns[0]
            : null))
  if (!rawCommand) return null

  const match = rawCommand.match(/^\s*(\S+)(?:\s+(.*))?$/)
  if (!match) return null
  return { command: match[1], args: match[2] ?? "" }
}

export function extractResource(props: Record<string, unknown>): string {
  const tool = extractToolName(props?.tool)
  const metadata = props.metadata as Record<string, unknown> | undefined
  const args = (props.args ?? {}) as Record<string, unknown>

  if (tool === "webfetch") {
    if (typeof args.url === "string") return args.url
    if (typeof args.uri === "string") return args.uri
  }
  if (tool === "websearch") {
    if (typeof args.query === "string") return args.query
  }
  if (tool === "task") {
    if (typeof args.type === "string") return args.type
    if (typeof args.agent === "string") return args.agent
  }
  if (tool === "skill") {
    if (typeof args.name === "string") return args.name
    if (typeof args.skill === "string") return args.skill
  }
  if (tool === "external_directory") {
    if (typeof args.path === "string") return args.path
    if (typeof args.directory === "string") return args.directory
  }
  if (tool === "doom_loop") {
    const innerTool = args.tool
    const input = args.input
    if (typeof innerTool === "string" && typeof input === "string") {
      return `${innerTool}: ${input}`
    }
    if (typeof innerTool === "string") return innerTool
    if (typeof input === "string") return input
  }

  if (typeof metadata?.filepath === "string") {
    return metadata.filepath
  }
  if (typeof args.filePath === "string") {
    return args.filePath
  }
  const commandParts = extractCommandParts(props)
  if (commandParts) {
    return commandParts.args || commandParts.command
  }
  if (Array.isArray(props.patterns) && props.patterns.length > 0) {
    return props.patterns.join(", ")
  }
  return "unknown"
}

export function mapPermissionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const props = (event?.properties ?? event) as Record<string, unknown>
  // 兼容 Permission 对象格式（OpenCode 直接传入 Permission 时无 tool 字段，有 type/pattern）
  const rawTool = props?.tool ?? props?.type ?? event?.type
  const tool = extractToolName(rawTool)
  const permission = typeof props.permission === "string" ? props.permission : ""
  const commandParts = tool === "bash" || permission === "bash" ? extractCommandParts(props) : null
  const projectName = typeof props.projectName === "string" && props.projectName.trim() ? props.projectName.trim() : "unknown"

  const operation = commandParts?.command ?? permission ?? tool
  // 优先从 pattern 提取 resource，兼容 Permission 对象
  const rawPattern = props?.pattern ?? event?.pattern
  const patternResource = Array.isArray(rawPattern) ? rawPattern.join(", ") : typeof rawPattern === "string" ? rawPattern : undefined
  const resource = commandParts?.args ?? patternResource ?? extractResource(props)

  const text = (template || DEFAULT_TEMPLATE)
    .replace(/{tool}/g, tool)
    .replace(/{operation}/g, operation)
    .replace(/{resource}/g, resource)
    .replace(/{projectName}/g, projectName)
  return { text, target }
}
