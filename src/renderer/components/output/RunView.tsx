import { Loader2 } from "lucide-react"

import { StepsList } from "./StepsList"
import { FinalResultSection } from "./FinalResultSection"
import type { FinalResultSectionProps } from "./FinalResultSection"
import type {
  Workflow,
  WorkflowNode,
  NodeState,
  EvaluationResult,
  WorkflowRuntimeMeta,
} from "@shared/types"
import type { VerdictData } from "@/components/output/useVerdictData"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"

export interface RunViewProps {
  // Workflow data
  workflow: Workflow
  nodes: WorkflowNode[]

  // Execution state
  runStatus: string
  runOutcome?: string
  nodeStates: Record<string, NodeState>
  evalResults?: Record<string, EvaluationResult[]>
  activeNodeId?: string | null
  runtimeMeta?: WorkflowRuntimeMeta

  // Result data (for FinalResultSection)
  verdictData: VerdictData | null
  resultContent: string | null

  // Continuation
  showArtifactContinuation: boolean
  nextStageLabel?: string | null
  nextStagePending?: boolean
  onRunNextStage?: (() => void) | null
  onUseInNewFlow?: (() => void) | null
  onStartNewRun?: (() => void) | null

  // Artifacts
  artifactPersistenceStatus?: string
  artifactPersistenceError?: string | null

  // Loop
  executionLoopSummary?: ExecutionLoopSummary | null

  // Actions
  onRerunFrom?: (nodeId: string) => void
  onCopyResult?: () => void
  onContextMenu?: (e: React.MouseEvent) => void

  // Review mode
  reviewingRunHistory?: boolean
}

const ACTIVE_STATUSES = new Set([
  "starting",
  "running",
  "done",
  "error",
  "cancelled",
])

function isActiveRun(runStatus: string): boolean {
  return ACTIVE_STATUSES.has(runStatus)
}

export function RunView({
  nodes,
  runStatus,
  runOutcome,
  nodeStates,
  evalResults,
  activeNodeId,
  runtimeMeta,
  verdictData,
  resultContent,
  showArtifactContinuation,
  nextStageLabel,
  nextStagePending,
  onRunNextStage,
  onUseInNewFlow,
  onStartNewRun,
  artifactPersistenceStatus,
  artifactPersistenceError,
  executionLoopSummary,
  onRerunFrom,
  onCopyResult,
  onContextMenu,
  reviewingRunHistory,
}: RunViewProps) {
  // Idle state: render nothing — parent handles the stage contract
  if (!isActiveRun(runStatus) && !reviewingRunHistory) {
    return null
  }

  const showFinalResult = runStatus === "done"

  return (
    <div className="space-y-4">
      {/* Starting spinner */}
      {runStatus === "starting" && (
        <div className="flex items-center gap-2 px-3 py-3 text-body-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          <span>Preparing flow...</span>
        </div>
      )}

      {/* Steps list — always visible during active/review states */}
      <StepsList
        nodes={nodes}
        nodeStates={nodeStates}
        evalResults={evalResults}
        activeNodeId={activeNodeId}
        runtimeMeta={runtimeMeta}
        onRerunFrom={onRerunFrom}
      />

      {/* Final result — only on completion */}
      {showFinalResult && (
        <FinalResultSection
          runStatus={runStatus}
          runOutcome={runOutcome}
          verdictData={verdictData}
          resultContent={resultContent}
          showContinuation={showArtifactContinuation}
          nextStageLabel={nextStageLabel}
          nextStagePending={nextStagePending}
          onRunNextStage={onRunNextStage}
          onUseInNewFlow={onUseInNewFlow}
          onStartNewRun={onStartNewRun}
          artifactPersistenceStatus={artifactPersistenceStatus}
          artifactPersistenceError={artifactPersistenceError}
          executionLoopSummary={executionLoopSummary}
          onCopyResult={onCopyResult}
          onContextMenu={onContextMenu}
        />
      )}
    </div>
  )
}
