import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { Logger } from "./types"

function formatBeijingTimestamp(date: Date): string {
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  }).replace(/\//g, "-")
}

function formatLine(level: string, message: string, extra?: Record<string, unknown>): string {
  const ts = formatBeijingTimestamp(new Date())
  const payload = extra ? ` ${JSON.stringify(extra)}` : ""
  return `${ts} [${level}] ${message}${payload}\n`
}

export function createFileLogger(logFile: string): Logger {
  function write(level: string, message: string, extra?: Record<string, unknown>) {
    try {
      mkdirSync(dirname(logFile), { recursive: true })
      appendFileSync(logFile, formatLine(level, message, extra))
    } catch {
      // silent degrade
    }
  }

  return {
    info: (message, extra) => write("INFO", message, extra),
    debug: (message, extra) => write("DEBUG", message, extra),
    error: (message, extra) => write("ERROR", message, extra),
  }
}
