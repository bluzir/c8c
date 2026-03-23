import type {
  Workflow,
  WorkflowTemplate,
  WorkflowTemplateSuggestedTool,
  WorkflowTemplateStage,
} from "@shared/types"
import { cloneWorkflow } from "./workflow-graph-utils"
import { applyWorkflowDetailBudget } from "./workflow-detail-budget"

export type WebSearchBackend = "builtin" | "exa"
export type TemplateToolingRecommendationAction = "switch_to_exa"

export interface TemplateToolingRecommendation {
  level: "warning" | "info"
  title: string
  description: string
  actionLabel: string
  action: TemplateToolingRecommendationAction
}

const BUILTIN_WEB_TOOLS = ["WebSearch", "WebFetch", "ToolSearch"] as const
const EXA_WEB_TOOLS = [
  "mcp__exa__web_search_exa",
  "mcp__exa__crawling_exa",
] as const
const SHELL_WEB_FETCH_TOOLS = ["Bash(curl:*)", "Bash(wget:*)"] as const

function hasSuggestedTool(
  suggestedTools: WorkflowTemplateSuggestedTool[] | undefined,
  tool: WorkflowTemplateSuggestedTool,
) {
  return Boolean(suggestedTools?.includes(tool))
}

export function templateNeedsWebSearch(
  stage: WorkflowTemplateStage,
  suggestedTools?: WorkflowTemplateSuggestedTool[],
) {
  return stage === "research" || hasSuggestedTool(suggestedTools, "web_search")
}

export function resolveTemplateToolingRecommendation({
  suggestedTools,
  backend,
}: {
  suggestedTools?: WorkflowTemplateSuggestedTool[]
  backend: WebSearchBackend
}): TemplateToolingRecommendation | null {
  if (!hasSuggestedTool(suggestedTools, "web_search")) return null
  if (backend === "exa") return null

  return {
    level: "warning",
    title: "This flow recommends web search",
    description:
      "Switch to Exa so MCP-backed search is available during execution.",
    actionLabel: "Use Exa",
    action: "switch_to_exa",
  }
}

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
  suggestedTools?: WorkflowTemplateSuggestedTool[],
): Workflow {
  const next = cloneWorkflow(workflow)
  if (!templateNeedsWebSearch(stage, suggestedTools)) return next

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
  template: Pick<
    WorkflowTemplate,
    "workflow" | "stage" | "name" | "suggestedTools"
  >,
  backend: WebSearchBackend,
  options?: { detailBudget?: number | null; templateId?: string | null },
): Workflow {
  let nextWorkflow = applyWebSearchBackendPreset(
    template.workflow,
    template.stage,
    backend,
    template.suggestedTools,
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
