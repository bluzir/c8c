function sanitizeInvalidUnicode(value: string): string {
  let out = ""

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    const isHigh = code >= 0xd800 && code <= 0xdbff
    const isLow = code >= 0xdc00 && code <= 0xdfff

    if (isHigh) {
      const next = value.charCodeAt(i + 1)
      const nextIsLow = next >= 0xdc00 && next <= 0xdfff
      if (nextIsLow) {
        out += value[i] + value[i + 1]
        i++
      } else {
        out += "\uFFFD"
      }
      continue
    }

    if (isLow) {
      out += "\uFFFD"
      continue
    }

    out += value[i]
  }

  return out
}

export function sanitizeJsonPayload<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeInvalidUnicode(value) as T
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonPayload(entry)) as T
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      sanitized[key] = sanitizeJsonPayload(entry)
    }
    return sanitized as T
  }

  return value
}
