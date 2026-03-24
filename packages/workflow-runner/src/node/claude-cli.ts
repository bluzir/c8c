import { execFile as execFileCb, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"
import { withExecutionSlot } from "../lib/execution-pool"
import type { AgentRunResult } from "../schema.js"

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

export interface SpawnClaudeOptions {
  workdir: string
  prompt: string
  model?: string
  maxTurns?: number
  permissionMode?: string
  systemPrompts?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  settingSources?: string[]
  addDirs?: string[]
  extraArgs?: string[]
  extraEnv?: Record<string, string>
  timeout?: number
  abortSignal?: AbortSignal
  onSpawn?: (pid: number) => void
  onStdout?: (data: Buffer) => void
  onStderr?: (data: Buffer) => void
}

function buildClaudeArgs(options: SpawnClaudeOptions): string[] {
  const args = ["--print"]

  if (options.model) {
    args.push("--model", options.model)
  }

  if (options.maxTurns) {
    args.push("--max-turns", String(options.maxTurns))
  }

  if (options.permissionMode) {
    args.push("--permission-mode", options.permissionMode)
  }

  if (options.systemPrompts?.length) {
    args.push("--append-system-prompt", options.systemPrompts.join("\n\n"))
  }

  if (options.settingSources?.length) {
    args.push("--setting-sources", options.settingSources.join(","))
  }

  if (options.extraArgs?.length) {
    args.push(...options.extraArgs)
  }

  if (options.prompt.length <= 4096) {
    args.push(options.prompt)
  }

  if (options.addDirs?.length) {
    args.push("--add-dir", ...options.addDirs)
  }

  if (options.allowedTools?.length) {
    args.push("--allowedTools", options.allowedTools.join(","))
  }

  if (options.disallowedTools?.length) {
    args.push("--disallowedTools", options.disallowedTools.join(","))
  }

  return args
}

export function spawnClaude(
  options: SpawnClaudeOptions,
): Promise<AgentRunResult> {
  const executable = findClaudeExecutable() || "claude"
  const timeout = options.timeout ?? 600_000

  if (!existsSync(options.workdir)) {
    options.onStderr?.(
      Buffer.from(`Working directory does not exist: ${options.workdir}\n`),
    )
    return Promise.resolve({
      success: false,
      exitCode: null,
      signal: null,
      killed: false,
      aborted: false,
      durationMs: 0,
    })
  }

  const args = buildClaudeArgs(options)
  const env = buildClaudeEnv(options.extraEnv)
  const useStdin = options.prompt.length > 4096
  const startedAt = Date.now()

  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: options.workdir,
      env,
      stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
    })

    if (typeof child.pid === "number") {
      options.onSpawn?.(child.pid)
    }

    if (useStdin && child.stdin) {
      child.stdin.write(options.prompt)
      child.stdin.end()
    }

    let killed = false
    let aborted = false

    const timer = setTimeout(() => {
      killed = true
      child.kill("SIGTERM")
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL")
      }, 5_000).unref()
    }, timeout)

    const onAbort = () => {
      aborted = true
      child.kill("SIGTERM")
      setTimeout(() => {
        child.kill("SIGKILL")
      }, 5_000).unref()
    }

    if (options.abortSignal) {
      if (options.abortSignal.aborted) {
        onAbort()
      } else {
        options.abortSignal.addEventListener("abort", onAbort, { once: true })
      }
    }

    if (options.onStdout && child.stdout) {
      child.stdout.on("data", options.onStdout)
    }

    if (options.onStderr && child.stderr) {
      child.stderr.on("data", options.onStderr)
    }

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer)
      resolve({
        success: !killed && !aborted && exitCode === 0,
        exitCode,
        signal,
        killed,
        aborted,
        durationMs: Date.now() - startedAt,
        pid: child.pid,
      })
    })

    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({
        success: false,
        exitCode: null,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: Date.now() - startedAt,
        pid: child.pid,
        error: error.message,
      })
    })
  })
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
