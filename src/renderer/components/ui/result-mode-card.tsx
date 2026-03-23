import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import type { WorkflowResultMode } from "@/lib/result-modes"

interface ResultModeCardProps {
  mode: WorkflowResultMode
  selected: boolean
  onSelect: (mode: WorkflowResultMode) => void
  compact?: boolean
}

export function ResultModeCard({
  mode,
  selected,
  onSelect,
  compact = false,
}: ResultModeCardProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(mode)}
      aria-pressed={selected}
      className={cn(
        "ui-interactive-card-subtle w-full rounded-xl surface-panel text-left !whitespace-normal !flex-col !items-start !justify-start",
        compact ? "min-h-[12.5rem] gap-2.5 px-3 py-3" : "px-4 py-4",
        selected && "bg-surface-3 ring-2 ring-foreground/20",
      )}
    >
      <div className="flex w-full items-start gap-3">
        <div
          className={cn(
            "shrink-0 rounded-lg bg-surface-2/80",
            compact
              ? "flex h-9 w-9 items-center justify-center text-lg"
              : "flex h-11 w-11 items-center justify-center text-xl",
          )}
        >
          <span aria-hidden>{mode.emoji}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-body-md font-semibold text-foreground">
              {mode.label}
            </h3>
            {mode.id === "development" ? (
              <span className="rounded-full ui-inset-well px-2 py-0.5 ui-meta-text text-foreground">
                Primary
              </span>
            ) : null}
          </div>
          {compact ? (
            <p className="ui-meta-text text-muted-foreground">
              {mode.runtimeLine || mode.summary}
            </p>
          ) : (
            <p className="text-body-sm text-foreground">{mode.summary}</p>
          )}
        </div>
      </div>

      {compact ? (
        <div className="mt-1 w-full space-y-2">
          <p className="line-clamp-2 text-body-sm text-foreground">
            {mode.youGetFirst}
          </p>
          {mode.guidedPath?.length ? (
            <div className="flex flex-wrap gap-1">
              {mode.guidedPath.map((stage) => (
                <span
                  key={`${mode.id}-${stage}`}
                  className="rounded-full border border-hairline bg-surface-2/80 px-2 py-0.5 ui-meta-text text-muted-foreground"
                >
                  {stage}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "mt-4 grid w-full gap-3",
            "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
          )}
        >
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">Use this for</p>
            <p className="text-body-sm text-muted-foreground">{mode.useFor}</p>
          </div>
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">You provide</p>
            <p className="text-body-sm text-muted-foreground">
              {mode.youProvide}
            </p>
          </div>
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">You get first</p>
            <p className="text-body-sm text-muted-foreground">
              {mode.youGetFirst}
            </p>
          </div>
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">Your role</p>
            <p className="text-body-sm text-muted-foreground">
              {mode.userRole}
            </p>
          </div>
        </div>
      )}

      {!compact && mode.guidedPath?.length ? (
        <div className="mt-4 w-full space-y-1.5">
          <p className="ui-meta-label text-muted-foreground">Steps</p>
          <div className="flex flex-wrap gap-1.5">
            {mode.guidedPath.map((stage) => (
              <span
                key={`${mode.id}-${stage}`}
                className="rounded-full border border-hairline bg-surface-2/80 px-2.5 py-1 ui-meta-text text-muted-foreground"
              >
                {stage}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Button>
  )
}
