/**
 * Token bucket rate limiter with jitter for proactive throttling.
 *
 * Each MCP proxy process gets its own bucket — no cross-process coordination needed
 * since 1 proxy = 1 Claude session.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Returns baseMs ± (baseMs * factor * random).
 * e.g. jitterMs(1000, 0.5) → 500..1500ms
 */
export function jitterMs(baseMs: number, factor = 0.5): number {
  const spread = baseMs * factor
  return baseMs - spread + Math.random() * spread * 2
}

export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private maxTokens: number,
    private refillPerSecond: number,
  ) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillPerSecond,
    )
    this.lastRefill = now
  }

  async acquire(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }
    // Wait until next token is available + jitter to prevent thundering herd
    const waitMs = ((1 - this.tokens) / this.refillPerSecond) * 1000
    await sleep(waitMs + Math.random() * 500)
    this.refill()
    this.tokens = Math.max(0, this.tokens - 1)
  }
}
