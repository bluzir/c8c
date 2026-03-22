import type { ResultModeId, WorkflowFile } from "@shared/types"
import type { DesktopCommandId, DesktopMenuState } from "@shared/desktop-commands"
import type { WorkflowExecutionState } from "@/lib/workflow-execution"
import type { OutputSurfaceCommandState } from "@/lib/output-surface-commands"
import { formatRelativeTime, projectFolderName, workflowHasActiveRunStatus } from "@/components/sidebar/projectSidebarUtils"

export type AppShellCommandAction =
  | "new_process"
  | "add_project"
  | "runs_dashboard"
  | "process_library"
  | "lab"
  | "skills"
  | "attach_skill"
  | "inbox"
  | "settings"
  | "output_view_result"
  | "output_view_activity"
  | "output_view_log"
  | "output_view_history"
  | "output_rerun_from_step"
  | "output_use_in_new_flow"

export interface AppShellActionEntry {
  kind: "action"
  id: string
  action: AppShellCommandAction
  label: string
  keywords: string[]
  subtitle?: string
}

export interface AppShellWorkflowEntry {
  kind: "workflow"
  id: string
  workflowPath: string
  projectPath: string
  label: string
  projectLabel: string
  metaLabel: string
  active: boolean
  updatedAt: number
  keywords: string[]
}

export interface AppShellStartEntry {
  kind: "start"
  id: string
  label: string
  subtitle: string
  prompt: string
  modeId?: ResultModeId
  projectPath: string | null
  projectLabel: string | null
  requiresProjectSelection: boolean
  keywords: string[]
}

export interface AppShellProjectEntry {
  kind: "project"
  id: string
  projectPath: string
  label: string
  subtitle?: string
  selected: boolean
  keywords: string[]
}

export interface AppShellDesktopCommandEntry {
  kind: "desktop_command"
  id: string
  commandId: DesktopCommandId
  label: string
  subtitle?: string
  keywords: string[]
}

export type AppShellCommandEntry =
  | AppShellActionEntry
  | AppShellWorkflowEntry
  | AppShellStartEntry
  | AppShellProjectEntry
  | AppShellDesktopCommandEntry

export interface AppShellCommandSection {
  id: string
  label: string
  entries: AppShellCommandEntry[]
}

const EMPTY_OPEN_RECENT_LIMIT = 8
const SEARCH_CURRENT_PROJECT_LIMIT = 5
const SEARCH_OTHER_PROJECT_LIMIT = 5
const SEARCH_PROJECT_LIMIT = 6
const SEARCH_ACTION_LIMIT = 4
const SEARCH_DESKTOP_COMMAND_LIMIT = 6

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function toSearchText(value: string) {
  return normalize(value).replace(/[^a-z0-9а-яё]+/gi, " ").replace(/\s+/g, " ").trim()
}

function truncateLabel(value: string, maxLength = 48) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

function formatStartLabel(prompt: string) {
  const promptLabel = truncateLabel(prompt)
  return `Start: ${promptLabel}`
}

function formatStartSubtitle(
  projectLabel: string | null,
  requiresProjectAdd: boolean,
  requiresProjectSelection: boolean,
) {
  if (requiresProjectAdd) {
    return "Open the guided start and add a project first."
  }
  if (requiresProjectSelection) {
    return "Open the guided start and choose the target project."
  }
  return `Open the guided start${projectLabel ? ` in ${projectLabel}` : ""}. The system will choose the right path after submit.`
}

function actionEntry(
  action: AppShellCommandAction,
  label: string,
  keywords: string[],
  subtitle?: string,
): AppShellActionEntry {
  return {
    kind: "action",
    id: `action:${action}`,
    action,
    label,
    keywords,
    subtitle,
  }
}

function desktopCommandEntry(
  commandId: DesktopCommandId,
  label: string,
  keywords: string[],
  subtitle?: string,
): AppShellDesktopCommandEntry {
  return {
    kind: "desktop_command",
    id: `desktop-command:${commandId}`,
    commandId,
    label,
    subtitle,
    keywords,
  }
}

