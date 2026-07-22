import { readFileSync, existsSync } from "node:fs"
import { parse } from "comment-json"
import type { PluginConfig, NotificationTarget } from "./types"

const DEFAULT_CONFIG = {
  debounce_ms: 3000,
  log_file: "./logs/opencode-lark-bridge.log",
  categories: {}
}

export function loadConfig(configPath: string): PluginConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }
  const raw = readFileSync(configPath, "utf-8")
  const parsed = parse(raw, null, true)
  const config = { ...DEFAULT_CONFIG, ...(parsed as object) } as PluginConfig

  if (!config.app_id || !config.app_secret) {
    throw new Error("Missing required fields: app_id and/or app_secret")
  }
  if (!config.default_target?.chat_id && !config.default_target?.user_id) {
    throw new Error("Missing default_target.chat_id or default_target.user_id")
  }
  return config
}

export function getEffectiveTarget(config: PluginConfig, category?: string): NotificationTarget {
  if (category && config.categories[category]?.target) {
    return config.categories[category].target!
  }
  return config.default_target
}
