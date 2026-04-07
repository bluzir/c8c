import { describe, it, expect } from "vitest"
import { resolveStartTemplate, buildSourceContext } from "./useFlowRouting"

// Minimal template stub
function makeTemplate(id: string, name?: string) {
  return { id, name: name ?? id } as any
}

// Minimal artifact stub
function makeArtifact(
  relativePath: string,
  title: string,
  overrides?: { workflowName?: string; templateName?: string },
) {
  return { relativePath, title, ...overrides }
}

describe("resolveStartTemplate", () => {
  const catalog = [
    makeTemplate("tpl-review", "Code Review"),
    makeTemplate("tpl-draft", "Draft Writer"),
    makeTemplate("tpl-research", "Research"),
  ]

  it("finds template by routeResult.recommendedTemplateId", () => {
    const result = resolveStartTemplate(
      { recommendedTemplateId: "tpl-draft" },
      catalog,
      "tpl-review",
    )
    expect(result?.id).toBe("tpl-draft")
  })

  it("falls back to startTemplateId when routeResult is null", () => {
    const result = resolveStartTemplate(null, catalog, "tpl-research")
    expect(result?.id).toBe("tpl-research")
  })

  it("falls back to startTemplateId when recommendedTemplateId not in catalog", () => {
    const result = resolveStartTemplate(
      { recommendedTemplateId: "nonexistent" },
      catalog,
      "tpl-review",
    )
    expect(result?.id).toBe("tpl-review")
  })

  it("returns null when neither ID matches catalog", () => {
    const result = resolveStartTemplate(
      { recommendedTemplateId: "nonexistent" },
      catalog,
      "also-nonexistent",
    )
    expect(result).toBeNull()
  })

  it("returns null on empty catalog", () => {
    const result = resolveStartTemplate(
      { recommendedTemplateId: "tpl-review" },
      [],
      "tpl-review",
    )
    expect(result).toBeNull()
  })
})

describe("buildSourceContext", () => {
  it("returns undefined for empty array", () => {
    expect(buildSourceContext([])).toBeUndefined()
  })

  it("builds summary for single artifact", () => {
    const result = buildSourceContext([
      makeArtifact("report.md", "Final Report", {
        workflowName: "Research Flow",
      }),
    ])
    expect(result).toBe(
      "Previous run completed: Research Flow — produced report.md (Final Report)",
    )
  })

  it("uses templateName when workflowName is missing", () => {
    const result = buildSourceContext([
      makeArtifact("out.txt", "Output", { templateName: "My Template" }),
    ])
    expect(result).toContain("My Template")
  })

  it("falls back to 'flow' when no name available", () => {
    const result = buildSourceContext([makeArtifact("out.txt", "Output")])
    expect(result).toContain("Previous run completed: flow")
  })

  it("truncates at 10 items with suffix", () => {
    const artifacts = Array.from({ length: 13 }, (_, i) =>
      makeArtifact(`file${i}.md`, `File ${i}`),
    )
    const result = buildSourceContext(artifacts)!
    expect(result).toContain("and 3 more")
    // Should only list first 10
    expect(result).toContain("file9.md")
    expect(result).not.toContain("file10.md")
  })
})
