import {
  ipcMain,
  BrowserWindow,
  shell,
  type IpcMainInvokeEvent,
} from "electron"
import {
  runWorkflow,
  rerunFromNode,
  cancelWorkflowRun,
  pauseWorkflowRun,
  resumeWorkflowRun,
  resolveApproval,
  resolveEvalOverride,
  continueRunFromWorkspace,
  getWorkflowRunSnapshot,
} from "../lib/workflow-runner"
import {
  approvalTaskId,
  getWorkflowHilTask,
  listProjectImprovementRecommendations,
  listWorkflowHilTasks,
  writeWorkflowHilTaskResponse,
} from "@c8c/workflow-runner"
import {
  runBatch,
  cancelBatch,
  getActiveBatchSnapshot,
} from "../lib/batch-runner"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import { scanAllSkills } from "../lib/skill-scanner"
import { trackTelemetryEvent } from "../lib/telemetry/service"
import { summarizeMissingWorkflowSkillRefs } from "../lib/telemetry/workflow-usage"
import {
  listProjectArtifacts,
  persistArtifactsFromRun,
} from "../lib/artifact-store"
import { listProjectCaseStates, upsertCaseState } from "../lib/case-store"
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type {
  ActiveBatchRun,
  ActiveExecutionSnapshot,
  ActiveWorkflowRun,
  ArtifactRecord,
  CaseStateRecord,
  ContinuationStatus,
  DurableGateRecord,
  EvaluationResult,
  FlowImprovementRecommendation,
  HumanTaskPointer,
  HumanTaskSnapshot,
  HumanTaskSubmitInput,
  HumanTaskSummary,
  LoadedRunResult,
  PersistArtifactsFromRunRequest,
  PersistArtifactsFromRunResult,
  PersistedRunSnapshot,
  RunWorkspaceCleanupResult,
  RunWorkspaceDeleteResult,
  WorkflowEvent,
  Workflow,
  WorkflowInput,
  RunResult,
} from "@shared/types"
import type { ExecutionStartError } from "@shared/c8c-api"
import { workflowRequiresProvider } from "@shared/provider-metadata"
import {
  allowedProjectRoots,
  allowedReportRoots,
  assertWithinRoots,
} from "../lib/security-paths"
import { logError, logInfo, logWarn } from "../lib/structured-log"
import {
  getProviderReadiness,
  providerReadinessError,
  resolveWorkflowProviderId,
} from "../lib/provider-runtime"
import {
  formatWorkflowExecutionIssue,
  validateWorkflowForExecution,
} from "@shared/workflow-execution-validation"
import { sendWorkflowEvent } from "../workflow-notifications"
import {
  hydratePersistedRunSnapshotLogs,
  readPersistedEventsTail,
} from "./run-snapshot"
import { parseWorkflowPayload } from "@shared/workflow-payload"
import { errorMessage } from "../lib/error-utils"
import {
  cleanupProjectRunWorkspaces,
  deleteRunWorkspace,
  listProjectRunResults,
  readRunResultRecord,
} from "../lib/run-workspace-store"

let runCounter = 0
let batchCounter = 0
const activeWindowExecutions = new Map<number, Set<string>>()
const windowLifecycleBindings = new Set<number>()
const HUMAN_TASK_STATUSES = new Set([
  "open",
  "answered",
  "rejected",
  "timed_out",
  "consumed",
])
const MAX_CONCURRENT_EXECUTIONS_PER_WINDOW = 8

function isHumanTaskLifecycleStatus(
  value: unknown,
): value is HumanTaskPointer["status"] {
  return typeof value === "string" && HUMAN_TASK_STATUSES.has(value)
}

function trackWindowExecution(windowId: number, executionId: string): void {
  const executions = activeWindowExecutions.get(windowId) ?? new Set<string>()
  executions.add(executionId)
  activeWindowExecutions.set(windowId, executions)
}

function windowOwnsExecution(windowId: number, executionId: string): boolean {
  return activeWindowExecutions.get(windowId)?.has(executionId) ?? false
}

function releaseWindowExecution(windowId: number, executionId: string): void {
  const executions = activeWindowExecutions.get(windowId)
  if (!executions) return
  executions.delete(executionId)
  if (executions.size === 0) {
    activeWindowExecutions.delete(windowId)
  }
}

function cancelActiveWindowExecution(windowId: number): void {
  const executions = activeWindowExecutions.get(windowId)
  if (!executions || executions.size === 0) return
  activeWindowExecutions.delete(windowId)

  for (const executionId of executions) {
    if (executionId.startsWith("batch:")) {
      const batchId = executionId.slice("batch:".length)
      const cancelled = cancelBatch(batchId)
      logInfo("executor-ipc", "window_closed_cancel_batch", {
        windowId,
        batchId,
        cancelled,
      })
      continue
    }

    const cancelled = cancelWorkflowRun(executionId)
    logInfo("executor-ipc", "window_closed_cancel_run", {
      windowId,
      runId: executionId,
      cancelled,
    })
  }
}

function bindWindowLifecycle(window: BrowserWindow): void {
  if (windowLifecycleBindings.has(window.id)) return
  windowLifecycleBindings.add(window.id)
  window.once("closed", () => {
    windowLifecycleBindings.delete(window.id)
    cancelActiveWindowExecution(window.id)
  })
}

