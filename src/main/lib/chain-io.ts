import { readFile, readdir, mkdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import type { Workflow, WorkflowFile } from "@shared/types"
import { normalizeWorkflowTitle } from "@shared/workflow-name"
import { writeFileAtomic } from "./atomic-write"
import { logWarn } from "./structured-log"

export async function loadChain(filePath: string): Promise<Workflow> {
  const content = await readFile(filePath, "utf-8")
  return JSON.parse(content) as Workflow
}

export async function saveChain(
  filePath: string,
  workflow: Workflow,
): Promise<void> {
  const content = JSON.stringify(workflow, null, 2)
  await writeFileAtomic(filePath, content)
}

export async function listChainFiles(dir: string): Promise<WorkflowFile[]> {
  try {
    await mkdir(dir, { recursive: true })
    const entries = await readdir(dir, { withFileTypes: true })
    const workflows = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(".chain"))
        .map(async (entry) => {
          const fullPath = join(dir, entry.name)
          const info = await stat(fullPath)
          const fallbackName = basename(entry.name, ".chain")
          let workflowName = fallbackName
          try {
            const workflow = JSON.parse(
              await readFile(fullPath, "utf-8"),
            ) as Partial<Workflow>
            const normalizedName = normalizeWorkflowTitle(
              typeof workflow.name === "string" ? workflow.name : "",
            )
            if (normalizedName) {
              workflowName = normalizedName
            }
          } catch (error) {
            logWarn("chain-io", "read_workflow_name_failed", {
              filePath: fullPath,
              error: String(error),
            })
          }
          return {
            name: workflowName,
            path: fullPath,
            updatedAt: info.mtimeMs,
          }
        }),
    )
    return workflows
  } catch (error) {
    logWarn("chain-io", "list_chain_files_failed", {
      dir,
      error: String(error),
    })
    return []
  }
}
