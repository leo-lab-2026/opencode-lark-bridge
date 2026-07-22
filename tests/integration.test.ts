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
})
