import { contextBridge, ipcRenderer } from "electron"
import type { C8cApi, C8cTestHarnessApi } from "@shared/c8c-api"
import type {
  DesktopCommandId,
  DesktopMenuState,
} from "@shared/desktop-commands"
import type {
  BatchEvent,
  Chat,
  ChatSummary,
  TelemetryUiEvent,
  ChatEvent,
  ConfigureMcpIntegrationInput,
  DesktopRuntimeInfo,
  DiscoveredSkill,
  GenerationProgress,
  HumanTaskSubmitInput,
  McpServerInfo,
  PersistedChatTimeline,
  PersistArtifactsFromRunRequest,
  SaveProjectFactoryBlueprintInput,
  SpawnFactoryCasesFromArtifactInput,
  UpdateEvent,
  ProviderId,
  ProviderSettings,
  Workflow,
  WorkflowEvent,
  WorkflowInput,
  WorkflowTemplate,
} from "@shared/types"
import type { RoutingIntent, RoutingEvent } from "@shared/routing-types"

type Listener = (payload: unknown) => void
type AsyncMethod = (...args: any[]) => Promise<unknown>

const channelSubscribers = new Map<string, Set<Listener>>()
const channelHandlers = new Map<
  string,
  (_event: unknown, payload: unknown) => void
>()

function invokeIpc<Fn extends AsyncMethod>(
  channel: string,
  ...args: Parameters<Fn>
): ReturnType<Fn> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<Fn>
}

function subscribeIpcChannel<T>(
  channel: string,
  callback: (payload: T) => void,
): () => void {
  let subscribers = channelSubscribers.get(channel)
  if (!subscribers) {
    subscribers = new Set<Listener>()
    channelSubscribers.set(channel, subscribers)
  }

  if (subscribers.size === 0) {
    const handler = (_event: unknown, payload: unknown) => {
      const currentSubscribers = channelSubscribers.get(channel)
      if (!currentSubscribers || currentSubscribers.size === 0) return
      for (const subscriber of currentSubscribers) {
        try {
          subscriber(payload)
        } catch (error) {
          // Never let one renderer callback break channel delivery.
          console.warn("[preload] subscriber error", {
            channel,
            error: String(error),
          })
        }
      }
    }
    channelHandlers.set(channel, handler)
    ipcRenderer.on(channel, handler)
  }

  const listener = callback as Listener
  subscribers.add(listener)

  return () => {
    const currentSubscribers = channelSubscribers.get(channel)
    if (!currentSubscribers) return
    currentSubscribers.delete(listener)
    if (currentSubscribers.size > 0) return

    channelSubscribers.delete(channel)
    const handler = channelHandlers.get(channel)
    if (!handler) return
    ipcRenderer.removeListener(channel, handler)
    channelHandlers.delete(channel)
  }
}

