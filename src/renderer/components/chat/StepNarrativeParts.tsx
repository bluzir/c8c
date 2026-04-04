import { useState } from "react"
import { cn } from "@/lib/cn"
import { Circle, CheckCircle2, XCircle, ChevronRight } from "lucide-react"
import type {
  StepNarrativeBranch,
  ToolActionEntry,
  ToolDigestEntry,
  RetryInfo,
} from "@/lib/flow-chat-types"
import { formatDigestKindParts } from "@/lib/tool-digest"
import { StepOutputPreview } from "./StepOutputPreview"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ACTION_ICONS: Record<ToolActionEntry["kind"], string> = {
  search: "\uD83D\uDD0D",
  read: "\uD83D\uDCD6",
  write: "\uD83D\uDCDD",
  edit: "\u270F\uFE0F",
  command: "\u25B6",
  browse: "\uD83C\uDF10",
  other: "\u2022",
}

export const MAX_VISIBLE_BRANCHES = 5

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
          className="inline-flex items-center gap-1 rounded bg-surface-2/40 px-1.5 py-0.5 ui-meta-text text-muted-foreground"
        >
          <span aria-hidden="true">{ACTION_ICONS[action.kind]}</span>
          {action.label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToolDigestLine
// ---------------------------------------------------------------------------

const MAX_VISIBLE_QUERIES = 2

interface ToolDigestLineProps {
  digest?: ToolDigestEntry[]
  searchQueries?: string[]
  compact?: boolean // branches: suppress queries
}

export function ToolDigestLine({
  digest,
  searchQueries,
  compact,
}: ToolDigestLineProps) {
  const parts = formatDigestKindParts(digest)
  if (parts.length === 0) return null

  const queries = compact ? undefined : searchQueries
  const visibleQueries = queries?.slice(0, MAX_VISIBLE_QUERIES)
  const extraCount = queries ? queries.length - MAX_VISIBLE_QUERIES : 0

  return (
    <div className="pt-1 space-y-0.5">
      <div className="ui-meta-text text-muted-foreground">
        {parts.map((p, i) => (
          <span key={p.kind}>
            {i > 0 && <span className="mx-1">&middot;</span>}
            <span aria-hidden="true">{ACTION_ICONS[p.kind]} </span>
            {p.label}
          </span>
        ))}
      </div>
      {visibleQueries && visibleQueries.length > 0 && (
        <div className="ui-meta-text text-muted-foreground/70 italic truncate">
          {visibleQueries.map((q, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 not-italic">&middot;</span>}
              &ldquo;{q}&rdquo;
            </span>
          ))}
          {extraCount > 0 && (
            <span className="ml-1 not-italic">+{extraCount} more</span>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RetryBadge
// ---------------------------------------------------------------------------

export function RetryBadge({ info }: { info: RetryInfo }) {
  return (
    <span className="ui-status-badge ui-status-badge-warning">
      Attempt {info.attempt}/{info.maxAttempts}
    </span>
  )
}

// ---------------------------------------------------------------------------
// BranchStatusIcon
// ---------------------------------------------------------------------------

export function BranchStatusIcon({
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
// BranchRow
// ---------------------------------------------------------------------------

export function BranchRow({ branch }: { branch: StepNarrativeBranch }) {
  const [expanded, setExpanded] = useState(false)
  const hasOutput = branch.status === "done" && !!branch.output

  return (
    <div className="py-0.5">
      <div
        className={cn(
          "flex items-start gap-2",
          hasOutput && "cursor-pointer",
        )}
        onClick={hasOutput ? () => setExpanded((v) => !v) : undefined}
      >
        <div className="mt-0.5">
          <BranchStatusIcon status={branch.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
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
              <span className="ui-meta-text text-muted-foreground">
                running...
              </span>
            )}
            {hasOutput && (
              <ChevronRight
                size={12}
                className={cn(
                  "ui-chevron shrink-0 text-muted-foreground ui-motion-fast",
                  expanded && "rotate-90",
                )}
              />
            )}
          </div>
          {branch.summary && branch.status === "done" && !expanded && (
            <span className="ui-meta-text text-muted-foreground truncate block">
              {branch.summary}
            </span>
          )}
          {branch.toolDigest && branch.toolDigest.length > 0 && (
            <ToolDigestLine digest={branch.toolDigest} compact />
          )}
        </div>
      </div>
      {hasOutput && (
        <div className={cn("ui-collapsible ml-5", expanded && "is-open")}>
          <div className="ui-collapsible-inner">
            <StepOutputPreview content={branch.output!} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BranchesList
// ---------------------------------------------------------------------------

export function BranchesList({
  branches,
}: {
  branches: StepNarrativeBranch[]
}) {
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
