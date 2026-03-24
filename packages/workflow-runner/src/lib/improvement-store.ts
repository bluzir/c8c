import { createHash } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type {
  FlowImprovementRecommendation,
  FlowImprovementRecommendationKind,
} from "@shared/types"
import type {
  ErrorKind,
  NodeState,
  RunStatus,
  WorkflowNode,
} from "../schema.js"
import type { PersistedEvaluationResult } from "./persisted-run-state.js"
import { readApprovalDecision } from "./run-interrupts.js"
import { readJsonFile } from "./run-state-store.js"
import { runSerialTask } from "./serial-task.js"
import { writeFileAtomic } from "./atomic-write.js"

const IMPROVEMENTS_SCHEMA_VERSION = 1
const MAX_AGGREGATED_EVIDENCE_RECORDS = 250

type PersistedConfidence = FlowImprovementRecommendation["confidence"]

interface RunNodeEvidenceRecord {
  nodeId: string
  nodeType: WorkflowNode["type"]
  nodeLabel: string
  status: NodeState["status"]
  attempts: number
  retriesUsed: number
  modelId?: string
  promptHash?: string
  skillRef?: string
  score?: number
  threshold?: number
  passed?: boolean
  overridden?: boolean
  gatePassAt1?: boolean
  gatePassAt3?: boolean
  evaluatorSaved?: boolean
  durationMs?: number
  errorKind?: ErrorKind
}

interface ApprovalEvidenceSummary {
  total: number
  edited: number
  rejected: number
  timedOut: number
}

interface ProjectRunImprovementEvidence {
  schemaVersion: number
  recordedAt: number
  runId: string
  chainId?: string
  workflowName: string
  workflowPath?: string
  workspace: string
  status: RunStatus
  startedAt: number
  completedAt: number
  durationMs: number
  executedNodeIds: string[]
  approvalSummary: ApprovalEvidenceSummary
  nodeSummaries: RunNodeEvidenceRecord[]
}

interface PersistImprovementEvidenceInput {
  projectPath: string
  runId: string
  chainId?: string
  workflowName: string
  workflowPath?: string
  workspace: string
  status: RunStatus
  startedAt: number
  completedAt: number
  durationMs: number
  runtimeNodes: WorkflowNode[]
  nodeStates: Record<string, NodeState>
  evalResults?: Record<string, PersistedEvaluationResult[]>
}

interface VariantAggregate {
  kind: FlowImprovementRecommendationKind
  nodeId?: string
  nodeLabel?: string
  nodeType?: WorkflowNode["type"]
  modelId?: string
  promptHash?: string
  skillRef?: string
  runs: number
  completedRuns: number
  failedRuns: number
  retryTotal: number
  evaluatorCount: number
  evaluatorPassCount: number
  evaluatorOverrideCount: number
  gateMetricRuns: number
  gatePassAt1Count: number
  gatePassAt3Count: number
  evaluatorSavedCount: number
  lastSeenAt: number
}

interface ApprovalAggregate {
  runs: number
  editedRuns: number
  rejectedRuns: number
  timedOutRuns: number
  lastSeenAt: number
}

interface GateSequenceEntry {
  completedAt: number
  passed: boolean
}

function improvementsDir(projectPath: string): string {
  return join(projectPath, ".c8c", "improvements")
}

function evidencePath(projectPath: string): string {
  return join(improvementsDir(projectPath), "evidence.jsonl")
}

function recommendationsPath(projectPath: string): string {
  return join(improvementsDir(projectPath), "recommendations.json")
}

function improvementSerialKey(projectPath: string): string {
  return `workflow-runner:improvements:${projectPath}`
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12)
}

function toPercent(value: number): number {
  return Math.round(value * 100)
}

function toFixed(value: number, digits = 1): string {
  return value.toFixed(digits)
}

