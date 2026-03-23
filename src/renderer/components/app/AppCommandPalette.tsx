import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  Activity,
  Command,
  FilePlus2,
  FlaskConical,
  Folder,
  History,
  Inbox,
  LayoutTemplate,
  Loader2,
  PanelRight,
  Play,
  Redo2,
  Save,
  Search,
  Settings2,
  Square,
  Undo2,
  Zap,
} from "lucide-react"
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
  if (entry.kind === "desktop_command") return desktopCommandIcon(entry)
  return actionIcon(entry.action)
}

function actionIcon(action: AppShellCommandAction) {
  if (action === "new_process") return FilePlus2
  if (action === "add_project") return Folder
  if (action === "runs_dashboard") return Activity
  if (action === "process_library") return LayoutTemplate
  if (action === "lab") return FlaskConical
  if (action === "skills") return Zap
  if (action === "attach_skill") return Zap
  if (action === "inbox") return Inbox
  return Settings2
}

function desktopCommandIcon(entry: AppShellDesktopCommandEntry) {
  if (
    entry.commandId === "file.save" ||
    entry.commandId === "file.save_as" ||
    entry.commandId === "file.export"
  )
    return Save
  if (entry.commandId === "edit.undo") return Undo2
  if (entry.commandId === "edit.redo") return Redo2
  if (entry.commandId === "view.defaults") return Settings2
  if (entry.commandId === "view.edit_flow") return LayoutTemplate
  if (entry.commandId === "view.toggle_agent_panel") return PanelRight
  if (
    entry.commandId === "flow.run" ||
    entry.commandId === "flow.run_again" ||
    entry.commandId === "flow.rerun_from_step"
  )
    return Play
  if (entry.commandId === "flow.cancel") return Square
  if (entry.commandId === "flow.history") return History
  if (entry.commandId === "flow.batch_run") return Activity
  return Command
}

const EMPTY_STATE_SUGGESTIONS = [
  "Try a flow name, project folder, or action",
  "Type a goal to start a new flow",
  "Open Inbox to finish pending approvals and tasks",
] as const

function isActionEntry(
  entry: AppShellCommandEntry,
): entry is AppShellActionEntry {
  return entry.kind === "action"
}

function isWorkflowEntry(
  entry: AppShellCommandEntry,
): entry is AppShellWorkflowEntry {
  return entry.kind === "workflow"
}

function isProjectEntry(
  entry: AppShellCommandEntry,
): entry is AppShellProjectEntry {
  return entry.kind === "project"
}

function isDesktopCommandEntry(
  entry: AppShellCommandEntry,
): entry is AppShellDesktopCommandEntry {
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
  const listboxId = useId()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectionMode, setSelectionMode] = useState<"pointer" | "keyboard">(
    "pointer",
  )

  const sections = useMemo(
    () =>
      buildAppShellCommandSections({
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
  const selectedEntry = filteredEntries[selectedIndex] || null
  const usesMacGlyphs = primaryModifierLabel === "⌘"
  const optionIdForIndex = (index: number) => `${listboxId}-option-${index}`

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
    if (entry.kind === "project") {
      setQuery("")
      setSelectedIndex(0)
      setSelectionMode("pointer")
      window.requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      return
    }
    onOpenChange(false)
  }

  const entryShortcutLabel = (entry: AppShellCommandEntry) => {
    if (entry.kind === "action") {
      if (entry.action === "new_process") return `${primaryModifierLabel}N`
      if (entry.action === "attach_skill")
        return `${primaryModifierLabel}${usesMacGlyphs ? "⇧" : "+Shift+"}S`
      if (entry.action === "settings") return `${primaryModifierLabel},`
      return null
    }
    if (entry.kind !== "desktop_command") return null
    if (entry.commandId === "file.save") return `${primaryModifierLabel}S`
    if (entry.commandId === "edit.undo") return `${primaryModifierLabel}Z`
    if (entry.commandId === "edit.redo")
      return `${primaryModifierLabel}${usesMacGlyphs ? "⇧" : "+Shift+"}Z`
    if (entry.commandId === "flow.run")
      return `${primaryModifierLabel}${usesMacGlyphs ? "↵" : "+Enter"}`
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
                        filteredEntries.length === 0
                          ? 0
                          : Math.min(previous + 1, filteredEntries.length - 1),
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
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    selectedEntry ? optionIdForIndex(selectedIndex) : undefined
                  }
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
          <CanvasDialogBody
            id={listboxId}
            role="listbox"
            aria-label="Command palette results"
            className="py-2"
          >
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
                    <p className="command-center-section-label">
                      {section.label}
                    </p>
                    {section.entries.map((entry) => {
                      const index = filteredEntries.findIndex(
                        (candidate) => candidate.id === entry.id,
                      )
                      const isSelected = index === selectedIndex
                      const Icon = entryIcon(entry)
                      const shortcutLabel = entryShortcutLabel(entry)
                      return (
                        <button
                          key={entry.id}
                          id={optionIdForIndex(index)}
                          type="button"
                          role="option"
                          ref={(node) => {
                            itemRefs.current[entry.id] = node
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault()
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
                          aria-selected={isSelected}
                        >
                          <span className="command-center-icon">
                            {entry.kind === "workflow" ? (
                              entry.active ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <span className="command-center-dot" />
                              )
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
                          ) : shortcutLabel ? (
                            <span className="command-center-kbd">
                              {shortcutLabel}
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
            <span>
              <kbd className="command-center-kbd">↑</kbd>
              <kbd className="command-center-kbd">↓</kbd> Move
            </span>
            <span>
              <kbd className="command-center-kbd">Home</kbd>
              <kbd className="command-center-kbd">End</kbd> Jump
            </span>
            <span>
              <kbd className="command-center-kbd">Enter</kbd> Open
            </span>
            <span>
              <kbd className="command-center-kbd">Esc</kbd> Close
            </span>
          </div>
          <span className="text-sidebar-meta text-muted-foreground">
            Start, open, switch
          </span>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
