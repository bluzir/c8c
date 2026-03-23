import { describe, expect, it } from "vitest"
import { validateWorkflow } from "./graph-engine"
import { getBuiltinTemplates } from "./templates"

describe("courses pack templates", () => {
  const targetIds = [
    "courses-audience-offer",
    "courses-curriculum-map",
    "courses-lesson-system",
    "courses-trigger-playbook",
    "courses-launch-assets",
  ] as const

  it("ships the first courses pack templates with pack metadata and contracts", () => {
    const templates = getBuiltinTemplates().filter((template) =>
      targetIds.includes(template.id as (typeof targetIds)[number]),
    )

    expect(templates.map((template) => template.id).sort()).toEqual(
      [...targetIds].sort(),
    )

    for (const template of templates) {
      expect(template.pack?.id).toBe("courses-factory-alpha")
      expect(template.pack?.label).toBe("Courses Lab")
      expect(template.contractOut?.length || 0).toBeGreaterThan(0)
      expect(template.executionPolicy?.summary).toBeTruthy()
    }
  })

  it("keeps the first courses pack workflows valid", () => {
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
