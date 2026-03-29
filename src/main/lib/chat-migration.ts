import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Chat, ChatRun } from "@shared/types"
import { createChat } from "./chat-store"
import { logInfo, logWarn } from "./structured-log"

const COMPONENT = "chat-migration"

/**
 * Map RunResult status values to the narrower ChatRun status union.
 * "interrupted", "paused", and "blocked" are treated as "cancelled"
 * since the run didn't complete successfully.
 */
function toChatRunStatus(status: string): ChatRun["status"] {
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "cancelled"
  // running is kept as-is
  if (status === "running") return "running"
  // interrupted, paused, blocked → cancelled
  return "cancelled"
}

interface LegacyRunResult {
  runId: string
  status: string
  workflowName: string
  workflowPath?: string
  startedAt: number
  completedAt: number
  reportPath: string
  workspace: string
}

function parseLegacyRunResult(raw: unknown): LegacyRunResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const parsed = raw as Record<string, unknown>
  if (
    typeof parsed.runId !== "string" ||
    typeof parsed.status !== "string" ||
    typeof parsed.workflowName !== "string" ||
    typeof parsed.startedAt !== "number" ||
    typeof parsed.completedAt !== "number"
  ) {
    return null
  }
  return {
    runId: parsed.runId,
    status: parsed.status,
    workflowName: parsed.workflowName,
    workflowPath:
      typeof parsed.workflowPath === "string" ? parsed.workflowPath : undefined,
    startedAt: parsed.startedAt,
    completedAt: parsed.completedAt,
    reportPath: typeof parsed.reportPath === "string" ? parsed.reportPath : "",
    workspace: typeof parsed.workspace === "string" ? parsed.workspace : "",
  }
}

function deterministicChatId(key: string): string {
  return createHash("sha256")
    .update("chat:" + key)
    .digest("hex")
    .slice(0, 32)
}

/**
 * Auto-create synthetic Chat entities from existing run-result.json files
 * in a project that predates the chat-centric model.
 *
 * Safe to call on every project open — skips if chats already exist.
 */
export async function migrateProjectToChats(
  projectPath: string,
): Promise<void> {
  const safePath = resolve(projectPath)
  const chatsDir = join(safePath, ".c8c", "chats")
  const runsDir = join(safePath, ".c8c", "runs")

  // 1. Check if chats already exist (non-timeline .json files)
  try {
    const chatEntries = await readdir(chatsDir)
    const chatFiles = chatEntries.filter(
      (name) => name.endsWith(".json") && !name.includes("-timeline"),
    )
    if (chatFiles.length > 0) {
      logInfo(COMPONENT, "migration_skipped", {
        projectPath: safePath,
        existingChats: chatFiles.length,
      })
      return
    }
  } catch {
    // chats dir doesn't exist yet — proceed with migration
  }

  // 2. Read all run results from .c8c/runs/*/run-result.json
  let runDirs: string[]
  try {
    const entries = await readdir(runsDir, { withFileTypes: true })
    runDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    // No runs directory — nothing to migrate
    logInfo(COMPONENT, "migration_no_runs", { projectPath: safePath })
    return
  }

  if (runDirs.length === 0) {
    logInfo(COMPONENT, "migration_no_runs", { projectPath: safePath })
    return
  }

  const runResults: LegacyRunResult[] = []
  for (const dirName of runDirs) {
    const resultPath = join(runsDir, dirName, "run-result.json")
    try {
      const raw = await readFile(resultPath, "utf-8")
      const parsed = parseLegacyRunResult(JSON.parse(raw))
      if (!parsed) {
        logWarn(COMPONENT, "invalid_run_result", {
          path: resultPath,
        })
        continue
      }
      runResults.push(parsed)
    } catch (error) {
      // File doesn't exist or is corrupted — skip
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined
      if (code !== "ENOENT") {
        logWarn(COMPONENT, "read_run_result_failed", {
          path: resultPath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      continue
    }
  }

  if (runResults.length === 0) {
    logInfo(COMPONENT, "migration_no_valid_runs", { projectPath: safePath })
    return
  }

  // 3. Group runs by workflowPath
  const groups = new Map<string, LegacyRunResult[]>()
  for (const run of runResults) {
    const key = run.workflowPath || `orphaned-${run.runId}`
    const group = groups.get(key)
    if (group) {
      group.push(run)
    } else {
      groups.set(key, [run])
    }
  }

  // 4. Create a synthetic Chat for each group
  let migratedCount = 0
  for (const [groupKey, runs] of groups) {
    // Sort runs by startedAt ascending
    runs.sort((a, b) => a.startedAt - b.startedAt)

    const chatId = deterministicChatId(groupKey)
    const firstRun = runs[0]
    const lastRun = runs[runs.length - 1]

    const chatRuns: ChatRun[] = runs.map((run) => ({
      runId: run.runId,
      templateId: "legacy",
      templateName: run.workflowName || "Legacy Flow",
      workflowPath: run.workflowPath || "",
      workspace: run.workspace,
      startedAt: run.startedAt,
      completedAt: run.completedAt > 0 ? run.completedAt : undefined,
      status: toChatRunStatus(run.status),
      userPrompt: "",
    }))

    const chat: Chat = {
      id: chatId,
      name: firstRun.workflowName || "Legacy Chat",
      projectPath: safePath,
      createdAt: firstRun.startedAt,
      lastActivityAt: lastRun.completedAt > 0 ? lastRun.completedAt : lastRun.startedAt,
      archived: false,
      runs: chatRuns,
      artifactPool: [],
    }

    await createChat(safePath, chat)
    migratedCount++
  }

  logInfo(COMPONENT, "migration_complete", {
    projectPath: safePath,
    chatsCreated: migratedCount,
    runsProcessed: runResults.length,
  })
}
