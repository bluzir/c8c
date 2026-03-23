import { beforeEach, describe, expect, it, vi } from "vitest"

const { createTelemetryClientMock, logWarnMock, readFileMock } = vi.hoisted(
  () => ({
    createTelemetryClientMock: vi.fn(),
    logWarnMock: vi.fn(),
    readFileMock: vi.fn(),
  }),
)

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/c8c-telemetry"),
    getVersion: vi.fn(() => "1.0.0"),
  },
}))

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  readFile: (...args: unknown[]) => readFileMock(...args),
}))

vi.mock("./index", () => ({
  createTelemetryClient: (...args: unknown[]) =>
    createTelemetryClientMock(...args),
}))

vi.mock("../atomic-write", () => ({
  writeFileAtomic: vi.fn(() => Promise.resolve()),
}))

vi.mock("../structured-log", () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

function createClient(provider = "noop") {
  return {
    provider,
    setConsent: vi.fn(),
    identify: vi.fn(() => Promise.resolve()),
    track: vi.fn(() => Promise.resolve()),
    flush: vi.fn(() => Promise.resolve()),
    shutdown: vi.fn(() => Promise.resolve()),
  }
}

describe("telemetry service", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal("__BUILD_FLAVOR__", "dev")
    vi.stubGlobal("__RELEASE_CHANNEL__", "stable")
    vi.stubGlobal("__TELEMETRY_PROVIDER__", "posthog")
    vi.stubGlobal("__TELEMETRY_LOCAL_TEST__", false)
    vi.stubGlobal("__POSTHOG_HOST__", "https://posthog.example.com")
    vi.stubGlobal("__POSTHOG_KEY__", "test-key")
    vi.stubGlobal("__TELEMETRY_ENABLED__", true)
    createTelemetryClientMock.mockReset()
    logWarnMock.mockReset()
    readFileMock.mockReset()
    readFileMock.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    )
  })

  it("falls back to noop telemetry and retries after an init failure", async () => {
    createTelemetryClientMock
      .mockImplementationOnce(() => createClient())
      .mockImplementationOnce(() => {
        throw new Error("create client failed")
      })
      .mockImplementation(() => createClient())

    const { initTelemetryService, getTelemetrySettings } =
      await import("./service")

    await expect(initTelemetryService()).resolves.toBeUndefined()
    expect(logWarnMock).toHaveBeenCalledWith(
      "telemetry-service",
      "init_failed",
      expect.objectContaining({
        error: "create client failed",
      }),
    )

    await expect(getTelemetrySettings()).resolves.toEqual(
      expect.objectContaining({
        provider: expect.any(String),
      }),
    )
    expect(createTelemetryClientMock).toHaveBeenCalledTimes(4)
  })
})
