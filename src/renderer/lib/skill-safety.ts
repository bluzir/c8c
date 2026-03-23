// ── Skill Safety Analysis ───────────────────────────────
//
// Surface-level pattern detection for skill content and tool
// permissions. This is visibility/transparency — not a sandbox.

export interface SkillSafetyWarning {
  severity: "danger" | "warning" | "info"
  message: string
}

// ── Destructive command patterns ────────────────────────

const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\brm\s+-r(f)?\b/i,
    message: "This skill contains destructive file removal commands",
  },
  {
    pattern: /\brm\s+-f(r)?\b/i,
    message: "This skill contains destructive file removal commands",
  },
  {
    pattern: /\bdel\s+\//i,
    message: "This skill contains destructive delete commands",
  },
  {
    pattern: /\bformat\s+[A-Z]:/i,
    message: "This skill contains disk format commands",
  },
  {
    pattern: /\bDROP\s+TABLE\b/i,
    message: "This skill contains destructive database commands",
  },
  {
    pattern: /\bDELETE\s+FROM\b/i,
    message: "This skill contains destructive database commands",
  },
]

// ── Outbound data patterns ──────────────────────────────

const OUTBOUND_PATTERNS: Array<{ pattern: RegExp }> = [
  { pattern: /\bcurl\b/ },
  { pattern: /\bwget\b/ },
  { pattern: /\bfetch\s*\(/ },
  { pattern: /https?:\/\/[^\s"')]+/ },
]

// ── Outside-project path patterns ───────────────────────

const OUTSIDE_PROJECT_PATTERNS: Array<{ pattern: RegExp }> = [
  { pattern: /~\// },
  { pattern: /\/etc\// },
  { pattern: /\/usr\// },
  { pattern: /\$HOME\b/ },
]

// ── Shell-execution tool names ──────────────────────────

const SHELL_TOOLS = new Set(["Bash", "Execute"])
const FILE_MUTATION_TOOLS = new Set(["Write", "Edit"])

/**
 * Analyze skill markdown content and its allowed tools for
 * potentially dangerous patterns. Returns an array of warnings
 * ordered by severity (danger → warning → info).
 */
export function analyzeSkillSafety(
  skillContent: string,
  allowedTools?: string[],
): SkillSafetyWarning[] {
  const warnings: SkillSafetyWarning[] = []
  const seen = new Set<string>()

  // Check for destructive commands in the content
  for (const { pattern, message } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(skillContent) && !seen.has(message)) {
      seen.add(message)
      warnings.push({ severity: "danger", message })
    }
  }

  // Check for outbound network patterns
  const hasOutbound = OUTBOUND_PATTERNS.some(({ pattern }) =>
    pattern.test(skillContent),
  )
  if (hasOutbound) {
    warnings.push({
      severity: "danger",
      message: "This skill may send data to external servers",
    })
  }

  // Check allowed tools for shell execution
  const tools = allowedTools ?? []
  const hasShellTool = tools.some((tool) => SHELL_TOOLS.has(tool))
  if (hasShellTool) {
    warnings.push({
      severity: "warning",
      message: "This skill can execute arbitrary shell commands",
    })
  }

  // Check for outside-project paths
  const hasOutsidePaths = OUTSIDE_PROJECT_PATTERNS.some(({ pattern }) =>
    pattern.test(skillContent),
  )
  if (hasOutsidePaths) {
    warnings.push({
      severity: "warning",
      message: "This skill may access files outside your project",
    })
  }

  // Check allowed tools for file mutation
  const hasFileMutationTool = tools.some((tool) =>
    FILE_MUTATION_TOOLS.has(tool),
  )
  if (hasFileMutationTool) {
    warnings.push({
      severity: "info",
      message: "This skill can modify files in your project",
    })
  }

  return warnings
}
