import { describe, it, expect, afterAll } from "vitest"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { findLatestSession } from "../session.js"

describe("findLatestSession", () => {
  const tempDirs: string[] = []

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "session-test-"))
    tempDirs.push(dir)
    return dir
  }

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns undefined for non-existent directory", async () => {
    const result = await findLatestSession("/tmp/does-not-exist-at-all-12345")
    expect(result).toBeUndefined()
  })

  it("returns undefined for empty artifacts dir", async () => {
    const workdir = await makeTempDir()
    await mkdir(join(workdir, "artifacts"))
    const result = await findLatestSession(workdir)
    expect(result).toBeUndefined()
  })

  it("returns the most recently modified session directory", async () => {
    const workdir = await makeTempDir()
    const artifactsDir = join(workdir, "artifacts")
    await mkdir(artifactsDir)

    // Create two session dirs with different mtimes
    const olderDir = join(artifactsDir, "2024-01-10-older")
    const newerDir = join(artifactsDir, "2024-01-15-newer")
    await mkdir(olderDir)
    await mkdir(newerDir)

    // Touch a file in the older dir first, then the newer dir,
    // so that mtime of newerDir is more recent.
    await writeFile(join(olderDir, "dummy"), "old")
    // Small delay to ensure different mtime
    await new Promise((r) => setTimeout(r, 50))
    await writeFile(join(newerDir, "dummy"), "new")

    // Update the directory mtime by writing to it
    // The mtime of the directory itself matters, so let's
    // explicitly set it via writing a new file
    const result = await findLatestSession(workdir)
    expect(result).toBe("2024-01-15-newer")
  })

  it("ignores non-date-prefixed directories", async () => {
    const workdir = await makeTempDir()
    const artifactsDir = join(workdir, "artifacts")
    await mkdir(artifactsDir)

    // Create a non-date directory and a date directory
    await mkdir(join(artifactsDir, "random-dir"))
    await mkdir(join(artifactsDir, "not-a-date"))
    await mkdir(join(artifactsDir, "2024-03-20-session"))

    const result = await findLatestSession(workdir)
    expect(result).toBe("2024-03-20-session")
  })

  it("ignores files (non-directories) in artifacts", async () => {
    const workdir = await makeTempDir()
    const artifactsDir = join(workdir, "artifacts")
    await mkdir(artifactsDir)

    // Create a file that looks like a session name
    await writeFile(join(artifactsDir, "2024-05-01-file"), "not a dir")
    // Create an actual session directory
    await mkdir(join(artifactsDir, "2024-04-01-real"))

    const result = await findLatestSession(workdir)
    expect(result).toBe("2024-04-01-real")
  })
})
