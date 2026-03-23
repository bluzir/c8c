#!/usr/bin/env node
/**
 * Serper MCP proxy with key pool failover.
 *
 * Wraps the upstream `serper-search-scrape-mcp-server` (npx) behind a stable MCP server name (`serper`)
 * and rotates SERPER_API_KEY if the upstream returns auth/quota/rate-limit errors.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  CallToolResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

import {
  extractTextFromToolContent,
  getErrorMessage,
  looksLikeAuthOrQuotaError,
  looksLikeRateLimitError,
} from "./errors.js"
import { sanitizeJsonPayload } from "./json-sanitizer.js"
import { KeyPool, loadProviderKeys, type KeyBadness } from "./keyring.js"
import { TokenBucket, jitterMs, sleep } from "./rate-limiter.js"

type Upstream = {
  key: string
  client: Client
  transport: StdioClientTransport
}

let upstream: Upstream | null = null
let pool: KeyPool | null = null
const bucket = new TokenBucket(10, 5) // 10 tokens, 5/sec refill (more generous)

function normalizeToolResult(
  res: Awaited<ReturnType<Client["callTool"]>>,
): CallToolResult {
  const anyRes = res as unknown as {
    content?: unknown
    toolResult?: unknown
    _meta?: unknown
  }
  const normalized = Array.isArray(anyRes.content)
    ? CallToolResultSchema.parse(res)
    : {
        ...((anyRes as { isError?: unknown }).isError === true
          ? { isError: true }
          : {}),
        content: [
          {
            type: "text" as const,
            text:
              typeof anyRes.toolResult === "string"
                ? anyRes.toolResult
                : anyRes.toolResult == null
                  ? ""
                  : JSON.stringify(anyRes.toolResult),
          },
        ],
      }

  return sanitizeJsonPayload(normalized) as CallToolResult
}

function classifyBadness(
  err: unknown,
): { badness: KeyBadness; cooldownMs: number } | null {
  const msg = getErrorMessage(err)
  const code = (err as unknown as { code?: unknown }).code
  if (typeof code === "number") {
    if (code === 429) return { badness: "rate_limit", cooldownMs: 60_000 }
    if (code === 401 || code === 403)
      return { badness: "auth", cooldownMs: 24 * 60 * 60_000 }
    if (code === 402) return { badness: "quota", cooldownMs: 30 * 60_000 }
    if (code === 400 && looksLikeAuthOrQuotaError(msg)) {
      return { badness: "quota", cooldownMs: 30 * 60_000 }
    }
  }
  if (looksLikeRateLimitError(msg))
    return { badness: "rate_limit", cooldownMs: 60_000 }
  if (looksLikeAuthOrQuotaError(msg))
    return { badness: "quota", cooldownMs: 30 * 60_000 }
  return null
}

async function ensurePool(): Promise<KeyPool> {
  if (pool) return pool
  const keys = await loadProviderKeys("serper")
  pool = new KeyPool(keys)
  return pool
}

async function connectUpstream(key: string): Promise<Upstream> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "serper-search-scrape-mcp-server"],
    env: {
      ...process.env,
      SERPER_API_KEY: key,
    },
  })
  const client = new Client(
    { name: "serper-mcp-proxy", version: "1.0.0" },
    { capabilities: {} },
  )
  await client.connect(transport)
  return { key, client, transport }
}

async function ensureUpstream(key: string): Promise<Upstream> {
  if (upstream?.key === key) return upstream
  if (upstream) {
    try {
      await upstream.transport.close()
    } catch {
      // Best-effort shutdown.
    }
    upstream = null
  }
  upstream = await connectUpstream(key)
  return upstream
}

async function callToolWithFailover(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const p = await ensurePool()
  const attempts = Math.max(1, p.keysCount())

  let lastErr: unknown = null
  for (let i = 0; i < attempts; i++) {
    const key = p.pick()
    try {
      await bucket.acquire()
      const u = await ensureUpstream(key)
      const res = await u.client.callTool({ name, arguments: args })
      const normalized = normalizeToolResult(res)
      if (normalized.isError) {
        const msg =
          extractTextFromToolContent(normalized.content) ||
          "Tool returned isError=true"
        throw new Error(msg)
      }
      return normalized
    } catch (err) {
      lastErr = err
      const classified = classifyBadness(err)
      if (!classified) throw err
      p.block(key, classified.badness, classified.cooldownMs)
      await sleep(jitterMs(1000)) // 500-1500ms jitter before next key
      continue
    }
  }

  throw new Error(
    `All Serper keys failed for tool ${name}. Last error: ${getErrorMessage(lastErr)}`,
  )
}

const server = new McpServer({
  name: "serper",
  version: "1.0.0",
})

const googleSearchSchema: Record<string, z.ZodTypeAny> = {
  q: z.string().describe("Query string"),
  gl: z.string().optional().describe('Geolocation country code (e.g. "us")'),
  hl: z.string().optional().describe('Language (e.g. "en")'),
  num: z.number().int().min(1).max(20).optional().describe("Number of results"),
}

const scrapeSchema: Record<string, z.ZodTypeAny> = {
  url: z.string().url().describe("URL to scrape"),
  includeMarkdown: z
    .boolean()
    .optional()
    .describe("Whether to include markdown in response"),
}

;(server as any).tool(
  "google_search",
  "Google search via Serper (proxied) with automatic API key failover.",
  googleSearchSchema,
  async ({
    q,
    gl,
    hl,
    num,
  }: {
    q: string
    gl?: string
    hl?: string
    num?: number
  }) => {
    const args: Record<string, unknown> = { q }
    if (gl !== undefined) args.gl = gl
    if (hl !== undefined) args.hl = hl
    if (num !== undefined) args.num = num
    return await callToolWithFailover("google_search", args)
  },
)
;(server as any).tool(
  "scrape",
  "Scrape URL via Serper (proxied) with automatic API key failover.",
  scrapeSchema,
  async ({
    url,
    includeMarkdown,
  }: {
    url: string
    includeMarkdown?: boolean
  }) => {
    const args: Record<string, unknown> = { url }
    if (includeMarkdown !== undefined) args.includeMarkdown = includeMarkdown
    return await callToolWithFailover("scrape", args)
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.stdin.resume()
  const keepAlive = setInterval(() => {}, 60_000)

  const shutdown = async () => {
    clearInterval(keepAlive)
    try {
      await upstream?.transport.close()
    } catch {
      // best-effort
    }
    process.exit(0)
  }

  process.once("SIGINT", () => void shutdown())
  process.once("SIGTERM", () => void shutdown())
  process.stdin.once("end", () => void shutdown())

  if (process.env.MCP_PROXY_DEBUG === "1") {
    // eslint-disable-next-line no-console
    console.error("Serper MCP proxy ready")
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Serper MCP proxy failed to start:", err)
  process.exit(1)
})
