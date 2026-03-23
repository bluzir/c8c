/**
 * Known Claude Code built-in tool names.
 */
export const KNOWN_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "NotebookEdit",
  "Agent",
])

/**
 * Validate tool names against known tools.
 * Recognizes `mcp__*` pattern as valid (MCP server tools).
 * Returns arrays of valid and unknown tool names.
 */
export function validateToolNames(tools: string[]): {
  valid: string[]
  unknown: string[]
} {
  const valid: string[] = []
  const unknown: string[] = []

  for (const tool of tools) {
    if (KNOWN_TOOLS.has(tool) || tool.startsWith("mcp__")) {
      valid.push(tool)
    } else {
      unknown.push(tool)
    }
  }

  return { valid, unknown }
}
