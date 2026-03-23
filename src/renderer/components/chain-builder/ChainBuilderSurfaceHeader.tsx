import { Badge } from "@/components/ui/badge"

export interface ChainBuilderRuntimeStepSummary {
  label: string
  status: string
}

interface ChainBuilderSurfaceHeaderProps {
  reviewSnapshot: boolean
  runtimeMode: boolean
  currentStep: ChainBuilderRuntimeStepSummary | null
  nextStepLabel: string | null
  completedCount: number
  pendingCount: number
  totalMonitoredSteps: number
  totalSteps: number
}

export function ChainBuilderSurfaceHeader({
  reviewSnapshot,
  runtimeMode,
  currentStep: _currentStep,
  nextStepLabel: _nextStepLabel,
  completedCount,
  pendingCount: _pendingCount,
  totalMonitoredSteps,
  totalSteps,
}: ChainBuilderSurfaceHeaderProps) {
  if (runtimeMode) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-kicker">Flow</h2>
          <p className="ui-meta-text text-muted-foreground">
            Select a step to inspect it.
          </p>
        </div>
        <div className="ui-meta-text tabular-nums text-muted-foreground">
          {totalMonitoredSteps > 0
            ? `${completedCount}/${totalMonitoredSteps} done`
            : `${totalSteps} steps`}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1.5">
        <h2 className="section-kicker">Preview</h2>
        <div className="ui-badge-row">
          {reviewSnapshot && (
            <Badge
              variant="outline"
              className="ui-meta-text px-2 py-0 text-muted-foreground"
            >
              Saved run
            </Badge>
          )}
          <Badge
            variant="outline"
            className="ui-meta-text px-2 py-0 text-muted-foreground"
          >
            Select step to inspect
          </Badge>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="ui-meta-text tabular-nums text-muted-foreground">
          {totalSteps} steps
        </span>
      </div>
    </div>
  )
}
