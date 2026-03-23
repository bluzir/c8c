import { useState, useEffect, useMemo } from "react"
import { useAtom } from "jotai"
import { selectedProjectAtom, inputAttachmentsAtom } from "@/lib/store"
import { Search, File } from "lucide-react"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface FilePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FilePicker({ open, onOpenChange }: FilePickerProps) {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [attachments, setAttachments] = useAtom(inputAttachmentsAtom)
  const [search, setSearch] = useState("")
  const [files, setFiles] = useState<{ name: string; relativePath: string }[]>(
    [],
  )
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open || !selectedProject) return
    setLoading(true)
    setLoadError(null)
    window.api
      .listProjectFiles(selectedProject)
      .then((result) => {
        setFiles(result)
        setLoading(false)
      })
      .catch((error) => {
        setFiles([])
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not read project files.",
        )
        setLoading(false)
      })
  }, [open, reloadKey, selectedProject])

  const filtered = useMemo(() => {
    if (!search) return files
    const q = search.toLowerCase()
    return files.filter((f) => f.relativePath.toLowerCase().includes(q))
  }, [files, search])

  const existingPaths = useMemo(
    () =>
      new Set(attachments.filter((a) => a.kind === "file").map((a) => a.path)),
    [attachments],
  )

  const handleSelect = (file: { name: string; relativePath: string }) => {
    if (existingPaths.has(file.relativePath)) return
    setAttachments((prev) => [
      ...prev,
      { kind: "file" as const, path: file.relativePath, name: file.name },
    ])
    onOpenChange(false)
  }

  // Group files by directory
  const grouped = useMemo(() => {
    const groups = new Map<string, { name: string; relativePath: string }[]>()
    for (const file of filtered) {
      const parts = file.relativePath.split("/")
      const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "."
      const list = groups.get(dir) || []
      list.push(file)
      groups.set(dir, list)
    }
    return groups
  }, [filtered])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        className="p-0 gap-0 max-h-[75vh] flex flex-col"
        showCloseButton
      >
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle>Attach File</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a project file to attach as context
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="flex flex-col min-h-0 p-0">
          <div className="surface-panel ui-dialog-gutter py-3 border-b border-hairline">
            <div className="relative">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files..."
                aria-label="Search files"
                autoFocus
                className="pl-8"
              />
            </div>
          </div>

          <div className="ui-slab ui-scroll-region flex-1 overflow-y-auto px-3 py-2">
            {loading && (
              <div className="ui-empty-state text-body-md text-muted-foreground">
                Loading files...
              </div>
            )}
            {!loading && loadError && (
              <div
                role="alert"
                aria-live="assertive"
                className="ui-empty-state px-4"
              >
                <p className="text-body-md font-medium text-foreground">
                  Could not load project files
                </p>
                <p className="text-body-sm text-status-danger">{loadError}</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReloadKey((value) => value + 1)}
                  >
                    Retry
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
            {!loading && !loadError && files.length === 0 && (
              <div className="ui-empty-state text-body-md text-muted-foreground">
                No files found in project.
              </div>
            )}
            {!loading &&
              !loadError &&
              files.length > 0 &&
              grouped.size === 0 && (
                <div className="ui-empty-state text-body-md text-muted-foreground">
                  No results for &ldquo;{search}&rdquo;
                </div>
              )}
            {!loadError &&
              Array.from(grouped.entries()).map(([dir, dirFiles]) => (
                <div key={dir} className="mb-3">
                  <div className="px-2 py-1 section-kicker">{dir}</div>
                  {dirFiles.map((file) => {
                    const alreadyAdded = existingPaths.has(file.relativePath)
                    return (
                      <Button
                        type="button"
                        key={file.relativePath}
                        onClick={() => handleSelect(file)}
                        disabled={alreadyAdded}
                        aria-label={`Attach ${file.relativePath}`}
                        variant="ghost"
                        size="auto"
                        className="ui-interactive-card h-auto w-full justify-start gap-3 rounded-md px-2 py-1.5 text-left whitespace-normal disabled:opacity-40"
                      >
                        <File
                          size={14}
                          aria-hidden="true"
                          className="text-muted-foreground flex-shrink-0"
                        />
                        <span className="text-body-sm truncate">
                          {file.name}
                        </span>
                        {alreadyAdded && (
                          <span className="control-badge control-badge-compact ml-auto surface-success-soft ui-meta-text text-status-success">
                            Added
                          </span>
                        )}
                      </Button>
                    )
                  })}
                </div>
              ))}
          </div>
        </CanvasDialogBody>
      </CanvasDialogContent>
    </Dialog>
  )
}
