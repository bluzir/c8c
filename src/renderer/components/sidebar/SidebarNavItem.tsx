import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

interface SidebarNavItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  meta?: ReactNode
}

export function SidebarNavItem({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
  className,
  meta,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      data-sidebar-item="true"
      className={cn(
        "ui-pressable flex h-control-sm w-full items-center justify-start gap-2.5 rounded-md border border-transparent px-2.5 text-sidebar-item font-normal ui-transition-colors ui-motion-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-hairline/35 bg-sidebar-active text-foreground hover:bg-sidebar-active hover:text-foreground"
          : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground hover:border-hairline/45",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {meta ? <span className="shrink-0">{meta}</span> : null}
    </button>
  )
}
