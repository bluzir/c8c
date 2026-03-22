import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScopeBanner } from "@/components/ui/scope-banner"

interface NotificationsScopeSectionProps {
  selectedFactoryLabel: string | null
  selectedCaseLabel: string | null
  visibleCaseOptions: Array<{ id: string; label: string }>
  selectedCaseId: string | null
  openHumanTaskCount: number
  artifactsLoading: boolean
  factoryBetaEnabled: boolean
  onOpenFactory: () => void
  onClearCase: () => void
  onSelectCase: (caseId: string | null) => void
}

export function NotificationsScopeSection({
  selectedFactoryLabel,
  selectedCaseLabel,
  visibleCaseOptions,
  selectedCaseId,
  openHumanTaskCount,
  artifactsLoading,
  factoryBetaEnabled,
  onOpenFactory,
  onClearCase,
  onSelectCase,
}: NotificationsScopeSectionProps) {
  if (!selectedFactoryLabel && !selectedCaseLabel && visibleCaseOptions.length <= 1) {
    return null
  }

  return (
    <section className="space-y-3">
      {selectedFactoryLabel && !selectedCaseLabel ? (
        <ScopeBanner
          eyebrow="Path scope"
          description={
            artifactsLoading
              ? "Resolving lab scope..."
              : `Showing ${openHumanTaskCount} open decision${openHumanTaskCount === 1 ? "" : "s"} for ${selectedFactoryLabel}.`
          }
          actions={factoryBetaEnabled ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenFactory}>
              <ArrowUpRight size={14} />
              Back to lab
            </Button>
          ) : undefined}
        />
      ) : null}

      {selectedCaseLabel ? (
        <ScopeBanner
          eyebrow="Track scope"
          description={
            artifactsLoading
              ? "Resolving track lineage..."
              : `Showing ${openHumanTaskCount} open decision${openHumanTaskCount === 1 ? "" : "s"} for ${selectedCaseLabel}${selectedFactoryLabel ? ` inside ${selectedFactoryLabel}` : ""}.`
          }
          actions={(
            <Button type="button" variant="ghost" size="sm" onClick={onClearCase}>
              Show all tracks
            </Button>
          )}
        />
      ) : null}

      {visibleCaseOptions.length > 1 ? (
        <div className="control-cluster flex flex-wrap gap-2 rounded-lg px-1 py-1">
          <Button
            type="button"
            variant={selectedCaseId === null ? "secondary" : "outline"}
            size="sm"
            onClick={() => onSelectCase(null)}
          >
            All tracks
          </Button>
          {visibleCaseOptions.slice(0, 6).map((entry) => (
            <Button
              key={entry.id}
              type="button"
              variant={selectedCaseId === entry.id ? "secondary" : "outline"}
              size="sm"
              onClick={() => onSelectCase(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
