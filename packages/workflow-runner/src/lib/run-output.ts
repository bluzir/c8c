import { readFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import YAML from "yaml"
import type {
  ErrorKind,
  MergerNodeConfig,
  NodeInput,
  NodeState,
  OutputNodeConfig,
  ProviderId,
  SkillNodeConfig,
  WorkflowEdge,
  WorkflowNode,
} from "../schema.js"
import { writeFileAtomic } from "./atomic-write.js"

interface RunOutputLogger {
  warn?(
    component: string,
    event: string,
    context?: Record<string, unknown>,
  ): void
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function incomingEdgePriority(type: WorkflowEdge["type"]): number {
  if (type === "fail") return 0
  if (type === "pass") return 1
  return 2
}

export function sanitizeNodeId(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9-]/g, "_")
}

export function selectIncomingInput(
  incomingEdges: WorkflowEdge[],
  nodeStates: Record<string, NodeState>,
): NodeInput | null {
  const candidates = incomingEdges.flatMap((edge) => {
    const sourceState = nodeStates[edge.source]
    const output = sourceState?.output
    const content = output?.content
    if (!output || typeof content !== "string" || content.length === 0)
      return []
    return [
      {
        edge,
        output,
        completedAt: sourceState.completedAt ?? 0,
      },
    ]
  })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.completedAt !== b.completedAt) return b.completedAt - a.completedAt
    const typeDiff =
      incomingEdgePriority(a.edge.type) - incomingEdgePriority(b.edge.type)
    if (typeDiff !== 0) return typeDiff
    const sourceDiff = a.edge.source.localeCompare(b.edge.source)
    if (sourceDiff !== 0) return sourceDiff
    return a.edge.id.localeCompare(b.edge.id)
  })

  return candidates[0].output
}

function compactArtifactLabel(
  value: string | undefined | null,
  maxLength = 48,
): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

function humanizeIdentifier(value: string): string {
  const parts = value
    .split(/[-_/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return value
  return parts
    .map((part) => {
      if (part.length <= 3) return part.toUpperCase()
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
    })
    .join(" ")
}

export function normalizedSkillRef(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : ""
}

function buildArtifactMetadata(
  node: WorkflowNode,
): Pick<
  NodeInput["metadata"],
  "artifact_type" | "artifact_label" | "artifact_role"
> {
  switch (node.type) {
    case "input":
      return {
        artifact_type: "source_input",
        artifact_label: "Source input",
        artifact_role: "input",
      }
    case "skill": {
      const config = node.config as SkillNodeConfig
      const skillRef = normalizedSkillRef(config.skillRef)
      const skillName = skillRef
        ? humanizeIdentifier(
            skillRef.split("/").filter(Boolean).pop() || skillRef,
          )
        : humanizeIdentifier(node.id)
      return {
        artifact_type: "stage_output",
        artifact_label: `${skillName} output`,
        artifact_role: "intermediate",
      }
    }
    case "evaluator":
      return {
        artifact_type: "quality_decision",
        artifact_label: "Quality decision",
        artifact_role: "decision",
      }
    case "splitter":
      return {
        artifact_type: "branch_assignments",
        artifact_label: "Branch assignments",
        artifact_role: "intermediate",
      }
    case "merger": {
      const config = node.config as MergerNodeConfig
      const artifactLabel =
        config.strategy === "summarize"
          ? "Merged summary"
          : config.strategy === "select_best"
            ? "Best branch result"
            : "Merged result"
      return {
        artifact_type: "merged_result",
        artifact_label: artifactLabel,
        artifact_role: "intermediate",
      }
    }
    case "approval":
      return {
        artifact_type: "approved_content",
        artifact_label: "Approved content",
        artifact_role: "decision",
      }
    case "human":
      return {
        artifact_type: "human_response",
        artifact_label: "Human response",
        artifact_role: "decision",
      }
    case "output": {
      const config = node.config as OutputNodeConfig
      return {
        artifact_type: "final_result",
        artifact_label:
          compactArtifactLabel(config.title, 52) || "Final result",
        artifact_role: "final",
      }
    }
  }

  return {
    artifact_type: "stage_output",
    artifact_label: "Stage output",
    artifact_role: "intermediate",
  }
}

export function buildNodeOutputMetadata(
  node: WorkflowNode,
  metadata: Omit<Partial<NodeInput["metadata"]>, "source"> = {},
): NodeInput["metadata"] {
  return {
    source: node.id,
    ...buildArtifactMetadata(node),
    ...metadata,
  }
}

export function createNodeOutput(
  node: WorkflowNode,
  content: string,
  metadata: Omit<Partial<NodeInput["metadata"]>, "source"> = {},
): NodeInput {
  return {
    content,
    metadata: buildNodeOutputMetadata(node, metadata),
  }
}

function normalizeDiagnosticSummaryTone(
  value: unknown,
):
  | NonNullable<NodeInput["metadata"]["diagnostic_summary"]>["tone"]
  | undefined {
  return value === "neutral" || value === "warning" || value === "danger"
    ? value
    : undefined
}

function normalizeDiagnosticCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return undefined
  return Math.floor(value)
}

function normalizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeDiagnosticCategorySummary(
  value: unknown,
):
  | NonNullable<
      NonNullable<NodeInput["metadata"]["diagnostic_summary"]>["categories"]
    >[number]
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = normalizeDiagnosticText(record.id)
  const label = normalizeDiagnosticText(record.label)
  if (!id || !label) return null
  return {
    id,
    label,
    detail: normalizeDiagnosticText(record.detail),
    severity: normalizeDiagnosticSummaryTone(record.severity),
    count: normalizeDiagnosticCount(record.count),
  }
}

