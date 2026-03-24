import { createHash } from "node:crypto"
import { mkdir, readFile, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import type {
  CaseStateRecord,
  ContinuationStatus,
  DurableGateFamily,
  DurableGateOutcome,
  DurableGateRecord,
} from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"

const CASE_STATE_DIR_SEGMENTS = [".c8c", "case-state"] as const
const CONTINUATION_STATUSES = new Set<ContinuationStatus>([
  "ready",
  "missing_result",
  "blocked_by_check",
  "awaiting_approval",
  "superseded",
  "paused",
  "completed",
])
const DURABLE_GATE_FAMILIES = new Set<DurableGateFamily>([
  "approval",
  "input",
  "review_check",
  "verification_check",
  "ship_decision",
])
const DURABLE_GATE_OUTCOMES = new Set<DurableGateOutcome>([
  "passed",
  "returned",
  "awaiting_human",
  "rejected",
  "blocked",
])

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
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

function parseLastGate(value: unknown): DurableGateRecord | null {
  if (value == null) return null
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const parsed = value as Record<string, unknown>
  if (
    typeof parsed.family !== "string" ||
    !DURABLE_GATE_FAMILIES.has(parsed.family as DurableGateFamily) ||
    typeof parsed.outcome !== "string" ||
    !DURABLE_GATE_OUTCOMES.has(parsed.outcome as DurableGateOutcome) ||
    typeof parsed.summaryText !== "string" ||
    !isFiniteNumber(parsed.happenedAt)
  ) {
    return null
  }

  if (
    (parsed.reasonText !== undefined &&
      typeof parsed.reasonText !== "string") ||
    (parsed.stepLabel !== undefined && typeof parsed.stepLabel !== "string")
  ) {
    return null
  }

  return {
    family: parsed.family as DurableGateFamily,
    outcome: parsed.outcome as DurableGateOutcome,
    summaryText: parsed.summaryText,
    reasonText:
      typeof parsed.reasonText === "string" ? parsed.reasonText : undefined,
    stepLabel:
      typeof parsed.stepLabel === "string" ? parsed.stepLabel : undefined,
    happenedAt: parsed.happenedAt,
  }
}

function parseCaseStateRecord(
  value: unknown,
  projectPath: string,
): CaseStateRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const parsed = value as Record<string, unknown>
  if (
    parsed.version !== 1 ||
    typeof parsed.caseId !== "string" ||
    typeof parsed.workLabel !== "string" ||
    typeof parsed.continuationStatus !== "string" ||
    !CONTINUATION_STATUSES.has(
      parsed.continuationStatus as ContinuationStatus,
    ) ||
    !Array.isArray(parsed.artifactIds) ||
    parsed.artifactIds.some((entry) => typeof entry !== "string") ||
    !isFiniteNumber(parsed.createdAt) ||
    !isFiniteNumber(parsed.updatedAt)
  ) {
    return null
  }

  if (
    (parsed.projectPath !== undefined &&
      typeof parsed.projectPath !== "string") ||
    (parsed.caseLabel !== undefined && typeof parsed.caseLabel !== "string") ||
    (parsed.factoryId !== undefined && typeof parsed.factoryId !== "string") ||
    (parsed.factoryLabel !== undefined &&
      typeof parsed.factoryLabel !== "string") ||
    (parsed.workflowPath !== undefined &&
      typeof parsed.workflowPath !== "string") ||
    (parsed.workflowName !== undefined &&
      typeof parsed.workflowName !== "string") ||
    (parsed.nextStepLabel !== undefined &&
      typeof parsed.nextStepLabel !== "string")
  ) {
    return null
  }

  if (parsed.lastGate !== null && parseLastGate(parsed.lastGate) === null) {
    return null
  }

  return {
    version: 1,
    caseId: parsed.caseId,
    projectPath,
    workLabel: parsed.workLabel,
    caseLabel:
      typeof parsed.caseLabel === "string" ? parsed.caseLabel : undefined,
    factoryId:
      typeof parsed.factoryId === "string" ? parsed.factoryId : undefined,
    factoryLabel:
      typeof parsed.factoryLabel === "string" ? parsed.factoryLabel : undefined,
    workflowPath:
      typeof parsed.workflowPath === "string" ? parsed.workflowPath : undefined,
    workflowName:
      typeof parsed.workflowName === "string" ? parsed.workflowName : undefined,
    continuationStatus: parsed.continuationStatus as ContinuationStatus,
    nextStepLabel:
      typeof parsed.nextStepLabel === "string"
        ? parsed.nextStepLabel
        : undefined,
    artifactIds: parsed.artifactIds,
    lastGate: parseLastGate(parsed.lastGate),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

async function readCaseState(
  projectPath: string,
  caseId: string,
): Promise<CaseStateRecord | null> {
  try {
    const raw = await readFile(caseStatePath(projectPath, caseId), "utf-8")
    return parseCaseStateRecord(JSON.parse(raw), projectPath)
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
            return parseCaseStateRecord(JSON.parse(raw), safeProjectPath)
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
