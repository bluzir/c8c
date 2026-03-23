import { app } from "electron"
import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type {
  BuildFlavor,
  TelemetryProvider,
  TelemetrySettings,
  TelemetryUiEvent,
} from "@shared/types"
import { createTelemetryClient } from "./index"
import { writeFileAtomic } from "../atomic-write"
import { logWarn } from "../structured-log"
import type {
  TelemetryClient,
  TelemetryEventName,
  TelemetryPropertyValue,
} from "./types"

interface TelemetryPersistedState {
  consent: boolean
  distinctId: string
  consentSource: "default" | "user"
}

const BLOCKED_KEY_PARTS = [
  "prompt",
  "content",
  "path",
  "token",
  "secret",
  "key",
  "auth",
]
const STRING_VALUE_LIMIT = 240

const buildFlavor: BuildFlavor = __BUILD_FLAVOR__
const releaseChannel: "stable" | "beta" = __RELEASE_CHANNEL__
const configuredProvider: TelemetryProvider = __TELEMETRY_PROVIDER__
const telemetryLocalTest = __TELEMETRY_LOCAL_TEST__
const configHasPosthogCreds =
  Boolean(__POSTHOG_HOST__) && Boolean(__POSTHOG_KEY__)
const telemetryAvailableInBuild =
  __TELEMETRY_ENABLED__ &&
  configuredProvider === "posthog" &&
  configHasPosthogCreds

let telemetryClient: TelemetryClient = createTelemetryClient({
  provider: "noop",
  posthogHost: "",
  posthogApiKey: "",
  consent: false,
})
let telemetryState: TelemetryPersistedState = {
  consent: telemetryAvailableInBuild,
  distinctId: randomUUID(),
  consentSource: "default",
}
let initPromise: Promise<void> | null = null
const sessionId = randomUUID()

function telemetryStatePath(): string {
  return join(app.getPath("userData"), "telemetry-settings.json")
}

function sanitizeKey(rawKey: string): string | null {
  const key = rawKey.trim().toLowerCase()
  if (!key) return null
  if (BLOCKED_KEY_PARTS.some((blocked) => key.includes(blocked))) return null
  return key
}

function sanitizeValue(value: unknown): TelemetryPropertyValue | undefined {
  if (typeof value === "string") return value.slice(0, STRING_VALUE_LIMIT)
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "boolean") return value
  if (value === null) return null
  return undefined
}

function sanitizePayload(
  payload: Record<string, unknown> | undefined,
): Record<string, TelemetryPropertyValue> {
  if (!payload) return {}
  const out: Record<string, TelemetryPropertyValue> = {}
  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = sanitizeKey(rawKey)
    if (!key) continue
    const value = sanitizeValue(rawValue)
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

async function loadPersistedState(): Promise<TelemetryPersistedState> {
  try {
    const raw = await readFile(telemetryStatePath(), "utf-8")
    const parsed = JSON.parse(raw) as Partial<TelemetryPersistedState>
    const parsedConsentSource =
      parsed.consentSource === "user" || parsed.consentSource === "default"
        ? parsed.consentSource
        : undefined
    const parsedConsent =
      typeof parsed.consent === "boolean" ? parsed.consent : undefined
    const consentSource: "default" | "user" = parsedConsentSource ?? "default"
    const consent =
      consentSource === "default"
        ? telemetryAvailableInBuild
        : Boolean(parsedConsent)

    return {
      consent,
      distinctId:
        typeof parsed.distinctId === "string" &&
        parsed.distinctId.trim().length > 0
          ? parsed.distinctId
          : randomUUID(),
      consentSource,
    }
  } catch {
    return {
      consent: telemetryAvailableInBuild,
      distinctId: randomUUID(),
      consentSource: "default",
    }
  }
}

async function persistState(): Promise<void> {
  const path = telemetryStatePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomic(path, JSON.stringify(telemetryState, null, 2))
}

function resetTelemetryClientToNoop(): void {
  telemetryClient = createTelemetryClient({
    provider: "noop",
    posthogHost: "",
    posthogApiKey: "",
    consent: false,
  })
}

function currentAppVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return "0.0.0"
  }
}

function baseProperties(): Record<string, TelemetryPropertyValue> {
  return {
    event_version: 1,
    app_version: currentAppVersion(),
    build_flavor: buildFlavor,
    release_channel: releaseChannel,
    telemetry_local_test: telemetryLocalTest,
    telemetry_provider: telemetryClient.provider,
    platform: process.platform,
    arch: process.arch,
    session_id: sessionId,
  }
}

export async function initTelemetryService(): Promise<void> {
  if (initPromise) {
    await initPromise
    return
  }

  initPromise = (async () => {
    try {
      telemetryState = await loadPersistedState()
      telemetryClient = createTelemetryClient({
        provider: telemetryAvailableInBuild ? configuredProvider : "noop",
        posthogHost: __POSTHOG_HOST__,
        posthogApiKey: __POSTHOG_KEY__,
        consent: telemetryAvailableInBuild && telemetryState.consent,
      })

      if (telemetryState.consent && !telemetryAvailableInBuild) {
        telemetryState = {
          ...telemetryState,
          consent: false,
          consentSource: "default",
        }
        await persistState()
      }
    } catch (error) {
      resetTelemetryClientToNoop()
      telemetryState = {
        ...telemetryState,
        consent: false,
        consentSource: "default",
      }
      initPromise = null
      logWarn("telemetry-service", "init_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })()

  await initPromise
}

export async function getTelemetrySettings(): Promise<TelemetrySettings> {
  await initTelemetryService()
  return {
    buildFlavor,
    provider: telemetryAvailableInBuild ? configuredProvider : "noop",
    enabledInBuild: telemetryAvailableInBuild,
    consent: telemetryState.consent && telemetryAvailableInBuild,
    telemetryLocalTest,
    configDetected: configHasPosthogCreds,
  }
}

export async function setTelemetryConsent(
  enabled: boolean,
): Promise<TelemetrySettings> {
  await initTelemetryService()

  const nextConsent = telemetryAvailableInBuild && Boolean(enabled)
  if (telemetryState.consent === nextConsent) {
    return getTelemetrySettings()
  }

  if (telemetryState.consent && !nextConsent) {
    await trackTelemetryEvent("telemetry_consent_updated", { enabled: false })
  }

  telemetryState = {
    ...telemetryState,
    consent: nextConsent,
    consentSource: "user",
  }
  telemetryClient.setConsent(nextConsent)
  await persistState()

  if (nextConsent) {
    await telemetryClient.identify(telemetryState.distinctId, {
      build_flavor: buildFlavor,
      release_channel: releaseChannel,
    })
    await trackTelemetryEvent("telemetry_consent_updated", { enabled: true })
  }

  return getTelemetrySettings()
}

export async function trackTelemetryEvent(
  name: TelemetryEventName,
  payload?: Record<string, unknown>,
): Promise<void> {
  await initTelemetryService()
  const properties = {
    ...baseProperties(),
    ...sanitizePayload(payload),
  }
  await telemetryClient.track({
    name,
    distinctId: telemetryState.distinctId,
    timestamp: new Date().toISOString(),
    properties,
  })
}

export async function trackTelemetryUiEvent(
  name: TelemetryUiEvent,
): Promise<void> {
  if (name === "settings_opened") {
    await trackTelemetryEvent("settings_opened")
  }
}

export async function flushTelemetryService(): Promise<void> {
  await initTelemetryService()
  await telemetryClient.flush()
}

export async function shutdownTelemetryService(): Promise<void> {
  await initTelemetryService()
  await telemetryClient.shutdown()
}
