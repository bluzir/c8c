import { TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface OutputPanelTabOption {
  value: string
  label: string
}

function renderScopeLabel(scopeLabel: string) {
  const colonIndex = scopeLabel.indexOf(":")
  if (colonIndex <= 0) {
    return <div className="ui-meta-text text-muted-foreground">{scopeLabel}</div>
  }

  const lead = scopeLabel.slice(0, colonIndex)
  const detail = scopeLabel.slice(colonIndex + 1).trim()

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="ui-meta-label text-muted-foreground">{lead}</span>
      <span className="min-w-0 truncate text-body-sm text-foreground-subtle">{detail}</span>
    </div>
  )
}

export function OutputPanelHeader({
  activeTab,
  hasResult,
  resultReadyPulse,
  scopeLabel = null,
  reviewingRunHistory = false,
  selectedRunLabel = null,
  selectedReviewStatus = null,
  tabOptions,
}: {
  activeTab: string
  hasResult: boolean
  resultReadyPulse: boolean
  scopeLabel?: string | null
  reviewingRunHistory?: boolean
  selectedRunLabel?: string | null
  selectedReviewStatus?: string | null
  tabOptions: OutputPanelTabOption[]
}) {
  const showResultPulse = resultReadyPulse && activeTab !== "result" && hasResult
  const showReviewContext = reviewingRunHistory && Boolean(selectedRunLabel)
  const showTabs = tabOptions.length > 1

  if (!showTabs && !showResultPulse && !showReviewContext && !scopeLabel) {
    return null
  }

  return (
    <div className="border-b border-hairline px-1 pb-2">
      {scopeLabel ? (
        <div className="pb-2">
          {renderScopeLabel(scopeLabel)}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {showTabs ? (
          <TabsList variant="plain" className="h-auto w-fit flex-wrap gap-1">
            {tabOptions.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                variant="plain"
                className="px-2.5 py-1"
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
