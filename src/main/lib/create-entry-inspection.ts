import { promisify } from "node:util"
import { execFile as execFileCb } from "node:child_process"
import { readdir, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { ProjectInspectionSummary } from "@shared/types"

const execFile = promisify(execFileCb)

const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "composer.json",
]

const CODE_DIRS = ["src", "app", "pages", "components", "lib", "server", "api"]

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode",
])

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function resolveGitState(
  projectPath: string,
): Promise<ProjectInspectionSummary["git"]> {
  try {
    const { stdout: repoStdout } = await execFile(
      "git",
      ["-C", projectPath, "rev-parse", "--is-inside-work-tree"],
      {
        timeout: 1500,
      },
    )
    const isRepo = repoStdout.trim() === "true"
    if (!isRepo) {
      return {
        isRepo: false,
        branch: null,
        hasUncommittedDiff: false,
      }
    }

    const [{ stdout: branchStdout }, { stdout: diffStdout }] =
      await Promise.all([
        execFile(
          "git",
          ["-C", projectPath, "rev-parse", "--abbrev-ref", "HEAD"],
          {
            timeout: 1500,
          },
        ).catch(() => ({ stdout: "" })),
        execFile("git", ["-C", projectPath, "status", "--porcelain"], {
          timeout: 1500,
        }).catch(() => ({ stdout: "" })),
      ])

    const branch = branchStdout.trim() || null
    return {
      isRepo: true,
      branch,
      hasUncommittedDiff: diffStdout.trim().length > 0,
    }
  } catch {
    return {
      isRepo: false,
      branch: null,
      hasUncommittedDiff: false,
    }
  }
}

async function countProjectFiles(
  root: string,
  maxFiles = 200,
  maxDepth = 3,
): Promise<number> {
  let count = 0

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (count >= maxFiles || depth > maxDepth) return

    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (count >= maxFiles) return
      if (entry.name.startsWith(".DS_Store")) continue
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        await walk(join(currentPath, entry.name), depth + 1)
        continue
      }
      count += 1
    }
  }

  await walk(root, 0)
  return count
}

function classifyProjectKind(input: {
  git: ProjectInspectionSummary["git"]
  manifests: string[]
  codeDirs: string[]
  fileCountEstimate: number
}): ProjectInspectionSummary["projectKind"] {
  const { git, manifests, codeDirs, fileCountEstimate } = input

  if (git.isRepo && git.hasUncommittedDiff) return "review_ready"

  if (
    fileCountEstimate === 0 &&
    manifests.length === 0 &&
    codeDirs.length === 0
  ) {
    return "greenfield_empty"
  }

  if (fileCountEstimate <= 8 && (manifests.length > 0 || codeDirs.length > 0)) {
    return "greenfield_scaffold"
  }

  if (git.isRepo || fileCountEstimate > 8 || codeDirs.length > 1) {
    return "existing_repo"
  }

  return "ambiguous"
}

export async function inspectProjectForCreateEntry(
  projectPath: string,
): Promise<ProjectInspectionSummary> {
  const resolvedProjectPath = resolve(projectPath)
  const [git, manifests, codeDirs, fileCountEstimate] = await Promise.all([
    resolveGitState(resolvedProjectPath),
    Promise.all(
      MANIFEST_FILES.map(async (name) =>
        (await pathExists(join(resolvedProjectPath, name))) ? name : null,
      ),
    ).then((entries) =>
      entries.filter((value): value is string => Boolean(value)),
    ),
    Promise.all(
      CODE_DIRS.map(async (name) =>
        (await pathExists(join(resolvedProjectPath, name))) ? name : null,
      ),
    ).then((entries) =>
      entries.filter((value): value is string => Boolean(value)),
    ),
    countProjectFiles(resolvedProjectPath),
  ])

  const projectKind = classifyProjectKind({
    git,
    manifests,
    codeDirs,
    fileCountEstimate,
  })

  return {
    projectPath: resolvedProjectPath,
    git,
    manifests,
    codeDirs,
    fileDensity:
      fileCountEstimate === 0
        ? "empty"
        : fileCountEstimate <= 8
          ? "scaffold"
          : "active",
    fileCountEstimate,
    projectKind,
  }
}
