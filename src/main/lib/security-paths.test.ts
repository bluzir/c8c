import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import {
  assertRegisteredRoots,
  assertWithinRoots,
  isRegisteredRoot,
  isWithinRoot,
} from "./security-paths"

function createTempLayout() {
  const baseDir = mkdtempSync(join(tmpdir(), "c8c-security-paths-"))
  const rootDir = join(baseDir, "root")
  const otherDir = join(baseDir, "other")
  mkdirSync(rootDir)
  mkdirSync(otherDir)
  return {
    baseDir,
    rootDir,
    otherDir,
    cleanup: () => rmSync(baseDir, { recursive: true, force: true }),
  }
}

describe("security path helpers", () => {
  it("accepts nested paths inside the allowed root", () => {
    const { rootDir, cleanup } = createTempLayout()
    try {
      const nested = join(rootDir, "subdir", "file.txt")
      expect(isWithinRoot(nested, rootDir)).toBe(true)
      expect(assertWithinRoots(nested, [rootDir], "Path")).toBe(nested)
    } finally {
      cleanup()
    }
  })

  it("rejects absolute paths outside the allowed root", () => {
    const { rootDir, otherDir, cleanup } = createTempLayout()
    try {
      expect(isWithinRoot(join(otherDir, "escape.txt"), rootDir)).toBe(false)
      expect(() =>
        assertWithinRoots(join(otherDir, "escape.txt"), [rootDir], "Path"),
      ).toThrow("Path is outside allowed directories")
    } finally {
      cleanup()
    }
  })

  it("rejects traversal that resolves outside the allowed root", () => {
    const { rootDir, otherDir, cleanup } = createTempLayout()
    try {
      const traversal = join(rootDir, "..", "other", "escape.txt")
      expect(isWithinRoot(traversal, rootDir)).toBe(false)
      expect(() => assertWithinRoots(traversal, [rootDir], "Path")).toThrow(
        "Path is outside allowed directories",
      )
      expect(traversal).toBe(join(otherDir, "escape.txt"))
    } finally {
      cleanup()
    }
  })

  it("rejects symlink escapes outside the allowed root", () => {
    const { rootDir, otherDir, cleanup } = createTempLayout()
    try {
      const escapeTarget = join(otherDir, "escape.txt")
      writeFileSync(escapeTarget, "escaped")
      const symlinkPath = join(rootDir, "linked-out")
      symlinkSync(otherDir, symlinkPath)
      const escapedCandidate = join(symlinkPath, "escape.txt")

      expect(isWithinRoot(escapedCandidate, rootDir)).toBe(false)
      expect(() =>
        assertWithinRoots(escapedCandidate, [rootDir], "Path"),
      ).toThrow("Path is outside allowed directories")
    } finally {
      cleanup()
    }
  })

  it("canonicalizes symlinked roots before checking membership", () => {
    const { baseDir, rootDir, cleanup } = createTempLayout()
    try {
      const rootAlias = join(baseDir, "root-link")
      symlinkSync(rootDir, rootAlias)
      const candidate = join(rootDir, "inside.txt")

      expect(isWithinRoot(candidate, rootAlias)).toBe(true)
      expect(assertWithinRoots(candidate, [rootAlias], "Path")).toBe(candidate)
    } finally {
      cleanup()
    }
  })

  it("matches registered roots across symlink aliases without allowing nested descendants", () => {
    const { baseDir, rootDir, cleanup } = createTempLayout()
    try {
      const rootAlias = join(baseDir, "root-link")
      symlinkSync(rootDir, rootAlias)

      expect(isRegisteredRoot(rootAlias, rootDir)).toBe(true)
      expect(assertRegisteredRoots(rootAlias, [rootDir], "Project path")).toBe(
        rootAlias,
      )
      expect(() =>
        assertRegisteredRoots(
          join(rootDir, "nested"),
          [rootDir],
          "Project path",
        ),
      ).toThrow("Project path is not registered")
    } finally {
      cleanup()
    }
  })
})
