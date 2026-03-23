import { ChevronDown } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"

export function DisclosurePanel({
  summary,
  children,
  className,
  summaryClassName,
  contentClassName,
  defaultOpen = false,
  surface = "card",
}: {
  summary: ReactNode
  children: ReactNode
  className?: string
  summaryClassName?: string
  contentClassName?: string
  defaultOpen?: boolean
  surface?: "card" | "flat" | "plain"
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  const summaryBaseClassName =
    surface === "plain"
      ? "flex w-full items-center justify-between gap-2 px-0 py-1.5 text-left ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast"
      : "flex w-full items-center justify-between gap-2 px-3 py-2 text-left ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast"
  const contentBaseClassName =
    surface === "plain"
      ? "border-t border-hairline px-0 py-3"
      : "border-t border-hairline px-3 py-3"

  return (
    <div
      className={cn(
        "ui-disclosure rounded-md",
        surface === "card"
          ? "border border-hairline"
          : surface === "flat"
            ? "border border-hairline bg-transparent"
            : "bg-transparent",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        className={cn(summaryBaseClassName, summaryClassName)}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform ui-motion-fast",
            open && "rotate-180",
          )}
        />
      </button>
      <div data-open={open ? "true" : "false"} className="ui-collapsible">
        <div className="ui-collapsible-inner">
          <div className={cn(contentBaseClassName, contentClassName)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
