import { describe, expect, it } from "vitest"
import type { ArtifactRecord, CaseStateRecord } from "@shared/types"
import type { WorkflowTemplateRunContext } from "./workflow-entry"
import { deriveWorkflowResumeEntrySummary } from "./workflow-resume-entry"

function createContext(
  overrides: Partial<WorkflowTemplateRunContext> = {},
): WorkflowTemplateRunContext {
  return {
    templateId: "delivery-plan-phase",
    templateName: "Delivery Factory: Plan Phase",
    workflowPath: "/tmp/project/plan.flow.yaml",
    workflowName: "Plan seller photo upload",
    source: "template",
    inputText: "Feature spec",
    outputText: "Phase plan",
    caseId: "case:seller-photo-upload",
    caseLabel: "Seller photo upload",
    sourceArtifactIds: ["artifact-1"],
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

describe("workflow-resume-entry", () => {
  it("builds sentence-form resume copy from saved artifacts", () => {
    const summary = deriveWorkflowResumeEntrySummary({
      context: createContext(),
      currentStepLabel: "Plan",
      sourceArtifacts: [createArtifact()],
      startApprovalRequired: false,
    })

    expect(summary).toMatchObject({
      workLabel: "Seller photo upload",
      currentStepLabel: "Plan",
      readyBecauseText:
        "Ready because Feature Spec from Build from brief is saved.",
      checksText: "No blocking checks or approvals.",
      attachText: "Feature Spec",
      latestResultText: "Latest result: Feature Spec from Build from brief.",
      continueLabel: "Continue to Plan",
    })
  })

  it("switches checks copy when approval is still required", () => {
    const summary = deriveWorkflowResumeEntrySummary({
      context: createContext(),
      currentStepLabel: "Review",
      sourceArtifacts: [createArtifact()],
      startApprovalRequired: true,
    })

    expect(summary?.checksText).toBe(
      "Approval is still required before continue.",
    )
    expect(summary?.continueLabel).toBe("Continue to Review")
  })

  it("uses durable gate copy when a saved check or approval is available", () => {
    const summary = deriveWorkflowResumeEntrySummary({
      context: createContext(),
      currentStepLabel: "Plan",
      sourceArtifacts: [createArtifact()],
      caseState: createCaseState(),
      startApprovalRequired: false,
    })

    expect(summary?.checksText).toBe("Approval recorded. Plan can continue.")
  })

  it("returns null when there is no saved-work signal to show", () => {
    const summary = deriveWorkflowResumeEntrySummary({
      context: createContext({ caseLabel: undefined, caseId: undefined }),
      currentStepLabel: "Plan",
      sourceArtifacts: [],
      startApprovalRequired: false,
    })

    expect(summary).toBeNull()
  })
})
