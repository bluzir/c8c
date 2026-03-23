import type {
  SkillNodeConfig,
  SplitterNodeConfig,
  Workflow,
} from "@shared/types"
import { cloneWorkflow } from "./workflow-graph-utils"

export const MIN_DETAIL_BUDGET = 1
export const MAX_DETAIL_BUDGET = 100
export type DetailBudgetPresetId = "low" | "medium" | "high"

export interface DetailBudgetPreset {
  id: DetailBudgetPresetId
  label: string
  value: number
}

export const DETAIL_BUDGET_PRESETS: DetailBudgetPreset[] = [
  { id: "low", label: "Low", value: 10 },
  { id: "medium", label: "Medium", value: 50 },
  { id: "high", label: "High", value: 100 },
]

export const DEFAULT_DETAIL_BUDGET = DETAIL_BUDGET_PRESETS[0].value

function replaceBranchCount(text: string, budget: number): string {
  return text
    .replace(/\bcreate exactly \d+\b/i, `create up to ${budget}`)
    .replace(/\bcreate up to \d+\b/i, `create up to ${budget}`)
}

function appendGranularityGuidance(
  text: string,
  budget: number,
  focus: string,
): string {
  const guidance = `Use up to ${budget} branches when the project is large enough. Prefer narrower ${focus} slices over broad buckets, but do not invent fake work for small projects.`
  if (text.includes(guidance)) return text
  return `${text.trim()}\n\n${guidance}`
}

function rewritePlaywrightMapperPrompt(prompt: string, budget: number): string {
  const next = prompt.replace(
    /In Scenario Candidates, propose \d+-\d+ high-value visual-testing scenarios\./i,
    `In Scenario Candidates, propose up to ${budget} high-value visual-testing scenarios.`,
  )
  return appendGranularityGuidance(
    next,
    budget,
    "scenario, route, state, and viewport",
  )
}

function buildAuditStrategy(
  budget: number,
  lensHeading: string,
  lensLines: string[],
  scopeSlices: string,
): string {
  return [
    `From the prepared map, create up to ${budget} parallel audit tasks.`,
    `Keep full coverage across these priority ${lensHeading}:`,
    ...lensLines.map((line, index) => `${index + 1}) ${line}`),
    "",
    `Use the available branch budget to go more granular than the top-level ${lensHeading}. Prefer narrower ${scopeSlices} slices when the project is large enough, but keep the tasks non-overlapping and grounded in the full project.`,
    "",
    "Each task must be fully self-contained and include:",
    "- task name",
    "- primary lens",
    "- exact scope slice",
    "- representative files, routes, or modules",
    "- what to inspect",
    "- what good looks like",
    "- concrete risks or failure modes",
  ].join("\n")
}

function rewriteSplitterStrategy(
  strategy: string,
  budget: number,
  templateId?: string | null,
): string {
  switch (templateId) {
    case "full-stack-code-audit":
      return buildAuditStrategy(
        budget,
        "audit areas",
        ["security", "code quality", "architecture", "test coverage"],
        "module, feature, route, service, or file-cluster",
      )
    case "ux-ui-polish-audit":
      return buildAuditStrategy(
        budget,
        "UX/UI lenses",
        [
          "information architecture and primary user flows",
          "visual hierarchy, layout, spacing, and consistency",
          "interaction states, forms, and system feedback",
          "accessibility, responsiveness, and input ergonomics",
          "perceived performance, motion, and final polish details",
        ],
        "route, component, state, responsive breakpoint, or UI cluster",
      )
    case "cto-optimise-audit":
      return buildAuditStrategy(
        budget,
        "CTO optimization lenses",
        [
          "architecture, modularity, and boundaries",
          "performance and scalability",
          "reliability, resilience, and observability",
          "security, privacy, and operational risk",
          "developer experience, testing, and delivery velocity",
          "infrastructure, dependency, and cost efficiency",
        ],
        "subsystem, service, workflow, dependency cluster, or delivery path",
      )
    case "playwright-visual-audit":
      return [
        `From the surface map, create up to ${budget} self-contained scenario execution tasks.`,
        "Use the branch budget to split large products into narrower route, state, viewport, or journey slices when that improves evidence quality.",
        "",
        "Each task must:",
        "- represent one executable scenario only",
        "- include the scenario id and title",
        "- restate the startup/access strategy",
        "- include all preconditions and credentials/setup assumptions from the brief",
        "- list exact interaction steps in order",
        "- state the target viewport(s)",
        "- define what must be captured as evidence",
        "- define what visual, UX, responsiveness, and console/runtime issues to look for",
        "",
        "Prefer the highest-risk and highest-value paths first. Avoid duplicating coverage between tasks.",
      ].join("\n")
    default:
      return appendGranularityGuidance(
        replaceBranchCount(strategy, budget),
        budget,
        "component, route, file, subsystem, or state",
      )
  }
}

export function clampDetailBudget(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_DETAIL_BUDGET
  return Math.min(
    MAX_DETAIL_BUDGET,
    Math.max(MIN_DETAIL_BUDGET, Math.round(value as number)),
  )
}

export function resolveDetailBudgetPreset(
  value: number | null | undefined,
): DetailBudgetPreset {
  const budget = clampDetailBudget(value)
  return DETAIL_BUDGET_PRESETS.reduce(
    (bestPreset, preset) =>
      Math.abs(preset.value - budget) < Math.abs(bestPreset.value - budget)
        ? preset
        : bestPreset,
    DETAIL_BUDGET_PRESETS[0]!,
  )
}

export function getDetailBudgetPresetById(
  id: string,
): DetailBudgetPreset | null {
  return DETAIL_BUDGET_PRESETS.find((preset) => preset.id === id) ?? null
}

export function applyWorkflowDetailBudget(
  workflow: Workflow,
  detailBudget: number | null | undefined,
  options?: { templateId?: string | null },
): Workflow {
  const budget = clampDetailBudget(detailBudget)
  const next = cloneWorkflow(workflow)

  next.defaults = {
    ...(next.defaults || {}),
    detailBudget: budget,
    maxParallel: budget,
  }

  next.nodes = next.nodes.map((node) => {
    if (node.type === "splitter") {
      const config = node.config as SplitterNodeConfig
      return {
        ...node,
        config: {
          ...config,
          maxBranches: budget,
          strategy: rewriteSplitterStrategy(
            config.strategy || "",
            budget,
            options?.templateId,
          ),
        },
      }
    }

    if (
      options?.templateId === "playwright-visual-audit" &&
      node.id === "mapper-1" &&
      node.type === "skill"
    ) {
      const config = node.config as SkillNodeConfig
      return {
        ...node,
        config: {
          ...config,
          prompt: rewritePlaywrightMapperPrompt(config.prompt || "", budget),
        },
      }
    }

    return node
  })

  return next
}
