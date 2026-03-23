import { describe, expect, it } from "vitest"
import type {
  ArtifactRecord,
  HumanTaskSummary,
  WorkflowTemplate,
} from "@shared/types"
import { deriveWorkflowCreateContinuations } from "./workflow-create-continuation"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-shape-project",
    name: "Delivery Factory: Shape Project",
    description: "Shape the requested change before planning.",
    stage: "strategy",
    emoji: "S",
    headline: "Shape the work",
    how: "Define the work clearly before planning.",
    input: "Project brief",
    output: "Feature spec",
    steps: ["Shape", "Review"],
    pack: {
      id: "delivery-pack",
      label: "Delivery Factory",
      journeyStage: "shape",
      recommendedNext: ["delivery-plan-phase"],
    },
    contractIn: [{ kind: "project_brief", title: "Project Brief" }],
    contractOut: [{ kind: "requirements_spec", title: "Feature Spec" }],
    workflow: {
      version: 1,
      name: "Delivery Factory: Shape Project",
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
    kind: "verification_report",
    title: "Verification Report",
    caseId: "case:seller-photo-upload",
    caseLabel: undefined,
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    templateId: "delivery-verify-phase",
    templateName: "Delivery Factory: Verify Phase",
    workflowPath: "/tmp/project/verify.flow.yaml",
    workflowName: undefined,
    relativePath: ".c8c/artifacts/verification-report.md",
    contentPath: "/tmp/project/.c8c/artifacts/verification-report.md",
    metadataPath: "/tmp/project/.c8c/artifacts/verification-report.json",
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

function createTask(
  overrides: Partial<HumanTaskSummary> = {},
): HumanTaskSummary {
  return {
    task: "Review feature spec",
    taskId: "task-1",
    kind: "approval",
    status: "open",
    workspace: "/tmp/workspace",
    chainId: "chain-1",
    sourceRunId: "run-1",
    nodeId: "approval-1",
    workflowName: "Seller photo upload",
    workflowPath: "/tmp/project/review.flow.yaml",
    projectPath: "/tmp/project",
    title: "Approve seller photo upload",
    instructions: undefined,
    summary: undefined,
    createdAt: 12,
    updatedAt: 12,
    responseRevision: 0,
    allowEdit: true,
    ...overrides,
  }
}

describe("workflow-create-continuation labels", () => {
  it("prefers the task workflow name over a generic artifact title for blocked work", () => {
    const candidates = deriveWorkflowCreateContinuations({
      artifacts: [createArtifact()],
      humanTasks: [createTask()],
      templates: [],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.status).toBe("blocked")
    expect(candidates[0]?.title).toBe("Seller photo upload")
    expect(candidates[0]?.latestResultLabel).toBe("Verification Report")
  })

  it("keeps a human case label for ready work when the freshest artifact title is generic", () => {
    const shapeTemplate = createTemplate()
    const planTemplate = createTemplate({
      id: "delivery-plan-phase",
      name: "Delivery Factory: Plan Phase",
      pack: {
        id: "delivery-pack",
        label: "Delivery Factory",
        journeyStage: "plan",
        recommendedNext: [],
      },
      contractIn: [{ kind: "requirements_spec", title: "Feature Spec" }],
      contractOut: [{ kind: "phase_plan", title: "Implementation Plan" }],
      workflow: {
        version: 1,
        name: "Delivery Factory: Plan Phase",
        nodes: [],
        edges: [],
      },
    })

    const candidates = deriveWorkflowCreateContinuations({
      artifacts: [
        createArtifact({
          id: "artifact-shape",
          kind: "requirements_spec",
          title: "Feature Spec",
          caseLabel: "Seller photo upload",
          templateId: "delivery-shape-project",
          templateName: "Delivery Factory: Shape Project",
          workflowName: "Shape seller photo upload",
          updatedAt: 5,
        }),
        createArtifact({
          id: "artifact-generic",
          kind: "verification_report",
          title: "Verification Report",
          caseLabel: undefined,
          templateId: "delivery-verify-phase",
          templateName: "Delivery Factory: Verify Phase",
          workflowName: undefined,
          updatedAt: 20,
        }),
      ],
      humanTasks: [],
      templates: [shapeTemplate, planTemplate],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.status).toBe("ready")
    expect(candidates[0]?.title).toBe("Seller photo upload")
    expect(candidates[0]?.latestResultLabel).toBe("Verification Report")
  })
})
