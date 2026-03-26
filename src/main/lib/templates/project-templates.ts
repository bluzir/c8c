import { access, readdir, readFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import type { WorkflowTemplate } from "@shared/types"
import { errorMessage } from "../error-utils"
import { logWarn } from "../structured-log"
import { parseTemplate } from "./parse"

const YAML_EXTENSIONS = new Set([".yaml", ".yml"])

export async function listProjectTemplates(
  projectPath: string,
): Promise<WorkflowTemplate[]> {
  const templatesDir = join(projectPath, ".c8c", "templates")

  try {
    await access(templatesDir)
  } catch {
    return []
  }

  let entries
  try {
    entries = await readdir(templatesDir, { withFileTypes: true })
  } catch (error) {
    logWarn("project-templates", "template_dir_read_failed", {
      dir: templatesDir,
      error: errorMessage(error),
    })
    return []
  }

  const templates: WorkflowTemplate[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) continue
    if (!YAML_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue

    const templatePath = join(templatesDir, entry.name)
    try {
      const raw = await readFile(templatePath, "utf-8")
      const parsed = parseTemplate(raw, {
        source: "project",
        templatePath,
      })
      const id = parsed.id || basename(templatePath, extname(templatePath))
      templates.push({ ...parsed, id })
    } catch (error) {
      logWarn("project-templates", "template_parse_failed", {
        templatePath,
        error: errorMessage(error),
      })
    }
  }

  return templates
}
