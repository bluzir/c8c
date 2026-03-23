import { CursorMenu } from "@/components/ui/cursor-menu"
import { ShortcutHint } from "@/components/ui/shortcut-hint"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

interface ChainBuilderContextMenuProps {
  open: boolean
  x: number
  y: number
  stepLabel: string | null
  moveUpDisabledReason: string | null
  moveDownDisabledReason: string | null
  removeDisabled: boolean
  onOpenChange: (open: boolean) => void
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

export function ChainBuilderContextMenu({
  open,
  x,
  y,
  stepLabel,
  moveUpDisabledReason,
  moveDownDisabledReason,
  removeDisabled,
  onOpenChange,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ChainBuilderContextMenuProps) {
  return (
    <CursorMenu open={open} x={x} y={y} onOpenChange={onOpenChange}>
      {stepLabel && (
        <>
          <DropdownMenuLabel>{stepLabel}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onSelect}>Select step</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={Boolean(moveUpDisabledReason)}
            title={moveUpDisabledReason || undefined}
            onSelect={() => {
              if (moveUpDisabledReason) return
              onMoveUp()
            }}
          >
            Move up
            <ShortcutHint label="Alt+Up" />
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(moveDownDisabledReason)}
            title={moveDownDisabledReason || undefined}
            onSelect={() => {
              if (moveDownDisabledReason) return
              onMoveDown()
            }}
          >
            Move down
            <ShortcutHint label="Alt+Down" />
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={removeDisabled}
            onSelect={() => {
              if (removeDisabled) return
              onRemove()
            }}
          >
            Remove step
            <ShortcutHint label="Delete" />
          </DropdownMenuItem>
        </>
      )}
    </CursorMenu>
  )
}
