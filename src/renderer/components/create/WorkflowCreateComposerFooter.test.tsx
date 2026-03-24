// @vitest-environment jsdom

import { render, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkflowCreateComposerFooter } from "./WorkflowCreateComposerFooter"
import { getResultMode } from "@/lib/result-modes"

describe("WorkflowCreateComposerFooter", () => {
  it("shows an empty intent selector state without an Auto label", () => {
    const view = render(
      <WorkflowCreateComposerFooter
        selectedResultMode={getResultMode("development")}
        developmentHelpModeHint={null}
        showSupportControls
        onSelectMode={vi.fn()}
        onToggleHelpMode={vi.fn()}
        promptHelperOpen={false}
        onTogglePromptHelper={vi.fn()}
        optionalDetailCount={0}
        detailBudget={0}
        onDetailBudgetChange={vi.fn()}
        shortcutHint=""
      />,
    )

    const scope = within(view.container)
    expect(scope.getByRole("button", { name: /intent/i })).toBeTruthy()
    expect(scope.queryByText("Auto")).toBeNull()
  })

  it("shows the intent selector for the content domain", () => {
    const view = render(
      <WorkflowCreateComposerFooter
        selectedResultMode={getResultMode("content")}
        developmentHelpModeHint={null}
        showSupportControls
        onSelectMode={vi.fn()}
        onToggleHelpMode={vi.fn()}
        promptHelperOpen={false}
        onTogglePromptHelper={vi.fn()}
        optionalDetailCount={0}
        detailBudget={0}
        onDetailBudgetChange={vi.fn()}
        shortcutHint=""
      />,
    )

    const scope = within(view.container)
    expect(scope.getByRole("button", { name: /intent/i })).toBeTruthy()
  })

  it("hides the intent selector for domains without explicit intent support", () => {
    const view = render(
      <WorkflowCreateComposerFooter
        selectedResultMode={getResultMode("marketing")}
        developmentHelpModeHint={null}
        showSupportControls
        onSelectMode={vi.fn()}
        onToggleHelpMode={vi.fn()}
        promptHelperOpen={false}
        onTogglePromptHelper={vi.fn()}
        optionalDetailCount={0}
        detailBudget={0}
        onDetailBudgetChange={vi.fn()}
        shortcutHint=""
      />,
    )

    const scope = within(view.container)
    expect(scope.queryByRole("button", { name: /intent/i })).toBeNull()
  })
})
