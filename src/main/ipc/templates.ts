import { ipcMain, BrowserWindow, type WebContents } from "electron"
import { listTemplates as listTemplateCatalog } from "../lib/templates"
import { refreshHubCatalog } from "../lib/templates/hub-catalog"
import { getHubTemplate } from "../lib/templates/hub-template-cache"
import { drainExecutionHandle } from "../lib/agent-execution"
import { LogParser } from "../lib/log-parser"
import {
  buildGeneratorPrompt,
  parseGeneratedWorkflow,
} from "../lib/workflow-generator"
import { scaffoldMissingSkills } from "../lib/skill-scaffold"
import {
  listPopularTemplateIdsForProject,
  recordProjectTemplateUsage,
} from "../lib/project-template-usage"
import { trackTelemetryEvent } from "../lib/telemetry/service"
import { summarizeMissingWorkflowSkillRefs } from "../lib/telemetry/workflow-usage"
import type {
  DiscoveredSkill,
  GenerationProgress,
  Workflow,
  WorkflowTemplate,
} from "@shared/types"
import { assertRegisteredProjectPath } from "../lib/security-paths"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import { saveChain } from "../lib/chain-io"
import { toWorkflowFileStem } from "@shared/workflow-name"
import { getDefaultModelForProvider } from "@shared/provider-metadata"
import { parseWorkflowPayload } from "@shared/workflow-payload"
import { logError, logInfo, logWarn } from "../lib/structured-log"
import { withExecutionSlot } from "../lib/execution-pool"
import { prepareTemporaryMcpConfig } from "../lib/mcp-config"
import { getProviderSettings } from "../lib/provider-settings"
import {
  applyProviderFeatureFlags,
  startProviderTask,
} from "../lib/provider-runtime"
import { inspectProjectForCreateEntry } from "../lib/create-entry-inspection"
import { routeCreateEntry } from "../lib/create-entry-router"
import { resolveAppHomeDir } from "../lib/runtime-paths"
import type {
  CreateEntryRouteInput,
  CreateEntryRouteResult,
} from "@shared/types"

const activeGenerateControllers = new Map<number, AbortController>()
const generateLifecycleBindings = new Set<number>()
let templateUsageMutationQueue: Promise<unknown> = Promise.resolve()
const MAX_GENERATION_STDERR_CHARS = 8_192

function runSerializedTemplateUsageMutation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const next = templateUsageMutationQueue.then(() => operation())
  templateUsageMutationQueue = next.catch(() => undefined)
  return next
}

function abortGenerationForSender(senderId: number): void {
  const controller = activeGenerateControllers.get(senderId)
  if (!controller) return
  controller.abort()
  activeGenerateControllers.delete(senderId)
}

function bindGenerateLifecycle(sender: WebContents): void {
  const senderId = sender.id
  if (generateLifecycleBindings.has(senderId)) return
  generateLifecycleBindings.add(senderId)

  const cleanup = () => {
    abortGenerationForSender(senderId)
    generateLifecycleBindings.delete(senderId)
  }

  sender.once("destroyed", cleanup)
  const window = BrowserWindow.fromWebContents(sender)
  window?.once("closed", cleanup)
}

async function resolveGenerateWorkdir(projectPath?: string): Promise<string> {
  if (!projectPath) return process.cwd()
  return assertRegisteredProjectPath(projectPath)
}

