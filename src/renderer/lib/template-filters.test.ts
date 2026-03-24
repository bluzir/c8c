import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  getTemplateLibraryFilterKey,
  getTemplateSearchScore,
  isContentTemplate,
  isMarketingTemplate,
  isProductTemplate,
  templateMatchesSearchQuery,
  templateMatchesCategory,
  templateMatchesLibraryFilter,
} from "./template-filters"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "generic-template",
    name: "Generic Template",
    description: "A generic template.",
    stage: "content",
    emoji: "T",
    headline: "Generic flow",
    how: "Do some work.",
    input: "Input",
    output: "Output",
    steps: ["Step one"],
    workflow: {
      version: 1,
      name: "Generic Template",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

describe("template-filters", () => {
  it("classifies delivery templates under product", () => {
    const template = createTemplate({
      id: "delivery-map-codebase",
      stage: "strategy",
      stageFamily: "understand",
      pack: {
        id: "delivery-foundation",
        label: "Delivery Factory",
        journeyStage: "intake",
      },
    })

    expect(isProductTemplate(template)).toBe(true)
    expect(templateMatchesCategory(template, "product")).toBe(true)
    expect(
      templateMatchesLibraryFilter(
        template,
        getTemplateLibraryFilterKey(template),
      ),
    ).toBe(true)
  })

  it("keeps segment research discoverable in marketing", () => {
    const template = createTemplate({
      id: "segment-research-jtbd",
      stage: "research",
      name: "Segment Research with Quality Gate",
      description:
        "Validate market segments with evidence and audience research.",
      workflow: {
        version: 1,
        name: "Segment Research with Quality Gate",
        nodes: [
          {
            id: "skill-1",
            type: "skill",
            position: { x: 0, y: 0 },
            config: {
              skillRef: "segment-researcher",
              prompt: "Research segments",
            },
          },
        ],
        edges: [],
      },
    })

    expect(isMarketingTemplate(template)).toBe(true)
    expect(templateMatchesCategory(template, "marketing")).toBe(true)
    expect(templateMatchesSearchQuery(template, "segment research")).toBe(true)
    expect(templateMatchesSearchQuery(template, "research segment")).toBe(true)
  })

  it("allows overlap between product and marketing where the workflow is design-audit heavy", () => {
    const template = createTemplate({
      id: "ux-ui-polish-audit",
      stage: "code",
      stageFamily: "evaluate",
      name: "UX/UI Polish Audit",
      description: "Audit UX and UI quality across a project.",
      headline: "Audit UX/UI polish across the whole project",
      workflow: {
        version: 1,
        name: "UX/UI Polish Audit",
        nodes: [
          {
            id: "skill-1",
            type: "skill",
            position: { x: 0, y: 0 },
            config: {
              skillRef: "design/design-review",
              prompt: "Audit design quality",
            },
          },
        ],
        edges: [],
      },
    })

    expect(isProductTemplate(template)).toBe(true)
    expect(isMarketingTemplate(template)).toBe(true)
    expect(templateMatchesCategory(template, "product")).toBe(true)
    expect(templateMatchesCategory(template, "marketing")).toBe(true)
    expect(
      templateMatchesLibraryFilter(
        template,
        getTemplateLibraryFilterKey(template),
      ),
    ).toBe(true)
  })

  it("treats course workflows as content", () => {
    const template = createTemplate({
      id: "courses-curriculum-map",
      stage: "strategy",
      pack: {
        id: "courses-factory-alpha",
        label: "Courses Factory",
        journeyStage: "shape",
      },
    })

    expect(isContentTemplate(template)).toBe(true)
    expect(templateMatchesCategory(template, "content")).toBe(true)
    expect(templateMatchesCategory(template, "product")).toBe(false)
  })

  it("allows implicit matches from descriptive metadata", () => {
    const template = createTemplate({
      id: "generic-template",
      name: "Generic Template",
      headline: "Ship a feature cleanly",
      description: "Polish the UI and tighten the copy before launch.",
    })

    expect(templateMatchesSearchQuery(template, "polish")).toBe(true)
    expect(templateMatchesSearchQuery(template, "generic")).toBe(true)
  })

  it("matches against tokenized fields instead of raw substrings", () => {
    const template = createTemplate({
      id: "generic-template",
      name: "Generic Template",
      headline: "Ship a feature cleanly",
    })

    expect(templateMatchesSearchQuery(template, "ui", "Built-in")).toBe(false)
    expect(templateMatchesSearchQuery(template, "built", "Built-in")).toBe(true)
  })

  it("ranks explicit title matches ahead of implicit description matches", () => {
    const explicitTemplate = createTemplate({
      id: "ux-ui-polish-audit",
      name: "UX/UI Polish Audit",
      headline: "Audit UX/UI polish across the whole project",
      description: "Audit the project.",
    })
    const implicitTemplate = createTemplate({
      id: "generic-template",
      name: "Generic Template",
      headline: "Ship a feature cleanly",
      description: "Polish the UI and tighten the copy before launch.",
    })

    expect(getTemplateSearchScore(explicitTemplate, "polish")).toBeGreaterThan(
      getTemplateSearchScore(implicitTemplate, "polish"),
    )
  })
})