function normalizeDiagnosticFindingSummary(
  value: unknown,
):
  | NonNullable<
      NonNullable<NodeInput["metadata"]["diagnostic_summary"]>["topFindings"]
    >[number]
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = normalizeDiagnosticText(record.id)
  const label = normalizeDiagnosticText(record.label)
  if (!id || !label) return null
  return {
    id,
    label,
    detail: normalizeDiagnosticText(record.detail),
    severity: normalizeDiagnosticSummaryTone(record.severity),
  }
}

function normalizeDiagnosticSummary(
  value: unknown,
): NodeInput["metadata"]["diagnostic_summary"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined
  const record = value as Record<string, unknown>
  const severityCountsRecord = (record.severity_counts ??
    record.severityCounts) as Record<string, unknown> | undefined
  const severityCounts =
    severityCountsRecord &&
    typeof severityCountsRecord === "object" &&
    !Array.isArray(severityCountsRecord)
      ? {
          critical: normalizeDiagnosticCount(severityCountsRecord.critical),
          high: normalizeDiagnosticCount(severityCountsRecord.high),
          medium: normalizeDiagnosticCount(severityCountsRecord.medium),
          low: normalizeDiagnosticCount(severityCountsRecord.low),
          info: normalizeDiagnosticCount(severityCountsRecord.info),
        }
      : undefined
  const categories = Array.isArray(record.categories)
    ? record.categories
        .map((entry) => normalizeDiagnosticCategorySummary(entry))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : []
  const topFindingsSource = record.top_findings ?? record.topFindings
  const topFindings = Array.isArray(topFindingsSource)
    ? topFindingsSource
        .map((entry) => normalizeDiagnosticFindingSummary(entry))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : []
  const summary: NodeInput["metadata"]["diagnostic_summary"] = {
    headline: normalizeDiagnosticText(record.headline),
    summary: normalizeDiagnosticText(record.summary),
    tone: normalizeDiagnosticSummaryTone(record.tone),
    rootCause: normalizeDiagnosticText(record.root_cause ?? record.rootCause),
    recommendedNextAction: normalizeDiagnosticText(
      record.recommended_next_action ?? record.recommendedNextAction,
    ),
    severityCounts:
      severityCounts &&
      Object.values(severityCounts).some((entry) => entry !== undefined)
        ? severityCounts
        : undefined,
    categories: categories.length > 0 ? categories : undefined,
    topFindings: topFindings.length > 0 ? topFindings : undefined,
  }

  return Object.values(summary).some((entry) => entry !== undefined)
    ? summary
    : undefined
}

function extractDiagnosticSummaryDocument(content: string): {
  body: string
  diagnosticSummary?: NodeInput["metadata"]["diagnostic_summary"]
} {
  if (!content.startsWith("---")) {
    return { body: content }
  }
  const end = content.indexOf("\n---", 3)
  if (end === -1) {
    return { body: content }
  }

  let parsed: unknown
  try {
    parsed = YAML.parse(content.slice(3, end))
  } catch {
    return { body: content }
  }

  const summary = normalizeDiagnosticSummary(
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).diagnostic_summary
      : undefined,
  )
  if (!summary) {
    return { body: content }
  }

  const body = content.slice(end + 4).replace(/^(?:\r?\n)+/, "")
  return { body, diagnosticSummary: summary }
}

