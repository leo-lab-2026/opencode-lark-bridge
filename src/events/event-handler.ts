import type { PluginConfig, Notifier, Logger } from "../types"
import { mapPermissionEvent, extractResource } from "./permission-mapper.js"
import { mapCompletionEvent } from "./completion-mapper.js"
import { mapQuestionEvent } from "./question-mapper.js"
import { mapErrorEvent } from "./error-mapper.js"
import { mapRetryEvent } from "./retry-mapper.js"
import { mapStallEvent, formatDuration } from "./stall-mapper.js"
import { getEffectiveTarget } from "../config.js"

export function createEventHandler(config: PluginConfig, notifier: Notifier, logger: Logger) {
  const lastSent = new Map<string, number>()
  const subagentSessionIds = new Set<string>()
  const subagentParentMap = new Map<string, string>()
  const pendingChildren = new Map<string, Set<string>>()
  const erroredSessions = new Set<string>()
  const lastRetrySent = new Map<string, number>()
  const lastActive = new Map<string, number>()
  const stallLastSent = new Map<string, number>()
  const stallMeta = new Map<string, { projectName?: string; sessionTitle?: string }>()

  function extractSessionID(props: Record<string, unknown>): string | undefined {
    return (typeof props.sessionID === "string" ? props.sessionID : undefined)
      ?? (typeof props.id === "string" ? props.id : undefined)
      ?? (typeof (props.data as Record<string, unknown>)?.sessionID === "string" ? (props.data as Record<string, unknown>).sessionID as string : undefined)
  }

  function extractTrackedSessionID(props: Record<string, unknown>): string | undefined {
    const info = props.info as Record<string, unknown> | undefined
    return (typeof props.sessionID === "string" ? props.sessionID : undefined)
      ?? (typeof (props.data as Record<string, unknown>)?.sessionID === "string" ? (props.data as Record<string, unknown>).sessionID as string : undefined)
      ?? (typeof info?.id === "string" ? info.id : undefined)
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

  function clearStallTracking(sessionID: string) {
    lastActive.delete(sessionID)
    stallLastSent.delete(sessionID)
    stallMeta.delete(sessionID)
  }

  function touchActivity(sessionID: string, event: any) {
    const now = Date.now()
    lastActive.set(sessionID, now)

    const props = (event?.properties ?? event) as Record<string, unknown>
    const info = props.info as Record<string, unknown> | undefined
    const title = info?.title ?? info?.sessionTitle ?? props.sessionTitle
    const projectName = props.projectName
    if (
      (typeof title === "string" && title.trim())
      || (typeof projectName === "string" && projectName.trim())
    ) {
      const prev = stallMeta.get(sessionID) ?? {}
      stallMeta.set(sessionID, {
        projectName: typeof projectName === "string" && projectName.trim() ? projectName.trim() : prev.projectName,
        sessionTitle: typeof title === "string" && title.trim() ? title.trim() : prev.sessionTitle,
      })
    }

    let current = sessionID
    const visited = new Set<string>()
    while (current && !visited.has(current)) {
      visited.add(current)
      const parentID = subagentParentMap.get(current)
      if (!parentID) break
      if (!lastActive.has(parentID)) break
      lastActive.set(parentID, now)
      current = parentID
    }
  }

  function isSubagent(event: any): boolean {
    const props = (event?.properties ?? event) as Record<string, unknown>
    const sessionID = extractSessionID(props)
    return typeof sessionID === "string" && subagentSessionIds.has(sessionID)
  }

  async function scanStalledSessions() {
    const now = Date.now()
    const category = "stall"
    const categoryConfig = config.categories[category] || {}
    const timeout = categoryConfig.stall_timeout_ms ?? 600_000
    for (const [sessionID, lastActiveAt] of lastActive) {
      if (subagentSessionIds.has(sessionID)) continue
      if (now - lastActiveAt < timeout) {
        logger.debug("Skipping session, not stalled yet", { sessionID, idleMs: now - lastActiveAt })
        continue
      }
      const target = getEffectiveTarget(config, category)
      const meta = stallMeta.get(sessionID) ?? {}
      const idleDuration = formatDuration(now - lastActiveAt)
      const message = mapStallEvent({ ...meta, idleDuration }, target, categoryConfig.template)
      logger.info("Sending stall notification", { sessionID, text: message.text })
      await notifier.send(message)
    }
  }

  return {
    async handle(event: any) {
      const eventType = event?.type ?? event?.name

      const props = (event?.properties ?? event) as Record<string, unknown>
      const entrySessionID = extractTrackedSessionID(props) ?? "unknown"
      if (entrySessionID !== "unknown") {
        touchActivity(entrySessionID, event)
      }

      if (eventType === "session.created") {
        trackSubagent(event)
        const createdID = extractTrackedSessionID((event?.properties ?? event) as Record<string, unknown>)
        if (createdID && subagentParentMap.has(createdID)) {
          touchActivity(createdID, event)
        }
        return
      }

      if (eventType === "session.deleted") {
        const props = (event?.properties ?? event) as Record<string, unknown>
        const sessionID = extractSessionID(props) ?? "unknown"
        if (sessionID !== "unknown") {
          clearStallTracking(sessionID)
          logger.debug("Cleared stall tracking for deleted session", { sessionID })
        }
        return
      }

      if (eventType === "session.idle") {
        logger.debug("Received session.idle event", { eventType, event })
        const props = (event?.properties ?? event) as Record<string, unknown>
        const sessionID = extractSessionID(props) ?? "unknown"

        if (sessionID !== "unknown") {
          clearStallTracking(sessionID)
        }

        if (isSubagent(event)) {
          const parentID = subagentParentMap.get(sessionID)
          if (parentID) {
            pendingChildren.get(parentID)?.delete(sessionID)
            logger.debug("Removed subagent session from pendingChildren", { parentID, sessionID })
          }
          logger.debug("Skipping subagent session.idle", { event })
          return
        }

        if (erroredSessions.has(sessionID)) {
          logger.debug("Skipping completion notification, session errored", { sessionID })
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
        const message = mapQuestionEvent(
          event,
          target,
          categoryConfig.template,
          categoryConfig.template_multiple,
          categoryConfig.question_item_template
        )
        logger.info("Sending question notification", { target, text: message.text })
        await notifier.send(message)
        return
      }

      if (eventType === "session.error") {
        logger.debug("Received session.error event", { eventType, event })
        const props = (event?.properties ?? event) as Record<string, unknown>
        const sessionID = extractSessionID(props) ?? "unknown"

        if (sessionID !== "unknown") {
          clearStallTracking(sessionID)
        }

        if (isSubagent(event)) {
          const parentID = subagentParentMap.get(sessionID)
          if (parentID) {
            pendingChildren.get(parentID)?.delete(sessionID)
            logger.debug("Removed error session from pendingChildren", { parentID, sessionID })
          }
        }

        const key = `error:${sessionID}`
        const now = Date.now()
        const last = lastSent.get(key)
        if (last && now - last < config.debounce_ms) {
          logger.debug("Skipping duplicate error notification", { key })
          return
        }
        lastSent.set(key, now)

        const category = "error"
        const target = getEffectiveTarget(config, category)
        const categoryConfig = config.categories[category] || {}
        const message = mapErrorEvent(event, target, categoryConfig.template)
        logger.info("Sending error notification", { target, text: message.text })
        await notifier.send(message)
        erroredSessions.add(sessionID)
        return
      }

      if (eventType === "session.status") {
        const props = (event?.properties ?? event) as Record<string, unknown>
        const status = props.status
        if (!status || typeof status !== "object") {
          logger.debug("Skipping session.status without valid status object", { eventType })
          return
        }
        const statusRecord = status as Record<string, unknown>
        logger.debug("Received session.status event", { sessionID: props.sessionID, statusType: statusRecord.type })
        if (statusRecord.type !== "retry") {
          logger.debug("Skipping non-retry session.status", { statusType: statusRecord.type })
          return
        }
        const sessionID = extractSessionID(props) ?? "unknown"
        const category = "retry"
        const categoryConfig = config.categories[category] || {}

        if (isSubagent(event) && categoryConfig.notify_subagent !== true) {
          logger.debug("Skipping subagent retry notification", { sessionID })
          return
        }

        const attempt = typeof statusRecord.attempt === "number" ? statusRecord.attempt : 0
        const threshold = categoryConfig.retry_threshold ?? 1
        if (attempt < threshold) {
          logger.debug("Retry attempt below threshold", { sessionID, attempt, threshold })
          return
        }

        const key = `retry:${sessionID}`
        const now = Date.now()
        const interval = categoryConfig.retry_interval_ms ?? 900_000
        const last = lastRetrySent.get(key)
        if (last && now - last < interval) {
          logger.debug("Skipping retry notification within throttle window", { key })
          return
        }
        lastRetrySent.set(key, now)

        const target = getEffectiveTarget(config, category)
        const message = mapRetryEvent(event, target, categoryConfig.template, categoryConfig.retry_detail)
        logger.info("Sending retry notification", { target, text: message.text })
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
    },
    scanStalledSessions,
  }
}