function titleCase(input: string): string {
  return input
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function compactJoin(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ")
}

function normalizePathKey(workflowPath?: string): string | undefined {
  const trimmed = workflowPath?.trim()
  return trimmed ? trimmed : undefined
}

function flowKeyForEvidence(record: {
  workflowPath?: string
  workflowName: string
}): string {
  const workflowPath = normalizePathKey(record.workflowPath)
  return workflowPath ? `path:${workflowPath}` : `name:${record.workflowName}`
}

function variantKey(record: {
  nodeId?: string
  modelId?: string
  promptHash?: string
  skillRef?: string
}): string | null {
  if (!record.nodeId || !record.modelId || !record.promptHash) return null
  return [
    record.nodeId,
    record.modelId,
    record.promptHash,
    record.skillRef || "",
  ].join("|")
}

function recommendationId(
  flowKey: string,
  kind: FlowImprovementRecommendationKind,
  nodeId?: string,
): string {
  return shortHash([flowKey, kind, nodeId || "flow"].join("|"))
}

function deriveNodeLabel(node: WorkflowNode): string {
  if (node.type === "skill") {
    const skillRef = (node.config as { skillRef?: string }).skillRef?.trim()
    if (skillRef) {
      const leaf = skillRef.split("/").pop() || skillRef
      return titleCase(leaf)
    }
  }
  if (node.type === "evaluator") return "Check"
  if (node.type === "approval") return "Approval"
  if (node.type === "human") return "Review"
  if (node.type === "splitter") return "Split"
  if (node.type === "merger") return "Merge"
  if (node.type === "output") return "Result"
  if (node.type === "input") return "Input"
  return titleCase(node.id)
}

async function readApprovalSummary(
  workspace: string,
  runtimeNodes: WorkflowNode[],
): Promise<ApprovalEvidenceSummary> {
  const approvals = runtimeNodes.filter((node) => node.type === "approval")
  if (approvals.length === 0) {
    return { total: 0, edited: 0, rejected: 0, timedOut: 0 }
  }

  let edited = 0
  let rejected = 0
  let timedOut = 0
  for (const node of approvals) {
    const decision = await readApprovalDecision(workspace, node.id)
    if (!decision) continue
    if (decision.editedContent && decision.editedContent.trim()) edited += 1
    if (!decision.approved) rejected += 1
    if (decision.timedOut) timedOut += 1
  }

  return {
    total: approvals.length,
    edited,
    rejected,
    timedOut,
  }
}

function summarizeEvalAttempts(
  evalAttempts?: PersistedEvaluationResult[],
): Pick<
  RunNodeEvidenceRecord,
  "gatePassAt1" | "gatePassAt3" | "evaluatorSaved" | "passed"
> {
  if (!Array.isArray(evalAttempts) || evalAttempts.length === 0) {
    return {}
  }
  const attempts = evalAttempts.slice(0, 3)
  const firstAttempt = attempts[0]
  const finalAttempt = evalAttempts[evalAttempts.length - 1]
  const gatePassAt1 =
    typeof firstAttempt?.passed === "boolean" ? firstAttempt.passed : undefined
  const gatePassAt3 = attempts.some((attempt) => attempt.passed)
  const evaluatorSaved =
    gatePassAt1 === false && attempts.slice(1).some((attempt) => attempt.passed)

  return {
    ...(typeof gatePassAt1 === "boolean" ? { gatePassAt1 } : {}),
    gatePassAt3,
    ...(evaluatorSaved ? { evaluatorSaved } : {}),
    ...(typeof finalAttempt?.passed === "boolean"
      ? { passed: finalAttempt.passed }
      : {}),
  }
}

function computeGatePassConsistency(
  entries: GateSequenceEntry[],
): number | undefined {
  if (entries.length < 3) return undefined
  const ordered = [...entries].sort(
    (left, right) => left.completedAt - right.completedAt,
  )
  let windows = 0
  let allPassedWindows = 0
  for (let index = 0; index <= ordered.length - 3; index += 1) {
    windows += 1
    if (ordered.slice(index, index + 3).every((entry) => entry.passed)) {
      allPassedWindows += 1
    }
  }
  return windows > 0 ? allPassedWindows / windows : undefined
}

function buildRunNodeEvidence(
  node: WorkflowNode,
  state: NodeState | undefined,
  evalAttempts?: PersistedEvaluationResult[],
): RunNodeEvidenceRecord | null {
  if (!state) return null

  const evalAttemptSummary = summarizeEvalAttempts(evalAttempts)
  const score =
    typeof state.output?.metadata?.score === "number"
      ? state.output.metadata.score
      : undefined
  const retriesUsed =
    typeof state.retriesUsed === "number"
      ? state.retriesUsed
      : Math.max(0, (state.attempts || 0) - 1)
  const durationMs =
    typeof state.startedAt === "number" && typeof state.completedAt === "number"
      ? Math.max(0, state.completedAt - state.startedAt)
      : undefined
  const threshold =
    node.type === "evaluator" &&
    typeof (node.config as { threshold?: number }).threshold === "number"
      ? (node.config as { threshold: number }).threshold
      : undefined
  const passed =
    typeof score === "number" && typeof threshold === "number"
      ? score >= threshold
      : evalAttemptSummary.passed

  return {
    nodeId: node.id,
    nodeType: node.type,
    nodeLabel: deriveNodeLabel(node),
    status: state.status,
    attempts: state.attempts || 0,
    retriesUsed,
    ...(state.meta?.model_id ? { modelId: state.meta.model_id } : {}),
    ...(state.meta?.prompt_hash ? { promptHash: state.meta.prompt_hash } : {}),
    ...(state.meta?.skill_ref ? { skillRef: state.meta.skill_ref } : {}),
    ...(typeof score === "number" ? { score } : {}),
    ...(typeof threshold === "number" ? { threshold } : {}),
    ...(typeof passed === "boolean" ? { passed } : {}),
    ...(state.output?.metadata?.overridden ? { overridden: true } : {}),
    ...(typeof evalAttemptSummary.gatePassAt1 === "boolean"
      ? { gatePassAt1: evalAttemptSummary.gatePassAt1 }
      : {}),
    ...(typeof evalAttemptSummary.gatePassAt3 === "boolean"
      ? { gatePassAt3: evalAttemptSummary.gatePassAt3 }
      : {}),
    ...(evalAttemptSummary.evaluatorSaved ? { evaluatorSaved: true } : {}),
    ...(typeof durationMs === "number" ? { durationMs } : {}),
    ...(state.errorKind ? { errorKind: state.errorKind } : {}),
  }
}

function isMeaningfulNodeStatus(status: NodeState["status"]): boolean {
  return status !== "pending" && status !== "queued"
}

async function buildImprovementEvidenceRecord(
  input: PersistImprovementEvidenceInput,
): Promise<ProjectRunImprovementEvidence> {
  const nodeSummaries = input.runtimeNodes
    .map((node) =>
      buildRunNodeEvidence(
        node,
        input.nodeStates[node.id],
        input.evalResults?.[node.id],
      ),
    )
    .filter((entry): entry is RunNodeEvidenceRecord => entry !== null)

  const executedNodeIds = nodeSummaries
    .filter((entry) => isMeaningfulNodeStatus(entry.status))
    .map((entry) => entry.nodeId)

  return {
    schemaVersion: IMPROVEMENTS_SCHEMA_VERSION,
    recordedAt: Date.now(),
    runId: input.runId,
    ...(input.chainId ? { chainId: input.chainId } : {}),
    workflowName: input.workflowName,
    ...(normalizePathKey(input.workflowPath)
      ? { workflowPath: normalizePathKey(input.workflowPath) }
      : {}),
    workspace: input.workspace,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    executedNodeIds,
    approvalSummary: await readApprovalSummary(
      input.workspace,
      input.runtimeNodes,
    ),
    nodeSummaries,
  }
}

async function readEvidenceRecords(
  projectPath: string,
): Promise<ProjectRunImprovementEvidence[]> {
  try {
    const raw = await readFile(evidencePath(projectPath), "utf-8")
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as ProjectRunImprovementEvidence
        } catch {
          return null
        }
      })
      .filter(
        (record): record is ProjectRunImprovementEvidence =>
          record !== null &&
          record.schemaVersion === IMPROVEMENTS_SCHEMA_VERSION &&
          typeof record.workflowName === "string",
      )
      .slice(-MAX_AGGREGATED_EVIDENCE_RECORDS)
  } catch {
    return []
  }
}

