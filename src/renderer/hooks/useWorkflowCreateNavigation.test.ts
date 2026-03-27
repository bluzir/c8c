import { describe, expect, it, vi } from "vitest"
import type { ArtifactRecord, InputAttachment } from "@shared/types"
import { applyWorkflowCreateNavigationState } from "./useWorkflowCreateNavigation"

describe("useWorkflowCreateNavigation helpers", () => {
  it("clears review state before opening workflow create", () => {
    const sourceArtifacts = [{ id: "artifact-1" } as ArtifactRecord]
    const sourceAttachments: InputAttachment[] = [
      { kind: "text", label: "Source", content: "result" },
    ]
    const setMainView = vi.fn()
    const setViewMode = vi.fn()
    const setSelectedWorkflowPath = vi.fn()
    const setSelectedResultModeId = vi.fn()
    const setWorkflowCreateContext = vi.fn()
    const setWorkflowCreateDraftPrompt = vi.fn()
    const setWorkflowCreateSourceArtifacts = vi.fn()
    const setWorkflowCreateSourceAttachments = vi.fn()
    const setWorkflowEntryState = vi.fn()
    const clearReviewState = vi.fn()
    const clearRoutingProgress = vi.fn()

    applyWorkflowCreateNavigationState({
      options: {
        prompt: "polish the draft",
        modeId: "builder",
        sourceArtifacts,
        initialAttachments: sourceAttachments,
      },
      selectedProject: "/tmp/project",
      setMainView,
      setViewMode,
      setSelectedWorkflowPath,
      setSelectedResultModeId,
      setWorkflowCreateContext,
      setWorkflowCreateDraftPrompt,
      setWorkflowCreateSourceArtifacts,
      setWorkflowCreateSourceAttachments,
      setWorkflowEntryState,
      clearReviewState,
      clearRoutingProgress,
    })

    expect(setSelectedResultModeId).toHaveBeenCalledWith("builder")
    expect(setWorkflowCreateContext).toHaveBeenCalledWith({
      projectPath: "/tmp/project",
      locked: false,
    })
    expect(setWorkflowCreateDraftPrompt).toHaveBeenCalledWith(
      "polish the draft",
    )
    expect(setWorkflowCreateSourceArtifacts).toHaveBeenCalledWith(
      sourceArtifacts,
    )
    expect(setWorkflowCreateSourceAttachments).toHaveBeenCalledWith(
      sourceAttachments,
    )
    expect(clearReviewState).toHaveBeenCalledTimes(1)
    expect(clearRoutingProgress).toHaveBeenCalledTimes(1)
    expect(setMainView).toHaveBeenCalledWith("thread")
    expect(setViewMode).toHaveBeenCalledWith("chat")
    expect(clearReviewState.mock.invocationCallOrder[0]).toBeLessThan(
      setMainView.mock.invocationCallOrder[0],
    )
  })

  it("respects explicit project selection and lock state", () => {
    const setMainView = vi.fn()
    const setViewMode = vi.fn()
    const setSelectedWorkflowPath = vi.fn()
    const setSelectedResultModeId = vi.fn()
    const setWorkflowCreateContext = vi.fn()
    const setWorkflowCreateDraftPrompt = vi.fn()
    const setWorkflowCreateSourceArtifacts = vi.fn()
    const setWorkflowCreateSourceAttachments = vi.fn()
    const setWorkflowEntryState = vi.fn()
    const clearReviewState = vi.fn()
    const clearRoutingProgress = vi.fn()

    applyWorkflowCreateNavigationState({
      options: {
        projectPath: "/tmp/locked",
        locked: true,
      },
      selectedProject: "/tmp/project",
      setMainView,
      setViewMode,
      setSelectedWorkflowPath,
      setSelectedResultModeId,
      setWorkflowCreateContext,
      setWorkflowCreateDraftPrompt,
      setWorkflowCreateSourceArtifacts,
      setWorkflowCreateSourceAttachments,
      setWorkflowEntryState,
      clearReviewState,
      clearRoutingProgress,
    })

    expect(setSelectedResultModeId).not.toHaveBeenCalled()
    expect(setWorkflowCreateContext).toHaveBeenCalledWith({
      projectPath: "/tmp/locked",
      locked: true,
    })
    expect(setWorkflowCreateDraftPrompt).toHaveBeenCalledWith("")
    expect(setWorkflowCreateSourceArtifacts).toHaveBeenCalledWith([])
    expect(setWorkflowCreateSourceAttachments).toHaveBeenCalledWith([])
    expect(clearReviewState).toHaveBeenCalledTimes(1)
    expect(clearRoutingProgress).toHaveBeenCalledTimes(1)
    expect(setMainView).toHaveBeenCalledWith("thread")
    expect(setViewMode).toHaveBeenCalledWith("chat")
  })
})
