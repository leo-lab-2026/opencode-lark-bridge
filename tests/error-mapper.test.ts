import { describe, it, expect } from "bun:test"
import { mapErrorEvent } from "../src/events/error-mapper"
import type { NotificationTarget } from "../src/types"

const target: NotificationTarget = { chat_id: "oc_test" }

describe("mapErrorEvent", () => {
  it("extracts standard error payload", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "sess-123",
        error: { type: "ProviderError", message: "429 Too Many Requests" },
        projectName: "My Project",
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("ProviderError")
    expect(result.text).toContain("429 Too Many Requests")
    expect(result.text).toContain("sess-123")
    expect(result.text).toContain("My Project")
    expect(result.target).toEqual(target)
  })

  it("degrades to unknown when sessionID is missing", () => {
    const event = {
      type: "session.error",
      properties: { error: { type: "Error", message: "something" } },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("unknown")
  })

  it("degrades to unknown when error object is missing", () => {
    const event = { type: "session.error", properties: { sessionID: "s1" } }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("unknown")
  })

  it("uses default template when no template provided", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { type: "T", message: "M" },
        projectName: "P",
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("⚠️ OpenCode Error")
    expect(result.text).toContain("Project: P")
    expect(result.text).toContain("Session: s1")
    expect(result.text).toContain("Type: T")
    expect(result.text).toContain("Message: M")
  })

  it("uses custom template when provided", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { type: "T", message: "M" },
        projectName: "P",
      },
    }
    const result = mapErrorEvent(event, target, "ERR [{errorType}] {errorMessage}")
    expect(result.text).toBe("ERR [T] M")
  })

  it("handles top-level event without properties wrapper", () => {
    const event = {
      type: "session.error",
      sessionID: "s1",
      error: { type: "T", message: "M" },
      projectName: "P",
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("s1")
    expect(result.text).toContain("T")
  })

  it("extracts opencode namedError shape with statusCode appended", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "sess-123",
        error: { name: "APIError", data: { message: "429 Too Many Requests", statusCode: 429, isRetryable: true } },
        projectName: "My Project",
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("APIError (429)")
    expect(result.text).toContain("429 Too Many Requests")
    expect(result.text).toContain("sess-123")
  })

  it("extracts namedError shape without statusCode", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { name: "ProviderAuthError", data: { message: "Invalid API key" } },
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("ProviderAuthError")
    expect(result.text).toContain("Invalid API key")
  })

  it("prefers legacy type/message over name/data when both present", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: {
          type: "LegacyType",
          message: "legacy message",
          name: "APIError",
          data: { message: "data message" },
        },
      },
    }
    const result = mapErrorEvent(event, target)
    expect(result.text).toContain("LegacyType")
    expect(result.text).toContain("legacy message")
    expect(result.text).not.toContain("APIError")
    expect(result.text).not.toContain("data message")
  })

  it("supports {statusCode} placeholder in custom template", () => {
    const event = {
      type: "session.error",
      properties: {
        sessionID: "s1",
        error: { name: "APIError", data: { message: "boom", statusCode: 500 } },
      },
    }
    const result = mapErrorEvent(event, target, "SC={statusCode} TYPE={errorType}")
    expect(result.text).toBe("SC=500 TYPE=APIError (500)")
  })
})