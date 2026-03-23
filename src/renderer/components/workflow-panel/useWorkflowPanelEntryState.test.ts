import { describe, expect, it } from "vitest"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import {
  formatTemplateToolingRecommendationNote,
  hasWorkflowReviewHistory,
  resolveActiveWorkflowEntryState,
  resolveStageStartPolicyNotes,
  resolveShowResumeHeader,
} from "./useWorkflowPanelEntryState"

function createEntryState(
  overrides: Partial<WorkflowEntryState> = {},
): WorkflowEntryState {
  return {
    workflowPath: null,
    workflowName: "Draft flow",
    source: "generated",
    title: "Draft flow",
    summary: "Summary",
    contractLabel: "Request",
    contractText: "Request text.",
    inputText: "Input text.",
    outputText: "Output text.",
    readinessText: "Ready to run.",
    ...overrides,
  }
}

describe("resolveActiveWorkflowEntryState", () => {
  it("matches path-bound entry state for the selected workflow", () => {
    const entryState = createEntryState({
      workflowPath: "/tmp/project/flow.chain",
      workflowName: "Saved flow",
    })

    expect(
      resolveActiveWorkflowEntryState({
        workflowEntryState: entryState,
        selectedWorkflowPath: "/tmp/project/flow.chain",
        workflowName: "Saved flow",
      }),
    ).toEqual(entryState)
  })

  it("matches draft entry state only for an unsaved workflow", () => {
    const entryState = createEntryState()

    expect(
      resolveActiveWorkflowEntryState({
        workflowEntryState: entryState,
        selectedWorkflowPath: null,
        workflowName: "Draft flow",
      }),
    ).toEqual(entryState)
  })

  it("does not leak a draft entry state into a saved workflow with the same name", () => {
    expect(
      resolveActiveWorkflowEntryState({
        workflowEntryState: createEntryState(),
        selectedWorkflowPath: "/tmp/project/draft-flow.chain",
        workflowName: "Draft flow",
      }),
    ).toBeNull()
  })

  it("falls back to the persisted continuation bookmark when the active entry state is empty", () => {
    const entryState = createEntryState({
      workflowPath: "/tmp/project/continue.chain",
      workflowName: "Continue flow",
      source: "template",
    })

    expect(
      resolveActiveWorkflowEntryState({
        workflowEntryState: null,
        workflowContinuationEntryState: entryState,
        selectedWorkflowPath: "/tmp/project/continue.chain",
        workflowName: "Continue flow",
      }),
    ).toEqual(entryState)
  })
})

describe("hasWorkflowReviewHistory", () => {
  it("treats an explicitly selected past run as reviewable history", () => {
    expect(
      hasWorkflowReviewHistory({
        workflowPastRunsCount: 0,
        hasSelectedPastRun: true,
      }),
    ).toBe(true)
  })

  it("returns false when the flow has neither history nor a selected run", () => {
    expect(
      hasWorkflowReviewHistory({
        workflowPastRunsCount: 0,
        hasSelectedPastRun: false,
      }),
    ).toBe(false)
  })
})

describe("resolveShowResumeHeader", () => {
  it("shows the resume header only for idle saved-work entry states", () => {
    expect(
      resolveShowResumeHeader({
        viewMode: "list",
        runStatus: "idle",
        activeEntryState: createEntryState(),
        resumeEntrySummary: {
          workLabel: "Verification",
          currentStepLabel: "Verify",
          readyBecauseText: "Ready because Verification Report is saved.",
          checksText: "No blocking checks or approvals.",
          attachText: "Verification Report",
          latestResultText: "Latest result: Verification Report.",
          continueLabel: "Continue to Verify",
          primaryArtifact: null,
        },
        showCreateDraftSkeleton: false,
        prepareNewRun: false,
      }),
    ).toBe(true)
  })

  it("keeps fresh starts on the stage contract surface", () => {
    expect(
      resolveShowResumeHeader({
        viewMode: "list",
        runStatus: "idle",
        activeEntryState: createEntryState(),
        resumeEntrySummary: null,
        showCreateDraftSkeleton: false,
        prepareNewRun: false,
      }),
    ).toBe(false)
  })

  it("suppresses resume header while a new run is being prepared", () => {
    expect(
      resolveShowResumeHeader({
        viewMode: "list",
        runStatus: "idle",
        activeEntryState: createEntryState(),
        resumeEntrySummary: {
          workLabel: "Verification",
          currentStepLabel: "Verify",
          readyBecauseText: "Ready because Verification Report is saved.",
          checksText: "No blocking checks or approvals.",
          attachText: "Verification Report",
          latestResultText: "Latest result: Verification Report.",
          continueLabel: "Continue to Verify",
          primaryArtifact: null,
        },
        showCreateDraftSkeleton: false,
        prepareNewRun: true,
      }),
    ).toBe(false)
  })
})

describe("resolveStageStartPolicyNotes", () => {
  it("prioritizes MCP tooling guidance ahead of lower-priority policy notes", () => {
    const recommendation = {
      level: "warning" as const,
      title: "This flow recommends web search",
      description:
        "Switch to Exa so MCP-backed search is available during execution.",
      actionLabel: "Use Exa",
      action: "switch_to_exa" as const,
    }

    expect(
      resolveStageStartPolicyNotes({
        notes: [
          "Prefer concrete signals over vague takes.",
          "Make the evidence base reusable downstream.",
          '"Target operator: solo founder with AI agents, no employees."',
          "Keep the final answer concise.",
        ],
        templateToolingRecommendation: recommendation,
      }),
    ).toEqual([
      formatTemplateToolingRecommendationNote(recommendation),
      "Prefer concrete signals over vague takes.",
      "Make the evidence base reusable downstream.",
    ])
  })

  it("keeps ordinary policy notes unchanged when no tooling recommendation exists", () => {
    expect(
      resolveStageStartPolicyNotes({
        notes: [
          "Ground the map in the repository, not assumptions.",
          '"Target operator: solo founder with AI agents, no employees."',
          "Call out hotspots early.",
        ],
      }),
    ).toEqual([
      "Ground the map in the repository, not assumptions.",
      "Call out hotspots early.",
    ])
  })
})
