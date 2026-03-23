import { createHash } from "node:crypto"
import { mkdir, readFile, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import type {
  CaseStateRecord,
  ContinuationStatus,
  DurableGateRecord,
} from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"

const CASE_STATE_DIR_SEGMENTS = [".c8c", "case-state"] as const

export interface UpsertCaseStateInput {
  projectPath: string
  caseId: string
  workLabel?: string | null
  caseLabel?: string | null
  factoryId?: string | null
  factoryLabel?: string | null
  workflowPath?: string | null
  workflowName?: string | null
  continuationStatus?: ContinuationStatus
  nextStepLabel?: string | null
  artifactIds?: string[]
  lastGate?: DurableGateRecord | null
  updatedAt?: number
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

function sanitizeFileSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "case"
  )
}

function caseStateDir(projectPath: string) {
  return join(resolve(projectPath), ...CASE_STATE_DIR_SEGMENTS)
}

function caseStatePath(projectPath: string, caseId: string) {
  const slug = sanitizeFileSegment(caseId.replace(/^case:/i, ""))
  const digest = createHash("sha1").update(caseId).digest("hex").slice(0, 12)
  return join(caseStateDir(projectPath), `${slug}-${digest}.json`)
}

function normalizeLabel(value: string | null | undefined) {
  const normalized = (value || "").trim()
  return normalized || undefined
}

function dedupeArtifactIds(input: string[] | undefined, existing: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const artifactId of [...(input || []), ...existing]) {
    if (!artifactId || seen.has(artifactId)) continue
    seen.add(artifactId)
    next.push(artifactId)
  }
  return next
}

async function readCaseState(
  projectPath: string,
  caseId: string,
): Promise<CaseStateRecord | null> {
  try {
    const raw = await readFile(caseStatePath(projectPath, caseId), "utf-8")
    const parsed = JSON.parse(raw) as Partial<CaseStateRecord>
    if (
      parsed.version !== 1 ||
      typeof parsed.caseId !== "string" ||
      typeof parsed.projectPath !== "string" ||
      typeof parsed.workLabel !== "string" ||
      typeof parsed.continuationStatus !== "string" ||
      !Array.isArray(parsed.artifactIds) ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.updatedAt !== "number"
    ) {
      return null
    }
    return {
      version: 1,
      caseId: parsed.caseId,
      projectPath: parsed.projectPath,
      workLabel: parsed.workLabel,
      caseLabel:
        typeof parsed.caseLabel === "string" ? parsed.caseLabel : undefined,
      factoryId:
        typeof parsed.factoryId === "string" ? parsed.factoryId : undefined,
      factoryLabel:
        typeof parsed.factoryLabel === "string"
          ? parsed.factoryLabel
          : undefined,
      workflowPath:
        typeof parsed.workflowPath === "string"
          ? parsed.workflowPath
          : undefined,
      workflowName:
        typeof parsed.workflowName === "string"
          ? parsed.workflowName
          : undefined,
      continuationStatus: parsed.continuationStatus as ContinuationStatus,
      nextStepLabel:
        typeof parsed.nextStepLabel === "string"
          ? parsed.nextStepLabel
          : undefined,
      artifactIds: parsed.artifactIds.filter(
        (value): value is string => typeof value === "string",
      ),
      lastGate:
        parsed.lastGate && typeof parsed.lastGate === "object"
          ? {
              family: parsed.lastGate.family as DurableGateRecord["family"],
              outcome: parsed.lastGate.outcome as DurableGateRecord["outcome"],
              summaryText: String(parsed.lastGate.summaryText || ""),
              reasonText:
                typeof parsed.lastGate.reasonText === "string"
                  ? parsed.lastGate.reasonText
                  : undefined,
              stepLabel:
                typeof parsed.lastGate.stepLabel === "string"
                  ? parsed.lastGate.stepLabel
                  : undefined,
              happenedAt:
                typeof parsed.lastGate.happenedAt === "number"
                  ? parsed.lastGate.happenedAt
                  : parsed.updatedAt,
            }
          : null,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("case-store", "read_case_state_failed", {
        projectPath,
        caseId,
        error: String(error),
      })
    }
    return null
  }
}

export async function upsertCaseState(
  input: UpsertCaseStateInput,
): Promise<CaseStateRecord> {
  const projectPath = resolve(input.projectPath)
  const caseId = input.caseId.trim()
  const now = input.updatedAt || Date.now()
  const existing = await readCaseState(projectPath, caseId)
  const next: CaseStateRecord = {
    version: 1,
    caseId,
    projectPath,
    workLabel:
      normalizeLabel(input.workLabel) ||
      existing?.workLabel ||
      normalizeLabel(input.caseLabel) ||
      normalizeLabel(input.workflowName) ||
      "Saved work",
    caseLabel: normalizeLabel(input.caseLabel) || existing?.caseLabel,
    factoryId: normalizeLabel(input.factoryId) || existing?.factoryId,
    factoryLabel: normalizeLabel(input.factoryLabel) || existing?.factoryLabel,
    workflowPath: normalizeLabel(input.workflowPath) || existing?.workflowPath,
    workflowName: normalizeLabel(input.workflowName) || existing?.workflowName,
    continuationStatus:
      input.continuationStatus || existing?.continuationStatus || "completed",
    nextStepLabel:
      input.nextStepLabel === null
        ? undefined
        : normalizeLabel(input.nextStepLabel) || existing?.nextStepLabel,
    artifactIds: dedupeArtifactIds(
      input.artifactIds,
      existing?.artifactIds || [],
    ),
    lastGate:
      input.lastGate === undefined
        ? existing?.lastGate || null
        : input.lastGate,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  await mkdir(caseStateDir(projectPath), { recursive: true })
  await writeFileAtomic(
    caseStatePath(projectPath, caseId),
    JSON.stringify(next, null, 2),
  )
  return next
}

export async function listProjectCaseStates(
  projectPath: string,
): Promise<CaseStateRecord[]> {
  const safeProjectPath = resolve(projectPath)
  try {
    const entries = await readdir(caseStateDir(safeProjectPath), {
      withFileTypes: true,
    })
    const states = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const fullPath = join(caseStateDir(safeProjectPath), entry.name)
          try {
            const raw = await readFile(fullPath, "utf-8")
            const parsed = JSON.parse(raw) as CaseStateRecord
            if (parsed.version !== 1 || typeof parsed.caseId !== "string") {
              return null
            }
            return parsed
          } catch (error) {
            logWarn("case-store", "list_case_state_entry_failed", {
              projectPath: safeProjectPath,
              path: fullPath,
              error: String(error),
            })
            return null
          }
        }),
    )

    const latestByCaseId = new Map<string, CaseStateRecord>()
    for (const state of states
      .filter((entry): entry is CaseStateRecord => entry !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt)) {
      if (!latestByCaseId.has(state.caseId)) {
        latestByCaseId.set(state.caseId, state)
      }
    }

    return Array.from(latestByCaseId.values()).sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("case-store", "list_case_states_failed", {
        projectPath: safeProjectPath,
        error: String(error),
      })
    }
    return []
  }
}
