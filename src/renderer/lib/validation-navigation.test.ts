import { describe, expect, it } from "vitest"
import type { Workflow } from "@shared/types"
import { resolveValidationNavigationTarget } from "./validation-navigation"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Validation routing",
    defaults: { provider: "claude", model: "claude-sonnet-4-20250514" },
    nodes: [
      { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "skill-1",
        type: "skill",
        position: { x: 120, y: 0 },
        config: { skillRef: "test/skill", prompt: "run" },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 240, y: 0 },
        config: { strategy: "summarize", prompt: "combine" },
      },
      {
        id: "human-1",
        type: "human",
        position: { x: 360, y: 0 },
        config: {
          mode: "form",
          requestSource: "static",
          staticRequest: {
            version: 1,
            kind: "form",
            title: "Need input",
            fields: [],
          },
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 480, y: 0 },
        config: {},
      },
    ],
    edges: [
      {
        id: "e-input-skill",
        source: "input-1",
        target: "skill-1",
        type: "default",
      },
      {
        id: "e-skill-merger",
        source: "skill-1",
        target: "merger-1",
        type: "default",
      },
      {
        id: "e-merger-human",
        source: "merger-1",
        target: "human-1",
        type: "default",
      },
      {
        id: "e-human-output",
        source: "human-1",
        target: "output-1",
        type: "default",
      },
    ],
  }
}

describe("validation navigation", () => {
  it("routes workflow defaults model errors to the list input card when list mode is preferred", () => {
    const target = resolveValidationNavigationTarget(
      createWorkflow(),
      {
        nodeId: "__workflow__",
        field: "defaults.model",
        message: "model mismatch",
        severity: "error",
      },
      "list",
    )

    expect(target).toEqual({
      viewMode: "list",
      nodeId: "input-1",
      fieldId: "workflow-model-input-1",
    })
  })

  it("routes merger prompt errors to the list merger editor", () => {
    const target = resolveValidationNavigationTarget(
      createWorkflow(),
      {
        nodeId: "merger-1",
        field: "config.prompt",
        message: "prompt invalid",
        severity: "error",
      },
      "list",
    )

    expect(target).toEqual({
      viewMode: "list",
      nodeId: "merger-1",
      fieldId: "merge-prompt-merger-1",
    })
  })

  it("routes merger strategy errors to the list merger editor", () => {
    const target = resolveValidationNavigationTarget(
      createWorkflow(),
      {
        nodeId: "merger-1",
        field: "config.strategy",
        message: "strategy invalid",
        severity: "error",
      },
      "list",
    )

    expect(target).toEqual({
      viewMode: "list",
      nodeId: "merger-1",
      fieldId: "merger-strategy-merger-1",
    })
  })

  it("routes human static request errors to the editable request title field", () => {
    const target = resolveValidationNavigationTarget(
      createWorkflow(),
      {
        nodeId: "human-1",
        field: "config.staticRequest",
        message: "request invalid",
        severity: "error",
      },
      "list",
    )

    expect(target).toEqual({
      viewMode: "list",
      nodeId: "human-1",
      fieldId: "human-title-human-1",
    })
  })

  it("routes permission mode errors to the list skill editor", () => {
    const target = resolveValidationNavigationTarget(
      createWorkflow(),
      {
        nodeId: "skill-1",
        field: "config.permissionMode",
        message: "permission invalid",
        severity: "error",
      },
      "list",
    )

    expect(target).toEqual({
      viewMode: "list",
      nodeId: "skill-1",
      fieldId: "skill-permission-mode-skill-1",
    })
  })
})
