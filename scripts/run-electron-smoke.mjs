import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createWorkflowRunner } from "@c8c/workflow-runner"

const SCENARIOS = [
  "launch-empty",
  "seeded-project-sidebar",
  "command-palette-toggle",
  "settings-navigation",
  "quick-switch-shortcuts",
  "approval-dialog",
  "create-ready-continuation",
  "blocked-relaunch",
  "factory-thin-bridge",
  "blocked-approve-resolution",
  "blocked-reject-resolution",
]

const require = createRequire(import.meta.url)
const electronBinary = require("electron")
const scriptDir = fileURLToPath(new URL(".", import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const artifactRoot = resolve(repoRoot, "output", "ui-smoke")
let ensuredTestBuild = null

function printHelp() {
  process.stdout.write(`Usage: node scripts/run-electron-smoke.mjs [all|<scenario>] [options]

Options:
  --scenario <name>                 Run a single smoke scenario
  --scenario=<name>                 Run a single smoke scenario
  --show-window                     Show the Electron window during smoke
  --json                            Print a JSON summary to stdout
  --keep-artifacts-on-success       Keep output/ui-smoke/<scenario> on success
  --no-keep-artifacts-on-success    Remove successful scenario artifacts
  --help                            Show this help
`)
}

function resolveScenarioSelection(requested) {
  if (!requested || requested === "all") return SCENARIOS
  if (!SCENARIOS.includes(requested)) {
    throw new Error(`Unknown Electron smoke scenario: ${requested}`)
  }
  return [requested]
}

function parseCliOptions(argv, env = process.env) {
  let requestedScenario = null
  let showWindow = env.C8C_SMOKE_SHOW_WINDOW === "1"
  let json = false
  let keepArtifactsOnSuccess = env.C8C_SMOKE_KEEP_ARTIFACTS_ON_SUCCESS === "1" || !env.CI

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help") {
      printHelp()
      process.exit(0)
    }
    if (arg === "--json") {
      json = true
      continue
    }
    if (arg === "--show-window") {
      showWindow = true
      continue
    }
    if (arg === "--keep-artifacts-on-success") {
      keepArtifactsOnSuccess = true
      continue
    }
    if (arg === "--no-keep-artifacts-on-success") {
      keepArtifactsOnSuccess = false
      continue
    }
    if (arg === "--scenario") {
      const nextArg = argv[index + 1]?.trim()
      if (!nextArg) {
        throw new Error("--scenario requires a value")
      }
      requestedScenario = nextArg
      index += 1
      continue
    }
    if (arg.startsWith("--scenario=")) {
      requestedScenario = arg.slice("--scenario=".length).trim()
      continue
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`)
    }
    if (requestedScenario) {
      throw new Error(`Unexpected extra positional argument: ${arg}`)
    }
    requestedScenario = arg.trim()
  }

  return {
    scenarios: resolveScenarioSelection(requestedScenario),
    showWindow,
    json,
    keepArtifactsOnSuccess,
  }
}

function buildWorkflowNode(id, type, x, y, config) {
  return {
    id,
    type,
    position: { x, y },
    config,
  }
}

function buildLinearWorkflow(name, skillRef) {
  return {
    version: 1,
    name,
    description: `${name} smoke fixture`,
    nodes: [
      buildWorkflowNode("input", "input", 0, 120, {
        inputType: "text",
        required: true,
      }),
      buildWorkflowNode("skill-main", "skill", 280, 120, {
        skillRef,
        prompt: `Run ${skillRef}`,
      }),
      buildWorkflowNode("output", "output", 560, 120, {
        title: `${name} output`,
        format: "markdown",
      }),
    ],
    edges: [
      { id: "e-input-skill-main", source: "input", target: "skill-main", type: "default" },
      { id: "e-skill-main-output", source: "skill-main", target: "output", type: "default" },
    ],
  }
}

function buildApprovalWorkflow(name) {
  return {
    version: 1,
    name,
    description: `${name} smoke fixture`,
    nodes: [
      buildWorkflowNode("input", "input", 0, 120, {
        inputType: "text",
        required: true,
      }),
      buildWorkflowNode("skill-plan", "skill", 260, 120, {
        skillRef: "research/plan",
        prompt: "Draft the plan to review",
      }),
      buildWorkflowNode("approval", "approval", 520, 120, {
        message: "Review and approve this step before continuing.",
        show_content: true,
        allow_edit: false,
      }),
      buildWorkflowNode("output", "output", 780, 120, {
        title: `${name} output`,
        format: "markdown",
      }),
    ],
    edges: [
      { id: "e-input-skill-plan", source: "input", target: "skill-plan", type: "default" },
      { id: "e-skill-plan-approval", source: "skill-plan", target: "approval", type: "default" },
      { id: "e-approval-output", source: "approval", target: "output", type: "default" },
    ],
  }
}

function buildSuspendedApprovalWorkflow(name, message) {
  return {
    version: 1,
    name,
    description: `${name} smoke fixture`,
    nodes: [
      buildWorkflowNode("input", "input", 0, 120, {
        inputType: "text",
        required: true,
      }),
      buildWorkflowNode("approval", "approval", 300, 120, {
        message,
        show_content: true,
        allow_edit: false,
      }),
      buildWorkflowNode("output", "output", 600, 120, {
        title: `${name} output`,
        format: "markdown",
      }),
    ],
    edges: [
      { id: "e-input-approval", source: "input", target: "approval", type: "default" },
      { id: "e-approval-output", source: "approval", target: "output", type: "default" },
    ],
  }
}

async function collectRun(handle) {
  const events = []
  const eventsPromise = (async () => {
    for await (const event of handle.events) {
      events.push(event)
    }
  })()

  const summary = await handle.result
  await eventsPromise
  return { summary, events }
}

function createSuspendedApprovalRunner(workspace) {
  return createWorkflowRunner({
    startProviderTask() {
      throw new Error("Provider execution should not be called for approval-only smoke fixtures")
    },
    workspaceStore: {
      async createRunWorkspace() {
        return workspace
      },
    },
  })
}

async function writeWorkflowFixture(projectPath, fileName, workflow, updatedAtMs) {
  const workflowPath = join(projectPath, ".c8c", `${fileName}.chain`)
  const updatedAt = new Date(updatedAtMs)
  await mkdir(join(projectPath, ".c8c"), { recursive: true })
  await writeFile(workflowPath, JSON.stringify(workflow, null, 2))
  await utimes(workflowPath, updatedAt, updatedAt)
  return workflowPath
}

function sanitizeTaskSegment(value) {
  return value.replace(/[^a-zA-Z0-9-]/g, "_")
}

async function writeJsonFixture(filePath, payload, updatedAtMs) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(payload, null, 2))
  if (updatedAtMs) {
    const updatedAt = new Date(updatedAtMs)
    await utimes(filePath, updatedAt, updatedAt)
  }
}

async function writeTextFixture(filePath, content, updatedAtMs) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf-8")
  if (updatedAtMs) {
    const updatedAt = new Date(updatedAtMs)
    await utimes(filePath, updatedAt, updatedAt)
  }
}

async function writeRunWorkspaceFixture(projectPath, {
  runId,
  workflowName,
  workflowPath,
  status,
  updatedAtMs,
  reportBody,
}) {
  const workspace = join(projectPath, ".c8c", "runs", runId)
  const reportPath = join(workspace, "report.md")
  await mkdir(workspace, { recursive: true })
  await writeTextFixture(reportPath, reportBody, updatedAtMs)
  await writeJsonFixture(join(workspace, "run-result.json"), {
    runId,
    status,
    workflowName,
    workflowPath,
    startedAt: updatedAtMs - 5_000,
    completedAt: updatedAtMs,
    reportPath,
    workspace,
  }, updatedAtMs)
  return { workspace, reportPath }
}

async function writeArtifactFixture(projectPath, {
  baseName,
  id,
  kind,
  title,
  description,
  workspace,
  runId,
  templateId,
  templateName,
  workflowPath,
  workflowName,
  caseId,
  caseLabel,
  factoryId,
  factoryLabel,
  updatedAtMs,
  content,
}) {
  const artifactsDir = join(projectPath, ".c8c", "artifacts")
  const contentPath = join(artifactsDir, `${baseName}.md`)
  const metadataPath = join(artifactsDir, `${baseName}.json`)
  const relativePath = `.c8c/artifacts/${baseName}.md`
  const createdAt = updatedAtMs - 2_000

  const metadata = {
    version: 1,
    id,
    kind,
    title,
    description,
    factoryId,
    factoryLabel,
    caseId,
    caseLabel,
    projectPath,
    workspace,
    runId,
    templateId,
    templateName,
    workflowPath,
    workflowName,
    relativePath,
    contentPath,
    metadataPath,
    createdAt,
    updatedAt: updatedAtMs,
    contract: {
      kind,
      title,
      ...(description ? { description } : {}),
    },
  }

  await writeTextFixture(contentPath, content, updatedAtMs)
  await writeJsonFixture(metadataPath, metadata, updatedAtMs)
  return metadata
}

async function writeCaseStateFixture(projectPath, fileName, record, updatedAtMs) {
  const caseFileName = typeof record.caseId === "string" && record.caseId.trim()
    ? `${record.caseId
      .replace(/^case:/i, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "case"}-${createHash("sha1").update(record.caseId).digest("hex").slice(0, 12)}`
    : fileName
  await writeJsonFixture(
    join(projectPath, ".c8c", "case-state", `${caseFileName}.json`),
    {
      version: 1,
      ...record,
    },
    updatedAtMs,
  )
}

async function writeApprovalTaskFixture({
  workspace,
  runId,
  workflowName,
  workflowPath,
  projectPath,
  nodeId,
  title,
  summary,
  instructions,
  allowEdit,
  updatedAtMs,
}) {
  const taskId = `approval-${sanitizeTaskSegment(nodeId)}`
  const taskDir = join(workspace, "human-tasks", taskId)
  const request = {
    version: 1,
    kind: "approval",
    title,
    instructions,
    summary,
    fields: [
      {
        id: "approved",
        type: "boolean",
        label: "Approve changes",
        required: true,
      },
    ],
    defaults: { approved: true },
    metadata: {
      generatedByNodeId: nodeId,
      priority: "normal",
      allowEdit,
    },
  }
  const state = {
    version: 1,
    taskId,
    chainId: workspace,
    sourceRunId: runId,
    kind: "approval",
    checkpointKind: "approval",
    status: "open",
    workspace,
    nodeId,
    workflowName,
    workflowPath,
    projectPath,
    title,
    instructions,
    summary,
    allowEdit,
    requestHash: "smoke-fixture",
    responseRevision: 0,
    createdAt: updatedAtMs - 1_000,
    updatedAt: updatedAtMs,
  }

  await mkdir(join(taskDir, "responses"), { recursive: true })
  await writeJsonFixture(join(taskDir, "request.json"), request, updatedAtMs)
  await writeJsonFixture(join(taskDir, "state.json"), state, updatedAtMs)
}

async function seedCreateReadyContinuationProject(projectPath, updatedAtMs) {
  const caseId = "case:delivery-foundation:checkout-polish"
  const workflowName = "Delivery Lab: Shape Project"
  const { workspace } = await writeRunWorkspaceFixture(projectPath, {
    runId: "run-ready-shape",
    workflowName,
    workflowPath: join(projectPath, ".c8c", "delivery-shape-project.chain"),
    status: "completed",
    updatedAtMs,
    reportBody: "# Project Brief\n\nCheckout polish scope, constraints, and goals.\n",
  })

  const artifact = await writeArtifactFixture(projectPath, {
    baseName: "run-ready-shape-project-brief",
    id: "run-ready-shape:project_brief",
    kind: "project_brief",
    title: "Project Brief",
    description: "Scoped project brief for checkout polish.",
    workspace,
    runId: "run-ready-shape",
    templateId: "delivery-shape-project",
    templateName: workflowName,
    workflowPath: join(projectPath, ".c8c", "delivery-shape-project.chain"),
    workflowName,
    caseId,
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    updatedAtMs,
    content: "# Project Brief\n\nCheckout polish scope, goals, and constraints.\n",
  })

  await writeCaseStateFixture(projectPath, "checkout-polish-ready", {
    caseId,
    projectPath,
    workLabel: "Checkout polish",
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    workflowPath: artifact.workflowPath,
    workflowName,
    continuationStatus: "ready",
    nextStepLabel: "Research the Change",
    artifactIds: [artifact.id],
    lastGate: {
      family: "approval",
      outcome: "passed",
      summaryText: "Project brief saved. Research can continue.",
      reasonText: "The latest project shaping pass completed successfully.",
      stepLabel: "Research the Change",
      happenedAt: updatedAtMs,
    },
    createdAt: updatedAtMs - 2_000,
    updatedAt: updatedAtMs,
  }, updatedAtMs)
}

async function seedBlockedRelaunchProject(projectPath, updatedAtMs) {
  const workflowName = "Blocked approval flow"
  const workflowPath = await writeWorkflowFixture(
    projectPath,
    "blocked-approval-flow",
    buildApprovalWorkflow(workflowName),
    updatedAtMs - 500,
  )
  const caseId = "case:delivery-foundation:checkout-polish"
  const { workspace } = await writeRunWorkspaceFixture(projectPath, {
    runId: "run-blocked-approval",
    workflowName,
    workflowPath,
    status: "blocked",
    updatedAtMs,
    reportBody: "# Verification Report\n\nVerification is waiting on approval.\n",
  })

  const artifact = await writeArtifactFixture(projectPath, {
    baseName: "run-blocked-approval-verification-report",
    id: "run-blocked-approval:verification_report",
    kind: "verification_report",
    title: "Verification Report",
    description: "Verification findings for checkout polish.",
    workspace,
    runId: "run-blocked-approval",
    templateId: "delivery-verify-phase",
    templateName: "Delivery Lab: Verify the Change",
    workflowPath,
    workflowName,
    caseId,
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    updatedAtMs,
    content: "# Verification Report\n\nCheckout polish is ready for approval.\n",
  })

  await writeCaseStateFixture(projectPath, "checkout-polish-blocked", {
    caseId,
    projectPath,
    workLabel: "Checkout polish",
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    workflowPath,
    workflowName,
    continuationStatus: "awaiting_approval",
    artifactIds: [artifact.id],
    lastGate: {
      family: "approval",
      outcome: "awaiting_human",
      summaryText: "Approval pending. Review block before verification continues.",
      reasonText: "Waiting for an approval decision before the flow can continue.",
      stepLabel: "Verify the Change",
      happenedAt: updatedAtMs,
    },
    createdAt: updatedAtMs - 2_000,
    updatedAt: updatedAtMs,
  }, updatedAtMs)

  await writeApprovalTaskFixture({
    workspace,
    runId: "run-blocked-approval",
    workflowName,
    workflowPath,
    projectPath,
    nodeId: "approval",
    title: "Review block",
    summary: "Confirm whether the checkout polish is ready for verification.",
    instructions: "Approve the verification report before this flow can continue.",
    allowEdit: false,
    updatedAtMs: updatedAtMs + 250,
  })
}

async function seedBlockedDecisionProject(projectPath, updatedAtMs) {
  const workflowName = "Blocked approval flow"
  const workflow = buildSuspendedApprovalWorkflow(
    workflowName,
    "Approve the checkout polish before verification continues.",
  )
  const workflowPath = await writeWorkflowFixture(
    projectPath,
    "blocked-approval-flow",
    workflow,
    updatedAtMs - 500,
  )
  const runId = "run-blocked-approval"
  const workspace = join(projectPath, ".c8c", "runs", runId)
  const runner = createSuspendedApprovalRunner(workspace)
  const firstHandle = await runner.startRun({
    runId,
    workflow,
    input: {
      type: "text",
      value: "Verification Report\n\nConfirm whether the checkout polish is ready for verification.",
    },
    projectPath,
    workflowPath,
    approvalBehavior: "suspend",
  })
  const firstRun = await collectRun(firstHandle)
  if (firstRun.summary.status !== "paused") {
    throw new Error(`Expected suspended approval smoke fixture to pause, received ${firstRun.summary.status}`)
  }

  const caseId = "case:delivery-foundation:checkout-polish"
  const artifact = await writeArtifactFixture(projectPath, {
    baseName: "run-blocked-approval-verification-report",
    id: "run-blocked-approval:verification_report",
    kind: "verification_report",
    title: "Verification Report",
    description: "Verification findings for checkout polish.",
    workspace,
    runId,
    templateId: "delivery-verify-phase",
    templateName: "Delivery Lab: Verify the Change",
    workflowPath,
    workflowName,
    caseId,
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    updatedAtMs,
    content: "# Verification Report\n\nCheckout polish is ready for approval.\n",
  })

  await writeCaseStateFixture(projectPath, "checkout-polish-blocked", {
    caseId,
    projectPath,
    workLabel: "Checkout polish",
    caseLabel: "Checkout polish",
    factoryId: "factory:delivery-foundation",
    factoryLabel: "Delivery Lab",
    workflowPath,
    workflowName,
    continuationStatus: "awaiting_approval",
    artifactIds: [artifact.id],
    lastGate: {
      family: "approval",
      outcome: "awaiting_human",
      summaryText: "Approval pending. Review block before verification continues.",
      reasonText: "Waiting for an approval decision before the flow can continue.",
      stepLabel: "Verify the Change",
      happenedAt: updatedAtMs,
    },
    createdAt: updatedAtMs - 2_000,
    updatedAt: updatedAtMs,
  }, updatedAtMs)
}

async function seedScenarioProjects(workspaceDir, scenario) {
  if (scenario === "launch-empty" || scenario === "command-palette-toggle" || scenario === "settings-navigation") {
    return []
  }

  const projectAlpha = join(workspaceDir, "project-alpha")
  await mkdir(projectAlpha, { recursive: true })

  if (scenario === "seeded-project-sidebar") {
    return [projectAlpha]
  }

  const baseTime = Date.now() - 60_000
  if (scenario === "quick-switch-shortcuts") {
    await writeWorkflowFixture(projectAlpha, "beta-flow", buildLinearWorkflow("Beta flow", "research/beta"), baseTime + 1_000)
    await writeWorkflowFixture(projectAlpha, "alpha-flow", buildLinearWorkflow("Alpha flow", "research/alpha"), baseTime + 2_000)
    return [projectAlpha]
  }

  if (scenario === "create-ready-continuation") {
    await seedCreateReadyContinuationProject(projectAlpha, baseTime + 3_000)
    return [projectAlpha]
  }

  if (scenario === "factory-thin-bridge") {
    await seedCreateReadyContinuationProject(projectAlpha, baseTime + 3_500)
    return [projectAlpha]
  }

  if (scenario === "blocked-relaunch") {
    await seedBlockedRelaunchProject(projectAlpha, baseTime + 4_000)
    return [projectAlpha]
  }

  if (scenario === "blocked-approve-resolution" || scenario === "blocked-reject-resolution") {
    await seedBlockedDecisionProject(projectAlpha, baseTime + 4_500)
    return [projectAlpha]
  }

  await writeWorkflowFixture(projectAlpha, "approval-flow", buildApprovalWorkflow("Approval flow"), baseTime + 1_000)
  return [projectAlpha]
}

function runElectronScenario({
  scenario,
  homeDir,
  userDataDir,
  outputDir,
  projects,
  selectedProject,
  showWindow,
}) {
  return new Promise((resolvePromise) => {
    const env = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      C8C_TEST_MODE: "1",
      C8C_TEST_HOME_DIR: homeDir,
      C8C_TEST_USER_DATA_DIR: userDataDir,
      C8C_SMOKE_SCENARIO: scenario,
      C8C_SMOKE_OUTPUT_DIR: outputDir,
      C8C_SMOKE_PROJECTS: JSON.stringify(projects),
      C8C_SMOKE_SELECTED_PROJECT: selectedProject ?? "",
      C8C_SMOKE_SHOW_WINDOW: showWindow ? "1" : "",
      ELECTRON_ENABLE_LOGGING: "1",
    }

    const child = spawn(electronBinary, ["."], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 30_000)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("close", (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
      })
    })
  })
}

function runCommand(command, args, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let combinedOutput = ""

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString()
      combinedOutput += text
      process.stdout.write(text)
    })
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      combinedOutput += text
      process.stderr.write(text)
    })

    child.on("error", rejectPromise)
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}\n${combinedOutput}`))
    })
  })
}

