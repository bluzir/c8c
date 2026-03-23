import { describe, expect, it } from "vitest"
import { resolveWorkflowRunAvailability } from "./run-availability"

describe("resolveWorkflowRunAvailability", () => {
  it("allows normal runs when the flow is valid and not blocked", () => {
    expect(
      resolveWorkflowRunAvailability({
        hasSkillNodes: true,
        inputValid: true,
        inputValidationMessage: null,
        hasBlockingErrors: false,
        blockingValidationCount: 0,
        workflowRunBlockReason: null,
      }),
    ).toEqual({
      canRun: true,
      runDisabledReason: null,
      canBatchRun: true,
      batchDisabledReason: null,
      hasRunMenuActions: true,
    })
  })

  it("disables run and batch actions when a blocked continuation guard is active", () => {
    expect(
      resolveWorkflowRunAvailability({
        hasSkillNodes: true,
        inputValid: true,
        inputValidationMessage: null,
        hasBlockingErrors: false,
        blockingValidationCount: 0,
        workflowRunBlockReason:
          "Complete the open approval before running this step.",
      }),
    ).toEqual({
      canRun: false,
      runDisabledReason: "Complete the open approval before running this step.",
      canBatchRun: false,
      batchDisabledReason:
        "Complete the open approval before running this step.",
      hasRunMenuActions: false,
    })
  })

  it("keeps the usual validation reason when there is no blocked continuation", () => {
    expect(
      resolveWorkflowRunAvailability({
        hasSkillNodes: true,
        inputValid: false,
        inputValidationMessage: "Prompt is required",
        hasBlockingErrors: false,
        blockingValidationCount: 0,
        workflowRunBlockReason: null,
      }),
    ).toEqual({
      canRun: false,
      runDisabledReason: "Prompt is required",
      canBatchRun: true,
      batchDisabledReason: null,
      hasRunMenuActions: true,
    })
  })
})