function variantDisplayLabel(record: {
  modelId?: string
  promptHash?: string
  skillRef?: string
}): string {
  return compactJoin([
    record.skillRef ? titleCase(record.skillRef.split("/").pop() || "") : null,
    record.modelId || null,
    record.promptHash ? `prompt ${record.promptHash.slice(0, 6)}` : null,
  ])
}

function rateFromCounts(total: number, passed: number): number | undefined {
  return total > 0 ? passed / total : undefined
}

function compareRecommendationPriority(
  left: FlowImprovementRecommendation,
  right: FlowImprovementRecommendation,
): number {
  const confidenceRank = (value: PersistedConfidence) =>
    value === "high" ? 2 : 1
  const confidenceDelta =
    confidenceRank(right.confidence) - confidenceRank(left.confidence)
  if (confidenceDelta !== 0) return confidenceDelta
  if (right.supportingRunCount !== left.supportingRunCount) {
    return right.supportingRunCount - left.supportingRunCount
  }
  return right.updatedAt - left.updatedAt
}

function derivePreferVariantRecommendation(
  flowKey: string,
  workflowName: string,
  workflowPath: string | undefined,
  baseline: VariantAggregate,
  candidate: VariantAggregate,
  options: {
    candidateConsistency?: number
    baselineConsistency?: number
  } = {},
): FlowImprovementRecommendation | null {
  if (
    !candidate.nodeId ||
    !candidate.nodeLabel ||
    !candidate.modelId ||
    !candidate.promptHash ||
    !baseline.modelId ||
    !baseline.promptHash
  ) {
    return null
  }

  const candidateSuccessRate = candidate.completedRuns / candidate.runs
  const baselineSuccessRate = baseline.completedRuns / baseline.runs
  const candidatePassRate =
    candidate.evaluatorCount > 0
      ? candidate.evaluatorPassCount / candidate.evaluatorCount
      : candidateSuccessRate
  const baselinePassRate =
    baseline.evaluatorCount > 0
      ? baseline.evaluatorPassCount / baseline.evaluatorCount
      : baselineSuccessRate
  const candidateRetryAverage = candidate.retryTotal / candidate.runs
  const baselineRetryAverage = baseline.retryTotal / baseline.runs
  const candidateGatePassAt1 = rateFromCounts(
    candidate.gateMetricRuns,
    candidate.gatePassAt1Count,
  )
  const baselineGatePassAt1 = rateFromCounts(
    baseline.gateMetricRuns,
    baseline.gatePassAt1Count,
  )
  const candidateGatePassAt3 = rateFromCounts(
    candidate.gateMetricRuns,
    candidate.gatePassAt3Count,
  )
  const baselineGatePassAt3 = rateFromCounts(
    baseline.gateMetricRuns,
    baseline.gatePassAt3Count,
  )
  const candidateEvaluatorSaveRate = rateFromCounts(
    candidate.gateMetricRuns,
    candidate.evaluatorSavedCount,
  )
  const baselineEvaluatorSaveRate = rateFromCounts(
    baseline.gateMetricRuns,
    baseline.evaluatorSavedCount,
  )

  const winsOnSuccess = candidateSuccessRate - baselineSuccessRate >= 0.15
  const winsOnChecks = candidatePassRate - baselinePassRate >= 0.2
  const winsOnRetries = baselineRetryAverage - candidateRetryAverage >= 1
  const winsOnGatePassAt1 =
    candidateGatePassAt1 != null &&
    baselineGatePassAt1 != null &&
    candidateGatePassAt1 - baselineGatePassAt1 >= 0.2
  const winsOnGatePassAt3 =
    candidateGatePassAt3 != null &&
    baselineGatePassAt3 != null &&
    candidateGatePassAt3 - baselineGatePassAt3 >= 0.15

  if (
    !winsOnSuccess &&
    !winsOnChecks &&
    !winsOnRetries &&
    !winsOnGatePassAt1 &&
    !winsOnGatePassAt3
  ) {
    return null
  }

  const confidence: PersistedConfidence =
    candidate.runs >= 3 && baseline.runs >= 3 ? "high" : "medium"
  const candidateLabel = variantDisplayLabel(candidate)
  const baselineLabel = variantDisplayLabel(baseline)

  return {
    id: recommendationId(flowKey, "prefer_variant", candidate.nodeId),
    workflowName,
    ...(workflowPath ? { workflowPath } : {}),
    nodeId: candidate.nodeId,
    nodeLabel: candidate.nodeLabel,
    kind: "prefer_variant",
    summary: `${candidate.nodeLabel} has a stronger variant in recent runs.`,
    evidence: compactJoin([
      `${candidate.runs} runs`,
      `${toPercent(candidateSuccessRate)}% clear vs ${toPercent(baselineSuccessRate)}%`,
      candidateGatePassAt1 != null && baselineGatePassAt1 != null
        ? `pass@1 ${toPercent(candidateGatePassAt1)}% vs ${toPercent(baselineGatePassAt1)}%`
        : null,
      candidateGatePassAt3 != null && baselineGatePassAt3 != null
        ? `pass@3 ${toPercent(candidateGatePassAt3)}% vs ${toPercent(baselineGatePassAt3)}%`
        : null,
      `${toFixed(candidateRetryAverage)} retries vs ${toFixed(baselineRetryAverage)}`,
      candidateLabel ? `${candidateLabel} over ${baselineLabel}` : null,
    ]),
    confidence,
    supportingRunCount: candidate.runs,
    comparisonRunCount: baseline.runs,
    updatedAt: Math.max(candidate.lastSeenAt, baseline.lastSeenAt),
    candidate: {
      modelId: candidate.modelId,
      promptHash: candidate.promptHash,
      ...(candidate.skillRef ? { skillRef: candidate.skillRef } : {}),
    },
    baseline: {
      modelId: baseline.modelId,
      promptHash: baseline.promptHash,
      ...(baseline.skillRef ? { skillRef: baseline.skillRef } : {}),
    },
    metrics: {
      candidateSuccessRate,
      comparisonSuccessRate: baselineSuccessRate,
      candidateAverageRetries: candidateRetryAverage,
      comparisonAverageRetries: baselineRetryAverage,
      candidateEvaluatorPassRate: candidatePassRate,
      comparisonEvaluatorPassRate: baselinePassRate,
      candidateGatePassAt1,
      comparisonGatePassAt1: baselineGatePassAt1,
      candidateGatePassAt3,
      comparisonGatePassAt3: baselineGatePassAt3,
      candidateGatePassConsistency: options.candidateConsistency,
      comparisonGatePassConsistency: options.baselineConsistency,
      candidateEvaluatorSaveRate,
      comparisonEvaluatorSaveRate: baselineEvaluatorSaveRate,
    },
  }
}

