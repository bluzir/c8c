import type {
  ApprovalNodeConfig,
  DiscoveredSkill,
  EdgeType,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  MergerNodeConfig,
  SkillNodeConfig,
  SplitterNodeConfig,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from "@shared/types"
import {
  inferProviderFromModel,
  modelLooksCompatible,
} from "@shared/provider-metadata"
import { findInsertionPoint } from "@/lib/workflow-graph-utils"
import {
  DEFAULT_APPROVAL_CONFIG,
  DEFAULT_EVALUATOR_CONFIG,
  DEFAULT_FANOUT_PATTERN,
  DEFAULT_HUMAN_CONFIG,
} from "@/lib/default-workflow-configs"

function toIdFragment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "node"
}

function createNodeIdGenerator(workflow: Workflow): (baseId: string) => string {
  const usedIds = new Set(workflow.nodes.map((node) => node.id))
  return (baseId: string) => {
    let candidate = baseId
    let index = 1
    while (usedIds.has(candidate)) {
      candidate = `${baseId}-${index}`
      index += 1
    }
    usedIds.add(candidate)
    return candidate
  }
}

function createUniqueEdgeId(
  edges: WorkflowEdge[],
  source: string,
  target: string,
  type: EdgeType,
): string {
  const prefix = type === "fail" ? "fail" : "e"
  const base = `${prefix}-${source}-${target}`
  const existing = new Set(edges.map((edge) => edge.id))
  let candidate = base
  let index = 1
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

export function wouldCreateCycle(
  workflow: Workflow,
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  const adjacency = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    if (edge.type === "fail") continue
    const list = adjacency.get(edge.source) || []
    list.push(edge.target)
    adjacency.set(edge.source, list)
  }

  const stack = [targetNodeId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === sourceNodeId) return true
    if (visited.has(current)) continue
    visited.add(current)
    const neighbors = adjacency.get(current) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor)
      }
    }
  }

  return false
}

function addLinearNodeBeforeOutput(
  workflow: Workflow,
  node: WorkflowNode,
): Workflow {
  const pt = findInsertionPoint(workflow)
  if (!pt) return workflow

  const { outputNode, prevNodeId, filteredEdges } = pt
  const edgeFromPrevToNodeId = createUniqueEdgeId(
    filteredEdges,
    prevNodeId,
    node.id,
    "default",
  )
  const edgeFromNodeToOutputId = createUniqueEdgeId(
    [
      ...filteredEdges,
      {
        id: edgeFromPrevToNodeId,
        source: prevNodeId,
        target: node.id,
        type: "default",
      },
    ],
    node.id,
    outputNode.id,
    "default",
  )
  const newEdges: WorkflowEdge[] = [
    ...filteredEdges,
    {
      id: edgeFromPrevToNodeId,
      source: prevNodeId,
      target: node.id,
      type: "default",
    },
    {
      id: edgeFromNodeToOutputId,
      source: node.id,
      target: outputNode.id,
      type: "default",
    },
  ]

  return {
    ...workflow,
    nodes: [...workflow.nodes, node],
    edges: newEdges,
  }
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = [
      ...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ]
    return normalized.length > 0 ? normalized : undefined
  }

  if (typeof value === "string") {
    const normalized = [
      ...new Set(
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ]
    return normalized.length > 0 ? normalized : undefined
  }

  return undefined
}

