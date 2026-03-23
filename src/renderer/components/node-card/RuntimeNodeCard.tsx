import { useEffect, useState } from "react"
import { Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { NODE_ICONS, NODE_ICON_TONES } from "@/lib/node-ui-config"
import {
  getRuntimeRoleMonogram,
  getRuntimeStagePresentation,
} from "@/lib/runtime-flow-labels"
import type { NodeState, WorkflowNode } from "@shared/types"

import {
  buildRuntimeCardCopy,
  getPreviewStatusLabel,
  getRuntimeProgress,
  getRuntimeStatusDotStyle,
  getRuntimeStatusLabel,
  type RuntimeBranchSummary,
} from "./runtime-card-copy"

interface RuntimeNodeCardProps {
  node: WorkflowNode
  index: number
  state?: NodeState
  isActive: boolean
  isSelected: boolean
  onSelect: () => void
  runtimeFocusKind: "current" | "next" | null
  presentationMode: "outline" | "monitor"
  runtimeBranchSummary?: RuntimeBranchSummary | null
  retryLabel: string | null
}

export function RuntimeNodeCard({
  node,
  index,
  state,
  isActive,
  isSelected,
  onSelect,
  runtimeFocusKind,
  presentationMode,
  runtimeBranchSummary = null,
  retryLabel,
}: RuntimeNodeCardProps) {
  const [, setLiveTick] = useState(0)
  const Icon = NODE_ICONS[node.type] || Zap
  const runtimeStatus = state?.status || "pending"
  const runtimePresentation = getRuntimeStagePresentation(node, {
    fallbackId: node.id,
    output: state?.output,
  })
  const runtimeCardCopy = buildRuntimeCardCopy({
    node,
    state,
    retryLabel,
    runtimeFocusKind,
    runtimeBranchSummary,
  })
  const runtimeProgress = getRuntimeProgress(runtimeStatus)
  const runtimeStatusLabel = getRuntimeStatusLabel(runtimeStatus)
  const runtimeStatusDotStyle = getRuntimeStatusDotStyle(runtimeStatus)
  const runtimeSurfaceClass =
    runtimeFocusKind === "current"
      ? runtimeStatus === "running"
        ? "border-status-info/30 bg-status-info/4"
        : runtimeStatus === "waiting_approval" ||
            runtimeStatus === "waiting_human"
          ? "border-status-warning/30 bg-status-warning/5"
          : runtimeStatus === "failed"
            ? "border-status-danger/30 bg-status-danger/5"
            : "border-primary/20 bg-primary/4"
      : runtimeFocusKind === "next"
        ? "border-border bg-surface-1"
        : runtimeStatus === "running"
          ? "border-border bg-status-info/3"
          : runtimeStatus === "waiting_approval" ||
              runtimeStatus === "waiting_human"
            ? "border-border bg-status-warning/3"
            : runtimeStatus === "failed"
              ? "border-border bg-status-danger/3"
              : "border-border bg-surface-1"
  const runtimeFocusLabel =
    runtimeFocusKind === "current"
      ? runtimeStatusLabel
      : runtimeFocusKind === "next"
        ? "Next"
        : null
  const runtimeSelectionLabel =
    isSelected && runtimeFocusKind === null ? "Inspecting" : null
  const runtimeAccentBarClass =
    runtimeFocusKind === "current"
      ? runtimeStatus === "running"
        ? "bg-status-info/80"
        : runtimeStatus === "waiting_approval" ||
            runtimeStatus === "waiting_human"
          ? "bg-status-warning/85"
          : runtimeStatus === "failed"
            ? "bg-status-danger/85"
            : "bg-primary/60"
      : runtimeStatus === "failed"
        ? "bg-status-danger/45"
        : null
  const primaryChips = Array.from(
    new Set([
      ...(runtimeCardCopy.metricChips.length > 0
        ? [runtimePresentation.artifactRoleLabel]
        : []),
      ...runtimeCardCopy.metricChips,
    ]),
  ).slice(0, 4)
  const showFooter =
    Boolean(runtimeCardCopy.detail) ||
    (runtimeStatus !== "pending" && runtimeStatus !== "queued")
  const footerLabel = showFooter
    ? runtimeCardCopy.detail ||
      `${runtimePresentation.outcomeLabel}: ${runtimePresentation.artifactLabel}`
    : null

  useEffect(() => {
    if (
      runtimeStatus !== "running" &&
      runtimeStatus !== "waiting_approval" &&
      runtimeStatus !== "waiting_human"
    ) {
      return
    }
    const intervalId = window.setInterval(() => {
      setLiveTick((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [runtimeStatus])

  if (presentationMode === "monitor") {
    const inlineBits =
      runtimeStatus === "running"
        ? [runtimeStatusLabel]
        : runtimeStatus === "waiting_approval" ||
            runtimeStatus === "waiting_human" ||
            runtimeStatus === "failed"
          ? [runtimeStatusLabel]
          : runtimeFocusKind === "next"
            ? ["Next"]
            : []

    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ui-transition-colors ui-motion-fast",
          runtimeStatus === "running"
            ? "bg-status-info/8 text-foreground"
            : runtimeStatus === "waiting_approval" ||
                runtimeStatus === "waiting_human"
              ? "bg-status-warning/8 text-foreground"
              : runtimeStatus === "failed"
                ? "bg-status-danger/8 text-foreground"
                : isSelected
                  ? "bg-surface-2/65 text-foreground"
                  : "text-foreground hover:bg-surface-2/45",
        )}
        aria-label={`Focus step ${runtimePresentation.title}`}
      >
        {runtimeStatusDotStyle.ring ? (
          <span className="ui-status-beacon shrink-0" aria-hidden="true">
            <span
              className={cn(
                "ui-status-beacon-ring",
                runtimeStatusDotStyle.ring,
              )}
            />
            <span
              className={cn(
                "ui-status-beacon-core",
                runtimeStatusDotStyle.core,
              )}
            />
          </span>
        ) : (
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full border border-surface-1/80 shadow-sm",
              runtimeStatusDotStyle.core,
            )}
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1 truncate text-body-sm">
          <span className="font-medium text-foreground">
            {runtimePresentation.title}
          </span>
          {inlineBits.length > 0 ? (
            <span className="text-muted-foreground">{` · ${inlineBits.join(" · ")}`}</span>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <div
      className={cn(
        "relative h-[224px] overflow-hidden rounded-lg border transition-[border-color,background-color] ui-motion-fast",
        runtimeSurfaceClass,
        isSelected && "ring-1 ring-foreground/10",
        (isActive || runtimeFocusKind === "current") &&
          "ring-1 ring-foreground/14",
      )}
    >
      {runtimeAccentBarClass && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-1",
            runtimeAccentBarClass,
          )}
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        className="group grid h-full w-full grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-3 px-3.5 py-3.5 text-left hover:bg-surface-2/20"
        aria-label={`Focus step ${runtimePresentation.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate ui-meta-label text-muted-foreground">
                {`Step ${index + 1}`}
              </div>
              {runtimeStatusDotStyle.ring ? (
                <span className="ui-status-beacon" aria-hidden="true">
                  <span
                    className={cn(
                      "ui-status-beacon-ring",
                      runtimeStatusDotStyle.ring,
                    )}
                  />
                  <span
                    className={cn(
                      "ui-status-beacon-core",
                      runtimeStatusDotStyle.core,
                    )}
                  />
                </span>
              ) : (
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full border border-surface-1/80 shadow-sm",
                    runtimeStatusDotStyle.core,
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="line-clamp-1 ui-meta-text text-muted-foreground">
              {runtimePresentation.kind}
            </div>
          </div>
          <div className="min-w-0 max-w-[44%] flex flex-col items-end gap-1">
            {runtimeSelectionLabel && (
              <Badge
                variant="outline"
                className="max-w-full shrink-0 border-hairline px-1.5 py-0 ui-meta-text text-muted-foreground"
                title={runtimeSelectionLabel}
              >
                <span className="truncate">{runtimeSelectionLabel}</span>
              </Badge>
            )}
            {runtimeFocusLabel && (
              <Badge
                variant="outline"
                className={cn(
                  "max-w-full shrink-0 px-1.5 py-0 ui-meta-text",
                  runtimeFocusKind === "current" &&
                    "border-hairline bg-surface-2 text-foreground",
                  runtimeFocusKind === "current" &&
                    runtimeStatus === "running" &&
                    "ui-status-badge-info",
                  runtimeFocusKind === "current" &&
                    (runtimeStatus === "waiting_approval" ||
                      runtimeStatus === "waiting_human") &&
                    "ui-status-badge-warning",
                  runtimeFocusKind === "current" &&
                    runtimeStatus === "failed" &&
                    "ui-status-badge-danger",
                  runtimeFocusKind === "next" && "font-medium text-foreground",
                )}
                title={runtimeFocusLabel}
              >
                <span className="truncate">{runtimeFocusLabel}</span>
              </Badge>
            )}
          </div>
        </div>

        <div className="flex min-h-[3.25rem] items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ui-elevation-inset",
              NODE_ICON_TONES[node.type] ||
                "border-hairline bg-surface-1 text-muted-foreground",
            )}
          >
            {node.type === "skill" ? (
              <span className="section-kicker text-foreground">
                {getRuntimeRoleMonogram(runtimePresentation.title)}
              </span>
            ) : (
              <Icon size={17} className="flex-shrink-0" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div
              className="line-clamp-1 text-title-sm text-foreground"
              title={runtimePresentation.title}
            >
              {runtimePresentation.title}
            </div>
            <div
              className="line-clamp-1 ui-meta-text text-muted-foreground"
              title={runtimePresentation.artifactLabel}
            >
              {runtimePresentation.artifactLabel}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 line-clamp-1 text-body-sm font-semibold text-foreground">
              {runtimeCardCopy.summary}
            </div>
          </div>
          <div
            className="sidebar-progress-track h-1.5"
            role="progressbar"
            aria-valuenow={runtimeProgress.value}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${runtimePresentation.title} progress`}
          >
            <div
              className={cn(
                "sidebar-progress-bar",
                runtimeProgress.barClass,
                runtimeProgress.animate && "ui-running-pulse",
              )}
              style={{ transform: `scaleX(${runtimeProgress.value / 100})` }}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {primaryChips.map((chip, chipIndex) => (
              <Badge
                key={`${chip}-${chipIndex}`}
                variant="outline"
                className="max-w-full px-1.5 py-0 ui-meta-text text-muted-foreground"
                title={chip}
              >
                <span className="truncate">{chip}</span>
              </Badge>
            ))}
          </div>
        </div>

        <div className="min-h-0 overflow-hidden">
          {runtimeBranchSummary?.previews?.length ? (
            <div className="space-y-1.5">
              <div className="ui-meta-label text-muted-foreground">
                {node.type === "splitter" ? "Branches" : "Branch focus"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {runtimeBranchSummary.previews.slice(0, 3).map((preview) => (
                  <Badge
                    key={preview.id}
                    variant="outline"
                    className={cn(
                      "max-w-full gap-1 px-1.5 py-0 ui-meta-text",
                      preview.status === "running" &&
                        "border-status-info/30 text-status-info",
                      (preview.status === "waiting_approval" ||
                        preview.status === "waiting_human") &&
                        "border-status-warning/30 text-status-warning",
                      preview.status === "failed" &&
                        "border-status-danger/30 text-status-danger",
                      preview.status === "completed" &&
                        "border-status-success/30 text-status-success",
                      (preview.status === "pending" ||
                        preview.status === "queued") &&
                        "text-muted-foreground",
                    )}
                    title={preview.detail || preview.label}
                  >
                    <span className="truncate">{preview.label}</span>
                    <span className="opacity-70">
                      {getPreviewStatusLabel(preview.status)}
                    </span>
                  </Badge>
                ))}
                {runtimeBranchSummary.previews.length > 3 && (
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 ui-meta-text text-muted-foreground"
                  >
                    +{runtimeBranchSummary.previews.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          ) : runtimeCardCopy.detail ? (
            <div className="border-l border-hairline pl-2">
              <div
                className="line-clamp-1 ui-meta-text text-muted-foreground"
                title={runtimeCardCopy.detail}
              >
                {runtimeCardCopy.detail}
              </div>
            </div>
          ) : null}
        </div>

        {footerLabel ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline pt-2.5">
            <div
              className="min-w-0 line-clamp-1 ui-meta-text text-muted-foreground"
              title={footerLabel}
            >
              {footerLabel}
            </div>
            <span className="shrink-0 ui-meta-text text-muted-foreground transition-colors group-hover:text-foreground">
              Inspect
            </span>
          </div>
        ) : null}
      </button>
    </div>
  )
}
