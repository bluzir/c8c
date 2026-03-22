import type {
  NodeState,
  RunStatus,
  Workflow,
  WorkflowNode,
  WorkflowRuntimeMeta,
} from "@shared/types"
import { getRuntimeBranchLabel, getRuntimeNodeLabel, getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"

export type RunStripStatus = "idle" | "starting" | "running" | "paused" | "cancelling" | "done" | "error"
export type RunStripTone = "info" | "success" | "warning" | "danger"

export interface RunProgressSummary {
  totalSteps: number
  completedSteps: number
  runningSteps: number
  waitingApprovalSteps: number
  failedSteps: number
  phaseLabel: string
  tone: RunStripTone
  activeStepLabel: string | null
  activeStepKind: string | null
  branchLabel: string | null
}

function isStepNodeType(nodeType: string) {
  return nodeType !== "input" && nodeType !== "output"
}

type BranchSummary = {
  total: number
  running: number
  completed: number
  failed: number
  waitingApproval: number
}

function buildBranchSummary(
  branchIds: string[],
  nodeStates: Record<string, NodeState>,
): BranchSummary | null {
  if (branchIds.length === 0) return null

  let running = 0
  let completed = 0
  let failed = 0
  let waitingApproval = 0

  for (const branchId of branchIds) {
    const status = nodeStates[branchId]?.status || "pending"
    if (status === "running") running += 1
    else if (status === "waiting_approval" || status === "waiting_human") waitingApproval += 1
    else if (status === "failed") failed += 1
    else if (status === "completed" || status === "skipped") completed += 1
  }

  return {
    total: branchIds.length,
    running,
    completed,
    failed,
    waitingApproval,
  }
}

function deriveAggregateBranchStatus(summary: BranchSummary) {
  if (summary.waitingApproval > 0) return "waiting_human"
  if (summary.failed > 0) return "failed"
  if (summary.running > 0) return "running"
  if (summary.completed === summary.total && summary.total > 0) return "completed"
  if (summary.completed > 0) return "running"
  return "pending"
}

function formatBranchProgress(summary: BranchSummary) {
  if (summary.running > 0) {
    return `${summary.running}/${summary.total} active`
  }
  if (summary.waitingApproval > 0) {
    return `${summary.waitingApproval}/${summary.total} blocked`
  }
  if (summary.completed > 0) {
    return `${summary.completed}/${summary.total} done`
  }
  if (summary.failed > 0) {
    return `${summary.failed}/${summary.total} issues`
  }
  return `${summary.total} branches`
}

function buildBranchNodeLabel(
  nodeId: string,
  workflow: Workflow,
  runtimeMeta: WorkflowRuntimeMeta,
) {
  const meta = runtimeMeta[nodeId]
  if (!meta) return nodeId
  const templateNode = workflow.nodes.find((node) => node.id === meta.templateId)
  const templateLabel = templateNode
    ? getRuntimeNodeLabel(templateNode, { fallbackId: templateNode.id })
    : meta.templateId
  return `${templateLabel} · ${getRuntimeBranchLabel(meta.subtaskKey)}`
}

function resolveNodeLabel(
  nodeId: string,
  workflow: Workflow,
  runtimeNodes: WorkflowNode[],
  runtimeMeta: WorkflowRuntimeMeta,
) {
  if (runtimeMeta[nodeId]) {
    return buildBranchNodeLabel(nodeId, workflow, runtimeMeta)
  }

  const node = runtimeNodes.find((candidate) => candidate.id === nodeId)
    || workflow.nodes.find((candidate) => candidate.id === nodeId)
  return node ? getRuntimeNodeLabel(node, { fallbackId: node.id }) : nodeId
}

function resolveNodeKind(
  nodeId: string,
  workflow: Workflow,
  runtimeNodes: WorkflowNode[],
  runtimeMeta: WorkflowRuntimeMeta,
) {
  const templateNodeId = runtimeMeta[nodeId]?.templateId || nodeId
  const node = workflow.nodes.find((candidate) => candidate.id === templateNodeId)
    || runtimeNodes.find((candidate) => candidate.id === templateNodeId)
    || workflow.nodes.find((candidate) => candidate.id === nodeId)
    || runtimeNodes.find((candidate) => candidate.id === nodeId)
  return node ? getRuntimeStagePresentation(node, { fallbackId: node.id }).kind : null
}

export function formatElapsedTime(startedAt: number | null, now = Date.now()) {
  if (!startedAt) return ""
  const delta = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(delta / 60)
  const seconds = delta % 60
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`
}

export function buildRunProgressSummary({
  workflow,
  runtimeNodes,
  runtimeMeta,
  nodeStates,
  runStatus,
  runOutcome,
  activeNodeId,
}: {
  workflow: Workflow
  runtimeNodes: WorkflowNode[]
  runtimeMeta: WorkflowRuntimeMeta
  nodeStates: Record<string, NodeState>
  runStatus: RunStripStatus
  runOutcome?: RunStatus | null
  activeNodeId: string | null
}): RunProgressSummary {
  const topLevelStepNodes = workflow.nodes.filter((node) => isStepNodeType(node.type))
  const runtimeBranchNodeIds = Object.keys(runtimeMeta)
  const branchIdsByTemplate = new Map<string, string[]>()
  const branchIdsBySplitter = new Map<string, string[]>()

  for (const [branchId, meta] of Object.entries(runtimeMeta)) {
    if (meta.templateId) {
      const byTemplate = branchIdsByTemplate.get(meta.templateId)
      if (byTemplate) byTemplate.push(branchId)
      else branchIdsByTemplate.set(meta.templateId, [branchId])
    }
    if (meta.splitterId) {
      const bySplitter = branchIdsBySplitter.get(meta.splitterId)
      if (bySplitter) bySplitter.push(branchId)
      else branchIdsBySplitter.set(meta.splitterId, [branchId])
    }
  }

  const splitterNodes = topLevelStepNodes.filter((node) => node.type === "splitter")
  if (splitterNodes.length === 1 && runtimeBranchNodeIds.length > 0) {
    const splitterId = splitterNodes[0]?.id
    if (splitterId && !branchIdsBySplitter.has(splitterId)) {
      branchIdsBySplitter.set(splitterId, runtimeBranchNodeIds)
    }
  }

  const getStageBranchSummary = (node: WorkflowNode) => {
    const branchIds = node.type === "splitter"
      ? branchIdsBySplitter.get(node.id) || []
      : branchIdsByTemplate.get(node.id) || []
    return buildBranchSummary(branchIds, nodeStates)
  }

  const getStageStatus = (node: WorkflowNode) => {
    const directStatus = nodeStates[node.id]?.status || "pending"
    const branchSummary = getStageBranchSummary(node)
    if (branchSummary && (directStatus === "pending" || directStatus === "queued")) {
      return deriveAggregateBranchStatus(branchSummary)
    }
    return directStatus
  }

  const totalSteps = topLevelStepNodes.length
  let completedSteps = 0
  let runningSteps = 0
  let waitingApprovalSteps = 0
  let waitingHumanSteps = 0
  let failedSteps = 0

  for (const node of topLevelStepNodes) {
    const status = getStageStatus(node)
    if (status === "completed" || status === "skipped") completedSteps += 1
    if (status === "running") runningSteps += 1
    if (status === "waiting_approval") waitingApprovalSteps += 1
    if (status === "waiting_human") waitingHumanSteps += 1
    if (status === "failed") failedSteps += 1
  }

  const activeStageId = activeNodeId
    ? runtimeMeta[activeNodeId]?.templateId || runtimeMeta[activeNodeId]?.splitterId || activeNodeId
    : null
  const fallbackActiveStageId = activeStageId
    || topLevelStepNodes.find((node) => getStageStatus(node) === "waiting_human")?.id
    || topLevelStepNodes.find((node) => getStageStatus(node) === "waiting_approval")?.id
    || topLevelStepNodes.find((node) => getStageStatus(node) === "failed")?.id
    || topLevelStepNodes.find((node) => getStageStatus(node) === "running")?.id
    || null
  const activeStageNode = fallbackActiveStageId
    ? topLevelStepNodes.find((node) => node.id === fallbackActiveStageId) || null
    : null
  const activeBranchSummary = activeStageNode ? getStageBranchSummary(activeStageNode) : null

  let phaseLabel = "Idle"
  let tone: RunStripTone = "info"

  if (runStatus === "starting") {
    phaseLabel = "Connecting"
  } else if (runStatus === "cancelling") {
    phaseLabel = "Stopping"
    tone = "warning"
  } else if (runStatus === "paused") {
    phaseLabel = "Paused"
    tone = "warning"
  } else if (runStatus === "running") {
    if (waitingHumanSteps > 0) {
      phaseLabel = "Waiting for input"
      tone = "warning"
    } else if (waitingApprovalSteps > 0) {
      phaseLabel = "Waiting for approval"
      tone = "warning"
    } else if (failedSteps > 0) {
      phaseLabel = "Needs attention"
      tone = "danger"
    } else {
      phaseLabel = "Running"
    }
  } else if (runStatus === "done") {
    if (runOutcome === "cancelled" || runOutcome === "interrupted") {
      phaseLabel = "Stopped"
      tone = "warning"
    } else if (runOutcome === "blocked") {
      phaseLabel = "Waiting for input"
      tone = "warning"
    } else {
      phaseLabel = failedSteps > 0 ? "Finished with issues" : "Completed"
      tone = failedSteps > 0 ? "warning" : "success"
    }
  } else if (runStatus === "error") {
    phaseLabel = "Failed"
    tone = "danger"
  }

  let branchLabel: string | null = null
  if (activeBranchSummary) {
    branchLabel = formatBranchProgress(activeBranchSummary)
  }

  return {
    totalSteps,
    completedSteps,
    runningSteps,
    waitingApprovalSteps: waitingApprovalSteps + waitingHumanSteps,
    failedSteps,
    phaseLabel,
    tone,
    activeStepLabel: fallbackActiveStageId
      ? resolveNodeLabel(fallbackActiveStageId, workflow, runtimeNodes, runtimeMeta)
      : null,
    activeStepKind: fallbackActiveStageId
      ? resolveNodeKind(fallbackActiveStageId, workflow, runtimeNodes, runtimeMeta)
      : null,
    branchLabel,
  }
}
