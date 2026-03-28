import { atom } from "jotai"
import type { ArtifactRecord, InputAttachment, Workflow, WorkflowInput } from "@shared/types"
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
import { selectedPastRunAtom } from "@/features/execution/state"
import { workflowSnapshot } from "./workflow-snapshot"
import { toWorkflowExecutionKey } from "./workflow-execution"
import {
  getRequestedResultFromEntryState,
  hasSavedWorkContinuationContext,
  type WorkflowEntryState,
  type WorkflowTemplateRunContext,
} from "./workflow-entry"
import { EMPTY_WORKFLOW_CREATE_SCAFFOLD } from "./workflow-create-prompt"

// ── RunEnvelope ─────────────────────────────────────────
//
// A fully-resolved intent package produced by the routing layer.
// commitEnvelopeAtom applies it to all UI atoms in one Jotai transaction,
// eliminating the race window that existed with sequential set() calls.

export type RunEnvelopeIntent =
  | {
      type: "new_workflow"
      projectPath: string
      requestedResult: string
    }
  | {
      type: "follow_up"
      projectPath: string
      requestedResult: string
    }
  | {
      type: "open_existing"
      projectPath: string
      requestedResult: string
    }

export interface RunEnvelope {
  /** Resolved routing intent — what the user was trying to do */
  intent: RunEnvelopeIntent
  /** The workflow graph to load */
  workflow: Workflow
  /** Absolute path to the workflow file */
  workflowPath: string
  /** Pre-populated input value for the chat/run input field */
  input: WorkflowInput
  /** Artifacts resolved from prior runs, used as context */
  resolvedArtifacts: ArtifactRecord[]
  /** File/run/text attachments to pre-populate in the input panel */
  attachments: InputAttachment[]
  /** Entry state for the WorkflowResumeHeader / entry card */
  entryState: WorkflowEntryState | null
  /** Template context for continuation tracking */
  templateContext: WorkflowTemplateRunContext | null
  /** Raw route result from the agent, if applicable */
  routeResult: unknown | null
  /** If true, trigger an auto-run immediately after navigation */
  autoRun: boolean
  /** Non-fatal contract warnings surfaced to the user */
  contractWarnings: string[]
}

// ── commitEnvelopeAtom ──────────────────────────────────
//
// Write-only atom. Applies all RunEnvelope fields to UI atoms in a single
// Jotai write transaction — no intermediate renders, no partial state.

export const commitEnvelopeAtom = atom(
  null,
  (get, set, envelope: RunEnvelope) => {
    const { workflowPath, workflow, intent, input, attachments, entryState, templateContext } =
      envelope

    // Project + workflow identity
    set(selectedProjectAtom, intent.projectPath)
    set(selectedWorkflowPathAtom, workflowPath)
    set(currentWorkflowAtom, workflow)
    set(workflowSavedSnapshotAtom, workflowSnapshot(workflow))

    // Clear stale per-run state
    set(selectedPastRunAtom, null)
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

    // Clear create-surface state so the composer starts fresh
    set(workflowCreateDraftPromptAtom, "")
    set(workflowCreatePromptScaffoldAtom, EMPTY_WORKFLOW_CREATE_SCAFFOLD)
    set(workflowCreateSourceArtifactsAtom, [])
    set(workflowCreateSourceAttachmentsAtom, [])
  },
)
