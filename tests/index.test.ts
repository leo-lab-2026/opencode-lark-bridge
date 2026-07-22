import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { OpenCodeLarkBridge as plugin } from "../src/index"
import { resolveConfigPath } from "../src/index"

describe("plugin entry", () => {
  it("returns hooks object with event function", async () => {
    const hooks = await plugin({ directory: "/tmp", worktree: "/tmp" } as any)
    expect(hooks.event).toBeFunction()
  })

  it("returns no-op event when config is missing", async () => {
    const hooks = await plugin({ directory: "/tmp", worktree: "/tmp" } as any)
    await hooks.event({ event: { type: "session.idle" } })
  })

  describe("deployed plugin config resolution", () => {
    let tempDir: string
    let logFile: string

    beforeEach(() => {
      tempDir = mkdtempSync(path.join(tmpdir(), "opencode-lark-bridge-"))
      mkdirSync(path.join(tempDir, ".opencode"), { recursive: true })
      logFile = path.join(tempDir, "plugin.log")
    })

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })

    it("loads config from ctx.directory when deployed", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
        })
      )

      const hooks = await plugin({ directory: tempDir, worktree: tempDir } as any)
      expect(hooks.event).toBeFunction()

      const logs = readFileSync(logFile, "utf-8")
      expect(logs).toContain("Plugin initialized")
      expect(logs).toContain(tempDir)
    })

    it("exposes permission.ask hook", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
        })
      )

      const hooks = await plugin({ directory: tempDir, worktree: tempDir } as any)
      expect(hooks["permission.ask"]).toBeFunction()
    })

    it("exposes session.idle hook", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
        })
      )

      const hooks = await plugin({ directory: tempDir, worktree: tempDir } as any)
      expect(hooks["session.idle"]).toBeFunction()
    })

    it("sends completion notification via session.idle hook", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
          categories: { completion: { target: { chat_id: "oc_completion" } } },
        })
      )

      const hooks = await plugin({ directory: tempDir, worktree: tempDir } as any)
      await hooks["session.idle"]({
        session: {
          id: "ses_main_1",
          projectName: "Test Project",
          title: "Create a.md",
        },
      })

      const logs = readFileSync(logFile, "utf-8")
      expect(logs).toContain("Sending completion notification")
      expect(logs).toContain("Create a.md")
    }, 10000)

    it("sends completion notification via event hook with real OpenCode event shape", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
          categories: { completion: { target: { chat_id: "oc_completion" } } },
        })
      )

      const hooks = await plugin({
        directory: tempDir,
        worktree: tempDir,
        project: { name: "Real Project" },
      } as any)

      await hooks.event({
        event: {
          type: "session.created",
          properties: {
            info: {
              id: "ses_real_1",
              title: "Refactor auth",
            },
          },
        },
      })

      await hooks.event({
        event: {
          type: "session.idle",
          properties: { sessionID: "ses_real_1" },
        },
      })

      const logs = readFileSync(logFile, "utf-8")
      expect(logs).toContain("Sending completion notification")
      expect(logs).toContain("Real Project")
      expect(logs).toContain("Refactor auth")
    }, 10000)

    it("falls back to sessionID when session title is not cached", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
          categories: { completion: { target: { chat_id: "oc_completion" } } },
        })
      )

      const hooks = await plugin({
        directory: tempDir,
        worktree: tempDir,
        project: { name: "Real Project" },
      } as any)

      await hooks.event({
        event: {
          type: "session.idle",
          properties: { sessionID: "ses_unknown_1" },
        },
      })

      const logs = readFileSync(logFile, "utf-8")
      expect(logs).toContain("Sending completion notification")
      expect(logs).toContain("Real Project")
      expect(logs).toContain("ses_unknown_1")
    }, 10000)

    it("falls back to directory basename when project name is missing", async () => {
      const projectDir = mkdtempSync(path.join(tmpdir(), "my-awesome-project-"))
      mkdirSync(path.join(projectDir, ".opencode"), { recursive: true })
      const logFileForProject = path.join(projectDir, "plugin.log")

      writeFileSync(
        path.join(projectDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFileForProject,
          categories: { completion: { target: { chat_id: "oc_completion" } } },
        })
      )

      const dirName = path.basename(projectDir)
      const hooks = await plugin({
        directory: projectDir,
        worktree: projectDir,
      } as any)

      await hooks["session.idle"]({
        session: {
          id: "ses_main_2",
          title: "Fix login bug",
        },
      })

      const logs = readFileSync(logFileForProject, "utf-8")
      expect(logs).toContain("Sending completion notification")
      expect(logs).toContain(dirName)
      expect(logs).toContain("Fix login bug")

      rmSync(projectDir, { recursive: true, force: true })
    }, 10000)

    it("falls back to directory basename when project name is empty", async () => {
      const projectDir = mkdtempSync(path.join(tmpdir(), "unnamed-project-"))
      mkdirSync(path.join(projectDir, ".opencode"), { recursive: true })
      const logFileForProject = path.join(projectDir, "plugin.log")

      writeFileSync(
        path.join(projectDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFileForProject,
          categories: { completion: { target: { chat_id: "oc_completion" } } },
        })
      )

      const dirName = path.basename(projectDir)
      const hooks = await plugin({
        directory: projectDir,
        worktree: projectDir,
        project: { name: "" },
      } as any)

      await hooks["session.idle"]({
        session: {
          id: "ses_main_3",
          title: "Refactor auth",
        },
      })

      const logs = readFileSync(logFileForProject, "utf-8")
      expect(logs).toContain("Sending completion notification")
      expect(logs).toContain(dirName)
      expect(logs).toContain("Refactor auth")

      rmSync(projectDir, { recursive: true, force: true })
    }, 10000)

    it("injects projectName for question.asked events via enhanceEvent", async () => {
      const projectDir = mkdtempSync(path.join(tmpdir(), "question-project-"))
      mkdirSync(path.join(projectDir, ".opencode"), { recursive: true })
      const logFileForProject = path.join(projectDir, "plugin.log")

      writeFileSync(
        path.join(projectDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFileForProject,
          categories: { question: { target: { chat_id: "oc_question" } } },
        })
      )

      const hooks = await plugin({
        directory: projectDir,
        worktree: projectDir,
        project: { name: "Question Project" },
      } as any)

      await hooks.event({
        event: {
          type: "question.asked",
          properties: {
            id: "q_001",
            questions: [
              { question: "What is the answer?", header: "Question 1", options: [] },
            ],
          },
        },
      })

      const logs = readFileSync(logFileForProject, "utf-8")
      expect(logs).toContain("Sending question notification")
      expect(logs).toContain("Question Project")

      rmSync(projectDir, { recursive: true, force: true })
    }, 10000)

    it("injects projectName for question.asked events via event hook with real OpenCode shape", async () => {
      const projectDir = mkdtempSync(path.join(tmpdir(), "question-real-"))
      mkdirSync(path.join(projectDir, ".opencode"), { recursive: true })
      const logFileForProject = path.join(projectDir, "plugin.log")

      writeFileSync(
        path.join(projectDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFileForProject,
          categories: { question: { target: { chat_id: "oc_question" } } },
        })
      )

      const hooks = await plugin({
        directory: projectDir,
        worktree: projectDir,
        project: { name: "Real Question Project" },
      } as any)

      await hooks.event({
        event: {
          type: "question.asked",
          properties: {},
        },
      })

      const logs = readFileSync(logFileForProject, "utf-8")
      expect(logs).toContain("Sending question notification")
      expect(logs).toContain("Real Question Project")
      expect(logs).toContain('"projectName":"Real Question Project"')

      rmSync(projectDir, { recursive: true, force: true })
    }, 10000)
  })
})

