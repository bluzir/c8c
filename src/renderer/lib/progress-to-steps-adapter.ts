import type { ProgressContent, ProgressStep } from "@/lib/flow-chat-types"
import type {
  WorkflowNode,
  NodeState,
  WorkflowRuntimeMeta,
} from "@shared/types"

export interface AdaptedStepsData {
  nodes: WorkflowNode[]
  nodeStates: Record<string, NodeState>
  runtimeMeta: WorkflowRuntimeMeta
  activeNodeId: string | null
}

function mapStatus(status: ProgressStep["status"]): NodeState["status"] {
  if (status === "done") return "completed"
  if (status === "running") return "running"
  if (status === "failed") return "failed"
  return "pending"
}

function makeSyntheticNode(id: string, label: string): WorkflowNode {
  return {
    id,
    type: "skill",
    position: { x: 0, y: 0 },
    config: {
      skillRef: "",
      prompt: "",
      label,
    },
  } as unknown as WorkflowNode
}

export function adaptProgressToStepsList(
  data: ProgressContent,
): AdaptedStepsData {
  const nodes: WorkflowNode[] = []
  const nodeStates: Record<string, NodeState> = {}
  const runtimeMeta: WorkflowRuntimeMeta = {}
  let activeNodeId: string | null = null

  for (const step of data.steps) {
    // Create the main node
    nodes.push(makeSyntheticNode(step.nodeId, step.label))

    // Create node state
    nodeStates[step.nodeId] = {
      status: mapStatus(step.status),
      attempts: 1,
      log: [],
      output: step.output
        ? { content: step.output, metadata: { source: "chat-adapter" } }
        : undefined,
    }

    // Track first running node
    if (step.status === "running" && !activeNodeId) {
      activeNodeId = step.nodeId
    }

    // Convert subSteps to child nodes with runtimeMeta
    if (step.subSteps && step.subSteps.length > 0) {
      for (let i = 0; i < step.subSteps.length; i++) {
        const sub = step.subSteps[i]
        const childNode = makeSyntheticNode(sub.key, sub.label)
        nodes.push(childNode)

        nodeStates[sub.key] = {
          status: sub.done ? "completed" : "running",
          attempts: 1,
          log: [],
        }

        runtimeMeta[sub.key] = {
          subtaskKey: sub.key,
          branchIndex: i,
          totalBranches: step.subSteps.length,
          splitterId: step.nodeId,
          templateId: step.nodeId,
        }
      }
    }
  }

  return { nodes, nodeStates, runtimeMeta, activeNodeId }
}
