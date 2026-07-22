import { describe, it, expect } from "bun:test"
import { mapCompletionEvent } from "../src/events/completion-mapper"

describe("mapCompletionEvent", () => {
  it("renders default template with session title", () => {
    const event = {
      properties: {
        sessionID: "ses_1",
        projectName: "My Project",
        sessionTitle: "Refactor auth"
      }
    }
    const msg = mapCompletionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Task Completed")
    expect(msg.text).toContain("My Project")
    expect(msg.text).toContain("Refactor auth")
    expect(msg.target.chat_id).toBe("oc_1")
  })

  it("uses custom template", () => {
    const event = {
      properties: {
        sessionID: "ses_1",
        projectName: "My Project",
        sessionTitle: "Refactor auth"
      }
    }
    const msg = mapCompletionEvent(event, { chat_id: "oc_1" }, "{projectName}: {sessionTitle}")
    expect(msg.text).toBe("My Project: Refactor auth")
  })

  it("falls back to unknown for missing fields", () => {
    const event = { properties: { sessionID: "ses_1" } }
    const msg = mapCompletionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("unknown")
  })

  it("uses user_id target", () => {
    const msg = mapCompletionEvent({ properties: {} }, { user_id: "ou_1" })
    expect(msg.target.user_id).toBe("ou_1")
  })
})
