import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

const summaryRailItemVariants = cva("rounded-md border px-3 py-2", {
  variants: {
    tone: {
      default: "border-hairline bg-surface-1/70",
      info: "border-status-info/25 bg-status-info/8",
      warning: "border-status-warning/25 bg-status-warning/8",
      success: "border-status-success/25 bg-status-success/8",
    },
  },
  defaultVariants: {
    tone: "default",
  },
})

export interface SummaryRailItem extends VariantProps<
  typeof summaryRailItemVariants
> {
  label: string
  value: string
  hint?: string
}

export function SummaryRail({
  items,
  className,
  compact = false,
}: {
  items: SummaryRailItem[]
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div
          key={`${item.label}:${item.value}`}
          className={summaryRailItemVariants({ tone: item.tone })}
        >
          <div className="ui-meta-label text-muted-foreground">
            {item.label}
          </div>
          <div
            className={cn(
              "mt-1 font-medium text-foreground",
              compact ? "text-body-md" : "text-body-sm",
            )}
          >
            {item.value}
          </div>
          {item.hint && !compact ? (
            <div className="mt-1 text-body-sm text-muted-foreground">
              {item.hint}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
