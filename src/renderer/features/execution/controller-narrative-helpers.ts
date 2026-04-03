/**
 * Pure helper functions for step-narrative tracking in the controller.
 * Extracted for testability — the controller calls these but they have no
 * dependency on the controller class or React.
 */
import type { Workflow, WorkflowNode, WorkflowRuntimeMeta } from "@shared/types"
import type {
  StepNarrativeContent,
  StepNarrativeBranch,
  FlowChatMessage,
} from "@/lib/flow-chat-types"
import { buildStepNarrativeMessage } from "@/lib/flow-chat-transformer"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"

// ── Types ────────────────────────────────────────────────

export interface StepNarrativeMaps {
  /** nodeId → message ID */
  ids: Map<string, string>
  /** nodeId → current narrative content */
  narratives: Map<string, StepNarrativeContent>
}

export interface NarrativeUpdate {
  messageId: string
  narrative: StepNarrativeContent
}

// ── Node type mapping ────────────────────────────────────

const EXCLUDED_NODE_TYPES = new Set<WorkflowNode["type"]>([
  "input",
  "output",
  "merger",
])

function toNarrativeNodeType(
  nodeType: WorkflowNode["type"],
): StepNarrativeContent["nodeType"] {
  switch (nodeType) {
    case "skill":
      return "skill"
    case "evaluator":
      return "evaluator"
    case "splitter":
      return "splitter"
    case "approval":
      return "approval"
    case "merger":
      return "merger"
    case "human":
      return "human"
    default:
      return "skill"
  }
}

function getNodeLabel(node: WorkflowNode): string {
  return getRuntimeStagePresentation(node, { fallbackId: node.id }).title
}

// ── Seed narratives on first node-start ──────────────────

export interface SeedStepNarrativesInput {
  workflow: Workflow
  workflowKey: string
  flowName: string
  activeNodeId: string
  maps: StepNarrativeMaps
  emitMessage: (message: FlowChatMessage) => void
}

export function seedStepNarratives(input: SeedStepNarrativesInput): void {
  const { workflow, flowName, activeNodeId, maps, emitMessage } = input

  const trackableNodes = workflow.nodes.filter(
    (n) => !EXCLUDED_NODE_TYPES.has(n.type),
  )

  for (const node of trackableNodes) {
    const isActive = node.id === activeNodeId
    const now = Date.now()

    const narrative: StepNarrativeContent = {
      nodeId: node.id,
      label: getNodeLabel(node),
      status: isActive ? "running" : "pending",
      nodeType: toNarrativeNodeType(node.type),
      ...(isActive ? { startedAt: now } : {}),
    }

    const message = buildStepNarrativeMessage({ flowName, data: narrative })
    maps.ids.set(node.id, message.id)
    maps.narratives.set(node.id, narrative)
    emitMessage(message)
  }
}

// ── Update on node-start ─────────────────────────────────

export function updateNarrativeForNodeStart(
  maps: StepNarrativeMaps,
  nodeId: string,
): NarrativeUpdate | null {
  const messageId = maps.ids.get(nodeId)
  const existing = maps.narratives.get(nodeId)
  if (!messageId || !existing) return null

  const updated: StepNarrativeContent = {
    ...existing,
    status: "running",
    startedAt: Date.now(),
  }
  maps.narratives.set(nodeId, updated)

  return { messageId, narrative: updated }
}

// ── Update on node-done ──────────────────────────────────

export interface NodeDoneInfo {
  summary?: string
  output?: string
  costUsd?: number
}

export function updateNarrativeForNodeDone(
  maps: StepNarrativeMaps,
  nodeId: string,
  info: NodeDoneInfo,
): NarrativeUpdate | null {
  const messageId = maps.ids.get(nodeId)
  const existing = maps.narratives.get(nodeId)
  if (!messageId || !existing) return null

  const now = Date.now()
  const durationMs = existing.startedAt ? now - existing.startedAt : undefined
  const durationStr = durationMs != null ? formatDuration(durationMs) : undefined

  const updated: StepNarrativeContent = {
    ...existing,
    status: "done",
    completedAt: now,
    ...(durationStr ? { duration: durationStr } : {}),
    ...(info.summary ? { summary: info.summary } : {}),
    ...(info.output ? { output: info.output } : {}),
    ...(info.costUsd != null && info.costUsd > 0
      ? { costUsd: info.costUsd }
      : {}),
  }
  maps.narratives.set(nodeId, updated)

  return { messageId, narrative: updated }
}

// ── Update on node-error ─────────────────────────────────

export function updateNarrativeForNodeError(
  maps: StepNarrativeMaps,
  nodeId: string,
  error: string,
): NarrativeUpdate | null {
  const messageId = maps.ids.get(nodeId)
  const existing = maps.narratives.get(nodeId)
  if (!messageId || !existing) return null

  const updated: StepNarrativeContent = {
    ...existing,
    status: "failed",
    error,
    completedAt: Date.now(),
  }
  maps.narratives.set(nodeId, updated)

  return { messageId, narrative: updated }
}

// ── Mark pending as skipped on error run-done ────────────

