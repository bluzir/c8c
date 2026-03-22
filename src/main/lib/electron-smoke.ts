import {
  app,
  type BrowserWindow,
  type Event as ElectronEvent,
  type WebContentsConsoleMessageEventParams,
} from "electron"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { listWorkflowHilTasks } from "@c8c/workflow-runner"
import {
  type ElectronSmokeArtifact,
  type ElectronSmokeAssertion,
  type ElectronSmokeConsoleEntry,
  type ElectronSmokeExecutionSeedInput,
  type ElectronSmokeMainViewInput,
  type ElectronSmokeScenario,
  type ElectronSmokeScenarioInvariants,
  type ElectronSmokeScenarioReport,
  type ElectronSmokeUiState,
  type ElectronSmokeWorkflowOpenInput,
  isElectronSmokeScenario,
} from "@shared/electron-smoke"
import { listProjectCaseStates } from "./case-store"
import { saveProjectsConfig } from "./projects-config"
import { isTestMode } from "./runtime-paths"
import { listProjectWorkflows } from "./yaml-io"

const RENDERER_SMOKE_STATE_EXPR = `(() => {
  const harness = window.__C8C_RENDERER_SMOKE__;
  if (!harness || typeof harness.getUiState !== "function") {
    return null;
  }
  return harness.getUiState();
})()`

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function recordAssertion(
  assertions: ElectronSmokeAssertion[],
  label: string,
  details?: string,
) {
  assertions.push(details ? { label, details } : { label })
}

function importantConsoleEntry(entry: Pick<ElectronSmokeConsoleEntry, "level">) {
  return entry.level === "warning" || entry.level === "error"
}

export function isAllowlistedElectronSmokeConsoleEntry(
  entry: Pick<ElectronSmokeConsoleEntry, "level" | "message" | "sourceId">,
) {
  void entry
  return false
}

function parseSmokeProjects(rawValue: string | undefined): string[] {
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) return []
    return [...new Set(
      parsed
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => resolve(value)),
    )]
  } catch {
    return []
  }
}

export function resolveElectronSmokeScenario(
  env: NodeJS.ProcessEnv = process.env,
): ElectronSmokeScenario | null {
  const candidate = env.C8C_SMOKE_SCENARIO?.trim()
  return candidate && isElectronSmokeScenario(candidate) ? candidate : null
}

export function shouldShowElectronSmokeWindow(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.C8C_SMOKE_SHOW_WINDOW?.trim() === "1"
}

export function resolveElectronSmokeSeed(env: NodeJS.ProcessEnv = process.env) {
  const projects = parseSmokeProjects(env.C8C_SMOKE_PROJECTS)
  const requestedSelection = env.C8C_SMOKE_SELECTED_PROJECT?.trim()
  const selectedProject = requestedSelection
    ? resolve(requestedSelection)
    : projects[0] ?? null

  return {
    projects,
    selectedProject: selectedProject && projects.includes(selectedProject)
      ? selectedProject
      : projects[0] ?? null,
  }
}

export function resolveElectronSmokeOutputDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.C8C_SMOKE_OUTPUT_DIR?.trim()
  return configured
    ? resolve(configured)
    : resolve(process.cwd(), "output", "ui-smoke")
}

async function readRendererSmokeState(window: BrowserWindow): Promise<ElectronSmokeUiState | null> {
  return window.webContents.executeJavaScript(RENDERER_SMOKE_STATE_EXPR, true) as Promise<ElectronSmokeUiState | null>
}

async function executeRendererScript<T>(window: BrowserWindow, script: string): Promise<T> {
  return window.webContents.executeJavaScript(script, true) as Promise<T>
}

async function readElementText(
  window: BrowserWindow,
  selector: string,
): Promise<string | null> {
  return executeRendererScript<string | null>(
    window,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) return null;
      const text = (element.innerText || element.textContent || "")
        .replace(/\\s+/g, " ")
        .trim();
      return text || null;
    })()`,
  )
}

async function waitForElementText(
  window: BrowserWindow,
  label: string,
  selector: string,
  predicate: (text: string) => boolean,
  timeoutMs = 8_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let lastText: string | null = null

  while (Date.now() < deadline) {
    if (window.isDestroyed()) {
      throw new Error(`Electron smoke window closed while waiting for ${label}.`)
    }

    lastText = await readElementText(window, selector)
    if (lastText && predicate(lastText)) {
      return lastText
    }
    await sleep(120)
  }

  throw new Error(`Timed out waiting for ${label}.${lastText ? ` Last text: ${lastText}` : ""}`)
}

async function waitForUiState(
  window: BrowserWindow,
  label: string,
  predicate: (state: ElectronSmokeUiState) => boolean,
  timeoutMs = 15_000,
): Promise<ElectronSmokeUiState> {
  const deadline = Date.now() + timeoutMs
  let lastState: ElectronSmokeUiState | null = null

  while (Date.now() < deadline) {
    if (window.isDestroyed()) {
      throw new Error(`Electron smoke window closed while waiting for ${label}.`)
    }

    lastState = await readRendererSmokeState(window)
    if (lastState && predicate(lastState)) {
      return lastState
    }
    await sleep(120)
  }

  throw new Error(`Timed out waiting for ${label}.${lastState ? ` Last ui state: ${JSON.stringify(lastState)}` : ""}`)
}

async function waitForMainCondition<T>(
  label: string,
  read: () => Promise<T | null>,
  predicate: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastValue: T | null = null

  while (Date.now() < deadline) {
    lastValue = await read()
    if (lastValue && predicate(lastValue)) {
      return lastValue
    }
    await sleep(120)
  }

  throw new Error(`Timed out waiting for ${label}.${lastValue ? ` Last value: ${JSON.stringify(lastValue)}` : ""}`)
}

async function readWorkspaceRunResult(workspace: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(workspace, "run-result.json"), "utf-8")
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

async function listProjectOpenHumanTasks(projectPath: string) {
  return listWorkflowHilTasks([join(projectPath, ".c8c", "runs")])
}

async function readElementRect(
  window: BrowserWindow,
  selector: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return executeRendererScript(
    window,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width: Math.max(1, Math.ceil(rect.width)),
        height: Math.max(1, Math.ceil(rect.height))
      };
    })()`,
  )
}

