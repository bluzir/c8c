import { useRef, useEffect } from "react"
import { File } from "lucide-react"
import { cn } from "@/lib/cn"
import { overlayContent, overlayItem } from "@/lib/overlay-styles"

interface AtMentionDropdownProps {
  files: { name: string; relativePath: string }[]
  loading: boolean
  query: string
  highlightIndex: number
  existingPaths: Set<string>
  onSelect: (file: { name: string; relativePath: string }) => void
  onHighlight: (index: number) => void
}

export function AtMentionDropdown({
  files,
  loading,
  query,
  highlightIndex,
  existingPaths,
  onSelect,
  onHighlight,
}: AtMentionDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: "nearest" })
  }, [highlightIndex])

  return (
    <div
      className={cn(overlayContent, "absolute left-0 right-0 top-full mt-1")}
      role="listbox"
      aria-label="File suggestions"
    >
      {loading && (
        <div className="px-3 py-4 text-center text-body-sm text-muted-foreground">
          Loading files…
        </div>
      )}
      {!loading && files.length === 0 && (
        <div className="px-3 py-4 text-center text-body-sm text-muted-foreground">
          {query ? `No files matching "${query}"` : "No files found"}
        </div>
      )}
      {!loading && files.length > 0 && (
        <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
          {files.map((file, i) => {
            const alreadyAdded = existingPaths.has(file.relativePath)
            return (
              <button
                key={file.relativePath}
                type="button"
                role="option"
                aria-selected={i === highlightIndex}
                data-highlighted={i === highlightIndex ? "" : undefined}
                data-disabled={alreadyAdded ? "" : undefined}
                disabled={alreadyAdded}
                className={cn(
                  overlayItem,
                  "ui-interactive-card-subtle",
                  "w-full text-left",
                )}
                onMouseEnter={() => onHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!alreadyAdded) onSelect(file)
                }}
              >
                <File
                  size={13}
                  className="flex-shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">{file.relativePath}</span>
                {alreadyAdded && (
                  <span className="ml-auto ui-meta-text text-muted-foreground flex-shrink-0">
                    Added
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
