// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ActivityTab } from "./ActivityTab"

const SELECTED_STAGE_PRESENTATION = {
  kind: "Check" as const,
  group: "Review check",
  title: "Review before ship",
  outcomeLabel: "Delivers",
  outcomeText: "This step delivers review notes ready for verification.",
  artifactLabel: "Review notes",
  artifactRoleLabel: "Intermediate",
}

describe("ActivityTab", () => {
  it("uses result language in the ready-to-inspect summary", () => {
    render(
      <ActivityTab
        showIdleState={false}
        isStartingState={false}
        selectedStagePresentation={SELECTED_STAGE_PRESENTATION}
        selectedStageContextLabelClass="text-status-success"
        selectedStageContextLabel="Completed step"
        runProgressItems={[]}
        resultReadyLabel="Review notes ready"
        budgetWarningClassName="text-status-warning"
      />,
    )

    expect(screen.getByText("Ready to inspect")).toBeTruthy()
    expect(
      screen.getByText(
        "Review notes ready. Open the result surface to inspect or copy the latest result.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/latest artifact/i)).toBeNull()
  })

  it("keeps token usage behind disclosure in the summary surface", async () => {
    const user = userEvent.setup()

    render(
      <ActivityTab
        showIdleState={false}
        isStartingState={false}
        selectedStagePresentation={SELECTED_STAGE_PRESENTATION}
        selectedStageContextLabelClass="text-status-success"
        selectedStageContextLabel="Completed step"
        runProgressItems={[]}
        selectedStageResourceLabel="~52K tokens"
        selectedStageResourceItems={["1.2k input", "51.0k output", "sonnet"]}
        budgetWarningClassName="text-status-warning"
      />,
    )

    expect(screen.getByText("Resource footprint")).toBeTruthy()
    expect(screen.getByText("~52K tokens")).toBeTruthy()
    expect(screen.queryByText("1.2k input")).toBeNull()

    await user.click(
      screen.getByRole("button", { name: /show token and runtime details/i }),
    )

    expect(screen.getByText("1.2k input")).toBeTruthy()
    expect(screen.getByText("51.0k output")).toBeTruthy()
    expect(screen.getByText("sonnet")).toBeTruthy()
  })
})
