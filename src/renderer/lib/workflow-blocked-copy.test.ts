import { describe, expect, it } from "vitest"
import {
  deriveBlockedTaskLatestResultText,
  deriveBlockedTaskReasonText,
  deriveBlockedTaskStatusText,
} from "./workflow-blocked-copy"

describe("workflow-blocked-copy", () => {
  it("builds sentence-form status text for approval and input tasks", () => {
    expect(deriveBlockedTaskStatusText({ kind: "approval" }, "Ship")).toBe(
      "Blocked: awaiting your approval before Ship can continue.",
    )
    expect(deriveBlockedTaskStatusText({ kind: "form" }, "Plan")).toBe(
      "Blocked: waiting for input before Plan can continue.",
    )
    expect(deriveBlockedTaskStatusText({ kind: "approval" })).toBe(
      "Blocked: awaiting your approval before the flow can continue.",
    )
  })

  it("prefers explicit summary and falls back to readable reasons", () => {
    expect(
      deriveBlockedTaskReasonText(
        {
          kind: "approval",
          title: "Ship approval",
          summary:
            "Review and Check passed; final release decision not yet recorded.",
          instructions: undefined,
        },
        "Ship",
      ),
    ).toBe("Review and Check passed; final release decision not yet recorded.")

    expect(
      deriveBlockedTaskReasonText(
        {
          kind: "form",
          title: "Need missing input",
          summary: undefined,
          instructions: undefined,
        },
        "Plan",
      ),
    ).toBe(
      "Plan is waiting for the missing input before the flow can continue.",
    )
  })

  it("formats latest result text only when a saved result exists", () => {
    expect(deriveBlockedTaskLatestResultText(null)).toBeNull()
    expect(
      deriveBlockedTaskLatestResultText({
        id: "artifact-1",
        kind: "verification_report",
        title: "Verification Report",
        caseId: "case:1",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-1",
        relativePath: "artifact.md",
        contentPath: "/tmp/project/artifact.md",
        metadataPath: "/tmp/project/artifact.json",
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toBe("Latest result: Verification Report.")
  })
})
