import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode 重试中\nProject: {projectName}\nSession: {sessionTitle}\n原因: {message}\n尝试: {attempt} 次\n下次重试: {next}"

const NEXT_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

function formatNext(ts: number): string {
  try {
    // zh-CN 输出 "06/15 23:06"，归一为设计要求的 MM-DD HH:mm
    return NEXT_FORMATTER.format(new Date(ts)).replaceAll("/", "-")
  } catch {
    return ""
  }
}

export function mapRetryEvent(
  event: any,
  target: NotificationTarget,
  template?: string,
  detail?: boolean
): NotificationMessage {
  const props = (event?.properties ?? event) ?? {}
  const status = (props.status as Record<string, unknown> | undefined) ?? {}
  const sessionID = (typeof props.sessionID === "string" ? props.sessionID : undefined) ?? "unknown"
  const projectName = typeof props.projectName === "string" && props.projectName.trim() ? props.projectName : "unknown"
  const sessionTitle = typeof props.sessionTitle === "string" && props.sessionTitle.trim() ? props.sessionTitle : "unknown"
  const message = typeof status.message === "string" ? status.message : "unknown"
  const showDetail = detail !== false
  const attempt = showDetail && typeof status.attempt === "number" ? String(status.attempt) : ""
  const next = showDetail && typeof status.next === "number" ? formatNext(status.next) : ""

  let effective = template ?? DEFAULT_TEMPLATE
  if (!showDetail && !template) {
    effective = effective
      .split("\n")
      .filter((line) => !line.includes("{attempt}") && !line.includes("{next}"))
      .join("\n")
  }

  const text = effective
    .replace(/{projectName}/g, projectName)
    .replace(/{sessionTitle}/g, sessionTitle)
    .replace(/{sessionID}/g, sessionID)
    .replace(/{message}/g, message)
    .replace(/{attempt}/g, attempt)
    .replace(/{next}/g, next)

  return { text, target }
}
