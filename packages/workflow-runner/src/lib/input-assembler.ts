import type { ChatRunHistory, InputAttachment } from "@shared/types"

export interface InputAssemblerDeps {
  readFileContent: (
    path: string,
    projectPath: string | null,
  ) => Promise<{ content: string; truncated: boolean }>
  loadRunResult: (
    workspace: string,
  ) => Promise<{ reportContent?: string } | null>
}

function renderChatRunHistory(history: ChatRunHistory): string {
  if (!history.runs.length) return ""
  const lines = history.runs.map((run) => {
    const summary = run.summary || "(no summary)"
    const artifacts = run.artifactIds.length
      ? ` (produced: ${run.artifactIds.join(", ")})`
      : ""
    return `**${run.templateName}**: "${run.userPrompt}"\n→ ${summary}${artifacts}`
  })
  return `## Prior context\n\n${lines.join("\n\n")}`
}

export async function assembleInputWithAttachments(
  baseValue: string,
  requestedResult: string,
  attachments: InputAttachment[],
  selectedProject: string | null,
  deps: InputAssemblerDeps,
  chatRunHistory?: ChatRunHistory,
): Promise<string> {
  // Dev-time guard: baseValue should never equal requestedResult — that means
  // metadata (template name / follow-up label) leaked into the content position.
  if (baseValue && baseValue === requestedResult && baseValue.length < 100) {
    console.warn(
      `[data-flow] baseValue equals requestedResult ("${baseValue.slice(0, 50)}") — possible metadata leak`,
    )
  }
  const normalizedRequestedResult = requestedResult.trim()
  const effectiveAttachments = normalizedRequestedResult
    ? attachments.filter(
        (attachment) =>
          !(
            attachment.kind === "text" &&
            attachment.label.trim().toLowerCase() === "requested result"
          ),
      )
    : attachments

  const hasHistory = chatRunHistory?.runs?.length
  if (effectiveAttachments.length === 0 && !normalizedRequestedResult && !hasHistory)
    return baseValue

  const sections = await Promise.all(
    effectiveAttachments.map(async (attachment) => {
      if (attachment.kind === "file") {
        if (!selectedProject) {
          return `## Attached File: ${attachment.name}\n\n[Cannot read file: no project selected]`
        }
        try {
          const result = await deps.readFileContent(
            attachment.path,
            selectedProject,
          )
          return `## Attached File: ${attachment.name}\nPath: ${attachment.path}\n\`\`\`\n${result.content}${result.truncated ? "\n[truncated]" : ""}\n\`\`\``
        } catch {
          return `## Attached File: ${attachment.name}\n\n[Could not read file]`
        }
      }

      if (attachment.kind === "run") {
        try {
          const result = await deps.loadRunResult(attachment.workspace)
          return `## Previous Run Output: ${attachment.workflowName}\nRun workspace: ${attachment.workspace}\n\n${result?.reportContent || "[No output available]"}`
        } catch {
          return `## Previous Run Output: ${attachment.workflowName}\n\n[Could not load run output]`
        }
      }

      return `## ${attachment.label}\n\n${attachment.content}`
    }),
  )

  const historySection = chatRunHistory
    ? renderChatRunHistory(chatRunHistory)
    : ""

  const contextSections = [
    normalizedRequestedResult
      ? `## Requested Result\n\n${normalizedRequestedResult}`
      : "",
    historySection,
    ...sections,
  ].filter(Boolean)

  if (contextSections.length === 0) return baseValue

  return [baseValue, "\n---\n# Context\n", ...contextSections].join("\n\n")
}
