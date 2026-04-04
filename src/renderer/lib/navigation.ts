import { atom } from "jotai"
import {
  chatRoutingProgressAtom,
  chatPendingRoutingPromptAtom,
  mainViewAtom,
  viewModeAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  selectedInboxTaskKeyAtom,
  workflowEntryStateAtom,
  type MainView,
  type ViewMode,
} from "./store"
import { pastRunSnapshotAtom, selectedPastRunAtom } from "@/features/execution"

// ── Public types ──────────────────────────────────────────

type NavigableView = "settings" | "skills" | "templates" | "artifacts" | "inbox"

export type NavigationTarget =
  | { kind: "workflow"; workflowPath: string; projectPath: string }
  | { kind: "create"; projectPath?: string | null; locked?: boolean }
  | { kind: "view"; view: NavigableView }

// ── Testable pure function ────────────────────────────────

export interface NavigationOps {
  setChatRoutingProgress(v: null): void
  setChatPendingRoutingPrompt(v: null): void
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
  // 1. Clear routing state
  ops.setChatRoutingProgress(null)
  ops.setChatPendingRoutingPrompt(null)

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
      setChatRoutingProgress: (v) => set(chatRoutingProgressAtom, v),
      setChatPendingRoutingPrompt: (v) => set(chatPendingRoutingPromptAtom, v),
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
