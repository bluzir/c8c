import type {
  ArtifactRecord,
  CaseStateRecord,
  ContinuationStatus,
  DurableGateRecord,
  WorkflowTemplate,
} from "@shared/types"
import {
  deriveArtifactCaseKey,
  deriveTemplateContextJourneyStageLabel,
  deriveTemplateJourneyStageLabel,
  type WorkflowTemplateRunContext,
} from "./workflow-entry"

export interface ProjectCaseOption {
  id: string
  label: string
  updatedAt: number
  factoryId: string | null
  factoryLabel: string | null
}

export interface ProjectCaseSummaryEntry {
  id: string
  label: string
  updatedAt: number
  factoryId: string | null
  factoryLabel: string | null
  workflowPaths: string[]
  runIds: string[]
  latestArtifact: ArtifactRecord | null
  lineageLabels: string[]
  continuationStatus: ContinuationStatus | null
  nextStepLabel: string | null
  lastGate: DurableGateRecord | null
}

export interface ProjectCaseIndex {
  cases: ProjectCaseSummaryEntry[]
  caseOptions: ProjectCaseOption[]
  caseById: Map<string, ProjectCaseSummaryEntry>
  caseByWorkflowPath: Map<string, string>
  caseByRunId: Map<string, string>
  latestArtifactByCaseId: Map<string, ArtifactRecord>
}

interface MutableProjectCaseSummaryEntry {
  id: string
  label: string
  updatedAt: number
  factoryId: string | null
  factoryLabel: string | null
  workflowPaths: Set<string>
  runIds: Set<string>
  latestArtifact: ArtifactRecord | null
  lineageLabels: string[]
  continuationStatus: ContinuationStatus | null
  nextStepLabel: string | null
  lastGate: DurableGateRecord | null
}

function normalizeLabel(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  return ""
}

function pushUnique(labels: string[], value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized || labels.includes(normalized)) return
  labels.push(normalized)
}

function ensureCase(
  entries: Map<string, MutableProjectCaseSummaryEntry>,
  caseId: string,
  input?: {
    label?: string | null
    updatedAt?: number | null
    factoryId?: string | null
    factoryLabel?: string | null
  },
) {
  const existing = entries.get(caseId)
  if (existing) {
    if (!existing.label) {
      existing.label = normalizeLabel(
        input?.label,
        existing.label,
        "Saved work",
      )
    }
    if ((input?.updatedAt || 0) > existing.updatedAt) {
      existing.updatedAt = input?.updatedAt || existing.updatedAt
    }
    if (!existing.factoryId && input?.factoryId) {
      existing.factoryId = input.factoryId
    }
    if (!existing.factoryLabel && input?.factoryLabel) {
      existing.factoryLabel = input.factoryLabel
    }
    return existing
  }

  const created: MutableProjectCaseSummaryEntry = {
    id: caseId,
    label: normalizeLabel(input?.label, "Saved work"),
    updatedAt: input?.updatedAt || 0,
    factoryId: input?.factoryId || null,
    factoryLabel: input?.factoryLabel || null,
    workflowPaths: new Set<string>(),
    runIds: new Set<string>(),
    latestArtifact: null,
    lineageLabels: [],
    continuationStatus: null,
    nextStepLabel: null,
    lastGate: null,
  }
  entries.set(caseId, created)
  return created
}

