import { describe, expect, it } from "vitest"
import type {
  ArtifactRecord,
  CaseStateRecord,
  WorkflowTemplate,
} from "@shared/types"
import { buildProjectCaseIndex } from "./case-summary"
import type { WorkflowTemplateRunContext } from "./workflow-entry"

function createArtifact(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    id: "artifact-1",
    kind: "requirements_spec",
    title: "Feature Spec",
    caseId: "case:seller-photo-upload",
    caseLabel: "Seller photo upload",
    factoryId: "pack:delivery-pack",
    factoryLabel: "Delivery Factory",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    templateId: "delivery-plan-phase",
    templateName: "Delivery Factory: Plan Phase",
    workflowPath: "/tmp/project/plan.flow.yaml",
    workflowName: "Plan seller photo upload",
    relativePath: ".c8c/artifacts/feature-spec.md",
    contentPath: "/tmp/project/.c8c/artifacts/feature-spec.md",
    metadataPath: "/tmp/project/.c8c/artifacts/feature-spec.json",
    createdAt: 1,
    updatedAt: 20,
    ...overrides,
  }
}

function createCaseState(
  overrides: Partial<CaseStateRecord> = {},
): CaseStateRecord {
  return {
    version: 1,
    caseId: "case:seller-photo-upload",
    projectPath: "/tmp/project",
    workLabel: "Seller photo upload",
    caseLabel: "Seller photo upload",
    factoryId: "pack:delivery-pack",
    factoryLabel: "Delivery Factory",
    workflowPath: "/tmp/project/review.flow.yaml",
    workflowName: "Review seller photo upload",
    continuationStatus: "ready",
    nextStepLabel: "Apply approved changes",
    artifactIds: ["artifact-1"],
    lastGate: {
      family: "approval",
      outcome: "passed",
      summaryText: "Approval recorded. Review can continue.",
      reasonText: "The latest approval decision was saved.",
      stepLabel: "Review",
      happenedAt: 10,
    },
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

function createContext(
  overrides: Partial<WorkflowTemplateRunContext> = {},
): WorkflowTemplateRunContext {
  return {
    templateId: "delivery-implement-phase",
    templateName: "Delivery Factory: Implement Phase",
    workflowPath: "/tmp/project/implement.flow.yaml",
    workflowName: "Implement seller photo upload",
    source: "template",
    caseId: "case:seller-photo-upload",
    caseLabel: "Seller photo upload",
    factoryId: "pack:delivery-pack",
    factoryLabel: "Delivery Factory",
    pack: {
      id: "delivery-pack",
      label: "Delivery Factory",
      journeyStage: "execute",
    },
    ...overrides,
  }
}

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Factory: Plan Phase",
    description: "Plan the change.",
    stage: "strategy",
    emoji: "📐",
    headline: "Plan the change",
    how: "Turn the scoped change into a plan.",
    input: "Feature spec",
    output: "Phase plan",
    steps: ["Plan"],
    pack: {
      id: "delivery-pack",
      label: "Delivery Factory",
      journeyStage: "plan",
    },
    workflow: {
      version: 1,
      name: "Delivery Factory: Plan Phase",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

describe("case-summary", () => {
  it("merges case state, artifacts, and workflow context into one summary", () => {
    const index = buildProjectCaseIndex({
      artifacts: [createArtifact()],
      caseStates: [createCaseState()],
      templates: [createTemplate()],
      workflowTemplateContexts: {
        "/tmp/project/implement.flow.yaml": createContext(),
      },
    })

    expect(index.caseOptions).toHaveLength(1)
    expect(index.caseOptions[0]).toMatchObject({
      id: "case:seller-photo-upload",
      label: "Seller photo upload",
      updatedAt: 20,
      factoryId: "pack:delivery-pack",
      factoryLabel: "Delivery Factory",
    })
    expect(index.caseByRunId.get("run-1")).toBe("case:seller-photo-upload")
    expect(index.caseByWorkflowPath.get("/tmp/project/review.flow.yaml")).toBe(
      "case:seller-photo-upload",
    )
    expect(
      index.caseByWorkflowPath.get("/tmp/project/implement.flow.yaml"),
    ).toBe("case:seller-photo-upload")
    expect(
      index.latestArtifactByCaseId.get("case:seller-photo-upload")?.title,
    ).toBe("Feature Spec")
    expect(index.cases[0]?.lineageLabels).toEqual(["Review", "Plan", "Build"])
    expect(index.cases[0]).toMatchObject({
      continuationStatus: "ready",
      nextStepLabel: "Apply approved changes",
      lastGate: {
        summaryText: "Approval recorded. Review can continue.",
      },
    })
  })

  it("keeps durable case identity even when only case state is available", () => {
    const index = buildProjectCaseIndex({
      artifacts: [],
      caseStates: [
        createCaseState({
          caseId: "case:ship-approval",
          caseLabel: "Ship seller photo upload",
          workflowPath: "/tmp/project/ship.flow.yaml",
          artifactIds: [],
        }),
      ],
      workflowTemplateContexts: {},
    })

    expect(index.caseOptions).toHaveLength(1)
    expect(index.caseOptions[0]).toMatchObject({
      id: "case:ship-approval",
      label: "Ship seller photo upload",
      factoryId: "pack:delivery-pack",
    })
    expect(index.caseByWorkflowPath.get("/tmp/project/ship.flow.yaml")).toBe(
      "case:ship-approval",
    )
    expect(
      index.latestArtifactByCaseId.get("case:ship-approval"),
    ).toBeUndefined()
    expect(index.cases[0]?.lineageLabels).toEqual(["Review"])
  })
})
