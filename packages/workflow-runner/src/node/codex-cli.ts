import { execFile as execFileCb } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"
import { withExecutionSlot } from "../lib/execution-pool"
import { getCodexApiKey } from "./provider-settings"

const execFile = promisify(execFileCb)
let codexExecSupportPromise: Promise<boolean> | null = null
let codexShellEnvPromise: Promise<Record<string, string>> | null = null
let codexExecutablePromise: Promise<string | null> | null = null

const CODEX_ENV_PASSTHROUGH_KEYS = [
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
  "TERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "COLORTERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "CI",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "DBUS_SESSION_BUS_ADDRESS",
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SystemRoot",
  "SYSTEMROOT",
  "ComSpec",
  "COMSPEC",
  "APPDATA",
  "LOCALAPPDATA",
] as const

function getProcessResourcesPath(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
}

export interface ExecCodexResult {
  stdout: string
  stderr: string
  queueWaitMs?: number
}

function bundledCodexBinaryName(): string {
  return process.platform === "win32" ? "codex.exe" : "codex"
}

function bundledCodexResourceDirs(): string[] {
  const dirs: string[] = []
  const resourcesPath = getProcessResourcesPath()

  if (resourcesPath) {
    dirs.push(join(resourcesPath, "bin"))
  }

  dirs.push(join(process.cwd(), "resources", "bin", `${process.platform}-${process.arch}`))
  return [...new Set(dirs)]
}

export function findBundledCodexExecutable(): string | null {
  const binaryName = bundledCodexBinaryName()

  for (const directory of bundledCodexResourceDirs()) {
    const candidate = join(directory, binaryName)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function buildCodexPath(existingPath: string | undefined): string {
  const home = homedir()
  const bundledCodexPath = findBundledCodexExecutable()
  const bundledDir = bundledCodexPath ? join(bundledCodexPath, "..") : undefined
  const extras = [
    bundledDir,
    `${home}/.local/bin`,
    `${home}/.nvm/versions/node/current/bin`,
    `${home}/.cargo/bin`,
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

export function collectAllowedCodexEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options?: { includePath?: boolean },
): Record<string, string> {
  const env: Record<string, string> = {}

  for (const key of CODEX_ENV_PASSTHROUGH_KEYS) {
    const value = source[key]
    if (typeof value === "string" && value) {
      env[key] = value
    }
  }

  if (options?.includePath) {
    const pathValue = source.PATH
    if (typeof pathValue === "string" && pathValue) {
      env.PATH = pathValue
    }
  }

  return env
}

function collectExplicitCodexOverrides(
  source: Record<string, string> | undefined,
): Record<string, string> {
  const env = collectAllowedCodexEnv(source || {})

  if (source?.CODEX_API_KEY) {
    env.CODEX_API_KEY = source.CODEX_API_KEY
  }

  if (source?.CODEX_PATH) {
    env.CODEX_PATH = source.CODEX_PATH
  }

  return env
}

function buildCodexLookupEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    ...collectAllowedCodexEnv(source),
    PATH: buildCodexPath(source.PATH),
  }
}

function parseNullDelimitedEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const pair of raw.split("\u0000")) {
    if (!pair) continue
    const equalsIndex = pair.indexOf("=")
    if (equalsIndex <= 0) continue
    const key = pair.slice(0, equalsIndex)
    const value = pair.slice(equalsIndex + 1)
    env[key] = value
  }
  return env
}

export async function getCodexShellEnv(): Promise<Record<string, string>> {
  if (codexShellEnvPromise) {
    return codexShellEnvPromise
  }

  codexShellEnvPromise = (async () => {
    if (process.platform === "win32") {
      return collectAllowedCodexEnv(process.env, { includePath: true })
    }

    const shell = process.env.SHELL || "/bin/zsh"

    try {
      const { stdout } = await execFile(shell, ["-lc", "env -0"], {
        timeout: 5_000,
        maxBuffer: 1024 * 1024 * 8,
        env: buildCodexLookupEnv(process.env),
      })

      const parsed = collectAllowedCodexEnv(parseNullDelimitedEnv(stdout), { includePath: true })
      if (Object.keys(parsed).length > 0) {
        return parsed
      }
    } catch {
      // Fall back to the current process environment.
    }

    return collectAllowedCodexEnv(process.env, { includePath: true })
  })()

  return codexShellEnvPromise
}

