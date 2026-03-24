import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import {
  createDefaultDesktopMenuState,
  type DesktopMenuState,
} from "@shared/desktop-commands"
import {
  createDefaultOutputSurfaceCommandState,
  type OutputSurfaceCommandState,
} from "@/lib/output-surface-commands"
import { SIDEBAR_DEFAULT_WIDTH } from "@/lib/sidebar-layout"
import type { TemplateLibraryContextState } from "./template-library-context"
import {
  EMPTY_WORKFLOW_CREATE_SCAFFOLD,
  type WorkflowCreatePromptScaffold,
} from "./workflow-create-prompt"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { toWorkflowExecutionKey } from "./workflow-execution"
import { DEFAULT_DETAIL_BUDGET } from "./workflow-detail-budget"
import type {
  BatchItemResult,
  ArtifactRecord,
  BatchSummary,
  ChatMessage,
  Workflow,
  DiscoveredSkill,
  InputAttachment,
  McpServerInfo,
  McpToolInfo,
  SkillLibrary,
  WorkflowFile,
  WorkflowTemplate,
  DesktopRuntimeInfo,
  DesktopPlatform,
  ProviderAuthStatus,
  ProviderHealth,
  ProviderId,
  ProviderSettings,
  ResultModeId,
  RunResult,
  SafetyProfile,
} from "@shared/types"
import type { WebSearchBackend } from "./web-search-backend"
import type {
  WorkflowEntryState,
  WorkflowTemplateRunContext,
} from "./workflow-entry"

// Re-export shared types for convenience
export type {
  ChatMessage,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeState,
  LogEntry,
  WorkflowEvent,
  NodeInput,
  InputAttachment,
  InputNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  WorkflowInput,
  DiscoveredSkill,
  SkillLibrary,
  BatchItemResult,
  BatchSummary,
  WorkflowFile,
  WorkflowTemplate,
  WorkflowRuntimeMeta,
  GenerationProgress,
  RunResult,
  DesktopRuntimeInfo,
  DesktopPlatform,
} from "@shared/types"
export {
  DRAFT_WORKFLOW_EXECUTION_KEY,
  createEmptyWorkflowExecutionState,
  toWorkflowExecutionKey,
} from "./workflow-execution"
export type {
  ApprovalRequest,
  EvaluationResult,
  EvalCriterion,
  ExecutionRunStatus,
  WorkflowExecutionState,
} from "./workflow-execution"

// ── Local Types ──────────────────────────────────────────

function inferDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "macos"
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || navigator.platform || ""
  const normalized = platform.toLowerCase()
  if (normalized.includes("mac")) return "macos"
  if (normalized.includes("win")) return "windows"
  return "linux"
}

function defaultDesktopRuntime(): DesktopRuntimeInfo {
  const platform = inferDesktopPlatform()
  const isMac = platform === "macos"
  return {
    platform,
    titlebarHeight: isMac ? 24 : 0,
    primaryModifierKey: isMac ? "meta" : "ctrl",
    primaryModifierLabel: isMac ? "⌘" : "Ctrl",
    isFullscreen: false,
    isMaximized: false,
  }
}

// ── Atoms ────────────────────────────────────────────────

// Project management
export const projectsAtom = atom<string[]>([])
export const selectedProjectAtom = atomWithStorage<string | null>(
  "c8c:selected-project",
  null,
)
export const expandedProjectsAtom = atomWithStorage<string[]>(
  "c8c:expanded-projects",
  [],
)
export const workflowsAtom = atom<WorkflowFile[]>([])
export const projectWorkflowsCacheAtom = atom<Record<string, WorkflowFile[]>>(
  {},
)
export const projectLatestRunsCacheAtom = atom<
  Record<string, Record<string, RunResult>>
>({})
export const projectWorkflowsLoadingAtom = atom<Record<string, boolean>>({})
export const workflowSidebarSeenRunIdsAtom = atomWithStorage<
  Record<string, string>
