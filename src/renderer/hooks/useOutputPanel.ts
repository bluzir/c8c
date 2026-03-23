import { useAtom } from "jotai"
import { currentWorkflowAtom } from "@/lib/store"
import {
  activeNodeIdAtom,
  artifactPersistenceErrorAtom,
  artifactPersistenceStatusAtom,
  artifactRecordsAtom,
  completedAtAtom,
  evalResultsAtom,
  evalOverrideNodeIdsAtom,
  finalContentAtom,
  inspectedNodeIdAtom,
  nodeStatesAtom,
  reportPathAtom,
  runIdAtom,
  runStartedAtAtom,
  runStatusAtom,
  runOutcomeAtom,
  runtimeMetaAtom,
  surfaceNoticeAtom,
  selectedPastRunAtom,
  workflowNameAtom,
  workflowHistoryRunsAtom,
  workspaceAtom,
} from "@/features/execution"

export function useOutputPanel() {
  const [runStatus] = useAtom(runStatusAtom)
  const [runOutcome] = useAtom(runOutcomeAtom)
  const [runStartedAt] = useAtom(runStartedAtAtom)
  const [completedAt] = useAtom(completedAtAtom)
  const [executionWorkflowName] = useAtom(workflowNameAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [selectedNodeId, setSelectedNodeId] = useAtom(inspectedNodeIdAtom)
  const [finalContent] = useAtom(finalContentAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [reportPath] = useAtom(reportPathAtom)
  const [pastRuns] = useAtom(workflowHistoryRunsAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workspace] = useAtom(workspaceAtom)
  const [artifactRecords] = useAtom(artifactRecordsAtom)
  const [artifactPersistenceStatus] = useAtom(artifactPersistenceStatusAtom)
  const [artifactPersistenceError] = useAtom(artifactPersistenceErrorAtom)
  const [surfaceNotice, setSurfaceNotice] = useAtom(surfaceNoticeAtom)
  const [runId] = useAtom(runIdAtom)
  const [evalOverrideNodeIds] = useAtom(evalOverrideNodeIdsAtom)

  return {
    runId,
    runStatus,
    runOutcome,
    runStartedAt,
    completedAt,
    executionWorkflowName,
    nodeStates,
    activeNodeId,
    selectedNodeId,
    setSelectedNodeId,
    finalContent,
    workflow,
    evalResults,
    runtimeMeta,
    reportPath,
    pastRuns,
    selectedPastRun,
    setSelectedPastRun,
    workspace,
    artifactRecords,
    artifactPersistenceStatus,
    artifactPersistenceError,
    surfaceNotice,
    setSurfaceNotice,
    evalOverrideNodeIds,
  }
}
