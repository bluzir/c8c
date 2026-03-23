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
import type { RunResult, Workflow } from "@shared/types"

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

const ExecutionActionsContext =
  createContext<ExecutionActionsContextValue | null>(null)

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
    (workflowKey: string, nextState: WorkflowExecutionState) => {
      updateWorkflowExecutionState({ key: workflowKey, update: nextState })
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

export function useChainExecution() {
  const actions = useContext(ExecutionActionsContext)
  if (!actions) {
    throw new Error("useChainExecution must be used within ExecutionProvider")
  }

  const [runStatus] = useAtom(runStatusAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const [workspace] = useAtom(workspaceAtom)

  return {
    runStatus,
    nodeStates,
    activeNodeId,
    evalResults,
    workspace,
    ...actions,
  }
}