export function buildAppShellActionEntries({
  includeLab = false,
}: {
  includeLab?: boolean
} = {}): AppShellActionEntry[] {
  return [
    actionEntry("new_process", "New flow", ["new", "create", "start", "flow", "process"], "Create a flow in your project"),
    actionEntry("add_project", "Add project", ["add", "project", "folder", "workspace"], "Open a project folder"),
    actionEntry("runs_dashboard", "Runs dashboard", ["runs", "dashboard", "triage", "activity", "background"], "Triage active and recent flows"),
    actionEntry("process_library", "Starting points", ["library", "template", "starting point", "flow", "process"], "Browse guided starts and templates"),
    ...(includeLab
      ? [actionEntry("lab", "Lab", ["lab", "factory", "cases", "outcome"], "Open the lab workspace for reusable outcomes")]
      : []),
    actionEntry("skills", "Skills", ["skills", "tools", "capabilities"], "Open connected skills and local sources"),
    actionEntry("attach_skill", "Attach skill", ["attach", "add", "skill", "tool", "step"], "Open the skill picker for the current flow"),
    actionEntry("inbox", "Inbox", ["inbox", "approval", "tasks", "notifications"], "View approvals and pending tasks"),
    actionEntry("settings", "Settings", ["settings", "preferences", "configuration"], "Configure providers and defaults"),
  ]
}

export function buildOutputSurfaceActionEntries(state: OutputSurfaceCommandState): AppShellActionEntry[] {
  const entries: AppShellActionEntry[] = []

  if (state.result) {
    entries.push(actionEntry("output_view_result", "View result", ["result", "answer", "final output"], "Open the result surface"))
  }
  if (state.activity) {
    entries.push(actionEntry("output_view_activity", "View summary", ["summary", "activity", "steps", "run status"], "Open the run summary surface"))
  }
  if (state.log) {
    entries.push(actionEntry("output_view_log", "View step log", ["log", "trace", "step log"], "Open the detailed log for the selected step"))
  }
  if (state.history) {
    entries.push(actionEntry("output_view_history", "View run history", ["history", "past runs", "saved runs"], "Open saved run history"))
  }
  if (state.rerunFromStep) {
    entries.push(actionEntry("output_rerun_from_step", "Rerun from this step", ["rerun", "retry", "step"], "Start a new run from the selected step"))
  }
  if (state.useInNewFlow) {
    entries.push(actionEntry("output_use_in_new_flow", "Continue with Agent", ["new flow", "handoff", "continue elsewhere", "agent"], "Start the next flow from this result"))
  }

  return entries
}

