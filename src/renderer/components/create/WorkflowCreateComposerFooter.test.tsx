// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkflowCreateComposerFooter } from "./WorkflowCreateComposerFooter"
import { getResultMode } from "@/lib/result-modes"

describe("WorkflowCreateComposerFooter", () => {
  it("shows an empty intent selector state without an Auto label", () => {
    render(
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

    expect(screen.getByRole("button", { name: /intent/i })).toBeTruthy()
    expect(screen.queryByText("Auto")).toBeNull()
  })
})
