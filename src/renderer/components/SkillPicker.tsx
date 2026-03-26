import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  skillsAtom,
  skillPickerRequestAtom,
  skillPickerOpenAtom,
  closeSkillPickerAtom,
  type DiscoveredSkill,
} from "@/lib/store"
import { getSkillSourceKey, getSkillSourceLabel } from "@/lib/skill-source"
import { Search, Zap, Bot, Terminal } from "lucide-react"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  compareSkillsForStage,
  deriveSkillProvenanceLabel,
  deriveSkillSourceBadge,
  deriveSkillStageFit,
} from "@/lib/skill-fit"

const TYPE_ICONS = {
  skill: Zap,
  agent: Bot,
  command: Terminal,
} as const

interface SkillWithFit {
  skill: DiscoveredSkill
  fit: ReturnType<typeof deriveSkillStageFit>
  sourceBadge: string
  provenanceLabel: string
}

const SkillRow = memo(function SkillRow({
  entry,
  isFeatured,
  onAdd,
}: {
  entry: SkillWithFit
  isFeatured: boolean
  onAdd: (skill: DiscoveredSkill) => void
}) {
  const { skill, fit, sourceBadge, provenanceLabel } = entry
  const Icon = TYPE_ICONS[skill.type]
  return (
    <Button
      type="button"
      onClick={() => onAdd(skill)}
      aria-label={`Add ${skill.name}`}
      variant="ghost"
      size="auto"
      className="ui-interactive-card h-auto w-full justify-start items-start gap-3 rounded-md px-2 py-2 text-left whitespace-normal"
    >
      <Icon
        size={16}
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="ui-badge-row">
          <span className="text-body-md font-medium truncate">
            {skill.name}
          </span>
          {fit.score > 1 ? (
            <Badge variant={isFeatured ? "success" : "outline"} size="compact">
              {fit.label}
            </Badge>
          ) : null}
          <Badge variant="outline" size="compact">
            {sourceBadge}
          </Badge>
        </div>
        <div className="mt-1 line-clamp-2 ui-meta-text">
          {skill.description}
        </div>
        {isFeatured ? (
          <div className="mt-1 ui-badge-row">
            <Badge variant="secondary" size="compact">
              {provenanceLabel}
            </Badge>
            <Badge variant="outline" size="compact">
              {skill.type}
            </Badge>
          </div>
        ) : (
          <div className="mt-1 ui-meta-text text-muted-foreground">
            {provenanceLabel}
          </div>
        )}
      </div>
      {!isFeatured && (
        <Badge variant="outline" size="compact" className="mt-0.5">
          {skill.type}
        </Badge>
      )}
    </Button>
  )
})

interface SkillPickerProps {
  onAddSkill: (skill: DiscoveredSkill) => void
  title?: string
  description?: string
  searchPlaceholder?: string
  emptyStateMessage?: string
  emptyResultsMessage?: (query: string) => string
  stageLabel?: string | null
  attachTargetLabel?: string
}

