import type { Subtask } from "../runtime-graph"

export function buildSplitterPrompt(
  strategy: string,
  inputContent: string,
  maxBranches = 8,
): string {
  const upper = Math.max(1, maxBranches)
  return [
    "You are an intelligent task decomposer. Your job is to analyze the input and split it into independent, self-contained subtasks that can be processed in parallel.",
    "",
    "## Decomposition Hint",
    strategy,
    "",
    "## Input Format",
    "The input may come in any format: JSON array, markdown list, prose paragraphs, structured data, or mixed text with embedded JSON. Regardless of the format, identify the logical units and decompose them.",
    "",
    "## Output Requirements",
    "Return a JSON array of objects. Each object must have:",
    '- `key`: a short kebab-case identifier (e.g. "hero-section", "user-profile")',
    "- `content`: the FULL content for this subtask — it must be completely self-contained with all details from the original input. Do not summarize or truncate.",
    "",
    "Example:",
    "```json",
    "[",
    '  {"key": "hero-section", "content": "Full details about the hero section including file path, component name, and all relevant context..."},',
    '  {"key": "nav-bar", "content": "Full details about the navigation bar including file path, component name, and all relevant context..."}',
    "]",
    "```",
    "",
    "IMPORTANT:",
    "- Return ONLY the JSON array, no other text",
    "- Each subtask must be fully self-contained — a downstream agent reading only that subtask should have all the context it needs",
    "- Preserve all original details, paths, names, and descriptions in each subtask",
    `- Return between 1 and ${upper} subtasks`,
    `- If input contains ${upper} or more independent items, return exactly ${upper} subtasks`,
    "- If the input has fewer independent items than the target, return one subtask per item",
    "",
    "--- INPUT ---",
    inputContent,
  ].join("\n")
}

export function parseSplitterOutput(output: string): Subtask[] {
  // Try to extract JSON from code block first
  const codeBlockMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : output.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    // Try to find any JSON array in the output
    const arrayMatch = output.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        parsed = JSON.parse(arrayMatch[0])
      } catch {
        return [{ key: "subtask-0", content: output.trim() }]
      }
    } else {
      return [{ key: "subtask-0", content: output.trim() }]
    }
  }

  if (!Array.isArray(parsed)) {
    return [{ key: "subtask-0", content: output.trim() }]
  }

  return parsed.map((item, i) => {
    if (typeof item === "string") {
      return { key: `subtask-${i}`, content: item }
    }

    if (typeof item === "object" && item !== null) {
      const asObj = item as Record<string, unknown>
      const rawKey = typeof asObj.key === "string" ? asObj.key : ""
      const key = rawKey.trim() || `subtask-${i}`

      if (typeof asObj.content === "string") {
        return { key, content: asObj.content }
      }

      if (asObj.content != null) {
        return { key, content: String(asObj.content) }
      }

      // Keep object context if `content` is missing.
      return { key, content: JSON.stringify(item) }
    }

    return { key: `subtask-${i}`, content: String(item) }
  })
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeSubtaskKeyForRuntime(key: string, index: number): string {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || `branch-${index + 1}`
}

function hasDuplicateSubtaskKeys(subtasks: Subtask[]): boolean {
  const seen = new Set<string>()
  for (let i = 0; i < subtasks.length; i++) {
    const normalizedKey = normalizeSubtaskKeyForRuntime(
      subtasks[i]?.key || "",
      i,
    )
    if (seen.has(normalizedKey)) return true
    seen.add(normalizedKey)
  }
  return false
}

function makeKebabKey(value: string, fallback: string): string {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
  return key || fallback
}

function extractJsonArray(raw: string): unknown[] | null {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function countListLikeItems(inputContent: string): number {
  const lines = inputContent.split("\n")
  let count = 0
  for (const line of lines) {
    if (/^\s*(?:[-*•]|\d+[.)])\s+\S+/.test(line)) count++
  }
  return count
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim()
  return /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)
}

