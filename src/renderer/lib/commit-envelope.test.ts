import { createStore } from "jotai"
import { describe, it, expect } from "vitest"
import { commitEnvelopeAtom } from "./commit-envelope"
import {
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  currentWorkflowAtom,
  inputValueAtom,
  inputAttachmentsAtom,
  mainViewAtom,
  chatRoutingProgressAtom,
  viewModeAtom,
  workflowEntryStateAtom,
  workflowQueuedAutoRunPathAtom,
  workflowCreateDraftPromptAtom,
  workflowCreateSourceArtifactsAtom,
  workflowCreateSourceAttachmentsAtom,
  workflowCreatePromptScaffoldAtom,
  workflowSavedSnapshotAtom,
} from "./store"
import type {
  Workflow,
  RunEnvelope,
  WorkflowEntryState,
  WorkflowTemplateRunContext,
  ChatRunHistory,
} from "@shared/types"
import { selectedChatIdAtom } from "./chat-atoms"
import { EMPTY_WORKFLOW_CREATE_SCAFFOLD } from "./workflow-create-prompt"
import { workflowSnapshot } from "./workflow-snapshot"

function buildMockWorkflow(): Workflow {
  return {
    version: 1,
    name: "Post Drafter",
    nodes: [],
    edges: [],
    defaults: {
      model: "sonnet",
      maxTurns: 40,
      timeout_minutes: 30,
      maxParallel: 4,
    },
  }
}

function buildMockEntryState(workflowPath: string): WorkflowEntryState {
  return {
    workflowPath,
    workflowName: "Post Drafter",
    source: "template",
    title: "Draft posts",
    summary: "Drafts social media posts.",
    contractLabel: "Requested result",
    contractText: "Draft posts",
    inputText: "Trend digest content.",
    outputText: "Drafted posts.",
    readinessText: "Ready to run with 1 working step.",
  }
}

function buildMockTemplateContext(
  workflowPath: string,
): WorkflowTemplateRunContext {
  return {
    templateId: "content-post-drafter",
    templateName: "Post Drafter",
    workflowPath,
    workflowName: "Post Drafter",
    source: "template",
  }
}

function buildMockEnvelope(
  overrides: Partial<RunEnvelope> = {},
): RunEnvelope {
  const workflowPath = "/tmp/project/post-drafter.chain"
  return {
    intent: {
      type: "follow_up",
      projectPath: "/tmp/project",
      requestedResult: "Draft posts",
    },
    workflow: buildMockWorkflow(),
    workflowPath,
    input: { type: "text", value: "Trend digest content here..." },
    resolvedArtifacts: [],
    attachments: [
      { kind: "file", path: "artifacts/trend.md", name: "Trend Digest" },
    ],
    entryState: buildMockEntryState(workflowPath),
    templateContext: buildMockTemplateContext(workflowPath),
    routeResult: null,
    autoRun: false,
    contractWarnings: [],
    ...overrides,
  }
}

describe("commitEnvelopeAtom", () => {
  it("sets all atoms from envelope in one transaction", () => {
    const store = createStore()
    const envelope = buildMockEnvelope()

    store.set(commitEnvelopeAtom, envelope)

    expect(store.get(selectedProjectAtom)).toBe("/tmp/project")
    expect(store.get(selectedWorkflowPathAtom)).toBe(
      "/tmp/project/post-drafter.chain",
    )
    expect(store.get(currentWorkflowAtom)).toEqual(envelope.workflow)
    expect(store.get(workflowSavedSnapshotAtom)).toBe(
      workflowSnapshot(envelope.workflow),
    )
    expect(store.get(inputValueAtom)).toBe("Trend digest content here...")
    expect(store.get(inputAttachmentsAtom)).toEqual(envelope.attachments)
    expect(store.get(mainViewAtom)).toBe("thread")
    expect(store.get(viewModeAtom)).toBe("chat")
    expect(store.get(chatRoutingProgressAtom)).toBeNull()
    expect(store.get(workflowEntryStateAtom)).toEqual(envelope.entryState)
  })

  it("clears routing progress even when it was previously set", () => {
    const store = createStore()
    store.set(chatRoutingProgressAtom, {
      phase: "inspecting",
      userRequest: "test",
    })

    store.set(commitEnvelopeAtom, buildMockEnvelope())

    expect(store.get(chatRoutingProgressAtom)).toBeNull()
  })

  it("sets autoRun path when autoRun is true", () => {
    const store = createStore()
    const envelope = buildMockEnvelope({ autoRun: true })

    store.set(commitEnvelopeAtom, envelope)

    expect(store.get(workflowQueuedAutoRunPathAtom)).toBe(
      "/tmp/project/post-drafter.chain",
    )
  })

  it("does not set autoRun path when autoRun is false", () => {
    const store = createStore()
    const envelope = buildMockEnvelope({ autoRun: false })

    store.set(commitEnvelopeAtom, envelope)

    expect(store.get(workflowQueuedAutoRunPathAtom)).toBeNull()
  })

  it("clears create-surface state", () => {
    const store = createStore()

    // Pre-populate create surface state
    store.set(workflowCreateDraftPromptAtom, "some draft prompt")
    store.set(workflowCreateSourceArtifactsAtom, [
      {
        id: "artifact-1",
        kind: "findings",
        title: "Test artifact",
        relativePath: "artifacts/test.md",
        contentPath:
          "/tmp/project/workspaces/run-1/artifacts/test.md",
        metadataPath:
          "/tmp/project/workspaces/run-1/artifacts/test.md.meta.json",
        projectPath: "/tmp/project",
        workspace: "/tmp/project/workspaces/run-1",
        runId: "run-1",
        workflowPath: "/tmp/project/test.chain",
        workflowName: "Test",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ])

    store.set(commitEnvelopeAtom, buildMockEnvelope())

    expect(store.get(workflowCreateDraftPromptAtom)).toBe("")
    expect(store.get(workflowCreateSourceArtifactsAtom)).toEqual([])
    expect(store.get(workflowCreateSourceAttachmentsAtom)).toEqual([])
    expect(store.get(workflowCreatePromptScaffoldAtom)).toEqual(
      EMPTY_WORKFLOW_CREATE_SCAFFOLD,
    )
  })

  it("sets selectedChatIdAtom from envelope.chatId", () => {
    const store = createStore()
    const envelope = buildMockEnvelope({ chatId: "chat-123" })
    store.set(commitEnvelopeAtom, envelope)
    expect(store.get(selectedChatIdAtom)).toBe("chat-123")
  })

  it("does not change selectedChatIdAtom when chatId is undefined", () => {
    const store = createStore()
    store.set(selectedChatIdAtom, "existing-chat")
    const envelope = buildMockEnvelope() // no chatId
    store.set(commitEnvelopeAtom, envelope)
    expect(store.get(selectedChatIdAtom)).toBe("existing-chat")
  })
})
