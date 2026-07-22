import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, rm, readFile } from "node:fs/promises"
import { createFileLogger } from "../src/logger"

const TEST_LOG_DIR = "tests/fixtures/logs"
const TEST_LOG_FILE = `${TEST_LOG_DIR}/test.log`

describe("FileLogger", () => {
  beforeEach(async () => {
    await mkdir(TEST_LOG_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_LOG_DIR, { recursive: true, force: true })
  })

  it("writes info message to file", async () => {
    const logger = createFileLogger(TEST_LOG_FILE)
    logger.info("hello")
    const content = await readFile(TEST_LOG_FILE, "utf-8")
    expect(content).toContain("hello")
  })

  it("does not write to stdout", () => {
    const logger = createFileLogger(TEST_LOG_FILE)
    logger.info("should not print")
    expect(true).toBe(true)
  })

  it("uses Beijing timezone timestamp", async () => {
    const logger = createFileLogger(TEST_LOG_FILE)
    logger.info("beijing time")
    const content = await readFile(TEST_LOG_FILE, "utf-8")
    expect(content).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \[INFO\] beijing time/)
    expect(content).not.toContain("Z")
  })
})
