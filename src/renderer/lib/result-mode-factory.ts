import type {
  ProjectFactoryBlueprint,
  ProjectFactoryDefinition,
} from "@shared/types"
import { getDomain } from "@shared/domains"
import type { ResultModeConfigValues } from "@/lib/result-mode-config"
import type { WorkflowResultMode } from "@/lib/result-modes"
import { initDomains } from "@/lib/domain-init"

// Ensure domains are registered before any module-level constants are built.
initDomains()

function trim(value: string | undefined | null) {
  return (value || "").trim()
}

function dedupe(values: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const normalized = trim(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

function splitLines(value: string | undefined | null) {
  return dedupe(
    (value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

function titleCaseFromIdentifier(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function slugifyFactorySeed(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function buildFactoryId(value: string) {
  const slug = slugifyFactorySeed(value)
  return slug ? `factory:${slug}` : `factory:${Date.now().toString(36)}`
}

function firstFilled(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const normalized = trim(value)
    if (normalized) return normalized
  }
  return undefined
}

function extractTargetDefinition(values: string[]) {
  const combined = values.join("\n")
  const targetMatch = combined.match(
    /\b(\d+)\s+(posts?|articles?|lessons?|modules?|emails?|assets?|videos?)\b/i,
  )
  const horizonMatch = combined.match(
    /\b(next\s+\d+\s+(?:days?|weeks?|months?)|\d+\s+(?:days?|weeks?|months?))\b/i,
  )

  return {
    targetCount: targetMatch ? Number(targetMatch[1]) : null,
    targetUnit: targetMatch?.[2]?.toLowerCase(),
    timeHorizon: horizonMatch?.[1],
  }
}

function factoryLabelForMode(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  const domain = getDomain(mode.id)
  return firstFilled(
    values[domain.factoryTitleFieldId],
    existingFactory?.label,
    existingFactory?.outcome?.title,
    domain.factoryFallbackLabel,
  )
}

function buildOutcomeStatement(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
) {
  const domain = getDomain(mode.id)
  const sections = domain.buildOutcomeSections?.(values)
  if (!sections || sections.length === 0) return undefined
  return sections
    .map((section) => `${section.label}: ${section.value}`)
    .join("\n")
}

function buildConstraints(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  const next = [...(existingFactory?.outcome?.constraints || [])]
  const domain = getDomain(mode.id)
  const domainConstraints = domain.buildConstraints?.(values) || []
  next.push(...domainConstraints)
  return dedupe(next)
}

function buildStrategistCheckpoints(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  // Dev special case: user-configured checkpoints take priority
  if (mode.id === "development") {
    const configured = splitLines(values.strategist_checkpoints)
    if (configured.length > 0) return configured
  }
  if (existingFactory?.recipe?.strategistCheckpoints?.length) {
    return existingFactory.recipe.strategistCheckpoints
  }
  return getDomain(mode.id).factoryCheckpoints
}

function defaultQualityPolicy(mode: WorkflowResultMode) {
  return getDomain(mode.id).qualityPolicy
}

function defaultCaseGenerationRule(mode: WorkflowResultMode) {
  return getDomain(mode.id).caseGenerationRule
}

function defaultSuccessSignal(mode: WorkflowResultMode) {
  return getDomain(mode.id).successSignal
}

function buildAudience(
  mode: WorkflowResultMode,
  values: ResultModeConfigValues,
  existingFactory?: ProjectFactoryDefinition | null,
) {
  const domain = getDomain(mode.id)
  if (domain.buildAudience) {
    return domain.buildAudience(values) ?? existingFactory?.outcome?.audience
  }
  return existingFactory?.outcome?.audience
}

export function pickReusableFactoryForMode({
  blueprint,
  selectedFactoryId,
  mode,
}: {
  blueprint: ProjectFactoryBlueprint | null
  selectedFactoryId?: string | null
  mode: WorkflowResultMode
}): ProjectFactoryDefinition | null {
  const factories = blueprint?.factories || []
  if (selectedFactoryId) {
    const selected =
      factories.find((factory) => factory.id === selectedFactoryId) || null
    if (
      selected &&
      (selected.modeId === mode.id ||
        selected.recipe?.packIds?.some((packId) =>
          mode.packIds?.includes(packId),
        ))
    ) {
      return selected
    }
  }

  return (
    factories.find(
      (factory) =>
        factory.modeId === mode.id ||
        factory.recipe?.packIds?.some((packId) =>
          mode.packIds?.includes(packId),
        ),
    ) || null
  )
}

export function buildFactoryFromResultMode({
  mode,
  values,
  existingFactory = null,
  now = Date.now(),
}: {
  mode: WorkflowResultMode
  values: ResultModeConfigValues
  existingFactory?: ProjectFactoryDefinition | null
  now?: number
}): ProjectFactoryDefinition {
  const domain = getDomain(mode.id)
  const normalizedValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, trim(value)]),
  ) as ResultModeConfigValues
  const allTexts = Object.values(normalizedValues).filter(Boolean)
  const target = extractTargetDefinition(allTexts)
  const label =
    factoryLabelForMode(mode, normalizedValues, existingFactory) ||
    `${mode.label} Lab`
  const outcomeTitle =
    firstFilled(
      normalizedValues[domain.factoryTitleFieldId],
      existingFactory?.outcome?.title,
      label,
    ) || label
  const outcomeStatement =
    buildOutcomeStatement(mode, normalizedValues) ||
    existingFactory?.outcome?.statement ||
    mode.useFor
  const qualityPolicy = existingFactory?.recipe?.qualityPolicy?.length
    ? existingFactory.recipe.qualityPolicy
    : defaultQualityPolicy(mode)

  return {
    id: existingFactory?.id || buildFactoryId(label),
    modeId: mode.id,
    label,
    outcome: {
      title: outcomeTitle,
      statement: outcomeStatement,
      successSignal: firstFilled(
        domain.factorySuccessFieldId
          ? normalizedValues[domain.factorySuccessFieldId]
          : undefined,
        existingFactory?.outcome?.successSignal,
        defaultSuccessSignal(mode),
      ),
      timeHorizon: firstFilled(
        target.timeHorizon,
        existingFactory?.outcome?.timeHorizon,
      ),
      targetCount:
        target.targetCount ?? existingFactory?.outcome?.targetCount ?? null,
      targetUnit: firstFilled(
        target.targetUnit,
        existingFactory?.outcome?.targetUnit,
      ),
      audience: buildAudience(mode, normalizedValues, existingFactory),
      constraints: buildConstraints(mode, normalizedValues, existingFactory),
    },
    recipe: {
      summary: firstFilled(
        existingFactory?.recipe?.summary,
        `${mode.label} guided path`,
      ),
      packIds: dedupe([
        ...(existingFactory?.recipe?.packIds || []),
        ...(mode.packIds || []),
      ]),
      stageOrder: existingFactory?.recipe?.stageOrder?.length
        ? existingFactory.recipe.stageOrder
        : mode.guidedPath,
      artifactContracts: existingFactory?.recipe?.artifactContracts,
      qualityPolicy,
      strategistCheckpoints: buildStrategistCheckpoints(
        mode,
        normalizedValues,
        existingFactory,
      ),
      caseGenerationRules: existingFactory?.recipe?.caseGenerationRules?.length
        ? existingFactory.recipe.caseGenerationRules
        : [defaultCaseGenerationRule(mode)],
    },
    createdAt: existingFactory?.createdAt || now,
    updatedAt: now,
  }
}

export function formatResultModeLabel(modeId?: string) {
  return modeId ? titleCaseFromIdentifier(modeId) : "Not defined"
}
