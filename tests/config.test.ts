import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { loadConfig, getEffectiveTarget } from "../src/config"

const TEST_DIR = "tests/fixtures/config"

describe("loadConfig", () => {
  beforeEach(async () => await mkdir(TEST_DIR, { recursive: true }))
  afterEach(async () => await rm(TEST_DIR, { recursive: true, force: true }))

  it("parses JSONC with comments", async () => {
    const path = `${TEST_DIR}/valid.jsonc`
    await writeFile(path, `{
      // app credentials
      "app_id": "a",
      "app_secret": "b",
      "default_target": { "chat_id": "c" }
    }`)
    const cfg = loadConfig(path)
    expect(cfg.app_id).toBe("a")
    expect(cfg.default_target.chat_id).toBe("c")
    expect(cfg.debounce_ms).toBe(3000)
  })

  it("throws when app_id missing", async () => {
    const path = `${TEST_DIR}/invalid.jsonc`
    await writeFile(path, `{}`)
    expect(() => loadConfig(path)).toThrow()
  })
})

describe("getEffectiveTarget", () => {
  const cfg: any = {
    default_target: { chat_id: "default" },
    categories: { permission: { target: { user_id: "u" } } }
  }
  it("falls back to default when category has no target", () => {
    expect(getEffectiveTarget(cfg, "other").chat_id).toBe("default")
  })
  it("uses category target when available", () => {
    expect(getEffectiveTarget(cfg, "permission").user_id).toBe("u")
  })
  it("falls back to default target for retry category when not configured", () => {
    expect(getEffectiveTarget(cfg, "retry").chat_id).toBe("default")
  })
  it("uses retry category target when configured", () => {
    const withRetry = { ...cfg, categories: { ...cfg.categories, retry: { target: { chat_id: "oc_retry" } } } }
    expect(getEffectiveTarget(withRetry, "retry").chat_id).toBe("oc_retry")
  })
})