export function createAgentNodeOutput(
  node: WorkflowNode,
  content: string,
  metadata: Omit<Partial<NodeInput["metadata"]>, "source"> = {},
): NodeInput {
  const structuredDocument = extractDiagnosticSummaryDocument(content)
  return createNodeOutput(node, structuredDocument.body, {
    ...metadata,
    ...(structuredDocument.diagnosticSummary
      ? { diagnostic_summary: structuredDocument.diagnosticSummary }
      : {}),
  })
}

export function pickPassThroughMetadata(
  input: NodeInput | null | undefined,
): Pick<Partial<NodeInput["metadata"]>, "diagnostic_summary"> {
  return input?.metadata?.diagnostic_summary
    ? { diagnostic_summary: input.metadata.diagnostic_summary }
    : {}
}

export function buildContinueOutput(
  node: WorkflowNode,
  incomingContent: string,
  partialOutput: NodeInput | undefined,
): NodeInput {
  if (partialOutput) {
    return {
      ...partialOutput,
      metadata: {
        ...partialOutput.metadata,
        partial_on_error: true,
        error_policy_applied: "continue",
      },
    }
  }
  return createNodeOutput(node, incomingContent, {
    output_source: "input_fallback",
    partial_on_error: true,
    error_policy_applied: "continue",
  })
}

export function buildErrorEnvelopeOutput(
  node: WorkflowNode,
  incomingContent: string,
  partialOutput: NodeInput | undefined,
  errorKind: ErrorKind,
  message: string,
  attempt: number,
): NodeInput {
  const fallback = partialOutput?.content || incomingContent
  return {
    content: JSON.stringify(
      {
        ok: false,
        error: {
          kind: errorKind,
          message,
          nodeId: node.id,
          attempt,
        },
        fallback: {
          content: fallback,
        },
      },
      null,
      2,
    ),
    metadata: buildNodeOutputMetadata(node, {
      partial_on_error: true,
      error_policy_applied: "continue_error_output",
      error_envelope: true,
    }),
  }
}

export function collectUpstreamIds(
  nodeId: string,
  edges: { source: string; target: string }[],
  nodeStates: Record<string, { status: string }>,
): string[] {
  const visited = new Set<string>()
  const queue = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source)
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    if (nodeStates[id]?.status !== "completed") continue
    visited.add(id)
    for (const edge of edges) {
      if (edge.target === id) queue.push(edge.source)
    }
  }
  return [...visited]
}

function looksLikeJsonDocument(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) return false
  try {
    JSON.parse(candidate)
    return true
  } catch {
    return false
  }
}

function looksLikeProgressNarration(value: string): boolean {
  const text = value.toLowerCase()
  const markers = [
    "writing the output to the content file",
    "now i have a complete picture",
    "write failed",
    "write result",
    "read result",
    "thinking...",
    "готово.",
    "извлечено",
  ]
  return markers.some((marker) => text.includes(marker))
}

function pickSkillOutput(
  mode: SkillNodeConfig["outputMode"] | undefined,
  stdoutText: string,
  fileContent: string | null,
  effectiveInput: string,
): { content: string; source: "stdout" | "content_file" | "input_fallback" } {
  const effectiveMode = mode || "auto"
  const stdout = stdoutText.trim()
  const fileRaw = fileContent ?? ""
  const file = fileRaw.trim()
  const input = effectiveInput.trim()
  const fileChanged = file.length > 0 && file !== input

  if (effectiveMode === "stdout") {
    if (stdout) return { content: stdout, source: "stdout" }
    if (fileChanged) return { content: fileRaw, source: "content_file" }
    return { content: effectiveInput, source: "input_fallback" }
  }

  if (effectiveMode === "content_file") {
    if (fileChanged) return { content: fileRaw, source: "content_file" }
    if (stdout) return { content: stdout, source: "stdout" }
    return { content: effectiveInput, source: "input_fallback" }
  }

  if (!stdout && fileChanged)
    return { content: fileRaw, source: "content_file" }
  if (stdout && !fileChanged) return { content: stdout, source: "stdout" }
  if (!stdout && !fileChanged)
    return { content: effectiveInput, source: "input_fallback" }

  const stdoutJson = looksLikeJsonDocument(stdout)
  const fileJson = looksLikeJsonDocument(fileRaw)
  const stdoutLooksNarrative = looksLikeProgressNarration(stdout)
  const fileSubstantiallyLarger =
    fileRaw.length > Math.max(stdout.length * 1.25, stdout.length + 200)

  if (
    stdoutLooksNarrative ||
    (fileJson && !stdoutJson) ||
    (stdout.length < 120 && fileRaw.length > 220) ||
    fileSubstantiallyLarger
  ) {
    return { content: fileRaw, source: "content_file" }
  }

  return { content: stdout, source: "stdout" }
}

