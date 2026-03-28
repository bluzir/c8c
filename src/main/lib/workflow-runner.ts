import { errorMessage } from "./error-utils"
import { BrowserWindow } from "electron"
import {
  createWorkflowRunner,
  type WebSearchBackend,
  type WorkflowRunHandle,
  type WorkflowRunSnapshot,
  type WorkflowRunSummary,
} from "@c8c/workflow-runner"
import type { Workflow, WorkflowInput } from "@shared/types"
import { sendWorkflowEvent } from "../workflow-notifications"
import { prepareWorkspaceMcpConfig } from "./mcp-config"
import {
  resolveNodeProviderId,
  resolveWorkflowProviderId,
  snapshotProviderSettings,
  startProviderTask,
} from "./provider-runtime"
import { scanAllSkills } from "./skill-scanner"
import { logInfo, logWarn } from "./structured-log"

const workflowRunner = createWorkflowRunner({
  startProviderTask,
  resolveWorkflowProviderId,
  resolveNodeProviderId,
  prepareWorkspaceMcpConfig,
  scanSkills: scanAllSkills,
  logger: {
    info: logInfo,
    warn: logWarn,
  },
})

const activeHandles = new Map<string, WorkflowRunHandle>()
const pendingCancelledRunIds = new Set<string>()
const pausedRunIds = new Set<string>()

function streamEventsToWindow(
  window: BrowserWindow,
  handle: WorkflowRunHandle,
): void {
  void (async () => {
    try {
      for await (const event of handle.events) {
        if (window.isDestroyed()) {
          handle.cancel("window destroyed")
          break
        }

        try {
          sendWorkflowEvent(window, event)
        } catch (error) {
          logWarn("workflow-runner-adapter", "send_workflow_event_failed", {
            runId: handle.runId,
            eventType: event.type,
            error: errorMessage(error),
          })
        }
      }
    } catch (error) {
      logWarn("workflow-runner-adapter", "event_stream_failed", {
        runId: handle.runId,
        error: errorMessage(error),
      })
      handle.cancel("workflow event stream failed")
      if (!window.isDestroyed()) {
        try {
          sendWorkflowEvent(window, {
            type: "run-done",
            runId: handle.runId,
            status: "interrupted",
          })
        } catch (sendError) {
          logWarn(
            "workflow-runner-adapter",
            "send_stream_failure_event_failed",
            {
              runId: handle.runId,
              error: errorMessage(sendError),
            },
          )
        }
      }
    }
  })()
}

async function attachWindowAndWait(
  window: BrowserWindow,
  handle: WorkflowRunHandle,
): Promise<WorkflowRunSummary> {
  activeHandles.set(handle.runId, handle)
  if (pendingCancelledRunIds.delete(handle.runId)) {
    pausedRunIds.delete(handle.runId)
    handle.cancel("cancelled before handle attached")
  }
  streamEventsToWindow(window, handle)
  try {
    return await handle.result
  } finally {
    pendingCancelledRunIds.delete(handle.runId)
    pausedRunIds.delete(handle.runId)
    activeHandles.delete(handle.runId)
  }
}

export function pauseWorkflowRun(runId: string): boolean {
  const paused = activeHandles.get(runId)?.pause() ?? false
  if (paused) pausedRunIds.add(runId)
  return paused
}

export function resumeWorkflowRun(runId: string): boolean {
  const resumed = activeHandles.get(runId)?.resume() ?? false
  if (resumed) pausedRunIds.delete(runId)
  return resumed
}

export async function resolveApproval(
  runId: string,
  nodeId: string,
  approved: boolean,
  editedContent?: string,
  workspace?: string,
): Promise<boolean> {
  return workflowRunner.resolveApproval({
    runId,
    nodeId,
    approved,
    editedContent,
    workspace,
  })
}

export async function resolveEvalOverride(
  runId: string,
  nodeId: string,
  editedContent?: string,
): Promise<boolean> {
  return workflowRunner.resolveEvalOverride({ runId, nodeId, editedContent })
}

export function hasActiveRuns(): boolean {
  return activeHandles.size > 0
}

export function cancelWorkflowRun(runId: string): boolean {
  const handle = activeHandles.get(runId)
  if (!handle) {
    pendingCancelledRunIds.add(runId)
    setTimeout(() => pendingCancelledRunIds.delete(runId), 60_000).unref()
    return true
  }
  pausedRunIds.delete(runId)
  handle.cancel("cancelled by desktop adapter")
  return true
}

export async function getWorkflowRunSnapshot(
  runId: string,
): Promise<(WorkflowRunSnapshot & { paused: boolean }) | null> {
  const snapshot = await workflowRunner.getSnapshot(runId)
  if (!snapshot) return null
  return {
    ...snapshot,
    paused: pausedRunIds.has(runId),
  }
}

export async function runWorkflow(
  runId: string,
  workflow: Workflow,
  input: WorkflowInput,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<WorkflowRunSummary> {
  snapshotProviderSettings()
  try {
    const handle = await workflowRunner.startRun({
      runId,
      workflow,
      input,
      projectPath,
      workflowPath,
      webSearchBackend,
    })
    return attachWindowAndWait(window, handle)
  } catch (error) {
    pendingCancelledRunIds.delete(runId)
    throw error
  }
}

export async function rerunFromNode(
  runId: string,
  fromNodeId: string,
  workflow: Workflow,
  workspace: string,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<void> {
  try {
    const handle = await workflowRunner.rerunFromNode({
      runId,
      fromNodeId,
      workflow,
      workspace,
      projectPath,
      workflowPath,
      webSearchBackend,
    })
    await attachWindowAndWait(window, handle)
  } catch (error) {
    pendingCancelledRunIds.delete(runId)
    throw error
  }
}

export async function continueRunFromWorkspace(
  runId: string,
  workflow: Workflow,
  workspace: string,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
  webSearchBackend?: WebSearchBackend,
): Promise<void> {
  try {
    const handle = await workflowRunner.resumeRun({
      runId,
      workflow,
      workspace,
      projectPath,
      workflowPath,
      webSearchBackend,
    })
    await attachWindowAndWait(window, handle)
  } catch (error) {
    pendingCancelledRunIds.delete(runId)
    throw error
  }
}

export type { WorkflowRunSummary }
