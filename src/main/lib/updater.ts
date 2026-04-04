import {
  autoUpdater,
  type UpdateDownloadedEvent,
  type UpdateInfo as ElectronUpdateInfo,
} from "electron-updater"
import { app, BrowserWindow } from "electron"
import type { UpdateInfo, UpdateEvent } from "@shared/types"
import { trackTelemetryEvent } from "./telemetry/service"

let currentUpdateInfo: UpdateInfo = { status: "idle" }
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
const INITIAL_DELAY_MS = 15_000
let checkTimer: ReturnType<typeof setInterval> | null = null

function sendToAllWindows(event: UpdateEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("update:event", event)
    }
  }
}

function updateState(info: Partial<UpdateInfo>): void {
  currentUpdateInfo = { ...currentUpdateInfo, ...info }
}

export function getUpdateStatus(): UpdateInfo {
  return { ...currentUpdateInfo }
}

export async function checkForUpdate(): Promise<void> {
  if (!app.isPackaged) {
    updateState({
      status: "error",
      error: "Auto-updates are not available in development mode.",
    })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateState({ status: "error", error: message })
    sendToAllWindows({ type: "error", message })
  }
}

/** Set by installUpdate() so the before-quit handler can skip the async
 *  telemetry flush that would otherwise break autoUpdater's quit-and-install
 *  lifecycle. */
let isUpdaterQuitting = false

export function isQuittingForUpdate(): boolean {
  return isUpdaterQuitting
}

export function installUpdate(): void {
  isUpdaterQuitting = true
  autoUpdater.quitAndInstall(false, true)
}

export function initUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("checking-for-update", () => {
    updateState({ status: "checking", error: undefined })
    sendToAllWindows({ type: "checking" })
    void trackTelemetryEvent("update_check_started")
  })

  autoUpdater.on("update-available", (info: ElectronUpdateInfo) => {
    updateState({ status: "available", version: info.version })
    sendToAllWindows({ type: "available", version: info.version })
    void trackTelemetryEvent("update_check_result", {
      available: true,
      target_version: info.version,
    })
  })

  autoUpdater.on("update-not-available", (_info: ElectronUpdateInfo) => {
    updateState({ status: "not-available" })
    sendToAllWindows({ type: "not-available" })
    void trackTelemetryEvent("update_check_result", { available: false })
  })

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent)
    updateState({ status: "downloading", progress: percent })
    sendToAllWindows({ type: "download-progress", percent })
  })

  autoUpdater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
    updateState({ status: "downloaded", version: info.version, progress: 100 })
    sendToAllWindows({ type: "downloaded", version: info.version })
  })

  autoUpdater.on("error", (err) => {
    const message = err?.message ?? "Unknown update error"
    updateState({ status: "error", error: message })
    sendToAllWindows({ type: "error", message })
  })

  // Initial check after delay, then periodic
  setTimeout(() => {
    void checkForUpdate()
    checkTimer = setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS)
  }, INITIAL_DELAY_MS)
}

export function shutdownUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
