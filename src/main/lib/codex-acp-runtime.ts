import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { homedir } from "node:os"
import { dirname, isAbsolute, resolve, sep } from "node:path"
import {
  createACPProvider,
  ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
} from "@mcpc-tech/acp-ai-provider"
import type {
  EnvVariable,
  HttpHeader,
  McpServer,
} from "@agentclientprotocol/sdk"
import { streamText } from "ai"
import { resolveSafetyProfile } from "@shared/provider-metadata"
import type {
  AgentExecutionEvent,
  AgentExecutionHandle,
  AgentExecutionSummary,
  AgentRunOptions,
  LogEntry,
  ProviderAuthStatus,
} from "@shared/types"
import { buildCodexEnv, execCodex } from "./codex-cli"
import { buildClaudeSdkMcpServers } from "./mcp-config"
import { getCodexApiKey, getProviderSettings } from "./provider-settings"
import { logInfo } from "./structured-log"

const require = createRequire(import.meta.url)

const CODEX_VERB_TO_TOOL_TYPE: Record<string, string> = {
  Read: "Read",
  Run: "Bash",
  List: "Glob",
  Search: "Grep",
  Grep: "Grep",
  Glob: "Glob",
  Edit: "Edit",
  Write: "Write",
  Thought: "Thinking",
  Fetch: "WebFetch",
}

interface CodexToolDescriptor {
  canonicalToolName: string
  detail: string
  isMcp: boolean
}

interface CodexMcpTransport {
  type?: string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  env_vars?: string[]
  http_headers?: Record<string, string> | null
  env_http_headers?: Record<string, string>
  bearer_token_env_var?: string | null
}

interface CodexMcpServer {
  name: string
  enabled?: boolean
  auth_status?: string | null
  transport?: CodexMcpTransport
}

interface CodexAvailableModel {
  modelId?: string
}

interface CodexSessionModelState {
  currentModelId?: string | null
  availableModels?: CodexAvailableModel[]
}

interface CodexSessionInfoLike {
  models?: CodexSessionModelState | null
}

const CODEX_MODEL_EFFORT_PRIORITY = ["xhigh", "high", "medium", "low"] as const

const CODEX_MODEL_ALIAS_FALLBACKS: Record<string, string[]> = {
  "gpt-5-codex": [
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
  ],
  "gpt-5.1-codex": ["gpt-5.1-codex-max", "gpt-5.1-codex-mini"],
  "gpt-5": ["gpt-5.4", "gpt-5.2"],
}

const CODEX_AUTH_HINTS = [
  "not logged in",
  "authentication required",
  "auth required",
  "authrequired",
  "login required",
  "missing credentials",
  "no credentials",
  "unauthorized",
  "forbidden",
  "codex login",
  "401",
  "403",
] as const

