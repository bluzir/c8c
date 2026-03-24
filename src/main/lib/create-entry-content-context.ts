import type {
  ArtifactRecord,
  ContentDomainContext,
  McpIntegrationStatus,
} from "@shared/types"
import { listProjectArtifacts } from "./artifact-store"
import { getMcpIntegrationStatuses } from "./mcp-integrations"

const CONTENT_RESULT_KINDS = new Set([
  "trend_digest",
  "editorial_calendar",
  "draft",
  "content_brief",
  "distribution_bundle",
])

const CONTENT_TEMPLATE_PREFIXES = [
  "content-",
  "predictable-text-",
  "copy-quality-",
]

const CONTENT_TOOL_IDS = ["web_search", "exa", "serper"] as const

type SearchToolId = (typeof CONTENT_TOOL_IDS)[number]

interface InspectContentDomainContextDeps {
  listProjectArtifacts: (projectPath: string) => Promise<ArtifactRecord[]>
  getSearchToolStatuses: (
    toolIds: string[],
    projectPath?: string,
  ) => Promise<
    Array<Pick<McpIntegrationStatus, "configured" | "requestedToolIds">>
  >
  now: () => number
}

export function buildContentDomainContext(
  artifacts: ArtifactRecord[],
  availableTools: string[] = [],
  now?: number,
): ContentDomainContext {
  const ts = now ?? Date.now()

  const previousResults = artifacts
    .filter((a) => CONTENT_RESULT_KINDS.has(a.kind))
    .map((a) => ({ kind: a.kind, title: a.title, ageMs: ts - a.createdAt }))
    .slice(0, 10)

  const templatesRun = [
    ...new Set(
      artifacts
        .filter(
          (a) =>
            a.templateId &&
            CONTENT_TEMPLATE_PREFIXES.some((prefix) =>
              a.templateId!.startsWith(prefix),
            ),
        )
        .map((a) => a.templateId!),
    ),
  ]

  return {
    previousResults,
    templatesRun,
    availableTools: normalizeAvailableTools(availableTools),
  }
}

export function resolveAvailableContentTools(
  statuses: Array<
    Pick<McpIntegrationStatus, "configured" | "requestedToolIds">
  >,
): string[] {
  const availableTools: string[] = []
  const seen = new Set<string>()

  for (const status of statuses) {
    if (!status.configured) continue
    for (const toolId of status.requestedToolIds) {
      const normalized = toolId.trim() as SearchToolId
      if (!CONTENT_TOOL_IDS.includes(normalized) || seen.has(normalized))
        continue
      seen.add(normalized)
      availableTools.push(normalized)
    }
  }

  return availableTools
}

export async function inspectContentDomainContext(
  projectPath: string,
  deps: Partial<InspectContentDomainContextDeps> = {},
): Promise<ContentDomainContext> {
  const resolvedDeps: InspectContentDomainContextDeps = {
    listProjectArtifacts,
    getSearchToolStatuses: getMcpIntegrationStatuses,
    now: () => Date.now(),
    ...deps,
  }

  const [artifacts, searchToolStatuses] = await Promise.all([
    resolvedDeps.listProjectArtifacts(projectPath).catch(() => []),
    resolvedDeps
      .getSearchToolStatuses([...CONTENT_TOOL_IDS], projectPath)
      .catch(() => []),
  ])

  return buildContentDomainContext(
    artifacts,
    resolveAvailableContentTools(searchToolStatuses),
    resolvedDeps.now(),
  )
}

function normalizeAvailableTools(availableTools: string[]): string[] {
  const next: string[] = []
  const seen = new Set<string>()

  for (const toolId of availableTools) {
    const normalized = toolId.trim() as SearchToolId
    if (!CONTENT_TOOL_IDS.includes(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }

  return next
}
