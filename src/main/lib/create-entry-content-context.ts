import type {
  ArtifactRecord,
  ContentDomainContext,
  McpIntegrationStatus,
} from "@shared/types"
import { listProjectArtifacts } from "./artifact-store"
import { getMcpIntegrationStatuses } from "./mcp-integrations"
import { listPopularTemplateIdsForProject } from "./project-template-usage"

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
const CONTENT_TEMPLATE_HISTORY_LIMIT = 64

type SearchToolId = (typeof CONTENT_TOOL_IDS)[number]
type WebSearchBackend = "builtin" | "exa"

interface InspectContentDomainContextDeps {
  listProjectArtifacts: (projectPath: string) => Promise<ArtifactRecord[]>
  getSearchToolStatuses: (
    toolIds: string[],
    projectPath?: string,
  ) => Promise<
    Array<Pick<McpIntegrationStatus, "configured" | "requestedToolIds">>
  >
  listRecordedTemplateIds: (
    projectPath: string,
    limit: number,
  ) => Promise<string[]>
  now: () => number
  webSearchBackend?: WebSearchBackend
}

interface BuildContentDomainContextOptions {
  availableTools?: string[]
  templatesRun?: string[]
  now?: number
}

export function buildContentDomainContext(
  artifacts: ArtifactRecord[],
  options: BuildContentDomainContextOptions = {},
): ContentDomainContext {
  const ts = options.now ?? Date.now()

  const previousResults = artifacts
    .filter((a) => CONTENT_RESULT_KINDS.has(a.kind))
    .map((a) => ({ kind: a.kind, title: a.title, ageMs: ts - a.createdAt }))
    .slice(0, 10)

  const templatesRun = collectContentTemplateIds([
    ...artifacts.map((artifact) => artifact.templateId),
    ...(options.templatesRun || []),
  ])

  return {
    previousResults,
    templatesRun,
    availableTools: normalizeAvailableTools(options.availableTools || []),
  }
}

export function resolveAvailableContentTools(
  statuses: Array<
    Pick<McpIntegrationStatus, "configured" | "requestedToolIds">
  >,
  webSearchBackend?: WebSearchBackend,
): string[] {
  const availableTools: string[] = []
  const seen = new Set<string>()

  if (webSearchBackend === "builtin") {
    seen.add("web_search")
    availableTools.push("web_search")
  }

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
    listRecordedTemplateIds: (currentProjectPath, limit) =>
      listPopularTemplateIdsForProject(currentProjectPath, limit),
    now: () => Date.now(),
    ...deps,
  }

  const [artifacts, searchToolStatuses, recordedTemplateIds] =
    await Promise.all([
      resolvedDeps.listProjectArtifacts(projectPath).catch(() => []),
      resolvedDeps
        .getSearchToolStatuses([...CONTENT_TOOL_IDS], projectPath)
        .catch(() => []),
      resolvedDeps
        .listRecordedTemplateIds(projectPath, CONTENT_TEMPLATE_HISTORY_LIMIT)
        .catch(() => []),
    ])

  return buildContentDomainContext(artifacts, {
    availableTools: resolveAvailableContentTools(
      searchToolStatuses,
      resolvedDeps.webSearchBackend,
    ),
    templatesRun: recordedTemplateIds,
    now: resolvedDeps.now(),
  })
}

function collectContentTemplateIds(
  templateIds: Array<string | null | undefined>,
): string[] {
  const next: string[] = []
  const seen = new Set<string>()

  for (const templateId of templateIds) {
    const normalized = (templateId || "").trim()
    if (!normalized) continue
    if (
      !CONTENT_TEMPLATE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ) {
      continue
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }

  return next
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