>("c8c:workflow-sidebar-seen-run-ids", {})
export const markWorkflowSidebarRunSeenAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      workflowPath: string | null | undefined
      runId: string | null | undefined
    },
  ) => {
    const workflowPath = payload.workflowPath?.trim()
    const runId = payload.runId?.trim()
    if (!workflowPath || !runId) return
    const existing = get(workflowSidebarSeenRunIdsAtom)
    if (existing[workflowPath] === runId) return
    set(workflowSidebarSeenRunIdsAtom, {
      ...existing,
      [workflowPath]: runId,
    })
  },
)
export const selectedWorkflowPathAtom = atomWithStorage<string | null>(
  "c8c:selectedWorkflowPath",
  null,
)
export const projectSidebarWidthAtom = atomWithStorage<number>(
  "c8c:sidebar-width",
  SIDEBAR_DEFAULT_WIDTH,
)
export const projectSidebarOpenAtom = atomWithStorage<boolean>(
  "c8c:sidebar-open",
  true,
)

// Active workflow
export const currentWorkflowAtom = atom<Workflow>({
  version: 1,
  name: "",
  description: "",
  defaults: {
    model: "sonnet",
    maxTurns: 120,
    timeout_minutes: 30,
    maxParallel: 8,
  },
  nodes: [],
  edges: [],
})
export const workflowSavedSnapshotAtom = atom(
  workflowSnapshot({
    version: 1,
    name: "",
    description: "",
    defaults: {
      model: "sonnet",
      maxTurns: 120,
      timeout_minutes: 30,
      maxParallel: 8,
    },
    nodes: [],
    edges: [],
  }),
)
export const workflowDirtyAtom = atom((get) => {
  const selectedWorkflowPath = get(selectedWorkflowPathAtom)
  const workflow = get(currentWorkflowAtom)
  const hasMeaningfulContent = workflowHasMeaningfulContent(workflow)
  if (!selectedWorkflowPath && !hasMeaningfulContent) return false
  return workflowSnapshot(workflow) !== get(workflowSavedSnapshotAtom)
})

// Skills
export const skillsAtom = atom<DiscoveredSkill[]>([])
export const skillPickerOpenAtom = atom(false)
export interface SkillPickerRequest {
  onAddSkill?: (skill: DiscoveredSkill) => void
  title?: string
  description?: string
  searchPlaceholder?: string
  emptyStateMessage?: string
  emptyResultsMessage?: (query: string) => string
  stageLabel?: string | null
  attachTargetLabel?: string
}
export const skillPickerRequestAtom = atom<SkillPickerRequest | null>(null)
export const openSkillPickerAtom = atom(
  null,
  (_get, set, request?: SkillPickerRequest | null) => {
    set(skillPickerRequestAtom, request ?? null)
    set(skillPickerOpenAtom, true)
  },
)
export const closeSkillPickerAtom = atom(null, (_get, set) => {
  set(skillPickerOpenAtom, false)
  set(skillPickerRequestAtom, null)
})
export const librariesAtom = atom<SkillLibrary[]>([])

// Validation
export interface ValidationError {
  nodeId: string
  field: string
  message: string
  severity: "error" | "warning"
}
export const validationErrorsAtom = atom<Record<string, ValidationError[]>>({})
export interface ValidationNavigationTarget {
  nodeId: string | null
  fieldId: string
  requestId: number
}
export const validationNavigationTargetAtom =
  atom<ValidationNavigationTarget | null>(null)

// Input
export const inputValueAtom = atom("")
export const inputAttachmentsAtom = atom<InputAttachment[]>([])
export const selectedNodeIdAtom = atom<string | null>(null)

// Desktop runtime
export const desktopRuntimeAtom = atom<DesktopRuntimeInfo>(
  defaultDesktopRuntime(),
)
export const desktopMenuStateAtom = atom<DesktopMenuState>(
  createDefaultDesktopMenuState(),
)
export const outputSurfaceCommandStateAtom = atom<OutputSurfaceCommandState>(
  createDefaultOutputSurfaceCommandState(),
)

// Global execution defaults (applied to new/generated workflows)
export const globalExecutionDefaultsAtom = atomWithStorage<{
  model: string
  maxTurns: number
  timeout_minutes: number
  maxParallel: number
}>("c8c:global-execution-defaults", {
  model: "sonnet",
  maxTurns: 120,
  timeout_minutes: 30,
  maxParallel: 8,
})
export const globalDetailBudgetAtom = atomWithStorage<number>(
  "c8c:global-detail-budget",
  DEFAULT_DETAIL_BUDGET,
)

