import { realpath } from "node:fs/promises"
import { resolve } from "node:path"

/**
 * Validate a skill/agent reference name.
 * Rejects empty strings, absolute paths, path traversal, and path separators.
 */
export function validateRef(ref: string): void {
  if (!ref || ref.trim().length === 0) {
    throw new Error("Reference name must not be empty")
  }

  if (ref.startsWith("/") || ref.startsWith("\\") || /^[A-Za-z]:/.test(ref)) {
    throw new Error(`Reference must not be an absolute path: ${ref}`)
  }

  if (ref.includes("..")) {
    throw new Error(`Reference must not contain path traversal (..): ${ref}`)
  }

  if (ref.includes("/") || ref.includes("\\")) {
    throw new Error(`Reference must not contain path separators: ${ref}`)
  }
}

/**
 * Resolve a candidate path and verify it stays within the base directory.
 * Resolves symlinks via realpath to prevent symlink escapes.
 * Returns the resolved absolute path.
 */
export async function assertContainedPath(
  base: string,
  candidate: string,
): Promise<string> {
  const resolvedBase = await realpath(base)
  const resolvedCandidate = await realpath(resolve(base, candidate))

  if (
    !resolvedCandidate.startsWith(resolvedBase + "/") &&
    resolvedCandidate !== resolvedBase
  ) {
    throw new Error(
      `Path escapes base directory: ${resolvedCandidate} is not inside ${resolvedBase}`,
    )
  }

  return resolvedCandidate
}
