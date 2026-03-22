import { describe, expect, it } from "vitest"
import type { DiscoveredSkill } from "@shared/types"
import {
  compareSkillsForStage,
  deriveSkillProvenanceLabel,
  deriveSkillSourceBadge,
  deriveSkillStageFit,
} from "./skill-fit"

const BASE_SKILL: DiscoveredSkill = {
  type: "skill",
  name: "UI Polish Audit",
  description: "Audit and polish UI quality before shipping.",
  category: "design",
  path: "/tmp/ui-polish/SKILL.md",
  sourceScope: "plugin",
  pluginName: "impeccable",
  pluginVersion: "1.2.0",
}

describe("skill-fit", () => {
  it("stays neutral even when a stage label is present", () => {
    expect(deriveSkillStageFit(BASE_SKILL, "Review")).toMatchObject({
      score: 1,
      label: "Reusable",
    })
  })

  it("keeps generic fit when no stage label is available", () => {
    expect(deriveSkillStageFit(BASE_SKILL, null)).toMatchObject({
      score: 1,
      label: "Reusable",
    })
  })

  it("formats provenance for plugin skills", () => {
    expect(deriveSkillProvenanceLabel(BASE_SKILL)).toBe("impeccable v1.2.0")
    expect(deriveSkillSourceBadge(BASE_SKILL)).toBe("Plugin")
  })

  it("sorts by source priority when stage-specific ranking is unavailable", () => {
    const genericSkill: DiscoveredSkill = {
      ...BASE_SKILL,
      name: "Terminal Helper",
      description: "General command helper.",
      category: "ops",
      path: "/tmp/terminal-helper/SKILL.md",
      sourceScope: "project",
      pluginName: undefined,
      pluginVersion: undefined,
    }

    expect(compareSkillsForStage(genericSkill, BASE_SKILL, "Review")).toBeLessThan(0)
  })
})
