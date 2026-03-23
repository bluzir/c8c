import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, extname, join, resolve } from "node:path"
import type {
  WorkflowHilTaskRecord,
  WorkflowHilTaskSummary,
} from "@c8c/workflow-runner"

export interface TelegramBridgeConfig {
  botTokenEnv: string
  chatId: string
  allowedUserIds: string[]
  pollIntervalSec: number
  projectPaths: string[]
  statePath?: string
}

export interface TelegramBridgeState {
  version: 1
  lastUpdateId: number
  deliveredTasks: Record<string, string>
  updatedAt: number
}

export interface TelegramUser {
  id: number
}

export interface TelegramChat {
  id: number | string
}

export interface TelegramMessage {
  message_id: number
  text?: string
  chat: TelegramChat
  from?: TelegramUser
}

export interface TelegramCallbackQuery {
  id: string
  data?: string
  from: TelegramUser
  message?: TelegramMessage
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramApiClient {
  getUpdates(args: {
    offset?: number
    timeoutSec: number
  }): Promise<TelegramUpdate[]>
  sendMessage(args: {
    chatId: string | number
    text: string
    replyMarkup?: Record<string, unknown>
  }): Promise<{ messageId: number }>
  answerCallbackQuery(args: {
    callbackQueryId: string
    text?: string
    showAlert?: boolean
  }): Promise<void>
}

export interface TelegramBridgeIterationDeps {
  api: TelegramApiClient
  listTasks: () => Promise<WorkflowHilTaskSummary[]>
  getTaskByRef: (taskRef: string) => Promise<WorkflowHilTaskRecord | null>
  resolveTask: (
    taskRef: string,
    request: {
      data: Record<string, unknown>
      comment?: string
      idempotencyKey?: string
      answeredBy?: string
      source?: "cli"
    },
  ) => Promise<WorkflowHilTaskRecord>
  continueWorkspace?: (
    workspace: string,
  ) => Promise<{ status: string } | null | undefined>
  now?: () => number
}

const CALLBACK_PREFIX = "c8c:hil"
const DEFAULT_POLL_INTERVAL_SEC = 10
const EMPTY_STATE: TelegramBridgeState = {
  version: 1,
  lastUpdateId: 0,
  deliveredTasks: {},
  updatedAt: 0,
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
    )
    .map((entry) => entry.trim())
}

export function defaultTelegramBridgeStatePath(configPath: string): string {
  const resolved = resolve(configPath)
  const extension = extname(resolved)
  if (!extension) {
    return `${resolved}.state.json`
  }
  return `${resolved.slice(0, -extension.length)}.state.json`
}

export function parseTelegramBridgeConfig(
  raw: unknown,
  options: { configPath?: string } = {},
): TelegramBridgeConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Telegram bridge config must decode to an object")
  }

  const candidate = raw as Record<string, unknown>
  const botTokenEnv =
    typeof candidate.botTokenEnv === "string"
      ? candidate.botTokenEnv.trim()
      : ""
  const chatId =
    typeof candidate.chatId === "string" || typeof candidate.chatId === "number"
      ? String(candidate.chatId).trim()
      : ""
  const allowedUserIds = normalizeStringArray(candidate.allowedUserIds)
  const projectPaths = [
    ...new Set(
      normalizeStringArray(candidate.projectPaths).map((value) =>
        resolve(value),
      ),
    ),
  ]
  const pollIntervalRaw = candidate.pollIntervalSec
  const pollIntervalSec =
    typeof pollIntervalRaw === "number" && Number.isFinite(pollIntervalRaw)
      ? Math.max(1, Math.min(60, Math.round(pollIntervalRaw)))
      : DEFAULT_POLL_INTERVAL_SEC
  const statePath =
    typeof candidate.statePath === "string" && candidate.statePath.trim()
      ? resolve(candidate.statePath)
      : options.configPath
        ? defaultTelegramBridgeStatePath(options.configPath)
        : undefined

  if (!botTokenEnv) {
    throw new Error("Telegram bridge config requires botTokenEnv")
  }
  if (!chatId) {
    throw new Error("Telegram bridge config requires chatId")
  }
  if (allowedUserIds.length === 0) {
    throw new Error("Telegram bridge config requires allowedUserIds")
  }

  return {
    botTokenEnv,
    chatId,
    allowedUserIds,
    pollIntervalSec,
    projectPaths,
    statePath,
  }
}

