import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode 会话停滞\nProject: {projectName}\nSession: {sessionTitle}\n无进展时长: {idleDuration}"

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours >= 1) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  }
  if (minutes >= 1) {
    return seconds > 0 ? `${minutes} 分钟 ${seconds} 秒` : `${minutes} 分钟`
  }
  return `${seconds} 秒`
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function mapStallEvent(
  meta: { projectName?: string; sessionTitle?: string; idleDuration: string },
  target: NotificationTarget,
  template?: string
): NotificationMessage {
  const projectName = nonEmpty(meta.projectName) ?? "unknown"
  const sessionTitle = nonEmpty(meta.sessionTitle) ?? "unknown"
  const idleDuration = nonEmpty(meta.idleDuration) ?? "unknown"
  const text = (template ?? DEFAULT_TEMPLATE)
    .replace(/{projectName}/g, projectName)
    .replace(/{sessionTitle}/g, sessionTitle)
    .replace(/{idleDuration}/g, idleDuration)
  return { text, target }
}
