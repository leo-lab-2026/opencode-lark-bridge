import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { parse } from "comment-json"

export interface RegisterOptions {
  global: boolean
  pluginPath: string
  projectRoot?: string
}

const SCHEMA_URL = "https://opencode.ai/config.json"

function getProjectRoot(projectRoot?: string): string {
  return projectRoot || process.env.INIT_CWD || process.cwd()
}

function globalCandidates(): string[] {
  const base = path.join(os.homedir(), ".config", "opencode")
  return [
    path.join(base, "opencode.jsonc"),
    path.join(base, "opencode.json"),
  ]
}

function projectCandidates(projectRoot: string): string[] {
  return [
    path.join(projectRoot, ".opencode", "opencode.jsonc"),
    path.join(projectRoot, ".opencode", "opencode.json"),
    path.join(projectRoot, "opencode.jsonc"),
    path.join(projectRoot, "opencode.json"),
  ]
}

function getCandidates(global: boolean, projectRoot?: string): string[] {
  return global ? globalCandidates() : projectCandidates(getProjectRoot(projectRoot))
}

export function findConfigFile(global: boolean, projectRoot?: string): string {
  const candidates = getCandidates(global, projectRoot)
  for (const f of candidates) {
    if (existsSync(f)) return f
  }
  return candidates[0]
}

function parseConfig(raw: string, isJsonc: boolean): any | null {
  try {
    return isJsonc ? parse(raw) : JSON.parse(raw)
  } catch {
    return null
  }
}

function isRegistered(raw: string, configFile: string, pluginPath: string): boolean {
  const config = parseConfig(raw, configFile.endsWith(".jsonc"))
  if (!config) return false
  const plugins: unknown[] = Array.isArray(config.plugin) ? config.plugin : []
  return plugins.some(
    (p) => typeof p === "string" && (p === pluginPath || p.endsWith(pluginPath))
  )
}

function getLineIndent(raw: string, index: number): string {
  const lineStart = raw.lastIndexOf("\n", index - 1) + 1
  const line = raw.slice(lineStart, raw.indexOf("\n", index) === -1 ? raw.length : raw.indexOf("\n", index))
  const m = line.match(/^[ \t]*/)
  return m ? m[0] : ""
}

interface PluginArray {
  bracketIdx: number
  closeIdx: number
  singleLine: boolean
}

function findPluginArray(raw: string): PluginArray | null {
  const pluginIdx = raw.indexOf('"plugin"')
  if (pluginIdx === -1) return null
  const bracketIdx = raw.indexOf("[", pluginIdx)
  if (bracketIdx === -1) return null
  const closeIdx = raw.indexOf("]", bracketIdx)
  if (closeIdx === -1) return null
  const singleLine = !raw.slice(bracketIdx, closeIdx).includes("\n")
  return { bracketIdx, closeIdx, singleLine }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function registerPluginText(raw: string, pluginPath: string): string {
  const array = findPluginArray(raw)

  if (!array) {
    const lastBrace = raw.lastIndexOf("}")
    if (lastBrace === -1) return raw
    const before = raw.slice(0, lastBrace)
    const indent = getLineIndent(raw, lastBrace) || "  "

    const prevLines = before.split("\n")
    let prevIdx = prevLines.length - 1
    while (prevIdx >= 0 && !/\S/.test(prevLines[prevIdx])) prevIdx--
    let prevFixed = false
    if (prevIdx >= 0 && !/,\s*$/.test(prevLines[prevIdx])) {
      prevLines[prevIdx] = prevLines[prevIdx].replace(/[ \t]+$/, "") + ","
      prevFixed = true
    }
    const fixedBefore = prevLines.join("\n")

    const insertion = `${indent}"plugin": ["${pluginPath}"]`
    const separator = prevFixed ? "\n" : "\n"
    return fixedBefore + insertion + separator + raw.slice(lastBrace)
  }

  const { bracketIdx, closeIdx, singleLine } = array
  const inner = raw.slice(bracketIdx + 1, closeIdx)
  const hasElements = /\S/.test(inner)

  if (!hasElements) {
    return raw.slice(0, bracketIdx + 1) + `"${pluginPath}"` + raw.slice(closeIdx)
  }

  if (singleLine) {
    const beforeClose = raw.slice(bracketIdx, closeIdx).replace(/\s+$/, "")
    return raw.slice(0, bracketIdx) + beforeClose + `, "${pluginPath}"` + raw.slice(closeIdx)
  }

  const beforeClose = raw.slice(bracketIdx, closeIdx)
  const lines = beforeClose.split("\n")
  let lastContentIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\S/.test(lines[i])) {
      lastContentIdx = i
      break
    }
  }
  if (lastContentIdx === -1) return raw
  const lastLine = lines[lastContentIdx]
  if (!/,\s*$/.test(lastLine)) {
    lines[lastContentIdx] = lastLine.replace(/[ \t]+$/, "") + ","
  }
  const indent = (lastLine.match(/^[ \t]*/) || [""])[0]
  lines.splice(lastContentIdx + 1, 0, `${indent}"${pluginPath}"`)
  const newInner = lines.join("\n")
  return raw.slice(0, bracketIdx) + newInner + raw.slice(closeIdx)
}

