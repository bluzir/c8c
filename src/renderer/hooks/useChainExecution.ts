import {
  createContext,
  createElement,
  useCallback,
  useContext,
  type ReactNode,
} from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  inputAttachmentsAtom,
  requestedResultAtom,
  inputValueAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  webSearchBackendAtom,
  activeExecutionProviderAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  approvalRequestsAtom,
  evalResultsAtom,
  nodeStatesAtom,
  pastRunsAtom,
  runStatusAtom,
  updateWorkflowExecutionStateAtom,
  useExecutionController,
  useExecutionCommands,
  workflowExecutionStatesAtom,
  workspaceAtom,
  type WorkflowExecutionState,
} from "@/features/execution"
import type { PreflightWarning } from "@/features/execution/preflight"
import type {
  EvaluationResult,
  NodeState,
  RunResult,
  Workflow,
} from "@shared/types"

interface ExecutionActionsContextValue {
  run: (executionMode?: "plan" | "edit") => Promise<void>
  cancel: () => Promise<void>
  rerunFrom: (
    fromNodeId: string,
    options?: { workspace?: string | null },
  ) => Promise<void>
  continueRun: (runToContinue: RunResult) => Promise<void>
  continueWithWorkflow: (
    runToContinue: RunResult,
    workflowForRun: Workflow,
    workflowPathForRun: string | null,
  ) => Promise<boolean>
}

export interface ChainExecutionState extends ExecutionActionsContextValue {
  runStatus: string
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  workspace: string | null
  hasExecutionProvider: boolean
}

const ExecutionActionsContext =
  createContext<ExecutionActionsContextValue | null>(null)
let missingExecutionProviderLogged = false

function logMissingExecutionProvider(): void {
  if (missingExecutionProviderLogged) return
  missingExecutionProviderLogged = true
  console.error(
    "useChainExecution rendered without ExecutionProvider; falling back to read-only execution state.",
  )
}

const fallbackExecutionActions: ExecutionActionsContextValue = {
  run: async () => {
    logMissingExecutionProvider()
  },
  cancel: async () => {
    logMissingExecutionProvider()
  },
  rerunFrom: async () => {
    logMissingExecutionProvider()
  },
  continueRun: async () => {
    logMissingExecutionProvider()
  },
  continueWithWorkflow: async () => {
    logMissingExecutionProvider()
    return false
  },
}

interface ExecutionProviderProps {
  children: ReactNode
  onPreflightWarnings?: (warnings: PreflightWarning[]) => Promise<boolean>
}

export function ExecutionProvider({
  children,
  onPreflightWarnings,
}: ExecutionProviderProps) {
  const [runStatus] = useAtom(runStatusAtom)
  const [workspace] = useAtom(workspaceAtom)
  const setPastRuns = useSetAtom(pastRunsAtom)
  const setApprovalRequests = useSetAtom(approvalRequestsAtom)
  const [workflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const [requestedResult] = useAtom(requestedResultAtom)
  const [attachments] = useAtom(inputAttachmentsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const updateWorkflowExecutionState = useSetAtom(
    updateWorkflowExecutionStateAtom,
  )
  const setActiveExecutionProvider = useSetAtom(activeExecutionProviderAtom)

  const commitExecutionState = useCallback(
    (
      workflowKey: string,
      update:
        | WorkflowExecutionState
        | ((prev: WorkflowExecutionState) => WorkflowExecutionState),
    ) => {
      updateWorkflowExecutionState({ key: workflowKey, update })
    },
    [updateWorkflowExecutionState],
  )

  const controller = useExecutionController({
    workflowExecutionStates,
    selectedProject,
    commitExecutionState,
    updateApprovalRequests: setApprovalRequests,
    setPastRuns,
  })

  const { run, cancel, rerunFrom, continueRun, continueWithWorkflow } =
    useExecutionCommands({
      controller,
      attachments,
      inputValue,
      requestedResult,
      runStatus,
      setActiveExecutionProvider,
      selectedProject,
      setSelectedWorkflowPath,
      selectedWorkflowPath,
      setCurrentWorkflow,
      webSearchBackend,
      workflow,
      workspace,
      onPreflightWarnings,
    })

  return createElement(
    ExecutionActionsContext.Provider,
    { value: { run, cancel, rerunFrom, continueRun, continueWithWorkflow } },
    children,
  )
}

export function useChainExecution(): ChainExecutionState {
  const actions = useContext(ExecutionActionsContext)
  const [runStatus] = useAtom(runStatusAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const [workspace] = useAtom(workspaceAtom)
  const resolvedActions = actions || fallbackExecutionActions

  return {
    runStatus,
    nodeStates,
    activeNodeId,
    evalResults,
    workspace,
    hasExecutionProvider: actions !== null,
    ...resolvedActions,
  }
}
