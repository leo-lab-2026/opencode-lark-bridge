import { existsSync, mkdirSync, copyFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const CONFIG_FILE = "opencode-lark-bridge.config.jsonc"
const EXAMPLE_FILE = "opencode-lark-bridge.config.example.jsonc"

function getGlobalPrefix(): string | null {
  try {
    return execSync("npm prefix -g", { encoding: "utf-8" }).trim()
  } catch {
    return null
  }
}

function getCurrentDir(): string {
  return path.dirname(fileURLToPath(import.meta.url))
}

function isInsideGlobalPath(candidate: string): boolean {
  const resolvedCandidate = path.resolve(candidate)
  const prefixes: string[] = []

  const npmPrefix = getGlobalPrefix()
  if (npmPrefix) prefixes.push(npmPrefix)

  // Common global install locations for bun and npm.
  const home = os.homedir()
  prefixes.push(
    path.join(home, ".bun", "install", "global"),
    path.join(home, ".local", "share", "pnpm", "global"),
    path.join(home, ".config", "yarn", "global"),
    path.join(home, ".npm", "global"),
    "/usr/local/lib/node_modules",
    "/usr/lib/node_modules"
  )

  for (const prefix of prefixes) {
    if (resolvedCandidate.startsWith(path.resolve(prefix))) {
      return true
    }
  }
  return false
}

export function isGlobalInstall(): boolean {
  // npm sets npm_config_global=true for -g installs.
  if (process.env.npm_config_global === "true") {
    return true
  }

  // If INIT_CWD is provided and points inside a global location, treat as global.
  if (process.env.INIT_CWD && isInsideGlobalPath(process.env.INIT_CWD)) {
    return true
  }

  // Fallback: if the package itself is installed inside a global location.
  return isInsideGlobalPath(getCurrentDir())
}

export function resolveTargetDir(): string {
  if (isGlobalInstall()) {
    return path.join(os.homedir(), ".config", "opencode")
  }
  const projectRoot = process.env.INIT_CWD || process.cwd()
  return path.join(projectRoot, ".opencode")
}

export function initConfig(options: {
  targetDir: string
  exampleFile?: string
  configFile?: string
}): { created: boolean; path: string } {
  const configFile = options.configFile || CONFIG_FILE
  const exampleFile = options.exampleFile || EXAMPLE_FILE
  mkdirSync(options.targetDir, { recursive: true })

  const targetPath = path.resolve(options.targetDir, configFile)
  if (existsSync(targetPath)) {
    return { created: false, path: targetPath }
  }

  // In a published package, the script is at dist/ and the example is at package root.
  const currentDir = getCurrentDir()
  const sourcePath = path.resolve(currentDir, "..", exampleFile)
  if (!existsSync(sourcePath)) {
    // Fallback for local source runs: example lives next to src/.
    const localFallback = path.resolve(currentDir, "..", "..", exampleFile)
    if (existsSync(localFallback)) {
      copyFileSync(localFallback, targetPath)
      return { created: true, path: targetPath }
    }
    throw new Error(`Example config not found at ${sourcePath} or ${localFallback}`)
  }

  copyFileSync(sourcePath, targetPath)
  return { created: true, path: targetPath }
}

function main(): void {
  const targetDir = resolveTargetDir()
  const result = initConfig({ targetDir })
  if (result.created) {
    console.log(`Created example config at ${result.path}`)
  } else {
    console.log(`Preserved existing config at ${result.path}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
