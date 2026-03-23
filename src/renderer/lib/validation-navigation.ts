import type { ViewMode } from "@/lib/store"
import type { ValidationError } from "@/lib/validate-workflow"
import type { Workflow, WorkflowNode } from "@shared/types"

function inputNodeIdForWorkflow(workflow: Workflow): string | null {
  return workflow.nodes.find((node) => node.type === "input")?.id ?? null
}

export type ValidationNavigationSurface = "list"

function getListValidationFieldId(
  nodeId: string,
  normalizedField: string,
  nodeType: WorkflowNode["type"] | null,
): string | null {
  switch (normalizedField) {
    case "skillRef":
      return `skill-ref-${nodeId}`
    case "prompt":
      return nodeType === "merger"
        ? `merge-prompt-${nodeId}`
        : `prompt-${nodeId}`
    case "outputMode":
      return `skill-output-mode-${nodeId}`
    case "maxTurns":
      return `skill-max-turns-${nodeId}`
    case "permissionMode":
      return `skill-permission-mode-${nodeId}`
    case "criteria":
      return `criteria-${nodeId}`
    case "threshold":
      return `threshold-${nodeId}`
    case "maxRetries":
      return `max-retries-${nodeId}`
    case "strategy":
      if (nodeType === "splitter") return `split-strategy-${nodeId}`
      if (nodeType === "merger") return `merger-strategy-${nodeId}`
      return null
    case "maxBranches":
      return `max-branches-${nodeId}`
    case "message":
      return `approval-message-${nodeId}`
    case "show_content":
      return `approval-show-content-${nodeId}`
    case "allow_edit":
      return `approval-allow-edit-${nodeId}`
    case "timeout_minutes":
      return `approval-timeout-${nodeId}`
    case "timeout_action":
      return `approval-timeout-action-${nodeId}`
    case "inputType":
      return `input-type-${nodeId}`
    case "required":
      return `input-required-${nodeId}`
    case "defaultValue":
      return `input-default-${nodeId}`
    case "placeholder":
      return nodeType === "input" ? `input-placeholder-${nodeId}` : null
    case "title":
      return nodeType === "output" ? `output-title-${nodeId}` : null
    case "format":
      return `output-format-${nodeId}`
    case "mode":
      return `human-mode-${nodeId}`
    case "requestSource":
      return `human-source-${nodeId}`
    case "staticRequest":
      return `human-title-${nodeId}`
    case "allowRevisions":
      return `human-allow-revisions-${nodeId}`
    case "defaults.model":
      return `workflow-model-${nodeId}`
    case "defaults.provider":
      return `workflow-provider-${nodeId}`
    default:
      return null
  }
}

export function getValidationFieldId(
  nodeId: string,
  field: string,
  _surface: ValidationNavigationSurface = "list",
  nodeType: WorkflowNode["type"] | null = null,
): string | null {
  const normalizedField = field.replace(/^config\./, "")
  return getListValidationFieldId(nodeId, normalizedField, nodeType)
}

export function resolveValidationNavigationTarget(
  workflow: Workflow,
  error: ValidationError,
  preferredViewMode: ViewMode = "list",
): { viewMode: ViewMode; nodeId: string | null; fieldId: string | null } {
  if (error.nodeId === "__workflow__") {
    const inputNodeId = inputNodeIdForWorkflow(workflow)
    if (!inputNodeId) {
      return {
        viewMode: "settings",
        nodeId: null,
        fieldId: null,
      }
    }

    return {
      viewMode: preferredViewMode === "settings" ? "settings" : "list",
      nodeId: inputNodeId,
      fieldId: getValidationFieldId(inputNodeId, error.field, "list", "input"),
    }
  }

  const node =
    workflow.nodes.find((candidate) => candidate.id === error.nodeId) || null
  return {
    viewMode: "list",
    nodeId: error.nodeId,
    fieldId: getValidationFieldId(
      error.nodeId,
      error.field,
      "list",
      node?.type ?? null,
    ),
  }
}
