import { describe, expect, it } from "vitest"
import { workflowHasMeaningfulContent } from "./workflow-content"

describe("workflowHasMeaningfulContent", () => {
  it("returns false for a blank workflow", () => {
    expect(
      workflowHasMeaningfulContent({
        version: 1,
        name: "",
        description: "   ",
        nodes: [],
        edges: [],
      }),
    ).toBe(false)
  })

  it("returns true when the workflow has a name, description, or nodes", () => {
    expect(
      workflowHasMeaningfulContent({
        version: 1,
        name: "Deep Research",
        description: "",
        nodes: [],
        edges: [],
      }),
    ).toBe(true)

    expect(
      workflowHasMeaningfulContent({
        version: 1,
        name: "",
        description: "Research competitors",
        nodes: [],
        edges: [],
      }),
    ).toBe(true)

    expect(
      workflowHasMeaningfulContent({
        version: 1,
        name: "",
        description: "",
        nodes: [
          {
            id: "input-1",
            type: "input",
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      }),
    ).toBe(true)
  })
})
