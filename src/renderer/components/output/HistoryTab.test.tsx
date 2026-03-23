// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { FlowImprovementRecommendation } from "@shared/types"
import { HistoryTab } from "./HistoryTab"

const BASE_RUN = {
  runId: "run-1",
  status: "completed" as const,
  workflowName: "Audit flow",
  workflowPath: "/tmp/audit-flow.yaml",
  startedAt: Date.now() - 5_000,
  completedAt: Date.now() - 1_000,
  reportPath: "/tmp/report.md",
  workspace: "/tmp/workspace",
  totalCost: 0.22,
  durationMs: 4_000,
}

function makeRec(
  overrides: Partial<FlowImprovementRecommendation> & { id: string },
): FlowImprovementRecommendation {
  return {
    workflowName: "Audit flow",
    workflowPath: "/tmp/audit-flow.yaml",
    nodeId: "writer",
    nodeLabel: "Writer",
    kind: "prefer_variant",
    summary: "Writer has a stronger variant in recent runs.",
    evidence: "4 runs · 100% clear vs 50% · 0.0 retries vs 1.5",
    confidence: "high",
    supportingRunCount: 4,
    comparisonRunCount: 2,
    updatedAt: Date.now(),
    candidate: { modelId: "sonnet", promptHash: "abcd1234" },
    baseline: { modelId: "sonnet", promptHash: "efgh5678" },
    ...overrides,
  }
}

/** Find all recommendation card containers by their surface class. */
function getRecommendationCards() {
  return document.querySelectorAll(".surface-info-soft")
}

describe("HistoryTab", () => {
  it("renders a single recommendation directly without disclosure", () => {
    render(
      <HistoryTab
        pastRuns={[BASE_RUN]}
        improvementRecommendations={[makeRec({ id: "rec-1" })]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    const cards = getRecommendationCards()
    expect(cards.length).toBe(1)

    const card = cards[0] as HTMLElement
    // Verdict text visible immediately
    expect(within(card).getByText("Writer has a better variant")).toBeTruthy()
    // Evidence visible
    expect(
      within(card).getByText("4 runs · 100% clear vs 50% · 0.0 retries vs 1.5"),
    ).toBeTruthy()
    // Confidence badge
    expect(within(card).getByText("High confidence")).toBeTruthy()
    // No disclosure toggle for <= 2 items
    expect(
      screen.queryByRole("button", { name: /improvement suggestions/i }),
    ).toBeNull()
  })

  it("renders two recommendations directly without disclosure", () => {
    render(
      <HistoryTab
        pastRuns={[BASE_RUN]}
        improvementRecommendations={[
          makeRec({ id: "rec-1" }),
          makeRec({
            id: "rec-2",
            kind: "stabilize_step",
            nodeLabel: "Reviewer",
            evidence: "3 runs · 33% success",
            confidence: "medium",
            supportingRunCount: 3,
            metrics: { candidateSuccessRate: 0.33 },
          }),
        ]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    const cards = getRecommendationCards()
    expect(cards.length).toBe(2)

    expect(
      within(cards[0] as HTMLElement).getByText("Writer has a better variant"),
    ).toBeTruthy()
    expect(
      within(cards[1] as HTMLElement).getByText(/Reviewer needs attention/),
    ).toBeTruthy()
    // No disclosure toggle
    expect(
      screen.queryByRole("button", { name: /improvement suggestions/i }),
    ).toBeNull()
  })

  it("wraps more than two recommendations in a disclosure", async () => {
    const user = userEvent.setup()

    render(
      <HistoryTab
        pastRuns={[BASE_RUN]}
        improvementRecommendations={[
          makeRec({ id: "rec-1" }),
          makeRec({ id: "rec-2", nodeLabel: "Reviewer" }),
          makeRec({ id: "rec-3", nodeLabel: "Formatter" }),
        ]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    // Disclosure toggle should exist
    const toggle = screen.getByRole("button", {
      name: /improvement suggestions \(3\)/i,
    })
    expect(toggle).toBeTruthy()

    // Content should not be visible yet (unmountWhenClosed)
    expect(getRecommendationCards().length).toBe(0)

    await user.click(toggle)

    // After expanding, all three recommendation cards visible
    expect(getRecommendationCards().length).toBe(3)
  })

  it("formats prefer_variant verdict with metrics", () => {
    render(
      <HistoryTab
        pastRuns={[BASE_RUN]}
        improvementRecommendations={[
          makeRec({
            id: "rec-1",
            kind: "prefer_variant",
            nodeLabel: "Writer",
            metrics: {
              candidateSuccessRate: 0.8,
              comparisonSuccessRate: 0.6,
            },
          }),
        ]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    const card = getRecommendationCards()[0] as HTMLElement
    expect(
      within(card).getByText(
        "Writer has a better variant — succeeds 80% vs 60%",
      ),
    ).toBeTruthy()
    expect(within(card).getByText("Better variant")).toBeTruthy()
  })

  it("formats stabilize_step verdict with metrics", () => {
    render(
      <HistoryTab
        pastRuns={[BASE_RUN]}
        improvementRecommendations={[
          makeRec({
            id: "rec-1",
            kind: "stabilize_step",
            nodeLabel: "QA",
            supportingRunCount: 5,
            confidence: "medium",
            metrics: { candidateSuccessRate: 0.4 },
          }),
        ]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    const card = getRecommendationCards()[0] as HTMLElement
    expect(
      within(card).getByText(
        "QA needs attention — 40% success rate across 5 runs",
      ),
    ).toBeTruthy()
    expect(within(card).getByText("Needs attention")).toBeTruthy()
    expect(within(card).getByText("Medium confidence")).toBeTruthy()
  })

  it("formats reduce_manual_edits verdict with metrics", () => {
    render(
      <HistoryTab
        pastRuns={[BASE_RUN]}
        improvementRecommendations={[
          makeRec({
            id: "rec-1",
            kind: "reduce_manual_edits",
            nodeLabel: "Review gate",
            supportingRunCount: 5,
            metrics: { editRate: 0.6 },
          }),
        ]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    const card = getRecommendationCards()[0] as HTMLElement
    expect(
      within(card).getByText(
        "Approval at Review gate keeps getting rewritten — 60% of runs edited",
      ),
    ).toBeTruthy()
    expect(within(card).getByText("Frequent edits")).toBeTruthy()
  })

  it("shows run count in meta line", () => {
    render(
      <HistoryTab
        pastRuns={[BASE_RUN]}
        improvementRecommendations={[
          makeRec({ id: "rec-1", supportingRunCount: 7 }),
        ]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    const card = getRecommendationCards()[0] as HTMLElement
    expect(within(card).getByText("7 runs analyzed")).toBeTruthy()
  })
})
