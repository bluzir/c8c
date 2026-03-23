import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"

const boardLaneVariants = cva("rounded-xl p-4 space-y-4", {
  variants: {
    tone: {
      default: "bg-surface-2/25",
      info: "bg-status-info/5",
      warning: "bg-status-warning/5",
      success: "bg-status-success/5",
    },
  },
  defaultVariants: {
    tone: "default",
  },
})

export interface BoardLaneProps extends VariantProps<typeof boardLaneVariants> {
  title: string
  count?: number
  description?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function BoardLane({
  title,
  count,
  description,
  actions,
  children,
  tone,
  className,
}: BoardLaneProps) {
  return (
    <section className={cn(boardLaneVariants({ tone }), className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-title-sm text-foreground">{title}</h3>
            {typeof count === "number" ? (
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {count}
              </Badge>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 text-body-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