export async function loadTelegramBridgeConfig(
  configPath: string,
): Promise<TelegramBridgeConfig> {
  const raw = await readFile(resolve(configPath), "utf-8")
  return parseTelegramBridgeConfig(JSON.parse(raw), { configPath })
}

export async function loadTelegramBridgeState(
  statePath: string,
): Promise<TelegramBridgeState> {
  try {
    const raw = await readFile(resolve(statePath), "utf-8")
    const parsed = JSON.parse(raw) as Partial<TelegramBridgeState>
    if (
      parsed.version !== 1 ||
      typeof parsed.lastUpdateId !== "number" ||
      !parsed.deliveredTasks ||
      typeof parsed.deliveredTasks !== "object"
    ) {
      return EMPTY_STATE
    }
    return {
      version: 1,
      lastUpdateId: parsed.lastUpdateId,
      deliveredTasks: Object.fromEntries(
        Object.entries(parsed.deliveredTasks).filter(
          ([key, value]) => key.trim().length > 0 && typeof value === "string",
        ),
      ),
      updatedAt:
        typeof parsed.updatedAt === "number" &&
        Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
    }
  } catch {
    return EMPTY_STATE
  }
}

export async function saveTelegramBridgeState(
  statePath: string,
  state: TelegramBridgeState,
): Promise<void> {
  const resolved = resolve(statePath)
  await mkdir(dirname(resolved), { recursive: true })
  await writeFile(resolved, `${JSON.stringify(state, null, 2)}\n`, "utf-8")
}

function taskDeliveryStamp(task: WorkflowHilTaskSummary): string {
  return `${task.updatedAt}:${task.status}:${task.resolution || "open"}`
}

function taskRefHash(taskRef: string): string {
  return createHash("sha1").update(taskRef).digest("hex").slice(0, 16)
}

export function buildTelegramTaskActionKey(
  action: "approve" | "reject",
  taskRef: string,
): string {
  return `${CALLBACK_PREFIX}:${action}:${taskRefHash(taskRef)}`
}

export function buildTelegramTaskMessage(task: WorkflowHilTaskSummary): string {
  const lines = [
    task.kind === "approval" ? "Approval needed" : "Human input needed",
    `${task.title}`,
    `Workflow: ${task.workflowName}`,
    `Task: ${task.taskId}`,
    `Workspace: ${task.workspace}`,
    task.instructions ? `Instructions: ${task.instructions}` : null,
    task.summary ? `Summary: ${task.summary}` : null,
  ]

  if (task.kind === "approval") {
    lines.push(`Approve: /approve ${task.taskId}`)
    lines.push(`Reject: /reject ${task.taskId}`)
    if (task.allowEdit) {
      lines.push(
        `Editable approval: /respond ${task.taskId} {"approved":true,"editedContent":"..."}`,
      )
    }
  } else {
    lines.push(`Respond: /respond ${task.taskId} {"answers":{"field":"value"}}`)
    lines.push(`Show fields: /show ${task.taskId}`)
  }

  return lines.filter(Boolean).join("\n")
}

function buildTelegramTaskKeyboard(task: WorkflowHilTaskSummary) {
  if (task.kind !== "approval") return undefined
  return {
    inline_keyboard: [
      [
        {
          text: "Approve",
          callback_data: buildTelegramTaskActionKey("approve", task.task),
        },
        {
          text: "Reject",
          callback_data: buildTelegramTaskActionKey("reject", task.task),
        },
      ],
    ],
  }
}

