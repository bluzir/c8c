import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WorkflowTemplate } from "@shared/types"

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
const { parseWorkflowPayloadMock, saveChainMock } = vi.hoisted(() => ({
  parseWorkflowPayloadMock: vi.fn(
    (workflow: unknown, _label?: string) => workflow,
  ),
  saveChainMock: vi.fn(),
}))

const listTemplatesMock = vi.fn()
const refreshHubCatalogMock = vi.fn()
const getHubTemplateMock = vi.fn()
const listPopularTemplateIdsForProjectMock = vi.fn()
const recordProjectTemplateUsageMock = vi.fn()
const assertRegisteredProjectPathMock = vi.fn()

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
    ),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
}))

vi.mock("../lib/templates", () => ({
  listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
}))

vi.mock("../lib/templates/hub-catalog", () => ({
  refreshHubCatalog: (...args: unknown[]) => refreshHubCatalogMock(...args),
}))

vi.mock("../lib/templates/hub-template-cache", () => ({
  getHubTemplate: (...args: unknown[]) => getHubTemplateMock(...args),
}))

vi.mock("../lib/agent-execution", () => ({
  drainExecutionHandle: vi.fn(),
}))

vi.mock("../lib/log-parser", () => ({
  LogParser: class {
    entries: unknown[] = []
    textContent = ""
    rawOutput = ""
    appendEntry() {}
    applyUsage() {}
    flush() {}
  },
}))

vi.mock("../lib/workflow-generator", () => ({
  buildGeneratorPrompt: vi.fn(),
  parseGeneratedWorkflow: vi.fn(),
}))

vi.mock("../lib/skill-scaffold", () => ({
  scaffoldMissingSkills: vi.fn(),
}))

vi.mock("../lib/project-template-usage", () => ({
  listPopularTemplateIdsForProject: (...args: unknown[]) =>
    listPopularTemplateIdsForProjectMock(...args),
  recordProjectTemplateUsage: (...args: unknown[]) =>
    recordProjectTemplateUsageMock(...args),
}))

vi.mock("../lib/telemetry/service", () => ({
  trackTelemetryEvent: vi.fn(),
}))

vi.mock("../lib/telemetry/workflow-usage", () => ({
  summarizeMissingWorkflowSkillRefs: vi.fn(() => []),
}))

vi.mock("../lib/security-paths", () => ({
  assertRegisteredProjectPath: (...args: unknown[]) =>
    assertRegisteredProjectPathMock(...args),
}))

vi.mock("../lib/chain-io", () => ({
  saveChain: (...args: unknown[]) => saveChainMock(...args),
}))

vi.mock("@shared/workflow-payload", () => ({
  parseWorkflowPayload: (workflow: unknown, label?: string) =>
    parseWorkflowPayloadMock(workflow, label),
}))

vi.mock("@shared/provider-metadata", () => ({
  getDefaultModelForProvider: vi.fn(() => "gpt-5.4"),
}))

