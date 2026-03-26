import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Workflow, WorkflowEvent, WorkflowInput } from "@shared/types"

const {
  startRunMock,
  rerunFromNodeMock,
  resumeRunMock,
  resolveApprovalMock,
  resolveEvalOverrideMock,
  getSnapshotMock,
  sendWorkflowEventMock,
  logWarnMock,
  snapshotProviderSettingsMock,
} = vi.hoisted(() => ({
  startRunMock: vi.fn(),
  rerunFromNodeMock: vi.fn(),
  resumeRunMock: vi.fn(),
  resolveApprovalMock: vi.fn(),
  resolveEvalOverrideMock: vi.fn(),
  getSnapshotMock: vi.fn(),
  sendWorkflowEventMock: vi.fn(),
  logWarnMock: vi.fn(),
  snapshotProviderSettingsMock: vi.fn(),
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
    resolveEvalOverride: (...args: unknown[]) =>
      resolveEvalOverrideMock(...args),
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
  snapshotProviderSettings: (...args: unknown[]) =>
    snapshotProviderSettingsMock(...args),
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
  name: "Test workflow",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { skillRef: "test/writer", prompt: "Write content" },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "output-1", type: "default" },
  ],
}

const TEST_INPUT: WorkflowInput = {
  type: "text",
  value: "test input",
}

function createHandle(
  runId: string,
  events: WorkflowEvent[] = [],
  summary?: Partial<{
    status: string
    durationMs: number
    totalCost: number
    evalScores: Record<string, number>
  }>,
) {
  let eventIndex = 0
  return {
    runId,
    workspace: "/tmp/test-ws",
    events: {
      async *[Symbol.asyncIterator]() {
        while (eventIndex < events.length) {
          yield events[eventIndex++]
        }
      },
    },
    result: Promise.resolve({
      runId,
      status: "completed" as const,
      workspace: "/tmp/test-ws",
      totalCost: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      evalScores: {},
      durationMs: 100,
      ...summary,
    }),
    cancel: vi.fn(),
    pause: vi.fn(() => true),
    resume: vi.fn(() => true),
  }
}

function createMockWindow() {
  return {
    isDestroyed: () => false,
    isFocused: () => true,
    on: vi.fn(),
    removeListener: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  } as never
}

describe("workflow-runner adapter: runWorkflow", () => {
  beforeEach(() => {
    vi.resetModules()
    startRunMock.mockReset()
    rerunFromNodeMock.mockReset()
    resumeRunMock.mockReset()
    resolveApprovalMock.mockReset()
    resolveEvalOverrideMock.mockReset()
    getSnapshotMock.mockReset()
    sendWorkflowEventMock.mockReset()
    logWarnMock.mockReset()
    snapshotProviderSettingsMock.mockReset()
  })

  it("delegates to workflowRunner.startRun with correct parameters", async () => {
    const handle = createHandle("run-1")
    startRunMock.mockResolvedValue(handle)

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-1",
      TEST_WORKFLOW,
      TEST_INPUT,
      createMockWindow(),
      "/project",
      "/project/.c8c/test.yaml",
    )

    expect(startRunMock).toHaveBeenCalledTimes(1)
    expect(startRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        workflow: TEST_WORKFLOW,
        input: TEST_INPUT,
        projectPath: "/project",
        workflowPath: "/project/.c8c/test.yaml",
      }),
    )
  })

  it("snapshots provider settings before starting a run", async () => {
    const handle = createHandle("run-snap")
    startRunMock.mockResolvedValue(handle)

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow("run-snap", TEST_WORKFLOW, TEST_INPUT, createMockWindow())

    expect(snapshotProviderSettingsMock).toHaveBeenCalledTimes(1)
  })

  it("streams events from the handle to the window", async () => {
    const events: WorkflowEvent[] = [
      {
        type: "node-start",
        runId: "run-events",
        nodeId: "skill-1",
      } as WorkflowEvent,
      {
        type: "node-done",
        runId: "run-events",
        nodeId: "skill-1",
        output: { content: "done", metadata: {} },
      } as WorkflowEvent,
      {
        type: "run-done",
        runId: "run-events",
        status: "completed",
      } as WorkflowEvent,
    ]
    const handle = createHandle("run-events", events)
    startRunMock.mockResolvedValue(handle)

    const { runWorkflow } = await import("./workflow-runner")
    await runWorkflow(
      "run-events",
      TEST_WORKFLOW,
      TEST_INPUT,
      createMockWindow(),
    )

    // Wait for async event streaming to complete (multiple microtask flushes)
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
    }

    expect(sendWorkflowEventMock).toHaveBeenCalledTimes(3)
    expect(sendWorkflowEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "node-start", nodeId: "skill-1" }),
    )
    expect(sendWorkflowEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "run-done", status: "completed" }),
    )
  })

  it("returns the run summary from the handle result", async () => {
    const handle = createHandle("run-summary", [], {
      status: "completed",
      durationMs: 500,
      totalCost: 0.05,
      evalScores: { "eval-1": 9 },
    })
    startRunMock.mockResolvedValue(handle)

    const { runWorkflow } = await import("./workflow-runner")
    const result = await runWorkflow(
      "run-summary",
      TEST_WORKFLOW,
      TEST_INPUT,
      createMockWindow(),
    )

    expect(result).toMatchObject({
      status: "completed",
      durationMs: 500,
      totalCost: 0.05,
      evalScores: { "eval-1": 9 },
    })
  })

  it("reports hasActiveRuns as true during an active run", async () => {
    let resolveResult: (() => void) | undefined
    const handle = createHandle("run-active")
    // Override result to be a pending promise we control
    handle.result = new Promise((resolve) => {
      resolveResult = () =>
        resolve({
          runId: "run-active",
          status: "completed" as const,
          workspace: "/tmp/test-ws",
          totalCost: 0,
          totalTokensIn: 0,
          totalTokensOut: 0,
          evalScores: {},
          durationMs: 100,
        })
    })
    startRunMock.mockResolvedValue(handle)

    const { runWorkflow, hasActiveRuns } = await import("./workflow-runner")
    expect(hasActiveRuns()).toBe(false)

    const runPromise = runWorkflow(
      "run-active",
      TEST_WORKFLOW,
      TEST_INPUT,
      createMockWindow(),
    )

    // Let microtasks flush so attachWindowAndWait registers the handle
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(hasActiveRuns()).toBe(true)

    // Resolve the result to complete the run
    resolveResult?.()
    await runPromise

    expect(hasActiveRuns()).toBe(false)
  })
})

