import { useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { mcpDiscoveredToolsAtom } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/cn"
import {
  overlayContentBase,
  overlayItemBase,
  overlayItemFocus,
  overlayItemHighlighted,
  overlayItemHover,
  overlayItemTransition,
} from "@/lib/overlay-styles"
import { X } from "lucide-react"
import type { McpToolInfo } from "@shared/types"

// Well-known built-in tools
const BUILTIN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoRead",
  "TodoWrite",
  "NotebookRead",
  "NotebookEdit",
]

interface ToolSuggestion {
  label: string
  value: string
  group: string
  description?: string
}

function buildSuggestions(mcpTools: McpToolInfo[]): ToolSuggestion[] {
  const suggestions: ToolSuggestion[] = []

  for (const tool of BUILTIN_TOOLS) {
    suggestions.push({ label: tool, value: tool, group: "Built-in Tools" })
  }

  // Group MCP tools by server
  const byServer = new Map<string, McpToolInfo[]>()
  for (const tool of mcpTools) {
    const list = byServer.get(tool.serverName) || []
    list.push(tool)
    byServer.set(tool.serverName, list)
  }

  for (const [serverName, tools] of byServer) {
    for (const tool of tools) {
      suggestions.push({
        label: tool.name,
        value: tool.qualifiedName,
        group: `${serverName} (MCP)`,
        description: tool.description,
      })
    }
  }

  return suggestions
}

export function McpToolPicker({
  nodeId,
  label,
  values,
  onChange,
  placeholder,
}: {
  nodeId: string
  label: string
  values: string[]
  onChange: (next: string[] | undefined) => void
  placeholder: string
}) {
  const [mcpTools] = useAtom(mcpDiscoveredToolsAtom)
  const [draft, setDraft] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownId = `tool-picker-${nodeId}-listbox`

  const normalizedValues = values.filter(Boolean)
  const suggestions = buildSuggestions(mcpTools)

  // Filter suggestions by draft text and exclude already selected
  const filtered = draft.trim()
    ? suggestions.filter(
        (s) =>
          !normalizedValues.includes(s.value) &&
          (s.label.toLowerCase().includes(draft.toLowerCase()) ||
            s.value.toLowerCase().includes(draft.toLowerCase())),
      )
    : suggestions.filter((s) => !normalizedValues.includes(s.value))

  // Group filtered suggestions
  const grouped = new Map<string, ToolSuggestion[]>()
  for (const s of filtered) {
    const list = grouped.get(s.group) || []
    list.push(s)
    grouped.set(s.group, list)
  }

  const flatFiltered = filtered

  useEffect(() => {
    setHighlightIndex(0)
  }, [draft])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const addValue = (value: string) => {
    const next = [...new Set([...normalizedValues, value])]
    onChange(next.length > 0 ? next : undefined)
    setDraft("")
    setShowDropdown(false)
  }

  const removeValue = (value: string) => {
    const next = normalizedValues.filter((v) => v !== value)
    onChange(next.length > 0 ? next : undefined)
  }

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    addValue(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || flatFiltered.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault()
        commitDraft()
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightIndex((prev) => Math.min(prev + 1, flatFiltered.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (flatFiltered[highlightIndex]) {
          addValue(flatFiltered[highlightIndex].value)
        } else {
          commitDraft()
        }
        break
      case "Escape":
        setShowDropdown(false)
        break
    }
  }

  // Determine display label for a tool value
  const getDisplayLabel = (value: string) => {
    const suggestion = suggestions.find((s) => s.value === value)
    if (suggestion && suggestion.value !== suggestion.label) {
      return { label: suggestion.label, server: suggestion.group }
    }
    // Check if it's an MCP qualified name
    const mcpMatch = value.match(/^mcp__([^_]+)__(.+)$/)
    if (mcpMatch) {
      return { label: mcpMatch[2], server: `${mcpMatch[1]} (MCP)` }
    }
    return { label: value, server: null }
  }

  return (
    <div className="space-y-1">
      <Label className="ui-meta-text text-muted-foreground">{label}</Label>

      {/* Tags */}
      {normalizedValues.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {normalizedValues.map((value) => {
            const display = getDisplayLabel(value)
            return (
              <span
                key={value}
                className="control-badge control-badge-compact gap-1 border border-border bg-surface-1/70 pr-1 text-body-sm text-foreground"
              >
                <span className="font-mono">{display.label}</span>
                {display.server && (
                  <span className="ui-meta-text font-normal text-muted-foreground">
                    {display.server}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeValue(value)}
                  className="ui-icon-button ml-0.5 size-4 rounded-sm"
                  aria-label={`Remove ${display.label}`}
                >
                  <X size={10} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Input with autocomplete */}
      <div className="relative">
        <Input
          ref={inputRef}
          id={`tool-picker-${nodeId}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown && flatFiltered.length > 0}
          aria-controls={dropdownId}
          aria-activedescendant={
            showDropdown && flatFiltered[highlightIndex]
              ? `${dropdownId}-option-${highlightIndex}`
              : undefined
          }
          placeholder={placeholder}
          className="h-control-sm font-mono text-body-sm"
        />

        {showDropdown && flatFiltered.length > 0 && (
          <div
            ref={dropdownRef}
            id={dropdownId}
            role="listbox"
            aria-multiselectable="true"
            className={cn(
              overlayContentBase,
              "absolute left-0 right-0 top-full mt-1 max-h-[240px] overflow-y-auto ui-scroll-region",
            )}
          >
            {[...grouped.entries()].map(([group, items]) => (
              <div key={group}>
                <div className="px-2 py-1 ui-meta-text text-muted-foreground font-medium bg-surface-2/80 sticky top-0">
                  {group}
                </div>
                {items.map((item) => {
                  const idx = flatFiltered.indexOf(item)
                  return (
                    <button
                      id={`${dropdownId}-option-${idx}`}
                      key={item.value}
                      type="button"
                      role="option"
                      aria-selected={idx === highlightIndex}
                      data-highlighted={idx === highlightIndex ? "" : undefined}
                      className={cn(
                        overlayItemBase,
                        overlayItemHover,
                        overlayItemFocus,
                        overlayItemHighlighted,
                        overlayItemTransition,
                        "w-full text-left",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        addValue(item.value)
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                    >
                      <span className="font-mono">{item.label}</span>
                      {item.description && (
                        <span className="ml-2 ui-meta-text text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
