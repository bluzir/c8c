import { readFileSync } from "node:fs"
import { join } from "node:path"
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  EdgeType,
  NodeType,
} from "@shared/types"
import { validateWorkflow } from "./graph-engine"

interface SkillInfo {
  name: string
  category: string
  description: string
}

// Read the skill file at module load time
let skillContent: string
try {
  skillContent = readFileSync(
    join(__dirname, "../skills/workflow-generator.md"),
    "utf-8",
  )
} catch {
  // Fallback for dev/test — use a minimal prompt
  skillContent = ""
}

export function buildGeneratorPrompt(
  userDescription: string,
  availableSkills: SkillInfo[],
): string {
  return [
    buildPromptPrelude(),
    buildAvailableSkillsSection(availableSkills),
    "## User Request",
    "",
    userDescription,
  ].join("\n")
}

export function buildWorkflowEditPrompt(
  userRequest: string,
  currentWorkflow: Workflow,
  availableSkills: SkillInfo[],
): string {
  return [
    buildPromptPrelude(),
    "## Existing Flow",
    "",
    JSON.stringify(currentWorkflow, null, 2),
    "",
    buildAvailableSkillsSection(availableSkills),
    "## Edit Request",
    "",
    userRequest,
    "",
    "Update the existing flow to satisfy the edit request.",
    "Treat the request as the desired behavior of the flow, not as work to execute yourself right now.",
    "Preserve unchanged behavior where possible, but replace the structure when the requested behavior changes substantially.",
    "Return ONLY the full updated JSON flow object.",
  ].join("\n")
}

function buildPromptPrelude(): string {
  if (skillContent) {
    // Use the skill file as the system context.
    return skillContent
  }

  return [
    "You are a flow generator for c8c.",
    "Generate a valid JSON flow with nodes (input, skill, evaluator, splitter, merger, output) and edges (default, pass, fail).",
    "Always start with input, end with output. Use evaluator for quality loops, splitter+merger for parallel processing.",
    "If a flow uses splitter, add a pre-split analysis skill before splitter to produce a structured split-ready result; splitter only decomposes that prepared result.",
    "Only set skillRef when an available skill is a close semantic match for the job. Otherwise leave skillRef empty and rely on prompt.",
    "Evaluator nodes support skillRefs only. Never put skillRef inside an evaluator config.",
    "If a skill needs external websites/URLs/domains, include config.allowedTools with at least ['WebFetch','WebSearch'] unless explicitly blocked.",
    "For text/landing generation flows, prefer evaluator rewrite loops ('check slop or not -> rewrite') and set evaluator skillRefs to ['infostyle','slop-check'].",
  ].join("\n")
}

function buildAvailableSkillsSection(availableSkills: SkillInfo[]): string {
  const skillList = availableSkills
    .map((s) => `  - ${s.category}/${s.name}: ${s.description}`)
    .join("\n")

  return [
    "## Available Skills",
    "",
    availableSkills.length > 0
      ? skillList
      : "  (No skills discovered — use descriptive skillRef names)",
    "",
  ].join("\n")
}

const VALID_EDGE_TYPES = new Set<string>(["default", "pass", "fail"])
const VALID_NODE_TYPES = new Set<string>([
  "input",
  "skill",
  "evaluator",
  "splitter",
  "merger",
  "output",
])

function normalizeConfig(n: any): any {
  const type: string = VALID_NODE_TYPES.has(n.type) ? n.type : "skill"
  const existing = n.config && typeof n.config === "object" ? n.config : {}

  switch (type) {
    case "skill":
      return {
        ...existing,
        skillRef: existing.skillRef || n.agent || n.skill || "",
        prompt: existing.prompt || n.description || n.instruction || "",
      }
    case "evaluator":
      return {
        criteria: existing.criteria || "",
        threshold: existing.threshold ?? 7,
        maxRetries: existing.maxRetries ?? 3,
        ...existing,
      }
    case "splitter":
      return {
        strategy: existing.strategy || "chunk",
        maxBranches: existing.maxBranches ?? 5,
        ...existing,
      }
    case "merger":
      return {
        strategy: existing.strategy || "concatenate",
        ...existing,
      }
    case "input":
    case "output":
      return existing
    default:
      return existing
  }
}

export function normalizeEdges(edges: any[]): WorkflowEdge[] {
  return edges.map((e, i) => ({
    id: e.id || `e-${e.source || e.from || i}-${e.target || e.to || i}`,
    source: e.source || e.from || e.sourceId || "",
    target: e.target || e.to || e.targetId || "",
    type: (VALID_EDGE_TYPES.has(e.type) ? e.type : "default") as EdgeType,
  }))
}

export function normalizeNodes(nodes: any[]): WorkflowNode[] {
  return nodes.map((n, i) => ({
    ...n,
    id: n.id || `node-${i}`,
    type: (VALID_NODE_TYPES.has(n.type) ? n.type : "skill") as NodeType,
    position:
      n.position && typeof n.position.x === "number"
        ? n.position
        : { x: i * 300, y: 200 },
    config: normalizeConfig(n),
  }))
}

export function parseGeneratedWorkflow(output: string): Workflow {
  // Extract JSON from code block if present
  const codeBlockMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : output.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    const objMatch = output.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try {
        parsed = JSON.parse(objMatch[0])
      } catch {
        throw new Error("Could not parse flow JSON from AI output")
      }
    } else {
      throw new Error("No JSON found in AI output")
    }
  }

  const w = parsed as any
  if (!w || typeof w !== "object") {
    throw new Error("AI output is not a JSON object")
  }
  if (!Array.isArray(w.nodes) || !Array.isArray(w.edges)) {
    throw new Error("Flow must have nodes and edges arrays")
  }

  const workflow: Workflow = {
    version: w.version || 1,
    name: w.name || "Generated Flow",
    description: w.description,
    defaults: w.defaults || {
      model: "sonnet",
      maxTurns: 120,
      timeout_minutes: 30,
      maxParallel: 8,
    },
    nodes: normalizeNodes(w.nodes),
    edges: normalizeEdges(w.edges),
  }

  const errors = validateWorkflow(workflow)
  if (errors.length > 0) {
    throw new Error(`Generated flow is invalid: ${errors.join("; ")}`)
  }

  return workflow
}
