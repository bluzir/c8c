import type {
  ProjectFactoryBlueprint,
  ProjectFactoryDefinition,
  RunStatus,
  WorkflowTemplate,
} from "@shared/types"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import type { WorkflowTemplateRunContext } from "@/lib/workflow-entry"

export type ProcessSpineStageId =
  | "shape_map"
  | "plan"
  | "implement"
  | "review"
  | "verify"
  | "ship"

export type ProcessSpineStageState =
  | "available"
  | "current"
  | "done"
  | "next"
  | "later"
  | "blocked"

export interface ProcessSpineStage {
  id: ProcessSpineStageId
  label: string
  state: ProcessSpineStageState
}

const PROCESS_STAGE_LABELS: Record<ProcessSpineStageId, string> = {
  shape_map: "Explore",
  plan: "Plan",
  implement: "Apply",
  review: "Review",
  verify: "Check",
  ship: "Ship",
}

const DEV_PROCESS_ORDER: ProcessSpineStageId[] = [
  "shape_map",
  "plan",
  "implement",
  "review",
  "verify",
  "ship",
]

const REVIEW_ENTRY_ORDER: ProcessSpineStageId[] = ["review", "verify", "ship"]

const STAGE_RANK: Record<ProcessSpineStageId, number> = {
  shape_map: 0,
  plan: 1,
  implement: 2,
  review: 3,
  verify: 4,
  ship: 5,
}

const TEMPLATE_STAGE_OVERRIDES: Record<string, ProcessSpineStageId> = {
  "delivery-map-codebase": "shape_map",
  "delivery-shape-project": "shape_map",
  "delivery-plan-phase": "plan",
  "delivery-implement-phase": "implement",
  "delivery-review-phase": "review",
  "delivery-verify-phase": "verify",
  "ux-ui-polish-audit": "review",
  "impeccable-ui-pipeline": "review",
  "playwright-visual-audit": "review",
  "gstack-feature-squad": "shape_map",
  "gstack-web-quality-board": "review",
  "gstack-preflight-gate": "verify",
  "gstack-release-room": "ship",
}

