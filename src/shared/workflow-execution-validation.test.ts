import { describe, expect, it } from "vitest"
import type { Workflow } from "./types"
import {
  formatWorkflowExecutionIssue,
  validateWorkflowForExecution,
} from "./workflow-execution-validation"

function createLinearWorkflow(): Workflow {
  return {
    version: 1,
    name: "Linear",
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "skill-1",
        type: "skill",
        position: { x: 160, y: 0 },
        config: {
          prompt: "Do the work",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 320, y: 0 },
        config: {},
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "input-1",
        target: "skill-1",
        type: "default",
      },
      {
        id: "edge-2",
        source: "skill-1",
        target: "output-1",
        type: "default",
      },
    ],
  }
}

describe("workflow execution validation", () => {
  it("returns no blocking issues for a valid linear workflow", () => {
    expect(validateWorkflowForExecution(createLinearWorkflow())).toEqual([])
  })

  it("surfaces shared blocking issues for malformed workflows", () => {
    const brokenWorkflow: Workflow = {
      version: 1,
      name: "Broken",
      nodes: [
        {
          id: "skill-1",
          type: "skill",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "skill-1",
          type: "output",
          position: { x: 160, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "missing-source",
          target: "missing-target",
          type: "default",
        },
      ],
    }

    const issues = validateWorkflowForExecution(brokenWorkflow)

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: "skill-1",
          field: "config.prompt",
          message: "Add a prompt or select a skill reference.",
          severity: "error",
        }),
        expect.objectContaining({
          nodeId: "__workflow__",
          field: "nodes.input",
          message: "Workflow must have at least one input node.",
          severity: "error",
        }),
        expect.objectContaining({
          nodeId: "__workflow__",
          field: "edges.edge-1.source",
          message:
            'Edge "edge-1" references nonexistent source node "missing-source".',
          severity: "error",
        }),
        expect.objectContaining({
          nodeId: "skill-1",
          field: "id",
          message: 'Duplicate node ID "skill-1".',
          severity: "error",
        }),
      ]),
    )
  })

  it("ignores evaluator fail loops when checking for execution cycles", () => {
    const retryWorkflow: Workflow = {
      version: 1,
      name: "Retry loop",
      nodes: [
        {
          id: "input-1",
          type: "input",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "skill-1",
          type: "skill",
          position: { x: 160, y: 0 },
          config: { prompt: "Write a draft" },
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 320, y: 0 },
          config: {
            criteria: "Score clarity",
            threshold: 8,
            maxRetries: 3,
            retryFrom: "skill-1",
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
        { id: "edge-1", source: "input-1", target: "skill-1", type: "default" },
        { id: "edge-2", source: "skill-1", target: "eval-1", type: "default" },
        { id: "edge-3", source: "eval-1", target: "output-1", type: "pass" },
        { id: "edge-4", source: "eval-1", target: "skill-1", type: "fail" },
      ],
    }

    expect(
      validateWorkflowForExecution(retryWorkflow).find(
        (issue) => issue.field === "edges",
      ),
    ).toBeUndefined()
  })

  it("rejects evaluator retry targets that do not exist", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Broken retry target",
      nodes: [
        {
          id: "input-1",
          type: "input",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "eval-1",
          type: "evaluator",
          position: { x: 160, y: 0 },
          config: {
            criteria: "Check quality",
            threshold: 8,
            maxRetries: 2,
            retryFrom: "missing-node",
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 320, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "edge-1", source: "input-1", target: "eval-1", type: "default" },
        { id: "edge-2", source: "eval-1", target: "output-1", type: "pass" },
      ],
    }

    expect(validateWorkflowForExecution(workflow)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: "eval-1",
          field: "config.retryFrom",
          message:
            'Retry target "missing-node" does not exist in this workflow.',
          severity: "error",
        }),
      ]),
    )
  })

  it("formats workflow-level and node-level execution issues for UI display", () => {
    expect(
      formatWorkflowExecutionIssue({
        nodeId: "__workflow__",
        field: "nodes.output",
        message: "Workflow must have at least one output node.",
        severity: "error",
      }),
    ).toBe("Workflow must have at least one output node.")

    expect(
      formatWorkflowExecutionIssue({
        nodeId: "skill-1",
        field: "config.prompt",
        message: "Add a prompt or select a skill reference.",
        severity: "error",
      }),
    ).toBe(
      'Node "skill-1" config.prompt: Add a prompt or select a skill reference.',
    )
  })
})
