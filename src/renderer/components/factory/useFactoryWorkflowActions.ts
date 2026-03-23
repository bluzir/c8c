import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"

import { toast } from "sonner"

import {
  taskSelectionKey,
  toContinuationRun,
} from "@/components/notifications/task-ui"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import {
  hasSavedWorkContinuationContext,
  selectArtifactsForTemplateContracts,
} from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import type { MainView } from "@/lib/store"
import type {
  ArtifactRecord,
  FactoryPlannedCase,
  HumanTaskSummary,
  ProjectFactoryDefinition,
  RunResult,
  Workflow,
  WorkflowFile,
  WorkflowTemplate,
} from "@shared/types"

interface WorkflowTemplateContextSetter {
  key: string
  context: Awaited<
    ReturnType<typeof prepareTemplateStageLaunch>
  >["templateContext"]
}

export function useFactoryWorkflowActions({
  selectedProject,
  selectedWorkflowPath,
  workflowDirty,
  webSearchBackend,
  selectedFactoryDefinition,
  spawnTemplateCandidate,
  scopedArtifacts,
  templateById,
  confirmDiscard,
  setMainView,
  setSelectedWorkflowPath,
  setWorkflow,
  setWorkflowSavedSnapshot,
  setWorkflows,
  setWorkflowEntryState,
  setInputValue,
  setInputAttachments,
  setSelectedPastRun,
  setSelectedInboxTaskKey,
  setSelectedCaseId,
  setWorkflowContinuationEntryStateForKey,
  setWorkflowTemplateContextForKey,
}: {
  selectedProject: string | null
  selectedWorkflowPath: string | null
  workflowDirty: boolean
  webSearchBackend: WebSearchBackend
  selectedFactoryDefinition: ProjectFactoryDefinition | null
  spawnTemplateCandidate: WorkflowTemplate | null
  scopedArtifacts: ArtifactRecord[]
  templateById: Map<string, WorkflowTemplate>
  confirmDiscard: (actionLabel: string, dirty: boolean) => Promise<boolean>
  setMainView: (value: MainView) => void
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>
  setWorkflow: Dispatch<SetStateAction<Workflow>>
  setWorkflowSavedSnapshot: Dispatch<
    SetStateAction<ReturnType<typeof workflowSnapshot>>
  >
  setWorkflows: Dispatch<SetStateAction<WorkflowFile[]>>
  setWorkflowEntryState: (
    value: Awaited<ReturnType<typeof prepareTemplateStageLaunch>>["entryState"],
  ) => void
  setInputValue: (value: string) => void
  setInputAttachments: (
    value: Awaited<
      ReturnType<typeof prepareTemplateStageLaunch>
    >["artifactAttachments"],
  ) => void
  setSelectedPastRun: (value: RunResult | null) => void
  setSelectedInboxTaskKey: (value: string | null) => void
  setSelectedCaseId: (value: string | null) => void
  setWorkflowContinuationEntryStateForKey: (value: {
    key: string
    entryState:
      | Awaited<ReturnType<typeof prepareTemplateStageLaunch>>["entryState"]
      | null
  }) => void
  setWorkflowTemplateContextForKey: (
    value: WorkflowTemplateContextSetter,
  ) => void
}) {
  const [launchingTemplateId, setLaunchingTemplateId] = useState<string | null>(
    null,
  )

  const openWorkflowInThread = useCallback(
    async (
      workflowPath: string,
      options?: {
        preserveInboxTask?: boolean
        pastRun?: RunResult | null
      },
    ) => {
      const workflow = await window.api.loadWorkflow(workflowPath)
      setSelectedWorkflowPath(workflowPath)
      setWorkflow(workflow)
      setWorkflowSavedSnapshot(workflowSnapshot(workflow))
      if (!options?.preserveInboxTask) {
        setSelectedInboxTaskKey(null)
      }
      setSelectedPastRun(options?.pastRun ?? null)
      setMainView("thread")
      return workflow
    },
    [
      setMainView,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedWorkflowPath,
      setWorkflow,
      setWorkflowSavedSnapshot,
    ],
  )

  const applyPreparedLaunch = useCallback(
    (
      launch: Awaited<ReturnType<typeof prepareTemplateStageLaunch>>,
      options?: {
        clearInboxTask?: boolean
        clearPastRun?: boolean
      },
    ) => {
      setWorkflows(launch.refreshedWorkflows)
      setSelectedWorkflowPath(launch.filePath)
      setWorkflow(launch.loadedWorkflow)
      setWorkflowSavedSnapshot(launch.savedSnapshot)
      if (options?.clearPastRun !== false) {
        setSelectedPastRun(null)
      }
      if (options?.clearInboxTask !== false) {
        setSelectedInboxTaskKey(null)
      }
      setInputValue(launch.inputSeed)
      setWorkflowEntryState(launch.entryState)
      setWorkflowContinuationEntryStateForKey({
        key: toWorkflowExecutionKey(launch.filePath),
        entryState: hasSavedWorkContinuationContext(launch.templateContext)
          ? launch.entryState
          : null,
      })
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(launch.filePath),
        context: launch.templateContext,
      })
      setMainView("thread")
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setInputAttachments(launch.artifactAttachments)
        })
      })
    },
    [
      setInputAttachments,
      setInputValue,
      setMainView,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      setSelectedWorkflowPath,
      setWorkflow,
      setWorkflowContinuationEntryStateForKey,
      setWorkflowEntryState,
      setWorkflowSavedSnapshot,
      setWorkflowTemplateContextForKey,
      setWorkflows,
    ],
  )

  const openInboxTask = useCallback(
    async (task: HumanTaskSummary, caseId?: string) => {
      if (caseId) {
        setSelectedCaseId(caseId)
      }

      if (task.workflowPath) {
        if (
          task.workflowPath !== selectedWorkflowPath &&
          !(await confirmDiscard("open blocked work", workflowDirty))
        ) {
          return
        }
        try {
          setSelectedInboxTaskKey(taskSelectionKey(task))
          await openWorkflowInThread(task.workflowPath, {
            preserveInboxTask: true,
            pastRun: toContinuationRun(task),
          })
          return
        } catch (error) {
          toastErrorFromCatch("Could not open blocked work", error)
          return
        }
      }

      setSelectedInboxTaskKey(taskSelectionKey(task))
      setMainView("inbox")
    },
    [
      confirmDiscard,
      openWorkflowInThread,
      selectedWorkflowPath,
      setMainView,
      setSelectedCaseId,
      setSelectedInboxTaskKey,
      workflowDirty,
    ],
  )

  const launchPlannedCase = useCallback(
    async (plannedCase: FactoryPlannedCase) => {
      if (!selectedProject || launchingTemplateId) return
      const template =
        (plannedCase.templateId && templateById.get(plannedCase.templateId)) ||
        spawnTemplateCandidate
      if (!template) {
        toastError("No next library flow is linked to this planned track yet")
        return
      }

      const sourceArtifacts = plannedCase.sourceArtifactId
        ? scopedArtifacts.filter(
            (artifact) => artifact.id === plannedCase.sourceArtifactId,
          )
        : scopedArtifacts

      setLaunchingTemplateId(template.id)
      try {
        const launch = await prepareTemplateStageLaunch({
          projectPath: selectedProject,
          template,
          webSearchBackend,
          artifacts: selectArtifactsForTemplateContracts(
            template.contractIn,
            sourceArtifacts,
          ),
          factory: selectedFactoryDefinition
            ? {
                id: selectedFactoryDefinition.id,
                label: selectedFactoryDefinition.label,
              }
            : null,
          caseOverride: {
            caseId: plannedCase.id,
            caseLabel: plannedCase.title,
          },
          inputSeedPrefix:
            plannedCase.prompt || plannedCase.summary || plannedCase.title,
        })

        applyPreparedLaunch(launch)
        toast.success(`Opened ${template.name}`)
      } catch (error) {
        toastErrorFromCatch("Could not open the planned track", error)
      } finally {
        setLaunchingTemplateId(null)
      }
    },
    [
      applyPreparedLaunch,
      launchingTemplateId,
      scopedArtifacts,
      selectedFactoryDefinition,
      selectedProject,
      spawnTemplateCandidate,
      templateById,
      webSearchBackend,
    ],
  )

  const openWorkflow = useCallback(
    async (workflowPath: string | null) => {
      if (!workflowPath) return
      if (workflowPath === selectedWorkflowPath) {
        setSelectedInboxTaskKey(null)
        setSelectedPastRun(null)
        setMainView("thread")
        return
      }
      if (!(await confirmDiscard("open another flow", workflowDirty))) {
        return
      }

      try {
        await openWorkflowInThread(workflowPath)
      } catch (error) {
        toastErrorFromCatch("Could not open flow", error)
      }
    },
    [
      confirmDiscard,
      openWorkflowInThread,
      selectedWorkflowPath,
      setMainView,
      setSelectedInboxTaskKey,
      setSelectedPastRun,
      workflowDirty,
    ],
  )

  const openArtifact = useCallback(async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toastError("Could not open result", {
      description: openError,
    })
  }, [])

  const openReport = useCallback(async (reportPath: string | null) => {
    if (!reportPath) return
    const openError = await window.api.openReport(reportPath)
    if (!openError) return
    toastError("Could not open report", {
      description: String(openError),
    })
  }, [])

  const launchTemplate = useCallback(
    async (
      template: WorkflowTemplate,
      sourceArtifacts: ArtifactRecord[] = scopedArtifacts,
    ) => {
      if (!selectedProject || launchingTemplateId) return

      setLaunchingTemplateId(template.id)
      try {
        const launch = await prepareTemplateStageLaunch({
          projectPath: selectedProject,
          template,
          webSearchBackend,
          artifacts: selectArtifactsForTemplateContracts(
            template.contractIn,
            sourceArtifacts,
          ),
          factory: selectedFactoryDefinition
            ? {
                id: selectedFactoryDefinition.id,
                label: selectedFactoryDefinition.label,
              }
            : null,
        })

        applyPreparedLaunch(launch)
        toast.success(`Opened ${template.name}`)
      } catch (error) {
        toastErrorFromCatch("Could not open the selected step", error)
      } finally {
        setLaunchingTemplateId(null)
      }
    },
    [
      applyPreparedLaunch,
      launchingTemplateId,
      scopedArtifacts,
      selectedFactoryDefinition,
      selectedProject,
      webSearchBackend,
    ],
  )

  return {
    launchingTemplateId,
    openInboxTask,
    launchPlannedCase,
    openWorkflow,
    openArtifact,
    openReport,
    launchTemplate,
  }
}