function deriveStabilizeStepRecommendation(
  flowKey: string,
  workflowName: string,
  workflowPath: string | undefined,
  aggregate: VariantAggregate,
  options: { gatePassConsistency?: number } = {},
): FlowImprovementRecommendation | null {
  if (!aggregate.nodeId || !aggregate.nodeLabel) return null
  if (aggregate.runs < 3) return null

  const successRate = aggregate.completedRuns / aggregate.runs
  const retryAverage = aggregate.retryTotal / aggregate.runs
  const passRate =
    aggregate.evaluatorCount > 0
      ? aggregate.evaluatorPassCount / aggregate.evaluatorCount
      : successRate
  const overrideRate =
    aggregate.evaluatorCount > 0
      ? aggregate.evaluatorOverrideCount / aggregate.evaluatorCount
      : 0
  const gatePassAt1 = rateFromCounts(
    aggregate.gateMetricRuns,
    aggregate.gatePassAt1Count,
  )
  const gatePassAt3 = rateFromCounts(
    aggregate.gateMetricRuns,
    aggregate.gatePassAt3Count,
  )
  const evaluatorSaveRate = rateFromCounts(
    aggregate.gateMetricRuns,
    aggregate.evaluatorSavedCount,
  )
  const gatePassConsistency = options.gatePassConsistency
  const lowFirstPass = gatePassAt1 != null && gatePassAt1 <= 0.5
  const weakRetryCeiling = gatePassAt3 != null && gatePassAt3 <= 0.75
  const lowConsistency =
    gatePassConsistency != null && gatePassConsistency <= 0.5

  const unstable =
    successRate <= 0.6 ||
    retryAverage >= 1.25 ||
    passRate <= 0.5 ||
    overrideRate >= 0.3 ||
    lowFirstPass ||
    weakRetryCeiling ||
    lowConsistency
  if (!unstable) return null

  return {
    id: recommendationId(flowKey, "stabilize_step", aggregate.nodeId),
    workflowName,
    ...(workflowPath ? { workflowPath } : {}),
    nodeId: aggregate.nodeId,
    nodeLabel: aggregate.nodeLabel,
    kind: "stabilize_step",
    summary: `${aggregate.nodeLabel} keeps needing intervention.`,
    evidence: compactJoin([
      `${aggregate.runs} runs`,
      `${toPercent(successRate)}% clear`,
      gatePassAt1 != null ? `pass@1 ${toPercent(gatePassAt1)}%` : null,
      gatePassAt3 != null ? `pass@3 ${toPercent(gatePassAt3)}%` : null,
      gatePassConsistency != null
        ? `consistent across 3 ${toPercent(gatePassConsistency)}%`
        : null,
      evaluatorSaveRate != null && evaluatorSaveRate > 0
        ? `saved ${toPercent(evaluatorSaveRate)}% after first fail`
        : null,
      `${toFixed(retryAverage)} retries per run`,
      aggregate.evaluatorCount > 0
        ? `${toPercent(passRate)}% check pass`
        : null,
      aggregate.evaluatorOverrideCount > 0
        ? `${aggregate.evaluatorOverrideCount} manual overrides`
        : null,
    ]),
    confidence:
      aggregate.runs >= 4 &&
      (aggregate.failedRuns >= 2 ||
        retryAverage >= 1.5 ||
        lowFirstPass ||
        lowConsistency)
        ? "high"
        : "medium",
    supportingRunCount: aggregate.runs,
    updatedAt: aggregate.lastSeenAt,
    metrics: {
      candidateSuccessRate: successRate,
      candidateAverageRetries: retryAverage,
      candidateEvaluatorPassRate: passRate,
      candidateGatePassAt1: gatePassAt1,
      candidateGatePassAt3: gatePassAt3,
      candidateGatePassConsistency: gatePassConsistency,
      candidateEvaluatorSaveRate: evaluatorSaveRate,
      editRate: overrideRate,
    },
  }
}

