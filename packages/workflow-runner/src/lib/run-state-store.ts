import { appendFile, open, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import type {
  NodeState,
  RunStatus,
  WorkflowEvent,
  WorkflowInput,
} from "../schema.js"
import type { RuntimeWorkflow } from "./runtime-graph.js"
import type { PersistedRunState } from "./persisted-run-state.js"
import { writeFileAtomic } from "./atomic-write.js"
import { runSerialTask } from "./serial-task.js"

const MAX_PERSISTED_EVENT_LOG_BYTES = 5 * 1024 * 1024

export interface PersistedRunManifest {
  schemaVersion: number
  runId: string
  workflowName: string
  workflowPath?: string
  workspace: string
  startedAt: number
  updatedAt: number
  status: RunStatus | "running"
  mode: "run" | "rerun" | "continue"
  chainId?: string
  blockedByTaskId?: string
  lastBlockingNodeId?: string
}

export interface PersistedRunResult {
  runId: string
  status: RunStatus | "running"
  workflowName: string
  workflowPath: string
  startedAt: number
  completedAt: number
  reportPath: string
  workspace: string
  totalCost: number
  totalTokensIn: number
  totalTokensOut: number
  evalScores: Record<string, number>
  durationMs: number
}

export interface WorkflowRunSnapshot {
  workspace: string
  manifest: PersistedRunManifest | null
  state: PersistedRunState | null
  result: PersistedRunResult | null
}

export function serializeNodeStates(
  nodeStates: Record<string, NodeState>,
): PersistedRunState["nodeStates"] {
  const serializableStates: PersistedRunState["nodeStates"] = {}
  for (const [id, state] of Object.entries(nodeStates)) {
    serializableStates[id] = {
      status: state.status,
      attempts: state.attempts,
      retriesUsed: state.retriesUsed,
      policyApplied: state.policyApplied,
      output: state.output,
      error: state.error,
      log: [],
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      metrics: state.metrics,
      errorKind: state.errorKind,
      meta: state.meta,
    }
  }
  return serializableStates
}

export function serializeHumanTasks(
  nodeStates: Record<string, NodeState>,
): PersistedRunState["humanTasks"] {
  const humanTasks: PersistedRunState["humanTasks"] = {}
  for (const [id, state] of Object.entries(nodeStates)) {
    if (state.humanTask) {
      humanTasks[id] = state.humanTask
    }
  }
  return humanTasks
}

function workspacePersistenceSerialKey(workspace: string): string {
  return `workflow-runner:persistence:${workspace}`
}

function decodeUtf8TailBuffer(buffer: Buffer): string {
  let start = 0
  while (start < buffer.length && (buffer[start] & 0b11000000) === 0b10000000) {
    start += 1
  }
  return buffer.subarray(start).toString("utf-8")
}

async function trimEventLogIfNeeded(workspace: string): Promise<void> {
  const eventsPath = join(workspace, "events.jsonl")
  const info = await stat(eventsPath)
  if (info.size <= MAX_PERSISTED_EVENT_LOG_BYTES) {
    return
  }

  const retainedBytes = Math.min(info.size, MAX_PERSISTED_EVENT_LOG_BYTES)
  const readOffset = Math.max(0, info.size - retainedBytes)
  const buffer = Buffer.alloc(retainedBytes)
  const handle = await open(eventsPath, "r")
  try {
    await handle.read(buffer, 0, retainedBytes, readOffset)
  } finally {
    await handle.close()
  }

  let retained = decodeUtf8TailBuffer(buffer)
  if (readOffset > 0) {
    const lineStart = retained.indexOf("\n")
    retained = lineStart >= 0 ? retained.slice(lineStart + 1) : ""
  }
  await writeFileAtomic(eventsPath, retained)
}

export async function persistRunState(
  workspace: string,
  nodeStates: Record<string, NodeState>,
  runtimeWorkflow: RuntimeWorkflow,
  input: WorkflowInput,
): Promise<void> {
  await runSerialTask(workspacePersistenceSerialKey(workspace), async () => {
    await writeFileAtomic(
      join(workspace, "run-state.json"),
      JSON.stringify(
        {
          nodeStates: serializeNodeStates(nodeStates),
          runtimeNodes: runtimeWorkflow.nodes,
          runtimeEdges: runtimeWorkflow.edges,
          runtimeMeta: runtimeWorkflow.runtimeMeta,
          input,
          humanTasks: serializeHumanTasks(nodeStates),
        },
        null,
        2,
      ),
    )
  })
}

export async function appendEventLog(
  workspace: string,
  event: WorkflowEvent,
): Promise<void> {
  await runSerialTask(workspacePersistenceSerialKey(workspace), async () => {
    await appendFile(
      join(workspace, "events.jsonl"),
      `${JSON.stringify(event)}\n`,
      "utf-8",
    )
    await trimEventLogIfNeeded(workspace)
  })
}

export async function writeManifest(
  workspace: string,
  manifest: PersistedRunManifest,
): Promise<void> {
  await runSerialTask(workspacePersistenceSerialKey(workspace), async () => {
    await writeFileAtomic(
      join(workspace, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    )
  })
}

export async function writeRunResultSnapshot(
  workspace: string,
  payload: PersistedRunResult,
): Promise<void> {
  await runSerialTask(workspacePersistenceSerialKey(workspace), async () => {
    const serialized = JSON.stringify(payload, null, 2)
    await writeFileAtomic(join(workspace, "result.json"), serialized)
    await writeFileAtomic(join(workspace, "run-result.json"), serialized)
  })
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

export async function readPersistedRunState(
  workspace: string,
): Promise<PersistedRunState | null> {
  return readJsonFile<PersistedRunState>(join(workspace, "run-state.json"))
}

export async function readWorkflowRunSnapshot(
  workspace: string,
): Promise<WorkflowRunSnapshot> {
  return {
    workspace,
    manifest: await readJsonFile<PersistedRunManifest>(
      join(workspace, "manifest.json"),
    ),
    state: await readPersistedRunState(workspace),
    result: await readJsonFile<PersistedRunResult>(
      join(workspace, "result.json"),
    ),
  }
}
