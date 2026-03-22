import {
  app,
  BrowserWindow,
  screen,
  session,
  shell,
  type BrowserWindowConstructorOptions,
} from "electron"
import { join } from "path"
import { emitDesktopRuntimeUpdate } from "./ipc/system"
import {
  flushTelemetryService,
  initTelemetryService,
  trackTelemetryEvent,
} from "./lib/telemetry/service"
import { logInfo, logWarn } from "./lib/structured-log"
import { initUpdater, shutdownUpdater } from "./lib/updater"
import { recoverBatchStates } from "./lib/batch-state"
import { recoverRuntimeState } from "./lib/run-recovery"
import {
  configureDeepLinkProtocol,
  extractDeepLinkUrl,
  handleDeepLink,
} from "./deep-links"
import { initHubCatalogRefresh } from "./lib/templates/hub-catalog"
import { registerMainHandlers } from "./register-handlers"
import { applyRuntimePathOverrides, shouldSuppressStartupSideEffects } from "./lib/runtime-paths"
import {
  prepareElectronSmokeLaunchState,
  resolveElectronSmokeScenario,
  runElectronSmokeScenarioIfRequested,
  shouldShowElectronSmokeWindow,
} from "./lib/electron-smoke"
import {
  areBoundsEqual,
  loadWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  normalizeBounds,
  normalizeWindowState,
  persistWindowState,
} from "./window-state"
import {
  applyContentSecurityPolicyHeader,
  buildRendererContentSecurityPolicy,
  isSafeExternalUrl,
  shouldApplyRendererCsp,
} from "./security"

app.name = "c8c"
applyRuntimePathOverrides({ app })

configureDeepLinkProtocol()

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let pendingDeepLinkUrl: string | null = null
const processStartedAt = Date.now()
let isCreatingWindow = false
let quitFlushStarted = false
const suppressStartupSideEffects = shouldSuppressStartupSideEffects()
let rendererSecurityHeadersInstalled = false

function installRendererContentSecurityPolicy(): void {
  if (rendererSecurityHeadersInstalled) return
  rendererSecurityHeadersInstalled = true

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const policy = buildRendererContentSecurityPolicy(rendererUrl)

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== "mainFrame" || !shouldApplyRendererCsp(details.url, rendererUrl)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    callback({
      responseHeaders: applyContentSecurityPolicyHeader(details.responseHeaders, policy),
    })
  })
}

// macOS: open-url fires before whenReady on cold launch
app.on("open-url", (event, url) => {
  event.preventDefault()
  if (mainWindow && !mainWindow.isDestroyed()) {
    void handleDeepLink(url, mainWindow)
  } else {
    pendingDeepLinkUrl = url
  }
})