export function addSkillNodeToWorkflow(
  workflow: Workflow,
  skill: DiscoveredSkill,
  _now = Date.now(),
): Workflow {
  const nextNodeId = createNodeIdGenerator(workflow)
  const newNodeId = nextNodeId(`skill-${toIdFragment(skill.name || "skill")}`)
  const maxTurns = normalizePositiveInteger(skill.maxTurns)
  const allowedTools = normalizeStringArray(skill.allowedTools)
  const disallowedTools = normalizeStringArray(skill.disallowedTools)
  const newNode: WorkflowNode = {
    id: newNodeId,
    type: "skill",
    position: { x: 0, y: 0 },
    config: {
      skillRef: `${skill.category}/${skill.name}`.replace(/^\//, ""),
      prompt: skill.description || `Run ${skill.name}`,
      ...(maxTurns ? { maxTurns } : {}),
      skillPaths: [skill.path],
      ...(allowedTools ? { allowedTools } : {}),
      ...(disallowedTools ? { disallowedTools } : {}),
    } satisfies SkillNodeConfig,
  }

  const nextWorkflow = addLinearNodeBeforeOutput(workflow, newNode)
  const suggestedModel = skill.model?.trim()
  if (!suggestedModel || nextWorkflow.defaults?.model) {
    return nextWorkflow
  }

  const inferredProvider = inferProviderFromModel(suggestedModel)
  const workflowProvider = nextWorkflow.defaults?.provider
  const nextProvider = workflowProvider || inferredProvider
  if (nextProvider && !modelLooksCompatible(nextProvider, suggestedModel)) {
    return nextWorkflow
  }

  return {
    ...nextWorkflow,
    defaults: {
      ...(nextWorkflow.defaults || {}),
      ...(workflowProvider
        ? {}
        : inferredProvider
          ? { provider: inferredProvider }
          : {}),
      model: suggestedModel,
    },
  }
}

export function addEvaluatorNodeToWorkflow(
  workflow: Workflow,
  _now = Date.now(),
): Workflow {
  const pt = findInsertionPoint(workflow)
  if (!pt) return workflow

  const { outputNode, prevNodeId, filteredEdges } = pt
  const nextNodeId = createNodeIdGenerator(workflow)
  const evalNodeId = nextNodeId("eval")
  const newNode: WorkflowNode = {
    id: evalNodeId,
    type: "evaluator",
    position: { x: 0, y: 0 },
    config: {
      ...DEFAULT_EVALUATOR_CONFIG,
      retryFrom: prevNodeId,
    } satisfies EvaluatorNodeConfig,
  }

  const newEdges: WorkflowEdge[] = [
    ...filteredEdges,
    {
      id: createUniqueEdgeId(filteredEdges, prevNodeId, evalNodeId, "default"),
      source: prevNodeId,
      target: evalNodeId,
      type: "default",
    },
    {
      id: createUniqueEdgeId(filteredEdges, evalNodeId, outputNode.id, "pass"),
      source: evalNodeId,
      target: outputNode.id,
      type: "pass",
    },
    {
      id: createUniqueEdgeId(filteredEdges, evalNodeId, prevNodeId, "fail"),
      source: evalNodeId,
      target: prevNodeId,
      type: "fail",
    },
  ]

  return {
    ...workflow,
    nodes: [...workflow.nodes, newNode],
    edges: newEdges,
  }
}

export function addFanOutPatternToWorkflow(
  workflow: Workflow,
  _now = Date.now(),
): Workflow {
  const pt = findInsertionPoint(workflow)
  if (!pt) return workflow

  const { outputNode, prevNodeId, filteredEdges } = pt
  const nextNodeId = createNodeIdGenerator(workflow)
  const splitterId = nextNodeId("splitter")
  const skillId = nextNodeId("skill-fanout")
  const mergerId = nextNodeId("merger")

  const newNodes: WorkflowNode[] = [
    {
      id: splitterId,
      type: "splitter",
      position: { x: 0, y: 0 },
      config: {
        ...DEFAULT_FANOUT_PATTERN.splitter,
      } satisfies SplitterNodeConfig,
    },
    {
      id: skillId,
      type: "skill",
      position: { x: 0, y: 0 },
      config: { ...DEFAULT_FANOUT_PATTERN.worker } satisfies Pick<
        SkillNodeConfig,
        "skillRef" | "prompt"
      >,
    },
    {
      id: mergerId,
      type: "merger",
      position: { x: 0, y: 0 },
      config: { ...DEFAULT_FANOUT_PATTERN.merger } satisfies MergerNodeConfig,
    },
  ]

  const newEdges: WorkflowEdge[] = [
    ...filteredEdges,
    {
      id: createUniqueEdgeId(filteredEdges, prevNodeId, splitterId, "default"),
      source: prevNodeId,
      target: splitterId,
      type: "default",
    },
    {
      id: createUniqueEdgeId(filteredEdges, splitterId, skillId, "default"),
      source: splitterId,
      target: skillId,
      type: "default",
    },
    {
      id: createUniqueEdgeId(filteredEdges, skillId, mergerId, "default"),
      source: skillId,
      target: mergerId,
      type: "default",
    },
    {
      id: createUniqueEdgeId(filteredEdges, mergerId, outputNode.id, "default"),
      source: mergerId,
      target: outputNode.id,
      type: "default",
    },
  ]

  return {
    ...workflow,
    nodes: [...workflow.nodes, ...newNodes],
    edges: newEdges,
  }
}

export function addApprovalNodeToWorkflow(
  workflow: Workflow,
  _now = Date.now(),
): Workflow {
  const nextNodeId = createNodeIdGenerator(workflow)
  const approvalId = nextNodeId("approval")
  const approvalNode: WorkflowNode = {
    id: approvalId,
    type: "approval",
    position: { x: 0, y: 0 },
    config: { ...DEFAULT_APPROVAL_CONFIG } satisfies ApprovalNodeConfig,
  }

  return addLinearNodeBeforeOutput(workflow, approvalNode)
}

export function addHumanNodeToWorkflow(
  workflow: Workflow,
  _now = Date.now(),
): Workflow {
  const nextNodeId = createNodeIdGenerator(workflow)
  const humanId = nextNodeId("human")
  const humanNode: WorkflowNode = {
    id: humanId,
    type: "human",
    position: { x: 0, y: 0 },
    config: structuredClone(DEFAULT_HUMAN_CONFIG) satisfies HumanNodeConfig,
  }

  return addLinearNodeBeforeOutput(workflow, humanNode)
}

export function removeNodeAndRewireWorkflow(
  workflow: Workflow,
  nodeId: string,
): Workflow {
  const node = workflow.nodes.find((n) => n.id === nodeId)
  if (!node || node.type === "input" || node.type === "output") return workflow

  const incomingEdges = workflow.edges.filter((e) => e.target === nodeId)
  const outgoingEdges = workflow.edges.filter((e) => e.source === nodeId)
  const newEdges = workflow.edges.filter(
    (e) => e.source !== nodeId && e.target !== nodeId,
  )
  const existingEdgeKeys = new Set(
    newEdges.map((edge) => `${edge.source}=>${edge.target}:${edge.type}`),
  )

  for (const incoming of incomingEdges) {
    for (const outgoing of outgoingEdges) {
      if (incoming.source === outgoing.target) {
        continue
      }
      const bridgeType: EdgeType =
        outgoing.type === "default" ? incoming.type : outgoing.type
      const edgeKey = `${incoming.source}=>${outgoing.target}:${bridgeType}`
      if (existingEdgeKeys.has(edgeKey)) {
        continue
      }

      newEdges.push({
        id: createUniqueEdgeId(
          newEdges,
          incoming.source,
          outgoing.target,
          bridgeType,
        ),
        source: incoming.source,
        target: outgoing.target,
        type: bridgeType,
      })
      existingEdgeKeys.add(edgeKey)
    }
  }

  const nextNodes = workflow.nodes
    .filter((n) => n.id !== nodeId)
    .map((node) => {
      if (node.type !== "evaluator") return node
      const config = node.config as EvaluatorNodeConfig
      if (config.retryFrom !== nodeId) return node
      return {
        ...node,
        config: {
          ...config,
          retryFrom: undefined,
        } satisfies EvaluatorNodeConfig,
      }
    })

  return {
    ...workflow,
    nodes: nextNodes,
    edges: newEdges,
  }
}

export interface AddEdgeResult {
  workflow: Workflow
  error?: string
}

export function addEdgeToWorkflow(
  workflow: Workflow,
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: EdgeType = "default",
): AddEdgeResult {
  if (sourceNodeId === targetNodeId)
    return { workflow, error: "Cannot connect a node to itself." }

  const sourceNode = workflow.nodes.find((node) => node.id === sourceNodeId)
  const targetNode = workflow.nodes.find((node) => node.id === targetNodeId)
  if (!sourceNode || !targetNode)
    return { workflow, error: "Source or target node not found." }

  // Keep graph semantics sane for common mistakes.
  if (sourceNode.type === "output")
    return { workflow, error: "Cannot connect from an output node." }
  if (targetNode.type === "input")
    return { workflow, error: "Cannot connect to an input node." }
  if (
    edgeType !== "fail" &&
    wouldCreateCycle(workflow, sourceNodeId, targetNodeId)
  )
    return { workflow, error: "Cannot connect: would create a cycle." }

  const duplicate = workflow.edges.some(
    (edge) =>
      edge.source === sourceNodeId &&
      edge.target === targetNodeId &&
      edge.type === edgeType,
  )
  if (duplicate) return { workflow, error: "Cannot connect: duplicate edge." }

  return {
    workflow: {
      ...workflow,
      edges: [
        ...workflow.edges,
        {
          id: createUniqueEdgeId(
            workflow.edges,
            sourceNodeId,
            targetNodeId,
            edgeType,
          ),
          source: sourceNodeId,
          target: targetNodeId,
          type: edgeType,
        },
      ],
    },
  }
}

export function removeEdgeFromWorkflow(
  workflow: Workflow,
  edgeId: string,
): Workflow {
  const edgeExists = workflow.edges.some((edge) => edge.id === edgeId)
  if (!edgeExists) return workflow
  return {
    ...workflow,
    edges: workflow.edges.filter((edge) => edge.id !== edgeId),
  }
}

export interface InsertSkillNodeAfterResult {
  workflow: Workflow
  nodeId: string
}

/**
 * Insert a new skill node immediately after `afterNodeId`, re-wiring all
 * outgoing edges from that node to pass through the new node first.
 */
export function insertSkillNodeAfter(
  workflow: Workflow,
  afterNodeId: string,
  config: SkillNodeConfig,
  _now = Date.now(),
): InsertSkillNodeAfterResult {
  const afterNode = workflow.nodes.find((n) => n.id === afterNodeId)
  if (!afterNode) return { workflow, nodeId: "" }

  const nextNodeId = createNodeIdGenerator(workflow)
  const newNodeId = nextNodeId("skill")
  const newNode: WorkflowNode = {
    id: newNodeId,
    type: "skill",
    position: { x: 0, y: 0 },
    config,
  }

  // Edges that leave afterNodeId become edges that leave the new node instead.
  const outgoingEdges = workflow.edges.filter((e) => e.source === afterNodeId)
  const retainedEdges = workflow.edges.filter((e) => e.source !== afterNodeId)

  const bridgeEdge: WorkflowEdge = {
    id: createUniqueEdgeId(retainedEdges, afterNodeId, newNodeId, "default"),
    source: afterNodeId,
    target: newNodeId,
    type: "default",
  }

  const forwardedEdges: WorkflowEdge[] = []
  const forwardingBaseEdges = [...retainedEdges, bridgeEdge]
  for (const edge of outgoingEdges) {
    const nextEdge: WorkflowEdge = {
      ...edge,
      id: createUniqueEdgeId(
        [...forwardingBaseEdges, ...forwardedEdges],
        newNodeId,
        edge.target,
        edge.type,
      ),
      source: newNodeId,
    }
    forwardedEdges.push(nextEdge)
  }

  return {
    workflow: {
      ...workflow,
      nodes: [...workflow.nodes, newNode],
      edges: [...retainedEdges, bridgeEdge, ...forwardedEdges],
    },
    nodeId: newNodeId,
  }
}

function rebuildLinearWorkflowWithMiddleNodes(
  workflow: Workflow,
  middleNodes: WorkflowNode[],
): Workflow {
  const inputNodes = workflow.nodes.filter((n) => n.type === "input")
  const outputNodes = workflow.nodes.filter((n) => n.type === "output")
  const newNodes = [...inputNodes, ...middleNodes, ...outputNodes]
  const newEdges: WorkflowEdge[] = []

  for (let i = 0; i < newNodes.length - 1; i++) {
    const source = newNodes[i]
    const target = newNodes[i + 1]
    newEdges.push({
      id: createUniqueEdgeId(
        newEdges,
        source.id,
        target.id,
        source.type === "evaluator" ? "pass" : "default",
      ),
      source: source.id,
      target: target.id,
      type: source.type === "evaluator" ? "pass" : "default",
    })
  }

  for (const node of middleNodes) {
    if (node.type !== "evaluator") continue
    const cfg = node.config as EvaluatorNodeConfig
    if (!cfg.retryFrom) continue
    newEdges.push({
      id: createUniqueEdgeId(newEdges, node.id, cfg.retryFrom, "fail"),
      source: node.id,
      target: cfg.retryFrom,
      type: "fail",
    })
  }

  return {
    ...workflow,
    nodes: newNodes,
    edges: newEdges,
  }
}

export function isLinearChainReorderSafe(workflow: Workflow): boolean {
  return getLinearChainReorderBlockReason(workflow) === null
}

export function getLinearChainReorderBlockReason(
  workflow: Workflow,
): string | null {
  const inputNodes = workflow.nodes.filter((node) => node.type === "input")
  const outputNodes = workflow.nodes.filter((node) => node.type === "output")
  if (inputNodes.length !== 1 || outputNodes.length !== 1) {
    return "Reordering is only available for linear flows."
  }

  // Reorder in list mode must not flatten fan-out/fan-in topology.
  if (
    workflow.nodes.some(
      (node) => node.type === "splitter" || node.type === "merger",
    )
  ) {
    return "Reordering is unavailable once the flow branches. Use Canvas to restructure branching flows."
  }

  const nodeIds = new Set(workflow.nodes.map((node) => node.id))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  let nonFailEdges = 0

  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return "Reordering is only available for linear flows."
    }
    if (edge.type === "fail") {
      if (edge.source === edge.target) {
        return "Reordering is only available for linear flows."
      }
      continue
    }

    nonFailEdges += 1
    const outgoingCount = (outgoing.get(edge.source) || 0) + 1
    const incomingCount = (incoming.get(edge.target) || 0) + 1
    outgoing.set(edge.source, outgoingCount)
    incoming.set(edge.target, incomingCount)
    if (outgoingCount > 1 || incomingCount > 1) {
      return "Reordering is only available for linear flows."
    }
  }

  if (nonFailEdges !== workflow.nodes.length - 1) {
    return "Reordering is only available for linear flows."
  }

  const inputId = inputNodes[0].id
  const outputId = outputNodes[0].id
  if ((incoming.get(inputId) || 0) !== 0) {
    return "Reordering is only available for linear flows."
  }
  if ((outgoing.get(outputId) || 0) !== 0) {
    return "Reordering is only available for linear flows."
  }

  for (const node of workflow.nodes) {
    if (node.id === inputId || node.id === outputId) continue
    if ((incoming.get(node.id) || 0) !== 1) {
      return "Reordering is only available for linear flows."
    }
    if ((outgoing.get(node.id) || 0) !== 1) {
      return "Reordering is only available for linear flows."
    }
  }

  return null
}

