import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DiscoveredSkill } from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

const getLibrariesMock = vi.fn()
const installLibraryMock = vi.fn()
const removeLibraryMock = vi.fn()
const scanAllLibrariesMock = vi.fn()
const trackTelemetryEventMock = vi.fn<(...args: unknown[]) => Promise<void>>(
  () => Promise.resolve(),
)

const PREDEFINED_LIBRARIES = [
  {
    id: "anthropic-skills",
    name: "Anthropic Skills",
    description: "Official skills",
    repo: "https://github.com/anthropics/skills.git",
    enabled: true,
    scanPattern: {
      type: "skill-dirs" as const,
      root: "skills",
      category: "anthropic",
      skillType: "skill" as const,
    },
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

vi.mock("../lib/libraries", () => ({
  getLibraries: (...args: unknown[]) => getLibrariesMock(...args),
  installLibrary: (...args: unknown[]) => installLibraryMock(...args),
  removeLibrary: (...args: unknown[]) => removeLibraryMock(...args),
  scanAllLibraries: (...args: unknown[]) => scanAllLibrariesMock(...args),
  PREDEFINED_LIBRARIES,
}))

vi.mock("../lib/telemetry/service", () => ({
  trackTelemetryEvent: (...args: unknown[]) => trackTelemetryEventMock(...args),
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

describe("libraries IPC locks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    getLibrariesMock.mockResolvedValue([])
    removeLibraryMock.mockResolvedValue(undefined)
    scanAllLibrariesMock.mockResolvedValue([])
  })

  it("serializes concurrent install operations for the same library", async () => {
    const releaseFirstInstall = deferred<void>()
    let active = 0
    let maxActive = 0
    let callCount = 0

    installLibraryMock.mockImplementation(async () => {
      callCount += 1
      active += 1
      maxActive = Math.max(maxActive, active)
      if (callCount === 1) {
        await releaseFirstInstall.promise
      }
      active -= 1
    })

    const { registerLibrariesHandlers } = await import("./libraries")
    registerLibrariesHandlers()

    const installHandler = ipcHandlers.get("libraries:install") as
      | ((event: unknown, id: string) => Promise<boolean>)
      | undefined
    expect(installHandler).toBeDefined()

    const firstInstall = installHandler!(undefined, "anthropic-skills")
    await Promise.resolve()
    const secondInstall = installHandler!(undefined, "anthropic-skills")
    await Promise.resolve()

    expect(installLibraryMock).toHaveBeenCalledTimes(1)

    releaseFirstInstall.resolve()
    await Promise.all([firstInstall, secondInstall])

    expect(installLibraryMock).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
  })

  it("dedupes concurrent scan requests and waits for active mutations", async () => {
    const releaseInstall = deferred<void>()
    const discovered: DiscoveredSkill[] = [
      {
        type: "skill",
        name: "writer",
        description: "writer",
        category: "anthropic",
        path: "/home/.c8c/libraries/anthropic-skills/skills/writer/SKILL.md",
        library: "anthropic-skills",
      },
    ]

    installLibraryMock.mockImplementation(async () => {
      await releaseInstall.promise
    })
    scanAllLibrariesMock.mockResolvedValue(discovered)

    const { registerLibrariesHandlers } = await import("./libraries")
    registerLibrariesHandlers()

    const installHandler = ipcHandlers.get("libraries:install") as
      | ((event: unknown, id: string) => Promise<boolean>)
      | undefined
    const scanHandler = ipcHandlers.get("libraries:scan") as
      | ((event: unknown) => Promise<DiscoveredSkill[]>)
      | undefined
    expect(installHandler).toBeDefined()
    expect(scanHandler).toBeDefined()

    const pendingInstall = installHandler!(undefined, "anthropic-skills")
    await Promise.resolve()

    const firstScan = scanHandler!(undefined)
    const secondScan = scanHandler!(undefined)
    await Promise.resolve()

    expect(scanAllLibrariesMock).not.toHaveBeenCalled()

    releaseInstall.resolve()
    const [firstResult, secondResult] = await Promise.all([
      firstScan,
      secondScan,
    ])
    await pendingInstall

    expect(scanAllLibrariesMock).toHaveBeenCalledTimes(1)
    expect(firstResult).toEqual(discovered)
    expect(secondResult).toEqual(discovered)
  })
})
