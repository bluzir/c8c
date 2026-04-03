import { useState } from "react"
import { cn } from "@/lib/cn"
import { ChevronRight, Circle, CheckCircle2, XCircle } from "lucide-react"
import type {
  StepNarrativeContent,
  StepNarrativeBranch,
  ToolActionEntry,
  RetryInfo,
} from "@/lib/flow-chat-types"
import { StatusDot } from "@/components/output/StatusDot"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepNarrativeItemProps {
  data: StepNarrativeContent
  onRetryFromStep?: (nodeId: string) => void
}

// ---------------------------------------------------------------------------
// Tool action icon mapping
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<ToolActionEntry["kind"], string> = {
  search: "\uD83D\uDD0D",
  read: "\uD83D\uDCD6",
  write: "\uD83D\uDCDD",
  edit: "\u270F\uFE0F",
  command: "\u25B6",
  browse: "\uD83C\uDF10",
  other: "\u2022",
}

// ---------------------------------------------------------------------------
// Max visible branches before "+N more"
// ---------------------------------------------------------------------------

const MAX_VISIBLE_BRANCHES = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapNarrativeStatus(
  status: StepNarrativeContent["status"],
): "pending" | "running" | "done" | "failed" | "blocked" {
  if (status === "skipped") return "pending"
  return status
}

function isInteractive(status: StepNarrativeContent["status"]): boolean {
  return status !== "pending" && status !== "skipped"
}

// ---------------------------------------------------------------------------
// ToolActionChips
// ---------------------------------------------------------------------------

