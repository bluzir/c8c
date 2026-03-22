import { readFile, readdir, mkdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import YAML from "yaml"
import { listChainFiles } from "./chain-io"
import type { Workflow, WorkflowFile } from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"
import { resolveAppHomeDir } from "./runtime-paths"

function chainsDir(): string {
  return join(resolveAppHomeDir(), ".c8c", "chains")
}

export async function ensureChainsDir(): Promise<string> {
  const dir = chainsDir()
  await mkdir(dir, { recursive: true })
  return dir
}

function stripCanvasWorkflowFields(workflow: Workflow): Workflow {
  const { canvasLayout: _canvasLayout, ...rest } = workflow as Workflow & {
    canvasLayout?: unknown
  }
  return rest
}

export async function loadChainYaml(filePath: string): Promise<Workflow> {
  const content = await readFile(filePath, "utf-8")
  const parsed = YAML.parse(content) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid workflow YAML: expected an object")
  }
  const candidate = parsed as Record<string, unknown>
  const hasGraph = Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)
  if (!hasGraph) {
    throw new Error("Invalid workflow YAML: missing nodes or edges array")
  }
  return stripCanvasWorkflowFields(parsed as Workflow)
}

export async function saveChainYaml(
  filePath: string,
  workflow: Workflow,
): Promise<void> {
  const content = YAML.stringify(stripCanvasWorkflowFields(workflow), { lineWidth: 120 })
  await writeFileAtomic(filePath, content)
}

export async function listChains(dir?: string): Promise<WorkflowFile[]> {
  const targetDir = dir || chainsDir()
  try {
    await mkdir(targetDir, { recursive: true })
    const entries = await readdir(targetDir, { withFileTypes: true })
    const workflows = await Promise.all(
      entries
        .filter((e) => e.isFile() && (e.name.endsWith(".yaml") || e.name.endsWith(".yml")))
        .map(async (entry) => {
          const fullPath = join(targetDir, entry.name)
          const info = await stat(fullPath)
          return {
            name: basename(entry.name, entry.name.endsWith(".yaml") ? ".yaml" : ".yml"),
            path: fullPath,
            updatedAt: info.mtimeMs,
          }
        }),
    )
    return workflows
  } catch (error) {
    logWarn("yaml-io", "list_chains_failed", { dir: targetDir, error: String(error) })
    return []
  }
}

export async function listProjectWorkflows(
  projectPath: string,
): Promise<WorkflowFile[]> {
  // Look for workflows in project's .c8c/ dir and .claude/workflows/
  const dirs = [
    join(projectPath, ".c8c"),
    join(projectPath, ".claude", "workflows"),
  ]

  const results: WorkflowFile[] = []
  for (const dir of dirs) {
    const chainFiles = await listChainFiles(dir)
    const yamlFiles = await listChains(dir)
    results.push(...chainFiles, ...yamlFiles)
  }

  return results.sort((a, b) => {
    const aTime = a.updatedAt ?? 0
    const bTime = b.updatedAt ?? 0
    if (aTime !== bTime) return bTime - aTime
    return a.name.localeCompare(b.name)
  })
}
