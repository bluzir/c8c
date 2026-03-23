import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type UpdateHandler = (...args: any[]) => void

const updaterState = vi.hoisted(() => ({
  handlers: new Map<string, UpdateHandler>(),
  checkForUpdates: vi.fn(async () => undefined),
  quitAndInstall: vi.fn(),
  trackTelemetryEvent: vi.fn(async () => undefined),
  windows: [] as Array<{
    isDestroyed: () => boolean
    webContents: { send: ReturnType<typeof vi.fn> }
  }>,
  isPackaged: true,
}))

vi.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn((event: string, handler: UpdateHandler) => {
      updaterState.handlers.set(event, handler)
    }),
    checkForUpdates: (...args: unknown[]) =>
      updaterState.checkForUpdates(...args),
    quitAndInstall: (...args: unknown[]) =>
      updaterState.quitAndInstall(...args),
  },
}))

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return updaterState.isPackaged
    },
  },
  BrowserWindow: {
    getAllWindows: () => updaterState.windows,
  },
}))

vi.mock("./telemetry/service", () => ({
  trackTelemetryEvent: (...args: unknown[]) =>
    updaterState.trackTelemetryEvent(...args),
}))

function createWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: {
      send: vi.fn(),
    },
  }
}

async function loadUpdaterModule() {
  return import("./updater")
}

describe("updater", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.resetModules()
    updaterState.handlers.clear()
    updaterState.checkForUpdates.mockReset()
    updaterState.checkForUpdates.mockResolvedValue(undefined)
    updaterState.quitAndInstall.mockReset()
    updaterState.trackTelemetryEvent.mockReset()
    updaterState.trackTelemetryEvent.mockResolvedValue(undefined)
    updaterState.windows = []
    updaterState.isPackaged = true
  })

  afterEach(async () => {
    const updater = await loadUpdaterModule()
    updater.shutdownUpdater()
    vi.useRealTimers()
  })

  it("returns a development-mode error instead of checking for updates", async () => {
    updaterState.isPackaged = false
    const updater = await loadUpdaterModule()

    await updater.checkForUpdate()

    expect(updaterState.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.getUpdateStatus()).toEqual({
      status: "error",
      error: "Auto-updates are not available in development mode.",
    })
  })

  it("wires updater events into state, telemetry, and window broadcasts", async () => {
    const liveWindow = createWindow(false)
    const destroyedWindow = createWindow(true)
    updaterState.windows = [liveWindow, destroyedWindow]

    const updater = await loadUpdaterModule()
    updater.initUpdater()

    updaterState.handlers.get("checking-for-update")?.()
    expect(updater.getUpdateStatus()).toEqual({
      status: "checking",
      error: undefined,
    })
    expect(liveWindow.webContents.send).toHaveBeenCalledWith("update:event", {
      type: "checking",
    })
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
    expect(updaterState.trackTelemetryEvent).toHaveBeenCalledWith(
      "update_check_started",
    )

    updaterState.handlers.get("update-available")?.({ version: "1.2.3" })
    expect(updater.getUpdateStatus()).toEqual({
      status: "available",
      error: undefined,
      version: "1.2.3",
    })
    expect(liveWindow.webContents.send).toHaveBeenCalledWith("update:event", {
      type: "available",
      version: "1.2.3",
    })

    updaterState.handlers.get("download-progress")?.({ percent: 42.2 })
    expect(updater.getUpdateStatus()).toEqual({
      status: "downloading",
      error: undefined,
      version: "1.2.3",
      progress: 42,
    })

    updaterState.handlers.get("update-downloaded")?.({ version: "1.2.4" })
    expect(updater.getUpdateStatus()).toEqual({
      status: "downloaded",
      error: undefined,
      version: "1.2.4",
      progress: 100,
    })

    updaterState.handlers.get("update-not-available")?.({ version: "1.2.4" })
    expect(updater.getUpdateStatus()).toEqual({
      status: "not-available",
      error: undefined,
      version: "1.2.4",
      progress: 100,
    })
    expect(updaterState.trackTelemetryEvent).toHaveBeenCalledWith(
      "update_check_result",
      { available: false },
    )

    updaterState.handlers.get("error")?.(new Error("network down"))
    expect(updater.getUpdateStatus()).toEqual({
      status: "error",
      error: "network down",
      version: "1.2.4",
      progress: 100,
    })
    expect(liveWindow.webContents.send).toHaveBeenCalledWith("update:event", {
      type: "error",
      message: "network down",
    })
  })

  it("schedules an initial check and recurring checks", async () => {
    const updater = await loadUpdaterModule()
    updater.initUpdater()

    expect(updaterState.checkForUpdates).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(updaterState.checkForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(updaterState.checkForUpdates).toHaveBeenCalledTimes(2)

    updater.shutdownUpdater()
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(updaterState.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it("installs updates via quitAndInstall", async () => {
    const updater = await loadUpdaterModule()

    updater.installUpdate()

    expect(updaterState.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
})
