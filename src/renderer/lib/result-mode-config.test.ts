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
      channel_and_audience: "",
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
      buildResultModeConfigSections("courses", {
        course_outcome: "Launch a workshop",
        audience: "Designers moving into AI",
      }),
    ).toEqual([
      { label: "Content goal", value: "Launch a workshop" },
      { label: "Audience", value: "Designers moving into AI" },
    ])
  })

  it("builds a seeded input brief that combines mode config and extra prompt context", () => {
    const mode = getResultMode("content")
    const seed = buildResultModeSeedInput(
      mode,
      {
        content_goal: "Generate 10 posts",
        channel_and_audience: "LinkedIn for AI founders",
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

    expect(seed).toContain("Marketing brief:")
    expect(seed).toContain("Generate 10 posts")
    expect(seed).toContain("LinkedIn for AI founders")
    expect(seed).toContain("Focus on recent agent launches.")
    expect(seed).toContain("No generic advice.")
  })

  it("falls back to a generic mode brief when no config is provided", () => {
    const mode = getResultMode("courses")
    const seed = buildResultModeSeedInput(
      mode,
      normalizeResultModeConfig("courses"),
      "",
      {
        goal: "",
        input: "",
        constraints: "",
        successCriteria: "",
      },
    )

    expect(seed).toContain("Build a starter flow for the Content result mode.")
    expect(seed).toContain("First useful result")
  })
})
