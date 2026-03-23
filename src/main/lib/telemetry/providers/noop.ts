import type {
  TelemetryClient,
  TelemetryPropertyValue,
  TelemetryTrackEvent,
} from "../types"

export function createNoopTelemetryClient(): TelemetryClient {
  return {
    provider: "noop",
    setConsent() {
      // noop
    },
    async track(_event: TelemetryTrackEvent): Promise<void> {
      // noop
    },
    async identify(
      _distinctId: string,
      _traits?: Record<string, TelemetryPropertyValue>,
    ): Promise<void> {
      // noop
    },
    async flush(): Promise<void> {
      // noop
    },
    async shutdown(): Promise<void> {
      // noop
    },
  }
}