function extractMarkdownTableRows(inputContent: string): string[] {
  const lines = inputContent.split("\n")
  const rows: string[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i]?.trim() || ""
    const separator = lines[i + 1]?.trim() || ""
    if (!header.startsWith("|") || !isMarkdownTableSeparator(separator))
      continue

    let j = i + 2
    while (j < lines.length) {
      const row = lines[j]?.trim() || ""
      if (!row.startsWith("|")) break
      if (isMarkdownTableSeparator(row)) {
        j++
        continue
      }
      const cells = row
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0)
      if (cells.length > 0) {
        rows.push(cells.join(" | "))
      }
      j++
    }

    i = j - 1
  }
  return rows
}

function countMarkdownTableRows(inputContent: string): number {
  return extractMarkdownTableRows(inputContent).length
}

export function shouldRetrySplitter(
  subtasks: Subtask[],
  rawOutput: string,
  inputContent: string,
  maxBranches = 8,
): boolean {
  if (subtasks.length === 0) return true

  if (hasDuplicateSubtaskKeys(subtasks)) {
    return true
  }
  if (subtasks.some((s) => normalizeWhitespace(s.content).length === 0)) {
    return true
  }
  const inputArray = extractJsonArray(inputContent)
  // Use the most structured format detected, not the max count.
  // JSON > tables > lists — prevents markdown tables from inflating
  // expected count when a JSON array is the intended structure.
  const detectableItems =
    (inputArray?.length || 0) > 1
      ? inputArray!.length
      : Math.max(
          countMarkdownTableRows(inputContent),
          countListLikeItems(inputContent),
        )
  const likelyMultiItemInput = detectableItems > 1
  const expectedCount = Math.min(
    Math.max(1, maxBranches),
    Math.max(1, detectableItems),
  )
  const underSplit =
    maxBranches > 1 && likelyMultiItemInput && subtasks.length < expectedCount

  if (subtasks.length !== 1) return underSplit

  const only = subtasks[0]?.content || ""
  const combined = `${rawOutput}\n${only}`.toLowerCase()
  const instructionMarkers = [
    "you are a task decomposer",
    "return only a json array",
    "analyze the following input",
    "each object must have",
    "create 4-6 independent research aspects",
  ]
  const hasMarkers = instructionMarkers.some((marker) =>
    combined.includes(marker),
  )
  const normalizedInput = normalizeWhitespace(inputContent).toLowerCase()
  const normalizedOutput = normalizeWhitespace(only).toLowerCase()
  const inputPrefix = normalizedInput.slice(0, 180)
  const echoesInput =
    inputPrefix.length > 40 && normalizedOutput.includes(inputPrefix)
  const suspiciousLength =
    only.length >= Math.max(900, Math.floor(inputContent.length * 0.75))
  const suspiciouslyShort =
    normalizedInput.length > 260 && normalizedOutput.length < 60

  return (
    hasMarkers ||
    echoesInput ||
    suspiciousLength ||
    suspiciouslyShort ||
    underSplit
  )
}

export function buildSplitterRecoveryPrompt(
  strategy: string,
  inputContent: string,
  maxBranches = 8,
): string {
  const upper = Math.max(2, maxBranches)
  return [
    "Your previous splitter response was invalid because it returned a single wrapper task instead of real decomposition.",
    "Now produce a correct decomposition.",
    "",
    "## Decomposition Hint",
    strategy,
    "",
    "## Hard Requirements",
    `- Return a JSON array with 2-${upper} objects when decomposition is possible`,
    "- Each object must have `key` and `content`",
    "- `key` must be short kebab-case",
    "- `content` must be self-contained and specific to that subtask",
    "- Do NOT echo instructions, prompt text, or the full input as one item",
    "- Return ONLY JSON, no markdown fences",
    "",
    "--- INPUT ---",
    inputContent,
  ].join("\n")
}

/**
 * Fast-path: if input is already structured (markdown table, JSON array, or
 * bullet/numbered list with >1 items), return subtasks directly without
 * calling Claude. Returns `null` for unstructured input that needs Claude's
 * intelligence for meaningful decomposition.
 */