describe("resolveConfigPath", () => {
  let projectDir: string
  let globalDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), "lark-project-"))
    globalDir = mkdtempSync(path.join(tmpdir(), "lark-global-"))
    mkdirSync(path.join(projectDir, ".opencode"), { recursive: true })
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(globalDir, { recursive: true, force: true })
  })

  function writeProjectConfig(dir: string, suffix = ""): string {
    const configDir = path.join(dir, ".opencode")
    mkdirSync(configDir, { recursive: true })
    const file = path.join(configDir, "opencode-lark-bridge.config.jsonc")
    writeFileSync(
      file,
      JSON.stringify({
        app_id: "a",
        app_secret: "b",
        default_target: { chat_id: "c" },
        log_file: path.join(dir, `app${suffix}.log`),
      })
    )
    return file
  }

  function writeGlobalConfig(dir: string, suffix = ""): string {
    const file = path.join(dir, "opencode-lark-bridge.config.jsonc")
    writeFileSync(
      file,
      JSON.stringify({
        app_id: "a",
        app_secret: "b",
        default_target: { chat_id: "c" },
        log_file: path.join(dir, `app${suffix}.log`),
      })
    )
    return file
  }

  it("returns null when no candidate exists", () => {
    const result = resolveConfigPath(
      { directory: projectDir },
      globalDir
    )
    expect(result).toBeNull()
  })

  it("ignores a config placed directly in ctx.directory", () => {
    writeFileSync(
      path.join(projectDir, "opencode-lark-bridge.config.jsonc"),
      JSON.stringify({
        app_id: "a",
        app_secret: "b",
        default_target: { chat_id: "c" },
        log_file: path.join(projectDir, "app.log"),
      })
    )

    const result = resolveConfigPath(
      { directory: projectDir },
      globalDir
    )

    expect(result).toBeNull()
  })

  it("resolves project-level .opencode config", () => {
    const projectFile = writeProjectConfig(projectDir, "-project")

    const result = resolveConfigPath(
      { directory: projectDir },
      globalDir
    )

    expect(result).toBe(path.resolve(projectFile))
  })

  it("prefers project-level .opencode config over global", () => {
    const projectFile = writeProjectConfig(projectDir, "-project")
    const globalFile = writeGlobalConfig(globalDir, "-global")

    const result = resolveConfigPath(
      { directory: projectDir },
      globalDir
    )

    expect(result).toBe(path.resolve(projectFile))
    expect(existsSync(globalFile)).toBe(true)
  })

  it("falls back to global config when project-level missing", () => {
    const globalFile = writeGlobalConfig(globalDir, "-global")

    const result = resolveConfigPath(
      { directory: projectDir },
      globalDir
    )

    expect(result).toBe(path.resolve(globalFile))
  })

  it("skips global candidate when ctx.directory already points at the global path", () => {
    const projectFile = writeProjectConfig(globalDir, "-global-as-ctx")
    const globalFile = writeGlobalConfig(globalDir, "-global-root")

    const result = resolveConfigPath(
      { directory: globalDir },
      globalDir
    )

    expect(result).toBe(path.resolve(projectFile))
    expect(existsSync(globalFile)).toBe(true)
  })
})
