import { ChevronDown, Folder } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/cn"

interface ProjectPickerPillProps {
  projectName: string | null
  projects: Array<{ path: string; name: string }>
  onSelect: (path: string | null) => void
}

export function ProjectPickerPill({
  projectName,
  projects,
  onSelect,
}: ProjectPickerPillProps) {
  const hasProject = projectName != null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 h-control-sm text-body-sm ui-motion-fast",
            hasProject
              ? "bg-surface-2/60 text-foreground"
              : "border border-dashed border-hairline text-muted-foreground/40",
          )}
        >
          <Folder size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[10rem]">
            {hasProject ? projectName : "Add project"}
          </span>
          <ChevronDown size={11} className="shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onSelect(null)}>
          No project
        </DropdownMenuItem>
        {projects.length > 0 && <DropdownMenuSeparator />}
        {projects.map((p) => (
          <DropdownMenuItem key={p.path} onSelect={() => onSelect(p.path)}>
            {p.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