// Windows/Linux: second instance receives URL via argv
app.on("second-instance", (_event, argv) => {
  const url = extractDeepLinkUrl(argv)
  if (url) void handleDeepLink(url, mainWindow)
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

function createWindow() {
  const isMac = process.platform === "darwin"
  const smokeScenario = resolveElectronSmokeScenario()
  const keepSmokeWindowVisible = shouldShowElectronSmokeWindow()
  const useHiddenSmokeWindow = Boolean(smokeScenario && !keepSmokeWindowVisible)
  if (mainWindow || isCreatingWindow) return
  isCreatingWindow = true
  void loadWindowState().then((savedState) => {
    if (mainWindow) return
    const saved = normalizeWindowState(savedState)

    const windowOptions: BrowserWindowConstructorOptions = {
      title: "c8c",
      icon: join(__dirname, "../../build/icon.png"),
      width: saved.width,
      height: saved.height,
      ...(typeof saved.x === "number" && typeof saved.y === "number" ? { x: saved.x, y: saved.y } : {}),
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      ...(useHiddenSmokeWindow ? { paintWhenInitiallyHidden: true } : {}),
      autoHideMenuBar: !isMac,
      ...(isMac ? {
        titleBarStyle: "hidden",
        trafficLightPosition: { x: 12, y: 12 },
      } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        ...(useHiddenSmokeWindow ? { backgroundThrottling: false } : {}),
      },
    }

    mainWindow = new BrowserWindow(windowOptions)
    const window = mainWindow
    let smokeRunStarted = false

    const emitRuntime = () => emitDesktopRuntimeUpdate(window)
    let persistTimer: ReturnType<typeof setTimeout> | null = null

    const schedulePersist = () => {
      if (persistTimer) {
        clearTimeout(persistTimer)
      }
      persistTimer = setTimeout(() => {
        if (!window.isDestroyed()) {
          void persistWindowState(window)
        }
      }, 180)
    }

    const ensureWindowVisible = () => {
      if (window.isDestroyed() || window.isMaximized() || window.isFullScreen()) return
      const current = window.getBounds()
      const normalized = normalizeBounds(current)
      if (!areBoundsEqual(current, normalized)) {
        window.setBounds(normalized, false)
      }
    }

    const onDisplayChanged = () => {
      ensureWindowVisible()
    }

    screen.on("display-added", onDisplayChanged)
    screen.on("display-removed", onDisplayChanged)
    screen.on("display-metrics-changed", onDisplayChanged)

    if (saved.isMaximized) {
      window.maximize()
    }

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url)
      }
      return { action: "deny" }
    })

    window.webContents.on("will-navigate", (event, url) => {
      if (url === window.webContents.getURL()) return
      event.preventDefault()
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url)
      }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void window.loadFile(join(__dirname, "../renderer/index.html"))
    }

    window.once("ready-to-show", () => {
      if (!useHiddenSmokeWindow) {
        window.show()
      }
      emitRuntime()
    })

    window.webContents.on("did-finish-load", () => {
      emitRuntime()
      if (pendingDeepLinkUrl) {
        void handleDeepLink(pendingDeepLinkUrl, window)
        pendingDeepLinkUrl = null
      }
      if (!smokeRunStarted) {
        smokeRunStarted = true
        runElectronSmokeScenarioIfRequested(window)
      }
    })

    window.on("resize", schedulePersist)
    window.on("move", schedulePersist)
    window.on("maximize", () => {
      schedulePersist()
      emitRuntime()
    })
    window.on("unmaximize", () => {
      schedulePersist()
      emitRuntime()
      ensureWindowVisible()
    })
    window.on("enter-full-screen", emitRuntime)
    window.on("leave-full-screen", emitRuntime)

    window.on("close", () => {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      void persistWindowState(window)
    })

    window.on("closed", () => {
      screen.off("display-added", onDisplayChanged)
      screen.off("display-removed", onDisplayChanged)
      screen.off("display-metrics-changed", onDisplayChanged)
      mainWindow = null
    })
  }).catch((error) => {
    logWarn("main", "create_window_failed", {
      error: error instanceof Error ? error.message : String(error),
    })
  }).finally(() => {
    isCreatingWindow = false
  })
}

app.whenReady().then(async () => {
  installRendererContentSecurityPolicy()
  const useHiddenSmokeWindow = Boolean(resolveElectronSmokeScenario() && !shouldShowElectronSmokeWindow())
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(join(__dirname, "../../build/icon.png"))
      if (useHiddenSmokeWindow) {
        app.dock.hide()
      }
    } catch (error) {
      logWarn("main", "dock_icon_set_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!suppressStartupSideEffects) {
    try {
      await initTelemetryService()
      await trackTelemetryEvent("app_started")
    } catch (error) {
      logWarn("main", "telemetry_init_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const recovery = await recoverRuntimeState()
      await trackTelemetryEvent("runtime_recovery_completed", {
        roots: recovery.roots,
        workspaces: recovery.workspaces,
        stale_runs_updated: recovery.staleRunsUpdated,
        manifests_processed: recovery.manifestsProcessed,
        orphan_pids_killed: recovery.orphanPidsKilled,
        orphan_pids_missing: recovery.orphanPidsMissing,
        orphan_pids_failed: recovery.orphanPidsFailed,
      })
    } catch (error) {
      logWarn("main", "runtime_recovery_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const batchRecovery = await recoverBatchStates()
      await trackTelemetryEvent("batch_recovery_completed", {
        roots: batchRecovery.roots,
        workspaces: batchRecovery.workspaces,
        interrupted: batchRecovery.interrupted,
      })
    } catch (error) {
      logWarn("main", "batch_recovery_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logInfo("main", "register_handlers_started")
  registerMainHandlers(() => mainWindow)

  logInfo("main", "register_handlers_completed")
  if (!suppressStartupSideEffects) {
    initHubCatalogRefresh()
  }
  await prepareElectronSmokeLaunchState()
  createWindow()
  if (app.isPackaged && !suppressStartupSideEffects) {
    initUpdater()
  }
  if (!suppressStartupSideEffects) {
    try {
      await trackTelemetryEvent("app_ready", { startup_ms: Date.now() - processStartedAt })
    } catch (error) {
      logWarn("main", "telemetry_app_ready_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("before-quit", (event) => {
  if (!suppressStartupSideEffects) {
    shutdownUpdater()
  }
  if (quitFlushStarted) return
  if (suppressStartupSideEffects) return
  quitFlushStarted = true
  event.preventDefault()
  void (async () => {
    try {
      await trackTelemetryEvent("app_quit", { uptime_ms: Date.now() - processStartedAt })
      await flushTelemetryService()
    } catch (error) {
      logWarn("main", "telemetry_quit_flush_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      app.quit()
    }
  })()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