function parseTelegramCommand(text: string) {
  const trimmed = text.trim()
  const showMatch = trimmed.match(/^\/show(?:@\S+)?\s+(\S+)\s*$/)
  if (showMatch) {
    return { command: "show" as const, selector: showMatch[1] }
  }

  const approveMatch = trimmed.match(/^\/approve(?:@\S+)?\s+(\S+)\s*$/)
  if (approveMatch) {
    return { command: "approve" as const, selector: approveMatch[1] }
  }

  const rejectMatch = trimmed.match(/^\/reject(?:@\S+)?\s+(\S+)\s*$/)
  if (rejectMatch) {
    return { command: "reject" as const, selector: rejectMatch[1] }
  }

  const respondMatch = trimmed.match(
    /^\/respond(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/u,
  )
  if (respondMatch) {
    return {
      command: "respond" as const,
      selector: respondMatch[1],
      payload: respondMatch[2],
    }
  }

  if (/^\/tasks(?:@\S+)?\s*$/u.test(trimmed)) {
    return { command: "tasks" as const }
  }

  if (/^\/(?:start|help)(?:@\S+)?\s*$/u.test(trimmed)) {
    return { command: "help" as const }
  }

  return null
}

function helpText(): string {
  return [
    "c8c HIL bridge",
    "/tasks - list open tasks",
    "/show <taskId> - show task details",
    "/approve <taskId> - approve a task",
    "/reject <taskId> - reject a task",
    '/respond <taskId> {"answers":{"field":"value"}} - submit form data',
  ].join("\n")
}

function taskDetailsText(task: WorkflowHilTaskRecord): string {
  return [
    `${task.state.kind === "approval" ? "Approval" : "Human input"} task`,
    task.state.title,
    `Task: ${task.taskId}`,
    `Workflow: ${task.state.workflowName}`,
    `Workspace: ${task.state.workspace}`,
    task.state.instructions ? `Instructions: ${task.state.instructions}` : null,
    task.state.summary ? `Summary: ${task.state.summary}` : null,
    task.request.fields.length > 0
      ? `Fields: ${task.request.fields
          .map((field) => `${field.id}${field.required ? "*" : ""}`)
          .join(", ")}`
      : null,
    task.request.defaults
      ? `Defaults: ${JSON.stringify(task.request.defaults)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}

function listTasksText(tasks: WorkflowHilTaskSummary[]): string {
  if (tasks.length === 0) return "No open HIL tasks."
  return [
    "Open HIL tasks:",
    ...tasks.map(
      (task) =>
        `- ${task.taskId} (${task.kind}) ${task.title} [${task.workflowName}]`,
    ),
  ].join("\n")
}

async function resolveTaskBySelector(
  selector: string,
  tasks: WorkflowHilTaskSummary[],
  getTaskByRef: TelegramBridgeIterationDeps["getTaskByRef"],
): Promise<WorkflowHilTaskRecord | null> {
  try {
    const direct = await getTaskByRef(selector)
    if (direct) return direct
  } catch {
    // Fall through to taskId matching for chat-friendly selectors.
  }

  const matches = tasks.filter((task) => task.taskId === selector)
  if (matches.length === 1) {
    return getTaskByRef(matches[0].task)
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple open tasks match ${selector}. Use the full task token instead.`,
    )
  }
  return null
}

function findTaskByActionKey(
  callbackData: string,
  tasks: WorkflowHilTaskSummary[],
): { action: "approve" | "reject"; task: WorkflowHilTaskSummary | null } {
  const match = callbackData.match(/^c8c:hil:(approve|reject):([a-f0-9]{16})$/u)
  if (!match) {
    return { action: "approve", task: null }
  }
  const action = match[1] as "approve" | "reject"
  const expectedHash = match[2]
  return {
    action,
    task: tasks.find((task) => taskRefHash(task.task) === expectedHash) || null,
  }
}

