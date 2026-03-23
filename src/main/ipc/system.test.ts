import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProviderDiagnostics } from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const getProviderSettingsMock = vi.fn()
const updateProviderSettingsMock = vi.fn()
const setCodexApiKeyMock = vi.fn()
const clearCodexApiKeyMock = vi.fn()
const getTelemetrySettingsMock = vi.fn()
const setTelemetryConsentMock = vi.fn()
const trackTelemetryUiEventMock = vi.fn()
const checkForUpdateMock = vi.fn()
const installUpdateMock = vi.fn()
const getUpdateStatusMock = vi.fn()
const getClaudeCodeSubscriptionStatusMock = vi.fn()
const allowedProjectRootsMock = vi.fn()
const allowedOpenPathRootsMock = vi.fn()
const isRegisteredRootMock = vi.fn()
const assertWithinRootsMock = vi.fn((...args: unknown[]) => args[0] as string)
const resolveAgentProviderMock = vi.fn()

vi.mock("electron", () => ({
  app: {
    getVersion: vi.fn(() => "0.0.0"),
    isReady: vi.fn(() => true),
    name: "c8c",
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}))

vi.mock("../lib/provider-settings", () => ({
  getProviderSettings: (...args: unknown[]) => getProviderSettingsMock(...args),
  updateProviderSettings: (...args: unknown[]) =>
    updateProviderSettingsMock(...args),
  setCodexApiKey: (...args: unknown[]) => setCodexApiKeyMock(...args),
  clearCodexApiKey: (...args: unknown[]) => clearCodexApiKeyMock(...args),
}))

vi.mock("../lib/claude-subscription", () => ({
  getClaudeCodeSubscriptionStatus: (...args: unknown[]) =>
    getClaudeCodeSubscriptionStatusMock(...args),
}))

vi.mock("../lib/telemetry/service", () => ({
  getTelemetrySettings: (...args: unknown[]) =>
    getTelemetrySettingsMock(...args),
  setTelemetryConsent: (...args: unknown[]) => setTelemetryConsentMock(...args),
  trackTelemetryUiEvent: (...args: unknown[]) =>
    trackTelemetryUiEventMock(...args),
}))

vi.mock("../lib/updater", () => ({
  checkForUpdate: (...args: unknown[]) => checkForUpdateMock(...args),
  installUpdate: (...args: unknown[]) => installUpdateMock(...args),
  getUpdateStatus: (...args: unknown[]) => getUpdateStatusMock(...args),
}))

vi.mock("../lib/security-paths", () => ({
  allowedOpenPathRoots: (...args: unknown[]) =>
    allowedOpenPathRootsMock(...args),
  allowedProjectRoots: (...args: unknown[]) => allowedProjectRootsMock(...args),
  isRegisteredRoot: (...args: unknown[]) => isRegisteredRootMock(...args),
  assertWithinRoots: (...args: unknown[]) => assertWithinRootsMock(...args),
}))

vi.mock("../lib/runtime-paths", () => ({
  isTestMode: () => false,
}))

vi.mock("../lib/claude-cli", () => ({
  execClaude: vi.fn(),
}))

vi.mock("../lib/codex-cli", () => ({
  execCodex: vi.fn(),
}))

vi.mock("../lib/providers", () => ({
  resolveAgentProvider: (...args: unknown[]) =>
    resolveAgentProviderMock(...args),
}))

describe("system IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.useFakeTimers()
    ipcHandlers.clear()
    getProviderSettingsMock.mockResolvedValue({
      defaultProvider: "claude",
      safetyProfile: "workspace_auto",
      features: { codexProvider: true },
    })
    updateProviderSettingsMock.mockImplementation(async (patch) => patch)
    setCodexApiKeyMock.mockResolvedValue(true)
    clearCodexApiKeyMock.mockResolvedValue(true)
    getTelemetrySettingsMock.mockResolvedValue({ enabled: false })
    setTelemetryConsentMock.mockResolvedValue({ enabled: true })
    trackTelemetryUiEventMock.mockResolvedValue(true)
    checkForUpdateMock.mockResolvedValue({ status: "idle" })
    installUpdateMock.mockResolvedValue(true)
    getUpdateStatusMock.mockResolvedValue({ status: "idle" })
    getClaudeCodeSubscriptionStatusMock.mockResolvedValue(null)
    allowedProjectRootsMock.mockResolvedValue([])
    allowedOpenPathRootsMock.mockResolvedValue([])
    isRegisteredRootMock.mockImplementation(
      (candidatePath: string, rootPath: string) => candidatePath === rootPath,
    )
    resolveAgentProviderMock.mockImplementation(
      (provider: "claude" | "codex") => ({
        checkAvailability: vi.fn(async () => ({
          provider,
          available: true,
          version: "1.0.0",
          error: null,
        })),
        getAuthStatus: vi.fn(async () => ({
          provider,
          state: "authenticated",
          authenticated: true,
          error: null,
        })),
      }),
    )
  })

  it("rejects malformed provider settings patches before mutation", async () => {
    const { registerSystemHandlers } = await import("./system")
    registerSystemHandlers()

    const updateHandler = ipcHandlers.get("system:update-provider-settings") as
      | ((event: unknown, patch: unknown) => Promise<unknown>)
      | undefined
    expect(updateHandler).toBeDefined()

    await expect(
      updateHandler!(undefined, { defaultProvider: "invalid" }),
    ).rejects.toThrow("Invalid provider settings payload")
    expect(updateProviderSettingsMock).not.toHaveBeenCalled()
  })

  it("rejects overly long Codex API keys before encryption", async () => {
    const { registerSystemHandlers } = await import("./system")
    registerSystemHandlers()

    const setKeyHandler = ipcHandlers.get("system:set-codex-api-key") as
      | ((event: unknown, apiKey: string) => Promise<unknown>)
      | undefined
    expect(setKeyHandler).toBeDefined()

    await expect(setKeyHandler!(undefined, "x".repeat(8_193))).rejects.toThrow(
      "Codex API key must be 8192 characters or fewer",
    )
    expect(setCodexApiKeyMock).not.toHaveBeenCalled()
  })

  it("times out hung provider diagnostics checks instead of hanging indefinitely", async () => {
    const pending = new Promise<never>(() => undefined)
    resolveAgentProviderMock.mockImplementation(
      (provider: "claude" | "codex") => ({
        checkAvailability: vi.fn(() => pending),
        getAuthStatus: vi.fn(() => pending),
      }),
    )

    const { registerSystemHandlers } = await import("./system")
    registerSystemHandlers()

    const diagnosticsHandler = ipcHandlers.get(
      "system:get-provider-diagnostics",
    ) as ((event: unknown) => Promise<ProviderDiagnostics>) | undefined
    expect(diagnosticsHandler).toBeDefined()

    const diagnosticsPromise = diagnosticsHandler!(undefined)
    await vi.advanceTimersByTimeAsync(4_000)
    const diagnostics = await diagnosticsPromise

    expect(diagnostics.health.claude).toMatchObject({
      available: false,
      error: "Timed out after 4000ms",
    })
    expect(diagnostics.auth.codex).toMatchObject({
      authenticated: false,
      state: "unknown",
      error: "Timed out after 4000ms",
    })
  })

  it("checks canonical project registration before resolving git status", async () => {
    allowedProjectRootsMock.mockResolvedValue(["/safe/project"])
    isRegisteredRootMock.mockReturnValue(true)

    const { registerSystemHandlers } = await import("./system")
    registerSystemHandlers()

    const projectStatusHandler = ipcHandlers.get(
      "system:get-project-status",
    ) as
      | ((
          event: unknown,
          projectPath: string | null,
        ) => Promise<{ branch: string | null }>)
      | undefined
    expect(projectStatusHandler).toBeDefined()

    await expect(
      projectStatusHandler!(undefined, "/safe/project-link"),
    ).resolves.toEqual({ branch: null })
    expect(isRegisteredRootMock).toHaveBeenCalledWith(
      "/safe/project-link",
      "/safe/project",
    )
  })
})
