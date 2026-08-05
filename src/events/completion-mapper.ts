import type { NotificationMessage, NotificationTarget } from "../types"

const DEFAULT_TEMPLATE = "✅ Task Completed\nProject: {projectName}\nSession: {sessionTitle}"

export function mapCompletionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage {
  const props = event?.properties ?? event ?? {}
  const projectName = typeof props.projectName === "string" && props.projectName.trim() ? props.projectName : "unknown"
  const sessionTitle = typeof props.sessionTitle === "string" && props.sessionTitle.trim() ? props.sessionTitle : "unknown"

  const text = (template || DEFAULT_TEMPLATE)
    .replace(/{projectName}/g, projectName)
    .replace(/{sessionTitle}/g, sessionTitle)

  return { text, target }
}