export function getMiddleNodeMoveBlockedReason(
  workflow: Workflow,
  nodeId: string,
  direction: "up" | "down",
): string | null {
  const reorderBlockReason = getLinearChainReorderBlockReason(workflow)
  if (reorderBlockReason) return reorderBlockReason

  const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
  if (!node || node.type === "input" || node.type === "output") {
    return "Only editable steps can be reordered."
  }

  const middleNodes = workflow.nodes.filter(
    (candidate) => candidate.type !== "input" && candidate.type !== "output",
  )
  const sourceIndex = middleNodes.findIndex(
    (candidate) => candidate.id === nodeId,
  )
  if (sourceIndex < 0) {
    return "Only editable steps can be reordered."
  }

  const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1
  if (targetIndex < 0) {
    return "This step is already the first editable step."
  }
  if (targetIndex >= middleNodes.length) {
    return "This step is already the last editable step."
  }

  return null
}

export function moveMiddleNodeByDirection(
  workflow: Workflow,
  nodeId: string,
  direction: "up" | "down",
): Workflow {
  if (!isLinearChainReorderSafe(workflow)) return workflow
  const middleNodes = workflow.nodes.filter(
    (n) => n.type !== "input" && n.type !== "output",
  )
  const sourceIndex = middleNodes.findIndex((n) => n.id === nodeId)
  if (sourceIndex < 0) return workflow

  const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1
  if (targetIndex < 0 || targetIndex >= middleNodes.length) return workflow

  const next = [...middleNodes]
  ;[next[sourceIndex], next[targetIndex]] = [
    next[targetIndex],
    next[sourceIndex],
  ]

  return rebuildLinearWorkflowWithMiddleNodes(workflow, next)
}

export function moveMiddleNodeBeforeTarget(
  workflow: Workflow,
  sourceNodeId: string,
  targetNodeId: string,
): Workflow {
  if (!isLinearChainReorderSafe(workflow)) return workflow
  if (sourceNodeId === targetNodeId) return workflow
  const middleNodes = workflow.nodes.filter(
    (n) => n.type !== "input" && n.type !== "output",
  )
  const sourceIndex = middleNodes.findIndex((n) => n.id === sourceNodeId)
  const targetIndex = middleNodes.findIndex((n) => n.id === targetNodeId)
  if (sourceIndex < 0 || targetIndex < 0) return workflow

  const next = [...middleNodes]
  const [sourceNode] = next.splice(sourceIndex, 1)
  const insertionIndex =
    sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  next.splice(insertionIndex, 0, sourceNode)

  return rebuildLinearWorkflowWithMiddleNodes(workflow, next)
}
