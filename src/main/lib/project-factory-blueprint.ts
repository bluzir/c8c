import { mkdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type {
  FactoryOutcomeDefinition,
  ProjectFactoryDefinition,
  FactoryRecipeDefinition,
  ProjectFactoryBlueprint,
  SaveProjectFactoryBlueprintInput,
} from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"

const FACTORY_BLUEPRINT_DIR = ".c8c"
const FACTORY_BLUEPRINT_FILE = "factory.json"

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

function sanitizeList(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined
  const next = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
  return next.length > 0 ? Array.from(new Set(next)) : undefined
}

function sanitizeFactoryLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function sanitizeOutcome(
  input: FactoryOutcomeDefinition | undefined,
): FactoryOutcomeDefinition | undefined {
  if (!input) return undefined
  const outcome: FactoryOutcomeDefinition = {
    title:
      typeof input.title === "string"
        ? input.title.trim() || undefined
        : undefined,
    statement:
      typeof input.statement === "string"
        ? input.statement.trim() || undefined
        : undefined,
    successSignal:
      typeof input.successSignal === "string"
        ? input.successSignal.trim() || undefined
        : undefined,
    timeHorizon:
      typeof input.timeHorizon === "string"
        ? input.timeHorizon.trim() || undefined
        : undefined,
    windowStart:
      typeof input.windowStart === "string"
        ? input.windowStart.trim() || undefined
        : undefined,
    windowEnd:
      typeof input.windowEnd === "string"
        ? input.windowEnd.trim() || undefined
        : undefined,
    targetCount:
      typeof input.targetCount === "number" &&
      Number.isFinite(input.targetCount)
        ? input.targetCount
        : null,
    targetUnit:
      typeof input.targetUnit === "string"
        ? input.targetUnit.trim() || undefined
        : undefined,
    audience:
      typeof input.audience === "string"
        ? input.audience.trim() || undefined
        : undefined,
    constraints: sanitizeList(input.constraints),
  }

  const hasValue = Object.values(outcome).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === "number") return true
    return Boolean(value)
  })
  return hasValue ? outcome : undefined
}

function sanitizeRecipe(
  input: FactoryRecipeDefinition | undefined,
): FactoryRecipeDefinition | undefined {
  if (!input) return undefined
  const recipe: FactoryRecipeDefinition = {
    summary:
      typeof input.summary === "string"
        ? input.summary.trim() || undefined
        : undefined,
    packIds: sanitizeList(input.packIds),
    stageOrder: sanitizeList(input.stageOrder),
    artifactContracts: sanitizeList(input.artifactContracts),
    qualityPolicy: sanitizeList(input.qualityPolicy),
    strategistCheckpoints: sanitizeList(input.strategistCheckpoints),
    caseGenerationRules: sanitizeList(input.caseGenerationRules),
  }

  const hasValue = Object.values(recipe).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    return Boolean(value)
  })
  return hasValue ? recipe : undefined
}

export function projectFactoryBlueprintPath(projectPath: string): string {
  return join(
    resolve(projectPath),
    FACTORY_BLUEPRINT_DIR,
    FACTORY_BLUEPRINT_FILE,
  )
}