function deriveManualEditsRecommendation(
  flowKey: string,
  workflowName: string,
  workflowPath: string | undefined,
  approvalAggregate: ApprovalAggregate,
): FlowImprovementRecommendation | null {
  if (approvalAggregate.runs < 3 || approvalAggregate.editedRuns < 2) {
    return null
  }
  const editRate = approvalAggregate.editedRuns / approvalAggregate.runs
  if (editRate < 0.4) return null

  return {
    id: recommendationId(flowKey, "reduce_manual_edits"),
    workflowName,
    ...(workflowPath ? { workflowPath } : {}),
    kind: "reduce_manual_edits",
    summary: "Human review keeps rewriting the result.",
    evidence: compactJoin([
      `${approvalAggregate.editedRuns}/${approvalAggregate.runs} runs edited at approval`,
      approvalAggregate.rejectedRuns > 0
        ? `${approvalAggregate.rejectedRuns} rejected`
        : null,
      approvalAggregate.timedOutRuns > 0
        ? `${approvalAggregate.timedOutRuns} timed out`
        : null,
    ]),
    confidence:
      approvalAggregate.editedRuns >= 3 && editRate >= 0.5 ? "high" : "medium",
    supportingRunCount: approvalAggregate.editedRuns,
    comparisonRunCount: approvalAggregate.runs,
    updatedAt: approvalAggregate.lastSeenAt,
    metrics: {
      editRate,
    },
  }
}

