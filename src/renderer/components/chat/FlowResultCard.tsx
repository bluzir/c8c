import { FileText, FolderOpen } from "lucide-react"

interface FlowResultCardProps {
  name: string
  kind: string
  sizeLabel?: string
  onClick?: () => void
}

export function FlowResultCard({
  name,
  kind,
  sizeLabel,
  onClick,
}: FlowResultCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md border border-hairline bg-surface-1/40 px-3 py-2.5 text-left ui-motion-fast hover:bg-surface-2/30"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-status-info/5">
        <FileText size={16} className="text-status-info" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-body-sm font-medium text-foreground">
          {name}
        </p>
        <p className="ui-meta-text text-muted-foreground">
          {kind}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </p>
      </div>
    </button>
  )
}

export function AllFilesButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md border border-hairline bg-surface-1/40 px-3 py-2.5 ui-motion-fast hover:bg-surface-2/30"
    >
      <FolderOpen size={16} className="text-muted-foreground" />
      <span className="text-body-sm text-muted-foreground">All files</span>
    </button>
  )
}
