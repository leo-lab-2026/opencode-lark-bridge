import { describe, it, expect } from "bun:test"
import { createEventHandler } from "../src/events/event-handler"
import type { Logger, Notifier, PluginConfig } from "../src/types"

const noopLogger: Logger = { info: () => {}, debug: () => {}, error: () => {} }

function makeConfig(debounce_ms: number): PluginConfig {
  return {
    app_id: "a", app_secret: "b",
    default_target: { chat_id: "oc_1" },
    debounce_ms,
    log_file: "",
    categories: {}
  }
}

function makeStallConfig(timeout_ms: number, interval_ms = 60_000): PluginConfig {
  return {
    ...makeConfig(100),
    categories: { stall: { stall_timeout_ms: timeout_ms, stall_interval_ms: interval_ms } }
  }
}

describe("EventHandler", () => {
  it("sends permission event", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "permission.asked", properties: { tool: "bash", args: { command: "rm x" } } })
    expect(sent).toHaveLength(1)
  })

  it("deduplicates within window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = { type: "permission.asked", properties: { tool: "bash", args: { command: "rm x" } } }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("handles event with name and top-level tool/args", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ name: "permission.asked", tool: "write", args: { filePath: "a.md" } })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("write")
    expect(sent[0].text).toContain("a.md")
  })

  it("dedupes webfetch events with the same URL", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = { type: "permission.asked", properties: { tool: "webfetch", args: { url: "https://example.com/api" } } }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("does not dedupe webfetch events with different URLs", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event1 = { type: "permission.asked", properties: { tool: "webfetch", args: { url: "https://a.example.com" } } }
    const event2 = { type: "permission.asked", properties: { tool: "webfetch", args: { url: "https://b.example.com" } } }
    await handler.handle(event1)
    await handler.handle(event2)
    expect(sent).toHaveLength(2)
  })

  it("dedupes permission events with functions.{tool} format", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = { type: "permission.asked", properties: { tool: "functions.bash:14", args: { command: "rm x" } } }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("strips functions. prefix from tool callID with line number", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    const event = { type: "permission.asked", properties: { tool: { callID: "functions.write:19" }, args: { filePath: "a.md" } } }
    await handler.handle(event)
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("write")
    expect(sent[0].text).toContain("a.md")
  })

  it("sends completion notification on main session idle", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(1000),
      categories: { completion: { target: { chat_id: "oc_completion" } } }
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "My Project", sessionTitle: "Refactor auth" }
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].target.chat_id).toBe("oc_completion")
    expect(sent[0].text).toContain("Refactor auth")
  })

  it("skips completion notification when sessionID is unresolvable (unknown)", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(1000),
      categories: { completion: { target: { chat_id: "oc_completion" } } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.idle",
      properties: { type: "session.idle", sessionID: "unknown", projectName: "tmp", sessionTitle: "unknown" },
    })
    expect(sent).toHaveLength(0)
  })

  it("skips completion notification when sessionID is missing entirely", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(1000),
      categories: { completion: { target: { chat_id: "oc_completion" } } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.idle",
      properties: { type: "session.idle", projectName: "tmp", sessionTitle: "unknown" },
    })
    expect(sent).toHaveLength(0)
  })

  it("still sends completion for real sessionID after skipping unknown", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(0),
      categories: { completion: { target: { chat_id: "oc_completion" } } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.idle",
      properties: { type: "session.idle", sessionID: "unknown", projectName: "tmp", sessionTitle: "unknown" },
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_real_1", projectName: "Real", sessionTitle: "Work" },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("Real")
  })

  it("skips notification for subagent session idle", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(1000),
      categories: { completion: {} }
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.created",
      properties: { info: { id: "ses_sub_1", parentID: "ses_main_1" } }
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_sub_1" }
    })
    expect(sent).toHaveLength(0)
  })

  it("deduplicates main session idle within debounce window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = {
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "My Project", sessionTitle: "Task" }
    }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("removes child from pendingChildren on child session.idle", async () => {
    const debugCalls: Array<{ msg: string; meta?: unknown }> = []
    const logger: Logger = {
      info: () => {},
      debug: (msg: string, meta?: unknown) => { debugCalls.push({ msg, meta }) },
      error: () => {}
    }
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, logger)

    await handler.handle({
      type: "session.created",
      properties: { info: { id: "ses_child_1", parentID: "ses_main_1" } }
    })

    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_child_1" }
    })

    const cleanupCall = debugCalls.find(
      (c) => typeof c.msg === "string"
        && c.msg.toLowerCase().includes("removed")
        && JSON.stringify(c.meta ?? {}).toLowerCase().includes("ses_child_1")
    )
    expect(cleanupCall).toBeDefined()
    expect(sent).toHaveLength(0)
  })

  it("skips main session idle until all multiple children are idle", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(1000),
      categories: { completion: {} }
    }
    const handler = createEventHandler(config, notifier, noopLogger)

    await handler.handle({
      type: "session.created",
      properties: { info: { id: "ses_sub_1", parentID: "ses_main_1" } }
    })
    await handler.handle({
      type: "session.created",
      properties: { info: { id: "ses_sub_2", parentID: "ses_main_1" } }
    })

    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "P", sessionTitle: "T" }
    })
    expect(sent).toHaveLength(0)

    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_sub_1" }
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "P", sessionTitle: "T" }
    })
    expect(sent).toHaveLength(0)

    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_sub_2" }
    })
    await handler.handle({
      type: "session.idle",
      properties: { sessionID: "ses_main_1", projectName: "P", sessionTitle: "T" }
    })
    expect(sent).toHaveLength(1)
  })

  it("sends question notification on question.asked event", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { question: { target: { chat_id: "oc_question" } } }
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "question.asked",
      properties: {
        id: "req_q1",
        projectName: "MyProject",
        questions: [{ question: "What approach?", header: "Architecture", options: [] }]
      }
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("What approach?")
    expect(sent[0].target.chat_id).toBe("oc_question")
  })

  it("deduplicates question with same request ID within debounce window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = {
      type: "question.asked",
      properties: {
        id: "req_q1",
        projectName: "P",
        questions: [{ question: "What approach?", header: "H", options: [] }]
      }
    }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("uses categories.question.target when configured", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { question: { target: { user_id: "ou_custom" } } }
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "question.asked",
      properties: {
        id: "req_q1",
        projectName: "P",
        questions: [{ question: "Q?", header: "H", options: [] }]
      }
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].target.user_id).toBe("ou_custom")
  })

  it("sends notification for main session error", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.error",
      properties: { sessionID: "s1", error: { type: "ProviderError", message: "500 Internal Server Error" }, projectName: "Proj" },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("ProviderError")
    expect(sent[0].text).toContain("500 Internal Server Error")
  })

  it("sends notification for subagent session error (does not skip)", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({
      type: "session.error",
      properties: { sessionID: "sub1", error: { type: "Error", message: "failed" } },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("failed")
  })

  it("deduplicates error within debounce window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    const event = {
      type: "session.error",
      properties: { sessionID: "s1", error: { type: "T", message: "M" } },
    }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("sends error notifications for different sessions independently", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(1000), notifier, noopLogger)
    await handler.handle({ type: "session.error", properties: { sessionID: "s1", error: { type: "T", message: "M1" } } })
    await handler.handle({ type: "session.error", properties: { sessionID: "s2", error: { type: "T", message: "M2" } } })
    expect(sent).toHaveLength(2)
  })

  it("falls back to default_target for error category when not configured", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.error", properties: { sessionID: "s1", error: { type: "T", message: "M" } } })
    expect(sent).toHaveLength(1)
    expect(sent[0].target).toEqual({ chat_id: "oc_1" })
  })

  it("suppresses completion notification after session.error for same session", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.error", properties: { sessionID: "s1", error: { type: "T", message: "M" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "s1", projectName: "P", sessionTitle: "T" } })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("⚠️")
  })

  it("removes child from pendingChildren on child session.error allowing parent completion", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({ type: "session.error", properties: { sessionID: "sub1", error: { type: "T", message: "M" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "parent1", projectName: "P", sessionTitle: "T" } })
    const errorNotifs = sent.filter((s) => s.text.includes("⚠️"))
    const completionNotifs = sent.filter((s) => s.text.includes("✅") || s.text.includes("Task Completed"))
    expect(errorNotifs).toHaveLength(1)
    expect(completionNotifs).toHaveLength(1)
  })

  it("sends error notification for opencode namedError shape", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429 } },
        projectName: "Proj",
      },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("APIError (429)")
    expect(sent[0].text).toContain("429 Too Many Requests")
  })

  it("sends retry notification on session.status retry at default threshold", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "Provider is overloaded", next: 1750000000000 }, projectName: "P", sessionTitle: "T" },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain("Provider is overloaded")
    expect(sent[0].target).toEqual({ chat_id: "oc_1" })
  })

  it("skips retry notification below configured threshold", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_threshold: 3 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 2, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(0)
  })

  it("skips retry notification when attempt is missing (defaults to 0 below threshold)", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(0)
  })

  it("sends retry notification when attempt reaches configured threshold", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_threshold: 3 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 3, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
  })

  it("skips non-retry session.status types (busy/idle)", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.status", properties: { sessionID: "s1", status: { type: "busy" } } })
    await handler.handle({ type: "session.status", properties: { sessionID: "s1", status: { type: "idle" } } })
    expect(sent).toHaveLength(0)
  })

  it("skips safely when status is missing or malformed", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.status", properties: { sessionID: "s1" } })
    await handler.handle({ type: "session.status", properties: { sessionID: "s2", status: "retry" } })
    expect(sent).toHaveLength(0)
  })

  it("throttles repeated retries within interval window", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_interval_ms: 60_000 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    const event = {
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 2, message: "m", next: 1750000000000 } },
    }
    await handler.handle(event)
    await handler.handle(event)
    expect(sent).toHaveLength(1)
  })

  it("sends again after throttle interval elapses", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_interval_ms: 50 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    const event = {
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 2, message: "m", next: 1750000000000 } },
    }
    await handler.handle(event)
    await new Promise((resolve) => setTimeout(resolve, 120))
    await handler.handle(event)
    expect(sent).toHaveLength(2)
  })

  it("throttles retry independently per session", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { retry_interval_ms: 60_000 } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    const mkEvent = (sessionID: string) => ({
      type: "session.status",
      properties: { sessionID, status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    await handler.handle(mkEvent("s1"))
    await handler.handle(mkEvent("s1"))
    await handler.handle(mkEvent("s2"))
    expect(sent).toHaveLength(2)
  })

  it("skips subagent retry notification by default", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "sub1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(0)
  })

  it("sends subagent retry notification when notify_subagent enabled", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { notify_subagent: true } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "sub1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
  })

  it("subagent retry does not remove child from pendingChildren", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { notify_subagent: true } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "sub1", parentID: "parent1" } } })
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "sub1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
    await handler.handle({ type: "session.idle", properties: { sessionID: "parent1", projectName: "P", sessionTitle: "T" } })
    expect(sent).toHaveLength(1)
  })

  it("retry does not pollute erroredSessions and completion still sent", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeConfig(100), notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
    await handler.handle({ type: "session.idle", properties: { sessionID: "s1", projectName: "P", sessionTitle: "T" } })
    expect(sent).toHaveLength(2)
    expect(sent[1].text).toContain("Task Completed")
  })

  it("uses categories.retry.target when configured", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { retry: { target: { user_id: "ou_retry" }, retry_detail: false } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry", attempt: 1, message: "m", next: 1750000000000 } },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].target.user_id).toBe("ou_retry")
    expect(sent[0].text).not.toContain("尝试")
  })
})