function slugifyFactorySeed(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function buildFactoryId(label: string, fallbackIndex: number): string {
  const slug = slugifyFactorySeed(label)
  return slug ? `factory:${slug}` : `factory:${fallbackIndex + 1}`
}

function sanitizeFactory(
  input: Partial<ProjectFactoryDefinition> | null | undefined,
  fallbackIndex: number,
): ProjectFactoryDefinition | null {
  if (!input) return null
  const outcome = sanitizeOutcome(input.outcome)
  const recipe = sanitizeRecipe(input.recipe)
  const label =
    sanitizeFactoryLabel(input.label) ||
    outcome?.title ||
    recipe?.summary ||
    undefined
  if (!label && !outcome && !recipe) return null

  const now = Date.now()
  return {
    id:
      sanitizeFactoryLabel(input.id) ||
      buildFactoryId(label || "factory", fallbackIndex),
    modeId:
      typeof input.modeId === "string"
        ? input.modeId.trim() || undefined
        : undefined,
    label: label || `Lab path ${fallbackIndex + 1}`,
    outcome,
    recipe,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : now,
  }
}

type NormalizedBlueprintInput = {
  factories?: Array<Partial<ProjectFactoryDefinition>>
  selectedFactoryId?: string | null
  createdAt?: number
  updatedAt?: number
  outcome?: FactoryOutcomeDefinition
  recipe?: FactoryRecipeDefinition
}

function normalizeBlueprint(
  projectPath: string,
  input: NormalizedBlueprintInput,
): ProjectFactoryBlueprint | null {
  const legacyFactory = sanitizeFactory(
    {
      id: "factory:default",
      label: sanitizeFactoryLabel(input.outcome?.title) || "Project lab",
      outcome: input.outcome,
      recipe: input.recipe,
      createdAt:
        typeof input.createdAt === "number" ? input.createdAt : undefined,
      updatedAt:
        typeof input.updatedAt === "number" ? input.updatedAt : undefined,
    },
    0,
  )
  const rawFactories = Array.isArray(input.factories)
    ? input.factories
    : legacyFactory
      ? [legacyFactory]
      : []
  const dedupedIds = new Set<string>()
  const factories = rawFactories
    .map((factory, index) => sanitizeFactory(factory, index))
    .filter((factory): factory is ProjectFactoryDefinition => factory !== null)
    .map((factory, index) => {
      if (!dedupedIds.has(factory.id)) {
        dedupedIds.add(factory.id)
        return factory
      }
      const nextId = buildFactoryId(factory.label, index)
      let uniqueId = nextId
      let suffix = 2
      while (dedupedIds.has(uniqueId)) {
        uniqueId = `${nextId}-${suffix}`
        suffix += 1
      }
      dedupedIds.add(uniqueId)
      return {
        ...factory,
        id: uniqueId,
      }
    })
  if (factories.length === 0) return null

  const selectedFactoryId =
    typeof input.selectedFactoryId === "string" &&
    factories.some((factory) => factory.id === input.selectedFactoryId)
      ? input.selectedFactoryId
      : factories[0]?.id || null
  return {
    version: 2,
    projectPath: resolve(projectPath),
    factories,
    selectedFactoryId,
    createdAt:
      typeof input.createdAt === "number" ? input.createdAt : Date.now(),
    updatedAt:
      typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
  }
}

export async function loadProjectFactoryBlueprint(
  projectPath: string,
): Promise<ProjectFactoryBlueprint | null> {
  const blueprintPath = projectFactoryBlueprintPath(projectPath)
  try {
    const raw = await readFile(blueprintPath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<ProjectFactoryBlueprint>
    return normalizeBlueprint(projectPath, parsed)
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("project-factory-blueprint", "load_failed", {
        projectPath: resolve(projectPath),
        blueprintPath,
        error: String(error),
      })
    }
    return null
  }
}

export async function saveProjectFactoryBlueprint(
  input: SaveProjectFactoryBlueprintInput,
): Promise<ProjectFactoryBlueprint> {
  const projectPath = resolve(input.projectPath)
  const blueprintPath = projectFactoryBlueprintPath(projectPath)
  const existing = await loadProjectFactoryBlueprint(projectPath)
  const now = Date.now()
  const normalized = normalizeBlueprint(projectPath, {
    factories: input.blueprint.factories,
    selectedFactoryId: input.blueprint.selectedFactoryId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  })

  if (!normalized) {
    throw new Error("Lab blueprint must include at least one path")
  }

  await mkdir(join(projectPath, FACTORY_BLUEPRINT_DIR), { recursive: true })
  await writeFileAtomic(
    blueprintPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
  )
  return normalized
}