async function waitForRendererSmokeMethod(
  window: BrowserWindow,
  methodName: "openWorkflow" | "setMainView" | "seedExecutionState",
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (window.isDestroyed()) {
      throw new Error(`Electron smoke window closed while waiting for ${methodName}.`)
    }

    const isReady = await executeRendererScript<boolean>(
      window,
      `(() => {
        const harness = window.__C8C_RENDERER_SMOKE__;
        return Boolean(harness && typeof harness[${JSON.stringify(methodName)}] === "function");
      })()`,
    )
    if (isReady) {
      return
    }
    await sleep(120)
  }

  throw new Error(`Timed out waiting for renderer smoke method ${methodName}.`)
}

async function callRendererSmokeMethod<T>(
  window: BrowserWindow,
  methodName: "openWorkflow" | "setMainView" | "seedExecutionState",
  input?: ElectronSmokeWorkflowOpenInput | ElectronSmokeMainViewInput | ElectronSmokeExecutionSeedInput,
) {
  await waitForRendererSmokeMethod(window, methodName)
  const invocation = input === undefined
    ? "method.call(harness)"
    : `method.call(harness, ${JSON.stringify(input)})`

  return executeRendererScript<{ ok: boolean; value?: T }>(
    window,
    `(() => {
      const harness = window.__C8C_RENDERER_SMOKE__;
      const method = harness?.[${JSON.stringify(methodName)}];
      if (typeof method !== "function") {
        return { ok: false };
      }
      return Promise.resolve(${invocation}).then((value) => ({ ok: true, value }));
    })()`,
  )
}

async function focusWindow(window: BrowserWindow) {
  if (window.isMinimized()) {
    window.restore()
  }
  if (window.isVisible()) {
    window.focus()
  }
  window.webContents.focus()
  await sleep(80)
}