describe("workflow-runner adapter: cancelWorkflowRun", () => {
  beforeEach(() => {
    vi.resetModules()
    startRunMock.mockReset()
    sendWorkflowEventMock.mockReset()
    snapshotProviderSettingsMock.mockReset()
  })

  it("cancels an active run handle", async () => {
    const handle = createHandle("run-cancel")
    // Make the handle's result never resolve until cancel
    handle.result = new Promise((resolve) => {
      handle.cancel.mockImplementation(() => {
        resolve({
          runId: "run-cancel",
          status: "interrupted" as const,
          workspace: "/tmp/test-ws",
          totalCost: 0,
          totalTokensIn: 0,
          totalTokensOut: 0,
          evalScores: {},
          durationMs: 50,
        })
      })
    })
    startRunMock.mockResolvedValue(handle)

    const { runWorkflow, cancelWorkflowRun } = await import("./workflow-runner")
    const runPromise = runWorkflow(
      "run-cancel",
      TEST_WORKFLOW,
      TEST_INPUT,
      createMockWindow(),
    )

    // Let microtasks flush
    await Promise.resolve()
    await Promise.resolve()

    expect(cancelWorkflowRun("run-cancel")).toBe(true)
    await runPromise

    expect(handle.cancel).toHaveBeenCalledWith("cancelled by desktop adapter")
  })

  it("queues cancel for runs that haven't attached yet", async () => {
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
      createMockWindow(),
    )

    expect(cancelWorkflowRun("run-early-cancel")).toBe(true)

    const handle = createHandle("run-early-cancel")
    resolveStart?.(handle)
    await runPromise

    expect(handle.cancel).toHaveBeenCalledWith(
      "cancelled before handle attached",
    )
  })
})

describe("workflow-runner adapter: pause and resume", () => {
  beforeEach(() => {
    vi.resetModules()
    startRunMock.mockReset()
    sendWorkflowEventMock.mockReset()
    snapshotProviderSettingsMock.mockReset()
  })

  it("pauses and resumes an active run", async () => {
    const handle = createHandle("run-pause")
    handle.result = new Promise(() => {})
    startRunMock.mockResolvedValue(handle)

    const { runWorkflow, pauseWorkflowRun, resumeWorkflowRun } =
      await import("./workflow-runner")
    void runWorkflow("run-pause", TEST_WORKFLOW, TEST_INPUT, createMockWindow())

    await Promise.resolve()
    await Promise.resolve()

    expect(pauseWorkflowRun("run-pause")).toBe(true)
    expect(handle.pause).toHaveBeenCalledTimes(1)

    expect(resumeWorkflowRun("run-pause")).toBe(true)
    expect(handle.resume).toHaveBeenCalledTimes(1)
  })

  it("returns false when pausing a non-existent run", async () => {
    const { pauseWorkflowRun, resumeWorkflowRun } =
      await import("./workflow-runner")
    expect(pauseWorkflowRun("non-existent")).toBe(false)
    expect(resumeWorkflowRun("non-existent")).toBe(false)
  })
})

