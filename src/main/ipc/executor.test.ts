import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Workflow, WorkflowInput } from "@shared/types"
import type { ExecutionStartResult } from "@shared/c8c-api"
import type {
  RoutingIntent,
  RoutingEvent,
  RunEnvelope,
} from "@shared/routing-types"

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
  listProjectImprovementRecommendationsMock,
  persistArtifactsFromRunMock,
  listProjectCaseStatesMock,
  upsertCaseStateMock,
  cleanupProjectRunWorkspacesMock,
  deleteRunWorkspaceMock,
  listProjectRunResultsMock,
  readRunResultRecordMock,
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
  createRoutingRunnerMock,
  listTemplatesMock,
  routeCreateEntryMock,
  inspectProjectForCreateEntryMock,
  loadChainMock,
  saveChainMock,
  normalizeWorkflowTitleMock,
  toWorkflowFileStemMock,
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
  listProjectImprovementRecommendationsMock: vi.fn(),
  persistArtifactsFromRunMock: vi.fn(),
  listProjectCaseStatesMock: vi.fn(),
  upsertCaseStateMock: vi.fn(),
  cleanupProjectRunWorkspacesMock: vi.fn(),
  deleteRunWorkspaceMock: vi.fn(),
  listProjectRunResultsMock: vi.fn(),
  readRunResultRecordMock: vi.fn(),
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
  createRoutingRunnerMock: vi.fn(),
  listTemplatesMock: vi.fn(),
  routeCreateEntryMock: vi.fn(),
  inspectProjectForCreateEntryMock: vi.fn(),
  loadChainMock: vi.fn(),
  saveChainMock: vi.fn(),
  normalizeWorkflowTitleMock: vi.fn(),
  toWorkflowFileStemMock: vi.fn(),
}))

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
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
  continueRunFromWorkspace: (...args: unknown[]) =>
    continueRunFromWorkspaceMock(...args),
  getWorkflowRunSnapshot: (...args: unknown[]) =>
    getWorkflowRunSnapshotMock(...args),
}))

vi.mock("@c8c/workflow-runner", () => ({
  approvalTaskId: (nodeId: string) => `approval-${nodeId}`,
  findResumeNodeId: vi.fn(() => "output"),
  createRoutingRunner: (...args: unknown[]) =>
    createRoutingRunnerMock(...args),
  getWorkflowHilTask: (...args: unknown[]) => getWorkflowHilTaskMock(...args),
  listProjectImprovementRecommendations: (...args: unknown[]) =>
    listProjectImprovementRecommendationsMock(...args),
  listWorkflowHilTasks: (...args: unknown[]) =>
    listWorkflowHilTasksMock(...args),
  writeWorkflowHilTaskResponse: (...args: unknown[]) =>
    writeWorkflowHilTaskResponseMock(...args),
}))

vi.mock("../lib/batch-runner", () => ({
  runBatch: (...args: unknown[]) => runBatchMock(...args),
  cancelBatch: (...args: unknown[]) => cancelBatchMock(...args),
  getActiveBatchSnapshot: vi.fn(() => null),
}))

vi.mock("../lib/skill-scaffold", () => ({
  scaffoldMissingSkills: (...args: unknown[]) =>
    scaffoldMissingSkillsMock(...args),
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
  listProjectArtifacts: (...args: unknown[]) =>
    listProjectArtifactsMock(...args),
  persistArtifactsFromRun: (...args: unknown[]) =>
    persistArtifactsFromRunMock(...args),
}))

vi.mock("../lib/case-store", () => ({
  listProjectCaseStates: (...args: unknown[]) =>
    listProjectCaseStatesMock(...args),
  upsertCaseState: (...args: unknown[]) => upsertCaseStateMock(...args),
}))

vi.mock("../lib/run-workspace-store", () => ({
  cleanupProjectRunWorkspaces: (...args: unknown[]) =>
    cleanupProjectRunWorkspacesMock(...args),
  deleteRunWorkspace: (...args: unknown[]) => deleteRunWorkspaceMock(...args),
  listProjectRunResults: (...args: unknown[]) =>
    listProjectRunResultsMock(...args),
  readRunResultRecord: (...args: unknown[]) => readRunResultRecordMock(...args),
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
  getProviderReadiness: (...args: unknown[]) =>
    getProviderReadinessMock(...args),
  providerReadinessError: (...args: unknown[]) =>
    providerReadinessErrorMock(...args),
  resolveWorkflowProviderId: (...args: unknown[]) =>
    resolveWorkflowProviderIdMock(...args),
}))

