import { createHash } from "node:crypto"
import { mkdir, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { writeFileAtomic } from "./lib/atomic-write.js"

export type WorkflowHilTaskKind = "approval" | "form"
export type WorkflowHilTaskStatus =
  | "open"
  | "answered"
  | "rejected"
  | "timed_out"
  | "consumed"
export type WorkflowHilTaskResolution =
  | "approved"
  | "rejected"
  | "submitted"
  | "timed_out"

export interface WorkflowHilTaskTokenPayload {
  version: 1
  workspace: string
  taskId: string
}

export interface WorkflowHilTaskField {
  id: string
  type:
    | "text"
    | "textarea"
    | "number"
    | "boolean"
    | "select"
    | "multiselect"
    | "json"
  label: string
  description?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  min?: number
  max?: number
}

export interface WorkflowHilTaskRequest {
  version: 1
  kind: WorkflowHilTaskKind
  title: string
  instructions?: string
  summary?: string
  fields: WorkflowHilTaskField[]
  defaults?: Record<string, unknown>
  metadata?: {
    externalRef?: string
    generatedByNodeId?: string
    suggestedAssignee?: string
    priority?: "low" | "normal" | "high"
    allowEdit?: boolean
  }
}

export interface WorkflowHilTaskResponseData {
  approved?: boolean
  editedContent?: string
  answers?: Record<string, unknown>
}

export interface WorkflowHilTaskResponse {
  version: 1
  taskId: string
  resolution: WorkflowHilTaskResolution
  answers: Record<string, unknown>
  comment?: string
  metadata: {
    answeredAt: number
    answeredBy?: string
    revision: number
    idempotencyKey: string
    source: "cli" | "openclaw" | "runtime"
  }
}

export interface WorkflowHilTaskState {
  version: 1
  taskId: string
  chainId: string
  sourceRunId: string
  kind: WorkflowHilTaskKind
  checkpointKind: "approval" | "human"
  status: WorkflowHilTaskStatus
  resolution?: WorkflowHilTaskResolution
  workspace: string
  nodeId: string
  workflowName: string
  workflowPath?: string
  projectPath?: string
  title: string
  instructions?: string
  summary?: string
  allowEdit?: boolean
  requestHash: string
  responseRevision: number
  createdAt: number
  updatedAt: number
  consumedAt?: number
}

export interface WorkflowHilTaskRecord {
  task: string
  taskId: string
  request: WorkflowHilTaskRequest
  state: WorkflowHilTaskState
  latestResponse: WorkflowHilTaskResponse | null
}

export interface WorkflowHilTaskSummary {
  task: string
  taskId: string
  kind: WorkflowHilTaskKind
  status: WorkflowHilTaskStatus
  resolution?: WorkflowHilTaskResolution
  workspace: string
  chainId: string
  sourceRunId: string
  nodeId: string
  workflowName: string
  workflowPath?: string
  projectPath?: string
  title: string
  instructions?: string
  summary?: string
  allowEdit?: boolean
  createdAt: number
  updatedAt: number
  consumedAt?: number
}

export interface UpsertApprovalHilTaskRequest {
  workspace: string
  runId: string
  workflowName: string
  workflowPath?: string
  projectPath?: string
  nodeId: string
  title: string
  message?: string
  content?: string
  allowEdit: boolean
}

export interface UpsertHumanHilTaskRequest {
  workspace: string
  runId: string
  workflowName: string
  workflowPath?: string
  projectPath?: string
  nodeId: string
  taskId?: string
  request: WorkflowHilTaskRequest
}

export interface WriteWorkflowHilTaskResponseRequest {
  workspace: string
  taskId: string
  data: WorkflowHilTaskResponseData
  comment?: string
  resolution?: "rejected" | "timed_out"
  idempotencyKey?: string
  answeredBy?: string
  source?: WorkflowHilTaskResponse["metadata"]["source"]
  resolvedAt?: number
}

function sanitizeTaskSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, "_")
}

function hilTasksDir(workspace: string): string {
  return join(workspace, "human-tasks")
}

function hilTaskDir(workspace: string, taskId: string): string {
  return join(hilTasksDir(workspace), sanitizeTaskSegment(taskId))
}

