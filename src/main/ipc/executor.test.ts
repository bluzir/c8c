import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Workflow, WorkflowInput } from "@shared/types"
import type { ExecutionStartResult } from "@shared/c8c-api"

const {
  ipcHandlers,
  windowBySender,
  fromWebContentsMock,
  runWorkflowMock,
  rerunFromNodeMock,
  continueRunFromWorkspaceMock,
  getWorkflowRunSnapshotMock,
  cancelWorkflowRunMock,
  pauseWorkflowRunMock,
  resumeWorkflowRunMock,
  resolveApprovalMock,
  resolveEvalOverrideMock,
  runBatchMock,
  cancelBatchMock,
  scaffoldMissingSkillsMock,
  scanAllSkillsMock,
  trackTelemetryEventMock,
  listProjectArtifactsMock,
  persistArtifactsFromRunMock,
  listProjectCaseStatesMock,
  upsertCaseStateMock,
  allowedProjectRootsMock,
  allowedReportRootsMock,
  assertWithinRootsMock,
  logInfoMock,
  logWarnMock,
  logErrorMock,
  getProviderReadinessMock,
  providerReadinessErrorMock,
  resolveWorkflowProviderIdMock,
  hydratePersistedRunSnapshotLogsMock,
  readPersistedEventsTailMock,
  workflowRequiresProviderMock,
  validateWorkflowForExecutionMock,
  formatWorkflowExecutionIssueMock,
  sendWorkflowEventMock,
  getWorkflowHilTaskMock,
  listWorkflowHilTasksMock,
  writeWorkflowHilTaskResponseMock,
} = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  windowBySender: new Map<object, unknown>(),
  fromWebContentsMock: vi.fn(),
  runWorkflowMock: vi.fn(),
  rerunFromNodeMock: vi.fn(),
  continueRunFromWorkspaceMock: vi.fn(),
  getWorkflowRunSnapshotMock: vi.fn(),
  cancelWorkflowRunMock: vi.fn(),
  pauseWorkflowRunMock: vi.fn(),
  resumeWorkflowRunMock: vi.fn(),
  resolveApprovalMock: vi.fn(),
  resolveEvalOverrideMock: vi.fn(),
  runBatchMock: vi.fn(),
  cancelBatchMock: vi.fn(),
  scaffoldMissingSkillsMock: vi.fn(),
  scanAllSkillsMock: vi.fn(),
  trackTelemetryEventMock: vi.fn(),
  listProjectArtifactsMock: vi.fn(),
  persistArtifactsFromRunMock: vi.fn(),
  listProjectCaseStatesMock: vi.fn(),
  upsertCaseStateMock: vi.fn(),
  allowedProjectRootsMock: vi.fn(),
  allowedReportRootsMock: vi.fn(),
  assertWithinRootsMock: vi.fn(),
  logInfoMock: vi.fn(),
  logWarnMock: vi.fn(),
  logErrorMock: vi.fn(),
  getProviderReadinessMock: vi.fn(),
  providerReadinessErrorMock: vi.fn(),
  resolveWorkflowProviderIdMock: vi.fn(),
  hydratePersistedRunSnapshotLogsMock: vi.fn(),
  readPersistedEventsTailMock: vi.fn(),
  workflowRequiresProviderMock: vi.fn(),
  validateWorkflowForExecutionMock: vi.fn(),
  formatWorkflowExecutionIssueMock: vi.fn(),
  sendWorkflowEventMock: vi.fn(),
  getWorkflowHilTaskMock: vi.fn(),
  listWorkflowHilTasksMock: vi.fn(),
  writeWorkflowHilTaskResponseMock: vi.fn(),
}))

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
  BrowserWindow: {
    fromWebContents: (...args: unknown[]) => fromWebContentsMock(...args),
  },
  shell: {
    openPath: vi.fn(),
  },
}))

