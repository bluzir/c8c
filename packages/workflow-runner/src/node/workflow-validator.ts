import type { Workflow, DiscoveredSkill } from "@shared/types"
import { validateWorkflow } from "../lib/graph-engine"
import { scoreSkillMatch, searchSkills, toSkillRef } from "./skill-category"

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

interface ValidationOptions {
  surfacedSkillRefs?: ReadonlySet<string>
}

const SKILL_SEARCH_RESULT_LIMIT = 5

function normalizeSemanticQuery(prompt: string): string {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)

  return [...new Set(tokens)].slice(0, 24).join(" ")
}

function resolveSkill(
  availableSkills: DiscoveredSkill[],
  rawRef: string,
): DiscoveredSkill | undefined {
  const ref = rawRef.trim()
  if (!ref) return undefined
  return availableSkills.find(
    (skill) => toSkillRef(skill) === ref || skill.name === ref,
  )
}

/**
 * Extended workflow validation with skill ref checks, reachability, and structural checks.
 */
export function validateWorkflowExtended(
  workflow: Workflow,
  availableSkills?: DiscoveredSkill[],
  options: ValidationOptions = {},
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Basic graph validation
  const basicErrors = validateWorkflow(workflow)
  errors.push(...basicErrors)

  // 2. Skill ref existence check
  if (availableSkills) {
    const skillRefs = new Set(availableSkills.map((s) => toSkillRef(s)))
    const skillNames = new Set(availableSkills.map((s) => s.name))

    for (const node of workflow.nodes) {
      if (node.type !== "skill") continue

      const ref = node.config.skillRef?.trim()
      if (!ref) continue

      if (!skillRefs.has(ref) && !skillNames.has(ref)) {
        warnings.push(
          `Skill "${ref}" (node "${node.id}") not found in available skills — will be auto-scaffolded`,
        )
        continue
      }

      const resolvedSkill = resolveSkill(availableSkills, ref)
      if (!resolvedSkill) continue

      const resolvedSkillRef = toSkillRef(resolvedSkill)
      if (
        options.surfacedSkillRefs &&
        !options.surfacedSkillRefs.has(resolvedSkillRef)
      ) {
        warnings.push(
          `Skill "${resolvedSkillRef}" (node "${node.id}") was used without being surfaced via search_skills or browse_category in this chat session`,
        )
      }

      const semanticQuery = normalizeSemanticQuery(node.config.prompt || "")
      if (!semanticQuery) continue

      const rankedSkills = searchSkills(
        availableSkills,
        semanticQuery,
        Math.max(SKILL_SEARCH_RESULT_LIMIT, availableSkills.length),
      )
      const chosenScore = scoreSkillMatch(resolvedSkill, semanticQuery)
      const strongestMatches = rankedSkills.slice(0, SKILL_SEARCH_RESULT_LIMIT)
      const topMatch = strongestMatches[0]

      if (topMatch && chosenScore === 0 && topMatch.score >= 6) {
        warnings.push(
          `Skill "${resolvedSkillRef}" (node "${node.id}") looks semantically mismatched to the node prompt. Stronger matches from the current skill library: ${strongestMatches.map((match) => match.skillRef).join(", ")}`,
        )
        continue
      }

      if (
        topMatch &&
        topMatch.skillRef !== resolvedSkillRef &&
        topMatch.score >= 8 &&
        topMatch.score - chosenScore >= 6
      ) {
        warnings.push(
          `Skill "${resolvedSkillRef}" (node "${node.id}") ranks materially below stronger matches for the node prompt. Top match: "${topMatch.skillRef}" (score ${topMatch.score} vs ${chosenScore}).`,
        )
      }
    }
  }

  // 3. BFS reachability from input nodes
  const inputNodes = workflow.nodes.filter((n) => n.type === "input")
  if (inputNodes.length > 0) {
    const adjacency = new Map<string, string[]>()
    for (const edge of workflow.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
      adjacency.get(edge.source)!.push(edge.target)
    }

    const reachable = new Set<string>()
    const queue = inputNodes.map((n) => n.id)
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)
      const neighbors = adjacency.get(current) || []
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) queue.push(neighbor)
      }
    }

    for (const node of workflow.nodes) {
      if (!reachable.has(node.id) && node.type !== "input") {
        warnings.push(`Node "${node.id}" is not reachable from any input node`)
      }
    }
  }

  // 4. Evaluator consistency
  for (const node of workflow.nodes) {
    if (node.type === "evaluator") {
      const config = node.config
      if (config.retryFrom) {
        const retryTarget = workflow.nodes.find(
          (n) => n.id === config.retryFrom,
        )
        if (!retryTarget) {
          errors.push(
            `Evaluator "${node.id}" retryFrom references nonexistent node "${config.retryFrom}"`,
          )
        }
      }

      const outgoing = workflow.edges.filter((e) => e.source === node.id)
      const hasPass = outgoing.some((e) => e.type === "pass")
      const hasFail = outgoing.some((e) => e.type === "fail")

      if (!hasPass) {
        warnings.push(`Evaluator "${node.id}" has no "pass" edge`)
      }
      if (!hasFail && config.maxRetries > 0) {
        warnings.push(
          `Evaluator "${node.id}" has maxRetries=${config.maxRetries} but no "fail" edge`,
        )
      }
    }
  }

  // 5. Splitter/merger pairing check
  const splitters = workflow.nodes.filter((n) => n.type === "splitter")
  const mergers = workflow.nodes.filter((n) => n.type === "merger")
  if (splitters.length > 0 && mergers.length === 0) {
    warnings.push(
      "Workflow has splitter(s) but no merger — parallel branches won't converge",
    )
  }
  if (mergers.length > splitters.length) {
    warnings.push(
      "More mergers than splitters — some mergers may never receive all inputs",
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
