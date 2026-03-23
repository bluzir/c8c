import { describe, it, expect } from "vitest"
import type { Workflow } from "./types"

describe("Workflow types", () => {
  it("should define a valid linear workflow", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Test Linear",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 300, y: 0 },
          config: {
            skillRef: "test/skill",
            prompt: "Do something",
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 600, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "skill-1", type: "default" },
        { id: "e2", source: "skill-1", target: "output-1", type: "default" },
      ],
    }
    expect(workflow.nodes).toHaveLength(3)
    expect(workflow.edges).toHaveLength(2)
    expect(workflow.version).toBe(1)
  })

  it("should define a workflow with evaluator loop", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Test Loop",
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 300, y: 0 },
          config: { skillRef: "test/skill", prompt: "Rewrite" },
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 600, y: 0 },
          config: {
            criteria: "Score 1-10 on clarity",
            threshold: 8,
            maxRetries: 3,
            retryFrom: "skill-1",
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 900, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "skill-1", type: "default" },
        { id: "e2", source: "skill-1", target: "eval-1", type: "default" },
        { id: "e3", source: "eval-1", target: "output-1", type: "pass" },
        { id: "e4", source: "eval-1", target: "skill-1", type: "fail" },
      ],
    }
    const evalEdges = workflow.edges.filter((e) => e.source === "eval-1")
    expect(evalEdges).toHaveLength(2)
    expect(evalEdges.map((e) => e.type).sort()).toEqual(["fail", "pass"])
  })
})
