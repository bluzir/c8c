import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ArrowUpRight,
  FileStack,
  FolderOpen,
  Inbox,
  Loader2,
  RefreshCw,
  Rocket,
} from "lucide-react"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { errorToUserMessage } from "@/lib/error-message"
import { Badge } from "@/components/ui/badge"
import { BlueprintForm } from "@/components/factory/BlueprintForm"
import { FactoryOutcomeSelector } from "@/components/factory/FactoryOutcomeSelector"
import { FactoryOperationsView } from "@/components/factory/FactoryOperationsView"
import { GuidedPath } from "@/components/factory/GuidedPath"
import { useFactoryData } from "@/components/factory/useFactoryData"
import { useFactoryResources } from "@/components/factory/useFactoryResources"
import { useFactoryWorkflowActions } from "@/components/factory/useFactoryWorkflowActions"
import {
  buildBlueprintDraft,
  buildFactoryIdFromLabel,
  computeOutcomeTrackStatus,
  createEmptyBlueprintDraft,
  dedupePreserveOrder,
  factoryLaneMeta,
  isSpawnFriendlyArtifactKind,
  isVisibleProjectExecutionState,
  latestLineageLabel,
  resolveArtifactFactoryIdentity,
  resolveContextFactoryIdentity,
  splitLines,
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
import { Button } from "@/components/ui/button"
import {
  PageHeader,
  PageShell,
  SectionHeading,
} from "@/components/ui/page-shell"
import { SummaryRail } from "@/components/ui/summary-rail"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  formatRelativeTime,
  projectFolderName,
} from "@/components/sidebar/projectSidebarUtils"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import {
  currentWorkflowAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  selectedFactoryIdAtom,
  selectedProjectAtom,
  selectedFactoryCaseIdAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  workflowDirtyAtom,
  workflowTemplateContextsAtom,
  webSearchBackendAtom,
  workflowsAtom,
} from "@/lib/store"
import {
  workflowExecutionStatesAtom,
  pastRunsAtom,
  selectedPastRunAtom,
} from "@/features/execution"
import { formatResultModeLabel } from "@/lib/result-mode-factory"
import { buildRunProgressSummary, formatElapsedTime } from "@/lib/run-progress"
import {
  areTemplateContractsSatisfied,
  deriveArtifactCaseKey,
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJourneyStageLabel,
  deriveTemplatePackStagePath,
  formatArtifactContractLabel,
} from "@/lib/workflow-entry"
import { isRunInFlight, toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type {
  ArtifactRecord,
  FactoryPlannedCase,
  ProjectFactoryDefinition,
  ProjectFactoryBlueprint,
  ProjectFactoryState,
} from "@shared/types"

export function FactoryPage() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [, setInputValue] = useAtom(inputValueAtom)
  const [, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const workflowTemplateContexts = useAtomValue(workflowTemplateContextsAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(
    setWorkflowTemplateContextForKeyAtom,
  )
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const {
    artifacts,
    artifactsError,
    artifactsLoading,
    caseStates,
    factoryBlueprint,
    factoryBlueprintError,
    factoryBlueprintLoading,
    factoryState,
    factoryStateError,
    factoryStateLoading,
    humanTasks,
    humanTasksError,
    humanTasksLoading,
    refreshFactoryData,
    refreshFactoryState,
    setFactoryBlueprint,
    setFactoryBlueprintError,
    setFactoryState,
    setFactoryStateError,
    templates,
    templatesError,
    templatesLoading,
  } = useFactoryResources(selectedProject)
  const [factoryBlueprintSaving, setFactoryBlueprintSaving] = useState(false)
  const [editingFactoryBlueprint, setEditingFactoryBlueprint] = useState(false)
  const [blueprintDraft, setBlueprintDraft] = useState<FactoryBlueprintDraft>(
    createEmptyBlueprintDraft(),
  )
  const [spawningCases, setSpawningCases] = useState(false)
  const [draftFactoryId, setDraftFactoryId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"operations" | "setup">(
    "operations",
  )
  const [selectedFactoryId, setSelectedFactoryId] = useAtom(
    selectedFactoryIdAtom,
  )
  const [selectedCaseId, setSelectedCaseId] = useAtom(selectedFactoryCaseIdAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)

  useEffect(() => {
    setEditingFactoryBlueprint(false)
    setDraftFactoryId(null)
    setSelectedFactoryId(null)
  }, [selectedProject])

  const {
    availableEntrypointTemplates,
    caseLanes,
    effectiveSelectedFactoryId,
    factoryOptions,
    nextActions,
    overviewFields,
    outcomeProgressFields,
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
  } = useFactoryData({
    artifacts,
    caseStates,
    blueprintDraft,
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
  })

  const focusCase = useCallback(
    (caseId: string) => {
      setSelectedCaseId(caseId)
      window.requestAnimationFrame(() => {
        document
          .querySelector("[data-factory-case-shell='true']")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
      })
    },
    [setSelectedCaseId],
  )
  useEffect(() => {
    if (editingFactoryBlueprint) return
    setBlueprintDraft(
      buildBlueprintDraft(selectedFactoryDefinition, selectedPackRecipes),
    )
  }, [editingFactoryBlueprint, selectedFactoryDefinition, selectedPackRecipes])

  const handleFactoryBlueprintFieldChange = useCallback(
    (key: keyof FactoryBlueprintDraft, value: string) => {
      setBlueprintDraft((previous) => ({
        ...previous,
        [key]: value,
      }))
    },
    [],
  )

  const saveFactoryBlueprint = useCallback(async () => {
    if (!selectedProject) return

    setFactoryBlueprintSaving(true)
    setFactoryBlueprintError(null)
    try {
      const activePackIds = dedupePreserveOrder([
        ...(selectedFactoryDefinition?.recipe?.packIds || []),
        ...selectedPackRecipes.map((recipe) => recipe.id),
      ])
      const targetCount = blueprintDraft.targetCount.trim()
      const fallbackId = `factory:${Date.now().toString(36)}`
      const persistedFactoryId =
        selectedFactoryDefinition?.id ||
        (effectiveSelectedFactoryId?.startsWith("factory:")
          ? effectiveSelectedFactoryId
          : null) ||
        buildFactoryIdFromLabel(
          blueprintDraft.factoryLabel ||
            blueprintDraft.outcomeTitle ||
            "factory",
          fallbackId,
        )
      const nextFactory: ProjectFactoryDefinition = {
        id: persistedFactoryId,
        modeId: selectedFactoryDefinition?.modeId,
        label:
          blueprintDraft.factoryLabel.trim() ||
          blueprintDraft.outcomeTitle.trim() ||
          selectedFactoryOption?.label ||
          "Untitled lab",
        outcome: {
          title: blueprintDraft.outcomeTitle,
          statement: blueprintDraft.outcomeStatement,
          successSignal: blueprintDraft.successSignal,
          timeHorizon: blueprintDraft.timeHorizon,
          windowStart: blueprintDraft.windowStart,
          windowEnd: blueprintDraft.windowEnd,
          targetCount: targetCount ? Number(targetCount) : null,
          targetUnit: blueprintDraft.targetUnit,
          audience: blueprintDraft.audience,
          constraints: splitLines(blueprintDraft.constraintsText),
        },
        recipe: {
          summary: blueprintDraft.recipeSummary,
          packIds: activePackIds.length > 0 ? activePackIds : undefined,
          stageOrder: splitLines(blueprintDraft.stageOrderText),
          artifactContracts: splitLines(blueprintDraft.artifactContractsText),
          qualityPolicy: splitLines(blueprintDraft.qualityPolicyText),
          strategistCheckpoints: splitLines(
            blueprintDraft.strategistCheckpointsText,
          ),
          caseGenerationRules: splitLines(
            blueprintDraft.caseGenerationRulesText,
          ),
        },
        createdAt: selectedFactoryDefinition?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }
      const existingFactories = (factoryBlueprint?.factories || []).filter(
        (factory) => factory.id !== selectedFactoryDefinition?.id,
      )
      const saved = await window.api.saveProjectFactoryBlueprint({
        projectPath: selectedProject,
        blueprint: {
          factories: [...existingFactories, nextFactory],
          selectedFactoryId: persistedFactoryId,
        },
      })
      setFactoryBlueprint(saved)
      setSelectedFactoryId(saved.selectedFactoryId || persistedFactoryId)
      setDraftFactoryId(null)
      setEditingFactoryBlueprint(false)
      toast.success("Lab setup saved")
    } catch (error) {
      setFactoryBlueprintError(errorToUserMessage(error))
      toastErrorFromCatch("Could not save lab setup", error)
    } finally {
      setFactoryBlueprintSaving(false)
    }
  }, [
    blueprintDraft,
    effectiveSelectedFactoryId,
    factoryBlueprint?.factories,
    selectedFactoryDefinition,
    selectedFactoryOption?.label,
    selectedPackRecipes,
    selectedProject,
    setSelectedFactoryId,
  ])

  const startNewFactory = useCallback(() => {
    const nextDraftId = `draft:${Date.now().toString(36)}`
    setDraftFactoryId(nextDraftId)
    setSelectedFactoryId(nextDraftId)
    setBlueprintDraft(createEmptyBlueprintDraft())
    setEditingFactoryBlueprint(true)
    setActiveTab("setup")
  }, [setSelectedFactoryId])

  const spawnPlannedCases = useCallback(async () => {
    if (
      !selectedProject ||
      !effectiveSelectedFactoryId ||
      !spawnCandidateArtifact ||
      !spawnTemplateCandidate
    )
      return
    const confirmed = window.confirm(
      `Create new tracks from "${spawnCandidateArtifact.title}"? Existing tracks will stay in place.`,
    )
    if (!confirmed) return

    setSpawningCases(true)
    setFactoryStateError(null)
    try {
      const result = await window.api.spawnFactoryCasesFromArtifact({
        projectPath: selectedProject,
        factoryId: effectiveSelectedFactoryId,
        artifactId: spawnCandidateArtifact.id,
        templateId: spawnTemplateCandidate.id,
      })
      setFactoryState(result.state)
      if (result.plannedCases.length === 0) {
        toast.message("No new tracks were added", {
          description:
            "This planning result already spawned the current tracks.",
        })
      } else {
        toast.success(
          `Spawned ${result.plannedCases.length} track${result.plannedCases.length === 1 ? "" : "s"}`,
        )
      }
    } catch (error) {
      const message = errorToUserMessage(error)
      setFactoryStateError(message)
      toastError("Could not spawn tracks", {
        description: message,
      })
    } finally {
      setSpawningCases(false)
    }
  }, [
    effectiveSelectedFactoryId,
    selectedProject,
    spawnCandidateArtifact,
    spawnTemplateCandidate,
  ])
  const {
    launchingTemplateId,
    openInboxTask,
    launchPlannedCase,
    openWorkflow,
    openArtifact,
    openReport,
    launchTemplate,
  } = useFactoryWorkflowActions({
    selectedProject,
    selectedWorkflowPath,
    workflowDirty,
    webSearchBackend,
    selectedFactoryDefinition,
    spawnTemplateCandidate,
    scopedArtifacts,
    templateById,
    confirmDiscard,
    setMainView,
    setSelectedWorkflowPath,
    setWorkflow,
    setWorkflowSavedSnapshot,
    setWorkflows,
    setWorkflowEntryState,
    setInputValue,
    setInputAttachments,
    setSelectedPastRun,
    setSelectedInboxTaskKey,
    setSelectedCaseId,
    setWorkflowTemplateContextForKey,
  })

  if (!selectedProject) {
    return (
      <>
        <PageShell>
          <PageHeader
            title="Lab"
            subtitle="Choose a project in the sidebar to see live work, approvals, reusable artifacts, and next steps."
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMainView("thread")}
              >
                <FolderOpen size={14} />
                Back to flow
              </Button>
            }
          />
        </PageShell>
        {unsavedChangesDialog}
      </>
    )
  }

  return (
    <>
      <PageShell>
        <PageHeader
          title="Lab"
          subtitle={`Advanced project view for outcomes, results, live work, and approvals in ${projectFolderName(selectedProject)}. Lab is in beta.`}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMainView("artifacts")}
              >
                <FileStack size={14} />
                Open results
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedInboxTaskKey(null)
                  setMainView("inbox")
                }}
              >
                <Inbox size={14} />
                Open inbox
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshFactoryData()}
                disabled={humanTasksLoading || artifactsLoading}
              >
                {humanTasksLoading || artifactsLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Refresh
              </Button>
            </>
          }
        />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 ui-slab px-4 py-3">
            <div className="space-y-0.5">
              <p className="ui-meta-label text-muted-foreground">Project</p>
              <p className="text-body-md font-medium text-foreground">
                {projectFolderName(selectedProject)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMainView("templates")}
            >
              <Rocket size={14} />
              Library
            </Button>
          </div>

          <SummaryRail
            items={overviewFields}
            className="xl:grid-cols-4"
            compact
          />

          <FactoryOutcomeSelector
            effectiveSelectedFactoryId={effectiveSelectedFactoryId}
            factoryOptions={factoryOptions}
            onSelectFactory={(factoryId) => {
              setSelectedFactoryId(factoryId)
              setEditingFactoryBlueprint(false)
            }}
            onStartNewFactory={startNewFactory}
          />

          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "operations" | "setup")
            }
            className="space-y-4"
          >
            <TabsList className="h-control-md">
              <TabsTrigger
                value="operations"
                className="px-3 py-1 text-body-sm"
              >
                Operations
              </TabsTrigger>
              <TabsTrigger value="setup" className="px-3 py-1 text-body-sm">
                Setup
              </TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="mt-0 space-y-4">
              <BlueprintForm
                draft={blueprintDraft}
                editing={editingFactoryBlueprint}
                error={factoryBlueprintError}
                loading={factoryBlueprintLoading}
                saving={factoryBlueprintSaving}
                selectedFactoryDefinition={selectedFactoryDefinition}
                selectedFactoryOption={selectedFactoryOption}
                selectedPackRecipes={selectedPackRecipes}
                onCancelEditing={() => {
                  setEditingFactoryBlueprint(false)
                  setBlueprintDraft(
                    buildBlueprintDraft(
                      selectedFactoryDefinition,
                      selectedPackRecipes,
                    ),
                  )
                  setDraftFactoryId(null)
                }}
                onFieldChange={handleFactoryBlueprintFieldChange}
                onOpenArtifacts={() => setMainView("artifacts")}
                onOpenInbox={() => {
                  setSelectedInboxTaskKey(null)
                  setMainView("inbox")
                }}
                onSave={() => {
                  void saveFactoryBlueprint()
                }}
                onStartEditing={() => {
                  setEditingFactoryBlueprint(true)
                  setActiveTab("setup")
                }}
              />
              <GuidedPath
                selectedFactoryDefinition={selectedFactoryDefinition}
                selectedFactoryOption={selectedFactoryOption}
                selectedPackRecipes={selectedPackRecipes}
              />
            </TabsContent>

            <TabsContent value="operations" className="mt-0 space-y-4">
              <FactoryOperationsView
                availableEntrypointTemplates={availableEntrypointTemplates}
                artifactsError={artifactsError}
                artifactsLoading={artifactsLoading}
                caseLanes={caseLanes}
                factoryStateError={factoryStateError}
                factoryStateLoading={factoryStateLoading}
                humanTasksError={humanTasksError}
                humanTasksLoading={humanTasksLoading}
                launchingTemplateId={launchingTemplateId}
                nextActions={nextActions}
                outcomeProgressFields={outcomeProgressFields}
                plannedCaseProgress={plannedCaseProgress}
                readyCasesCount={readyCasesCount}
                scopedActiveRunsCount={scopedActiveRunsCount}
                scopedArtifacts={scopedArtifacts}
                scopedCases={scopedCases}
                scopedCompatibleTemplates={scopedCompatibleTemplates}
                scopedHumanTasks={scopedHumanTasks}
                scopedLiveRunEntries={scopedLiveRunEntries}
                scopedRecentArtifacts={scopedRecentArtifacts}
                scopedRecentRuns={scopedRecentRuns}
                scopedReadyTemplates={scopedReadyTemplates}
                selectedCase={selectedCase}
                selectedCaseSummary={selectedCaseSummary}
                spawnCandidateArtifact={spawnCandidateArtifact}
                spawnTemplateCandidate={spawnTemplateCandidate}
                spawningCases={spawningCases}
                templateById={templateById}
                templatesError={templatesError}
                templatesLoading={templatesLoading}
                onFocusCase={focusCase}
                onLaunchPlannedCase={launchPlannedCase}
                onLaunchTemplate={launchTemplate}
                onOpenArtifact={openArtifact}
                onOpenArtifactsLibrary={() => setMainView("artifacts")}
                onOpenCaseArtifacts={(caseId) => {
                  setSelectedCaseId(caseId)
                  setMainView("artifacts")
                }}
                onOpenInboxTask={openInboxTask}
                onOpenReport={openReport}
                onOpenWorkflow={openWorkflow}
                onSpawnPlannedCases={spawnPlannedCases}
              />
            </TabsContent>
          </Tabs>
        </section>
      </PageShell>
      {unsavedChangesDialog}
    </>
  )
}
