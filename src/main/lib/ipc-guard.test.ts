import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  guardIpcInvokeHandler,
  isTrustedRendererFrame,
  withGuardedIpcRegistration,
} from "./ipc-guard"

function createInvokeEvent(
  overrides: Partial<{
    senderFrame: { url: string; routingId: number }
    sender: { getURL: () => string; mainFrame: { routingId: number } }
  }> = {},
) {
  return {
    senderFrame: {
      url: "file:///app/out/renderer/index.html",
      routingId: 1,
      ...overrides.senderFrame,
    },
    sender: {
      getURL: () => "file:///app/out/renderer/index.html",
      mainFrame: { routingId: 1 },
      ...overrides.sender,
    },
  }
}

describe("ipc-guard", () => {
  beforeEach(() => {
    delete process.env.ELECTRON_RENDERER_URL
  })

  it("accepts trusted main-frame file renderer events", () => {
    expect(isTrustedRendererFrame(createInvokeEvent())).toBe(true)
  })

  it("rejects subframe events even when the URL matches", () => {
    expect(
      isTrustedRendererFrame(
        createInvokeEvent({
          senderFrame: {
            url: "file:///app/out/renderer/index.html",
            routingId: 2,
          },
        }),
      ),
    ).toBe(false)
  })

  it("rejects unexpected renderer origins in dev mode", () => {
    process.env.ELECTRON_RENDERER_URL = "http://127.0.0.1:5173"

    expect(
      isTrustedRendererFrame(
        createInvokeEvent({
          senderFrame: { url: "http://127.0.0.1:4173/", routingId: 1 },
          sender: {
            getURL: () => "http://127.0.0.1:4173/",
            mainFrame: { routingId: 1 },
          },
        }),
      ),
    ).toBe(false)
  })

  it("wraps registered IPC handlers with sender-frame validation", async () => {
    const registrations = new Map<
      string,
      (event: unknown, ...args: unknown[]) => unknown
    >()
    const ipcMainLike = {
      handle: vi.fn(
        (
          channel: string,
          handler: (event: unknown, ...args: unknown[]) => unknown,
        ) => {
          registrations.set(channel, handler)
        },
      ),
    }

    withGuardedIpcRegistration(ipcMainLike, () => {
      ipcMainLike.handle("system:get-app-version", async () => "0.0.0")
    })

    const handler = registrations.get("system:get-app-version")
    expect(handler).toBeDefined()
    await expect(handler!(createInvokeEvent())).resolves.toBe("0.0.0")
    await expect(
      handler!(
        createInvokeEvent({
          senderFrame: {
            url: "file:///app/out/renderer/index.html",
            routingId: 2,
          },
        }),
      ),
    ).rejects.toThrow(
      "Blocked IPC call from unexpected renderer frame: system:get-app-version",
    )
  })
})
