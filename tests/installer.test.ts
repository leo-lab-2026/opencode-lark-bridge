import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { execSync, type ExecSyncOptions } from "node:child_process"

type ExecFn = (cmd: string, opts?: ExecSyncOptions) => string

describe("copyPluginFiles", () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(() => {
    sourceDir = mkdtempSync(path.join(tmpdir(), "src-"))
    targetDir = mkdtempSync(path.join(tmpdir(), "tgt-"))
    mkdirSync(path.join(sourceDir, "dist"), { recursive: true })
    writeFileSync(path.join(sourceDir, "dist", "index.js"), "module.exports = 1")
    writeFileSync(path.join(sourceDir, "package.json"), '{"name":"test"}')
    writeFileSync(path.join(sourceDir, "opencode-lark-bridge.config.example.jsonc"), '{}')
    writeFileSync(path.join(sourceDir, "bun.lock"), "")
  })

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true })
    rmSync(targetDir, { recursive: true, force: true })
  })

  it("creates target dir and copies dist + package.json + example config", async () => {
    const { copyPluginFiles } = await import("../src/installer")
    copyPluginFiles(targetDir, sourceDir)

    expect(existsSync(path.join(targetDir, "dist", "index.js"))).toBe(true)
    expect(existsSync(path.join(targetDir, "package.json"))).toBe(true)
    expect(existsSync(path.join(targetDir, "opencode-lark-bridge.config.example.jsonc"))).toBe(true)
    expect(existsSync(path.join(targetDir, "bun.lock"))).toBe(true)
  })

  it("overwrites existing dist on re-install", async () => {
    const { copyPluginFiles } = await import("../src/installer")
    copyPluginFiles(targetDir, sourceDir)

    writeFileSync(path.join(sourceDir, "dist", "index.js"), "module.exports = 2")
    copyPluginFiles(targetDir, sourceDir)

    const content = readFileSync(path.join(targetDir, "dist", "index.js"), "utf-8")
    expect(content).toBe("module.exports = 2")
  })

  it("skips missing bun.lock gracefully", async () => {
    const { copyPluginFiles } = await import("../src/installer")
    rmSync(path.join(sourceDir, "bun.lock"))
    copyPluginFiles(targetDir, sourceDir)

    expect(existsSync(path.join(targetDir, "dist", "index.js"))).toBe(true)
    expect(existsSync(path.join(targetDir, "bun.lock"))).toBe(false)
  })
})

describe("installDependencies", () => {
  it("calls bun install first", async () => {
    const calls: string[] = []
    const mockExec: ExecFn = (cmd: string) => {
      calls.push(cmd)
      return ""
    }

    const { installDependencies } = await import("../src/installer")
    installDependencies("/fake/path", mockExec)

    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0]).toContain("bun install")
    expect(calls[0]).toContain("--ignore-scripts")
  })

  it("falls back to npm install when bun fails", async () => {
    const calls: string[] = []
    const mockExec: ExecFn = (cmd: string) => {
      calls.push(cmd)
      if (cmd.includes("bun install")) throw new Error("bun not found")
      return ""
    }

    const { installDependencies } = await import("../src/installer")
    installDependencies("/fake/path", mockExec)

    const bunCmd = calls.find((c) => c.includes("bun install"))
    const npmCmd = calls.find((c) => c.includes("npm install"))
    expect(bunCmd).toContain("--ignore-scripts")
    expect(npmCmd).toContain("--ignore-scripts")
  })

  it("warns when both bun and npm fail", async () => {
    const warnSpy = mock(() => {})
    const originalWarn = console.warn
    console.warn = warnSpy

    const mockExec: ExecFn = () => {
      throw new Error("not found")
    }

    const { installDependencies } = await import("../src/installer")
    installDependencies("/fake/path", mockExec)

    console.warn = originalWarn
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe("installDependencies recursion guard (integration)", () => {
  let pluginDir: string

  beforeEach(() => {
    pluginDir = mkdtempSync(path.join(tmpdir(), "recur-"))
    writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({
        name: "recursion-test-plugin",
        version: "1.0.0",
        scripts: { postinstall: "touch postinstall-ran.marker" },
        dependencies: {},
      })
    )
  })

  afterEach(() => {
    rmSync(pluginDir, { recursive: true, force: true })
  })

  it("does not execute postinstall (--ignore-scripts prevents the recursion trigger)", async () => {
    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: any[]) => { logs.push(args.join(" ")) }
    try {
      const { installDependencies } = await import("../src/installer")
      installDependencies(pluginDir)
    } finally {
      console.log = originalLog
    }

    const installed = logs.some((l) => l.includes("Dependencies installed via"))
    expect(installed).toBe(true)
    expect(existsSync(path.join(pluginDir, "postinstall-ran.marker"))).toBe(false)
  })

  it("control: postinstall runs when --ignore-scripts is absent", () => {
    let ran = false
    try {
      execSync("bun install --production", { cwd: pluginDir, stdio: "pipe", encoding: "utf-8" })
      ran = true
    } catch {
      try {
        execSync("npm install --production", { cwd: pluginDir, stdio: "pipe", encoding: "utf-8" })
        ran = true
      } catch {
      }
    }
    if (!ran) return

    expect(existsSync(path.join(pluginDir, "postinstall-ran.marker"))).toBe(true)
  })
})

