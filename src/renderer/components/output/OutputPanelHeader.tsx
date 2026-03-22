import { TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface OutputPanelTabOption {
  value: string
  label: string
}

export function OutputPanelHeader({
  activeTab,
  hasResult,
  resultReadyPulse,
  reviewingRunHistory = false,
  selectedRunLabel = null,
  selectedReviewStatus = null,
  tabOptions,
}: {
  activeTab: string
  hasResult: boolean
  resultReadyPulse: boolean
  reviewingRunHistory?: boolean
  selectedRunLabel?: string | null
  selectedReviewStatus?: string | null
  tabOptions: OutputPanelTabOption[]
}) {
  const showResultPulse = resultReadyPulse && activeTab !== "result" && hasResult
  const showReviewContext = reviewingRunHistory && Boolean(selectedRunLabel)
  const showTabs = tabOptions.length > 1

  if (!showTabs && !showResultPulse && !showReviewContext) {
    return null
  }

  return (
    <div className="border-b border-hairline px-1 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {showTabs ? (
          <TabsList className="h-auto w-fit flex-wrap gap-1 rounded-none border-0 bg-transparent p-0 shadow-none">
            {tabOptions.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="min-h-0 rounded-md px-2.5 py-1 text-body-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : (
          <span />
        )}

        {(showReviewContext || showResultPulse) ? (
          <div className="min-w-0 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 ui-meta-text text-muted-foreground">
            {showReviewContext ? (
              <>
                <span className="ui-status-badge h-control-xs shrink-0 border border-hairline bg-surface-2/80 px-2 text-muted-foreground">
                  Saved run
                </span>
                <div className="min-w-0 truncate text-body-sm font-medium text-foreground">
                  {selectedRunLabel}
                </div>
                {selectedReviewStatus ? <span>{selectedReviewStatus}</span> : null}
              </>
            ) : null}
            {showResultPulse ? (
              <span className="ui-meta-label text-status-success" role="status" aria-live="polite" aria-atomic="true">
                Result ready
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
