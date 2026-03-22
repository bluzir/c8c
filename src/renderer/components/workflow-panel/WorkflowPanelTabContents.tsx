import type { ComponentProps, ReactNode, RefObject } from "react"
import { TabsContent } from "@/components/ui/tabs"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { OutputPanel } from "@/components/OutputPanel"
import { WorkflowSettingsPanel } from "@/components/WorkflowSettingsPanel"
import { ChainBuilder } from "@/components/ChainBuilder"
import {
  StageInputSection,
  WorkflowDraftSkeleton,
  WorkflowIdleStageContract,
  WorkflowResumeHeader,
} from "@/components/workflow-panel/WorkflowPanelInlineSections"
import { cn } from "@/lib/cn"
import type { WorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import type { WorkflowResumeEntrySummary } from "@/lib/workflow-resume-entry"
import type { ArtifactContract, ArtifactRecord, PersistedRunSnapshot } from "@shared/types"
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
    <TabsContent value="settings" className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in">
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

interface WorkflowListTabProps {
  listScrollRegionRef: RefObject<HTMLDivElement | null>
  listShellClass: string
  showCreateDraftSkeleton: boolean
  showResumeHeader: boolean
  activeEntryState: WorkflowEntryState | null
  workflowName: string
  readyToRun: boolean
  startApprovalRequired: boolean
  entryStageLabel: string | null
  resumeEntrySummary: WorkflowResumeEntrySummary | null
  blockedResumeSummary: WorkflowBlockedResumeSummary | null
  entryNextStepLabel: string
  stageStartInputLabels: string[]
  onPrimaryEntryAction: () => void
  inputPanelRef: RefObject<HTMLDivElement | null>
  showProjectArtifactsPanel: boolean
  combinedArtifactRecords: ArtifactRecord[]
  projectArtifactsLoading: boolean
  projectArtifactsError: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
  showIdleStageContract: boolean
  idleStageContract: {
    title: string
    resultLabel: string
    summary: string
    inputLabels: string[]
    contextLine?: string | null
    provenanceLabel?: string | null
    showNeeds?: boolean
  } | null
  showIdleInputPanel: boolean
  showFlowEditor: boolean
  chainBuilderMode: ComponentProps<typeof ChainBuilder>["mode"]
  onFocusStageDetails: ComponentProps<typeof ChainBuilder>["onStageSelect"]
  reviewSnapshot: PersistedRunSnapshot | null
  showReviewOutputMode: boolean
  showReviewOutputPanel?: boolean
  showLiveOutputPanel?: boolean
  terminalResultOwnsLayout?: boolean
  blockedTaskPanel?: ReactNode
  outputPanelRef: RefObject<HTMLDivElement | null>
  outputPanelProps: ComponentProps<typeof OutputPanel>
}

export function WorkflowListTab({
  listScrollRegionRef,
  listShellClass,
  showCreateDraftSkeleton,
  showResumeHeader,
  activeEntryState,
  workflowName,
  readyToRun,
  startApprovalRequired,
  entryStageLabel,
  resumeEntrySummary,
  blockedResumeSummary,
  entryNextStepLabel,
  stageStartInputLabels,
  onPrimaryEntryAction,
  inputPanelRef,
  showProjectArtifactsPanel,
  combinedArtifactRecords,
  projectArtifactsLoading,
  projectArtifactsError,
  requiredContracts,
  onOpenArtifact,
  showIdleStageContract,
  idleStageContract,
  showIdleInputPanel,
  showFlowEditor,
  chainBuilderMode,
  onFocusStageDetails,
  reviewSnapshot,
  showReviewOutputMode,
  showReviewOutputPanel = true,
  showLiveOutputPanel = false,
  terminalResultOwnsLayout = false,
  blockedTaskPanel = null,
  outputPanelRef,
  outputPanelProps,
}: WorkflowListTabProps) {
  const reviewOutputPanelClassName = "scroll-mt-4 flex min-h-[var(--output-panel-min-height)] flex-col"
  const liveOutputPanelClassName = cn(
    "scroll-mt-4 flex min-h-[var(--output-panel-min-height)] flex-col",
    !terminalResultOwnsLayout && "flex-1",
  )

  return (
    <TabsContent
      value="list"
      ref={listScrollRegionRef}
      className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in"
    >
      <div className={listShellClass}>
        {showCreateDraftSkeleton ? (
          <WorkflowDraftSkeleton />
        ) : (
          <>
            {showResumeHeader && activeEntryState && !blockedResumeSummary && (
              <>
                <WorkflowResumeHeader
                  entry={activeEntryState}
                  displayTitle={resumeEntrySummary?.workLabel || activeEntryState.title || workflowName}
                  readyToRun={readyToRun}
                  startApprovalRequired={startApprovalRequired}
                  stageLabel={entryStageLabel}
                  resumeSummary={resumeEntrySummary}
                  blockedResumeSummary={blockedResumeSummary}
                  nextStepLabel={entryNextStepLabel}
                  inputLabels={stageStartInputLabels}
                  onPrimaryAction={onPrimaryEntryAction}
                  primaryActionLabel={blockedResumeSummary?.primaryActionLabel || (readyToRun ? (resumeEntrySummary?.continueLabel || "Run") : "Add input")}
                />
                {!blockedResumeSummary && (
                  <StageInputSection
                    inputPanelRef={inputPanelRef}
                    showTemplateContext={false}
                    showProjectArtifactsPanel={showProjectArtifactsPanel}
                    artifacts={combinedArtifactRecords}
                    loading={projectArtifactsLoading}
                    error={projectArtifactsError}
                    requiredContracts={requiredContracts}
                    onOpenArtifact={onOpenArtifact}
                  />
                )}
              </>
            )}
            {blockedTaskPanel}
            {showIdleStageContract && !terminalResultOwnsLayout && idleStageContract && (
                <WorkflowIdleStageContract
                  title={idleStageContract.title}
                  resultLabel={idleStageContract.resultLabel}
                  summary={idleStageContract.summary}
                  contextLine={idleStageContract.contextLine}
                  provenanceLabel={idleStageContract.provenanceLabel}
                  inputLabels={idleStageContract.inputLabels}
                  showNeeds={idleStageContract.showNeeds}
                  onPrimaryAction={onPrimaryEntryAction}
                  primaryActionLabel={blockedResumeSummary?.primaryActionLabel || (readyToRun ? (resumeEntrySummary?.continueLabel || "Run") : "Add input")}
                />
              )}
            {showIdleInputPanel && !terminalResultOwnsLayout && (
              <StageInputSection
                inputPanelRef={inputPanelRef}
                showTemplateContext={false}
                showProjectArtifactsPanel={showProjectArtifactsPanel}
                artifacts={combinedArtifactRecords}
                loading={projectArtifactsLoading}
                error={projectArtifactsError}
                requiredContracts={requiredContracts}
                onOpenArtifact={onOpenArtifact}
              />
            )}
            {showFlowEditor && !terminalResultOwnsLayout && (
              <SectionErrorBoundary sectionName="flow editor">
                <ChainBuilder
                  compact
                  mode={chainBuilderMode}
                  onStageSelect={onFocusStageDetails}
                  reviewSnapshot={reviewSnapshot}
                />
              </SectionErrorBoundary>
            )}
            {showReviewOutputMode && showReviewOutputPanel && (
              <div
                ref={outputPanelRef}
                id="run-output-panel"
                className={reviewOutputPanelClassName}
              >
                <SectionErrorBoundary sectionName="output panel">
                  <OutputPanel {...outputPanelProps} reviewingPastRun />
                </SectionErrorBoundary>
              </div>
            )}
            {showLiveOutputPanel && !showReviewOutputMode && (
              <div
                ref={outputPanelRef}
                id="run-output-panel"
                className={liveOutputPanelClassName}
              >
                <SectionErrorBoundary sectionName="output panel">
                  <OutputPanel {...outputPanelProps} fillHeight={!terminalResultOwnsLayout} />
                </SectionErrorBoundary>
              </div>
            )}
          </>
        )}
      </div>
    </TabsContent>
  )
}
