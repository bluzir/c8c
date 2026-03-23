import { buildRunProgressSummary } from "@/lib/run-progress"
import type { WorkflowTemplateRunContext } from "@/lib/workflow-entry"
import {
  isRunInFlight,
  type WorkflowExecutionState,
} from "@/lib/workflow-execution"
import type {
  ArtifactRecord,
  ContinuationStatus,
  DurableGateRecord,
  FactoryPlannedCase,
  HumanTaskSummary,
  ProjectFactoryDefinition,
  RunResult,
  WorkflowTemplate,
} from "@shared/types"

export interface FactoryRunEntry {
  workflowKey: string
  workflowPath: string | null
  workflowName: string
  reportPath: string | null
  runStartedAt: number | null
  lastUpdatedAt: number | null
  projectPath: string | null
  summary: ReturnType<typeof buildRunProgressSummary>
  state: WorkflowExecutionState
}

export interface FactoryCase {
  id: string
  label: string
  factoryId: string
  factoryLabel: string
  artifacts: ArtifactRecord[]
  tasks: HumanTaskSummary[]
  relatedRuns: RunResult[]
  workflowPaths: string[]
  latestArtifact: ArtifactRecord | null
  activeRun: FactoryRunEntry | null
  latestRun: FactoryRunEntry | null
  nextTemplates: WorkflowTemplate[]
  lineageLabels: string[]
  continuationStatus: ContinuationStatus | null
  nextStepLabel: string | null
  lastGate: DurableGateRecord | null
  status: "active" | "blocked" | "ready" | "completed"
}

export interface FactoryActionItem {
  id: string
  caseId: string
  caseLabel: string
  kind: "review_gate" | "monitor_run" | "open_stage"
  title: string
  description: string
  timestamp: number
  tone: "warning" | "info" | "success"
  task?: HumanTaskSummary
  run?: FactoryRunEntry
  template?: WorkflowTemplate
  artifacts: ArtifactRecord[]
}

export interface CaseSummaryField {
  label: string
  value: string
  hint?: string
  tone?: "default" | "info" | "warning" | "success"
}

export interface FactoryCaseSummary {
  primaryAction: FactoryActionItem | null
  fields: CaseSummaryField[]
}

export interface FactoryPackRecipe {
  id: string
  label: string
  stageLabels: string[]
  contractLabels: string[]
  policyLabels: string[]
  checkpointLabels: string[]
  caseRule: string
  activeCaseCount: number
}

export interface FactoryBlueprintDraft {
  factoryLabel: string
  outcomeTitle: string
  outcomeStatement: string
  successSignal: string
  timeHorizon: string
  windowStart: string
  windowEnd: string
  targetCount: string
  targetUnit: string
  audience: string
  constraintsText: string
  recipeSummary: string
  stageOrderText: string
  artifactContractsText: string
  qualityPolicyText: string
  strategistCheckpointsText: string
  caseGenerationRulesText: string
}

export interface FactoryOption {
  id: string
  label: string
  summary: string
  caseCount: number
  artifactCount: number
  origin: "saved" | "derived" | "draft"
  factory?: ProjectFactoryDefinition
}

export interface FactoryPlannedCaseProgress {
  plannedCase: FactoryPlannedCase
  runtimeCase: FactoryCase | null
  status: "planned" | "active" | "blocked" | "ready" | "completed"
}

export interface FactoryCaseLane {
  status: FactoryCase["status"]
  title: string
  description: string
  tone: "default" | "info" | "warning" | "success"
  cases: FactoryCase[]
}

export function isVisibleProjectExecutionState(
  state: WorkflowExecutionState,
  projectPath: string,
) {
  if (state.projectPath !== projectPath) return false
  return (
    isRunInFlight(state.runStatus) ||
    state.runOutcome !== null ||
    state.workspace !== null ||
    state.reportPath !== null ||
    state.finalContent.trim().length > 0 ||
    state.lastError !== null ||
    Object.keys(state.nodeStates).length > 0
  )
}

export function cardToneClass(kind: "info" | "success" | "warning" | "danger") {
  if (kind === "success") return "ui-status-badge-success"
  if (kind === "warning") return "ui-status-badge-warning"
  if (kind === "danger") return "ui-status-badge-danger"
  return "ui-status-badge-info"
}

export function factoryCaseStatusLabel(status: FactoryCase["status"]) {
  if (status === "active") return "Active"
  if (status === "blocked") return "Waiting on you"
  if (status === "ready") return "Ready"
  return "Completed"
}

export function factoryCaseStatusTone(
  status: FactoryCase["status"],
): "info" | "success" | "warning" | "danger" {
  if (status === "active") return "info"
  if (status === "blocked") return "warning"
  if (status === "ready") return "success"
  return "success"
}

export function factoryActionLabel(kind: FactoryActionItem["kind"]) {
  if (kind === "review_gate") return "Approval"
  if (kind === "monitor_run") return "Live run"
  return "Open step"
}

export function factoryPrimaryActionButtonLabel(
  kind: FactoryActionItem["kind"],
) {
  if (kind === "review_gate") return "Review in flow"
  if (kind === "monitor_run") return "Open flow"
  return "Continue flow"
}

export function latestLineageLabel(entry: FactoryCase) {
  return entry.lineageLabels[entry.lineageLabels.length - 1] || null
}

export function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

export function templateHasStrategistCheckpoint(template: WorkflowTemplate) {
  return template.workflow.nodes.some(
    (node) => node.type === "approval" || node.type === "human",
  )
}

function joinLines(values?: string[]) {
  return values?.join("\n") || ""
}

export function splitLines(value: string): string[] | undefined {
  const next = dedupePreserveOrder(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  )
  return next.length > 0 ? next : undefined
}

