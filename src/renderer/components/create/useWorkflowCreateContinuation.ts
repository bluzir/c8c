import { useEffect, useMemo, useRef, useState } from "react"
import type { ArtifactRecord, CaseStateRecord, HumanTaskSummary, WorkflowTemplate } from "@shared/types"
import { errorToUserMessage } from "@/lib/error-message"
import { toastErrorFromCatch } from "@/lib/toast-error"
import {
  deriveWorkflowCreateContinuations,
  resolveWorkflowCreateContinuationPresentation,
  type WorkflowCreateContinuationCandidate,
} from "@/lib/workflow-create-continuation"

interface WorkflowCreateContinuationResources {
  artifacts: ArtifactRecord[]
  caseStates: CaseStateRecord[]
  humanTasks: HumanTaskSummary[]
}

interface WorkflowCreateContinuationReadResult {
  resources: WorkflowCreateContinuationResources
  error: unknown | null
}

function combineWorkflowCreateContinuationErrors(errors: unknown[]): unknown | null {
  if (errors.length === 0) return null
  if (errors.length === 1) return errors[0] || null

  return new Error(errors.map((error) => errorToUserMessage(error)).join("; "))
}

async function readWorkflowCreateContinuationResource<T>({
  read,
  fallback,
}: {
  read: () => Promise<T>
  fallback: T
}): Promise<{ value: T; error: unknown | null }> {
  try {
    return {
      value: await read(),
      error: null,
    }
  } catch (error) {
    return {
      value: fallback,
      error,
    }
  }
}

export async function readWorkflowCreateContinuationResources({
  projectPath,
  listProjectArtifacts,
  listProjectCaseStates,
  listHumanTasks,
}: {
  projectPath: string
  listProjectArtifacts: (projectPath: string) => Promise<ArtifactRecord[]>
  listProjectCaseStates: (projectPath: string) => Promise<CaseStateRecord[]>
  listHumanTasks: (projectPath: string) => Promise<HumanTaskSummary[]>
}): Promise<WorkflowCreateContinuationReadResult> {
  const [artifactsResult, caseStatesResult, humanTasksResult] = await Promise.all([
    readWorkflowCreateContinuationResource({
      read: () => listProjectArtifacts(projectPath),
      fallback: [] as ArtifactRecord[],
    }),
    readWorkflowCreateContinuationResource({
      read: () => listProjectCaseStates(projectPath),
      fallback: [] as CaseStateRecord[],
    }),
    readWorkflowCreateContinuationResource({
      read: () => listHumanTasks(projectPath),
      fallback: [] as HumanTaskSummary[],
    }),
  ])

  return {
    resources: {
      artifacts: artifactsResult.value,
      caseStates: caseStatesResult.value,
      humanTasks: humanTasksResult.value,
    },
    error: combineWorkflowCreateContinuationErrors(
      [artifactsResult.error, caseStatesResult.error, humanTasksResult.error]
        .filter((error): error is unknown => error !== null),
    ),
  }
}

export function startWorkflowCreateContinuationResourceLoad({
  projectPath,
  requestIdRef,
  readResources,
  onReset,
  onLoaded,
  onError,
  onLoadingChange,
}: {
  projectPath: string | null
  requestIdRef: { current: number }
  readResources: (projectPath: string) => Promise<WorkflowCreateContinuationReadResult>
  onReset: () => void
  onLoaded: (resources: WorkflowCreateContinuationResources) => void
  onError?: (error: unknown) => void
  onLoadingChange: (loading: boolean) => void
}) {
  const requestId = requestIdRef.current + 1
  requestIdRef.current = requestId

  onReset()

  if (!projectPath) {
    onLoadingChange(false)
    return
  }

  onLoadingChange(true)

  void readResources(projectPath)
    .then(({ resources, error }) => {
      if (requestIdRef.current !== requestId) return
      onLoaded(resources)
      if (error) {
        onError?.(error)
      }
    })
    .finally(() => {
      if (requestIdRef.current === requestId) {
        onLoadingChange(false)
      }
    })
}

export function useWorkflowCreateContinuation({
  projectPath,
  templates,
  templatesLoading,
  hasStartedNewRequest,
  routingInProgress,
  clarificationInProgress,
}: {
  projectPath: string | null
  templates: WorkflowTemplate[]
  templatesLoading: boolean
  hasStartedNewRequest: boolean
  routingInProgress: boolean
  clarificationInProgress: boolean
}) {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [caseStates, setCaseStates] = useState<CaseStateRecord[]>([])
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    startWorkflowCreateContinuationResourceLoad({
      projectPath,
      requestIdRef,
      readResources: (nextProjectPath) => readWorkflowCreateContinuationResources({
        projectPath: nextProjectPath,
        listProjectArtifacts: (path) => window.api.listProjectArtifacts(path),
        listProjectCaseStates: (path) => window.api.listProjectCaseStates(path),
        listHumanTasks: (path) => window.api.listHumanTasks(path),
      }),
      onReset: () => {
        setArtifacts([])
        setCaseStates([])
        setHumanTasks([])
      },
      onLoaded: (resources) => {
        setArtifacts(resources.artifacts)
        setCaseStates(resources.caseStates)
        setHumanTasks(resources.humanTasks)
      },
      onError: (error) => {
        toastErrorFromCatch("Could not load saved-work suggestions", error)
      },
      onLoadingChange: setResourcesLoading,
    })
  }, [projectPath])

  const continuations = useMemo(
    () => deriveWorkflowCreateContinuations({ artifacts, caseStates, humanTasks, templates }),
    [artifacts, caseStates, humanTasks, templates],
  )
  const presentationState = useMemo(
    () => resolveWorkflowCreateContinuationPresentation({
      candidates: continuations,
      hasStartedNewRequest,
      routingInProgress,
      clarificationInProgress,
    }),
    [clarificationInProgress, continuations, hasStartedNewRequest, routingInProgress],
  )

  return {
    loading: Boolean(projectPath) && (resourcesLoading || templatesLoading),
    primaryContinuation: presentationState.primaryContinuation as WorkflowCreateContinuationCandidate | null,
    secondaryContinuations: presentationState.secondaryContinuations,
    presentation: presentationState.presentation,
    reason: presentationState.reason,
  }
}
