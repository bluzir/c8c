import type {
  ActiveExecutionSnapshot,
  ArtifactRecord,
  BatchEvent,
  CaseStateRecord,
  ChatConversation,
  ChatEvent,
  ChatSessionSnapshot,
  ClaudeCodeSubscriptionStatus,
  ConfigureMcpIntegrationInput,
  CreateEntryRouteInput,
  CreateEntryRouteResult,
  DesktopRuntimeInfo,
  DiscoveredSkill,
  ProjectFactoryBlueprint,
  ProjectFactoryState,
  FlowImprovementRecommendation,
  GenerationProgress,
  HumanTaskSnapshot,
  HumanTaskSubmitInput,
  HumanTaskSummary,
  InstalledPlugin,
  MarketplaceSource,
  McpIntegrationStatus,
  McpIntegrationTestResult,
  McpServerInfo,
  McpTestResult,
  McpToolInfo,
  LoadedRunResult,
  PluginMcpServerInfo,
  PersistArtifactsFromRunRequest,
  PersistArtifactsFromRunResult,
  ProjectInspectionSummary,
  ProviderDiagnostics,
  ProviderId,
  ProviderSettings,
  RunResult,
  RunWorkspaceCleanupResult,
  RunWorkspaceDeleteResult,
  SaveProjectFactoryBlueprintInput,
  SpawnFactoryCasesFromArtifactInput,
  SpawnFactoryCasesFromArtifactResult,
  SkillLibrary,
  TelemetrySettings,
  TelemetryUiEvent,
  UpdateEvent,
  UpdateInfo,
  Workflow,
  WorkflowEvent,
  WorkflowFile,
  WorkflowInput,
  WorkflowTemplate,
} from "@shared/types"
import type {
  DesktopCommandId,
  DesktopMenuState,
} from "@shared/desktop-commands"
import type { WorkflowConfigIssue } from "./workflow-config-validation"

export interface ExecutionStartError {
  error: string
  code?: "validation" | "preflight" | "window" | "scaffold" | "unknown"
  validationIssues?: WorkflowConfigIssue[]
}

export type ExecutionStartResult =
  | string
  | ExecutionStartError
  | null
  | undefined

export interface C8cTestHarnessEnvironment {
  testMode: true
  homeDir: string
  userDataDir: string
  projectsConfigPath: string
  chainsDir: string
  windowStatePath: string
  startupSideEffectsSuppressed: boolean
}

export interface C8cTestHarnessApi {
  getEnvironment: () => Promise<C8cTestHarnessEnvironment>
  seedProjects: (input: {
    projects: string[]
    lastSelectedProject?: string | null
  }) => Promise<boolean>
  resetPersistentState: () => Promise<boolean>
}