export function buildProjectCaseIndex({
  artifacts,
  caseStates = [],
  templates = [],
  workflowTemplateContexts,
}: {
  artifacts: ArtifactRecord[]
  caseStates?: CaseStateRecord[]
  templates?: WorkflowTemplate[]
  workflowTemplateContexts: Record<string, WorkflowTemplateRunContext>
}): ProjectCaseIndex {
  const entries = new Map<string, MutableProjectCaseSummaryEntry>()
  const caseByWorkflowPath = new Map<string, string>()
  const caseByRunId = new Map<string, string>()
  const latestArtifactByCaseId = new Map<string, ArtifactRecord>()
  const templateById = new Map(
    templates.map((template) => [template.id, template]),
  )

  for (const state of caseStates) {
    const entry = ensureCase(entries, state.caseId, {
      label: normalizeLabel(
        state.caseLabel,
        state.workLabel,
        state.workflowName,
      ),
      updatedAt: state.updatedAt,
      factoryId: state.factoryId || null,
      factoryLabel: state.factoryLabel || null,
    })
    if (state.workflowPath) {
      entry.workflowPaths.add(state.workflowPath)
      caseByWorkflowPath.set(state.workflowPath, state.caseId)
    }
    entry.continuationStatus = state.continuationStatus
    entry.nextStepLabel = state.nextStepLabel || entry.nextStepLabel
    entry.lastGate = state.lastGate || entry.lastGate
    pushUnique(entry.lineageLabels, state.lastGate?.stepLabel)
  }

  for (const artifact of artifacts) {
    const caseId = deriveArtifactCaseKey(artifact)
    const entry = ensureCase(entries, caseId, {
      label: normalizeLabel(
        artifact.caseLabel,
        artifact.workflowName,
        artifact.title,
      ),
      updatedAt: artifact.updatedAt,
      factoryId: artifact.factoryId || null,
      factoryLabel: artifact.factoryLabel || null,
    })
    if (artifact.workflowPath) {
      entry.workflowPaths.add(artifact.workflowPath)
      caseByWorkflowPath.set(artifact.workflowPath, caseId)
    }
    entry.runIds.add(artifact.runId)
    caseByRunId.set(artifact.runId, caseId)
    if (
      !entry.latestArtifact ||
      artifact.updatedAt > entry.latestArtifact.updatedAt
    ) {
      entry.latestArtifact = artifact
      latestArtifactByCaseId.set(caseId, artifact)
    }
    if (!entry.factoryId && artifact.factoryId) {
      entry.factoryId = artifact.factoryId
    }
    if (!entry.factoryLabel && artifact.factoryLabel) {
      entry.factoryLabel = artifact.factoryLabel
    }
    const template = artifact.templateId
      ? templateById.get(artifact.templateId)
      : undefined
    pushUnique(
      entry.lineageLabels,
      template ? deriveTemplateJourneyStageLabel(template) : null,
    )
  }

  for (const [workflowKey, context] of Object.entries(
    workflowTemplateContexts,
  )) {
    if (!context.caseId) continue
    const entry = ensureCase(entries, context.caseId, {
      label: normalizeLabel(
        context.caseLabel,
        context.workflowName,
        context.templateName,
      ),
      updatedAt: 0,
      factoryId: context.factoryId || null,
      factoryLabel: context.factoryLabel || context.pack?.label || null,
    })
    if (context.workflowPath) {
      entry.workflowPaths.add(context.workflowPath)
      caseByWorkflowPath.set(context.workflowPath, context.caseId)
    } else if (workflowKey !== "__draft__") {
      entry.workflowPaths.add(workflowKey)
      caseByWorkflowPath.set(workflowKey, context.caseId)
    }
    if (!entry.factoryId && context.factoryId) {
      entry.factoryId = context.factoryId
    }
    if (!entry.factoryLabel && (context.factoryLabel || context.pack?.label)) {
      entry.factoryLabel = context.factoryLabel || context.pack?.label || null
    }
    pushUnique(
      entry.lineageLabels,
      deriveTemplateContextJourneyStageLabel(context),
    )
  }

  const cases = Array.from(entries.values())
    .map(
      (entry): ProjectCaseSummaryEntry => ({
        id: entry.id,
        label: entry.label || "Saved work",
        updatedAt: entry.updatedAt,
        factoryId: entry.factoryId,
        factoryLabel: entry.factoryLabel,
        workflowPaths: Array.from(entry.workflowPaths),
        runIds: Array.from(entry.runIds),
        latestArtifact: entry.latestArtifact,
        lineageLabels: entry.lineageLabels,
        continuationStatus: entry.continuationStatus,
        nextStepLabel: entry.nextStepLabel,
        lastGate: entry.lastGate,
      }),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)

  return {
    cases,
    caseOptions: cases.map((entry) => ({
      id: entry.id,
      label: entry.label,
      updatedAt: entry.updatedAt,
      factoryId: entry.factoryId,
      factoryLabel: entry.factoryLabel,
    })),
    caseById: new Map(cases.map((entry) => [entry.id, entry])),
    caseByWorkflowPath,
    caseByRunId,
    latestArtifactByCaseId,
  }
}