export function buildFactoryIdFromLabel(label: string, fallback: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug ? `factory:${slug}` : fallback
}

export function resolveArtifactFactoryIdentity(
  artifact: ArtifactRecord,
  _templateById: Map<string, WorkflowTemplate>,
) {
  if (artifact.factoryId) {
    return {
      id: artifact.factoryId,
      label: artifact.factoryLabel || "Lab",
    }
  }

  return null
}

export function resolveContextFactoryIdentity(
  context: WorkflowTemplateRunContext,
) {
  if (context.factoryId) {
    return {
      id: context.factoryId,
      label: context.factoryLabel || context.pack?.label || "Lab",
    }
  }

  return null
}

export function createEmptyBlueprintDraft(): FactoryBlueprintDraft {
  return {
    factoryLabel: "",
    outcomeTitle: "",
    outcomeStatement: "",
    successSignal: "",
    timeHorizon: "",
    windowStart: "",
    windowEnd: "",
    targetCount: "",
    targetUnit: "",
    audience: "",
    constraintsText: "",
    recipeSummary: "",
    stageOrderText: "",
    artifactContractsText: "",
    qualityPolicyText: "",
    strategistCheckpointsText: "",
    caseGenerationRulesText: "",
  }
}

export function buildBlueprintDraft(
  factory: ProjectFactoryDefinition | null,
  packRecipes: FactoryPackRecipe[],
): FactoryBlueprintDraft {
  const primaryRecipe = packRecipes[0] || null
  return {
    factoryLabel: factory?.label || "",
    outcomeTitle: factory?.outcome?.title || "",
    outcomeStatement: factory?.outcome?.statement || "",
    successSignal: factory?.outcome?.successSignal || "",
    timeHorizon: factory?.outcome?.timeHorizon || "",
    windowStart: factory?.outcome?.windowStart || "",
    windowEnd: factory?.outcome?.windowEnd || "",
    targetCount:
      typeof factory?.outcome?.targetCount === "number"
        ? String(factory.outcome.targetCount)
        : "",
    targetUnit: factory?.outcome?.targetUnit || "",
    audience: factory?.outcome?.audience || "",
    constraintsText: joinLines(factory?.outcome?.constraints),
    recipeSummary: factory?.recipe?.summary || primaryRecipe?.label || "",
    stageOrderText: joinLines(
      factory?.recipe?.stageOrder || primaryRecipe?.stageLabels,
    ),
    artifactContractsText: joinLines(
      factory?.recipe?.artifactContracts || primaryRecipe?.contractLabels,
    ),
    qualityPolicyText: joinLines(
      factory?.recipe?.qualityPolicy || primaryRecipe?.policyLabels,
    ),
    strategistCheckpointsText: joinLines(
      factory?.recipe?.strategistCheckpoints || primaryRecipe?.checkpointLabels,
    ),
    caseGenerationRulesText: joinLines(
      factory?.recipe?.caseGenerationRules ||
        (primaryRecipe ? [primaryRecipe.caseRule] : []),
    ),
  }
}

export function isSpawnFriendlyArtifactKind(kind: string) {
  return /(?:calendar|plan|roadmap|backlog)$/i.test(kind)
}

export function formatFactoryDate(value?: string) {
  if (!value) return "Not defined"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function computeOutcomeTrackStatus({
  targetCount,
  plannedCount,
  windowStart,
  windowEnd,
}: {
  targetCount?: number | null
  plannedCount: number
  windowStart?: string
  windowEnd?: string
}) {
  if (!targetCount || !windowStart || !windowEnd) {
    return {
      label: plannedCount > 0 ? "Tracking" : "No schedule",
      hint: "Add a dated window to compare planned volume against time.",
      tone: "default" as const,
    }
  }

  const start = new Date(windowStart).getTime()
  const end = new Date(windowEnd).getTime()
  const now = Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      label: "Schedule invalid",
      hint: "Window start and end need to be valid dates.",
      tone: "warning" as const,
    }
  }

  const elapsedRatio = Math.min(1, Math.max(0, (now - start) / (end - start)))
  const expected = targetCount * elapsedRatio
  if (plannedCount >= expected + 1) {
    return {
      label: "Ahead of plan",
      hint: `Planned ${plannedCount} against an expected ${Math.floor(expected)} by now.`,
      tone: "success" as const,
    }
  }
  if (plannedCount + 1 >= expected) {
    return {
      label: "On track",
      hint: `Planned ${plannedCount} against an expected ${Math.floor(expected)} by now.`,
      tone: "info" as const,
    }
  }
  return {
    label: "Behind plan",
    hint: `Planned ${plannedCount} against an expected ${Math.floor(expected)} by now.`,
    tone: "warning" as const,
  }
}

export function launchablePlannedTemplateId(
  plannedCase: FactoryPlannedCase,
  templateById: Map<string, WorkflowTemplate>,
  fallback: WorkflowTemplate | null,
) {
  return (
    (plannedCase.templateId && templateById.get(plannedCase.templateId)?.id) ||
    fallback?.id ||
    null
  )
}

export function factoryLaneMeta(status: FactoryCase["status"]) {
  if (status === "blocked") {
    return {
      title: "Waiting on you",
      description: "Tracks blocked on human review or missing input.",
      tone: "warning" as const,
    }
  }
  if (status === "active") {
    return {
      title: "Running",
      description: "Tracks with live execution already in progress.",
      tone: "info" as const,
    }
  }
  if (status === "ready") {
    return {
      title: "Ready",
      description: "Tracks that can move to the next step now.",
      tone: "success" as const,
    }
  }
  return {
    title: "Completed",
    description: "Tracks with no open approval and no immediate next step.",
    tone: "default" as const,
  }
}
