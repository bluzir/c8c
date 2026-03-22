import { useMemo, useState } from "react"

import type { EvaluationResult } from "@/lib/store"
import type { LogEntry, NodeState, WorkflowNode } from "@shared/types"
import { Bug, ChevronRight } from "lucide-react"

import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { cn } from "@/lib/cn"
import { formatCost, formatDuration, formatTimestamp, formatTokens } from "@/components/output/outputFormatters"

const ERROR_KIND_LABELS: Record<string, string> = {
  tool: "Tool error",
  model: "Model error",
  timeout: "Timeout",
  policy: "Flow rules",
  unknown: "Error",
}

interface ToolCallSummary {
  tool: string
  inputPreview: string
  status: "success" | "error" | "pending"
}

function buildToolCallSummaries(log: LogEntry[]): ToolCallSummary[] {
  const summaries: ToolCallSummary[] = []
  const pendingTools: Map<string, number> = new Map()

  for (const entry of log) {
    if (entry.type === "tool_use") {
      const inputStr = JSON.stringify(entry.input)
      summaries.push({
        tool: entry.tool,
        inputPreview: inputStr.length > 100 ? inputStr.slice(0, 100) + "..." : inputStr,
        status: "pending",
      })
      pendingTools.set(entry.tool, summaries.length - 1)
    }
    if (entry.type === "tool_result") {
      const pendingIdx = pendingTools.get(entry.tool)
      if (pendingIdx !== undefined) {
        summaries[pendingIdx].status = entry.status
        pendingTools.delete(entry.tool)
      }
    }
  }
  return summaries
}

