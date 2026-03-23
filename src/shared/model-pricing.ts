export interface ModelPricing {
  input: number
  output: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
  haiku: { input: 0.25, output: 1.25 },
}

export function resolveModelFamily(
  model: string | undefined | null,
): keyof typeof MODEL_PRICING {
  if (!model) return "sonnet"
  const lower = model.toLowerCase()
  if (lower.includes("opus")) return "opus"
  if (lower.includes("haiku")) return "haiku"
  if (lower.includes("sonnet")) return "sonnet"
  console.warn(
    "[pricing] unknown model family, falling back to sonnet pricing",
    { model },
  )
  return "sonnet"
}

export function getModelPricing(
  model: string | undefined | null,
): ModelPricing {
  return MODEL_PRICING[resolveModelFamily(model)]
}

export function estimateTokenCostUsd(
  model: string | undefined | null,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model)
  return (
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  )
}