export const providerSettingsAtom = atom<ProviderSettings>({
  defaultProvider: "claude",
  safetyProfile: "workspace_auto",
  features: {
    codexProvider: true,
  },
})
export const defaultProviderAtom = atom(
  (get) => get(providerSettingsAtom).defaultProvider,
  (get, set, next: ProviderId) => {
    set(providerSettingsAtom, {
      ...get(providerSettingsAtom),
      defaultProvider: next,
    })
  },
)
export const safetyProfileAtom = atom(
  (get) => get(providerSettingsAtom).safetyProfile,
  (get, set, next: SafetyProfile) => {
    set(providerSettingsAtom, {
      ...get(providerSettingsAtom),
      safetyProfile: next,
    })
  },
)
export const providerAvailabilityAtom = atom<
  Record<ProviderId, ProviderHealth | null>
>({
  claude: null,
  codex: null,
})
export const providerAuthStatusAtom = atom<
  Record<ProviderId, ProviderAuthStatus | null>
>({
  claude: null,
  codex: null,
})
export const activeExecutionProviderAtom = atom<ProviderId>("claude")

export const factoryBetaEnabledAtom = atomWithStorage<boolean>(
  "c8c:factory-beta-enabled",
  false,
)

// Research web-search backend preference
export const webSearchBackendAtom = atomWithStorage<WebSearchBackend>(
  "c8c:web-search-backend",
  "builtin",
)

// Provider setup banner
export const providerSetupBannerDismissedKeyAtom = atom<string | null>(null)

// View mode
export type ViewMode = "chat" | "list" | "settings"
type LegacyStoredViewMode = ViewMode | "canvas"

function sanitizeViewMode(value: unknown): ViewMode {
  if (value === "settings") return "settings"
  if (value === "list") return "list"
  return "chat"
}

const viewModeStorageAtom = atomWithStorage<LegacyStoredViewMode>(
  "c8c:view-mode",
  "chat",
)
export const viewModeAtom = atom(
  (get) => sanitizeViewMode(get(viewModeStorageAtom)),
  (_get, set, next: ViewMode) => {
    set(viewModeStorageAtom, sanitizeViewMode(next))
  },
)
export type FlowSurfaceMode = "outline" | "edit"
export const flowSurfaceModeAtom = atom<FlowSurfaceMode>("outline")
export const workflowReviewModeAtom = atom(false)
export const workflowSavedRunReviewRequestedByKeyAtom = atomWithStorage<
  Record<string, boolean>
>("c8c:workflow-saved-run-review", {})
export const selectedWorkflowSavedRunReviewRequestedAtom = atom(
  (get) =>
    Boolean(
      get(workflowSavedRunReviewRequestedByKeyAtom)[
        toWorkflowExecutionKey(get(selectedWorkflowPathAtom))
      ],
    ),
  (get, set, requested: boolean) => {
    const key = toWorkflowExecutionKey(get(selectedWorkflowPathAtom))
    const stored = get(workflowSavedRunReviewRequestedByKeyAtom)
    if (!requested) {
      if (!(key in stored)) return
      const next = { ...stored }
      delete next[key]
      set(workflowSavedRunReviewRequestedByKeyAtom, next)
      return
    }
    set(workflowSavedRunReviewRequestedByKeyAtom, {
      ...stored,
      [key]: true,
    })
  },
)
export const workflowRunBlockReasonAtom = atom<string | null>(null)
export type WorkflowOpenStatus = "idle" | "loading" | "error"
export interface WorkflowOpenState {
  status: WorkflowOpenStatus
  targetPath: string | null
  message: string | null
}
export const workflowOpenStateAtom = atom<WorkflowOpenState>({
  status: "idle",
  targetPath: null,
  message: null,
})

// First launch / onboarding — default false, never auto-shows
const IS_TEST_MODE = typeof __TEST_MODE__ !== "undefined" && __TEST_MODE__
export const firstLaunchAtom = IS_TEST_MODE
  ? atom(false)
  : atomWithStorage("c8c:firstLaunch", false)