function requestPath(workspace: string, taskId: string): string {
  return join(hilTaskDir(workspace, taskId), "request.json")
}

function statePath(workspace: string, taskId: string): string {
  return join(hilTaskDir(workspace, taskId), "state.json")
}

function latestResponsePath(workspace: string, taskId: string): string {
  return join(hilTaskDir(workspace, taskId), "latest-response.json")
}

function responsesDir(workspace: string, taskId: string): string {
  return join(hilTaskDir(workspace, taskId), "responses")
}

function approvalDecisionPath(workspace: string, nodeId: string): string {
  return join(
    workspace,
    "approvals",
    `${sanitizeTaskSegment(nodeId)}.decision.json`,
  )
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function summarizeContent(content: string | undefined): string | undefined {
  if (!content?.trim()) return undefined
  const normalized = content.replace(/\s+/g, " ").trim()
  if (normalized.length <= 240) return normalized
  return `${normalized.slice(0, 237)}...`
}

function hashTaskRequest(request: WorkflowHilTaskRequest): string {
  return createHash("sha1").update(JSON.stringify(request)).digest("hex")
}

function buildApprovalRequest(
  title: string,
  message: string | undefined,
  content: string | undefined,
  allowEdit: boolean,
  nodeId: string,
): WorkflowHilTaskRequest {
  return {
    version: 1,
    kind: "approval",
    title,
    instructions: message,
    summary: summarizeContent(content),
    fields: [
      {
        id: "approved",
        type: "boolean",
        label: "Approve changes",
        required: true,
      },
      ...(allowEdit
        ? [
            {
              id: "editedContent",
              type: "textarea" as const,
              label: "Edited content",
              description:
                "Optional edited content to use when approving this checkpoint.",
              required: false,
            },
          ]
        : []),
    ],
    defaults:
      allowEdit && content !== undefined
        ? { approved: true, editedContent: content }
        : { approved: true },
    metadata: {
      generatedByNodeId: nodeId,
      priority: "normal",
      allowEdit,
    },
  }
}

function buildTaskRef(workspace: string, taskId: string): string {
  return encodeWorkflowHilTaskRef({
    version: 1,
    workspace,
    taskId,
  })
}

function buildTaskRecord(
  workspace: string,
  taskId: string,
  request: WorkflowHilTaskRequest,
  state: WorkflowHilTaskState,
  latestResponse: WorkflowHilTaskResponse | null,
): WorkflowHilTaskRecord {
  return {
    task: buildTaskRef(workspace, taskId),
    taskId,
    request,
    state,
    latestResponse,
  }
}

function buildTaskSummary(
  record: WorkflowHilTaskRecord,
): WorkflowHilTaskSummary {
  return {
    task: record.task,
    taskId: record.taskId,
    kind: record.state.kind,
    status: record.state.status,
    resolution: record.state.resolution,
    workspace: record.state.workspace,
    chainId: record.state.chainId,
    sourceRunId: record.state.sourceRunId,
    nodeId: record.state.nodeId,
    workflowName: record.state.workflowName,
    workflowPath: record.state.workflowPath,
    projectPath: record.state.projectPath,
    title: record.state.title,
    instructions: record.state.instructions,
    summary: record.state.summary,
    allowEdit: record.state.allowEdit,
    createdAt: record.state.createdAt,
    updatedAt: record.state.updatedAt,
    consumedAt: record.state.consumedAt,
  }
}

export function approvalTaskId(nodeId: string): string {
  return `approval-${sanitizeTaskSegment(nodeId)}`
}

export function humanTaskId(nodeId: string): string {
  return `human-${sanitizeTaskSegment(nodeId)}`
}

export function encodeWorkflowHilTaskRef(
  payload: WorkflowHilTaskTokenPayload,
): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url")
}

export function decodeWorkflowHilTaskRef(
  task: string,
): WorkflowHilTaskTokenPayload {
  const raw = Buffer.from(task, "base64url").toString("utf-8")
  const parsed = JSON.parse(raw) as Partial<WorkflowHilTaskTokenPayload>

  if (
    parsed.version !== 1 ||
    typeof parsed.workspace !== "string" ||
    !parsed.workspace ||
    typeof parsed.taskId !== "string" ||
    !parsed.taskId
  ) {
    throw new Error("Invalid HIL task token")
  }

  return parsed as WorkflowHilTaskTokenPayload
}

