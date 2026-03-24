import { execFile as execFileCb } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"
import { withExecutionSlot } from "./execution-pool"

const execFile = promisify(execFileCb)

export function buildExtendedPath(existingPath: string | undefined): string {
  const home = homedir()
  const extras = [
    `${home}/.local/bin`,
    `${home}/.claude/local`,
    `${home}/.claude/local/node_modules/.bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ]

  if (process.platform === "win32") {
    extras.push(`${home}\\AppData\\Roaming\\npm`)
  }

  const merged = [...extras, ...(existingPath ? [existingPath] : [])]
  return [...new Set(merged.filter(Boolean))].join(delimiter)
}

export function buildClaudeEnv(
  extraEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const passthroughKeys = [
    "HOME",
    "USER",
    "LOGNAME",
    "USERPROFILE",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SystemRoot",
    "SYSTEMROOT",
    "ComSpec",
    "COMSPEC",
    "APPDATA",
    "LOCALAPPDATA",
  ]

  for (const key of passthroughKeys) {
    const value = process.env[key]
    if (value) env[key] = value
  }

  env.PATH = buildExtendedPath(process.env.PATH)
  if (extraEnv) {
    Object.assign(env, extraEnv)
  }
  return env
}

export function findClaudeExecutable(): string | null {
  const configured = process.env.CLAUDE_PATH
  if (configured && existsSync(configured)) return configured

  const home = homedir()
  const candidates = [
    join(home, ".local", "bin", "claude"),
    join(home, ".claude", "local", "node_modules", ".bin", "claude"),
    join(home, ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    "/usr/bin/claude",
  ]

  if (process.platform === "win32") {
    candidates.push(
      join(home, "AppData", "Roaming", "npm", "claude.cmd"),
      join(home, "AppData", "Roaming", "npm", "claude"),
    )
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

export interface ExecClaudeResult {
  stdout: string
  stderr: string
  queueWaitMs?: number
}

export async function execClaude(
  args: string[],
  opts?: { timeout?: number; cwd?: string },
): Promise<ExecClaudeResult> {
  const executable = findClaudeExecutable() || "claude"
  const env = buildClaudeEnv()
  return withExecutionSlot(async (ticket) => {
    const { stdout, stderr } = await execFile(executable, args, {
      timeout: opts?.timeout ?? 15_000,
      env,
      cwd: opts?.cwd,
    })
    return { stdout, stderr, queueWaitMs: ticket.queueWaitMs }
  })
}
