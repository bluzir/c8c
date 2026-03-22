import { useEffect, useMemo, useRef, useState } from "react"
import { Activity, FilePlus2, Folder, Inbox, LayoutTemplate, Loader2, Search, Settings2, Zap } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/cn"
import {
  buildAppShellCommandSections,
  type AppShellActionEntry,
  type AppShellCommandAction,
  type AppShellCommandEntry,
  type AppShellDesktopCommandEntry,
  type AppShellProjectEntry,
  type AppShellWorkflowEntry,
} from "@/lib/app-shell-command-palette"

function entryIcon(entry: AppShellCommandEntry) {
  if (entry.kind === "start") return FilePlus2
  if (entry.kind === "project") return Folder
  if (entry.kind === "workflow") return null
  if (entry.kind === "desktop_command") return null
  return actionIcon(entry.action)
}

function actionIcon(action: AppShellCommandAction) {
  if (action === "new_process") return FilePlus2
  if (action === "add_project") return Folder
  if (action === "runs_dashboard") return Activity
  if (action === "process_library") return LayoutTemplate
  if (action === "lab") return Activity
  if (action === "skills") return Zap
  if (action === "attach_skill") return Zap
  if (action === "inbox") return Inbox
  return Settings2
}

const EMPTY_STATE_SUGGESTIONS = [
  "Try a flow name, project folder, or action",
  "Use Start to open the guided flow setup",
  "Open Runs dashboard for active and recent flows",
] as const

function isActionEntry(entry: AppShellCommandEntry): entry is AppShellActionEntry {
  return entry.kind === "action"
}

function isWorkflowEntry(entry: AppShellCommandEntry): entry is AppShellWorkflowEntry {
  return entry.kind === "workflow"
}

function isProjectEntry(entry: AppShellCommandEntry): entry is AppShellProjectEntry {
  return entry.kind === "project"
}

function isDesktopCommandEntry(entry: AppShellCommandEntry): entry is AppShellDesktopCommandEntry {
  return entry.kind === "desktop_command"
}

interface AppCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: AppShellCommandEntry[]
  onSelect: (entry: AppShellCommandEntry) => void
  primaryModifierLabel: string
  selectedProject: string | null
  projects: string[]
}