export function registerTemplateHandlers() {
  ipcMain.handle("templates:list", async (): Promise<WorkflowTemplate[]> => {
    return listTemplateCatalog()
  })

  ipcMain.handle(
    "templates:list-popular-project",
    async (
      _event,
      projectPath: string,
      limit = 5,
    ): Promise<WorkflowTemplate[]> => {
      const safeProjectPath = await resolveGenerateWorkdir(projectPath)
      const templates = await listTemplateCatalog()
      const popularIds = await listPopularTemplateIdsForProject(
        safeProjectPath,
        limit,
      )
      if (popularIds.length === 0) return []

      const templateById = new Map(
        templates.map((template) => [template.id, template]),
      )
      return popularIds
        .map((templateId) => templateById.get(templateId))
        .filter((template): template is WorkflowTemplate => Boolean(template))
    },
  )

  ipcMain.handle(
    "templates:record-usage",
    async (_event, projectPath: string, templateId: string): Promise<void> => {
      const safeProjectPath = await resolveGenerateWorkdir(projectPath)
      const isKnownTemplate = (await listTemplateCatalog()).some(
        (template) => template.id === templateId,
      )
      if (!isKnownTemplate) return
      await runSerializedTemplateUsageMutation(() =>
        recordProjectTemplateUsage(safeProjectPath, templateId),
      )
    },
  )

  ipcMain.handle(
    "templates:save-user",
    async (_event, name: string, workflow: Workflow): Promise<string> => {
      const dir = join(resolveAppHomeDir(), ".c8c", "user-templates")
      await mkdir(dir, { recursive: true })
      const stem = toWorkflowFileStem(name) || "template"
      const filePath = join(dir, `${stem}.chain`)
      const safeWorkflow = parseWorkflowPayload(
        workflow,
        "Workflow template payload",
      )
      await saveChain(filePath, { ...safeWorkflow, name })
      logInfo("templates-ipc", "user_template_saved", { name, filePath })
      return filePath
    },
  )

  ipcMain.handle(
    "templates:inspect-project",
    async (_event, projectPath: string) => {
      const safeProjectPath = await resolveGenerateWorkdir(projectPath)
      return inspectProjectForCreateEntry(safeProjectPath)
    },
  )

  ipcMain.handle(
    "templates:route-create-entry",
    async (
      _event,
      input: CreateEntryRouteInput,
    ): Promise<CreateEntryRouteResult> => {
      const safeProjectPath = await resolveGenerateWorkdir(input.projectPath)
      const templates = await listTemplateCatalog()
      const inspection = await inspectProjectForCreateEntry(safeProjectPath)
      return routeCreateEntry(
        {
          ...input,
          projectPath: safeProjectPath,
        },
        inspection,
        templates,
      )
    },
  )

  ipcMain.handle("templates:cancel-generate", async (event) => {
    const senderId = event.sender.id
    abortGenerationForSender(senderId)
    logInfo("templates-ipc", "generate_cancel_requested", { senderId })
  })

  ipcMain.handle(
    "templates:fetch-hub-template",
    async (_event, templateId: string) => {
      return getHubTemplate(templateId)
    },
  )

  ipcMain.handle("templates:refresh-catalog", async () => {
    await refreshHubCatalog()
  })

  ipcMain.handle(
    "templates:generate",
    async (
      event,
      description: string,
      availableSkills: Pick<
        DiscoveredSkill,
        "name" | "category" | "description"
      >[],
      projectPath?: string,
    ): Promise<Workflow> => {
      bindGenerateLifecycle(event.sender)
      const safeWorkdir = await resolveGenerateWorkdir(projectPath)
      const prompt = buildGeneratorPrompt(description, availableSkills)
      const logParser = new LogParser()
      const senderId = event.sender.id

      if (activeGenerateControllers.has(senderId)) {
        throw new Error("Flow generation is already in progress")
      }

      const controller = new AbortController()
      activeGenerateControllers.set(senderId, controller)
      const abortSignal = controller.signal

      const window = BrowserWindow.fromWebContents(event.sender)
      const sendProgress = (
        step: GenerationProgress["step"],
        count: number,
      ) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send("generate:progress", { step, count })
        }
      }

      let entryCount = 0
      let stderrOutput = ""
      sendProgress("starting", 0)
      let terminalProgressSent = false
      const sendTerminalProgress = (step: "done" | "error") => {
        if (terminalProgressSent) return
        terminalProgressSent = true
        sendProgress(step, entryCount)
      }

      try {
        const settings = await getProviderSettings()
        const providerId = applyProviderFeatureFlags(
          settings.defaultProvider,
          settings.features.codexProvider,
        )
        const model = getDefaultModelForProvider(providerId)
        const runtimeMcpConfig = await prepareTemporaryMcpConfig(projectPath)
        let result
        try {
          logInfo("templates-ipc", "generate_started", {
            senderId,
            projectPath: projectPath || null,
          })
          result = await withExecutionSlot(async (ticket) => {
            if (ticket.queueWaitMs > 0) {
              logInfo("templates-ipc", "generate_waited_for_execution_slot", {
                senderId,
                queueWaitMs: ticket.queueWaitMs,
              })
            }
            const handle = await startProviderTask(providerId, {
              workdir: safeWorkdir,
              prompt,
              model,
              maxTurns: 120,
              systemPrompts: [
                "You are a flow JSON generator. Output ONLY valid JSON. Do NOT invoke skills, do NOT read files, do NOT use tools. Generate the flow definition directly from the prompt and available skills list.",
              ],
              mcpConfigPath: runtimeMcpConfig.path,
              disableBuiltInTools: providerId === "claude",
              disableSlashCommands: providerId === "claude",
              timeout: 300_000,
              abortSignal,
            })
            return drainExecutionHandle(handle, {
              onLogEntry: (entry) => {
                logParser.appendEntry(entry)
                entryCount++
                if (entry.type === "thinking") {
                  sendProgress("thinking", entryCount)
                } else if (entry.type === "text") {
                  sendProgress("writing", entryCount)
                } else if (entry.type === "tool_use" && "tool" in entry) {
                  sendProgress(`using ${entry.tool}`, entryCount)
                }
              },
              onUsage: (usage) => {
                logParser.applyUsage(usage)
              },
              onStderr: (text) => {
                stderrOutput = (stderrOutput + text).slice(
                  -MAX_GENERATION_STDERR_CHARS,
                )
              },
            })
          })
        } catch (err) {
          const msg = String(err)
          if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
            throw new Error(
              "Flow generation timed out — try a simpler description",
            )
          }
          throw new Error(`${providerId} process failed: ${msg.slice(0, 200)}`)
        } finally {
          await runtimeMcpConfig.cleanup()
          if (activeGenerateControllers.get(senderId) === controller) {
            activeGenerateControllers.delete(senderId)
          }
        }

        logParser.flush()
        sendProgress("parsing", entryCount)

        logInfo("templates-ipc", "generate_finished", {
          senderId,
          success: result.success,
          exitCode: result.exitCode,
          killed: result.killed,
          aborted: result.aborted,
          entries: logParser.entries.length,
          textLength: logParser.textContent.length,
          stderrPreview: stderrOutput ? stderrOutput.slice(0, 500) : "",
        })

        if (!result.success) {
          if (result.killed) {
            throw new Error(
              "Flow generation timed out — try a simpler description",
            )
          }
          if (result.aborted) {
            throw new Error("Flow generation was cancelled")
          }
          const preview =
            logParser.textContent.trim() || logParser.rawOutput.slice(0, 200)
          throw new Error(
            `Flow generation failed (exit ${result.exitCode}): ${preview || "no output"}`,
          )
        }

        if (logParser.textContent.length === 0) {
          const raw = logParser.rawOutput.trim()
          if (raw.includes("max turns")) {
            throw new Error(
              "Claude ran out of turns before generating output — try a simpler description",
            )
          }
          throw new Error(
            `Claude produced no text output: ${raw.slice(0, 200) || "empty response"}`,
          )
        }

        let workflow: Workflow
        try {
          workflow = parseGeneratedWorkflow(logParser.textContent)
        } catch (err) {
          const preview = logParser.textContent.slice(0, 300)
          throw new Error(
            `Could not parse flow from AI response: ${(err as Error).message}\n\nResponse preview: ${preview}`,
          )
        }

        if (projectPath) {
          const startedAt = Date.now()
          const before = summarizeMissingWorkflowSkillRefs(
            workflow,
            availableSkills,
          )
          try {
            workflow = await scaffoldMissingSkills(
              workflow,
              availableSkills,
              safeWorkdir,
            )
            const after = summarizeMissingWorkflowSkillRefs(
              workflow,
              availableSkills,
            )
            void trackTelemetryEvent("skill_scaffold_completed", {
              source: "template_generate",
              status: "success",
              duration_ms: Date.now() - startedAt,
              skill_nodes_total: before.skillNodesTotal,
              available_skills_total: before.availableSkillsTotal,
              missing_refs_total: before.missingRefsTotal,
              missing_refs_unique: before.missingRefsUnique,
              missing_refs: before.missingRefsList,
              remaining_missing_refs_total: after.missingRefsTotal,
            })
          } catch (error) {
            void trackTelemetryEvent("skill_scaffold_completed", {
              source: "template_generate",
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
        }

        sendTerminalProgress("done")
        return workflow
      } catch (error) {
        if (String(error).toLowerCase().includes("cancelled")) {
          logWarn("templates-ipc", "generate_cancelled", {
            senderId,
            error: String(error),
          })
        } else {
          logError("templates-ipc", "generate_failed", {
            senderId,
            error: String(error),
          })
        }
        sendTerminalProgress("error")
        throw error
      }
    },
  )
}
