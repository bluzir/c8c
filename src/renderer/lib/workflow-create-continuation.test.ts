import { describe, expect, it } from "vitest"
import type {
  ArtifactRecord,
  CaseStateRecord,
  HumanTaskSummary,
  WorkflowTemplate,
} from "@shared/types"
import {
  deriveWorkflowCreateContinuations,
  resolveWorkflowCreateContinuationPresentation,
} from "./workflow-create-continuation"

function createTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "delivery-shape-project",
    name: "Delivery Factory: Shape Project",
    description: "Shape the requested change before planning.",
    stage: "strategy",
    emoji: "🧭",
    headline: "Shape the work",
    how: "Define the change clearly before planning.",
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
    kind: "requirements_spec",
    title: "Feature Spec",
    caseId: "case:seller-photo-upload",
    caseLabel: "Seller photo upload",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    templateId: "delivery-shape-project",
    templateName: "Delivery Factory: Shape Project",
    workflowPath: "/tmp/project/shape.flow.yaml",
    workflowName: "Shape seller photo upload",
    relativePath: ".c8c/artifacts/feature-spec.md",
    contentPath: "/tmp/project/.c8c/artifacts/feature-spec.md",
    metadataPath: "/tmp/project/.c8c/artifacts/feature-spec.json",
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
    workflowName: "Review seller photo upload",
    workflowPath: "/tmp/project/review.flow.yaml",
    projectPath: "/tmp/project",
    title: "Approve the current change",
    instructions: "Review and approve this change.",
    summary: "Approval is blocking the next step.",
    createdAt: 12,
    updatedAt: 12,
    responseRevision: 0,
    allowEdit: true,
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
    continuationStatus: "ready",
    artifactIds: ["artifact-1"],
    lastGate: {
      family: "approval",
      outcome: "passed",
      summaryText: "Approval recorded. Plan can continue.",
      reasonText: "The latest approval decision was saved.",
      stepLabel: "Plan",
      happenedAt: 10,
    },
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

