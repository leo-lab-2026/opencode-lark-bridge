import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { loadConfig } from "../src/config"
import { createFileLogger } from "../src/logger"
import { createLarkNotifier } from "../src/notifier/lark-notifier"
import { createEventHandler } from "../src/events/event-handler"

const TEST_DIR = "tests/fixtures/integration"

describe("end-to-end flow", () => {
  beforeEach(async () => await mkdir(TEST_DIR, { recursive: true }))
  afterEach(async () => await rm(TEST_DIR, { recursive: true, force: true }))

  it("configures handler and captures command", async () => {
    const configPath = `${TEST_DIR}/config.jsonc`
    await writeFile(configPath, JSON.stringify({
      app_id: "a", app_secret: "b",
      default_target: { chat_id: "oc_target" },
      debounce_ms: 0,
      log_file: `${TEST_DIR}/app.log`,
      categories: {}
    }))
    const config = loadConfig(configPath)
    const logger = createFileLogger(config.log_file)
    let command = ""
    const notifier = createLarkNotifier(logger, async (cmd) => { command = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    const handler = createEventHandler(config, notifier, logger)
    await handler.handle({ type: "permission.asked", properties: { tool: "bash", args: { command: "rm /tmp/a.txt" } } })
    expect(command).toContain("oc_target")
    expect(command).toContain("/tmp/a.txt")
  })

  it("sends retry notification end-to-end with throttle and recovery completion", async () => {
    const configPath = `${TEST_DIR}/config-retry.jsonc`
    await writeFile(configPath, JSON.stringify({
      app_id: "a", app_secret: "b",
      default_target: { chat_id: "oc_target" },
      debounce_ms: 0,
      log_file: `${TEST_DIR}/app-retry.log`,
      categories: { retry: { target: { chat_id: "oc_retry" }, retry_interval_ms: 60_000 } },
    }))
    const config = loadConfig(configPath)
    const logger = createFileLogger(config.log_file)
    let calls = 0
    let command = ""
    const notifier = createLarkNotifier(logger, async (cmd) => { calls++; command = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    const handler = createEventHandler(config, notifier, logger)

    const retryEvent = {
      type: "session.status",
      properties: {
        sessionID: "sess-1",
        status: { type: "retry", attempt: 1, message: "Provider is overloaded", next: 1750000000000 },
        projectName: "P",
        sessionTitle: "T",
      },
    }

    await handler.handle(retryEvent)
    expect(calls).toBe(1)
    expect(command).toContain("oc_retry")
    expect(command).toContain("Provider is overloaded")

    await handler.handle(retryEvent)
    expect(calls).toBe(1)

    await handler.handle({ type: "session.idle", properties: { sessionID: "sess-1", projectName: "P", sessionTitle: "T" } })
    expect(calls).toBe(2)
    expect(command).toContain("Task Completed")
  })

  it("sends stall notification end-to-end after silent timeout", async () => {
    const configPath = `${TEST_DIR}/config-stall.jsonc`
    await writeFile(configPath, JSON.stringify({
      app_id: "a", app_secret: "b",
      default_target: { chat_id: "oc_target" },
      debounce_ms: 0,
      log_file: `${TEST_DIR}/app-stall.log`,
      categories: { stall: { target: { chat_id: "oc_stall" }, stall_timeout_ms: 100, stall_interval_ms: 60_000 } },
    }))
    const config = loadConfig(configPath)
    const logger = createFileLogger(config.log_file)
    let calls = 0
    let command = ""
    const notifier = createLarkNotifier(logger, async (cmd) => { calls++; command = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    const handler = createEventHandler(config, notifier, logger)

    await handler.handle({
      type: "session.created",
      properties: { info: { id: "sess-stall-1", title: "Long silent task" }, projectName: "P" },
    })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()

    expect(calls).toBe(1)
    expect(command).toContain("oc_stall")
    expect(command).toContain("Long silent task")
  })
})
