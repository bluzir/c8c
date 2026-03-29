import { atom } from "jotai"
import { selectedChatAtom } from "@/lib/chat-atoms"
import { currentWorkflowAtom, selectedWorkflowPathAtom } from "@/lib/store"
import {
  createEmptyWorkflowExecutionState,
  toWorkflowExecutionKey,
  type ApprovalRequest,
  type ExecutionRunStatus,
  type WorkflowExecutionState,
} from "@/lib/workflow-execution"
import type { PersistedRunSnapshot, RunResult, RunStatus } from "@shared/types"

type SetAtomValue<T> = T | ((prev: T) => T)

function resolveSetAtomValue<T>(update: SetAtomValue<T>, previous: T): T {
  return typeof update === "function"
    ? (update as (prev: T) => T)(previous)
    : update
}

export const workflowExecutionStatesAtom = atom<
  Record<string, WorkflowExecutionState>
>({})
export const selectedWorkflowExecutionKeyAtom = atom((get) =>
  toWorkflowExecutionKey(get(selectedWorkflowPathAtom)),
)
export const selectedWorkflowExecutionAtom = atom(
  (get) => {
    const key = get(selectedWorkflowExecutionKeyAtom)
    return (
      get(workflowExecutionStatesAtom)[key] ??
      createEmptyWorkflowExecutionState()
    )
  },
  (get, set, update: SetAtomValue<WorkflowExecutionState>) => {
    const key = get(selectedWorkflowExecutionKeyAtom)
    const states = get(workflowExecutionStatesAtom)
    const previous = states[key] ?? createEmptyWorkflowExecutionState()
    const next = resolveSetAtomValue(update, previous)
    set(workflowExecutionStatesAtom, {
      ...states,
      [key]: {
        ...next,
        lastUpdatedAt: Date.now(),
      },
    })
  },
)

export const updateWorkflowExecutionStateAtom = atom(
  null,
  (
    get,
    set,
    {
      key,
      update,
    }: { key: string; update: SetAtomValue<WorkflowExecutionState> },
  ) => {
    const states = get(workflowExecutionStatesAtom)
    const previous = states[key] ?? createEmptyWorkflowExecutionState()
    const next = resolveSetAtomValue(update, previous)
    set(workflowExecutionStatesAtom, {
      ...states,
      [key]: {
        ...next,
        lastUpdatedAt: Date.now(),
      },
    })
  },
)

export const resetWorkflowExecutionStateAtom = atom(
  null,
  (get, set, key: string) => {
    const states = get(workflowExecutionStatesAtom)
    set(workflowExecutionStatesAtom, {
      ...states,
      [key]: createEmptyWorkflowExecutionState(),
    })
  },
)

export const clearWorkflowExecutionStateAtom = atom(
  null,
  (get, set, key: string) => {
    const states = get(workflowExecutionStatesAtom)
    if (!(key in states)) return
    const next = { ...states }
    delete next[key]
    set(workflowExecutionStatesAtom, next)
  },
)

export const moveWorkflowExecutionStateAtom = atom(
  null,
  (get, set, { fromKey, toKey }: { fromKey: string; toKey: string }) => {
    if (fromKey === toKey) return
    const states = get(workflowExecutionStatesAtom)
    const source = states[fromKey]
    if (!source) return
    const next = { ...states, [toKey]: source }
    delete next[fromKey]
    set(workflowExecutionStatesAtom, next)
  },
)

function createSelectedWorkflowExecutionFieldAtom<
  K extends keyof WorkflowExecutionState,
>(field: K) {
  return atom(
    (get) => get(selectedWorkflowExecutionAtom)[field],
    (get, set, update: SetAtomValue<WorkflowExecutionState[K]>) => {
      set(selectedWorkflowExecutionAtom, (previous) => ({
        ...previous,
        [field]: resolveSetAtomValue(update, previous[field]),
      }))
    },
  )
}

export const runStatusAtom =
  createSelectedWorkflowExecutionFieldAtom("runStatus")
export const runOutcomeAtom =
  createSelectedWorkflowExecutionFieldAtom("runOutcome")
export const runStartedAtAtom =
  createSelectedWorkflowExecutionFieldAtom("runStartedAt")
export const completedAtAtom =
  createSelectedWorkflowExecutionFieldAtom("completedAt")
export const workflowNameAtom =
  createSelectedWorkflowExecutionFieldAtom("workflowName")
export const runIdAtom = createSelectedWorkflowExecutionFieldAtom("runId")
export const runWorkflowPathAtom =
  createSelectedWorkflowExecutionFieldAtom("runWorkflowPath")
export const nodeStatesAtom =
  createSelectedWorkflowExecutionFieldAtom("nodeStates")
export const activeNodeIdAtom =
  createSelectedWorkflowExecutionFieldAtom("activeNodeId")
export const inspectedNodeIdAtom =
  createSelectedWorkflowExecutionFieldAtom("inspectedNodeId")
export const evalResultsAtom =
  createSelectedWorkflowExecutionFieldAtom("evalResults")
export const finalContentAtom =
  createSelectedWorkflowExecutionFieldAtom("finalContent")