export function SkillPicker({
  onAddSkill,
  title = "Add skill",
  description = "Choose a skill to add to your flow",
  searchPlaceholder = "Search skills...",
  emptyStateMessage = "No skills available. Open a project with local skills, or visit Skills to connect a skill source.",
  emptyResultsMessage = (query) => `No results for “${query}”`,
  stageLabel = null,
  attachTargetLabel = "this flow",
}: SkillPickerProps) {
  const skills = useAtomValue(skillsAtom)
  const pickerOpen = useAtomValue(skillPickerOpenAtom)
  const request = useAtomValue(skillPickerRequestAtom)
  const closePicker = useSetAtom(closeSkillPickerAtom)
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const resolvedTitle = request?.title ?? title
  const resolvedDescription = request?.description ?? description
  const resolvedSearchPlaceholder =
    request?.searchPlaceholder ?? searchPlaceholder
  const resolvedEmptyStateMessage =
    request?.emptyStateMessage ?? emptyStateMessage
  const resolvedEmptyResultsMessage =
    request?.emptyResultsMessage ?? emptyResultsMessage
  const resolvedStageLabel = request?.stageLabel ?? stageLabel
  const resolvedAttachTargetLabel =
    request?.attachTargetLabel ?? attachTargetLabel
  const resolvedOnAddSkill = request?.onAddSkill ?? onAddSkill

  // Collect unique sources
  const sources = useMemo(() => {
    const sourceMap = new Map<string, string>()
    for (const skill of skills) {
      sourceMap.set(getSkillSourceKey(skill), getSkillSourceLabel(skill))
    }
    return Array.from(sourceMap.entries()).map(([key, label]) => ({
      key,
      label,
    }))
  }, [skills])

  const grouped = useMemo(() => {
    const filtered = skills
      .filter((s) => {
        if (sourceFilter) {
          const skillSource = getSkillSourceKey(s)
          if (skillSource !== sourceFilter) return false
        }
        if (!search) return true
        const q = search.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        )
      })
      .sort((left, right) =>
        compareSkillsForStage(left, right, resolvedStageLabel),
      )

    // Pre-compute fit, source badge, and provenance for each skill once
    const withFit: SkillWithFit[] = filtered.map((skill) => ({
      skill,
      fit: deriveSkillStageFit(skill, resolvedStageLabel),
      sourceBadge: deriveSkillSourceBadge(skill),
      provenanceLabel: deriveSkillProvenanceLabel(skill),
    }))

    const groups = new Map<string, SkillWithFit[]>()
    for (const entry of withFit) {
      const key = entry.skill.category || "uncategorized"
      const list = groups.get(key) || []
      list.push(entry)
      groups.set(key, list)
    }
    return {
      groups,
    }
  }, [skills, search, sourceFilter, resolvedStageLabel])

  const handleAddSkill = useCallback(
    (skill: DiscoveredSkill) => {
      resolvedOnAddSkill(skill)
      closePicker()
    },
    [closePicker, resolvedOnAddSkill],
  )

  useEffect(() => {
    if (pickerOpen) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0
      }
      return
    }
    setSearch("")
    setSourceFilter(null)
  }, [pickerOpen])

  return (
    <Dialog
      open={pickerOpen}
      onOpenChange={(open) => {
        if (!open) {
          closePicker()
        }
      }}
    >
      <CanvasDialogContent
        size="lg"
        className="p-0 gap-0 max-h-[75vh] flex flex-col"
        showCloseButton
      >
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {resolvedDescription}
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="flex flex-col min-h-0 p-0">
          {/* Search + source filter */}
          <div className="surface-panel ui-dialog-gutter py-3 border-b border-hairline space-y-2">
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
                placeholder={resolvedSearchPlaceholder}
                aria-label="Search skills"
                autoFocus
                className="pl-8"
              />
            </div>

            {sources.length > 1 && (
              <div
                className="flex gap-1 flex-wrap"
                role="group"
                aria-label="Filter by source"
              >
                <Button
                  type="button"
                  variant={!sourceFilter ? "secondary" : "outline"}
                  size="xs"
                  className="px-2 ui-meta-text"
                  onClick={() => setSourceFilter(null)}
                  aria-pressed={!sourceFilter}
                >
                  All
                </Button>
                {sources.map((source) => (
                  <Button
                    type="button"
                    key={source.key}
                    variant={
                      sourceFilter === source.key ? "secondary" : "outline"
                    }
                    size="xs"
                    className="px-2 ui-meta-text"
                    onClick={() =>
                      setSourceFilter(
                        sourceFilter === source.key ? null : source.key,
                      )
                    }
                    aria-pressed={sourceFilter === source.key}
                  >
                    {source.label}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" size="compact">
                Attach to {resolvedAttachTargetLabel}
              </Badge>
              {resolvedStageLabel && (
                <Badge variant="outline" size="compact">
                  Current step: {resolvedStageLabel}
                </Badge>
              )}
            </div>
          </div>

          {/* Skill list */}
          <div
            ref={scrollRef}
            className="ui-slab ui-scroll-region flex-1 overflow-y-auto px-3 py-2"
          >
            <div role="status" aria-live="polite" aria-atomic="true">
              {skills.length === 0 && (
                <div className="ui-empty-state text-body-md text-muted-foreground">
                  {resolvedEmptyStateMessage}
                </div>
              )}
              {skills.length > 0 && grouped.groups.size === 0 && (
                <div className="ui-empty-state text-body-md text-muted-foreground">
                  {resolvedEmptyResultsMessage(search)}
                </div>
              )}
            </div>

            {Array.from(grouped.groups.entries()).map(
              ([category, categorySkills]) => (
                <div key={category} className="mb-3">
                  <div className="px-2 py-1 section-kicker">{category}</div>
                  {categorySkills.map((entry) => (
                    <SkillRow
                      key={entry.skill.path}
                      entry={entry}
                      isFeatured={false}
                      onAdd={handleAddSkill}
                    />
                  ))}
                </div>
              ),
            )}
          </div>
        </CanvasDialogBody>
      </CanvasDialogContent>
    </Dialog>
  )
}