export const hasCompletedFirstFlowAtom = atomWithStorage(
  "c8c:has-completed-first-flow",
  false,
)

// App pages
export type MainView =
  | "thread"
  | "factory"
  | "workflow_create"
  | "skills"
  | "templates"
  | "artifacts"
  | "settings"
  | "inbox"
  | "onboarding"
export const mainViewAtom = atom<MainView>("thread")

export const selectedFactoryCaseIdAtom = atomWithStorage<string | null>(
  "c8c:selected-factory-case-id",
  null,
)

export const selectedFactoryIdAtom = atomWithStorage<string | null>(
  "c8c:selected-factory-id",
  null,
)

export const selectedInboxTaskKeyAtom = atomWithStorage<string | null>(
  "c8c:selected-inbox-task-key",
  null,
)

// ── Inbox / Notification Memory ───────────────────────

export type InboxNotificationLevel = "info" | "success" | "warning" | "error"
export type InboxNotificationSource = "workflow" | "batch" | "agent" | "system"

export type InboxNotificationAction =
  | {
      kind: "open_workflow"
      workflowPath: string
      workspace?: string
      label?: string
    }
  | {
      kind: "open_inbox_task"
      taskKey: string
      workflowPath?: string
      label?: string
    }

export interface InboxNotification {
  id: string
  title: string
  description?: string
  level: InboxNotificationLevel
  source: InboxNotificationSource
  action?: InboxNotificationAction
  persistentKey?: string
  createdAt: number
  read: boolean
}

export type CreateInboxNotification = Omit<
  InboxNotification,
  "id" | "createdAt" | "read"
>

const MAX_INBOX_NOTIFICATIONS = 150
const INBOX_DEDUPE_WINDOW_MS = 15_000

export const inboxNotificationsAtom = atomWithStorage<InboxNotification[]>(
  "c8c:inbox-notifications-v2",
  [],
)

function areInboxActionsEqual(
  left: InboxNotificationAction | undefined,
  right: InboxNotificationAction | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  if (left.kind !== right.kind) return false
  if (left.kind === "open_workflow" && right.kind === "open_workflow") {
    return (
      left.workflowPath === right.workflowPath &&
      left.workspace === right.workspace &&
      left.label === right.label
    )
  }
  if (left.kind === "open_inbox_task" && right.kind === "open_inbox_task") {
    return (
      left.taskKey === right.taskKey &&
      left.workflowPath === right.workflowPath &&
      left.label === right.label
    )
  }
  return false
}

function areInboxNotificationsEqual(
  left: InboxNotification,
  right: InboxNotification,
): boolean {
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.level === right.level &&
    left.source === right.source &&
    left.persistentKey === right.persistentKey &&
    left.read === right.read &&
    left.createdAt === right.createdAt &&
    areInboxActionsEqual(left.action, right.action)
  )
}

export function appendInboxNotification(
  existing: InboxNotification[],
  notification: CreateInboxNotification,
  now = Date.now(),
): InboxNotification[] {
  if (notification.persistentKey) {
    const existingIndex = existing.findIndex(
      (entry) => entry.persistentKey === notification.persistentKey,
    )
    if (existingIndex >= 0) {
      const current = existing[existingIndex]
      const updated: InboxNotification = {
        ...current,
        ...notification,
        id: current.id,
        createdAt: current.createdAt,
        read: current.read,
      }
      if (areInboxNotificationsEqual(current, updated)) return existing
      const next = existing.slice()
      next[existingIndex] = updated
      return next
    }
  }

  const duplicate = existing.find(
    (entry) =>
      (!notification.persistentKey ||
        entry.persistentKey === notification.persistentKey) &&
      entry.title === notification.title &&
      entry.description === notification.description &&
      entry.level === notification.level &&
      entry.source === notification.source &&
      now - entry.createdAt < INBOX_DEDUPE_WINDOW_MS,
  )
  if (duplicate) return existing

  const nextEntry: InboxNotification = {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    read: false,
    ...notification,
  }
  return [nextEntry, ...existing].slice(0, MAX_INBOX_NOTIFICATIONS)
}