function buildToolCallCountLabel(summaries: ToolCallSummary[]): string {
  if (summaries.length === 0) return ""
  const counts: Record<string, number> = {}
  for (const summary of summaries) {
    const name = summary.tool.startsWith("mcp__")
      ? summary.tool.replace(/^mcp__/, "").replace(/__/, "/")
      : summary.tool
    counts[name] = (counts[name] || 0) + 1
  }
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${count} ${name}`)
  return `${summaries.length} tool call${summaries.length !== 1 ? "s" : ""} (${parts.join(", ")})`
}

export function DebugDetailsPanel({
  state,
  rawLog,
  evalResults,
  workflowNode,
}: {
  state: NodeState
  rawLog: LogEntry[]
  evalResults: EvaluationResult[]
  workflowNode?: WorkflowNode | null
}) {
  const [rawLogOpen, setRawLogOpen] = useState(false)

  const toolCallSummaries = useMemo(() => buildToolCallSummaries(rawLog), [rawLog])
  const toolCallCountLabel = useMemo(() => buildToolCallCountLabel(toolCallSummaries), [toolCallSummaries])

  const durationMs = state.startedAt && state.completedAt
    ? state.completedAt - state.startedAt
    : undefined

  const nodeConfig = workflowNode?.config
  const nodeType = workflowNode?.type
  const maxTurns = nodeConfig && "maxTurns" in nodeConfig ? (nodeConfig as { maxTurns?: number }).maxTurns : undefined
  const evalThreshold = nodeType === "evaluator" && nodeConfig && "threshold" in nodeConfig
    ? (nodeConfig as { threshold: number }).threshold : undefined
  const evalMaxRetries = nodeType === "evaluator" && nodeConfig && "maxRetries" in nodeConfig
    ? (nodeConfig as { maxRetries: number }).maxRetries : undefined
  const evalRetryFrom = nodeType === "evaluator" && nodeConfig && "retryFrom" in nodeConfig
    ? (nodeConfig as { retryFrom?: string }).retryFrom : undefined

  const hasExecutionSummary = Boolean(durationMs || state.metrics || state.meta?.model_id || maxTurns || state.status === "failed")
  const hasToolCalls = toolCallSummaries.length > 0
  const hasEvalDetails = evalResults.length > 0 && nodeType === "evaluator"
  const hasRawLog = rawLog.length > 0

  if (!hasExecutionSummary && !hasToolCalls && !hasEvalDetails && !hasRawLog) return null

  const rawLogText = useMemo(() => {
    return rawLog.map((entry) => {
      const timestamp = formatTimestamp(entry.timestamp)
      switch (entry.type) {
        case "thinking":
          return `[${timestamp}] THINKING: ${entry.content}`
        case "text":
          return `[${timestamp}] TEXT: ${entry.content}`
        case "tool_use":
          return `[${timestamp}] TOOL_USE: ${entry.tool}\n  input: ${JSON.stringify(entry.input, null, 2)}`
        case "tool_result":
          return `[${timestamp}] TOOL_RESULT: ${entry.tool} (${entry.status})\n  output: ${entry.output}`
        case "error":
          return `[${timestamp}] ERROR: ${entry.content}`
        case "diff":
          return `[${timestamp}] DIFF: ${entry.files.join(", ")}\n${entry.content}`
      }
    }).join("\n\n")
  }, [rawLog])

  return (
    <DisclosurePanel
      summary={
        <span className="flex items-center gap-1.5">
          <Bug size={12} className="text-muted-foreground/60" />
          Debug details
        </span>
      }
      surface="flat"
      className="mt-3"
      summaryClassName="px-1 py-2"
      contentClassName="space-y-3 px-1 py-3"
    >
      {hasExecutionSummary && (
        <div className="space-y-1">
          <div className="ui-meta-label text-muted-foreground">Execution summary</div>
          <div className="space-y-1 border-l-2 border-hairline/70 pl-3">
            {durationMs != null && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono text-foreground">{formatDuration(durationMs)}</span>
              </div>
            )}
            {state.metrics && (
              <>
                <div className="flex justify-between ui-meta-text">
                  <span className="text-muted-foreground">Tokens in</span>
                  <span className="font-mono text-foreground">{formatTokens(state.metrics.tokens_in)}</span>
                </div>
                <div className="flex justify-between ui-meta-text">
                  <span className="text-muted-foreground">Tokens out</span>
                  <span className="font-mono text-foreground">{formatTokens(state.metrics.tokens_out)}</span>
                </div>
                {state.metrics.cost_usd > 0 && (
                  <div className="flex justify-between ui-meta-text">
                    <span className="text-muted-foreground">Cost</span>
                    <span className="font-mono text-foreground">{formatCost(state.metrics.cost_usd)}</span>
                  </div>
                )}
              </>
            )}
            {state.meta?.model_id && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Model</span>
                <span className="font-mono text-foreground">{state.meta.model_id}</span>
              </div>
            )}
            {maxTurns != null && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Max turns</span>
                <span className="font-mono text-foreground">{maxTurns}</span>
              </div>
            )}
            <div className="flex justify-between ui-meta-text">
              <span className="text-muted-foreground">Status</span>
              <span className={cn(
                "font-mono",
                state.status === "completed" && "text-status-success",
                state.status === "failed" && "text-status-danger",
                state.status !== "completed" && state.status !== "failed" && "text-foreground",
              )}>
                {state.status}
                {state.errorKind ? ` (${ERROR_KIND_LABELS[state.errorKind] || state.errorKind})` : ""}
              </span>
            </div>
            {state.startedAt && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Started</span>
                <span className="font-mono text-foreground">{formatTimestamp(state.startedAt)}</span>
              </div>
            )}
            {state.completedAt && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Completed</span>
                <span className="font-mono text-foreground">{formatTimestamp(state.completedAt)}</span>
              </div>
            )}
            {state.attempts > 1 && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Attempts</span>
                <span className="font-mono text-foreground">{state.attempts}</span>
              </div>
            )}
            {state.policyApplied && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Flow rules applied</span>
                <span className="font-mono text-foreground">{state.policyApplied}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasToolCalls && (
        <div className="space-y-1">
          <div className="ui-meta-label text-muted-foreground">Tool calls</div>
          <div className="ui-meta-text text-muted-foreground mb-1">{toolCallCountLabel}</div>
          <div className="space-y-1 border-l-2 border-hairline/70 pl-3 max-h-48 overflow-y-auto ui-scroll-region">
            {toolCallSummaries.map((toolCall, index) => {
              const displayName = toolCall.tool.startsWith("mcp__")
                ? toolCall.tool.replace(/^mcp__/, "").replace(/__/, " / ")
                : toolCall.tool
              return (
                <details key={`${toolCall.tool}-${index}`} className="group">
                  <summary className="cursor-pointer list-none flex items-center gap-2 py-0.5 ui-meta-text hover:text-foreground ui-pressable">
                    <span className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                      toolCall.status === "success" && "bg-status-success",
                      toolCall.status === "error" && "bg-status-danger",
                      toolCall.status === "pending" && "bg-muted-foreground",
                    )} />
                    <span className="font-mono text-foreground truncate">{displayName}</span>
                    <span className={cn(
                      "ml-auto shrink-0",
                      toolCall.status === "error" ? "text-status-danger" : "text-muted-foreground",
                    )}>
                      {toolCall.status}
                    </span>
                  </summary>
                  <pre className="ui-meta-text text-muted-foreground whitespace-pre-wrap font-mono mt-0.5 mb-1 pl-4 max-h-32 overflow-y-auto ui-scroll-region">
                    {toolCall.inputPreview}
                  </pre>
                </details>
              )
            })}
          </div>
        </div>
      )}

      {hasEvalDetails && (
        <div className="space-y-1">
          <div className="ui-meta-label text-muted-foreground">Check details</div>
          <div className="space-y-1 border-l-2 border-hairline/70 pl-3">
            {evalThreshold != null && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Threshold</span>
                <span className="font-mono text-foreground">{evalThreshold}/10</span>
              </div>
            )}
            {evalMaxRetries != null && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Max retries</span>
                <span className="font-mono text-foreground">{evalMaxRetries}</span>
              </div>
            )}
            {evalRetryFrom && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Retry from</span>
                <span className="font-mono text-foreground">{evalRetryFrom}</span>
              </div>
            )}
            {evalResults.length > 0 && (
              <div className="flex justify-between ui-meta-text">
                <span className="text-muted-foreground">Attempts used</span>
                <span className="font-mono text-foreground">
                  {evalResults.length}{evalMaxRetries != null ? ` / ${evalMaxRetries + 1}` : ""}
                </span>
              </div>
            )}
            {evalResults.length > 0 && (
              <div className="border-t border-hairline mt-1.5 pt-1.5 space-y-1">
                {evalResults.map((evalResult) => (
                  <div key={evalResult.attempt} className="space-y-1">
                    <div className={cn(
                      "ui-meta-text font-mono",
                      evalResult.passed ? "text-status-success" : "text-status-warning",
                    )}>
                      Attempt {evalResult.attempt}: {evalResult.score}/10 {evalResult.passed ? "PASS" : "FAIL"}
                    </div>
                    {evalResult.criteria && evalResult.criteria.length > 0 && (
                      <div className="pl-2 space-y-0.5">
                        {evalResult.criteria.map((criterion) => (
                          <div key={criterion.id} className="flex items-center gap-2 ui-meta-text">
                            <span className="w-20 truncate text-muted-foreground">{criterion.id}</span>
                            <span className={cn(
                              "font-mono",
                              criterion.score >= 7 ? "text-status-success" : criterion.score >= 4 ? "text-status-warning" : "text-status-danger",
                            )}>
                              {criterion.score}/10
                            </span>
                            {criterion.weight != null && criterion.weight !== 1 && (
                              <span className="text-muted-foreground/60">w:{criterion.weight}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {hasRawLog && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setRawLogOpen(!rawLogOpen)}
            className="flex items-center gap-1.5 ui-meta-label text-muted-foreground hover:text-foreground ui-pressable"
          >
            <ChevronRight
              size={12}
              className={cn("ui-chevron", rawLogOpen && "rotate-90")}
            />
            Raw log ({rawLog.length} entries)
          </button>
          {rawLogOpen && (
            <pre className="rounded-md border border-hairline/70 bg-surface-2/35 px-3 py-2 ui-meta-text text-muted-foreground whitespace-pre-wrap font-mono max-h-80 overflow-y-auto ui-scroll-region">
              {rawLogText}
            </pre>
          )}
        </div>
      )}
    </DisclosurePanel>
  )
}
