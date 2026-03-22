import { PROVIDER_LABELS } from "@shared/provider-metadata"
import type { ProviderAuthStatus, ProviderHealth, ProviderId } from "@shared/types"

export type ProviderReadinessBadgeVariant = "outline" | "success" | "warning" | "destructive"

export interface ProviderReadinessVerdict {
  badgeVariant: ProviderReadinessBadgeVariant
  badgeLabel: string
  title: string
  description: string
  blocking: boolean
}

export interface ProviderBannerState {
  message: string
  tone: "warning" | "danger"
  dismissKey: string
}

export function getProviderInstallCommand(providerId: ProviderId) {
  return providerId === "claude"
    ? "npm install -g @anthropic-ai/claude-code"
    : "npm install -g @openai/codex"
}

export function getProviderLoginCommand(providerId: ProviderId) {
  return providerId === "claude" ? "claude login" : "codex login"
}

export function getProviderSignInMethod(
  providerId: ProviderId,
  authMethod?: string | null,
  authenticated?: boolean,
) {
  if (!authenticated) return "Not signed in"
  const normalized = authMethod?.toLowerCase() || ""
  if (normalized === "test-mode") return "Test mode"
  if (normalized === "api_key") return "Custom API key"
  if (providerId === "codex" && normalized === "chatgpt") return "ChatGPT account"
  if (providerId === "claude" && (normalized.includes("subscription") || normalized.includes("oauth"))) {
    return "Claude account"
  }
  return `${PROVIDER_LABELS[providerId]} account`
}

function providerSetupMessage(providerId: ProviderId, health?: ProviderHealth | null) {
  return health?.error?.trim()
    || `${PROVIDER_LABELS[providerId]} is not ready. Install or reconnect the CLI in Settings.`
}

function providerSignInMessage(providerId: ProviderId, auth?: ProviderAuthStatus | null) {
  return auth?.error?.trim()
    || `${PROVIDER_LABELS[providerId]} needs sign-in. Open Settings and run ${getProviderLoginCommand(providerId)}.`
}

export function resolveProviderReadinessVerdict(
  providerId: ProviderId,
  health?: ProviderHealth | null,
  auth?: ProviderAuthStatus | null,
): ProviderReadinessVerdict {
  const providerLabel = PROVIDER_LABELS[providerId]
  const available = typeof health?.available === "boolean" ? health.available : undefined
  const authenticated = Boolean(auth?.authenticated)
  const authState = auth?.state ?? "unknown"

  if (typeof available !== "boolean") {
    return {
      badgeVariant: "outline",
      badgeLabel: "Checking",
      title: `${providerLabel} provider status is loading`,
      description: "Refreshing CLI and sign-in diagnostics for the current provider.",
      blocking: false,
    }
  }

  if (!available) {
    return {
      badgeVariant: "destructive",
      badgeLabel: "Needs setup",
      title: `${providerLabel} is not ready`,
      description: "The CLI is missing or unavailable. Fix this before running flows with this provider.",
      blocking: true,
    }
  }

  if (authenticated) {
    return {
      badgeVariant: "success",
      badgeLabel: "Ready",
      title: `${providerLabel} is ready`,
      description: "Flows can run with this provider without additional setup.",
      blocking: false,
    }
  }

  if (providerId === "codex" && authState === "unknown") {
    return {
      badgeVariant: "warning",
      badgeLabel: "Check sign-in",
      title: `${providerLabel} may still be ready`,
      description: "The CLI is available, but sign-in could not be confirmed from the app. ChatGPT login or an app-managed API key may still work.",
      blocking: false,
    }
  }

  if (authState === "unknown") {
    return {
      badgeVariant: "warning",
      badgeLabel: "Check sign-in",
      title: `${providerLabel} needs attention`,
      description: "The CLI is installed, but sign-in status could not be confirmed from the app.",
      blocking: true,
    }
  }

  return {
    badgeVariant: "warning",
    badgeLabel: "Needs sign-in",
    title: `${providerLabel} needs sign-in`,
    description: "Sign in to this provider before running new flows or resuming saved work.",
    blocking: true,
  }
}

export function resolveProviderBannerState(
  providerId: ProviderId,
  health?: ProviderHealth | null,
  auth?: ProviderAuthStatus | null,
): ProviderBannerState | null {
  const verdict = resolveProviderReadinessVerdict(providerId, health, auth)
  if (!verdict.blocking) return null

  if (!health?.available) {
    return {
      message: providerSetupMessage(providerId, health),
      tone: "danger",
      dismissKey: `${providerId}:setup`,
    }
  }

  return {
    message: providerSignInMessage(providerId, auth),
    tone: "warning",
    dismissKey: `${providerId}:${auth?.state ?? "unknown"}`,
  }
}
