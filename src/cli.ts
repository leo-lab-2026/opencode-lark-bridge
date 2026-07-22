#!/usr/bin/env node
import os from "node:os"
import path from "node:path"
import { initConfig } from "./postinstall.js"

function printHelp(): void {
  console.log(`Usage: opencode-lark-bridge <command> [options]

Commands:
  init                Create example config in current project (.opencode/)
  init --global, -g   Create example config in global ~/.opencode/
  help                Show this help message
`)
}

function main(): void {
  const args = process.argv.slice(2)
  const command = args[0] || "init"

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp()
    return
  }

  if (command !== "init") {
    console.error(`Unknown command: ${command}`)
    printHelp()
    process.exit(1)
  }

  const globalFlag = args.includes("--global") || args.includes("-g")
  const targetDir = globalFlag
    ? path.join(os.homedir(), ".opencode")
    : path.join(process.cwd(), ".opencode")

  const result = initConfig({ targetDir })
  if (result.created) {
    console.log(`Created example config at ${result.path}`)
  } else {
    console.log(`Config already exists at ${result.path}; nothing changed.`)
  }
}

main()
