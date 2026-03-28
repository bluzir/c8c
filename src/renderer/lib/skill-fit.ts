import type { DiscoveredSkill } from "@shared/types"
import { getSkillSourceKind, getSkillSourceLabel } from "@/lib/skill-source"

export interface SkillStageFit {
  score: number
  label: string
  reason: string
}

export function deriveSkillStageFit(
  skill: DiscoveredSkill,
  stageLabel?: string | null,
): SkillStageFit {
  if (stageLabel) {
    const normalizedLabel = stageLabel.trim().toLowerCase()

    // Exact fit: the skill's path basename (its canonical identifier) matches
    // the stage label. This is a pure structural equality check — no NL
    // interpretation, no keyword scanning.
    const pathBasename = skill.path
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.[^.]+$/, "")
      ?.toLowerCase()

    if (pathBasename && pathBasename === normalizedLabel) {
      return {
        score: 3,
        label: "Exact fit",
        reason: "Designed for this step.",
      }
    }

    // Related: the skill's category field (a structural tag, not NL) matches
    // the stage label. Category is set by the skill author, not inferred.
    const normalizedCategory = skill.category.trim().toLowerCase()
    if (normalizedCategory && normalizedCategory === normalizedLabel) {
      return {
        score: 2,
        label: "Related",
        reason: "Built for similar steps.",
      }
    }
  }

  return {
    score: 1,
    label: "Reusable",
    reason: "Can be attached here if you need it.",
  }
}

export function deriveSkillProvenanceLabel(skill: DiscoveredSkill): string {
  const sourceKind = getSkillSourceKind(skill)
  const sourceLabel = getSkillSourceLabel(skill)
  if (sourceKind === "plugin") {
    return skill.pluginVersion
      ? `${sourceLabel} v${skill.pluginVersion}`
      : sourceLabel
  }
  return sourceLabel
}

export function deriveSkillSourceBadge(skill: DiscoveredSkill): string {
  const sourceKind = getSkillSourceKind(skill)
  if (sourceKind === "plugin") return "Plugin"
  if (sourceKind === "library") return "Library"
  if (sourceKind === "user") return "User"
  return "Project"
}

export function compareSkillsForStage(
  left: DiscoveredSkill,
  right: DiscoveredSkill,
  stageLabel?: string | null,
) {
  void stageLabel

  const sourcePriority = (skill: DiscoveredSkill) => {
    const sourceKind = getSkillSourceKind(skill)
    if (sourceKind === "project") return 3
    if (sourceKind === "user") return 2
    if (sourceKind === "plugin") return 1
    return 0
  }

  const leftSource = sourcePriority(left)
  const rightSource = sourcePriority(right)
  if (leftSource !== rightSource) return rightSource - leftSource

  return left.name.localeCompare(right.name)
}
