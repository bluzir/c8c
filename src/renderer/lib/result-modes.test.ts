import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  filterTemplatesForResultMode,
  getResultMode,
  getResultModeQuickStarts,
  presentDevelopmentCreateQuickStarts,
  presentDevelopmentCreateRouteOptions,
  prioritizeDevelopmentCreateQuickStarts,
  prioritizeTemplatesForResultMode,
  RESULT_MODES,
  splitTemplatesForResultMode,
  templateMatchesResultMode,
} from "./result-modes"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "generic-template",
    name: "Generic Template",
    description: "A generic workflow.",
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

describe("result-modes", () => {
  it("ships the expected built-in modes", () => {
    expect(RESULT_MODES.map((mode) => mode.id)).toEqual([
      "development",
      "content",
      "marketing",
      "courses",
    ])
  })

  it("matches delivery pack templates to development mode", () => {
    const template = createTemplate({
      id: "delivery-map-codebase",
      stage: "research",
      pack: {
        id: "delivery-foundation",
        label: "Delivery Factory",
        journeyStage: "map",
        entrypoint: true,
      },
    })

    expect(templateMatchesResultMode(template, "development")).toBe(true)
  })

  it("matches AI CMO templates to the marketing mode", () => {
    const template = createTemplate({
      id: "ai-cmo-seo-engine",
      stage: "content",
      pack: {
        id: "ai-cmo",
        label: "AI CMO",
        journeyStage: "execute",
      },
    })

    expect(templateMatchesResultMode(template, "marketing")).toBe(true)
    expect(templateMatchesResultMode(template, "development")).toBe(false)
  })

  it("matches Content Lab templates to the content mode", () => {
    const template = createTemplate({
      id: "content-ready-posts",
      stage: "content",
      pack: {
        id: "content-factory-alpha",
        label: "Content Factory",
        journeyStage: "execute",
      },
    })

    expect(templateMatchesResultMode(template, "content")).toBe(true)
    expect(templateMatchesResultMode(template, "development")).toBe(false)
  })

  it("prioritizes high-confidence content matches first", () => {
    const templates = [
      createTemplate({
        id: "content-draft-post",
        stage: "content",
        name: "Draft Post",
      }),
      createTemplate({
        id: "content-ready-posts",
        stage: "content",
        pack: {
          id: "content-factory-alpha",
          label: "Content Factory",
          journeyStage: "execute",
        },
      }),
    ]

    expect(
      prioritizeTemplatesForResultMode(templates, "content").map(
        (template) => template.id,
      ),
    ).toEqual(["content-ready-posts", "content-draft-post"])
  })

  it("falls back to development for unknown mode ids", () => {
    expect(getResultMode("unknown-mode").id).toBe("development")
  })

  it("resolves development quick starts in canonical order", () => {
    const templates = [
      createTemplate({ id: "delivery-plan-phase", name: "Plan" }),
      createTemplate({ id: "delivery-implement-phase", name: "Implement" }),
      createTemplate({ id: "delivery-review-phase", name: "Review" }),
      createTemplate({ id: "delivery-map-codebase", name: "Map" }),
      createTemplate({ id: "delivery-shape-project", name: "Shape" }),
      createTemplate({ id: "delivery-verify-phase", name: "Verify" }),
    ]

    expect(
      getResultModeQuickStarts(templates, "development").map(
        (entry) => entry.template.id,
      ),
    ).toEqual([
      "delivery-map-codebase",
      "delivery-shape-project",
      "delivery-plan-phase",
      "delivery-review-phase",
    ])
  })

  it("reorders development create quick starts from stable project context", () => {
    const quickStarts = [
      {
        templateId: "delivery-map-codebase",
        label: "Map",
        summary: "",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-shape-project",
        label: "Shape",
        summary: "",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-plan-phase",
        label: "Plan",
        summary: "",
        intentLabel: "Plan it",
      },
      {
        templateId: "delivery-review-phase",
        label: "Review",
        summary: "",
        intentLabel: "Review it",
      },
      {
        templateId: "delivery-verify-phase",
        label: "Verify",
        summary: "",
        intentLabel: "Review it",
      },
    ]

    expect(
      prioritizeDevelopmentCreateQuickStarts(
        quickStarts,
        "greenfield_empty",
      ).map((entry) => entry.templateId),
    ).toEqual(["delivery-shape-project", "delivery-plan-phase"])

    expect(
      prioritizeDevelopmentCreateQuickStarts(quickStarts, "existing_repo").map(
        (entry) => entry.templateId,
      ),
    ).toEqual([
      "delivery-shape-project",
      "delivery-plan-phase",
      "delivery-map-codebase",
    ])

    expect(
      prioritizeDevelopmentCreateQuickStarts(quickStarts, "review_ready").map(
        (entry) => entry.templateId,
      ),
    ).toEqual([
      "delivery-review-phase",
      "delivery-shape-project",
      "delivery-plan-phase",
      "delivery-map-codebase",
    ])
  })

  it("rewrites development quick starts into job-first labels", () => {
    const quickStarts = [
      {
        templateId: "delivery-map-codebase",
        label: "Map codebase",
        summary: "Map",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-shape-project",
        label: "Shape project",
        summary: "Shape",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-plan-phase",
        label: "Plan next phase",
        summary: "Plan",
        intentLabel: "Plan it",
      },
      {
        templateId: "delivery-review-phase",
        label: "Review phase",
        summary: "Review",
        intentLabel: "Review it",
      },
      {
        templateId: "delivery-verify-phase",
        label: "Verify phase",
        summary: "Verify",
        intentLabel: "Review it",
      },
    ]

    expect(
      presentDevelopmentCreateQuickStarts(quickStarts, "greenfield_empty"),
    ).toMatchObject([
      {
        templateId: "delivery-map-codebase",
        label: "Map codebase",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-shape-project",
        label: "Build from brief",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-plan-phase",
        label: "Plan from brief",
        intentLabel: "Plan it",
      },
      {
        templateId: "delivery-review-phase",
        label: "Review phase",
        intentLabel: "Review it",
      },
      {
        templateId: "delivery-verify-phase",
        label: "Verify phase",
        intentLabel: "Review it",
      },
    ])

    expect(
      presentDevelopmentCreateQuickStarts(quickStarts, "review_ready"),
    ).toMatchObject([
      {
        templateId: "delivery-map-codebase",
        label: "Understand the current app",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-shape-project",
        label: "Change the app",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-plan-phase",
        label: "Plan the change",
        intentLabel: "Plan it",
      },
      {
        templateId: "delivery-review-phase",
        label: "Review before ship",
        intentLabel: "Review it",
      },
      {
        templateId: "delivery-verify-phase",
        label: "Verify phase",
        intentLabel: "Review it",
      },
    ])
  })

  it("rewrites development route options into the same job-first grammar", () => {
    const options = [
      {
        templateId: "delivery-map-codebase",
        label: "Map codebase",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-shape-project",
        label: "Shape project",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-plan-phase",
        label: "Plan next phase",
        intentLabel: "Plan it",
      },
    ]

    expect(
      presentDevelopmentCreateRouteOptions(options, "existing_repo"),
    ).toEqual([
      {
        templateId: "delivery-map-codebase",
        label: "Understand the current app",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-shape-project",
        label: "Change the app",
        intentLabel: "Do it",
      },
      {
        templateId: "delivery-plan-phase",
        label: "Plan the change",
        intentLabel: "Plan it",
      },
    ])
  })

  it("separates quick starts from the rest of the selected mode templates", () => {
    const templates = [
      createTemplate({
        id: "delivery-map-codebase",
        name: "Map",
        stage: "research",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "map",
        },
      }),
      createTemplate({
        id: "delivery-shape-project",
        name: "Shape",
        stage: "strategy",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "shape",
        },
      }),
      createTemplate({
        id: "delivery-research-phase",
        name: "Research",
        stage: "research",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "research",
        },
      }),
      createTemplate({
        id: "content-ready-posts",
        name: "Posts",
        stage: "content",
        pack: {
          id: "content-factory-alpha",
          label: "Content Factory",
          journeyStage: "execute",
        },
      }),
    ]

    const split = splitTemplatesForResultMode(templates, "development")

    expect(split.quickStarts.map((entry) => entry.template.id)).toEqual([
      "delivery-map-codebase",
      "delivery-shape-project",
    ])
    expect(split.modeTemplates.map((template) => template.id)).toEqual([
      "delivery-research-phase",
    ])
    expect(split.otherTemplates.map((template) => template.id)).toEqual([
      "content-ready-posts",
    ])
  })
})
