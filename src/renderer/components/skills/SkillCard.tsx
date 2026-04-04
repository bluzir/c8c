import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { deriveSkillSourceBadge } from "@/lib/skill-fit"
import type { DiscoveredSkill } from "@shared/types"
import { Zap, Bot, Terminal } from "lucide-react"

const TYPE_ICONS = {
  skill: Zap,
  agent: Bot,
  command: Terminal,
} as const

export function SkillCard({
  skill,
  onSelect,
}: {
  skill: DiscoveredSkill
  onSelect: (skill: DiscoveredSkill) => void
}) {
  const Icon = TYPE_ICONS[skill.type] ?? Zap

  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(skill)}
      className={cn(
        "ui-interactive-card-subtle w-full !items-start !justify-start gap-3 rounded-lg p-4 text-left !whitespace-normal",
      )}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 mt-0.5"
        aria-hidden="true"
      >
        <Icon size={14} className="text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title-sm">{skill.name}</h3>
          <Badge variant="outline" size="compact">
            {skill.type}
          </Badge>
          <Badge variant="secondary" size="compact">
            {deriveSkillSourceBadge(skill)}
          </Badge>
        </div>
        {skill.description && (
          <p className="text-body-sm text-muted-foreground mt-1 line-clamp-2">
            {skill.description}
          </p>
        )}
      </div>
    </Button>
  )
}
