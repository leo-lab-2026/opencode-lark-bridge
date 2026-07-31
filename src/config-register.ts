import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { parse, stringify } from "comment-json"

export interface RegisterOptions {
  global: boolean
  pluginPath: string
}

const SCHEMA_URL = "https://opencode.ai/config.json"

function findConfigFile(global: boolean): string {
  const candidates = global
    ? [
        path.join(os.homedir(), ".config", "opencode", "opencode.jsonc"),
        path.join(os.homedir(), ".config", "opencode", "opencode.json"),
      ]
    : [
        path.join(process.cwd(), ".opencode", "opencode.jsonc"),
        path.join(process.cwd(), "opencode.jsonc"),
        path.join(process.cwd(), ".opencode", "opencode.json"),
        path.join(process.cwd(), "opencode.json"),
      ]

  for (const f of candidates) {
    if (existsSync(f)) return f
  }
  return global
    ? path.join(os.homedir(), ".config", "opencode", "opencode.jsonc")
    : path.join(process.cwd(), ".opencode", "opencode.jsonc")
}

export function registerPluginConfig(options: RegisterOptions): void {
  const { global, pluginPath } = options
  const configFile = findConfigFile(global)

  if (!existsSync(configFile)) {
    mkdirSync(path.dirname(configFile), { recursive: true })
    const newConfig: Record<string, unknown> = {
      $schema: SCHEMA_URL,
      plugin: [pluginPath],
    }
    writeFileSync(configFile, stringify(newConfig, null, 2))
    console.log(`Created config with plugin registration: ${configFile}`)
    return
  }

  const raw = readFileSync(configFile, "utf-8")
  const isJsonc = configFile.endsWith(".jsonc")
  let config: any
  try {
    config = isJsonc ? parse(raw) : JSON.parse(raw)
  } catch (err) {
    console.warn(`Warning: Could not parse ${configFile}, skipping registration: ${err}`)
    return
  }

  const plugins: string[] = Array.isArray(config.plugin) ? config.plugin : []
  const alreadyRegistered = plugins.some(
    (p: string) => p === pluginPath || (typeof p === "string" && p.endsWith(pluginPath))
  )
  if (alreadyRegistered) {
    console.log(`Plugin already registered in ${configFile}`)
    return
  }

  if (!config.plugin) {
    config.plugin = [pluginPath]
  } else {
    config.plugin.push(pluginPath)
  }

  const output = isJsonc ? stringify(config, null, 2) : JSON.stringify(config, null, 2)
  writeFileSync(configFile, output)
  console.log(`Added plugin to: ${configFile}`)
}
