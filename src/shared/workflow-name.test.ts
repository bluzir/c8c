import { describe, expect, it } from "vitest"
import { normalizeWorkflowTitle, toWorkflowFileStem } from "./workflow-name"

describe("normalizeWorkflowTitle", () => {
  it("collapses whitespace and preserves normalized unicode symbols", () => {
    expect(normalizeWorkflowTitle("  Design   \u2192   Code  ")).toBe(
      "Design \u2192 Code",
    )
  })
})

describe("toWorkflowFileStem", () => {
  it("keeps unicode letters and numbers in file stems", () => {
    expect(toWorkflowFileStem("Русский workflow 2")).toBe("русский-workflow-2")
  })

  it("removes punctuation while preserving readable separators", () => {
    expect(toWorkflowFileStem("Design \u2192 Code \u2192 Test")).toBe(
      "design-code-test",
    )
  })
})