async function getActiveExecutionsForWindow(
  windowId: number,
): Promise<ActiveExecutionSnapshot[]> {
  const executions = activeWindowExecutions.get(windowId)
  if (!executions || executions.size === 0) return []

  const snapshots: Array<ActiveExecutionSnapshot | null> = await Promise.all(
    Array.from(executions).map(async (executionId) => {
      if (executionId.startsWith("batch:")) {
        const batchId = executionId.slice("batch:".length)
        const snapshot = getActiveBatchSnapshot(batchId)
        if (!snapshot) return null
        const batchSnapshot: ActiveBatchRun = {
          kind: "batch" as const,
          batchId: snapshot.batchId,
          workflowName: snapshot.workflowName,
          workflowPath: snapshot.workflowPath || null,
          projectPath: snapshot.projectPath || null,
          total: snapshot.total,
          completed: snapshot.completed,
          running: snapshot.running,
          concurrency: snapshot.concurrency,
          stopOnFailure: snapshot.stopOnFailure,
          startedAt: snapshot.startedAt,
          items: snapshot.items,
        }
        return batchSnapshot
      }

      const snapshot = await getWorkflowRunSnapshot(executionId)
      if (!snapshot?.manifest || !snapshot.state) return null
      const hydratedSnapshot = await hydratePersistedRunSnapshotLogs(
        snapshot.workspace,
        {
          nodeStates: snapshot.state.nodeStates,
          runtimeNodes: snapshot.state.runtimeNodes || [],
          runtimeEdges: snapshot.state.runtimeEdges || [],
          runtimeMeta: snapshot.state.runtimeMeta || {},
          input: snapshot.state.input,
          evalResults: {},
          humanTasks: sanitizeHumanTasks(snapshot.state.humanTasks),
        },
      )

      const runSnapshot: ActiveWorkflowRun = {
        kind: "run" as const,
        runId: executionId,
        workflowName: snapshot.manifest.workflowName,
        workflowPath: snapshot.manifest.workflowPath || null,
        projectPath: null,
        workspace: snapshot.workspace,
        status: snapshot.paused ? "paused" : "running",
        startedAt: snapshot.manifest.startedAt,
        updatedAt: snapshot.manifest.updatedAt,
        nodeStates: hydratedSnapshot.nodeStates,
        runtimeNodes: hydratedSnapshot.runtimeNodes || [],
        runtimeEdges: hydratedSnapshot.runtimeEdges || [],
        runtimeMeta: hydratedSnapshot.runtimeMeta || {},
      }
      return runSnapshot
    }),
  )

  return snapshots.filter(
    (snapshot): snapshot is ActiveExecutionSnapshot => snapshot !== null,
  )
}

function resolveWindowFromEvent(
  event: IpcMainInvokeEvent,
): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return null
  bindWindowLifecycle(window)
  return window
}

function assertWindowCanMutateExecution(
  event: IpcMainInvokeEvent,
  executionId: string,
  action: string,
  extra: Record<string, unknown> = {},
): boolean {
  const window = resolveWindowFromEvent(event)
  if (!window) return false
  if (windowOwnsExecution(window.id, executionId)) return true
  logWarn("executor-ipc", "execution_mutation_denied", {
    action,
    windowId: window.id,
    executionId,
    ...extra,
  })
  return false
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function sanitizeHumanTasks(input: unknown): Record<string, HumanTaskPointer> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}

  const next: Record<string, HumanTaskPointer> = {}
  for (const [nodeId, value] of Object.entries(input)) {
    if (!value || typeof value !== "object") continue
    const taskId =
      "taskId" in value ? (value as { taskId?: unknown }).taskId : undefined
    const status =
      "status" in value ? (value as { status?: unknown }).status : undefined
    if (typeof taskId !== "string" || !isHumanTaskLifecycleStatus(status))
      continue
    next[nodeId] = {
      taskId,
      status,
    }
  }
  return next
}

async function assertProjectPath(projectPath: string): Promise<string> {
  const projectRoots = await allowedProjectRoots()
  return assertWithinRoots(resolve(projectPath), projectRoots, "Project path")
}

async function resolveSafeStartProjectPath(
  projectPath: string | undefined,
  action: string,
): Promise<{ safeProjectPath?: string; startError?: ExecutionStartError }> {
  if (!projectPath) return {}
  try {
    return {
      safeProjectPath: await assertProjectPath(projectPath),
    }
  } catch (error) {
    logWarn("executor-ipc", "project_path_validation_failed", {
      action,
      projectPath,
      error: errorMessage(error),
    })
    return {
      startError: createExecutionStartError(errorMessage(error)),
    }
  }
}

function resolveSafeWorkflowPayload(
  workflow: unknown,
  action: string,
): { workflow?: Workflow; startError?: ExecutionStartError } {
  try {
    return { workflow: parseWorkflowPayload(workflow, "Workflow payload") }
  } catch (error) {
    const message = errorMessage(error)
    logWarn("executor-ipc", "workflow_payload_validation_failed", {
      action,
      error: message,
    })
    return {
      startError: createExecutionStartError(message, "validation"),
    }
  }
}

function hasReachedWindowExecutionCap(windowId: number): boolean {
  return (
    (activeWindowExecutions.get(windowId)?.size ?? 0) >=
    MAX_CONCURRENT_EXECUTIONS_PER_WINDOW
  )
}

async function assertRunWorkspacePath(workspace: string): Promise<string> {
  const reportRoots = await allowedReportRoots()
  return assertWithinRoots(resolve(workspace), reportRoots, "Run workspace")
}

function assertHilTaskId(taskId: string): string {
  if (!taskId.startsWith("human-") && !taskId.startsWith("approval-")) {
    throw new Error("HIL task id must start with 'human-' or 'approval-'")
  }
  return taskId
}

async function assertReportPath(reportPath: string): Promise<string> {
  const reportRoots = await allowedReportRoots()
  return assertWithinRoots(resolve(reportPath), reportRoots, "Report path")
}

function createEmptyRunSnapshot(): PersistedRunSnapshot {
  return {
    nodeStates: {},
    runtimeNodes: [],
    runtimeEdges: [],
    runtimeMeta: {},
    evalResults: {},
  }
}

