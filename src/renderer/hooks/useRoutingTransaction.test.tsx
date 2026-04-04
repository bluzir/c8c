// @vitest-environment jsdom

import { Provider, createStore } from "jotai"
import { render, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest"
import type {
  RoutingIntent,
  RoutingEvent,
  RunEnvelope,
} from "@shared/routing-types"
import {
  chatRoutingProgressAtom,
  chatFlowInputRequestAtom,
} from "@/lib/store"
import { commitEnvelopeAtom } from "@/lib/commit-envelope"
import { useRoutingTransaction } from "./useRoutingTransaction"

// ── window.api mock ────────────────────────────────────────────────────

let routeIntentMock: Mock
let cancelRoutingMock: Mock
let onRoutingEventMock: Mock
let routingEventCallback: ((event: RoutingEvent) => void) | null = null
const unsubscribeMock = vi.fn()

beforeEach(() => {
  routeIntentMock = vi.fn()
  cancelRoutingMock = vi.fn()
  onRoutingEventMock = vi.fn((cb: (event: RoutingEvent) => void) => {
    routingEventCallback = cb
    return unsubscribeMock
  })
  unsubscribeMock.mockClear()
  routingEventCallback = null

  vi.stubGlobal("window", {
    ...window,
    api: {
      routeIntent: routeIntentMock,
      cancelRouting: cancelRoutingMock,
      onRoutingEvent: onRoutingEventMock,
    },
  })
})

// ── fixtures ───────────────────────────────────────────────────────────

function createIntent(
  overrides: Partial<RoutingIntent> = {},
): RoutingIntent {
  return {
    type: "new_flow",
    projectPath: "/tmp/project",
    requestedResult: "Summarize the document",
    ...overrides,
  }
}

function createEnvelope(
  overrides: Partial<RunEnvelope> = {},
): RunEnvelope {
  return {
    intent: createIntent(),
    workflow: { version: 1, name: "Flow", nodes: [], edges: [] },
    workflowPath: "/tmp/project/.c8c/flow.yaml",
    input: { value: "Summarize the document" },
    resolvedArtifacts: [],
    attachments: [],
    entryState: null,
    templateContext: {},
    routeResult: null,
    autoRun: false,
    contractWarnings: [],
    ...overrides,
  } as RunEnvelope
}

// ── probe component ────────────────────────────────────────────────────

interface ProbeSnapshot {
  dispatch: (intent: RoutingIntent) => void
  cancel: () => void
  dispatching: boolean
}

let latestSnapshot: ProbeSnapshot | null = null

function Probe() {
  const result = useRoutingTransaction()
  latestSnapshot = result
  return <div data-testid="probe" />
}

function renderHook(store: ReturnType<typeof createStore>): ProbeSnapshot {
  latestSnapshot = null
  render(
    <Provider store={store}>
      <Probe />
    </Provider>,
  )
  if (!latestSnapshot) throw new Error("Probe did not mount")
  return latestSnapshot as ProbeSnapshot
}

// ── tests ──────────────────────────────────────────────────────────────

describe("useRoutingTransaction", () => {
  it("dispatch sets routing progress to inspecting", () => {
    const store = createStore()
    const probe = renderHook(store)
    const intent = createIntent()

    // routeIntent returns a never-resolving promise so we stay mid-flight
    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(intent)
    })

    const progress = store.get(chatRoutingProgressAtom)
    expect(progress).toEqual({
      phase: "inspecting",
      userRequest: "Summarize the document",
    })
  })

  it("dispatch calls window.api.routeIntent with correct args", () => {
    const store = createStore()
    const probe = renderHook(store)
    const intent = createIntent()

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(intent)
    })

    expect(routeIntentMock).toHaveBeenCalledTimes(1)
    expect(routeIntentMock).toHaveBeenCalledWith(intent, {
      sessionId: expect.stringMatching(/^routing-\d+-[a-z0-9]+$/),
    })
  })

  it("dispatch subscribes to routing events", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    expect(onRoutingEventMock).toHaveBeenCalledTimes(1)
    expect(typeof routingEventCallback).toBe("function")
  })

  it("route_selected event updates progress to opening", () => {
    const store = createStore()
    const probe = renderHook(store)
    const intent = createIntent()

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(intent)
    })

    // Extract the sessionId that was passed to routeIntent
    const sessionId = routeIntentMock.mock.calls[0][1].sessionId as string

    act(() => {
      routingEventCallback!({
        type: "route_selected",
        sessionId,
        templateId: "template-1",
        templateName: "Document Summary",
        reason: "Matches intent",
        confidence: 0.9,
      })
    })

    const progress = store.get(chatRoutingProgressAtom)
    expect(progress).toEqual({
      phase: "opening",
      userRequest: "Summarize the document",
      templateName: "Document Summary",
    })
  })

  it("successful envelope commits atomically", async () => {
    const store = createStore()
    const probe = renderHook(store)
    const envelope = createEnvelope()

    routeIntentMock.mockResolvedValue(envelope)

    // Before dispatch, routing progress is null
    expect(store.get(chatRoutingProgressAtom)).toBeNull()

    await act(async () => {
      probe.dispatch(createIntent())
    })

    // commitEnvelopeAtom clears chatRoutingProgressAtom to null on success,
    // so if routing progress ended up null after being "inspecting", the
    // envelope was committed. Also verify dispatching is cleared.
    expect(store.get(chatRoutingProgressAtom)).toBeNull()
    expect(latestSnapshot!.dispatching).toBe(false)
  })

  it("autoRun triggers flow input request", async () => {
    const store = createStore()
    const probe = renderHook(store)
    const envelope = createEnvelope({ autoRun: true })

    routeIntentMock.mockResolvedValue(envelope)

    await act(async () => {
      probe.dispatch(createIntent())
    })

    const request = store.get(chatFlowInputRequestAtom)
    expect(request).toEqual({ kind: "run" })
  })

  it("does not set flow input request when autoRun is false", async () => {
    const store = createStore()
    const probe = renderHook(store)
    const envelope = createEnvelope({ autoRun: false })

    routeIntentMock.mockResolvedValue(envelope)

    await act(async () => {
      probe.dispatch(createIntent())
    })

    // commitEnvelope clears it to null via chatRoutingProgressAtom,
    // but chatFlowInputRequestAtom should not be set to { kind: "run" }
    const request = store.get(chatFlowInputRequestAtom)
    expect(request).not.toEqual({ kind: "run" })
  })

  it("error sets routing progress to error phase", async () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockRejectedValue(new Error("Network failure"))

    await act(async () => {
      probe.dispatch(createIntent())
    })

    const progress = store.get(chatRoutingProgressAtom)
    expect(progress).toEqual({
      phase: "error",
      userRequest: "Summarize the document",
      errorMessage: "Network failure",
    })
  })

  it("error strips Electron IPC error prefix", async () => {
    const store = createStore()
    const probe = renderHook(store)

    // Electron wraps remote errors with "Error: Error invoking remote method..."
    // as the full message. cleanIpcError's regex expects this exact format.
    routeIntentMock.mockRejectedValue(
      new Error(
        "Error: Error invoking remote method 'route-intent': Error: Template not found",
      ),
    )

    await act(async () => {
      probe.dispatch(createIntent())
    })

    const progress = store.get(chatRoutingProgressAtom)
    expect(progress?.errorMessage).toBe("Template not found")
  })

  it("cancel calls window.api.cancelRouting with session id", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    const sessionId = routeIntentMock.mock.calls[0][1].sessionId as string

    act(() => {
      probe.cancel()
    })

    expect(cancelRoutingMock).toHaveBeenCalledWith(sessionId)
  })

  it("cancel clears routing progress", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    // Progress should be "inspecting" now
    expect(store.get(chatRoutingProgressAtom)).not.toBeNull()

    act(() => {
      probe.cancel()
    })

    expect(store.get(chatRoutingProgressAtom)).toBeNull()
  })

  it("dispatching state prevents double-dispatch", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    expect(routeIntentMock).toHaveBeenCalledTimes(1)

    // Second dispatch while first is in flight — should be ignored
    act(() => {
      // Re-read from latest snapshot since dispatching state changed
      latestSnapshot!.dispatch(createIntent({ requestedResult: "Second" }))
    })

    expect(routeIntentMock).toHaveBeenCalledTimes(1)
  })

  it("stale session events are ignored after cancel", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    const staleSessionId = routeIntentMock.mock.calls[0][1]
      .sessionId as string

    act(() => {
      probe.cancel()
    })

    // Now fire an event from the stale session
    act(() => {
      routingEventCallback!({
        type: "route_selected",
        sessionId: staleSessionId,
        templateId: "template-1",
        templateName: "Stale Template",
        reason: "Should be ignored",
        confidence: 0.9,
      })
    })

    // Progress should remain null (cleared by cancel), not "opening"
    expect(store.get(chatRoutingProgressAtom)).toBeNull()
  })

  it("events with mismatched sessionId are ignored", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    // Fire an event with a different sessionId
    act(() => {
      routingEventCallback!({
        type: "route_selected",
        sessionId: "routing-wrong-session",
        templateId: "template-1",
        templateName: "Wrong Session",
        reason: "Should be ignored",
        confidence: 0.9,
      })
    })

    // Progress should still be "inspecting", not "opening"
    const progress = store.get(chatRoutingProgressAtom)
    expect(progress?.phase).toBe("inspecting")
  })

  it("routing_failed event sets error phase and clears dispatching", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    const sessionId = routeIntentMock.mock.calls[0][1].sessionId as string

    act(() => {
      routingEventCallback!({
        type: "routing_failed",
        sessionId,
        error: "Template resolution failed",
        phase: "route_selection",
      })
    })

    const progress = store.get(chatRoutingProgressAtom)
    expect(progress).toEqual({
      phase: "error",
      userRequest: "Summarize the document",
      errorMessage: "Template resolution failed",
    })

    // dispatching should be cleared so a new dispatch is possible
    expect(latestSnapshot!.dispatching).toBe(false)
  })

  it("route_clarification event sets clarifying phase", () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockReturnValue(new Promise(() => {}))

    act(() => {
      probe.dispatch(createIntent())
    })

    const sessionId = routeIntentMock.mock.calls[0][1].sessionId as string
    const clarification = {
      kind: "job_route" as const,
      title: "Which approach?",
      message: "Pick one",
      options: [] as Array<{
        value: string
        label: string
        description?: string
        templateId: string
      }>,
    }

    act(() => {
      routingEventCallback!({
        type: "route_clarification",
        sessionId,
        clarification,
      })
    })

    const progress = store.get(chatRoutingProgressAtom)
    expect(progress).toEqual({
      phase: "clarifying",
      userRequest: "Summarize the document",
      clarification,
    })
  })

  it("unsubscribes from routing events after promise settles", async () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockResolvedValue(createEnvelope())

    await act(async () => {
      probe.dispatch(createIntent())
    })

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  it("unsubscribes from routing events after promise rejects", async () => {
    const store = createStore()
    const probe = renderHook(store)

    routeIntentMock.mockRejectedValue(new Error("fail"))

    await act(async () => {
      probe.dispatch(createIntent())
    })

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })
})
