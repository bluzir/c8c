import { mkdir, readFile, readdir } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import type {
  ArtifactContract,
  ArtifactRecord,
  PersistArtifactsFromRunRequest,
  PersistArtifactsFromRunResult,
} from "@shared/types"
import { writeFileAtomic } from "./atomic-write"
import { upsertCaseState } from "./case-store"
import { readRunResultRecord } from "./run-workspace-store"
import { isWithinRoot } from "./security-paths"
import { logWarn } from "./structured-log"

const ARTIFACTS_DIR_SEGMENTS = [".c8c", "artifacts"] as const

interface StoredArtifactMetadata extends ArtifactRecord {
  version: 1
  contract: ArtifactContract
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

function sanitizeFileSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "artifact"
  )
}

function titleCaseFromIdentifier(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function normalizeRelativePath(projectPath: string, filePath: string): string {
  return relative(projectPath, filePath).replace(/\\/g, "/")
}

function buildArtifactBaseName(runId: string, kind: string): string {
  return `${sanitizeFileSegment(runId)}-${sanitizeFileSegment(kind)}`
}

function buildArtifactMarkdown(
  contract: ArtifactContract,
  record: ArtifactRecord,
  reportContent: string,
): string {
  const headerLines = [
    `# ${record.title}`,
    "",
    `Result type: \`${record.kind}\``,
    `Generated from run: \`${record.runId}\``,
  ]

  if (record.caseLabel) {
    headerLines.push(`Track: ${record.caseLabel}`)
  }
  if (record.caseId) {
    headerLines.push(`Track ID: \`${record.caseId}\``)
  }
  if (record.factoryLabel) {
    headerLines.push(`Lab: ${record.factoryLabel}`)
  }
  if (record.factoryId) {
    headerLines.push(`Lab ID: \`${record.factoryId}\``)
  }

  if (record.workflowName) {
    headerLines.push(`Flow: ${record.workflowName}`)
  }
  if (record.templateName) {
    headerLines.push(`Starting point: ${record.templateName}`)
  }
  if (contract.description?.trim()) {
    headerLines.push("")
    headerLines.push(contract.description.trim())
  }

  const body =
    reportContent.trim() || "_No report content was available for this result._"
  return `${headerLines.join("\n")}\n\n---\n\n${body}\n`
}

async function readRunReportContent(
  projectPath: string,
  workspace: string,
  runResult: Awaited<ReturnType<typeof readRunResultRecord>>,
): Promise<string> {
  if (!runResult) return ""
  const fallbackPath = join(workspace, "report.md")
  const candidatePaths = [
    runResult.reportPath &&
    isWithinRoot(resolve(runResult.reportPath), projectPath)
      ? runResult.reportPath
      : null,
    fallbackPath,
  ].filter((value): value is string => Boolean(value))

  for (const candidatePath of candidatePaths) {
    try {
      return await readFile(candidatePath, "utf-8")
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logWarn("artifact-store", "read_report_failed", {
          workspace,
          candidatePath,
          error: String(error),
        })
      }
    }
  }

  return ""
}

async function readExistingArtifactMetadata(
  metadataPath: string,
): Promise<StoredArtifactMetadata | null> {
  try {
    const raw = await readFile(metadataPath, "utf-8")
    return JSON.parse(raw) as StoredArtifactMetadata
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("artifact-store", "read_existing_metadata_failed", {
        metadataPath,
        error: String(error),
      })
    }
    return null
  }
}

function resolveArtifactsDir(projectPath: string): string {
  return join(resolve(projectPath), ...ARTIFACTS_DIR_SEGMENTS)
}

