export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}