function hasChangedContent(
  content: string | null,
  effectiveInput: string,
): boolean {
  if (!content) return false
  const trimmed = content.trim()
  if (!trimmed) return false
  return trimmed !== effectiveInput.trim()
}

function pickPreferredContentFile(
  primaryFileContent: string | null,
  mirroredFileContent: string | null,
  effectiveInput: string,
): string | null {
  if (!primaryFileContent && !mirroredFileContent) return null

  const primaryChanged = hasChangedContent(primaryFileContent, effectiveInput)
  const mirroredChanged = hasChangedContent(mirroredFileContent, effectiveInput)

  if (primaryChanged && mirroredChanged) {
    const primaryJson = looksLikeJsonDocument(primaryFileContent || "")
    const mirroredJson = looksLikeJsonDocument(mirroredFileContent || "")
    if (primaryJson !== mirroredJson) {
      return mirroredJson ? mirroredFileContent : primaryFileContent
    }
    return (mirroredFileContent || "").length >
      (primaryFileContent || "").length
      ? mirroredFileContent
      : primaryFileContent
  }

  if (mirroredChanged) return mirroredFileContent
  if (primaryChanged) return primaryFileContent
  return primaryFileContent || mirroredFileContent
}

export function sanitizeInvalidUnicode(value: string): string {
  let out = ""
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    const isHigh = code >= 0xd800 && code <= 0xdbff
    const isLow = code >= 0xdc00 && code <= 0xdfff

    if (isHigh) {
      const next = value.charCodeAt(i + 1)
      const nextIsLow = next >= 0xdc00 && next <= 0xdfff
      if (nextIsLow) {
        out += value[i] + value[i + 1]
        i += 1
      } else {
        out += "\uFFFD"
      }
      continue
    }

    if (isLow) {
      out += "\uFFFD"
      continue
    }

    out += value[i]
  }
  return out
}

export async function buildSkillNodeOutput(
  logger: RunOutputLogger,
  node: WorkflowNode,
  config: SkillNodeConfig,
  stdoutText: string,
  contentFile: string,
  effectiveInput: string,
  partialOnError = false,
): Promise<NodeInput> {
  let primaryFileContent: string | null = null
  try {
    primaryFileContent = await readFile(contentFile, "utf-8")
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logger.warn?.("workflow-runner", "skill_content_file_read_failed", {
        contentFile,
        error: errorMessage(error),
      })
    }
  }

  const mirroredContentFile = join(
    dirname(contentFile),
    "outputs",
    basename(contentFile),
  )
  let mirroredFileContent: string | null = null
  if (mirroredContentFile !== contentFile) {
    try {
      mirroredFileContent = await readFile(mirroredContentFile, "utf-8")
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logger.warn?.(
          "workflow-runner",
          "skill_mirrored_content_file_read_failed",
          {
            contentFile: mirroredContentFile,
            error: errorMessage(error),
          },
        )
      }
    }
  }

  const fileContent = pickPreferredContentFile(
    primaryFileContent,
    mirroredFileContent,
    effectiveInput,
  )
  const selectedOutput = pickSkillOutput(
    config.outputMode,
    stdoutText,
    fileContent,
    effectiveInput,
  )
  return createAgentNodeOutput(node, selectedOutput.content || effectiveInput, {
    output_source: selectedOutput.source,
    ...(partialOnError ? { partial_on_error: true } : {}),
  })
}

export async function writeNodeOutputFile(
  workspace: string,
  nodeId: string,
  content: string,
): Promise<void> {
  await writeFileAtomic(
    join(workspace, "outputs", `${sanitizeNodeId(nodeId)}.md`),
    content,
  )
}

export function getClaudeResumeSessionId(
  providerId: ProviderId,
  state: NodeState | undefined,
): string | undefined {
  if (providerId !== "claude") return undefined
  if (state?.meta?.backend !== "claude_sdk") return undefined
  const sessionId = state.meta.provider_session_id?.trim()
  return sessionId ? sessionId : undefined
}