vi.mock("@shared/provider-metadata", () => ({
  workflowRequiresProvider: (...args: unknown[]) =>
    workflowRequiresProviderMock(...args),
}))

vi.mock("@shared/workflow-execution-validation", () => ({
  validateWorkflowForExecution: (...args: unknown[]) =>
    validateWorkflowForExecutionMock(...args),
  formatWorkflowExecutionIssue: (...args: unknown[]) =>
    formatWorkflowExecutionIssueMock(...args),
}))

vi.mock("../workflow-notifications", () => ({
  sendWorkflowEvent: (...args: unknown[]) => sendWorkflowEventMock(...args),
}))

vi.mock("./run-snapshot", () => ({
  hydratePersistedRunSnapshotLogs: (...args: unknown[]) =>
    hydratePersistedRunSnapshotLogsMock(...args),
  readPersistedEventsTail: (...args: unknown[]) =>
    readPersistedEventsTailMock(...args),
}))

vi.mock("../lib/templates", () => ({
  listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
}))

vi.mock("../lib/create-entry-router", () => ({
  routeCreateEntry: (...args: unknown[]) => routeCreateEntryMock(...args),
}))

vi.mock("../lib/create-entry-inspection", () => ({
  inspectProjectForCreateEntry: (...args: unknown[]) =>
    inspectProjectForCreateEntryMock(...args),
}))

vi.mock("../lib/chain-io", () => ({
  loadChain: (...args: unknown[]) => loadChainMock(...args),
  saveChain: (...args: unknown[]) => saveChainMock(...args),
  listChainFiles: vi.fn(() => []),
}))

