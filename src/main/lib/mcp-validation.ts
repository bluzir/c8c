import type {
  McpServerInfo,
  McpServerScope,
  McpTransportType,
  ProviderId,
} from "@shared/types"

export interface NormalizedMcpServerEntry {
  type: McpTransportType
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeOptionalString(
  value: unknown,
  field: string,
  subject: string,
): ValidationResult<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined }
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${subject} field "${field}" must be a string.` }
  }
  const normalized = value.trim()
  return { ok: true, value: normalized || undefined }
}

function normalizeOptionalBoolean(
  value: unknown,
  field: string,
  subject: string,
): ValidationResult<boolean | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined }
  }
  if (typeof value !== "boolean") {
    return {
      ok: false,
      error: `${subject} field "${field}" must be a boolean.`,
    }
  }
  return { ok: true, value }
}

function normalizeStringArray(
  value: unknown,
  field: string,
  subject: string,
): ValidationResult<string[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined }
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return {
      ok: false,
      error: `${subject} field "${field}" must be a string array.`,
    }
  }

  const normalized = value.map((item) => item.trim()).filter(Boolean)

  return { ok: true, value: normalized.length > 0 ? normalized : undefined }
}

function normalizeStringRecord(
  value: unknown,
  field: string,
  subject: string,
): ValidationResult<Record<string, string> | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined }
  }
  if (!isObject(value)) {
    return {
      ok: false,
      error: `${subject} field "${field}" must be a string map.`,
    }
  }

  const entries = Object.entries(value)
  if (entries.some(([, item]) => typeof item !== "string")) {
    return {
      ok: false,
      error: `${subject} field "${field}" must be a string map.`,
    }
  }

  return {
    ok: true,
    value:
      entries.length > 0
        ? Object.fromEntries(entries as [string, string][])
        : undefined,
  }
}

function normalizeTransportType(
  value: unknown,
  subject: string,
): ValidationResult<McpTransportType | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined }
  }
  if (value === "stdio" || value === "http" || value === "sse") {
    return { ok: true, value }
  }
  return {
    ok: false,
    error: `${subject} field "type" must be one of "stdio", "http", or "sse".`,
  }
}

function resolveTransport(
  explicitType: McpTransportType | undefined,
  fields: {
    command?: string
    args?: string[]
    url?: string
    env?: Record<string, string>
    headers?: Record<string, string>
  },
  subject: string,
): ValidationResult<McpTransportType> {
  const hasStdioFields = Boolean(fields.command || fields.args || fields.env)
  const hasRemoteFields = Boolean(fields.url || fields.headers)

  if (
    (hasStdioFields && hasRemoteFields) ||
    (explicitType === "stdio" && hasRemoteFields) ||
    ((explicitType === "http" || explicitType === "sse") && hasStdioFields)
  ) {
    return {
      ok: false,
      error: `${subject} uses mixed stdio and remote transport fields.`,
    }
  }

  const inferredType =
    explicitType ??
    (hasStdioFields ? "stdio" : hasRemoteFields ? "http" : undefined)
  if (!inferredType) {
    return {
      ok: false,
      error: `${subject} must define either a stdio command or a remote url.`,
    }
  }

  if (inferredType === "stdio") {
    if (!fields.command) {
      return {
        ok: false,
        error: `${subject} stdio transport requires a non-empty command.`,
      }
    }
    return { ok: true, value: inferredType }
  }

  if (!fields.url) {
    return {
      ok: false,
      error: `${subject} ${inferredType} transport requires a non-empty url.`,
    }
  }

  return { ok: true, value: inferredType }
}

function normalizeScope(
  value: unknown,
  subject: string,
): ValidationResult<McpServerScope> {
  if (value === "local" || value === "project" || value === "user") {
    return { ok: true, value }
  }
  return {
    ok: false,
    error: `${subject} field "scope" must be one of "local", "project", or "user".`,
  }
}

function normalizeProvider(
  value: unknown,
  subject: string,
): ValidationResult<ProviderId | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined }
  }
  if (value === "claude" || value === "codex") {
    return { ok: true, value }
  }
  return {
    ok: false,
    error: `${subject} field "provider" must be "claude" or "codex".`,
  }
}

function normalizeTransportFields(
  raw: Record<string, unknown>,
  subject: string,
): ValidationResult<NormalizedMcpServerEntry> {
  const typeResult = normalizeTransportType(raw.type, subject)
  if (!typeResult.ok) return typeResult

  const commandResult = normalizeOptionalString(raw.command, "command", subject)
  if (!commandResult.ok) return commandResult

  const argsResult = normalizeStringArray(raw.args, "args", subject)
  if (!argsResult.ok) return argsResult

  const urlResult = normalizeOptionalString(raw.url, "url", subject)
  if (!urlResult.ok) return urlResult

  const envResult = normalizeStringRecord(raw.env, "env", subject)
  if (!envResult.ok) return envResult

  const headersResult = normalizeStringRecord(raw.headers, "headers", subject)
  if (!headersResult.ok) return headersResult

  const disabledResult = normalizeOptionalBoolean(
    raw.disabled,
    "disabled",
    subject,
  )
  if (!disabledResult.ok) return disabledResult

  const autoApproveResult = normalizeStringArray(
    raw.autoApprove,
    "autoApprove",
    subject,
  )
  if (!autoApproveResult.ok) return autoApproveResult

  const transportResult = resolveTransport(
    typeResult.value,
    {
      command: commandResult.value,
      args: argsResult.value,
      url: urlResult.value,
      env: envResult.value,
      headers: headersResult.value,
    },
    subject,
  )
  if (!transportResult.ok) return transportResult

  return {
    ok: true,
    value: {
      type: transportResult.value,
      command: commandResult.value,
      args: argsResult.value,
      url: urlResult.value,
      env: envResult.value,
      headers: headersResult.value,
      disabled: disabledResult.value,
      autoApprove: autoApproveResult.value,
    },
  }
}

export function normalizeMcpConfigEntry(
  name: unknown,
  raw: unknown,
): ValidationResult<{ name: string; entry: NormalizedMcpServerEntry }> {
  const normalizedNameResult = validateMcpServerName(name)
  if (!normalizedNameResult.ok) return normalizedNameResult
  if (!isObject(raw)) {
    return {
      ok: false,
      error: `MCP server "${normalizedNameResult.value}" entry must be an object.`,
    }
  }

  const entryResult = normalizeTransportFields(
    raw,
    `MCP server "${normalizedNameResult.value}"`,
  )
  if (!entryResult.ok) return entryResult

  return {
    ok: true,
    value: {
      name: normalizedNameResult.value,
      entry: entryResult.value,
    },
  }
}

export function validateMcpServerInfo(
  server: unknown,
): ValidationResult<McpServerInfo> {
  if (!isObject(server)) {
    return { ok: false, error: "MCP server payload must be an object." }
  }

  const nameResult = validateMcpServerName(server.name)
  if (!nameResult.ok) return nameResult

  const scopeResult = normalizeScope(
    server.scope,
    `MCP server "${nameResult.value}"`,
  )
  if (!scopeResult.ok) return scopeResult

  const providerResult = normalizeProvider(
    server.provider,
    `MCP server "${nameResult.value}"`,
  )
  if (!providerResult.ok) return providerResult

  const projectPathResult = normalizeOptionalString(
    server.projectPath,
    "projectPath",
    `MCP server "${nameResult.value}"`,
  )
  if (!projectPathResult.ok) return projectPathResult

  const entryResult = normalizeTransportFields(
    server,
    `MCP server "${nameResult.value}"`,
  )
  if (!entryResult.ok) return entryResult

  return {
    ok: true,
    value: {
      name: nameResult.value,
      scope: scopeResult.value,
      provider: providerResult.value,
      projectPath: projectPathResult.value,
      ...entryResult.value,
    },
  }
}

export function validateMcpServerName(name: unknown): ValidationResult<string> {
  const normalizedNameResult = normalizeOptionalString(
    name,
    "name",
    "MCP server",
  )
  if (!normalizedNameResult.ok) return normalizedNameResult
  if (!normalizedNameResult.value) {
    return { ok: false, error: "MCP server name must be non-empty." }
  }
  return { ok: true, value: normalizedNameResult.value }
}

export function validateMcpServerScope(
  scope: unknown,
): ValidationResult<McpServerScope> {
  return normalizeScope(scope, "MCP server")
}