export function buildDesktopCommandEntries(state: DesktopMenuState): AppShellDesktopCommandEntry[] {
  const entries: AppShellDesktopCommandEntry[] = []

  if (state.file.save.enabled) {
    entries.push(desktopCommandEntry("file.save", "Save flow", ["save", "file", "flow"], "Save the current flow"))
  }
  if (state.file.saveAs.enabled) {
    entries.push(desktopCommandEntry("file.save_as", "Save flow as...", ["save as", "duplicate", "file"], "Save to a new file"))
  }
  if (state.file.export.enabled) {
    entries.push(desktopCommandEntry("file.export", "Export flow copy", ["export", "copy", "file"], "Export a reusable copy"))
  }
  if (state.file.import.enabled) {
    entries.push(desktopCommandEntry("file.import", "Import flow...", ["import", "open", "file"], "Open a flow file as a draft"))
  }
  if (state.edit.undo.enabled) {
    entries.push(desktopCommandEntry("edit.undo", "Undo", ["undo", "revert"], "Undo the latest workflow edit"))
  }
  if (state.edit.redo.enabled) {
    entries.push(desktopCommandEntry("edit.redo", "Redo", ["redo", "restore"], "Redo the latest workflow edit"))
  }
  if (state.view.defaults.enabled) {
    entries.push(desktopCommandEntry("view.defaults", "Flow defaults", ["defaults", "settings", "view"], "Open flow defaults"))
  }
  if (state.view.editFlow.enabled) {
    entries.push(desktopCommandEntry("view.edit_flow", "Edit flow", ["edit", "flow", "outline"], "Open the editable flow outline"))
  }
  if (state.view.toggleAgentPanel.enabled) {
    entries.push(desktopCommandEntry("view.toggle_agent_panel", state.view.toggleAgentPanel.checked ? "Hide agent panel" : "Show agent panel", ["agent", "chat", "panel"], "Toggle the agent side panel"))
  }
  if ((state.flow.run.visible ?? true) && state.flow.run.enabled) {
    entries.push(desktopCommandEntry("flow.run", "Run flow", ["run", "start", "execute"], "Run the current flow"))
  }
  if (state.flow.runAgain.enabled) {
    entries.push(desktopCommandEntry("flow.run_again", "Run again", ["run again", "retry", "new run"], "Start a new run from the previous input"))
  }
  if ((state.flow.cancel.visible ?? true) && state.flow.cancel.enabled) {
    entries.push(desktopCommandEntry("flow.cancel", "Cancel run", ["cancel", "stop", "abort"], "Stop the current run"))
  }
  if (state.flow.batchRun.enabled) {
    entries.push(desktopCommandEntry("flow.batch_run", "Batch run", ["batch", "multiple", "run"], "Run this flow across many inputs"))
  }
  if (state.flow.history.enabled) {
    entries.push(desktopCommandEntry("flow.history", "Run history", ["history", "past runs", "review"], "Open saved run history"))
  }

  return entries
}

export function buildAppShellWorkflowEntries({
  projects,
  selectedProject,
  projectWorkflowsCache,
  workflowExecutionStates,
}: {
  projects: string[]
  selectedProject: string | null
  projectWorkflowsCache: Record<string, WorkflowFile[]>
  workflowExecutionStates: Record<string, WorkflowExecutionState>
}): AppShellWorkflowEntry[] {
  const entries: AppShellWorkflowEntry[] = []
  const seen = new Set<string>()

  for (const projectPath of projects) {
    const workflows = projectWorkflowsCache[projectPath] || []
    const projectLabel = projectFolderName(projectPath)

    for (const workflow of workflows) {
      if (seen.has(workflow.path)) continue
      seen.add(workflow.path)

      const executionState = workflowExecutionStates[workflow.path]
      const active = workflowHasActiveRunStatus(executionState?.runStatus)
      entries.push({
        kind: "workflow",
        id: `workflow:${workflow.path}`,
        workflowPath: workflow.path,
        projectPath,
        label: workflow.name,
        projectLabel,
        metaLabel: active ? "Active" : formatRelativeTime(workflow.updatedAt),
        active,
        updatedAt: workflow.updatedAt ?? 0,
        keywords: [
          workflow.name,
          projectLabel,
          toSearchText(workflow.name),
          toSearchText(projectLabel),
        ].map((value) => value.toLowerCase()),
      })
    }
  }

  return entries.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1
    const leftSelected = left.projectPath === selectedProject
    const rightSelected = right.projectPath === selectedProject
    if (leftSelected !== rightSelected) return leftSelected ? -1 : 1
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
    return left.label.localeCompare(right.label)
  })
}

function filterActionEntries(
  entries: AppShellActionEntry[],
  query: string,
): AppShellActionEntry[] {
  const normalizedQuery = normalize(query)
  const normalizedSearchQuery = toSearchText(query)
  if (!normalizedQuery) return entries

  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(normalizedQuery)) return true
    if (normalizedSearchQuery && toSearchText(entry.label).includes(normalizedSearchQuery)) return true
    return entry.keywords.some((keyword) => keyword.includes(normalizedQuery) || keyword.includes(normalizedSearchQuery))
  })
}