export async function upsertApprovalHilTask(
  request: UpsertApprovalHilTaskRequest,
): Promise<WorkflowHilTaskRecord> {
  const taskId = approvalTaskId(request.nodeId)
  const taskDir = hilTaskDir(request.workspace, taskId)
  const now = Date.now()
  const existingState = await readJsonFile<WorkflowHilTaskState>(
    statePath(request.workspace, taskId),
  )
  const existingLatestResponse = await readJsonFile<WorkflowHilTaskResponse>(
    latestResponsePath(request.workspace, taskId),
  )
  const taskRequest = buildApprovalRequest(
    request.title,
    request.message,
    request.content,
    request.allowEdit,
    request.nodeId,
  )

  const taskState: WorkflowHilTaskState = {
    version: 1,
    taskId,
    chainId: request.workspace,
    sourceRunId: request.runId,
    kind: "approval",
    checkpointKind: "approval",
    status: "open",
    workspace: request.workspace,
    nodeId: request.nodeId,
    workflowName: request.workflowName,
    workflowPath: request.workflowPath,
    projectPath: request.projectPath,
    title: request.title,
    instructions: request.message,
    summary: summarizeContent(request.content),
    allowEdit: request.allowEdit,
    requestHash: hashTaskRequest(taskRequest),
    responseRevision: existingState?.responseRevision || 0,
    createdAt: existingState?.createdAt || now,
    updatedAt: now,
  }

  await mkdir(responsesDir(request.workspace, taskId), { recursive: true })
  await mkdir(taskDir, { recursive: true })
  await writeFileAtomic(
    requestPath(request.workspace, taskId),
    JSON.stringify(taskRequest, null, 2),
  )
  await writeFileAtomic(
    statePath(request.workspace, taskId),
    JSON.stringify(taskState, null, 2),
  )

  return buildTaskRecord(
    request.workspace,
    taskId,
    taskRequest,
    taskState,
    existingLatestResponse,
  )
}

export async function upsertHumanHilTask(
  request: UpsertHumanHilTaskRequest,
): Promise<WorkflowHilTaskRecord> {
  const taskId = request.taskId || humanTaskId(request.nodeId)
  const taskDir = hilTaskDir(request.workspace, taskId)
  const now = Date.now()
  const existingState = await readJsonFile<WorkflowHilTaskState>(
    statePath(request.workspace, taskId),
  )
  const existingLatestResponse = await readJsonFile<WorkflowHilTaskResponse>(
    latestResponsePath(request.workspace, taskId),
  )
  const taskRequest = request.request
  const taskState: WorkflowHilTaskState = {
    version: 1,
    taskId,
    chainId: request.workspace,
    sourceRunId: request.runId,
    kind: taskRequest.kind,
    checkpointKind: "human",
    status: existingState?.status === "consumed" ? "consumed" : "open",
    workspace: request.workspace,
    nodeId: request.nodeId,
    workflowName: request.workflowName,
    workflowPath: request.workflowPath,
    projectPath: request.projectPath,
    title: taskRequest.title,
    instructions: taskRequest.instructions,
    summary: taskRequest.summary,
    allowEdit: taskRequest.metadata?.allowEdit,
    requestHash: hashTaskRequest(taskRequest),
    responseRevision: existingState?.responseRevision || 0,
    createdAt: existingState?.createdAt || now,
    updatedAt: now,
    consumedAt: existingState?.consumedAt,
    resolution: existingState?.resolution,
  }

  await mkdir(responsesDir(request.workspace, taskId), { recursive: true })
  await mkdir(taskDir, { recursive: true })
  await writeFileAtomic(
    requestPath(request.workspace, taskId),
    JSON.stringify(taskRequest, null, 2),
  )
  await writeFileAtomic(
    statePath(request.workspace, taskId),
    JSON.stringify(taskState, null, 2),
  )

  return buildTaskRecord(
    request.workspace,
    taskId,
    taskRequest,
    taskState,
    existingLatestResponse,
  )
}

