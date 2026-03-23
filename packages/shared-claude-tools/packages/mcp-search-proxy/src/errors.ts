export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export function looksLikeAuthOrQuotaError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("402") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("payment required") ||
    m.includes("api key") ||
    m.includes("invalid key") ||
    m.includes("insufficient") ||
    m.includes("quota") ||
    m.includes("credit") ||
    m.includes("credits") ||
    m.includes("balance") ||
    m.includes("billing")
  )
}

export function looksLikeRateLimitError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("429") ||
    m.includes("rate limit") ||
    m.includes("too many requests")
  )
}

export function extractTextFromToolContent(content: unknown): string {
  if (!Array.isArray(content)) return ""
  const texts: string[] = []
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      const t = (block as { text: string }).text.trim()
      if (t) texts.push(t)
    }
  }
  return texts.join("\n")
}
