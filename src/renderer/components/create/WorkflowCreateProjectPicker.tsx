import { Check, ChevronRight, Folder, FolderPlus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/cn"

export function WorkflowCreateProjectPicker({
  open,
  onOpenChange,
  targetProjectName,
  projects,
  targetProjectPath,
  openingProject,
  projectNameForPath,
  onSelectProject,
  onAddProject,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetProjectName: string | null
  projects: string[]
  targetProjectPath: string | null
  openingProject: boolean
  projectNameForPath: (projectPath: string) => string
  onSelectProject: (projectPath: string) => void
  onAddProject: () => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Select project"
          className="no-drag"
        >
          <Folder size={14} />
          <span className="max-w-56 truncate">
            {targetProjectName || "Select project"}
          </span>
          <ChevronRight
            size={14}
            className={cn(
              "shrink-0 transition-transform ui-motion-fast",
              open && "rotate-90",
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-lg p-2"
      >
        <DropdownMenuLabel className="px-3 pb-3 pt-2 text-body-md font-medium text-muted-foreground">
          Select project
        </DropdownMenuLabel>
        {projects.map((projectPath) => {
          const isActive = projectPath === targetProjectPath
          return (
            <DropdownMenuItem
              key={projectPath}
              onSelect={() => onSelectProject(projectPath)}
              className="h-auto items-center gap-3 rounded-md px-3 py-3 text-body-md text-foreground"
            >
              <Folder size={18} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {projectNameForPath(projectPath)}
              </span>
              {isActive ? (
                <Check size={18} className="shrink-0 text-foreground" />
              ) : null}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem
          onSelect={onAddProject}
          disabled={openingProject}
          className="h-auto items-center gap-3 rounded-md px-3 py-3 text-body-md text-foreground"
        >
          {openingProject ? (
            <Loader2
              size={18}
              className="shrink-0 animate-spin text-muted-foreground"
            />
          ) : (
            <FolderPlus size={18} className="shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium">Add project</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
