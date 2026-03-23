// @vitest-environment jsdom

import { Provider, createStore } from "jotai"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { TemplateBrowser } from "./TemplateBrowser"
import { selectedResultModeIdAtom, templateBrowserOpenAtom } from "@/lib/store"

describe("TemplateBrowser", () => {
  it("shows the start contract and dev spine in the library preview", async () => {
    const user = userEvent.setup()
    const store = createStore()
    store.set(templateBrowserOpenAtom, true)
    store.set(selectedResultModeIdAtom, "development")

    render(
      <Provider store={store}>
        <TemplateBrowser
          initialTemplates={[
            {
              id: "delivery-review-phase",
              name: "Delivery Factory: Review Phase",
              description: "Review the current work before ship.",
              stage: "operations",
              emoji: "R",
              headline: "Review before ship",
              how: "Surface concrete gaps before final checks.",
              input: "Current work",
              output: "Review report",
              steps: [],
              executionPolicy: {
                summary: "Evidence-first, review checks",
              },
              workflow: {
                version: 1,
                name: "Delivery Factory: Review Phase",
                nodes: [],
                edges: [],
              },
            },
          ]}
        />
      </Provider>,
    )

    await user.click(
      await screen.findByRole("option", { name: /Review before ship/i }),
    )

    expect(screen.getByText("Intent")).toBeTruthy()
    expect(screen.getAllByText("Review it").length).toBeGreaterThan(1)
    expect(screen.getByText("Starts in")).toBeTruthy()
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0)
    expect(screen.getByText("Dev Process")).toBeTruthy()
    expect(screen.getByText("Shape / Map")).toBeTruthy()
    expect(screen.getByText("How this flow works")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Start Review before ship" }),
    ).toBeTruthy()
  })
})
