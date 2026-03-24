import { ArrowRight } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { Button } from "@/components/ui/button"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { ExecutionLoopCard } from "@/components/ui/execution-loop-card"
import { FlowRulesPreview } from "@/components/ui/flow-rules-preview"
import { cn } from "@/lib/cn"
import { deriveExecutionLoopFlowRules } from "@/lib/flow-rules"
import { DEFAULT_MARKDOWN_PROPS } from "@/lib/markdown"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"
import type { VerdictData } from "@/components/output/useVerdictData"

const MARKDOWN_PROSE_CLASS = "prose-c8c"
const RESULT_MARKDOWN_PROPS = DEFAULT_MARKDOWN_PROPS as any

function stripLeadingMarkdownHeading(value: string) {
  return value.replace(/^\s*# .*(?:\r?\n)+(?:\r?\n)*/u, "")
}

export interface FinalResultSectionProps {
  // Run state
  runStatus: string // "idle" | "running" | "done" | "error" | "cancelled"
  runOutcome?: string

  // Verdict data (from useVerdictData hook)
  verdictData: VerdictData | null

  // Result content
  resultContent: string | null // markdown
  resultHeadline?: string

  // Continuation
  showContinuation: boolean
  nextStageLabel?: string | null
  nextStagePending?: boolean
  onRunNextStage?: (() => void) | null
  onUseInNewFlow?: (() => void) | null
  onStartNewRun?: (() => void) | null

  // Artifacts
  artifactPersistenceStatus?: string
  artifactPersistenceError?: string | null

  // Loop info
  executionLoopSummary?: ExecutionLoopSummary | null

  // Actions
  onCopyResult?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function FinalResultSection({
  runStatus,
  verdictData,
  resultContent,
  showContinuation,
  nextStageLabel,
  nextStagePending,
  onRunNextStage,
  onUseInNewFlow,
  onStartNewRun,
  artifactPersistenceStatus,
  artifactPersistenceError,
  executionLoopSummary,
  onContextMenu,
}: FinalResultSectionProps) {
  // Core rule: render NOTHING unless the run is done
  if (runStatus !== "done" || !verdictData) {
    return null
  }

  const verdictToneClass =
    verdictData.tone === "danger"
      ? "surface-danger-soft"
      : verdictData.tone === "warning"
        ? "surface-warning-soft"
        : "bg-surface-1"

  const loopFlowRules = deriveExecutionLoopFlowRules(executionLoopSummary)

  const renderedResultContent = resultContent
    ? stripLeadingMarkdownHeading(resultContent)
    : null

  // Build action items
  const actionItems: React.ReactNode[] = []

  if (showContinuation && nextStageLabel && onRunNextStage) {
    actionItems.push(
      <Button
        key="continue"
        type="button"
        size="sm"
        onClick={onRunNextStage}
        disabled={artifactPersistenceStatus === "saving" || nextStagePending}
      >
        <ArrowRight size={12} />
        {nextStagePending ? "Opening..." : `Continue to ${nextStageLabel}`}
      </Button>,
    )

    if (onUseInNewFlow) {
      actionItems.push(
        <Button
          key="use-in-new-flow"
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
          onClick={onUseInNewFlow}
        >
          Start next flow
        </Button>,
      )
    }

    if (onStartNewRun) {
      actionItems.push(
        <button
          key="run-again"
          type="button"
          className="ui-meta-text text-muted-foreground hover:text-foreground ui-motion-fast"
          onClick={onStartNewRun}
        >
          Run again
        </button>,
      )
    }
  }

  // Artifact persistence error
  const artifactPersistenceNotice =
    showContinuation && artifactPersistenceError ? (
      <p className="ui-section-divider text-body-sm text-status-danger">
        {artifactPersistenceError}
      </p>
    ) : null

  // Execution loop disclosure
  const executionLoopPanel = executionLoopSummary ? (
    <DisclosurePanel
      summary={
        <span className="flex items-center gap-2">
          <span>{executionLoopSummary.loopLabel}</span>
          <span className="text-body-sm font-normal text-foreground">
            {executionLoopSummary.title}
          </span>
        </span>
      }
      surface="plain"
      className="ui-section-divider"
      contentClassName="space-y-3"
      defaultOpen={false}
      unmountWhenClosed
    >
      <ExecutionLoopCard
        summary={executionLoopSummary}
        compact
        surface="flat"
        detailSummary="Technical details"
        showTechnicalBadges={false}
      />
      <FlowRulesPreview
        rules={loopFlowRules}
        surface="flat"
        collapsible
        defaultOpen={false}
      />
    </DisclosurePanel>
  ) : null

  return (
    <div className="space-y-2" onContextMenu={onContextMenu}>
      {/* Verdict card */}
      <section className={cn("surface-figure px-4 py-4", verdictToneClass)}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <h2 className="text-title-lg text-foreground">
              {verdictData.headline}
            </h2>
            {verdictData.provenanceLabel && (
              <p className="ui-meta-text text-muted-foreground">
                {verdictData.provenanceLabel}
              </p>
            )}
          </div>

          {/* Evidence strip */}
          {verdictData.evidenceItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ui-section-divider text-body-sm text-muted-foreground">
              {verdictData.evidenceItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {actionItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {actionItems}
            </div>
          )}

          {/* Execution loop disclosure */}
          {executionLoopPanel}

          {/* Artifact persistence error */}
          {artifactPersistenceNotice}
        </div>
      </section>

      {/* Result content */}
      {renderedResultContent && (
        <div className="px-4 py-4">
          <div className={MARKDOWN_PROSE_CLASS}>
            <ReactMarkdown
              {...RESULT_MARKDOWN_PROPS}
              children={renderedResultContent}
            />
          </div>
        </div>
      )}
    </div>
  )
}
