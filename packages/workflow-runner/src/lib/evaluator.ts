import type { LogEntry } from "@shared/types"

export interface EvalCriterion {
  id: string
  score: number
  weight?: number
}

export interface EvaluatorResult {
  score: number
  reason: string
  fix_instructions?: string
  criteria?: EvalCriterion[]
}

export function parseEvaluatorOutput(logs: LogEntry[]): EvaluatorResult | null {
  const textContent = logs
    .filter((e): e is Extract<LogEntry, { type: "text" }> => e.type === "text")
    .map((e) => e.content)
    .join("")

  const startIdx = textContent.indexOf("{")
  if (startIdx === -1) {
    return null
  }

  // Single linear pass to extract balanced JSON object candidates.
  // This avoids O(n²) reverse slicing/parsing on long model output.
  const candidates: string[] = []
  let depth = 0
  let objectStart = -1
  let inString = false
  let escaped = false

  for (let i = startIdx; i < textContent.length; i++) {
    const ch = textContent[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === "\\") {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") {
      if (depth === 0) objectStart = i
      depth += 1
      continue
    }
    if (ch === "}") {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && objectStart >= 0) {
        candidates.push(textContent.slice(objectStart, i + 1))
        objectStart = -1
      }
    }
  }

  let parsed: Record<string, unknown> | null = null
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const candidate = JSON.parse(candidates[i])
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.score === "number"
      ) {
        parsed = candidate as Record<string, unknown>
        break
      }
    } catch {
      // Keep scanning older balanced objects.
    }
  }

  if (!parsed || typeof parsed.score !== "number") {
    return null
  }

  const result: EvaluatorResult = {
    score: parsed.score as number,
    reason: String(parsed.reason || ""),
  }

  if (typeof parsed.fix_instructions === "string" && parsed.fix_instructions) {
    result.fix_instructions = parsed.fix_instructions
  }

  if (Array.isArray(parsed.criteria) && parsed.criteria.length > 0) {
    result.criteria = parsed.criteria
      .filter(
        (c: unknown): c is Record<string, unknown> =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Record<string, unknown>).id === "string" &&
          typeof (c as Record<string, unknown>).score === "number",
      )
      .map((c: Record<string, unknown>) => ({
        id: c.id as string,
        score: c.score as number,
        ...(typeof c.weight === "number" ? { weight: c.weight } : {}),
      }))
    if (result.criteria.length === 0) delete result.criteria
  }

  return result
}

export function buildEvaluatorPrompt(
  criteria: string,
  content: string,
  skillContext?: string,
): string {
  return [
    "You are a content quality evaluator. Score the content below against the given criteria.",
    "",
    ...(skillContext ? ["EVALUATION SKILL CONTEXT:", skillContext, ""] : []),
    "",
    "CRITERIA:",
    criteria,
    "",
    "CONTENT TO EVALUATE:",
    content,
    "",
    "IMPORTANT: Respond with ONLY a JSON object in this exact format, no other text:",
    "{",
    '  "score": <number 1-10>,',
    '  "reason": "<one sentence explaining the overall score>",',
    '  "fix_instructions": "<specific actionable instructions on what to fix to improve the score, or empty string if score is 9+>",',
    '  "criteria": [',
    '    {"id": "<criterion name>", "score": <number 1-10>},',
    "    ...",
    "  ]",
    "}",
    "",
    "Break down the criteria into individual aspects. Each criterion id should be a short lowercase identifier.",
    'The "fix_instructions" field should contain specific, actionable guidance — not vague suggestions.',
  ].join("\n")
}
