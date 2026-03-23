import { getDefaultModelForProvider } from "@shared/provider-metadata"
import type { DiscoveredSkill, Workflow } from "@shared/types"
import { drainExecutionHandle } from "./agent-execution"
import { withExecutionSlot } from "./execution-pool"
import { LogParser } from "./log-parser"
import { prepareTemporaryMcpConfig } from "./mcp-config"
import {
  resolveWorkflowProviderId,
  startProviderTask,
} from "./provider-runtime"
import { scaffoldMissingSkills } from "./skill-scaffold"
import { logInfo } from "./structured-log"
import {
  buildGeneratorPrompt,
  buildWorkflowEditPrompt,
  parseGeneratedWorkflow,
} from "./workflow-generator"

type SynthMode = "create" | "edit"

type SkillInfo = Pick<DiscoveredSkill, "name" | "category" | "description">

interface WorkflowSynthesisOptions {
  projectPath: string
  availableSkills: SkillInfo[]
  seedWorkflow: Workflow
}

const SYNTHESIS_SYSTEM_PROMPT = [
  "You are a flow JSON generator.",
  "The user message describes the desired behavior of the flow, not a task for you to execute yourself.",
  "Output ONLY valid JSON for the flow.",
  "Do NOT invoke skills, do NOT read files, do NOT use tools.",
  "Generate or update the flow definition directly from the prompt and available skills list.",
].join(" ")

export async function synthesizeWorkflowFromRequest(
  mode: SynthMode,
  request: string,
  options: WorkflowSynthesisOptions,
): Promise<Workflow> {
  const prompt =
    mode === "edit"
      ? buildWorkflowEditPrompt(
          request,
          options.seedWorkflow,
          options.availableSkills,
        )
      : buildGeneratorPrompt(request, options.availableSkills)

  return runWorkflowSynthesis(mode, prompt, options)
}

async function runWorkflowSynthesis(
  mode: SynthMode,
  prompt: string,
  options: WorkflowSynthesisOptions,
): Promise<Workflow> {
  const providerId = await resolveWorkflowProviderId(options.seedWorkflow)
  const model = getDefaultModelForProvider(providerId)
  const logParser = new LogParser()
  const runtimeMcpConfig = await prepareTemporaryMcpConfig(options.projectPath)

  try {
    logInfo("workflow-synthesis", "started", {
      mode,
      providerId,
      projectPath: options.projectPath,
      requestLength: prompt.length,
    })

    const result = await withExecutionSlot(async () => {
      const handle = await startProviderTask(providerId, {
        workdir: options.projectPath,
        prompt,
        model,
        maxTurns: 120,
        systemPrompts: [SYNTHESIS_SYSTEM_PROMPT],
        mcpConfigPath: runtimeMcpConfig.path,
        disableBuiltInTools: providerId === "claude",
        disableSlashCommands: providerId === "claude",
        timeout: 300_000,
      })

      return drainExecutionHandle(handle, {
        onLogEntry: (entry) => {
          logParser.appendEntry(entry)
        },
        onUsage: (usage) => {
          logParser.applyUsage(usage)
        },
      })
    })

    logParser.flush()

    if (!result.success) {
      if (result.killed) {
        throw new Error("Flow generation timed out — try a tighter request")
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

    if (logParser.textContent.trim().length === 0) {
      const raw = logParser.rawOutput.trim()
      throw new Error(
        `Flow generation produced no text output: ${raw.slice(0, 200) || "empty response"}`,
      )
    }

    let workflow: Workflow
    try {
      workflow = parseGeneratedWorkflow(logParser.textContent)
    } catch (error) {
      const preview = logParser.textContent.slice(0, 300)
      throw new Error(
        `Could not parse flow JSON: ${(error as Error).message}\n\nResponse preview: ${preview}`,
      )
    }

    workflow = await scaffoldMissingSkills(
      workflow,
      options.availableSkills,
      options.projectPath,
    )

    logInfo("workflow-synthesis", "finished", {
      mode,
      providerId,
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
    })

    return workflow
  } finally {
    await runtimeMcpConfig.cleanup()
  }
}
