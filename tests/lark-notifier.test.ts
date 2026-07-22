import { describe, it, expect } from "bun:test"
import { createLarkNotifier } from "../src/notifier/lark-notifier"
import type { Logger, NotificationMessage } from "../src/types"

const noopLogger: Logger = { info: () => {}, debug: () => {}, error: () => {} }

describe("LarkNotifier", () => {
  it("builds chat_id command", async () => {
    let captured = ""
    const notifier = createLarkNotifier(noopLogger, async (cmd) => { captured = cmd; return { exitCode: 0, stdout: "", stderr: "" } })
    await notifier.send({ text: "hi", target: { chat_id: "oc_123" } })
    expect(captured).toContain("lark-cli im +messages-send")
    expect(captured).toContain("--chat-id oc_123")
    expect(captured).toContain("--as bot")
  })

  it("logs error without throwing", async () => {
    let err = ""
    const logger: Logger = { info: () => {}, debug: () => {}, error: (m) => { err = m } }
    const notifier = createLarkNotifier(logger, async () => { throw new Error("boom") })
    await notifier.send({ text: "hi", target: { chat_id: "oc_123" } })
    expect(err).toContain("boom")
  })
})