export async function getWorkflowHilTask(
  workspace: string,
  taskId: string,
): Promise<WorkflowHilTaskRecord | null> {
  const [request, state, latestResponse] = await Promise.all([
    readJsonFile<WorkflowHilTaskRequest>(requestPath(workspace, taskId)),
    readJsonFile<WorkflowHilTaskState>(statePath(workspace, taskId)),
    readJsonFile<WorkflowHilTaskResponse>(
      latestResponsePath(workspace, taskId),
    ),
  ])

  if (!request || !state) return null
  return buildTaskRecord(workspace, taskId, request, state, latestResponse)
}

export async function getWorkflowHilTaskByRef(
  task: string,
): Promise<WorkflowHilTaskRecord | null> {
  const payload = decodeWorkflowHilTaskRef(task)
  return getWorkflowHilTask(payload.workspace, payload.taskId)
}

function validateApprovalResponseInput(
  state: WorkflowHilTaskState,
  data: WorkflowHilTaskResponseData,
): { approved: boolean; editedContent?: string } {
  if (typeof data.approved !== "boolean") {
    throw new Error("approval task response requires boolean data.approved")
  }
  if (data.editedContent !== undefined) {
    if (!state.allowEdit) {
      throw new Error("editedContent is not allowed for this approval task")
    }
    if (typeof data.editedContent !== "string") {
      throw new Error("approval task data.editedContent must be a string")
    }
  }

  return {
    approved: data.approved,
    editedContent: data.editedContent,
  }
}

function normalizeTaskResponse(
  existing: WorkflowHilTaskRecord,
  data: WorkflowHilTaskResponseData,
  resolutionOverride?: "rejected" | "timed_out",
): {
  resolution: WorkflowHilTaskResolution
  answers: Record<string, unknown>
  nextStatus: WorkflowHilTaskStatus
} {
  if (existing.state.checkpointKind === "approval") {
    const normalized = validateApprovalResponseInput(existing.state, data)
    return {
      resolution: normalized.approved ? "approved" : "rejected",
      answers: {
        approved: normalized.approved,
        ...(normalized.editedContent !== undefined
          ? { editedContent: normalized.editedContent }
          : {}),
      },
      nextStatus: normalized.approved ? "answered" : "rejected",
    }
  }

  if (resolutionOverride === "rejected") {
    return {
      resolution: "rejected",
      answers:
        data.answers &&
        typeof data.answers === "object" &&
        !Array.isArray(data.answers)
          ? data.answers
          : {},
      nextStatus: "rejected",
    }
  }

  if (resolutionOverride === "timed_out") {
    return {
      resolution: "timed_out",
      answers:
        data.answers &&
        typeof data.answers === "object" &&
        !Array.isArray(data.answers)
          ? data.answers
          : {},
      nextStatus: "timed_out",
    }
  }

  if (existing.state.kind === "approval") {
    const normalized = validateApprovalResponseInput(existing.state, data)
    return {
      resolution: normalized.approved ? "submitted" : "rejected",
      answers: {
        approved: normalized.approved,
        ...(normalized.editedContent !== undefined
          ? { editedContent: normalized.editedContent }
          : {}),
      },
      nextStatus: normalized.approved ? "answered" : "rejected",
    }
  }

  const answers = data.answers
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("human task response requires object data.answers")
  }

  return {
    resolution: "submitted",
    answers,
    nextStatus: "answered",
  }
}

