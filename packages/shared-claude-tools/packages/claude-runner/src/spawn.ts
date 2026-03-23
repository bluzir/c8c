import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import type { ClaudeSpawnOptions, ClaudeSpawnResult } from "./types.js"
import { cleanEnv } from "./env.js"
import { buildClaudeArgs } from "./args.js"

const DEFAULT_CLAUDE_PATH = process.env.CLAUDE_PATH || "claude"
const DEFAULT_TIMEOUT = 600_000 // 10 minutes

/**
 * Spawn a Claude CLI subprocess.
 *
 * This is the low-level primitive — it does NOT parse output.
 * Consumers receive raw stdout/stderr via `onStdout`/`onStderr` callbacks.
 */
export function spawnClaude(
  options: ClaudeSpawnOptions,
): Promise<ClaudeSpawnResult> {
  const claudePath = options.claudePath ?? DEFAULT_CLAUDE_PATH
  const timeout = options.timeout ?? DEFAULT_TIMEOUT

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

  const args = buildClaudeArgs({
    model: options.model,
    maxTurns: options.maxTurns,
    permissionMode: options.permissionMode,
    systemPrompts: options.systemPrompts,
    allowedTools: options.allowedTools,
    disallowedTools: options.disallowedTools,
    settingSources: options.settingSources,
    addDirs: options.addDirs,
    extraArgs: options.extraArgs,
    prompt: options.prompt,
  })

  const env = cleanEnv(options.extraEnv)
  const startTime = Date.now()
  const useStdin = options.prompt.length > 4096

  return new Promise((resolve) => {
    const child = spawn(claudePath, args, {
      cwd: options.workdir,
      env,
      stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
    })
    if (typeof child.pid === "number") {
      options.onSpawn?.(child.pid)
    }

    // Pipe long prompts via stdin
    if (useStdin && child.stdin) {
      child.stdin.write(options.prompt)
      child.stdin.end()
    }

    let killed = false
    let aborted = false

    const timer = setTimeout(() => {
      killed = true
      child.kill("SIGKILL")
    }, timeout)

    if (options.abortSignal) {
      const onAbort = () => {
        aborted = true
        child.kill("SIGTERM")
        setTimeout(() => child.kill("SIGKILL"), 5_000)
      }
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

    child.on("close", (code, signal) => {
      clearTimeout(timer)
      resolve({
        success: !killed && !aborted && code === 0,
        exitCode: code,
        signal,
        killed,
        aborted,
        durationMs: Date.now() - startTime,
        pid: child.pid,
      })
    })

    child.on("error", () => {
      clearTimeout(timer)
      resolve({
        success: false,
        exitCode: null,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: Date.now() - startTime,
        pid: child.pid,
      })
    })
  })
}