function isAuthorizedUser(
  config: TelegramBridgeConfig,
  userId: number | undefined,
): boolean {
  if (!userId) return false
  return config.allowedUserIds.includes(String(userId))
}

function matchesConfiguredChat(
  config: TelegramBridgeConfig,
  chatId: string | number | undefined,
): boolean {
  if (chatId === undefined || chatId === null) return false
  return String(chatId) === config.chatId
}

async function resolveAndContinueTask(
  args: {
    task: WorkflowHilTaskSummary | WorkflowHilTaskRecord
    data: Record<string, unknown>
    comment?: string
    answeredBy?: string
  },
  deps: TelegramBridgeIterationDeps,
  updateId: number,
): Promise<string> {
  const taskId =
    "state" in args.task ? args.task.state.taskId : args.task.taskId
  const workspace =
    "state" in args.task ? args.task.state.workspace : args.task.workspace
  await deps.resolveTask(args.task.task, {
    data: args.data,
    comment: args.comment,
    idempotencyKey: `telegram-${updateId}-${taskId}`,
    answeredBy: args.answeredBy,
    source: "cli",
  })

  if (!deps.continueWorkspace) {
    return `Resolved ${taskId}.`
  }

  try {
    const continuation = await deps.continueWorkspace(workspace)
    if (!continuation) {
      return `Resolved ${taskId}.`
    }
    return `Resolved ${taskId}. Flow status: ${continuation.status}.`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `Resolved ${taskId}, but resume failed: ${message}`
  }
}

