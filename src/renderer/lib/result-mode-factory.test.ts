import { describe, expect, it } from "vitest"
import { normalizeResultModeConfig } from "@/lib/result-mode-config"
import { getResultMode } from "@/lib/result-modes"
import {
  buildFactoryFromResultMode,
  formatResultModeLabel,
  pickReusableFactoryForMode,
} from "./result-mode-factory"

describe("result-mode-factory", () => {
  it("builds a marketing factory outcome with parsed targets and saved recipe packs", () => {
    const mode = getResultMode("marketing")
    const factory = buildFactoryFromResultMode({
      mode,
      values: normalizeResultModeConfig("marketing", {
        content_goal:
          "Generate 100 Facebook posts about AI agents in the next 30 days",
        channel_and_audience:
          "Facebook for founders running AI-native businesses",
        tone_of_voice: "Direct\nNo slop\nInfo style",
        volume_and_quality:
          "100 posts, all specific and publishable without heavy rewrites",
      }),
      now: 1700000000000,
    })

    expect(factory.modeId).toBe("marketing")
    expect(factory.outcome?.title).toContain("100 Facebook posts")
    expect(factory.outcome?.targetCount).toBe(100)
    expect(factory.outcome?.targetUnit).toBe("posts")
    expect(factory.outcome?.timeHorizon).toBe("next 30 days")
    expect(factory.outcome?.constraints).toEqual([
      "Direct",
      "No slop",
      "Info style",
      "100 posts, all specific and publishable without heavy rewrites",
    ])
    expect(factory.recipe?.packIds).toEqual(["ai-cmo"])
    expect(factory.recipe?.stageOrder).toEqual([
      "Understand",
      "Plan",
      "Build",
      "Check",
      "Ship",
    ])
  })

  it("reuses an existing matching factory when one is already selected for the mode", () => {
    const mode = getResultMode("development")
    const existing = {
      id: "factory:shipping",
      modeId: "development",
      label: "Shipping Factory",
      recipe: { packIds: ["delivery-foundation"] },
      createdAt: 1,
      updatedAt: 2,
    }

    const reusable = pickReusableFactoryForMode({
      blueprint: {
        version: 2,
        projectPath: "/tmp/project",
        factories: [existing],
        selectedFactoryId: existing.id,
        createdAt: 1,
        updatedAt: 2,
      },
      selectedFactoryId: existing.id,
      mode,
    })

    expect(reusable?.id).toBe(existing.id)
  })

  it("keeps existing ids and fills default strategist checkpoints for marketing", () => {
    const mode = getResultMode("marketing")
    const existing = {
      id: "factory:campaign-launch",
      modeId: "marketing" as const,
      label: "AI Campaign Launch",
      createdAt: 10,
      updatedAt: 20,
    }

    const factory = buildFactoryFromResultMode({
      mode,
      values: normalizeResultModeConfig("marketing", {
        content_goal: "Launch a targeted outreach campaign",
        channel_and_audience: "LinkedIn for AI founders",
      }),
      existingFactory: existing,
      now: 30,
    })

    expect(factory.id).toBe(existing.id)
    expect(factory.modeId).toBe("marketing")
    expect(factory.recipe?.packIds).toEqual(["ai-cmo"])
    expect(factory.recipe?.strategistCheckpoints).toEqual([
      "Approve audience and angle",
      "Approve sample asset quality",
    ])
  })

  it("formats stored mode ids for the factory workbench", () => {
    expect(formatResultModeLabel("content")).toBe("Content")
    expect(formatResultModeLabel("custom_mode")).toBe("Custom Mode")
  })
})
