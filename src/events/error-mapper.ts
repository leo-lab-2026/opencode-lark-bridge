import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}"

export function mapErrorEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const props = (event?.properties ?? event) as Record<string, unknown>
  const sessionID = (typeof props.sessionID === "string" ? props.sessionID : undefined)
    ?? (typeof props.id === "string" ? props.id : undefined)
    ?? "unknown"
  const error = props.error as Record<string, unknown> | undefined
  const errorData = (error?.data as Record<string, unknown> | undefined) ?? {}
  const rawType = typeof error?.type === "string" ? error.type
    : typeof error?.name === "string" ? error.name
    : "unknown"
  const errorMessage = typeof error?.message === "string" ? error.message
    : typeof errorData?.message === "string" ? errorData.message
    : "unknown"
  const statusCode = typeof errorData?.statusCode === "number" ? errorData.statusCode : undefined
  const errorType = statusCode !== undefined ? `${rawType} (${statusCode})` : rawType
  const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"

  const text = (template ?? DEFAULT_TEMPLATE)
    .replace(/{sessionID}/g, sessionID)
    .replace(/{errorType}/g, errorType)
    .replace(/{errorMessage}/g, errorMessage)
    .replace(/{projectName}/g, projectName)
    .replace(/{statusCode}/g, statusCode !== undefined ? String(statusCode) : "")

  return { text, target }
}
