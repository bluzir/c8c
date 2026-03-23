/**
 * Extracts a user-safe message from an unknown thrown value.
 *
 * - Error instances → error.message (first line only, strips stack traces)
 * - Strings → returned as-is (first line only)
 * - Everything else → fallback
 */
export function errorToUserMessage(
  error: unknown,
  fallback = "An unexpected error occurred.",
): string {
  let raw: string | undefined

  if (error instanceof Error && error.message.trim()) {
    raw = error.message
  } else if (typeof error === "string" && error.trim()) {
    raw = error
  }

  if (!raw) return fallback

  // Strip anything after the first newline — stack traces, multi-line internals
  const firstLine = raw.split("\n")[0].trim()
  return firstLine || fallback
}
