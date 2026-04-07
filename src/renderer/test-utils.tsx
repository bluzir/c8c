import React from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { Provider, createStore } from "jotai"
import { vi } from "vitest"
import type {
  WorkflowNode,
  NodeState,
  Workflow,
} from "@shared/types"
import type { CompleteContent } from "@/lib/flow-chat-types"

// ── renderWithStore ────────────────────────────────────

export function renderWithStore(
  ui: React.ReactElement,
  opts?: RenderOptions & { atomOverrides?: Array<[atom: any, value: any]> },
) {
  const store = createStore()
  for (const [atom, value] of opts?.atomOverrides ?? []) {
    store.set(atom, value)
  }
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return { ...render(ui, { wrapper: Wrapper, ...opts }), store }
}

// ── stubWindowApi ──────────────────────────────────────

export function stubWindowApi(overrides: Partial<typeof window.api> = {}) {
  const base = {
    readFileSlice: vi.fn().mockResolvedValue(""),
    openPath: vi.fn(),
    listProjectArtifacts: vi.fn().mockResolvedValue([]),
    loadWorkflow: vi
      .fn()
      .mockResolvedValue({ version: 1, name: "", nodes: [], edges: [] }),
    onWorkflowEvent: vi.fn().mockReturnValue(() => {}),
    onBatchEvent: vi.fn().mockReturnValue(() => {}),
    onRoutingEvent: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  }
  vi.stubGlobal("window", { ...window, api: base })
  return base
}

// ── Shared data factories ──────────────────────────────

export function makeSkillNode(
  id: string,
  skillRef?: string,
): WorkflowNode {
  return {
    id,
    type: "skill",
    position: { x: 0, y: 0 },
    config: { prompt: "Do something", ...(skillRef ? { skillRef } : {}) },
  } as unknown as WorkflowNode
}

export function makeInputNode(id: string): WorkflowNode {
  return {
    id,
    type: "input",
    position: { x: 0, y: 0 },
    config: {},
  } as unknown as WorkflowNode
}

export function makeOutputNode(id: string): WorkflowNode {
  return {
    id,
    type: "output",
    position: { x: 0, y: 0 },
    config: {},
  } as unknown as WorkflowNode
}

export function makeSplitterNode(id: string): WorkflowNode {
  return {
    id,
    type: "splitter",
    position: { x: 0, y: 0 },
    config: { strategy: "parallel", maxBranches: 5 },
  } as unknown as WorkflowNode
}

export function makeNode(
  id: string,
  type: WorkflowNode["type"],
  label?: string,
): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: { prompt: label ?? id },
  } as unknown as WorkflowNode
}

export function makeNodeState(
  overrides: Partial<NodeState> & Pick<NodeState, "status">,
): NodeState {
  return {
    attempts: 1,
    log: [],
    ...overrides,
  }
}

export function makeWorkflow(
  nodes?: WorkflowNode[],
  name?: string,
): Workflow {
  return {
    version: 1,
    name: name ?? "Test Flow",
    nodes: nodes ?? [],
    edges: [],
  } as unknown as Workflow
}

export function makeCompleteContent(
  overrides?: Partial<CompleteContent>,
): CompleteContent {
  return {
    summary: "Flow completed successfully.",
    findings: [],
    limitations: [],
    artifacts: [],
    followUps: [],
    metrics: { duration: "5s", cost: "$0.01" },
    runId: "run-1",
    tone: "success",
    ...overrides,
  }
}