vi.mock("@shared/workflow-name", () => ({
  normalizeWorkflowTitle: (...args: unknown[]) =>
    normalizeWorkflowTitleMock(...args),
  toWorkflowFileStem: (...args: unknown[]) =>
    toWorkflowFileStemMock(...args),
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
  edges: [{ id: "edge-1", source: "input", target: "output", type: "default" }],
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHandler<T extends (...args: any[]) => any>(channel: string): T {
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
    fromWebContentsMock.mockImplementation(
      (sender: object) => windowBySender.get(sender) ?? null,
    )

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
    scaffoldMissingSkillsMock.mockImplementation(
      async (workflow: Workflow) => workflow,
    )
    scanAllSkillsMock.mockResolvedValue([])
    trackTelemetryEventMock.mockResolvedValue(undefined)
    listProjectArtifactsMock.mockResolvedValue([])
    listProjectImprovementRecommendationsMock.mockResolvedValue([])
    persistArtifactsFromRunMock.mockResolvedValue({ artifacts: [], cases: [] })
    listProjectCaseStatesMock.mockResolvedValue([])
    upsertCaseStateMock.mockResolvedValue(undefined)
    cleanupProjectRunWorkspacesMock.mockResolvedValue({
      deletedRuns: 0,
      reclaimedBytes: 0,
      retainedRuns: 0,
      deletedRunIds: [],
    })
    deleteRunWorkspaceMock.mockResolvedValue({
      runId: "run-1",
      deleted: true,
      reclaimedBytes: 12,
    })
    listProjectRunResultsMock.mockResolvedValue([])
    readRunResultRecordMock.mockResolvedValue(null)
    allowedProjectRootsMock.mockResolvedValue(["/safe"])
    allowedReportRootsMock.mockResolvedValue(["/reports"])
    assertWithinRootsMock.mockImplementation(
      (candidatePath: string, _roots: string[], label: string) => {
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
      },
    )
    getProviderReadinessMock.mockResolvedValue({})
    providerReadinessErrorMock.mockReturnValue(null)
    resolveWorkflowProviderIdMock.mockResolvedValue("claude")
    hydratePersistedRunSnapshotLogsMock.mockImplementation(
      async (_workspace: string, snapshot: unknown) => snapshot,
    )
    readPersistedEventsTailMock.mockResolvedValue([])
    workflowRequiresProviderMock.mockReturnValue(false)
    validateWorkflowForExecutionMock.mockReturnValue([])
    formatWorkflowExecutionIssueMock.mockReturnValue("validation failed")
    getWorkflowHilTaskMock.mockResolvedValue(null)
    listWorkflowHilTasksMock.mockResolvedValue([])
    writeWorkflowHilTaskResponseMock.mockResolvedValue(true)
    listTemplatesMock.mockResolvedValue([])
    routeCreateEntryMock.mockResolvedValue({ type: "new", templateId: "t1" })
    inspectProjectForCreateEntryMock.mockResolvedValue({})
    loadChainMock.mockResolvedValue(TEST_WORKFLOW)
    saveChainMock.mockResolvedValue(undefined)
    normalizeWorkflowTitleMock.mockImplementation((t: string) => t)
    toWorkflowFileStemMock.mockImplementation((t: string) =>
      t.toLowerCase().replace(/\s+/g, "-"),
    )
  })

  const startCases = [
    {
      name: "run",
      channel: "executor:run",
      invoke: (
        event: unknown,
        projectPath?: string,
        workflow: Workflow = TEST_WORKFLOW,
      ) => {
        const handler =
          getHandler<
            (
              event: unknown,
              workflow: Workflow,
              input: WorkflowInput,
              projectPath?: string,
              workflowPath?: string,
            ) => Promise<ExecutionStartResult>
          >("executor:run")
        return handler(
          event,
          workflow,
          TEST_INPUT,
          projectPath,
          "/tmp/workflow.chain",
        )
      },
      targetMock: runWorkflowMock,
      projectPathArgIndex: 4,
    },
    {
      name: "rerun-from",
      channel: "executor:rerun-from",
      invoke: (
        event: unknown,
        projectPath?: string,
        workflow: Workflow = TEST_WORKFLOW,
      ) => {
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
        return handler(
          event,
          "input",
          workflow,
          "/reports/workspace",
          projectPath,
          "/tmp/workflow.chain",
        )
      },
      targetMock: rerunFromNodeMock,
      projectPathArgIndex: 5,
    },
    {
      name: "continue",
      channel: "executor:continue",
      invoke: (
        event: unknown,
        projectPath?: string,
        workflow: Workflow = TEST_WORKFLOW,
      ) => {
        const handler =
          getHandler<
            (
              event: unknown,
              workflow: Workflow,
              workspace: string,
              projectPath?: string,
              workflowPath?: string,
            ) => Promise<ExecutionStartResult>
          >("executor:continue")
        return handler(
          event,
          workflow,
          "/reports/workspace",
          projectPath,
          "/tmp/workflow.chain",
        )
      },
      targetMock: continueRunFromWorkspaceMock,
      projectPathArgIndex: 4,
    },
    {
      name: "run-batch",
      channel: "executor:run-batch",
      invoke: (
        event: unknown,
        projectPath?: string,
        workflow: Workflow = TEST_WORKFLOW,
      ) => {
        const handler =
          getHandler<
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
        return handler(
          event,
          workflow,
          [TEST_INPUT],
          1,
          false,
          projectPath,
          "/tmp/workflow.chain",
        )
      },
      targetMock: runBatchMock,
      projectPathArgIndex: 6,
    },
  ] as const

  it.each(startCases)(
    "returns a structured start error for invalid projectPath in $name",
    async ({ invoke, targetMock }) => {
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
    },
  )

  it.each(startCases)(
    "passes the validated projectPath downstream in $name",
    async ({ invoke, targetMock, projectPathArgIndex }) => {
      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()
      const owner = createEvent(1)

      const result = await invoke(owner.event, "/safe/project")

      expect(typeof result).toBe("string")
      expect(scanAllSkillsMock).toHaveBeenCalledWith("/safe/project")
      expect(scaffoldMissingSkillsMock).toHaveBeenCalledWith(
        TEST_WORKFLOW,
        [],
        "/safe/project",
      )
      expect(targetMock).toHaveBeenCalledTimes(1)
      expect(targetMock.mock.calls[0]?.[projectPathArgIndex]).toBe(
        "/safe/project",
      )
    },
  )

  it.each(startCases)(
    "returns a structured validation error for malformed workflow payload in $name",
    async ({ invoke, targetMock }) => {
      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()
      const owner = createEvent(1)

      const result = await invoke(owner.event, undefined, {
        version: 1,
        name: "Broken",
        nodes: [
          {
            id: "input",
            type: "input",
            position: { x: "0", y: 0 },
            config: {},
          },
        ],
        edges: [],
      } as unknown as Workflow)

      expect(result).toEqual(
        expect.objectContaining({
          code: "validation",
          error:
            'Workflow payload node "input" position must include finite x/y numbers.',
        }),
      )
      expect(targetMock).not.toHaveBeenCalled()
    },
  )

  it("caps concurrent executions per window before starting another run", async () => {
    const runDeferred = createDeferred<void>()
    runWorkflowMock.mockReturnValue(runDeferred.promise)

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)
    const runHandler =
      getHandler<
        (
          event: unknown,
          workflow: Workflow,
          input: WorkflowInput,
          projectPath?: string,
          workflowPath?: string,
        ) => Promise<ExecutionStartResult>
      >("executor:run")

    for (let index = 0; index < 8; index += 1) {
      const result = await runHandler(owner.event, TEST_WORKFLOW, TEST_INPUT)
      expect(typeof result).toBe("string")
    }

    await expect(
      runHandler(owner.event, TEST_WORKFLOW, TEST_INPUT),
    ).resolves.toEqual(
      expect.objectContaining({
        code: "preflight",
        error:
          "Too many active executions in this window. Close or cancel a run before starting another (max 8).",
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
        const handler =
          getHandler<(event: unknown, runId: string) => Promise<boolean>>(
            "executor:cancel",
          )
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
        const handler =
          getHandler<(event: unknown, runId: string) => Promise<boolean>>(
            "run:pause",
          )
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
        const handler =
          getHandler<(event: unknown, runId: string) => Promise<boolean>>(
            "run:resume",
          )
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
        const handler =
          getHandler<
            (
              event: unknown,
              runId: string,
              nodeId: string,
              editedContent?: string,
            ) => Promise<boolean>
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
        const handler =
          getHandler<
            (event: unknown, runId: string, nodeId: string) => Promise<boolean>
          >("executor:reject")
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
        const handler = getHandler<
          (event: unknown, runId: string, nodeId: string) => Promise<boolean>
        >("executor:override-evaluator")
        return handler(event, runId, "node-1")
      },
      targetMock: resolveEvalOverrideMock,
      expectedArgs: (runId: string) => [runId, "node-1", undefined],
      expectedAuthorizedResult: true,
      action: "executor:override-evaluator",
    },
  ] as const

  it.each(runMutationCases)(
    "allows same-window $name and blocks cross-window $name",
    async ({
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
      const runHandler =
        getHandler<
          (
            event: unknown,
            workflow: Workflow,
            input: WorkflowInput,
            projectPath?: string,
            workflowPath?: string,
          ) => Promise<ExecutionStartResult>
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
    },
  )

  it("allows same-window batch cancel and blocks cross-window batch cancel", async () => {
    const batchDeferred = createDeferred<void>()
    runBatchMock.mockReturnValue(batchDeferred.promise)

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const owner = createEvent(1)
    const intruder = createEvent(2)
    const batchHandler =
      getHandler<
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
    const cancelHandler = getHandler<
      (event: unknown, batchId: string) => Promise<boolean>
    >("executor:cancel-batch")

    const batchId = await batchHandler(
      owner.event,
      TEST_WORKFLOW,
      [TEST_INPUT],
      1,
      false,
    )
    expect(typeof batchId).toBe("string")

    cancelBatchMock.mockClear()
    await expect(cancelHandler(owner.event, batchId as string)).resolves.toBe(
      true,
    )
    expect(cancelBatchMock).toHaveBeenCalledWith(batchId)

    cancelBatchMock.mockClear()
    await expect(
      cancelHandler(intruder.event, batchId as string),
    ).resolves.toBe(false)
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

  it("deletes a stored run workspace after validating the workspace path", async () => {
    readRunResultRecordMock.mockResolvedValue({
      runId: "run-1",
      status: "completed",
      workflowName: "Executor test",
      startedAt: 10,
      completedAt: 20,
      reportPath: "/reports/run-1/report.md",
      workspace: "/reports/run-1",
    })

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const handler = getHandler<
      (
        event: unknown,
        workspace: string,
      ) => Promise<{
        runId: string
        deleted: boolean
        reclaimedBytes: number
      }>
    >("executor:delete-run")

    const result = await handler({} as never, "/reports/run-1")

    expect(readRunResultRecordMock).toHaveBeenCalledWith("/reports/run-1")
    expect(deleteRunWorkspaceMock).toHaveBeenCalledWith("/reports/run-1")
    expect(result).toEqual({
      runId: "run-1",
      deleted: true,
      reclaimedBytes: 12,
    })
  })

  it("rejects deleting an active run workspace", async () => {
    readRunResultRecordMock.mockResolvedValue({
      runId: "run-1",
      status: "completed",
      workflowName: "Executor test",
      startedAt: 10,
      completedAt: 20,
      reportPath: "/reports/run-1/report.md",
      workspace: "/reports/run-1",
    })
    getWorkflowRunSnapshotMock.mockResolvedValue({
      workspace: "/reports/run-1",
    })

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const handler = getHandler<
      (event: unknown, workspace: string) => Promise<unknown>
    >("executor:delete-run")

    await expect(handler({} as never, "/reports/run-1")).rejects.toThrow(
      "Active runs cannot be deleted",
    )
    expect(deleteRunWorkspaceMock).not.toHaveBeenCalled()
  })

  it("uses persisted evalResults from run-state without reading legacy event fallback", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "executor-eval-state-"))
    try {
      allowedReportRootsMock.mockResolvedValue([workspace])
      assertWithinRootsMock.mockImplementation(
        (candidatePath: string) => candidatePath,
      )
      readRunResultRecordMock.mockResolvedValue(null)

      await writeFile(
        join(workspace, "run-state.json"),
        JSON.stringify(
          {
            nodeStates: {
              review: { status: "completed", attempts: 1, log: [] },
              output: { status: "pending", attempts: 0, log: [] },
            },
            runtimeNodes: [
              {
                id: "review",
                type: "evaluator",
                position: { x: 0, y: 0 },
                config: {},
              },
              {
                id: "output",
                type: "output",
                position: { x: 120, y: 0 },
                config: {},
              },
            ],
            runtimeEdges: [
              {
                id: "edge-1",
                source: "review",
                target: "output",
                type: "default",
              },
            ],
            runtimeMeta: {},
            evalResults: {
              review: [
                {
                  attempt: 1,
                  score: 0.72,
                  reason: "Good enough",
                  passed: true,
                },
              ],
            },
          },
          null,
          2,
        ),
        "utf-8",
      )

      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()
      const handler = getHandler<
        (event: unknown, workspace: string) => Promise<unknown>
      >("executor:get-terminal-run-snapshot")

      const result = await handler({} as never, workspace)

      expect(result).toEqual(
        expect.objectContaining({
          status: "interrupted",
          resumeNodeId: "output",
          snapshot: expect.objectContaining({
            evalResults: {
              review: [
                {
                  attempt: 1,
                  score: 0.72,
                  reason: "Good enough",
                  passed: true,
                },
              ],
            },
          }),
        }),
      )
      expect(readPersistedEventsTailMock).not.toHaveBeenCalled()
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("falls back to legacy eval-result events when run-state predates evalResults persistence", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "executor-eval-legacy-"))
    try {
      allowedReportRootsMock.mockResolvedValue([workspace])
      assertWithinRootsMock.mockImplementation(
        (candidatePath: string) => candidatePath,
      )
      readRunResultRecordMock.mockResolvedValue(null)
      readPersistedEventsTailMock.mockResolvedValue({
        raw: `${JSON.stringify({
          type: "eval-result",
          runId: "run-1",
          nodeId: "review",
          score: 0.18,
          reason: "Still failing",
          passed: false,
          attempt: 2,
          fix_instructions: "Add specific evidence.",
        })}\n`,
        truncated: false,
      })

      await writeFile(
        join(workspace, "run-state.json"),
        JSON.stringify(
          {
            nodeStates: {
              review: { status: "completed", attempts: 2, log: [] },
              output: { status: "pending", attempts: 0, log: [] },
            },
            runtimeNodes: [
              {
                id: "review",
                type: "evaluator",
                position: { x: 0, y: 0 },
                config: {},
              },
              {
                id: "output",
                type: "output",
                position: { x: 120, y: 0 },
                config: {},
              },
            ],
            runtimeEdges: [
              {
                id: "edge-1",
                source: "review",
                target: "output",
                type: "default",
              },
            ],
            runtimeMeta: {},
          },
          null,
          2,
        ),
        "utf-8",
      )

      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()
      const handler = getHandler<
        (event: unknown, workspace: string) => Promise<unknown>
      >("executor:get-terminal-run-snapshot")

      const result = await handler({} as never, workspace)

      expect(result).toEqual(
        expect.objectContaining({
          status: "interrupted",
          snapshot: expect.objectContaining({
            evalResults: {
              review: [
                {
                  attempt: 2,
                  score: 0.18,
                  reason: "Still failing",
                  passed: false,
                  fix_instructions: "Add specific evidence.",
                  criteria: undefined,
                },
              ],
            },
          }),
        }),
      )
      expect(readPersistedEventsTailMock).toHaveBeenCalledWith(workspace)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("cleans up project runs after validating the project path", async () => {
    cleanupProjectRunWorkspacesMock.mockResolvedValue({
      deletedRuns: 2,
      reclaimedBytes: 2048,
      retainedRuns: 18,
      deletedRunIds: ["run-1", "run-2"],
    })

    const { registerExecutorHandlers } = await import("./executor")
    registerExecutorHandlers()
    const handler = getHandler<
      (
        event: unknown,
        projectPath: string,
      ) => Promise<{
        deletedRuns: number
        reclaimedBytes: number
        retainedRuns: number
        deletedRunIds: string[]
      }>
    >("executor:cleanup-runs")

    const result = await handler({} as never, "/safe/project")

    expect(cleanupProjectRunWorkspacesMock).toHaveBeenCalledWith(
      "/safe/project",
    )
    expect(result).toEqual({
      deletedRuns: 2,
      reclaimedBytes: 2048,
      retainedRuns: 18,
      deletedRunIds: ["run-1", "run-2"],
    })
  })

  describe("routing IPC", () => {
    const TEST_INTENT: RoutingIntent = {
      type: "follow_up",
      projectPath: "/safe/project",
      requestedResult: "test result",
    }

    const MINIMAL_ENVELOPE: RunEnvelope = {
      intent: TEST_INTENT,
      workflow: TEST_WORKFLOW,
      workflowPath: "/safe/project/.c8c/flow.chain",
      input: { type: "text", value: "assembled input" },
      resolvedArtifacts: [],
      attachments: [],
      entryState: { type: "new" },
      templateContext: {},
      routeResult: null,
      autoRun: true,
      contractWarnings: [],
    } as unknown as RunEnvelope

    function createMockRoutingHandle(
      events: RoutingEvent[],
      envelope: RunEnvelope,
    ) {
      return {
        events: (async function* () {
          for (const e of events) yield e
        })(),
        envelope: Promise.resolve(envelope),
        cancel: vi.fn(),
      }
    }

    it("routing:route-intent streams events and returns envelope", async () => {
      const mockEvents: RoutingEvent[] = [
        {
          type: "routing_started",
          sessionId: "s1",
          intent: TEST_INTENT,
        },
        { type: "templates_loaded", sessionId: "s1", count: 3 },
        {
          type: "envelope_ready",
          sessionId: "s1",
          envelope: MINIMAL_ENVELOPE,
        },
      ]

      const mockHandle = createMockRoutingHandle(mockEvents, MINIMAL_ENVELOPE)
      createRoutingRunnerMock.mockReturnValue({
        routeIntent: vi.fn(() => mockHandle),
      })

      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()

      const { event, window } = createEvent(1)
      const handler = getHandler<
        (
          event: unknown,
          intent: RoutingIntent,
          options?: { sessionId: string },
        ) => Promise<RunEnvelope>
      >("routing:route-intent")

      const result = await handler(event, TEST_INTENT, { sessionId: "s1" })

      expect(result).toEqual(MINIMAL_ENVELOPE)

      // Allow the fire-and-forget event-streaming loop to flush
      await new Promise((r) => setTimeout(r, 10))

      expect(window.webContents.send).toHaveBeenCalledWith(
        "routing:event",
        expect.objectContaining({ type: "routing_started" }),
      )
      expect(window.webContents.send).toHaveBeenCalledWith(
        "routing:event",
        expect.objectContaining({ type: "templates_loaded" }),
      )
      expect(window.webContents.send).toHaveBeenCalledWith(
        "routing:event",
        expect.objectContaining({ type: "envelope_ready" }),
      )
    })

    it("routing:route-intent validates project path", async () => {
      createRoutingRunnerMock.mockReturnValue({
        routeIntent: vi.fn(() =>
          createMockRoutingHandle([], MINIMAL_ENVELOPE),
        ),
      })

      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()

      const { event } = createEvent(1)
      const handler = getHandler<
        (
          event: unknown,
          intent: RoutingIntent,
          options?: { sessionId: string },
        ) => Promise<RunEnvelope>
      >("routing:route-intent")

      const unsafeIntent: RoutingIntent = {
        ...TEST_INTENT,
        projectPath: "/unsafe/project",
      }

      await expect(
        handler(event, unsafeIntent, { sessionId: "s2" }),
      ).rejects.toThrow("Project path is outside allowed directories")
    })

    it("routing:cancel cancels active handle", async () => {
      // Create a handle whose envelope never resolves until we cancel
      const cancelFn = vi.fn()
      let resolveEnvelope!: (env: RunEnvelope) => void
      const envelopePromise = new Promise<RunEnvelope>((res) => {
        resolveEnvelope = res
      })
      let resolveEvents!: () => void
      const eventsComplete = new Promise<void>((res) => {
        resolveEvents = res
      })

      const slowHandle = {
        events: (async function* () {
          yield {
            type: "routing_started" as const,
            sessionId: "s3",
            intent: TEST_INTENT,
          }
          // Wait until told to complete
          await eventsComplete
        })(),
        envelope: envelopePromise,
        cancel: cancelFn,
      }

      createRoutingRunnerMock.mockReturnValue({
        routeIntent: vi.fn(() => slowHandle),
      })

      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()

      const { event } = createEvent(1)
      const routeHandler = getHandler<
        (
          event: unknown,
          intent: RoutingIntent,
          options?: { sessionId: string },
        ) => Promise<RunEnvelope>
      >("routing:route-intent")
      const cancelHandler = getHandler<
        (event: unknown, sessionId: string) => Promise<void>
      >("routing:cancel")

      // Start routing (don't await — it won't resolve yet)
      const routePromise = routeHandler(event, TEST_INTENT, {
        sessionId: "s3",
      })

      // Give the event-streaming loop time to start
      await new Promise((r) => setTimeout(r, 10))

      // Cancel should call the handle's cancel function
      await cancelHandler({} as never, "s3")
      expect(cancelFn).toHaveBeenCalled()
      expect(logInfoMock).toHaveBeenCalledWith(
        "executor-ipc",
        "routing_cancelled",
        { sessionId: "s3" },
      )

      // Clean up: resolve the pending promises so the test exits cleanly
      resolveEvents()
      resolveEnvelope(MINIMAL_ENVELOPE)
      await routePromise
    })

    it("routing:cancel is no-op for unknown session", async () => {
      createRoutingRunnerMock.mockReturnValue({
        routeIntent: vi.fn(() =>
          createMockRoutingHandle([], MINIMAL_ENVELOPE),
        ),
      })

      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()

      const cancelHandler = getHandler<
        (event: unknown, sessionId: string) => Promise<void>
      >("routing:cancel")

      // Should not throw
      await cancelHandler({} as never, "nonexistent-session")
      expect(logInfoMock).not.toHaveBeenCalledWith(
        "executor-ipc",
        "routing_cancelled",
        expect.anything(),
      )
    })

    it("routing:route-intent cleans up handle after envelope resolves", async () => {
      const mockHandle = createMockRoutingHandle([], MINIMAL_ENVELOPE)
      createRoutingRunnerMock.mockReturnValue({
        routeIntent: vi.fn(() => mockHandle),
      })

      const { registerExecutorHandlers } = await import("./executor")
      registerExecutorHandlers()

      const { event } = createEvent(1)
      const routeHandler = getHandler<
        (
          event: unknown,
          intent: RoutingIntent,
          options?: { sessionId: string },
        ) => Promise<RunEnvelope>
      >("routing:route-intent")
      const cancelHandler = getHandler<
        (event: unknown, sessionId: string) => Promise<void>
      >("routing:cancel")

      await routeHandler(event, TEST_INTENT, { sessionId: "s4" })

      // Allow the fire-and-forget event loop to flush
      await new Promise((r) => setTimeout(r, 10))

      // After completion, cancel should be a no-op (handle removed)
      logInfoMock.mockClear()
      await cancelHandler({} as never, "s4")
      expect(logInfoMock).not.toHaveBeenCalledWith(
        "executor-ipc",
        "routing_cancelled",
        expect.anything(),
      )
    })
  })
})