function ToolActionChips({ actions }: { actions: ToolActionEntry[] }) {
  if (actions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {actions.map((action, i) => (
        <span
          key={`${action.kind}-${action.label}-${i}`}
          className="inline-flex items-center gap-1 rounded bg-surface-2/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          <span aria-hidden="true">{ACTION_ICONS[action.kind]}</span>
          {action.label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RetryBadge
// ---------------------------------------------------------------------------

function RetryBadge({ info }: { info: RetryInfo }) {
  return (
    <span className="ui-status-badge ui-status-badge-warning">
      Attempt {info.attempt}/{info.maxAttempts}
    </span>
  )
}

// ---------------------------------------------------------------------------
// BranchRow — simplified branch rendering
// ---------------------------------------------------------------------------

function BranchRow({ branch }: { branch: StepNarrativeBranch }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <BranchStatusIcon status={branch.status} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-body-sm",
          branch.status === "done" && "text-foreground",
          branch.status === "running" && "text-foreground",
          branch.status === "failed" && "text-status-danger",
          (branch.status === "pending" || branch.status === "skipped") &&
            "text-muted-foreground",
          branch.status === "skipped" && "opacity-50",
        )}
      >
        {branch.label}
      </span>
      {branch.status === "running" && (
        <span className="ui-meta-text text-muted-foreground">running...</span>
      )}
      {branch.toolActions && branch.toolActions.length > 0 && (
        <ToolActionChips actions={branch.toolActions} />
      )}
    </div>
  )
}

function BranchStatusIcon({
  status,
}: {
  status: StepNarrativeBranch["status"]
}) {
  switch (status) {
    case "done":
      return (
        <CheckCircle2
          size={12}
          className="shrink-0 text-status-success"
          aria-hidden="true"
        />
      )
    case "running":
      return (
        <span className="ui-status-beacon shrink-0" aria-hidden="true">
          <span className="ui-status-beacon-ring bg-status-info/35" />
          <span className="ui-status-beacon-core bg-status-info" />
        </span>
      )
    case "failed":
      return (
        <XCircle
          size={12}
          className="shrink-0 text-status-danger"
          aria-hidden="true"
        />
      )
    default:
      return (
        <Circle
          size={10}
          className={cn(
            "shrink-0 text-muted-foreground/30",
            status === "skipped" && "opacity-50",
          )}
          aria-hidden="true"
        />
      )
  }
}

// ---------------------------------------------------------------------------
// BranchesList — with cap at MAX_VISIBLE_BRANCHES
// ---------------------------------------------------------------------------

function BranchesList({ branches }: { branches: StepNarrativeBranch[] }) {
  const [showAll, setShowAll] = useState(false)

  if (branches.length === 0) return null

  const visible = showAll
    ? branches
    : branches.slice(0, MAX_VISIBLE_BRANCHES)
  const hiddenCount = branches.length - MAX_VISIBLE_BRANCHES

  return (
    <div className="border-l-2 border-hairline ml-1 pl-3 mt-1">
      {visible.map((branch) => (
        <BranchRow key={branch.nodeId} branch={branch} />
      ))}
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          className="text-body-sm text-muted-foreground ui-pressable pt-0.5"
          onClick={() => setShowAll(true)}
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StepNarrativeItem
// ---------------------------------------------------------------------------

export function StepNarrativeItem({
  data,
  onRetryFromStep,
}: StepNarrativeItemProps) {
  // Manual toggle: null = follow auto-expand logic
  const [manualToggle, setManualToggle] = useState<boolean | null>(null)

  const autoExpanded = data.status === "running" || data.status === "failed"
  const expanded = manualToggle ?? autoExpanded
  const interactive = isInteractive(data.status)
  const hasBranches = Boolean(data.branches && data.branches.length > 0)

  const hasExpandableContent =
    interactive &&
    (data.summary ||
      data.error ||
      (data.toolActions && data.toolActions.length > 0) ||
      hasBranches)

  // Meta parts: duration + cost
  const metaParts: string[] = []
  if (data.duration) metaParts.push(data.duration)
  if (data.costUsd != null && data.costUsd > 0)
    metaParts.push(`$${data.costUsd.toFixed(2)}`)

  return (
    <div className="py-1">
      {/* Header row */}
      <div
        className={cn(
          "flex items-center gap-2",
          hasExpandableContent && "cursor-pointer",
        )}
        role={hasExpandableContent ? "button" : undefined}
        tabIndex={hasExpandableContent ? 0 : undefined}
        aria-expanded={hasExpandableContent ? expanded : undefined}
        onClick={() => {
          if (hasExpandableContent) {
            setManualToggle((prev) => {
              const current = prev ?? autoExpanded
              return !current
            })
          }
        }}
        onKeyDown={(e) => {
          if (
            hasExpandableContent &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault()
            setManualToggle((prev) => {
              const current = prev ?? autoExpanded
              return !current
            })
          }
        }}
      >
        {/* Status dot */}
        <StatusDot status={mapNarrativeStatus(data.status)} />

        {/* Retry badge */}
        {data.retryInfo && <RetryBadge info={data.retryInfo} />}

        {/* Label */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body-sm",
            data.status === "running" && "font-medium text-foreground",
            data.status === "done" && "text-foreground",
            data.status === "failed" && "text-status-danger",
            data.status === "pending" && "text-muted-foreground",
            data.status === "skipped" && "text-muted-foreground/50",
          )}
        >
          {data.label}
        </span>

        {/* Meta: duration, cost — right side */}
        {metaParts.length > 0 && data.status === "done" && (
          <span className="shrink-0 ui-meta-text text-muted-foreground">
            {metaParts.join(" \u00B7 ")}
          </span>
        )}

        {/* Running indicator text */}
        {data.status === "running" && (
          <span className="shrink-0 ui-meta-text text-muted-foreground">
            running...
          </span>
        )}

        {/* Expand chevron — only for interactive states with content */}
        {hasExpandableContent && (
          <ChevronRight
            size={12}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted-foreground/50 ui-chevron ui-motion-fast",
              expanded && "rotate-90",
            )}
          />
        )}
      </div>

      {/* Collapsible body */}
      {hasExpandableContent && (
        <div
          className="ui-collapsible"
          data-open={expanded ? "true" : "false"}
        >
          <div className="ui-collapsible-inner pl-6">
            {/* Error message for failed steps */}
            {data.status === "failed" && data.error && (
              <p className="text-body-sm text-status-danger pt-1">
                {data.error}
              </p>
            )}

            {/* Summary text */}
            {data.summary && (
              <p className="text-body-sm text-foreground-subtle pt-1">
                {data.summary}
              </p>
            )}

            {/* Tool action chips */}
            {data.toolActions && data.toolActions.length > 0 && (
              <ToolActionChips actions={data.toolActions} />
            )}

            {/* Branches */}
            {data.branches && data.branches.length > 0 && (
              <BranchesList branches={data.branches} />
            )}

            {/* Retry from this step link */}
            {data.status === "failed" && onRetryFromStep && (
              <button
                type="button"
                className="ui-pressable text-body-sm text-status-info pt-1"
                onClick={(e) => {
                  e.stopPropagation()
                  onRetryFromStep(data.nodeId)
                }}
              >
                Retry from this step
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
