import { homedir, tmpdir } from "node:os"
import { join, resolve, relative } from "node:path"

interface AppPathReader {
  getPath(name: "home" | "userData"): string
}

interface AppPathWriter extends AppPathReader {
  setPath(name: "userData" | "sessionData", path: string): void
}

function envFlag(value: string | undefined): boolean {
  return value === "1" || value === "true"
}

function resolveEnvPath(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? resolve(trimmed) : null
}

function safeGetPath(
  app: AppPathReader | null | undefined,
  name: "home" | "userData",
): string | null {
  try {
    const value = app?.getPath(name)
    return value ? resolve(value) : null
  } catch {
    return null
  }
}

export function isTestMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlag(env.C8C_TEST_MODE)
}

export function shouldSuppressStartupSideEffects(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isTestMode(env) || envFlag(env.C8C_DISABLE_STARTUP_SIDE_EFFECTS)
}

export function resolveAppHomeDir({
  env = process.env,
  app,
}: {
  env?: NodeJS.ProcessEnv
  app?: AppPathReader | null
} = {}): string {
  const override = resolveEnvPath(env.C8C_TEST_HOME_DIR)
  if (override) return override
  if (isTestMode(env)) return resolve(join(tmpdir(), "c8c-test-home"))
  return safeGetPath(app, "home") || resolve(homedir())
}

export function resolveAppUserDataDir({
  env = process.env,
  app,
}: {
  env?: NodeJS.ProcessEnv
  app?: AppPathReader | null
} = {}): string {
  const override = resolveEnvPath(env.C8C_TEST_USER_DATA_DIR)
  if (override) return override
  if (isTestMode(env)) {
    return resolve(join(resolveAppHomeDir({ env, app }), ".c8c-test-user-data"))
  }
  return (
    safeGetPath(app, "userData") ||
    resolve(join(resolveAppHomeDir({ env, app }), ".c8c-user-data"))
  )
}

export function applyRuntimePathOverrides({
  app,
  env = process.env,
}: {
  app: AppPathWriter
  env?: NodeJS.ProcessEnv
}) {
  if (!isTestMode(env)) return null

  const homeDir = resolveAppHomeDir({ env, app })
  const userDataDir = resolveAppUserDataDir({ env, app })
  app.setPath("userData", userDataDir)
  app.setPath("sessionData", join(userDataDir, "session-data"))

  return {
    homeDir,
    userDataDir,
  }
}

export function isPathWithin(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  const rel = relative(resolvedRoot, resolvedCandidate)
  return rel === "" || (!rel.startsWith("..") && !rel.includes("..\\"))
}
