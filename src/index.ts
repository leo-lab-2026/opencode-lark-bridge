import path from "node:path"
import { existsSync } from "node:fs"
import os from "node:os"
import { loadConfig, getEffectiveTarget } from "./config.js"
import { createFileLogger } from "./logger.js"
import { createLarkNotifier } from "./notifier/lark-notifier.js"
import { createEventHandler } from "./events/event-handler.js"
import { mapPermissionEvent } from "./events/permission-mapper.js"
import type { Logger } from "./types.js"

const CONFIG_FILE = "opencode-lark-bridge.config.jsonc"
const GLOBAL_OPENCODE_DIR = path.join(os.homedir(), ".config", "opencode")

export function resolveConfigPath(
  ctx: { directory: string },
  globalOpencodeDir: string = GLOBAL_OPENCODE_DIR
): string | null {
  const projectConfig = path.join(ctx.directory, ".opencode", CONFIG_FILE)
  if (existsSync(projectConfig)) {
    return path.resolve(projectConfig)
  }

  const resolvedCtx = path.resolve(ctx.directory)
  const resolvedGlobal = path.resolve(globalOpencodeDir)
  if (resolvedCtx !== resolvedGlobal) {
    const globalConfig = path.join(globalOpencodeDir, CONFIG_FILE)
    if (existsSync(globalConfig)) {
      return path.resolve(globalConfig)
    }
  }

  return null
}

export const OpenCodeLarkBridge = async (ctx: any) => {
  // 紧急调试：记录 ctx 内容到固定路径，以便排查配置路径问题
  const debugLog = "/tmp/opencode-lark-bridge-debug.log"
  const fs = await import("node:fs")
  try {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] ctx.directory=${ctx?.directory}, ctx.worktree=${ctx?.worktree}, project.name=${ctx?.project?.name}\n`)
  } catch {}

  const configPath = resolveConfigPath(ctx)
  try {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] configPath=${configPath}\n`)
  } catch {}

  if (!configPath) {
    try {
      fs.appendFileSync(debugLog, `[${new Date().toISOString()}] configPath is null, returning empty hooks\n`)
    } catch {}
    return { event: async () => {} }
  }

  let config
  let logger: Logger
  try {
    config = loadConfig(configPath)
    logger = createFileLogger(path.resolve(path.dirname(configPath), config.log_file))
    logger.info("Plugin initialized", { configPath, ctxDirectory: ctx?.directory, ctxWorktree: ctx?.worktree })
  } catch (err) {
    try {
      fs.appendFileSync(debugLog, `[${new Date().toISOString()}] init error: ${(err as Error).message}\n`)
    } catch {}
    return { event: async () => {} }
  }

  const notifier = createLarkNotifier(logger, async (command: string) => {
    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    return { exitCode, stdout, stderr }
  })

  const handler = createEventHandler(config, notifier, logger)

  function resolveProjectName(ctx: any): string {
    const explicitName = ctx?.project?.name
    if (typeof explicitName === "string" && explicitName.trim()) {
      return explicitName.trim()
    }
    const dir = ctx?.worktree ?? ctx?.directory
    if (typeof dir === "string" && dir.trim()) {
      return path.basename(dir.trim())
    }
    return "unknown"
  }

  const projectName = resolveProjectName(ctx)
  const sessionTitles = new Map<string, string>()

  function cacheSessionTitle(event: any) {
    const info = event?.properties?.info ?? event?.info
    const id = info?.id ?? event?.properties?.sessionID
    const title = info?.title ?? info?.sessionTitle
    if (typeof id === "string" && typeof title === "string" && title) {
      sessionTitles.set(id, title)
      logger.debug("Cached session title", { id, title })
    }
  }

  function resolveSessionTitle(sessionID: string, input?: any): string {
    const cached = sessionTitles.get(sessionID)
    if (cached) return cached
    const session = input?.session ?? {}
    return (
      session.title ??
      session.sessionTitle ??
      input?.sessionTitle ??
      sessionID
    )
  }

  function enhanceEvent(event: any): any {
    const type = event?.type ?? event?.name
    if (type === "session.created" || type === "session.updated") {
      cacheSessionTitle(event)
      return event
    }
    if (type === "question.asked") {
      const props = event?.properties ?? event ?? {}
      return {
        ...event,
        properties: {
          ...props,
          projectName: props?.projectName ?? projectName,
        },
      }
    }
    if (type !== "session.idle") return event

    const props = event?.properties ?? event ?? {}
    const sessionID = props?.sessionID ?? props?.id ?? "unknown"
    const sessionTitle = resolveSessionTitle(sessionID, event)

    return {
      ...event,
      properties: {
        ...props,
        sessionID,
        projectName: props?.projectName ?? projectName,
        sessionTitle,
      },
    }
  }

  logger.info("Plugin hooks registered", { hooks: ["event", "permission.ask", "session.idle", "question.asked"] })

  return {
    event: async ({ event }: { event: any }) => {
      await handler.handle(enhanceEvent(event))
    },
    "permission.ask": async (input: any, _output: any) => {
      try {
        logger.debug("Received permission.ask", { raw: JSON.stringify(input) })
      } catch {}
      const category = "permission"
      const target = getEffectiveTarget(config, category)
      const categoryConfig = config.categories[category] || {}
      const message = mapPermissionEvent(input, target, categoryConfig.template)
      logger.info("Sending permission notification", { target, text: message.text })
      await notifier.send(message)
    },
    "session.idle": async (input: any, _output: any) => {
      try {
        logger.debug("Received session.idle", { raw: JSON.stringify(input) })
      } catch {}
      const session = input?.session ?? {}
      const sessionID = session.id ?? input?.sessionID ?? "unknown"
      await handler.handle(
        enhanceEvent({
          type: "session.idle",
          properties: {
            sessionID,
            projectName: input?.projectName ?? projectName,
            sessionTitle: resolveSessionTitle(sessionID, input),
          },
        })
      )
    },
  }
}
