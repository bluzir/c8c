import type {
  Workflow,
  WorkflowTemplate,
  WorkflowTemplateStage,
} from "@shared/types"
import { cloneWorkflow } from "./workflow-graph-utils"
import { applyWorkflowDetailBudget } from "./workflow-detail-budget"

export type WebSearchBackend = "builtin" | "exa"

const BUILTIN_WEB_TOOLS = ["WebSearch", "WebFetch", "ToolSearch"] as const
const EXA_WEB_TOOLS = [
  "mcp__exa__web_search_exa",
  "mcp__exa__crawling_exa",
] as const
const SHELL_WEB_FETCH_TOOLS = ["Bash(curl:*)", "Bash(wget:*)"] as const

function unique(tools: string[] | undefined): string[] | undefined {
  if (!tools || tools.length === 0) return undefined
  const deduped = [...new Set(tools.map((tool) => tool.trim()).filter(Boolean))]
  return deduped.length > 0 ? deduped : undefined
}

function removeTools(
  source: string[] | undefined,
  toRemove: readonly string[],
): string[] | undefined {
  if (!source || source.length === 0) return undefined
  const removeSet = new Set(toRemove)
  return unique(source.filter((tool) => !removeSet.has(tool)))
}

/**
 * Applies a user-selected web-search backend preset to research templates.
 * Non-research templates are intentionally unchanged.
 */
export function applyWebSearchBackendPreset(
  workflow: Workflow,
  stage: WorkflowTemplateStage,
  backend: WebSearchBackend,
): Workflow {
  const next = cloneWorkflow(workflow)
  if (stage !== "research") return next

  next.defaults = { ...(next.defaults || {}) }

  if (backend === "exa") {
    if (next.defaults.allowedTools && next.defaults.allowedTools.length > 0) {
      next.defaults.allowedTools = unique([
        ...next.defaults.allowedTools,
        ...EXA_WEB_TOOLS,
      ])
    }
    next.defaults.disallowedTools = unique([
      ...(next.defaults.disallowedTools || []),
      ...BUILTIN_WEB_TOOLS,
      ...SHELL_WEB_FETCH_TOOLS,
    ])
    return next
  }

  // builtin backend
  next.defaults.disallowedTools = removeTools(
    next.defaults.disallowedTools,
    BUILTIN_WEB_TOOLS,
  )
  next.defaults.disallowedTools = removeTools(
    next.defaults.disallowedTools,
    SHELL_WEB_FETCH_TOOLS,
  )
  next.defaults.allowedTools = removeTools(
    next.defaults.allowedTools,
    EXA_WEB_TOOLS,
  )
  return next
}

export function resolveTemplateWorkflow(
  template: Pick<WorkflowTemplate, "workflow" | "stage" | "name">,
  backend: WebSearchBackend,
  options?: { detailBudget?: number | null; templateId?: string | null },
): Workflow {
  let nextWorkflow = applyWebSearchBackendPreset(
    template.workflow,
    template.stage,
    backend,
  )
  if (options?.detailBudget != null) {
    nextWorkflow = applyWorkflowDetailBudget(
      nextWorkflow,
      options.detailBudget,
      {
        templateId: options.templateId,
      },
    )
  }
  const templateName = template.name.trim()
  if (templateName) {
    nextWorkflow.name = templateName
  }
  return nextWorkflow
}
