import { X, FileText } from "lucide-react"
import type { ArtifactRecord } from "@shared/types"

interface SourceArtifactChipsProps {
  artifacts: ArtifactRecord[]
  onRemove: (id: string) => void
}

export function SourceArtifactChips({
  artifacts,
  onRemove,
}: SourceArtifactChipsProps) {
  if (artifacts.length === 0) return null

  return (
    <div className="ui-context-strip rounded-lg px-3 py-2 space-y-1.5">
      <p className="ui-meta-text text-muted-foreground">Attached from previous flow</p>
      <div className="flex flex-wrap gap-1.5">
        {artifacts.map((artifact) => (
          <span
            key={artifact.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1/60 px-2 py-1 text-body-sm text-foreground"
          >
            <FileText
              size={12}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate max-w-48">{artifact.title}</span>
            <button
              type="button"
              onClick={() => onRemove(artifact.id)}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-surface-2/50 ui-motion-fast ui-transition-colors"
              aria-label={`Remove ${artifact.title}`}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