async function loadPersistedRunSnapshot(
  workspace: string,
): Promise<PersistedRunSnapshot | null> {
  try {
    const raw = await readFile(join(workspace, "run-state.json"), "utf-8")
    const parsed = JSON.parse(raw) as PersistedRunSnapshot
    return await hydratePersistedRunSnapshotLogs(workspace, {
      nodeStates: parsed.nodeStates || {},
      runtimeNodes: parsed.runtimeNodes || [],
      runtimeEdges: parsed.runtimeEdges || [],
      runtimeMeta: parsed.runtimeMeta || {},
      input: parsed.input,
      evalResults: parsed.evalResults || {},
      humanTasks: sanitizeHumanTasks(parsed.humanTasks),
    })
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("executor-ipc", "load_run_snapshot_failed", {
        workspace,
        error: errorMessage(error),
      })
    }
    return null
  }
}

async function loadPersistedEvalResults(
  workspace: string,
): Promise<Record<string, EvaluationResult[]>> {
  try {
    const persistedEvents = await readPersistedEventsTail(workspace)
    if (!persistedEvents) return {}
    const evalResults: Record<string, EvaluationResult[]> = {}
    const lines = persistedEvents.raw.split("\n")
    if (persistedEvents.truncated && lines.length > 0) {
      lines.shift()
    }
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event: WorkflowEvent
      try {
        event = JSON.parse(trimmed) as WorkflowEvent
      } catch {
        continue
      }
      if (event.type !== "eval-result") continue
      const existing = evalResults[event.nodeId] || []
      existing.push({
        attempt: event.attempt,
        score: event.score,
        reason: event.reason,
        passed: event.passed,
        fix_instructions: event.fix_instructions,
        criteria: event.criteria,
      })
      evalResults[event.nodeId] = existing
    }
    return evalResults
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("executor-ipc", "load_run_eval_results_failed", {
        workspace,
        error: errorMessage(error),
      })
    }
    return {}
  }
}

function mapHilTaskSummary(
  summary: Awaited<ReturnType<typeof listWorkflowHilTasks>>[number],
): HumanTaskSummary {
  const taskRecord = summary as typeof summary & {
    instructions?: string
    summary?: string
    sourceRunId?: string
    allowEdit?: boolean
    consumedAt?: number
  }
  return {
    task: summary.task,
    taskId: summary.taskId,
    kind: summary.kind,
    status: summary.status,
    workspace: summary.workspace,
    chainId: summary.chainId,
    sourceRunId: taskRecord.sourceRunId || "",
    nodeId: summary.nodeId,
    workflowName: summary.workflowName,
    workflowPath: summary.workflowPath,
    projectPath: summary.projectPath,
    title: summary.title,
    instructions: taskRecord.instructions,
    summary: taskRecord.summary,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    consumedAt: taskRecord.consumedAt,
    responseRevision: 0,
    allowEdit: taskRecord.allowEdit,
  }
}

function mapHilTaskSnapshot(
  record: NonNullable<Awaited<ReturnType<typeof getWorkflowHilTask>>>,
): HumanTaskSnapshot {
  const state = record.state as typeof record.state & {
    instructions?: string
    summary?: string
    sourceRunId?: string
    consumedAt?: number
    responseRevision?: number
  }
  const latestResponse = record.latestResponse
    ? {
        version: 1 as const,
        taskId: record.latestResponse.taskId,
        resolution:
          record.latestResponse.resolution === "approved"
            ? "submitted"
            : record.latestResponse.resolution,
        answers: record.latestResponse.answers,
        comment: record.latestResponse.comment,
        metadata: {
          answeredAt: record.latestResponse.metadata.answeredAt,
          answeredBy: record.latestResponse.metadata.answeredBy,
          revision: record.latestResponse.metadata.revision,
          idempotencyKey: record.latestResponse.metadata.idempotencyKey,
        },
      }
    : null

  return {
    task: record.task,
    taskId: record.taskId,
    kind: record.request.kind,
    status: record.state.status,
    workspace: state.workspace,
    chainId: state.chainId,
    sourceRunId: state.sourceRunId || "",
    nodeId: state.nodeId,
    workflowName: state.workflowName,
    workflowPath: state.workflowPath,
    projectPath: state.projectPath,
    title: state.title,
    instructions: state.instructions,
    summary: state.summary,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    consumedAt: state.consumedAt,
    responseRevision: state.responseRevision || 0,
    allowEdit: state.allowEdit,
    request: record.request,
    latestResponse,
  }
}

