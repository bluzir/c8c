import {
  Eye,
  Pencil,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  X,
} from "lucide-react"

import { cn } from "@/lib/cn"
import type {
  WorkflowNode,
  NodeState,
  InputNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  ApprovalNodeConfig,
  HumanNodeConfig,
} from "@shared/types"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NODE_ICON_TONES } from "@/lib/node-ui-config"
import type { RuntimeBranchSummary } from "@/components/node-card/runtime-card-copy"
import {
  InputNodeEditor,
  OutputNodeEditor,
  SkillNodeEditor,
  EvaluatorNodeEditor,
  SplitterNodeEditor,
  MergerNodeEditor,
  ApprovalNodeEditor,
  HumanNodeEditor,
} from "@/components/NodeCardEditors"
import { NodeCardInlineInput } from "@/components/node-card/NodeCardInlineInput"
import { RuntimeNodeCard } from "@/components/node-card/RuntimeNodeCard"
import { useNodeCardState } from "@/components/node-card/useNodeCardState"

export type {
  RuntimeBranchSummary,
  RuntimeBranchSummaryPreview,
} from "@/components/node-card/runtime-card-copy"

interface NodeCardProps {
  node: WorkflowNode
  index: number
  total: number
  state?: NodeState
  isActive: boolean
  isSelected?: boolean
  compact?: boolean
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  moveUpDisabledReason?: string | null
  moveDownDisabledReason?: string | null
  onConfigChange: (
    config:
      | InputNodeConfig
      | OutputNodeConfig
      | SkillNodeConfig
      | EvaluatorNodeConfig
      | SplitterNodeConfig
      | MergerNodeConfig
      | ApprovalNodeConfig
      | HumanNodeConfig,
  ) => void
  onSelect: () => void
  resolveNodeLabel?: (nodeId: string) => string
  runtimeMode?: boolean
  runtimePresentationMode?: "outline" | "monitor"
  runtimeFocusKind?: "current" | "next" | null
  runtimeBranchSummary?: RuntimeBranchSummary | null
}

