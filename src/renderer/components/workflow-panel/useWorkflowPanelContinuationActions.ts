import { useCallback } from "react"

import { toast } from "sonner"

import { contextRequiresStartApproval } from "@/lib/stage-run-policy"
import type { MainView } from "@/lib/store"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { useWorkflowUseInNewFlow } from "./useWorkflowUseInNewFlow"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import {
  getRequestedResultFromEntryState,
  hasSavedWorkContinuationContext,
} from "@/lib/workflow-entry"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import type {
  ArtifactRecord,
  InputAttachment,
  Workflow,
  WorkflowTemplate,
} from "@shared/types"

interface OutputTabRequest {
  tab: "nodes" | "log" | "result" | "history"
  nodeId?: string
  nonce: number
}

export function useWorkflowPanelContinuationActions({
  selectedProject,
  canUseInNewFlow,
  artifactRecords,
  resultSourceAttachments,
  webSearchBackend,
  openWorkflowCreate,
  queuePreparedStageAutoRun,
  runNextStage,
  focusInputPanel,
  setWorkflows,
  setSelectedWorkflowPath,
  setWorkflowDirect,
  setWorkflowSavedSnapshot,
  setInputValue,
  setWorkflowEntryState,
  setWorkflowContinuationEntryState,
  setWorkflowRequestedResultForKey,
  setWorkflowTemplateContextForKey,
  setSelectedInboxTaskKey,
  setSelectedPastRun,
  setPrepareNewRun,
  setWorkflowReviewMode,
  setMainView,
  setViewMode,
  setOutputTabRequest,
  setInputAttachments,
}: {
  selectedProject: string | null
  canUseInNewFlow: boolean
  artifactRecords: ArtifactRecord[]
  resultSourceAttachments: InputAttachment[]
  webSearchBackend: WebSearchBackend
  openWorkflowCreate: (options?: {
    projectPath?: string | null
    locked?: boolean
    prompt?: string
    sourceArtifacts?: ArtifactRecord[]
    initialAttachments?: InputAttachment[]
  }) => void
  queuePreparedStageAutoRun: (params: {
    filePath: string
    autoRunIfAllowed: boolean
    requiresApproval: boolean
  }) => void
  runNextStage: (
    openPreparedTemplateStage: (
      launch: Awaited<ReturnType<typeof prepareTemplateStageLaunch>>,
      options: {
        autoRunIfAllowed: boolean
        successMessage: string
        approvalMessage?: string
      },
    ) => void,
  ) => Promise<void>
  focusInputPanel: () => void
  setWorkflows: (value: import("@shared/types").WorkflowFile[]) => void
  setSelectedWorkflowPath: (value: string | null) => void
  setWorkflowDirect: (value: Workflow) => void
  setWorkflowSavedSnapshot: (
    value: ReturnType<
      typeof import("@/lib/workflow-snapshot").workflowSnapshot
    >,
  ) => void
  setInputValue: (value: string) => void
  setWorkflowEntryState: (
    value: import("@/lib/workflow-entry").WorkflowEntryState | null,
  ) => void
  setWorkflowContinuationEntryState: (
    value: import("@/lib/workflow-entry").WorkflowEntryState | null,
  ) => void
  setWorkflowRequestedResultForKey: (value: {
    key: string
    value: string | null
  }) => void
  setWorkflowTemplateContextForKey: (value: {
    key: string
    context: import("@/lib/workflow-entry").WorkflowTemplateRunContext | null
  }) => void
  setSelectedInboxTaskKey: (value: string | null) => void
  setSelectedPastRun: (value: import("@shared/types").RunResult | null) => void
  setPrepareNewRun: (value: boolean) => void
  setWorkflowReviewMode: (value: boolean) => void
  setMainView: (value: MainView) => void
  setViewMode: (value: "list" | "settings") => void
  setOutputTabRequest: (value: OutputTabRequest | null) => void
  setInputAttachments: (value: InputAttachment[]) => void
}) {
  const openPreparedTemplateStage = useCallback(
    (
      launch: Awaited<ReturnType<typeof prepareTemplateStageLaunch>>,
      options: {
        autoRunIfAllowed: boolean
        successMessage: string
        approvalMessage?: string
      },
    ) => {
      setWorkflows(launch.refreshedWorkflows)
      setSelectedWorkflowPath(launch.filePath)
      setWorkflowDirect(launch.loadedWorkflow)
      setWorkflowSavedSnapshot(launch.savedSnapshot)
      setInputValue(launch.inputSeed)
      setWorkflowEntryState(launch.entryState)
      setWorkflowContinuationEntryState(
        hasSavedWorkContinuationContext(launch.templateContext)
          ? launch.entryState
          : null,
      )
      setWorkflowRequestedResultForKey({
        key: toWorkflowExecutionKey(launch.filePath),
        value: getRequestedResultFromEntryState(launch.entryState) || null,
      })
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(launch.filePath),
        context: launch.templateContext,
      })
      setSelectedInboxTaskKey(null)
      setSelectedPastRun(null)
      setPrepareNewRun(false)
      setWorkflowReviewMode(false)
      setMainView("thread")
      setViewMode("list")
      setOutputTabRequest(null)
      setInputAttachments(launch.artifactAttachments)
      const nextStageNeedsApproval = contextRequiresStartApproval(
        launch.templateContext,
      )
      queuePreparedStageAutoRun({
        filePath: launch.filePath,
        autoRunIfAllowed: options.autoRunIfAllowed,
        requiresApproval: nextStageNeedsApproval,
      })

      toast.success(
        nextStageNeedsApproval
          ? options.approvalMessage || options.successMessage
          : options.successMessage,
      )
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (nextStageNeedsApproval) {
            focusInputPanel()
          }
        })
      })
    },
    [
      focusInputPanel,
      queuePreparedStageAutoRun,
      setInputAttachments,
      setInputValue,
      setMainView,
      setOutputTabRequest,
      setPrepareNewRun,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedWorkflowPath,
      setViewMode,
      setWorkflowContinuationEntryState,
      setWorkflowDirect,
      setWorkflowEntryState,
      setWorkflowRequestedResultForKey,
      setWorkflowReviewMode,
      setWorkflowSavedSnapshot,
      setWorkflowTemplateContextForKey,
      setWorkflows,
    ],
  )

  const handleRunNextStage = useCallback(async () => {
    await runNextStage(openPreparedTemplateStage)
  }, [openPreparedTemplateStage, runNextStage])

  const useInNewFlowState = useWorkflowUseInNewFlow({
    selectedProject,
    canUseInNewFlow,
    artifactRecords,
    resultSourceAttachments,
    webSearchBackend,
    openWorkflowCreate,
    openPreparedTemplateStage,
  })

  return {
    handleRunNextStage,
    ...useInNewFlowState,
  }
}