function normalizeTaskStepLabel(
  title: string | undefined,
  workflowName: string | undefined,
) {
  const source = (title || workflowName || "").trim()
  if (!source) return null
  const normalized = source
    .replace(/\bapproval\b/gi, "")
    .replace(/\binput needed\b/gi, "")
    .replace(/\breview\b/gi, "")
    .replace(/^\s*(approve|provide|record)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
  return normalized || null
}

function buildTaskGateRecord(
  task: Pick<
    HumanTaskSnapshot,
    "kind" | "title" | "workflowName" | "summary" | "instructions"
  >,
  resolution: "passed" | "rejected" | "blocked",
): {
  continuationStatus: ContinuationStatus
  lastGate: DurableGateRecord
} {
  const stepLabel = normalizeTaskStepLabel(task.title, task.workflowName)
  const reasonText = task.summary || task.instructions
  const family =
    task.kind === "approval"
      ? stepLabel?.toLowerCase().includes("ship")
        ? "ship_decision"
        : "approval"
      : "input"

  if (task.kind === "approval" && resolution === "passed") {
    return {
      continuationStatus: "ready",
      lastGate: {
        family,
        outcome: "passed",
        summaryText: stepLabel
          ? `Approval recorded. ${stepLabel} can continue.`
          : "Approval recorded. The flow can continue.",
        reasonText,
        stepLabel: stepLabel || undefined,
        happenedAt: Date.now(),
      },
    }
  }

  if (task.kind === "approval") {
    return {
      continuationStatus: "blocked_by_check",
      lastGate: {
        family,
        outcome: "rejected",
        summaryText: stepLabel
          ? `${stepLabel} was rejected and is blocked.`
          : "The flow was rejected and is blocked.",
        reasonText,
        stepLabel: stepLabel || undefined,
        happenedAt: Date.now(),
      },
    }
  }

  if (resolution === "passed") {
    return {
      continuationStatus: "ready",
      lastGate: {
        family,
        outcome: "passed",
        summaryText: stepLabel
          ? `Input recorded. ${stepLabel} can continue.`
          : "Input recorded. The flow can continue.",
        reasonText,
        stepLabel: stepLabel || undefined,
        happenedAt: Date.now(),
      },
    }
  }

  return {
    continuationStatus: "blocked_by_check",
    lastGate: {
      family,
      outcome: resolution === "blocked" ? "blocked" : "rejected",
      summaryText: stepLabel
        ? `${stepLabel} is still blocked until the missing input is provided.`
        : "The flow is still blocked until the missing input is provided.",
      reasonText,
      stepLabel: stepLabel || undefined,
      happenedAt: Date.now(),
    },
  }
}

async function resolveCaseStateSeedForTask(
  task: Pick<
    HumanTaskSnapshot,
    "projectPath" | "workflowPath" | "sourceRunId" | "workflowName" | "title"
  >,
): Promise<{
  projectPath: string
  caseId: string
  workLabel: string
  caseLabel?: string
  factoryId?: string
  factoryLabel?: string
  workflowPath?: string
  workflowName?: string
  artifactIds: string[]
} | null> {
  if (!task.projectPath) return null
  const safeProjectPath = await assertProjectPath(task.projectPath)
  const projectArtifacts = await listProjectArtifacts(safeProjectPath)
  const relatedArtifacts = projectArtifacts
    .filter(
      (artifact) =>
        (task.workflowPath && artifact.workflowPath === task.workflowPath) ||
        artifact.runId === task.sourceRunId,
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)

  const primaryArtifact = relatedArtifacts[0] || null
  if (!primaryArtifact?.caseId) return null

  return {
    projectPath: safeProjectPath,
    caseId: primaryArtifact.caseId,
    workLabel:
      primaryArtifact.caseLabel ||
      task.workflowName ||
      task.title ||
      "Saved work",
    caseLabel: primaryArtifact.caseLabel,
    factoryId: primaryArtifact.factoryId,
    factoryLabel: primaryArtifact.factoryLabel,
    workflowPath: task.workflowPath || primaryArtifact.workflowPath,
    workflowName: task.workflowName || primaryArtifact.workflowName,
    artifactIds: relatedArtifacts.map((artifact) => artifact.id),
  }
}

async function persistCaseStateForTaskResolution(
  task: HumanTaskSnapshot,
  resolution: "passed" | "rejected" | "blocked",
): Promise<void> {
  const seed = await resolveCaseStateSeedForTask(task)
  if (!seed) return
  const gateRecord = buildTaskGateRecord(task, resolution)
  await upsertCaseState({
    projectPath: seed.projectPath,
    caseId: seed.caseId,
    workLabel: seed.workLabel,
    caseLabel: seed.caseLabel,
    factoryId: seed.factoryId,
    factoryLabel: seed.factoryLabel,
    workflowPath: seed.workflowPath,
    workflowName: seed.workflowName,
    continuationStatus: gateRecord.continuationStatus,
    artifactIds: seed.artifactIds,
    lastGate: gateRecord.lastGate,
    updatedAt: gateRecord.lastGate.happenedAt,
  })
}

async function persistCaseStateForApprovalDecision(
  runId: string,
  nodeId: string,
  approved: boolean,
): Promise<void> {
  const snapshot = await getWorkflowRunSnapshot(runId)
  const workspace = snapshot?.workspace
  if (!workspace) return
  const task = await getWorkflowHilTask(workspace, approvalTaskId(nodeId))
  if (!task) return
  await persistCaseStateForTaskResolution(
    mapHilTaskSnapshot(task),
    approved ? "passed" : "rejected",
  )
}

async function scaffoldWorkflowWithTelemetry(
  workflow: Workflow,
  projectPath: string,
  source: "executor_run" | "executor_rerun" | "executor_batch",
): Promise<Workflow> {
  const startedAt = Date.now()
  const availableSkills = await scanAllSkills(projectPath)
  const availableRefs = availableSkills.map((skill) => ({
    name: skill.name,
    category: skill.category,
  }))
  const before = summarizeMissingWorkflowSkillRefs(workflow, availableRefs)

  try {
    const scaffoldedWorkflow = await scaffoldMissingSkills(
      workflow,
      availableRefs,
      projectPath,
    )
    const after = summarizeMissingWorkflowSkillRefs(
      scaffoldedWorkflow,
      availableRefs,
    )
    void trackTelemetryEvent("skill_scaffold_completed", {
      source,
      status: "success",
      duration_ms: Date.now() - startedAt,
      skill_nodes_total: before.skillNodesTotal,
      available_skills_total: before.availableSkillsTotal,
      missing_refs_total: before.missingRefsTotal,
      missing_refs_unique: before.missingRefsUnique,
      missing_refs: before.missingRefsList,
      remaining_missing_refs_total: after.missingRefsTotal,
    })
    return scaffoldedWorkflow
  } catch (error) {
    void trackTelemetryEvent("skill_scaffold_completed", {
      source,
      status: "failed",
      duration_ms: Date.now() - startedAt,
      skill_nodes_total: before.skillNodesTotal,
      available_skills_total: before.availableSkillsTotal,
      missing_refs_total: before.missingRefsTotal,
      missing_refs_unique: before.missingRefsUnique,
      missing_refs: before.missingRefsList,
      error_kind: "scaffold_failed",
    })
    throw error
  }
}

function createExecutionStartError(
  error: string,
  code: ExecutionStartError["code"] = "unknown",
  validationIssues?: ExecutionStartError["validationIssues"],
): ExecutionStartError {
  return {
    error,
    code,
    ...(validationIssues && validationIssues.length > 0
      ? { validationIssues }
      : {}),
  }
}

function normalizeProviderPreflightError(message: string): string {
  const separatorIndex = message.indexOf(":")
  if (separatorIndex === -1) return message
  const prefix = message.slice(0, separatorIndex)
  if (prefix !== "cli_unavailable") return message
  return message.slice(separatorIndex + 1)
}

function createValidationStartError(
  workflow: Workflow,
): ExecutionStartError | null {
  const validationIssues = validateWorkflowForExecution(workflow).filter(
    (issue) => issue.severity === "error",
  )
  if (validationIssues.length === 0) return null
  if (validationIssues.length === 1) {
    return createExecutionStartError(
      formatWorkflowExecutionIssue(validationIssues[0]),
      "validation",
      validationIssues,
    )
  }
  return createExecutionStartError(
    `${validationIssues.length} validation errors — fix them before running.`,
    "validation",
    validationIssues,
  )
}

function createExecutionLimitStartError(): ExecutionStartError {
  return createExecutionStartError(
    `Too many active executions in this window. Close or cancel a run before starting another (max ${MAX_CONCURRENT_EXECUTIONS_PER_WINDOW}).`,
    "preflight",
  )
}

async function createExecutionStartBlocker(
  workflow: Workflow,
  precheckEvent: string,
): Promise<ExecutionStartError | null> {
  const validationError = createValidationStartError(workflow)
  if (validationError) return validationError
  if (!workflowRequiresProvider(workflow)) return null

  try {
    const providerId = await resolveWorkflowProviderId(workflow)
    const readiness = await getProviderReadiness(providerId)
    const providerError = providerReadinessError(readiness)
    if (providerError) {
      return createExecutionStartError(
        normalizeProviderPreflightError(providerError),
        "preflight",
      )
    }
  } catch (err) {
    logWarn("executor-ipc", precheckEvent, { error: errorMessage(err) })
  }

  return null
}

export function registerExecutorHandlers() {
  ipcMain.handle(
    "executor:run",
    async (
      event,
      workflow: Workflow,
      input: WorkflowInput,
      projectPath?: string,
      workflowPath?: string,
      webSearchBackend?: "builtin" | "exa",
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null
      const { safeProjectPath, startError } = await resolveSafeStartProjectPath(
        projectPath,
        "executor:run",
      )
      if (startError) return startError
      const { workflow: safeWorkflow, startError: workflowError } =
        resolveSafeWorkflowPayload(workflow, "executor:run")
      if (workflowError) return workflowError
      workflow = safeWorkflow!
      if (hasReachedWindowExecutionCap(window.id))
        return createExecutionLimitStartError()

      const startBlocker = await createExecutionStartBlocker(
        workflow,
        "run_precheck_failed",
      )
      if (startBlocker) return startBlocker

      // Auto-scaffold missing skills before run
      if (safeProjectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(
            workflow,
            safeProjectPath,
            "executor_run",
          )
        } catch (err) {
          return createExecutionStartError(
            `Skill scaffolding failed: ${String(err)}`,
            "scaffold",
          )
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "run_start_aborted_window_closed", {
          windowId: window.id,
        })
        return createExecutionStartError(
          "Window was closed before run start",
          "window",
        )
      }

      const runId = `run-${++runCounter}-${Date.now()}`
      trackWindowExecution(window.id, runId)
      logInfo("executor-ipc", "run_started", { runId, windowId: window.id })

      // Fire and forget — events stream back via IPC
      runWorkflow(
        runId,
        workflow,
        input,
        window,
        safeProjectPath,
        workflowPath,
        webSearchBackend,
      )
        .catch((err) => {
          try {
            if (!window.isDestroyed()) {
              sendWorkflowEvent(window, {
                runId,
                type: "node-error",
                nodeId: "__global",
                error: String(err),
              })
              sendWorkflowEvent(window, {
                runId,
                type: "run-done",
                status: "failed",
              })
            }
          } catch (sendError) {
            logWarn("executor-ipc", "run_failure_event_send_failed", {
              runId,
              error: errorMessage(sendError),
            })
          }
        })
        .finally(() => releaseWindowExecution(window.id, runId))

      return runId
    },
  )

  ipcMain.handle("executor:cancel", async (event, runId: string) => {
    if (!assertWindowCanMutateExecution(event, runId, "executor:cancel"))
      return false
    return cancelWorkflowRun(runId)
  })

  ipcMain.handle("executor:get-active-executions", async (event) => {
    const window = resolveWindowFromEvent(event)
    if (!window) return []
    return getActiveExecutionsForWindow(window.id)
  })

  ipcMain.handle("run:pause", async (event, runId: string) => {
    if (!assertWindowCanMutateExecution(event, runId, "run:pause")) return false
    return pauseWorkflowRun(runId)
  })

  ipcMain.handle("run:resume", async (event, runId: string) => {
    if (!assertWindowCanMutateExecution(event, runId, "run:resume"))
      return false
    return resumeWorkflowRun(runId)
  })

  ipcMain.handle(
    "executor:rerun-from",
    async (
      event,
      fromNodeId: string,
      workflow: Workflow,
      workspace: string,
      projectPath?: string,
      workflowPath?: string,
      webSearchBackend?: "builtin" | "exa",
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null
      const { safeProjectPath, startError } = await resolveSafeStartProjectPath(
        projectPath,
        "executor:rerun-from",
      )
      if (startError) return startError
      const { workflow: safeWorkflow, startError: workflowError } =
        resolveSafeWorkflowPayload(workflow, "executor:rerun-from")
      if (workflowError) return workflowError
      workflow = safeWorkflow!
      if (hasReachedWindowExecutionCap(window.id))
        return createExecutionLimitStartError()

      const startBlocker = await createExecutionStartBlocker(
        workflow,
        "rerun_precheck_failed",
      )
      if (startBlocker) return startBlocker

      const runId = `rerun-${++runCounter}-${Date.now()}`
      const safeWorkspace = await assertRunWorkspacePath(workspace)

      // Auto-scaffold missing skills before rerun
      if (safeProjectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(
            workflow,
            safeProjectPath,
            "executor_rerun",
          )
        } catch (err) {
          return createExecutionStartError(
            `Skill scaffolding failed: ${String(err)}`,
            "scaffold",
          )
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "rerun_start_aborted_window_closed", {
          windowId: window.id,
          workspace: safeWorkspace,
        })
        return createExecutionStartError(
          "Window was closed before rerun start",
          "window",
        )
      }

      trackWindowExecution(window.id, runId)
      logInfo("executor-ipc", "rerun_started", {
        runId,
        fromNodeId,
        windowId: window.id,
      })

      rerunFromNode(
        runId,
        fromNodeId,
        workflow,
        safeWorkspace,
        window,
        safeProjectPath,
        workflowPath,
        webSearchBackend,
      )
        .catch((err) => {
          try {
            if (!window.isDestroyed()) {
              sendWorkflowEvent(window, {
                runId,
                type: "node-error",
                nodeId: "__global",
                error: String(err),
              })
              sendWorkflowEvent(window, {
                runId,
                type: "run-done",
                status: "failed",
              })
            }
          } catch (sendError) {
            logWarn("executor-ipc", "rerun_failure_event_send_failed", {
              runId,
              error: errorMessage(sendError),
            })
          }
        })
        .finally(() => releaseWindowExecution(window.id, runId))

      return runId
    },
  )

  ipcMain.handle(
    "executor:continue",
    async (
      event,
      workflow: Workflow,
      workspace: string,
      projectPath?: string,
      workflowPath?: string,
      webSearchBackend?: "builtin" | "exa",
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null
      const { safeProjectPath, startError } = await resolveSafeStartProjectPath(
        projectPath,
        "executor:continue",
      )
      if (startError) return startError
      const { workflow: safeWorkflow, startError: workflowError } =
        resolveSafeWorkflowPayload(workflow, "executor:continue")
      if (workflowError) return workflowError
      workflow = safeWorkflow!
      if (hasReachedWindowExecutionCap(window.id))
        return createExecutionLimitStartError()

      const startBlocker = await createExecutionStartBlocker(
        workflow,
        "continue_precheck_failed",
      )
      if (startBlocker) return startBlocker

      const runId = `resume-${++runCounter}-${Date.now()}`
      const safeWorkspace = await assertRunWorkspacePath(workspace)

      // Auto-scaffold missing skills before continue.
      if (safeProjectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(
            workflow,
            safeProjectPath,
            "executor_rerun",
          )
        } catch (err) {
          return createExecutionStartError(
            `Skill scaffolding failed: ${String(err)}`,
            "scaffold",
          )
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "continue_start_aborted_window_closed", {
          windowId: window.id,
          workspace: safeWorkspace,
        })
        return createExecutionStartError(
          "Window was closed before continue start",
          "window",
        )
      }

      trackWindowExecution(window.id, runId)
      logInfo("executor-ipc", "continue_started", {
        runId,
        windowId: window.id,
        workspace: safeWorkspace,
      })

      continueRunFromWorkspace(
        runId,
        workflow,
        safeWorkspace,
        window,
        safeProjectPath,
        workflowPath,
        webSearchBackend,
      )
        .catch((err) => {
          try {
            if (!window.isDestroyed()) {
              sendWorkflowEvent(window, {
                runId,
                type: "node-error",
                nodeId: "__global",
                error: String(err),
              })
              sendWorkflowEvent(window, {
                runId,
                type: "run-done",
                status: "failed",
              })
            }
          } catch (sendError) {
            logWarn("executor-ipc", "continue_failure_event_send_failed", {
              runId,
              error: errorMessage(sendError),
            })
          }
        })
        .finally(() => releaseWindowExecution(window.id, runId))

      return runId
    },
  )

  ipcMain.handle(
    "executor:list-runs",
    async (_e, projectPath: string): Promise<RunResult[]> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      return listProjectRunResults(safeProjectPath)
    },
  )

  ipcMain.handle(
    "executor:list-flow-improvement-recommendations",
    async (
      _e,
      projectPath: string,
      workflowPath?: string | null,
      workflowName?: string | null,
    ): Promise<FlowImprovementRecommendation[]> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      try {
        return await listProjectImprovementRecommendations(safeProjectPath, {
          workflowPath,
          workflowName,
        })
      } catch (error) {
        logWarn(
          "executor-ipc",
          "list_flow_improvement_recommendations_failed",
          {
            projectPath: safeProjectPath,
            workflowPath,
            workflowName,
            error: errorMessage(error),
          },
        )
        return []
      }
    },
  )

  ipcMain.handle("executor:load-run-result", async (_e, workspace: string) => {
    try {
      const safeWorkspace = await assertRunWorkspacePath(workspace)
      const meta = await readRunResultRecord(safeWorkspace)
      if (!meta) return null
      let reportContent = ""
      if (meta.reportPath) {
        try {
          const safeReportPath = await assertReportPath(meta.reportPath)
          reportContent = await readFile(safeReportPath, "utf-8")
        } catch (error) {
          if (errorCode(error) !== "ENOENT") {
            logWarn("executor-ipc", "load_run_result_report_failed", {
              workspace: safeWorkspace,
              reportPath: meta.reportPath,
              error: errorMessage(error),
            })
          }
        }
      }
      const snapshot =
        (await loadPersistedRunSnapshot(safeWorkspace)) ||
        createEmptyRunSnapshot()
      if (
        !snapshot.evalResults ||
        Object.keys(snapshot.evalResults).length === 0
      ) {
        snapshot.evalResults = await loadPersistedEvalResults(safeWorkspace)
      }
      const loadedResult: LoadedRunResult = { ...meta, reportContent, snapshot }
      return loadedResult
    } catch (error) {
      logWarn("executor-ipc", "load_run_result_failed", {
        workspace,
        error: errorMessage(error),
      })
      return null
    }
  })

  ipcMain.handle(
    "executor:delete-run",
    async (_e, workspace: string): Promise<RunWorkspaceDeleteResult> => {
      const safeWorkspace = await assertRunWorkspacePath(workspace)
      const run = await readRunResultRecord(safeWorkspace)
      if (run?.runId) {
        const snapshot = await getWorkflowRunSnapshot(run.runId)
        if (snapshot?.workspace === safeWorkspace) {
          throw new Error("Active runs cannot be deleted")
        }
      }
      return deleteRunWorkspace(safeWorkspace)
    },
  )

  ipcMain.handle(
    "executor:cleanup-runs",
    async (_e, projectPath: string): Promise<RunWorkspaceCleanupResult> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      return cleanupProjectRunWorkspaces(safeProjectPath)
    },
  )

  ipcMain.handle("executor:open-report", async (_e, reportPath: string) => {
    const safeReportPath = await assertReportPath(reportPath)
    return shell.openPath(safeReportPath)
  })

  ipcMain.handle(
    "executor:persist-artifacts-from-run",
    async (
      _e,
      input: PersistArtifactsFromRunRequest,
    ): Promise<PersistArtifactsFromRunResult> => {
      const safeProjectPath = await assertProjectPath(input.projectPath)
      const safeWorkspace = await assertRunWorkspacePath(input.workspace)
      return persistArtifactsFromRun({
        ...input,
        projectPath: safeProjectPath,
        workspace: safeWorkspace,
      })
    },
  )

  ipcMain.handle(
    "executor:list-project-artifacts",
    async (_e, projectPath: string): Promise<ArtifactRecord[]> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      return listProjectArtifacts(safeProjectPath)
    },
  )

  ipcMain.handle(
    "executor:list-project-case-states",
    async (_e, projectPath: string): Promise<CaseStateRecord[]> => {
      const safeProjectPath = await assertProjectPath(projectPath)
      return listProjectCaseStates(safeProjectPath)
    },
  )

  ipcMain.handle(
    "executor:run-batch",
    async (
      event,
      workflow: Workflow,
      inputs: WorkflowInput[],
      concurrency: number,
      stopOnFailure: boolean,
      projectPath?: string,
      workflowPath?: string,
    ) => {
      const window = resolveWindowFromEvent(event)
      if (!window) return null
      const { safeProjectPath, startError } = await resolveSafeStartProjectPath(
        projectPath,
        "executor:run-batch",
      )
      if (startError) return startError
      const { workflow: safeWorkflow, startError: workflowError } =
        resolveSafeWorkflowPayload(workflow, "executor:run-batch")
      if (workflowError) return workflowError
      workflow = safeWorkflow!
      if (hasReachedWindowExecutionCap(window.id))
        return createExecutionLimitStartError()

      const startBlocker = await createExecutionStartBlocker(
        workflow,
        "batch_precheck_failed",
      )
      if (startBlocker) return startBlocker

      // Auto-scaffold missing skills before batch run
      if (safeProjectPath) {
        try {
          workflow = await scaffoldWorkflowWithTelemetry(
            workflow,
            safeProjectPath,
            "executor_batch",
          )
        } catch (err) {
          return createExecutionStartError(
            `Skill scaffolding failed: ${String(err)}`,
            "scaffold",
          )
        }
      }

      if (window.isDestroyed()) {
        logWarn("executor-ipc", "batch_start_aborted_window_closed", {
          windowId: window.id,
        })
        return createExecutionStartError(
          "Window was closed before batch start",
          "window",
        )
      }

      const batchId = `batch-${++batchCounter}-${Date.now()}`
      const executionId = `batch:${batchId}`
      trackWindowExecution(window.id, executionId)
      logInfo("executor-ipc", "batch_started", {
        batchId,
        windowId: window.id,
        inputs: inputs.length,
        concurrency,
        stopOnFailure,
      })

      runBatch(
        batchId,
        workflow,
        inputs,
        concurrency,
        stopOnFailure,
        window,
        safeProjectPath,
        workflowPath,
      )
        .catch((err) => {
          const batchErrorMessage = String(err)
          logError("executor-ipc", "batch_unhandled_failure", {
            batchId,
            error: batchErrorMessage,
          })
          try {
            if (!window.isDestroyed()) {
              window.webContents.send("batch:event", {
                type: "batch-error",
                batchId,
                error: batchErrorMessage,
              })
            }
          } catch (sendError) {
            logWarn("executor-ipc", "batch_failure_event_send_failed", {
              batchId,
              error: errorMessage(sendError),
            })
          }
        })
        .finally(() => releaseWindowExecution(window.id, executionId))

      return batchId
    },
  )

  ipcMain.handle("executor:cancel-batch", async (event, batchId: string) => {
    if (
      !assertWindowCanMutateExecution(
        event,
        `batch:${batchId}`,
        "executor:cancel-batch",
        { batchId },
      )
    )
      return false
    return cancelBatch(batchId)
  })

  ipcMain.handle(
    "executor:approve",
    async (event, runId: string, nodeId: string, editedContent?: string) => {
      if (
        !assertWindowCanMutateExecution(event, runId, "executor:approve", {
          nodeId,
        })
      )
        return false
      const ok = await resolveApproval(runId, nodeId, true, editedContent)
      if (ok) {
        await persistCaseStateForApprovalDecision(runId, nodeId, true).catch(
          (error) => {
            logWarn("executor-ipc", "persist_case_state_after_approve_failed", {
              runId,
              nodeId,
              error: errorMessage(error),
            })
          },
        )
      }
      return ok
    },
  )

  ipcMain.handle(
    "executor:reject",
    async (event, runId: string, nodeId: string) => {
      if (
        !assertWindowCanMutateExecution(event, runId, "executor:reject", {
          nodeId,
        })
      )
        return false
      const ok = await resolveApproval(runId, nodeId, false)
      if (ok) {
        await persistCaseStateForApprovalDecision(runId, nodeId, false).catch(
          (error) => {
            logWarn("executor-ipc", "persist_case_state_after_reject_failed", {
              runId,
              nodeId,
              error: errorMessage(error),
            })
          },
        )
      }
      return ok
    },
  )

  ipcMain.handle(
    "executor:override-evaluator",
    async (event, runId: string, nodeId: string) => {
      if (
        !assertWindowCanMutateExecution(
          event,
          runId,
          "executor:override-evaluator",
          { nodeId },
        )
      )
        return false
      return resolveEvalOverride(runId, nodeId)
    },
  )

  ipcMain.handle(
    "executor:list-human-tasks",
    async (_e, projectPath?: string): Promise<HumanTaskSummary[]> => {
      const roots = projectPath
        ? [join(await assertProjectPath(projectPath), ".c8c", "runs")]
        : await allowedReportRoots()
      const tasks = await listWorkflowHilTasks(roots)
      return tasks.map(mapHilTaskSummary)
    },
  )

  ipcMain.handle(
    "executor:load-human-task",
    async (
      _e,
      taskId: string,
      workspace: string,
    ): Promise<HumanTaskSnapshot | null> => {
      const safeTaskId = assertHilTaskId(taskId)
      const safeWorkspace = await assertRunWorkspacePath(workspace)
      const task = await getWorkflowHilTask(safeWorkspace, safeTaskId)
      return task ? mapHilTaskSnapshot(task) : null
    },
  )

  ipcMain.handle(
    "executor:submit-human-task",
    async (
      _e,
      taskId: string,
      workspace: string,
      input: HumanTaskSubmitInput,
    ): Promise<boolean> => {
      const safeTaskId = assertHilTaskId(taskId)
      const safeWorkspace = await assertRunWorkspacePath(workspace)
      try {
        const task = await getWorkflowHilTask(safeWorkspace, safeTaskId)
        if (!task) return false
        const taskSnapshot = mapHilTaskSnapshot(task)
        if (task.request.kind === "approval") {
          await resolveApproval(
            task.state.sourceRunId,
            task.state.nodeId,
            Boolean(input.answers.approved),
            typeof input.answers.editedContent === "string"
              ? input.answers.editedContent
              : undefined,
            safeWorkspace,
          )
          await persistCaseStateForTaskResolution(
            taskSnapshot,
            Boolean(input.answers.approved) ? "passed" : "rejected",
          ).catch((persistError) => {
            logWarn(
              "executor-ipc",
              "persist_case_state_after_task_submit_failed",
              {
                workspace: safeWorkspace,
                taskId,
                error: errorMessage(persistError),
              },
            )
          })
        } else {
          await writeWorkflowHilTaskResponse({
            workspace: safeWorkspace,
            taskId: safeTaskId,
            data: { answers: input.answers },
            comment: input.comment,
            answeredBy: input.answeredBy,
            idempotencyKey: input.idempotencyKey,
            source: "runtime",
          })
          await persistCaseStateForTaskResolution(taskSnapshot, "passed").catch(
            (persistError) => {
              logWarn(
                "executor-ipc",
                "persist_case_state_after_task_submit_failed",
                {
                  workspace: safeWorkspace,
                  taskId,
                  error: errorMessage(persistError),
                },
              )
            },
          )
        }
        return true
      } catch (error) {
        logWarn("executor-ipc", "submit_human_task_failed", {
          workspace: safeWorkspace,
          taskId,
          error: errorMessage(error),
        })
        return false
      }
    },
  )

  ipcMain.handle(
    "executor:reject-human-task",
    async (
      _e,
      taskId: string,
      workspace: string,
      comment?: string,
      idempotencyKey?: string,
    ): Promise<boolean> => {
      const safeTaskId = assertHilTaskId(taskId)
      const safeWorkspace = await assertRunWorkspacePath(workspace)
      try {
        const task = await getWorkflowHilTask(safeWorkspace, safeTaskId)
        if (!task) return false
        const taskSnapshot = mapHilTaskSnapshot(task)
        if (task.request.kind === "approval") {
          await resolveApproval(
            task.state.sourceRunId,
            task.state.nodeId,
            false,
            undefined,
            safeWorkspace,
          )
          await persistCaseStateForTaskResolution(
            taskSnapshot,
            "rejected",
          ).catch((persistError) => {
            logWarn(
              "executor-ipc",
              "persist_case_state_after_task_reject_failed",
              {
                workspace: safeWorkspace,
                taskId,
                error: errorMessage(persistError),
              },
            )
          })
        } else {
          await writeWorkflowHilTaskResponse({
            workspace: safeWorkspace,
            taskId: safeTaskId,
            data: { answers: {} },
            resolution: "rejected",
            comment,
            idempotencyKey,
            source: "runtime",
          })
          await persistCaseStateForTaskResolution(
            taskSnapshot,
            "blocked",
          ).catch((persistError) => {
            logWarn(
              "executor-ipc",
              "persist_case_state_after_task_reject_failed",
              {
                workspace: safeWorkspace,
                taskId,
                error: errorMessage(persistError),
              },
            )
          })
        }
        return true
      } catch (error) {
        logWarn("executor-ipc", "reject_human_task_failed", {
          workspace: safeWorkspace,
          taskId,
          error: errorMessage(error),
        })
        return false
      }
    },
  )
}
