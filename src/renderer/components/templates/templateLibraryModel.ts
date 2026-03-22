import type { ResultModeId, WorkflowTemplate } from "@shared/types"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import type { TemplateCategoryKey } from "@/lib/template-filters"

export const TEMPLATE_CATEGORY_ORDER: TemplateCategoryKey[] = [
  "all",
  "product",
  "marketing",
  "content",
]

export const TEMPLATE_CATEGORY_META: Record<TemplateCategoryKey, {
  label: string
  summary: string
  detail?: string
}> = {
  all: {
    label: "All",
    summary: "See the whole library first, then narrow it only if that helps.",
  },
  product: {
    label: "Development",
    summary: "Repo work, specs, implementation planning, UI polish, and software audits.",
  },
  marketing: {
    label: "Marketing",
    summary: "Research, positioning, trend, SEO, funnel, and campaign work.",
  },
  content: {
    label: "Content",
    summary: "Texts, publishing systems, course work, and launch assets.",
  },
}

export async function resolveHubTemplate(template: WorkflowTemplate): Promise<WorkflowTemplate> {
  if (template.source !== "hub" || template.workflow.nodes.length > 0) return template
  const full = await window.api.fetchHubTemplate(template.id)
  return { ...template, ...full, source: "hub" }
}

export function normalizeTemplateForWorkflowUse(template: WorkflowTemplate): WorkflowTemplate {
  const name = getWorkflowTemplateDisplayName(template)
  if (name === template.name) return template
  return { ...template, name }
}

export function deriveCreateModeId(
  activeCategory: TemplateCategoryKey,
  fallbackModeId: ResultModeId,
  selectedTemplate: WorkflowTemplate | null,
): ResultModeId {
  if (selectedTemplate?.pack?.id === "courses-factory-alpha") return "courses"
  if (activeCategory === "product") return "development"
  if (activeCategory === "marketing") return "content"
  if (activeCategory === "content") return "courses"
  return fallbackModeId
}
