export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function trimTrailingZero(value: string): string {
  return value.replace(/\.0$/, "")
}

export function formatTokenFootprint(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0 tokens"

  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    const compact =
      millions >= 10
        ? String(Math.round(millions))
        : trimTrailingZero(millions.toFixed(1))
    return `~${compact}M tokens`
  }

  if (tokens >= 1_000) {
    const thousands = tokens / 1_000
    const compact =
      thousands >= 10
        ? String(Math.round(thousands))
        : trimTrailingZero(thousands.toFixed(1))
    return `~${compact}K tokens`
  }

  if (tokens >= 100) {
    return `~${Math.round(tokens / 10) * 10} tokens`
  }

  return `${Math.round(tokens)} tokens`
}

export function formatCost(usd: number): string {
  if (usd < 0.001) return "<$0.001"
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = ((ms % 60_000) / 1_000).toFixed(0)
  return `${mins}m ${secs}s`
}

/**
 * Compact elapsed time from an epoch start timestamp.
 * Returns e.g. "12s", "2m", "1h 3m".
 */
export function formatElapsedCompact(
  startedAt: number,
  now = Date.now(),
): string {
  const s = Math.max(0, Math.round((now - startedAt) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  })
}
