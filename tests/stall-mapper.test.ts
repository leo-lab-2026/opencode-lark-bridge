import { describe, it, expect } from "bun:test"
import { mapStallEvent, formatDuration } from "../src/events/stall-mapper"
import type { NotificationTarget } from "../src/types"

const target: NotificationTarget = { chat_id: "oc_test" }

describe("formatDuration", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatDuration(0)).toBe("0 秒")
    expect(formatDuration(45_000)).toBe("45 秒")
  })
  it("formats minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1 分钟")
    expect(formatDuration(90_000)).toBe("1 分钟 30 秒")
  })
  it("formats hours and minutes", () => {
    expect(formatDuration(5_400_000)).toBe("1 小时 30 分钟")
  })
  it("formats full hours without minutes suffix", () => {
    expect(formatDuration(3_600_000)).toBe("1 小时")
    expect(formatDuration(7_230_000)).toBe("2 小时")
  })
})

describe("mapStallEvent", () => {
  it("renders default template with all fields", () => {
    const msg = mapStallEvent(
      { projectName: "my-proj", sessionTitle: "Fix bug", idleDuration: "10 分钟" },
      target
    )
    expect(msg.text).toContain("⚠️ OpenCode 会话停滞")
    expect(msg.text).toContain("Project: my-proj")
    expect(msg.text).toContain("Session: Fix bug")
    expect(msg.text).toContain("无进展时长: 10 分钟")
    expect(msg.target).toEqual(target)
  })

  it("degrades missing fields to unknown", () => {
    const msg = mapStallEvent({ idleDuration: "1 小时" }, target)
    expect(msg.text).toContain("Project: unknown")
    expect(msg.text).toContain("Session: unknown")
  })

  it("degrades blank fields to unknown", () => {
    const msg = mapStallEvent({ projectName: "  ", sessionTitle: "", idleDuration: "3 秒" }, target)
    expect(msg.text).toContain("Project: unknown")
    expect(msg.text).toContain("Session: unknown")
  })

  it("uses custom template when provided", () => {
    const msg = mapStallEvent(
      { projectName: "p", sessionTitle: "s", idleDuration: "5 分钟" },
      target,
      "STALL {projectName} {sessionTitle} {idleDuration}"
    )
    expect(msg.text).toBe("STALL p s 5 分钟")
  })
})