interface CodexAcpAuthSelection {
  apiKeyConfigured: boolean
  authMethod: "chatgpt" | "api_key"
  accountLabel: string
  authMethodId?: "codex-api-key"
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = resolve(candidatePath)
  const root = resolve(rootPath)
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

export interface CodexAcpSupportResult {
  supported: boolean
  reason?: string
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private resolvers: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.resolvers.length > 0) {
      this.resolvers.shift()?.({ value: undefined as T, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({
            value: this.items.shift() as T,
            done: false,
          })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve)
        })
      },
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseCodexJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value

  const trimmed = value.trim()
  if (!trimmed) return value

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeCodexErrorText(text: string): string {
  return text
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractCodexAcpError(error: unknown): {
  message: string
  code?: string
} {
  const anyError = error as any
  const message =
    anyError?.data?.message ||
    anyError?.errorText ||
    anyError?.message ||
    anyError?.error ||
    String(error)
  const code = anyError?.data?.code || anyError?.code

  return {
    message: normalizeCodexErrorText(
      typeof message === "string" ? message : String(message),
    ),
    code: typeof code === "string" ? code : undefined,
  }
}

function isCodexAcpAuthError(params: {
  message?: string | null
  code?: string | null
}): boolean {
  const searchableText =
    `${params.code || ""} ${params.message || ""}`.toLowerCase()
  return CODEX_AUTH_HINTS.some((hint) => searchableText.includes(hint))
}

function sanitizeCodexAcpProbeError(text: string): string {
  const normalized = normalizeCodexErrorText(text)
  if (!normalized) {
    return "Codex ACP could not verify the current authentication state."
  }

  if (normalized.includes("426 Upgrade Required")) {
    return "Codex ACP could not verify authentication because the current Codex runtime rejected the websocket transport (HTTP 426 Upgrade Required)."
  }

  return normalized
}

function toUnpackedAsarPath(filePath: string): string {
  const unpackedPath = filePath.replace(
    `${sep}app.asar${sep}`,
    `${sep}app.asar.unpacked${sep}`,
  )

  if (unpackedPath !== filePath && existsSync(unpackedPath)) {
    return unpackedPath
  }

  return filePath
}

function stripCodexModelEffort(modelId: string): string {
  const slashIndex = modelId.indexOf("/")
  return slashIndex === -1 ? modelId : modelId.slice(0, slashIndex)
}

function normalizeCodexRequestedModel(modelId?: string): string | undefined {
  const normalized = modelId?.trim()
  return normalized || undefined
}

function pickPreferredCodexVariant(
  baseModelId: string,
  availableModelIds: string[],
  currentModelId?: string | null,
): string | null {
  if (currentModelId && stripCodexModelEffort(currentModelId) === baseModelId) {
    return currentModelId
  }

  for (const effort of CODEX_MODEL_EFFORT_PRIORITY) {
    const candidate = `${baseModelId}/${effort}`
    if (availableModelIds.includes(candidate)) {
      return candidate
    }
  }

  if (availableModelIds.includes(baseModelId)) {
    return baseModelId
  }

  const firstVariant = availableModelIds.find(
    (modelId) => stripCodexModelEffort(modelId) === baseModelId,
  )
  return firstVariant || null
}

function resolveCodexAcpModelId(
  requestedModelId: string | undefined,
  sessionInfo: CodexSessionInfoLike | null | undefined,
): string | undefined {
  const normalizedRequested = normalizeCodexRequestedModel(requestedModelId)
  if (!normalizedRequested) return undefined

  const availableModelIds = (sessionInfo?.models?.availableModels || [])
    .map((model) =>
      typeof model?.modelId === "string" ? model.modelId.trim() : "",
    )
    .filter(Boolean)
  if (availableModelIds.length === 0) {
    return normalizedRequested
  }

  if (availableModelIds.includes(normalizedRequested)) {
    return normalizedRequested
  }

  const currentModelId = sessionInfo?.models?.currentModelId || null
  const requestedBaseModelId = stripCodexModelEffort(normalizedRequested)
  const preferredVariant = pickPreferredCodexVariant(
    requestedBaseModelId,
    availableModelIds,
    currentModelId,
  )
  if (preferredVariant) {
    return preferredVariant
  }

  for (const aliasCandidate of CODEX_MODEL_ALIAS_FALLBACKS[
    normalizedRequested
  ] || []) {
    const aliasVariant = pickPreferredCodexVariant(
      aliasCandidate,
      availableModelIds,
      currentModelId,
    )
    if (aliasVariant) {
      return aliasVariant
    }
  }

  return normalizedRequested
}

function getCodexAcpPackageName(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === "darwin") {
    if (arch === "arm64") return "@zed-industries/codex-acp-darwin-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-darwin-x64"
  }

  if (platform === "linux") {
    if (arch === "arm64") return "@zed-industries/codex-acp-linux-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-linux-x64"
  }

  if (platform === "win32") {
    if (arch === "arm64") return "@zed-industries/codex-acp-win32-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-win32-x64"
  }

  throw new Error(
    `Unsupported platform/arch for codex-acp: ${platform}/${arch}`,
  )
}

function resolveCodexAcpBinaryPath(): string {
  const packageName = getCodexAcpPackageName()
  const binaryName =
    process.platform === "win32" ? "codex-acp.exe" : "codex-acp"
  const packageRoot = dirname(
    require.resolve("@zed-industries/codex-acp/package.json"),
  )
  const resolvedPath = require.resolve(`${packageName}/bin/${binaryName}`, {
    paths: [packageRoot],
  })
  return toUnpackedAsarPath(resolvedPath)
}

function recordToHeaders(record?: Record<string, string>): HttpHeader[] {
  if (!record) return []
  return Object.entries(record).map(([name, value]) => ({ name, value }))
}

function recordToEnv(record?: Record<string, string>): EnvVariable[] {
  if (!record) return []
  return Object.entries(record).map(([name, value]) => ({ name, value }))
}

