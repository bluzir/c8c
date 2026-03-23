import type {
  EdgeType,
  NodeType,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from "./types"

const NODE_TYPES = new Set<NodeType>([
  "input",
  "skill",
  "evaluator",
  "splitter",
  "merger",
  "output",
  "approval",
  "human",
])

const EDGE_TYPES = new Set<EdgeType>(["default", "pass", "fail"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function parseWorkflowNode(
  input: unknown,
  label: string,
  index: number,
): WorkflowNode {
  if (!isRecord(input)) {
    throw new Error(`${label} node ${index + 1} must be an object.`)
  }
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new Error(`${label} node ${index + 1} id must be a non-empty string.`)
  }
  if (!NODE_TYPES.has(input.type as NodeType)) {
    throw new Error(`${label} node "${input.id}" has an unsupported type.`)
  }
  if (
    !isRecord(input.position) ||
    !isFiniteNumber(input.position.x) ||
    !isFiniteNumber(input.position.y)
  ) {
    throw new Error(
      `${label} node "${input.id}" position must include finite x/y numbers.`,
    )
  }
  if (!isRecord(input.config)) {
    throw new Error(`${label} node "${input.id}" config must be an object.`)
  }

  return input as WorkflowNode
}

function parseWorkflowEdge(
  input: unknown,
  label: string,
  index: number,
): WorkflowEdge {
  if (!isRecord(input)) {
    throw new Error(`${label} edge ${index + 1} must be an object.`)
  }
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new Error(`${label} edge ${index + 1} id must be a non-empty string.`)
  }
  if (typeof input.source !== "string" || input.source.trim().length === 0) {
    throw new Error(
      `${label} edge "${input.id}" source must be a non-empty string.`,
    )
  }
  if (typeof input.target !== "string" || input.target.trim().length === 0) {
    throw new Error(
      `${label} edge "${input.id}" target must be a non-empty string.`,
    )
  }
  if (!EDGE_TYPES.has(input.type as EdgeType)) {
    throw new Error(`${label} edge "${input.id}" has an unsupported type.`)
  }

  return input as WorkflowEdge
}

export function parseWorkflowPayload(
  input: unknown,
  label = "Workflow payload",
): Workflow {
  if (!isRecord(input)) {
    throw new Error(`${label} must be an object.`)
  }
  if (!Number.isInteger(input.version) || input.version <= 0) {
    throw new Error(`${label} version must be a positive integer.`)
  }
  if (typeof input.name !== "string") {
    throw new Error(`${label} name must be a string.`)
  }
  if ("id" in input && input.id !== undefined && typeof input.id !== "string") {
    throw new Error(`${label} id must be a string when provided.`)
  }
  if (
    "description" in input &&
    input.description !== undefined &&
    typeof input.description !== "string"
  ) {
    throw new Error(`${label} description must be a string when provided.`)
  }
  if (
    "defaults" in input &&
    input.defaults !== undefined &&
    !isRecord(input.defaults)
  ) {
    throw new Error(`${label} defaults must be an object when provided.`)
  }
  if (!Array.isArray(input.nodes)) {
    throw new Error(`${label} nodes must be an array.`)
  }
  if (!Array.isArray(input.edges)) {
    throw new Error(`${label} edges must be an array.`)
  }

  return {
    ...(typeof input.id === "string" ? { id: input.id } : {}),
    version: input.version,
    name: input.name,
    ...(typeof input.description === "string"
      ? { description: input.description }
      : {}),
    ...(isRecord(input.defaults)
      ? { defaults: input.defaults as Workflow["defaults"] }
      : {}),
    nodes: input.nodes.map((node, index) =>
      parseWorkflowNode(node, label, index),
    ),
    edges: input.edges.map((edge, index) =>
      parseWorkflowEdge(edge, label, index),
    ),
  }
}
