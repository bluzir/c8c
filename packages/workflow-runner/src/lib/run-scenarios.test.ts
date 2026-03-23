import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createResumeExecutionSession,
  createRerunExecutionSession,
} from "./run-session"
import {
  createBlockedApprovalScenario,
  createFailedFanOutScenario,
  createFailedLinearScenario,
  createPartialContinueScenario,
} from "./run-scenario-fixtures"
import {
  persistRunState,
  readWorkflowRunSnapshot,
  writeManifest,
  writeRunResultSnapshot,
} from "./run-state-store"

async function seedScenarioWorkspace(
  name: string,
  scenario: ReturnType<
    | typeof createFailedLinearScenario
    | typeof createFailedFanOutScenario
    | typeof createBlockedApprovalScenario
    | typeof createPartialContinueScenario
  >,
): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), `${name}-`))
  await persistRunState(
    workspace,
    scenario.nodeStates,
    scenario.runtimeWorkflow,
    scenario.input,
  )
  return workspace
}

describe("run-scenarios", () => {
  it("restarts only the failed linear tail from the failing node", async () => {
    const scenario = createFailedLinearScenario()
    const workspace = await seedScenarioWorkspace("failed-linear", scenario)

    const session = await createRerunExecutionSession({
      runId: "rerun-linear",
      workflow: scenario.workflow,
      workspace,
      fromNodeId: scenario.fromNodeId,
    })

    expect(session.nodeStates.input.status).toBe("completed")
    expect(session.nodeStates.analyze.status).toBe("completed")
    expect(session.nodeStates.plan.status).toBe("pending")
    expect(session.nodeStates.report.status).toBe("pending")
  })

  it("keeps completed fan-out siblings while reopening only the failed branch", async () => {
    const scenario = createFailedFanOutScenario()
    const workspace = await seedScenarioWorkspace("failed-fanout", scenario)

    const session = await createRerunExecutionSession({
      runId: "rerun-fanout",
      workflow: scenario.workflow,
      workspace,
      fromNodeId: scenario.fromNodeId,
    })

    expect(session.nodeStates["audit::security"].status).toBe("completed")
    expect(session.nodeStates["audit::quality"].status).toBe("pending")
    expect(session.nodeStates.merge.status).toBe("pending")
  })

  it("resumes a blocked approval from the approval node and reloads blocked snapshot metadata", async () => {
    const scenario = createBlockedApprovalScenario()
    const workspace = await seedScenarioWorkspace("blocked-approval", scenario)
    await writeManifest(workspace, {
      schemaVersion: 1,
      runId: "run-blocked",
      workflowName: scenario.workflow.name,
      workspace,
      startedAt: 1,
      updatedAt: 2,
      status: "blocked",
      mode: "run",
      blockedByTaskId: "approval-approve",
      lastBlockingNodeId: "approve",
    })
    await writeRunResultSnapshot(workspace, {
      runId: "run-blocked",
      status: "blocked",
      workflowName: scenario.workflow.name,
      workflowPath: "/tmp/approval.yaml",
      startedAt: 1,
      completedAt: 2,
      reportPath: "",
      workspace,
      totalCost: 1.25,
      totalTokensIn: 100,
      totalTokensOut: 200,
      evalScores: {},
      durationMs: 5000,
    })

    const session = await createResumeExecutionSession({
      runId: "continue-blocked",
      workflow: scenario.workflow,
      workspace,
    })
    const snapshot = await readWorkflowRunSnapshot(workspace)

    expect(session.nodeStates.input.status).toBe("completed")
    expect(session.nodeStates.draft.status).toBe("completed")
    expect(session.nodeStates.approve.status).toBe("pending")
    expect(session.nodeStates.publish.status).toBe("pending")
    expect(snapshot.manifest?.blockedByTaskId).toBe("approval-approve")
    expect(snapshot.manifest?.lastBlockingNodeId).toBe("approve")
    expect(snapshot.result?.status).toBe("blocked")
  })

  it("continues from the first unfinished node after partial completion", async () => {
    const scenario = createPartialContinueScenario()
    const workspace = await seedScenarioWorkspace("partial-continue", scenario)

    const session = await createResumeExecutionSession({
      runId: "continue-partial",
      workflow: scenario.workflow,
      workspace,
    })

    expect(session.nodeStates.input.status).toBe("completed")
    expect(session.nodeStates.audit.status).toBe("completed")
    expect(session.nodeStates.review.status).toBe("completed")
    expect(session.nodeStates.report.status).toBe("pending")
  })
})
