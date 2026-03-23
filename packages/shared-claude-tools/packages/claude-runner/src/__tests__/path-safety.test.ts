import { describe, it, expect } from "vitest"
import { validateRef, assertContainedPath } from "../path-safety.js"
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("validateRef", () => {
  it("accepts valid simple names", () => {
    expect(() => validateRef("source-evaluation")).not.toThrow()
    expect(() => validateRef("my_skill")).not.toThrow()
    expect(() => validateRef("skill123")).not.toThrow()
  })

  it("rejects empty string", () => {
    expect(() => validateRef("")).toThrow("must not be empty")
  })

  it("rejects whitespace-only string", () => {
    expect(() => validateRef("   ")).toThrow("must not be empty")
  })

  it("rejects absolute paths", () => {
    expect(() => validateRef("/etc/passwd")).toThrow("absolute path")
  })

  it("rejects Windows absolute paths", () => {
    expect(() => validateRef("C:\\Windows")).toThrow("absolute path")
  })

  it("rejects path traversal with ..", () => {
    expect(() => validateRef("..")).toThrow("path traversal")
    expect(() => validateRef("..foo")).toThrow("path traversal")
  })

  it("rejects forward slash separators", () => {
    expect(() => validateRef("foo/bar")).toThrow("path separators")
  })

  it("rejects backslash separators", () => {
    expect(() => validateRef("foo\\bar")).toThrow("path separators")
  })
})

describe("assertContainedPath", () => {
  let tmpDir: string

  async function setup() {
    tmpDir = await mkdtemp(join(tmpdir(), "path-safety-"))
    await mkdir(join(tmpDir, "skills", "valid-skill"), { recursive: true })
    await writeFile(join(tmpDir, "skills", "valid-skill", "SKILL.md"), "# Test")
  }

  async function cleanup() {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
  }

  it("accepts contained paths", async () => {
    await setup()
    try {
      const result = await assertContainedPath(
        tmpDir,
        join(tmpDir, "skills", "valid-skill"),
      )
      expect(result).toContain("valid-skill")
    } finally {
      await cleanup()
    }
  })

  it("rejects paths outside base", async () => {
    await setup()
    try {
      await expect(
        assertContainedPath(join(tmpDir, "skills"), tmpdir()),
      ).rejects.toThrow("escapes base directory")
    } finally {
      await cleanup()
    }
  })

  it("rejects symlink escapes", async () => {
    await setup()
    try {
      await symlink(tmpdir(), join(tmpDir, "skills", "escape-link"))
      await expect(
        assertContainedPath(
          join(tmpDir, "skills"),
          join(tmpDir, "skills", "escape-link"),
        ),
      ).rejects.toThrow("escapes base directory")
    } finally {
      await cleanup()
    }
  })
})