function buildCodexAcpMcpServers(mcpConfigPath?: string): McpServer[] {
  const servers = buildClaudeSdkMcpServers(mcpConfigPath)

  return Object.entries(servers).map(([name, server]) => {
    if (server.type === "http" || server.type === "sse") {
      return {
        name,
        type: server.type,
        url: server.url,
        headers: recordToHeaders(server.headers),
      }
    }

    return {
      name,
      command: server.command,
      args: server.args || [],
      env: recordToEnv(server.env),
    }
  })
}

function explicitCodexAcpMcpServerNames(mcpConfigPath?: string): Set<string> {
  return new Set(
    buildCodexAcpMcpServers(mcpConfigPath).map((server) => server.name),
  )
}

function getCodexMcpAuthState(authStatus: string | null | undefined): {
  supportsAuth: boolean
  authenticated: boolean
  needsAuth: boolean
} {
  const normalized = (authStatus || "").trim().toLowerCase()

  switch (normalized) {
    case "":
    case "none":
    case "unsupported":
      return { supportsAuth: false, authenticated: false, needsAuth: false }
    case "not_logged_in":
      return { supportsAuth: true, authenticated: false, needsAuth: true }
    case "bearer_token":
    case "o_auth":
      return { supportsAuth: true, authenticated: true, needsAuth: false }
    default:
      return { supportsAuth: true, authenticated: false, needsAuth: false }
  }
}

