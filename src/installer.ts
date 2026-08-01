import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync, type ExecSyncOptions } from "node:child_process"
import { fileURLToPath } from "node:url"
import { isGlobalInstall, initConfig } from "./postinstall.js"
import { registerPluginConfig, unregisterPluginConfig } from "./config-register.js"

type ExecFn = (cmd: string, opts?: ExecSyncOptions) => string

export interface InstallOptions {
  global?: boolean
  execFn?: ExecFn
  sourceDir?: string
}

const PLUGIN_NAME = "opencode-lark-bridge"

const FILES_TO_COPY = [
  "dist",
  "package.json",
  "bun.lock",
  "opencode-lark-bridge.config.example.jsonc",
]

export function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
}

export function getPluginDir(global: boolean): string {
  const base = global
    ? path.join(os.homedir(), ".config", "opencode")
    : path.join(process.env.INIT_CWD || process.cwd(), ".opencode")
  return path.join(base, "plugins", PLUGIN_NAME)
}

export function copyPluginFiles(pluginDir: string, sourceDir?: string): void {
  const src = sourceDir || getPackageRoot()
  mkdirSync(pluginDir, { recursive: true })

  for (const item of FILES_TO_COPY) {
    const from = path.join(src, item)
    const to = path.join(pluginDir, item)
    if (path.resolve(from) === path.resolve(to)) continue
    if (!existsSync(from)) continue
    if (item === "dist") {
      rmSync(to, { recursive: true, force: true })
      cpSync(from, to, { recursive: true })
    } else {
      cpSync(from, to, { force: true })
    }
  }
}

export function installDependencies(pluginDir: string, execFn?: ExecFn): void {
  const exec = execFn || ((cmd: string, opts?: ExecSyncOptions) =>
    execSync(cmd, { cwd: pluginDir, stdio: "pipe", encoding: "utf-8", ...opts }))

  const tryCmd = (cmd: string): boolean => {
    try {
      exec(cmd, { cwd: pluginDir, stdio: "pipe", encoding: "utf-8" })
      return true
    } catch {
      return false
    }
  }

  if (tryCmd("bun install --production --ignore-scripts")) {
    console.log("Dependencies installed via bun")
    return
  }

  if (tryCmd("npm install --production --ignore-scripts")) {
    console.log("Dependencies installed via npm")
    return
  }

  console.warn("Could not install dependencies: neither bun nor npm available. Plugin may not work until deps are installed manually.")
}

export function installPlugin(options?: InstallOptions): void {
  const global = options?.global ?? isGlobalInstall()
  const execFn = options?.execFn

  try {
    const pluginDir = getPluginDir(global)
    console.log(`Installing opencode-lark-bridge to ${pluginDir} (${global ? "global" : "project"})`)

    try {
      copyPluginFiles(pluginDir, options?.sourceDir)
    } catch (err) {
      console.warn(`Warning: Failed to copy plugin files: ${err}`)
      return
    }

    try {
      installDependencies(pluginDir, execFn)
    } catch (err) {
      console.warn(`Warning: Dependency installation failed: ${err}`)
    }

    try {
      const targetDir = global
        ? path.join(os.homedir(), ".config", "opencode")
        : path.join(process.env.INIT_CWD || process.cwd(), ".opencode")
      const result = initConfig({ targetDir })
      console.log(result.created
        ? `Created example config at ${result.path}`
        : `Preserved existing config at ${result.path}`)
    } catch (err) {
      console.warn(`Warning: Config seed failed: ${err}`)
    }

    try {
      const pluginPath = global
        ? pluginDir
        : `./plugins/${PLUGIN_NAME}`
      registerPluginConfig({ global, pluginPath })
    } catch (err) {
      console.warn(`Warning: Plugin config registration failed: ${err}`)
    }

    console.log(`✓ opencode-lark-bridge installed to ${pluginDir}`)
  } catch (err) {
    console.warn(`Warning: Installation incomplete: ${err}`)
  }
}

export function uninstallPlugin(options?: { global?: boolean }): void {
  const global = options?.global ?? isGlobalInstall()

  try {
    const pluginDir = getPluginDir(global)
    if (existsSync(pluginDir)) {
      rmSync(pluginDir, { recursive: true, force: true })
      console.log(`Removed plugin directory: ${pluginDir}`)
    } else {
      console.log(`Plugin directory not found, skipping: ${pluginDir}`)
    }

    const pluginPath = global
      ? pluginDir
      : `./plugins/${PLUGIN_NAME}`
    unregisterPluginConfig({ global, pluginPath })

    console.log(`✓ opencode-lark-bridge uninstalled (${global ? "global" : "project"})`)
  } catch (err) {
    console.warn(`Warning: Uninstall incomplete: ${err}`)
  }
}