export const reportPathAtom =
  createSelectedWorkflowExecutionFieldAtom("reportPath")
export const workspaceAtom =
  createSelectedWorkflowExecutionFieldAtom("workspace")
export const pastRunsAtom = atom<RunResult[]>([])
export const selectedPastRunAtom =
  createSelectedWorkflowExecutionFieldAtom("selectedPastRun")

/**
 * Holds the loaded snapshot for the currently selected past run.
 * Written by useSelectedRunReview when it loads run data from disk.
 * Read by effectiveExecutionStateAtom to merge nodeStates, runtimeNodes, etc.
 */
export const pastRunSnapshotAtom = atom<PersistedRunSnapshot | null>(null)

/**
 * Returns past-run-adjusted execution state when viewing history,
 * otherwise the live execution state.
 */
export const effectiveExecutionStateAtom = atom((get) => {
  const live = get(selectedWorkflowExecutionAtom)
  const pastRun = get(selectedPastRunAtom)
  if (!pastRun) return live

  const snapshot = get(pastRunSnapshotAtom)

  return {
    ...live,
    runStatus: "done" as ExecutionRunStatus,
    runOutcome: pastRun.status,
    runId: pastRun.runId,
    runStartedAt: pastRun.startedAt,
    completedAt: pastRun.completedAt,
    reportPath: pastRun.reportPath,
    workspace: pastRun.workspace,
    workflowName: pastRun.workflowName,
    // Merge snapshot data when available so past-run viewers see real nodeStates
    ...(snapshot && {
      nodeStates: snapshot.nodeStates ?? live.nodeStates,
      runtimeNodes: snapshot.runtimeNodes ?? live.runtimeNodes,
      runtimeEdges: snapshot.runtimeEdges ?? live.runtimeEdges,
      runtimeMeta: snapshot.runtimeMeta ?? live.runtimeMeta,
      evalResults: snapshot.evalResults ?? live.evalResults,
    }),
  }
})

export const runtimeNodesAtom =
  createSelectedWorkflowExecutionFieldAtom("runtimeNodes")
export const runtimeEdgesAtom =
  createSelectedWorkflowExecutionFieldAtom("runtimeEdges")
export const runtimeMetaAtom =
  createSelectedWorkflowExecutionFieldAtom("runtimeMeta")
export const artifactRecordsAtom =
  createSelectedWorkflowExecutionFieldAtom("artifactRecords")
export const artifactPersistenceStatusAtom =
  createSelectedWorkflowExecutionFieldAtom("artifactPersistenceStatus")
export const artifactPersistenceErrorAtom =
  createSelectedWorkflowExecutionFieldAtom("artifactPersistenceError")
export const surfaceNoticeAtom =
  createSelectedWorkflowExecutionFieldAtom("surfaceNotice")
export const evalOverrideNodeIdsAtom = createSelectedWorkflowExecutionFieldAtom(
  "evalOverrideNodeIds",
)
export const resumeNodeIdAtom =
  createSelectedWorkflowExecutionFieldAtom("resumeNodeId")

export const runsByWorkflowPathAtom = atom<Record<string, RunResult[]>>(
  (get) => {
    const runs = get(pastRunsAtom)
    const grouped: Record<string, RunResult[]> = {}
    for (const run of runs) {
      const key = run.workflowPath || "__orphan__"
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(run)
    }
    return grouped
  },
)

export function doesRunBelongToWorkflowHistory(
  run: Pick<RunResult, "workflowName" | "workflowPath">,
  selectedWorkflowPath: string | null,
  _workflowName: string,
): boolean {
  if (!selectedWorkflowPath) return false
  const runPath = (run.workflowPath || "").trim()
  return runPath === selectedWorkflowPath
}

export const workflowHistoryRunsAtom = atom<RunResult[]>((get) => {
  // If a chat is selected, derive from chat.runs
  const chat = get(selectedChatAtom)
  if (chat && chat.runs.length > 0) {
    return chat.runs
      .filter(
        (r) =>
          r.status === "completed" ||
          r.status === "failed" ||
          r.status === "cancelled",
      )
      .map((r) => ({
        runId: r.runId,
        status: r.status as RunStatus,
        workflowName: r.templateName,
        workflowPath: r.workflowPath,
        startedAt: r.startedAt,
        completedAt: r.completedAt ?? r.startedAt,
        reportPath: "",
        workspace: r.workspace,
      }))
  }

  // Fallback: filter from pastRunsAtom (legacy behavior)
  const runs = get(pastRunsAtom)
  if (runs.length === 0) return []

  const selectedWorkflowPath = (get(selectedWorkflowPathAtom) || "").trim()
  const workflowName = (get(currentWorkflowAtom).name || "").trim()

  return runs.filter((run) =>
    doesRunBelongToWorkflowHistory(run, selectedWorkflowPath, workflowName),
  )
})

export const approvalRequestsAtom = atom<ApprovalRequest[]>([])
/** @deprecated Use approvalRequestsAtom (array) instead */
export const approvalRequestAtom = approvalRequestsAtom
