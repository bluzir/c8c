import {
  useState,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useCallback,
} from "react"
import { useAtom } from "jotai"
import { toastErrorFromCatch } from "@/lib/toast-error"
import { selectedProjectAtom } from "@/lib/store"
import { Textarea } from "@/components/ui/textarea"
import { AtMentionDropdown } from "@/components/input/AtMentionDropdown"

const MAX_RESULTS = 32

const EMPTY_SET = new Set<string>()

interface TextareaWithMentionProps extends React.ComponentProps<
  typeof Textarea
> {
  /** Called when a file is selected via @. If provided, the path is NOT inserted inline. */
  onFileMention?: (file: { name: string; relativePath: string }) => void
  /** Already-attached file paths to grey out in dropdown. */
  existingFilePaths?: Set<string>
}

export const TextareaWithMention = forwardRef<
  HTMLTextAreaElement,
  TextareaWithMentionProps
>(
  (
    {
      onFileMention,
      existingFilePaths,
      onChange,
      onKeyDown,
      onBlur,
      value,
      ...rest
    },
    externalRef,
  ) => {
    const [selectedProject] = useAtom(selectedProjectAtom)
    const internalRef = useRef<HTMLTextAreaElement>(null)

    // Merge external + internal refs
    const mergedRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node
        if (typeof externalRef === "function") externalRef(node)
        else if (externalRef)
          (
            externalRef as React.MutableRefObject<HTMLTextAreaElement | null>
          ).current = node
      },
      [externalRef],
    )

    // @ mention state
    const [mentionActive, setMentionActive] = useState(false)
    const [mentionQuery, setMentionQuery] = useState("")
    const [mentionStart, setMentionStart] = useState(-1)
    const [highlightIndex, setHighlightIndex] = useState(0)

    // File list
    const [files, setFiles] = useState<
      { name: string; relativePath: string }[]
    >([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
      if (!mentionActive || !selectedProject) {
        setLoading(false)
        return
      }

      let cancelled = false
      setLoading(true)
      window.api
        .listProjectFiles(selectedProject)
        .then((result) => {
          if (cancelled) return
          setFiles(result)
          setLoading(false)
        })
        .catch((error) => {
          if (cancelled) return
          setFiles([])
          setLoading(false)
          toastErrorFromCatch("Could not load project files", error)
        })

      return () => {
        cancelled = true
      }
    }, [mentionActive, selectedProject])

    const filtered = useMemo(() => {
      if (!mentionActive) return []
      if (!mentionQuery) return files.slice(0, MAX_RESULTS)
      const q = mentionQuery.toLowerCase()
      return files
        .filter((f) => f.relativePath.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS)
    }, [mentionActive, mentionQuery, files])

    useEffect(() => {
      setHighlightIndex(0)
    }, [mentionQuery])

    const existingPaths = existingFilePaths ?? EMPTY_SET

    const closeMention = useCallback(() => {
      setMentionActive(false)
      setMentionQuery("")
      setMentionStart(-1)
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e)

      const val = e.target.value
      const cursorPos = e.target.selectionStart ?? val.length
      const textBefore = val.slice(0, cursorPos)
      const atIdx = textBefore.lastIndexOf("@")

      if (atIdx >= 0) {
        const charBefore = atIdx > 0 ? textBefore[atIdx - 1] : " "
        const queryAfterAt = textBefore.slice(atIdx + 1)
        if (
          (charBefore === " " ||
            charBefore === "\n" ||
            charBefore === "\t" ||
            atIdx === 0) &&
          !/\s/.test(queryAfterAt)
        ) {
          setMentionActive(true)
          setMentionQuery(queryAfterAt)
          setMentionStart(atIdx)
          return
        }
      }

      closeMention()
    }

    const handleSelect = (file: { name: string; relativePath: string }) => {
      if (existingPaths.has(file.relativePath)) return

      const currentValue = (value as string) ?? ""
      const before = currentValue.slice(0, mentionStart)
      const after = currentValue.slice(mentionStart + 1 + mentionQuery.length)
      const insertion = onFileMention ? "" : file.relativePath
      const newValue = before + insertion + after

      const syntheticEvent = {
        target: { value: newValue },
        currentTarget: { value: newValue },
      } as React.ChangeEvent<HTMLTextAreaElement>
      onChange?.(syntheticEvent)

      if (onFileMention) onFileMention(file)

      closeMention()

      requestAnimationFrame(() => {
        const ta = internalRef.current
        if (ta) {
          const cursorPos = before.length + insertion.length
          ta.focus()
          ta.setSelectionRange(cursorPos, cursorPos)
        }
      })
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionActive && filtered.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setHighlightIndex((i) => Math.max(i - 1, 0))
          return
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault()
          const file = filtered[highlightIndex]
          if (file) handleSelect(file)
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          closeMention()
          return
        }
      }

      onKeyDown?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      closeMention()
      onBlur?.(e)
    }

    return (
      <div className="relative">
        <Textarea
          ref={mergedRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-expanded={mentionActive || undefined}
          aria-autocomplete={mentionActive ? "list" : undefined}
          {...rest}
        />
        {mentionActive && (
          <AtMentionDropdown
            files={filtered}
            loading={loading}
            query={mentionQuery}
            highlightIndex={highlightIndex}
            existingPaths={existingPaths}
            onSelect={handleSelect}
            onHighlight={setHighlightIndex}
          />
        )}
      </div>
    )
  },
)
TextareaWithMention.displayName = "TextareaWithMention"
