import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const PLUGIN_PATH = "./plugins/opencode-lark-bridge"

describe("registerPluginConfig - project level", () => {
  let tempDir: string
  const originalCwd = process.cwd

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "reg-proj-"))
    process.cwd = () => tempDir
  })

  afterEach(() => {
    process.cwd = originalCwd
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("creates new .opencode/opencode.jsonc when none exists", async () => {
    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const configPath = path.join(tempDir, ".opencode", "opencode.jsonc")
    expect(existsSync(configPath)).toBe(true)
    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain('"plugin"')
    expect(content).toContain(PLUGIN_PATH)
  })

  it("preserves comments when appending to existing jsonc", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  // my comment
  "plugin": ["./other-plugin"]
}`)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain("my comment")
    expect(content).toContain(PLUGIN_PATH)
    expect(content).toContain("./other-plugin")
  })

  it("skips when already registered", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    const originalContent = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["${PLUGIN_PATH}"]
}`
    writeFileSync(configPath, originalContent)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toBe(originalContent)
  })

  it("adds plugin field when config exists without it", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  "$schema": "https://opencode.ai/config.json"
}`)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain('"plugin"')
    expect(content).toContain(PLUGIN_PATH)
  })

  it("prefers .opencode/opencode.jsonc over opencode.json", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(path.join(opencodeDir, "opencode.jsonc"), `{}`)
    writeFileSync(path.join(tempDir, "opencode.json"), `{}`)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const jsoncContent = readFileSync(path.join(opencodeDir, "opencode.jsonc"), "utf-8")
    const jsonContent = readFileSync(path.join(tempDir, "opencode.json"), "utf-8")
    expect(jsoncContent).toContain(PLUGIN_PATH)
    expect(jsonContent).toBe(`{}`)
  })
})

describe("registerPluginConfig - error handling", () => {
  let tempDir: string
  const originalCwd = process.cwd

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "reg-err-"))
    process.cwd = () => tempDir
  })

  afterEach(() => {
    process.cwd = originalCwd
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("warns on unparseable jsonc without throwing", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(path.join(opencodeDir, "opencode.jsonc"), `{ broken json`)

    const warnSpy = mock(() => {})
    const originalWarn = console.warn
    console.warn = warnSpy

    const { registerPluginConfig } = await import("../src/config-register")
    expect(() => registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })).not.toThrow()

    console.warn = originalWarn
    expect(warnSpy).toHaveBeenCalled()
  })
})
