type ResponseHeaders = Record<string, string[] | undefined>

function parseRendererOrigin(rendererUrl: string | undefined): string | null {
  if (!rendererUrl) return null
  try {
    const url = new URL(rendererUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

function toWebSocketOrigin(origin: string): string {
  return origin.startsWith("https:")
    ? origin.replace(/^https:/, "wss:")
    : origin.replace(/^http:/, "ws:")
}

function joinSources(...sources: string[]): string {
  return [...new Set(sources.filter((source) => source.length > 0))].join(" ")
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === "https:" || url.protocol === "mailto:"
  } catch {
    return false
  }
}

export function buildRendererContentSecurityPolicy(rendererUrl?: string): string {
  const rendererOrigin = parseRendererOrigin(rendererUrl)
  const websocketOrigin = rendererOrigin ? toWebSocketOrigin(rendererOrigin) : ""
  const isDevRenderer = Boolean(rendererOrigin)
  const scriptSources = isDevRenderer
    ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", rendererOrigin ?? ""]
    : ["'self'"]

  const directives = [
    `default-src ${joinSources("'self'")}`,
    `script-src ${joinSources(...scriptSources)}`,
    `style-src ${joinSources("'self'", "'unsafe-inline'", rendererOrigin ?? "")}`,
    `img-src ${joinSources("'self'", "data:", "blob:", "https:", rendererOrigin ?? "")}`,
    `font-src ${joinSources("'self'", "data:", rendererOrigin ?? "")}`,
    `connect-src ${joinSources("'self'", rendererOrigin ?? "", websocketOrigin)}`,
    `worker-src ${joinSources("'self'", "blob:")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]

  return directives.join("; ")
}

export function applyContentSecurityPolicyHeader(
  responseHeaders: ResponseHeaders | undefined,
  policy: string,
): ResponseHeaders {
  const nextHeaders = Object.fromEntries(
    Object.entries(responseHeaders ?? {}).filter(([key]) => key.toLowerCase() !== "content-security-policy"),
  ) as ResponseHeaders
  nextHeaders["Content-Security-Policy"] = [policy]
  return nextHeaders
}

export function shouldApplyRendererCsp(requestUrl: string, rendererUrl?: string): boolean {
  const rendererOrigin = parseRendererOrigin(rendererUrl)
  try {
    const parsed = new URL(requestUrl)
    if (rendererOrigin) {
      return parsed.origin === rendererOrigin
    }
    return parsed.protocol === "file:"
  } catch {
    return false
  }
}
