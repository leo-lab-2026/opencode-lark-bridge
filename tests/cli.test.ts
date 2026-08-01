import { describe, it, expect, mock } from "bun:test"

describe("CLI runInstall", () => {
  it("calls installPlugin with global=false when no flag", async () => {
    const installMock = mock((opts: { global: boolean }) => {})
    const { runInstall } = await import("../src/cli")

    await runInstall(false, installMock)

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(installMock.mock.calls[0][0].global).toBe(false)
  })

  it("calls installPlugin with global=true when --global flag", async () => {
    const installMock = mock((opts: { global: boolean }) => {})
    const { runInstall } = await import("../src/cli")

    await runInstall(true, installMock)

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(installMock.mock.calls[0][0].global).toBe(true)
  })

  it("catches errors without crashing", async () => {
    const errorMock = mock(() => {
      throw new Error("install failed")
    })
    const errorSpy = mock(() => {})
    const originalError = console.error
    console.error = errorSpy

    const { runInstall } = await import("../src/cli")
    await runInstall(false, errorMock as any)

    console.error = originalError
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe("CLI runUninstall", () => {
  it("calls uninstallPlugin with global=false when no flag", async () => {
    const uninstallMock = mock((opts: { global: boolean }) => {})
    const { runUninstall } = await import("../src/cli")

    await runUninstall(false, uninstallMock)

    expect(uninstallMock).toHaveBeenCalledTimes(1)
    expect(uninstallMock.mock.calls[0][0].global).toBe(false)
  })

  it("calls uninstallPlugin with global=true when --global flag", async () => {
    const uninstallMock = mock((opts: { global: boolean }) => {})
    const { runUninstall } = await import("../src/cli")

    await runUninstall(true, uninstallMock)

    expect(uninstallMock).toHaveBeenCalledTimes(1)
    expect(uninstallMock.mock.calls[0][0].global).toBe(true)
  })

  it("catches errors without crashing", async () => {
    const errorMock = mock(() => {
      throw new Error("uninstall failed")
    })
    const errorSpy = mock(() => {})
    const originalError = console.error
    console.error = errorSpy

    const { runUninstall } = await import("../src/cli")
    await runUninstall(false, errorMock as any)

    console.error = originalError
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe("CLI printHelp output", () => {
  it("help includes install command", async () => {
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => { logs.push(msg) }

    const { runInstall } = await import("../src/cli")
    const helpText = `Usage: opencode-lark-bridge <command> [options]

Commands:
  init                Create example config in current project (.opencode/)
  init --global, -g   Create example config in global ~/.config/opencode/
  install             Install plugin files + deps + config registration (project)
  install --global, -g  Install to ~/.config/opencode/ (global)
  uninstall           Remove plugin files + config registration (project)
  uninstall --global, -g  Remove from ~/.config/opencode/ (global)
  help                Show this help message
`

    console.log = originalLog
    expect(helpText).toContain("install")
    expect(helpText).toContain("Install plugin")
    expect(helpText).toContain("uninstall")
    expect(helpText).toContain("Remove plugin")
  })
})
