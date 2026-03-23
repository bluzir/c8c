import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { inspectProjectForCreateEntry } from "./create-entry-inspection"

const createdDirs: string[] = []

async function createTempProject(name: string) {
  const dir = await mkdtemp(join(tmpdir(), `${name}-`))
  createdDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    createdDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("inspectProjectForCreateEntry", () => {
  it("classifies an empty directory as greenfield_empty", async () => {
    const projectPath = await createTempProject("entry-empty")
    const inspection = await inspectProjectForCreateEntry(projectPath)

    expect(inspection.projectKind).toBe("greenfield_empty")
    expect(inspection.fileDensity).toBe("empty")
    expect(inspection.manifests).toEqual([])
    expect(inspection.codeDirs).toEqual([])
  })

  it("classifies a scaffold project as greenfield_scaffold", async () => {
    const projectPath = await createTempProject("entry-scaffold")
    await writeFile(
      join(projectPath, "package.json"),
      '{"name":"demo"}\n',
      "utf-8",
    )
    await mkdir(join(projectPath, "src"))

    const inspection = await inspectProjectForCreateEntry(projectPath)

    expect(inspection.projectKind).toBe("greenfield_scaffold")
    expect(inspection.manifests).toContain("package.json")
    expect(inspection.codeDirs).toContain("src")
  })

  it("classifies a denser code project as existing_repo", async () => {
    const projectPath = await createTempProject("entry-existing")
    await writeFile(
      join(projectPath, "package.json"),
      '{"name":"demo"}\n',
      "utf-8",
    )
    await mkdir(join(projectPath, "src"))
    await mkdir(join(projectPath, "components"))
    for (let index = 0; index < 7; index += 1) {
      await writeFile(
        join(projectPath, "src", `file-${index}.ts`),
        `export const value${index} = ${index}\n`,
        "utf-8",
      )
    }
    await writeFile(
      join(projectPath, "components", "hero.tsx"),
      "export function Hero() { return null }\n",
      "utf-8",
    )
    await writeFile(join(projectPath, "README.md"), "# demo\n", "utf-8")

    const inspection = await inspectProjectForCreateEntry(projectPath)

    expect(inspection.projectKind).toBe("existing_repo")
    expect(inspection.fileDensity).toBe("active")
    expect(inspection.fileCountEstimate).toBeGreaterThan(8)
  })
})