vi.mock("../lib/workflow-runner", () => ({
  runWorkflow: (...args: unknown[]) => runWorkflowMock(...args),
  rerunFromNode: (...args: unknown[]) => rerunFromNodeMock(...args),
  cancelWorkflowRun: (...args: unknown[]) => cancelWorkflowRunMock(...args),
  pauseWorkflowRun: (...args: unknown[]) => pauseWorkflowRunMock(...args),
  resumeWorkflowRun: (...args: unknown[]) => resumeWorkflowRunMock(...args),
  resolveApproval: (...args: unknown[]) => resolveApprovalMock(...args),
  resolveEvalOverride: (...args: unknown[]) => resolveEvalOverrideMock(...args),
  continueRunFromWorkspace: (...args: unknown[]) => continueRunFromWorkspaceMock(...args),
  getWorkflowRunSnapshot: (...args: unknown[]) => getWorkflowRunSnapshotMock(...args),
}))

vi.mock("@c8c/workflow-runner", () => ({
  approvalTaskId: (nodeId: string) => `approval-${nodeId}`,
  getWorkflowHilTask: (...args: unknown[]) => getWorkflowHilTaskMock(...args),
  listWorkflowHilTasks: (...args: unknown[]) => listWorkflowHilTasksMock(...args),
  writeWorkflowHilTaskResponse: (...args: unknown[]) => writeWorkflowHilTaskResponseMock(...args),
}))

vi.mock("../lib/batch-runner", () => ({
  runBatch: (...args: unknown[]) => runBatchMock(...args),
  cancelBatch: (...args: unknown[]) => cancelBatchMock(...args),
  getActiveBatchSnapshot: vi.fn(() => null),
}))

vi.mock("../lib/skill-scaffold", () => ({
  scaffoldMissingSkills: (...args: unknown[]) => scaffoldMissingSkillsMock(...args),
}))

vi.mock("../lib/skill-scanner", () => ({
  scanAllSkills: (...args: unknown[]) => scanAllSkillsMock(...args),
}))

vi.mock("../lib/telemetry/service", () => ({
  trackTelemetryEvent: (...args: unknown[]) => trackTelemetryEventMock(...args),
}))

vi.mock("../lib/telemetry/workflow-usage", () => ({
  summarizeMissingWorkflowSkillRefs: vi.fn(() => ({
    skillNodesTotal: 0,
    availableSkillsTotal: 0,
    missingRefsTotal: 0,
    missingRefsUnique: 0,
    missingRefsList: [],
  })),
}))

vi.mock("../lib/artifact-store", () => ({
  listProjectArtifacts: (...args: unknown[]) => listProjectArtifactsMock(...args),
  persistArtifactsFromRun: (...args: unknown[]) => persistArtifactsFromRunMock(...args),
}))

vi.mock("../lib/case-store", () => ({
  listProjectCaseStates: (...args: unknown[]) => listProjectCaseStatesMock(...args),
  upsertCaseState: (...args: unknown[]) => upsertCaseStateMock(...args),
}))

vi.mock("../lib/security-paths", () => ({
  allowedProjectRoots: (...args: unknown[]) => allowedProjectRootsMock(...args),
  allowedReportRoots: (...args: unknown[]) => allowedReportRootsMock(...args),
  assertWithinRoots: (...args: unknown[]) => assertWithinRootsMock(...args),
}))