export function deriveProjectImprovementRecommendations(
  records: ProjectRunImprovementEvidence[],
): FlowImprovementRecommendation[] {
  const flowGroups = new Map<string, ProjectRunImprovementEvidence[]>()
  for (const record of records) {
    const key = flowKeyForEvidence(record)
    const existing = flowGroups.get(key) || []
    existing.push(record)
    flowGroups.set(key, existing)
  }

  const recommendations: FlowImprovementRecommendation[] = []

  for (const [flowKey, flowRecords] of flowGroups.entries()) {
    const latestFlowRecord = [...flowRecords].sort(
      (left, right) => right.completedAt - left.completedAt,
    )[0]
    const workflowPath = normalizePathKey(latestFlowRecord?.workflowPath)
    const workflowName = latestFlowRecord?.workflowName || "Flow"
    const variantsByNode = new Map<string, Map<string, VariantAggregate>>()
    const aggregateByNode = new Map<string, VariantAggregate>()
    const gateSequencesByNode = new Map<string, GateSequenceEntry[]>()
    const gateSequencesByVariant = new Map<string, GateSequenceEntry[]>()
    const approvalAggregate: ApprovalAggregate = {
      runs: 0,
      editedRuns: 0,
      rejectedRuns: 0,
      timedOutRuns: 0,
      lastSeenAt: 0,
    }

    for (const record of flowRecords) {
      approvalAggregate.runs += 1
      if (record.approvalSummary.edited > 0) approvalAggregate.editedRuns += 1
      if (record.approvalSummary.rejected > 0)
        approvalAggregate.rejectedRuns += 1
      if (record.approvalSummary.timedOut > 0)
        approvalAggregate.timedOutRuns += 1
      approvalAggregate.lastSeenAt = Math.max(
        approvalAggregate.lastSeenAt,
        record.completedAt,
      )

      for (const node of record.nodeSummaries) {
        if (!isMeaningfulNodeStatus(node.status)) continue

        const aggregateKey = node.nodeId
        const nodeAggregate =
          aggregateByNode.get(aggregateKey) ||
          ({
            kind: "stabilize_step",
            nodeId: node.nodeId,
            nodeLabel: node.nodeLabel,
            nodeType: node.nodeType,
            runs: 0,
            completedRuns: 0,
            failedRuns: 0,
            retryTotal: 0,
            evaluatorCount: 0,
            evaluatorPassCount: 0,
            evaluatorOverrideCount: 0,
            gateMetricRuns: 0,
            gatePassAt1Count: 0,
            gatePassAt3Count: 0,
            evaluatorSavedCount: 0,
            lastSeenAt: 0,
          } satisfies VariantAggregate)
        nodeAggregate.runs += 1
        if (node.status === "completed") nodeAggregate.completedRuns += 1
        if (node.status === "failed") nodeAggregate.failedRuns += 1
        nodeAggregate.retryTotal += node.retriesUsed || 0
        if (typeof node.passed === "boolean") {
          nodeAggregate.evaluatorCount += 1
          if (node.passed) nodeAggregate.evaluatorPassCount += 1
          const gateSequence = gateSequencesByNode.get(aggregateKey) || []
          gateSequence.push({
            completedAt: record.completedAt,
            passed: node.passed,
          })
          gateSequencesByNode.set(aggregateKey, gateSequence)
        }
        if (node.overridden) nodeAggregate.evaluatorOverrideCount += 1
        if (typeof node.gatePassAt1 === "boolean") {
          nodeAggregate.gateMetricRuns += 1
          if (node.gatePassAt1) nodeAggregate.gatePassAt1Count += 1
          if (node.gatePassAt3) nodeAggregate.gatePassAt3Count += 1
          if (node.evaluatorSaved) nodeAggregate.evaluatorSavedCount += 1
        }
        nodeAggregate.lastSeenAt = Math.max(
          nodeAggregate.lastSeenAt,
          record.completedAt,
        )
        aggregateByNode.set(aggregateKey, nodeAggregate)

        const key = variantKey(node)
        if (!key) continue
        const nodeVariants = variantsByNode.get(node.nodeId) || new Map()
        const variant =
          nodeVariants.get(key) ||
          ({
            kind: "prefer_variant",
            nodeId: node.nodeId,
            nodeLabel: node.nodeLabel,
            nodeType: node.nodeType,
            modelId: node.modelId,
            promptHash: node.promptHash,
            skillRef: node.skillRef,
            runs: 0,
            completedRuns: 0,
            failedRuns: 0,
            retryTotal: 0,
            evaluatorCount: 0,
            evaluatorPassCount: 0,
            evaluatorOverrideCount: 0,
            gateMetricRuns: 0,
            gatePassAt1Count: 0,
            gatePassAt3Count: 0,
            evaluatorSavedCount: 0,
            lastSeenAt: 0,
          } satisfies VariantAggregate)
        variant.runs += 1
        if (node.status === "completed") variant.completedRuns += 1
        if (node.status === "failed") variant.failedRuns += 1
        variant.retryTotal += node.retriesUsed || 0
        if (typeof node.passed === "boolean") {
          variant.evaluatorCount += 1
          if (node.passed) variant.evaluatorPassCount += 1
          const gateSequence = gateSequencesByVariant.get(key) || []
          gateSequence.push({
            completedAt: record.completedAt,
            passed: node.passed,
          })
          gateSequencesByVariant.set(key, gateSequence)
        }
        if (node.overridden) variant.evaluatorOverrideCount += 1
        if (typeof node.gatePassAt1 === "boolean") {
          variant.gateMetricRuns += 1
          if (node.gatePassAt1) variant.gatePassAt1Count += 1
          if (node.gatePassAt3) variant.gatePassAt3Count += 1
          if (node.evaluatorSaved) variant.evaluatorSavedCount += 1
        }
        variant.lastSeenAt = Math.max(variant.lastSeenAt, record.completedAt)
        nodeVariants.set(key, variant)
        variantsByNode.set(node.nodeId, nodeVariants)
      }
    }

    for (const nodeVariants of variantsByNode.values()) {
      const ranked = [...nodeVariants.values()].sort((left, right) => {
        const leftSuccess = left.completedRuns / left.runs
        const rightSuccess = right.completedRuns / right.runs
        if (rightSuccess !== leftSuccess) return rightSuccess - leftSuccess

        const leftPass =
          left.evaluatorCount > 0
            ? left.evaluatorPassCount / left.evaluatorCount
            : leftSuccess
        const rightPass =
          right.evaluatorCount > 0
            ? right.evaluatorPassCount / right.evaluatorCount
            : rightSuccess
        if (rightPass !== leftPass) return rightPass - leftPass

        const leftRetries = left.retryTotal / left.runs
        const rightRetries = right.retryTotal / right.runs
        if (leftRetries !== rightRetries) return leftRetries - rightRetries

        if (right.runs !== left.runs) return right.runs - left.runs
        return right.lastSeenAt - left.lastSeenAt
      })
      if (ranked.length < 2) continue
      const baseline = [...nodeVariants.values()].sort((left, right) => {
        if (right.runs !== left.runs) return right.runs - left.runs
        return right.lastSeenAt - left.lastSeenAt
      })[0]
      const candidate = ranked[0]
      if (!baseline || candidate === baseline) continue
      const candidateKey = variantKey(candidate)
      const baselineKey = variantKey(baseline)

      const recommendation = derivePreferVariantRecommendation(
        flowKey,
        workflowName,
        workflowPath,
        baseline,
        candidate,
        {
          candidateConsistency: candidateKey
            ? computeGatePassConsistency(
                gateSequencesByVariant.get(candidateKey) || [],
              )
            : undefined,
          baselineConsistency: baselineKey
            ? computeGatePassConsistency(
                gateSequencesByVariant.get(baselineKey) || [],
              )
            : undefined,
        },
      )
      if (recommendation) recommendations.push(recommendation)
    }

    for (const aggregate of aggregateByNode.values()) {
      const recommendation = deriveStabilizeStepRecommendation(
        flowKey,
        workflowName,
        workflowPath,
        aggregate,
        {
          gatePassConsistency: computeGatePassConsistency(
            gateSequencesByNode.get(aggregate.nodeId || "") || [],
          ),
        },
      )
      if (!recommendation) continue
      const alreadyCovered = recommendations.some(
        (existing) =>
          existing.workflowPath === recommendation.workflowPath &&
          existing.nodeId === recommendation.nodeId &&
          existing.kind === "prefer_variant",
      )
      if (!alreadyCovered) recommendations.push(recommendation)
    }

    const manualEdits = deriveManualEditsRecommendation(
      flowKey,
      workflowName,
      workflowPath,
      approvalAggregate,
    )
    if (manualEdits) recommendations.push(manualEdits)
  }

  return recommendations.sort(compareRecommendationPriority)
}