const api: C8cApi = {
  // Projects
  listProjects: () => invokeIpc<C8cApi["listProjects"]>("projects:list"),
  addProject: () => invokeIpc<C8cApi["addProject"]>("projects:add"),
  removeProject: (path: string) =>
    invokeIpc<C8cApi["removeProject"]>("projects:remove", path),
  reorderProjects: (paths: string[]) =>
    invokeIpc<C8cApi["reorderProjects"]>("projects:reorder", paths),
  setSelectedProject: (path: string) =>
    invokeIpc<C8cApi["setSelectedProject"]>("projects:set-selected", path),
  getSelectedProject: () =>
    invokeIpc<C8cApi["getSelectedProject"]>("projects:get-selected"),

  // Skills
  scanSkills: (projectPath: string) =>
    invokeIpc<C8cApi["scanSkills"]>("skills:scan", projectPath),
  createSkillTemplate: (projectPath: string) =>
    invokeIpc<C8cApi["createSkillTemplate"]>(
      "skills:create-template",
      projectPath,
    ),
  scaffoldMissingSkills: (
    workflow: Workflow,
    availableSkills: Pick<DiscoveredSkill, "name" | "category">[],
    projectPath: string,
  ) =>
    invokeIpc<C8cApi["scaffoldMissingSkills"]>(
      "skills:scaffold",
      workflow,
      availableSkills,
      projectPath,
    ),
  readSkillContent: (path: string) =>
    invokeIpc<C8cApi["readSkillContent"]>("skills:read-content", path),

  // Workflows
  listProjectWorkflows: (projectPath: string) =>
    invokeIpc<C8cApi["listProjectWorkflows"]>(
      "workflows:list-project",
      projectPath,
    ),
  listGlobalWorkflows: () =>
    invokeIpc<C8cApi["listGlobalWorkflows"]>("workflows:list-global"),
  loadWorkflow: (filePath: string) =>
    invokeIpc<C8cApi["loadWorkflow"]>("workflows:load", filePath),
  saveWorkflow: (filePath: string, chain: Workflow) =>
    invokeIpc<C8cApi["saveWorkflow"]>("workflows:save", filePath, chain),
  saveWorkflowAs: (chain: Workflow, projectPath?: string) =>
    invokeIpc<C8cApi["saveWorkflowAs"]>(
      "workflows:save-as",
      chain,
      projectPath,
    ),
  exportWorkflowCopy: (chain: Workflow, projectPath?: string) =>
    invokeIpc<C8cApi["exportWorkflowCopy"]>(
      "workflows:export-copy",
      chain,
      projectPath,
    ),
  openWorkflowFile: () =>
    invokeIpc<C8cApi["openWorkflowFile"]>("workflows:open-file"),
  createWorkflow: (projectPath: string, name: string, chain: Workflow) =>
    invokeIpc<C8cApi["createWorkflow"]>(
      "workflows:create",
      projectPath,
      name,
      chain,
    ),
  renameWorkflow: (filePath: string, nextName: string) =>
    invokeIpc<C8cApi["renameWorkflow"]>("workflows:rename", filePath, nextName),
  duplicateWorkflow: (filePath: string) =>
    invokeIpc<C8cApi["duplicateWorkflow"]>("workflows:duplicate", filePath),
  deleteWorkflow: (filePath: string) =>
    invokeIpc<C8cApi["deleteWorkflow"]>("workflows:delete", filePath),

  // Executor
  runChain: (
    chain: Workflow,
    input: WorkflowInput,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) =>
    invokeIpc<C8cApi["runChain"]>(
      "executor:run",
      chain,
      input,
      projectPath,
      workflowPath,
      webSearchBackend,
    ),
  cancelRun: (runId: string) =>
    invokeIpc<C8cApi["cancelRun"]>("executor:cancel", runId),
  pauseRun: (runId: string) =>
    invokeIpc<C8cApi["pauseRun"]>("run:pause", runId),
  resumeRun: (runId: string) =>
    invokeIpc<C8cApi["resumeRun"]>("run:resume", runId),
  rerunFrom: (
    fromNodeId: string,
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) =>
    invokeIpc<C8cApi["rerunFrom"]>(
      "executor:rerun-from",
      fromNodeId,
      workflow,
      workspace,
      projectPath,
      workflowPath,
      webSearchBackend,
    ),
  continueRun: (
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) =>
    invokeIpc<C8cApi["continueRun"]>(
      "executor:continue",
      workflow,
      workspace,
      projectPath,
      workflowPath,
      webSearchBackend,
    ),
  rateRun: (workspacePath: string, rating: number) =>
    invokeIpc<C8cApi["rateRun"]>("executor:rate-run", workspacePath, rating),
  listRuns: (projectPath: string) =>
    invokeIpc<C8cApi["listRuns"]>("executor:list-runs", projectPath),
  listFlowImprovementRecommendations: (
    projectPath: string,
    workflowPath?: string | null,
    workflowName?: string | null,
  ) =>
    invokeIpc<C8cApi["listFlowImprovementRecommendations"]>(
      "executor:list-flow-improvement-recommendations",
      projectPath,
      workflowPath,
      workflowName,
    ),
  loadRunResult: (workspace: string) =>
    invokeIpc<C8cApi["loadRunResult"]>("executor:load-run-result", workspace),
  saveRunChatTimeline: (workspace: string, timeline: PersistedChatTimeline) =>
    invokeIpc<C8cApi["saveRunChatTimeline"]>(
      "executor:save-run-chat-timeline",
      workspace,
      timeline,
    ),
  loadRunChatTimeline: (workspace: string) =>
    invokeIpc<C8cApi["loadRunChatTimeline"]>(
      "executor:load-run-chat-timeline",
      workspace,
    ),
  getTerminalRunSnapshot: (workspace: string) =>
    invokeIpc<C8cApi["getTerminalRunSnapshot"]>(
      "executor:get-terminal-run-snapshot",
      workspace,
    ),
  deleteRun: (workspace: string) =>
    invokeIpc<C8cApi["deleteRun"]>("executor:delete-run", workspace),
  cleanupRuns: (projectPath: string) =>
    invokeIpc<C8cApi["cleanupRuns"]>("executor:cleanup-runs", projectPath),
  openReport: (reportPath: string) =>
    invokeIpc<C8cApi["openReport"]>("executor:open-report", reportPath),
  getActiveExecutions: () =>
    invokeIpc<C8cApi["getActiveExecutions"]>("executor:get-active-executions"),
  persistArtifactsFromRun: (input: PersistArtifactsFromRunRequest) =>
    invokeIpc<C8cApi["persistArtifactsFromRun"]>(
      "executor:persist-artifacts-from-run",
      input,
    ),
  listProjectArtifacts: (projectPath: string) =>
    invokeIpc<C8cApi["listProjectArtifacts"]>(
      "executor:list-project-artifacts",
      projectPath,
    ),
  listProjectCaseStates: (projectPath: string) =>
    invokeIpc<C8cApi["listProjectCaseStates"]>(
      "executor:list-project-case-states",
      projectPath,
    ),
  loadProjectFactoryBlueprint: (projectPath: string) =>
    invokeIpc<C8cApi["loadProjectFactoryBlueprint"]>(
      "factory:load-blueprint",
      projectPath,
    ),
  saveProjectFactoryBlueprint: (input: SaveProjectFactoryBlueprintInput) =>
    invokeIpc<C8cApi["saveProjectFactoryBlueprint"]>(
      "factory:save-blueprint",
      input,
    ),
  loadProjectFactoryState: (projectPath: string) =>
    invokeIpc<C8cApi["loadProjectFactoryState"]>(
      "factory:load-state",
      projectPath,
    ),
  spawnFactoryCasesFromArtifact: (input: SpawnFactoryCasesFromArtifactInput) =>
    invokeIpc<C8cApi["spawnFactoryCasesFromArtifact"]>(
      "factory:spawn-cases-from-artifact",
      input,
    ),

  // Chat entity CRUD
  createChat: (projectPath: string, chat: Chat) =>
    invokeIpc<C8cApi["createChat"]>("chats:create", projectPath, chat),
  loadChat: (projectPath: string, chatId: string) =>
    invokeIpc<C8cApi["loadChat"]>("chats:load", projectPath, chatId),
  saveChat: (projectPath: string, chat: Chat) =>
    invokeIpc<C8cApi["saveChat"]>("chats:save", projectPath, chat),
  listProjectChats: (
    projectPath: string,
    options?: { includeArchived?: boolean },
  ) =>
    invokeIpc<C8cApi["listProjectChats"]>(
      "chats:list-project",
      projectPath,
      options,
    ),
  archiveChat: (projectPath: string, chatId: string) =>
    invokeIpc<C8cApi["archiveChat"]>("chats:archive", projectPath, chatId),
  deleteChat: (
    projectPath: string,
    chatId: string,
    options?: { deleteRunWorkspaces?: boolean },
  ) =>
    invokeIpc<C8cApi["deleteChat"]>(
      "chats:delete",
      projectPath,
      chatId,
      options,
    ),
  saveChatTimeline: (
    projectPath: string,
    chatId: string,
    timeline: unknown,
  ) =>
    invokeIpc<C8cApi["saveChatTimeline"]>(
      "chats:save-timeline",
      projectPath,
      chatId,
      timeline,
    ),
  loadChatTimeline: (projectPath: string, chatId: string) =>
    invokeIpc<C8cApi["loadChatTimeline"]>(
      "chats:load-timeline",
      projectPath,
      chatId,
    ),

  // Libraries
  listLibraries: () => invokeIpc<C8cApi["listLibraries"]>("libraries:list"),
  installLibrary: (id: string) =>
    invokeIpc<C8cApi["installLibrary"]>("libraries:install", id),
  removeLibrary: (id: string) =>
    invokeIpc<C8cApi["removeLibrary"]>("libraries:remove", id),
  scanLibraries: () => invokeIpc<C8cApi["scanLibraries"]>("libraries:scan"),
  listMarketplaces: () =>
    invokeIpc<C8cApi["listMarketplaces"]>("plugins:list-marketplaces"),
  installMarketplace: (id: string) =>
    invokeIpc<C8cApi["installMarketplace"]>("plugins:install-marketplace", id),
  updateMarketplace: (id: string) =>
    invokeIpc<C8cApi["updateMarketplace"]>("plugins:update-marketplace", id),
  removeMarketplace: (id: string) =>
    invokeIpc<C8cApi["removeMarketplace"]>("plugins:remove-marketplace", id),
  scanPlugins: () => invokeIpc<C8cApi["scanPlugins"]>("plugins:scan"),
  setPluginEnabled: (pluginId: string, enabled: boolean) =>
    invokeIpc<C8cApi["setPluginEnabled"]>(
      "plugins:set-enabled",
      pluginId,
      enabled,
    ),

  // Templates
  listTemplates: (projectPath?: string) =>
    invokeIpc<C8cApi["listTemplates"]>("templates:list", projectPath),
  listPopularProjectTemplates: (projectPath: string, limit?: number) =>
    invokeIpc<C8cApi["listPopularProjectTemplates"]>(
      "templates:list-popular-project",
      projectPath,
      limit,
    ),
  recordProjectTemplateUsage: (projectPath: string, templateId: string) =>
    invokeIpc<C8cApi["recordProjectTemplateUsage"]>(
      "templates:record-usage",
      projectPath,
      templateId,
    ),
  saveAsTemplate: (name: string, workflow: Workflow) =>
    invokeIpc<C8cApi["saveAsTemplate"]>("templates:save-user", name, workflow),
  fetchHubTemplate: (templateId: string) =>
    invokeIpc<C8cApi["fetchHubTemplate"]>(
      "templates:fetch-hub-template",
      templateId,
    ),
  refreshCatalog: () =>
    invokeIpc<C8cApi["refreshCatalog"]>("templates:refresh-catalog"),
  inspectCreateEntryProject: (projectPath: string) =>
    invokeIpc<C8cApi["inspectCreateEntryProject"]>(
      "templates:inspect-project",
      projectPath,
    ),
  routeCreateEntry: (input) =>
    invokeIpc<C8cApi["routeCreateEntry"]>(
      "templates:route-create-entry",
      input,
    ),
  generateWorkflow: (
    description: string,
    availableSkills: Pick<
      DiscoveredSkill,
      "name" | "category" | "description"
    >[],
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["generateWorkflow"]>(
      "templates:generate",
      description,
      availableSkills,
      projectPath,
    ),
  cancelGenerate: () =>
    invokeIpc<C8cApi["cancelGenerate"]>("templates:cancel-generate"),

  // System
  getAppVersion: () =>
    invokeIpc<C8cApi["getAppVersion"]>("system:get-app-version"),
  getDesktopRuntime: () =>
    invokeIpc<C8cApi["getDesktopRuntime"]>("system:get-desktop-runtime"),
  onDesktopRuntimeChange: (callback: (runtime: DesktopRuntimeInfo) => void) =>
    subscribeIpcChannel<DesktopRuntimeInfo>(
      "system:desktop-runtime-changed",
      callback,
    ),
  updateDesktopMenuState: (state: DesktopMenuState) =>
    invokeIpc<C8cApi["updateDesktopMenuState"]>(
      "system:update-desktop-menu-state",
      state,
    ),
  onDesktopCommand: (callback: (commandId: DesktopCommandId) => void) =>
    subscribeIpcChannel<DesktopCommandId>("system:desktop-command", callback),
  getProjectStatus: (projectPath: string | null) =>
    invokeIpc<C8cApi["getProjectStatus"]>(
      "system:get-project-status",
      projectPath,
    ),
  getClaudeCodeSubscriptionStatus: () =>
    invokeIpc<C8cApi["getClaudeCodeSubscriptionStatus"]>(
      "system:get-claude-subscription-status",
    ),
  getProviderDiagnostics: () =>
    invokeIpc<C8cApi["getProviderDiagnostics"]>(
      "system:get-provider-diagnostics",
    ),
  updateProviderSettings: (patch: Partial<ProviderSettings>) =>
    invokeIpc<C8cApi["updateProviderSettings"]>(
      "system:update-provider-settings",
      patch,
    ),
  setCodexApiKey: (apiKey: string) =>
    invokeIpc<C8cApi["setCodexApiKey"]>("system:set-codex-api-key", apiKey),
  clearCodexApiKey: () =>
    invokeIpc<C8cApi["clearCodexApiKey"]>("system:clear-codex-api-key"),
  logoutProvider: (provider: ProviderId) =>
    invokeIpc<C8cApi["logoutProvider"]>("system:logout-provider", provider),
  getTelemetrySettings: () =>
    invokeIpc<C8cApi["getTelemetrySettings"]>("system:get-telemetry-settings"),
  setTelemetryConsent: (enabled: boolean) =>
    invokeIpc<C8cApi["setTelemetryConsent"]>(
      "system:set-telemetry-consent",
      enabled,
    ),
  trackUiEvent: (eventName: TelemetryUiEvent) =>
    invokeIpc<C8cApi["trackUiEvent"]>("system:track-ui-event", eventName),
  openPath: (path: string) =>
    invokeIpc<C8cApi["openPath"]>("system:open-path", path),
  showInFinder: (path: string) =>
    invokeIpc<C8cApi["showInFinder"]>("system:show-in-finder", path),

  // Auto-updater
  checkForUpdate: () =>
    invokeIpc<C8cApi["checkForUpdate"]>("system:check-for-update"),
  installUpdate: () =>
    invokeIpc<C8cApi["installUpdate"]>("system:install-update"),
  getUpdateStatus: () =>
    invokeIpc<C8cApi["getUpdateStatus"]>("system:get-update-status"),
  onUpdateEvent: (callback: (event: UpdateEvent) => void) =>
    subscribeIpcChannel<UpdateEvent>("update:event", callback),

  // Chat
  chatSendMessage: (
    workflowPath: string,
    message: string,
    projectPath: string,
    currentWorkflow: Workflow,
  ) =>
    invokeIpc<C8cApi["chatSendMessage"]>(
      "chat:send-message",
      workflowPath,
      message,
      projectPath,
      currentWorkflow,
    ),
  chatLoadHistory: (workflowPath: string) =>
    invokeIpc<C8cApi["chatLoadHistory"]>("chat:load-history", workflowPath),
  chatGetActiveSession: (workflowPath: string) =>
    invokeIpc<C8cApi["chatGetActiveSession"]>(
      "chat:get-active-session",
      workflowPath,
    ),
  chatCancel: (sessionId: string) =>
    invokeIpc<C8cApi["chatCancel"]>("chat:cancel", sessionId),
  chatClearHistory: (workflowPath: string) =>
    invokeIpc<C8cApi["chatClearHistory"]>("chat:clear-history", workflowPath),

  onChatEvent: (callback: (event: ChatEvent) => void) =>
    subscribeIpcChannel<ChatEvent>("chat:event", callback),

  // Approval gates
  approveNode: (runId: string, nodeId: string, editedContent?: string) =>
    invokeIpc<C8cApi["approveNode"]>(
      "executor:approve",
      runId,
      nodeId,
      editedContent,
    ),
  rejectNode: (runId: string, nodeId: string) =>
    invokeIpc<C8cApi["rejectNode"]>("executor:reject", runId, nodeId),
  overrideEvaluator: (runId: string, nodeId: string, editedContent?: string) =>
    invokeIpc<C8cApi["overrideEvaluator"]>(
      "executor:override-evaluator",
      runId,
      nodeId,
      editedContent,
    ),
  listHumanTasks: (projectPath?: string) =>
    invokeIpc<C8cApi["listHumanTasks"]>(
      "executor:list-human-tasks",
      projectPath,
    ),
  loadHumanTask: (taskId: string, workspace: string) =>
    invokeIpc<C8cApi["loadHumanTask"]>(
      "executor:load-human-task",
      taskId,
      workspace,
    ),
  submitHumanTask: (
    taskId: string,
    workspace: string,
    input: HumanTaskSubmitInput,
  ) =>
    invokeIpc<C8cApi["submitHumanTask"]>(
      "executor:submit-human-task",
      taskId,
      workspace,
      input,
    ),
  rejectHumanTask: (
    taskId: string,
    workspace: string,
    comment?: string,
    idempotencyKey?: string,
  ) =>
    invokeIpc<C8cApi["rejectHumanTask"]>(
      "executor:reject-human-task",
      taskId,
      workspace,
      comment,
      idempotencyKey,
    ),

  // Batch runs
  runBatch: (
    workflow: Workflow,
    inputs: WorkflowInput[],
    concurrency: number,
    stopOnFailure: boolean,
    projectPath?: string,
    workflowPath?: string,
  ) =>
    invokeIpc<C8cApi["runBatch"]>(
      "executor:run-batch",
      workflow,
      inputs,
      concurrency,
      stopOnFailure,
      projectPath,
      workflowPath,
    ),
  cancelBatch: (batchId: string) =>
    invokeIpc<C8cApi["cancelBatch"]>("executor:cancel-batch", batchId),
  onBatchEvent: (callback: (event: BatchEvent) => void) =>
    subscribeIpcChannel<BatchEvent>("batch:event", callback),

  // Routing
  routeIntent: (intent: RoutingIntent, options?: { sessionId: string }) =>
    invokeIpc<C8cApi["routeIntent"]>("routing:route-intent", intent, options),
  cancelRouting: (sessionId: string) =>
    invokeIpc<C8cApi["cancelRouting"]>("routing:cancel", sessionId),
  onRoutingEvent: (callback: (event: RoutingEvent) => void) =>
    subscribeIpcChannel<RoutingEvent>("routing:event", callback),

  // Workflow events listener (new graph-based execution)
  onWorkflowEvent: (callback: (event: WorkflowEvent) => void) =>
    subscribeIpcChannel<WorkflowEvent>("workflow:event", callback),

  // Generate progress listener
  onGenerateProgress: (callback: (progress: GenerationProgress) => void) =>
    subscribeIpcChannel<GenerationProgress>("generate:progress", callback),

  // Deep link (c8c:// protocol)
  onDeepLinkTemplate: (callback: (template: WorkflowTemplate) => void) =>
    subscribeIpcChannel<WorkflowTemplate>("template:deep-link", callback),
  onDeepLinkTemplateError: (
    callback: (err: { templateId: string; error: string }) => void,
  ) =>
    subscribeIpcChannel<{ templateId: string; error: string }>(
      "template:deep-link-error",
      callback,
    ),

  // Files
  listProjectFiles: (projectPath: string, query?: string) =>
    invokeIpc<C8cApi["listProjectFiles"]>(
      "files:list-project",
      projectPath,
      query,
    ),
  readFileContent: (filePath: string, projectPath: string) =>
    invokeIpc<C8cApi["readFileContent"]>(
      "files:read-content",
      filePath,
      projectPath,
    ),
  readFileSlice: (filePath: string, maxBytes: number) =>
    invokeIpc<C8cApi["readFileSlice"]>(
      "files:read-slice",
      filePath,
      maxBytes,
    ),

  // MCP servers
  mcpListServers: (provider: ProviderId, projectPath?: string) =>
    invokeIpc<C8cApi["mcpListServers"]>(
      "mcp:list-servers",
      provider,
      projectPath,
    ),
  mcpListAllServers: (provider: ProviderId) =>
    invokeIpc<C8cApi["mcpListAllServers"]>("mcp:list-all-servers", provider),
  mcpListPluginServers: () =>
    invokeIpc<C8cApi["mcpListPluginServers"]>("mcp:list-plugin-servers"),
  listMcpIntegrations: (projectPath?: string) =>
    invokeIpc<C8cApi["listMcpIntegrations"]>(
      "mcp:list-integrations",
      projectPath,
    ),
  getMcpIntegrationStatuses: (toolIds: string[], projectPath?: string) =>
    invokeIpc<C8cApi["getMcpIntegrationStatuses"]>(
      "mcp:get-integration-statuses",
      toolIds,
      projectPath,
    ),
  configureMcpIntegration: (
    integrationId: string,
    input: ConfigureMcpIntegrationInput,
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["configureMcpIntegration"]>(
      "mcp:configure-integration",
      integrationId,
      input,
      projectPath,
    ),
  testMcpIntegration: (integrationId: string, projectPath?: string) =>
    invokeIpc<C8cApi["testMcpIntegration"]>(
      "mcp:test-integration",
      integrationId,
      projectPath,
    ),
  clearMcpIntegration: (integrationId: string, projectPath?: string) =>
    invokeIpc<C8cApi["clearMcpIntegration"]>(
      "mcp:clear-integration",
      integrationId,
      projectPath,
    ),
  mcpAddServer: (
    provider: ProviderId,
    server: McpServerInfo,
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["mcpAddServer"]>(
      "mcp:add-server",
      provider,
      server,
      projectPath,
    ),
  mcpUpdateServer: (
    provider: ProviderId,
    name: string,
    server: McpServerInfo,
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["mcpUpdateServer"]>(
      "mcp:update-server",
      provider,
      name,
      server,
      projectPath,
    ),
  mcpRemoveServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["mcpRemoveServer"]>(
      "mcp:remove-server",
      provider,
      name,
      scope,
      projectPath,
    ),
  mcpToggleServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    disabled: boolean,
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["mcpToggleServer"]>(
      "mcp:toggle-server",
      provider,
      name,
      scope,
      disabled,
      projectPath,
    ),
  mcpTestServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["mcpTestServer"]>(
      "mcp:test-server",
      provider,
      name,
      scope,
      projectPath,
    ),
  mcpDiscoverTools: (
    provider: ProviderId,
    serverName?: string,
    projectPath?: string,
  ) =>
    invokeIpc<C8cApi["mcpDiscoverTools"]>(
      "mcp:discover-tools",
      provider,
      serverName,
      projectPath,
    ),
  mcpSetPluginServerApproved: (serverId: string, approved: boolean) =>
    invokeIpc<C8cApi["mcpSetPluginServerApproved"]>(
      "mcp:set-plugin-server-approved",
      serverId,
      approved,
    ),
}

contextBridge.exposeInMainWorld("api", api)

if (typeof __TEST_MODE__ !== "undefined" && __TEST_MODE__) {
  const testHarness: C8cTestHarnessApi = {
    getEnvironment: () =>
      invokeIpc<C8cTestHarnessApi["getEnvironment"]>(
        "test-harness:get-environment",
      ),
    seedProjects: (input) =>
      invokeIpc<C8cTestHarnessApi["seedProjects"]>(
        "test-harness:seed-projects",
        input,
      ),
    resetPersistentState: () =>
      invokeIpc<C8cTestHarnessApi["resetPersistentState"]>(
        "test-harness:reset-persistent-state",
      ),
  }
  contextBridge.exposeInMainWorld("testHarness", testHarness)
}
