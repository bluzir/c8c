import { describe, expect, it } from "vitest"
import { getResultMode } from "./result-modes"
import {
  buildResultModeConfigSections,
  buildResultModeSeedInput,
  countResultModeConfigFields,
  normalizeResultModeConfig,
} from "./result-mode-config"

describe("result-mode-config", () => {
  it("normalizes known fields for a mode", () => {
    expect(
      normalizeResultModeConfig("content", {
        content_goal: "  30 launch posts  ",
        extra: "ignored",
      }),
    ).toEqual({
      content_goal: "30 launch posts",
      audience: "",
      tone_of_voice: "",
      volume_and_quality: "",
    })
  })

  it("counts only filled config fields", () => {
    expect(
      countResultModeConfigFields("development", {
        project_goal: "Ship onboarding",
        source_context: "Repo path",
        quality_bar: "",
      }),
    ).toBe(2)
  })

  it("builds labeled config sections", () => {
    expect(
      buildResultModeConfigSections("marketing", {
        content_goal: "Launch a campaign",
        channel_and_audience: "LinkedIn for AI founders",
      }),
    ).toEqual([
      { label: "Marketing goal", value: "Launch a campaign" },
      { label: "Market and audience", value: "LinkedIn for AI founders" },
    ])
  })

  it("builds a seeded input brief that combines mode config and extra prompt context", () => {
    const mode = getResultMode("content")
    const seed = buildResultModeSeedInput(
      mode,
      {
        content_goal: "Generate 10 posts",
        audience: "AI founders on LinkedIn",
        tone_of_voice: "",
        volume_and_quality: "",
      },
      "Focus on recent agent launches.",
      {
        goal: "",
        input: "",
        constraints: "No generic advice.",
        successCriteria: "",
      },
    )

    expect(seed).toContain("Content brief:")
    expect(seed).toContain("Generate 10 posts")
    expect(seed).toContain("AI founders on LinkedIn")
    expect(seed).toContain("Focus on recent agent launches.")
    expect(seed).toContain("No generic advice.")
  })

  it("falls back to a generic mode brief when no config is provided", () => {
    const mode = getResultMode("marketing")
    const seed = buildResultModeSeedInput(
      mode,
      normalizeResultModeConfig("marketing"),
      "",
      {
        goal: "",
        input: "",
        constraints: "",
        successCriteria: "",
      },
    )

    expect(seed).toContain(
      "Build a starter flow for the Marketing result mode.",
    )
    expect(seed).toContain("First useful result")
  })
})
