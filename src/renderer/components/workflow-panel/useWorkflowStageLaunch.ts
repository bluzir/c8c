import { useCallback, useEffect, useState } from "react"

import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import { contextAutoRunsOnContinue } from "@/lib/stage-run-policy"
import {
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
} from "@/lib/workflow-entry"
import { toastErrorFromCatch } from "@/lib/toast-error"
import type { WorkflowTemplateRunContext } from "@/lib/workflow-entry"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import type {
  ArtifactRecord,
  PermissionMode,
  WorkflowTemplate,
} from "@shared/types"

interface OpenPreparedTemplateStageOptions {
  autoRunIfAllowed: boolean
  successMessage: string
  approvalMessage?: string
}

type OpenPreparedTemplateStage = (
  launch: Awaited<ReturnType<typeof prepareTemplateStageLaunch>>,
  options: OpenPreparedTemplateStageOptions,
) => void

export function useWorkflowStageLaunch({
  run,
  startApprovalRequired,
  runStatus,
  selectedProject,
  nextStageTemplate,
  nextStageArtifacts,
  webSearchBackend,
  selectedWorkflowTemplateContext,
  selectedWorkflowPath,
  queuedAutoRunPath,
  setQueuedAutoRunPath,
}: {
  run: (mode?: PermissionMode) => Promise<void>
  startApprovalRequired: boolean
  runStatus: ExecutionRunStatus
  selectedProject: string | null
  nextStageTemplate: WorkflowTemplate | null
  nextStageArtifacts: ArtifactRecord[]
  webSearchBackend: WebSearchBackend
  selectedWorkflowTemplateContext: WorkflowTemplateRunContext | null
  selectedWorkflowPath: string | null
  queuedAutoRunPath: string | null
  setQueuedAutoRunPath: (value: string | null) => void
}) {
  const [stageStartGateOpen, setStageStartGateOpen] = useState(false)
  const [pendingRunMode, setPendingRunMode] = useState<PermissionMode>("edit")
  const [pendingAutoRunPath, setPendingAutoRunPath] = useState<string | null>(
    null,
  )
  const [launchingNextStage, setLaunchingNextStage] = useState(false)
  const [runLaunchPending, setRunLaunchPending] = useState(false)

  const handleRunRequest = useCallback(
    async (mode: PermissionMode = "edit") => {
      if (runLaunchPending) return
      if (startApprovalRequired) {
        setPendingRunMode(mode)
        setStageStartGateOpen(true)
        return
      }
      setRunLaunchPending(true)
      try {
        await run(mode)
      } finally {
        setRunLaunchPending(false)
      }
    },
    [run, runLaunchPending, startApprovalRequired],
  )

  const handleApproveStageStart = useCallback(async () => {
    if (runLaunchPending) return
    const mode = pendingRunMode
    setStageStartGateOpen(false)
    setRunLaunchPending(true)
    try {
      await run(mode)
    } finally {
      setRunLaunchPending(false)
    }
  }, [pendingRunMode, run, runLaunchPending])

  const handleCancelStageStart = useCallback(() => {
    setStageStartGateOpen(false)
    setPendingRunMode("edit")
  }, [])

  const queuePreparedStageAutoRun = useCallback(
    ({
      filePath,
      autoRunIfAllowed,
      requiresApproval,
    }: {
      filePath: string
      autoRunIfAllowed: boolean
      requiresApproval: boolean
    }) => {
      setPendingAutoRunPath(
        autoRunIfAllowed && !requiresApproval ? filePath : null,
      )
    },
    [],
  )

  const runNextStage = useCallback(
    async (openPreparedTemplateStage: OpenPreparedTemplateStage) => {
      if (!selectedProject || !nextStageTemplate || launchingNextStage) return

      setLaunchingNextStage(true)
      try {
        const launch = await prepareTemplateStageLaunch({
          projectPath: selectedProject,
          template: nextStageTemplate,
          webSearchBackend,
          artifacts: nextStageArtifacts,
        })
        openPreparedTemplateStage(launch, {
          autoRunIfAllowed: true,
          successMessage: `Continuing to ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`,
          approvalMessage: `Opened step awaiting approval: ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`,
        })
      } catch (error) {
        toastErrorFromCatch("Could not open the next step", error)
      } finally {
        setLaunchingNextStage(false)
      }
    },
    [
      launchingNextStage,
      nextStageArtifacts,
      nextStageTemplate,
      selectedProject,
      webSearchBackend,
    ],
  )

  useEffect(() => {
    if (runStatus === "idle") return
    setStageStartGateOpen(false)
  }, [runStatus])

  useEffect(() => {
    if (!stageStartGateOpen) return
    if (startApprovalRequired) return
    setStageStartGateOpen(false)
    setPendingRunMode("edit")
  }, [stageStartGateOpen, startApprovalRequired])

  useEffect(() => {
    if (!pendingAutoRunPath) return
    if (selectedWorkflowPath !== pendingAutoRunPath) return
    if (runStatus !== "idle") return
    if (!contextAutoRunsOnContinue(selectedWorkflowTemplateContext)) return

    setPendingAutoRunPath(null)
    void handleRunRequest()
  }, [
    handleRunRequest,
    pendingAutoRunPath,
    runStatus,
    selectedWorkflowPath,
    selectedWorkflowTemplateContext,
  ])

  useEffect(() => {
    if (!queuedAutoRunPath || !selectedWorkflowPath) return
    if (selectedWorkflowPath === queuedAutoRunPath) return
    setQueuedAutoRunPath(null)
  }, [queuedAutoRunPath, selectedWorkflowPath, setQueuedAutoRunPath])

  useEffect(() => {
    if (!queuedAutoRunPath) return
    if (selectedWorkflowPath !== queuedAutoRunPath) return
    if (runStatus !== "idle") return
    if (!selectedWorkflowTemplateContext) return

    setQueuedAutoRunPath(null)
    if (!contextAutoRunsOnContinue(selectedWorkflowTemplateContext)) return
    void handleRunRequest()
  }, [
    handleRunRequest,
    queuedAutoRunPath,
    runStatus,
    selectedWorkflowPath,
    selectedWorkflowTemplateContext,
    setQueuedAutoRunPath,
  ])

  return {
    stageStartGateOpen,
    handleRunRequest,
    handleApproveStageStart,
    handleCancelStageStart,
    queuePreparedStageAutoRun,
    runNextStage,
    launchingNextStage,
    runLaunchPending,
  }
}
