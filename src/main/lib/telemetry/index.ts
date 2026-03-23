import { createNoopTelemetryClient } from "./providers/noop"
import { PosthogTelemetryClient } from "./providers/posthog"
import type { TelemetryClient, TelemetryProviderConfig } from "./types"

export function createTelemetryClient(
  config: TelemetryProviderConfig,
): TelemetryClient {
  if (config.provider !== "posthog") {
    return createNoopTelemetryClient()
  }

  if (!config.posthogApiKey || !config.posthogHost) {
    return createNoopTelemetryClient()
  }

  return new PosthogTelemetryClient({
    host: config.posthogHost,
    apiKey: config.posthogApiKey,
    consent: config.consent,
  })
}