describe("installPlugin", () => {
  let tempDir: string
  let sourceDir: string
  const originalCwd = process.cwd
  const originalInitCwd = process.env.INIT_CWD

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "plugin-"))
    sourceDir = mkdtempSync(path.join(tmpdir(), "src-"))
    mkdirSync(path.join(sourceDir, "dist"), { recursive: true })
    writeFileSync(path.join(sourceDir, "dist", "index.js"), "module.exports = 1")
    writeFileSync(path.join(sourceDir, "package.json"), '{"name":"test"}')
    writeFileSync(path.join(sourceDir, "opencode-lark-bridge.config.example.jsonc"), '{"app_id": "example"}')

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
    rmSync(sourceDir, { recursive: true, force: true })
  })

  it("project-level install creates plugin dir and config", async () => {
    const mockExec: ExecFn = () => ""

    const { installPlugin } = await import("../src/installer")
    installPlugin({ global: false, execFn: mockExec, sourceDir })

    expect(existsSync(path.join(tempDir, ".opencode", "plugins", "opencode-lark-bridge", "dist", "index.js"))).toBe(true)
    expect(existsSync(path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"))).toBe(true)
  })

  it("does not throw when copy fails", async () => {
    const mockExec: ExecFn = () => ""

    const { installPlugin } = await import("../src/installer")
    expect(() => installPlugin({ global: false, execFn: mockExec, sourceDir: "/nonexistent/path/that/does/not/exist" })).not.toThrow()
  })
})

describe("uninstallPlugin", () => {
  let tempDir: string
  let sourceDir: string
  const originalCwd = process.cwd
  const originalInitCwd = process.env.INIT_CWD

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "uninst-"))
    sourceDir = mkdtempSync(path.join(tmpdir(), "src-uninst-"))
    mkdirSync(path.join(sourceDir, "dist"), { recursive: true })
    writeFileSync(path.join(sourceDir, "dist", "index.js"), "module.exports = 1")
    writeFileSync(path.join(sourceDir, "package.json"), '{"name":"test"}')
    writeFileSync(path.join(sourceDir, "opencode-lark-bridge.config.example.jsonc"), '{"app_id": "example"}')

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
    rmSync(sourceDir, { recursive: true, force: true })
  })

  it("removes plugin dir and config registration", async () => {
    const mockExec: ExecFn = () => ""
    const { installPlugin, uninstallPlugin } = await import("../src/installer")
    installPlugin({ global: false, execFn: mockExec, sourceDir })
    const pluginDir = path.join(tempDir, ".opencode", "plugins", "opencode-lark-bridge")
    expect(existsSync(pluginDir)).toBe(true)

    uninstallPlugin({ global: false })

    expect(existsSync(pluginDir)).toBe(false)
  })

  it("leaves other plugin entries in config after uninstall", async () => {
    const opencodeDir = path.join(tempDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const configPath = path.join(opencodeDir, "opencode.jsonc")
    writeFileSync(configPath, `{"plugin": ["./other-plugin", "./plugins/opencode-lark-bridge"]}`)

    const { uninstallPlugin } = await import("../src/installer")
    uninstallPlugin({ global: false })

    const content = readFileSync(configPath, "utf-8")
    expect(content).toContain("./other-plugin")
    expect(content).not.toContain("./plugins/opencode-lark-bridge")
  })

  it("does not throw when nothing installed", async () => {
    const { uninstallPlugin } = await import("../src/installer")
    expect(() => uninstallPlugin({ global: false })).not.toThrow()
  })
})