describe("stall tracking", () => {
  const stallOnly = (sent: any[]) => sent.filter((s) => typeof s.text === "string" && s.text.includes("会话停滞"))

  it("tracks created session and sends stall notification after timeout", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "Long task" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    expect(stallOnly(sent)[0].text).toContain("Long task")
    expect(stallOnly(sent)[0].text).toContain("无进展时长")
  })

  it("resets stall timer on activity events", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 100))
    await handler.handle({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "busy" } } })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 100))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })

  it("retry event flow updates activity and does not trigger stall", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 100))
    await handler.handle({
      type: "session.status",
      properties: { sessionID: "ses_1", status: { type: "retry", attempt: 1, message: "m" }, projectName: "P" },
    })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 100))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })

  it("clears tracking on session.idle", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("clears tracking on session.error", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.error", properties: { sessionID: "ses_1", error: { type: "T", message: "M" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("clears tracking on session.idle with info.id shape", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("clears tracking on session.error with info.id shape", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.error", properties: { info: { id: "ses_1", error: { type: "T", message: "M" } } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("session.updated trailing session.idle does not re-activate stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({ type: "session.updated", properties: { sessionID: "ses_1" } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("session.status idle trailing session.idle does not re-activate stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "idle" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("session.created trailing session.idle does not re-activate stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("activity after session.idle re-activates stall tracking", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    await handler.handle({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "busy" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })

  it("clears tracking on session.deleted", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.deleted", properties: { sessionID: "ses_1" } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(sent).toHaveLength(0)
  })

  it("clears tracking on session.deleted with info.id shape", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await handler.handle({ type: "session.deleted", properties: { info: { id: "ses_1" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(sent).toHaveLength(0)
  })

  it("does not notify for stalled subagent sessions", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_child", parentID: "ses_parent" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("cascades touch from subagent to parent session", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_parent", title: "Parent" } } })
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_child", parentID: "ses_parent" } } })
    await new Promise((r) => setTimeout(r, 80))
    await handler.handle({ type: "session.status", properties: { sessionID: "ses_child", status: { type: "busy" } } })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("stall notification does not pollute erroredSessions, completion still sent", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    await handler.handle({ type: "session.idle", properties: { sessionID: "ses_1", projectName: "P", sessionTitle: "T" } })
    const completion = sent.filter((s) => typeof s.text === "string" && s.text.includes("Task Completed"))
    expect(completion).toHaveLength(1)
  })

  it("does not track question ids as session activity", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({
      type: "question.asked",
      properties: { id: "deploy-env-001", projectName: "P", questions: [{ question: "Q?", header: "H", options: [] }] }
    })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("cascades touch on subagent created immediately", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_parent", title: "Parent" } } })
    await new Promise((r) => setTimeout(r, 80))
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_child", parentID: "ses_parent" } } })
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(0)
  })

  it("throttles repeated stall notifications within interval", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    await handler.scanStalledSessions()
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
  })

  it("re-sends after throttle interval elapses", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50, 50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(2)
  })

  it("throttles stall independently per session", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const handler = createEventHandler(makeStallConfig(50), notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_a", title: "A" } } })
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_b", title: "B" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(2)
  })

  it("continues scanning when send fails", async () => {
    const sent: any[] = []
    const errors: string[] = []
    const logger: Logger = {
      info: () => {},
      debug: () => {},
      error: (msg: string) => { errors.push(msg) },
    }
    const notifier: Notifier = {
      send: async (m) => {
        if (m.text.includes("ses_a") || m.text.includes("A")) throw new Error("lark-cli failed")
        sent.push(m)
      },
    }
    const handler = createEventHandler(makeStallConfig(50), notifier, logger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_a", title: "A" } } })
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_b", title: "B" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    expect(stallOnly(sent)[0].text).toContain("B")
    expect(errors.some((e) => e.includes("Stall notification send failed"))).toBe(true)
  })

  it("uses categories.stall.target when configured", async () => {
    const sent: any[] = []
    const notifier: Notifier = { send: async (m) => { sent.push(m) } }
    const config: PluginConfig = {
      ...makeConfig(100),
      categories: { stall: { stall_timeout_ms: 50, stall_interval_ms: 60_000, target: { user_id: "ou_stall" } } },
    }
    const handler = createEventHandler(config, notifier, noopLogger)
    await handler.handle({ type: "session.created", properties: { info: { id: "ses_1", title: "T" } } })
    await new Promise((r) => setTimeout(r, 150))
    await handler.scanStalledSessions()
    expect(stallOnly(sent)).toHaveLength(1)
    expect(stallOnly(sent)[0].target.user_id).toBe("ou_stall")
  })
})
