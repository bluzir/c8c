import { useEffect, type ReactNode, type RefObject } from "react"
import { useAtomValue } from "jotai"
import {
  ArrowRight,
  FolderOpen,
  LayoutTemplate,
  Loader2,
  Play,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { FlowRulesPreview } from "@/components/ui/flow-rules-preview"
import { ExecutionApprovalSummary } from "@/components/ui/execution-approval-summary"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { InputPanel } from "@/components/InputPanel"
import { ProjectResultsPanel } from "@/components/workflow/ProjectResultsPanel"
import {
  consumeShortcut,
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"
import { hasCompletedFirstFlowAtom } from "@/lib/store"
import type { WorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import {
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
} from "@/lib/workflow-entry"
import type { FlowRulePreview } from "@/lib/flow-rules"
import type { WorkflowResumeEntrySummary } from "@/lib/workflow-resume-entry"
import type {
  ArtifactContract,
  ArtifactRecord,
  InputAttachment,
  WorkflowTemplate,
} from "@shared/types"

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground pt-[var(--titlebar-height)]">
      <div className="ui-empty-state px-8 text-center">
        <div className="mx-auto mb-3 flex h-control-lg w-control-lg items-center justify-center text-muted-foreground/70">
          <Icon size={20} className="opacity-70" aria-hidden="true" />
        </div>
        <p className="mb-1 text-title-md text-foreground">{title}</p>
        <p className="text-body-md">{description}</p>
        {children && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

export interface EmptyProjectQuickStart {
  label: string
  prompt: string
}

const DEFAULT_QUICK_STARTS: EmptyProjectQuickStart[] = [
  {
    label: "Map this codebase",
    prompt: "Map this codebase and summarize its architecture",
  },
  {
    label: "Review code for issues",
    prompt:
      "Review this codebase for bugs, security issues, and code quality problems",
  },
  { label: "Investigate a bug", prompt: "Investigate and fix a bug" },
  { label: "Plan a new feature", prompt: "Plan and build a new feature" },
]

export function EmptyProjectState({
  onOpenTemplates,
  onQuickStart,
  quickStarts = DEFAULT_QUICK_STARTS,
}: {
  onOpenTemplates: () => void
  onQuickStart?: (prompt: string) => void
  quickStarts?: EmptyProjectQuickStart[]
}) {
  const hasCompletedFirstFlow = useAtomValue(hasCompletedFirstFlowAtom)

  return (
    <EmptyState
      icon={Sparkles}
      title="What do you want to do?"
      description="Describe your goal or pick a starting point."
    >
      <div className="flex flex-col items-center gap-4">
        {onQuickStart && quickStarts.length > 0 && (
          <div className="flex flex-col items-stretch gap-1.5 w-full max-w-xs">
            {quickStarts.map((qs) => (
              <button
                key={qs.label}
                type="button"
                onClick={() => onQuickStart(qs.prompt)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-body-sm text-foreground hover:bg-surface-2 ui-transition-colors text-left"
              >
                <ArrowRight
                  size={12}
                  className="shrink-0 opacity-50"
                  aria-hidden="true"
                />
                {qs.label}
              </button>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={onOpenTemplates}>
          <LayoutTemplate size={14} />
          Browse starting points
        </Button>
        {!hasCompletedFirstFlow && (
          <p className="text-body-sm text-muted-foreground/70">
            First time? Describe what you need — c8c will handle the rest.
          </p>
        )}
      </div>
    </EmptyState>
  )
}

const CAPABILITY_EXAMPLES = [
  "Review code for security issues",
  "Investigate and fix a bug",
  "Plan and build a new feature",
]

export function EmptyWorkspaceState({
  onOpenProject,
}: {
  onOpenProject: () => void
}) {
  const hasCompletedFirstFlow = useAtomValue(hasCompletedFirstFlowAtom)

  return (
    <EmptyState
      icon={FolderOpen}
      title="Start by opening a project"
      description="Choose a project folder — c8c will inspect it and suggest the best way to help."
    >
      <div className="flex flex-col items-center gap-4">
        <Button variant="outline" size="sm" onClick={onOpenProject}>
          <FolderOpen size={14} />
          Open project folder
        </Button>
        <ul className="space-y-1.5 text-body-sm text-muted-foreground">
          {CAPABILITY_EXAMPLES.map((example) => (
            <li key={example} className="flex items-center gap-2">
              <ArrowRight
                size={12}
                className="shrink-0 opacity-50"
                aria-hidden="true"
              />
              {example}
            </li>
          ))}
        </ul>
        {!hasCompletedFirstFlow && (
          <p className="text-body-sm text-muted-foreground/70">
            First time? Open a project and describe what you need — c8c will
            handle the rest.
          </p>
        )}
      </div>
    </EmptyState>
  )
}

export function WorkflowDraftSkeleton() {
  return (
    <div className="surface-figure p-5 ui-fade-slide-in">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground">
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-title-sm text-foreground">
            <Loader2 size={14} className="animate-spin text-status-info" />
            Preparing the first flow draft
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            The agent is turning your prompt into a runnable flow. This view
            will populate as soon as the draft is ready.
          </p>
        </div>
      </div>
      <div className="mt-5 divide-y divide-hairline" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`workflow-draft-skeleton-${index}`}
            className="animate-pulse px-1 py-4"
          >
            <div className="h-4 w-40 rounded bg-surface-3" />
            <div className="mt-3 h-3 w-full rounded bg-surface-3" />
            <div className="mt-2 h-3 w-5/6 rounded bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorkflowIdleStageContract({
  title,
  resultLabel,
  summary,
  contextLine,
  provenanceLabel,
  inputLabels,
  flowRules = [],
  showNeeds = true,
  onPrimaryAction,
  primaryActionLabel,
}: {
  title: string
  resultLabel: string
  summary: string
  contextLine?: string | null
  provenanceLabel?: string | null
  inputLabels: string[]
  flowRules?: FlowRulePreview[]
  showNeeds?: boolean
  onPrimaryAction?: (() => void) | null
  primaryActionLabel?: string
}) {
  const needsText =
    inputLabels.length > 0
      ? inputLabels.slice(0, 3).join(" · ")
      : "Input from this page"
  const detailLines = [
    provenanceLabel ? `Using: ${provenanceLabel}` : null,
    resultLabel ? `Result: ${resultLabel}` : null,
    showNeeds ? `Input: ${needsText}` : null,
  ].filter((line): line is string => Boolean(line))

  return (
    <section className="ui-fade-slide-in space-y-2">
      {contextLine && (
        <p className="ui-meta-text text-muted-foreground">{contextLine}</p>
      )}
      <div className="surface-figure px-4 py-4">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="section-kicker">Stage contract</p>
            <h2 className="text-title-lg text-foreground">{title}</h2>
            <p className="text-body-sm text-muted-foreground">{summary}</p>
          </div>
          {detailLines.length > 0 && (
            <div className="space-y-1.5">
              {detailLines.map((line) => (
                <p key={line} className="text-body-sm text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          )}
          {flowRules.length > 0 && (
            <FlowRulesPreview rules={flowRules} surface="flat" />
          )}
          {onPrimaryAction && primaryActionLabel && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onPrimaryAction}>
                <Play size={14} />
                {primaryActionLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function deriveEntryNextStepLabel({
  readyToRun,
  nextStageTemplate,
}: {
  readyToRun: boolean
  nextStageTemplate: WorkflowTemplate | null
}) {
  if (!readyToRun) return "Add step input."
  if (nextStageTemplate) {
    return `Continue to ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}.`
  }
  return "Review the result."
}

export function formatInputAttachmentLabel(attachment: InputAttachment) {
  if (attachment.kind === "file") return attachment.name
  if (attachment.kind === "run") return attachment.workflowName
  return attachment.label
}

export function takeLeadingSentence(
  value: string | null | undefined,
  fallback: string,
) {
  const firstLine = (value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  const normalized = (firstLine || "").replace(/\s+/g, " ").trim()
  if (!normalized) return fallback

  const sentenceMatch = normalized.match(/^.+?[.!?](?=\s|$)/)
  return sentenceMatch?.[0]?.trim() || normalized
}

export function WorkflowResumeHeader({
  entry,
  displayTitle,
  readyToRun,
  startApprovalRequired,
  stageLabel,
  resumeSummary,
  blockedResumeSummary,
  nextStepLabel,
  inputLabels,
  flowRules = [],
  onPrimaryAction,
  primaryActionLabel,
}: {
  entry: WorkflowEntryState
  displayTitle: string
  readyToRun: boolean
  startApprovalRequired: boolean
  stageLabel?: string | null
  resumeSummary?: WorkflowResumeEntrySummary | null
  blockedResumeSummary?: WorkflowBlockedResumeSummary | null
  nextStepLabel: string
  inputLabels: string[]
  flowRules?: FlowRulePreview[]
  onPrimaryAction: () => void
  primaryActionLabel: string
}) {
  const headline = blockedResumeSummary
    ? blockedResumeSummary.statusText
    : resumeSummary
      ? readyToRun
        ? nextStepLabel
        : resumeSummary.readyBecauseText ||
          "Add the remaining input to continue."
      : startApprovalRequired
        ? "Approval is still required before this step can continue."
        : nextStepLabel
  const detailLines = blockedResumeSummary
    ? [
        blockedResumeSummary.latestResultText
          ? `Previous: ${blockedResumeSummary.latestResultText}`
          : null,
        `Step input: ${blockedResumeSummary.attachText}`,
        `Status: ${blockedResumeSummary.reasonText}`,
      ]
    : resumeSummary
      ? [
          resumeSummary.latestResultText
            ? `Previous: ${resumeSummary.latestResultText}`
            : null,
          `Attached: ${resumeSummary.attachText} -> used by this step`,
          `Status: ${readyToRun ? resumeSummary.checksText : resumeSummary.readyBecauseText}`,
        ]
      : [
          `Expects: ${inputLabels.length > 0 ? inputLabels.slice(0, 3).join(" · ") : entry.inputText}`,
          `Produces: ${entry.outputText}`,
          `Next: ${startApprovalRequired ? "Approval before continue." : nextStepLabel}`,
        ]
  return (
    <section data-workflow-resume-header="true" className="ui-fade-slide-in">
      <div className="surface-figure px-4 py-4">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="section-kicker">
              {resumeSummary ? "Saved work" : "Resume"}
              {stageLabel ? ` · ${stageLabel}` : ""}
            </p>
            <h2 className="text-title-lg text-foreground">{displayTitle}</h2>
            <p className="text-body-sm text-muted-foreground">{headline}</p>
          </div>

          <div className="space-y-1.5">
            {detailLines.filter(Boolean).map((line) => (
              <p key={line} className="text-body-sm text-muted-foreground">
                {line}
              </p>
            ))}
          </div>

          {flowRules.length > 0 && (
            <FlowRulesPreview rules={flowRules} surface="flat" />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onPrimaryAction}>
              <Play size={14} />
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function StageStartApprovalDialog({
  open,
  flowName,
  title,
  stageLabel,
  stepDescription,
  flowRules,
  expectedArtifact,
  inputPreview,
  inputLabels,
  notes,
  shortcutLabel,
  approveConsequence,
  rejectConsequence,
  primaryModifierKey,
  onApprove,
  onCancel,
}: {
  open: boolean
  flowName: string
  title: string
  stageLabel?: string | null
  stepDescription?: string | null
  flowRules: FlowRulePreview[]
  expectedArtifact: string
  inputPreview?: string
  inputLabels: string[]
  notes: string[]
  shortcutLabel: string
  approveConsequence: string
  rejectConsequence: string
  primaryModifierKey: "meta" | "ctrl"
  onApprove: () => Promise<void> | void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      if (!matchesPrimaryShortcut(event, { key: "Enter", primaryModifierKey }))
        return
      consumeShortcut(event)
      void Promise.resolve(onApprove())
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [onApprove, open, primaryModifierKey])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
    >
      <CanvasDialogContent size="lg" showCloseButton={false}>
        <CanvasDialogHeader className="space-y-1.5">
          <DialogTitle>{`Approve ${title}`}</DialogTitle>
          <DialogDescription>
            Confirm what will run, which input it will use, and what happens
            next.
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="space-y-3">
          <ExecutionApprovalSummary
            flowName={flowName}
            stepName={title}
            stepKind={stageLabel}
            stepDescription={stepDescription}
            expectedResult={expectedArtifact}
            inputPreview={inputPreview}
            inputLabels={inputLabels}
            approveConsequence={approveConsequence}
            rejectConsequence={rejectConsequence}
            topBadges={
              <>
                <Badge variant="warning" size="compact">
                  Approval
                </Badge>
                <Badge variant="outline" size="compact">
                  {shortcutLabel}
                </Badge>
              </>
            }
          />

          <FlowRulesPreview rules={flowRules} collapsible defaultOpen={false} />

          {notes.length > 0 && (
            <DisclosurePanel summary="Approval notes">
              <div className="space-y-2">
                {notes.map((note, index) => (
                  <p
                    key={`${note}-${index}`}
                    className="text-body-sm text-foreground"
                  >
                    {note}
                  </p>
                ))}
              </div>
            </DisclosurePanel>
          )}
        </CanvasDialogBody>

        <CanvasDialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void Promise.resolve(onApprove())
            }}
          >
            <Play size={14} />
            Approve and continue
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}

export function StageInputSection({
  inputPanelRef,
  showTemplateContext = true,
  showProjectArtifactsPanel,
  artifacts,
  loading,
  error,
  requiredContracts,
  onOpenArtifact,
}: {
  inputPanelRef: RefObject<HTMLDivElement | null>
  showTemplateContext?: boolean
  showProjectArtifactsPanel: boolean
  artifacts: ArtifactRecord[]
  loading: boolean
  error: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
}) {
  return (
    <>
      <div ref={inputPanelRef}>
        <InputPanel
          label="Step input"
          compact
          showTemplateContext={showTemplateContext}
          surface="flat"
        />
      </div>
      {showProjectArtifactsPanel && (
        <ProjectResultsPanel
          artifacts={artifacts}
          loading={loading}
          error={error}
          requiredContracts={requiredContracts}
          onOpenArtifact={onOpenArtifact}
        />
      )}
    </>
  )
}
