import { atom } from "jotai"
import {
  chatMessagesAtom,
  chatStatusAtom,
  chatSessionIdAtom,
  chatUndoStackAtom,
  chatRoutingProgressAtom,
  chatPendingRoutingPromptAtom,
  followUpLabelAtom,
  batchStatusAtom,
  batchIdAtom,
  batchErrorAtom,
  batchItemsAtom,
  batchSummaryAtom,
  batchProgressAtom,
  workflowCreateDraftPromptAtom,
  workflowCreatePromptScaffoldAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  mainViewAtom,
  viewModeAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  selectedInboxTaskKeyAtom,
  workflowEntryStateAtom,
  type MainView,
  type ViewMode,
} from "./store"
import { EMPTY_WORKFLOW_CREATE_SCAFFOLD } from "./workflow-create-prompt"
import { pastRunSnapshotAtom, selectedPastRunAtom } from "@/features/execution"

// ── Ephemeral state resets ────────────────────────────────
//
// Every atom that should be wiped on navigation (chat, routing, batch,
// create-surface) lives here.  Adding a new ephemeral atom?  Add it to
// this list — that's the ONLY place you need to touch.

export const EPHEMERAL_RESETS: ReadonlyArray<readonly [atom: any, value: any]> =
  [
    // Chat session
    [chatMessagesAtom, []],
    [chatStatusAtom, "idle"],
    [chatSessionIdAtom, null],
    [chatUndoStackAtom, []],
    // Routing
    [chatRoutingProgressAtom, null],
    [chatPendingRoutingPromptAtom, null],
    [followUpLabelAtom, null],
    // Batch
    [batchStatusAtom, "idle"],
    [batchIdAtom, null],
    [batchErrorAtom, null],
    [batchItemsAtom, []],
    [batchSummaryAtom, null],
    [batchProgressAtom, { completed: 0, total: 0, running: 0 }],
    // Create surface
    [workflowCreateDraftPromptAtom, ""],
    [workflowCreatePromptScaffoldAtom, EMPTY_WORKFLOW_CREATE_SCAFFOLD],
    [workflowCreateSourceArtifactsAtom, []],
    [workflowCreateSourceAttachmentsAtom, []],
  ]

/** Write-only atom: resets all ephemeral UI state. */
export const resetEphemeralStateAtom = atom(null, (_get, set) => {
  for (const [a, v] of EPHEMERAL_RESETS) set(a, v)
})

// ── Public types ──────────────────────────────────────────

type NavigableView = "settings" | "skills" | "templates" | "artifacts" | "inbox"

export type NavigationTarget =
  | { kind: "workflow"; workflowPath: string; projectPath: string }
  | { kind: "create"; projectPath?: string | null; locked?: boolean }
  | { kind: "view"; view: NavigableView }

// ── Testable pure function ────────────────────────────────

export interface NavigationOps {
  resetEphemeralState(): void
  setSelectedPastRun(v: null): void
  setSelectedInboxTaskKey(v: null): void
  setSelectedProject(v: string): void
  setSelectedWorkflowPath(v: string | null): void
  setWorkflowEntryState(v: null): void
  setMainView(v: MainView): void
  setViewMode(v: ViewMode): void
}

/**
 * The single function that applies all cleanup + navigation state.
 *
 * Every navigation transition must go through here so that routing,
 * review, and stale selection state is always cleaned up.
 */
export function applyNavigation(
  target: NavigationTarget,
  ops: NavigationOps,
): void {
  // 1. Reset all ephemeral state (chat, routing, batch, create-surface)
  ops.resetEphemeralState()

  // 2. Clear review state
  ops.setSelectedPastRun(null)
  ops.setSelectedInboxTaskKey(null)

  // 3. Apply target-specific state
  switch (target.kind) {
    case "workflow":
      ops.setSelectedProject(target.projectPath)
      ops.setMainView("thread")
      ops.setViewMode("chat")
      break

    case "create":
      ops.setSelectedWorkflowPath(null)
      ops.setWorkflowEntryState(null)
      ops.setMainView("thread")
      ops.setViewMode("chat")
      break

    case "view":
      ops.setMainView(target.view)
      break
  }
}

// ── Jotai atom ────────────────────────────────────────────

/**
 * Write-only atom.  The ONLY way to navigate between views.
 *
 * Replaces scattered `clearAllRoutingState()` + direct `setMainView`
 * calls.  Guarantees that routing, review, and selection state is
 * always cleaned up on every navigation.
 */
export const commitNavigationAtom = atom(
  null,
  (_get, set, target: NavigationTarget) => {
    applyNavigation(target, {
      resetEphemeralState: () => {
        for (const [a, v] of EPHEMERAL_RESETS) set(a, v)
      },
      setSelectedPastRun: (v) => {
        set(selectedPastRunAtom, v)
        set(pastRunSnapshotAtom, null)
      },
      setSelectedInboxTaskKey: (v) => set(selectedInboxTaskKeyAtom, v),
      setSelectedProject: (v) => set(selectedProjectAtom, v),
      setSelectedWorkflowPath: (v) => set(selectedWorkflowPathAtom, v),
      setWorkflowEntryState: (v) => set(workflowEntryStateAtom, v),
      setMainView: (v) => set(mainViewAtom, v),
      setViewMode: (v) => set(viewModeAtom, v),
    })
  },
)
