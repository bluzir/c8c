import { spawn } from "node:child_process"
import { access, readdir, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
const repoRoot = resolve(import.meta.dirname, "..")

const packages = [
  {
    workspace: "@claude-tools/mcp-search-proxy",
    packageRoot: join(
      repoRoot,
      "packages/shared-claude-tools/packages/mcp-search-proxy",
    ),
    inputs: ["src", "package.json", "tsconfig.json"],
    output: "dist",
  },
  {
    workspace: "@claude-tools/runner",
    packageRoot: join(
      repoRoot,
      "packages/shared-claude-tools/packages/claude-runner",
    ),
    inputs: ["src", "package.json", "tsconfig.json"],
    output: "dist",
  },
  {
    workspace: "@c8c/workflow-runner",
    packageRoot: join(repoRoot, "packages/workflow-runner"),
    inputs: ["src", "scripts", "package.json", "tsconfig.json"],
    output: "dist",
  },
]

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function newestMtimeMs(path) {
  const info = await stat(path)
  if (!info.isDirectory()) return info.mtimeMs

  const entries = await readdir(path, { withFileTypes: true })
  let latest = info.mtimeMs
  for (const entry of entries) {
    latest = Math.max(latest, await newestMtimeMs(join(path, entry.name)))
  }
  return latest
}

async function packageIsStale(pkg) {
  const outputPath = join(pkg.packageRoot, pkg.output)
  if (!(await pathExists(outputPath))) return true

  const newestInput = Math.max(
    ...(await Promise.all(
      pkg.inputs.map((input) => newestMtimeMs(join(pkg.packageRoot, input))),
    )),
  )
  const newestOutput = await newestMtimeMs(outputPath)
  return newestInput > newestOutput
}

async function buildWorkspace(workspace) {
  process.stdout.write(`[build:shared] building ${workspace}\n`)
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("npm", ["run", "build", "-w", workspace], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    })

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(
        new Error(
          `Shared build failed for ${workspace} (exit ${String(code)})`,
        ),
      )
    })
    child.on("error", rejectPromise)
  })
}

const force = process.argv.includes("--force")

for (const pkg of packages) {
  const stale = force || (await packageIsStale(pkg))
  if (!stale) {
    process.stdout.write(`[build:shared] up to date ${pkg.workspace}\n`)
    continue
  }
  await buildWorkspace(pkg.workspace)
}
