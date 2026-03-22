import { BarChart3, GitFork, Hand, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ChainBuilderAddControlsProps {
  compact: boolean
  hasSkillNodes: boolean
  primaryModifierLabel: string
  onAddSkill: () => void
  onAddStep: (value: "evaluator" | "fanout" | "human" | "approval") => void
}

export function ChainBuilderAddControls({
  compact,
  hasSkillNodes,
  primaryModifierLabel,
  onAddSkill,
  onAddStep,
}: ChainBuilderAddControlsProps) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg control-cluster p-1", compact ? "pt-1" : "pt-2")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="flex-1 border-dashed bg-surface-1/80"
            onClick={onAddSkill}
            title={`Add skill step (A / ${primaryModifierLabel}ShiftA)`}
          >
            <Plus size={16} />
            Add skill step
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`Add a skill step (A / ${primaryModifierLabel}ShiftA)`}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("justify-start bg-surface-1/80", compact ? "w-[170px]" : "w-[196px]")}
          >
            <GitFork size={14} />
            Add step
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Add step</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!hasSkillNodes}
            onSelect={() => onAddStep("evaluator")}
            className="items-start gap-2 py-2"
            title={!hasSkillNodes ? "Add at least one skill node before inserting a check." : undefined}
          >
            <BarChart3 size={13} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-body-sm font-medium text-foreground">Add Check</div>
              <div className="ui-meta-text text-muted-foreground">
                {hasSkillNodes
                  ? "Check the previous output and branch or retry when it misses the mark."
                  : "Requires at least one skill node before it can evaluate anything."}
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onAddStep("fanout")}
            className="items-start gap-2 py-2"
          >
            <GitFork size={13} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-body-sm font-medium text-foreground">Add Split Work</div>
              <div className="ui-meta-text text-muted-foreground">
                Add a split, branch, and merge scaffold for parallel work.
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onAddStep("human")}
            className="items-start gap-2 py-2"
          >
            <Hand size={13} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-body-sm font-medium text-foreground">Add Human Input</div>
              <div className="ui-meta-text text-muted-foreground">
                Pause the flow until someone provides the missing information.
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onAddStep("approval")}
            className="items-start gap-2 py-2"
          >
            <Hand size={13} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-body-sm font-medium text-foreground">Add Approval</div>
              <div className="ui-meta-text text-muted-foreground">
                Stop after a step so you can review it before the flow continues.
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
