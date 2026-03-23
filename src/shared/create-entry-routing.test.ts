import { describe, expect, it } from "vitest"
import { buildCreateEntryRouteSeed } from "./create-entry-routing"

const projectInspection = {
  projectPath: "/tmp/project",
  git: {
    isRepo: true,
    branch: "feature/refactor",
    hasUncommittedDiff: false,
  },
  manifests: ["package.json"],
  codeDirs: ["src"],
  fileDensity: "active" as const,
  fileCountEstimate: 42,
  projectKind: "existing_repo" as const,
}

describe("buildCreateEntryRouteSeed", () => {
  it("keeps directory starts repo-first and moves the request into attachments", () => {
    expect(
      buildCreateEntryRouteSeed(
        "delivery-map-codebase",
        projectInspection,
        "Audit the current app",
      ),
    ).toEqual({
      primaryInputMode: "directory",
      primaryInputValue: "/tmp/project",
      attachments: [
        {
          kind: "text",
          label: "Requested result",
          content: "Audit the current app",
        },
      ],
    })
  })

  it("uses the current branch for review and verify starts", () => {
    expect(
      buildCreateEntryRouteSeed(
        "delivery-review-phase",
        projectInspection,
        "Review before ship",
      ),
    ).toEqual({
      primaryInputMode: "branch_or_diff",
      primaryInputValue: "feature/refactor",
      attachments: [
        {
          kind: "text",
          label: "Requested result",
          content: "Review before ship",
        },
      ],
    })
  })
})