export function AppCommandPalette({
  open,
  onOpenChange,
  entries,
  onSelect,
  primaryModifierLabel,
  selectedProject,
  projects,
}: AppCommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectionMode, setSelectionMode] = useState<"pointer" | "keyboard">("pointer")

  const sections = useMemo(
    () => buildAppShellCommandSections({
      query,
      actions: entries.filter(isActionEntry),
      desktopCommands: entries.filter(isDesktopCommandEntry),
      projectEntries: entries.filter(isProjectEntry),
      workflows: entries.filter(isWorkflowEntry),
      selectedProject,
      projects,
    }),
    [entries, projects, query, selectedProject],
  )
  const filteredEntries = useMemo(
    () => sections.flatMap((section) => section.entries),
    [sections],
  )

  useEffect(() => {
    if (!open) {
      setQuery("")
      setSelectedIndex(0)
      setSelectionMode("pointer")
      return
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const selectedEntry = filteredEntries[selectedIndex]
    if (!selectedEntry) return

    const frame = window.requestAnimationFrame(() => {
      const target = itemRefs.current[selectedEntry.id]
      if (!target || !listRef.current) return
      target.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [filteredEntries, open, selectedIndex])

  const handleActivate = (entry: AppShellCommandEntry) => {
    onSelect(entry)
    onOpenChange(false)
  }

  const entryShortcutLabel = (entry: AppShellCommandEntry) => {
    if (entry.kind === "action") {
      if (entry.action === "new_process") return `${primaryModifierLabel}N`
      if (entry.action === "attach_skill") return `${primaryModifierLabel}⇧S`
      if (entry.action === "settings") return `${primaryModifierLabel},`
      return null
    }
    if (entry.kind !== "desktop_command") return null
    if (entry.commandId === "file.save") return `${primaryModifierLabel}S`
    if (entry.commandId === "edit.undo") return `${primaryModifierLabel}Z`
    if (entry.commandId === "edit.redo") return `${primaryModifierLabel}⇧Z`
    if (entry.commandId === "flow.run") return `${primaryModifierLabel}↵`
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        size="lg"
        className="max-w-[44rem] gap-0 p-0"
        showCloseButton={false}
        aria-label="Command palette"
      >
        <CanvasDialogHeader className="command-center-header">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search flows, projects, and app actions.
          </DialogDescription>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="command-center-search-shell">
                <Search size={14} className="text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex((previous) =>
                        filteredEntries.length === 0 ? 0 : Math.min(previous + 1, filteredEntries.length - 1),
                      )
                      return
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex((previous) => Math.max(previous - 1, 0))
                      return
                    }
                    if (event.key === "Enter") {
                      const entry = filteredEntries[selectedIndex]
                      if (!entry) return
                      event.preventDefault()
                      handleActivate(entry)
                      return
                    }
                    if (event.key === "Home") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex(0)
                      return
                    }
                    if (event.key === "End") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex(Math.max(0, filteredEntries.length - 1))
                    }
                  }}
                  placeholder="Jump to a flow, project, or action"
                  className="h-auto border-0 bg-transparent px-0 py-0 text-body-md shadow-none focus-visible:ring-0"
                  aria-label="Search flows, projects, and actions"
                />
              </div>
              <span className="command-center-kbd">
                {primaryModifierLabel}K
              </span>
            </div>
            {selectedProject ? (
              <div className="px-1">
                <span className="text-sidebar-meta text-muted-foreground">
                  {`In ${selectedProject.split(/[\\/]/).filter(Boolean).pop() || selectedProject}`}
                </span>
              </div>
            ) : null}
          </div>
        </CanvasDialogHeader>

        <div
          ref={listRef}
          className="command-center-scroll"
          onPointerMove={() => {
            if (selectionMode !== "pointer") {
              setSelectionMode("pointer")
            }
          }}
        >
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {query
              ? filteredEntries.length === 0
                ? "No results"
                : `${filteredEntries.length} result${filteredEntries.length === 1 ? "" : "s"}`
              : ""}
          </span>
          <CanvasDialogBody className="py-2">
            {filteredEntries.length === 0 ? (
              <div className="command-center-empty">
                <span>Nothing matches this query</span>
                <div className="mt-2 space-y-1 text-sidebar-meta text-muted-foreground">
                  {EMPTY_STATE_SUGGESTIONS.map((suggestion) => (
                    <p key={suggestion}>{suggestion}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {sections.map((section) => (
                  <div key={section.id} className="command-center-section">
                    <p className="command-center-section-label">{section.label}</p>
                    {section.entries.map((entry) => {
                      const index = filteredEntries.findIndex((candidate) => candidate.id === entry.id)
                      const isSelected = index === selectedIndex
                      const Icon = entryIcon(entry)
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          ref={(node) => {
                            itemRefs.current[entry.id] = node
                          }}
                          onMouseEnter={() => {
                            if (selectionMode !== "pointer") return
                            setSelectedIndex(index)
                          }}
                          onFocus={() => {
                            setSelectionMode("keyboard")
                            setSelectedIndex(index)
                          }}
                          onClick={() => handleActivate(entry)}
                          className={cn(
                            "command-center-row",
                            isSelected && "command-center-row--selected",
                          )}
                          aria-current={isSelected ? "true" : undefined}
                        >
                          <span className="command-center-icon">
                            {entry.kind === "workflow" ? (
                              entry.active ? <Loader2 size={13} className="animate-spin" /> : <span className="command-center-dot" />
                            ) : Icon ? (
                              <Icon size={14} />
                            ) : (
                              <span className="command-center-dot" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-sm text-foreground">
                              {entry.label}
                            </span>
                            {entry.kind === "workflow" ? (
                              <span className="block truncate text-sidebar-meta text-muted-foreground">
                                {entry.projectLabel}
                              </span>
                            ) : entry.subtitle ? (
                              <span className="block truncate text-sidebar-meta text-muted-foreground">
                                {entry.subtitle}
                              </span>
                            ) : null}
                          </span>
                          {entry.kind === "workflow" ? (
                            entry.active ? null : (
                              <span className="command-center-meta">
                                {entry.metaLabel}
                              </span>
                            )
                          ) : entryShortcutLabel(entry) ? (
                            <span className="command-center-kbd">
                              {entryShortcutLabel(entry)}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </CanvasDialogBody>
        </div>
        <CanvasDialogFooter className="command-center-footer">
          <div className="flex flex-wrap items-center gap-3 text-sidebar-meta text-muted-foreground">
            <span><kbd className="command-center-kbd">↑</kbd><kbd className="command-center-kbd">↓</kbd> Move</span>
            <span><kbd className="command-center-kbd">Home</kbd><kbd className="command-center-kbd">End</kbd> Jump</span>
            <span><kbd className="command-center-kbd">Enter</kbd> Open</span>
            <span><kbd className="command-center-kbd">Esc</kbd> Close</span>
          </div>
          <span className="text-sidebar-meta text-muted-foreground">
            Start, open, switch
          </span>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
