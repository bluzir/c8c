import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  chatPendingRoutingPromptAtom,
  chatRoutingProgressAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  selectedInboxTaskKeyAtom,
  selectedResultModeIdAtom,
  viewModeAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  workflowEntryStateAtom,
  type MainView,
  type ViewMode,
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
  setMainView: (next: MainView) => void
  setViewMode: (next: ViewMode) => void
  setSelectedWorkflowPath: (next: string | null) => void
  setSelectedResultModeId: (next: ResultModeId) => void
  setWorkflowCreateContext: (next: {
    projectPath: string | null
    locked: boolean
  }) => void
  setWorkflowCreateDraftPrompt: (next: string) => void
  setWorkflowCreateSourceArtifacts: (next: ArtifactRecord[]) => void
  setWorkflowCreateSourceAttachments: (next: InputAttachment[]) => void
  setWorkflowEntryState: (next: null) => void
  clearReviewState: () => void
  clearRoutingProgress: () => void
}

export function applyWorkflowCreateNavigationState({
  options = {},
  selectedProject,
  setMainView,
  setViewMode,
  setSelectedWorkflowPath,
  setSelectedResultModeId,
  setWorkflowCreateContext,
  setWorkflowCreateDraftPrompt,
  setWorkflowCreateSourceArtifacts,
  setWorkflowCreateSourceAttachments,
  setWorkflowEntryState,
  clearReviewState,
  clearRoutingProgress,
}: ApplyWorkflowCreateNavigationParams): void {
  clearRoutingProgress()

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
  setWorkflowEntryState(null)
  clearReviewState()
  // Clear current workflow so chat shows empty state for new flow creation
  setSelectedWorkflowPath(null)
  // Always go to chat — never to the separate create page
  setMainView("thread")
  setViewMode("chat")
}

export function useWorkflowCreateNavigation() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const setMainView = useSetAtom(mainViewAtom)
  const setViewMode = useSetAtom(viewModeAtom)
  const setSelectedWorkflowPath = useSetAtom(selectedWorkflowPathAtom)
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
  const setChatRoutingProgress = useSetAtom(chatRoutingProgressAtom)
  const setWorkflowEntryState = useSetAtom(workflowEntryStateAtom)

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

        setChatRoutingProgress(null)
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
        setSelectedWorkflowPath(null)
        setSelectedInboxTaskKey(null)
        setSelectedPastRun(null)
        setWorkflowEntryState(null)
        setChatPendingRoutingPrompt(options.prompt)
        setMainView("thread")
        setViewMode("chat")
        return
      }

      applyWorkflowCreateNavigationState({
        options,
        selectedProject,
        setMainView,
        setViewMode,
        setSelectedWorkflowPath,
        setSelectedResultModeId,
        setWorkflowCreateContext,
        setWorkflowCreateDraftPrompt,
        setWorkflowCreateSourceArtifacts,
        setWorkflowCreateSourceAttachments,
        setWorkflowEntryState,
        clearReviewState: () => {
          setSelectedInboxTaskKey(null)
          setSelectedPastRun(null)
        },
        clearRoutingProgress: () => setChatRoutingProgress(null),
      })
    },
    [
      selectedProject,
      setChatPendingRoutingPrompt,
      setChatRoutingProgress,
      setMainView,
      setSelectedWorkflowPath,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedResultModeId,
      setViewMode,
      setWorkflowCreateContext,
      setWorkflowCreateDraftPrompt,
      setWorkflowCreateSourceArtifacts,
      setWorkflowCreateSourceAttachments,
      setWorkflowEntryState,
    ],
  )

  return { openWorkflowCreate }
}
