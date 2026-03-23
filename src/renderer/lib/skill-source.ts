import type { DiscoveredSkill } from "@shared/types"

export function getSkillSourceKind(
  skill: DiscoveredSkill,
): "project" | "user" | "library" | "plugin" {
  if (skill.sourceScope === "plugin" || skill.pluginId || skill.pluginName)
    return "plugin"
  if (skill.library) return "library"
  if (skill.sourceScope === "user") return "user"
  return "project"
}

export function getSkillSourceKey(skill: DiscoveredSkill): string {
  const kind = getSkillSourceKind(skill)
  if (kind === "plugin")
    return `plugin:${skill.pluginId || skill.pluginName || skill.library || skill.name}`
  if (kind === "library") return `library:${skill.library || skill.name}`
  return kind
}

export function getSkillSourceLabel(skill: DiscoveredSkill): string {
  const kind = getSkillSourceKind(skill)
  if (kind === "plugin") return skill.pluginName || skill.library || "plugin"
  if (kind === "library") return skill.library || "library"
  return kind
}