export async function runTelegramBridgeIteration(
  config: TelegramBridgeConfig,
  state: TelegramBridgeState,
  deps: TelegramBridgeIterationDeps,
): Promise<TelegramBridgeState> {
  const now = deps.now || Date.now
  const nextState: TelegramBridgeState = {
    version: 1,
    lastUpdateId: state.lastUpdateId,
    deliveredTasks: { ...state.deliveredTasks },
    updatedAt: now(),
  }

  const openTasks = await deps.listTasks()
  const openTaskRefs = new Set(openTasks.map((task) => task.task))

  for (const task of openTasks) {
    const stamp = taskDeliveryStamp(task)
    if (nextState.deliveredTasks[task.task] === stamp) continue
    await deps.api.sendMessage({
      chatId: config.chatId,
      text: buildTelegramTaskMessage(task),
      replyMarkup: buildTelegramTaskKeyboard(task),
    })
    nextState.deliveredTasks[task.task] = stamp
  }

  for (const taskRef of Object.keys(nextState.deliveredTasks)) {
    if (!openTaskRefs.has(taskRef)) {
      delete nextState.deliveredTasks[taskRef]
    }
  }

  const updates = await deps.api.getUpdates({
    offset: nextState.lastUpdateId > 0 ? nextState.lastUpdateId + 1 : undefined,
    timeoutSec: config.pollIntervalSec,
  })

  for (const update of updates) {
    nextState.lastUpdateId = Math.max(nextState.lastUpdateId, update.update_id)
    try {
      const callback = update.callback_query
      if (callback) {
        const chatId = callback.message?.chat.id
        if (!matchesConfiguredChat(config, chatId)) {
          continue
        }
        if (!isAuthorizedUser(config, callback.from.id)) {
          await deps.api.answerCallbackQuery({
            callbackQueryId: callback.id,
            text: "Not allowed",
            showAlert: true,
          })
          continue
        }
        const { action, task } = findTaskByActionKey(
          callback.data || "",
          openTasks,
        )
        if (!task) {
          await deps.api.answerCallbackQuery({
            callbackQueryId: callback.id,
            text: "Task is no longer open",
          })
          continue
        }
        const text = await resolveAndContinueTask(
          {
            task,
            data: { approved: action === "approve" },
            answeredBy: `telegram:${callback.from.id}`,
          },
          deps,
          update.update_id,
        )
        await deps.api.answerCallbackQuery({
          callbackQueryId: callback.id,
          text,
        })
        await deps.api.sendMessage({
          chatId: config.chatId,
          text,
        })
        delete nextState.deliveredTasks[task.task]
        continue
      }

      const message = update.message
      const text = message?.text?.trim()
      if (!message || !text) continue
      if (!matchesConfiguredChat(config, message.chat.id)) continue
      if (!isAuthorizedUser(config, message.from?.id)) {
        await deps.api.sendMessage({
          chatId: message.chat.id,
          text: "Not allowed.",
        })
        continue
      }

      const command = parseTelegramCommand(text)
      if (!command) {
        await deps.api.sendMessage({
          chatId: message.chat.id,
          text: helpText(),
        })
        continue
      }

      if (command.command === "help") {
        await deps.api.sendMessage({
          chatId: message.chat.id,
          text: helpText(),
        })
        continue
      }

      if (command.command === "tasks") {
        await deps.api.sendMessage({
          chatId: message.chat.id,
          text: listTasksText(openTasks),
        })
        continue
      }

      const task = await resolveTaskBySelector(
        command.selector,
        openTasks,
        deps.getTaskByRef,
      )
      if (!task) {
        await deps.api.sendMessage({
          chatId: message.chat.id,
          text: `Task not found: ${command.selector}`,
        })
        continue
      }

      if (command.command === "show") {
        await deps.api.sendMessage({
          chatId: message.chat.id,
          text: taskDetailsText(task),
        })
        continue
      }

      if (command.command === "approve" || command.command === "reject") {
        const resultText = await resolveAndContinueTask(
          {
            task,
            data: { approved: command.command === "approve" },
            answeredBy: `telegram:${message.from?.id}`,
          },
          deps,
          update.update_id,
        )
        await deps.api.sendMessage({
          chatId: message.chat.id,
          text: resultText,
        })
        delete nextState.deliveredTasks[task.task]
        continue
      }

      const data = JSON.parse(command.payload) as unknown
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("/respond payload must decode to a JSON object")
      }
      const resultText = await resolveAndContinueTask(
        {
          task,
          data: data as Record<string, unknown>,
          answeredBy: `telegram:${message.from?.id}`,
        },
        deps,
        update.update_id,
      )
      await deps.api.sendMessage({
        chatId: message.chat.id,
        text: resultText,
      })
      delete nextState.deliveredTasks[task.task]
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Telegram bridge request failed"
      const targetChatId =
        update.callback_query?.message?.chat.id || update.message?.chat.id
      if (targetChatId !== undefined) {
        await deps.api.sendMessage({
          chatId: targetChatId,
          text: message,
        })
      }
      if (update.callback_query) {
        await deps.api.answerCallbackQuery({
          callbackQueryId: update.callback_query.id,
          text: "Request failed",
          showAlert: true,
        })
      }
    }
  }

  nextState.updatedAt = now()
  return nextState
}

async function callTelegramMethod<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )

  const payload = (await response.json()) as {
    ok?: boolean
    result?: T
    description?: string
  }
  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.description ||
        `Telegram API ${method} failed with ${response.status}`,
    )
  }
  return payload.result as T
}

export function createTelegramApiClient(token: string): TelegramApiClient {
  return {
    async getUpdates({ offset, timeoutSec }) {
      return callTelegramMethod<TelegramUpdate[]>(token, "getUpdates", {
        offset,
        timeout: timeoutSec,
        allowed_updates: ["message", "callback_query"],
      })
    },
    async sendMessage({ chatId, text, replyMarkup }) {
      const result = await callTelegramMethod<{ message_id: number }>(
        token,
        "sendMessage",
        {
          chat_id: chatId,
          text,
          reply_markup: replyMarkup,
        },
      )
      return { messageId: result.message_id }
    },
    async answerCallbackQuery({ callbackQueryId, text, showAlert }) {
      await callTelegramMethod(token, "answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
        show_alert: Boolean(showAlert),
      })
    },
  }
}