export function tryStructuredSplit(
  inputContent: string,
  maxBranches = 8,
): Subtask[] | null {
  const limit = Math.max(1, maxBranches)
  const normalized = inputContent.trim()
  if (!normalized) return null

  // 1. JSON arrays with >1 items (highest priority — most structured)
  const array = extractJsonArray(inputContent)
  if (array && array.length > 1) {
    const prefix = normalizeWhitespace(
      inputContent.replace(/\[[\s\S]*\]/, "").trim(),
    )
    const subtasks: Subtask[] = []
    if (prefix && prefix.length > 30) {
      subtasks.push({ key: "research-scope", content: prefix })
    }
    const room = Math.max(1, limit - subtasks.length)
    for (let i = 0; i < Math.min(array.length, room); i++) {
      const item = array[i]
      if (typeof item === "object" && item !== null) {
        const asObj = item as Record<string, unknown>
        const label = String(asObj.domain || asObj.name || `item-${i + 1}`)
        subtasks.push({
          key: makeKebabKey(label, `record-${i + 1}`),
          content: JSON.stringify(item, null, 2),
        })
      } else {
        subtasks.push({ key: `record-${i + 1}`, content: String(item) })
      }
    }
    if (subtasks.length > 1) return subtasks
  }

  // 2. Markdown tables with >1 data rows
  const tableRows = extractMarkdownTableRows(inputContent)
  if (tableRows.length > 1) {
    return tableRows.slice(0, limit).map((row, i) => {
      const leadingCell = row.split("|")[0]?.trim() || row
      return {
        key: makeKebabKey(
          leadingCell.split(/\s+/).slice(0, 6).join(" "),
          `row-${i + 1}`,
        ),
        content: row,
      }
    })
  }

  // 3. Bullet/numbered lists with >1 items
  const listItems = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+\S+/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length > 0)

  if (listItems.length > 1) {
    return listItems.slice(0, limit).map((line, i) => ({
      key: makeKebabKey(
        line.split(/\s+/).slice(0, 6).join(" "),
        `item-${i + 1}`,
      ),
      content: line,
    }))
  }

  // Unstructured input — needs Claude
  return null
}

export function heuristicSplitInput(
  inputContent: string,
  maxBranches = 8,
): Subtask[] {
  const limit = Math.max(2, maxBranches)
  const normalized = inputContent.trim()
  if (!normalized) {
    return []
  }

  // JSON arrays first — most structured, highest signal
  const array = extractJsonArray(inputContent)
  if (array && array.length > 1) {
    const prefix = normalizeWhitespace(
      inputContent.replace(/\[[\s\S]*\]/, "").trim(),
    )
    const subtasks: Subtask[] = []
    if (prefix && prefix.length > 30) {
      subtasks.push({
        key: "research-scope",
        content: prefix,
      })
    }
    const room = Math.max(1, limit - subtasks.length)
    for (let i = 0; i < Math.min(array.length, room); i++) {
      const item = array[i]
      if (typeof item === "object" && item !== null) {
        const asObj = item as Record<string, unknown>
        const label = String(asObj.domain || asObj.name || `item-${i + 1}`)
        subtasks.push({
          key: makeKebabKey(label, `record-${i + 1}`),
          content: JSON.stringify(item, null, 2),
        })
      } else {
        subtasks.push({
          key: `record-${i + 1}`,
          content: String(item),
        })
      }
    }
    if (subtasks.length > 1) return subtasks
  }

  // Markdown tables
  const tableRows = extractMarkdownTableRows(inputContent)
  if (tableRows.length > 1) {
    return tableRows.slice(0, limit).map((row, i) => {
      const leadingCell = row.split("|")[0]?.trim() || row
      return {
        key: makeKebabKey(
          leadingCell.split(/\s+/).slice(0, 6).join(" "),
          `row-${i + 1}`,
        ),
        content: row,
      }
    })
  }

  const listItems = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+\S+/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length > 0)

  if (listItems.length > 1) {
    return listItems.slice(0, limit).map((line, i) => ({
      key: makeKebabKey(
        line.split(/\s+/).slice(0, 6).join(" "),
        `item-${i + 1}`,
      ),
      content: line,
    }))
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 80)
  if (paragraphs.length > 1) {
    return paragraphs.slice(0, limit).map((chunk, i) => ({
      key: `part-${i + 1}`,
      content: chunk,
    }))
  }

  return [{ key: "subtask-0", content: inputContent }]
}
