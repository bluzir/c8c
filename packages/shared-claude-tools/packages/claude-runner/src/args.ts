export interface BuildClaudeArgsOptions {
  model?: string
  maxTurns?: number
  permissionMode?: string
  systemPrompts?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  settingSources?: string[]
  addDirs?: string[]
  extraArgs?: string[]
  prompt: string
}

/**
 * Build CLI arguments for `claude --print`.
 * Prompt is placed before variadic flags (--add-dir, --allowedTools).
 */
export function buildClaudeArgs(options: BuildClaudeArgsOptions): string[] {
  const args = ["--print"]

  if (options.model) {
    args.push("--model", options.model)
  }

  if (options.maxTurns) {
    args.push("--max-turns", String(options.maxTurns))
  }

  if (options.permissionMode) {
    args.push("--permission-mode", options.permissionMode)
  }

  if (options.systemPrompts?.length) {
    args.push("--append-system-prompt", options.systemPrompts.join("\n\n"))
  }

  if (options.settingSources) {
    args.push("--setting-sources", options.settingSources.join(","))
  }

  if (options.extraArgs?.length) {
    args.push(...options.extraArgs)
  }

  // Short prompts go as CLI arg; long prompts are piped via stdin
  // (to avoid ARG_MAX / shell escaping issues).
  // When using stdin, we omit the prompt from args and the caller
  // must write it to the child's stdin.
  if (options.prompt.length <= 4096) {
    args.push(options.prompt)
  }
  // else: prompt omitted — caller pipes via stdin

  if (options.addDirs?.length) {
    args.push("--add-dir", ...options.addDirs)
  }

  if (options.allowedTools?.length) {
    args.push("--allowedTools", options.allowedTools.join(","))
  }

  if (options.disallowedTools?.length) {
    args.push("--disallowedTools", options.disallowedTools.join(","))
  }

  return args
}
