import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { cn } from "@/lib/cn"

interface FactoryOption {
  id: string
  label: string
  summary: string
  caseCount: number
  artifactCount: number
  origin: "saved" | "derived" | "draft"
}

interface FactoryOutcomeSelectorProps {
  effectiveSelectedFactoryId: string | null
  factoryOptions: FactoryOption[]
  onSelectFactory: (factoryId: string) => void
  onStartNewFactory: () => void
}

export function FactoryOutcomeSelector({
  effectiveSelectedFactoryId,
  factoryOptions,
  onSelectFactory,
  onStartNewFactory,
}: FactoryOutcomeSelectorProps) {
  return (
    <section className="space-y-4 ui-section-divider">
      <SectionHeading
        title="Outcomes"
        meta={
          <Button variant="outline" size="sm" onClick={onStartNewFactory}>
            New outcome
          </Button>
        }
      />

      {factoryOptions.length === 0 ? (
        <div className="ui-empty-state-box px-4 py-8">
          No saved outcomes yet. Start a mode once, then let tracks and results
          accumulate underneath it.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ui-chapter-shell p-0">
          {factoryOptions.map((factory, index) => (
            <button
              key={factory.id}
              type="button"
              onClick={() => onSelectFactory(factory.id)}
              className={cn(
                "w-full px-4 py-4 text-left ui-transition-colors ui-motion-fast",
                index > 0 && "border-t border-hairline",
                effectiveSelectedFactoryId === factory.id
                  ? "ui-selected-row-tint"
                  : "hover:bg-surface-2/35",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-title-sm text-foreground">
                  {factory.label}
                </div>
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {factory.origin === "saved"
                    ? "Saved"
                    : factory.origin === "draft"
                      ? "Draft"
                      : "Derived"}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-body-sm text-muted-foreground">
                {factory.summary}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
                <span>
                  {factory.caseCount} track{factory.caseCount === 1 ? "" : "s"}
                </span>
                <span className="text-border">•</span>
                <span>
                  {factory.artifactCount} output
                  {factory.artifactCount === 1 ? "" : "s"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
