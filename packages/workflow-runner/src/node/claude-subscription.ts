import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import type { ClaudeCodeSubscriptionStatus } from "@shared/types"
import { findClaudeExecutable, buildClaudeEnv } from "./claude-cli"

const execFile = promisify(execFileCb)

const CLAUDE_STATUS_ARGS = ["auth", "status", "--json"] as const
const CLAUDE_STATUS_TIMEOUT_MS = 8_000

const SUBSCRIPTION_AUTH_METHODS = new Set([
  "oauth_token",
  "oauth",
  "claude_subscription",
  "claude-code",
])

const NON_SUBSCRIPTION_PLAN_VALUES = new Set([
  "none",
  "free",
  "unknown",
  "unavailable",
])

interface ParsedClaudeAuthStatus {
  loggedIn: boolean
  authMethod: string | null
  apiProvider: string | null
  hasSubscription: boolean
}

type ParsedAuthPayload = Record<string, unknown>

function asRecord(value: unknown): ParsedAuthPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as ParsedAuthPayload
}

function normalizePlan(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const objectValue = value as ParsedAuthPayload
  for (const key of ["type", "plan", "name", "tier"]) {
    if (typeof objectValue[key] === "string" && objectValue[key].trim()) {
      return objectValue[key].trim()
    }
  }
  return null
}

function inferHasSubscription(parsed: ParsedAuthPayload): boolean {
  const loggedIn = parsed.loggedIn === true
  if (!loggedIn) return false

  const hintedPlan =
    normalizePlan(parsed.subscriptionType) ??
    normalizePlan(parsed.subscription) ??
    normalizePlan(parsed.plan)
  if (hintedPlan) {
    return !NON_SUBSCRIPTION_PLAN_VALUES.has(hintedPlan.toLowerCase())
  }

  const authMethod =
    typeof parsed.authMethod === "string" ? parsed.authMethod.toLowerCase() : ""
  if (!authMethod) return false

  if (SUBSCRIPTION_AUTH_METHODS.has(authMethod)) return true
  if (authMethod.includes("oauth")) return true

  return false
}

function statusFromError(
  errorMessage: string,
  cliInstalled: boolean,
): ClaudeCodeSubscriptionStatus {
  return {
    checkedAt: Date.now(),
    cliInstalled,
    loggedIn: false,
    authMethod: null,
    apiProvider: null,
    hasSubscription: false,
    error: errorMessage,
  }
}

export function parseClaudeAuthStatus(
  raw: string,
): ParsedClaudeAuthStatus | null {
  try {
    const parsedUnknown = JSON.parse(raw) as unknown
    const parsed = asRecord(parsedUnknown)
    if (!parsed) return null

    return {
      loggedIn: parsed.loggedIn === true,
      authMethod:
        typeof parsed.authMethod === "string" ? parsed.authMethod : null,
      apiProvider:
        typeof parsed.apiProvider === "string" ? parsed.apiProvider : null,
      hasSubscription: inferHasSubscription(parsed),
    }
  } catch {
    return null
  }
}

export async function getClaudeCodeSubscriptionStatus(): Promise<ClaudeCodeSubscriptionStatus> {
  const executable = findClaudeExecutable() || "claude"
  const explicitExecutableFound = executable !== "claude"
  const env = buildClaudeEnv()

  try {
    const { stdout } = await execFile(executable, [...CLAUDE_STATUS_ARGS], {
      timeout: CLAUDE_STATUS_TIMEOUT_MS,
      env,
    })
    const parsed = parseClaudeAuthStatus(stdout)
    if (!parsed) {
      return statusFromError("Unable to parse Claude auth status output.", true)
    }
    return {
      checkedAt: Date.now(),
      cliInstalled: true,
      loggedIn: parsed.loggedIn,
      authMethod: parsed.authMethod,
      apiProvider: parsed.apiProvider,
      hasSubscription: parsed.hasSubscription,
      error: null,
    }
  } catch (error) {
    const commandError = error as Error & {
      code?: string
      stdout?: string
    }

    if (typeof commandError.stdout === "string" && commandError.stdout.trim()) {
      const parsed = parseClaudeAuthStatus(commandError.stdout)
      if (parsed) {
        return {
          checkedAt: Date.now(),
          cliInstalled: true,
          loggedIn: parsed.loggedIn,
          authMethod: parsed.authMethod,
          apiProvider: parsed.apiProvider,
          hasSubscription: parsed.hasSubscription,
          error: null,
        }
      }
    }

    if (commandError.code === "ENOENT") {
      return statusFromError(
        "Claude CLI is not installed or not available in PATH.",
        false,
      )
    }

    const message = commandError.message || "Failed to read Claude auth status."
    return statusFromError(
      message,
      explicitExecutableFound || commandError.code !== "ENOENT",
    )
  }
}
