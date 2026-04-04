import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { SkillCard } from "@/components/skills/SkillCard"
import type { DiscoveredSkill } from "@shared/types"

type SkillGroup = {
  id: string
  title: string
  description: string
  items: DiscoveredSkill[]
}

export function SkillCardGrid({
  groupedSkills,
  filteredCount,
  totalCount,
  loading,
  onSelectSkill,
}: {
  groupedSkills: SkillGroup[]
  filteredCount: number
  totalCount: number
  loading: boolean
  onSelectSkill: (skill: DiscoveredSkill) => void
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`skill-card-skeleton-${i}`}
            className="flex items-start gap-3 rounded-lg p-4 surface-panel"
          >
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (filteredCount === 0) {
    return (
      <div className="ui-empty-state-box ui-empty-state px-4">
        {totalCount === 0
          ? "No skills found. Install a library or plugin to get started."
          : "No skills match this filter."}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groupedSkills.map((section) => (
        <section key={section.id}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="section-kicker">{section.title}</h3>
            <Badge variant="outline" size="compact">
              {section.items.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {section.items.map((skill) => (
              <SkillCard
                key={`${skill.path}-${skill.name}`}
                skill={skill}
                onSelect={onSelectSkill}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
