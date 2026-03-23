import { describe, expect, it } from "vitest"
import { formatTokenFootprint } from "./outputFormatters"

describe("formatTokenFootprint", () => {
  it("formats large token counts in human-readable K notation", () => {
    expect(formatTokenFootprint(52_400)).toBe("~52K tokens")
  })

  it("preserves a decimal for smaller thousand-range totals", () => {
    expect(formatTokenFootprint(1_530)).toBe("~1.5K tokens")
  })

  it("keeps small totals readable without a fake suffix", () => {
    expect(formatTokenFootprint(80)).toBe("80 tokens")
  })
})
