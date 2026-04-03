import type {
  FlowChatMessage,
  FlowFollowUp,
  ProgressStep,
} from "./flow-chat-types"
import {
  buildStartMessage,
  buildProgressMessage,
  buildCompleteMessage,
  buildErrorMessage,
} from "./flow-chat-transformer"
import { getRuntimeStagePresentation } from "./runtime-flow-labels"
import {
  buildToolDigestFromLog,
  buildToolActionsFromLog,
  extractSearchQuery,
} from "./tool-digest"
import type {
  WorkflowNode,
  NodeState,
  WorkflowRuntimeMeta,
  PersistedRunSnapshot,
  RunResult,
} from "@shared/types"

// ── Step-building from snapshot data ──────────────────────────────

export interface BuildProgressStepsInput {
  nodes: WorkflowNode[]
  nodeStates: Record<string, NodeState>
  runtimeMeta?: WorkflowRuntimeMeta
  /** For live runs — marks this node as "running" regardless of nodeStates */
  activeNodeId?: string
}

export interface BuildProgressStepsResult {
  steps: ProgressStep[]
  description: string
}

export function buildProgressStepsFromSnapshot(
  input: BuildProgressStepsInput,
): BuildProgressStepsResult {
  const { nodes, nodeStates, runtimeMeta, activeNodeId } = input

  const trackableNodes = nodes.filter(
    (n) => n.type !== "input" && n.type !== "output" && n.type !== "merger",
  )

  if (trackableNodes.length === 0) {
    return { steps: [], description: "" }
  }

  const getNodeLabel = (nodeId: string): string => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return nodeId
    return getRuntimeStagePresentation(node, { fallbackId: nodeId }).title
  }

  const toStepStatus = (nodeId: string): ProgressStep["status"] => {
    if (activeNodeId && nodeId === activeNodeId) return "running"
    const ns = nodeStates[nodeId]?.status
    if (ns === "completed") return "done"
    if (ns === "failed") return "failed"
    if (ns === "running") return "running"
    return "pending"
  }

  // Identify splitter branches via runtimeMeta
  const branchNodeIds = new Set<string>()
  const splitterChildren = new Map<string, string[]>()
  for (const node of trackableNodes) {
    const meta = runtimeMeta?.[node.id]
    if (meta?.splitterId) {
      branchNodeIds.add(node.id)
      const children = splitterChildren.get(meta.splitterId) ?? []
      children.push(node.id)
      splitterChildren.set(meta.splitterId, children)
    }
  }

  const steps: ProgressStep[] = trackableNodes
    .filter((node) => !branchNodeIds.has(node.id))
    .map((node) => {
      const children = splitterChildren.get(node.id)
      const ns = nodeStates[node.id]
      const toolDigest = buildToolDigestFromLog(ns?.log)
      const toolActions = buildToolActionsFromLog(ns?.log)

      // Extract search queries from log
      let searchQueries: string[] | undefined
      if (ns?.log) {
        for (const entry of ns.log) {
          if (entry.type === "tool_use") {
            const q = extractSearchQuery(entry.tool, entry.input)
            if (q) {
              if (!searchQueries) searchQueries = []
              if (searchQueries.length < 5) searchQueries.push(q)
            }
          }
        }
      }

      return {
        nodeId: node.id,
        label: getNodeLabel(node.id),
        status: toStepStatus(node.id),
        ...(toolDigest ? { toolDigest } : {}),
        ...(toolActions ? { toolActions } : {}),
        ...(searchQueries ? { searchQueries } : {}),
        ...(children && children.length > 0
          ? {
              subSteps: children.map((childId) => ({
                key: childId,
                label: getNodeLabel(childId),
                done: nodeStates[childId]?.status === "completed",
                status: toStepStatus(childId),
              })),
            }
          : {}),
      }
    })

  // Build description from node labels
  const mainSteps = trackableNodes.filter((n) => !branchNodeIds.has(n.id))
  const stepLabels = mainSteps
    .map((n) => getNodeLabel(n.id).toLowerCase())
    .slice(0, 4)
  const description =
    mainSteps.length <= 4
      ? `I'll ${stepLabels.join(", then ")}.`
      : `I'll ${stepLabels.slice(0, 3).join(", ")}, and ${mainSteps.length - 3} more steps.`

  return { steps, description }
}

