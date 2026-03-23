// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProcessSpine } from "./process-spine"

describe("ProcessSpine", () => {
  it("uses flow language for the accessible section label", () => {
    render(
      <ProcessSpine
        stages={[
          { id: "shape_map", label: "Understand", state: "done" },
          { id: "plan", label: "Plan", state: "current" },
          { id: "implement", label: "Build", state: "later" },
        ]}
      />,
    )

    expect(screen.getByRole("region", { name: "Flow steps" })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Process stages" })).toBeNull()
  })
})
