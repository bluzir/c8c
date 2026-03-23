import { describe, expect, it } from "vitest"
import type { ProjectFactoryBlueprint, WorkflowTemplate } from "@shared/types"
import type { WorkflowTemplateRunContext } from "@/lib/workflow-entry"
import {
  buildProcessSpine,
  deriveProcessSpineStageId,
  selectProcessSpineFactory,
} from "./process-spine"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Factory: Plan Phase",
    description: "Plan the next implementation phase.",
    stage: "strategy",
    emoji: "📐",
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

function createContext(
  overrides: Partial<WorkflowTemplateRunContext> = {},
): WorkflowTemplateRunContext {
  return {
    templateId: "delivery-plan-phase",
    templateName: "Delivery Factory: Plan Phase",
    workflowPath: "/tmp/plan-phase.chain",
    workflowName: "Plan Phase",
    source: "template",
    pack: {
      id: "delivery-foundation",
      label: "Delivery Factory",
      journeyStage: "plan",
      recommendedNext: ["delivery-implement-phase"],
    },
    ...overrides,
  }
}

describe("process-spine", () => {
  it("maps core and review-oriented templates to canonical process stages", () => {
    expect(
      deriveProcessSpineStageId(
        createTemplate({
          id: "delivery-map-codebase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "map",
          },
        }),
      ),
    ).toBe("shape_map")

    expect(
      deriveProcessSpineStageId(
        createTemplate({
          id: "delivery-review-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "review",
          },
        }),
      ),
    ).toBe("review")

    expect(
      deriveProcessSpineStageId(
        createTemplate({
          id: "delivery-verify-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "verify",
          },
        }),
      ),
    ).toBe("verify")

    expect(
      deriveProcessSpineStageId(
        createTemplate({
          id: "ux-ui-polish-audit",
          pack: undefined,
        }),
      ),
    ).toBe("review")
  })

  it("builds a compact dev spine with current and next states", () => {
    const stages = buildProcessSpine({
      context: createContext(),
      nextTemplate: createTemplate({
        id: "delivery-implement-phase",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "execute",
        },
      }),
      templates: [
        createTemplate({
          id: "delivery-map-codebase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "map",
          },
        }),
        createTemplate(),
        createTemplate({
          id: "delivery-implement-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "execute",
          },
        }),
        createTemplate({
          id: "delivery-review-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "review",
          },
        }),
        createTemplate({
          id: "delivery-verify-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "verify",
          },
        }),
      ],
      runStatus: "idle",
      runOutcome: null,
    })

    expect(stages).toEqual([
      expect.objectContaining({ id: "shape_map", state: "available" }),
      expect.objectContaining({ id: "plan", state: "current" }),
      expect.objectContaining({ id: "implement", state: "next" }),
      expect.objectContaining({ id: "review", state: "later" }),
      expect.objectContaining({ id: "verify", state: "later" }),
      expect.objectContaining({ id: "ship", state: "later" }),
    ])
    expect(stages?.map((stage) => stage.label)).toEqual([
      "Shape / Map",
      "Plan",
      "Implement",
      "Review",
      "Verify",
      "Ship",
    ])
  })

  it("keeps review-oriented entries inside the full dev spine", () => {
    const stages = buildProcessSpine({
      context: createContext({
        templateId: "ux-ui-polish-audit",
        templateName: "UX/UI Polish Audit",
        pack: undefined,
      }),
      nextTemplate: createTemplate({
        id: "delivery-verify-phase",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "verify",
        },
      }),
      templates: [],
      runStatus: "idle",
      runOutcome: null,
      reviewingPastRun: true,
    })

    expect(stages).toEqual([
      expect.objectContaining({ id: "shape_map", state: "available" }),
      expect.objectContaining({ id: "plan", state: "available" }),
      expect.objectContaining({ id: "implement", state: "available" }),
      expect.objectContaining({ id: "review", state: "done" }),
      expect.objectContaining({ id: "verify", state: "next" }),
      expect.objectContaining({ id: "ship", state: "later" }),
    ])
  })

  it("finds a matching factory definition for the current pack", () => {
    const blueprint: ProjectFactoryBlueprint = {
      version: 2,
      projectPath: "/tmp/project",
      factories: [
        {
          id: "factory:content",
          label: "Content Factory",
          recipe: {
            packIds: ["content-factory-alpha"],
          },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "factory:delivery",
          label: "Delivery Factory",
          recipe: {
            packIds: ["delivery-foundation"],
            stageOrder: [
              "Shape / Map",
              "Plan",
              "Implement",
              "Review",
              "Verify",
            ],
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      selectedFactoryId: "factory:delivery",
      createdAt: 1,
      updatedAt: 1,
    }

    const factory = selectProcessSpineFactory(
      blueprint,
      createContext({
        factoryId: undefined,
        factoryLabel: undefined,
      }),
    )

    expect(factory?.id).toBe("factory:delivery")
  })

  it("prefers the actively selected factory when multiple factories match the same pack", () => {
    const blueprint: ProjectFactoryBlueprint = {
      version: 2,
      projectPath: "/tmp/project",
      factories: [
        {
          id: "factory:delivery-legacy",
          label: "Delivery Factory",
          recipe: {
            packIds: ["delivery-foundation"],
            stageOrder: [
              "Shape / Map",
              "Plan",
              "Implement",
              "Review",
              "Verify",
            ],
          },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "factory:delivery-active",
          label: "Checkout Delivery Factory",
          recipe: {
            packIds: ["delivery-foundation"],
            stageOrder: [
              "Shape / Map",
              "Plan",
              "Implement",
              "Review",
              "Verify",
            ],
          },
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      selectedFactoryId: "factory:delivery-active",
      createdAt: 1,
      updatedAt: 2,
    }

    const factory = selectProcessSpineFactory(
      blueprint,
      createContext({
        factoryId: undefined,
        factoryLabel: undefined,
      }),
    )

    expect(factory?.id).toBe("factory:delivery-active")
  })
})
