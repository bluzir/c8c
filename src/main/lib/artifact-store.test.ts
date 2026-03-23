import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listProjectArtifacts, persistArtifactsFromRun } from "./artifact-store"
import { listProjectCaseStates } from "./case-store"

describe("artifact-store", () => {
  let projectDir: string
  let workspaceDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "artifact-store-project-"))
    workspaceDir = join(projectDir, ".c8c", "runs", "run-1")
    await mkdir(workspaceDir, { recursive: true })
    await writeFile(
      join(workspaceDir, "run-result.json"),
      JSON.stringify(
        {
          runId: "run-1",
          status: "completed",
          workflowName: "Delivery Factory: Shape Project",
          workflowPath: join(projectDir, ".c8c", "shape-project.chain"),
          startedAt: 1,
          completedAt: 2,
          reportPath: join(workspaceDir, "report.md"),
          workspace: workspaceDir,
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(workspaceDir, "report.md"),
      "# Output\n\nStructured project shape.\n",
      "utf-8",
    )
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("persists one markdown artifact per contract and lists them back", async () => {
    const result = await persistArtifactsFromRun({
      projectPath: projectDir,
      workspace: workspaceDir,
      factoryId: "factory:delivery-foundation",
      factoryLabel: "Delivery Factory",
      caseId: "case:delivery-foundation:abc123",
      caseLabel: "Shape project",
      sourceArtifactIds: ["artifact-0"],
      templateId: "delivery-shape-project",
      templateName: "Delivery Factory: Shape Project",
      workflowName: "Delivery Factory: Shape Project",
      contracts: [
        { kind: "project_brief", title: "Project Brief" },
        { kind: "roadmap", title: "Roadmap" },
      ],
    })

    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "project_brief",
      "roadmap",
    ])
    expect(result.artifacts[0]?.relativePath).toContain(".c8c/artifacts/")

    const storedArtifacts = await listProjectArtifacts(projectDir)
    expect(storedArtifacts).toHaveLength(2)
    expect(storedArtifacts.map((artifact) => artifact.title).sort()).toEqual([
      "Project Brief",
      "Roadmap",
    ])
    expect(storedArtifacts[0]?.factoryId).toBe("factory:delivery-foundation")
    expect(storedArtifacts[0]?.caseId).toBe("case:delivery-foundation:abc123")
    expect(storedArtifacts[0]?.sourceArtifactIds).toEqual(["artifact-0"])

    const caseStates = await listProjectCaseStates(projectDir)
    expect(caseStates).toHaveLength(1)
    expect(caseStates[0]).toMatchObject({
      caseId: "case:delivery-foundation:abc123",
      workLabel: "Shape project",
      artifactIds: result.artifacts.map((artifact) => artifact.id),
    })

    const markdown = await readFile(result.artifacts[0]!.contentPath, "utf-8")
    expect(markdown).toContain("# Project Brief")
    expect(markdown).toContain("Lab: Delivery Factory")
    expect(markdown).toContain("Track: Shape project")
    expect(markdown).toContain("Flow: Delivery Factory: Shape Project")
    expect(markdown).toContain(
      "Starting point: Delivery Factory: Shape Project",
    )
    expect(markdown).toContain("Structured project shape.")
  })

  it("overwrites deterministic artifact files for the same run and kind", async () => {
    const first = await persistArtifactsFromRun({
      projectPath: projectDir,
      workspace: workspaceDir,
      contracts: [{ kind: "phase_plan", title: "Phase Plan" }],
    })

    await writeFile(
      join(workspaceDir, "report.md"),
      "# Output\n\nUpdated plan.\n",
      "utf-8",
    )

    const second = await persistArtifactsFromRun({
      projectPath: projectDir,
      workspace: workspaceDir,
      contracts: [{ kind: "phase_plan", title: "Phase Plan" }],
    })

    expect(second.artifacts[0]?.contentPath).toBe(
      first.artifacts[0]?.contentPath,
    )
    expect(second.artifacts[0]?.createdAt).toBe(first.artifacts[0]?.createdAt)

    const markdown = await readFile(second.artifacts[0]!.contentPath, "utf-8")
    expect(markdown).toContain("Updated plan.")
  })
})
