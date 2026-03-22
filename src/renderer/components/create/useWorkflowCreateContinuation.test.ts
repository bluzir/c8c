import type { ArtifactRecord, CaseStateRecord, HumanTaskSummary } from "@shared/types"
import { describe, expect, it, vi } from "vitest"
import {
  readWorkflowCreateContinuationResources,
  startWorkflowCreateContinuationResourceLoad,
} from "./useWorkflowCreateContinuation"

function createArtifactRecord(id: string): ArtifactRecord {
  return { id } as ArtifactRecord
}

function createCaseStateRecord(caseId: string): CaseStateRecord {
  return { caseId } as CaseStateRecord
}

function createHumanTaskSummary(taskId: string): HumanTaskSummary {
  return { taskId } as HumanTaskSummary
}

describe("readWorkflowCreateContinuationResources", () => {
  it("returns all resources when every reader succeeds", async () => {
    const result = await readWorkflowCreateContinuationResources({
      projectPath: "/tmp/project",
      listProjectArtifacts: vi.fn().mockResolvedValue([createArtifactRecord("artifact-1")]),
      listProjectCaseStates: vi.fn().mockResolvedValue([createCaseStateRecord("case-1")]),
      listHumanTasks: vi.fn().mockResolvedValue([createHumanTaskSummary("task-1")]),
    })

    expect(result).toEqual({
      resources: {
        artifacts: [createArtifactRecord("artifact-1")],
        caseStates: [createCaseStateRecord("case-1")],
        humanTasks: [createHumanTaskSummary("task-1")],
      },
      error: null,
    })
  })

  it("keeps partial resources and returns a combined error when one reader fails", async () => {
    const result = await readWorkflowCreateContinuationResources({
      projectPath: "/tmp/project",
      listProjectArtifacts: vi.fn().mockResolvedValue([createArtifactRecord("artifact-1")]),
      listProjectCaseStates: vi.fn().mockRejectedValue(new Error("case states unavailable")),
      listHumanTasks: vi.fn().mockResolvedValue([createHumanTaskSummary("task-1")]),
    })

    expect(result.resources).toEqual({
      artifacts: [createArtifactRecord("artifact-1")],
      caseStates: [],
      humanTasks: [createHumanTaskSummary("task-1")],
    })
    expect(result.error).toBeInstanceOf(Error)
    expect((result.error as Error).message).toContain("case states unavailable")
  })
})

describe("startWorkflowCreateContinuationResourceLoad", () => {
  it("ignores stale responses after a newer request starts", async () => {
    let resolveFirst: ((value: {
      resources: {
        artifacts: ArtifactRecord[]
        caseStates: CaseStateRecord[]
        humanTasks: HumanTaskSummary[]
      }
      error: null
    }) => void) | null = null
    const requestIdRef = { current: 0 }
    const loaded: Array<{
      artifacts: ArtifactRecord[]
      caseStates: CaseStateRecord[]
      humanTasks: HumanTaskSummary[]
    }> = []
    const errors: unknown[] = []
    const loadingStates: boolean[] = []

    startWorkflowCreateContinuationResourceLoad({
      projectPath: "/tmp/project-a",
      requestIdRef,
      readResources: () => new Promise((resolve) => {
        resolveFirst = resolve
      }),
      onReset: vi.fn(),
      onLoaded: (resources) => loaded.push(resources),
      onError: (error) => errors.push(error),
      onLoadingChange: (loading) => loadingStates.push(loading),
    })

    startWorkflowCreateContinuationResourceLoad({
      projectPath: "/tmp/project-b",
      requestIdRef,
      readResources: async () => ({
        resources: { artifacts: [createArtifactRecord("fresh")], caseStates: [], humanTasks: [] },
        error: null,
      }),
      onReset: vi.fn(),
      onLoaded: (resources) => loaded.push(resources),
      onError: (error) => errors.push(error),
      onLoadingChange: (loading) => loadingStates.push(loading),
    })

    resolveFirst?.({
      resources: { artifacts: [createArtifactRecord("stale")], caseStates: [], humanTasks: [] },
      error: null,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(loaded).toEqual([{ artifacts: [createArtifactRecord("fresh")], caseStates: [], humanTasks: [] }])
    expect(errors).toEqual([])
    expect(loadingStates).toContain(true)
    expect(loadingStates.at(-1)).toBe(false)
  })
})
