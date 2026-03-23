export interface ToolCardSummary {
  title: string
  detail?: string
  preview?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function compactText(
  value: string | undefined,
  maxLen = 120,
): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return undefined
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen - 1)}…`
}

function extractSectionItems(
  body: string,
  section: "Subcategories" | "Skills",
): string[] {
  const match = body.match(new RegExp(`${section}:\\n([\\s\\S]*?)(?:\\n\\n|$)`))
  if (!match) return []
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/\/\s+\(/, " ("))
}

function summarizeDefaults(
  defaults: Record<string, unknown>,
): string | undefined {
  const keys = Object.keys(defaults).filter(Boolean)
  if (keys.length === 0) return undefined
  return keys.slice(0, 3).join(", ")
}

function summarizeFlowCounts(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const nodes = Array.isArray(value.nodes) ? value.nodes.length : undefined
  const edges = Array.isArray(value.edges) ? value.edges.length : undefined
  if (typeof nodes !== "number" || typeof edges !== "number") return undefined
  return `${pluralize(nodes, "step")}, ${pluralize(edges, "connection")}`
}

function canonicalizeFlowSummary(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined
  return value
    .replace(/\b(\d+)\s+nodes?\b/g, (_match, count: string) =>
      pluralize(Number(count), "step"),
    )
    .replace(/\b(\d+)\s+edges?\b/g, (_match, count: string) =>
      pluralize(Number(count), "connection"),
    )
}

function summarizeGenericInput(
  input: Record<string, unknown> | undefined,
): string | undefined {
  if (!input) return undefined
  const entries = Object.entries(input)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .slice(0, 3)
    .map(([key, value]) => {
      if (typeof value === "string") return `${key}: ${value}`
      if (typeof value === "number" || typeof value === "boolean")
        return `${key}: ${String(value)}`
      if (Array.isArray(value))
        return `${key}: ${pluralize(value.length, "item")}`
      if (isRecord(value)) return `${key}: ${Object.keys(value).length} fields`
      return key
    })

  return compactText(entries.join(", "))
}

function summarizeGenericOutput(body: string): ToolCardSummary {
  const [firstLine, secondLine] = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    title: compactText(firstLine || "Tool result", 80) || "Tool result",
    preview: compactText(secondLine),
  }
}

function parseJsonObjectSuffix(
  prefix: string,
  body: string,
): Record<string, unknown> | null {
  if (!body.startsWith(prefix)) return null
  const suffix = body.slice(prefix.length).trim()
  if (!suffix) return null
  try {
    const parsed = JSON.parse(suffix)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isToolResultError(
  body: string | undefined,
  explicitError?: string,
): boolean {
  if (explicitError) return true
  const normalized = body?.trim()
  if (!normalized) return false
  return /^Error:/i.test(normalized) || /^Unknown tool:/i.test(normalized)
}

export function summarizeToolCall(
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
): ToolCardSummary {
  switch (toolName) {
    case "browse_category": {
      const path = asString(input?.path)
      return {
        title: "Browse category",
        detail: path || "root",
      }
    }

    case "search_skills": {
      const query = asString(input?.query)
      const limit = asNumber(input?.limit)
      return {
        title: "Search skills",
        detail: query ? `"${query}"` : undefined,
        preview: typeof limit === "number" ? `Limit ${limit}` : undefined,
      }
    }

    case "validate_workflow":
      return { title: "Validate flow" }

    case "get_workflow":
      return { title: "Read flow" }

    case "add_node": {
      const node = isRecord(input?.node) ? input.node : undefined
      const nodeType = asString(node?.type)
      const skillRef = isRecord(node?.config)
        ? asString(node.config.skillRef)
        : undefined
      const afterNodeId = asString(input?.after_node_id)
      return {
        title: nodeType ? `Add ${nodeType} step` : "Add step",
        detail: skillRef || afterNodeId,
        preview: afterNodeId && skillRef ? `After ${afterNodeId}` : undefined,
      }
    }

    case "update_node": {
      const nodeId = asString(input?.node_id)
      const config = isRecord(input?.config) ? input.config : undefined
      return {
        title: nodeId ? `Update ${nodeId}` : "Update step",
        detail: config ? Object.keys(config).slice(0, 3).join(", ") : undefined,
      }
    }

    case "remove_node":
      return {
        title: "Remove step",
        detail: asString(input?.node_id),
      }

    case "add_edge": {
      const source = asString(input?.source)
      const target = asString(input?.target)
      const type = asString(input?.type)
      return {
        title:
          source && target
            ? `Connect ${source} -> ${target}`
            : "Add connection",
        detail: type && type !== "default" ? `${type} connection` : undefined,
      }
    }

    case "remove_edge":
      return {
        title: "Remove connection",
        detail: asString(input?.edge_id),
      }

    case "set_defaults": {
      const defaults = isRecord(input?.defaults) ? input.defaults : undefined
      return {
        title: "Update defaults",
        detail: defaults ? summarizeDefaults(defaults) : undefined,
      }
    }

    case "update_workflow": {
      const workflow = isRecord(input?.workflow) ? input.workflow : undefined
      return {
        title: "Replace flow",
        detail: summarizeFlowCounts(workflow),
      }
    }

    default:
      return {
        title: toolName
          ? compactText(toolName.replace(/_/g, " "), 60) || toolName
          : "Run tool",
        detail: summarizeGenericInput(input),
      }
  }
}

export function summarizeToolResult(
  toolName: string | undefined,
  body: string,
  options: { isError?: boolean } = {},
): ToolCardSummary {
  if (options.isError) {
    const title = body.replace(/^Error:\s*/i, "").trim() || "Tool error"
    return {
      title: compactText(title, 80) || "Tool error",
    }
  }

  switch (toolName) {
    case "browse_category": {
      const match = body.match(/^Category:\s*(.+?)\s+\((\d+)\s+skills?\)/m)
      const subcategories = extractSectionItems(body, "Subcategories")
      const skills = extractSectionItems(body, "Skills")
      return {
        title: match ? `Category ${match[1]}` : "Category loaded",
        detail: match ? pluralize(Number(match[2]), "skill") : undefined,
        preview: compactText(
          [
            subcategories.length > 0
              ? pluralize(subcategories.length, "subcategory", "subcategories")
              : "",
            skills.length > 0 ? skills.slice(0, 2).join(", ") : "",
          ]
            .filter(Boolean)
            .join(" • "),
        ),
      }
    }

    case "search_skills": {
      const foundMatch = body.match(
        /^Found\s+(\d+)\s+skills?\s+matching\s+"([^"]+)"/m,
      )
      if (foundMatch) {
        const skills = Array.from(body.matchAll(/^- ([^:]+):/gm)).map(
          (match) => match[1],
        )
        return {
          title: `Found ${pluralize(Number(foundMatch[1]), "skill")}`,
          detail: `"${foundMatch[2]}"`,
          preview: compactText(skills.slice(0, 3).join(", ")),
        }
      }

      const emptyMatch = body.match(/^No skills found matching "([^"]+)"/m)
      if (emptyMatch) {
        return {
          title: "No skills found",
          detail: `"${emptyMatch[1]}"`,
        }
      }
      break
    }

    case "validate_workflow": {
      const valid = body.startsWith("✓")
      const summaryMatch = body.match(/^Summary:\s*(.+)$/m)
      const warningCount = (body.match(/^\s*WARN:/gm) || []).length
      const errorCount = (body.match(/^\s*ERROR:/gm) || []).length
      return {
        title: valid
          ? "Flow valid"
          : errorCount > 0
            ? `${pluralize(errorCount, "error")} in flow`
            : "Flow has issues",
        detail: canonicalizeFlowSummary(summaryMatch?.[1]),
        preview:
          warningCount > 0 ? pluralize(warningCount, "warning") : undefined,
      }
    }

    case "get_workflow": {
      try {
        const parsed = JSON.parse(body) as unknown
        const counts = summarizeFlowCounts(parsed)
        const name = isRecord(parsed) ? asString(parsed.name) : undefined
        return {
          title: "Flow snapshot",
          detail: counts,
          preview: name,
        }
      } catch {
        break
      }
    }

    case "set_defaults": {
      const defaults = parseJsonObjectSuffix("Updated workflow defaults:", body)
      return {
        title: "Defaults updated",
        detail: defaults ? summarizeDefaults(defaults) : undefined,
      }
    }

    case "update_workflow": {
      const match = body.match(/^Workflow updated:\s*(.+)$/m)
      return {
        title: "Flow updated",
        detail: match?.[1],
      }
    }

    case "add_node": {
      const match = body.match(
        /^Added node "([^"]+)" \(([^)]+)\)(?: after "([^"]+)")?/m,
      )
      return {
        title: match ? `Added ${match[1]}` : "Added step",
        detail: match
          ? `${match[2]} step${match[3] ? ` after ${match[3]}` : ""}`
          : undefined,
      }
    }

    case "remove_node": {
      const match = body.match(/^Removed node "([^"]+)"(?: and rewired (.+))?/m)
      return {
        title: match ? `Removed ${match[1]}` : "Removed step",
        detail: compactText(match?.[2]),
      }
    }

    case "update_node": {
      const match = body.match(/^Updated node "([^"]+)"/m)
      return {
        title: match ? `Updated ${match[1]}` : "Updated step",
      }
    }

    case "add_edge": {
      const match = body.match(
        /^Added edge "([^"]+)" \((.+?) → (.+?), type: ([^)]+)\)/m,
      )
      return {
        title: match
          ? `Connected ${match[2]} -> ${match[3]}`
          : "Added connection",
        detail: match ? `${match[4]} connection` : undefined,
      }
    }

    case "remove_edge": {
      const match = body.match(/^Removed edge "([^"]+)"/m)
      return {
        title: match ? `Removed ${match[1]}` : "Removed connection",
      }
    }
  }

  return summarizeGenericOutput(body)
}
