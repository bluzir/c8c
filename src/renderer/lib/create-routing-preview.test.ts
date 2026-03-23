import { describe, expect, it } from "vitest"
import type { CreateEntryRouteOption, WorkflowTemplate } from "@shared/types"
import {
  buildCreateRoutingPreview,
  buildTemplateRoutingPreview,
} from "./create-routing-preview"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Factory: Plan Phase",
    description: "Plan the next implementation phase.",
    stage: "strategy",
    emoji: "🧩",
    headline: "Plan phase",
    how: "Break work into small tasks.",
    input: "Project context",
    output: "Phase plan",
    steps: ["Plan", "Review"],
    pack: {
      id: "delivery-foundation",
      label: "Delivery Factory",
      journeyStage: "plan",
      recommendedNext: [],
    },
    workflow: {
      version: 1,
      name: "Delivery Factory: Plan Phase",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

describe("buildCreateRoutingPreview", () => {
  it("builds a review-oriented preview for code audits", () => {
    const templates = [
      createTemplate({
        id: "full-stack-code-audit",
        name: "Full-Stack Code Audit",
        pack: undefined,
      }),
    ]
    const routeOptions: CreateEntryRouteOption[] = [
      {
        templateId: "full-stack-code-audit",
        label: "Audit codebase risks",
        intentLabel: "Review it",
      },
    ]

    const preview = buildCreateRoutingPreview({
      templateId: "full-stack-code-audit",
      templates,
      routeOptions,
    })

    expect(preview).toMatchObject({
      title: "Audit codebase risks",
      helpModeLabel: "Review it",
      stageLabel: "Review",
    })
    expect(preview?.stages.map((stage) => stage.id)).toEqual([
      "shape_map",
      "plan",
      "implement",
      "review",
      "verify",
      "ship",
    ])
    expect(preview?.stages.slice(0, 4)).toEqual([
      expect.objectContaining({ id: "shape_map", state: "available" }),
      expect.objectContaining({ id: "plan", state: "available" }),
      expect.objectContaining({ id: "implement", state: "available" }),
      expect.objectContaining({ id: "review", state: "current" }),
    ])
  })

  it("keeps bug investigation inside the main dev spine", () => {
    const templates = [
      createTemplate({
        id: "delivery-investigate-bug",
        name: "Investigate Bug",
        pack: undefined,
      }),
    ]
    const routeOptions: CreateEntryRouteOption[] = [
      {
        templateId: "delivery-investigate-bug",
        label: "Investigate a bug",
        intentLabel: "Do it",
      },
    ]

    const preview = buildCreateRoutingPreview({
      templateId: "delivery-investigate-bug",
      templates,
      routeOptions,
    })

    expect(preview).toMatchObject({
      title: "Investigate a bug",
      helpModeLabel: "Do it",
      stageLabel: "Understand",
    })
    expect(preview?.stages.map((stage) => stage.id)).toEqual([
      "shape_map",
      "plan",
      "implement",
      "review",
      "verify",
      "ship",
    ])
    expect(preview?.stages[0]).toMatchObject({
      id: "shape_map",
      state: "current",
    })
  })

  it("falls back to default development presentation for deep-linked templates", () => {
    const template = createTemplate({
      id: "full-stack-code-audit",
      name: "Full-Stack Code Audit",
      pack: undefined,
    })

    const preview = buildTemplateRoutingPreview({
      template,
      templates: [template],
    })

    expect(preview).toMatchObject({
      title: "Audit codebase risks",
      helpModeLabel: "Review it",
      stageLabel: "Review",
    })
  })
})
