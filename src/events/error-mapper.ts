import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "⚠️ OpenCode Error\nProject: {projectName}\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}"

export function mapErrorEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const props = (event?.properties ?? event) as Record<string, unknown>
  const sessionID = (typeof props.sessionID === "string" ? props.sessionID : undefined)
    ?? (typeof props.id === "string" ? props.id : undefined)
    ?? "unknown"
  const error = props.error as Record<string, unknown> | undefined
  const errorType = typeof error?.type === "string" ? error.type : "unknown"
  const errorMessage = typeof error?.message === "string" ? error.message : "unknown"
  const projectName = typeof props.projectName === "string" ? props.projectName : "unknown"

  const text = (template ?? DEFAULT_TEMPLATE)
    .replace(/{sessionID}/g, sessionID)
    .replace(/{errorType}/g, errorType)
    .replace(/{errorMessage}/g, errorMessage)
    .replace(/{projectName}/g, projectName)

  return { text, target }
}