import { describe, it, expect } from "vitest"
import { extractReportSections } from "./report-sections"

describe("extractReportSections", () => {
  it("returns empty arrays for undefined content", () => {
    expect(extractReportSections(undefined)).toEqual({
      findings: [],
      limitations: [],
    })
  })

  it("returns empty arrays for empty string", () => {
    expect(extractReportSections("")).toEqual({
      findings: [],
      limitations: [],
    })
  })

  it("returns empty arrays when no matching sections exist", () => {
    const content = `## Summary\n\nSome text about the work done.\n\n## Conclusion\n\nAll done.`
    expect(extractReportSections(content)).toEqual({
      findings: [],
      limitations: [],
    })
  })

  it("extracts findings from ## Findings heading", () => {
    const content = [
      "## Summary",
      "Some intro text.",
      "",
      "## Findings",
      "- First finding here",
      "- Second finding here",
      "",
      "## Conclusion",
      "All done.",
    ].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["First finding here", "Second finding here"])
    expect(result.limitations).toEqual([])
  })

  it("extracts from ## Key Findings heading", () => {
    const content = [
      "## Key Findings",
      "- The API is well-structured",
      "- Missing error handling in 3 endpoints",
    ].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual([
      "The API is well-structured",
      "Missing error handling in 3 endpoints",
    ])
  })

  it("extracts limitations from ## Limitations heading", () => {
    const content = [
      "## Findings",
      "- Found issue A",
      "",
      "## Limitations",
      "- Could not access private repos",
      "- Time constraint limited depth",
    ].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Found issue A"])
    expect(result.limitations).toEqual([
      "Could not access private repos",
      "Time constraint limited depth",
    ])
  })

  it("extracts from ## Caveats heading as limitations", () => {
    const content = ["## Caveats", "- Only tested on macOS", "- No Windows support checked"].join(
      "\n",
    )

    const result = extractReportSections(content)
    expect(result.limitations).toEqual(["Only tested on macOS", "No Windows support checked"])
  })

  it("extracts from ## Constraints heading as limitations", () => {
    const content = ["## Constraints", "- Limited to public APIs"].join("\n")

    const result = extractReportSections(content)
    expect(result.limitations).toEqual(["Limited to public APIs"])
  })

  it("extracts from ## Issues heading as findings", () => {
    const content = ["## Issues", "- Memory leak in worker pool"].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Memory leak in worker pool"])
  })

  it("extracts from ## Recommendations heading as findings", () => {
    const content = ["## Recommendations", "- Upgrade to Node 20", "- Add unit tests"].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Upgrade to Node 20", "Add unit tests"])
  })

  it("handles asterisk bullets", () => {
    const content = ["## Findings", "* Found via asterisk bullet"].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Found via asterisk bullet"])
  })

  it("stops collecting when a new non-matching heading appears", () => {
    const content = [
      "## Findings",
      "- Real finding",
      "## Next Steps",
      "- Not a finding",
    ].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Real finding"])
  })

  it("handles ### level headings", () => {
    const content = ["### Key Findings", "- Deep heading finding"].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Deep heading finding"])
  })

  it("caps findings at 8 items", () => {
    const bullets = Array.from({ length: 12 }, (_, i) => `- Finding ${i + 1}`)
    const content = ["## Findings", ...bullets].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toHaveLength(8)
    expect(result.findings[7]).toBe("Finding 8")
  })

  it("caps limitations at 5 items", () => {
    const bullets = Array.from({ length: 8 }, (_, i) => `- Limitation ${i + 1}`)
    const content = ["## Limitations", ...bullets].join("\n")

    const result = extractReportSections(content)
    expect(result.limitations).toHaveLength(5)
    expect(result.limitations[4]).toBe("Limitation 5")
  })

  it("ignores non-bullet text inside a matching section", () => {
    const content = [
      "## Findings",
      "Some paragraph text here.",
      "- Actual bullet finding",
      "More paragraph text.",
      "- Another bullet finding",
    ].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Actual bullet finding", "Another bullet finding"])
  })

  it("skips empty bullet points", () => {
    const content = ["## Findings", "- ", "- Real finding", "-  "].join("\n")

    const result = extractReportSections(content)
    expect(result.findings).toEqual(["Real finding"])
  })
})