describe("workflow-create-continuation", () => {
  it("derives a ready continuation from saved results and recommended next steps", () => {
    const shapeTemplate = createTemplate()
    const planTemplate = createTemplate({
      id: "delivery-plan-phase",
      name: "Delivery Factory: Plan Phase",
      pack: {
        id: "delivery-pack",
        label: "Delivery Factory",
        journeyStage: "plan",
        recommendedNext: ["delivery-implement-phase"],
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
      artifacts: [createArtifact()],
      caseStates: [createCaseState()],
      humanTasks: [],
      templates: [shapeTemplate, planTemplate],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      title: "Seller photo upload",
      status: "ready",
      readinessText: "Ready to continue to Plan the change.",
      supportText: "Using saved Feature Spec from Build from brief.",
      lastGateText: "Approval recorded. Plan can continue.",
      latestResultLabel: "Feature Spec",
      latestStepLabel: "Build from brief",
      nextStepLabel: "Plan the change",
    })
    expect(candidates[0]?.action.kind).toBe("launch_next_step")
  })

  it("routes approved content QA into Ready Posts when the draft is still available", () => {
    const qaTemplate = createTemplate({
      id: "content-qa-review",
      name: "Content Lab: QA Review",
      description: "Review a draft before it goes live.",
      stage: "content",
      headline: "Review a draft before it goes live",
      how: "Critique the draft, approve it, and hand off to finalization.",
      input: "Draft post",
      output: "QA report",
      pack: {
        id: "content-factory-alpha",
        label: "Content Lab",
        journeyStage: "verify",
        recommendedNext: ["content-ready-posts"],
      },
      contractIn: [{ kind: "draft", title: "Draft Post" }],
      contractOut: [{ kind: "qa_report", title: "QA Report" }],
      workflow: {
        version: 1,
        name: "Content Lab: QA Review",
        nodes: [],
        edges: [],
      },
    })
    const readyPostsTemplate = createTemplate({
      id: "content-ready-posts",
      name: "Content Lab: Ready Posts",
      description: "Finalize an approved draft into ready-to-publish posts.",
      stage: "content",
      headline: "Finalize ready posts",
      how: "Apply QA guidance and package the final copy.",
      input: "Approved draft and QA report",
      output: "Ready posts bundle",
      pack: {
        id: "content-factory-alpha",
        label: "Content Lab",
        journeyStage: "deliver",
        recommendedNext: [],
      },
      contractIn: [
        { kind: "draft", title: "Draft Post" },
        { kind: "qa_report", title: "QA Report" },
      ],
      contractOut: [{ kind: "distribution_bundle", title: "Ready Posts" }],
      workflow: {
        version: 1,
        name: "Content Lab: Ready Posts",
        nodes: [],
        edges: [],
      },
    })

    const candidates = deriveWorkflowCreateContinuations({
      artifacts: [
        createArtifact({
          kind: "qa_report",
          title: "QA Report",
          templateId: "content-qa-review",
          templateName: "Content Lab: QA Review",
          updatedAt: 12,
        }),
        createArtifact({
          id: "artifact-2",
          kind: "draft",
          title: "Draft Post",
          templateId: "content-draft-post",
          templateName: "Content Lab: Draft Post",
          updatedAt: 10,
        }),
      ],
      caseStates: [
        createCaseState({
          artifactIds: ["artifact-1", "artifact-2"],
          lastGate: {
            family: "approval",
            outcome: "passed",
            summaryText: "QA approved. Ready Posts can continue.",
            reasonText: "The approved QA report is saved.",
            stepLabel: "Check",
            happenedAt: 12,
          },
          updatedAt: 12,
        }),
      ],
      humanTasks: [],
      templates: [qaTemplate, readyPostsTemplate],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.nextStepLabel).toBe("Ready Posts")
    expect(candidates[0]?.action.kind).toBe("launch_next_step")
    if (candidates[0]?.action.kind !== "launch_next_step") {
      throw new Error("Expected launch_next_step continuation")
    }
    expect(candidates[0].action.template.id).toBe("content-ready-posts")
    expect(
      candidates[0].action.artifacts.map((artifact) => artifact.kind),
    ).toEqual(["draft", "qa_report"])
  })

  it("prioritizes blocked work ahead of other resumable paths", () => {
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
        createArtifact(),
        createArtifact({
          id: "artifact-2",
          caseId: "case:checkout",
          caseLabel: "Checkout polish",
          workflowPath: "/tmp/project/checkout-shape.flow.yaml",
          workflowName: "Shape checkout polish",
          runId: "run-2",
          updatedAt: 30,
        }),
      ],
      humanTasks: [
        createTask({
          sourceRunId: "run-2",
          workflowPath: "/tmp/project/checkout-review.flow.yaml",
          workflowName: "Checkout review",
          title: "Approve checkout change",
          updatedAt: 5,
        }),
      ],
      templates: [shapeTemplate, planTemplate],
    })

    expect(candidates).toHaveLength(2)
    expect(candidates[0]?.status).toBe("blocked")
    expect(candidates[0]?.title).toBe("Checkout polish")
    expect(candidates[1]?.status).toBe("ready")
  })

  it("ignores saved work with no open task and no next step", () => {
    const verifyTemplate = createTemplate({
      id: "delivery-verify-phase",
      name: "Delivery Factory: Verify Phase",
      pack: {
        id: "delivery-pack",
        label: "Delivery Factory",
        journeyStage: "verify",
      },
      contractIn: [
        { kind: "verification_report", title: "Verification Report" },
      ],
      contractOut: [
        { kind: "verification_report", title: "Verification Report" },
      ],
      workflow: {
        version: 1,
        name: "Delivery Factory: Verify Phase",
        nodes: [],
        edges: [],
      },
    })

    const candidates = deriveWorkflowCreateContinuations({
      artifacts: [
        createArtifact({
          kind: "verification_report",
          templateId: "delivery-verify-phase",
          templateName: "Delivery Factory: Verify Phase",
        }),
      ],
      humanTasks: [],
      templates: [verifyTemplate],
    })

    expect(candidates).toEqual([])
  })

  it("uses top-level recommended next metadata for standalone continuations", () => {
    const auditTemplate = createTemplate({
      id: "ux-ui-polish-audit",
      name: "UX/UI Polish Audit",
      pack: undefined,
      recommendedNext: ["impeccable-ui-pipeline"],
      contractOut: [{ kind: "ux_audit_report", title: "UX Audit Report" }],
      workflow: {
        version: 1,
        name: "UX/UI Polish Audit",
        nodes: [],
        edges: [],
      },
    })
    const improveTemplate = createTemplate({
      id: "impeccable-ui-pipeline",
      name: "Impeccable UI Pipeline",
      pack: undefined,
      recommendedNext: [],
      contractIn: [
        {
          kind: "ux_audit_report",
          title: "UX Audit Report",
          required: false,
        },
      ],
      contractOut: [
        { kind: "implementation_report", title: "UI Improvements" },
      ],
      workflow: {
        version: 1,
        name: "Impeccable UI Pipeline",
        nodes: [],
        edges: [],
      },
    })

    const candidates = deriveWorkflowCreateContinuations({
      artifacts: [
        createArtifact({
          kind: "ux_audit_report",
          title: "UX Audit Report",
          templateId: "ux-ui-polish-audit",
          templateName: "UX/UI Polish Audit",
        }),
      ],
      caseStates: [createCaseState()],
      humanTasks: [],
      templates: [auditTemplate, improveTemplate],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      status: "ready",
      nextStepLabel: "Polish this UI",
    })
  })

  it("creates a blocked candidate even when the task has no artifact match yet", () => {
    const candidates = deriveWorkflowCreateContinuations({
      artifacts: [],
      humanTasks: [
        createTask({
          sourceRunId: "run-9",
          workflowPath: "/tmp/project/approval.flow.yaml",
          workflowName: "Seller photo upload",
          updatedAt: 20,
        }),
      ],
      templates: [],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      title: "Seller photo upload",
      status: "blocked",
      readinessText:
        "Blocked: awaiting your approval before the flow can continue.",
      supportText: "Approval is blocking the next step.",
    })
  })

  it("marks continuation as dominant only for one clear candidate with no competing new request", () => {
    const shapeTemplate = createTemplate()
    const planTemplate = createTemplate({
      id: "delivery-plan-phase",
      name: "Delivery Factory: Plan Phase",
      pack: {
        id: "delivery-pack",
        label: "Delivery Factory",
        journeyStage: "plan",
        recommendedNext: ["delivery-implement-phase"],
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
      artifacts: [createArtifact()],
      caseStates: [createCaseState()],
      humanTasks: [],
      templates: [shapeTemplate, planTemplate],
    })

    const presentation = resolveWorkflowCreateContinuationPresentation({
      candidates,
      hasStartedNewRequest: false,
      routingInProgress: false,
      clarificationInProgress: false,
    })

    expect(presentation.presentation).toBe("dominant")
    expect(presentation.reason).toBe("single_clear_candidate")
    expect(presentation.primaryContinuation?.title).toBe("Seller photo upload")
    expect(presentation.secondaryContinuations).toEqual([])
  })

  it("keeps continuation supporting when the user started a new request or there are multiple candidates", () => {
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
        createArtifact(),
        createArtifact({
          id: "artifact-2",
          caseId: "case:checkout",
          caseLabel: "Checkout polish",
          workflowPath: "/tmp/project/checkout-shape.flow.yaml",
          workflowName: "Shape checkout polish",
          runId: "run-2",
          updatedAt: 30,
        }),
      ],
      humanTasks: [],
      templates: [shapeTemplate, planTemplate],
    })

    const withDraft = resolveWorkflowCreateContinuationPresentation({
      candidates: candidates.slice(0, 1),
      hasStartedNewRequest: true,
      routingInProgress: false,
      clarificationInProgress: false,
    })
    const withMultiple = resolveWorkflowCreateContinuationPresentation({
      candidates,
      hasStartedNewRequest: false,
      routingInProgress: false,
      clarificationInProgress: false,
    })

    expect(withDraft.presentation).toBe("supporting")
    expect(withDraft.reason).toBe("new_request_started")
    expect(withMultiple.presentation).toBe("supporting")
    expect(withMultiple.reason).toBe("multiple_candidates")
    expect(withMultiple.secondaryContinuations).toHaveLength(1)
  })
})
