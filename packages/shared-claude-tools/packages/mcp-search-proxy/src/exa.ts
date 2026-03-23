#!/usr/bin/env node
/**
 * Exa MCP proxy with key pool failover.
 *
 * Provides tools:
 * - web_search_exa
 * - crawling_exa
 *
 * Under the hood connects to Exa's hosted MCP and forwards tools/call.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
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

const EXA_MCP_BASE_URL =
  process.env.EXA_MCP_BASE_URL || "https://mcp.exa.ai/mcp"
const EXA_MCP_TOOLS = process.env.EXA_MCP_TOOLS || "web_search_exa,crawling_exa"

type Upstream = {
  key: string
  client: Client
  transport: StreamableHTTPClientTransport
}

let upstream: Upstream | null = null
let pool: KeyPool | null = null
const bucket = new TokenBucket(5, 2) // 5 tokens, 2/sec refill (~120 req/min)

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

  // Exa can return scraped page text with lone surrogates; replace them before
  // Claude SDK re-serializes tool results into the next API request.
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

async function connectUpstream(key: string): Promise<Upstream> {
  const url = new URL(EXA_MCP_BASE_URL)
  url.searchParams.set("exaApiKey", key)
  url.searchParams.set("tools", EXA_MCP_TOOLS)

  const transport = new StreamableHTTPClientTransport(url)
  const client = new Client(
    { name: "exa-mcp-proxy", version: "1.0.0" },
    { capabilities: {} },
  )
  await client.connect(transport)
  return { key, client, transport }
}

async function ensurePool(): Promise<KeyPool> {
  if (pool) return pool
  const keys = await loadProviderKeys("exa")
  pool = new KeyPool(keys)
  return pool
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
    `All Exa keys failed for tool ${name}. Last error: ${getErrorMessage(lastErr)}`,
  )
}

const server = new McpServer({
  name: "exa",
  version: "1.0.0",
})

const webSearchExaSchema: Record<string, z.ZodTypeAny> = {
  query: z.string().describe("Search query"),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of results"),
  type: z
    .string()
    .optional()
    .describe("Search type (passed through to Exa MCP)"),
}

const crawlingExaSchema: Record<string, z.ZodTypeAny> = {
  url: z.string().url().describe("URL to fetch"),
}

;(server as any).tool(
  "web_search_exa",
  "Web search via Exa (proxied) with automatic API key failover.",
  webSearchExaSchema,
  async ({
    query,
    numResults,
    type,
  }: {
    query: string
    numResults?: number
    type?: string
  }) => {
    const args: Record<string, unknown> = { query }
    if (numResults !== undefined) args.numResults = numResults
    if (type !== undefined) args.type = type
    return await callToolWithFailover("web_search_exa", args)
  },
)
;(server as any).tool(
  "crawling_exa",
  "Fetch URL content via Exa (proxied) with automatic API key failover.",
  crawlingExaSchema,
  async ({ url }: { url: string }) => {
    return await callToolWithFailover("crawling_exa", { url })
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
    console.error("Exa MCP proxy ready")
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Exa MCP proxy failed to start:", err)
  process.exit(1)
})
