import type { Workflow } from "@shared/types"

export const EMPTY_WORKFLOW: Workflow = {
  version: 1,
  name: "",
  description: "",
  defaults: {
    model: "sonnet",
    maxTurns: 120,
    timeout_minutes: 30,
    maxParallel: 8,
  },
  nodes: [
    {
      id: "input-1",
      type: "input",
      position: { x: 0, y: 200 },
      config: {
        inputType: "auto",
        required: true,
      },
    },
    {
      id: "output-1",
      type: "output",
      position: { x: 300, y: 200 },
      config: {
        format: "markdown",
      },
    },
  ],
  edges: [
    {
      id: "e-input-output",
      source: "input-1",
      target: "output-1",
      type: "default",
    },
  ],
}

export function createEmptyWorkflow(): Workflow {
  return structuredClone(EMPTY_WORKFLOW)
}
