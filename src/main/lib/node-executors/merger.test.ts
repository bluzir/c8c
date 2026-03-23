import { describe, it, expect } from "vitest"
import { mergeResults, buildMergerPrompt } from "./merger"
import type { NodeInput } from "@shared/types"

describe("mergeResults with concatenate strategy", () => {
  it("concatenates all branch outputs with headers", () => {
    const inputs: NodeInput[] = [
      { content: "Hero section improved", metadata: { source: "skill::hero" } },
      {
        content: "Features rewritten",
        metadata: { source: "skill::features" },
      },
      { content: "Pricing optimized", metadata: { source: "skill::pricing" } },
    ]

    const result = mergeResults(inputs, "concatenate")
    expect(result).toContain("Hero section improved")
    expect(result).toContain("Features rewritten")
    expect(result).toContain("Pricing optimized")
  })

  it("handles single input", () => {
    const inputs: NodeInput[] = [
      { content: "Only one result", metadata: { source: "skill::only" } },
    ]

    const result = mergeResults(inputs, "concatenate")
    expect(result).toBe("Only one result")
  })

  it("handles empty inputs", () => {
    const result = mergeResults([], "concatenate")
    expect(result).toBe("")
  })
})

describe("buildMergerPrompt", () => {
  it("builds summarize prompt with all branch outputs", () => {
    const inputs: NodeInput[] = [
      { content: "Result A", metadata: { source: "skill::a" } },
      { content: "Result B", metadata: { source: "skill::b" } },
    ]

    const prompt = buildMergerPrompt(
      inputs,
      "summarize",
      "Combine into a cohesive document",
    )
    expect(prompt).toContain("Result A")
    expect(prompt).toContain("Result B")
    expect(prompt).toContain("Combine into a cohesive document")
  })

  it("builds select_best prompt", () => {
    const inputs: NodeInput[] = [
      { content: "Version A", metadata: { source: "skill::a" } },
      { content: "Version B", metadata: { source: "skill::b" } },
    ]

    const prompt = buildMergerPrompt(inputs, "select_best")
    expect(prompt).toContain("Version A")
    expect(prompt).toContain("Version B")
    expect(prompt).toContain("best")
  })
})
