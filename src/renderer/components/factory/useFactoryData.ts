import { useEffect, useMemo } from "react"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { buildProjectCaseIndex } from "@/lib/case-summary"
import { formatResultModeLabel } from "@/lib/result-mode-factory"
import { buildRunProgressSummary } from "@/lib/run-progress"
import {
  areTemplateContractsSatisfied,
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  deriveTemplatePackStagePath,
  formatArtifactContractLabel,
  type WorkflowTemplateRunContext,
} from "@/lib/workflow-entry"
import {
  isRunInFlight,
  type WorkflowExecutionState,
} from "@/lib/workflow-execution"
import {
  deriveBlockedTaskLatestResultText,
  deriveBlockedTaskReasonText,
  deriveBlockedTaskStatusText,
} from "@/lib/workflow-blocked-copy"
import type {
  ArtifactRecord,
  CaseStateRecord,
  HumanTaskSummary,
  ProjectFactoryBlueprint,
  ProjectFactoryState,
  RunResult,
  WorkflowTemplate,
} from "@shared/types"
import {
  computeOutcomeTrackStatus,
  createEmptyBlueprintDraft,
  dedupePreserveOrder,
  factoryLaneMeta,
  isSpawnFriendlyArtifactKind,
  isVisibleProjectExecutionState,
  latestLineageLabel,
  resolveArtifactFactoryIdentity,
  templateHasStrategistCheckpoint,
  type CaseSummaryField,
  type FactoryActionItem,
  type FactoryBlueprintDraft,
  type FactoryCase,
  type FactoryCaseSummary,
  type FactoryPackRecipe,
  type FactoryPlannedCaseProgress,
  type FactoryRunEntry,
} from "@/components/factory/factory-page-helpers"

interface UseFactoryDataParams {
  artifacts: ArtifactRecord[]
  blueprintDraft: FactoryBlueprintDraft
  caseStates: CaseStateRecord[]
  draftFactoryId: string | null
  factoryBlueprint: ProjectFactoryBlueprint | null
  factoryState: ProjectFactoryState | null
  humanTasks: HumanTaskSummary[]
  pastRuns: RunResult[]
  selectedCaseId: string | null
  selectedFactoryId: string | null
  selectedProject: string | null
  setSelectedCaseId: (value: string | null) => void
  setSelectedFactoryId: (value: string | null) => void
  templates: WorkflowTemplate[]
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  workflowTemplateContexts: Record<string, WorkflowTemplateRunContext>
}

function normalizeTemplateMatchLabel(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ""
}

function matchesTemplateNextStepLabel(
  template: WorkflowTemplate,
  nextStepLabel: string | null,
) {
  const normalizedTarget = normalizeTemplateMatchLabel(nextStepLabel)
  if (!normalizedTarget) return false
  return [
    deriveTemplateContinuationLabel(template),
    deriveTemplateDisplayLabel(template),
    deriveTemplateJourneyStageLabel(template),
    template.name,
  ].some((value) => normalizeTemplateMatchLabel(value) === normalizedTarget)
}

function dedupeTemplates(templates: WorkflowTemplate[]) {
  const seen = new Set<string>()
  const next: WorkflowTemplate[] = []
  for (const template of templates) {
    if (seen.has(template.id)) continue
    seen.add(template.id)
    next.push(template)
  }
  return next
}

function isFactoryCaseBlocked(
  continuationStatus: CaseStateRecord["continuationStatus"],
) {
  return (
    continuationStatus === "awaiting_approval" ||
    continuationStatus === "blocked_by_check"
  )
}

export function selectFactoryCaseNextTemplates({
  caseArtifacts,
  latestArtifact,
  nextStepLabel,
  templateById,
  templates,
}: {
  caseArtifacts: ArtifactRecord[]
  latestArtifact: ArtifactRecord | null
  nextStepLabel: string | null
  templateById: Map<string, WorkflowTemplate>
  templates: WorkflowTemplate[]
}) {
  const compatibleTemplates = templates
    .filter((template) => (template.contractIn?.length || 0) > 0)
    .filter((template) =>
      areTemplateContractsSatisfied(template.contractIn, caseArtifacts),
    )

  if (compatibleTemplates.length === 0) return []

  const compatibleTemplateIds = new Set(
    compatibleTemplates.map((template) => template.id),
  )
  const recommendedNextTemplates = latestArtifact?.templateId
    ? (templateById.get(latestArtifact.templateId)?.pack?.recommendedNext || [])
        .map((templateId) => templateById.get(templateId) || null)
        .filter(
          (template): template is WorkflowTemplate =>
            template !== null && compatibleTemplateIds.has(template.id),
        )
    : []
  const matchingLabelTemplates = compatibleTemplates.filter((template) =>
    matchesTemplateNextStepLabel(template, nextStepLabel),
  )

  return dedupeTemplates([
    ...recommendedNextTemplates,
    ...matchingLabelTemplates,
    ...compatibleTemplates,
  ]).slice(0, 3)
}

