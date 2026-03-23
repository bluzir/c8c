import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: string
  hint: string
  tone?: "default" | "info" | "warning" | "success"
}) {
  return (
    <article
      className={cn("rounded-lg px-4 py-4", {
        "ui-slab": tone === "default",
        "bg-status-info/8": tone === "info",
        "bg-status-warning/8": tone === "warning",
        "bg-status-success/8": tone === "success",
      })}
    >
      <div className="ui-meta-label text-muted-foreground">{label}</div>
      <div className="mt-2 text-title-md text-foreground">{value}</div>
      <div className="mt-1 line-clamp-2 text-body-sm text-muted-foreground">
        {hint}
      </div>
    </article>
  )
}

export function BadgeGroup({
  label,
  items,
  emptyLabel = "None yet",
  variant = "secondary",
}: {
  label: string
  items: string[]
  emptyLabel?: string
  variant?: "secondary" | "outline" | "warning" | "info" | "success"
}) {
  return (
    <div className="space-y-2">
      <div className="ui-meta-label text-muted-foreground">{label}</div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge
              key={`${label}:${item}`}
              variant={variant}
              className="ui-meta-text px-2 py-0"
            >
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-body-sm text-muted-foreground">{emptyLabel}</div>
      )}
    </div>
  )
}
