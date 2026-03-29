import { atom } from "jotai"
import type { RunEnvelope } from "@shared/types"
import {
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  currentWorkflowAtom,
  workflowSavedSnapshotAtom,
  selectedInboxTaskKeyAtom,
  viewModeAtom,
  inputValueAtom,
  inputAttachmentsAtom,
  workflowEntryStateAtom,
  workflowQueuedAutoRunPathAtom,
  mainViewAtom,
  chatRoutingProgressAtom,
  workflowCreateDraftPromptAtom,
  workflowCreatePromptScaffoldAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  setWorkflowContinuationEntryStateForKeyAtom,
  setWorkflowRequestedResultForKeyAtom,
  setWorkflowTemplateContextForKeyAtom,
} from "./store"
import {
  pastRunSnapshotAtom,
  selectedPastRunAtom,
} from "@/features/execution/state"
import { selectedChatIdAtom } from "./chat-atoms"
import { workflowSnapshot } from "./workflow-snapshot"
import { toWorkflowExecutionKey } from "./workflow-execution"
import {
  getRequestedResultFromEntryState,
  hasSavedWorkContinuationContext,
} from "./workflow-entry"
import { EMPTY_WORKFLOW_CREATE_SCAFFOLD } from "./workflow-create-prompt"

// ── commitEnvelopeAtom ──────────────────────────────────
//
// Write-only atom. Applies all RunEnvelope fields to UI atoms in a single
// Jotai write transaction — no intermediate renders, no partial state.
// This replaces the 20+ sequential set() calls that caused flash during routing.

export const commitEnvelopeAtom = atom(
  null,
  (_get, set, envelope: RunEnvelope) => {
    const {
      workflowPath,
      workflow,
      intent,
      input,
      attachments,
      entryState,
      templateContext,
    } = envelope

    // Project + workflow identity
    set(selectedProjectAtom, intent.projectPath)
    set(selectedWorkflowPathAtom, workflowPath)
    set(currentWorkflowAtom, workflow)
    set(workflowSavedSnapshotAtom, workflowSnapshot(workflow))

    // Clear stale per-run state
    set(selectedPastRunAtom, null)
    set(pastRunSnapshotAtom, null)
    set(selectedInboxTaskKeyAtom, null)

    // Input surface
    set(inputValueAtom, input.value)
    set(inputAttachmentsAtom, attachments)

    // Entry state + continuation tracking
    set(workflowEntryStateAtom, entryState)
    const execKey = toWorkflowExecutionKey(workflowPath)
    set(setWorkflowContinuationEntryStateForKeyAtom, {
      key: execKey,
      entryState:
        entryState && hasSavedWorkContinuationContext(templateContext)
          ? entryState
          : null,
    })
    set(setWorkflowRequestedResultForKeyAtom, {
      key: execKey,
      value: getRequestedResultFromEntryState(entryState) || null,
    })
    set(setWorkflowTemplateContextForKeyAtom, {
      key: execKey,
      context: templateContext,
    })

    // Auto-run trigger
    set(workflowQueuedAutoRunPathAtom, envelope.autoRun ? workflowPath : null)

    // Navigation
    set(viewModeAtom, "chat")
    set(mainViewAtom, "thread")
    set(chatRoutingProgressAtom, null)

    // Chat identity
    if (envelope.chatId) {
      set(selectedChatIdAtom, envelope.chatId)
    }

    // Clear create-surface state so the composer starts fresh
    set(workflowCreateDraftPromptAtom, "")
    set(workflowCreatePromptScaffoldAtom, EMPTY_WORKFLOW_CREATE_SCAFFOLD)
    set(workflowCreateSourceArtifactsAtom, [])
    set(workflowCreateSourceAttachmentsAtom, [])
  },
)
