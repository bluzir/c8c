import {
  Activity,
  FileStack,
  FolderOpen,
  Inbox,
  LayoutTemplate,
  Workflow,
  Puzzle,
  Plus,
  PanelLeftClose,
} from "lucide-react"
import { SidebarNavItem } from "@/components/sidebar/SidebarNavItem"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ReactNode } from "react"

type ProjectSidebarChromeProps = {
  mainView: string
  runsDashboardOpen: boolean
  unreadInboxCount: number
  hasProjects: boolean
  workflowSearchQuery: string
  showSearch: boolean
  onSearchChange: (value: string) => void
  onOpenThread: () => void
  onOpenCreate: () => void
  onOpenStartingPoints: () => void
  onOpenArtifacts: () => void
  onOpenSkills: () => void
  onOpenInbox: () => void
  onOpenRunsDashboard: () => void
  onAddProject: () => void
  onToggleVisibility?: () => void
  showVisibilityToggle?: boolean
}

function inboxMeta(unreadInboxCount: number): ReactNode {
  if (unreadInboxCount <= 0) return null
  return (
    <span className="control-badge control-badge-compact rounded-full border border-primary/20 bg-primary/10 text-sidebar-meta font-medium tabular-nums text-primary">
      {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
    </span>
  )
}

export function ProjectSidebarChrome({
  mainView,
  runsDashboardOpen,
  unreadInboxCount,
  hasProjects,
  workflowSearchQuery,
  showSearch,
  onSearchChange,
  onOpenThread,
  onOpenCreate,
  onOpenStartingPoints,
  onOpenArtifacts,
  onOpenSkills,
  onOpenInbox,
  onOpenRunsDashboard,
  onAddProject,
  onToggleVisibility,
  showVisibilityToggle = false,
}: ProjectSidebarChromeProps) {
  return (
    <>
      {showVisibilityToggle && onToggleVisibility ? (
        <div className="flex justify-end px-1.5 pt-1.5 pb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-sidebar-item="true"
                className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                onClick={onToggleVisibility}
                aria-label="Hide sidebar"
              >
                <PanelLeftClose size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Hide sidebar</TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <div className="px-2.5 pt-2.5 pb-1 section-kicker text-muted-foreground">
        Workspace
      </div>
      <div className="space-y-px px-1.5 pb-2">
        <SidebarNavItem
          icon={Workflow}
          label="Flow"
          active={mainView === "thread"}
          onClick={onOpenThread}
        />
      </div>

      <div className="px-2.5 pt-1 pb-1 section-kicker text-muted-foreground">
        Browse
      </div>
      <div className="space-y-px px-1.5 pb-2">
        <SidebarNavItem
          icon={LayoutTemplate}
          label="Starting points"
          active={mainView === "templates"}
          onClick={onOpenStartingPoints}
        />
        <SidebarNavItem
          icon={Puzzle}
          label="Skills"
          active={mainView === "skills"}
          onClick={onOpenSkills}
        />
        <SidebarNavItem
          icon={FileStack}
          label="Artifacts"
          active={mainView === "artifacts"}
          onClick={onOpenArtifacts}
        />
      </div>

      <div className="px-2.5 pt-1 pb-1 section-kicker text-muted-foreground">
        Review
      </div>
      <div className="space-y-px px-1.5 pb-1">
        <SidebarNavItem
          icon={Activity}
          label="Runs"
          active={runsDashboardOpen}
          onClick={onOpenRunsDashboard}
        />
        <SidebarNavItem
          icon={Inbox}
          label="Inbox"
          active={mainView === "inbox"}
          onClick={onOpenInbox}
          meta={inboxMeta(unreadInboxCount)}
        />
      </div>

      <div className="px-2.5 pt-3 pb-1.5">
        <div className="flex items-center justify-between">
          <span className="section-kicker">Flows</span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-sidebar-item="true"
                  className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={onOpenCreate}
                  aria-label="New flow"
                >
                  <Plus size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>New flow</TooltipContent>
            </Tooltip>
            {hasProjects ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-sidebar-item="true"
                    className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                    onClick={onAddProject}
                    aria-label="Add project"
                  >
                    <FolderOpen size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Add project</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <div className="mt-1.5 h-px bg-hairline" />
      </div>

      {showSearch && (
        <div className="px-2.5 pb-1.5">
          <input
            type="search"
            placeholder="Search flows..."
            aria-label="Search flows"
            value={workflowSearchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full h-control-sm rounded-md border border-hairline bg-surface-2/60 px-2 text-sidebar-item text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
        </div>
      )}
    </>
  )
}
