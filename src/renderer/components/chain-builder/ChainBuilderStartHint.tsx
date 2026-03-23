import { ArrowRight, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

export function ChainBuilderStartHint({
  compact,
  onAddFirstStep,
}: {
  compact: boolean
  onAddFirstStep: () => void
}) {
  return (
    <div className={cn("mb-3 ui-inset-well px-3", compact ? "py-2" : "py-3")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-body-sm font-medium text-foreground">
            Start with a skill step, then add checks or human input as needed.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="ui-meta-text px-2 py-0 text-foreground"
            >
              <Plus size={10} aria-hidden="true" />
              Skill step
            </Badge>
            <Badge
              variant="outline"
              className="ui-meta-text px-2 py-0 text-muted-foreground"
            >
              Add checks
            </Badge>
            <Badge
              variant="outline"
              className="ui-meta-text px-2 py-0 text-muted-foreground"
            >
              Split work
            </Badge>
            <Badge
              variant="outline"
              className="ui-meta-text px-2 py-0 text-muted-foreground"
            >
              Human input
            </Badge>
          </div>
        </div>
        <Button
          size={compact ? "xs" : "sm"}
          className="shrink-0 gap-1.5 self-start sm:self-center"
          onClick={onAddFirstStep}
        >
          Add first step
          <ArrowRight size={13} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
