import { describe, expect, it } from "vitest"
import type { DiscoveredSkill, Workflow } from "@shared/types"
import { validateWorkflowExtended } from "./workflow-validator"

const AVAILABLE_SKILLS: DiscoveredSkill[] = [
  {
    type: "skill",
    name: "playwright-visual-auditor",
    description:
      "Run browser-based visual audits, capture screenshots, and report UI defects.",
    category: "qa",
    path: "/tmp/qa/playwright-visual-auditor.md",
  },
  {
    type: "skill",
    name: "app-surface-mapper",
    description:
      "Map screens, routes, and user journeys in a product UI before testing.",
    category: "qa",
    path: "/tmp/qa/app-surface-mapper.md",
  },
  {
    type: "skill",
    name: "explorer",
    description:
      "Map the renderer component tree and user-facing UX scenarios in the c8c Electron app.",
    category: "codex",
    path: "/tmp/codex/explorer.md",
  },
]

function makeWorkflow(skillRef: string, prompt: string): Workflow {
  return {
    version: 1,
    name: "Skill lint",
    defaults: { model: "sonnet", maxTurns: 20 },
    nodes: [
      { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "skill-1",
        type: "skill",
        position: { x: 300, y: 0 },
        config: { skillRef, prompt },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 600, y: 0 },
        config: {},
      },
    ],
    edges: [
      { id: "e1", source: "input-1", target: "skill-1", type: "default" },
      { id: "e2", source: "skill-1", target: "output-1", type: "default" },
    ],
  }
}

describe("validateWorkflowExtended semantic skill lint", () => {
  it("warns when a chosen skill was not surfaced in the current chat session", () => {
    const result = validateWorkflowExtended(
      makeWorkflow(
        "qa/playwright-visual-auditor",
        "Run a browser-based visual audit of the app and capture responsive UI regressions.",
      ),
      AVAILABLE_SKILLS,
      { surfacedSkillRefs: new Set() },
    )

    expect(
      result.warnings.some((warning) =>
        warning.includes(
          "without being surfaced via search_skills or browse_category",
        ),
      ),
    ).toBe(true)
  })

  it("does not warn when the chosen skill was already surfaced", () => {
    const result = validateWorkflowExtended(
      makeWorkflow(
        "qa/playwright-visual-auditor",
        "Run a browser-based visual audit of the app and capture responsive UI regressions.",
      ),
      AVAILABLE_SKILLS,
      { surfacedSkillRefs: new Set(["qa/playwright-visual-auditor"]) },
    )

    expect(
      result.warnings.some((warning) =>
        warning.includes(
          "without being surfaced via search_skills or browse_category",
        ),
      ),
    ).toBe(false)
  })

  it("warns when the selected skill is a weak semantic match and stronger alternatives exist", () => {
    const result = validateWorkflowExtended(
      makeWorkflow(
        "codex/explorer",
        "Run a browser-based visual audit of the app, capture screenshots, and report layout regressions.",
      ),
      AVAILABLE_SKILLS,
      { surfacedSkillRefs: new Set(["codex/explorer"]) },
    )

    expect(
      result.warnings.some((warning) =>
        warning.includes("semantically mismatched"),
      ),
    ).toBe(true)
    expect(
      result.warnings.some((warning) =>
        warning.includes("qa/playwright-visual-auditor"),
      ),
    ).toBe(true)
  })
})
