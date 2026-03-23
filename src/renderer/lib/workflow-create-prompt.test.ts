import { describe, expect, it } from "vitest"
import {
  EMPTY_WORKFLOW_CREATE_SCAFFOLD,
  buildWorkflowCreatePrompt,
  countWorkflowCreateScaffoldFields,
  hasWorkflowCreatePromptContent,
} from "./workflow-create-prompt"

describe("buildWorkflowCreatePrompt", () => {
  it("returns the trimmed draft prompt when scaffold is empty", () => {
    expect(
      buildWorkflowCreatePrompt(
        "  Build a JTBD review workflow  ",
        EMPTY_WORKFLOW_CREATE_SCAFFOLD,
      ),
    ).toBe("Build a JTBD review workflow")
  })

  it("appends filled scaffold sections after the main prompt", () => {
    expect(
      buildWorkflowCreatePrompt("Analyze a landing page", {
        goal: "Find weak sections and rewrite them.",
        input: "Landing page URL.",
        constraints: "",
        successCriteria: "Final quality score above 8/10.",
      }),
    ).toBe(
      [
        "Analyze a landing page",
        "",
        "Additional context:",
        "Goal:",
        "Find weak sections and rewrite them.",
        "",
        "Input:",
        "Landing page URL.",
        "",
        "Success criteria:",
        "Final quality score above 8/10.",
      ].join("\n"),
    )
  })

  it("supports scaffold-only prompts", () => {
    expect(
      buildWorkflowCreatePrompt("", {
        goal: "Map the repo and propose a refactor plan.",
        input: "",
        constraints: "Do not edit files.",
        successCriteria: "",
      }),
    ).toBe(
      [
        "Create a workflow with the following context:",
        "Goal:",
        "Map the repo and propose a refactor plan.",
        "",
        "Constraints:",
        "Do not edit files.",
      ].join("\n"),
    )
  })
})

describe("workflow create scaffold helpers", () => {
  it("counts only filled scaffold fields", () => {
    expect(
      countWorkflowCreateScaffoldFields({
        goal: "One",
        input: "Two",
        constraints: "   ",
        successCriteria: "",
      }),
    ).toBe(2)
  })

  it("treats either the draft prompt or scaffold as sufficient content", () => {
    expect(
      hasWorkflowCreatePromptContent(
        "Write a workflow",
        EMPTY_WORKFLOW_CREATE_SCAFFOLD,
      ),
    ).toBe(true)
    expect(
      hasWorkflowCreatePromptContent("", {
        goal: "",
        input: "",
        constraints: "",
        successCriteria: "Return a scored report.",
      }),
    ).toBe(true)
    expect(
      hasWorkflowCreatePromptContent("", EMPTY_WORKFLOW_CREATE_SCAFFOLD),
    ).toBe(false)
  })
})