export async function writeWorkflowHilTaskResponse(
  request: WriteWorkflowHilTaskResponseRequest,
): Promise<WorkflowHilTaskRecord> {
  const existing = await getWorkflowHilTask(request.workspace, request.taskId)
  if (!existing) {
    throw new Error(`HIL task not found: ${request.taskId}`)
  }

  const normalized = normalizeTaskResponse(
    existing,
    request.data,
    request.resolution,
  )
  if (
    existing.latestResponse?.metadata.idempotencyKey &&
    request.idempotencyKey
  ) {
    if (
      existing.latestResponse.metadata.idempotencyKey === request.idempotencyKey
    ) {
      return existing
    }
  }

  const revision = existing.state.responseRevision + 1
  const answeredAt = request.resolvedAt || Date.now()
  const idempotencyKey = request.idempotencyKey || `hil-${answeredAt}`
  const response: WorkflowHilTaskResponse = {
    version: 1,
    taskId: existing.taskId,
    resolution: normalized.resolution,
    answers: normalized.answers,
    comment: request.comment,
    metadata: {
      answeredAt,
      answeredBy: request.answeredBy,
      revision,
      idempotencyKey,
      source: request.source || "cli",
    },
  }

  const nextState: WorkflowHilTaskState = {
    ...existing.state,
    status: normalized.nextStatus,
    resolution: normalized.resolution,
    updatedAt: answeredAt,
    responseRevision: revision,
  }

  await mkdir(responsesDir(request.workspace, request.taskId), {
    recursive: true,
  })
  const responseFileName = `${String(revision).padStart(4, "0")}.json`
  await writeFileAtomic(
    join(responsesDir(request.workspace, request.taskId), responseFileName),
    JSON.stringify(response, null, 2),
  )
  await writeFileAtomic(
    latestResponsePath(request.workspace, request.taskId),
    JSON.stringify(response, null, 2),
  )
  await writeFileAtomic(
    statePath(request.workspace, request.taskId),
    JSON.stringify(nextState, null, 2),
  )
  if (existing.state.checkpointKind === "approval") {
    await mkdir(join(request.workspace, "approvals"), { recursive: true })
    const approved = Boolean(normalized.answers.approved)
    const editedContent =
      typeof normalized.answers.editedContent === "string"
        ? normalized.answers.editedContent
        : undefined
    await writeFileAtomic(
      approvalDecisionPath(request.workspace, existing.state.nodeId),
      JSON.stringify(
        {
          approved,
          ...(editedContent !== undefined ? { editedContent } : {}),
        },
        null,
        2,
      ),
    )
  }

  return buildTaskRecord(
    request.workspace,
    request.taskId,
    existing.request,
    nextState,
    response,
  )
}

export async function markWorkflowHilTaskConsumed(
  workspace: string,
  taskId: string,
): Promise<WorkflowHilTaskRecord | null> {
  const existing = await getWorkflowHilTask(workspace, taskId)
  if (!existing) return null
  if (existing.state.status === "consumed") return existing
  const nextState: WorkflowHilTaskState = {
    ...existing.state,
    status: "consumed",
    updatedAt: Date.now(),
    consumedAt: Date.now(),
  }
  await writeFileAtomic(
    statePath(workspace, taskId),
    JSON.stringify(nextState, null, 2),
  )
  return buildTaskRecord(
    workspace,
    taskId,
    existing.request,
    nextState,
    existing.latestResponse,
  )
}

export async function resolveWorkflowHilTaskByRef(
  task: string,
  request: Omit<WriteWorkflowHilTaskResponseRequest, "workspace" | "taskId">,
): Promise<WorkflowHilTaskRecord> {
  const payload = decodeWorkflowHilTaskRef(task)
  return writeWorkflowHilTaskResponse({
    ...request,
    workspace: payload.workspace,
    taskId: payload.taskId,
  })
}

async function listRunWorkspaces(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
  } catch {
    return []
  }
}

async function listTaskIds(workspace: string): Promise<string[]> {
  try {
    const entries = await readdir(hilTasksDir(workspace), {
      withFileTypes: true,
    })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

export async function listWorkflowHilTasks(
  roots: string[],
  options: { includeResolved?: boolean } = {},
): Promise<WorkflowHilTaskSummary[]> {
  const summaries: WorkflowHilTaskSummary[] = []

  for (const root of roots) {
    const workspaces = await listRunWorkspaces(root)
    for (const workspace of workspaces) {
      const taskIds = await listTaskIds(workspace)
      for (const taskId of taskIds) {
        const record = await getWorkflowHilTask(workspace, taskId)
        if (!record) continue
        if (!options.includeResolved && record.state.status !== "open") continue
        summaries.push(buildTaskSummary(record))
      }
    }
  }

  return summaries.sort((left, right) => right.updatedAt - left.updatedAt)
}