export function pruneInboxNotificationsByPersistentKeys(
  existing: InboxNotification[],
  persistentKeys: readonly string[],
): InboxNotification[] {
  const keySet = new Set(persistentKeys.filter((value) => value.length > 0))
  if (keySet.size === 0) return existing
  const next = existing.filter(
    (entry) => !entry.persistentKey || !keySet.has(entry.persistentKey),
  )
  return next.length === existing.length ? existing : next
}

export const unreadInboxCountAtom = atom(
  (get) =>
    get(inboxNotificationsAtom).filter((notification) => !notification.read)
      .length,
)

export const addInboxNotificationAtom = atom(
  null,
  (get, set, notification: CreateInboxNotification) => {
    const existing = get(inboxNotificationsAtom)
    const next = appendInboxNotification(existing, notification)
    if (next !== existing) {
      set(inboxNotificationsAtom, next)
    }
  },
)

export const removeInboxNotificationsByPersistentKeysAtom = atom(
  null,
  (get, set, persistentKeys: readonly string[]) => {
    const existing = get(inboxNotificationsAtom)
    const next = pruneInboxNotificationsByPersistentKeys(
      existing,
      persistentKeys,
    )
    if (next !== existing) {
      set(inboxNotificationsAtom, next)
    }
  },
)

export const markInboxNotificationReadAtom = atom(
  null,
  (get, set, notificationId: string) => {
    set(
      inboxNotificationsAtom,
      get(inboxNotificationsAtom).map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification,
      ),
    )
  },
)

export const markAllInboxNotificationsReadAtom = atom(null, (get, set) => {
  set(
    inboxNotificationsAtom,
    get(inboxNotificationsAtom).map((notification) =>
      notification.read ? notification : { ...notification, read: true },
    ),
  )
})

export const clearInboxNotificationsAtom = atom(null, (_get, set) => {
  set(inboxNotificationsAtom, [])
})

// Templates & generation
export const workflowCreateContextAtom = atom<{
  projectPath: string | null
  locked: boolean
}>({
  projectPath: null,
  locked: false,
})
export const templateLibraryContextAtom =
  atom<TemplateLibraryContextState | null>(null)
export const selectedResultModeIdAtom = atomWithStorage<ResultModeId>(
  "c8c:selected-result-mode-id",
  "development",
)
export const workflowCreateModeConfigsAtom = atomWithStorage<
  Record<string, Record<string, string>>
>("c8c:workflow-create-mode-configs", {})
export const workflowCreateDraftPromptAtom = atom("")
export const workflowCreatePromptScaffoldAtom =
  atom<WorkflowCreatePromptScaffold>(EMPTY_WORKFLOW_CREATE_SCAFFOLD)
export const workflowCreateSourceArtifactsAtom = atom<ArtifactRecord[]>([])
export const workflowCreateSourceAttachmentsAtom = atom<InputAttachment[]>([])
export const workflowCreatePendingMessageAtom = atom<Record<string, string>>({})
export const workflowCreatePendingEntryAtom = atom<Record<string, string>>({})
export const workflowQueuedAutoRunPathAtom = atom<string | null>(null)
export const workflowEntryStateAtom =
  atomWithStorage<WorkflowEntryState | null>("c8c:workflow-entry-state", null)
export const workflowContinuationEntryStatesAtom = atomWithStorage<
  Record<string, WorkflowEntryState>
