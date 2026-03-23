import { mkdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type {
  ArtifactRecord,
  FactoryPlannedCase,
  ProjectFactoryState,
  SpawnFactoryCasesFromArtifactInput,
  SpawnFactoryCasesFromArtifactResult,
} from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { listProjectArtifacts } from "./artifact-store"
import { logWarn } from "./structured-log"

const FACTORY_STATE_DIR = ".c8c"
const FACTORY_STATE_FILE = "factory-state.json"

interface PlannedCaseDraft {
  title: string
  summary?: string
  prompt?: string
  scheduledFor?: string
  position?: number
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function normalizePrompt(
  title: string,
  summary?: string,
  scheduledFor?: string,
) {
  const parts = [
    `Create the item "${title}".`,
    scheduledFor ? `Planned slot: ${scheduledFor}.` : null,
    summary ? `Use this planning context:\n${summary}` : null,
  ].filter((value): value is string => Boolean(value))
  return parts.join("\n\n")
}

function sanitizePlannedCase(
  input: Partial<FactoryPlannedCase> | null | undefined,
): FactoryPlannedCase | null {
  if (!input) return null
  const id = trimString(input.id)
  const factoryId = trimString(input.factoryId)
  const title = trimString(input.title)
  if (!id || !factoryId || !title) return null
  const now = Date.now()
  return {
    id,
    factoryId,
    title,
    summary: trimString(input.summary),
    prompt: trimString(input.prompt),
    sourceArtifactId: trimString(input.sourceArtifactId),
    sourceArtifactTitle: trimString(input.sourceArtifactTitle),
    templateId: trimString(input.templateId),
    scheduledFor: trimString(input.scheduledFor),
    position:
      typeof input.position === "number" && Number.isFinite(input.position)
        ? input.position
        : undefined,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : now,
  }
}

function normalizeState(
  projectPath: string,
  input: Partial<ProjectFactoryState>,
): ProjectFactoryState {
  const plannedCases = Array.isArray(input.plannedCases)
    ? input.plannedCases
        .map((entry) => sanitizePlannedCase(entry))
        .filter((entry): entry is FactoryPlannedCase => entry !== null)
        .sort((left, right) => {
          if (
            (left.position ?? Number.MAX_SAFE_INTEGER) !==
            (right.position ?? Number.MAX_SAFE_INTEGER)
          ) {
            return (
              (left.position ?? Number.MAX_SAFE_INTEGER) -
              (right.position ?? Number.MAX_SAFE_INTEGER)
            )
          }
          return left.createdAt - right.createdAt
        })
    : []

  return {
    version: 1,
    projectPath: resolve(projectPath),
    plannedCases,
    createdAt:
      typeof input.createdAt === "number" ? input.createdAt : Date.now(),
    updatedAt:
      typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
  }
}

function factoryStatePath(projectPath: string) {
  return join(resolve(projectPath), FACTORY_STATE_DIR, FACTORY_STATE_FILE)
}

function sanitizeTitle(value: string) {
  return value
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function parseTableBlocks(markdown: string): string[][] {
  const lines = markdown.split(/\r?\n/)
  const blocks: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      current.push(line)
      continue
    }
    if (current.length > 0) {
      blocks.push(current)
      current = []
    }
  }

  if (current.length > 0) blocks.push(current)
  return blocks
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function isAlignmentRow(cells: string[]) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function findPreferredColumn(headers: string[], patterns: RegExp[]) {
  for (const pattern of patterns) {
    const index = headers.findIndex((header) => pattern.test(header))
    if (index >= 0) return index
  }
  return -1
}

function extractDraftsFromTables(markdown: string): PlannedCaseDraft[] {
  const blocks = parseTableBlocks(markdown)
  const drafts: PlannedCaseDraft[] = []

  for (const block of blocks) {
    if (block.length < 3) continue
    const headers = parseTableRow(block[0]).map((header) =>
      header.toLowerCase(),
    )
    const alignment = parseTableRow(block[1])
    if (!isAlignmentRow(alignment)) continue

    const titleIndex = findPreferredColumn(headers, [
      /title/,
      /idea/,
      /topic/,
      /post/,
      /hook/,
      /headline/,
      /slot/,
      /item/,
    ])
    const scheduleIndex = findPreferredColumn(headers, [
      /date/,
      /day/,
      /schedule/,
      /publish/,
      /slot/,
      /time/,
    ])

    for (let rowIndex = 2; rowIndex < block.length; rowIndex += 1) {
      const row = parseTableRow(block[rowIndex])
      if (row.every((cell) => cell.length === 0)) continue
      const title = sanitizeTitle(
        row[titleIndex] ||
          row.find((cell) => cell.trim().length > 0) ||
          `Item ${drafts.length + 1}`,
      )
      if (!title) continue
      const scheduledFor =
        scheduleIndex >= 0 ? trimString(row[scheduleIndex]) : undefined
      const summaryParts = row
        .map((cell, index) => ({
          cell: trimString(cell),
          header: headers[index] || `column_${index + 1}`,
        }))
        .filter((entry, index) => Boolean(entry.cell) && index !== titleIndex)
        .slice(0, 5)
        .map((entry) => `${entry.header.replace(/_/g, " ")}: ${entry.cell}`)
      const summary =
        summaryParts.length > 0 ? summaryParts.join("\n") : undefined
      drafts.push({
        title,
        summary,
        prompt: normalizePrompt(title, summary, scheduledFor),
        scheduledFor,
        position: drafts.length + 1,
      })
    }
  }

  return drafts
}

function extractDraftsFromList(markdown: string): PlannedCaseDraft[] {
  const lines = markdown.split(/\r?\n/)
  const drafts: PlannedCaseDraft[] = []

  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
    if (!match) continue
    const title = sanitizeTitle(match[1] || "")
    if (!title) continue
    drafts.push({
      title,
      prompt: normalizePrompt(title),
      position: drafts.length + 1,
    })
  }

  return drafts
}

function extractDraftsFromHeadings(markdown: string): PlannedCaseDraft[] {
  const lines = markdown.split(/\r?\n/)
  const drafts: PlannedCaseDraft[] = []

  for (const line of lines) {
    const match = line.match(/^\s{0,3}#{2,4}\s+(.+)$/)
    if (!match) continue
    const title = sanitizeTitle(match[1] || "")
    if (!title) continue
    drafts.push({
      title,
      prompt: normalizePrompt(title),
      position: drafts.length + 1,
    })
  }

  return drafts
}

function extractDrafts(markdown: string): PlannedCaseDraft[] {
  const body =
    markdown
      .split(/\n---\n/)
      .slice(1)
      .join("\n---\n") || markdown
  const tableDrafts = extractDraftsFromTables(body)
  if (tableDrafts.length > 0) return tableDrafts.slice(0, 250)
  const listDrafts = extractDraftsFromList(body)
  if (listDrafts.length > 0) return listDrafts.slice(0, 250)
  return extractDraftsFromHeadings(body).slice(0, 250)
}

function buildPlannedCaseId(factoryId: string, position: number) {
  const seed =
    factoryId
      .replace(/^(factory|pack):/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "factory"
  return `case:${seed}:planned:${Date.now().toString(36)}:${position.toString(36)}`
}

function dedupeKey(
  factoryId: string,
  sourceArtifactId: string | undefined,
  title: string,
  scheduledFor?: string,
) {
  return [
    factoryId,
    sourceArtifactId || "",
    title.toLowerCase(),
    (scheduledFor || "").toLowerCase(),
  ].join("::")
}

async function readArtifactContent(artifact: ArtifactRecord) {
  return readFile(artifact.contentPath, "utf-8")
}

export async function loadProjectFactoryState(
  projectPath: string,
): Promise<ProjectFactoryState> {
  const path = factoryStatePath(projectPath)
  try {
    const raw = await readFile(path, "utf-8")
    return normalizeState(
      projectPath,
      JSON.parse(raw) as Partial<ProjectFactoryState>,
    )
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("project-factory-state", "load_failed", {
        projectPath: resolve(projectPath),
        path,
        error: String(error),
      })
    }
    return normalizeState(projectPath, {})
  }
}

export async function saveProjectFactoryState(
  projectPath: string,
  plannedCases: FactoryPlannedCase[],
): Promise<ProjectFactoryState> {
  const statePath = factoryStatePath(projectPath)
  const existing = await loadProjectFactoryState(projectPath)
  const normalized = normalizeState(projectPath, {
    plannedCases,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  })
  await mkdir(join(resolve(projectPath), FACTORY_STATE_DIR), {
    recursive: true,
  })
  await writeFileAtomic(statePath, `${JSON.stringify(normalized, null, 2)}\n`)
  return normalized
}

export async function spawnFactoryCasesFromArtifact(
  input: SpawnFactoryCasesFromArtifactInput,
): Promise<SpawnFactoryCasesFromArtifactResult> {
  const projectPath = resolve(input.projectPath)
  const artifacts = await listProjectArtifacts(projectPath)
  const artifact = artifacts.find((entry) => entry.id === input.artifactId)
  if (!artifact) {
    throw new Error("Could not find the selected result")
  }

  const markdown = await readArtifactContent(artifact)
  const drafts = extractDrafts(markdown)
  if (drafts.length === 0) {
    throw new Error("Could not derive item tracks from this result yet")
  }

  const existing = await loadProjectFactoryState(projectPath)
  const existingKeys = new Set(
    existing.plannedCases.map((entry) =>
      dedupeKey(
        entry.factoryId,
        entry.sourceArtifactId,
        entry.title,
        entry.scheduledFor,
      ),
    ),
  )

  const now = Date.now()
  const nextCases: FactoryPlannedCase[] = []
  for (const draft of drafts) {
    const key = dedupeKey(
      input.factoryId,
      artifact.id,
      draft.title,
      draft.scheduledFor,
    )
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    nextCases.push({
      id: buildPlannedCaseId(input.factoryId, nextCases.length + 1),
      factoryId: input.factoryId,
      title: draft.title,
      summary: draft.summary,
      prompt: draft.prompt,
      sourceArtifactId: artifact.id,
      sourceArtifactTitle: artifact.title,
      templateId: trimString(input.templateId),
      scheduledFor: draft.scheduledFor,
      position: draft.position,
      createdAt: now,
      updatedAt: now,
    })
  }

  const state = await saveProjectFactoryState(projectPath, [
    ...existing.plannedCases,
    ...nextCases,
  ])

  return {
    state,
    plannedCases: nextCases,
  }
}
