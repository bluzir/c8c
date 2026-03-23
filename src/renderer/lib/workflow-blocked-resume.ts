import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { deriveExecutionLoopSummary } from "@/lib/execution-loops"
import {
  deriveExecutionLoopFlowRules,
  type FlowRulePreview,
} from "@/lib/flow-rules"
import type {
  ArtifactRecord,
  EvaluationResult,
  HumanTaskSnapshot,
  NodeState,
  Workflow,
} from "@shared/types"
import {
  deriveBlockedTaskLatestResultText,
  deriveBlockedTaskReasonText,
  deriveBlockedTaskStatusText,
} from "./workflow-blocked-copy"

export interface WorkflowBlockedResumeSummary {
  workLabel: string
  currentStepLabel: string | null
  statusText: string
  reasonText: string
  attachText: string
  latestResultText: string | null
  findings: string[]
  executionLoopSummary: ReturnType<typeof deriveExecutionLoopSummary> | null
  flowRules: FlowRulePreview[]
  primaryArtifact: ArtifactRecord | null
  primaryActionLabel: string
}

function formatArtifactList(artifacts: ArtifactRecord[]) {
  if (artifacts.length === 0) return "saved results"
  if (artifacts.length === 1) return artifacts[0].title
  if (artifacts.length === 2)
    return `${artifacts[0].title} and ${artifacts[1].title}`
  return `${artifacts[0].title}, ${artifacts[1].title}, +${artifacts.length - 2} more`
}

function sortArtifactsByRecency(artifacts: ArtifactRecord[]) {
  return [...artifacts].sort((left, right) => right.updatedAt - left.updatedAt)
}

function deriveCurrentStepLabel(workflow: Workflow, nodeId: string) {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  return getRuntimeStagePresentation(node, { fallbackId: node.id }).title
}

function normalizeFindingLine(value: string) {
  return value
    .replace(/^[\s>*-]+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function collectFindingLines(...values: Array<string | null | undefined>) {
  const seen = new Set<string>()

  return values
    .flatMap((value) => (value || "").split(/\r?\n/))
    .map(normalizeFindingLine)
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function deriveCriteriaFindings(
  criteria: EvaluationResult["criteria"],
  threshold: number,
) {
  return (criteria || [])
    .filter((criterion) => criterion.score < threshold)
    .sort((left, right) => left.score - right.score)
    .map((criterion) => `${criterion.id} (${criterion.score}/${threshold})`)
}

function deriveBlockedFindings({
  task,
  executionLoopSummary,
  reasonText,
}: {
  task: HumanTaskSnapshot
  executionLoopSummary?: ReturnType<typeof deriveExecutionLoopSummary> | null
  reasonText: string
}) {
  if (executionLoopSummary) {
    const criteriaFindings = deriveCriteriaFindings(
      executionLoopSummary.criteriaBreakdown,
      executionLoopSummary.threshold || 0,
    )
    if (criteriaFindings.length > 0) return criteriaFindings.slice(0, 3)

    const loopReasonFindings = collectFindingLines(
      executionLoopSummary.reason,
    ).filter((line) => line !== normalizeFindingLine(reasonText))
    if (loopReasonFindings.length > 0) return loopReasonFindings.slice(0, 3)
  }

  return collectFindingLines(
    task.summary,
    task.instructions,
    task.request.summary,
    task.request.instructions,
  )
    .filter((line) => line !== normalizeFindingLine(reasonText))
    .slice(0, 3)
}

export function deriveWorkflowBlockedResumeSummary({
  workflow,
  task,
  sourceArtifacts,
  nodeStates,
  evalResults,
}: {
  workflow: Workflow
  task: HumanTaskSnapshot
  sourceArtifacts: ArtifactRecord[]
  nodeStates?: Record<string, NodeState>
  evalResults?: Record<string, EvaluationResult[]>
}): WorkflowBlockedResumeSummary {
  const orderedSourceArtifacts = sortArtifactsByRecency(sourceArtifacts)
  const currentStepLabel = deriveCurrentStepLabel(workflow, task.nodeId)
  const primaryArtifact = orderedSourceArtifacts[0] || null
  const workLabel =
    primaryArtifact?.caseLabel ||
    primaryArtifact?.workflowName ||
    task.workflowName ||
    task.title ||
    "Saved work"
  const reasonText = deriveBlockedTaskReasonText(
    {
      ...task,
      summary: task.summary || task.request.summary,
      instructions: task.instructions || task.request.instructions,
    },
    currentStepLabel,
  )
  const executionLoopSummary =
    nodeStates &&
    evalResults &&
    (task.kind === "approval" || task.request.metadata?.generatedByNodeId)
      ? deriveExecutionLoopSummary({
          workflow,
          nodeStates,
          evalResults,
          runOutcome: "blocked",
          preferredEvaluatorNodeId:
            task.request.metadata?.generatedByNodeId || task.nodeId,
        })
      : null

  return {
    workLabel,
    currentStepLabel,
    statusText: deriveBlockedTaskStatusText(task, currentStepLabel),
    reasonText,
    attachText:
      orderedSourceArtifacts.length > 0
        ? formatArtifactList(orderedSourceArtifacts)
        : "Saved work context is already tied to this step.",
    latestResultText: deriveBlockedTaskLatestResultText(primaryArtifact),
    findings: deriveBlockedFindings({
      task,
      executionLoopSummary,
      reasonText,
    }),
    executionLoopSummary,
    flowRules: deriveExecutionLoopFlowRules(executionLoopSummary),
    primaryArtifact,
    primaryActionLabel:
      task.kind === "approval" ? "Open approval" : "Provide input",
  }
}
