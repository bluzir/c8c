import { describe, it, expect } from "vitest"
import { checkOutputHeuristics } from "./output-heuristics.js"

describe("checkOutputHeuristics", () => {
  // --- Empty checks ---

  it("warns on empty string", () => {
    const warnings = checkOutputHeuristics("", "summarise")
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe("empty")
    expect(warnings[0].message).toContain("summarise")
  })

  it("warns on whitespace-only output", () => {
    const warnings = checkOutputHeuristics("   \n\t  ", "clean-up")
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe("empty")
  })

  it("warns on output shorter than 20 characters", () => {
    const warnings = checkOutputHeuristics("OK done.", "writer")
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe("empty")
  })

  it("does not warn on normal-length output", () => {
    const output =
      "This is a perfectly normal response that contains enough text to be meaningful and useful to the user."
    const warnings = checkOutputHeuristics(output, "analyst")
    expect(warnings).toHaveLength(0)
  })

  // --- Repetition checks ---

  it("warns when a 5-word phrase repeats 4+ times", () => {
    const phrase = "the quick brown fox jumps"
    const output = Array(6)
      .fill(`${phrase} over something different each time`)
      .join(". ")
    const warnings = checkOutputHeuristics(output, "writer")
    expect(warnings.some((w) => w.kind === "repetition")).toBe(true)
    expect(warnings.find((w) => w.kind === "repetition")!.message).toContain(
      "writer",
    )
  })

  it("does not warn on normal varied text", () => {
    const output =
      "First we analyse the requirements. Then we design the architecture. " +
      "After that we implement the solution. Finally we test everything thoroughly. " +
      "The whole process takes about a week of focused effort from the engineering team."
    const warnings = checkOutputHeuristics(output, "planner")
    expect(warnings.some((w) => w.kind === "repetition")).toBe(false)
  })

  it("skips repetition check on very short output (under 20 words)", () => {
    // 20 chars but fewer than 20 words — should not trigger repetition
    const output = "Short output that is enough characters but few words here."
    const warnings = checkOutputHeuristics(output, "node-1")
    expect(warnings.some((w) => w.kind === "repetition")).toBe(false)
  })

  // --- Refusal checks ---

  it("warns when output is dominated by refusal phrases", () => {
    const output =
      "I cannot help with that. I'm sorry but I cannot do this. " +
      "As an AI language model I cannot assist. I don't have access to that."
    const warnings = checkOutputHeuristics(output, "researcher")
    expect(warnings.some((w) => w.kind === "refusal")).toBe(true)
    expect(warnings.find((w) => w.kind === "refusal")!.message).toContain(
      "researcher",
    )
  })

  it("does not warn when refusal phrases are a small part of the output", () => {
    const output =
      "Here is the full analysis of the market trends for Q3. The data shows growth across all segments. " +
      "Revenue increased by 15% year over year. I cannot provide exact figures for the competitor analysis " +
      "but based on public data their growth was slower. Overall the outlook is positive."
    const warnings = checkOutputHeuristics(output, "analyst")
    expect(warnings.some((w) => w.kind === "refusal")).toBe(false)
  })

  // --- Combined ---

  it("returns empty array for clean output", () => {
    const output =
      "The deployment pipeline consists of three stages: build, test, and release. " +
      "Each stage runs in an isolated container with pinned dependencies. " +
      "The build stage compiles TypeScript and bundles assets. " +
      "Tests run in parallel across four shards. Release pushes to the CDN."
    expect(checkOutputHeuristics(output, "devops")).toEqual([])
  })

  it("returns only empty warning for very short output (skips other checks)", () => {
    const warnings = checkOutputHeuristics("I cannot", "node-x")
    expect(warnings).toHaveLength(1)
    expect(warnings[0].kind).toBe("empty")
  })
})
