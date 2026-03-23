import { ipcMain } from "electron"
import { errorMessage } from "../lib/error-utils"
import { mergeDiscoveredSkills } from "../lib/skill-scanner"
import { scanAllLibraries } from "../lib/libraries"
import {
  getCachedProjectSkills,
  invalidateProjectSkillScan,
} from "../lib/skill-scan-cache"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import { trackTelemetryEvent } from "../lib/telemetry/service"
import { summarizeMissingWorkflowSkillRefs } from "../lib/telemetry/workflow-usage"
import { logError, logInfo } from "../lib/structured-log"
import { writeFileAtomic } from "../lib/atomic-write"
import type { DiscoveredSkill, Workflow } from "@shared/types"
import { mkdir, readFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import {
  allowedSkillContentRoots,
  assertRegisteredProjectPath,
  assertWithinRoots,
} from "../lib/security-paths"
import { pathExists } from "../lib/fs-utils"

const scanInFlightByProject = new Map<string, Promise<DiscoveredSkill[]>>()

async function assertSkillContentPath(filePath: string): Promise<string> {
  const resolvedPath = resolve(filePath)
  const fileName = basename(resolvedPath)
  if (
    !fileName.toLowerCase().endsWith(".md") ||
    fileName.toLowerCase() === "readme.md"
  ) {
    throw new Error("Skill file path must reference a skill markdown file")
  }
  const roots = await allowedSkillContentRoots()
  return assertWithinRoots(resolvedPath, roots, "Skill file path")
}

export function registerSkillsHandlers() {
  ipcMain.handle(
    "skills:scan",
    async (_e, projectPath: string): Promise<DiscoveredSkill[]> => {
      const safeProjectPath = await assertRegisteredProjectPath(projectPath)
      const existingScan = scanInFlightByProject.get(safeProjectPath)
      if (existingScan) {
        logInfo("skills-ipc", "scan_reused_inflight", {
          projectPath: safeProjectPath,
        })
        void trackTelemetryEvent("skill_scan_completed", {
          source: "manual",
          status: "shared_inflight",
          deduped: true,
        })
        return existingScan
      }

      const startedAt = Date.now()
      const scanPromise = (async (): Promise<DiscoveredSkill[]> => {
        try {
          const [coreSkills, librarySkills] = await Promise.all([
            getCachedProjectSkills(safeProjectPath),
            scanAllLibraries(),
          ])

          const merged = mergeDiscoveredSkills([coreSkills, librarySkills])
          const projectSkillsTotal = coreSkills.filter(
            (skill) => skill.sourceScope === "project",
          ).length
          const userSkillsTotal = coreSkills.filter(
            (skill) => skill.sourceScope === "user",
          ).length
          const pluginSkillsTotal = coreSkills.filter(
            (skill) => skill.sourceScope === "plugin",
          ).length

          void trackTelemetryEvent("skill_scan_completed", {
            source: "manual",
            status: "success",
            deduped: false,
            project_skills_total: projectSkillsTotal,
            user_skills_total: userSkillsTotal,
            plugin_skills_total: pluginSkillsTotal,
            library_skills_total: librarySkills.length,
            merged_skills_total: merged.length,
            duration_ms: Date.now() - startedAt,
          })
          logInfo("skills-ipc", "scan_completed", {
            projectPath: safeProjectPath,
            projectSkillsTotal,
            userSkillsTotal,
            pluginSkillsTotal,
            librarySkillsTotal: librarySkills.length,
            mergedSkillsTotal: merged.length,
          })
          return merged
        } catch (error) {
          void trackTelemetryEvent("skill_scan_completed", {
            source: "manual",
            status: "failed",
            deduped: false,
            duration_ms: Date.now() - startedAt,
            error_kind: "scan_failed",
          })
          logError("skills-ipc", "scan_failed", {
            projectPath: safeProjectPath,
            error: errorMessage(error),
          })
          throw error
        }
      })()

      scanInFlightByProject.set(safeProjectPath, scanPromise)
      try {
        return await scanPromise
      } finally {
        if (scanInFlightByProject.get(safeProjectPath) === scanPromise) {
          scanInFlightByProject.delete(safeProjectPath)
        }
      }
    },
  )

  ipcMain.handle(
    "skills:scaffold",
    async (
      _e,
      workflow: Workflow,
      availableSkills: Pick<DiscoveredSkill, "name" | "category">[],
      projectPath: string,
    ): Promise<Workflow> => {
      const safeProjectPath = await assertRegisteredProjectPath(projectPath)
      const startedAt = Date.now()
      const before = summarizeMissingWorkflowSkillRefs(
        workflow,
        availableSkills,
      )

      try {
        const scaffoldedWorkflow = await scaffoldMissingSkills(
          workflow,
          availableSkills,
          safeProjectPath,
        )
        const after = summarizeMissingWorkflowSkillRefs(
          scaffoldedWorkflow,
          availableSkills,
        )
        void trackTelemetryEvent("skill_scaffold_completed", {
          source: "manual",
          status: "success",
          duration_ms: Date.now() - startedAt,
          skill_nodes_total: before.skillNodesTotal,
          available_skills_total: before.availableSkillsTotal,
          missing_refs_total: before.missingRefsTotal,
          missing_refs_unique: before.missingRefsUnique,
          missing_refs: before.missingRefsList,
          remaining_missing_refs_total: after.missingRefsTotal,
        })
        return scaffoldedWorkflow
      } catch (error) {
        void trackTelemetryEvent("skill_scaffold_completed", {
          source: "manual",
          status: "failed",
          duration_ms: Date.now() - startedAt,
          skill_nodes_total: before.skillNodesTotal,
          available_skills_total: before.availableSkillsTotal,
          missing_refs_total: before.missingRefsTotal,
          missing_refs_unique: before.missingRefsUnique,
          missing_refs: before.missingRefsList,
          error_kind: "scaffold_failed",
        })
        throw error
      }
    },
  )

  ipcMain.handle("skills:create-template", async (_e, projectPath: string) => {
    const safeProjectPath = await assertRegisteredProjectPath(projectPath)
    const skillsDir = join(safeProjectPath, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })

    const stem = "new-skill"
    let index = 1
    let filePath = join(skillsDir, `${stem}.md`)
    while (await pathExists(filePath)) {
      index += 1
      filePath = join(skillsDir, `${stem}-${index}.md`)
    }

    const title = `New Skill ${index === 1 ? "" : index}`.trim()
    const template = `---
name: ${title}
description: Describe what this skill should do.
---

# ${title}

## Purpose
Describe what this skill should do.

## Inputs
- Input type:
- Expected format:

## Output
- What to return:
- Quality bar:

## Instructions
1. Analyze the input.
2. Produce the output.
3. Keep it concise and actionable.
`

    await writeFileAtomic(filePath, template)
    invalidateProjectSkillScan(safeProjectPath)
    void trackTelemetryEvent("skill_template_created", {
      source: "manual",
      status: "success",
      template_index: index,
    })
    return filePath
  })

  ipcMain.handle(
    "skills:read-content",
    async (_e, filePath: string): Promise<string> => {
      const safeFilePath = await assertSkillContentPath(filePath)
      return readFile(safeFilePath, "utf-8")
    },
  )
}
