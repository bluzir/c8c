import type { Ref } from "react"
import { Check, GitBranch, MessageSquare, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  WorkflowActionMenu,
  type WorkflowActionMenuAction,
} from "@/components/toolbar/WorkflowActionMenu"

interface WorkflowPrimaryActionsProps {
  controlGroupClass: string
  isRunning: boolean
  isSaving: boolean
  showSave: boolean
  saveFlash: "saved" | "imported" | "exported" | null
  primaryShortcutLabel: string
  chatOpen: boolean
  chatShortcutLabel: string
  agentToggleRef?: Ref<HTMLButtonElement>
  actionMenuDisabled?: boolean
  canOpenDefaults?: boolean
  flowDefaultsOpen?: boolean
  canManageCurrentFlow?: boolean
  canDeleteCurrentFlow?: boolean
  canDuplicateCurrentFlow?: boolean
  onSave: () => void
  onToggleChat: () => void
  onOpenRuns?: (() => void) | null
  pastRunsCount?: number
  onActionMenu: (action: WorkflowActionMenuAction) => void
}

export function WorkflowPrimaryActions({
  controlGroupClass,
  isRunning,
  isSaving,
  showSave,
  saveFlash,
  primaryShortcutLabel,
  chatOpen,
  chatShortcutLabel,
  agentToggleRef,
  actionMenuDisabled = false,
  canOpenDefaults = false,
  flowDefaultsOpen = false,
  canManageCurrentFlow = false,
  canDeleteCurrentFlow = false,
  canDuplicateCurrentFlow = false,
  onSave,
  onToggleChat,
  onOpenRuns,
  pastRunsCount = 0,
  onActionMenu,
}: WorkflowPrimaryActionsProps) {
  const saveLabel = isSaving
    ? "Saving..."
    : saveFlash === "saved"
      ? "Saved"
      : "Save"
  const showActionMenu = !actionMenuDisabled

  return (
    <div className={controlGroupClass}>
      {showSave && !isRunning ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={saveFlash === "saved" ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={onSave}
              isLoading={isSaving}
            >
              {!isSaving &&
                (saveFlash === "saved" ? (
                  <Check size={14} />
                ) : (
                  <Save size={14} />
                ))}
              {saveLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save flow ({primaryShortcutLabel}S)</TooltipContent>
        </Tooltip>
      ) : null}

      {onOpenRuns && pastRunsCount > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:border-transparent hover:bg-surface-2/55"
              onClick={onOpenRuns}
              aria-label="View run history"
            >
              <GitBranch size={14} />
              Runs {pastRunsCount}
            </Button>
          </TooltipTrigger>
          <TooltipContent>View past runs</TooltipContent>
        </Tooltip>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            ref={agentToggleRef}
            className="gap-1.5 text-muted-foreground hover:border-transparent hover:bg-surface-2/55"
            onClick={onToggleChat}
            aria-label="Toggle Agent panel"
            aria-pressed={chatOpen}
          >
            <MessageSquare size={14} />
            Agent
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Toggle Agent panel ({chatShortcutLabel})
        </TooltipContent>
      </Tooltip>

      {showActionMenu ? (
        <WorkflowActionMenu
          disabled={actionMenuDisabled}
          canOpenDefaults={canOpenDefaults}
          flowDefaultsOpen={flowDefaultsOpen}
          canManageCurrentFlow={canManageCurrentFlow}
          canDelete={canDeleteCurrentFlow}
          canDuplicate={canDuplicateCurrentFlow}
          onAction={onActionMenu}
        />
      ) : null}
    </div>
  )
}
