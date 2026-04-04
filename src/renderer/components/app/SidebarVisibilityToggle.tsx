import type { Ref } from "react"
import { PanelLeft, PanelLeftOpen } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

interface SidebarVisibilityToggleProps {
  desktopRuntime: {
    platform: string
    titlebarHeight: number
    primaryModifierLabel: string
  }
  sidebarOpen: boolean
  sidebarWidth: number
  onToggle: () => void
  buttonRef?: Ref<HTMLButtonElement>
}

export function SidebarVisibilityToggle({
  desktopRuntime,
  sidebarOpen,
  sidebarWidth,
  onToggle,
  buttonRef,
}: SidebarVisibilityToggleProps) {
  const inTitlebar = desktopRuntime.titlebarHeight > 0
  if (!inTitlebar && sidebarOpen) return null

  const Icon = sidebarOpen ? PanelLeft : PanelLeftOpen
  const label = sidebarOpen ? "Hide sidebar" : "Show sidebar"
  const shortcutLabel = `${desktopRuntime.primaryModifierLabel}B`
  const positionStyle = inTitlebar
    ? desktopRuntime.platform === "macos"
      ? {
          top: 12,
          left: sidebarOpen ? Math.max(12, Math.round(sidebarWidth - 28)) : 96,
        }
      : {
          top: Math.max(
            6,
            Math.round((desktopRuntime.titlebarHeight - 20) / 2),
          ),
          left: 12,
        }
    : { top: 12, left: 12 }

  return (
    <div className={cn("fixed z-40")} style={positionStyle}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            ref={buttonRef}
            className="pointer-events-auto no-drag h-5 w-5 rounded-sm border-transparent bg-transparent p-0 text-muted-foreground hover:border-transparent hover:bg-transparent hover:text-foreground active:bg-transparent"
            onClick={onToggle}
            aria-label={`${label} (${shortcutLabel})`}
            aria-pressed={sidebarOpen}
          >
            <Icon size={17} strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {label} ({shortcutLabel})
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
