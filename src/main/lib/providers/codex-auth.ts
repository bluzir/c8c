import type { ProviderAuthStatus } from "@shared/types"
import { probeCodexAcpAuthStatus } from "../codex-acp-runtime"
import { execCodex } from "../codex-cli"
import { getCodexApiKey } from "../provider-settings"
import { execErrorOutput, normalizeCliText } from "./provider-utils"

export function isCodexHeadlessAuthCheckError(text: string): boolean {
  const normalized = normalizeCliText(text).toLowerCase()
  return (
    normalized.includes("raw mode is not supported") ||
    normalized.includes(
      "could not report auth status in non-interactive mode",
    ) ||
    normalized.includes("sign in with chatgpt") ||
    normalized.includes("paste an api key")
  )
}

export function sanitizeCodexAuthError(text: string): string {
  const normalized = normalizeCliText(text)
  if (!normalized) {
    return "Codex CLI is not authenticated."
  }

  if (isCodexHeadlessAuthCheckError(normalized)) {
    return "Codex CLI could not report auth status in non-interactive mode. This Codex version may require a real terminal for `codex login status`."
  }

  if (
    /not authenticated|not logged in|login required|please log in|unauthorized|forbidden|401/i.test(
      normalized,
    )
  ) {
    return "Codex CLI is not authenticated."
  }

  return normalized
}

export function isCodexInteractiveEditorNoise(text: string): boolean {
  const normalized = normalizeCliText(text)
  if (!normalized) return false

  return (
    normalized.includes("Vim: Warning:") ||
    normalized.includes("E325: ATTENTION") ||
    normalized.includes("Swap file") ||
    normalized.includes(".codex/instructions.md")
  )
}

export function summarizeCodexInteractiveEditorNoise(text: string): string {
  const normalized = normalizeCliText(text)
  const swapMatch = normalized.match(/swap file\s+"?([^"\s]+)"?/i)
  const swapFile = swapMatch?.[1] || null
  const swapSuffix = swapFile ? ` Swap file: ${swapFile}.` : ""

  return `Codex CLI attempted to open ~/.codex/instructions.md in an interactive editor during headless legacy execution.${swapSuffix}`
}

export function parseCodexAuth(
  output: string,
  apiKeyConfigured: boolean,
): ProviderAuthStatus {
  const normalized = normalizeCliText(output)
  if (/logged in using chatgpt/i.test(normalized)) {
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "chatgpt",
      accountLabel: "ChatGPT",
      apiKeyConfigured,
      error: null,
    }
  }

  if (/logged in using api key/i.test(normalized)) {
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "CLI API key",
      apiKeyConfigured,
      error: null,
    }
  }

  if (apiKeyConfigured) {
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: "api_key",
      accountLabel: "App-managed CODEX_API_KEY",
      apiKeyConfigured: true,
      error: null,
    }
  }

  return {
    provider: "codex",
    state: isCodexHeadlessAuthCheckError(normalized)
      ? "unknown"
      : "unauthenticated",
    authenticated: false,
    authMethod: null,
    accountLabel: null,
    apiKeyConfigured,
    error: sanitizeCodexAuthError(normalized),
  }
}

async function fallbackCodexAuthStatus(
  apiKeyConfigured: boolean,
): Promise<ProviderAuthStatus | null> {
  try {
    await execCodex(["mcp", "list", "--json"], { timeout: 10_000 })
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: apiKeyConfigured ? "api_key" : "chatgpt",
      accountLabel: apiKeyConfigured
        ? "App-managed CODEX_API_KEY"
        : "ChatGPT subscription",
      apiKeyConfigured,
      error: null,
    }
  } catch (error) {
    const message = sanitizeCodexAuthError(execErrorOutput(error))
    if (
      /not authenticated|login required|unauthorized|forbidden|401/i.test(
        message,
      )
    ) {
      return {
        provider: "codex",
        state: "unauthenticated",
        authenticated: false,
        authMethod: null,
        accountLabel: null,
        apiKeyConfigured,
        error: message,
      }
    }
    return null
  }
}

export async function getCodexAuthStatus(): Promise<ProviderAuthStatus> {
  const apiKeyConfigured = Boolean(await getCodexApiKey())
  const acpProbe = await probeCodexAcpAuthStatus()
  if (acpProbe.state !== "unknown") {
    return acpProbe
  }

  try {
    const { stdout, stderr } = await execCodex(["login", "status"], {
      timeout: 10_000,
    })
    const parsed = parseCodexAuth(
      [stdout, stderr].filter(Boolean).join("\n"),
      apiKeyConfigured,
    )
    if (parsed.state === "unknown") {
      return (await fallbackCodexAuthStatus(apiKeyConfigured)) ?? parsed
    }
    return parsed
  } catch (error) {
    const message = sanitizeCodexAuthError(execErrorOutput(error))
    if (isCodexHeadlessAuthCheckError(message)) {
      const fallback = await fallbackCodexAuthStatus(apiKeyConfigured)
      if (fallback) return fallback
    }

    if (apiKeyConfigured) {
      return {
        provider: "codex",
        state: "authenticated",
        authenticated: true,
        authMethod: "api_key",
        accountLabel: "App-managed CODEX_API_KEY",
        apiKeyConfigured: true,
        error: null,
      }
    }

    const isUnauthenticated =
      /not authenticated|login required|unauthorized|forbidden|401/i.test(
        message,
      )
    return {
      provider: "codex",
      state: isUnauthenticated ? "unauthenticated" : "unknown",
      authenticated: false,
      authMethod: null,
      accountLabel: null,
      apiKeyConfigured,
      error: isUnauthenticated ? message : acpProbe.error || message,
    }
  }
}