export function useFactoryData({
  artifacts,
  blueprintDraft,
  caseStates,
  draftFactoryId,
  factoryBlueprint,
  factoryState,
  humanTasks,
  pastRuns,
  selectedCaseId,
  selectedFactoryId,
  selectedProject,
  setSelectedCaseId,
  setSelectedFactoryId,
  templates,
  workflowExecutionStates,
  workflowTemplateContexts,
}: UseFactoryDataParams) {
  const liveRunEntries = useMemo<FactoryRunEntry[]>(() => {
    if (!selectedProject) return []

    return Object.entries(workflowExecutionStates)
      .filter(([, state]) =>
        isVisibleProjectExecutionState(state, selectedProject),
      )
      .map(([workflowKey, state]) => ({
        workflowKey,
        workflowPath: workflowKey === "__draft__" ? null : workflowKey,
        workflowName: state.workflowName || "Untitled flow",
        reportPath: state.reportPath,
        runStartedAt: state.runStartedAt,
        lastUpdatedAt: state.lastUpdatedAt,
        projectPath: state.projectPath,
        summary: buildRunProgressSummary({
          workflow: state.workflowSnapshot || createEmptyWorkflow(),
          runtimeNodes: state.runtimeNodes,
          runtimeMeta: state.runtimeMeta,
          nodeStates: state.nodeStates,
          runStatus: state.runStatus,
          runOutcome: state.runOutcome,
          activeNodeId: state.activeNodeId,
        }),
        state,
      }))
      .sort(
        (left, right) =>
          (right.lastUpdatedAt || right.runStartedAt || 0) -
          (left.lastUpdatedAt || left.runStartedAt || 0),
      )
  }, [selectedProject, workflowExecutionStates])

  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )
  const caseIndex = useMemo(
    () =>
      buildProjectCaseIndex({
        artifacts,
        caseStates,
        templates,
        workflowTemplateContexts,
      }),
    [artifacts, caseStates, templates, workflowTemplateContexts],
  )

  const cases = useMemo<FactoryCase[]>(() => {
    const next = new Map<
      string,
      {
        id: string
        label: string
        factoryId: string
        factoryLabel: string
        artifacts: ArtifactRecord[]
        tasks: HumanTaskSummary[]
        relatedRuns: RunResult[]
        workflowPaths: Set<string>
        runIds: Set<string>
        latestArtifact: ArtifactRecord | null
        activeRun: FactoryRunEntry | null
        latestRun: FactoryRunEntry | null
        lineageLabels: string[]
        continuationStatus: FactoryCase["continuationStatus"]
        nextStepLabel: string | null
        lastGate: FactoryCase["lastGate"]
      }
    >()

    for (const summary of caseIndex.cases) {
      if (!summary.factoryId || !summary.factoryLabel) continue
      next.set(summary.id, {
        id: summary.id,
        label: summary.label,
        factoryId: summary.factoryId,
        factoryLabel: summary.factoryLabel,
        artifacts: [],
        tasks: [],
        relatedRuns: [],
        workflowPaths: new Set(summary.workflowPaths),
        runIds: new Set(summary.runIds),
        latestArtifact: summary.latestArtifact,
        activeRun: null,
        latestRun: null,
        lineageLabels: [...summary.lineageLabels],
        continuationStatus: summary.continuationStatus,
        nextStepLabel: summary.nextStepLabel,
        lastGate: summary.lastGate,
      })
    }

    for (const artifact of artifacts) {
      const caseId =
        caseIndex.caseByRunId.get(artifact.runId) ||
        (artifact.workflowPath
          ? caseIndex.caseByWorkflowPath.get(artifact.workflowPath)
          : undefined)
      if (!caseId) continue
      const entry = next.get(caseId)
      if (!entry) continue
      entry.artifacts.push(artifact)
      entry.runIds.add(artifact.runId)
    }

    for (const entry of liveRunEntries) {
      const caseId =
        (entry.workflowPath &&
          caseIndex.caseByWorkflowPath.get(entry.workflowPath)) ||
        (entry.state.runId
          ? caseIndex.caseByRunId.get(entry.state.runId)
          : undefined)
      if (!caseId) continue
      const existing = next.get(caseId)
      if (!existing) continue
      if (entry.workflowPath) existing.workflowPaths.add(entry.workflowPath)
      if (
        !existing.latestRun ||
        (entry.lastUpdatedAt || 0) > (existing.latestRun.lastUpdatedAt || 0)
      ) {
        existing.latestRun = entry
      }
      if (isRunInFlight(entry.state.runStatus)) {
        existing.activeRun = entry
      }
    }

    for (const task of humanTasks) {
      const caseId =
        (task.workflowPath &&
          caseIndex.caseByWorkflowPath.get(task.workflowPath)) ||
        caseIndex.caseByRunId.get(task.sourceRunId)
      if (!caseId) continue
      const entry = next.get(caseId)
      if (!entry) continue
      entry.tasks.push(task)
      if (task.workflowPath) {
        entry.workflowPaths.add(task.workflowPath)
      }
    }

    return Array.from(next.values())
      .map((entry) => {
        const caseArtifacts = [...entry.artifacts].sort(
          (left, right) => right.updatedAt - left.updatedAt,
        )
        const relatedRunIds = new Set<string>([
          ...entry.runIds,
          ...caseArtifacts.map((artifact) => artifact.runId),
          ...entry.tasks.map((task) => task.sourceRunId),
        ])
        const relatedRuns = pastRuns
          .filter(
            (run) =>
              relatedRunIds.has(run.runId) ||
              (run.workflowPath
                ? entry.workflowPaths.has(run.workflowPath)
                : false),
          )
          .sort((left, right) => right.completedAt - left.completedAt)
        const nextTemplatesForCase = isFactoryCaseBlocked(
          entry.continuationStatus,
        )
          ? []
          : selectFactoryCaseNextTemplates({
              caseArtifacts,
              latestArtifact: entry.latestArtifact,
              nextStepLabel: entry.nextStepLabel,
              templateById,
              templates,
            })
        let status: FactoryCase["status"] = "completed"
        if (entry.activeRun) {
          status = "active"
        } else if (
          entry.tasks.length > 0 ||
          isFactoryCaseBlocked(entry.continuationStatus)
        ) {
          status = "blocked"
        } else if (
          entry.continuationStatus === "ready" ||
          nextTemplatesForCase.length > 0
        ) {
          status = "ready"
        }

        return {
          id: entry.id,
          label: entry.label,
          factoryId: entry.factoryId,
          factoryLabel: entry.factoryLabel,
          artifacts: caseArtifacts,
          tasks: entry.tasks.sort(
            (left, right) => right.updatedAt - left.updatedAt,
          ),
          relatedRuns,
          workflowPaths: Array.from(entry.workflowPaths),
          latestArtifact: entry.latestArtifact,
          activeRun: entry.activeRun,
          latestRun: entry.latestRun,
          nextTemplates: nextTemplatesForCase,
          lineageLabels: entry.lineageLabels,
          continuationStatus: entry.continuationStatus,
          nextStepLabel: entry.nextStepLabel,
          lastGate: entry.lastGate,
          status,
        }
      })
      .sort((left, right) => {
        const leftUpdated =
          left.activeRun?.lastUpdatedAt ||
          left.latestArtifact?.updatedAt ||
          left.latestRun?.lastUpdatedAt ||
          0
        const rightUpdated =
          right.activeRun?.lastUpdatedAt ||
          right.latestArtifact?.updatedAt ||
          right.latestRun?.lastUpdatedAt ||
          0
        return rightUpdated - leftUpdated
      })
  }, [artifacts, caseIndex, humanTasks, liveRunEntries, pastRuns, templates])

  const packRecipes = useMemo<FactoryPackRecipe[]>(() => {
    const localTemplateById = new Map(
      templates.map((template) => [template.id, template]),
    )
    const packIds = new Set<string>()
    const caseIdsByPack = new Map<string, Set<string>>()

    const rememberCaseForPack = (
      packId: string | undefined,
      caseId: string | undefined,
    ) => {
      if (!packId) return
      packIds.add(packId)
      if (!caseId) return
      const existing = caseIdsByPack.get(packId)
      if (existing) {
        existing.add(caseId)
      } else {
        caseIdsByPack.set(packId, new Set([caseId]))
      }
    }

    for (const artifact of artifacts) {
      const template = artifact.templateId
        ? localTemplateById.get(artifact.templateId)
        : undefined
      rememberCaseForPack(
        template?.pack?.id,
        caseIndex.caseByRunId.get(artifact.runId),
      )
    }

    for (const context of Object.values(workflowTemplateContexts)) {
      rememberCaseForPack(context.pack?.id, context.caseId)
    }

    return Array.from(packIds)
      .map((packId) => {
        const packTemplates = templates.filter(
          (template) => template.pack?.id === packId,
        )
        const packLabel = packTemplates[0]?.pack?.label || packId
        const entrypointTemplate = packTemplates.find(
          (template) => template.pack?.entrypoint,
        )

        return {
          id: packId,
          label: packLabel,
          stageLabels: deriveTemplatePackStagePath(templates, packId),
          contractLabels: dedupePreserveOrder(
            packTemplates.flatMap((template) =>
              (template.contractOut || []).map((contract) =>
                formatArtifactContractLabel(contract),
              ),
            ),
          ),
          policyLabels: dedupePreserveOrder(
            packTemplates.flatMap((template) =>
              deriveTemplateExecutionDisciplineLabels(template),
            ),
          ),
          checkpointLabels: dedupePreserveOrder(
            packTemplates
              .filter((template) => templateHasStrategistCheckpoint(template))
              .map(
                (template) =>
                  deriveTemplateJourneyStageLabel(template) || template.name,
              ),
          ),
          caseRule: entrypointTemplate
            ? `A new track starts when you launch ${entrypointTemplate.name}. Later steps reuse saved results to continue that same track.`
            : "Tracks are created from entry steps and then continue through saved results and downstream launches.",
          activeCaseCount: caseIdsByPack.get(packId)?.size || 0,
        }
      })
      .sort((left, right) => right.activeCaseCount - left.activeCaseCount)
  }, [artifacts, caseIndex.caseByRunId, templates, workflowTemplateContexts])

  const factoryOptions = useMemo(() => {
    const next = new Map<
      string,
      {
        id: string
        label: string
        summary: string
        caseCount: number
        artifactCount: number
        origin: "saved" | "derived" | "draft"
        factory?: ProjectFactoryBlueprint["factories"][number]
      }
    >()

    const rememberFactory = (option: {
      id: string
      label: string
      summary: string
      caseCount: number
      artifactCount: number
      origin: "saved" | "derived" | "draft"
      factory?: ProjectFactoryBlueprint["factories"][number]
    }) => {
      const existing = next.get(option.id)
      if (existing) {
        existing.caseCount = Math.max(existing.caseCount, option.caseCount)
        existing.artifactCount = Math.max(
          existing.artifactCount,
          option.artifactCount,
        )
        if (existing.origin !== "saved" && option.origin === "saved") {
          existing.origin = "saved"
          existing.factory = option.factory
          existing.summary = option.summary
          existing.label = option.label
        }
        return
      }
      next.set(option.id, option)
    }

    for (const factory of factoryBlueprint?.factories || []) {
      rememberFactory({
        id: factory.id,
        label: factory.label,
        summary:
          factory.outcome?.statement ||
          factory.recipe?.summary ||
          "No saved outcome or recipe yet.",
        caseCount: 0,
        artifactCount: 0,
        origin: "saved",
        factory,
      })
    }

    for (const entry of cases) {
      const existing = next.get(entry.factoryId)
      if (existing) {
        existing.caseCount += 1
        existing.artifactCount += entry.artifacts.length
      } else {
        rememberFactory({
          id: entry.factoryId,
          label: entry.factoryLabel,
          summary: "Derived from saved results and ongoing track lineage.",
          caseCount: 1,
          artifactCount: entry.artifacts.length,
          origin: "derived",
        })
      }
    }

    if (draftFactoryId) {
      rememberFactory({
        id: draftFactoryId,
        label: blueprintDraft.factoryLabel.trim() || "New lab",
        summary: "Unsaved lab draft.",
        caseCount: 0,
        artifactCount: 0,
        origin: "draft",
      })
    }

    return Array.from(next.values()).sort((left, right) => {
      if (left.origin === "draft" && right.origin !== "draft") return -1
      if (right.origin === "draft" && left.origin !== "draft") return 1
      if (left.caseCount !== right.caseCount)
        return right.caseCount - left.caseCount
      return left.label.localeCompare(right.label)
    })
  }, [
    blueprintDraft.factoryLabel,
    cases,
    draftFactoryId,
    factoryBlueprint?.factories,
  ])

  const effectiveSelectedFactoryId = useMemo(() => {
    if (
      selectedFactoryId &&
      factoryOptions.some((factory) => factory.id === selectedFactoryId)
    ) {
      return selectedFactoryId
    }
    if (
      factoryBlueprint?.selectedFactoryId &&
      factoryOptions.some(
        (factory) => factory.id === factoryBlueprint.selectedFactoryId,
      )
    ) {
      return factoryBlueprint.selectedFactoryId
    }
    return factoryOptions[0]?.id || null
  }, [factoryBlueprint?.selectedFactoryId, factoryOptions, selectedFactoryId])

  const selectedFactoryOption = useMemo(
    () =>
      factoryOptions.find(
        (factory) => factory.id === effectiveSelectedFactoryId,
      ) || null,
    [effectiveSelectedFactoryId, factoryOptions],
  )
  const selectedFactoryDefinition = selectedFactoryOption?.factory || null

  const selectedPackRecipes = useMemo(() => {
    const describePack = (packId: string): FactoryPackRecipe | null => {
      const packTemplates = templates.filter(
        (template) => template.pack?.id === packId,
      )
      if (packTemplates.length === 0) return null
      const packLabel = packTemplates[0]?.pack?.label || packId
      const entrypointTemplate = packTemplates.find(
        (template) => template.pack?.entrypoint,
      )
      return {
        id: packId,
        label: packLabel,
        stageLabels: deriveTemplatePackStagePath(templates, packId),
        contractLabels: dedupePreserveOrder(
          packTemplates.flatMap((template) =>
            (template.contractOut || []).map((contract) =>
              formatArtifactContractLabel(contract),
            ),
          ),
        ),
        policyLabels: dedupePreserveOrder(
          packTemplates.flatMap((template) =>
            deriveTemplateExecutionDisciplineLabels(template),
          ),
        ),
        checkpointLabels: dedupePreserveOrder(
          packTemplates
            .filter((template) => templateHasStrategistCheckpoint(template))
            .map(
              (template) =>
                deriveTemplateJourneyStageLabel(template) || template.name,
            ),
        ),
        caseRule: entrypointTemplate
          ? `A new track starts when you launch ${entrypointTemplate.name}. Later steps reuse saved results to continue that same track.`
          : "Tracks are created from entry steps and then continue through saved results and downstream launches.",
        activeCaseCount: 0,
      }
    }

    const referencedPackIds = new Set<string>(
      selectedFactoryDefinition?.recipe?.packIds || [],
    )
    const selectedCases = cases.filter(
      (entry) => entry.factoryId === effectiveSelectedFactoryId,
    )
    for (const entry of selectedCases) {
      for (const artifact of entry.artifacts) {
        if (artifact.templateId) {
          const template = templateById.get(artifact.templateId)
          if (template?.pack?.id) referencedPackIds.add(template.pack.id)
        }
      }
      for (const template of entry.nextTemplates) {
        if (template.pack?.id) referencedPackIds.add(template.pack.id)
      }
    }
    const filtered = Array.from(referencedPackIds)
      .map(
        (packId) =>
          packRecipes.find((recipe) => recipe.id === packId) ||
          describePack(packId),
      )
      .filter((recipe): recipe is FactoryPackRecipe => recipe !== null)

    if (filtered.length > 0) return filtered
    return packRecipes.slice(0, 1)
  }, [
    cases,
    effectiveSelectedFactoryId,
    packRecipes,
    selectedFactoryDefinition?.recipe?.packIds,
    templateById,
    templates,
  ])

  const availableEntrypointTemplates = useMemo(() => {
    const selectedPackIds = new Set(
      selectedPackRecipes.map((recipe) => recipe.id),
    )
    return templates
      .filter((template) => template.pack?.entrypoint)
      .filter(
        (template) =>
          selectedPackIds.size === 0 ||
          (template.pack?.id ? selectedPackIds.has(template.pack.id) : false),
      )
      .slice(0, 6)
  }, [selectedPackRecipes, templates])

  const scopedCases = useMemo(
    () =>
      effectiveSelectedFactoryId
        ? cases.filter(
            (entry) => entry.factoryId === effectiveSelectedFactoryId,
          )
        : cases,
    [cases, effectiveSelectedFactoryId],
  )

  const scopedPlannedCases = useMemo(
    () =>
      effectiveSelectedFactoryId
        ? (factoryState?.plannedCases || []).filter(
            (entry) => entry.factoryId === effectiveSelectedFactoryId,
          )
        : factoryState?.plannedCases || [],
    [effectiveSelectedFactoryId, factoryState?.plannedCases],
  )

  const plannedCaseProgress = useMemo<FactoryPlannedCaseProgress[]>(
    () =>
      scopedPlannedCases.map((plannedCase) => {
        const runtimeCase =
          scopedCases.find((entry) => entry.id === plannedCase.id) || null
        return {
          plannedCase,
          runtimeCase,
          status: runtimeCase?.status || "planned",
        }
      }),
    [scopedCases, scopedPlannedCases],
  )

  const scopedHumanTasks = useMemo(
    () => scopedCases.flatMap((entry) => entry.tasks),
    [scopedCases],
  )

  const scopedArtifacts = useMemo(
    () =>
      effectiveSelectedFactoryId
        ? artifacts.filter(
            (artifact) =>
              resolveArtifactFactoryIdentity(artifact, templateById)?.id ===
              effectiveSelectedFactoryId,
          )
        : artifacts,
    [artifacts, effectiveSelectedFactoryId, templateById],
  )

  const scopedLiveRunEntries = useMemo(() => {
    const workflowPaths = new Set(
      scopedCases.flatMap((entry) => entry.workflowPaths),
    )
    const runIds = new Set(
      scopedCases.flatMap((entry) => entry.relatedRuns.map((run) => run.runId)),
    )
    return liveRunEntries.filter(
      (entry) =>
        (entry.workflowPath ? workflowPaths.has(entry.workflowPath) : false) ||
        (entry.state.runId ? runIds.has(entry.state.runId) : false),
    )
  }, [liveRunEntries, scopedCases])

  const scopedRecentRuns = useMemo(() => {
    const next = new Map<string, RunResult>()
    for (const entry of scopedCases) {
      for (const run of entry.relatedRuns) {
        if (!next.has(run.runId)) next.set(run.runId, run)
      }
    }
    return Array.from(next.values())
      .sort((left, right) => right.completedAt - left.completedAt)
      .slice(0, 4)
  }, [scopedCases])

  const scopedRecentArtifacts = useMemo(
    () => scopedArtifacts.slice(0, 4),
    [scopedArtifacts],
  )

  const scopedCompatibleTemplates = useMemo(() => {
    return templates
      .filter((template) => (template.contractIn?.length || 0) > 0)
      .filter((template) =>
        areTemplateContractsSatisfied(template.contractIn, scopedArtifacts),
      )
  }, [scopedArtifacts, templates])

  const scopedReadyTemplates = useMemo(
    () => scopedCompatibleTemplates.slice(0, 4),
    [scopedCompatibleTemplates],
  )
  const scopedActiveRunsCount = useMemo(
    () =>
      scopedLiveRunEntries.filter((entry) =>
        isRunInFlight(entry.state.runStatus),
      ).length,
    [scopedLiveRunEntries],
  )
  const completedPlannedCaseCount = useMemo(
    () =>
      plannedCaseProgress.filter((entry) => entry.status === "completed")
        .length,
    [plannedCaseProgress],
  )
  const readyCasesCount = useMemo(
    () => scopedCases.filter((entry) => entry.status === "ready").length,
    [scopedCases],
  )
  const spawnCandidateArtifact = useMemo(
    () =>
      scopedArtifacts.find((artifact) =>
        isSpawnFriendlyArtifactKind(artifact.kind),
      ) || null,
    [scopedArtifacts],
  )
  const spawnTemplateCandidate = useMemo(() => {
    if (!spawnCandidateArtifact) return null
    const selectedPackIds = new Set(
      selectedPackRecipes.map((recipe) => recipe.id),
    )
    return (
      templates.find(
        (template) =>
          template.pack?.id &&
          selectedPackIds.has(template.pack.id) &&
          (template.contractIn || []).some(
            (contract) => contract.kind === spawnCandidateArtifact.kind,
          ),
      ) || null
    )
  }, [selectedPackRecipes, spawnCandidateArtifact, templates])

  const caseLanes = useMemo(
    () =>
      (["blocked", "active", "ready", "completed"] as const).map((status) => ({
        status,
        ...factoryLaneMeta(status),
        cases: scopedCases.filter((entry) => entry.status === status),
      })),
    [scopedCases],
  )

  const selectedCase = useMemo(
    () =>
      scopedCases.find((entry) => entry.id === selectedCaseId) ||
      scopedCases[0] ||
      null,
    [scopedCases, selectedCaseId],
  )

  useEffect(() => {
    if (effectiveSelectedFactoryId !== selectedFactoryId) {
      setSelectedFactoryId(effectiveSelectedFactoryId)
    }
  }, [effectiveSelectedFactoryId, selectedFactoryId, setSelectedFactoryId])

  useEffect(() => {
    if (scopedCases.length === 0) {
      if (selectedCaseId !== null) setSelectedCaseId(null)
      return
    }
    if (
      !selectedCaseId ||
      !scopedCases.some((entry) => entry.id === selectedCaseId)
    ) {
      setSelectedCaseId(scopedCases[0].id)
    }
  }, [scopedCases, selectedCaseId, setSelectedCaseId])

  const nextActions = useMemo<FactoryActionItem[]>(() => {
    const next: FactoryActionItem[] = []

    for (const entry of cases) {
      const primaryTask = entry.tasks[0]
      if (primaryTask) {
        const currentStepLabel = latestLineageLabel(entry)
        next.push({
          id: `${entry.id}:task:${primaryTask.taskId}`,
          caseId: entry.id,
          caseLabel: entry.label,
          kind: "review_gate",
          title: primaryTask.title,
          description: [
            deriveBlockedTaskStatusText(primaryTask, currentStepLabel),
            deriveBlockedTaskLatestResultText(entry.latestArtifact),
            deriveBlockedTaskReasonText(primaryTask, currentStepLabel),
          ]
            .filter(Boolean)
            .join(" "),
          timestamp: primaryTask.updatedAt,
          tone: "warning",
          task: primaryTask,
          artifacts: entry.artifacts,
        })
        continue
      }

      if (entry.activeRun) {
        next.push({
          id: `${entry.id}:run:${entry.activeRun.workflowKey}`,
          caseId: entry.id,
          caseLabel: entry.label,
          kind: "monitor_run",
          title: entry.activeRun.workflowName,
          description:
            entry.activeRun.summary.activeStepLabel || "Run in progress",
          timestamp:
            entry.activeRun.lastUpdatedAt || entry.activeRun.runStartedAt || 0,
          tone: "info",
          run: entry.activeRun,
          artifacts: entry.artifacts,
        })
        continue
      }

      const primaryTemplate = entry.nextTemplates[0]
      if (primaryTemplate) {
        next.push({
          id: `${entry.id}:template:${primaryTemplate.id}`,
          caseId: entry.id,
          caseLabel: entry.label,
          kind: "open_stage",
          title: primaryTemplate.name,
          description: entry.latestArtifact
            ? `Ready from ${entry.latestArtifact.title}.`
            : "Ready from the results already saved for this track.",
          timestamp: entry.latestArtifact?.updatedAt || 0,
          tone: "success",
          template: primaryTemplate,
          artifacts: entry.artifacts,
        })
        continue
      }

      if (entry.status === "ready" && entry.nextStepLabel) {
        next.push({
          id: `${entry.id}:ready:${entry.nextStepLabel}`,
          caseId: entry.id,
          caseLabel: entry.label,
          kind: "open_stage",
          title: entry.nextStepLabel,
          description:
            entry.lastGate?.summaryText ||
            (entry.latestArtifact
              ? `Ready from ${entry.latestArtifact.title}.`
              : "Saved work is ready to continue."),
          timestamp:
            entry.latestArtifact?.updatedAt ||
            entry.latestRun?.completedAt ||
            0,
          tone: "success",
          artifacts: entry.artifacts,
        })
      }
    }

    const priority = (item: FactoryActionItem) => {
      if (item.kind === "review_gate") return 0
      if (item.kind === "monitor_run") return 1
      return 2
    }

    return next.sort((left, right) => {
      const byPriority = priority(left) - priority(right)
      if (byPriority !== 0) return byPriority
      return right.timestamp - left.timestamp
    })
  }, [cases])

  const primaryActionByCaseId = useMemo(() => {
    const next = new Map<string, FactoryActionItem>()
    for (const action of nextActions) {
      if (!next.has(action.caseId)) {
        next.set(action.caseId, action)
      }
    }
    return next
  }, [nextActions])

  const selectedCaseSummary = useMemo<FactoryCaseSummary | null>(() => {
    if (!selectedCase) return null
    const primaryAction = primaryActionByCaseId.get(selectedCase.id) || null

    let currentStageValue =
      latestLineageLabel(selectedCase) || "Not started yet"
    let currentStageHint = "Run a step to establish lineage."
    let currentStageTone: CaseSummaryField["tone"] = "default"

    if (selectedCase.activeRun) {
      currentStageValue =
        selectedCase.activeRun.summary.phaseLabel ||
        latestLineageLabel(selectedCase) ||
        "In progress"
      currentStageHint =
        selectedCase.activeRun.summary.activeStepLabel || "Run in progress."
      currentStageTone = "info"
    } else if (selectedCase.latestArtifact) {
      currentStageValue = latestLineageLabel(selectedCase) || "Result saved"
      currentStageHint = `${selectedCase.latestArtifact.title} · ${formatRelativeTime(selectedCase.latestArtifact.updatedAt)}`
    } else if (selectedCase.lastGate?.stepLabel) {
      currentStageValue = selectedCase.lastGate.stepLabel
      currentStageHint = selectedCase.lastGate.summaryText
    } else if (primaryAction?.template) {
      currentStageValue =
        latestLineageLabel(selectedCase) || "Ready to continue"
      currentStageHint = `Prepared to open ${primaryAction.template.name}.`
      currentStageTone = "success"
    }

    let blockingGateValue = "No open approval"
    let blockingGateHint = "Nothing is waiting on human input."
    let blockingGateTone: CaseSummaryField["tone"] = "default"
    if (selectedCase.tasks[0]) {
      const currentStepLabel = latestLineageLabel(selectedCase)
      blockingGateValue = deriveBlockedTaskStatusText(
        selectedCase.tasks[0],
        currentStepLabel,
      )
      blockingGateHint = [
        deriveBlockedTaskLatestResultText(selectedCase.latestArtifact),
        deriveBlockedTaskReasonText(selectedCase.tasks[0], currentStepLabel),
      ]
        .filter(Boolean)
        .join(" ")
      blockingGateTone = "warning"
    } else if (selectedCase.status === "blocked" && selectedCase.lastGate) {
      blockingGateValue = selectedCase.lastGate.summaryText
      blockingGateHint =
        selectedCase.lastGate.reasonText ||
        "Saved work is waiting on a previous decision."
      blockingGateTone = "warning"
    }

    let latestArtifactValue = "No result yet"
    let latestArtifactHint = "This track has not saved any reusable result yet."
    if (selectedCase.latestArtifact) {
      latestArtifactValue = selectedCase.latestArtifact.title
      latestArtifactHint = `${formatArtifactContractLabel(selectedCase.latestArtifact.kind)} · ${formatRelativeTime(selectedCase.latestArtifact.updatedAt)}`
    }

    let nextActionValue = "No action queued"
    let nextActionHint = "This track is complete or waiting for new input."
    let nextActionTone: CaseSummaryField["tone"] = "default"
    if (primaryAction) {
      nextActionValue =
        primaryAction.kind === "open_stage" && primaryAction.template
          ? primaryAction.template.name
          : primaryAction.title
      nextActionHint = primaryAction.description
      nextActionTone = primaryAction.tone
    } else if (selectedCase.status === "ready" && selectedCase.nextStepLabel) {
      nextActionValue = selectedCase.nextStepLabel
      nextActionHint =
        selectedCase.lastGate?.summaryText || "Saved work is ready to continue."
      nextActionTone = "success"
    } else if (selectedCase.status === "blocked" && selectedCase.lastGate) {
      nextActionValue = "Review block"
      nextActionHint = selectedCase.lastGate.summaryText
      nextActionTone = "warning"
    }

    const fields: CaseSummaryField[] = [
      {
        label: "Current step",
        value: currentStageValue,
        hint: currentStageHint,
        tone: currentStageTone,
      },
      {
        label: "Blocking approval",
        value: blockingGateValue,
        hint: blockingGateHint,
        tone: blockingGateTone,
      },
      {
        label: "Latest result",
        value: latestArtifactValue,
        hint: latestArtifactHint,
      },
      {
        label: "Next action",
        value: nextActionValue,
        hint: nextActionHint,
        tone: nextActionTone,
      },
    ]

    return {
      primaryAction,
      fields,
    }
  }, [primaryActionByCaseId, selectedCase])

  const outcomeTrack = useMemo(
    () =>
      computeOutcomeTrackStatus({
        targetCount: selectedFactoryDefinition?.outcome?.targetCount,
        plannedCount: plannedCaseProgress.length,
        windowStart: selectedFactoryDefinition?.outcome?.windowStart,
        windowEnd: selectedFactoryDefinition?.outcome?.windowEnd,
      }),
    [
      plannedCaseProgress.length,
      selectedFactoryDefinition?.outcome?.targetCount,
      selectedFactoryDefinition?.outcome?.windowEnd,
      selectedFactoryDefinition?.outcome?.windowStart,
    ],
  )

  const outcomeProgressFields = useMemo(() => {
    const targetValue =
      typeof selectedFactoryDefinition?.outcome?.targetCount === "number"
        ? `${selectedFactoryDefinition.outcome.targetCount}${selectedFactoryDefinition.outcome.targetUnit ? ` ${selectedFactoryDefinition.outcome.targetUnit}` : ""}`
        : "Not defined"
    const nextScheduled = plannedCaseProgress
      .map((entry) => entry.plannedCase.scheduledFor)
      .filter((value): value is string => Boolean(value))
      .sort()[0]

    return [
      {
        label: "Target",
        value: targetValue,
        hint: "The intended volume for this outcome.",
      },
      {
        label: "Planned items",
        value: String(plannedCaseProgress.length),
        hint: "Item tracks generated from planning results.",
      },
      {
        label: "Completed items",
        value: String(completedPlannedCaseCount),
        hint: "Spawned items that already reached a completed track state.",
        tone: completedPlannedCaseCount > 0 ? "success" : "default",
      },
      {
        label: "On track",
        value: outcomeTrack.label,
        hint: outcomeTrack.hint,
        tone: outcomeTrack.tone,
      },
      {
        label: "Next scheduled",
        value: nextScheduled || "Not scheduled",
        hint: "Earliest upcoming planned slot across item tracks.",
      },
    ] satisfies CaseSummaryField[]
  }, [
    completedPlannedCaseCount,
    outcomeTrack.hint,
    outcomeTrack.label,
    outcomeTrack.tone,
    plannedCaseProgress,
    selectedFactoryDefinition?.outcome?.targetCount,
    selectedFactoryDefinition?.outcome?.targetUnit,
  ])

  const overviewFields = useMemo(() => {
    const outcomeValue =
      selectedFactoryDefinition?.outcome?.title?.trim() ||
      selectedFactoryOption?.label ||
      "Lab not defined yet"
    const bottleneckValue =
      scopedHumanTasks.length > 0
        ? `${scopedHumanTasks.length} strategist approval${scopedHumanTasks.length === 1 ? "" : "s"}`
        : scopedActiveRunsCount > 0
          ? `${scopedActiveRunsCount} live run${scopedActiveRunsCount === 1 ? "" : "s"}`
          : readyCasesCount > 0
            ? `${readyCasesCount} track${readyCasesCount === 1 ? "" : "s"} ready`
            : "No active bottleneck"
    const bottleneckHint =
      scopedHumanTasks.length > 0
        ? "Approvals or requested input are the main limiter right now."
        : scopedActiveRunsCount > 0
          ? "Execution is the main moving part right now."
          : readyCasesCount > 0
            ? "The system is waiting for you to launch the next step."
            : "This lab is idle until you start or continue a track."

    return [
      {
        label: "Mode",
        value: formatResultModeLabel(selectedFactoryDefinition?.modeId),
        hint: "Current mode",
      },
      {
        label: "Outcome",
        value: outcomeValue,
        hint: "Current target",
      },
      {
        label: "Tracks",
        value: `${scopedCases.length} track${scopedCases.length === 1 ? "" : "s"} in this lab`,
        hint: "Tracked in this lab",
      },
      {
        label: "Bottleneck",
        value: bottleneckValue,
        hint: bottleneckHint,
        tone:
          scopedHumanTasks.length > 0
            ? "warning"
            : scopedActiveRunsCount > 0
              ? "info"
              : readyCasesCount > 0
                ? "success"
                : "default",
      },
    ] satisfies CaseSummaryField[]
  }, [
    readyCasesCount,
    scopedActiveRunsCount,
    scopedCases.length,
    scopedHumanTasks.length,
    selectedFactoryDefinition,
    selectedFactoryOption,
  ])

  return {
    availableEntrypointTemplates,
    caseLanes,
    cases,
    effectiveSelectedFactoryId,
    factoryOptions,
    liveRunEntries,
    nextActions,
    overviewFields,
    outcomeProgressFields,
    packRecipes,
    plannedCaseProgress,
    readyCasesCount,
    scopedActiveRunsCount,
    scopedArtifacts,
    scopedCases,
    scopedCompatibleTemplates,
    scopedHumanTasks,
    scopedLiveRunEntries,
    scopedRecentArtifacts,
    scopedRecentRuns,
    scopedReadyTemplates,
    selectedCase,
    selectedCaseSummary,
    selectedFactoryDefinition,
    selectedFactoryOption,
    selectedPackRecipes,
    spawnCandidateArtifact,
    spawnTemplateCandidate,
    templateById,
  }
}