export function unregisterPluginText(raw: string, pluginPath: string): string {
  const array = findPluginArray(raw)
  if (!array) return raw
  const { bracketIdx, closeIdx, singleLine } = array

  if (singleLine) {
    const inner = raw.slice(bracketIdx + 1, closeIdx)
    const elements = inner.split(",").map((e) => e.trim())
    const remaining = elements.filter((e) => e !== `"${pluginPath}"`)
    const newInner = remaining.join(", ")
    return raw.slice(0, bracketIdx + 1) + newInner + raw.slice(closeIdx)
  }

  const beforeClose = raw.slice(bracketIdx, closeIdx)
  const lines = beforeClose.split("\n")
  const result: string[] = []
  for (const line of lines) {
    if (new RegExp(`"${escapeRegExp(pluginPath)}"`).test(line)) {
      if (!/,\s*$/.test(line)) {
        let prevIdx = result.length - 1
        while (prevIdx >= 0 && !/\S/.test(result[prevIdx])) prevIdx--
        if (prevIdx >= 0) {
          result[prevIdx] = result[prevIdx].replace(/,\s*$/, "")
        }
      }
      continue
    }
    result.push(line)
  }
  const newInner = result.join("\n")
  return raw.slice(0, bracketIdx) + newInner + raw.slice(closeIdx)
}

function createNewConfig(configFile: string, pluginPath: string): void {
  mkdirSync(path.dirname(configFile), { recursive: true })
  const newConfig: Record<string, unknown> = {
    $schema: SCHEMA_URL,
    plugin: [pluginPath],
  }
  const content = `{
  "$schema": "${SCHEMA_URL}",
  "plugin": [
    "${pluginPath}"
  ]
}
`
  writeFileSync(configFile, content)
  console.log(`Created config with plugin registration: ${configFile}`)
}

export function registerPluginConfig(options: RegisterOptions): void {
  const { global, pluginPath } = options
  const projectRoot = getProjectRoot(options.projectRoot)
  const candidates = getCandidates(global, projectRoot)
  const existing = candidates.filter((f) => existsSync(f))

  if (existing.length === 0) {
    createNewConfig(candidates[0], pluginPath)
    return
  }

  for (const f of existing) {
    const raw = readFileSync(f, "utf-8")
    if (isRegistered(raw, f, pluginPath)) {
      console.log(`Plugin already registered in ${f}`)
      return
    }
  }

  const configFile = existing[0]
  const raw = readFileSync(configFile, "utf-8")
  if (!raw.includes("{") || !raw.includes("}")) {
    console.warn(`Warning: ${configFile} does not look like a valid JSON config, skipping write`)
    return
  }
  const output = registerPluginText(raw, pluginPath)
  writeFileSync(configFile, output)
  console.log(`Added plugin to: ${configFile}`)
}

export function unregisterPluginConfig(options: RegisterOptions): void {
  const { global, pluginPath } = options
  const projectRoot = getProjectRoot(options.projectRoot)
  const candidates = getCandidates(global, projectRoot)
  let anyRemoved = false

  for (const f of candidates) {
    if (!existsSync(f)) continue
    const raw = readFileSync(f, "utf-8")
    if (!isRegistered(raw, f, pluginPath)) continue
    const output = unregisterPluginText(raw, pluginPath)
    writeFileSync(f, output)
    console.log(`Removed plugin from: ${f}`)
    anyRemoved = true
  }

  if (!anyRemoved) {
    console.log("Plugin not found in any config; nothing to remove.")
  }
}
