import type { Workflow } from "./types"
import { validateWorkflowNodeConfigs, type WorkflowConfigIssue } from "./workflow-config-validation"

function pushIssue(
  issues: WorkflowConfigIssue[],
  nodeId: string,
  field: string,
  message: string,
  severity: WorkflowConfigIssue["severity"] = "error",
) {
  issues.push({ nodeId, field, message, severity })
}

export function validateWorkflowForExecution(workflow: Workflow): WorkflowConfigIssue[] {
  const issues: WorkflowConfigIssue[] = [
    ...validateWorkflowNodeConfigs(workflow),
  ]

  if (!workflow.nodes.some((node) => node.type === "input")) {
    pushIssue(issues, "__workflow__", "nodes.input", "Workflow must have at least one input node.")
  }

  if (!workflow.nodes.some((node) => node.type === "output")) {
    pushIssue(issues, "__workflow__", "nodes.output", "Workflow must have at least one output node.")
  }

  const nodeIds = new Set(workflow.nodes.map((node) => node.id))

  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source)) {
      pushIssue(
        issues,
        "__workflow__",
        `edges.${edge.id}.source`,
        `Edge "${edge.id}" references nonexistent source node "${edge.source}".`,
      )
    }
    if (!nodeIds.has(edge.target)) {
      pushIssue(
        issues,
        "__workflow__",
        `edges.${edge.id}.target`,
        `Edge "${edge.id}" references nonexistent target node "${edge.target}".`,
      )
    }
  }

  const seenNodeIds = new Set<string>()
  for (const node of workflow.nodes) {
    if (seenNodeIds.has(node.id)) {
      pushIssue(issues, node.id, "id", `Duplicate node ID "${node.id}".`)
    }
    seenNodeIds.add(node.id)

    if (node.type === "evaluator") {
      const retryFrom = node.config.retryFrom?.trim()
      if (retryFrom && !nodeIds.has(retryFrom)) {
        pushIssue(
          issues,
          node.id,
          "config.retryFrom",
          `Retry target "${retryFrom}" does not exist in this workflow.`,
        )
      }
    }
  }

  // Cycle detection ignores evaluator fail edges so retry loops remain valid.
  const nonFailEdges = workflow.edges.filter((edge) => edge.type !== "fail")
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  for (const node of workflow.nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }
  for (const edge of nonFailEdges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
      adjacency.get(edge.source)?.push(edge.target)
    }
  }
  const queue: string[] = []
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id)
  }
  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id) continue
    visited += 1
    for (const target of adjacency.get(id) || []) {
      const nextDegree = (inDegree.get(target) || 1) - 1
      inDegree.set(target, nextDegree)
      if (nextDegree === 0) queue.push(target)
    }
  }

  if (visited < workflow.nodes.length) {
    pushIssue(
      issues,
      "__workflow__",
      "edges",
      "Workflow contains a cycle — nodes would deadlock during execution.",
    )
  }

  return issues
}

export function formatWorkflowExecutionIssue(issue: WorkflowConfigIssue): string {
  if (issue.nodeId === "__workflow__") {
    return issue.message
  }
  return `Node "${issue.nodeId}" ${issue.field}: ${issue.message}`
}