export interface C8cApi {
  listProjects: () => Promise<string[]>
  addProject: () => Promise<string | null>
  removeProject: (path: string) => Promise<void>
  reorderProjects: (paths: string[]) => Promise<string[]>
  setSelectedProject: (path: string) => Promise<void>
  getSelectedProject: () => Promise<string | null>
  scanSkills: (projectPath: string) => Promise<DiscoveredSkill[]>
  createSkillTemplate: (projectPath: string) => Promise<string>
  scaffoldMissingSkills: (
    workflow: Workflow,
    availableSkills: Pick<DiscoveredSkill, "name" | "category">[],
    projectPath: string,
  ) => Promise<Workflow>
  readSkillContent: (path: string) => Promise<string>
  listProjectWorkflows: (projectPath: string) => Promise<WorkflowFile[]>
  listGlobalWorkflows: () => Promise<WorkflowFile[]>
  loadWorkflow: (filePath: string) => Promise<Workflow>
  saveWorkflow: (filePath: string, chain: Workflow) => Promise<string>
  saveWorkflowAs: (
    chain: Workflow,
    projectPath?: string,
  ) => Promise<string | null>
  exportWorkflowCopy: (
    chain: Workflow,
    projectPath?: string,
  ) => Promise<string | null>
  openWorkflowFile: () => Promise<{ filePath: string; chain: Workflow } | null>
  createWorkflow: (
    projectPath: string,
    name: string,
    chain: Workflow,
  ) => Promise<string>
  renameWorkflow: (filePath: string, nextName: string) => Promise<string>
  duplicateWorkflow: (filePath: string) => Promise<string>
  deleteWorkflow: (filePath: string) => Promise<void>
  listLibraries: () => Promise<SkillLibrary[]>
  installLibrary: (id: string) => Promise<boolean>
  removeLibrary: (id: string) => Promise<boolean>
  scanLibraries: () => Promise<DiscoveredSkill[]>
  listMarketplaces: () => Promise<MarketplaceSource[]>
  installMarketplace: (id: string) => Promise<boolean>
  updateMarketplace: (id: string) => Promise<boolean>
  removeMarketplace: (id: string) => Promise<boolean>
  scanPlugins: () => Promise<InstalledPlugin[]>
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<boolean>
  listTemplates: () => Promise<WorkflowTemplate[]>
  listPopularProjectTemplates: (
    projectPath: string,
    limit?: number,
  ) => Promise<WorkflowTemplate[]>
  recordProjectTemplateUsage: (
    projectPath: string,
    templateId: string,
  ) => Promise<void>
  saveAsTemplate: (name: string, workflow: Workflow) => Promise<string>
  fetchHubTemplate: (templateId: string) => Promise<WorkflowTemplate>
  refreshCatalog: () => Promise<void>
  inspectCreateEntryProject: (
    projectPath: string,
  ) => Promise<ProjectInspectionSummary>
  routeCreateEntry: (
    input: CreateEntryRouteInput,
  ) => Promise<CreateEntryRouteResult>
  generateWorkflow: (
    description: string,
    availableSkills: Pick<
      DiscoveredSkill,
      "name" | "category" | "description"
    >[],
    projectPath?: string,
  ) => Promise<Workflow>
  cancelGenerate: () => Promise<void>
  getAppVersion: () => Promise<string>
  getDesktopRuntime: () => Promise<DesktopRuntimeInfo>
  onDesktopRuntimeChange: (
    callback: (runtime: DesktopRuntimeInfo) => void,
  ) => () => void
  updateDesktopMenuState: (state: DesktopMenuState) => Promise<boolean>
  onDesktopCommand: (
    callback: (commandId: DesktopCommandId) => void,
  ) => () => void
  getProjectStatus: (
    projectPath: string | null,
  ) => Promise<{ branch: string | null }>
  getClaudeCodeSubscriptionStatus: () => Promise<ClaudeCodeSubscriptionStatus>
  getProviderDiagnostics: () => Promise<ProviderDiagnostics>
  updateProviderSettings: (
    patch: Partial<ProviderSettings>,
  ) => Promise<ProviderSettings>
  setCodexApiKey: (apiKey: string) => Promise<ProviderDiagnostics>
  clearCodexApiKey: () => Promise<ProviderDiagnostics>
  logoutProvider: (provider: ProviderId) => Promise<ProviderDiagnostics>
  getTelemetrySettings: () => Promise<TelemetrySettings>
  setTelemetryConsent: (enabled: boolean) => Promise<TelemetrySettings>
  trackUiEvent: (eventName: TelemetryUiEvent) => Promise<boolean>
  openPath: (path: string) => Promise<string>
  showInFinder: (path: string) => Promise<boolean>
  checkForUpdate: () => Promise<UpdateInfo>
  installUpdate: () => Promise<boolean>
  getUpdateStatus: () => Promise<UpdateInfo>
  onUpdateEvent: (callback: (event: UpdateEvent) => void) => () => void
  runChain: (
    chain: Workflow,
    input: WorkflowInput,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<ExecutionStartResult>
  cancelRun: (runId: string) => Promise<boolean>
  pauseRun: (runId: string) => Promise<boolean>
  resumeRun: (runId: string) => Promise<boolean>
  rerunFrom: (
    fromNodeId: string,
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<ExecutionStartResult>
  continueRun: (
    workflow: Workflow,
    workspace: string,
    projectPath?: string,
    workflowPath?: string,
    webSearchBackend?: "builtin" | "exa",
  ) => Promise<ExecutionStartResult>
  listRuns: (projectPath: string) => Promise<RunResult[]>
  listFlowImprovementRecommendations: (
    projectPath: string,
    workflowPath?: string | null,
    workflowName?: string | null,
  ) => Promise<FlowImprovementRecommendation[]>
  loadRunResult: (workspace: string) => Promise<LoadedRunResult | null>
  deleteRun: (workspace: string) => Promise<RunWorkspaceDeleteResult>
  cleanupRuns: (projectPath: string) => Promise<RunWorkspaceCleanupResult>
  openReport: (reportPath: string) => Promise<string>
  getActiveExecutions: () => Promise<ActiveExecutionSnapshot[]>
  persistArtifactsFromRun: (
    input: PersistArtifactsFromRunRequest,
  ) => Promise<PersistArtifactsFromRunResult>
  listProjectArtifacts: (projectPath: string) => Promise<ArtifactRecord[]>
  listProjectCaseStates: (projectPath: string) => Promise<CaseStateRecord[]>
  loadProjectFactoryBlueprint: (
    projectPath: string,
  ) => Promise<ProjectFactoryBlueprint | null>
  saveProjectFactoryBlueprint: (
    input: SaveProjectFactoryBlueprintInput,
  ) => Promise<ProjectFactoryBlueprint>
  loadProjectFactoryState: (projectPath: string) => Promise<ProjectFactoryState>
  spawnFactoryCasesFromArtifact: (
    input: SpawnFactoryCasesFromArtifactInput,
  ) => Promise<SpawnFactoryCasesFromArtifactResult>
  chatSendMessage: (
    workflowPath: string,
    message: string,
    projectPath: string,
    currentWorkflow: Workflow,
  ) => Promise<string>
  chatLoadHistory: (workflowPath: string) => Promise<ChatConversation | null>
  chatGetActiveSession: (
    workflowPath: string,
  ) => Promise<ChatSessionSnapshot | null>
  chatCancel: (sessionId: string) => Promise<boolean>
  chatClearHistory: (workflowPath: string) => Promise<void>
  approveNode: (
    runId: string,
    nodeId: string,
    editedContent?: string,
  ) => Promise<boolean>
  rejectNode: (runId: string, nodeId: string) => Promise<boolean>
  overrideEvaluator: (runId: string, nodeId: string) => Promise<boolean>
  listHumanTasks: (projectPath?: string) => Promise<HumanTaskSummary[]>
  loadHumanTask: (
    taskId: string,
    workspace: string,
  ) => Promise<HumanTaskSnapshot | null>
  submitHumanTask: (
    taskId: string,
    workspace: string,
    input: HumanTaskSubmitInput,
  ) => Promise<boolean>
  rejectHumanTask: (
    taskId: string,
    workspace: string,
    comment?: string,
    idempotencyKey?: string,
  ) => Promise<boolean>
  runBatch: (
    workflow: Workflow,
    inputs: WorkflowInput[],
    concurrency: number,
    stopOnFailure: boolean,
    projectPath?: string,
    workflowPath?: string,
  ) => Promise<ExecutionStartResult>
  cancelBatch: (batchId: string) => Promise<boolean>
  onBatchEvent: (callback: (event: BatchEvent) => void) => () => void
  onChatEvent: (callback: (event: ChatEvent) => void) => () => void
  onWorkflowEvent: (callback: (event: WorkflowEvent) => void) => () => void
  onGenerateProgress: (
    callback: (progress: GenerationProgress) => void,
  ) => () => void
  onDeepLinkTemplate: (
    callback: (template: WorkflowTemplate) => void,
  ) => () => void
  onDeepLinkTemplateError: (
    callback: (err: { templateId: string; error: string }) => void,
  ) => () => void
  listProjectFiles: (
    projectPath: string,
    query?: string,
  ) => Promise<{ name: string; relativePath: string }[]>
  readFileContent: (
    filePath: string,
    projectPath: string,
  ) => Promise<{ content: string; truncated: boolean }>
  mcpListServers: (
    provider: ProviderId,
    projectPath?: string,
  ) => Promise<McpServerInfo[]>
  mcpListAllServers: (provider: ProviderId) => Promise<McpServerInfo[]>
  mcpListPluginServers: () => Promise<PluginMcpServerInfo[]>
  listMcpIntegrations: (projectPath?: string) => Promise<McpIntegrationStatus[]>
  getMcpIntegrationStatuses: (
    toolIds: string[],
    projectPath?: string,
  ) => Promise<McpIntegrationStatus[]>
  configureMcpIntegration: (
    integrationId: string,
    input: ConfigureMcpIntegrationInput,
    projectPath?: string,
  ) => Promise<McpIntegrationStatus>
  testMcpIntegration: (
    integrationId: string,
    projectPath?: string,
  ) => Promise<McpIntegrationTestResult>
  clearMcpIntegration: (
    integrationId: string,
    projectPath?: string,
  ) => Promise<void>
  mcpAddServer: (
    provider: ProviderId,
    server: McpServerInfo,
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpUpdateServer: (
    provider: ProviderId,
    name: string,
    server: McpServerInfo,
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpRemoveServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpToggleServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    disabled: boolean,
    projectPath?: string,
  ) => Promise<{ success: boolean; error?: string }>
  mcpTestServer: (
    provider: ProviderId,
    name: string,
    scope: McpServerInfo["scope"],
    projectPath?: string,
  ) => Promise<McpTestResult>
  mcpDiscoverTools: (
    provider: ProviderId,
    serverName?: string,
    projectPath?: string,
  ) => Promise<McpToolInfo[]>
  mcpSetPluginServerApproved: (
    serverId: string,
    approved: boolean,
  ) => Promise<boolean>
}

declare global {
  interface Window {
    api: C8cApi
    testHarness?: C8cTestHarnessApi
  }
}

export {}
