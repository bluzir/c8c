import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  chatPendingRoutingPromptAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedInboxTaskKeyAtom,
  selectedResultModeIdAtom,
  viewModeAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
} from "@/lib/store"
import { selectedPastRunAtom } from "@/features/execution"
import type {
  ArtifactRecord,
  InputAttachment,
  ResultModeId,
} from "@shared/types"

interface OpenWorkflowCreateOptions {
  projectPath?: string | null
  locked?: boolean
  prompt?: string
  modeId?: ResultModeId
  sourceArtifacts?: ArtifactRecord[]
  initialAttachments?: InputAttachment[]
}

interface ApplyWorkflowCreateNavigationParams {
  options?: OpenWorkflowCreateOptions
  selectedProject: string | null
  setMainView: (next: "workflow_create") => void
  setSelectedResultModeId: (next: ResultModeId) => void
  setWorkflowCreateContext: (next: {
    projectPath: string | null
    locked: boolean
  }) => void
  setWorkflowCreateDraftPrompt: (next: string) => void
  setWorkflowCreateSourceArtifacts: (next: ArtifactRecord[]) => void
  setWorkflowCreateSourceAttachments: (next: InputAttachment[]) => void
  clearReviewState: () => void
}

export function applyWorkflowCreateNavigationState({
  options = {},
  selectedProject,
  setMainView,
  setSelectedResultModeId,
  setWorkflowCreateContext,
  setWorkflowCreateDraftPrompt,
  setWorkflowCreateSourceArtifacts,
  setWorkflowCreateSourceAttachments,
  clearReviewState,
}: ApplyWorkflowCreateNavigationParams): void {
  const projectPath = Object.prototype.hasOwnProperty.call(
    options,
    "projectPath",
  )
    ? (options.projectPath ?? null)
    : (selectedProject ?? null)

  if (options.modeId) {
    setSelectedResultModeId(options.modeId)
  }

  setWorkflowCreateContext({
    projectPath,
    locked: Boolean(options.locked && projectPath),
  })
  setWorkflowCreateDraftPrompt(options.prompt ?? "")
  setWorkflowCreateSourceArtifacts(options.sourceArtifacts ?? [])
  setWorkflowCreateSourceAttachments(options.initialAttachments ?? [])
  clearReviewState()
  setMainView("workflow_create")
}

export function useWorkflowCreateNavigation() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const setMainView = useSetAtom(mainViewAtom)
  const setViewMode = useSetAtom(viewModeAtom)
  const setSelectedInboxTaskKey = useSetAtom(selectedInboxTaskKeyAtom)
  const setSelectedResultModeId = useSetAtom(selectedResultModeIdAtom)
  const setSelectedPastRun = useSetAtom(selectedPastRunAtom)
  const setWorkflowCreateContext = useSetAtom(workflowCreateContextAtom)
  const setWorkflowCreateDraftPrompt = useSetAtom(workflowCreateDraftPromptAtom)
  const setWorkflowCreateSourceArtifacts = useSetAtom(
    workflowCreateSourceArtifactsAtom,
  )
  const setWorkflowCreateSourceAttachments = useSetAtom(
    workflowCreateSourceAttachmentsAtom,
  )
  const setChatPendingRoutingPrompt = useSetAtom(chatPendingRoutingPromptAtom)

  const openWorkflowCreate = useCallback(
    (options: OpenWorkflowCreateOptions = {}) => {
      // When a prompt is provided, route directly from chat instead of
      // showing the create page. The chat panel picks up the pending prompt
      // and triggers routing via useFlowRouting.
      if (options.prompt) {
        const projectPath = Object.prototype.hasOwnProperty.call(
          options,
          "projectPath",
        )
          ? (options.projectPath ?? null)
          : (selectedProject ?? null)

        if (options.modeId) {
          setSelectedResultModeId(options.modeId)
        }
        setWorkflowCreateContext({
          projectPath,
          locked: Boolean(options.locked && projectPath),
        })
        setWorkflowCreateDraftPrompt(options.prompt)
        setWorkflowCreateSourceArtifacts(options.sourceArtifacts ?? [])
        setWorkflowCreateSourceAttachments(options.initialAttachments ?? [])
        setSelectedInboxTaskKey(null)
        setSelectedPastRun(null)
        setChatPendingRoutingPrompt(options.prompt)
        setMainView("thread")
        setViewMode("chat")
        return
      }

      applyWorkflowCreateNavigationState({
        options,
        selectedProject,
        setMainView,
        setSelectedResultModeId,
        setWorkflowCreateContext,
        setWorkflowCreateDraftPrompt,
        setWorkflowCreateSourceArtifacts,
        setWorkflowCreateSourceAttachments,
        clearReviewState: () => {
          setSelectedInboxTaskKey(null)
          setSelectedPastRun(null)
        },
      })
    },
    [
      selectedProject,
      setChatPendingRoutingPrompt,
      setMainView,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedResultModeId,
      setViewMode,
      setWorkflowCreateContext,
      setWorkflowCreateDraftPrompt,
      setWorkflowCreateSourceArtifacts,
      setWorkflowCreateSourceAttachments,
    ],
  )

  return { openWorkflowCreate }
}
