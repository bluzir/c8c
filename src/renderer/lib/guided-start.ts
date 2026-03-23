import type { ResultModeId } from "@shared/types"
import type { ResultModeConfigValues } from "@/lib/result-mode-config"

interface ResolveGuidedStartTemplateOptions {
  modeId: ResultModeId
  fallbackTemplateId?: string
  draftPrompt?: string
  modeConfig?: ResultModeConfigValues | null
  projectPath?: string | null
}

const REPO_SIGNAL_RE =
  /\b(repo|repository|codebase|branch|diff|pull request|workspace|project folder|directory|file path|existing code)\b/i
const BRIEF_SIGNAL_RE =
  /\b(feature|brief|scope|requirements?|flow|screen|experience|roadmap|plan|upload|checkout|signup|dashboard|onboarding|settings|billing|auth)\b/i
const REVIEW_SIGNAL_RE =
  /\b(review|verify|verification|qa|ship|merge|pull request|pr|diff)\b/i
const SECURITY_SIGNAL_RE =
  /\b(security|secure|vulnerability|vulnerabilities|vuln|auth|authentication|authorization|permissions?|owasp|secret|secrets|exposure|hardening)\b/i
const PATH_SIGNAL_RE =
  /(^|[\s"'`])([~./\\][^\s]+|[A-Za-z]:\\[^\s]+|[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+)/m

function normalize(value: string | undefined | null) {
  return (value || "").trim()
}

function includesProjectPathSignal(value: string, projectPath?: string | null) {
  if (!projectPath) return false
  const normalizedPath = normalize(projectPath)
  if (!normalizedPath) return false
  if (value.includes(normalizedPath)) return true

  const basename = normalizedPath.split(/[\\/]/).filter(Boolean).pop()
  return Boolean(basename && value.includes(basename))
}

function hasRepoSignal(value: string, projectPath?: string | null) {
  return (
    REPO_SIGNAL_RE.test(value) ||
    PATH_SIGNAL_RE.test(value) ||
    includesProjectPathSignal(value, projectPath)
  )
}

function hasBriefSignal(value: string) {
  return BRIEF_SIGNAL_RE.test(value)
}

function hasReviewSignal(value: string) {
  return REVIEW_SIGNAL_RE.test(value)
}

export function resolveGuidedStartTemplateId({
  modeId,
  fallbackTemplateId,
  draftPrompt,
  modeConfig,
  projectPath,
}: ResolveGuidedStartTemplateOptions) {
  if (modeId !== "development") return fallbackTemplateId

  const projectGoal = normalize(modeConfig?.project_goal)
  const sourceContext = normalize(modeConfig?.source_context)
  const qualityBar = normalize(modeConfig?.quality_bar)
  const prompt = normalize(draftPrompt)
  const combined = [prompt, projectGoal, sourceContext, qualityBar]
    .filter(Boolean)
    .join("\n")

  if (!combined) {
    return fallbackTemplateId || "delivery-map-codebase"
  }

  if (
    hasRepoSignal(combined, projectPath) &&
    (hasReviewSignal(combined) || SECURITY_SIGNAL_RE.test(combined))
  ) {
    return "full-stack-code-audit"
  }

  if (hasRepoSignal(combined, projectPath)) {
    return "delivery-map-codebase"
  }

  if (hasBriefSignal(combined) || combined.length > 0) {
    return "delivery-shape-project"
  }

  return fallbackTemplateId || "delivery-map-codebase"
}
