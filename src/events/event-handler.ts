import type { PluginConfig, Notifier, Logger } from "../types"
import { mapPermissionEvent, extractResource } from "./permission-mapper.js"
import { mapCompletionEvent } from "./completion-mapper.js"
import { mapQuestionEvent } from "./question-mapper.js"
import { getEffectiveTarget } from "../config.js"

export function createEventHandler(config: PluginConfig, notifier: Notifier, logger: Logger) {
  const lastSent = new Map<string, number>()
  const subagentSessionIds = new Set<string>()
  const subagentParentMap = new Map<string, string>()
  const pendingChildren = new Map<string, Set<string>>()

  function extractSessionID(props: Record<string, unknown>): string | undefined {
    return (typeof props.sessionID === "string" ? props.sessionID : undefined)
      ?? (typeof props.id === "string" ? props.id : undefined)
      ?? (typeof (props.data as Record<string, unknown>)?.sessionID === "string" ? (props.data as Record<string, unknown>).sessionID as string : undefined)
  }

  function extractToolNameFromProps(props: Record<string, unknown>): string {
    const t = props?.tool
    return extractToolName(t)
  }

  function extractToolName(tool: unknown): string {
    if (typeof tool === "string") {
      // 处理 OpenCode 新格式: "functions.bash:14" → "bash"
      const funcMatch = tool.match(/^functions\.([^.:]+)(?::\d+)?$/)
      if (funcMatch) return funcMatch[1]
      return tool
    }
    if (tool && typeof tool === "object") {
      const record = tool as Record<string, unknown>
      if (typeof record.callID === "string") {
        const prefix = record.callID.split("_")[0]
        if (prefix) {
          const funcMatch = prefix.match(/^functions\.([^.:]+)(?::\d+)?$/)
          if (funcMatch) return funcMatch[1]
          return prefix
        }
      }
      const candidate = record.name ?? record.tool ?? record.id ?? record.type
      if (typeof candidate === "string") {
        const funcMatch = candidate.match(/^functions\.([^.:]+)(?::\d+)?$/)
        if (funcMatch) return funcMatch[1]
        return candidate
      }
    }
    return "unknown"
  }

  function dedupeKey(event: any): string {
    const props = (event?.properties ?? event) as Record<string, unknown>
    const tool = extractToolNameFromProps(props)
    const resource = extractResource(props)
    return `${tool}:${resource}`
  }

  function trackSubagent(event: any) {
    const info = event?.properties?.info ?? event?.info
    const parentID = info?.parentID ?? event?.properties?.parentID
    const id = info?.id ?? event?.properties?.id ?? event?.properties?.sessionID
    if (parentID && id) {
      subagentSessionIds.add(id as string)
      subagentParentMap.set(id as string, parentID as string)
      if (!pendingChildren.has(parentID as string)) {
        pendingChildren.set(parentID as string, new Set())
      }
      pendingChildren.get(parentID as string)!.add(id as string)
      logger.debug("Tracked subagent session", { id, parentID })
    }
  }

  function isSubagent(event: any): boolean {
    const props = (event?.properties ?? event) as Record<string, unknown>
    const sessionID = extractSessionID(props)
    return typeof sessionID === "string" && subagentSessionIds.has(sessionID)
  }

  return {
    async handle(event: any) {
      const eventType = event?.type ?? event?.name

      if (eventType === "session.created") {
        trackSubagent(event)
        return
      }

      if (eventType === "session.idle") {
        logger.debug("Received session.idle event", { eventType, event })
        const props = (event?.properties ?? event) as Record<string, unknown>
        const sessionID = extractSessionID(props) ?? "unknown"

        if (isSubagent(event)) {
          const parentID = subagentParentMap.get(sessionID)
          if (parentID) {
            pendingChildren.get(parentID)?.delete(sessionID)
            logger.debug("Removed subagent session from pendingChildren", { parentID, sessionID })
          }
          logger.debug("Skipping subagent session.idle", { event })
          return
        }

        const pending = pendingChildren.get(sessionID)
        if (pending && pending.size > 0) {
          logger.debug("Skipping completion notification, children still pending", { sessionID, pending: Array.from(pending) })
          return
        }
        const now = Date.now()
        const last = lastSent.get(sessionID)
        if (last && now - last < config.debounce_ms) {
          logger.debug("Skipping duplicate completion notification", { sessionID })
          return
        }
        lastSent.set(sessionID, now)

        const category = "completion"
        const target = getEffectiveTarget(config, category)
        const categoryConfig = config.categories[category] || {}
        const message = mapCompletionEvent(event, target, categoryConfig.template)
        logger.info("Sending completion notification", { target, text: message.text })
        await notifier.send(message)
        return
      }

      if (eventType === "question.asked") {
        logger.debug("Received question.asked event", { eventType, event })
        const props = (event?.properties ?? event) as Record<string, unknown>
        const questionId = typeof props.id === "string" ? props.id : "unknown"

        const key = `question:${questionId}`
        const now = Date.now()
        const last = lastSent.get(key)
        if (last && now - last < config.debounce_ms) {
          logger.debug("Skipping duplicate question notification", { key })
          return
        }
        lastSent.set(key, now)

        const category = "question"
        const target = getEffectiveTarget(config, category)
        const categoryConfig = config.categories[category] || {}
        const message = mapQuestionEvent(event, target, categoryConfig.template)
        logger.info("Sending question notification", { target, text: message.text })
        await notifier.send(message)
        return
      }

      if (eventType !== "permission.asked") {
        return
      }

      logger.debug("Received permission.asked event", { eventType, event })

      const key = dedupeKey(event)
      const now = Date.now()
      const last = lastSent.get(key)
      if (last && now - last < config.debounce_ms) {
        logger.debug("Skipping duplicate notification", { key })
        return
      }
      lastSent.set(key, now)

      const category = "permission"
      const target = getEffectiveTarget(config, category)
      const categoryConfig = config.categories[category] || {}
      const message = mapPermissionEvent(event, target, categoryConfig.template)
      logger.info("Sending notification", { target, text: message.text })
      await notifier.send(message)
    }
  }
}
