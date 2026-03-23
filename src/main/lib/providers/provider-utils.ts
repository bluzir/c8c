export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function execErrorOutput(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const stdout =
      "stdout" in error && typeof error.stdout === "string" ? error.stdout : ""
    const stderr =
      "stderr" in error && typeof error.stderr === "string" ? error.stderr : ""
    const combined = [stdout, stderr].filter(Boolean).join("\n").trim()
    if (combined) return combined
  }
  return errorMessage(error)
}

export function normalizeCliText(text: string): string {
  return text
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
