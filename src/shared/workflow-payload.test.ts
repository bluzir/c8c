import { describe, expect, it } from "vitest"
import { parseWorkflowPayload } from "./workflow-payload"

describe("parseWorkflowPayload", () => {
  it("accepts a structurally valid workflow payload", () => {
    expect(
      parseWorkflowPayload({
        version: 1,
        name: "Flow",
        nodes: [
          { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
          {
            id: "output",
            type: "output",
            position: { x: 1, y: 0 },
            config: {},
          },
        ],
        edges: [
          { id: "edge-1", source: "input", target: "output", type: "default" },
        ],
      }),
    ).toMatchObject({
      version: 1,
      name: "Flow",
    })
  })

  it("rejects malformed workflow payloads before downstream validation runs", () => {
    expect(() =>
      parseWorkflowPayload({
        version: 1,
        name: "Broken",
        nodes: [
          {
            id: "input",
            type: "input",
            position: { x: "0", y: 0 },
            config: {},
          },
        ],
        edges: [],
      }),
    ).toThrow(
      'Workflow payload node "input" position must include finite x/y numbers.',
    )
  })
})
