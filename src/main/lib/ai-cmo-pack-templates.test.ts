import { describe, expect, it } from "vitest"
import { validateWorkflow } from "./graph-engine"
import { getBuiltinTemplates } from "./templates"

describe("AI CMO pack templates", () => {
  const targetIds = [
    "ai-cmo-growth-thesis",
    "ai-cmo-seo-engine",
    "ai-cmo-geo-engine",
    "ai-cmo-x-engine",
    "ai-cmo-reddit-engine",
    "ai-cmo-hacker-news-engine",
  ] as const

  it("ships the AI CMO pack with linked built-in templates", () => {
    const templates = getBuiltinTemplates().filter((template) =>
      targetIds.includes(template.id as (typeof targetIds)[number]),
    )

    expect(templates.map((template) => template.id).sort()).toEqual(
      [...targetIds].sort(),
    )

    for (const template of templates) {
      expect(template.pack?.id).toBe("ai-cmo")
      expect(template.pack?.label).toBe("AI CMO")
      expect(template.executionPolicy?.summary).toBeTruthy()
      expect(template.contractOut?.length || 0).toBeGreaterThan(0)
    }

    const entrypoint = templates.find(
      (template) => template.id === "ai-cmo-growth-thesis",
    )
    expect(entrypoint?.pack?.entrypoint).toBe(true)
    expect(entrypoint?.pack?.recommendedNext).toEqual([
      "ai-cmo-seo-engine",
      "ai-cmo-geo-engine",
      "ai-cmo-x-engine",
      "ai-cmo-reddit-engine",
      "ai-cmo-hacker-news-engine",
    ])
  })

  it("keeps the AI CMO pack workflows valid", () => {
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