async function ensureTestModeBuild() {
  if (ensuredTestBuild) return ensuredTestBuild

  ensuredTestBuild = runCommand("npm", ["run", "build"], {
    ...process.env,
    C8C_TEST_MODE: "1",
  })

  return ensuredTestBuild
}

async function loadScenarioReport(outputDir) {
  try {
    return JSON.parse(await readFile(join(outputDir, "report.json"), "utf8"))
  } catch {
    return null
  }
}

async function main() {
  const options = parseCliOptions(process.argv)
  await ensureTestModeBuild()
  const scenarios = options.scenarios
  const runRoot = await mkdtemp(join(tmpdir(), "c8c-electron-smoke-"))
  await mkdir(artifactRoot, { recursive: true })
  const failures = []
  const scenarioSummaries = []
  const logLine = (line) => {
    const target = options.json ? process.stderr : process.stdout
    target.write(`${line}\n`)
  }

  for (const scenario of scenarios) {
    const scenarioRoot = join(runRoot, scenario)
    const homeDir = join(scenarioRoot, "home")
    const userDataDir = join(scenarioRoot, "userData")
    const workspaceDir = join(scenarioRoot, "workspace")
    const outputDir = join(artifactRoot, scenario)

    await rm(outputDir, { recursive: true, force: true })
    await Promise.all([
      mkdir(homeDir, { recursive: true }),
      mkdir(userDataDir, { recursive: true }),
      mkdir(workspaceDir, { recursive: true }),
      mkdir(outputDir, { recursive: true }),
    ])
    const projects = await seedScenarioProjects(workspaceDir, scenario)
    const selectedProject = projects[0] ?? null

    logLine(`Running Electron smoke scenario: ${scenario}`)
    const result = await runElectronScenario({
      scenario,
      homeDir,
      userDataDir,
      outputDir,
      projects,
      selectedProject,
      showWindow: options.showWindow,
    })

    await Promise.all([
      writeFile(join(outputDir, "stdout.log"), result.stdout),
      writeFile(join(outputDir, "stderr.log"), result.stderr),
    ])
    const report = await loadScenarioReport(outputDir)

    if (result.code !== 0) {
      failures.push({
        scenario,
        code: result.code,
        signal: result.signal,
        timedOut: result.timedOut,
      })
      scenarioSummaries.push({
        scenario,
        ok: false,
        outputDir,
        artifactsRetained: true,
        assertionsCount: report?.assertions?.length ?? 0,
        unexpectedRendererConsoleCount: report?.rendererConsole?.length ?? 0,
        ignoredRendererConsoleCount: report?.ignoredRendererConsole?.length ?? 0,
        error: report?.error ?? null,
      })
      logLine(`  failed -> ${outputDir}`)
      continue
    }

    const assertionsCount = report?.assertions?.length ?? 0
    if (assertionsCount === 0) {
      failures.push({
        scenario,
        code: result.code,
        signal: result.signal,
        timedOut: result.timedOut,
      })
      scenarioSummaries.push({
        scenario,
        ok: false,
        outputDir,
        artifactsRetained: true,
        assertionsCount,
        unexpectedRendererConsoleCount: report?.rendererConsole?.length ?? 0,
        ignoredRendererConsoleCount: report?.ignoredRendererConsole?.length ?? 0,
        error: report?.error ?? "Smoke scenario produced zero assertions",
      })
      logLine(`  failed -> ${outputDir} (zero assertions)`)
      continue
    }

    scenarioSummaries.push({
      scenario,
      ok: true,
      outputDir: options.keepArtifactsOnSuccess ? outputDir : null,
      artifactsRetained: options.keepArtifactsOnSuccess,
      assertionsCount,
      unexpectedRendererConsoleCount: report?.rendererConsole?.length ?? 0,
      ignoredRendererConsoleCount: report?.ignoredRendererConsole?.length ?? 0,
      error: null,
    })
    if (!options.keepArtifactsOnSuccess) {
      await rm(outputDir, { recursive: true, force: true })
    }
    logLine(`  passed -> ${options.keepArtifactsOnSuccess ? outputDir : "(artifacts cleaned)"}`)
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(
        `Smoke failed: ${failure.scenario} (code=${failure.code ?? "null"}, signal=${failure.signal ?? "null"}, timedOut=${failure.timedOut})\n`,
      )
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      ok: failures.length === 0,
      artifactRoot,
      keepArtifactsOnSuccess: options.keepArtifactsOnSuccess,
      scenarios: scenarioSummaries,
    }, null, 2)}\n`)
  }

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
})
