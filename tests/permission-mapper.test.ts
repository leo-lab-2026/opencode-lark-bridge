import { describe, it, expect } from "bun:test"
import { mapPermissionEvent } from "../src/events/permission-mapper"

describe("mapPermissionEvent", () => {
  it("extracts delete file path from bash command", () => {
    const event = {
      properties: {
        tool: "bash",
        args: { command: "rm -f /tmp/foo.txt" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Tool: bash")
    expect(msg.text).toContain("Operation: rm")
    expect(msg.text).toContain("Target: -f /tmp/foo.txt")
  })

  it("uses custom template", () => {
    const event = { properties: { tool: "read", args: { filePath: "/etc/hosts" } } }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" }, "{tool} wants {resource}")
    expect(msg.text).toBe("read wants /etc/hosts")
  })

  it("extracts tool name from object", () => {
    const event = {
      properties: {
        tool: { name: "bash" },
        args: { command: "rm -f /tmp/foo.txt" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("bash")
    expect(msg.text).toContain("/tmp/foo.txt")
  })

  it("extracts tool name from functions.{tool}:{id} format", () => {
    const event = {
      properties: {
        tool: "functions.bash:14",
        args: { command: "rm -f /tmp/foo.txt" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Tool: bash")
    expect(msg.text).toContain("Operation: rm")
  })

  it("extracts tool name from functions.{tool} format without id", () => {
    const event = {
      properties: {
        tool: "functions.write",
        args: { filePath: "/tmp/foo.txt" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Tool: write")
  })

  it("extracts tool name from object name field containing functions. format", () => {
    const event = {
      properties: {
        tool: { name: "functions.bash:0" },
        args: { command: "rm -f /tmp/foo.txt" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Tool: bash")
    expect(msg.text).toContain("Operation: rm")
  })

  it("handles OpenCode permission.asked event structure", () => {
    const event = {
      type: "permission.asked",
      properties: {
        permission: "edit",
        patterns: ["a.md"],
        metadata: { filepath: "/home/project/a.md" },
        tool: { messageID: "msg_1", callID: "write_39" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("write")
    expect(msg.text).toContain("edit")
    expect(msg.text).toContain("/home/project/a.md")
  })

  it("extracts tool name from callID with functions. prefix and line number", () => {
    const event = {
      type: "permission.asked",
      properties: {
        permission: "bash",
        patterns: ["rm -f /tmp/foo.txt"],
        metadata: { command: "rm -f /tmp/foo.txt" },
        tool: { messageID: "msg_1", callID: "functions.bash:14" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Tool: bash")
    expect(msg.text).toContain("Operation: rm")
    expect(msg.text).toContain("Target: -f /tmp/foo.txt")
  })

  it("extracts URL for webfetch permission", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "webfetch",
        args: { url: "https://example.com/api" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: https://example.com/api")
  })

  it("falls back from webfetch url to uri", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "webfetch",
        args: { uri: "https://example.com/v2" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: https://example.com/v2")
  })

  it("extracts query for websearch permission", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "websearch",
        args: { query: "lark cli auth" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: lark cli auth")
  })

  it("extracts task subagent type", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "task",
        args: { type: "explore" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: explore")
  })

  it("falls back from task type to agent", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "task",
        args: { agent: "librarian" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: librarian")
  })

  it("extracts skill name", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "skill",
        args: { name: "git-master" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: git-master")
  })

  it("falls back from skill name to skill field", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "skill",
        args: { skill: "test-driven-development" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: test-driven-development")
  })

  it("extracts external_directory path", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "external_directory",
        args: { path: "/tmp/external" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: /tmp/external")
  })

  it("falls back from external_directory path to directory", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "external_directory",
        args: { directory: "/var/log" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Target: /var/log")
  })

  it("extracts doom_loop tool and input", () => {
    const event = {
      type: "permission.asked",
      properties: {
        tool: "doom_loop",
        args: { tool: "bash", input: "rm -rf /tmp/cache" }
      }
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("bash")
    expect(msg.text).toContain("rm -rf /tmp/cache")
    expect(msg.text).toContain("Target: bash: rm -rf /tmp/cache")
  })
})
