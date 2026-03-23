// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StepsList } from "./StepsList"
import type {
  WorkflowNode,
  NodeState,
  WorkflowRuntimeMeta,
  EvaluationResult,
} from "@shared/types"

function makeSkillNode(id: string, prompt = "Do something"): WorkflowNode {
  return {
    id,
    type: "skill",
    position: { x: 0, y: 0 },
    config: { prompt },
  } as WorkflowNode
}

function makeSplitterNode(id: string): WorkflowNode {
  return {
    id,
    type: "splitter",
    position: { x: 0, y: 0 },
    config: { strategy: "parallel", maxBranches: 5 },
  } as WorkflowNode
}

function makeNodeState(
  overrides: Partial<NodeState> & Pick<NodeState, "status">,
): NodeState {
  return {
    attempts: 1,
    log: [],
    ...overrides,
  }
}

describe("StepsList", () => {
  afterEach(cleanup)
  it("renders all steps from nodes array", () => {
    const nodes = [
      makeSkillNode("a", "First step"),
      makeSkillNode("b", "Second step"),
      makeSkillNode("c", "Third step"),
    ]

    render(<StepsList nodes={nodes} nodeStates={{}} />)

    // getRuntimeNodeLabel falls back to the node id or a presentation label
    // We just verify three step rows are rendered
    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(3)
  })

  it("running step is auto-expanded", () => {
    const nodes = [makeSkillNode("a"), makeSkillNode("b")]
    const nodeStates: Record<string, NodeState> = {
      a: makeNodeState({ status: "completed" }),
      b: makeNodeState({ status: "running" }),
    }

    render(<StepsList nodes={nodes} nodeStates={nodeStates} activeNodeId="b" />)

    const buttons = screen.getAllByRole("button")
    // The running step (b) should be expanded
    expect(buttons[1].getAttribute("aria-expanded")).toBe("true")
    // The done step (a) should not be expanded
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false")
  })

  it("clicking a done step expands it and collapses others", async () => {
    const user = userEvent.setup()
    const nodes = [makeSkillNode("a"), makeSkillNode("b")]
    const nodeStates: Record<string, NodeState> = {
      a: makeNodeState({
        status: "completed",
        output: {
          content: "Result A",
          metadata: { source: "skill" },
        },
      }),
      b: makeNodeState({
        status: "completed",
        output: {
          content: "Result B",
          metadata: { source: "skill" },
        },
      }),
    }

    render(<StepsList nodes={nodes} nodeStates={nodeStates} />)

    const buttons = screen.getAllByRole("button")

    // Click the first done step to expand it
    await user.click(buttons[0])
    expect(buttons[0].getAttribute("aria-expanded")).toBe("true")
    expect(buttons[1].getAttribute("aria-expanded")).toBe("false")

    // Click the second done step — first should collapse
    await user.click(buttons[1])
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false")
    expect(buttons[1].getAttribute("aria-expanded")).toBe("true")
  })

  it("pending steps are not expandable", async () => {
    const user = userEvent.setup()
    const nodes = [makeSkillNode("a")]

    render(<StepsList nodes={nodes} nodeStates={{}} />)

    const button = screen.getByRole("button")
    // Pending step button should be disabled
    expect(button).toHaveProperty("disabled", true)
    expect(button.getAttribute("aria-expanded")).toBe("false")

    await user.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
  })

  it("shows fan-out progress for splitter nodes", () => {
    const nodes = [makeSplitterNode("split1")]
    const nodeStates: Record<string, NodeState> = {
      split1: makeNodeState({ status: "running" }),
    }
    const runtimeMeta: WorkflowRuntimeMeta = {
      "branch-1": {
        subtaskKey: "task-1",
        branchIndex: 0,
        totalBranches: 3,
        splitterId: "split1",
        templateId: "split1",
      },
      "branch-2": {
        subtaskKey: "task-2",
        branchIndex: 1,
        totalBranches: 3,
        splitterId: "split1",
        templateId: "split1",
      },
      "branch-3": {
        subtaskKey: "task-3",
        branchIndex: 2,
        totalBranches: 3,
        splitterId: "split1",
        templateId: "split1",
      },
    }
    // Mark first two branches as completed
    nodeStates["branch-1"] = makeNodeState({ status: "completed" })
    nodeStates["branch-2"] = makeNodeState({ status: "completed" })
    nodeStates["branch-3"] = makeNodeState({ status: "running" })

    render(
      <StepsList
        nodes={nodes}
        nodeStates={nodeStates}
        activeNodeId="split1"
        runtimeMeta={runtimeMeta}
      />,
    )

    // Should show "2 / 3" fan-out progress
    expect(screen.getByText("2 / 3")).toBeTruthy()
  })

  it("shows error text for failed steps when expanded", () => {
    const nodes = [makeSkillNode("a")]
    const nodeStates: Record<string, NodeState> = {
      a: makeNodeState({
        status: "failed",
        error: "Something went wrong",
      }),
    }

    render(<StepsList nodes={nodes} nodeStates={nodeStates} activeNodeId="a" />)

    expect(screen.getByText("Something went wrong")).toBeTruthy()
  })

  it("shows result text for done steps when expanded", async () => {
    const user = userEvent.setup()
    const nodes = [makeSkillNode("a")]
    const nodeStates: Record<string, NodeState> = {
      a: makeNodeState({
        status: "completed",
        output: {
          content: "The analysis is complete.",
          metadata: { source: "skill" },
        },
      }),
    }

    render(<StepsList nodes={nodes} nodeStates={nodeStates} />)

    await user.click(screen.getByRole("button"))
    expect(screen.getByText("The analysis is complete.")).toBeTruthy()
  })

  it("shows log placeholder for running step", () => {
    const nodes = [makeSkillNode("a")]
    const nodeStates: Record<string, NodeState> = {
      a: makeNodeState({ status: "running" }),
    }

    render(<StepsList nodes={nodes} nodeStates={nodeStates} activeNodeId="a" />)

    expect(screen.getByTestId("step-log-placeholder")).toBeTruthy()
  })

  it("shows blocked text for waiting_approval steps", () => {
    const nodes = [makeSkillNode("a")]
    const nodeStates: Record<string, NodeState> = {
      a: makeNodeState({ status: "waiting_approval" as NodeState["status"] }),
    }

    render(<StepsList nodes={nodes} nodeStates={nodeStates} activeNodeId="a" />)

    expect(screen.getByText("Waiting for approval")).toBeTruthy()
  })

  it("auto-expands when activeNodeId changes", () => {
    const nodes = [makeSkillNode("a"), makeSkillNode("b")]
    const nodeStates: Record<string, NodeState> = {
      a: makeNodeState({ status: "completed" }),
      b: makeNodeState({ status: "running" }),
    }

    const { rerender } = render(
      <StepsList nodes={nodes} nodeStates={nodeStates} activeNodeId="a" />,
    )

    const buttons = screen.getAllByRole("button")
    // Initially a is expanded (it's active)
    expect(buttons[0].getAttribute("aria-expanded")).toBe("true")

    // Change activeNodeId to b
    rerender(
      <StepsList nodes={nodes} nodeStates={nodeStates} activeNodeId="b" />,
    )

    // Now b should be expanded
    expect(buttons[1].getAttribute("aria-expanded")).toBe("true")
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false")
  })
})
