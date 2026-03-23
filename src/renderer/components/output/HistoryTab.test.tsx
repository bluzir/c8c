// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HistoryTab } from "./HistoryTab"

describe("HistoryTab", () => {
  it("shows learned recommendations above the run list", () => {
    render(
      <HistoryTab
        pastRuns={[
          {
            runId: "run-1",
            status: "completed",
            workflowName: "Audit flow",
            workflowPath: "/tmp/audit-flow.yaml",
            startedAt: Date.now() - 5_000,
            completedAt: Date.now() - 1_000,
            reportPath: "/tmp/report.md",
            workspace: "/tmp/workspace",
            totalCost: 0.22,
            durationMs: 4_000,
          },
        ]}
        improvementRecommendations={[
          {
            id: "rec-1",
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
            candidate: {
              modelId: "sonnet",
              promptHash: "abcd1234",
            },
            baseline: {
              modelId: "sonnet",
              promptHash: "efgh5678",
            },
          },
        ]}
        runStatus="idle"
        onOpenReport={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )

    expect(screen.getByText("Learned from recent runs")).toBeTruthy()
    expect(
      screen.getByText("Writer has a stronger variant in recent runs."),
    ).toBeTruthy()
    expect(
      screen.getByText("4 runs · 100% clear vs 50% · 0.0 retries vs 1.5"),
    ).toBeTruthy()
  })
})
