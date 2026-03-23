import type { ArtifactRecord, ContentDomainContext } from "@shared/types"

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

export function buildContentDomainContext(
  artifacts: ArtifactRecord[],
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

  return { previousResults, templatesRun, availableTools: [] }
}
