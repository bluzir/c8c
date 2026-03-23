import { beforeEach, describe, expect, it, vi } from "vitest"
import type { InstalledPlugin } from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const getMarketplacesMock = vi.fn()
const installMarketplaceMock = vi.fn()
const updateMarketplaceMock = vi.fn()
const removeMarketplaceMock = vi.fn()
const listInstalledPluginsMock = vi.fn()
const setPluginEnabledMock = vi.fn<(...args: unknown[]) => Promise<boolean>>(
  () => Promise.resolve(true),
)

const PREDEFINED_MARKETPLACES = [
  {
    id: "claude-plugins-official",
    name: "Claude Plugins Official",
    description: "Official marketplace",
    repo: "https://github.com/anthropics/claude-plugins-official.git",
    owner: "Anthropic",
  },
]

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
}))

vi.mock("../lib/plugins", () => ({
  getMarketplaces: (...args: unknown[]) => getMarketplacesMock(...args),
  installMarketplace: (...args: unknown[]) => installMarketplaceMock(...args),
  updateMarketplace: (...args: unknown[]) => updateMarketplaceMock(...args),
  removeMarketplace: (...args: unknown[]) => removeMarketplaceMock(...args),
  listInstalledPlugins: (...args: unknown[]) =>
    listInstalledPluginsMock(...args),
  setPluginEnabled: (...args: unknown[]) => setPluginEnabledMock(...args),
  PREDEFINED_MARKETPLACES,
}))

vi.mock("../lib/structured-log", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("plugins IPC locks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    getMarketplacesMock.mockResolvedValue([])
    updateMarketplaceMock.mockResolvedValue(undefined)
    removeMarketplaceMock.mockResolvedValue(undefined)
    listInstalledPluginsMock.mockResolvedValue([])
    setPluginEnabledMock.mockResolvedValue(true)
  })

  it("serializes concurrent install operations for the same marketplace", async () => {
    const releaseFirstInstall = deferred<void>()
    let active = 0
    let maxActive = 0
    let callCount = 0

    installMarketplaceMock.mockImplementation(async () => {
      callCount += 1
      active += 1
      maxActive = Math.max(maxActive, active)
      if (callCount === 1) {
        await releaseFirstInstall.promise
      }
      active -= 1
    })

    const { registerPluginsHandlers } = await import("./plugins")
    registerPluginsHandlers()

    const installHandler = ipcHandlers.get("plugins:install-marketplace") as
      | ((event: unknown, id: string) => Promise<boolean>)
      | undefined
    expect(installHandler).toBeDefined()

    const firstInstall = installHandler!(undefined, "claude-plugins-official")
    await Promise.resolve()
    const secondInstall = installHandler!(undefined, "claude-plugins-official")
    await Promise.resolve()

    expect(installMarketplaceMock).toHaveBeenCalledTimes(1)

    releaseFirstInstall.resolve()
    await Promise.all([firstInstall, secondInstall])

    expect(installMarketplaceMock).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
  })

  it("dedupes concurrent scan requests and waits for active mutations", async () => {
    const releaseInstall = deferred<void>()
    const discovered: InstalledPlugin[] = [
      {
        id: "claude-plugins-official/github",
        name: "github",
        description: "GitHub workflows",
        version: "1.0.0",
        marketplaceId: "claude-plugins-official",
        marketplaceName: "Claude Plugins Official",
        pluginPath:
          "/home/.c8c/plugins/marketplaces/claude-plugins-official/plugins/github",
        enabled: true,
        capabilities: ["skill"],
        assets: [{ capability: "skill", count: 2 }],
      },
    ]

    installMarketplaceMock.mockImplementation(async () => {
      await releaseInstall.promise
    })
    listInstalledPluginsMock.mockResolvedValue(discovered)

    const { registerPluginsHandlers } = await import("./plugins")
    registerPluginsHandlers()

    const installHandler = ipcHandlers.get("plugins:install-marketplace") as
      | ((event: unknown, id: string) => Promise<boolean>)
      | undefined
    const scanHandler = ipcHandlers.get("plugins:scan") as
      | ((event: unknown) => Promise<InstalledPlugin[]>)
      | undefined
    expect(installHandler).toBeDefined()
    expect(scanHandler).toBeDefined()

    const pendingInstall = installHandler!(undefined, "claude-plugins-official")
    await Promise.resolve()

    const firstScan = scanHandler!(undefined)
    const secondScan = scanHandler!(undefined)
    await Promise.resolve()

    expect(listInstalledPluginsMock).not.toHaveBeenCalled()

    releaseInstall.resolve()
    const [firstResult, secondResult] = await Promise.all([
      firstScan,
      secondScan,
    ])
    await pendingInstall

    expect(listInstalledPluginsMock).toHaveBeenCalledTimes(1)
    expect(firstResult).toEqual(discovered)
    expect(secondResult).toEqual(discovered)
  })
})