vi.mock("../lib/structured-log", () => ({
  logInfo: (...args: unknown[]) => logInfoMock(...args),
  logWarn: (...args: unknown[]) => logWarnMock(...args),
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

vi.mock("../lib/provider-runtime", () => ({
  getProviderReadiness: (...args: unknown[]) => getProviderReadinessMock(...args),
  providerReadinessError: (...args: unknown[]) => providerReadinessErrorMock(...args),
  resolveWorkflowProviderId: (...args: unknown[]) => resolveWorkflowProviderIdMock(...args),
}))

vi.mock("@shared/provider-metadata", () => ({
  workflowRequiresProvider: (...args: unknown[]) => workflowRequiresProviderMock(...args),
}))

vi.mock("@shared/workflow-execution-validation", () => ({
  validateWorkflowForExecution: (...args: unknown[]) => validateWorkflowForExecutionMock(...args),
  formatWorkflowExecutionIssue: (...args: unknown[]) => formatWorkflowExecutionIssueMock(...args),
}))

vi.mock("../workflow-notifications", () => ({
  sendWorkflowEvent: (...args: unknown[]) => sendWorkflowEventMock(...args),
}))

vi.mock("./run-snapshot", () => ({
  hydratePersistedRunSnapshotLogs: (...args: unknown[]) => hydratePersistedRunSnapshotLogsMock(...args),
  readPersistedEventsTail: (...args: unknown[]) => readPersistedEventsTailMock(...args),
}))

interface MockWindow {
  id: number
  isDestroyed: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  webContents: {
    send: ReturnType<typeof vi.fn>
  }
}

const TEST_WORKFLOW: Workflow = {
  version: 1,
  name: "Executor test",
  nodes: [
    { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
    { id: "output", type: "output", position: { x: 120, y: 0 }, config: {} },
  ],
  edges: [
    { id: "edge-1", source: "input", target: "output", type: "default" },
  ],
}

const TEST_INPUT: WorkflowInput = {
  type: "text",
  value: "hello",
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

function createWindow(id: number): MockWindow {
  return {
    id,
    isDestroyed: vi.fn(() => false),
    once: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  }
}

function createEvent(windowId: number) {
  const sender = {}
  const window = createWindow(windowId)
  windowBySender.set(sender, window)
  return {
    event: { sender } as never,
    window,
  }
}

function getHandler<T extends (...args: unknown[]) => unknown>(channel: string): T {
  const handler = ipcHandlers.get(channel)
  expect(handler).toBeDefined()
  return handler as T
}

describe("executor IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    windowBySender.clear()
    fromWebContentsMock.mockImplementation((sender: object) => windowBySender.get(sender) ?? null)

    runWorkflowMock.mockResolvedValue(undefined)
    rerunFromNodeMock.mockResolvedValue(undefined)
    continueRunFromWorkspaceMock.mockResolvedValue(undefined)
    getWorkflowRunSnapshotMock.mockResolvedValue(null)
    cancelWorkflowRunMock.mockReturnValue(true)
    pauseWorkflowRunMock.mockReturnValue(true)
    resumeWorkflowRunMock.mockReturnValue(true)
    resolveApprovalMock.mockResolvedValue(false)
    resolveEvalOverrideMock.mockResolvedValue(true)
    runBatchMock.mockResolvedValue(undefined)
    cancelBatchMock.mockReturnValue(true)
    scaffoldMissingSkillsMock.mockImplementation(async (workflow: Workflow) => workflow)
    scanAllSkillsMock.mockResolvedValue([])
    trackTelemetryEventMock.mockResolvedValue(undefined)
    listProjectArtifactsMock.mockResolvedValue([])
    persistArtifactsFromRunMock.mockResolvedValue({ artifacts: [], cases: [] })
    listProjectCaseStatesMock.mockResolvedValue([])
    upsertCaseStateMock.mockResolvedValue(undefined)
    allowedProjectRootsMock.mockResolvedValue(["/safe"])
    allowedReportRootsMock.mockResolvedValue(["/reports"])
    assertWithinRootsMock.mockImplementation((candidatePath: string, _roots: string[], label: string) => {
      if (label === "Project path") {
        if (!candidatePath.startsWith("/safe")) {
          throw new Error("Project path is outside allowed directories")
        }
        return candidatePath
      }
      if (label === "Run workspace" || label === "Report path") {
        if (!candidatePath.startsWith("/reports")) {
          throw new Error(`${label} is outside allowed directories`)
        }
        return candidatePath
      }
      return candidatePath
    })
    getProviderReadinessMock.mockResolvedValue({})
    providerReadinessErrorMock.mockReturnValue(null)
    resolveWorkflowProviderIdMock.mockResolvedValue("claude")
    hydratePersistedRunSnapshotLogsMock.mockImplementation(async (_workspace: string, snapshot: unknown) => snapshot)
    readPersistedEventsTailMock.mockResolvedValue([])
    workflowRequiresProviderMock.mockReturnValue(false)
    validateWorkflowForExecutionMock.mockReturnValue([])
    formatWorkflowExecutionIssueMock.mockReturnValue("validation failed")
    getWorkflowHilTaskMock.mockResolvedValue(null)
    listWorkflowHilTasksMock.mockResolvedValue([])
    writeWorkflowHilTaskResponseMock.mockResolvedValue(true)
  })

  const startCases = [
    {
      name: "run",
      channel: "executor:run",
      invoke: (event: unknown, projectPath?: string, workflow: Workflow = TEST_WORKFLOW) => {
        const handler = getHandler<
          (event: unknown, workflow: Workflow, input: WorkflowInput, projectPath?: string, workflowPath?: string) => Promise<ExecutionStartResult>
        >("executor:run")
        return handler(event, workflow, TEST_INPUT, projectPath, "/tmp/workflow.chain")
      },
      targetMock: runWorkflowMock,
      projectPathArgIndex: 4,
    },
    {
      name: "rerun-from",
      channel: "executor:rerun-from",
      invoke: (event: unknown, projectPath?: string, workflow: Workflow = TEST_WORKFLOW) => {
        const handler = getHandler<
          (
            event: unknown,
            fromNodeId: string,
            workflow: Workflow,
            workspace: string,
            projectPath?: string,
            workflowPath?: string,
          ) => Promise<ExecutionStartResult>
        >("executor:rerun-from")
        return handler(event, "input", workflow, "/reports/workspace", projectPath, "/tmp/workflow.chain")
      },
      targetMock: rerunFromNodeMock,
      projectPathArgIndex: 5,
    },
    {
      name: "continue",
      channel: "executor:continue",
      invoke: (event: unknown, projectPath?: string, workflow: Workflow = TEST_WORKFLOW) => {
        const handler = getHandler<
          (
            event: unknown,
            workflow: Workflow,
            workspace: string,
            projectPath?: string,
            workflowPath?: string,
          ) => Promise<ExecutionStartResult>
        >("executor:continue")
        return handler(event, workflow, "/reports/workspace", projectPath, "/tmp/workflow.chain")
      },
      targetMock: continueRunFromWorkspaceMock,
      projectPathArgIndex: 4,
    },
    {
      name: "run-batch",
      channel: "executor:run-batch",
      invoke: (event: unknown, projectPath?: string, workflow: Workflow = TEST_WORKFLOW) => {
        const handler = getHandler<
          (
            event: unknown,
            workflow: Workflow,
            inputs: WorkflowInput[],
            concurrency: number,
            stopOnFailure: boolean,
            projectPath?: string,
            workflowPath?: string,
          ) => Promise<ExecutionStartResult>
        >("executor:run-batch")
        return handler(event, workflow, [TEST_INPUT], 1, false, projectPath, "/tmp/workflow.chain")
      },
      targetMock: runBatchMock,
      projectPathArgIndex: 6,
    },
  ] as const

  it.each(startCases)("returns a structured start error for invalid projectPath in $name", async ({ invoke, targetMock }) => {
    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)

    const result = await invoke(owner.event, "/unsafe/project")

    expect(result).toEqual(
      expect.objectContaining({
        error: "Project path is outside allowed directories",
      }),
    )
    expect(scanAllSkillsMock).not.toHaveBeenCalled()
    expect(scaffoldMissingSkillsMock).not.toHaveBeenCalled()
    expect(targetMock).not.toHaveBeenCalled()
  })

  it.each(startCases)("passes the validated projectPath downstream in $name", async ({ invoke, targetMock, projectPathArgIndex }) => {
    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)

    const result = await invoke(owner.event, "/safe/project")

    expect(typeof result).toBe("string")
    expect(scanAllSkillsMock).toHaveBeenCalledWith("/safe/project")
    expect(scaffoldMissingSkillsMock).toHaveBeenCalledWith(TEST_WORKFLOW, [], "/safe/project")
    expect(targetMock).toHaveBeenCalledTimes(1)
    expect(targetMock.mock.calls[0]?.[projectPathArgIndex]).toBe("/safe/project")
  })

  it.each(startCases)("returns a structured validation error for malformed workflow payload in $name", async ({ invoke, targetMock }) => {
    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)

    const result = await invoke(owner.event, undefined, {
      version: 1,
      name: "Broken",
      nodes: [{ id: "input", type: "input", position: { x: "0", y: 0 }, config: {} }],
      edges: [],
    } as unknown as Workflow)

    expect(result).toEqual(
      expect.objectContaining({
        code: "validation",
        error: 'Workflow payload node "input" position must include finite x/y numbers.',
      }),
    )
    expect(targetMock).not.toHaveBeenCalled()
  })

  it("caps concurrent executions per window before starting another run", async () => {
    const runDeferred = createDeferred<void>()
    runWorkflowMock.mockReturnValue(runDeferred.promise)

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)
    const runHandler = getHandler<
      (event: unknown, workflow: Workflow, input: WorkflowInput, projectPath?: string, workflowPath?: string) => Promise<ExecutionStartResult>
    >("executor:run")

    for (let index = 0; index < 8; index += 1) {
      const result = await runHandler(owner.event, TEST_WORKFLOW, TEST_INPUT)
      expect(typeof result).toBe("string")
    }

    await expect(runHandler(owner.event, TEST_WORKFLOW, TEST_INPUT)).resolves.toEqual(
      expect.objectContaining({
        code: "preflight",
        error: "Too many active executions in this window. Close or cancel a run before starting another (max 8).",
      }),
    )

    runDeferred.resolve()
    await runDeferred.promise
  })

  const runMutationCases = [
    {
      name: "cancel",
      channel: "executor:cancel",
      invoke: (event: unknown, runId: string) => {
        const handler = getHandler<(event: unknown, runId: string) => Promise<boolean>>("executor:cancel")
        return handler(event, runId)
      },
      targetMock: cancelWorkflowRunMock,
      expectedArgs: (runId: string) => [runId],
      expectedAuthorizedResult: true,
      action: "executor:cancel",
    },
    {
      name: "pause",
      channel: "run:pause",
      invoke: (event: unknown, runId: string) => {
        const handler = getHandler<(event: unknown, runId: string) => Promise<boolean>>("run:pause")
        return handler(event, runId)
      },
      targetMock: pauseWorkflowRunMock,
      expectedArgs: (runId: string) => [runId],
      expectedAuthorizedResult: true,
      action: "run:pause",
    },
    {
      name: "resume",
      channel: "run:resume",
      invoke: (event: unknown, runId: string) => {
        const handler = getHandler<(event: unknown, runId: string) => Promise<boolean>>("run:resume")
        return handler(event, runId)
      },
      targetMock: resumeWorkflowRunMock,
      expectedArgs: (runId: string) => [runId],
      expectedAuthorizedResult: true,
      action: "run:resume",
    },
    {
      name: "approve",
      channel: "executor:approve",
      invoke: (event: unknown, runId: string) => {
        const handler = getHandler<
          (event: unknown, runId: string, nodeId: string, editedContent?: string) => Promise<boolean>
        >("executor:approve")
        return handler(event, runId, "node-1", "edited")
      },
      targetMock: resolveApprovalMock,
      expectedArgs: (runId: string) => [runId, "node-1", true, "edited"],
      expectedAuthorizedResult: false,
      action: "executor:approve",
    },
    {
      name: "reject",
      channel: "executor:reject",
      invoke: (event: unknown, runId: string) => {
        const handler = getHandler<(event: unknown, runId: string, nodeId: string) => Promise<boolean>>("executor:reject")
        return handler(event, runId, "node-1")
      },
      targetMock: resolveApprovalMock,
      expectedArgs: (runId: string) => [runId, "node-1", false],
      expectedAuthorizedResult: false,
      action: "executor:reject",
    },
    {
      name: "override-evaluator",
      channel: "executor:override-evaluator",
      invoke: (event: unknown, runId: string) => {
        const handler = getHandler<(event: unknown, runId: string, nodeId: string) => Promise<boolean>>("executor:override-evaluator")
        return handler(event, runId, "node-1")
      },
      targetMock: resolveEvalOverrideMock,
      expectedArgs: (runId: string) => [runId, "node-1"],
      expectedAuthorizedResult: true,
      action: "executor:override-evaluator",
    },
  ] as const

  it.each(runMutationCases)("allows same-window $name and blocks cross-window $name", async ({
    invoke,
    targetMock,
    expectedArgs,
    expectedAuthorizedResult,
    action,
  }) => {
    const runDeferred = createDeferred<void>()
    runWorkflowMock.mockReturnValue(runDeferred.promise)

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)
    const intruder = createEvent(2)
    const runHandler = getHandler<
      (event: unknown, workflow: Workflow, input: WorkflowInput, projectPath?: string, workflowPath?: string) => Promise<ExecutionStartResult>
    >("executor:run")

    const runId = await runHandler(owner.event, TEST_WORKFLOW, TEST_INPUT)
    expect(typeof runId).toBe("string")

    targetMock.mockClear()
    const authorizedResult = await invoke(owner.event, runId as string)
    expect(authorizedResult).toBe(expectedAuthorizedResult)
    expect(targetMock).toHaveBeenCalledWith(...expectedArgs(runId as string))

    targetMock.mockClear()
    const unauthorizedResult = await invoke(intruder.event, runId as string)
    expect(unauthorizedResult).toBe(false)
    expect(targetMock).not.toHaveBeenCalled()
    expect(logWarnMock).toHaveBeenCalledWith(
      "executor-ipc",
      "execution_mutation_denied",
      expect.objectContaining({
        action,
        windowId: 2,
        executionId: runId,
      }),
    )

    runDeferred.resolve()
    await Promise.resolve()
  })

  it("allows same-window batch cancel and blocks cross-window batch cancel", async () => {
    const batchDeferred = createDeferred<void>()
    runBatchMock.mockReturnValue(batchDeferred.promise)

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)
    const intruder = createEvent(2)
    const batchHandler = getHandler<
      (
        event: unknown,
        workflow: Workflow,
        inputs: WorkflowInput[],
        concurrency: number,
        stopOnFailure: boolean,
        projectPath?: string,
        workflowPath?: string,
      ) => Promise<ExecutionStartResult>
    >("executor:run-batch")
    const cancelHandler = getHandler<(event: unknown, batchId: string) => Promise<boolean>>("executor:cancel-batch")

    const batchId = await batchHandler(owner.event, TEST_WORKFLOW, [TEST_INPUT], 1, false)
    expect(typeof batchId).toBe("string")

    cancelBatchMock.mockClear()
    await expect(cancelHandler(owner.event, batchId as string)).resolves.toBe(true)
    expect(cancelBatchMock).toHaveBeenCalledWith(batchId)

    cancelBatchMock.mockClear()
    await expect(cancelHandler(intruder.event, batchId as string)).resolves.toBe(false)
    expect(cancelBatchMock).not.toHaveBeenCalled()
    expect(logWarnMock).toHaveBeenCalledWith(
      "executor-ipc",
      "execution_mutation_denied",
      expect.objectContaining({
        action: "executor:cancel-batch",
        windowId: 2,
        executionId: `batch:${batchId}`,
        batchId,
      }),
    )

    batchDeferred.resolve()
    await Promise.resolve()
  })
})
