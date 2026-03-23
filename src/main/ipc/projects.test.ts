import { beforeEach, describe, expect, it, vi } from "vitest"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const loadProjectsConfigMock = vi.fn()
const saveProjectsConfigMock = vi.fn()
const logInfoMock = vi.fn()
const logWarnMock = vi.fn()

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock("../lib/projects-config", () => ({
  loadProjectsConfig: (...args: unknown[]) => loadProjectsConfigMock(...args),
  saveProjectsConfig: (...args: unknown[]) => saveProjectsConfigMock(...args),
}))

vi.mock("../lib/structured-log", () => ({
  logInfo: (...args: unknown[]) => logInfoMock(...args),
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

describe("projects IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    loadProjectsConfigMock.mockResolvedValue({
      projects: ["/tmp/alpha", "/tmp/beta", "/tmp/gamma"],
      removedCount: 0,
    })
    saveProjectsConfigMock.mockResolvedValue(undefined)
  })

  it("persists reordered projects without dropping unsent entries", async () => {
    const { registerIpcHandlers } = await import("./projects")
    registerIpcHandlers()

    const reorderHandler = ipcHandlers.get("projects:reorder") as
      | ((event: unknown, requestedOrder: string[]) => Promise<string[]>)
      | undefined
    expect(reorderHandler).toBeDefined()

    const reordered = await reorderHandler!(undefined, [
      "/tmp/gamma",
      "/tmp/alpha",
    ])

    expect(saveProjectsConfigMock).toHaveBeenCalledWith({
      projects: ["/tmp/gamma", "/tmp/alpha", "/tmp/beta"],
      removedCount: 0,
    })
    expect(reordered).toEqual(["/tmp/gamma", "/tmp/alpha", "/tmp/beta"])
    expect(logInfoMock).toHaveBeenCalledWith(
      "projects-ipc",
      "projects_reordered",
      {
        projectCount: 3,
      },
    )
  })
})
