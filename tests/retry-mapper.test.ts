import { describe, it, expect } from "bun:test"
import { mapRetryEvent } from "../src/events/retry-mapper"
import type { NotificationTarget } from "../src/types"

const target: NotificationTarget = { chat_id: "oc_test" }

// 固定时间戳：1750000000000 ms = 北京时间 2025-06-15 23:06
function retryEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "session.status",
    properties: {
      sessionID: "sess-123",
      status: { type: "retry", attempt: 3, message: "Provider is overloaded", next: 1750000000000 },
      projectName: "My Project",
      sessionTitle: "Fix login bug",
      ...overrides,
    },
  }
}

describe("mapRetryEvent", () => {
  it("extracts standard retry payload", () => {
    const result = mapRetryEvent(retryEvent(), target)
    expect(result.text).toContain("Provider is overloaded")
    expect(result.text).toContain("尝试: 3 次")
    expect(result.text).toContain("06-15 23:06")
    expect(result.text).toContain("My Project")
    expect(result.text).toContain("Fix login bug")
    expect(result.target).toEqual(target)
  })

  it("formats next timestamp in Beijing time MM-DD HH:mm", () => {
    const result = mapRetryEvent(retryEvent(), target)
    expect(result.text).toMatch(/\d{2}-\d{2} \d{2}:\d{2}/)
    expect(result.text).toContain("06-15 23:06")
  })

  it("degrades missing fields safely", () => {
    const result = mapRetryEvent({
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "retry" } },
    }, target)
    expect(result.text).toContain("unknown")      // message 降级
    expect(result.text).toContain("尝试:  次")      // attempt 缺失 → 空
    expect(result.text).toContain("下次重试: ")     // next 缺失 → 空
  })

  it("omits detail lines when detail is false with default template", () => {
    const result = mapRetryEvent(retryEvent(), target, undefined, false)
    expect(result.text).toContain("Provider is overloaded")
    expect(result.text).not.toContain("尝试")
    expect(result.text).not.toContain("下次重试")
    expect(result.text).not.toContain("06-15")
  })

  it("replaces attempt/next placeholders with empty when detail false with custom template", () => {
    const result = mapRetryEvent(retryEvent(), target, "RETRY {message} [{attempt}] {next}", false)
    expect(result.text).toBe("RETRY Provider is overloaded [] ")
  })

  it("uses custom template when provided", () => {
    const result = mapRetryEvent(retryEvent(), target, "RETRY {message} {attempt} {next}")
    expect(result.text).toContain("RETRY Provider is overloaded 3 06-15 23:06")
  })

  it("supports {sessionID} placeholder", () => {
    const result = mapRetryEvent(retryEvent(), target, "SID {sessionID}")
    expect(result.text).toBe("SID sess-123")
  })
})
