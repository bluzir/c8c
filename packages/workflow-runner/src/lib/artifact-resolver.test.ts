import { describe, it, expect } from "vitest"
import { matchArtifactsToContracts } from "./artifact-resolver"

// Use minimal ArtifactRecord stubs — only fields that matter for matching
function makeArtifact(kind: string, id = `art-${kind}`) {
  return { id, kind, title: kind, relativePath: `artifacts/${kind}.md` } as any
}

function makeContract(kind: string, required = true) {
  return { kind, title: kind, required }
}

describe("matchArtifactsToContracts", () => {
  it("returns all artifacts when no contracts defined", () => {
    const result = matchArtifactsToContracts(undefined, [makeArtifact("trend_digest")])
    expect(result.matched).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
  })

  it("filters artifacts by contract kind", () => {
    const result = matchArtifactsToContracts(
      [makeContract("trend_digest")],
      [makeArtifact("trend_digest"), makeArtifact("report")],
    )
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].kind).toBe("trend_digest")
    expect(result.warnings).toHaveLength(0)
  })

  it("emits missing_artifact warning when required contract unmatched", () => {
    const result = matchArtifactsToContracts(
      [makeContract("trend_digest", true)],
      [makeArtifact("report")],
    )
    expect(result.matched).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("missing_artifact")
    expect(result.warnings[0].contractKind).toBe("trend_digest")
  })

  it("skips warning for non-required unmatched contracts", () => {
    const result = matchArtifactsToContracts(
      [makeContract("trend_digest", false)],
      [makeArtifact("report")],
    )
    expect(result.matched).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("selects first artifact per contract kind (deduplicates)", () => {
    const result = matchArtifactsToContracts(
      [makeContract("trend_digest")],
      [makeArtifact("trend_digest", "art-1"), makeArtifact("trend_digest", "art-2")],
    )
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].id).toBe("art-1")
  })

  it("returns empty arrays for empty inputs", () => {
    const result = matchArtifactsToContracts([], [])
    expect(result.matched).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})
