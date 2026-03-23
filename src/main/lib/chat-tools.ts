import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowDefaults,
  DiscoveredSkill,
  SkillCategoryNode,
} from "@shared/types"
import { normalizeNodes, normalizeEdges } from "./workflow-generator"
import { validateWorkflowExtended } from "./workflow-validator"
import {
  searchSkills as searchSkillsFn,
  browseCategory as browseCategoryFn,
} from "./skill-category"
import { synthesizeWorkflowFromRequest } from "./workflow-synthesis"

export interface ToolContext {
  workflow: Workflow
  skills: DiscoveredSkill[]
  categoryTree: SkillCategoryNode
  projectPath: string
  surfacedSkillRefs: Set<string>
}

export interface ToolResult {
  output: string
  workflowMutated: boolean
}

type ToolHandler = (
  ctx: ToolContext,
  input: Record<string, unknown>,
) => ToolResult | Promise<ToolResult>

function nextNodeId(workflow: Workflow, prefix = "node"): string {
  const existing = new Set(workflow.nodes.map((n) => n.id))
  let i = workflow.nodes.length
  while (existing.has(`${prefix}-${i}`)) i++
  return `${prefix}-${i}`
}

function nextEdgeId(
  workflow: Workflow,
  source: string,
  target: string,
  type: WorkflowEdge["type"] = "default",
): string {
  const prefix = type === "fail" ? "fail" : "e"
  const base = `${prefix}-${source}-${target}`
  const existing = new Set(workflow.edges.map((edge) => edge.id))
  let candidate = base
  let index = 1
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

const toolHandlers: Record<string, ToolHandler> = {
  async synthesize_workflow(ctx, input) {
    const request =
      typeof input.request === "string" ? input.request.trim() : ""
    const mode = input.mode === "edit" ? "edit" : "create"

    if (!request) {
      return { output: "Error: request is required", workflowMutated: false }
    }

    const nextWorkflow = await synthesizeWorkflowFromRequest(mode, request, {
      projectPath: ctx.projectPath,
      availableSkills: ctx.skills,
      seedWorkflow: ctx.workflow,
    })

    ctx.workflow = nextWorkflow
    for (const skill of ctx.skills) {
      ctx.surfacedSkillRefs.add(`${skill.category}/${skill.name}`)
    }

    return {
      output: `${mode === "edit" ? "Updated" : "Created"} flow "${nextWorkflow.name}" with ${nextWorkflow.nodes.length} nodes and ${nextWorkflow.edges.length} edges`,
      workflowMutated: true,
    }
  },

  get_workflow(ctx) {
    return {
      output: JSON.stringify(ctx.workflow, null, 2),
      workflowMutated: false,
    }
  },

  update_workflow(ctx, input) {
    const newWorkflow = input.workflow as any
    if (!newWorkflow || typeof newWorkflow !== "object") {
      return {
        output: "Error: flow object is required",
        workflowMutated: false,
      }
    }
    if (
      !Array.isArray(newWorkflow.nodes) ||
      !Array.isArray(newWorkflow.edges)
    ) {
      return {
        output: "Error: flow must have nodes and edges arrays",
        workflowMutated: false,
      }
    }

    ctx.workflow.name = newWorkflow.name || ctx.workflow.name
    ctx.workflow.description =
      newWorkflow.description ?? ctx.workflow.description
    ctx.workflow.defaults = {
      ...ctx.workflow.defaults,
      ...newWorkflow.defaults,
    }
    ctx.workflow.nodes = normalizeNodes(newWorkflow.nodes)
    ctx.workflow.edges = normalizeEdges(newWorkflow.edges)

    return {
      output: `Flow updated: ${ctx.workflow.nodes.length} nodes, ${ctx.workflow.edges.length} edges`,
      workflowMutated: true,
    }
  },

  add_node(ctx, input) {
    const nodeInput = input.node as any
    if (!nodeInput || typeof nodeInput !== "object") {
      return {
        output: "Error: node object is required",
        workflowMutated: false,
      }
    }

    const afterNodeId = input.after_node_id as string | undefined
    let afterNode: WorkflowNode | undefined
    if (afterNodeId) {
      afterNode = ctx.workflow.nodes.find((n) => n.id === afterNodeId)
      if (!afterNode) {
        return {
          output: `Error: after_node_id "${afterNodeId}" not found`,
          workflowMutated: false,
        }
      }
    }

    if (
      typeof nodeInput.id === "string" &&
      ctx.workflow.nodes.some((n) => n.id === nodeInput.id)
    ) {
      return {
        output: `Error: node "${nodeInput.id}" already exists`,
        workflowMutated: false,
      }
    }

    // Normalize the single node
    const [node] = normalizeNodes([
      {
        ...nodeInput,
        id: nodeInput.id || nextNodeId(ctx.workflow, nodeInput.type || "skill"),
      },
    ])

    // Position: place after the reference node or at end
    if (afterNode) {
      node.position = {
        x: afterNode.position.x + 300,
        y: afterNode.position.y,
      }
    }

    ctx.workflow.nodes.push(node)

    // Auto-wire: if after_node_id specified, insert between it and its targets
    if (afterNodeId) {
      const outgoingEdges = ctx.workflow.edges.filter(
        (e) => e.source === afterNodeId,
      )

      if (outgoingEdges.length > 0) {
        // Rewire: afterNode -> newNode -> (original targets)
        const retainedEdges = ctx.workflow.edges.filter(
          (edge) => edge.source !== afterNodeId,
        )
        const rewiredEdges: WorkflowEdge[] = []
        for (const edge of outgoingEdges) {
          rewiredEdges.push({
            ...edge,
            id: nextEdgeId(
              { ...ctx.workflow, edges: [...retainedEdges, ...rewiredEdges] },
              node.id,
              edge.target,
              edge.type,
            ),
            source: node.id,
          })
        }
        ctx.workflow.edges = [...retainedEdges, ...rewiredEdges]
        ctx.workflow.edges.push({
          id: nextEdgeId(ctx.workflow, afterNodeId, node.id, "default"),
          source: afterNodeId,
          target: node.id,
          type: "default",
        })
      } else {
        // Just connect afterNode -> newNode
        ctx.workflow.edges.push({
          id: nextEdgeId(ctx.workflow, afterNodeId, node.id, "default"),
          source: afterNodeId,
          target: node.id,
          type: "default",
        })
      }
    }

    return {
      output: `Added node "${node.id}" (${node.type})${afterNodeId ? ` after "${afterNodeId}"` : ""}`,
      workflowMutated: true,
    }
  },

  remove_node(ctx, input) {
    const nodeId = input.node_id as string
    if (!nodeId) {
      return { output: "Error: node_id is required", workflowMutated: false }
    }

    const nodeIndex = ctx.workflow.nodes.findIndex((n) => n.id === nodeId)
    if (nodeIndex === -1) {
      return {
        output: `Error: node "${nodeId}" not found`,
        workflowMutated: false,
      }
    }

    // Rewire: connect incoming sources to outgoing targets
    const incoming = ctx.workflow.edges.filter((e) => e.target === nodeId)
    const outgoing = ctx.workflow.edges.filter((e) => e.source === nodeId)

    // Remove all edges connected to this node
    ctx.workflow.edges = ctx.workflow.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    )

    // Create bridge edges
    const existingEdgeKeys = new Set(
      ctx.workflow.edges.map(
        (edge) => `${edge.source}=>${edge.target}:${edge.type}`,
      ),
    )
    for (const inEdge of incoming) {
      for (const outEdge of outgoing) {
        if (inEdge.source === outEdge.target) continue
        const bridgeType: WorkflowEdge["type"] =
          outEdge.type === "default" ? inEdge.type : outEdge.type
        const edgeKey = `${inEdge.source}=>${outEdge.target}:${bridgeType}`
        if (existingEdgeKeys.has(edgeKey)) continue
        ctx.workflow.edges.push({
          id: nextEdgeId(
            ctx.workflow,
            inEdge.source,
            outEdge.target,
            bridgeType,
          ),
          source: inEdge.source,
          target: outEdge.target,
          type: bridgeType,
        })
        existingEdgeKeys.add(edgeKey)
      }
    }

    // Remove the node
    ctx.workflow.nodes.splice(nodeIndex, 1)

    return {
      output: `Removed node "${nodeId}" and rewired ${incoming.length} incoming → ${outgoing.length} outgoing edges`,
      workflowMutated: true,
    }
  },

  update_node(ctx, input) {
    const nodeId = input.node_id as string
    const config = input.config as Record<string, unknown> | undefined

    if (!nodeId) {
      return { output: "Error: node_id is required", workflowMutated: false }
    }

    const node = ctx.workflow.nodes.find((n) => n.id === nodeId)
    if (!node) {
      return {
        output: `Error: node "${nodeId}" not found`,
        workflowMutated: false,
      }
    }

    if (!config) {
      return {
        output: `No updates applied to node "${nodeId}"`,
        workflowMutated: false,
      }
    }

    node.config = { ...node.config, ...config } as any

    return {
      output: `Updated node "${nodeId}" config`,
      workflowMutated: true,
    }
  },

  add_edge(ctx, input) {
    const source = input.source as string
    const target = input.target as string
    const type = (input.type as string) || "default"

    if (!source || !target) {
      return {
        output: "Error: source and target are required",
        workflowMutated: false,
      }
    }

    if (!ctx.workflow.nodes.find((n) => n.id === source)) {
      return {
        output: `Error: source node "${source}" not found`,
        workflowMutated: false,
      }
    }
    if (!ctx.workflow.nodes.find((n) => n.id === target)) {
      return {
        output: `Error: target node "${target}" not found`,
        workflowMutated: false,
      }
    }

    const edge: WorkflowEdge = {
      id: nextEdgeId(
        ctx.workflow,
        source,
        target,
        type as WorkflowEdge["type"],
      ),
      source,
      target,
      type: type as WorkflowEdge["type"],
    }
    ctx.workflow.edges.push(edge)

    return {
      output: `Added edge "${edge.id}" (${source} → ${target}, type: ${type})`,
      workflowMutated: true,
    }
  },

  remove_edge(ctx, input) {
    const edgeId = input.edge_id as string
    if (!edgeId) {
      return { output: "Error: edge_id is required", workflowMutated: false }
    }

    const index = ctx.workflow.edges.findIndex((e) => e.id === edgeId)
    if (index === -1) {
      return {
        output: `Error: edge "${edgeId}" not found`,
        workflowMutated: false,
      }
    }

    ctx.workflow.edges.splice(index, 1)
    return {
      output: `Removed edge "${edgeId}"`,
      workflowMutated: true,
    }
  },

  set_defaults(ctx, input) {
    const defaults = input.defaults as Partial<WorkflowDefaults> | undefined
    if (!defaults) {
      return {
        output: "Error: defaults object is required",
        workflowMutated: false,
      }
    }

    ctx.workflow.defaults = { ...ctx.workflow.defaults, ...defaults }
    return {
      output: `Updated flow defaults: ${JSON.stringify(ctx.workflow.defaults)}`,
      workflowMutated: true,
    }
  },

  search_skills(ctx, input) {
    const query = input.query as string
    const limit = (input.limit as number) || 20

    if (!query) {
      return { output: "Error: query is required", workflowMutated: false }
    }

    const results = searchSkillsFn(ctx.skills, query, limit)
    if (results.length === 0) {
      return {
        output: `No skills found matching "${query}"`,
        workflowMutated: false,
      }
    }

    const formatted = results
      .map((r) => `- ${r.skillRef}: ${r.description} (score: ${r.score})`)
      .join("\n")

    for (const result of results) {
      ctx.surfacedSkillRefs.add(result.skillRef)
    }

    return {
      output: `Found ${results.length} skills matching "${query}":\n${formatted}`,
      workflowMutated: false,
    }
  },

  browse_category(ctx, input) {
    const path = input.path as string | undefined
    const node = browseCategoryFn(ctx.categoryTree, path)

    if (!node) {
      return { output: `Category "${path}" not found`, workflowMutated: false }
    }

    const parts: string[] = [
      `Category: ${node.path || "root"} (${node.count} skills)`,
    ]

    if (node.children.length > 0) {
      parts.push("\nSubcategories:")
      for (const child of node.children.sort((a, b) => b.count - a.count)) {
        parts.push(`  ${child.name}/ (${child.count})`)
      }
    }

    if (node.skills && node.skills.length > 0) {
      parts.push("\nSkills:")
      for (const skill of node.skills) {
        parts.push(`  - ${skill.skillRef}: ${skill.description}`)
        ctx.surfacedSkillRefs.add(skill.skillRef)
      }
    }

    return { output: parts.join("\n"), workflowMutated: false }
  },

  validate_workflow(ctx) {
    const result = validateWorkflowExtended(ctx.workflow, ctx.skills, {
      surfacedSkillRefs: ctx.surfacedSkillRefs,
    })

    const parts: string[] = []
    if (result.valid) {
      parts.push("✓ Flow is valid")
    } else {
      parts.push("✗ Flow has errors:")
      for (const err of result.errors) {
        parts.push(`  ERROR: ${err}`)
      }
    }

    if (result.warnings.length > 0) {
      parts.push("\nWarnings:")
      for (const warn of result.warnings) {
        parts.push(`  WARN: ${warn}`)
      }
    }

    parts.push(
      `\nSummary: ${ctx.workflow.nodes.length} nodes, ${ctx.workflow.edges.length} edges`,
    )

    return { output: parts.join("\n"), workflowMutated: false }
  },
}

