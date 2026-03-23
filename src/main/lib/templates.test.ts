import { describe, it, expect } from "vitest"
import { getBuiltinTemplates } from "./templates"
import type { WorkflowTemplate } from "@shared/types"
import { validateWorkflow } from "./graph-engine"

function getTemplateOrThrow(id: string): WorkflowTemplate {
  const template = getBuiltinTemplates().find((t) => t.id === id)
  expect(template, `Template "${id}" should exist`).toBeDefined()
  return template!
}

describe("getBuiltinTemplates", () => {
  it("returns an array of templates", () => {
    const templates = getBuiltinTemplates()
    expect(templates.length).toBeGreaterThan(0)
  })

  it("each template has required metadata", () => {
    const templates = getBuiltinTemplates()
    for (const t of templates) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.stage).toBeTruthy()
      expect(t.emoji).toBeTruthy()
      expect(t.headline).toBeTruthy()
      expect(t.steps.length).toBeGreaterThan(0)
      expect(t.workflow).toBeDefined()
      expect(t.workflow.nodes.length).toBeGreaterThan(0)
      expect(t.workflow.edges.length).toBeGreaterThan(0)
      expect(t.source).toBe("builtin")
    }
  })

  it("each template workflow is valid", () => {
    const templates = getBuiltinTemplates()
    for (const t of templates) {
      const errors = validateWorkflow(t.workflow)
      expect(
        errors,
        `Template "${t.name}" has validation errors: ${errors.join(", ")}`,
      ).toEqual([])
    }
  })

  it("template IDs are unique", () => {
    const templates = getBuiltinTemplates()
    const ids = templates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("each evaluator in templates has retry wiring and pass/fail edges", () => {
    const templates = getBuiltinTemplates()
    for (const t of templates) {
      const evaluators = t.workflow.nodes.filter(
        (node) => node.type === "evaluator",
      )
      for (const evaluator of evaluators) {
        const config = evaluator.config as {
          retryFrom?: string
          criteria?: string
          threshold?: number
          maxRetries?: number
        }
        const outgoing = t.workflow.edges.filter(
          (edge) => edge.source === evaluator.id,
        )
        const passEdge = outgoing.find((edge) => edge.type === "pass")
        const failEdge = outgoing.find((edge) => edge.type === "fail")

        expect(
          config.criteria,
          `Template "${t.name}" evaluator "${evaluator.id}" missing criteria`,
        ).toBeTruthy()
        expect(
          typeof config.threshold,
          `Template "${t.name}" evaluator "${evaluator.id}" missing threshold`,
        ).toBe("number")
        expect(
          typeof config.maxRetries,
          `Template "${t.name}" evaluator "${evaluator.id}" missing maxRetries`,
        ).toBe("number")
        expect(
          config.retryFrom,
          `Template "${t.name}" evaluator "${evaluator.id}" missing retryFrom`,
        ).toBeTruthy()
        expect(
          passEdge,
          `Template "${t.name}" evaluator "${evaluator.id}" missing pass edge`,
        ).toBeDefined()
        expect(
          failEdge,
          `Template "${t.name}" evaluator "${evaluator.id}" missing fail edge`,
        ).toBeDefined()

        if (config.retryFrom && failEdge) {
          expect(
            failEdge.target,
            `Template "${t.name}" evaluator "${evaluator.id}" fail edge must target retryFrom`,
          ).toBe(config.retryFrom)
        }
      }
    }
  })

  it("text and landing generators use infostyle/slop-check evaluator profiles", () => {
    const templates = getBuiltinTemplates()
    const targetIds = ["predictable-text-factory", "landing-page-generator"]

    for (const id of targetIds) {
      const template = templates.find((t) => t.id === id)
      expect(template, `Template "${id}" should exist`).toBeDefined()
      const evaluators = template!.workflow.nodes.filter(
        (node) => node.type === "evaluator",
      )
      expect(
        evaluators.length,
        `Template "${id}" should include evaluator nodes`,
      ).toBeGreaterThan(0)

      for (const evaluator of evaluators) {
        const cfg = evaluator.config as { skillRefs?: string[] }
        expect(
          cfg.skillRefs,
          `Template "${id}" evaluator "${evaluator.id}" should define skillRefs`,
        ).toBeDefined()
        expect(cfg.skillRefs).toEqual(
          expect.arrayContaining(["infostyle", "slop-check"]),
        )
      }
    }
  })

  it("repo-wide code audit templates map the repo before fan-out", () => {
    for (const id of [
      "full-stack-code-audit",
      "ux-ui-polish-audit",
      "cto-optimise-audit",
    ]) {
      const template = getTemplateOrThrow(id)
      const inputNode = template.workflow.nodes.find(
        (node) => node.id === "input-1" && node.type === "input",
      )
      const mapperNode = template.workflow.nodes.find(
        (node) => node.id === "mapper-1" && node.type === "skill",
      )
      const splitterNode = template.workflow.nodes.find(
        (node) => node.id === "splitter-1" && node.type === "splitter",
      )

      expect(inputNode).toBeDefined()
      expect((inputNode!.config as { inputType?: string }).inputType).toBe(
        "directory",
      )
      expect(
        mapperNode,
        `Template "${id}" should include mapper-1`,
      ).toBeDefined()
      expect(
        splitterNode,
        `Template "${id}" should include splitter-1`,
      ).toBeDefined()
      expect(
        template.workflow.defaults?.permissionMode,
        `Template "${id}" should run in plan mode`,
      ).toBe("plan")
      expect(
        template.workflow.edges.some(
          (edge) => edge.source === "input-1" && edge.target === "mapper-1",
        ),
      ).toBe(true)
      expect(
        template.workflow.edges.some(
          (edge) => edge.source === "mapper-1" && edge.target === "splitter-1",
        ),
      ).toBe(true)
      expect(
        template.workflow.edges.some(
          (edge) => edge.source === "input-1" && edge.target === "splitter-1",
        ),
      ).toBe(false)
    }
  })

  it("competitor fan-out template requires an explicit competitor table", () => {
    const template = getTemplateOrThrow("competitor-ad-intelligence")
    const contextNode = template.workflow.nodes.find(
      (node) => node.id === "context-1" && node.type === "skill",
    )
    const splitterNode = template.workflow.nodes.find(
      (node) => node.id === "splitter-1" && node.type === "splitter",
    )
    const contextPrompt = String(
      (contextNode?.config as { prompt?: string })?.prompt || "",
    )
    const splitterStrategy = String(
      (splitterNode?.config as { strategy?: string })?.strategy || "",
    )

    expect(contextPrompt).toContain("Competitor Table")
    expect(splitterStrategy).toContain(
      "one self-contained branch per competitor row",
    )
    expect(
      (splitterNode?.config as { maxBranches?: number })?.maxBranches,
    ).toBe(5)
  })

  it("distribution and meeting fan-out templates require explicit branch manifests", () => {
    const distribution = getTemplateOrThrow("content-distribution-bundle")
    const distributionAnalyzer = distribution.workflow.nodes.find(
      (node) => node.id === "analyzer-1" && node.type === "skill",
    )
    const distributionSplitter = distribution.workflow.nodes.find(
      (node) => node.id === "splitter-1" && node.type === "splitter",
    )
    expect(
      String(
        (distributionAnalyzer?.config as { prompt?: string })?.prompt || "",
      ),
    ).toContain("Channel Plan")
    expect(
      String(
        (distributionSplitter?.config as { strategy?: string })?.strategy || "",
      ),
    ).toContain("Channel Plan")

    const meeting = getTemplateOrThrow("meeting-actions-plan")
    const meetingSummarizer = meeting.workflow.nodes.find(
      (node) => node.id === "summarizer-1" && node.type === "skill",
    )
    const meetingSplitter = meeting.workflow.nodes.find(
      (node) => node.id === "splitter-1" && node.type === "splitter",
    )
    expect(
      String((meetingSummarizer?.config as { prompt?: string })?.prompt || ""),
    ).toContain("Action Register")
    expect(
      String(
        (meetingSplitter?.config as { strategy?: string })?.strategy || "",
      ),
    ).toContain("Action Register")
  })

  it("outreach fan-out templates build a branching manifest before splitter", () => {
    for (const id of [
      "segmented-outreach-launchpad",
      "new-vertical-to-live-campaign",
    ]) {
      const template = getTemplateOrThrow(id)
      const promptBuilder = template.workflow.nodes.find(
        (node) => node.id === "prompt-builder-1" && node.type === "skill",
      )
      const splitter = template.workflow.nodes.find(
        (node) => node.id === "splitter-1" && node.type === "splitter",
      )
      const prompt = String(
        (promptBuilder?.config as { prompt?: string })?.prompt || "",
      )
      const strategy = String(
        (splitter?.config as { strategy?: string })?.strategy || "",
      )

      expect(
        prompt,
        `Template "${id}" should ask for a branching manifest`,
      ).toContain("Branching Manifest")
      expect(
        strategy,
        `Template "${id}" splitter should consume the approved prompt plus branching manifest`,
      ).toContain("Approved Prompt")
      expect(strategy).toContain("Branching Manifest")
    }
  })
})
