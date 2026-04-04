import { useCallback, useEffect, useState } from "react"
import {
  Dialog,
  CanvasDialogContent,
  CanvasDialogHeader,
  CanvasDialogBody,
} from "@/components/ui/dialog"
import { DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { ArtifactRecord } from "@shared/types"
import { FileText, FolderOpen } from "lucide-react"

interface ChatFilesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  artifacts: ArtifactRecord[]
}

function formatArtifactKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ChatFilesDialog({
  open,
  onOpenChange,
  artifacts,
}: ChatFilesDialogProps) {
  const openArtifact = useCallback((artifact: ArtifactRecord) => {
    void window.api.openPath(artifact.contentPath)
  }, [])

  const allFilesDir = artifacts[0]?.contentPath?.replace(/[/\\][^/\\]+$/, "")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent size="lg">
        <CanvasDialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Files in this thread</DialogTitle>
            <Badge variant="outline" size="compact">
              {artifacts.length}
            </Badge>
          </div>
        </CanvasDialogHeader>
        <CanvasDialogBody>
          {artifacts.length === 0 ? (
            <p className="text-body-sm text-muted-foreground py-4 text-center">
              No files yet. Files will appear here as the flow produces results.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {artifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => openArtifact(artifact)}
                    className="flex items-center gap-3 rounded-md border border-hairline bg-surface-1/40 px-3 py-2.5 text-left ui-motion-fast hover:bg-surface-2/30"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md surface-info-soft">
                      <FileText size={16} className="text-status-info" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium text-foreground">
                        {artifact.title}
                      </p>
                      <p className="ui-meta-text text-muted-foreground">
                        {formatArtifactKind(artifact.kind)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {allFilesDir && (
                <button
                  type="button"
                  className="flex items-center gap-1.5 ui-pressable ui-meta-text text-muted-foreground hover:text-foreground ui-motion-fast"
                  onClick={() => void window.api.showInFinder(allFilesDir)}
                >
                  <FolderOpen size={12} />
                  Open folder
                </button>
              )}
            </div>
          )}
        </CanvasDialogBody>
      </CanvasDialogContent>
    </Dialog>
  )
}
