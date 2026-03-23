import { execFile as execFileCallback } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { promisify } from "node:util"
import { build } from "esbuild"

const execFile = promisify(execFileCallback)
const packageRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(packageRoot, "../..")
const distDir = resolve(packageRoot, "dist")
const tscCliPath = resolve(repoRoot, "node_modules/typescript/lib/tsc.js")

async function writeDeclarationWrapper(entrypoint, sourcePath = entrypoint) {
  const wrapperPath = resolve(distDir, `${entrypoint}.d.ts`)
  const targetPath = `./types/packages/workflow-runner/src/${sourcePath}.js`
  await mkdir(dirname(wrapperPath), { recursive: true })
  await writeFile(wrapperPath, `export * from "${targetPath}"\n`)
}

await rm(distDir, { recursive: true, force: true })

await build({
  absWorkingDir: packageRoot,
  bundle: true,
  entryPoints: {
    index: "./src/index.ts",
    node: "./src/node/index.ts",
    schema: "./src/schema.ts",
    "provider-metadata": "./src/provider-metadata.ts",
  },
  external: ["electron"],
  format: "esm",
  outdir: distDir,
  platform: "node",
  sourcemap: true,
  target: "node20",
  tsconfig: resolve(packageRoot, "tsconfig.json"),
})

await execFile(
  process.execPath,
  [tscCliPath, "-p", resolve(packageRoot, "tsconfig.declarations.json")],
  {
    cwd: packageRoot,
  },
)

await Promise.all([
  writeDeclarationWrapper("index"),
  writeDeclarationWrapper("node", "node/index"),
  writeDeclarationWrapper("schema"),
  writeDeclarationWrapper("provider-metadata"),
])
