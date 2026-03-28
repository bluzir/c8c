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

  describe("deriveSkillStageFit", () => {
    it("returns Reusable for generic skill with no stage match", () => {
      const genericSkill: DiscoveredSkill = {
        ...BASE_SKILL,
        name: "Generic Helper",
        category: "ops",
        path: "/tmp/generic-helper/SKILL.md",
      }
      expect(deriveSkillStageFit(genericSkill, "Review")).toMatchObject({
        score: 1,
        label: "Reusable",
      })
    })

    it("returns Exact fit when path basename matches stage label (case-insensitive)", () => {
      const exactSkill: DiscoveredSkill = {
        ...BASE_SKILL,
        name: "Review Skill",
        category: "quality",
        path: "/tmp/skills/review.md",
      }
      expect(deriveSkillStageFit(exactSkill, "Review")).toMatchObject({
        score: 3,
        label: "Exact fit",
      })
    })

    it("returns Related when category matches stage label (case-insensitive)", () => {
      const relatedSkill: DiscoveredSkill = {
        ...BASE_SKILL,
        name: "Code Checker",
        category: "review",
        path: "/tmp/skills/code-checker.md",
      }
      expect(deriveSkillStageFit(relatedSkill, "Review")).toMatchObject({
        score: 2,
        label: "Related",
      })
    })

    it("returns Reusable when stageLabel is undefined", () => {
      expect(deriveSkillStageFit(BASE_SKILL, undefined)).toMatchObject({
        score: 1,
        label: "Reusable",
      })
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

    expect(
      compareSkillsForStage(genericSkill, BASE_SKILL, "Review"),
    ).toBeLessThan(0)
  })
})
