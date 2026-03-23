import type { WorkflowTemplate } from "@shared/types"
import type { DomainDefinition } from "@shared/domains/types"
import { registerDomain } from "@shared/domains/index"
import { developmentDomain } from "@shared/domains/development-data"
import { contentDomain } from "@shared/domains/content-data"
import { marketingDomain } from "@shared/domains/marketing-data"
import {
  coursesDomain,
  COURSES_STAGE_TOKENS,
} from "@shared/domains/courses-data"
import {
  isProductTemplate,
  isContentTemplate,
  isMarketingTemplate,
} from "@/lib/template-filters"

// ── Scoring helpers (extracted from result-modes.ts) ────────

function compactText(values: Array<string | undefined | null>): string {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ")
}

export function metadataText(template: WorkflowTemplate): string {
  return compactText([
    template.id,
    template.name,
    template.description,
    template.headline,
    template.how,
    template.input,
    template.output,
    template.useWhen,
    template.pack?.id,
    template.pack?.label,
    template.executionPolicy?.summary,
    template.executionPolicy?.description,
    template.executionPolicy?.tags?.join(" "),
  ]).toLowerCase()
}

export function metadataIncludesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token))
}

// ── Per-domain scoring functions ────────────────────────────

function scoreDevelopment(template: WorkflowTemplate): number {
  const text = metadataText(template)
  let score = 0
  const packIds = new Set(developmentDomain.packIds)
  const matchesDev = metadataIncludesAny(text, developmentDomain.metadataTokens)
  if (template.pack?.id && packIds.has(template.pack.id)) score += 100
  if (developmentDomain.templateIds.has(template.id)) score += 80
  if (isProductTemplate(template)) score += 35
  if (template.stage === "code") score += 30
  if (
    (template.stage === "research" ||
      template.stage === "strategy" ||
      template.stage === "operations") &&
    matchesDev
  )
    score += 20
  if (matchesDev) score += 10
  return score
}

function scoreContent(template: WorkflowTemplate): number {
  const text = metadataText(template)
  let score = 0
  const packIds = new Set(contentDomain.packIds)
  const matchesContent = metadataIncludesAny(text, contentDomain.metadataTokens)
  if (template.pack?.id && packIds.has(template.pack.id)) score += 100
  if (contentDomain.templateIds.has(template.id)) score += 80
  if (isContentTemplate(template)) score += 35
  if (template.stage === "content") score += 30
  if (matchesContent) score += 10
  return score
}

function scoreMarketing(template: WorkflowTemplate): number {
  const text = metadataText(template)
  let score = 0
  const packIds = new Set(marketingDomain.packIds)
  const matchesMarketing = metadataIncludesAny(
    text,
    marketingDomain.metadataTokens,
  )
  if (template.pack?.id && packIds.has(template.pack.id)) score += 100
  if (marketingDomain.templateIds.has(template.id)) score += 80
  if (isMarketingTemplate(template)) score += 35
  if (
    template.stage === "research" ||
    template.stage === "strategy" ||
    template.stage === "outreach"
  )
    score += 30
  if (matchesMarketing) score += 10
  return score
}

function scoreCourses(template: WorkflowTemplate): number {
  const text = metadataText(template)
  let score = 0
  const packIds = new Set(coursesDomain.packIds)
  const matchesCourses = metadataIncludesAny(text, coursesDomain.metadataTokens)
  if (template.pack?.id && packIds.has(template.pack.id)) score += 100
  if (coursesDomain.templateIds.has(template.id)) score += 90
  if (matchesCourses) score += 60
  if (
    (template.stage === "strategy" || template.stage === "content") &&
    metadataIncludesAny(text, COURSES_STAGE_TOKENS)
  )
    score += 20
  return score
}

// ── Registration ────────────────────────────────────────────

let initialized = false

export function initDomains(): void {
  if (initialized) return
  initialized = true

  registerDomain({ ...developmentDomain, scoreTemplate: scoreDevelopment })
  registerDomain({ ...contentDomain, scoreTemplate: scoreContent })
  registerDomain({ ...marketingDomain, scoreTemplate: scoreMarketing })
  registerDomain({ ...coursesDomain, scoreTemplate: scoreCourses })
}
