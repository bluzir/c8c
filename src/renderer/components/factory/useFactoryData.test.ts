import { describe, expect, it } from "vitest"
import type { ArtifactRecord, WorkflowTemplate } from "@shared/types"
import { selectFactoryCaseNextTemplates } from "./useFactoryData"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-shape-project",
    name: "Delivery Lab: Shape Project",
    description: "Shape the requested work.",
    stage: "strategy",
    emoji: "🧭",
    headline: "Shape the work",
    how: "Shape the work before planning.",
    input: "Project brief",
    output: "Project brief",
    steps: ["Shape"],
    pack: {
      id: "delivery-foundation",
      label: "Delivery Lab",
      journeyStage: "shape",
      recommendedNext: ["delivery-research-phase"],
    },
    contractIn: [{ kind: "project_brief", title: "Project Brief" }],
    contractOut: [{ kind: "project_brief", title: "Project Brief" }],
    workflow: {
      version: 1,
      name: "Delivery Lab: Shape Project",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

function createArtifact(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    id: "artifact-1",
    kind: "project_brief",
    title: "Project Brief",
    caseId: "case:delivery-foundation:checkout-polish",
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    templateId: "delivery-shape-project",
    templateName: "Delivery Lab: Shape Project",
    workflowPath: "/tmp/project/shape.flow.yaml",
    workflowName: "Delivery Lab: Shape Project",
    relativePath: ".c8c/artifacts/project-brief.md",
    contentPath: "/tmp/project/.c8c/artifacts/project-brief.md",
    metadataPath: "/tmp/project/.c8c/artifacts/project-brief.json",
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

describe("selectFactoryCaseNextTemplates", () => {
  it("prefers the saved-work canonical next template over unrelated contract matches", () => {
    const shapeTemplate = createTemplate()
    const researchTemplate = createTemplate({
      id: "delivery-research-phase",
      name: "Delivery Lab: Research the Change",
      stage: "research",
      pack: {
        id: "delivery-foundation",
        label: "Delivery Lab",
        journeyStage: "research",
        recommendedNext: ["delivery-plan-phase"],
      },
    })
    const unrelatedTemplate = createTemplate({
      id: "ai-cmo-geo-engine",
      name: "AI CMO: GEO Engine Execute",
      stage: "operations",
      pack: {
        id: "ai-cmo-engine",
        label: "AI CMO",
        journeyStage: "execute",
      },
    })
    const artifact = createArtifact()
    const templateById = new Map([
      [shapeTemplate.id, shapeTemplate],
      [researchTemplate.id, researchTemplate],
      [unrelatedTemplate.id, unrelatedTemplate],
    ])

    const nextTemplates = selectFactoryCaseNextTemplates({
      caseArtifacts: [artifact],
      latestArtifact: artifact,
      nextStepLabel: "Research the Change",
      templateById,
      templates: [unrelatedTemplate, researchTemplate, shapeTemplate],
    })

    expect(nextTemplates.map((template) => template.id)).toEqual([
      "delivery-research-phase",
      "ai-cmo-geo-engine",
      "delivery-shape-project",
    ])
  })

  it("reads canonical next templates from top-level metadata when pack metadata is absent", () => {
    const auditTemplate = createTemplate({
      id: "ux-ui-polish-audit",
      name: "UX/UI Polish Audit",
      pack: undefined,
      recommendedNext: ["impeccable-ui-pipeline"],
      contractOut: [{ kind: "ux_audit_report", title: "UX Audit Report" }],
    })
    const improveTemplate = createTemplate({
      id: "impeccable-ui-pipeline",
      name: "Impeccable UI Pipeline",
      pack: undefined,
      recommendedNext: [],
      contractIn: [
        { kind: "ux_audit_report", title: "UX Audit Report", required: false },
      ],
      contractOut: [
        { kind: "implementation_report", title: "UI Improvements" },
      ],
    })
    const artifact = createArtifact({
      kind: "ux_audit_report",
      title: "UX Audit Report",
      templateId: "ux-ui-polish-audit",
      templateName: "UX/UI Polish Audit",
    })
    const templateById = new Map([
      [auditTemplate.id, auditTemplate],
      [improveTemplate.id, improveTemplate],
    ])

    const nextTemplates = selectFactoryCaseNextTemplates({
      caseArtifacts: [artifact],
      latestArtifact: artifact,
      nextStepLabel: null,
      templateById,
      templates: [improveTemplate, auditTemplate],
    })

    expect(nextTemplates.map((template) => template.id)).toContain(
      "impeccable-ui-pipeline",
    )
  })
})
