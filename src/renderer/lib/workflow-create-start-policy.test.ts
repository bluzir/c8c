import { describe, expect, it } from "vitest"
import type { CreateEntryRouteResult, WorkflowTemplate } from "@shared/types"
import {
  routeUsesLightweightEntry,
  shouldAutoRunCreateStart,
} from "./workflow-create-start-policy"

function createRouteResult(
  overrides: Partial<CreateEntryRouteResult> = {},
): CreateEntryRouteResult {
  return {
    recommendedTemplateId: "delivery-shape-project",
    alternateTemplateIds: [],
    reason: "Direct app change.",
    projectInspection: {
      projectPath: "/tmp/project",
      git: {
        isRepo: true,
        branch: "main",
        hasUncommittedDiff: false,
      },
      manifests: ["package.json"],
      codeDirs: ["src"],
      fileDensity: "active",
      fileCountEstimate: 8,
      projectKind: "existing_repo",
    },
    seed: {
      primaryInputMode: "text",
      primaryInputValue: "Fix the spacing in the settings form",
      attachments: [],
    },
    confidence: 0.88,
    source: "agent",
    clarification: null,
    ...overrides,
  }
}

function createTemplate(id: string): WorkflowTemplate {
  return {
    id,
    name: id,
    description: `${id} description`,
    stage: "strategy",
    emoji: "🧩",
    headline: id,
    how: `${id} how`,
    input: `${id} input`,
    output: `${id} output`,
    steps: [],
    workflow: {
      version: 1,
      name: id,
      nodes: [],
      edges: [],
    },
  }
}

describe("workflow-create-start-policy", () => {
  it("treats routed delivery-shape-project starts as lightweight entry", () => {
    expect(
      routeUsesLightweightEntry(
        createRouteResult(),
        createTemplate("delivery-shape-project"),
      ),
    ).toBe(true)
    expect(
      shouldAutoRunCreateStart(
        createRouteResult(),
        createTemplate("delivery-shape-project"),
      ),
    ).toBe(true)
  })

  it("does not auto-run non-lightweight templates", () => {
    expect(
      shouldAutoRunCreateStart(
        createRouteResult({
          recommendedTemplateId: "delivery-plan-phase",
        }),
        createTemplate("delivery-plan-phase"),
      ),
    ).toBe(false)
  })

  it("does not auto-run clarification routes", () => {
    expect(
      shouldAutoRunCreateStart(
        createRouteResult({
          clarification: {
            kind: "help_mode",
            title: "Pick the help mode",
            message: "Choose how you want help.",
            options: [
              { value: "do", label: "Do it", description: "Apply the change." },
            ],
          },
        }),
        createTemplate("delivery-shape-project"),
      ),
    ).toBe(false)
  })
})
