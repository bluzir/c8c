export interface ClaudeSpawnOptions {
  claudePath?: string
  workdir: string
  prompt: string
  model?: string
  maxTurns?: number
  permissionMode?: string
  systemPrompts?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  settingSources?: string[]
  addDirs?: string[]
  extraArgs?: string[]
  extraEnv?: Record<string, string>
  timeout?: number
  abortSignal?: AbortSignal
  onSpawn?: (pid: number) => void
  onStdout?: (data: Buffer) => void
  onStderr?: (data: Buffer) => void
}

export interface ClaudeSpawnResult {
  success: boolean
  exitCode: number | null
  signal: string | null
  killed: boolean
  aborted: boolean
  durationMs: number
  pid?: number
}