function filterWorkflowEntries(
  entries: AppShellWorkflowEntry[],
  query: string,
): AppShellWorkflowEntry[] {
  const normalizedQuery = normalize(query)
  const normalizedSearchQuery = toSearchText(query)
  if (!normalizedQuery) return entries

  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(normalizedQuery)) return true
    if (entry.projectLabel.toLowerCase().includes(normalizedQuery)) return true
    if (normalizedSearchQuery && toSearchText(entry.label).includes(normalizedSearchQuery)) return true
    return entry.keywords.some((keyword) => keyword.includes(normalizedQuery) || keyword.includes(normalizedSearchQuery))
  })
}

export function buildAppShellStartEntry({
  query,
  selectedProject,
  projects,
}: {
  query: string
  selectedProject: string | null
  projects: string[]
}): AppShellStartEntry | null {
  const prompt = query.trim()
  if (!prompt) return null

  const projectPath = selectedProject
  const projectLabel = projectPath ? projectFolderName(projectPath) : null
  const requiresProjectAdd = !projectPath && projects.length === 0
  const requiresProjectSelection = !projectPath && projects.length > 1
  const promptLabel = truncateLabel(prompt)

  return {
    kind: "start",
    id: `start:${prompt.toLowerCase()}`,
    label: requiresProjectAdd
      ? `Add project to start “${promptLabel}”`
      : requiresProjectSelection
      ? `Choose project for “${promptLabel}”`
      : formatStartLabel(prompt),
    subtitle: formatStartSubtitle(projectLabel, requiresProjectAdd, requiresProjectSelection),
    prompt,
    projectPath,
    projectLabel,
    requiresProjectSelection,
    keywords: [prompt.toLowerCase(), "start new", "new flow", "new process"],
  }
}

export function buildAppShellProjectEntries({
  projects,
  selectedProject,
}: {
  projects: string[]
  selectedProject: string | null
}): AppShellProjectEntry[] {
  const entries = projects.map((projectPath): AppShellProjectEntry => {
    const label = projectFolderName(projectPath)
    const selected = projectPath === selectedProject
    return {
      kind: "project",
      id: `project:${projectPath}`,
      projectPath,
      label,
      subtitle: selected ? "Current project" : "Switch project",
      selected,
      keywords: [
        normalize(label),
        toSearchText(label),
        normalize(projectPath),
      ],
    }
  })

  return entries.sort((left, right) => {
    if (left.selected !== right.selected) return left.selected ? -1 : 1
    return left.label.localeCompare(right.label)
  })
}

function filterProjectEntries(
  entries: AppShellProjectEntry[],
  query: string,
): AppShellProjectEntry[] {
  const normalizedQuery = normalize(query)
  const normalizedSearchQuery = toSearchText(query)
  if (!normalizedQuery) return entries

  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(normalizedQuery)) return true
    if (normalizedSearchQuery && toSearchText(entry.label).includes(normalizedSearchQuery)) return true
    return entry.keywords.some((keyword) => keyword.includes(normalizedQuery) || keyword.includes(normalizedSearchQuery))
  })
}

function filterDesktopCommandEntries(
  entries: AppShellDesktopCommandEntry[],
  query: string,
): AppShellDesktopCommandEntry[] {
  const normalizedQuery = normalize(query)
  const normalizedSearchQuery = toSearchText(query)
  if (!normalizedQuery) return entries

  return entries.filter((entry) => {
    if (entry.label.toLowerCase().includes(normalizedQuery)) return true
    if (normalizedSearchQuery && toSearchText(entry.label).includes(normalizedSearchQuery)) return true
    return entry.keywords.some((keyword) => keyword.includes(normalizedQuery) || keyword.includes(normalizedSearchQuery))
  })
}

