import { HistoryTab } from "@/components/output/HistoryTab"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import type {
  FlowImprovementRecommendation,
  RunResult,
  RunWorkspaceCleanupResult,
  RunWorkspaceDeleteResult,
} from "@shared/types"

export function OutputPanelHistoryContent({
  fillHeight,
  showResultSurface,
  canInspectActivity,
  tabOptionsLength,
  onBackToResult,
  onBackToActivity,
  pastRuns,
  runStatus,
  onOpenReport,
  onContinueRun,
  onDeleteRun,
  onCleanupRuns,
  selectedRunId,
  improvementRecommendations,
  onSelectRun,
}: {
  fillHeight: boolean
  showResultSurface: boolean
  canInspectActivity: boolean
  tabOptionsLength: number
  onBackToResult: () => void
  onBackToActivity: () => void
  pastRuns: RunResult[]
  runStatus: string
  onOpenReport: (path: string) => Promise<void> | void
  onContinueRun?: (run: RunResult) => Promise<void> | void
  onDeleteRun?: (
    run: RunResult,
  ) => Promise<RunWorkspaceDeleteResult> | RunWorkspaceDeleteResult
  onCleanupRuns?: () =>
    | Promise<RunWorkspaceCleanupResult>
    | RunWorkspaceCleanupResult
  selectedRunId?: string | null
  improvementRecommendations: FlowImprovementRecommendation[]
  onSelectRun: (run: RunResult) => void
}) {
  return (
    <div
      className={cn(
        fillHeight ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2",
      )}
    >
      {showResultSurface && tabOptionsLength <= 1 ? (
        <div className="border-b border-hairline px-1 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
            onClick={onBackToResult}
          >
            Back to result
          </Button>
        </div>
      ) : canInspectActivity && tabOptionsLength <= 1 ? (
        <div className="border-b border-hairline px-1 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
            onClick={onBackToActivity}
          >
            Back to summary
          </Button>
        </div>
      ) : null}
      <HistoryTab
        pastRuns={pastRuns}
        runStatus={runStatus}
        fillHeight={fillHeight}
        onOpenReport={onOpenReport}
        onContinueRun={onContinueRun}
        onDeleteRun={onDeleteRun}
        onCleanupRuns={onCleanupRuns}
        selectedRunId={selectedRunId}
        improvementRecommendations={improvementRecommendations}
        onSelectRun={onSelectRun}
      />
    </div>
  )
}
