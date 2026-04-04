import { useState } from "react"
import { CopyButton } from "@/components/ui/copy-button"

interface StepOutputPreviewProps {
  content: string
  onHide?: () => void
}

export function StepOutputPreview({ content, onHide }: StepOutputPreviewProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="pt-1">
      <div
        className={`bg-surface-2/30 rounded-md p-2.5 relative ${
          expanded
            ? "max-h-[24rem] overflow-y-auto ui-scroll-region"
            : "max-h-[12rem] overflow-hidden"
        }`}
      >
        <div className="text-body-sm whitespace-pre-wrap pr-8">{content}</div>
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[hsl(var(--surface-1))] to-transparent" />
        )}
        <CopyButton
          text={content}
          iconOnly
          className="absolute top-1.5 right-1.5 opacity-60 hover:opacity-100"
        />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          className="ui-pressable text-body-sm text-muted-foreground hover:text-foreground ui-motion-fast"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
        {onHide && (
          <button
            type="button"
            className="ui-pressable text-body-sm text-muted-foreground hover:text-foreground ui-motion-fast"
            onClick={onHide}
          >
            Hide
          </button>
        )}
      </div>
    </div>
  )
}
