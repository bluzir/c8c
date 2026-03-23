import { homedir } from "node:os"
import { delimiter } from "node:path"

/**
 * Extend PATH with common directories where CLI tools are installed.
 * Packaged Electron apps inherit a minimal PATH that misses these.
 */
function extendPath(existing: string | undefined): string {
  const home = homedir()
  const extras = [
    `${home}/.local/bin`,
    `${home}/.claude/local`,
    `${home}/.claude/local/node_modules/.bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ]
  const parts = [...extras, ...(existing ? existing.split(delimiter) : [])]
  return [...new Set(parts)].join(delimiter)
}

/**
 * Build a clean environment for spawning Claude CLI.
 * Strips CLAUDE* vars (except CLAUDE_PATH), LD_*, and DYLD_* to prevent
 * "nested session" rejection and .so injection.
 * Extends PATH to include common CLI installation directories.
 */
export function cleanEnv(
  extra?: Record<string, string>,
): Record<string, string> {
  const filtered = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => {
      if (k === "CLAUDE_PATH") return true
      if (k.startsWith("CLAUDE")) return false
      if (k.startsWith("LD_")) return false
      if (k.startsWith("DYLD_")) return false
      return true
    }),
  ) as Record<string, string>

  filtered.PATH = extendPath(filtered.PATH)

  if (extra) {
    Object.assign(filtered, extra)
  }

  return filtered
}
