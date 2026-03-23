import { Search, X } from "lucide-react"
import { useState, useRef, useEffect, useMemo, useId } from "react"
import { useAtom } from "jotai"
import { skillsAtom } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/cn"
import { getSkillSourceLabel } from "@/lib/skill-source"
import { overlayContent, overlayItem } from "@/lib/overlay-styles"

interface SkillRefInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  onBrowseAllSkills?: () => void
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

export function SkillRefInput({
  id,
  value,
  onChange,
  placeholder,
  className,
  onBrowseAllSkills,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SkillRefInputProps) {
  const [skills] = useAtom(skillsAtom)
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return skills.slice(0, 12)
    return skills
      .filter((s) => {
        const ref = `${s.category}/${s.name}`.toLowerCase()
        return (
          ref.includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        )
      })
      .slice(0, 12)
  }, [skills, value])

  useEffect(() => {
    setFocusIndex(-1)
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectSuggestion = (skill: (typeof skills)[0]) => {
    onChange(`${skill.category}/${skill.name}`)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocusIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocusIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && focusIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[focusIndex])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const showListbox = open && suggestions.length > 0
  const activeOptionId =
    focusIndex >= 0 ? `${listboxId}-option-${focusIndex}` : undefined

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          onBrowseAllSkills || value ? "pr-16" : undefined,
          className,
        )}
        autoComplete="off"
        aria-expanded={showListbox}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
      {onBrowseAllSkills ? (
        <button
          type="button"
          className={cn(
            "ui-icon-button absolute top-1/2 -translate-y-1/2",
            value ? "right-8" : "right-1.5",
          )}
          aria-label="Browse all skills"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen(false)
            onBrowseAllSkills()
          }}
        >
          <Search size={12} />
        </button>
      ) : null}
      {value ? (
        <button
          type="button"
          className="ui-icon-button absolute right-1.5 top-1/2 -translate-y-1/2"
          aria-label="Clear skill reference"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("")
            setOpen(false)
          }}
        >
          <X size={12} />
        </button>
      ) : null}
      {showListbox && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Skill suggestions"
          className={cn(
            overlayContent,
            "absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto ui-scroll-region",
          )}
        >
          {suggestions.map((skill, i) => (
            <div
              key={`${skill.category}/${skill.name}`}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === focusIndex}
              className={cn(overlayItem, "w-full cursor-pointer text-left")}
              data-highlighted={i === focusIndex ? "" : undefined}
              onMouseDown={(e) => {
                e.preventDefault()
                selectSuggestion(skill)
              }}
            >
              <span className="ui-meta-text font-mono text-foreground">
                {skill.category}/{skill.name}
              </span>
              <span className="ml-2 ui-meta-text">
                {getSkillSourceLabel(skill)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
