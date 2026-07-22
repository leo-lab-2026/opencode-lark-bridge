import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import os from "node:os"
import path from "node:path"
import { isGlobalInstall, resolveTargetDir, initConfig } from "../src/postinstall"

describe("isGlobalInstall", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.npm_config_global
    delete process.env.INIT_CWD
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns true when npm_config_global is 'true'", () => {
    process.env.npm_config_global = "true"
    expect(isGlobalInstall()).toBe(true)
  })

  it("returns false for a normal project install", () => {
    process.env.INIT_CWD = "/home/user/project"
    expect(isGlobalInstall()).toBe(false)
  })
})

describe("resolveTargetDir", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("resolves to ~/.config/opencode for global install", () => {
    process.env.npm_config_global = "true"
    expect(resolveTargetDir()).toBe(
      path.join(os.homedir(), ".config", "opencode"),
    )
  })

  it("resolves to INIT_CWD/.opencode for project install", () => {
    const project = "/home/user/project"
    process.env.INIT_CWD = project
    delete process.env.npm_config_global
    expect(resolveTargetDir()).toBe(path.join(project, ".opencode"))
  })
})

describe("initConfig", () => {
  let tempDir: string
  let exampleFile: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "lark-init-"))
    exampleFile = path.join(tempDir, "opencode-lark-bridge.config.example.jsonc")
    writeFileSync(exampleFile, '{ "app_id": "example" }')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("creates config when it does not exist", () => {
    const targetDir = path.join(tempDir, "target")
    const result = initConfig({ targetDir, exampleFile })

    expect(result.created).toBe(true)
    expect(existsSync(result.path)).toBe(true)
    expect(readFileSync(result.path, "utf-8")).toContain('"app_id"')
  })

  it("preserves existing config and does not overwrite", () => {
    const targetDir = path.join(tempDir, "target")
    mkdirSync(targetDir, { recursive: true })
    const existing = path.join(targetDir, "opencode-lark-bridge.config.jsonc")
    writeFileSync(existing, '{ "app_id": "user" }')

    const result = initConfig({ targetDir, exampleFile })

    expect(result.created).toBe(false)
    expect(readFileSync(result.path, "utf-8")).toContain('"user"')
  })

  it("creates the .opencode directory if missing", () => {
    const targetDir = path.join(tempDir, "nested", "target")
    const result = initConfig({ targetDir, exampleFile })

    expect(existsSync(targetDir)).toBe(true)
    expect(existsSync(result.path)).toBe(true)
  })
})
