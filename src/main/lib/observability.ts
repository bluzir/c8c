import { createHash } from "node:crypto"
import { estimateTokenCostUsd } from "@shared/model-pricing"
import type { NodeMetrics, NodeMeta, ErrorKind } from "@shared/types"
import type { LogParser } from "./log-parser"

/** Classify an error into a category for diagnostics */
export function classifyError(err: unknown, timedOut: boolean): ErrorKind {
  if (timedOut) return "timeout"

  const msg = String(err).toLowerCase()

  // Policy errors: budget, throttling, account limits
  if (
    msg.includes("budget") ||
    msg.includes("rate limit") ||
    msg.includes("usage limit") ||
    msg.includes("quota") ||
    msg.includes("too many requests") ||
    msg.includes("429") ||
    msg.includes("credit balance") ||
    msg.includes("billing") ||
    msg.includes("policy")
  ) {
    return "policy"
  }

  // Tool/skill errors: CLI subprocess failure, tool_result errors, file not found
  if (
    msg.includes("exit code") ||
    msg.includes("enoent") ||
    msg.includes("skill") ||
    msg.includes("command not found") ||
    msg.includes("spawn")
  ) {
    return "tool"
  }

  // Model errors: empty output, parse failures, hallucination indicators
  if (
    msg.includes("unparseable") ||
    msg.includes("empty output") ||
    msg.includes("could not parse") ||
    msg.includes("json")
  ) {
    return "model"
  }

  return "unknown"
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  return estimateTokenCostUsd(model, inputTokens, outputTokens)
}

export function collectMetrics(logParser: LogParser, startedAt: number): NodeMetrics {
  const usage = logParser.usage
  return {
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    cost_usd: 0, // caller sets this with model info
    latency_ms: Date.now() - startedAt,
  }
}

export function buildNodeMeta(
  prompt: string,
  model: string,
  skillRef?: string,
  backend?: NodeMeta["backend"],
  providerSessionId?: string | null,
): NodeMeta {
  return {
    model_id: model,
    prompt_hash: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
    ...(skillRef ? { skill_ref: skillRef } : {}),
    ...(backend ? { backend } : {}),
    ...(providerSessionId ? { provider_session_id: providerSessionId } : {}),
  }
}