export function NodeCard({
  node,
  index,
  total,
  state,
  isActive,
  isSelected = false,
  compact = false,
  onRemove,
  onMoveUp,
  onMoveDown,
  moveUpDisabledReason: moveUpDisabledReasonProp = null,
  moveDownDisabledReason: moveDownDisabledReasonProp = null,
  onConfigChange,
  onSelect,
  resolveNodeLabel,
  runtimeMode = false,
  runtimePresentationMode = "outline",
  runtimeFocusKind = null,
  runtimeBranchSummary = null,
}: NodeCardProps) {
  const {
    expanded,
    setExpanded,
    nodeValidationErrors,
    hasValidationErrors,
    remainingValidationErrors,
    Icon,
    isInput,
    isOutput,
    isSkill,
    isEvaluator,
    isSplitter,
    isMerger,
    isApproval,
    isHuman,
    isExpandable,
    isTerminal,
    inputConfig,
    outputConfig,
    skillConfig,
    evalConfig,
    splitterConfig,
    mergerConfig,
    approvalConfig,
    humanConfig,
    title,
    retryLabel,
    statusLabel,
    statusClass,
    showStatusBadge,
    showInlineInput,
    hasExpandedPanel,
    moveUpDisabledReason,
    moveDownDisabledReason,
  } = useNodeCardState({
    node,
    index,
    total,
    state,
    compact,
    runtimeMode,
    onMoveUp,
    onMoveDown,
    moveUpDisabledReasonProp,
    moveDownDisabledReasonProp,
    resolveNodeLabel,
  })
  const previewTextClass = "text-muted-foreground truncate ui-meta-text"

  if (runtimeMode) {
    return (
      <RuntimeNodeCard
        node={node}
        index={index}
        state={state}
        isActive={isActive}
        isSelected={isSelected}
        onSelect={onSelect}
        runtimeFocusKind={runtimeFocusKind}
        presentationMode={runtimePresentationMode}
        runtimeBranchSummary={runtimeBranchSummary}
        retryLabel={retryLabel}
      />
    )
  }

  return (
    <div
      className={cn(
        "ui-fade-slide-in overflow-hidden rounded-lg border border-hairline transition-[border-color] ui-motion-fast",
        isActive && "ring-2 ring-primary/20",
        hasValidationErrors && !isActive && "ring-2 ring-status-danger/40",
        statusClass,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "group flex items-start",
          compact ? "gap-2 px-2.5 py-1.5" : "gap-3 px-3 py-2.5",
        )}
      >
        <Button
          type="button"
          onClick={() => {
            onSelect()
            if (isExpandable) setExpanded((prev) => !prev)
          }}
          variant="ghost"
          size="auto"
          className={cn(
            "!h-auto min-w-0 flex-1 justify-start items-start rounded-md border-transparent p-0 text-left whitespace-normal hover:bg-transparent hover:border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            compact ? "gap-1.5" : "gap-2",
          )}
          aria-label={`Select step ${title}`}
        >
          <div
            className={cn(
              "shrink-0 rounded-md border flex items-center justify-center ui-elevation-inset",
              compact ? "h-6 w-6 mt-0" : "h-control-sm w-control-sm mt-0.5",
              NODE_ICON_TONES[node.type] ||
                "border-hairline bg-surface-1 text-muted-foreground",
            )}
          >
            <Icon
              size={compact ? 13 : 14}
              className="shrink-0"
              aria-hidden="true"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "min-w-0",
                compact ? "space-y-0.5 pt-0" : "space-y-1 pt-0.5",
              )}
            >
              <span
                className={cn(
                  "block font-medium truncate",
                  compact ? "text-body-sm leading-5" : "text-body-md",
                )}
              >
                {title}
              </span>
              {isSkill && !expanded && skillConfig?.prompt && (
                <p className={previewTextClass}>
                  {skillConfig.prompt.slice(0, 80)}
                  {skillConfig.prompt.length > 80 ? "..." : ""}
                </p>
              )}
              {isEvaluator && !expanded && evalConfig && (
                <p className={previewTextClass}>
                  Threshold: {evalConfig.threshold}/10 · Max{" "}
                  {evalConfig.maxRetries} retries
                  {retryLabel ? ` · Retry: ${retryLabel}` : ""}
                </p>
              )}
              {isSplitter && !expanded && splitterConfig && (
                <p className={previewTextClass}>
                  Max {splitterConfig.maxBranches || 8} branches
                </p>
              )}
              {isMerger && !expanded && mergerConfig && (
                <p className={previewTextClass}>
                  Strategy: {mergerConfig.strategy}
                </p>
              )}
              {isInput && !expanded && inputConfig && !compact && (
                <p className={previewTextClass}>
                  {inputConfig.required === false ? "Optional" : "Required"} ·{" "}
                  {inputConfig.inputType || "auto"} input
                </p>
              )}
              {isOutput && !expanded && outputConfig && (
                <p className={previewTextClass}>
                  Format: {outputConfig.format || "markdown"}
                </p>
              )}
              {isApproval && !expanded && approvalConfig && (
                <p className={previewTextClass}>
                  {approvalConfig.message || "Manual approval"}
                </p>
              )}
              {isHuman && !expanded && humanConfig && (
                <p className={previewTextClass}>
                  {humanConfig.staticRequest?.title || "Human input check"}
                </p>
              )}
              {isSkill && skillConfig?.permissionMode && (
                <div
                  className={cn("ui-badge-row", compact ? "pt-0" : "pt-0.5")}
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1.5 py-0 ui-meta-text gap-1",
                      skillConfig.permissionMode === "plan"
                        ? "text-muted-foreground"
                        : "text-status-warning border-status-warning/30",
                    )}
                  >
                    {skillConfig.permissionMode === "plan" ? (
                      <Eye size={10} aria-hidden="true" />
                    ) : (
                      <Pencil size={10} aria-hidden="true" />
                    )}
                    {skillConfig.permissionMode === "plan" ? "Plan" : "Edit"}
                  </Badge>
                </div>
              )}
              {showStatusBadge && (
                <div
                  className={cn("ui-badge-row", compact ? "pt-0" : "pt-0.5")}
                >
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 ui-meta-text text-muted-foreground"
                  >
                    {statusLabel}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </Button>

        {/* Move/remove buttons — only for non-terminal nodes */}
        {!runtimeMode && !isTerminal && (
          <div
            className={cn(
              "ui-reveal-trailing-soft flex items-center gap-1",
              compact ? "pt-0" : "pt-0.5",
            )}
            data-visible={isSelected ? "true" : undefined}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    aria-label="Move step up"
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveUp?.()
                    }}
                    disabled={Boolean(moveUpDisabledReason)}
                    variant="ghost"
                    size="icon"
                    title={moveUpDisabledReason || "Move step up (Alt+Up)"}
                    className={cn(
                      "ui-pressable rounded-md text-muted-foreground hover:bg-surface-3 disabled:text-muted-foreground/70",
                      compact ? "h-6 w-6" : "h-control-sm w-control-sm",
                    )}
                  >
                    <ArrowUp size={12} aria-hidden="true" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {moveUpDisabledReason || "Move up (Alt+Up)"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    aria-label="Move step down"
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveDown?.()
                    }}
                    disabled={Boolean(moveDownDisabledReason)}
                    variant="ghost"
                    size="icon"
                    title={
                      moveDownDisabledReason || "Move step down (Alt+Down)"
                    }
                    className={cn(
                      "ui-pressable rounded-md text-muted-foreground hover:bg-surface-3 disabled:text-muted-foreground/70",
                      compact ? "h-6 w-6" : "h-control-sm w-control-sm",
                    )}
                  >
                    <ArrowDown size={12} aria-hidden="true" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {moveDownDisabledReason || "Move down (Alt+Down)"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    aria-label="Remove step"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove()
                    }}
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "ui-pressable rounded-md text-muted-foreground hover:bg-status-danger/20 hover:text-status-danger",
                      compact ? "h-6 w-6" : "h-control-sm w-control-sm",
                    )}
                    title="Remove step (Delete)"
                  >
                    <X size={12} aria-hidden="true" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Remove step (Delete)</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Expand/collapse — for skill and evaluator nodes */}
        {!runtimeMode && isExpandable && (
          <div className="flex items-center gap-1">
            {hasValidationErrors && !expanded ? (
              <span
                className={cn(
                  "inline-flex items-center justify-center text-status-danger",
                  compact ? "h-6 w-6" : "h-control-sm w-control-sm",
                )}
                aria-label="Step has validation errors"
              >
                <AlertCircle size={14} aria-hidden="true" />
              </span>
            ) : null}
            <Button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              variant="ghost"
              size="icon"
              className={cn(
                "ui-pressable rounded-md text-muted-foreground hover:bg-surface-3",
                compact ? "h-6 w-6 mt-0" : "h-control-sm w-control-sm mt-0.5",
              )}
              aria-label={
                expanded ? "Collapse node settings" : "Expand node settings"
              }
              aria-expanded={expanded}
            >
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={cn(
                  "transition-transform ui-motion-fast",
                  expanded && "rotate-180",
                )}
              />
            </Button>
          </div>
        )}
      </div>

      {showInlineInput && inputConfig && (
        <NodeCardInlineInput nodeId={node.id} inputConfig={inputConfig} />
      )}

      {/* Screen reader status announcement */}
      {(state?.status === "completed" || state?.status === "failed") && (
        <span className="sr-only" aria-live="polite">
          {title} {state.status === "completed" ? "completed" : "failed"}
        </span>
      )}

      {/* Validation errors */}
      <div
        data-open={
          !runtimeMode && remainingValidationErrors.length > 0
            ? "true"
            : "false"
        }
        className="ui-collapsible"
        aria-live="polite"
      >
        <div className="ui-collapsible-inner">
          <div className="px-3 pb-2 pt-1 border-t border-status-danger/20 bg-status-danger/10 space-y-1">
            {remainingValidationErrors.map((err) => (
              <p
                key={`${err.field}-${err.severity}`}
                className="ui-meta-text text-status-danger"
              >
                {err.message}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded node-type editors */}
      <div
        data-open={
          !runtimeMode && expanded && hasExpandedPanel ? "true" : "false"
        }
        className="ui-collapsible"
      >
        <div className="ui-collapsible-inner">
          {isInput && inputConfig && (
            <InputNodeEditor
              nodeId={node.id}
              config={inputConfig}
              onConfigChange={onConfigChange}
            />
          )}
          {isOutput && outputConfig && (
            <OutputNodeEditor
              nodeId={node.id}
              config={outputConfig}
              onConfigChange={onConfigChange}
            />
          )}
          {isSkill && skillConfig && (
            <SkillNodeEditor
              nodeId={node.id}
              config={skillConfig}
              onConfigChange={onConfigChange}
              validationErrors={nodeValidationErrors}
            />
          )}
          {isEvaluator && evalConfig && (
            <EvaluatorNodeEditor
              nodeId={node.id}
              config={evalConfig}
              onConfigChange={onConfigChange}
              validationErrors={nodeValidationErrors}
            />
          )}
          {isSplitter && splitterConfig && (
            <SplitterNodeEditor
              nodeId={node.id}
              config={splitterConfig}
              onConfigChange={onConfigChange}
              validationErrors={nodeValidationErrors}
            />
          )}
          {isMerger && mergerConfig && (
            <MergerNodeEditor
              nodeId={node.id}
              config={mergerConfig}
              onConfigChange={onConfigChange}
              validationErrors={nodeValidationErrors}
            />
          )}
          {isApproval && approvalConfig && (
            <ApprovalNodeEditor
              nodeId={node.id}
              config={approvalConfig}
              onConfigChange={onConfigChange}
            />
          )}
          {isHuman && humanConfig && (
            <HumanNodeEditor
              nodeId={node.id}
              config={humanConfig}
              onConfigChange={onConfigChange}
            />
          )}
        </div>
      </div>
    </div>
  )
}
