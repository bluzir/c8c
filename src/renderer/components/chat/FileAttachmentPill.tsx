import { Paperclip, X } from "lucide-react"

interface FileAttachmentPillProps {
  name: string
  onRemove: () => void
}

export function FileAttachmentPill({ name, onRemove }: FileAttachmentPillProps) {
  return (
    <span className="bg-surface-2/60 rounded-md px-2 h-control-sm text-body-sm text-foreground inline-flex items-center gap-1 group">
      <Paperclip size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate max-w-[8rem]">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="ui-icon-button h-3.5 w-3.5 rounded-sm opacity-0 group-hover:opacity-100 ui-motion-fast"
      >
        <X size={10} aria-hidden="true" />
      </button>
    </span>
  )
}
