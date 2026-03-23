import { beforeEach, describe, expect, it, vi } from "vitest"

const onMock = vi.fn()
const removeListenerMock = vi.fn()
const invokeMock = vi.fn()
const exposeInMainWorldMock = vi.fn()

describe("preload workflow event bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    onMock.mockReset()
    removeListenerMock.mockReset()
    invokeMock.mockReset()
    exposeInMainWorldMock.mockReset()
  })

  it("subscribes to workflow:event once and removes the listener on final unsubscribe", async () => {
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (...args: unknown[]) =>
          exposeInMainWorldMock(...args),
      },
      ipcRenderer: {
        on: (...args: unknown[]) => onMock(...args),
        removeListener: (...args: unknown[]) => removeListenerMock(...args),
        invoke: (...args: unknown[]) => invokeMock(...args),
      },
    }))

    await import("./index")

    const api = exposeInMainWorldMock.mock.calls.find(
      ([name]) => name === "api",
    )?.[1] as {
      onWorkflowEvent: (
        callback: (payload: { runId: string; type: string }) => void,
      ) => () => void
    }
    expect(api).toBeDefined()

    const callbackA = vi.fn()
    const callbackB = vi.fn()
    const unsubscribeA = api.onWorkflowEvent(callbackA)
    const unsubscribeB = api.onWorkflowEvent(callbackB)

    expect(onMock).toHaveBeenCalledTimes(1)
    expect(onMock).toHaveBeenCalledWith("workflow:event", expect.any(Function))

    const handler = onMock.mock.calls[0]?.[1] as (
      event: unknown,
      payload: unknown,
    ) => void
    const payload = { runId: "run-1", type: "run-done" }
    handler({}, payload)

    expect(callbackA).toHaveBeenCalledWith(payload)
    expect(callbackB).toHaveBeenCalledWith(payload)

    unsubscribeA()
    expect(removeListenerMock).not.toHaveBeenCalled()

    unsubscribeB()
    expect(removeListenerMock).toHaveBeenCalledTimes(1)
    expect(removeListenerMock).toHaveBeenCalledWith("workflow:event", handler)
  })
})