export function composeCodexEnv({
  processEnv,
  shellEnv,
  extraEnv,
  bundledCodexPath,
  codexApiKey,
}: {
  processEnv: NodeJS.ProcessEnv | Record<string, string | undefined>
  shellEnv: Record<string, string>
  extraEnv?: Record<string, string>
  bundledCodexPath?: string | null
  codexApiKey?: string
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...collectAllowedCodexEnv(processEnv),
    ...collectAllowedCodexEnv(shellEnv),
    ...collectExplicitCodexOverrides(extraEnv),
    PATH: buildCodexPath(shellEnv.PATH || processEnv.PATH),
  }

  if (bundledCodexPath && !env.CODEX_PATH) {
    env.CODEX_PATH = bundledCodexPath
  }

  if (codexApiKey && !env.CODEX_API_KEY) {
    env.CODEX_API_KEY = codexApiKey
  }

  return env
}

export async function buildCodexEnv(
  extraEnv?: Record<string, string>,
): Promise<NodeJS.ProcessEnv> {
  const bundledCodexPath = findBundledCodexExecutable()
  const shellEnv = await getCodexShellEnv()
  const codexApiKey = await getCodexApiKey()
  return composeCodexEnv({
    processEnv: process.env,
    shellEnv,
    extraEnv,
    bundledCodexPath,
    codexApiKey,
  })
}

export function findCodexExecutable(): string | null {
  const configured = process.env.CODEX_PATH
  if (configured && existsSync(configured)) return configured

  const bundled = findBundledCodexExecutable()
  if (bundled) return bundled

  const home = homedir()
  const candidates = [
    join(home, ".local", "bin", "codex"),
    join(home, ".nvm", "versions", "node", "current", "bin", "codex"),
    join(home, ".cargo", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "/usr/bin/codex",
  ]

  if (process.platform === "win32") {
    candidates.push(
      join(home, "AppData", "Roaming", "npm", "codex.cmd"),
      join(home, "AppData", "Roaming", "npm", "codex"),
    )
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

async function resolveCodexExecutable(): Promise<string | null> {
  const found = findCodexExecutable()
  if (found) return found

  if (!codexExecutablePromise) {
    codexExecutablePromise = withExecutionSlot(async () => {
      try {
        const { stdout } = await execFile("which", ["codex"], {
          encoding: "utf8",
          env: buildCodexLookupEnv(process.env),
        })
        return stdout.trim() || null
      } catch {
        return null
      }
    })
  }

  return codexExecutablePromise
}

export async function execCodex(
  args: string[],
  opts?: { timeout?: number; cwd?: string; extraEnv?: Record<string, string> },
): Promise<ExecCodexResult> {
  const executable = (await resolveCodexExecutable()) || "codex"
  const env = await buildCodexEnv(opts?.extraEnv)
  return withExecutionSlot(async (ticket) => {
    const { stdout, stderr } = await execFile(executable, args, {
      timeout: opts?.timeout ?? 15_000,
      env,
      cwd: opts?.cwd,
    })
    return { stdout, stderr, queueWaitMs: ticket.queueWaitMs }
  })
}

export async function supportsCodexExecSubcommand(): Promise<boolean> {
  if (!codexExecSupportPromise) {
    codexExecSupportPromise = (async () => {
      try {
        await execCodex(["exec", "--help"], { timeout: 5_000 })
        return true
      } catch {
        return false
      }
    })()
  }

  return codexExecSupportPromise
}
