import { describe, expect, it } from "vitest"
import { getBuiltinTemplates } from "./templates"
import { validateWorkflow } from "./graph-engine"

describe("content pack templates", () => {
  const targetIds = [
    "content-trend-watch",
    "content-post-drafter",
    "content-idea-backlog",
    "content-editorial-calendar",
    "content-qa-review",
    "content-distribution-bundle",
    "content-ready-posts",
  ] as const

  it("ships the first content pack templates with pack metadata and contracts", () => {
    const templates = getBuiltinTemplates().filter((template) =>
      targetIds.includes(template.id as (typeof targetIds)[number]),
    )

    expect(templates.map((template) => template.id).sort()).toEqual(
      [...targetIds].sort(),
    )

    for (const template of templates) {
      expect(template.pack?.id).toBe("content-factory-alpha")
      expect(template.pack?.label).toBe("Content Lab")
      expect(template.contractOut?.length || 0).toBeGreaterThan(0)
      expect(template.executionPolicy?.summary).toBeTruthy()
    }
  })

  it("keeps the primary Content Lab continuation chain aligned in pack metadata", () => {
    const trendWatch = getBuiltinTemplates().find(
      (template) => template.id === "content-trend-watch",
    )
    const postDrafter = getBuiltinTemplates().find(
      (template) => template.id === "content-post-drafter",
    )
    const qaReview = getBuiltinTemplates().find(
      (template) => template.id === "content-qa-review",
    )
    const readyPosts = getBuiltinTemplates().find(
      (template) => template.id === "content-ready-posts",
    )

    expect(trendWatch?.pack?.entrypoint).toBe(true)
    expect(trendWatch?.pack?.recommendedNext).toEqual(["content-post-drafter"])
    expect(postDrafter?.pack?.recommendedNext).toEqual(["content-qa-review"])
    expect(qaReview?.pack?.recommendedNext).toEqual(["content-ready-posts"])
    expect(readyPosts?.recommendedNext).toEqual([])
    expect(readyPosts?.stageFamily).toBe("deliver")
    expect(readyPosts?.pack?.journeyStage).toBe("deliver")
  })

  it("keeps the first content pack workflows valid", () => {
    const templates = getBuiltinTemplates().filter((template) =>
      targetIds.includes(template.id as (typeof targetIds)[number]),
    )

    for (const template of templates) {
      const errors = validateWorkflow(template.workflow)
      expect(
        errors,
        `Template "${template.name}" has validation errors: ${errors.join(", ")}`,
      ).toEqual([])
    }
  })
})
