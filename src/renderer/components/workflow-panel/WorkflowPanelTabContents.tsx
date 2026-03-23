import type { ComponentProps, ReactNode, RefObject } from "react"
import { TabsContent } from "@/components/ui/tabs"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { OutputPanel } from "@/components/OutputPanel"
import { WorkflowSettingsPanel } from "@/components/WorkflowSettingsPanel"
import {
  StageInputSection,
  WorkflowDraftSkeleton,
  WorkflowIdleStageContract,
  WorkflowResumeHeader,
} from "@/components/workflow-panel/WorkflowPanelInlineSections"
import { cn } from "@/lib/cn"
import type { WorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import type { FlowRulePreview } from "@/lib/flow-rules"
import type { WorkflowResumeEntrySummary } from "@/lib/workflow-resume-entry"
import type { WorkflowListSurfaceIntent } from "@/components/workflow-panel/screen-state"
import { shouldShowInlineInputPanel } from "@/components/workflow-panel/screen-state"
import type { TemplateToolingRecommendation } from "@/lib/web-search-backend"
import type { ArtifactContract, ArtifactRecord } from "@shared/types"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import type { ExecutionSurfaceNotice } from "@/lib/workflow-execution"

interface WorkflowSettingsTabProps {
  surfaceNotice: ExecutionSurfaceNotice | null
  onSurfaceNoticeAction: () => void
  onDismissSurfaceNotice: () => void
}

export function WorkflowSettingsTab({
  surfaceNotice,
  onSurfaceNoticeAction,
  onDismissSurfaceNotice,
}: WorkflowSettingsTabProps) {
  return (
    <TabsContent
      value="settings"
      className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in"
    >
      <div className="ui-content-shell py-6 space-y-6">
        {surfaceNotice && (
          <ExecutionSurfaceNoticeBanner
            notice={surfaceNotice}
            onAction={onSurfaceNoticeAction}
            onDismiss={onDismissSurfaceNotice}
          />
        )}
        <WorkflowSettingsPanel />
      </div>
    </TabsContent>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-section: input panel (inline or behind disclosure)
// ---------------------------------------------------------------------------

interface InputSectionSlotProps {
  inline: boolean
  inputPanelRef: RefObject<HTMLDivElement | null>
  showProjectArtifactsPanel: boolean
  artifacts: ArtifactRecord[]
  loading: boolean
  error: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
}

function InputSectionSlot({
  inline,
  inputPanelRef,
  showProjectArtifactsPanel,
  artifacts,
  loading,
  error,
  requiredContracts,
  onOpenArtifact,
}: InputSectionSlotProps) {
  const section = (
    <StageInputSection
      inputPanelRef={inputPanelRef}
      showTemplateContext={false}
      showProjectArtifactsPanel={showProjectArtifactsPanel}
      artifacts={artifacts}
      loading={loading}
      error={error}
      requiredContracts={requiredContracts}
      onOpenArtifact={onOpenArtifact}
    />
  )

  if (inline) return section

  return (
    <DisclosurePanel
      summary="Adjust step input"
      surface="plain"
      unmountWhenClosed
      contentClassName="px-0 py-2"
    >
      {section}
    </DisclosurePanel>
  )
}

// ---------------------------------------------------------------------------
// WorkflowListTab — intent-driven rendering
// ---------------------------------------------------------------------------

interface WorkflowListTabProps {
  listScrollRegionRef: RefObject<HTMLDivElement | null>
  listShellClass: string
  showCreateDraftSkeleton: boolean
  listSurfaceIntent: WorkflowListSurfaceIntent
  // Data props — content to render when the intent calls for it
  activeEntryState: WorkflowEntryState | null
  workflowName: string
  readyToRun: boolean
  startApprovalRequired: boolean
  entryStageLabel: string | null
  resumeEntrySummary: WorkflowResumeEntrySummary | null
  blockedResumeSummary: WorkflowBlockedResumeSummary | null
  entryNextStepLabel: string
  stageStartInputLabels: string[]
  entryFlowRules: FlowRulePreview[]
  templateToolingRecommendation?: TemplateToolingRecommendation | null
  onTemplateToolingAction?: (() => void) | null
  onPrimaryEntryAction: () => void
  onSecondaryEntryAction?: (() => void) | null
  secondaryEntryActionLabel?: string | null
  inputPanelRef: RefObject<HTMLDivElement | null>
  showProjectArtifactsPanel: boolean
  combinedArtifactRecords: ArtifactRecord[]
  projectArtifactsLoading: boolean
  projectArtifactsError: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
  idleStageContract: {
    title: string
    resultLabel: string
    summary: string
    inputLabels: string[]
    contextLine?: string | null
    provenanceLabel?: string | null
    showNeeds?: boolean
  } | null
  // Review / output state
  reviewMode: boolean
  reviewOutputVisible: boolean
  terminalResultOwnsLayout?: boolean
  blockedTaskPanel?: ReactNode
  outputPanelRef: RefObject<HTMLDivElement | null>
  outputPanelProps: ComponentProps<typeof OutputPanel>
}

export function WorkflowListTab({
  listScrollRegionRef,
  listShellClass,
  showCreateDraftSkeleton,
  listSurfaceIntent,
  activeEntryState,
  workflowName,
  readyToRun,
  startApprovalRequired,
  entryStageLabel,
  resumeEntrySummary,
  blockedResumeSummary,
  entryNextStepLabel,
  stageStartInputLabels,
  entryFlowRules,
  templateToolingRecommendation = null,
  onTemplateToolingAction = null,
  onPrimaryEntryAction,
  onSecondaryEntryAction = null,
  secondaryEntryActionLabel = null,
  inputPanelRef,
  showProjectArtifactsPanel,
  combinedArtifactRecords,
  projectArtifactsLoading,
  projectArtifactsError,
  requiredContracts,
  onOpenArtifact,
  idleStageContract,
  reviewMode,
  reviewOutputVisible,
  terminalResultOwnsLayout = false,
  blockedTaskPanel = null,
  outputPanelRef,
  outputPanelProps,
}: WorkflowListTabProps) {
  const inlineInput = shouldShowInlineInputPanel(listSurfaceIntent)

  const inputSectionProps: InputSectionSlotProps = {
    inline: inlineInput,
    inputPanelRef,
    showProjectArtifactsPanel,
    artifacts: combinedArtifactRecords,
    loading: projectArtifactsLoading,
    error: projectArtifactsError,
    requiredContracts,
    onOpenArtifact,
  }

  const templateToolingNotice = templateToolingRecommendation
    ? {
        level: templateToolingRecommendation.level,
        title: templateToolingRecommendation.title,
        description: templateToolingRecommendation.description,
        actionLabel: templateToolingRecommendation.actionLabel,
        actionTarget: "result" as const,
      }
    : null

  // --- Intent-driven section rendering ---

  function renderSections() {
    switch (listSurfaceIntent) {
      // ---- Start intents: idle stage contract + input ----
      case "start_ready":
      case "start_needs_input": {
        const showToolingNotice = templateToolingNotice !== null
        return (
          <>
            {showToolingNotice && templateToolingNotice && (
              <ExecutionSurfaceNoticeBanner
                notice={templateToolingNotice}
                onAction={onTemplateToolingAction}
              />
            )}
            {idleStageContract && (
              <WorkflowIdleStageContract
                title={idleStageContract.title}
                resultLabel={idleStageContract.resultLabel}
                summary={idleStageContract.summary}
                contextLine={idleStageContract.contextLine}
                provenanceLabel={idleStageContract.provenanceLabel}
                inputLabels={idleStageContract.inputLabels}
                flowRules={entryFlowRules}
                showNeeds={idleStageContract.showNeeds}
                onPrimaryAction={onPrimaryEntryAction}
                primaryActionLabel={
                  blockedResumeSummary?.primaryActionLabel ||
                  (readyToRun
                    ? resumeEntrySummary?.continueLabel || "Run"
                    : "Add input")
                }
                onSecondaryAction={onSecondaryEntryAction}
                secondaryActionLabel={secondaryEntryActionLabel}
              />
            )}
            <InputSectionSlot {...inputSectionProps} />
          </>
        )
      }

      // ---- Resume intents: resume header + input ----
      case "resume_ready":
      case "resume_needs_input": {
        if (!activeEntryState) return null
        return (
          <>
            <WorkflowResumeHeader
              entry={activeEntryState}
              displayTitle={
                resumeEntrySummary?.workLabel ||
                activeEntryState.title ||
                workflowName
              }
              readyToRun={readyToRun}
              startApprovalRequired={startApprovalRequired}
              stageLabel={entryStageLabel}
              resumeSummary={resumeEntrySummary}
              blockedResumeSummary={blockedResumeSummary}
              nextStepLabel={entryNextStepLabel}
              inputLabels={stageStartInputLabels}
              flowRules={entryFlowRules}
              onPrimaryAction={onPrimaryEntryAction}
              primaryActionLabel={
                readyToRun
                  ? resumeEntrySummary?.continueLabel || "Run"
                  : "Add input"
              }
              onSecondaryAction={onSecondaryEntryAction}
              secondaryActionLabel={secondaryEntryActionLabel}
            />
            <InputSectionSlot {...inputSectionProps} />
          </>
        )
      }

      // ---- Blocked decision: approval / gate task panel ----
      case "blocked_decision":
        return <>{blockedTaskPanel}</>

      // ---- Runtime status: live output while running ----
      case "runtime_status": {
        const liveClassName = cn(
          "scroll-mt-4 flex min-h-[var(--output-panel-min-height)] flex-col",
          "flex-1",
        )
        return (
          <div
            ref={outputPanelRef}
            id="run-output-panel"
            className={liveClassName}
          >
            <SectionErrorBoundary sectionName="output panel">
              <OutputPanel {...outputPanelProps} fillHeight />
            </SectionErrorBoundary>
          </div>
        )
      }

      // ---- Result inspect: review past run or terminal result ----
      case "result_inspect": {
        if (reviewMode) {
          if (!reviewOutputVisible) return null
          const reviewClassName =
            "scroll-mt-4 flex min-h-[var(--output-panel-min-height)] flex-col"
          return (
            <div
              ref={outputPanelRef}
              id="run-output-panel"
              className={reviewClassName}
            >
              <SectionErrorBoundary sectionName="output panel">
                <OutputPanel {...outputPanelProps} reviewingPastRun />
              </SectionErrorBoundary>
            </div>
          )
        }

        // Terminal result (non-review) — idle after completion
        const terminalClassName = cn(
          "scroll-mt-4 flex min-h-[var(--output-panel-min-height)] flex-col",
          !terminalResultOwnsLayout && "flex-1",
        )
        return (
          <div
            ref={outputPanelRef}
            id="run-output-panel"
            className={terminalClassName}
          >
            <SectionErrorBoundary sectionName="output panel">
              <OutputPanel
                {...outputPanelProps}
                fillHeight={!terminalResultOwnsLayout}
              />
            </SectionErrorBoundary>
          </div>
        )
      }
    }
  }

  return (
    <TabsContent
      value="list"
      ref={listScrollRegionRef}
      className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in"
    >
      <div className={listShellClass}>
        {showCreateDraftSkeleton ? <WorkflowDraftSkeleton /> : renderSections()}
      </div>
    </TabsContent>
  )
}
