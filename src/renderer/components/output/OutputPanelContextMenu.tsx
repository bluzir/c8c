import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import type { ArtifactRecord } from "@shared/types"

export type OutputPanelContextMenuState =
  | { x: number, y: number, scope: "result" }
  | { x: number, y: number, scope: "artifact", artifact: ArtifactRecord }
  | null

export function OutputPanelContextMenu({
  contextMenu,
  onOpenChange,
  onUseInNewFlow,
  useInNewFlowLabel = "Continue with Agent",
  canCopyResult,
  onCopyResult,
  reportPath,
  onOpenReport,
  onOpenArtifacts,
  hasArtifacts,
  onOpenArtifact,
  onCopyArtifactPath,
}: {
  contextMenu: OutputPanelContextMenuState
  onOpenChange: (open: boolean) => void
  onUseInNewFlow?: (() => Promise<void> | void) | null
  useInNewFlowLabel?: string
  canCopyResult: boolean
  onCopyResult: () => Promise<void> | void
  reportPath?: string | null
  onOpenReport: (path: string) => Promise<void> | void
  onOpenArtifacts?: (() => void) | null
  hasArtifacts: boolean
  onOpenArtifact: (artifact: ArtifactRecord) => Promise<void> | void
  onCopyArtifactPath: (artifact: ArtifactRecord) => Promise<void> | void
}) {
  const closeMenu = () => {
    onOpenChange(false)
  }

  return (
    <CursorMenu
      open={contextMenu !== null}
      x={contextMenu?.x || 0}
      y={contextMenu?.y || 0}
      onOpenChange={onOpenChange}
    >
      {contextMenu?.scope === "result" && (
        <>
          <DropdownMenuLabel>Result</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!onUseInNewFlow}
            onSelect={() => {
              if (!onUseInNewFlow) return
              void Promise.resolve(onUseInNewFlow())
              closeMenu()
            }}
          >
            {useInNewFlowLabel}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canCopyResult}
            onSelect={() => {
              void Promise.resolve(onCopyResult())
              closeMenu()
            }}
          >
            Copy as report
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!reportPath}
            onSelect={() => {
              if (!reportPath) return
              void Promise.resolve(onOpenReport(reportPath))
              closeMenu()
            }}
          >
            Open report file
          </DropdownMenuItem>
          {onOpenArtifacts && hasArtifacts ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  onOpenArtifacts()
                  closeMenu()
                }}
              >
                Open in artifacts
              </DropdownMenuItem>
            </>
          ) : null}
        </>
      )}
      {contextMenu?.scope === "artifact" && (
        <>
          <DropdownMenuLabel>{contextMenu.artifact.title}</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => {
              void Promise.resolve(onOpenArtifact(contextMenu.artifact))
              closeMenu()
            }}
          >
            Open file
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void Promise.resolve(onCopyArtifactPath(contextMenu.artifact))
              closeMenu()
            }}
          >
            Copy path
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onOpenArtifacts}
            onSelect={() => {
              if (!onOpenArtifacts) return
              onOpenArtifacts()
              closeMenu()
            }}
          >
            Open in artifacts
          </DropdownMenuItem>
        </>
      )}
    </CursorMenu>
  )
}
