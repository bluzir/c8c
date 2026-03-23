import { chmod, mkdir, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { build } from "esbuild"
import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const packageRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(packageRoot, "../..")
const distDir = resolve(packageRoot, "dist")
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

async function writeOpenClawExecutableWrappers() {
  const lobsterPath = resolve(distDir, "lobster")
  const lobsterCmdPath = resolve(distDir, "lobster.cmd")

  await mkdir(distDir, { recursive: true })
  await writeFile(
    lobsterPath,
    '#!/usr/bin/env node\nimport { main } from "./index.js"\nvoid main()\n',
  )
  await chmod(lobsterPath, 0o755)

  await writeFile(lobsterCmdPath, '@echo off\r\nnode "%~dp0index.js" %*\r\n')
}

await execFile(npmCommand, ["run", "build", "-w", "@c8c/workflow-runner"], {
  cwd: repoRoot,
})

await rm(distDir, { recursive: true, force: true })

await build({
  absWorkingDir: packageRoot,
  bundle: true,
  entryPoints: ["./src/index.ts"],
  external: [
    "electron",
    "@agentclientprotocol/sdk",
    "@anthropic-ai/claude-agent-sdk",
    "@mcpc-tech/acp-ai-provider",
    "@zed-industries/codex-acp",
    "ai",
    "gray-matter",
    "yaml",
  ],
  format: "esm",
  outfile: resolve(distDir, "index.js"),
  platform: "node",
  target: "node20",
  tsconfig: resolve(packageRoot, "tsconfig.json"),
})

await chmod(resolve(distDir, "index.js"), 0o755)
await writeOpenClawExecutableWrappers()