// ── Full timeline synthesis from persisted run data ───────────────

export interface SynthesizeTimelineInput {
  snapshot: PersistedRunSnapshot
  runResult: RunResult
  flowName: string
  followUps?: FlowFollowUp[]
  /** Full report text from LoadedRunResult.reportContent — used for hero preview */
  reportContent?: string
}

export function synthesizeTimelineFromRun(
  input: SynthesizeTimelineInput,
): FlowChatMessage[] {
  const { snapshot, runResult, flowName, followUps, reportContent } = input
  const messages: FlowChatMessage[] = []

  const nodes = snapshot.runtimeNodes ?? []
  const { steps, description } = buildProgressStepsFromSnapshot({
    nodes,
    nodeStates: snapshot.nodeStates,
    runtimeMeta: snapshot.runtimeMeta,
  })

  // Compute step count from completed/failed nodes
  const stepCount =
    steps.length > 0
      ? steps.filter((s) => s.status === "done" || s.status === "failed").length
      : undefined

  // Hero artifact preview: first 2KB of report content
  const MAX_HERO_SLICE = 2048
  const heroArtifactContent =
    reportContent && runResult.reportPath?.endsWith(".md")
      ? reportContent.slice(0, MAX_HERO_SLICE)
      : undefined

  // No trackable steps → just emit the terminal message
  if (steps.length === 0 && description === "") {
    return [
      buildTerminalMessage(runResult, flowName, followUps, {
        stepCount,
        heroArtifactContent,
      }),
    ]
  }

  // Start message
  const startTs = runResult.startedAt
  const startMsg = buildStartMessage({ flowName, description })
  startMsg.timestamp = startTs
  messages.push(startMsg)

  // Progress message — collapsed with final elapsed time
  // Only emit progress blob when snapshot was saved in progress format
  // (step-narrative format uses individual step messages instead)
  if (snapshot.chatMessageFormat !== "step-narrative") {
    const durationMs =
      runResult.durationMs ?? runResult.completedAt - runResult.startedAt
    const elapsed = formatDurationCompact(durationMs)
    const doneCount = steps.filter((s) => s.status === "done").length
    const totalCount = steps.length

    const collapsedLabel =
      doneCount === totalCount
        ? `All ${doneCount} steps completed \u00b7 ${elapsed}`
        : `${doneCount}/${totalCount} steps completed \u00b7 ${elapsed}`

    const progressMsg = buildProgressMessage({
      flowName,
      steps,
      startedAt: runResult.startedAt,
    })
    progressMsg.timestamp = startTs + 1
    // Override to collapsed state
    progressMsg.content = {
      type: "progress",
      data: {
        steps,
        startedAt: runResult.startedAt,
        collapsed: true,
        collapsedLabel,
        elapsed,
      },
    }
    messages.push(progressMsg)
  }

  // Terminal message (complete or error)
  // TODO: load rating from run-result.json into runRatingsAtom
  const terminalMsg = buildTerminalMessage(runResult, flowName, followUps, {
    stepCount,
    heroArtifactContent,
  })
  terminalMsg.timestamp = runResult.completedAt
  messages.push(terminalMsg)

  return messages
}

function buildTerminalMessage(
  runResult: RunResult,
  flowName: string,
  followUps?: FlowFollowUp[],
  extras?: { stepCount?: number; heroArtifactContent?: string },
): FlowChatMessage {
  if (runResult.status === "completed") {
    return buildCompleteMessage({
      runId: runResult.runId,
      flowName,
      summary: "Flow completed.",
      findings: [],
      limitations: [],
      artifacts: runResult.reportPath
        ? [{ name: "report.md", path: runResult.reportPath, kind: "report" }]
        : [],
      followUps: followUps ?? [],
      durationMs:
        runResult.durationMs ?? runResult.completedAt - runResult.startedAt,
      costUsd: runResult.totalCost ?? 0,
      stepCount: extras?.stepCount,
      heroArtifactContent: extras?.heroArtifactContent,
    })
  }

  const variant: "error" | "cancelled" =
    runResult.status === "cancelled" ? "cancelled" : "error"

  return buildErrorMessage({
    runId: runResult.runId,
    flowName,
    variant,
    failedNodeId: runResult.failedNodeId || undefined,
    failedNodeLabel: runResult.failedNodeId || undefined,
  })
}

function formatDurationCompact(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
