import { describe, expect, it } from "vitest"
import type { ArtifactRecord, CaseStateRecord, WorkflowTemplate } from "@shared/types"
import { deriveArtifactInspectSummary } from "./artifact-inspect"

function createTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id: "delivery-plan-phase",
    name: "Delivery Factory: Plan Phase",
    description: "Plan the requested change.",
    stage: "strategy",
    emoji: "🧭",
    headline: "Plan the change",
    how: "Turn the saved result into the next actionable step.",
    input: "Feature spec",
    output: "Implementation plan",
    steps: ["Plan"],
    pack: {
      id: "delivery-pack",
      label: "Delivery Factory",
      journeyStage: "plan",
    },
    contractIn: [{ kind: "requirements_spec", title: "Feature Spec" }],
    contractOut: [{ kind: "phase_plan", title: "Implementation Plan" }],
    workflow: {
      version: 1,
      name: "Delivery Factory: Plan Phase",
      nodes: [],
      edges: [],
    },
    ...overrides,
  }
}

function createArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "artifact-1",
    kind: "requirements_spec",
    title: "Feature Spec",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    relativePath: ".c8c/artifacts/feature-spec.md",
    contentPath: "/tmp/project/.c8c/artifacts/feature-spec.md",
    metadataPath: "/tmp/project/.c8c/artifacts/feature-spec.json",
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

function createCaseState(overrides: Partial<CaseStateRecord> = {}): CaseStateRecord {
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

describe("artifact-inspect", () => {
  it("summarizes ready next steps and artifact provenance", () => {
    const summary = deriveArtifactInspectSummary({
      artifact: createArtifact({
        templateName: "Delivery Factory: Shape Project",
        sourceArtifactIds: ["artifact-0"],
      }),
      relatedArtifacts: [
        createArtifact({
          id: "artifact-0",
          title: "Project Brief",
        }),
      ],
      matchingTemplates: [
        createTemplate(),
        createTemplate({
          id: "delivery-review-phase",
          name: "Delivery Factory: Review Phase",
          headline: "Review before ship",
          input: "Implementation diff",
          output: "Review notes",
          steps: ["Review"],
          pack: {
            id: "delivery-pack",
            label: "Delivery Factory",
            journeyStage: "review",
          },
          contractIn: [{ kind: "phase_plan", title: "Implementation Plan" }],
          contractOut: [{ kind: "review_notes", title: "Review Notes" }],
          workflow: {
            version: 1,
            name: "Delivery Factory: Review Phase",
            nodes: [],
            edges: [],
          },
        }),
      ],
    })

    expect(summary).toMatchObject({
      statusText: "Ready for Plan the change and 1 more step.",
      savedFromText: "Delivery Factory: Shape Project",
      sourceText: "Project Brief",
      readyNextText: "Plan the change and Review before ship",
    })
  })

  it("falls back cleanly when no next step or provenance exists", () => {
    const summary = deriveArtifactInspectSummary({
      artifact: createArtifact(),
      relatedArtifacts: [],
      matchingTemplates: [],
    })

    expect(summary).toMatchObject({
      statusText: "Saved artifact. No next step is ready from this artifact alone yet.",
      savedFromText: "Saved from a previous run",
      sourceText: "No upstream artifacts were recorded for this saved artifact.",
      readyNextText: "No next step is ready from this artifact alone yet.",
      readyNextLabels: [],
      latestCheckText: null,
    })
  })

  it("includes the latest durable check when case state is available", () => {
    const summary = deriveArtifactInspectSummary({
      artifact: createArtifact({ caseId: "case:seller-photo-upload" }),
      caseState: createCaseState(),
      relatedArtifacts: [],
      matchingTemplates: [],
    })

    expect(summary.latestCheckText).toBe("Approval recorded. Plan can continue.")
  })
})
