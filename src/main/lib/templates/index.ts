import type { WorkflowTemplate, WorkflowTemplateStage } from "@shared/types"
import { listPluginTemplates } from "./plugin-templates"
import { listProjectTemplates } from "./project-templates"
import { parseTemplate } from "./parse"
import { getHubCatalog, type CatalogEntry } from "./hub-catalog"

const yamlModules = import.meta.glob("./*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
})

const builtinTemplates: WorkflowTemplate[] = Object.values(yamlModules).map(
  (raw) => parseTemplate(raw as string, { source: "builtin" }),
)

export function getBuiltinTemplates(): WorkflowTemplate[] {
  return builtinTemplates
}

function catalogEntryToTemplate(entry: CatalogEntry): WorkflowTemplate {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.headline,
    stage: entry.stage as WorkflowTemplateStage,
    emoji: entry.emoji,
    headline: entry.headline,
    how: entry.how,
    input: entry.input,
    output: entry.output,
    steps: entry.steps,
    useWhen: entry.useWhen,
    workflow: { id: "", name: "", version: 1, nodes: [], edges: [] },
    source: "hub",
  }
}

export async function listTemplates(
  projectPath?: string,
): Promise<WorkflowTemplate[]> {
  const projectTemplateList = projectPath
    ? await listProjectTemplates(projectPath)
    : []
  const pluginTemplates = await listPluginTemplates()
  const hubEntries = getHubCatalog()

  // Dedup priority: project > builtin > plugin > hub
  const projectIds = new Set(projectTemplateList.map((t) => t.id))
  const localIds = new Set([
    ...projectIds,
    ...builtinTemplates.map((t) => t.id),
    ...pluginTemplates.map((t) => t.id),
  ])

  const filteredBuiltins = builtinTemplates.filter((t) => !projectIds.has(t.id))
  const filteredPlugins = pluginTemplates.filter((t) => !projectIds.has(t.id))
  const hubTemplates = hubEntries
    .filter((e) => !localIds.has(e.id))
    .map(catalogEntryToTemplate)

  return [
    ...projectTemplateList,
    ...filteredBuiltins,
    ...filteredPlugins,
    ...hubTemplates,
  ]
}
