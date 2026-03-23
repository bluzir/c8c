import { Button } from "@/components/ui/button"
import { formatArtifactContractLabel } from "@/lib/workflow-entry"
import type { ArtifactContract, ArtifactRecord } from "@shared/types"

interface ProjectResultsPanelProps {
  artifacts: ArtifactRecord[]
  loading: boolean
  error: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
}

export function ProjectResultsPanel({
  artifacts,
  loading,
  error,
  requiredContracts,
  onOpenArtifact,
}: ProjectResultsPanelProps) {
  const latestArtifacts = artifacts.slice(0, 4)
  const availableKinds = new Set(artifacts.map((artifact) => artifact.kind))
  const requiredLabels = (requiredContracts || []).map((contract) => ({
    label: formatArtifactContractLabel(contract),
    satisfied: availableKinds.has(contract.kind),
    optional: contract.required === false,
  }))
  const shouldRender =
    loading ||
    Boolean(error) ||
    latestArtifacts.length > 0 ||
    requiredLabels.length > 0

  if (!shouldRender) {
    return null
  }

  return (
    <section className="rounded-lg border border-hairline px-4 py-3 ui-fade-slide-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-kicker">Results</div>
        </div>
        <div className="ui-meta-text text-muted-foreground">
          {artifacts.length} saved
          {requiredLabels.length > 0
            ? ` · ${requiredLabels.length} reusable`
            : ""}
        </div>
      </div>

      {requiredLabels.length > 0 && (
        <div className="mt-3 space-y-2 ui-section-divider">
          <p className="ui-meta-label text-muted-foreground">Reusable inputs</p>
          <div className="space-y-1.5">
            {requiredLabels.map((item) => (
              <div
                key={`${item.label}-${item.optional ? "optional" : "required"}`}
                className={
                  item.satisfied
                    ? "text-body-sm text-foreground"
                    : "text-body-sm text-muted-foreground"
                }
              >
                {item.label}
                {item.optional ? " (optional)" : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <div className="ui-meta-text text-muted-foreground">
            Loading results...
          </div>
        ) : error ? (
          <div role="alert" className="ui-meta-text text-status-danger">
            {error}
          </div>
        ) : latestArtifacts.length === 0 ? (
          <div className="ui-meta-text text-muted-foreground">
            No saved results yet.
          </div>
        ) : (
          <div className="space-y-0 ui-section-divider">
            {latestArtifacts.map((artifact, index) => (
              <div
                key={artifact.id}
                className={
                  index === 0
                    ? "flex flex-wrap items-center justify-between gap-2 py-3"
                    : "flex flex-wrap items-center justify-between gap-2 ui-section-divider py-3"
                }
              >
                <div className="min-w-0">
                  <div className="text-body-sm font-medium text-foreground">
                    {artifact.title}
                  </div>
                  <div className="ui-meta-text text-muted-foreground">
                    {formatArtifactContractLabel(artifact.kind)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-foreground"
                  onClick={() => onOpenArtifact(artifact)}
                >
                  Open
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