export function buildAppShellCommandSections({
  query,
  actions,
  desktopCommands,
  workflows,
  projectEntries,
  selectedProject,
  projects,
}: {
  query: string
  actions: AppShellActionEntry[]
  desktopCommands: AppShellDesktopCommandEntry[]
  workflows: AppShellWorkflowEntry[]
  projectEntries: AppShellProjectEntry[]
  selectedProject: string | null
  projects: string[]
}): AppShellCommandSection[] {
  const normalizedQuery = normalize(query)

  if (!normalizedQuery) {
    const createActions = actions.filter((entry) =>
      entry.action === "new_process"
      || entry.action === "add_project"
      || entry.action === "process_library"
      || entry.action === "attach_skill")
    const outputActions = actions.filter((entry) =>
      entry.action === "output_view_result"
      || entry.action === "output_view_activity"
      || entry.action === "output_view_log"
      || entry.action === "output_view_history"
      || entry.action === "output_rerun_from_step"
      || entry.action === "output_use_in_new_flow")
    const navigateActions = actions.filter((entry) => entry.action === "runs_dashboard" || entry.action === "lab" || entry.action === "skills" || entry.action === "inbox" || entry.action === "settings")
    const flowActions = desktopCommands.slice(0, 5)
    const recentWorkflows = workflows.slice(0, EMPTY_OPEN_RECENT_LIMIT)
    const switchProjects = projectEntries.filter((entry) => !entry.selected).slice(0, 5)

    const sections: AppShellCommandSection[] = []
    if (createActions.length > 0) sections.push({ id: "create", label: "Start", entries: createActions })
    if (outputActions.length > 0) sections.push({ id: "output", label: "Current output", entries: outputActions })
    if (flowActions.length > 0) sections.push({ id: "flow_actions", label: "Flow actions", entries: flowActions })
    if (recentWorkflows.length > 0) sections.push({ id: "recent", label: "Open recent", entries: recentWorkflows })
    if (switchProjects.length > 0) sections.push({ id: "projects", label: "Switch project", entries: switchProjects })
    if (navigateActions.length > 0) sections.push({ id: "navigate", label: "Navigate", entries: navigateActions })
    return sections
  }

  const filteredActions = filterActionEntries(actions, query).slice(0, SEARCH_ACTION_LIMIT)
  const filteredDesktopCommands = filterDesktopCommandEntries(desktopCommands, query).slice(0, SEARCH_DESKTOP_COMMAND_LIMIT)
  const filteredWorkflows = filterWorkflowEntries(workflows, query)
  const filteredProjects = filterProjectEntries(projectEntries, query)
    .filter((entry) => !entry.selected)
    .slice(0, SEARCH_PROJECT_LIMIT)
  const currentProjectMatches = filteredWorkflows
    .filter((entry) => entry.projectPath === selectedProject)
    .slice(0, SEARCH_CURRENT_PROJECT_LIMIT)
  const otherProjectMatches = filteredWorkflows
    .filter((entry) => entry.projectPath !== selectedProject)
    .slice(0, SEARCH_OTHER_PROJECT_LIMIT)

  const startEntry = buildAppShellStartEntry({ query, selectedProject, projects })

  const sections: AppShellCommandSection[] = []
  if (filteredProjects.length > 0) sections.push({ id: "projects", label: "Switch project", entries: filteredProjects })
  if (currentProjectMatches.length > 0) sections.push({ id: "current_project", label: "Open in current project", entries: currentProjectMatches })
  if (otherProjectMatches.length > 0) sections.push({ id: "other_projects", label: "Open in other projects", entries: otherProjectMatches })
  if (filteredDesktopCommands.length > 0) sections.push({ id: "desktop_commands", label: "Flow actions", entries: filteredDesktopCommands })
  if (filteredActions.length > 0) sections.push({ id: "actions", label: "Actions", entries: filteredActions })
  if (startEntry) sections.push({ id: "start_new", label: "Start new", entries: [startEntry] })
  return sections
}