describe("workflow-runner adapter: resolveApproval", () => {
  beforeEach(() => {
    vi.resetModules()
    resolveApprovalMock.mockReset()
  })

  it("delegates approval resolution to the runner", async () => {
    resolveApprovalMock.mockResolvedValue(true)

    const { resolveApproval } = await import("./workflow-runner")
    const result = await resolveApproval("run-1", "approval-1", true, "edited")

    expect(result).toBe(true)
    expect(resolveApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        nodeId: "approval-1",
        approved: true,
        editedContent: "edited",
      }),
    )
  })
})

describe("workflow-runner adapter: resolveEvalOverride", () => {
  beforeEach(() => {
    vi.resetModules()
    resolveEvalOverrideMock.mockReset()
  })

  it("delegates eval override resolution to the runner", async () => {
    resolveEvalOverrideMock.mockResolvedValue(true)

    const { resolveEvalOverride } = await import("./workflow-runner")
    const result = await resolveEvalOverride("run-1", "eval-1")

    expect(result).toBe(true)
    expect(resolveEvalOverrideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        nodeId: "eval-1",
      }),
    )
  })
})

describe("workflow-runner adapter: rerunFromNode", () => {
  beforeEach(() => {
    vi.resetModules()
    rerunFromNodeMock.mockReset()
    sendWorkflowEventMock.mockReset()
    snapshotProviderSettingsMock.mockReset()
  })

  it("delegates to workflowRunner.rerunFromNode with correct parameters", async () => {
    const handle = createHandle("rerun-1")
    rerunFromNodeMock.mockResolvedValue(handle)

    const { rerunFromNode } = await import("./workflow-runner")
    await rerunFromNode(
      "rerun-1",
      "eval-1",
      TEST_WORKFLOW,
      "/tmp/test-ws",
      createMockWindow(),
      "/project",
    )

    expect(rerunFromNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "rerun-1",
        fromNodeId: "eval-1",
        workflow: TEST_WORKFLOW,
        workspace: "/tmp/test-ws",
        projectPath: "/project",
      }),
    )
  })
})

describe("workflow-runner adapter: continueRunFromWorkspace", () => {
  beforeEach(() => {
    vi.resetModules()
    resumeRunMock.mockReset()
    sendWorkflowEventMock.mockReset()
    snapshotProviderSettingsMock.mockReset()
  })

  it("delegates to workflowRunner.resumeRun with correct parameters", async () => {
    const handle = createHandle("resume-1")
    resumeRunMock.mockResolvedValue(handle)

    const { continueRunFromWorkspace } = await import("./workflow-runner")
    await continueRunFromWorkspace(
      "resume-1",
      TEST_WORKFLOW,
      "/tmp/test-ws",
      createMockWindow(),
      "/project",
    )

    expect(resumeRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "resume-1",
        workflow: TEST_WORKFLOW,
        workspace: "/tmp/test-ws",
        projectPath: "/project",
      }),
    )
  })
})

describe("workflow-runner adapter: getWorkflowRunSnapshot", () => {
  beforeEach(() => {
    vi.resetModules()
    getSnapshotMock.mockReset()
    startRunMock.mockReset()
    sendWorkflowEventMock.mockReset()
    snapshotProviderSettingsMock.mockReset()
  })

  it("returns null when no snapshot exists", async () => {
    getSnapshotMock.mockResolvedValue(null)

    const { getWorkflowRunSnapshot } = await import("./workflow-runner")
    const result = await getWorkflowRunSnapshot("non-existent")

    expect(result).toBeNull()
  })

  it("adds paused flag to snapshot", async () => {
    getSnapshotMock.mockResolvedValue({
      runId: "run-snap",
      nodeStates: {},
      runtimeNodes: [],
      runtimeEdges: [],
    })

    const { getWorkflowRunSnapshot } = await import("./workflow-runner")
    const result = await getWorkflowRunSnapshot("run-snap")

    expect(result).toMatchObject({
      runId: "run-snap",
      paused: false,
    })
  })
})
