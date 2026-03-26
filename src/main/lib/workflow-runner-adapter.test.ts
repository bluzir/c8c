import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Workflow, WorkflowEvent, WorkflowInput } from "@shared/types"

const {
  startRunMock,
  rerunFromNodeMock,
  resumeRunMock,
  resolveApprovalMock,
  getSnapshotMock,
  sendWorkflowEventMock,
  logWarnMock,
} = vi.hoisted(() => ({
  startRunMock: vi.fn(),
  rerunFromNodeMock: vi.fn(),
  resumeRunMock: vi.fn(),
  resolveApprovalMock: vi.fn(),
  getSnapshotMock: vi.fn(),
  sendWorkflowEventMock: vi.fn(),
  logWarnMock: vi.fn(),
}))

vi.mock("electron", () => ({
  BrowserWindow: class {},
}))

vi.mock("@c8c/workflow-runner", () => ({
  createWorkflowRunner: vi.fn(() => ({
    startRun: (...args: unknown[]) => startRunMock(...args),
    rerunFromNode: (...args: unknown[]) => rerunFromNodeMock(...args),
    resumeRun: (...args: unknown[]) => resumeRunMock(...args),
    resolveApproval: (...args: unknown[]) => resolveApprovalMock(...args),
    getSnapshot: (...args: unknown[]) => getSnapshotMock(...args),
  })),
}))

vi.mock("../workflow-notifications", () => ({
  sendWorkflowEvent: (...args: unknown[]) => sendWorkflowEventMock(...args),
}))

vi.mock("./mcp-config", () => ({
  prepareWorkspaceMcpConfig: vi.fn(),
}))

vi.mock("./provider-runtime", () => ({
  resolveNodeProviderId: vi.fn(),
  resolveWorkflowProviderId: vi.fn(),
  startProviderTask: vi.fn(),
  snapshotProviderSettings: vi.fn(),
}))

vi.mock("./skill-scanner", () => ({
  scanAllSkills: vi.fn(async () => []),
}))

vi.mock("./structured-log", () => ({
  logInfo: vi.fn(),
  logWarn: (...args: unknown[]) => logWarnMock(...args),
}))

const TEST_WORKFLOW: Workflow = {
  version: 1,
  name: "Adapter test",
  nodes: [
    { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
    { id: "output", type: "output", position: { x: 120, y: 0 }, config: {} },
  ],
  edges: [{ id: "edge-1", source: "input", target: "output", type: "default" }],
}

const TEST_INPUT: WorkflowInput = {
  type: "text",
  value: "hello",
}

function createHandle(runId: string, events: AsyncIterable<WorkflowEvent>) {
  return {
    runId,
    events,
    result: Promise.resolve({
      status: "completed" as const,
      durationMs: 5,
      totalCost: 0,
      evalScores: {},
    }),
    cancel: vi.fn(),
    pause: vi.fn(() => true),
    resume: vi.fn(() => true),
  }
}

describe("workflow-runner adapter", () => {
  beforeEach(() => {
    vi.resetModules()
    startRunMock.mockReset()
    rerunFromNodeMock.mockReset()
    resumeRunMock.mockReset()
    resolveApprovalMock.mockReset()
    getSnapshotMock.mockReset()
    sendWorkflowEventMock.mockReset()
    logWarnMock.mockReset()
  })

  it("honors cancel requests that arrive before a run handle is attached", async () => {
    let resolveStart:
      | ((handle: ReturnType<typeof createHandle>) => void)
      | undefined
    startRunMock.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve as (
          handle: ReturnType<typeof createHandle>,
        ) => void
      }),
    )

    const { runWorkflow, cancelWorkflowRun } = await import("./workflow-runner")
    const runPromise = runWorkflow(
      "run-early-cancel",
      TEST_WORKFLOW,
      TEST_INPUT,
      { isDestroyed: () => false } as never,
    )

    expect(cancelWorkflowRun("run-early-cancel")).toBe(true)

    const handle = createHandle("run-early-cancel", (async function* () {})())
    resolveStart?.(handle)
    await runPromise

    expect(handle.cancel).toHaveBeenCalledWith(
      "cancelled before handle attached",
    )
  })

  it("logs and emits an interrupted run when the event stream fails", async () => {
    const handle = createHandle(
      "run-stream-failure",
      (async function* () {
        throw new Error("stream broke")
      })(),
    )
    startRunMock.mockResolvedValue(handle)

    const mockWindow = { isDestroyed: () => false } as never
    const { runWorkflow } = await import("./workflow-runner")

    await runWorkflow(
      "run-stream-failure",
      TEST_WORKFLOW,
      TEST_INPUT,
      mockWindow,
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(logWarnMock).toHaveBeenCalledWith(
      "workflow-runner-adapter",
      "event_stream_failed",
      expect.objectContaining({
        runId: "run-stream-failure",
        error: "stream broke",
      }),
    )
    expect(handle.cancel).toHaveBeenCalledWith("workflow event stream failed")
    expect(sendWorkflowEventMock).toHaveBeenCalledWith(
      mockWindow,
      expect.objectContaining({
        type: "run-done",
        runId: "run-stream-failure",
        status: "interrupted",
      }),
    )
  })
})
