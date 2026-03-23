// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VerdictData } from "@/components/output/useVerdictData"
import type { FinalResultSectionProps } from "./FinalResultSection"
import { FinalResultSection } from "./FinalResultSection"

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

function createBaseProps(
  overrides: Partial<FinalResultSectionProps> = {},
): FinalResultSectionProps {
  return {
    runStatus: "done",
    runOutcome: "completed",
    verdictData: createVerdictData(),
    resultContent: "The final output of the flow.",
    resultHeadline: undefined,
    showContinuation: false,
    nextStageLabel: null,
    nextStagePending: false,
    onRunNextStage: null,
    onUseInNewFlow: null,
    onStartNewRun: undefined,
    artifactPersistenceStatus: undefined,
    artifactPersistenceError: null,
    executionLoopSummary: null,
    onCopyResult: undefined,
    onContextMenu: undefined,
    ...overrides,
  }
}

afterEach(cleanup)

describe("FinalResultSection", () => {
  it("returns null when runStatus is 'running'", () => {
    const { container } = render(
      <FinalResultSection {...createBaseProps({ runStatus: "running" })} />,
    )
    expect(container.innerHTML).toBe("")
  })

  it("returns null when runStatus is 'idle'", () => {
    const { container } = render(
      <FinalResultSection {...createBaseProps({ runStatus: "idle" })} />,
    )
    expect(container.innerHTML).toBe("")
  })

  it("renders verdict headline when runStatus is 'done'", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          verdictData: createVerdictData({ headline: "Flow completed" }),
        })}
      />,
    )
    expect(screen.getByRole("heading", { name: "Flow completed" })).toBeTruthy()
  })

  it("shows continuation CTA when showContinuation is true", () => {
    const onRunNextStage = vi.fn()
    render(
      <FinalResultSection
        {...createBaseProps({
          showContinuation: true,
          nextStageLabel: "Review",
          onRunNextStage,
        })}
      />,
    )
    expect(
      screen.getByRole("button", { name: /Continue to Review/ }),
    ).toBeTruthy()
  })

  it("does NOT show continuation CTA when showContinuation is false", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          showContinuation: false,
          nextStageLabel: "Review",
          onRunNextStage: vi.fn(),
        })}
      />,
    )
    expect(
      screen.queryByRole("button", { name: /Continue to Review/ }),
    ).toBeNull()
  })

  it("renders result markdown content", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          resultContent: "Here is the unique rendered answer.",
        })}
      />,
    )
    expect(screen.getByText("Here is the unique rendered answer.")).toBeTruthy()
  })

  it("renders evidence items as badge text", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          verdictData: createVerdictData({
            evidenceItems: ["3.2s", "$0.05"],
          }),
        })}
      />,
    )
    expect(screen.getByText("3.2s")).toBeTruthy()
    expect(screen.getByText("$0.05")).toBeTruthy()
  })

  it("applies danger tone class when verdict tone is danger", () => {
    const { container } = render(
      <FinalResultSection
        {...createBaseProps({
          verdictData: createVerdictData({ tone: "danger" }),
        })}
      />,
    )
    expect(container.querySelector(".surface-danger-soft")).toBeTruthy()
  })

  it("applies warning tone class when verdict tone is warning", () => {
    const { container } = render(
      <FinalResultSection
        {...createBaseProps({
          verdictData: createVerdictData({ tone: "warning" }),
        })}
      />,
    )
    expect(container.querySelector(".surface-warning-soft")).toBeTruthy()
  })

  it("shows 'Use in new flow' button when onUseInNewFlow is provided with continuation", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          showContinuation: true,
          nextStageLabel: "Review",
          onRunNextStage: vi.fn(),
          onUseInNewFlow: vi.fn(),
        })}
      />,
    )
    expect(screen.getByText("Use in new flow")).toBeTruthy()
  })

  it("shows 'Run again' button when onStartNewRun is provided with continuation", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          showContinuation: true,
          nextStageLabel: "Review",
          onRunNextStage: vi.fn(),
          onStartNewRun: vi.fn(),
        })}
      />,
    )
    expect(screen.getByText("Run again")).toBeTruthy()
  })

  it("fires onRunNextStage when continue button is clicked", async () => {
    const user = userEvent.setup()
    const onRunNextStage = vi.fn()
    render(
      <FinalResultSection
        {...createBaseProps({
          showContinuation: true,
          nextStageLabel: "Review",
          onRunNextStage,
        })}
      />,
    )
    await user.click(screen.getByRole("button", { name: /Continue to Review/ }))
    expect(onRunNextStage).toHaveBeenCalledTimes(1)
  })

  it("shows artifact persistence error when present", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          showContinuation: true,
          nextStageLabel: "Review",
          onRunNextStage: vi.fn(),
          artifactPersistenceStatus: "error",
          artifactPersistenceError: "Failed to save artifact",
        })}
      />,
    )
    expect(screen.getByText("Failed to save artifact")).toBeTruthy()
  })

  it("shows execution loop summary behind disclosure", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          executionLoopSummary: {
            evaluatorNodeId: "eval-1",
            loopLabel: "Quality check",
            title: "Final gate",
            attempt: 2,
            maxAttempts: 3,
            threshold: 8,
            score: 7,
            failedCriteriaCount: 1,
            criteriaText: "Check quality",
            outcome: "auto-return" as const,
            outcomeLabel: "Returned",
            outcomeSentence: "Score 7/10 below 8/10 threshold.",
            reason: "Quality below bar",
          },
        })}
      />,
    )
    expect(screen.getByText("Quality check")).toBeTruthy()
    expect(screen.getByText("Final gate")).toBeTruthy()
  })

  it("renders nothing for cancelled status (non-terminal for this component)", () => {
    const { container } = render(
      <FinalResultSection
        {...createBaseProps({
          runStatus: "cancelled",
          verdictData: null,
        })}
      />,
    )
    expect(container.innerHTML).toBe("")
  })

  it("renders when runStatus is 'done' even without result content", () => {
    render(
      <FinalResultSection
        {...createBaseProps({
          resultContent: null,
          verdictData: createVerdictData({ headline: "Completed" }),
        })}
      />,
    )
    expect(screen.getByRole("heading", { name: "Completed" })).toBeTruthy()
  })
})