export function markPendingNarrativesSkipped(
  maps: StepNarrativeMaps,
): NarrativeUpdate[] {
  const updates: NarrativeUpdate[] = []

  for (const [nodeId, narrative] of maps.narratives) {
    if (narrative.status === "pending") {
      const messageId = maps.ids.get(nodeId)
      if (!messageId) continue

      const updated: StepNarrativeContent = {
        ...narrative,
        status: "skipped",
      }
      maps.narratives.set(nodeId, updated)
      updates.push({ messageId, narrative: updated })
    }
  }

  return updates
}

// ── Add branches to parent on nodes-expanded ─────────────

export interface AddBranchesInput {
  maps: StepNarrativeMaps
  newNodeIds: string[]
  runtimeMeta: WorkflowRuntimeMeta
  getNodeLabel: (nodeId: string) => string
}

export function addBranchesToParentNarrative(
  input: AddBranchesInput,
): NarrativeUpdate | null {
  const { maps, newNodeIds, runtimeMeta, getNodeLabel } = input

  // Find the parent splitter from runtimeMeta
  let parentSplitterId: string | undefined
  for (const nodeId of newNodeIds) {
    const meta = runtimeMeta[nodeId]
    if (meta?.splitterId) {
      parentSplitterId = meta.splitterId
      break
    }
  }

  if (!parentSplitterId) return null

  const messageId = maps.ids.get(parentSplitterId)
  const existing = maps.narratives.get(parentSplitterId)
  if (!messageId || !existing) return null

  const newBranches: StepNarrativeBranch[] = newNodeIds.map((nodeId) => ({
    nodeId,
    label: getNodeLabel(nodeId),
    status: "pending" as const,
  }))

  const updated: StepNarrativeContent = {
    ...existing,
    branches: [...(existing.branches ?? []), ...newBranches],
  }
  maps.narratives.set(parentSplitterId, updated)

  return { messageId, narrative: updated }
}

// ── Update tool digest on narrative ──────────────────────

export function updateNarrativeToolDigest(
  maps: StepNarrativeMaps,
  nodeId: string,
  updater: (narrative: StepNarrativeContent) => StepNarrativeContent,
): NarrativeUpdate | null {
  const messageId = maps.ids.get(nodeId)
  const existing = maps.narratives.get(nodeId)
  if (!messageId || !existing) return null

  const updated = updater(existing)
  maps.narratives.set(nodeId, updated)

  return { messageId, narrative: updated }
}

// ── Set retry info on evaluator narrative ────────────────

export function setNarrativeRetryInfo(
  maps: StepNarrativeMaps,
  nodeId: string,
  retryInfo: StepNarrativeContent["retryInfo"],
): NarrativeUpdate | null {
  const messageId = maps.ids.get(nodeId)
  const existing = maps.narratives.get(nodeId)
  if (!messageId || !existing) return null

  const updated: StepNarrativeContent = {
    ...existing,
    retryInfo,
  }
  maps.narratives.set(nodeId, updated)

  return { messageId, narrative: updated }
}

// ── Seed narratives from snapshot (rehydration) ──────────

export interface SeedFromSnapshotInput {
  workflow: Workflow
  flowName: string
  nodeStates: Record<string, { status: string }>
  runtimeMeta?: WorkflowRuntimeMeta
  maps: StepNarrativeMaps
  emitMessage: (message: FlowChatMessage) => void
}

export function seedNarrativesFromSnapshot(
  input: SeedFromSnapshotInput,
): void {
  const { workflow, flowName, nodeStates, runtimeMeta, maps, emitMessage } =
    input

  const trackableNodes = workflow.nodes.filter(
    (n) => !EXCLUDED_NODE_TYPES.has(n.type),
  )

  // Identify branch nodes
  const branchNodeIds = new Set<string>()
  if (runtimeMeta) {
    for (const node of trackableNodes) {
      if (runtimeMeta[node.id]?.splitterId) {
        branchNodeIds.add(node.id)
      }
    }
  }

  // Build narratives for non-branch nodes
  for (const node of trackableNodes) {
    if (branchNodeIds.has(node.id)) continue

    const ns = nodeStates[node.id]
    const status = mapNodeStateToNarrativeStatus(ns?.status)

    const narrative: StepNarrativeContent = {
      nodeId: node.id,
      label: getNodeLabel(node),
      status,
      nodeType: toNarrativeNodeType(node.type),
    }

    // Attach branches for splitters
    if (runtimeMeta) {
      const childIds: string[] = []
      for (const branchId of branchNodeIds) {
        if (runtimeMeta[branchId]?.splitterId === node.id) {
          childIds.push(branchId)
        }
      }
      if (childIds.length > 0) {
        narrative.branches = childIds.map((childId) => {
          const childNode = workflow.nodes.find((n) => n.id === childId)
          const childStatus = mapNodeStateToNarrativeStatus(
            nodeStates[childId]?.status,
          )
          return {
            nodeId: childId,
            label: childNode ? getNodeLabel(childNode) : childId,
            status: childStatus,
          }
        })
      }
    }

    const message = buildStepNarrativeMessage({ flowName, data: narrative })
    maps.ids.set(node.id, message.id)
    maps.narratives.set(node.id, narrative)
    emitMessage(message)
  }
}

function mapNodeStateToNarrativeStatus(
  status: string | undefined,
): StepNarrativeContent["status"] {
  switch (status) {
    case "completed":
      return "done"
    case "failed":
      return "failed"
    case "running":
      return "running"
    case "skipped":
      return "skipped"
    default:
      return "pending"
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}