const JOURNEY_STAGE_TO_PROCESS_STAGE: Record<string, ProcessSpineStageId> = {
  map: "shape_map",
  intake: "shape_map",
  shape: "shape_map",
  research: "shape_map",
  plan: "plan",
  execute: "implement",
  review: "review",
  verify: "verify",
  operate: "ship",
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

function stageIdFromLabel(
  value: string | null | undefined,
): ProcessSpineStageId | null {
  const normalized = normalizeToken(value || "")
  if (!normalized) return null
  if (
    normalized === "shape / map" ||
    normalized === "shape map" ||
    normalized === "map" ||
    normalized === "shape"
  ) {
    return "shape_map"
  }
  if (normalized === "plan") return "plan"
  if (normalized === "implement" || normalized === "execute") return "implement"
  if (normalized === "review") return "review"
  if (normalized === "verify" || normalized === "verification") return "verify"
  if (normalized === "ship" || normalized === "release") return "ship"
  return null
}

function stageIdFromPackJourneyStage(
  value: string | null | undefined,
): ProcessSpineStageId | null {
  const normalized = normalizeToken(value || "")
  if (!normalized) return null
  return JOURNEY_STAGE_TO_PROCESS_STAGE[normalized] || null
}

export function deriveProcessSpineStageId(
  templateOrContext?:
    | Pick<WorkflowTemplate, "id" | "pack">
    | Pick<WorkflowTemplateRunContext, "templateId" | "pack">
    | null,
): ProcessSpineStageId | null {
  if (!templateOrContext) return null
  const templateId =
    "templateId" in templateOrContext
      ? templateOrContext.templateId
      : templateOrContext.id
  const explicit = TEMPLATE_STAGE_OVERRIDES[templateId]
  if (explicit) return explicit
  return stageIdFromPackJourneyStage(templateOrContext.pack?.journeyStage)
}

function dedupeStageIds(values: ProcessSpineStageId[]) {
  const seen = new Set<ProcessSpineStageId>()
  const next: ProcessSpineStageId[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    next.push(value)
  }
  return next
}

function ensureStage(
  order: ProcessSpineStageId[],
  stageId: ProcessSpineStageId | null,
) {
  if (!stageId || order.includes(stageId)) return order
  const next = [...order]
  const insertAt = next.findIndex(
    (candidate) => STAGE_RANK[candidate] > STAGE_RANK[stageId],
  )
  if (insertAt === -1) {
    next.push(stageId)
    return next
  }
  next.splice(insertAt, 0, stageId)
  return next
}

function normalizeStageOrder(
  values: string[] | undefined,
): ProcessSpineStageId[] {
  if (!values?.length) return []
  const stages = values
    .map((value) => stageIdFromLabel(value))
    .filter((value): value is ProcessSpineStageId => value !== null)
  return dedupeStageIds(stages)
}

function matchesFactoryContext(
  factory: ProjectFactoryDefinition,
  context?: Pick<
    WorkflowTemplateRunContext,
    "factoryId" | "factoryLabel" | "pack"
  > | null,
) {
  if (!context) return false
  if (context.factoryId) return factory.id === context.factoryId

  const packId = context.pack?.id
  if (packId && factory.recipe?.packIds?.includes(packId)) return true

  const normalizedLabel = normalizeToken(
    context.factoryLabel || context.pack?.label || "",
  )
  return (
    Boolean(normalizedLabel) &&
    normalizeToken(factory.label) === normalizedLabel
  )
}

function buildPackStageOrder(
  templates: WorkflowTemplate[],
  packId: string,
): ProcessSpineStageId[] {
  const stages = templates
    .filter((template) => template.pack?.id === packId)
    .map((template) => deriveProcessSpineStageId(template))
    .filter((value): value is ProcessSpineStageId => value !== null)
    .sort((left, right) => STAGE_RANK[left] - STAGE_RANK[right])
  return dedupeStageIds(stages)
}

function isDevProcessContext(
  context:
    | Pick<WorkflowTemplateRunContext, "templateId" | "pack">
    | null
    | undefined,
  currentStageId: ProcessSpineStageId | null,
) {
  if (currentStageId && DEV_PROCESS_ORDER.includes(currentStageId)) return true
  const packId = context?.pack?.id
  return packId === "delivery-foundation" || packId === "gstack-team"
}

function buildDefaultOrder(currentStageId: ProcessSpineStageId | null) {
  if (
    currentStageId === "review" ||
    currentStageId === "verify" ||
    currentStageId === "ship"
  ) {
    return [...REVIEW_ENTRY_ORDER]
  }
  if (currentStageId) {
    return [...DEV_PROCESS_ORDER]
  }
  return []
}

function deriveCurrentStageState({
  runStatus,
  runOutcome,
  reviewingPastRun,
}: {
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  reviewingPastRun?: boolean
}): Extract<ProcessSpineStageState, "current" | "done" | "blocked"> {
  if (
    reviewingPastRun ||
    (runStatus === "done" && runOutcome === "completed")
  ) {
    return "done"
  }

  if (
    runStatus === "error" ||
    (runStatus === "done" &&
      (runOutcome === "blocked" ||
        runOutcome === "failed" ||
        runOutcome === "cancelled" ||
        runOutcome === "interrupted"))
  ) {
    return "blocked"
  }

  return "current"
}

export function selectProcessSpineFactory(
  blueprint: ProjectFactoryBlueprint | null,
  context?: Pick<
    WorkflowTemplateRunContext,
    "factoryId" | "factoryLabel" | "pack"
  > | null,
): ProjectFactoryDefinition | null {
  if (!blueprint || !context) return null
  const factories = blueprint.factories || []
  if (context.factoryId) {
    const direct =
      factories.find((factory) => factory.id === context.factoryId) || null
    if (direct) return direct
  }

  if (blueprint.selectedFactoryId) {
    const selected =
      factories.find((factory) => factory.id === blueprint.selectedFactoryId) ||
      null
    if (selected && matchesFactoryContext(selected, context)) return selected
  }

  const packId = context.pack?.id
  if (packId) {
    const byPack =
      factories.find((factory) => factory.recipe?.packIds?.includes(packId)) ||
      null
    if (byPack) return byPack
  }

  const normalizedLabel = normalizeToken(
    context.factoryLabel || context.pack?.label || "",
  )
  if (normalizedLabel) {
    return (
      factories.find(
        (factory) => normalizeToken(factory.label) === normalizedLabel,
      ) || null
    )
  }

  return null
}

export function buildProcessSpine({
  context,
  nextTemplate,
  templates,
  factory,
  runStatus,
  runOutcome,
  reviewingPastRun = false,
}: {
  context?: WorkflowTemplateRunContext | null
  nextTemplate?: WorkflowTemplate | null
  templates?: WorkflowTemplate[]
  factory?: ProjectFactoryDefinition | null
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  reviewingPastRun?: boolean
}): ProcessSpineStage[] | null {
  const currentStageId = deriveProcessSpineStageId(context)
  const nextStageId = deriveProcessSpineStageId(nextTemplate)
  if (!currentStageId && !nextStageId) return null

  const factoryStageOrder = normalizeStageOrder(factory?.recipe?.stageOrder)
  const packStageOrder = context?.pack?.id
    ? buildPackStageOrder(templates || [], context.pack.id)
    : []
  let order =
    packStageOrder.length > 0
      ? packStageOrder
      : factoryStageOrder.length > 0 &&
          isDevProcessContext(context, currentStageId)
        ? [...DEV_PROCESS_ORDER]
        : factoryStageOrder.length > 0
          ? factoryStageOrder
          : buildDefaultOrder(currentStageId)

  order = ensureStage(order, currentStageId)
  order = ensureStage(order, nextStageId)

  if (order.length === 0) return null

  const currentIndex = currentStageId ? order.indexOf(currentStageId) : -1
  const nextIndex = nextStageId ? order.indexOf(nextStageId) : -1
  const currentState = deriveCurrentStageState({
    runStatus,
    runOutcome,
    reviewingPastRun,
  })

  return order.map((stageId, index) => {
    let state: ProcessSpineStageState = "later"

    if (stageId === currentStageId) {
      state = currentState
    } else if (currentState === "done" && stageId === nextStageId) {
      state = "next"
    } else if (currentIndex >= 0 && index < currentIndex) {
      state = "available"
    } else if (stageId === nextStageId) {
      state = "next"
    } else if (currentIndex === -1 && nextIndex >= 0 && index < nextIndex) {
      state = "available"
    }

    return {
      id: stageId,
      label: PROCESS_STAGE_LABELS[stageId],
      state,
    }
  })
}