export async function persistProjectImprovementEvidence(
  input: PersistImprovementEvidenceInput,
): Promise<void> {
  await runSerialTask(improvementSerialKey(input.projectPath), async () => {
    await mkdir(improvementsDir(input.projectPath), { recursive: true })
    const record = await buildImprovementEvidenceRecord(input)
    const existing = await readEvidenceRecords(input.projectPath)
    const nextRecords = [...existing, record].slice(
      -MAX_AGGREGATED_EVIDENCE_RECORDS,
    )
    const recommendations = deriveProjectImprovementRecommendations(nextRecords)

    await writeFileAtomic(
      evidencePath(input.projectPath),
      `${nextRecords.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    )
    await writeFileAtomic(
      recommendationsPath(input.projectPath),
      JSON.stringify(recommendations, null, 2),
    )
  })
}

export async function listProjectImprovementRecommendations(
  projectPath: string,
  filter?: {
    workflowPath?: string | null
    workflowName?: string | null
  },
): Promise<FlowImprovementRecommendation[]> {
  const workflowPath = normalizePathKey(filter?.workflowPath || undefined)
  const workflowName = filter?.workflowName?.trim() || ""

  const persisted =
    (await readJsonFile<FlowImprovementRecommendation[]>(
      recommendationsPath(projectPath),
    )) ||
    deriveProjectImprovementRecommendations(
      await readEvidenceRecords(projectPath),
    )

  return persisted.filter((entry) => {
    if (workflowPath) {
      return normalizePathKey(entry.workflowPath) === workflowPath
    }
    if (!workflowName) return true
    return (
      !normalizePathKey(entry.workflowPath) &&
      entry.workflowName === workflowName
    )
  })
}
