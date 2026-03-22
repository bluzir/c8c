import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionHeading } from "@/components/ui/page-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { SkillDetailPanel } from "@/components/SkillDetailPanel"
import { cn } from "@/lib/cn"
import { deriveSkillProvenanceLabel, deriveSkillSourceBadge } from "@/lib/skill-fit"
import { getSkillSourceLabel } from "@/lib/skill-source"
import type { DiscoveredSkill } from "@shared/types"

type SkillGroup = {
  id: string
  title: string
  description: string
  items: DiscoveredSkill[]
}

export function SkillsAttachSection({
  filteredSkills,
  allSkillsCount,
  currentFlowLabel,
  groupedSkills,
  selectedSkill,
  loading = false,
  onSelectSkill,
  onAttachSkill,
  addToFlowDisabledReason,
  onCloseSkillDetail,
}: {
  filteredSkills: DiscoveredSkill[]
  allSkillsCount: number
  currentFlowLabel: string | null
  groupedSkills: SkillGroup[]
  selectedSkill: DiscoveredSkill | null
  loading?: boolean
  onSelectSkill: (skill: DiscoveredSkill) => void
  onAttachSkill: (skill: DiscoveredSkill) => void
  addToFlowDisabledReason: string | null
  onCloseSkillDetail: () => void
}) {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <SectionHeading title="Attach skills" meta={
        <Badge variant="outline">
          {loading
            ? "Loading"
            : filteredSkills.length !== allSkillsCount
            ? `${filteredSkills.length}/${allSkillsCount}`
            : filteredSkills.length}
        </Badge>
      } />

      <div className="flex flex-wrap items-center gap-2 rounded-lg surface-inset-card px-3 py-2">
        {currentFlowLabel ? (
          <>
            <Badge variant="outline" size="compact">Attach to current flow</Badge>
            <span className="text-body-sm font-medium text-foreground">{currentFlowLabel}</span>
          </>
        ) : (
          <span className="ui-meta-text text-muted-foreground">
            Open a flow to attach skills directly from this page.
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, sectionIndex) => (
              <section key={`skills-attach-skeleton-section-${sectionIndex}`} className="overflow-hidden rounded-lg surface-panel">
                <div className="surface-depth-header flex items-center justify-between gap-3 px-4 py-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" aria-hidden="true" />
                    <Skeleton className="h-3 w-40" aria-hidden="true" />
                  </div>
                  <Skeleton className="h-5 w-10" aria-hidden="true" />
                </div>
                <div className="divide-y divide-hairline">
                  {Array.from({ length: 4 }).map((__, rowIndex) => (
                    <div key={`skills-attach-skeleton-row-${sectionIndex}-${rowIndex}`} className="flex items-start gap-3 px-3 py-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Skeleton className="h-4 w-36" aria-hidden="true" />
                          <Skeleton className="h-4 w-16" aria-hidden="true" />
                          <Skeleton className="h-4 w-20" aria-hidden="true" />
                        </div>
                        <Skeleton className="h-3 w-full" aria-hidden="true" />
                        <Skeleton className="h-3 w-2/3" aria-hidden="true" />
                      </div>
                      <Skeleton className="h-9 w-16" aria-hidden="true" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="hidden lg:block rounded-xl border border-hairline/70 bg-surface-2/30 p-4">
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" aria-hidden="true" />
              <Skeleton className="h-4 w-24" aria-hidden="true" />
              <Skeleton className="h-24 w-full" aria-hidden="true" />
              <Skeleton className="h-16 w-full" aria-hidden="true" />
            </div>
          </div>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface-2/25 ui-empty-state px-4 text-body-sm text-muted-foreground">
          No skills match this filter. Install a library or plugin, or clear search.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 flex-1 space-y-4">
            {groupedSkills.map((section) => (
              <section key={section.id} className="rounded-lg surface-panel overflow-hidden">
                <div className="surface-depth-header flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <h3 className="text-body-md font-semibold text-foreground">{section.title}</h3>
                    <p className="ui-meta-text text-muted-foreground">{section.description}</p>
                  </div>
                  <Badge variant="outline" size="compact">{section.items.length}</Badge>
                </div>

                <div className="divide-y divide-hairline" role="list" aria-label={section.title}>
                  {section.items.map((skill) => {
                    const isSelected = selectedSkill?.path === skill.path
                    const sourceLabel = getSkillSourceLabel(skill)
                    const provenanceLabel = deriveSkillProvenanceLabel(skill)

                    return (
                      <div
                        key={`${skill.path}-${skill.name}`}
                        className="flex items-start gap-3 px-3 py-3"
                        role="listitem"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="bare"
                          onClick={() => onSelectSkill(skill)}
                          aria-pressed={isSelected}
                          className={cn(
                            "ui-interactive-card min-w-0 flex-1 !justify-start gap-3 rounded-md text-left !whitespace-normal",
                            isSelected && "bg-surface-2/70",
                          )}
                        >
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="ui-body-text-medium truncate">{skill.name}</span>
                              <Badge variant="outline" size="compact">{skill.type}</Badge>
                              <Badge variant="secondary" size="compact">
                                {deriveSkillSourceBadge(skill)}
                              </Badge>
                            </div>
                            {skill.description && (
                              <p className="text-body-sm text-muted-foreground line-clamp-2">
                                {skill.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" size="compact">{sourceLabel}</Badge>
                              {provenanceLabel !== sourceLabel ? (
                                <Badge variant="outline" size="compact">{provenanceLabel}</Badge>
                              ) : null}
                              <span className="ui-meta-text text-muted-foreground">
                                {skill.category}/{skill.name}
                              </span>
                            </div>
                          </div>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation()
                            onAttachSkill(skill)
                          }}
                          disabled={!!addToFlowDisabledReason}
                          title={addToFlowDisabledReason || "Attach this skill to the current flow."}
                        >
                          Attach
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          {selectedSkill ? (
            <SkillDetailPanel
              skill={selectedSkill}
              onAddToWorkflow={() => onAttachSkill(selectedSkill)}
              canAddToWorkflow={!addToFlowDisabledReason}
              addDisabledReason={addToFlowDisabledReason}
              onClose={onCloseSkillDetail}
            />
          ) : (
            <div className="hidden lg:block" aria-hidden="true" />
          )}
        </div>
      )}
    </section>
  )
}
