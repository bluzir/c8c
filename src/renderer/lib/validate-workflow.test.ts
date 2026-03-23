import { describe, expect, it } from "vitest"
import type { Workflow } from "@shared/types"
import { validateWorkflow } from "./validate-workflow"

function makeWorkflow(skillConfig: Record<string, unknown>): Workflow {
  return {
    version: 1,
    name: "Test workflow",
    description: "",
    defaults: { model: "sonnet", maxTurns: 60 },
    nodes: [
      { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "skill-1",
        type: "skill",
        position: { x: 240, y: 0 },
        config: skillConfig as any,
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 480, y: 0 },
        config: {},
      },
    ],
    edges: [
      { id: "e1", source: "input-1", target: "skill-1", type: "default" },
      { id: "e2", source: "skill-1", target: "output-1", type: "default" },
    ],
  }
}

describe("validateWorkflow", () => {
  it("allows prompt-only skill nodes", () => {
    expect(
      validateWorkflow(makeWorkflow({ skillRef: "", prompt: "Do it" })),
    ).toEqual([])
  })

  it("fails skill nodes with neither prompt nor skillRef", () => {
    const errors = validateWorkflow(
      makeWorkflow({ skillRef: " ", prompt: " " }),
    )
    expect(
      errors.some((error) =>
        error.message.includes("Add a prompt or select a skill reference."),
      ),
    ).toBe(true)
  })

  it("fails evaluator nodes with unsupported config fields", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Evaluator shape",
      description: "",
      defaults: { model: "sonnet", maxTurns: 60 },
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 240, y: 0 },
          config: {
            criteria: "Score it",
            threshold: 8,
            maxRetries: 1,
            skillRef: "quality/code-review",
          } as any,
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 480, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "eval-1", type: "default" },
        { id: "e2", source: "eval-1", target: "output-1", type: "pass" },
      ],
    }

    const errors = validateWorkflow(workflow)
    expect(
      errors.some(
        (error) =>
          error.field === "config.skillRef" &&
          error.message.includes("Unsupported config field"),
      ),
    ).toBe(true)
  })
})