export async function persistArtifactsFromRun(
  input: PersistArtifactsFromRunRequest,
): Promise<PersistArtifactsFromRunResult> {
  if (!input.contracts.length) {
    return { artifacts: [] }
  }

  const projectPath = resolve(input.projectPath)
  const workspace = resolve(input.workspace)
  const artifactsDir = resolveArtifactsDir(projectPath)
  await mkdir(artifactsDir, { recursive: true })

  const runResult = await readRunResultRecord(workspace)
  if (!runResult) {
    throw new Error("Run result metadata is missing or invalid")
  }
  const reportContent = await readRunReportContent(
    projectPath,
    workspace,
    runResult,
  )
  const artifacts: ArtifactRecord[] = []

  for (const contract of input.contracts) {
    const title =
      contract.title?.trim() || titleCaseFromIdentifier(contract.kind)
    const baseName = buildArtifactBaseName(runResult.runId, contract.kind)
    const contentPath = join(artifactsDir, `${baseName}.md`)
    const metadataPath = join(artifactsDir, `${baseName}.json`)
    const existing = await readExistingArtifactMetadata(metadataPath)
    const now = Date.now()

    const record: ArtifactRecord = {
      id: existing?.id || `${runResult.runId}:${contract.kind}`,
      kind: contract.kind,
      title,
      description: contract.description,
      factoryId: input.factoryId || existing?.factoryId,
      factoryLabel: input.factoryLabel || existing?.factoryLabel,
      caseId: input.caseId || existing?.caseId,
      caseLabel: input.caseLabel || existing?.caseLabel,
      sourceArtifactIds: input.sourceArtifactIds || existing?.sourceArtifactIds,
      projectPath,
      workspace,
      runId: runResult.runId,
      templateId: input.templateId,
      templateName: input.templateName,
      workflowPath: input.workflowPath || runResult.workflowPath,
      workflowName: input.workflowName || runResult.workflowName,
      relativePath: normalizeRelativePath(projectPath, contentPath),
      contentPath,
      metadataPath,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }

    const storedMetadata: StoredArtifactMetadata = {
      version: 1,
      ...record,
      contract,
    }

    await writeFileAtomic(
      contentPath,
      buildArtifactMarkdown(contract, record, reportContent),
    )
    await writeFileAtomic(metadataPath, JSON.stringify(storedMetadata, null, 2))
    artifacts.push(record)
  }

  if (input.caseId && artifacts.length > 0) {
    await upsertCaseState({
      projectPath,
      caseId: input.caseId,
      workLabel:
        input.caseLabel || artifacts[0]?.workflowName || artifacts[0]?.title,
      caseLabel: input.caseLabel,
      factoryId: input.factoryId,
      factoryLabel: input.factoryLabel,
      workflowPath: input.workflowPath || artifacts[0]?.workflowPath,
      workflowName: input.workflowName || artifacts[0]?.workflowName,
      artifactIds: artifacts.map((artifact) => artifact.id),
      updatedAt: artifacts[0]?.updatedAt,
    })
  }

  return { artifacts }
}

export async function listProjectArtifacts(
  projectPath: string,
): Promise<ArtifactRecord[]> {
  const artifactsDir = resolveArtifactsDir(projectPath)
  try {
    const entries = await readdir(artifactsDir, { withFileTypes: true })
    const artifactRecords = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const metadataPath = join(artifactsDir, entry.name)
          try {
            const raw = await readFile(metadataPath, "utf-8")
            const parsed = JSON.parse(raw) as Partial<StoredArtifactMetadata>
            if (
              typeof parsed.id !== "string" ||
              typeof parsed.kind !== "string" ||
              typeof parsed.title !== "string" ||
              typeof parsed.contentPath !== "string" ||
              typeof parsed.relativePath !== "string" ||
              typeof parsed.runId !== "string"
            ) {
              return null
            }

            const record: ArtifactRecord = {
              id: parsed.id,
              kind: parsed.kind,
              title: parsed.title,
              description: parsed.description,
              factoryId:
                typeof parsed.factoryId === "string"
                  ? parsed.factoryId
                  : undefined,
              factoryLabel:
                typeof parsed.factoryLabel === "string"
                  ? parsed.factoryLabel
                  : undefined,
              caseId:
                typeof parsed.caseId === "string" ? parsed.caseId : undefined,
              caseLabel:
                typeof parsed.caseLabel === "string"
                  ? parsed.caseLabel
                  : undefined,
              sourceArtifactIds: Array.isArray(parsed.sourceArtifactIds)
                ? parsed.sourceArtifactIds.filter(
                    (value): value is string => typeof value === "string",
                  )
                : undefined,
              projectPath:
                typeof parsed.projectPath === "string"
                  ? parsed.projectPath
                  : resolve(projectPath),
              workspace:
                typeof parsed.workspace === "string" ? parsed.workspace : "",
              runId: parsed.runId,
              templateId:
                typeof parsed.templateId === "string"
                  ? parsed.templateId
                  : undefined,
              templateName:
                typeof parsed.templateName === "string"
                  ? parsed.templateName
                  : undefined,
              workflowPath:
                typeof parsed.workflowPath === "string"
                  ? parsed.workflowPath
                  : undefined,
              workflowName:
                typeof parsed.workflowName === "string"
                  ? parsed.workflowName
                  : undefined,
              relativePath: parsed.relativePath,
              contentPath: parsed.contentPath,
              metadataPath:
                typeof parsed.metadataPath === "string"
                  ? parsed.metadataPath
                  : metadataPath,
              createdAt:
                typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
              updatedAt:
                typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
            }
            return record
          } catch (error) {
            logWarn("artifact-store", "read_artifact_metadata_failed", {
              metadataPath,
              error: String(error),
            })
            return null
          }
        }),
    )

    return artifactRecords
      .filter((record): record is ArtifactRecord => record !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      logWarn("artifact-store", "list_project_artifacts_failed", {
        projectPath,
        artifactsDir,
        error: String(error),
      })
    }
    return []
  }
}
