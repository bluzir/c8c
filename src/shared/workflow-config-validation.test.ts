import { describe, expect, it } from "vitest"
import type { WorkflowNode } from "./types"
import { validateWorkflowNodeConfig } from "./workflow-config-validation"

function createNode(overrides: {
  id?: string
  type: WorkflowNode["type"]
  config: Record<string, unknown>
}): WorkflowNode {
  return {
    id: overrides.id || "node-1",
    type: overrides.type,
    position: { x: 0, y: 0 },
    config: overrides.config,
  } as WorkflowNode
}

describe("validateWorkflowNodeConfig", () => {
  it("rejects unknown config keys", () => {
    const issues = validateWorkflowNodeConfig(
      createNode({
        type: "skill",
        config: {
          prompt: "Do the work",
          unexpected: true,
        },
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.unexpected",
          message: 'Unsupported config field "unexpected" for skill nodes.',
        }),
      ]),
    )
  })

  it("requires skill nodes to provide a prompt or skill reference", () => {
    const issues = validateWorkflowNodeConfig(
      createNode({
        type: "skill",
        config: {},
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.prompt",
          message: "Add a prompt or select a skill reference.",
        }),
      ]),
    )
  })

  it("requires evaluator criteria, threshold, and max retries", () => {
    const issues = validateWorkflowNodeConfig(
      createNode({
        type: "evaluator",
        config: {
          criteria: "",
          threshold: Number.NaN,
        },
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.criteria",
          message: "Evaluation criteria is required.",
        }),
        expect.objectContaining({
          field: "config.threshold",
          message: "threshold must be a finite number.",
        }),
        expect.objectContaining({
          field: "config.maxRetries",
          message: "maxRetries must be a non-negative integer.",
        }),
      ]),
    )
  })

  it("requires a splitter strategy", () => {
    const issues = validateWorkflowNodeConfig(
      createNode({
        type: "splitter",
        config: {},
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.strategy",
          message: "Splitter strategy is required.",
        }),
      ]),
    )
  })

  it("rejects unsupported merger strategies and accepts json_array", () => {
    const invalidIssues = validateWorkflowNodeConfig(
      createNode({
        type: "merger",
        config: {
          strategy: "assemble",
        },
      }),
    )

    expect(invalidIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.strategy",
          message:
            "strategy must be concatenate, summarize, select_best, or json_array.",
        }),
      ]),
    )

    expect(
      validateWorkflowNodeConfig(
        createNode({
          type: "merger",
          config: {
            strategy: "json_array",
          },
        }),
      ),
    ).toEqual([])
  })

  it("requires approval nodes to declare rendering booleans", () => {
    const issues = validateWorkflowNodeConfig(
      createNode({
        type: "approval",
        config: {},
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.show_content",
          message: "show_content must be a boolean.",
        }),
        expect.objectContaining({
          field: "config.allow_edit",
          message: "allow_edit must be a boolean.",
        }),
      ]),
    )
  })

  it("validates human mode and request source", () => {
    const issues = validateWorkflowNodeConfig(
      createNode({
        type: "human",
        config: {
          mode: "review",
          requestSource: "other",
        },
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.mode",
          message: "mode must be form or approval.",
        }),
        expect.objectContaining({
          field: "config.requestSource",
          message: "requestSource must be upstream_json or static.",
        }),
      ]),
    )
  })

  it("validates input and output enums", () => {
    const inputIssues = validateWorkflowNodeConfig(
      createNode({
        type: "input",
        config: {
          inputType: "binary",
        },
      }),
    )
    const outputIssues = validateWorkflowNodeConfig(
      createNode({
        type: "output",
        config: {
          format: "html",
        },
      }),
    )

    expect(inputIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.inputType",
          message: "inputType must be auto, text, url, or directory.",
        }),
      ]),
    )
    expect(outputIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "config.format",
          message: "format must be markdown or text.",
        }),
      ]),
    )
  })
})