>("c8c:workflow-continuation-entry-states", {})
export const selectedWorkflowContinuationEntryStateAtom = atom(
  (get) =>
    get(workflowContinuationEntryStatesAtom)[
      toWorkflowExecutionKey(get(selectedWorkflowPathAtom))
    ] ?? null,
  (get, set, entryState: WorkflowEntryState | null) => {
    const key = toWorkflowExecutionKey(get(selectedWorkflowPathAtom))
    const existing = get(workflowContinuationEntryStatesAtom)
    if (!entryState) {
      if (!(key in existing)) return
      const next = { ...existing }
      delete next[key]
      set(workflowContinuationEntryStatesAtom, next)
      return
    }
    set(workflowContinuationEntryStatesAtom, {
      ...existing,
      [key]: entryState,
    })
  },
)
export const setWorkflowContinuationEntryStateForKeyAtom = atom(
  null,
  (
    get,
    set,
    { key, entryState }: { key: string; entryState: WorkflowEntryState | null },
  ) => {
    const existing = get(workflowContinuationEntryStatesAtom)
    if (!entryState) {
      if (!(key in existing)) return
      const next = { ...existing }
      delete next[key]
      set(workflowContinuationEntryStatesAtom, next)
      return
    }
    set(workflowContinuationEntryStatesAtom, {
      ...existing,
      [key]: entryState,
    })
  },
)
export const moveWorkflowContinuationEntryStateAtom = atom(
  null,
  (get, set, { fromKey, toKey }: { fromKey: string; toKey: string }) => {
    if (fromKey === toKey) return
    const existing = get(workflowContinuationEntryStatesAtom)
    const source = existing[fromKey]
    if (!source) return
    const next = {
      ...existing,
      [toKey]: {
        ...source,
        workflowPath: toKey === toWorkflowExecutionKey(null) ? null : toKey,
      },
    }
    delete next[fromKey]
    set(workflowContinuationEntryStatesAtom, next)
  },
)
export const clearWorkflowContinuationEntryStateForKeyAtom = atom(
  null,
  (get, set, key: string) => {
    const existing = get(workflowContinuationEntryStatesAtom)
    if (!(key in existing)) return
    const next = { ...existing }
    delete next[key]
    set(workflowContinuationEntryStatesAtom, next)
  },
)
export const workflowRequestedResultsAtom = atomWithStorage<
  Record<string, string>
>("c8c:workflow-requested-results", {})
export const requestedResultAtom = atom(
  (get) => {
    const workflowPath = get(selectedWorkflowPathAtom)
    if (!workflowPath) return ""
    return (
      get(workflowRequestedResultsAtom)[toWorkflowExecutionKey(workflowPath)] ??
      ""
    )
  },
  (get, set, next: string) => {
    const workflowPath = get(selectedWorkflowPathAtom)
    if (!workflowPath) return
    const key = toWorkflowExecutionKey(workflowPath)
    const existing = get(workflowRequestedResultsAtom)
    const normalized = next.trim()
    if (!normalized) {
      if (!(key in existing)) return
      const updated = { ...existing }
      delete updated[key]
      set(workflowRequestedResultsAtom, updated)
      return
    }
    set(workflowRequestedResultsAtom, {
      ...existing,
      [key]: next,
    })
  },
)
export const setWorkflowRequestedResultForKeyAtom = atom(
  null,
  (get, set, { key, value }: { key: string; value: string | null }) => {
    const existing = get(workflowRequestedResultsAtom)
    const normalized = value?.trim() || ""
    if (!normalized) {
      if (!(key in existing)) return
      const updated = { ...existing }
      delete updated[key]
      set(workflowRequestedResultsAtom, updated)
      return
    }
    set(workflowRequestedResultsAtom, {
      ...existing,
      [key]: value ?? "",
    })
  },
)
export const moveWorkflowRequestedResultAtom = atom(
  null,
  (get, set, { fromKey, toKey }: { fromKey: string; toKey: string }) => {
    if (fromKey === toKey) return
    const requestedResults = get(workflowRequestedResultsAtom)
    const value = requestedResults[fromKey]
    if (!value) return
    const updated = {
      ...requestedResults,
      [toKey]: value,
    }
    delete updated[fromKey]
    set(workflowRequestedResultsAtom, updated)
  },
)
export const clearWorkflowRequestedResultForKeyAtom = atom(
  null,
  (get, set, key: string) => {
    const requestedResults = get(workflowRequestedResultsAtom)
    if (!(key in requestedResults)) return
    const updated = { ...requestedResults }
    delete updated[key]
    set(workflowRequestedResultsAtom, updated)
  },
)
export const workflowTemplateContextsAtom = atomWithStorage<
  Record<string, WorkflowTemplateRunContext>
