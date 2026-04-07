// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { NodeState } from "@shared/types"
import type { VerdictData } from "@/components/output/useVerdictData"
import type { RunViewProps } from "./RunView"
import { makeSkillNode, makeNodeState } from "@/test-utils"

// Mock child components to isolate RunView orchestration logic
vi.mock("./StepsList", () => ({
  StepsList: (props: Record<string, unknown>) => (
    <div
      data-testid="steps-list-mock"
      data-nodes={JSON.stringify(props.nodes)}
    />
  ),
}))

vi.mock("./FinalResultSection", () => ({
  FinalResultSection: (props: Record<string, unknown>) => (
    <div
      data-testid="final-result-mock"
      data-run-status={props.runStatus as string}
    />
  ),
}))

// Import after mocks are set up
const { RunView } = await import("./RunView")

function createVerdictData(overrides: Partial<VerdictData> = {}): VerdictData {
  return {
    terminalVariant: "completed",
    variant: "outcome",
    surfaceMode: "decision",
    tone: "neutral",
    headline: "Result ready",
    provenanceLabel: null,
    evidenceItems: [],
    evidencePanelKind: null,
    evidencePanelTitle: null,
    evidencePanelItems: [],
    followUpLabel: null,
    preservedText: null,
    ...overrides,
  }
}

function createBaseProps(overrides: Partial<RunViewProps> = {}): RunViewProps {
  return {
    workflow: { version: 1, name: "Test Flow", nodes: [], edges: [] },
    nodes: [makeSkillNode("a"), makeSkillNode("b")],
    runStatus: "running",
    nodeStates: {
      a: makeNodeState({ status: "completed" }),
      b: makeNodeState({ status: "running" }),
    },
    activeNodeId: "b",
    verdictData: null,
    resultContent: null,
    showArtifactContinuation: false,
    ...overrides,
  }
}

afterEach(cleanup)

describe("RunView", () => {
  it("renders StepsList when running", () => {
    render(<RunView {...createBaseProps()} />)

    expect(screen.getByTestId("steps-list-mock")).toBeTruthy()
  })

  it("does NOT render FinalResultSection when running", () => {
    render(<RunView {...createBaseProps({ runStatus: "running" })} />)

    expect(screen.queryByTestId("final-result-mock")).toBeNull()
  })

  it("renders both StepsList and FinalResultSection when completed", () => {
    render(
      <RunView
        {...createBaseProps({
          runStatus: "done",
          runOutcome: "completed",
          verdictData: createVerdictData(),
          resultContent: "Final result text.",
        })}
      />,
    )

    expect(screen.getByTestId("steps-list-mock")).toBeTruthy()
    expect(screen.getByTestId("final-result-mock")).toBeTruthy()
  })

  it("shows starting spinner for starting state", () => {
    render(<RunView {...createBaseProps({ runStatus: "starting" })} />)

    expect(screen.getByText("Preparing flow...")).toBeTruthy()
    // StepsList should still render below the spinner
    expect(screen.getByTestId("steps-list-mock")).toBeTruthy()
  })

  it("renders nothing meaningful for idle state", () => {
    const { container } = render(
      <RunView {...createBaseProps({ runStatus: "idle", nodeStates: {} })} />,
    )

    expect(screen.queryByTestId("steps-list-mock")).toBeNull()
    expect(screen.queryByTestId("final-result-mock")).toBeNull()
    // Container should be empty or have no visible content
    expect(container.textContent).toBe("")
  })

  it("renders StepsList for blocked status", () => {
    render(
      <RunView
        {...createBaseProps({
          runStatus: "running",
          nodeStates: {
            a: makeNodeState({ status: "completed" }),
            b: makeNodeState({
              status: "waiting_approval" as NodeState["status"],
            }),
          },
        })}
      />,
    )

    expect(screen.getByTestId("steps-list-mock")).toBeTruthy()
    expect(screen.queryByTestId("final-result-mock")).toBeNull()
  })

  it("renders StepsList for error/failed status without FinalResultSection", () => {
    render(
      <RunView
        {...createBaseProps({
          runStatus: "error",
          runOutcome: "failed",
          nodeStates: {
            a: makeNodeState({ status: "completed" }),
            b: makeNodeState({ status: "failed", error: "Something broke" }),
          },
        })}
      />,
    )

    expect(screen.getByTestId("steps-list-mock")).toBeTruthy()
    expect(screen.queryByTestId("final-result-mock")).toBeNull()
  })

  it("passes correct props to FinalResultSection on completion", () => {
    const onCopyResult = vi.fn()
    const onRunNextStage = vi.fn()

    render(
      <RunView
        {...createBaseProps({
          runStatus: "done",
          runOutcome: "completed",
          verdictData: createVerdictData(),
          resultContent: "Final output.",
          showArtifactContinuation: true,
          nextStageLabel: "Review",
          onRunNextStage,
          onCopyResult,
        })}
      />,
    )

    const finalResult = screen.getByTestId("final-result-mock")
    expect(finalResult.getAttribute("data-run-status")).toBe("done")
  })

  it("renders in review mode same as completed", () => {
    render(
      <RunView
        {...createBaseProps({
          runStatus: "done",
          runOutcome: "completed",
          verdictData: createVerdictData(),
          resultContent: "Historical result.",
          reviewingRunHistory: true,
        })}
      />,
    )

    expect(screen.getByTestId("steps-list-mock")).toBeTruthy()
    expect(screen.getByTestId("final-result-mock")).toBeTruthy()
  })
})
