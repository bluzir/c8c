import type {
  DiscoveredSkill,
  InstalledPlugin,
  MarketplaceSource,
  PluginCapability,
  Workflow,
} from "@shared/types"

export type LibraryAction = "installing" | "updating" | "removing"
export type MarketplaceAction = "installing" | "updating" | "removing"
export type PluginAction = "enabling" | "disabling"

export const LIBRARY_ACTION_LABEL: Record<LibraryAction, string> = {
  installing: "Installing",
  updating: "Updating",
  removing: "Removing",
}

export const MARKETPLACE_ACTION_LABEL: Record<MarketplaceAction, string> = {
  installing: "Installing",
  updating: "Updating",
  removing: "Removing",
}

export const PLUGIN_ACTION_LABEL: Record<PluginAction, string> = {
  enabling: "Enabling",
  disabling: "Disabling",
}

const FAVORITE_LIBRARY_IDS = [
  "agency-agents",
  "anthropic-skills",
  "gtm-skills",
  "jeff-allan-skills",
  "composio-skills",
] as const

export const FAVORITE_LIBRARY_ORDER = new Map<string, number>(
  FAVORITE_LIBRARY_IDS.map((id, index) => [id, index]),
)

export const LIBRARY_PREVIEW_HINTS: Record<string, string[]> = {
  "agency-agents": [
    "Product manager and growth planning agents",
    "Frontend, backend, and QA engineering agents",
    "Marketing and copywriting support agents",
  ],
  "gtm-skills": [
    "Market research and ICP definition",
    "Outbound email drafting and sequencing",
    "Lead enrichment and account profiling",
  ],
  "anthropic-skills": [
    "PDF, DOCX, and XLSX skills",
    "Presentation analysis and summarization",
    "Website and design QA skills",
  ],
  "jeff-allan-skills": [
    "Architecture and code review flows",
    "Debugging and incident-response helpers",
    "Testing and CI/CD optimization skills",
  ],
  "composio-skills": [
    "SaaS integrations and automation helpers",
    "Content and creative production skills",
    "Research and operations accelerators",
  ],
}

function normalizeSkillRef(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\/+/g, "/").toLowerCase()
}

function skillRefCandidates(skill: DiscoveredSkill): string[] {
  const name = normalizeSkillRef(skill.name)
  const category = normalizeSkillRef(skill.category || "")
  const full = normalizeSkillRef(`${category}/${name}`)
  return Array.from(new Set([name, full])).filter(Boolean)
}

export function findWorkflowRefsBySkills(
  workflow: Workflow,
  candidateSkills: DiscoveredSkill[],
): string[] {
  if (candidateSkills.length === 0) return []
  const candidates = new Set(candidateSkills.flatMap(skillRefCandidates))
  const impacted = new Set<string>()

  for (const node of workflow.nodes) {
    if (node.type !== "skill") continue
    const rawRef =
      typeof node.config.skillRef === "string" ? node.config.skillRef : ""
    const normalizedRef = normalizeSkillRef(rawRef)
    if (!normalizedRef) continue

    const matches = Array.from(candidates).some(
      (candidate) =>
        normalizedRef === candidate || normalizedRef.endsWith(`/${candidate}`),
    )
    if (matches) impacted.add(rawRef)
  }

  return Array.from(impacted)
}

export function formatPluginAssetCount(
  plugin: InstalledPlugin,
  capability: PluginCapability,
): string {
  const asset = plugin.assets.find((item) => item.capability === capability)
  const count = asset?.count ?? 0
  if (capability === "skill") return `${count} skill${count === 1 ? "" : "s"}`
  if (capability === "template")
    return `${count} library flow${count === 1 ? "" : "s"}`
  return `${count} MCP server${count === 1 ? "" : "s"}`
}

export function marketplaceBadgeVariant(
  marketplace: MarketplaceSource,
): "secondary" | "outline" {
  return marketplace.installed ? "secondary" : "outline"
}

export function pluginBadgeVariant(
  plugin: InstalledPlugin,
): "success" | "outline" {
  return plugin.enabled ? "success" : "outline"
}