async function dispatchShortcut(
  window: BrowserWindow,
  {
    key,
    primary = false,
    shift = false,
    alt = false,
  }: {
    key: string
    primary?: boolean
    shift?: boolean
    alt?: boolean
  },
) {
  const useMeta = process.platform === "darwin"
  const metaKey = primary && useMeta
  const ctrlKey = primary && !useMeta

  await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent("keydown", {
      key: ${JSON.stringify(key)},
      metaKey: ${metaKey ? "true" : "false"},
      ctrlKey: ${ctrlKey ? "true" : "false"},
      shiftKey: ${shift ? "true" : "false"},
      altKey: ${alt ? "true" : "false"},
      bubbles: true,
      cancelable: true
    }))`,
    true,
  )
}

async function waitForDomAction(
  window: BrowserWindow,
  label: string,
  script: string,
  timeoutMs = 8_000,
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (window.isDestroyed()) {
      throw new Error(`Electron smoke window closed while waiting for ${label}.`)
    }

    const completed = await executeRendererScript<boolean>(window, script)
    if (completed) {
      return
    }
    await sleep(120)
  }

  throw new Error(`Timed out waiting for ${label}.`)
}

async function clickElementByAriaLabel(window: BrowserWindow, label: string) {
  return waitForDomAction(
    window,
    `aria label ${label}`,
    `(() => {
      const targetLabel = ${JSON.stringify(label)};
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const activateElement = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const eventInit = { bubbles: true, cancelable: true, composed: true, button: 0 };
        element.focus();
        element.dispatchEvent(new PointerEvent("pointerdown", { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        element.dispatchEvent(new MouseEvent("mousedown", eventInit));
        element.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        element.dispatchEvent(new MouseEvent("mouseup", eventInit));
        element.click();
        return true;
      };
      const element = Array.from(document.querySelectorAll("[aria-label]"))
        .find((candidate) => candidate.getAttribute("aria-label") === targetLabel && isVisible(candidate));
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      return activateElement(element);
    })()`,
  )
}

async function clickElementByText(
  window: BrowserWindow,
  text: string,
  selector = "*",
) {
  return waitForDomAction(
    window,
    `text ${text}`,
    `(() => {
      const targetText = ${JSON.stringify(text)};
      const selector = ${JSON.stringify(selector)};
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const activateElement = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const eventInit = { bubbles: true, cancelable: true, composed: true, button: 0 };
        element.focus();
        element.dispatchEvent(new PointerEvent("pointerdown", { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        element.dispatchEvent(new MouseEvent("mousedown", eventInit));
        element.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        element.dispatchEvent(new MouseEvent("mouseup", eventInit));
        element.click();
        return true;
      };
      const matchesTarget = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const rawText = (element.innerText || element.textContent || "").trim();
        if (!rawText) return false;
        const lines = rawText.split("\\n").map((line) => line.trim()).filter(Boolean);
        return rawText === targetText || lines.includes(targetText) || rawText.includes(targetText);
      };
      const element = Array.from(document.querySelectorAll(selector))
        .find((candidate) => isVisible(candidate) && matchesTarget(candidate));
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      return activateElement(element);
    })()`,
  )
}

async function maybeDismissOnboarding(window: BrowserWindow) {
  const hasSkipSetup = await executeRendererScript<boolean>(
    window,
    `(() => Array.from(document.querySelectorAll("button")).some((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      const text = (candidate.innerText || candidate.textContent || "").trim();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0
        && text.includes("Skip setup");
    }))()`,
  )

  if (!hasSkipSetup) return

  await clickElementByText(window, "Skip setup", "button")
  await waitForUiState(
    window,
    "application shell after onboarding",
    (uiState) => uiState.applicationShellVisible && uiState.mainView !== "onboarding",
    8_000,
  )
}

async function openSeededWorkflow(window: BrowserWindow, input: ElectronSmokeWorkflowOpenInput) {
  const result = await callRendererSmokeMethod<boolean>(window, "openWorkflow", input)
  assertSmoke(result.ok && result.value !== false, `Failed to open smoke flow ${input.workflowPath}.`)
}

async function setSmokeMainView(window: BrowserWindow, input: ElectronSmokeMainViewInput) {
  const result = await callRendererSmokeMethod<boolean>(window, "setMainView", input)
  assertSmoke(result.ok && result.value !== false, `Failed to open smoke main view ${input.mainView}.`)
}

async function seedSmokeExecutionState(window: BrowserWindow, input: ElectronSmokeExecutionSeedInput) {
  const result = await callRendererSmokeMethod<boolean>(window, "seedExecutionState", input)
  assertSmoke(result.ok && result.value !== false, "Failed to seed smoke execution state.")
}

async function resolveSeededProjectWorkflows(
  scenario: ElectronSmokeScenario,
  minCount: number,
) {
  const seed = resolveElectronSmokeSeed()
  assertSmoke(seed.selectedProject, `${scenario} requires a selected project.`)
  const workflows = await listProjectWorkflows(seed.selectedProject)
  assertSmoke(
    workflows.length >= minCount,
    `${scenario} requires at least ${minCount} seeded flow${minCount === 1 ? "" : "s"}.`,
  )
  return {
    projectPath: seed.selectedProject,
    workflows,
  }
}

async function waitForSeededProjectReady(
  window: BrowserWindow,
  projectPath: string,
  expectedWorkflowNames: string[] = [],
) {
  return waitForUiState(
    window,
    "seeded project ready",
    (state) =>
      state.applicationShellVisible
      && state.projectCount > 0
      && state.selectedProject === projectPath
      && expectedWorkflowNames.every((workflowName) => state.availableWorkflowNames.includes(workflowName)),
  )
}

function findWorkflowByName(
  workflows: Array<{ name: string; path: string }>,
  workflowName: string,
) {
  return workflows.find((workflow) => workflow.name === workflowName) || null
}

interface ScenarioExecutionResult {
  uiState: ElectronSmokeUiState
  invariants: ElectronSmokeScenarioInvariants
}

async function assertLaunchEmptyScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const matchesEmptyShell = (state: ElectronSmokeUiState) =>
    state.applicationShellVisible
    && state.sidebarVisible
    && state.mainView === "thread"
    && state.firstLaunch === false
    && state.projectCount === 0
    && state.selectedProject === null

  let state: ElectronSmokeUiState

  try {
    state = await waitForUiState(window, "empty shell", matchesEmptyShell)
  } catch {
    await maybeDismissOnboarding(window)
    state = await waitForUiState(window, "empty shell after onboarding", matchesEmptyShell)
  }

  recordAssertion(assertions, "Opened app shell in empty state", `mainView=${state.mainView}, projects=${state.projectCount}`)
  return {
    uiState: state,
    invariants: {
      kind: "launch-empty",
      projectCount: state.projectCount,
      mainView: state.mainView,
      selectedProject: state.selectedProject,
    },
  }
}

async function assertSeededProjectSidebarScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const seed = resolveElectronSmokeSeed()
  assertSmoke(seed.projects.length > 0, "seeded-project-sidebar requires at least one seeded project.")
  assertSmoke(seed.selectedProject, "seeded-project-sidebar requires a selected project.")

  const state = await waitForUiState(
    window,
    "seeded project sidebar",
    (state) =>
      state.applicationShellVisible
      && state.sidebarVisible
      && state.projectCount === seed.projects.length
      && state.selectedProject === seed.selectedProject,
  )
  recordAssertion(assertions, "Loaded seeded project sidebar", `selectedProject=${state.selectedProject}`)
  return {
    uiState: state,
    invariants: {
      kind: "seeded-project-sidebar",
      projectCount: state.projectCount,
      selectedProject: state.selectedProject,
      sidebarVisible: state.sidebarVisible,
    },
  }
}

async function assertCommandPaletteToggleScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  await waitForUiState(
    window,
    "command palette closed baseline",
    (state) => state.applicationShellVisible && state.commandPaletteOpen === false,
  )
  recordAssertion(assertions, "Started with command palette closed")
  await focusWindow(window)
  await dispatchShortcut(window, { key: "k", primary: true })
  const state = await waitForUiState(
    window,
    "command palette open state",
    (state) => state.commandPaletteOpen && state.commandPaletteVisible,
  )
  recordAssertion(assertions, "Opened command palette with primary shortcut")
  return {
    uiState: state,
    invariants: {
      kind: "command-palette-toggle",
      openedWithShortcut: true,
      commandPaletteVisible: state.commandPaletteVisible,
    },
  }
}

async function assertSettingsNavigationScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  await waitForUiState(
    window,
    "settings shortcut baseline",
    (state) => state.applicationShellVisible && state.mainView === "thread" && state.settingsPageVisible === false,
  )
  recordAssertion(assertions, "Started from thread surface before opening settings")
  await focusWindow(window)
  await dispatchShortcut(window, { key: ",", primary: true })
  const state = await waitForUiState(
    window,
    "settings page visible",
    (state) => state.mainView === "settings" && state.settingsPageVisible,
  )
  recordAssertion(assertions, "Opened settings with primary shortcut", `mainView=${state.mainView}`)
  return {
    uiState: state,
    invariants: {
      kind: "settings-navigation",
      openedWithShortcut: true,
      mainViewAfterShortcut: state.mainView,
      settingsPageVisible: state.settingsPageVisible,
    },
  }
}

async function assertQuickSwitchShortcutsScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const { projectPath, workflows } = await resolveSeededProjectWorkflows("quick-switch-shortcuts", 2)
  const alphaWorkflow = findWorkflowByName(workflows, "Alpha flow") || workflows[0]
  const betaWorkflow = findWorkflowByName(workflows, "Beta flow") || workflows[1]

  await openSeededWorkflow(window, {
    projectPath,
    workflowPath: alphaWorkflow.path,
  })
  await waitForUiState(
    window,
    "quick switch shortcuts ready",
    (state) =>
      state.applicationShellVisible
      && state.currentWorkflowName === alphaWorkflow.name
      && state.selectedWorkflowPath === alphaWorkflow.path
      && state.availableWorkflowNames.includes(alphaWorkflow.name)
      && state.availableWorkflowNames.includes(betaWorkflow.name),
  )
  recordAssertion(assertions, "Prepared quick switch shortcuts", `${alphaWorkflow.name}, ${betaWorkflow.name}`)

  await focusWindow(window)
  await dispatchShortcut(window, { key: "2", primary: true })
  const shortcutState = await waitForUiState(
    window,
    "quick switched flow",
    (state) =>
      state.currentWorkflowName === betaWorkflow.name
      && state.selectedWorkflowPath === betaWorkflow.path,
  )
  recordAssertion(assertions, "Switched flows with primary+2", `selected=${betaWorkflow.name}`)

  await dispatchShortcut(window, { key: "1", primary: true })
  const finalState = await waitForUiState(
    window,
    "quick switch return shortcut",
    (state) =>
      state.currentWorkflowName === alphaWorkflow.name
      && state.selectedWorkflowPath === alphaWorkflow.path,
  )
  recordAssertion(assertions, "Switched flows with primary+1", `selected=${alphaWorkflow.name}`)
  return {
    uiState: finalState,
    invariants: {
      kind: "quick-switch-shortcuts",
      workflowNames: [alphaWorkflow.name, betaWorkflow.name],
      selectedInitially: alphaWorkflow.name,
      selectedAfterShortcut: shortcutState.currentWorkflowName,
      selectedAfterReturnShortcut: finalState.currentWorkflowName,
    },
  }
}

async function assertApprovalDialogScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const { projectPath, workflows } = await resolveSeededProjectWorkflows("approval-dialog", 1)
  const approvalWorkflow = findWorkflowByName(workflows, "Approval flow") || workflows[0]

  await waitForSeededProjectReady(window, projectPath, [approvalWorkflow.name])
  await openSeededWorkflow(window, {
    projectPath,
    workflowPath: approvalWorkflow.path,
    viewMode: "list",
  })
  await waitForUiState(
    window,
    "approval flow open",
    (state) =>
      state.applicationShellVisible
      && state.currentWorkflowName === approvalWorkflow.name
      && state.selectedWorkflowPath === approvalWorkflow.path
      && state.viewMode === "list",
  )

  await seedSmokeExecutionState(window, {
    workflowKey: approvalWorkflow.path,
    state: {
      runId: "run-approval-dialog",
      runStatus: "paused",
      runWorkflowPath: approvalWorkflow.path,
      workflowName: approvalWorkflow.name,
      projectPath,
      activeNodeId: "approval",
    },
    approvalRequests: [
      {
        workflowKey: approvalWorkflow.path,
        runId: "run-approval-dialog",
        nodeId: "approval",
        content: "Plan draft ready for review.",
        message: "Review the generated plan before the flow continues.",
        allowEdit: false,
      },
    ],
  })
  await waitForUiState(
    window,
    "approval dialog open",
    (state) => state.approvalDialogOpen && state.currentWorkflowName === approvalWorkflow.name,
  )
  recordAssertion(assertions, "Opened approval dialog from seeded execution state")

  await focusWindow(window)
  await dispatchShortcut(window, { key: "Enter", primary: true })
  const state = await waitForUiState(
    window,
    "approval dialog closed",
    (state) => state.currentWorkflowName === approvalWorkflow.name && state.approvalDialogOpen === false,
  )
  recordAssertion(assertions, "Approved dialog with primary+Enter")
  return {
    uiState: state,
    invariants: {
      kind: "approval-dialog",
      workflowName: approvalWorkflow.name,
      dialogOpened: true,
      dialogClosedAfterShortcut: state.approvalDialogOpen === false,
    },
  }
}

async function assertCreateReadyContinuationScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const seed = resolveElectronSmokeSeed()
  assertSmoke(seed.selectedProject, "create-ready-continuation requires a selected project.")

  await waitForSeededProjectReady(window, seed.selectedProject)
  await setSmokeMainView(window, {
    mainView: "workflow_create",
    projectPath: seed.selectedProject,
  })

  const state = await waitForUiState(
    window,
    "create page visible",
    (uiState) =>
      uiState.applicationShellVisible
      && uiState.mainView === "workflow_create"
      && uiState.selectedProject === seed.selectedProject,
  )

  const continuationText = await waitForElementText(
    window,
    "ready continuation card",
    '[aria-label="Continue saved work"]',
    (text) =>
      text.includes("Checkout polish")
      && text.includes("Research the Change")
      && text.includes("Latest check: Project brief saved. Research can continue."),
  )
  assertSmoke(
    continuationText.includes("Latest check: Project brief saved. Research can continue."),
    "Ready continuation should show the durable latest check.",
  )
  assertSmoke(
    continuationText.includes("Continue work"),
    "Ready continuation should expose Continue work.",
  )
  recordAssertion(assertions, "Opened create page from persisted project state")
  recordAssertion(assertions, "Rendered ready continuation from durable result and case state", "Checkout polish -> Research the Change")

  return {
    uiState: state,
    invariants: {
      kind: "create-ready-continuation",
      title: "Checkout polish",
      readinessText: "Project Brief from Shape / Map -> Research the Change",
      actionLabel: "Continue work",
      latestCheckText: "Project brief saved. Research can continue.",
    },
  }
}

async function assertBlockedRelaunchScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const { projectPath, workflows } = await resolveSeededProjectWorkflows("blocked-relaunch", 1)
  const blockedWorkflow = findWorkflowByName(workflows, "Blocked approval flow") || workflows[0]

  await waitForSeededProjectReady(window, projectPath, [blockedWorkflow.name])
  await setSmokeMainView(window, {
    mainView: "workflow_create",
    projectPath,
  })
  await waitForUiState(
    window,
    "blocked create page visible",
    (uiState) =>
      uiState.applicationShellVisible
      && uiState.mainView === "workflow_create"
      && uiState.selectedProject === projectPath,
  )

  const createContinuationText = await waitForElementText(
    window,
    "blocked continuation card",
    '[aria-label="Continue saved work"]',
    (text) =>
      text.includes("Checkout polish")
      && text.includes("Open approval")
      && text.includes("Waiting on you"),
  )
  assertSmoke(
    createContinuationText.includes("Approval pending. Review block before verification continues."),
    "Blocked continuation should show the durable approval check.",
  )
  recordAssertion(assertions, "Rendered blocked continuation on create page", "Checkout polish waiting on approval")

  await clickElementByText(window, "Open approval", "button")
  const state = await waitForUiState(
    window,
    "blocked flow shell open",
    (uiState) =>
      uiState.applicationShellVisible
      && uiState.mainView === "thread"
      && uiState.currentWorkflowName === blockedWorkflow.name
      && uiState.selectedWorkflowPath === blockedWorkflow.path
      && uiState.viewMode === "list",
  )

  const taskPanelText = await waitForElementText(
    window,
    "blocked task panel",
    '[data-blocked-task-panel="true"]',
    (text) =>
      text.includes("Step input")
      && text.includes("On approve")
      && text.includes("On reject")
      && text.includes("Approve & Continue")
      && text.includes("Reject"),
  )
  recordAssertion(assertions, "Opened blocked work into the same flow shell", blockedWorkflow.name)
  recordAssertion(assertions, "Rendered embedded blocked task panel", "Approve & Continue")

  return {
    uiState: state,
    invariants: {
      kind: "blocked-relaunch",
      workflowName: blockedWorkflow.name,
      createActionLabel: "Open approval",
      blockedHeaderVisible: false,
      blockedTaskVisible: taskPanelText.includes("Approve & Continue"),
      statusText: "Blocked",
      reasonText: "Confirm whether the checkout polish is ready for verification.",
    },
  }
}

async function assertFactoryThinBridgeScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const seed = resolveElectronSmokeSeed()
  assertSmoke(seed.selectedProject, "factory-thin-bridge requires a selected project.")

  await waitForSeededProjectReady(window, seed.selectedProject)
  await setSmokeMainView(window, {
    mainView: "workflow_create",
    projectPath: seed.selectedProject,
  })
  await waitForUiState(
    window,
    "ready create page visible",
    (uiState) =>
      uiState.applicationShellVisible
      && uiState.mainView === "workflow_create"
      && uiState.selectedProject === seed.selectedProject,
  )

  const createContinuationText = await waitForElementText(
    window,
    "ready continuation card",
    '[aria-label="Continue saved work"]',
    (text) =>
      text.includes("Checkout polish")
      && text.includes("Research the Change")
      && text.includes("Latest check: Project brief saved. Research can continue."),
  )
  recordAssertion(assertions, "Rendered the same saved work on create surface", "Checkout polish")

  await setSmokeMainView(window, {
    mainView: "factory",
    projectPath: seed.selectedProject,
  })
  await waitForUiState(
    window,
    "factory page visible",
    (uiState) =>
      uiState.applicationShellVisible
      && uiState.mainView === "factory"
      && uiState.selectedProject === seed.selectedProject,
  )

  const caseDetailText = await waitForElementText(
    window,
    "factory case detail",
    '[data-factory-case-shell="true"]',
    (text) =>
      text.includes("Checkout polish")
      && text.includes("Project Brief")
      && text.includes("Project brief saved. Research can continue.")
      && text.includes("Continue in runtime shell"),
  )
  assertSmoke(
    createContinuationText.includes("Checkout polish")
      && caseDetailText.includes("Checkout polish")
      && createContinuationText.includes("Project brief saved. Research can continue.")
      && caseDetailText.includes("Project brief saved. Research can continue."),
    "Factory should preserve the same saved-work meaning as the create surface.",
  )
  recordAssertion(assertions, "Rendered saved work in factory as a real substrate view", "Checkout polish -> Project Brief")

  await clickElementByText(window, "Continue in runtime shell", "button")
  const state = await waitForUiState(
    window,
    "runtime shell open from factory",
    (uiState) =>
      uiState.applicationShellVisible
      && uiState.mainView === "thread"
      && uiState.currentWorkflowName === "Delivery Lab: Research the Change"
      && uiState.selectedProject === seed.selectedProject,
  )

  const resumeHeaderText = await waitForElementText(
    window,
    "runtime shell resume header",
    '[data-workflow-resume-header="true"]',
    (text) =>
      text.includes("Project Brief")
      && text.includes("Attached")
      && text.includes("Status")
      && text.includes("Continue"),
  )
  recordAssertion(assertions, "Continued from factory into runtime shell", "Delivery Lab: Research the Change")
  await waitForElementText(
    window,
    "runtime shell results",
    "body",
    (text) =>
      text.includes("Project Brief")
      && text.includes("Attached"),
  )
  recordAssertion(assertions, "Rendered attached saved result in runtime shell", "Project Brief")

  return {
    uiState: state,
    invariants: {
      kind: "factory-thin-bridge",
      workLabel: "Checkout polish",
      latestResult: "Project Brief",
      latestCheckText: "Project brief saved. Research can continue.",
      actionLabel: "Continue in runtime shell",
      runtimeWorkflowName: state.currentWorkflowName || "Delivery Lab: Research the Change",
    },
  }
}

async function openBlockedApprovalInThread(
  window: BrowserWindow,
  scenario: "blocked-approve-resolution" | "blocked-reject-resolution",
  assertions: ElectronSmokeAssertion[],
) {
  const { projectPath, workflows } = await resolveSeededProjectWorkflows(scenario, 1)
  const blockedWorkflow = findWorkflowByName(workflows, "Blocked approval flow") || workflows[0]

  await waitForSeededProjectReady(window, projectPath, [blockedWorkflow.name])
  await setSmokeMainView(window, {
    mainView: "workflow_create",
    projectPath,
  })
  await waitForUiState(
    window,
    `${scenario} create page visible`,
    (uiState) =>
      uiState.applicationShellVisible
      && uiState.mainView === "workflow_create"
      && uiState.selectedProject === projectPath,
  )

  await waitForElementText(
    window,
    `${scenario} continuation card`,
    '[aria-label="Continue saved work"]',
    (text) =>
      text.includes("Checkout polish")
      && text.includes("Open approval")
      && text.includes("Waiting on you"),
  )
  await clickElementByText(window, "Open approval", "button")
  const uiState = await waitForUiState(
    window,
    `${scenario} blocked flow shell open`,
    (state) =>
      state.applicationShellVisible
      && state.mainView === "thread"
      && state.currentWorkflowName === blockedWorkflow.name
      && state.selectedWorkflowPath === blockedWorkflow.path
      && state.viewMode === "list",
  )

  await waitForElementText(
    window,
    `${scenario} blocked task panel`,
    '[data-blocked-task-panel="true"]',
    (text) =>
      text.includes("Step input")
      && text.includes("On approve")
      && text.includes("On reject")
      && text.includes("Approve & Continue")
      && text.includes("Reject"),
  )
  recordAssertion(assertions, "Opened blocked approval in runtime shell", blockedWorkflow.name)

  return {
    projectPath,
    blockedWorkflow,
    uiState,
  }
}

async function assertBlockedApproveResolutionScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const { projectPath, blockedWorkflow, uiState } = await openBlockedApprovalInThread(
    window,
    "blocked-approve-resolution",
    assertions,
  )
  const caseStateBefore = (await listProjectCaseStates(projectPath))
    .find((entry) => entry.workLabel === "Checkout polish") || null
  assertSmoke(caseStateBefore?.workflowPath, "blocked-approve-resolution requires a case state workflow path.")
  const workspace = join(projectPath, ".c8c", "runs", "run-blocked-approval")

  await clickElementByText(window, "Approve & Continue", "button")

  const completedRun = await waitForMainCondition(
    "approval resume result",
    () => readWorkspaceRunResult(workspace),
    (result) => result.status === "completed",
  )
  const resolvedCaseState = await waitForMainCondition(
    "approved case state",
    async () => {
      const states = await listProjectCaseStates(projectPath)
      return states.find((entry) => entry.workLabel === "Checkout polish") || null
    },
    (state) => state.continuationStatus === "ready" && state.lastGate?.outcome === "passed",
  )
  const openTasks = await waitForMainCondition(
    "closed approval tasks",
    () => listProjectOpenHumanTasks(projectPath),
    (tasks) => tasks.length === 0,
  )
  await waitForElementText(
    window,
    "post-approval runtime shell",
    "body",
    (text) =>
      (text.includes("Create follow-up flow") || text.includes("Start next flow") || text.includes("Continue with Agent"))
      && text.includes("View activity")
      && !text.includes("Approve & Continue")
      && !text.includes("On approve"),
  )
  const hasCompetingRunButton = await executeRendererScript<boolean>(
    window,
    `(() => {
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      return Array.from(document.querySelectorAll('[aria-label="Run controls"] button'))
        .some((candidate) => isVisible(candidate) && ((candidate.innerText || candidate.textContent || "").trim() === "Run"));
    })()`,
  )
  assertSmoke(!hasCompetingRunButton, "Completed result should own the next action instead of leaving the toolbar Run visible.")

  recordAssertion(assertions, "Approved blocked work and finished the suspended run", blockedWorkflow.name)
  recordAssertion(assertions, "Persisted approval pass into durable case state", resolvedCaseState.lastGate?.summaryText || "Approval recorded")
  recordAssertion(assertions, "Completed result exposes a follow-up flow CTA", "Create follow-up flow / Start next flow")
  recordAssertion(assertions, "Completed result still exposes a drill-down path", "View activity")

  return {
    uiState,
    invariants: {
      kind: "blocked-approve-resolution",
      workflowName: blockedWorkflow.name,
      finalRunStatus: String(completedRun.status || ""),
      continuationStatus: resolvedCaseState.continuationStatus,
      openTaskCount: openTasks.length,
    },
  }
}

async function assertBlockedRejectResolutionScenario(
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  const { projectPath, blockedWorkflow, uiState } = await openBlockedApprovalInThread(
    window,
    "blocked-reject-resolution",
    assertions,
  )

  await clickElementByText(window, "Reject", "button")

  const resolvedCaseState = await waitForMainCondition(
    "rejected case state",
    async () => {
      const states = await listProjectCaseStates(projectPath)
      return states.find((entry) => entry.workLabel === "Checkout polish") || null
    },
    (state) => state.continuationStatus === "blocked_by_check" && state.lastGate?.outcome === "rejected",
  )
  const openTasks = await waitForMainCondition(
    "cleared rejected approval tasks",
    () => listProjectOpenHumanTasks(projectPath),
    (tasks) => tasks.length === 0,
  )

  await setSmokeMainView(window, {
    mainView: "factory",
    projectPath,
  })
  await waitForUiState(
    window,
    "factory visible after reject",
    (state) =>
      state.applicationShellVisible
      && state.mainView === "factory"
      && state.selectedProject === projectPath,
  )
  await waitForElementText(
    window,
    "rejected factory case detail",
    '[data-factory-case-shell="true"]',
    (text) =>
      text.includes("Checkout polish")
      && text.includes("rejected and is blocked")
      && !text.includes("Continue in runtime shell"),
  )

  recordAssertion(assertions, "Rejected blocked work and cleared the open approval task", blockedWorkflow.name)
  recordAssertion(assertions, "Persisted rejection into durable blocked state", resolvedCaseState.lastGate?.summaryText || "Rejected")

  return {
    uiState,
    invariants: {
      kind: "blocked-reject-resolution",
      workflowName: blockedWorkflow.name,
      continuationStatus: resolvedCaseState.continuationStatus,
      lastGateOutcome: resolvedCaseState.lastGate?.outcome || "",
      openTaskCount: openTasks.length,
    },
  }
}

async function executeScenario(
  scenario: ElectronSmokeScenario,
  window: BrowserWindow,
  assertions: ElectronSmokeAssertion[],
): Promise<ScenarioExecutionResult> {
  if (scenario !== "launch-empty") {
    await maybeDismissOnboarding(window)
  }
  if (scenario === "launch-empty") {
    return assertLaunchEmptyScenario(window, assertions)
  }
  if (scenario === "seeded-project-sidebar") {
    return assertSeededProjectSidebarScenario(window, assertions)
  }
  if (scenario === "command-palette-toggle") {
    return assertCommandPaletteToggleScenario(window, assertions)
  }
  if (scenario === "settings-navigation") {
    return assertSettingsNavigationScenario(window, assertions)
  }
  if (scenario === "quick-switch-shortcuts") {
    return assertQuickSwitchShortcutsScenario(window, assertions)
  }
  if (scenario === "approval-dialog") {
    return assertApprovalDialogScenario(window, assertions)
  }
  if (scenario === "create-ready-continuation") {
    return assertCreateReadyContinuationScenario(window, assertions)
  }
  if (scenario === "blocked-relaunch") {
    return assertBlockedRelaunchScenario(window, assertions)
  }
  if (scenario === "factory-thin-bridge") {
    return assertFactoryThinBridgeScenario(window, assertions)
  }
  if (scenario === "blocked-approve-resolution") {
    return assertBlockedApproveResolutionScenario(window, assertions)
  }
  return assertBlockedRejectResolutionScenario(window, assertions)
}

export async function prepareElectronSmokeLaunchState(
  env: NodeJS.ProcessEnv = process.env,
) {
  const scenario = resolveElectronSmokeScenario(env)
  if (!scenario) return null
  if (!isTestMode(env)) {
    throw new Error("Electron smoke scenarios require C8C_TEST_MODE=1.")
  }

  const seed = resolveElectronSmokeSeed(env)
  await Promise.all(seed.projects.map((projectPath) => mkdir(projectPath, { recursive: true })))
  await saveProjectsConfig({
    projects: seed.projects,
    lastSelectedProject: seed.selectedProject ?? undefined,
  })

  return {
    scenario,
    outputDir: resolveElectronSmokeOutputDir(env),
    ...seed,
  }
}

let activeSmokeRun: Promise<void> | null = null

function consoleEntryLevel(
  level: WebContentsConsoleMessageEventParams["level"],
): ElectronSmokeConsoleEntry["level"] {
  if (level === "error") return "error"
  if (level === "warning") return "warning"
  if (level === "info") return "info"
  return "verbose"
}

function focusSelectorsForScenario(scenario: ElectronSmokeScenario) {
  switch (scenario) {
    case "seeded-project-sidebar":
      return [{ label: "project-sidebar", selector: '[aria-label="Project sidebar"]' }]
    case "command-palette-toggle":
      return [{ label: "command-palette", selector: '[aria-label="Command palette"]' }]
    case "settings-navigation":
      return [{ label: "settings-page", selector: 'h1' }]
    case "quick-switch-shortcuts":
      return [{ label: "application-shell", selector: '[role="application"][aria-label="c8c"]' }]
    case "approval-dialog":
      return [{ label: "approval-dialog", selector: '[role="dialog"]' }]
    case "create-ready-continuation":
      return [{ label: "create-ready-continuation", selector: '[aria-label="Continue saved work"]' }]
    case "blocked-relaunch":
      return [
        { label: "blocked-resume-header", selector: '[data-workflow-resume-header="true"]' },
        { label: "blocked-task-panel", selector: '[data-blocked-task-panel="true"]' },
      ]
    case "factory-thin-bridge":
      return [
        { label: "factory-case-detail", selector: '[data-factory-case-shell="true"]' },
        { label: "runtime-resume-header", selector: '[data-workflow-resume-header="true"]' },
      ]
    case "blocked-approve-resolution":
      return [
        { label: "blocked-task-panel", selector: '[data-blocked-task-panel="true"]' },
        { label: "workflow-runtime", selector: '[role="application"][aria-label="c8c"]' },
      ]
    case "blocked-reject-resolution":
      return [
        { label: "factory-case-detail", selector: '[data-factory-case-shell="true"]' },
      ]
    default:
      return [{ label: "application-shell", selector: '[role="application"][aria-label="c8c"]' }]
  }
}

async function captureFocusedArtifacts(
  window: BrowserWindow,
  scenario: ElectronSmokeScenario,
  outputDir: string,
) {
  const artifacts: ElectronSmokeArtifact[] = []

  for (const target of focusSelectorsForScenario(scenario)) {
    try {
      const rect = await readElementRect(window, target.selector)
      if (!rect) continue
      const image = await window.webContents.capturePage(rect)
      const artifactPath = join(outputDir, `focus-${target.label}.png`)
      await writeFile(artifactPath, image.toPNG())
      artifacts.push({
        label: target.label,
        path: artifactPath,
      })
    } catch {
      // Ignore focused capture failures and keep the broader report.
    }
  }

  return artifacts
}

export function runElectronSmokeScenarioIfRequested(window: BrowserWindow) {
  const scenario = resolveElectronSmokeScenario()
  if (!scenario || activeSmokeRun) return

  activeSmokeRun = (async () => {
    const outputDir = resolveElectronSmokeOutputDir()
    const screenshotPath = join(outputDir, "screenshot.png")
    const reportPath = join(outputDir, "report.json")
    const startedAt = new Date().toISOString()
    let finalState: ElectronSmokeUiState | null = null
    let invariants: ElectronSmokeScenarioInvariants | null = null
    const assertions: ElectronSmokeAssertion[] = []
    const rawRendererConsole: ElectronSmokeConsoleEntry[] = []

    await mkdir(outputDir, { recursive: true })

    const onConsoleMessage = (
      details: ElectronEvent<WebContentsConsoleMessageEventParams>,
    ) => {
      rawRendererConsole.push({
        level: consoleEntryLevel(details.level),
        message: details.message,
        lineNumber: details.lineNumber,
        sourceId: details.sourceId,
        timestamp: new Date().toISOString(),
      })
    }
    window.webContents.on("console-message", onConsoleMessage)

    try {
      const result = await executeScenario(scenario, window, assertions)
      finalState = result.uiState
      invariants = result.invariants
      const image = await window.webContents.capturePage()
      await writeFile(screenshotPath, image.toPNG())
      const importantRendererConsole = rawRendererConsole.filter(importantConsoleEntry)
      const ignoredRendererConsole = importantRendererConsole.filter(isAllowlistedElectronSmokeConsoleEntry)
      const unexpectedRendererConsole = importantRendererConsole.filter((entry) => !isAllowlistedElectronSmokeConsoleEntry(entry))
      const report: ElectronSmokeScenarioReport = {
        scenario,
        ok: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        screenshotPath,
        uiState: finalState,
        assertions,
        rendererConsole: unexpectedRendererConsole,
        ignoredRendererConsole,
        invariants,
      }
      await writeFile(reportPath, JSON.stringify(report, null, 2))
      app.exit(0)
    } catch (error) {
      let artifacts: ElectronSmokeArtifact[] = []
      try {
        finalState = finalState ?? await readRendererSmokeState(window)
      } catch {
        // Ignore secondary state capture failures while building the failure report.
      }

      try {
        const image = await window.webContents.capturePage()
        await writeFile(screenshotPath, image.toPNG())
      } catch {
        // Ignore screenshot failures; the JSON report still captures the error.
      }

      artifacts = await captureFocusedArtifacts(window, scenario, outputDir)
      recordAssertion(assertions, "Scenario failed", error instanceof Error ? error.message : String(error))
      const importantRendererConsole = rawRendererConsole.filter(importantConsoleEntry)
      const ignoredRendererConsole = importantRendererConsole.filter(isAllowlistedElectronSmokeConsoleEntry)
      const unexpectedRendererConsole = importantRendererConsole.filter((entry) => !isAllowlistedElectronSmokeConsoleEntry(entry))

      const report: ElectronSmokeScenarioReport = {
        scenario,
        ok: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        screenshotPath,
        uiState: finalState,
        assertions,
        rendererConsole: unexpectedRendererConsole,
        ignoredRendererConsole,
        invariants,
        artifacts,
        error: error instanceof Error ? error.message : String(error),
      }
      await writeFile(reportPath, JSON.stringify(report, null, 2))
      app.exit(1)
    } finally {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.off("console-message", onConsoleMessage)
      }
    }
  })()
}
