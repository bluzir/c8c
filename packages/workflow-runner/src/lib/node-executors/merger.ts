import type { NodeInput } from "@shared/types"

export function mergeResults(inputs: NodeInput[], strategy: string): string {
  if (inputs.length === 0) return ""
  if (inputs.length === 1) return inputs[0].content

  if (strategy === "json_array") {
    // Collect all branch outputs into a JSON array
    const items: unknown[] = []
    for (const input of inputs) {
      try {
        const parsed = JSON.parse(input.content)
        if (Array.isArray(parsed)) {
          items.push(...parsed)
        } else {
          items.push(parsed)
        }
      } catch {
        items.push(input.content)
      }
    }
    return JSON.stringify(items, null, 2)
  }

  if (strategy === "concatenate") {
    return inputs
      .map((input, i) => {
        const label = input.metadata.source.split("::").pop() || `branch-${i}`
        return `## ${label}\n\n${input.content}`
      })
      .join("\n\n---\n\n")
  }

  // For summarize/select_best, concatenate as fallback
  // (actual AI merge happens in workflow-runner via Claude call)
  return inputs.map((input) => input.content).join("\n\n---\n\n")
}

export function buildMergerPrompt(
  inputs: NodeInput[],
  strategy: "summarize" | "select_best",
  userPrompt?: string,
): string {
  const sections = inputs
    .map((input, i) => {
      const label = input.metadata.source.split("::").pop() || `branch-${i}`
      return `### Branch: ${label}\n\n${input.content}`
    })
    .join("\n\n---\n\n")

  if (strategy === "summarize") {
    return [
      "You are merging results from multiple parallel branches into a single cohesive output.",
      "",
      userPrompt ||
        "Synthesize these results into a single, well-organized document.",
      "",
      "--- BRANCH RESULTS ---",
      "",
      sections,
    ].join("\n")
  }

  // select_best
  return [
    "You are selecting the best result from multiple parallel branches.",
    "",
    userPrompt ||
      "Compare these results and return only the best one, explaining why it's superior.",
    "",
    "--- BRANCH RESULTS ---",
    "",
    sections,
  ].join("\n")
}
