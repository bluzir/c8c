import type {
  EvaluatorNodeConfig,
  SkillNodeConfig,
  Workflow,
} from "@shared/types"
import { createHash } from "node:crypto"

const MAX_REFS_IN_LIST = 20

export interface WorkflowSkillCoverage {
  skillNodesTotal: number
  skillRefsTotal: number
  skillRefsUnique: number
  skillRefsList: string | null
  evaluatorNodesTotal: number
  evaluatorSkillRefsTotal: number
  evaluatorSkillRefsUnique: number
  evaluatorSkillRefsList: string | null
}

export interface MissingWorkflowSkillRefs {
  skillNodesTotal: number
  availableSkillsTotal: number
  missingRefsTotal: number
  missingRefsUnique: number
  missingRefsList: string | null
}

interface TelemetrySkillRef {
  name: string
  category: string
}

function normalizeSkillRef(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null
  const normalized = raw.trim().replaceAll("\\", "/").toLowerCase()
  if (!normalized) return null
  return normalized
}

function refsList(refs: Set<string>): string | null {
  if (refs.size === 0) return null
  const list = Array.from(refs).sort().slice(0, MAX_REFS_IN_LIST)
  return list.join(",")
}

export function summarizeWorkflowSkillCoverage(
  workflow: Workflow,
): WorkflowSkillCoverage {
  const skillRefs = new Set<string>()
  const evaluatorSkillRefs = new Set<string>()
  let skillNodesTotal = 0
  let skillRefsTotal = 0
  let evaluatorNodesTotal = 0
  let evaluatorSkillRefsTotal = 0

  for (const node of workflow.nodes) {
    if (node.type === "skill") {
      skillNodesTotal += 1
      const config = node.config as SkillNodeConfig
      const normalizedRef = normalizeSkillRef(config.skillRef)
      if (normalizedRef) {
        skillRefs.add(normalizedRef)
        skillRefsTotal += 1
      }
      continue
    }

    if (node.type === "evaluator") {
      evaluatorNodesTotal += 1
      const config = node.config as EvaluatorNodeConfig
      if (Array.isArray(config.skillRefs)) {
        for (const ref of config.skillRefs) {
          const normalizedRef = normalizeSkillRef(ref)
          if (!normalizedRef) continue
          evaluatorSkillRefs.add(normalizedRef)
          evaluatorSkillRefsTotal += 1
        }
      }
    }
  }

  return {
    skillNodesTotal,
    skillRefsTotal,
    skillRefsUnique: skillRefs.size,
    skillRefsList: refsList(skillRefs),
    evaluatorNodesTotal,
    evaluatorSkillRefsTotal,
    evaluatorSkillRefsUnique: evaluatorSkillRefs.size,
    evaluatorSkillRefsList: refsList(evaluatorSkillRefs),
  }
}

export function summarizeMissingWorkflowSkillRefs(
  workflow: Workflow,
  availableSkills: TelemetrySkillRef[],
): MissingWorkflowSkillRefs {
  const knownRefs = new Set(
    availableSkills
      .map((skill) => normalizeSkillRef(`${skill.category}/${skill.name}`))
      .filter((ref): ref is string => Boolean(ref)),
  )

  const missingRefs = new Set<string>()
  let skillNodesTotal = 0
  let missingRefsTotal = 0

  for (const node of workflow.nodes) {
    if (node.type !== "skill") continue
    skillNodesTotal += 1

    const config = node.config as SkillNodeConfig
    const normalizedRef = normalizeSkillRef(config.skillRef)
    if (!normalizedRef) continue
    if (knownRefs.has(normalizedRef)) continue

    missingRefs.add(normalizedRef)
    missingRefsTotal += 1
  }

  return {
    skillNodesTotal,
    availableSkillsTotal: availableSkills.length,
    missingRefsTotal,
    missingRefsUnique: missingRefs.size,
    missingRefsList: refsList(missingRefs),
  }
}

export function workflowFingerprint(workflow: Workflow): string {
  const id = typeof workflow.id === "string" ? workflow.id.trim() : ""
  const name = typeof workflow.name === "string" ? workflow.name.trim() : ""
  const fingerprintSeed =
    id ||
    name ||
    `nodes:${workflow.nodes.length};edges:${workflow.edges.length}`
  return createHash("sha256").update(fingerprintSeed).digest("hex").slice(0, 16)
}
