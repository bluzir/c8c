import { describe, expect, it } from "vitest"
import type { ArtifactRecord, HumanTaskSnapshot } from "@shared/types"
import {
  buildInitialHumanTaskAnswers,
  buildSubmitHumanTaskAnswers,
  deriveTaskCardContext,
  hasMissingRequiredTaskAnswers,
  sortHumanTasksByActivity,
  taskActivityAt,
  toContinuationRun,
} from "./task-ui"

function createTask(
  overrides: Partial<HumanTaskSnapshot> = {},
): HumanTaskSnapshot {
  return {
    task: "Review block",
    taskId: "approval-1",
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
    updatedAt: 10,
    responseRevision: 0,
    request: {
      version: 1,
      kind: "approval",
      title: "Ship approval",
      fields: [
        {
          id: "decision",
          type: "select",
          label: "Decision",
          required: true,
          options: [
            { value: "approve", label: "Approve" },
            { value: "reject", label: "Reject" },
          ],
        },
      ],
      defaults: {
        decision: "approve",
      },
    },
    latestResponse: null,
    ...overrides,
  }
}

function createArtifact(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    id: "artifact-1",
    kind: "verification_report",
    title: "Verification Report",
    projectPath: "/tmp/project",
    workspace: "/tmp/workspace",
    runId: "run-1",
    relativePath: ".c8c/artifacts/verification-report.md",
    contentPath: "/tmp/project/.c8c/artifacts/verification-report.md",
    metadataPath: "/tmp/project/.c8c/artifacts/verification-report.json",
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  }
}

describe("task-ui", () => {
  it("hydrates default answers from task defaults", () => {
    expect(buildInitialHumanTaskAnswers(createTask())).toEqual({
      decision: "approve",
    })
  })

  it("prefers latest response answers when present", () => {
    expect(
      buildInitialHumanTaskAnswers(
        createTask({
          latestResponse: {
            version: 1,
            taskId: "approval-1",
            resolution: "submitted",
            answers: { decision: "reject" },
            metadata: {
              answeredAt: 10,
              revision: 1,
              idempotencyKey: "task-1",
            },
          },
        }),
      ),
    ).toEqual({
      decision: "reject",
    })
  })

  it("marks approval submissions as approved for runtime continue flows", () => {
    expect(
      buildSubmitHumanTaskAnswers(createTask(), { comment: "looks good" }),
    ).toEqual({
      comment: "looks good",
      approved: true,
    })

    expect(
      buildSubmitHumanTaskAnswers(
        createTask({
          kind: "form",
          request: {
            version: 1,
            kind: "form",
            title: "Provide missing input",
            fields: [],
          },
        }),
        { answer: "42" },
      ),
    ).toEqual({
      answer: "42",
    })
  })

  it("detects missing required answers and maps continuation runs", () => {
    const task = createTask()

    expect(hasMissingRequiredTaskAnswers(task, {})).toBe(true)
    expect(hasMissingRequiredTaskAnswers(task, { decision: "approve" })).toBe(
      false,
    )
    expect(toContinuationRun(task)).toMatchObject({
      runId: "run-1",
      status: "blocked",
      workflowName: "Ship flow",
      workflowPath: "/tmp/project/ship.flow.yaml",
      workspace: "/tmp/workspace",
    })
  })

  it("derives durable task card context from blocked copy helpers", () => {
    expect(
      deriveTaskCardContext(
        createTask({
          summary: "Final release decision is still waiting on you.",
        }),
        {
          stageLabel: "Ship",
          latestArtifact: createArtifact(),
        },
      ),
    ).toEqual({
      statusText: "Blocked: awaiting your approval before Ship can continue.",
      detailText:
        "Latest result: Verification Report. · Final release decision is still waiting on you.",
    })
  })

  it("derives task activity from the latest update when available", () => {
    expect(
      taskActivityAt(
        createTask({
          createdAt: 5,
          updatedAt: 20,
        }),
      ),
    ).toBe(20)

    expect(
      taskActivityAt(
        createTask({
          createdAt: 7,
          updatedAt: 0,
        }),
      ),
    ).toBe(7)
  })

  it("sorts human tasks by recent activity instead of API order", () => {
    const tasks = [
      createTask({
        taskId: "task-older",
        createdAt: 10,
        updatedAt: 10,
      }),
      createTask({
        taskId: "task-newer",
        createdAt: 5,
        updatedAt: 30,
      }),
      createTask({
        taskId: "task-created-later",
        createdAt: 20,
        updatedAt: 20,
      }),
    ]

    expect(sortHumanTasksByActivity(tasks).map((task) => task.taskId)).toEqual([
      "task-newer",
      "task-created-later",
      "task-older",
    ])
  })
})
