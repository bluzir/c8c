import { describe, expect, it } from "vitest"
import { getBuiltinTemplates } from "./index"

describe("builtin template metadata", () => {
  it("declares suggested tools for every builtin template", () => {
    const templates = getBuiltinTemplates()

    expect(templates.length).toBeGreaterThan(0)
    for (const template of templates) {
      expect(template.suggestedTools).toBeDefined()
      expect(Array.isArray(template.suggestedTools)).toBe(true)
    }
  })

  it("marks the web-dependent builtins with web_search", () => {
    const webSearchTemplateIds = getBuiltinTemplates()
      .filter((template) => template.suggestedTools?.includes("web_search"))
      .map((template) => template.id)
      .sort()

    expect(webSearchTemplateIds).toEqual([
      "ai-cmo-growth-thesis",
      "ai-cmo-reddit-engine",
      "ai-cmo-seo-engine",
      "competitor-ad-intelligence",
      "content-trend-watch",
      "lead-research-machine",
      "new-vertical-to-live-campaign",
      "seed-account-map-pipeline",
      "segment-research-jtbd",
      "vertical-pain-to-target-list",
    ])
  })
})
