import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listProjectCaseStates, upsertCaseState } from "./case-store"

describe("case-store", () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "case-store-project-"))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("persists and lists durable case state", async () => {
    const saved = await upsertCaseState({
      projectPath: projectDir,
      caseId: "case:delivery-foundation:abc123",
      workLabel: "Seller photo upload",
      caseLabel: "Seller photo upload",
      factoryId: "pack:delivery-pack",
      factoryLabel: "Delivery Factory",
      workflowPath: join(projectDir, ".c8c", "review.chain"),
      workflowName: "Review seller photo upload",
      continuationStatus: "ready",
      nextStepLabel: "Ship approved work",
      artifactIds: ["artifact-1", "artifact-2"],
      lastGate: {
        family: "approval",
        outcome: "passed",
        summaryText: "Approval recorded. Ship can continue.",
        reasonText: "The latest approval decision was recorded.",
        stepLabel: "Ship",
        happenedAt: 10,
      },
      updatedAt: 20,
    })

    expect(saved).toMatchObject({
      caseId: "case:delivery-foundation:abc123",
      workLabel: "Seller photo upload",
      continuationStatus: "ready",
      nextStepLabel: "Ship approved work",
    })

    const listed = await listProjectCaseStates(projectDir)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      caseId: "case:delivery-foundation:abc123",
      artifactIds: ["artifact-1", "artifact-2"],
      lastGate: {
        outcome: "passed",
        summaryText: "Approval recorded. Ship can continue.",
      },
    })
  })

  it("merges artifact ids and preserves createdAt on upsert", async () => {
    const first = await upsertCaseState({
      projectPath: projectDir,
      caseId: "case:delivery-foundation:merge",
      workLabel: "Checkout polish",
      artifactIds: ["artifact-1"],
      continuationStatus: "completed",
      updatedAt: 30,
    })

    const second = await upsertCaseState({
      projectPath: projectDir,
      caseId: "case:delivery-foundation:merge",
      artifactIds: ["artifact-2", "artifact-1"],
      continuationStatus: "ready",
      updatedAt: 40,
    })

    expect(second.createdAt).toBe(first.createdAt)
    expect(second.artifactIds).toEqual(["artifact-2", "artifact-1"])
    expect(second.continuationStatus).toBe("ready")
  })

  it("keeps only the newest durable state when legacy duplicate files exist", async () => {
    const latest = await upsertCaseState({
      projectPath: projectDir,
      caseId: "case:delivery-foundation:checkout-polish",
      workLabel: "Checkout polish",
      caseLabel: "Checkout polish",
      continuationStatus: "blocked_by_check",
      artifactIds: ["artifact-1"],
      lastGate: {
        family: "approval",
        outcome: "rejected",
        summaryText: "Verification was rejected and is blocked.",
        reasonText: "A reviewer rejected the verification result.",
        stepLabel: "Verify",
        happenedAt: 40,
      },
      updatedAt: 40,
    })

    await mkdir(join(projectDir, ".c8c", "case-state"), { recursive: true })
    await writeFile(
      join(projectDir, ".c8c", "case-state", "legacy-duplicate.json"),
      JSON.stringify(
        {
          ...latest,
          continuationStatus: "awaiting_approval",
          lastGate: {
            family: "approval",
            outcome: "awaiting_human",
            summaryText:
              "Approval pending. Review block before verification continues.",
            reasonText:
              "Waiting for an approval decision before the flow can continue.",
            stepLabel: "Verify",
            happenedAt: 20,
          },
          updatedAt: 20,
        },
        null,
        2,
      ),
    )

    const listed = await listProjectCaseStates(projectDir)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      caseId: "case:delivery-foundation:checkout-polish",
      continuationStatus: "blocked_by_check",
      lastGate: {
        outcome: "rejected",
        summaryText: "Verification was rejected and is blocked.",
      },
    })
  })

  it("skips invalid case state records during list reads", async () => {
    await mkdir(join(projectDir, ".c8c", "case-state"), { recursive: true })
    await writeFile(
      join(projectDir, ".c8c", "case-state", "invalid.json"),
      JSON.stringify(
        {
          version: 1,
          caseId: "case:invalid",
          projectPath: "/wrong/project",
          workLabel: "Broken record",
          continuationStatus: "made_up_status",
          artifactIds: ["artifact-1"],
          lastGate: null,
          createdAt: 10,
          updatedAt: 20,
        },
        null,
        2,
      ),
    )

    const listed = await listProjectCaseStates(projectDir)
    expect(listed).toEqual([])
  })
})
