import { describe, it, expect, vi } from "vitest"
import type { ChatRunHistory, InputAttachment } from "@shared/types"
import {
  assembleInputWithAttachments,
  type InputAssemblerDeps,
} from "./input-assembler.js"

function makeDeps(
  overrides: Partial<InputAssemblerDeps> = {},
): InputAssemblerDeps {
  return {
    readFileContent: vi.fn().mockResolvedValue({ content: "", truncated: false }),
    loadRunResult: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

describe("assembleInputWithAttachments", () => {
  it("returns baseValue when no attachments and no requestedResult", async () => {
    const result = await assembleInputWithAttachments(
      "my prompt",
      "",
      [],
      null,
      makeDeps(),
    )
    expect(result).toBe("my prompt")
  })

  it("returns baseValue when attachments array is empty and requestedResult is whitespace", async () => {
    const result = await assembleInputWithAttachments(
      "my prompt",
      "   ",
      [],
      null,
      makeDeps(),
    )
    expect(result).toBe("my prompt")
  })

  it("appends file attachment content as a markdown section", async () => {
    const attachment: InputAttachment = {
      kind: "file",
      path: "/project/src/main.ts",
      name: "main.ts",
    }
    const deps = makeDeps({
      readFileContent: vi.fn().mockResolvedValue({
        content: "const x = 1;",
        truncated: false,
      }),
    })
    const result = await assembleInputWithAttachments(
      "review this",
      "",
      [attachment],
      "/project",
      deps,
    )
    expect(result).toContain("## Attached File: main.ts")
    expect(result).toContain("Path: /project/src/main.ts")
    expect(result).toContain("const x = 1;")
    expect(result).toContain("# Context")
    expect(result).toContain("review this")
  })

  it("appends [truncated] marker when file content is truncated", async () => {
    const attachment: InputAttachment = {
      kind: "file",
      path: "/project/big.txt",
      name: "big.txt",
    }
    const deps = makeDeps({
      readFileContent: vi.fn().mockResolvedValue({
        content: "a".repeat(100),
        truncated: true,
      }),
    })
    const result = await assembleInputWithAttachments(
      "base",
      "",
      [attachment],
      "/project",
      deps,
    )
    expect(result).toContain("[truncated]")
  })

  it("prepends requestedResult as a context section before other sections", async () => {
    const attachment: InputAttachment = {
      kind: "text",
      label: "Background",
      content: "some background info",
    }
    const result = await assembleInputWithAttachments(
      "do the thing",
      "produce a summary",
      [attachment],
      null,
      makeDeps(),
    )
    const requestedResultPos = result.indexOf("## Requested Result")
    const backgroundPos = result.indexOf("## Background")
    expect(requestedResultPos).toBeGreaterThan(-1)
    expect(backgroundPos).toBeGreaterThan(-1)
    expect(requestedResultPos).toBeLessThan(backgroundPos)
    expect(result).toContain("produce a summary")
  })

  it("filters out 'Requested result' text attachment when requestedResult is set", async () => {
    const attachments: InputAttachment[] = [
      {
        kind: "text",
        label: "Requested result",
        content: "old requested result value",
      },
      {
        kind: "text",
        label: "Notes",
        content: "some notes",
      },
    ]
    const result = await assembleInputWithAttachments(
      "base",
      "new requested result",
      attachments,
      null,
      makeDeps(),
    )
    expect(result).not.toContain("old requested result value")
    expect(result).toContain("new requested result")
    expect(result).toContain("## Notes")
  })

  it("does not filter 'Requested result' attachment when requestedResult is empty", async () => {
    const attachments: InputAttachment[] = [
      {
        kind: "text",
        label: "Requested result",
        content: "kept because requestedResult is empty",
      },
    ]
    const result = await assembleInputWithAttachments(
      "base",
      "",
      attachments,
      null,
      makeDeps(),
    )
    expect(result).toContain("kept because requestedResult is empty")
  })

  it("handles file read errors gracefully", async () => {
    const attachment: InputAttachment = {
      kind: "file",
      path: "/project/missing.ts",
      name: "missing.ts",
    }
    const deps = makeDeps({
      readFileContent: vi.fn().mockRejectedValue(new Error("ENOENT")),
    })
    const result = await assembleInputWithAttachments(
      "base",
      "",
      [attachment],
      "/project",
      deps,
    )
    expect(result).toContain("## Attached File: missing.ts")
    expect(result).toContain("[Could not read file]")
  })

  it("shows 'no project selected' message for file attachment when project is null", async () => {
    const attachment: InputAttachment = {
      kind: "file",
      path: "/some/file.ts",
      name: "file.ts",
    }
    const result = await assembleInputWithAttachments(
      "base",
      "",
      [attachment],
      null,
      makeDeps(),
    )
    expect(result).toContain("[Cannot read file: no project selected]")
  })

  it("appends run attachment content as a markdown section", async () => {
    const attachment: InputAttachment = {
      kind: "run",
      runId: "run-123",
      workspace: "/workspaces/run-123",
      workflowName: "My Flow",
    }
    const deps = makeDeps({
      loadRunResult: vi
        .fn()
        .mockResolvedValue({ reportContent: "Run report content" }),
    })
    const result = await assembleInputWithAttachments(
      "base",
      "",
      [attachment],
      null,
      deps,
    )
    expect(result).toContain("## Previous Run Output: My Flow")
    expect(result).toContain("Run workspace: /workspaces/run-123")
    expect(result).toContain("Run report content")
  })

  it("handles run load errors gracefully", async () => {
    const attachment: InputAttachment = {
      kind: "run",
      runId: "run-bad",
      workspace: "/workspaces/run-bad",
      workflowName: "Broken Flow",
    }
    const deps = makeDeps({
      loadRunResult: vi.fn().mockRejectedValue(new Error("disk error")),
    })
    const result = await assembleInputWithAttachments(
      "base",
      "",
      [attachment],
      null,
      deps,
    )
    expect(result).toContain("## Previous Run Output: Broken Flow")
    expect(result).toContain("[Could not load run output]")
  })

  it("shows [No output available] when run result has no reportContent", async () => {
    const attachment: InputAttachment = {
      kind: "run",
      runId: "run-empty",
      workspace: "/workspaces/run-empty",
      workflowName: "Empty Flow",
    }
    const deps = makeDeps({
      loadRunResult: vi.fn().mockResolvedValue({}),
    })
    const result = await assembleInputWithAttachments(
      "base",
      "",
      [attachment],
      null,
      deps,
    )
    expect(result).toContain("[No output available]")
  })

  it("includes chat run history when provided", async () => {
    const history: ChatRunHistory = {
      runs: [
        {
          templateName: "Code Review",
          userPrompt: "review my PR",
          summary: "Found 3 issues in auth module",
          artifactIds: ["artifact-1"],
        },
      ],
    }
    const result = await assembleInputWithAttachments(
      "follow up on the review",
      "",
      [],
      null,
      makeDeps(),
      history,
    )
    expect(result).toContain("## Prior context")
    expect(result).toContain("**Code Review**")
    expect(result).toContain("Found 3 issues in auth module")
    expect(result).toContain("(produced: artifact-1)")
  })

  it("skips history section when undefined", async () => {
    const result = await assembleInputWithAttachments(
      "prompt",
      "some result",
      [],
      null,
      makeDeps(),
      undefined,
    )
    expect(result).not.toContain("## Prior context")
  })

  it("skips history section when runs array is empty", async () => {
    const history: ChatRunHistory = { runs: [] }
    const result = await assembleInputWithAttachments(
      "prompt",
      "some result",
      [],
      null,
      makeDeps(),
      history,
    )
    expect(result).not.toContain("## Prior context")
  })

  it("renders multiple runs in chronological order", async () => {
    const history: ChatRunHistory = {
      runs: [
        {
          templateName: "Run A",
          userPrompt: "first task",
          summary: "A completed",
          artifactIds: [],
        },
        {
          templateName: "Run B",
          userPrompt: "second task",
          summary: "B completed",
          artifactIds: ["art-x"],
        },
      ],
    }
    const result = await assembleInputWithAttachments(
      "continue",
      "",
      [],
      null,
      makeDeps(),
      history,
    )
    const posA = result.indexOf("**Run A**")
    const posB = result.indexOf("**Run B**")
    expect(posA).toBeGreaterThan(-1)
    expect(posB).toBeGreaterThan(-1)
    expect(posA).toBeLessThan(posB)
  })

  it("uses (no summary) for empty summary", async () => {
    const history: ChatRunHistory = {
      runs: [
        {
          templateName: "Quick Run",
          userPrompt: "do something",
          summary: "",
          artifactIds: [],
        },
      ],
    }
    const result = await assembleInputWithAttachments(
      "next step",
      "",
      [],
      null,
      makeDeps(),
      history,
    )
    expect(result).toContain("(no summary)")
  })

  it("places history after Requested Result and before attachments", async () => {
    const history: ChatRunHistory = {
      runs: [
        {
          templateName: "Prior Run",
          userPrompt: "earlier task",
          summary: "done",
          artifactIds: [],
        },
      ],
    }
    const attachment: InputAttachment = {
      kind: "text",
      label: "Extra Notes",
      content: "some notes",
    }
    const result = await assembleInputWithAttachments(
      "base prompt",
      "produce a report",
      [attachment],
      null,
      makeDeps(),
      history,
    )
    const requestedResultPos = result.indexOf("## Requested Result")
    const priorContextPos = result.indexOf("## Prior context")
    const extraNotesPos = result.indexOf("## Extra Notes")
    expect(requestedResultPos).toBeGreaterThan(-1)
    expect(priorContextPos).toBeGreaterThan(-1)
    expect(extraNotesPos).toBeGreaterThan(-1)
    expect(requestedResultPos).toBeLessThan(priorContextPos)
    expect(priorContextPos).toBeLessThan(extraNotesPos)
  })
})
