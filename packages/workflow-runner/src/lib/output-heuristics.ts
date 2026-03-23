/**
 * Lightweight heuristic checks for skill node output quality.
 * These produce non-blocking warnings — the flow continues regardless.
 */

export interface OutputHeuristicWarning {
  kind: "empty" | "repetition" | "refusal" | "length_anomaly"
  message: string
}

const REFUSAL_PHRASES = [
  "i cannot",
  "i can't",
  "i'm sorry but",
  "i am sorry but",
  "as an ai language model",
  "as an ai assistant",
  "i don't have access",
  "i do not have access",
  "i'm not able to",
  "i am not able to",
  "i'm unable to",
  "i am unable to",
]

/**
 * Run heuristic checks on skill node output.
 * Returns an array of warnings (empty if output looks fine).
 */
export function checkOutputHeuristics(
  output: string,
  nodeLabel: string,
): OutputHeuristicWarning[] {
  const warnings: OutputHeuristicWarning[] = []

  // --- Empty / near-empty ---
  if (output.trim().length < 20) {
    warnings.push({
      kind: "empty",
      message: `Step '${nodeLabel}' produced very little output. Review recommended.`,
    })
    // Skip other checks — not enough text to analyse
    return warnings
  }

  // --- Repetition: same 5+ word phrase repeated 4+ times ---
  checkRepetition(output, nodeLabel, warnings)

  // --- Refusal: >50 % of output is boilerplate refusal phrases ---
  checkRefusal(output, nodeLabel, warnings)

  // TODO: length_anomaly — detect statistical outliers once we track
  // per-skill output length baselines across runs.

  return warnings
}

function checkRepetition(
  output: string,
  nodeLabel: string,
  warnings: OutputHeuristicWarning[],
): void {
  // Normalise whitespace and extract overlapping 5-word windows
  const words = output.toLowerCase().replace(/\s+/g, " ").trim().split(" ")
  if (words.length < 20) return // too short to meaningfully check

  const phraseCounts = new Map<string, number>()
  for (let i = 0; i <= words.length - 5; i++) {
    const phrase = words.slice(i, i + 5).join(" ")
    phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1)
  }

  for (const [, count] of phraseCounts) {
    if (count >= 4) {
      warnings.push({
        kind: "repetition",
        message: `Step '${nodeLabel}' output contains repeated text, which may indicate degraded generation.`,
      })
      return // one warning is enough
    }
  }
}

function checkRefusal(
  output: string,
  nodeLabel: string,
  warnings: OutputHeuristicWarning[],
): void {
  const lower = output.toLowerCase()
  let refusalChars = 0

  for (const phrase of REFUSAL_PHRASES) {
    let startIndex = 0
    while (true) {
      const idx = lower.indexOf(phrase, startIndex)
      if (idx === -1) break
      refusalChars += phrase.length
      startIndex = idx + phrase.length
    }
  }

  if (refusalChars > lower.length * 0.5) {
    warnings.push({
      kind: "refusal",
      message: `Step '${nodeLabel}' may have been refused by the model. Review the output.`,
    })
  }
}
