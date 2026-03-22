import { Copy, Download, FolderOpen, Library, MoreHorizontal, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type WorkflowActionMenuAction =
  | "save_as"
  | "export_copy"
  | "save_as_template"
  | "import"
  | "refresh"
  | "blank"
  | "templates"
  | "generate"
  | "duplicate"
  | "rename"
  | "delete"

interface WorkflowActionMenuProps {
  disabled?: boolean
  canManageCurrentFlow: boolean
  canDelete: boolean
  canDuplicate: boolean
  onAction: (action: WorkflowActionMenuAction) => void
}

export function WorkflowActionMenu({
  disabled = false,
  canManageCurrentFlow,
  canDelete,
  canDuplicate,
  onAction,
}: WorkflowActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="More flow actions"
          disabled={disabled}
        >
          <MoreHorizontal size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Flow actions</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onAction("save_as")} disabled={disabled}>
          <Download size={14} />
          Save as
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("export_copy")} disabled={disabled}>
          <Copy size={14} />
          Export copy
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("save_as_template")} disabled={disabled}>
          <Library size={14} />
          Save to starting points
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("import")} disabled={disabled}>
          <FolderOpen size={14} />
          Import flow
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("refresh")} disabled={disabled}>
          <RefreshCw size={14} />
          Refresh project data
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAction("generate")} disabled={disabled}>
          <Sparkles size={14} />
          New flow with Agent
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("blank")} disabled={disabled}>
          <Plus size={14} />
          Blank flow
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("templates")} disabled={disabled}>
          <Library size={14} />
          Browse starting points
        </DropdownMenuItem>

        {canManageCurrentFlow ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction("duplicate")} disabled={!canDuplicate}>
              <Copy size={14} />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("rename")} disabled={disabled}>
              <Pencil size={14} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onAction("delete")}
              disabled={!canDelete}
              className="text-status-danger focus:text-status-danger"
            >
              <Trash2 size={14} />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