vi.mock("../lib/structured-log", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock("../lib/execution-pool", () => ({
  withExecutionSlot: vi.fn(),
}))

vi.mock("../lib/mcp-config", () => ({
  prepareTemporaryMcpConfig: vi.fn(),
}))

vi.mock("../lib/provider-settings", () => ({
  getProviderSettings: vi.fn(),
}))

vi.mock("../lib/provider-runtime", () => ({
  applyProviderFeatureFlags: vi.fn((provider: string) => provider),
  startProviderTask: vi.fn(),
}))

vi.mock("../lib/create-entry-inspection", () => ({
  inspectProjectForCreateEntry: vi.fn(),
}))

vi.mock("../lib/create-entry-router", () => ({
  routeCreateEntry: vi.fn(),
}))

vi.mock("../lib/runtime-paths", () => ({
  resolveAppHomeDir: vi.fn(() => "/tmp"),
}))

function template(id: string, name = id): WorkflowTemplate {
  return {
    id,
    name,
    description: `${name} description`,
    stage: "code",
    emoji: "🧪",
    headline: `${name} headline`,
    how: "How",
    input: "Input",
    output: "Output",
    steps: ["One"],
    workflow: {
      version: 1,
      name,
      nodes: [],
      edges: [],
    },
  }
}

describe("templates IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ipcHandlers.clear()
    assertRegisteredProjectPathMock.mockImplementation(
      async (projectPath: string) =>
        projectPath.replace("/tmp/project/../project", "/tmp/project"),
    )
  })

  it("returns popular project templates in catalog order and filters unknown ids", async () => {
    const alpha = template("alpha", "Alpha")
    const beta = template("beta", "Beta")
    listTemplatesMock.mockResolvedValue([alpha, beta])
    listPopularTemplateIdsForProjectMock.mockResolvedValue([
      "missing",
      "beta",
      "alpha",
    ])

    const { registerTemplateHandlers } = await import("./templates")
    registerTemplateHandlers()

    const handler = ipcHandlers.get("templates:list-popular-project") as
      | ((
          event: unknown,
          projectPath: string,
          limit?: number,
        ) => Promise<WorkflowTemplate[]>)
      | undefined
    expect(handler).toBeDefined()

    await expect(
      handler!(undefined, "/tmp/project/../project", 5),
    ).resolves.toEqual([beta, alpha])
    expect(listPopularTemplateIdsForProjectMock).toHaveBeenCalledWith(
      "/tmp/project",
      5,
    )
  })

  it("skips usage tracking when the template id is unknown", async () => {
    listTemplatesMock.mockResolvedValue([template("alpha", "Alpha")])

    const { registerTemplateHandlers } = await import("./templates")
    registerTemplateHandlers()

    const handler = ipcHandlers.get("templates:record-usage") as
      | ((
          event: unknown,
          projectPath: string,
          templateId: string,
        ) => Promise<void>)
      | undefined
    expect(handler).toBeDefined()

    await handler!(undefined, "/tmp/project/../project", "missing")
    expect(recordProjectTemplateUsageMock).not.toHaveBeenCalled()
  })

  it("proxies hub template fetches through the cache layer", async () => {
    const cached = template("hub-template", "Hub Template")
    getHubTemplateMock.mockResolvedValue(cached)

    const { registerTemplateHandlers } = await import("./templates")
    registerTemplateHandlers()

    const handler = ipcHandlers.get("templates:fetch-hub-template") as
      | ((
          event: unknown,
          templateId: string,
        ) => Promise<WorkflowTemplate | null>)
      | undefined
    expect(handler).toBeDefined()

    await expect(handler!(undefined, "hub-template")).resolves.toEqual(cached)
    expect(getHubTemplateMock).toHaveBeenCalledWith("hub-template")
  })

  it("validates user templates before saving them", async () => {
    const safeWorkflow = {
      version: 1,
      name: "Validated",
      nodes: [],
      edges: [],
    }
    parseWorkflowPayloadMock.mockReturnValue(safeWorkflow)

    const { registerTemplateHandlers } = await import("./templates")
    registerTemplateHandlers()

    const handler = ipcHandlers.get("templates:save-user") as
      | ((event: unknown, name: string, workflow: unknown) => Promise<string>)
      | undefined
    expect(handler).toBeDefined()

    const inputWorkflow = {
      version: 1,
      name: "Draft",
      nodes: [],
      edges: [],
    }

    await expect(
      handler!(undefined, "Saved Template", inputWorkflow),
    ).resolves.toBe("/tmp/.c8c/user-templates/saved-template.chain")
    expect(parseWorkflowPayloadMock).toHaveBeenCalledWith(
      inputWorkflow,
      "Workflow template payload",
    )
    expect(saveChainMock).toHaveBeenCalledWith(
      "/tmp/.c8c/user-templates/saved-template.chain",
      {
        ...safeWorkflow,
        name: "Saved Template",
      },
    )
  })
})