>("c8c:workflow-template-contexts", {})
export const selectedWorkflowTemplateContextAtom = atom(
  (get) =>
    get(workflowTemplateContextsAtom)[
      toWorkflowExecutionKey(get(selectedWorkflowPathAtom))
    ] ?? null,
  (get, set, context: WorkflowTemplateRunContext | null) => {
    const key = toWorkflowExecutionKey(get(selectedWorkflowPathAtom))
    const contexts = get(workflowTemplateContextsAtom)
    if (!context) {
      if (!(key in contexts)) return
      const next = { ...contexts }
      delete next[key]
      set(workflowTemplateContextsAtom, next)
      return
    }
    set(workflowTemplateContextsAtom, {
      ...contexts,
      [key]: context,
    })
  },
)
export const setWorkflowTemplateContextForKeyAtom = atom(
  null,
  (
    get,
    set,
    {
      key,
      context,
    }: { key: string; context: WorkflowTemplateRunContext | null },
  ) => {
    const contexts = get(workflowTemplateContextsAtom)
    if (!context) {
      if (!(key in contexts)) return
      const next = { ...contexts }
      delete next[key]
      set(workflowTemplateContextsAtom, next)
      return
    }
    set(workflowTemplateContextsAtom, {
      ...contexts,
      [key]: context,
    })
  },
)
export const moveWorkflowTemplateContextAtom = atom(
  null,
  (get, set, { fromKey, toKey }: { fromKey: string; toKey: string }) => {
    if (fromKey === toKey) return
    const contexts = get(workflowTemplateContextsAtom)
    const source = contexts[fromKey]
    if (!source) return
    const next = {
      ...contexts,
      [toKey]: {
        ...source,
        workflowPath: toKey === toWorkflowExecutionKey(null) ? null : toKey,
      },
    }
    delete next[fromKey]
    set(workflowTemplateContextsAtom, next)
  },
)
export const clearWorkflowTemplateContextForKeyAtom = atom(
  null,
  (get, set, key: string) => {
    const contexts = get(workflowTemplateContextsAtom)
    if (!(key in contexts)) return
    const next = { ...contexts }
    delete next[key]
    set(workflowTemplateContextsAtom, next)
  },
)

// ── Chat Panel ──────────────────────────────────────────

export interface ChatMessageDisplay {
  id: string
  role: "user" | "assistant" | "tool_call" | "tool_result"
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolCallId?: string
  toolOutput?: string
  toolError?: string
  streaming?: boolean
}

export const chatPanelOpenAtom = atomWithStorage<boolean>(
  "c8c:chat-open",
  false,
)
export const chatPanelWidthAtom = atomWithStorage<number>("c8c:chat-width", 380)
export const chatMessagesAtom = atom<ChatMessageDisplay[]>([])
export const chatStatusAtom = atom<"idle" | "thinking" | "streaming" | "error">(
  "idle",
)
export const chatSessionIdAtom = atom<string | null>(null)
export const chatUndoStackAtom = atom<Workflow[]>([])
export const chatDraftByWorkflowAtom = atom<Record<string, string>>({})
export const chatScrollTopByWorkflowAtom = atom<Record<string, number>>({})

// ── Batch Runs ────────────────────────────────────────

export type BatchStatus = "idle" | "running" | "done" | "error"

export const batchDialogOpenAtom = atom(false)
export const batchStatusAtom = atom<BatchStatus>("idle")
export const batchIdAtom = atom<string | null>(null)
export const batchErrorAtom = atom<string | null>(null)
export const batchItemsAtom = atom<BatchItemResult[]>([])
export const batchSummaryAtom = atom<BatchSummary | null>(null)
export const batchProgressAtom = atom<{
  completed: number
  total: number
  running: number
}>({
  completed: 0,
  total: 0,
  running: 0,
})

// ── Deep Link Templates ─────────────────────────────────

export const deepLinkPendingTemplateAtom = atom<WorkflowTemplate | null>(null)
export const multiRunDashboardOpenAtom = atom(false)

// ── MCP Servers ─────────────────────────────────────────

export const mcpServersAtom = atom<McpServerInfo[]>([])
export const mcpServersLoadingAtom = atom(false)
export const mcpDiscoveredToolsAtom = atom<McpToolInfo[]>([])
