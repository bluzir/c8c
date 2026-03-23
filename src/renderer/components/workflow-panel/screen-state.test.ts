import { describe, expect, it } from "vitest"
import {
  resolveWorkflowListSurfaceIntent,
  resolveWorkflowPrimaryScreenState,
  shouldShowResumeInputPanel,
  shouldShowLiveOutputPanel,
  shouldShowProcessSpine,
} from "./screen-state"

describe("resolveWorkflowPrimaryScreenState", () => {
  it("treats idle entry without source artifacts as fresh start", () => {
    expect(
      resolveWorkflowPrimaryScreenState({
        runStatus: "idle",
        runOutcome: null,
        showAnyReviewMode: false,
        hasBlockedResumeState: false,
        hasActiveEntryState: true,
        hasSourceArtifacts: false,
        canShowTerminalResultSurface: false,
        nextStageTemplate: null,
        prepareNewRun: false,
      }),
    ).toBe("fresh_start")
  })

  it("treats idle entry with source artifacts as cross-flow handoff", () => {
    expect(
      resolveWorkflowPrimaryScreenState({
        runStatus: "idle",
        runOutcome: null,
        showAnyReviewMode: false,
        hasBlockedResumeState: false,
        hasActiveEntryState: true,
        hasSourceArtifacts: true,
        canShowTerminalResultSurface: false,
        nextStageTemplate: null,
        prepareNewRun: false,
      }),
    ).toBe("cross_flow_handoff")
  })

  it("prefers blocked decision over generic idle entry state", () => {
    expect(
      resolveWorkflowPrimaryScreenState({
        runStatus: "idle",
        runOutcome: null,
        showAnyReviewMode: false,
        hasBlockedResumeState: true,
        hasActiveEntryState: true,
        hasSourceArtifacts: true,
        canShowTerminalResultSurface: false,
        nextStageTemplate: null,
        prepareNewRun: false,
      }),
    ).toBe("blocked_decision")
  })

  it("marks terminal result with downstream stage as auto-chain gate", () => {
    expect(
      resolveWorkflowPrimaryScreenState({
        runStatus: "done",
        runOutcome: "completed",
        showAnyReviewMode: false,
        hasBlockedResumeState: false,
        hasActiveEntryState: false,
        hasSourceArtifacts: false,
        canShowTerminalResultSurface: true,
        nextStageTemplate: {
          id: "delivery-plan-phase",
          name: "Delivery plan",
          description: "",
          stage: "code",
          emoji: "x",
          headline: "",
          how: "",
          input: "",
          output: "",
          steps: [],
          workflow: { version: 1, name: "Delivery plan", nodes: [], edges: [] },
        },
        prepareNewRun: false,
      }),
    ).toBe("auto_chain_gate")
  })

  it("falls back to fresh start when preparing a new run even if previous results exist", () => {
    expect(
      resolveWorkflowPrimaryScreenState({
        runStatus: "idle",
        runOutcome: "completed",
        showAnyReviewMode: false,
        hasBlockedResumeState: false,
        hasActiveEntryState: false,
        hasSourceArtifacts: false,
        canShowTerminalResultSurface: true,
        nextStageTemplate: null,
        prepareNewRun: true,
      }),
    ).toBe("fresh_start")
  })

  it("keeps live output hidden on fresh start style states", () => {
    expect(shouldShowLiveOutputPanel("fresh_start")).toBe(false)
    expect(shouldShowLiveOutputPanel("cross_flow_handoff")).toBe(false)
  })

  it("keeps the process spine available across routed and completed states", () => {
    expect(shouldShowProcessSpine("fresh_start")).toBe(true)
    expect(shouldShowProcessSpine("cross_flow_handoff")).toBe(true)
    expect(shouldShowProcessSpine("one_off_done")).toBe(true)
  })

  it("keeps chain chrome visible for auto-chain gates", () => {
    expect(shouldShowLiveOutputPanel("auto_chain_gate")).toBe(true)
    expect(shouldShowProcessSpine("auto_chain_gate")).toBe(true)
  })

  it("defines one internal surface intent for each list state", () => {
    expect(
      resolveWorkflowListSurfaceIntent({
        primaryScreenState: "fresh_start",
        showResumeHeader: false,
        readyToRun: false,
      }),
    ).toBe("start_contract")
    expect(
      resolveWorkflowListSurfaceIntent({
        primaryScreenState: "blocked_decision",
        showResumeHeader: false,
        readyToRun: false,
      }),
    ).toBe("blocked_decision")
    expect(
      resolveWorkflowListSurfaceIntent({
        primaryScreenState: "running",
        showResumeHeader: false,
        readyToRun: false,
      }),
    ).toBe("runtime_status")
    expect(
      resolveWorkflowListSurfaceIntent({
        primaryScreenState: "one_off_done",
        showResumeHeader: false,
        readyToRun: false,
      }),
    ).toBe("result_inspect")
    expect(
      resolveWorkflowListSurfaceIntent({
        primaryScreenState: "paused_resume",
        showResumeHeader: true,
        readyToRun: true,
      }),
    ).toBe("resume_ready")
    expect(
      resolveWorkflowListSurfaceIntent({
        primaryScreenState: "paused_resume",
        showResumeHeader: true,
        readyToRun: false,
      }),
    ).toBe("resume_needs_input")
  })

  it("shows resume input only when the question is about missing input", () => {
    expect(shouldShowResumeInputPanel("resume_needs_input")).toBe(true)
    expect(shouldShowResumeInputPanel("resume_ready")).toBe(false)
  })
})