function resolveCodexStdioEnv(
  transport?: CodexMcpTransport,
): Record<string, string> | undefined {
  if (!transport) return undefined

  const merged: Record<string, string> = {}
  for (const [name, value] of Object.entries(transport.env || {})) {
    if (typeof name === "string" && typeof value === "string") {
      merged[name] = value
    }
  }

  for (const envName of transport.env_vars || []) {
    const value = process.env[envName]
    if (typeof value === "string" && value.length > 0 && !merged[envName]) {
      merged[envName] = value
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

function resolveCodexHttpHeaders(
  transport?: CodexMcpTransport,
): Record<string, string> | undefined {
  if (!transport) return undefined

  const merged: Record<string, string> = {}
  for (const [name, value] of Object.entries(transport.http_headers || {})) {
    if (typeof name === "string" && typeof value === "string") {
      merged[name] = value
    }
  }

  for (const [headerName, envName] of Object.entries(
    transport.env_http_headers || {},
  )) {
    if (typeof headerName !== "string" || typeof envName !== "string") continue
    const value = process.env[envName]
    if (typeof value === "string" && value.length > 0) {
      merged[headerName] = value
    }
  }

  const bearerEnvVar = transport.bearer_token_env_var?.trim()
  if (bearerEnvVar && !merged.Authorization) {
    const token = process.env[bearerEnvVar]?.trim()
    if (token) {
      merged.Authorization = `Bearer ${token}`
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

function codexTransportType(
  transport?: CodexMcpTransport,
): "stdio" | "http" | "sse" {
  if (!transport) return "stdio"
  if (transport.type === "streamable_http" || transport.type === "http")
    return "http"
  if (transport.type === "sse") return "sse"
  return "stdio"
}

function codexServerToMcpServer(server: CodexMcpServer): McpServer | null {
  if (server.enabled === false) return null

  const transportType = codexTransportType(server.transport)
  if (
    (transportType === "http" || transportType === "sse") &&
    server.transport?.url
  ) {
    const headers = resolveCodexHttpHeaders(server.transport)
    return {
      name: server.name,
      type: transportType,
      url: server.transport.url,
      headers: recordToHeaders(headers),
    }
  }

  if (transportType === "stdio" && server.transport?.command) {
    const env = resolveCodexStdioEnv(server.transport)
    return {
      name: server.name,
      command: server.transport.command,
      args: server.transport.args || [],
      env: recordToEnv(env),
    }
  }

  return null
}

async function resolveCodexAcpMcpServers(
  workdir?: string,
  mcpConfigPath?: string,
): Promise<McpServer[]> {
  const explicitServerNames = explicitCodexAcpMcpServerNames(mcpConfigPath)
  const explicitServers = buildCodexAcpMcpServers(mcpConfigPath)

  try {
    const { stdout } = await execCodex(["mcp", "list", "--json"], {
      cwd: workdir,
      timeout: 10_000,
    })
    const parsed = JSON.parse(stdout) as unknown
    if (Array.isArray(parsed)) {
      const runtimeServers = parsed
        .filter((item): item is CodexMcpServer =>
          Boolean(item && typeof item === "object"),
        )
        .filter((server) => {
          if (server.enabled === false) return false
          const authState = getCodexMcpAuthState(server.auth_status)
          const transportType = codexTransportType(server.transport)
          const isRemoteTransport =
            transportType === "http" || transportType === "sse"

          if (authState.needsAuth) {
            logInfo("codex-provider", "mcp-server-skipped", {
              name: server.name,
              transportType,
              authStatus: server.auth_status || null,
              reason:
                "MCP server requires authentication before it can join the ACP session",
            })
            return false
          }

          if (isRemoteTransport && !explicitServerNames.has(server.name)) {
            logInfo("codex-provider", "mcp-server-skipped", {
              name: server.name,
              transportType,
              authStatus: server.auth_status || null,
              reason:
                "remote MCP server was not explicitly configured for this run",
            })
            return false
          }

          return true
        })
        .map(codexServerToMcpServer)
        .filter((server): server is McpServer => Boolean(server))

      const mergedServers = new Map<string, McpServer>()
      for (const server of runtimeServers) {
        mergedServers.set(server.name, server)
      }
      for (const server of explicitServers) {
        mergedServers.set(server.name, server)
      }

      if (mergedServers.size > 0) {
        return [...mergedServers.values()]
      }
    }
  } catch {
    // Fall back to the prepared session config file when Codex CLI MCP listing is unavailable.
  }

  return explicitServers
}

function resolveCodexAcpAuthSelection(
  appManagedApiKey?: string,
): CodexAcpAuthSelection {
  const normalizedAppManagedApiKey = appManagedApiKey?.trim()
  if (normalizedAppManagedApiKey) {
    return {
      apiKeyConfigured: true,
      authMethod: "api_key",
      accountLabel: "App-managed CODEX_API_KEY",
      authMethodId: "codex-api-key",
    }
  }

  return {
    apiKeyConfigured: false,
    authMethod: "chatgpt",
    accountLabel: "ChatGPT subscription",
  }
}

function buildCodexAcpProcessEnv(
  env: NodeJS.ProcessEnv,
  authSelection: CodexAcpAuthSelection,
): Record<string, string> {
  const filtered = Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )

  if (authSelection.authMethod === "api_key") {
    filtered.ACP_AI_PROVIDER_WARN_MISSING_AUTH_METHOD = "0"
    return filtered
  }

  delete filtered.CODEX_API_KEY
  delete filtered.OPENAI_API_KEY
  filtered.ACP_AI_PROVIDER_WARN_MISSING_AUTH_METHOD = "0"
  return filtered
}

function buildCodexToolPolicyPrefix(options: AgentRunOptions): string {
  const sections: string[] = []
  if (options.systemPrompts?.length) {
    sections.push(options.systemPrompts.join("\n\n"))
  }
  if (options.allowedTools?.length) {
    sections.push(`Allowed tools: ${options.allowedTools.join(", ")}.`)
  }
  if (options.disallowedTools?.length) {
    sections.push(
      `Disallowed tools: ${options.disallowedTools.join(", ")}. Never use them.`,
    )
  }
  if (sections.length === 0) return options.prompt
  return `${sections.join("\n\n")}\n\n${options.prompt}`
}

function parseCodexToolDescriptor(
  rawToolName: string,
): CodexToolDescriptor | null {
  const normalizedName = rawToolName.trim()
  if (!normalizedName) return null

  if (normalizedName.startsWith("Tool:")) {
    const payload = normalizedName.slice("Tool:".length).trim()
    const separatorIndex = payload.indexOf("/")
    if (separatorIndex === -1) return null

    const serverName = payload.slice(0, separatorIndex).trim()
    const toolName = payload
      .slice(separatorIndex + 1)
      .trim()
      .replaceAll("/", "__")
    if (!serverName || !toolName) return null

    return {
      canonicalToolName: `mcp__${serverName}__${toolName}`,
      detail: "",
      isMcp: true,
    }
  }

  const spaceIndex = normalizedName.indexOf(" ")
  const verb =
    spaceIndex === -1 ? normalizedName : normalizedName.slice(0, spaceIndex)
  const detail =
    spaceIndex === -1 ? "" : normalizedName.slice(spaceIndex + 1).trim()
  const canonicalToolName = CODEX_VERB_TO_TOOL_TYPE[verb]
  if (!canonicalToolName) return null

  return {
    canonicalToolName,
    detail,
    isMcp: false,
  }
}

function normalizeCodexToolInput(
  rawInput: unknown,
  descriptor: CodexToolDescriptor,
): Record<string, unknown> {
  if (!isRecord(rawInput)) {
    if (descriptor.canonicalToolName === "Read" && descriptor.detail) {
      return { file_path: descriptor.detail }
    }
    if (descriptor.canonicalToolName === "Bash" && descriptor.detail) {
      return { command: descriptor.detail }
    }
    if (
      descriptor.canonicalToolName === "WebFetch" &&
      descriptor.detail.startsWith("http")
    ) {
      return { url: descriptor.detail }
    }
    return {}
  }

  const args = isRecord(rawInput.args) ? { ...rawInput.args } : { ...rawInput }

  if (descriptor.isMcp) {
    if (isRecord(args.arguments)) {
      return { ...args.arguments }
    }
    return args
  }

  if (
    descriptor.canonicalToolName === "Read" &&
    typeof args.file_path !== "string" &&
    descriptor.detail
  ) {
    args.file_path = descriptor.detail
  }

  if (
    descriptor.canonicalToolName === "Bash" &&
    typeof args.command !== "string" &&
    descriptor.detail
  ) {
    args.command = descriptor.detail
  }

  if (
    descriptor.canonicalToolName === "WebFetch" &&
    typeof args.url !== "string" &&
    descriptor.detail.startsWith("http")
  ) {
    args.url = descriptor.detail
  }

  return args
}

function resolveCodexToolPart(
  rawToolName: string,
  rawInput: unknown,
): { toolName: string; input: Record<string, unknown> } {
  const descriptor = parseCodexToolDescriptor(rawToolName)
  if (!descriptor) {
    return {
      toolName: rawToolName,
      input: isRecord(rawInput) ? rawInput : {},
    }
  }

  return {
    toolName: descriptor.canonicalToolName,
    input: normalizeCodexToolInput(rawInput, descriptor),
  }
}

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output
  if (output == null) return ""
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function mapStreamPartToLogEntry(
  part: any,
  toolNamesById: Map<string, string>,
): LogEntry | null {
  const timestamp = Date.now()

  if (part.type === "text-delta" && typeof part.text === "string") {
    return { type: "text", content: part.text, timestamp }
  }

  if (part.type === "reasoning-delta" && typeof part.text === "string") {
    return { type: "thinking", content: part.text, timestamp }
  }

  if (part.type === "tool-call") {
    const rawToolName =
      typeof part.toolName === "string" ? part.toolName : "unknown"
    const rawInput = parseCodexJsonValue(part.input)
    const actualToolName =
      rawToolName === ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME &&
      isRecord(rawInput) &&
      typeof rawInput.toolName === "string"
        ? rawInput.toolName
        : rawToolName
    const actualInput =
      rawToolName === ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME && isRecord(rawInput)
        ? rawInput.args
        : rawInput
    const normalized = resolveCodexToolPart(actualToolName, actualInput)
    if (typeof part.toolCallId === "string") {
      toolNamesById.set(part.toolCallId, normalized.toolName)
    }
    return {
      type: "tool_use",
      tool: normalized.toolName,
      input: normalized.input,
      timestamp,
    }
  }

  if (part.type === "tool-result" || part.type === "tool-error") {
    const toolName =
      typeof part.toolCallId === "string" && toolNamesById.has(part.toolCallId)
        ? toolNamesById.get(part.toolCallId) || "unknown"
        : typeof part.toolName === "string"
          ? part.toolName
          : "unknown"
    return {
      type: "tool_result",
      tool: toolName,
      output: stringifyOutput(
        part.output ?? part.result ?? part.errorText ?? part.error,
      ),
      status: part.type === "tool-error" ? "error" : "success",
      timestamp,
    }
  }

  if (part.type === "raw") {
    const rawValue =
      typeof part.rawValue === "string"
        ? (() => {
            try {
              return JSON.parse(part.rawValue)
            } catch {
              return null
            }
          })()
        : part.rawValue

    if (
      isRecord(rawValue) &&
      rawValue.type === "diff" &&
      typeof rawValue.path === "string"
    ) {
      return {
        type: "diff",
        content: stringifyOutput(rawValue),
        files: [rawValue.path],
        timestamp,
      }
    }
  }

  if (part.type === "error") {
    return {
      type: "error",
      content: errorMessage(part.error),
      timestamp,
    }
  }

  return null
}

function usageFromPart(
  part: any,
): { inputTokens: number; outputTokens: number } | null {
  const usage = part?.usage || part?.totalUsage
  if (!usage || typeof usage !== "object") return null
  return {
    inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
    outputTokens:
      typeof usage.outputTokens === "number" ? usage.outputTokens : 0,
  }
}

export function canUseCodexAcpExecution(
  options: Pick<
    AgentRunOptions,
    "addDirs" | "executionMode" | "safetyProfile"
  > & { workdir?: string },
  configuredProfile: NonNullable<AgentRunOptions["safetyProfile"]>,
): CodexAcpSupportResult {
  const resolvedSafetyProfile = resolveSafetyProfile(
    options.executionMode,
    options.safetyProfile || configuredProfile,
  )

  if (
    resolvedSafetyProfile !== "workspace_auto" &&
    resolvedSafetyProfile !== "safe_readonly"
  ) {
    return {
      supported: false,
      reason: `unsupported safety profile ${resolvedSafetyProfile}`,
    }
  }

  const addDirs = options.addDirs || []
  if (addDirs.length > 0) {
    if (!options.workdir) {
      return {
        supported: false,
        reason:
          "additional directories require a working directory for ACP sessions",
      }
    }

    const hasExternalDirectory = addDirs.some((dir) => {
      const resolvedDir = isAbsolute(dir) ? dir : resolve(options.workdir!, dir)
      return !isWithinRoot(resolvedDir, options.workdir!)
    })

    if (hasExternalDirectory) {
      return {
        supported: false,
        reason:
          "additional directories outside the working directory are not supported by ACP sessions",
      }
    }
  }

  return { supported: true }
}

export async function probeCodexAcpAuthStatus(): Promise<ProviderAuthStatus> {
  const apiKey = await getCodexApiKey()
  const env = await buildCodexEnv()
  const authSelection = resolveCodexAcpAuthSelection(apiKey)
  const provider = createACPProvider({
    command: resolveCodexAcpBinaryPath(),
    env: buildCodexAcpProcessEnv(env, authSelection),
    authMethodId: authSelection.authMethodId,
    session: {
      cwd: homedir(),
      mcpServers: [],
    },
    persistSession: false,
  })

  try {
    await provider.initSession()
    return {
      provider: "codex",
      state: "authenticated",
      authenticated: true,
      authMethod: authSelection.authMethod,
      accountLabel: authSelection.accountLabel,
      apiKeyConfigured: authSelection.apiKeyConfigured,
      error: null,
    }
  } catch (error) {
    const normalized = extractCodexAcpError(error)
    if (isCodexAcpAuthError(normalized)) {
      return {
        provider: "codex",
        state: "unauthenticated",
        authenticated: false,
        authMethod: null,
        accountLabel: null,
        apiKeyConfigured: authSelection.apiKeyConfigured,
        error:
          "Codex CLI is not authenticated. Run `codex login` or configure an optional CODEX_API_KEY in Settings.",
      }
    }

    return {
      provider: "codex",
      state: "unknown",
      authenticated: false,
      authMethod: null,
      accountLabel: authSelection.apiKeyConfigured
        ? authSelection.accountLabel
        : null,
      apiKeyConfigured: authSelection.apiKeyConfigured,
      error: sanitizeCodexAcpProbeError(normalized.message),
    }
  } finally {
    provider.cleanup()
  }
}

export async function createCodexAcpExecutionHandle(
  options: AgentRunOptions,
): Promise<AgentExecutionHandle> {
  const settings = await getProviderSettings()
  const support = canUseCodexAcpExecution(options, settings.safetyProfile)
  if (!support.supported) {
    throw new Error(`Codex ACP unsupported: ${support.reason}`)
  }
  const resolvedSafetyProfile = resolveSafetyProfile(
    options.executionMode,
    options.safetyProfile || settings.safetyProfile,
  )

  const apiKey = await getCodexApiKey()
  const env = await buildCodexEnv(options.extraEnv)
  const authSelection = resolveCodexAcpAuthSelection(apiKey)
  const mcpServers = await resolveCodexAcpMcpServers(
    options.workdir,
    options.mcpConfigPath,
  )
  const provider = createACPProvider({
    command: resolveCodexAcpBinaryPath(),
    env: buildCodexAcpProcessEnv(env, authSelection),
    authMethodId: authSelection.authMethodId,
    session: {
      cwd: options.workdir,
      mcpServers,
    },
    persistSession: false,
  })

  const queue = new AsyncEventQueue<AgentExecutionEvent>()
  const abortController = new AbortController()
  const toolNamesById = new Map<string, string>()
  let cleanedUp = false
  const cleanupProvider = () => {
    if (cleanedUp) return
    cleanedUp = true
    provider.cleanup()
  }

  const onAbort = () => {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  }

  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      onAbort()
    } else {
      options.abortSignal.addEventListener("abort", onAbort, { once: true })
    }
  }

  queue.push({ type: "start" })

  let sessionId: string | null = provider.getSessionId()

  const done = (async (): Promise<AgentExecutionSummary> => {
    const startedAt = Date.now()
    let finishReason: string | null = null
    let lastError: string | null = null

    try {
      const modeId =
        resolvedSafetyProfile === "safe_readonly" ? "plan" : undefined
      const sessionInfo = await provider.initSession()
      const resolvedModelId = resolveCodexAcpModelId(options.model, sessionInfo)
      logInfo("codex-provider", "acp-model-resolved", {
        requestedModel: options.model ?? null,
        resolvedModel: resolvedModelId ?? null,
        currentModel: sessionInfo?.models?.currentModelId ?? null,
        availableModelCount: sessionInfo?.models?.availableModels?.length ?? 0,
      })
      const result = streamText({
        model: provider.languageModel(resolvedModelId, modeId),
        prompt: buildCodexToolPolicyPrefix(options),
        tools: provider.tools,
        abortSignal: abortController.signal,
        includeRawChunks: true,
      })

      for await (const part of result.fullStream) {
        sessionId = provider.getSessionId() || sessionId

        const usage = usageFromPart(part)
        if (usage) {
          queue.push({ type: "usage", usage })
        }

        const entry = mapStreamPartToLogEntry(part, toolNamesById)
        if (entry) {
          queue.push({ type: "log-entry", entry })
          if (entry.type === "error") {
            lastError = entry.content
            queue.push({ type: "error", text: entry.content })
          }
        }

        if (part.type === "finish") {
          finishReason = part.finishReason || "stop"
        }

        if (part.type === "abort") {
          finishReason = "abort"
        }
      }

      const totalUsage = await result.totalUsage
      queue.push({
        type: "usage",
        usage: {
          inputTokens: totalUsage.inputTokens || 0,
          outputTokens: totalUsage.outputTokens || 0,
        },
      })

      const resolvedFinishReason = finishReason || (await result.finishReason)
      const aborted =
        abortController.signal.aborted || resolvedFinishReason === "abort"
      const success = !aborted && resolvedFinishReason !== "error"
      const summary: AgentExecutionSummary = {
        success,
        exitCode: success || aborted ? 0 : null,
        signal: null,
        killed: false,
        aborted,
        durationMs: Date.now() - startedAt,
        error: success
          ? null
          : lastError ||
            `Codex ACP finished with reason: ${resolvedFinishReason}`,
        providerSessionId: sessionId,
        backend: "codex_acp",
      }
      queue.push({ type: "finish", summary })
      return summary
    } catch (error) {
      const aborted = abortController.signal.aborted
      const summary: AgentExecutionSummary = {
        success: false,
        exitCode: aborted ? 0 : null,
        signal: null,
        killed: false,
        aborted,
        durationMs: Date.now() - startedAt,
        error: aborted ? "Execution aborted." : errorMessage(error),
        providerSessionId: sessionId,
        backend: "codex_acp",
      }
      queue.push({
        type: "error",
        text: summary.error || "Codex ACP query failed.",
      })
      queue.push({ type: "finish", summary })
      return summary
    } finally {
      cleanupProvider()
      if (options.abortSignal) {
        options.abortSignal.removeEventListener("abort", onAbort)
      }
      queue.close()
    }
  })()

  return {
    provider: "codex",
    backend: "codex_acp",
    events: queue,
    abort: () => {
      onAbort()
      cleanupProvider()
    },
    done,
  }
}
