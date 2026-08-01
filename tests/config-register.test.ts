import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const PLUGIN_PATH = "./plugins/opencode-lark-bridge"

describe("registerPluginConfig - project level", () => {
  let tempDir: string
  const originalCwd = process.cwd
  const originalInitCwd = process.env.INIT_CWD

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "reg-proj-"))
    process.cwd = () => tempDir
    process.env.INIT_CWD = tempDir
  })

  afterEach(() => {
    process.cwd = originalCwd
    if (originalInitCwd !== undefined) {
      process.env.INIT_CWD = originalInitCwd
    } else {
      delete process.env.INIT_CWD
    }
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

  it("adds missing comma to previous line when inserting plugin field", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  "$schema": "https://opencode.ai/config.json",
  "model": "my-model"
}`)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain('"model": "my-model",')
    expect(content).toContain('"plugin": ["./plugins/opencode-lark-bridge"]')
    expect(content).not.toContain('"model": "my-model"\n')
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

  it("prefers .opencode/opencode.json over project-root opencode.jsonc", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(path.join(opencodeDir, "opencode.json"), `{}`)
    writeFileSync(path.join(tempDir, "opencode.jsonc"), `{}`)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const jsonContent = readFileSync(path.join(opencodeDir, "opencode.json"), "utf-8")
    const rootJsoncContent = readFileSync(path.join(tempDir, "opencode.jsonc"), "utf-8")
    expect(jsonContent).toContain(PLUGIN_PATH)
    expect(rootJsoncContent).toBe(`{}`)
  })

  it("uses project root from INIT_CWD even when cwd differs", async () => {
    const otherDir = mkdtempSync(path.join(tmpdir(), "reg-other-"))
    process.cwd = () => otherDir

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const configPath = path.join(tempDir, ".opencode", "opencode.jsonc")
    expect(existsSync(configPath)).toBe(true)
    expect(existsSync(path.join(otherDir, ".opencode", "opencode.jsonc"))).toBe(false)
    rmSync(otherDir, { recursive: true, force: true })
  })
})

describe("registerPluginConfig - multi-line array", () => {
  let tempDir: string
  const originalCwd = process.cwd
  const originalInitCwd = process.env.INIT_CWD

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "reg-multi-"))
    process.cwd = () => tempDir
    process.env.INIT_CWD = tempDir
  })

  afterEach(() => {
    process.cwd = originalCwd
    if (originalInitCwd !== undefined) {
      process.env.INIT_CWD = originalInitCwd
    } else {
      delete process.env.INIT_CWD
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("appends to multi-line plugin array without reformatting other content", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  "$schema": "https://opencode.ai/config.json",
  "model": "my-model",
  "plugin": [
    "./other-plugin"
  ]
}`)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain('"model": "my-model"')
    expect(content).toContain("./other-plugin")
    expect(content).toContain(PLUGIN_PATH)
    expect(content.match(/"plugin"/g)).toHaveLength(1)
  })

  it("fills empty plugin array", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  "plugin": []
}`)

    const { registerPluginConfig } = await import("../src/config-register")
    registerPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain(`"${PLUGIN_PATH}"`)
    expect(content).toContain('"plugin"')
  })
})

describe("unregisterPluginConfig", () => {
  let tempDir: string
  const originalCwd = process.cwd
  const originalInitCwd = process.env.INIT_CWD

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "unreg-"))
    process.cwd = () => tempDir
    process.env.INIT_CWD = tempDir
  })

  afterEach(() => {
    process.cwd = originalCwd
    if (originalInitCwd !== undefined) {
      process.env.INIT_CWD = originalInitCwd
    } else {
      delete process.env.INIT_CWD
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("removes plugin from single-line array preserving other entries", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  "$schema": "https://opencode.ai/config.json",
  "model": "my-model",
  "plugin": ["./other-plugin", "${PLUGIN_PATH}"]
}`)

    const { unregisterPluginConfig } = await import("../src/config-register")
    unregisterPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain("./other-plugin")
    expect(content).toContain('"model": "my-model"')
    expect(content).not.toContain(PLUGIN_PATH)
  })

  it("leaves empty plugin array when it becomes empty", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  "plugin": ["${PLUGIN_PATH}"]
}`)

    const { unregisterPluginConfig } = await import("../src/config-register")
    unregisterPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain('"plugin": []')
    expect(content).not.toContain(PLUGIN_PATH)
  })

  it("removes plugin from multi-line array without touching other lines", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{
  "$schema": "https://opencode.ai/config.json",
  "model": "my-model",
  "plugin": [
    "./other-plugin",
    "${PLUGIN_PATH}"
  ]
}`)

    const { unregisterPluginConfig } = await import("../src/config-register")
    unregisterPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain("./other-plugin")
    expect(content).toContain('"model": "my-model"')
    expect(content).not.toContain(PLUGIN_PATH)
  })

  it("does nothing when plugin not registered", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    const originalContent = `{
  "plugin": ["./other-plugin"]
}`
    writeFileSync(configPath, originalContent)

    const { unregisterPluginConfig } = await import("../src/config-register")
    unregisterPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toBe(originalContent)
  })

  it("removes from both jsonc and json when both exist", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(path.join(opencodeDir, "opencode.jsonc"), `{"plugin": ["${PLUGIN_PATH}", "x"]}`)
    writeFileSync(path.join(opencodeDir, "opencode.json"), `{"plugin": ["${PLUGIN_PATH}"]}`)

    const { unregisterPluginConfig } = await import("../src/config-register")
    unregisterPluginConfig({ global: false, pluginPath: PLUGIN_PATH })

    const jsoncContent = readFileSync(path.join(opencodeDir, "opencode.jsonc"), "utf-8")
    const jsonContent = readFileSync(path.join(opencodeDir, "opencode.json"), "utf-8")
    expect(jsoncContent).not.toContain(PLUGIN_PATH)
    expect(jsoncContent).toContain("x")
    expect(jsonContent).not.toContain(PLUGIN_PATH)
  })
})

describe("registerPluginConfig - error handling", () => {
  let tempDir: string
  const originalCwd = process.cwd
  const originalInitCwd = process.env.INIT_CWD

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "reg-err-"))
    process.cwd = () => tempDir
    process.env.INIT_CWD = tempDir
  })

  afterEach(() => {
    process.cwd = originalCwd
    if (originalInitCwd !== undefined) {
      process.env.INIT_CWD = originalInitCwd
    } else {
      delete process.env.INIT_CWD
    }
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
