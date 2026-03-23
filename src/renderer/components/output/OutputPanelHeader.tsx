import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { OutputTabValue } from "./outputPanelTypes"

export interface OutputPanelTabOption {
  value: string
  label: string
}

function renderScopeLabel(scopeLabel: string) {
  const colonIndex = scopeLabel.indexOf(":")
  if (colonIndex <= 0) {
    return (
      <div className="ui-meta-text text-muted-foreground">{scopeLabel}</div>
    )
  }

  const lead = scopeLabel.slice(0, colonIndex)
  const detail = scopeLabel.slice(colonIndex + 1).trim()

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="ui-meta-label text-muted-foreground">{lead}</span>
      <span className="min-w-0 truncate text-body-sm text-foreground-subtle">
        {detail}
      </span>
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
  tabOptions = [],
}: {
  activeTab?: OutputTabValue
  hasResult?: boolean
  resultReadyPulse?: boolean
  scopeLabel?: string | null
  reviewingRunHistory?: boolean
  selectedRunLabel?: string | null
  selectedReviewStatus?: string | null
  tabOptions?: OutputPanelTabOption[]
}) {
  const showTabs = tabOptions.length > 1
  const showResultPulse =
    resultReadyPulse && activeTab !== "result" && hasResult
  const showReviewContext = reviewingRunHistory && Boolean(selectedRunLabel)

  if (!showTabs && !showResultPulse && !showReviewContext && !scopeLabel) {
    return null
  }

  return (
    <div className="space-y-2">
      {scopeLabel || showReviewContext ? (
        <div className="ui-context-strip flex-wrap justify-between gap-x-3 gap-y-2">
          {scopeLabel ? (
            <div className="min-w-0 flex-1">{renderScopeLabel(scopeLabel)}</div>
          ) : (
            <span />
          )}
          {showReviewContext ? (
            <div className="min-w-0 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 ui-meta-text text-muted-foreground">
              <span className="ui-status-badge h-control-xs shrink-0 border border-hairline px-2 text-muted-foreground">
                Saved run
              </span>
              <div className="min-w-0 truncate text-body-sm font-medium text-foreground">
                {selectedRunLabel}
              </div>
              {selectedReviewStatus ? (
                <span className="ui-meta-text text-muted-foreground">
                  {selectedReviewStatus}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showTabs ? (
        <div className="flex items-center gap-3">
          <TabsList variant="boxed">
            {tabOptions.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {showResultPulse ? (
            <span className="text-body-sm font-medium text-status-success ui-fade-slide-in">
              Result ready
            </span>
          ) : null}
        </div>
      ) : showResultPulse ? (
        <div className="px-1">
          <span className="text-body-sm font-medium text-status-success ui-fade-slide-in">
            Result ready
          </span>
        </div>
      ) : null}
    </div>
  )
}
