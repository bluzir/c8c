import { describe, expect, it } from "vitest"
import type { WorkflowTemplate } from "@shared/types"
import {
  areTemplateContractsSatisfied,
  buildContinuationArtifactPool,
  buildArtifactAttachmentSeedInput,
  buildTemplateWorkflowEntryState,
  buildTemplateRunContext,
  deriveTemplateContinuationDescription,
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
  deriveTemplateContextDisplayLabel,
  deriveTemplateContextJourneyStageLabel,
  deriveTemplateJourneyStageLabel,
  getTemplateContextRecommendedNext,
  getTemplateContextSuggestedTools,
  getTemplateRecommendedNext,
  getTemplateSuggestedTools,
  getRequestedResultFromEntryState,
  selectArtifactsForTemplateContracts,
} from "./workflow-entry"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Factory: Plan Phase",
    description: "Plan the next implementation phase.",
    stage: "strategy",
    emoji: "📐",
    headline: "Plan phase",
    how: "Break work into small tasks.",
    input: "Project context",
    output: "Phase plan",
    steps: ["Plan", "Review"],
    pack: {
      id: "delivery-foundation",
      label: "Delivery Factory",
      journeyStage: "plan",
      recommendedNext: [],
    },
    suggestedTools: ["web_search"],
    contractIn: [
      { kind: "project_brief", title: "Project Brief" },
      { kind: "roadmap", title: "Roadmap", required: false },
    ],
    contractOut: [{ kind: "phase_plan", title: "Phase Plan" }],
    workflow: {
      version: 1,
      name: "Delivery Factory: Plan Phase",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

describe("workflow-entry factory helpers", () => {
  it("builds a reusable template run context without factory scope by default", () => {
    const template = createTemplate()
    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
    })

    expect(context.templateId).toBe("delivery-plan-phase")
    expect(context.pack?.id).toBe("delivery-foundation")
    expect(getTemplateRecommendedNext(template)).toEqual([])
    expect(getTemplateContextRecommendedNext(context)).toEqual([])
    expect(getTemplateSuggestedTools(template)).toEqual(["web_search"])
    expect(getTemplateContextSuggestedTools(context)).toEqual(["web_search"])
    expect(context.contractOut?.[0]?.kind).toBe("phase_plan")
    expect(context.factoryId).toBeUndefined()
    expect(context.caseId).toBeUndefined()
    expect(context.sourceArtifactIds).toEqual([])
  })

  it("checks required contracts and selects matching artifacts", () => {
    const template = createTemplate()
    const artifacts = [
      {
        id: "artifact-1",
        kind: "project_brief",
        title: "Project Brief",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-1",
        relativePath: ".c8c/artifacts/run-1-project-brief.md",
        contentPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.md",
        metadataPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.json",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "artifact-1b",
        kind: "project_brief",
        title: "Project Brief v2",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-2",
        relativePath: ".c8c/artifacts/run-2-project-brief.md",
        contentPath: "/tmp/project/.c8c/artifacts/run-2-project-brief.md",
        metadataPath: "/tmp/project/.c8c/artifacts/run-2-project-brief.json",
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: "artifact-2",
        kind: "roadmap",
        title: "Roadmap",
        projectPath: "/tmp/project",
        workspace: "/tmp/workspace",
        runId: "run-1",
        relativePath: ".c8c/artifacts/run-1-roadmap.md",
        contentPath: "/tmp/project/.c8c/artifacts/run-1-roadmap.md",
        metadataPath: "/tmp/project/.c8c/artifacts/run-1-roadmap.json",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    expect(areTemplateContractsSatisfied(template.contractIn, artifacts)).toBe(
      true,
    )
    expect(
      selectArtifactsForTemplateContracts(template.contractIn, artifacts).map(
        (artifact) => artifact.id,
      ),
    ).toEqual(["artifact-1", "artifact-2"])

    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
      sourceArtifacts: artifacts,
    })
    expect(context.factoryId).toBeUndefined()
    expect(context.caseId).toBeUndefined()
    expect(context.sourceArtifactIds).toEqual([
      "artifact-1",
      "artifact-1b",
      "artifact-2",
    ])
  })

  it("creates factory and case identity only when workflow launch is explicitly factory-scoped", () => {
    const template = createTemplate()
    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
      factory: {
        id: "factory:delivery-foundation",
        label: "Delivery Factory",
      },
    })

    expect(context.factoryId).toBe("factory:delivery-foundation")
    expect(context.caseId).toMatch(/^case:delivery-foundation:/)
  })

  it("extracts requested result only from request-style entry contracts", () => {
    expect(
      getRequestedResultFromEntryState({
        workflowPath: "/tmp/flow.chain",
        workflowName: "Flow",
        source: "generated",
        title: "Flow",
        summary: "Summary",
        contractLabel: "Requested result",
        contractText: "Audit the repo.",
        inputText: "",
        outputText: "",
        readinessText: "",
      }),
    ).toBe("Audit the repo.")

    expect(
      getRequestedResultFromEntryState({
        workflowPath: "/tmp/flow.chain",
        workflowName: "Flow",
        source: "generated",
        title: "Flow",
        summary: "Summary",
        contractLabel: "What you asked for",
        contractText: "Ship the plan.",
        inputText: "",
        outputText: "",
        readinessText: "",
      }),
    ).toBe("Ship the plan.")
  })

  it("ignores non-request entry contracts", () => {
    expect(
      getRequestedResultFromEntryState({
        workflowPath: "/tmp/flow.chain",
        workflowName: "Flow",
        source: "template",
        title: "Flow",
        summary: "Summary",
        contractLabel: "Use this when",
        contractText: "You need a code review.",
        inputText: "",
        outputText: "",
        readinessText: "",
      }),
    ).toBe("")
  })

  it("inherits case identity from source artifacts when available", () => {
    const template = createTemplate()
    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
      sourceArtifacts: [
        {
          id: "artifact-1",
          kind: "project_brief",
          title: "Project Brief",
          caseId: "case:delivery-foundation:abc123",
          caseLabel: "Project Brief",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-1",
          relativePath: ".c8c/artifacts/run-1-project-brief.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.md",
          metadataPath: "/tmp/project/.c8c/artifacts/run-1-project-brief.json",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    expect(context.caseId).toBe("case:delivery-foundation:abc123")
    expect(context.caseLabel).toBe("Project Brief")
  })

  it("lets planned item cases override the inherited parent case identity", () => {
    const template = createTemplate()
    const context = buildTemplateRunContext({
      template,
      workflowPath: "/tmp/plan-phase.chain",
      sourceArtifacts: [
        {
          id: "artifact-1",
          kind: "editorial_calendar",
          title: "Editorial Calendar",
          factoryId: "factory:content-engine",
          caseId: "case:content-engine:calendar",
          caseLabel: "Editorial Calendar",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-1",
          relativePath: ".c8c/artifacts/run-1-editorial-calendar.md",
          contentPath:
            "/tmp/project/.c8c/artifacts/run-1-editorial-calendar.md",
          metadataPath:
            "/tmp/project/.c8c/artifacts/run-1-editorial-calendar.json",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      factory: {
        id: "factory:content-engine",
        label: "Content Engine",
      },
      caseOverride: {
        caseId: "case:content-engine:planned:post-1",
        caseLabel: "Post 1",
      },
    })

    expect(context.factoryId).toBe("factory:content-engine")
    expect(context.caseId).toBe("case:content-engine:planned:post-1")
    expect(context.caseLabel).toBe("Post 1")
  })

  it("builds seed copy for artifact-driven stages", () => {
    expect(buildArtifactAttachmentSeedInput([])).toContain("Add the context")
    expect(
      buildArtifactAttachmentSeedInput([
        {
          kind: "file",
          path: ".c8c/artifacts/project-brief.md",
          name: "Project Brief",
        },
      ]),
    ).toContain("attached result as the primary context")
    expect(
      buildArtifactAttachmentSeedInput([
        {
          kind: "file",
          path: ".c8c/artifacts/project-brief.md",
          name: "Project Brief",
        },
        { kind: "file", path: ".c8c/artifacts/roadmap.md", name: "Roadmap" },
      ]),
    ).toContain("attached results as the primary context")
  })

  it("maps core development templates to user-facing stage families", () => {
    expect(
      deriveTemplateJourneyStageLabel(
        createTemplate({
          id: "delivery-map-codebase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "map",
          },
        }),
      ),
    ).toBe("Understand")

    expect(
      deriveTemplateJourneyStageLabel(
        createTemplate({
          id: "delivery-review-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "review",
          },
        }),
      ),
    ).toBe("Review")

    expect(
      deriveTemplateJourneyStageLabel(
        createTemplate({
          id: "delivery-verify-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "verify",
          },
        }),
      ),
    ).toBe("Check")

    expect(
      deriveTemplateJourneyStageLabel(
        createTemplate({
          id: "delivery-implement-phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "execute",
          },
        }),
      ),
    ).toBe("Build")

    const entryState = buildTemplateWorkflowEntryState({
      template: createTemplate({
        id: "delivery-plan-phase",
        name: "Delivery Factory: Plan Phase",
        pack: {
          id: "delivery-foundation",
          label: "Delivery Factory",
          journeyStage: "plan",
        },
      }),
      workflowPath: "/tmp/plan-phase.chain",
    })

    expect(entryState.summary).toContain(
      "helps you prepare the implementation plan",
    )
    expect(entryState.summary.toLowerCase()).not.toContain("stage")

    expect(
      deriveTemplateContextJourneyStageLabel({
        templateId: "gstack-preflight-gate",
        pack: {
          id: "gstack-team",
          label: "Gstack Team",
          journeyStage: "verify",
        },
      }),
    ).toBe("Check")

    expect(
      deriveTemplateDisplayLabel(
        createTemplate({
          id: "delivery-plan-phase",
          name: "Delivery Factory: Plan Phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "plan",
          },
        }),
      ),
    ).toBe("Plan")

    expect(
      deriveTemplateContextDisplayLabel({
        templateId: "gstack-preflight-gate",
        templateName: "Gstack Team: Preflight Gate",
        pack: {
          id: "gstack-team",
          label: "Gstack Team",
          journeyStage: "verify",
        },
      }),
    ).toBe("Check")

    expect(
      deriveTemplateJobLabel(
        createTemplate({
          id: "delivery-plan-phase",
          name: "Delivery Factory: Plan Phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "plan",
          },
        }),
      ),
    ).toBe("Prepare the implementation plan")

    expect(
      deriveTemplateJobLabel(
        createTemplate({
          id: "delivery-review-phase",
          name: "Delivery Factory: Review Phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "review",
          },
        }),
      ),
    ).toBe("Review before ship")

    expect(
      deriveTemplateJobLabel(
        createTemplate({
          id: "delivery-verify-phase",
          name: "Delivery Factory: Verify Phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "verify",
          },
        }),
      ),
    ).toBe("Verify completion")

    expect(
      deriveTemplateContinuationLabel(
        createTemplate({
          id: "delivery-verify-phase",
          name: "Delivery Factory: Verify Phase",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "verify",
          },
        }),
      ),
    ).toBe("Check completion")

    expect(
      deriveTemplateContinuationLabel(
        createTemplate({
          id: "delivery-shape-project",
          name: "Delivery Factory: Shape Project",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "shape",
          },
        }),
      ),
    ).toBe("Define the change")

    expect(
      deriveTemplateContinuationDescription(
        createTemplate({
          id: "delivery-plan-phase",
          description: "Plan the next implementation phase.",
          pack: {
            id: "delivery-foundation",
            label: "Delivery Factory",
            journeyStage: "plan",
          },
        }),
      ),
    ).toBe("Turn the scoped change into an execution-ready plan.")
  })

  it("keeps same-work artifacts in the pool but promotes the latest usable result first", () => {
    const pool = buildContinuationArtifactPool({
      currentArtifacts: [
        {
          id: "artifact-current-plan",
          kind: "phase_plan",
          title: "Current Phase Plan",
          caseId: "case:delivery-foundation:abc123",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-current",
          relativePath: ".c8c/artifacts/run-current-phase-plan.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-current-phase-plan.md",
          metadataPath:
            "/tmp/project/.c8c/artifacts/run-current-phase-plan.json",
          createdAt: 5,
          updatedAt: 5,
        },
      ],
      projectArtifacts: [
        {
          id: "artifact-case-plan-new",
          kind: "phase_plan",
          title: "Newer same-case plan",
          caseId: "case:delivery-foundation:abc123",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-case-new",
          relativePath: ".c8c/artifacts/run-case-new-phase-plan.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-case-new-phase-plan.md",
          metadataPath:
            "/tmp/project/.c8c/artifacts/run-case-new-phase-plan.json",
          createdAt: 8,
          updatedAt: 8,
        },
        {
          id: "artifact-unrelated-plan",
          kind: "phase_plan",
          title: "Older unrelated plan",
          caseId: "case:delivery-foundation:other",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-other",
          relativePath: ".c8c/artifacts/run-other-phase-plan.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-other-phase-plan.md",
          metadataPath: "/tmp/project/.c8c/artifacts/run-other-phase-plan.json",
          createdAt: 10,
          updatedAt: 10,
        },
        {
          id: "artifact-source-brief",
          kind: "project_brief",
          title: "Source brief",
          caseId: "case:delivery-foundation:abc123",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-source",
          relativePath: ".c8c/artifacts/run-source-project-brief.md",
          contentPath:
            "/tmp/project/.c8c/artifacts/run-source-project-brief.md",
          metadataPath:
            "/tmp/project/.c8c/artifacts/run-source-project-brief.json",
          createdAt: 3,
          updatedAt: 3,
        },
        {
          id: "artifact-case-roadmap",
          kind: "roadmap",
          title: "Same case roadmap",
          caseId: "case:delivery-foundation:abc123",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-case",
          relativePath: ".c8c/artifacts/run-case-roadmap.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-case-roadmap.md",
          metadataPath: "/tmp/project/.c8c/artifacts/run-case-roadmap.json",
          createdAt: 4,
          updatedAt: 4,
        },
      ],
      context: {
        caseId: "case:delivery-foundation:abc123",
        sourceArtifactIds: ["artifact-source-brief"],
      },
    })

    expect(pool.map((artifact) => artifact.id)).toEqual([
      "artifact-case-plan-new",
      "artifact-current-plan",
      "artifact-case-roadmap",
      "artifact-source-brief",
    ])
  })

  it("keeps caller priority when selecting continuation artifacts", () => {
    const selected = selectArtifactsForTemplateContracts(
      [
        { kind: "phase_plan", title: "Phase Plan" },
        { kind: "roadmap", title: "Roadmap", required: false },
      ],
      [
        {
          id: "artifact-current-plan",
          kind: "phase_plan",
          title: "Current Phase Plan",
          caseId: "case:delivery-foundation:abc123",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-current",
          relativePath: ".c8c/artifacts/run-current-phase-plan.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-current-phase-plan.md",
          metadataPath:
            "/tmp/project/.c8c/artifacts/run-current-phase-plan.json",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "artifact-unrelated-plan",
          kind: "phase_plan",
          title: "Newer Unrelated Plan",
          caseId: "case:delivery-foundation:other",
          projectPath: "/tmp/project",
          workspace: "/tmp/workspace",
          runId: "run-other",
          relativePath: ".c8c/artifacts/run-other-phase-plan.md",
          contentPath: "/tmp/project/.c8c/artifacts/run-other-phase-plan.md",
          metadataPath: "/tmp/project/.c8c/artifacts/run-other-phase-plan.json",
          createdAt: 9,
          updatedAt: 9,
        },
      ],
    )

    expect(selected.map((artifact) => artifact.id)).toEqual([
      "artifact-current-plan",
    ])
  })
})
