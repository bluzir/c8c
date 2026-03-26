import type { ReactNode } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface CollectionToolbarProps {
  ariaLabel: string
  query: string
  onQueryChange: (value: string) => void
  searchPlaceholder: string
  searchAriaLabel?: string
  summary?: ReactNode
  action?: ReactNode
  filters?: ReactNode
  surface?: "card" | "flat"
}

export function CollectionToolbar({
  ariaLabel,
  query,
  onQueryChange,
  searchPlaceholder,
  searchAriaLabel,
  summary,
  action,
  filters,
  surface = "card",
}: CollectionToolbarProps) {
  return (
    <section
      className={
        surface === "card"
          ? "rounded-xl border-b border-hairline p-3 space-y-3"
          : "space-y-2 px-1"
      }
      aria-label={ariaLabel}
    >
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel || searchPlaceholder}
              className="h-control-sm bg-input-background pl-8 shadow-none"
            />
          </div>
        </div>

        {(summary || action) && (
          <div className="control-cluster flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg p-1">
            {summary ? (
              <span className="ui-meta-text hidden text-muted-foreground sm:inline">
                {summary}
              </span>
            ) : null}
            {action}
          </div>
        )}
      </div>

      {filters ? (
        <div className="control-cluster flex flex-wrap items-center gap-2 rounded-lg p-1">
          {filters}
        </div>
      ) : null}
    </section>
  )
}
