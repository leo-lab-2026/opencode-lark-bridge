#!/usr/bin/env node
import os from "node:os"
import path from "node:path"
import { initConfig } from "./postinstall.js"

function printHelp(): void {
  console.log(`Usage: opencode-lark-bridge <command> [options]

Commands:
  init                Create example config in current project (.opencode/)
  init --global, -g   Create example config in global ~/.config/opencode/
  install             Install plugin files + deps + config registration (project)
  install --global, -g  Install to ~/.config/opencode/ (global)
  help                Show this help message
`)
}

export async function runInstall(
  global: boolean,
  installFn?: (opts: { global: boolean }) => void
): Promise<void> {
  try {
    const fn = installFn || (await import("./installer.js")).installPlugin
    fn({ global })
  } catch (err) {
    console.error(`Install failed: ${err}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0] || "init"

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp()
    return
  }

  if (command === "init") {
    const globalFlag = args.includes("--global") || args.includes("-g")
    const targetDir = globalFlag
      ? path.join(os.homedir(), ".config", "opencode")
      : path.join(process.cwd(), ".opencode")

    const result = initConfig({ targetDir })
    if (result.created) {
      console.log(`Created example config at ${result.path}`)
    } else {
      console.log(`Config already exists at ${result.path}; nothing changed.`)
    }
    return
  }

  if (command === "install") {
    const globalFlag = args.includes("--global") || args.includes("-g")
    await runInstall(globalFlag)
    return
  }

  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
}

main()
