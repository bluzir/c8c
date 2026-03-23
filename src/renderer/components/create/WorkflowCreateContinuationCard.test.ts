import { describe, expect, it } from "vitest"
import type { WorkflowCreateContinuationCandidate } from "@/lib/workflow-create-continuation"
import {
  buildContinuationActionLabel,
  buildContinuationStepChips,
  deriveSecondaryContinuationVisibility,
} from "./WorkflowCreateContinuationCard"

function createContinuation(
  overrides: Partial<WorkflowCreateContinuationCandidate> = {},
): WorkflowCreateContinuationCandidate {
  return {
    caseId: "case-1",
    title: "Seller photo upload",
    status: "ready",
    readinessText: "Ready to continue to Plan the change.",
    supportText: "Using saved Feature Spec from Shape / Map.",
    lastGateText: null,
    latestResultLabel: "Feature Spec",
    latestStepLabel: "Shape / Map",
    nextStepLabel: "Plan the change",
    updatedAt: 1,
    action: {
      kind: "launch_next_step",
      template: {
        id: "delivery-plan-phase",
        name: "Delivery Factory: Plan Phase",
        description: "Plan the next implementation phase.",
        stage: "strategy",
        emoji: "P",
        headline: "Plan phase",
        how: "Break work into small tasks.",
        input: "Project context",
        output: "Phase plan",
        steps: ["Plan", "Review"],
        workflow: {
          version: 1,
          name: "Delivery Factory: Plan Phase",
          nodes: [],
          edges: [],
        },
      },
      artifacts: [],
      caseId: "case-1",
    },
    ...overrides,
  }
}

describe("WorkflowCreateContinuationCard helpers", () => {
  it("builds step chips for latest and next continuation stages", () => {
    expect(buildContinuationStepChips(createContinuation())).toEqual([
      "Latest step: Shape / Map",
      "Next step: Plan the change",
    ])
  })

  it("omits empty step chips", () => {
    expect(
      buildContinuationStepChips(
        createContinuation({
          latestStepLabel: null,
          nextStepLabel: null,
        }),
      ),
    ).toEqual([])
  })

  it("uses action-specific labels for blocked continuations", () => {
    expect(
      buildContinuationActionLabel(
        createContinuation({
          status: "blocked",
          action: {
            kind: "open_blocked_work",
            task: {
              task: "Ship approval",
              taskId: "task-1",
              kind: "approval",
              status: "open",
              workspace: "/tmp/workspace",
              chainId: "chain-1",
              sourceRunId: "run-1",
              nodeId: "approval-1",
              workflowName: "Ship flow",
              workflowPath: "/tmp/project/ship.flow.yaml",
              projectPath: "/tmp/project",
              title: "Ship approval",
              createdAt: 1,
              updatedAt: 1,
              responseRevision: 0,
              allowEdit: true,
            },
          },
        }),
      ),
    ).toBe("Open approval")

    expect(
      buildContinuationActionLabel(
        createContinuation({
          status: "blocked",
          action: {
            kind: "open_blocked_work",
            task: {
              task: "Missing input",
              taskId: "task-2",
              kind: "form",
              status: "open",
              workspace: "/tmp/workspace",
              chainId: "chain-2",
              sourceRunId: "run-2",
              nodeId: "form-1",
              workflowName: "Plan flow",
              workflowPath: "/tmp/project/plan.flow.yaml",
              projectPath: "/tmp/project",
              title: "Missing project input",
              createdAt: 1,
              updatedAt: 1,
              responseRevision: 0,
              allowEdit: true,
            },
          },
        }),
      ),
    ).toBe("Provide input")
  })

  it("collapses long secondary continuation lists until expanded", () => {
    const continuations = [
      createContinuation({ caseId: "case-1", title: "Case 1" }),
      createContinuation({ caseId: "case-2", title: "Case 2" }),
      createContinuation({ caseId: "case-3", title: "Case 3" }),
      createContinuation({ caseId: "case-4", title: "Case 4" }),
      createContinuation({ caseId: "case-5", title: "Case 5" }),
    ]

    expect(
      deriveSecondaryContinuationVisibility(continuations, false),
    ).toMatchObject({
      visibleContinuations: continuations.slice(0, 2),
      hiddenCount: 3,
      canToggle: true,
    })

    expect(
      deriveSecondaryContinuationVisibility(continuations, true),
    ).toMatchObject({
      visibleContinuations: continuations,
      hiddenCount: 0,
      canToggle: true,
    })
  })
})
