import { describe, expect, it, vi } from "vitest"
import type {
  WorkflowHilTaskRecord,
  WorkflowHilTaskSummary,
} from "@c8c/workflow-runner"
import {
  buildTelegramTaskActionKey,
  parseTelegramBridgeConfig,
  runTelegramBridgeIteration,
  type TelegramApiClient,
  type TelegramBridgeConfig,
  type TelegramBridgeState,
} from "./telegram-bridge"

function createConfig(
  overrides: Partial<TelegramBridgeConfig> = {},
): TelegramBridgeConfig {
  return {
    botTokenEnv: "C8C_TELEGRAM_BOT_TOKEN",
    chatId: "123456789",
    allowedUserIds: ["123456789"],
    pollIntervalSec: 10,
    projectPaths: [],
    statePath: "/tmp/hil-telegram.state.json",
    ...overrides,
  }
}

function createTaskSummary(
  overrides: Partial<WorkflowHilTaskSummary> = {},
): WorkflowHilTaskSummary {
  return {
    task: "task-token",
    taskId: "approval-1",
    kind: "approval",
    status: "open",
    workspace: "/tmp/project/.c8c/runs/run-1",
    chainId: "/tmp/project/.c8c/runs/run-1",
    sourceRunId: "run-1",
    nodeId: "approval-1",
    workflowName: "Ship flow",
    title: "Approve ship",
    instructions: "Approve the generated draft before publish.",
    summary: "Draft is ready for final ship approval.",
    allowEdit: true,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

function createTaskRecord(
  overrides: Partial<WorkflowHilTaskRecord> = {},
): WorkflowHilTaskRecord {
  const summary = createTaskSummary()
  return {
    task: summary.task,
    taskId: summary.taskId,
    request: {
      version: 1,
      kind: summary.kind,
      title: summary.title,
      instructions: summary.instructions,
      summary: summary.summary,
      fields: [],
      defaults: summary.allowEdit
        ? { approved: true, editedContent: "Edited content" }
        : undefined,
      metadata: {
        allowEdit: summary.allowEdit,
      },
    },
    state: {
      version: 1,
      taskId: summary.taskId,
      chainId: summary.chainId,
      sourceRunId: summary.sourceRunId,
      kind: summary.kind,
      checkpointKind: "approval",
      status: summary.status,
      workspace: summary.workspace,
      nodeId: summary.nodeId,
      workflowName: summary.workflowName,
      title: summary.title,
      instructions: summary.instructions,
      summary: summary.summary,
      allowEdit: summary.allowEdit,
      requestHash: "hash",
      responseRevision: 0,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    },
    latestResponse: null,
    ...overrides,
  }
}

function createApi(
  overrides: Partial<TelegramApiClient> = {},
): TelegramApiClient & {
  sentMessages: Array<{
    chatId: string | number
    text: string
    replyMarkup?: Record<string, unknown>
  }>
  callbackAnswers: Array<{
    callbackQueryId: string
    text?: string
    showAlert?: boolean
  }>
} {
  const sentMessages: Array<{
    chatId: string | number
    text: string
    replyMarkup?: Record<string, unknown>
  }> = []
  const callbackAnswers: Array<{
    callbackQueryId: string
    text?: string
    showAlert?: boolean
  }> = []

  return {
    sentMessages,
    callbackAnswers,
    getUpdates: overrides.getUpdates || vi.fn().mockResolvedValue([]),
    sendMessage:
      overrides.sendMessage ||
      vi.fn().mockImplementation(async (args) => {
        sentMessages.push(args)
        return { messageId: sentMessages.length }
      }),
    answerCallbackQuery:
      overrides.answerCallbackQuery ||
      vi.fn().mockImplementation(async (args) => {
        callbackAnswers.push(args)
      }),
  }
}

describe("telegram bridge", () => {
  it("parses config and normalizes optional paths", () => {
    expect(
      parseTelegramBridgeConfig(
        {
          botTokenEnv: "C8C_TELEGRAM_BOT_TOKEN",
          chatId: 123456789,
          allowedUserIds: ["123456789"],
          pollIntervalSec: 15,
          projectPaths: ["/tmp/project", "/tmp/project"],
        },
        { configPath: "/tmp/hil-telegram.json" },
      ),
    ).toMatchObject({
      botTokenEnv: "C8C_TELEGRAM_BOT_TOKEN",
      chatId: "123456789",
      allowedUserIds: ["123456789"],
      pollIntervalSec: 15,
      projectPaths: ["/tmp/project"],
      statePath: "/tmp/hil-telegram.state.json",
    })
  })

  it("delivers open approval tasks once and avoids duplicate sends", async () => {
    const api = createApi()
    const task = createTaskSummary()
    const listTasks = vi.fn().mockResolvedValue([task])
    const state: TelegramBridgeState = {
      version: 1,
      lastUpdateId: 0,
      deliveredTasks: {},
      updatedAt: 0,
    }

    const first = await runTelegramBridgeIteration(createConfig(), state, {
      api,
      listTasks,
      getTaskByRef: vi.fn().mockResolvedValue(null),
      resolveTask: vi.fn(),
      now: () => 100,
    })

    expect(api.sentMessages).toHaveLength(1)
    expect(api.sentMessages[0]?.text).toContain("Approval needed")
    expect(first.deliveredTasks[task.task]).toBe("2:open:open")

    api.sentMessages.length = 0

    const second = await runTelegramBridgeIteration(createConfig(), first, {
      api,
      listTasks,
      getTaskByRef: vi.fn().mockResolvedValue(null),
      resolveTask: vi.fn(),
      now: () => 200,
    })

    expect(api.sentMessages).toHaveLength(0)
    expect(second.deliveredTasks[task.task]).toBe("2:open:open")
  })

  it("resolves approval callbacks and continues the workspace", async () => {
    const task = createTaskSummary()
    const api = createApi({
      getUpdates: vi.fn().mockResolvedValue([
        {
          update_id: 11,
          callback_query: {
            id: "callback-1",
            data: buildTelegramTaskActionKey("approve", task.task),
            from: { id: 123456789 },
            message: {
              message_id: 1,
              chat: { id: 123456789 },
            },
          },
        },
      ]),
    })
    const resolveTask = vi.fn().mockResolvedValue(createTaskRecord())
    const continueWorkspace = vi.fn().mockResolvedValue({ status: "completed" })

    const next = await runTelegramBridgeIteration(
      createConfig(),
      {
        version: 1,
        lastUpdateId: 0,
        deliveredTasks: { [task.task]: "2:open:open" },
        updatedAt: 0,
      },
      {
        api,
        listTasks: vi.fn().mockResolvedValue([task]),
        getTaskByRef: vi.fn().mockResolvedValue(createTaskRecord()),
        resolveTask,
        continueWorkspace,
        now: () => 300,
      },
    )

    expect(resolveTask).toHaveBeenCalledWith(
      task.task,
      expect.objectContaining({
        data: { approved: true },
        idempotencyKey: "telegram-11-approval-1",
        answeredBy: "telegram:123456789",
        source: "cli",
      }),
    )
    expect(continueWorkspace).toHaveBeenCalledWith(task.workspace)
    expect(api.callbackAnswers[0]).toMatchObject({
      callbackQueryId: "callback-1",
      text: "Resolved approval-1. Flow status: completed.",
    })
    expect(api.sentMessages.at(-1)?.text).toBe(
      "Resolved approval-1. Flow status: completed.",
    )
    expect(next.lastUpdateId).toBe(11)
    expect(next.deliveredTasks[task.task]).toBeUndefined()
  })

  it("accepts form responses via /respond command", async () => {
    const task = createTaskSummary({
      task: "form-task-token",
      taskId: "human-1",
      kind: "form",
      title: "Capture reviewer notes",
      instructions: "Collect reviewer details before continuing.",
      allowEdit: false,
    })
    const record = createTaskRecord({
      task: task.task,
      taskId: task.taskId,
      request: {
        version: 1,
        kind: "form",
        title: task.title,
        instructions: task.instructions,
        fields: [
          {
            id: "reviewer",
            type: "text",
            label: "Reviewer",
            required: true,
          },
        ],
      },
      state: {
        ...createTaskRecord().state,
        taskId: task.taskId,
        kind: "form",
        title: task.title,
        instructions: task.instructions,
      },
    })
    const api = createApi({
      getUpdates: vi.fn().mockResolvedValue([
        {
          update_id: 25,
          message: {
            message_id: 2,
            chat: { id: 123456789 },
            from: { id: 123456789 },
            text: '/respond human-1 {"answers":{"reviewer":"Vlad"}}',
          },
        },
      ]),
    })
    const getTaskByRef = vi
      .fn()
      .mockImplementation(async (selector: string) => {
        if (selector === task.task) return record
        return null
      })
    const resolveTask = vi.fn().mockResolvedValue(record)

    const next = await runTelegramBridgeIteration(
      createConfig(),
      {
        version: 1,
        lastUpdateId: 0,
        deliveredTasks: { [task.task]: "2:open:open" },
        updatedAt: 0,
      },
      {
        api,
        listTasks: vi.fn().mockResolvedValue([task]),
        getTaskByRef,
        resolveTask,
        now: () => 400,
      },
    )

    expect(resolveTask).toHaveBeenCalledWith(
      task.task,
      expect.objectContaining({
        data: { answers: { reviewer: "Vlad" } },
        idempotencyKey: "telegram-25-human-1",
        answeredBy: "telegram:123456789",
      }),
    )
    expect(api.sentMessages.at(-1)?.text).toBe("Resolved human-1.")
    expect(next.lastUpdateId).toBe(25)
    expect(next.deliveredTasks[task.task]).toBeUndefined()
  })
})