/**
 * Execute a tool by name with given input.
 */
export async function executeTool(
  toolName: string,
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const handler = toolHandlers[toolName]
  if (!handler) {
    const available = Object.keys(toolHandlers).sort().join(", ")
    return {
      output: `Unknown tool: "${toolName}". Available flow tools: ${available}`,
      workflowMutated: false,
    }
  }
  return await handler(ctx, input)
}

/**
 * Get the tool definitions for the system prompt.
 */
export function getToolDefinitions(): string {
  return `## Available Tools

### synthesize_workflow
Create or semantically rewrite the flow from a human-language request.
Use this when the user is describing what the flow should do, not asking for a tiny node-level patch.
Parameters:
- request (required): Natural-language description of the desired flow behavior
- mode (optional): "create" or "edit" (default: "create")

### get_workflow
Read the current flow state.
Parameters: none

### update_workflow
Replace the entire flow with a new definition.
Parameters:
- workflow (required): Complete Workflow object with nodes and edges arrays

### add_node
Insert a new node into the flow with optional auto-wiring.
Parameters:
- node (required): Node object with at minimum { type, config }
  - For skill nodes: config needs { prompt } and may include { skillRef, allowedTools[], disallowedTools[], permissionMode? }; leave skillRef empty when no available skill is a close semantic match. permissionMode overrides the flow default for this node ("plan" or "edit"). For external web tasks include allowedTools with at least ["WebFetch", "WebSearch"] unless blocked
  - For evaluator nodes: config needs { criteria, threshold, maxRetries } and can optionally include { retryFrom, skillRefs[] }. Do not use skillRef on evaluator nodes.
  - For splitter nodes: config needs { strategy } — strategy is a natural-language hint describing HOW to decompose the input (e.g. "Each item is an independent task. Create one subtask per item preserving all details."). It is NOT a keyword — write a clear sentence explaining the decomposition logic for this specific use case.
  - For merger nodes: config needs { strategy }
- after_node_id (optional): Insert after this node and auto-wire edges

### remove_node
Remove a node and rewire its incoming edges to its outgoing targets.
Parameters:
- node_id (required): ID of the node to remove

### update_node
Update a node's configuration (partial merge).
Parameters:
- node_id (required): ID of the node to update
- config (required): Partial config object to merge into existing config

### add_edge
Add a new edge between two nodes.
Parameters:
- source (required): Source node ID
- target (required): Target node ID
- type (optional): Edge type — "default", "pass", or "fail" (default: "default")

### remove_edge
Remove an edge by ID.
Parameters:
- edge_id (required): ID of the edge to remove

### set_defaults
Update flow-level defaults.
Parameters:
- defaults (required): Partial defaults object { model?, maxTurns?, maxParallel?, timeout_minutes?, allowedTools?, disallowedTools?, permissionMode? }
  - permissionMode: "plan" (read-only, no file edits) or "edit" (can modify files). Default: "edit"

### search_skills
Fuzzy search available skills by query.
Parameters:
- query (required): Search query string
- limit (optional): Max results (default: 20)
Use this before assigning a non-empty skillRef through low-level editing tools.

### browse_category
Browse the skill category tree.
Parameters:
- path (optional): Category path like "marketing/seo". Omit for root.

### validate_workflow
Run structural and semantic validation on the current flow.
Parameters: none

## Tool Call Format
Output tool calls as fenced JSON blocks:
\`\`\`json
{"tool": "tool_name", "call_id": "unique-id", "input": {...}}
\`\`\``
}
