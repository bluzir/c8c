import type {
  TelemetryClient,
  TelemetryPropertyValue,
  TelemetryTrackEvent,
} from "../types"

interface PosthogTelemetryClientOptions {
  host: string
  apiKey: string
  consent: boolean
  requestTimeoutMs?: number
}

function normalizeHost(rawHost: string): string {
  return rawHost.replace(/\/+$/, "")
}

export class PosthogTelemetryClient implements TelemetryClient {
  readonly provider = "posthog" as const

  private readonly host: string
  private readonly apiKey: string
  private readonly requestTimeoutMs: number
  private consent: boolean
  private readonly pendingRequests = new Set<Promise<void>>()

  constructor(options: PosthogTelemetryClientOptions) {
    this.host = normalizeHost(options.host)
    this.apiKey = options.apiKey
    this.consent = options.consent
    this.requestTimeoutMs = options.requestTimeoutMs ?? 4_000
  }

  setConsent(enabled: boolean): void {
    this.consent = enabled
  }

  async track(event: TelemetryTrackEvent): Promise<void> {
    if (!this.consent || !this.apiKey || !this.host) return

    const payload = {
      api_key: this.apiKey,
      event: event.name,
      distinct_id: event.distinctId,
      timestamp: event.timestamp,
      properties: {
        ...event.properties,
        distinct_id: event.distinctId,
      },
    }

    await this.enqueueJsonPost("/capture/", payload)
  }

  async identify(
    distinctId: string,
    traits?: Record<string, TelemetryPropertyValue>,
  ): Promise<void> {
    if (!this.consent || !this.apiKey || !this.host) return
    if (!traits || Object.keys(traits).length === 0) return

    const payload = {
      api_key: this.apiKey,
      event: "$identify",
      distinct_id: distinctId,
      properties: {
        distinct_id: distinctId,
        $set: traits,
      },
    }

    await this.enqueueJsonPost("/capture/", payload)
  }

  async flush(): Promise<void> {
    if (this.pendingRequests.size === 0) return
    await Promise.allSettled([...this.pendingRequests])
  }

  async shutdown(): Promise<void> {
    await this.flush()
  }

  private enqueueJsonPost(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const request = this.postJson(path, payload)
    this.pendingRequests.add(request)
    void request.finally(() => this.pendingRequests.delete(request))
    return request
  }

  private async postJson(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    try {
      await fetch(`${this.host}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch {
      // Telemetry failures are intentionally non-fatal.
    } finally {
      clearTimeout(timeout)
    }
  }
}
