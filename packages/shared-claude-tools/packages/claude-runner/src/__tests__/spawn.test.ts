import { describe, expect, it } from "vitest"
import { spawnClaude } from "../spawn.js"

describe("spawnClaude", () => {
  it("returns failure for non-existent workdir", async () => {
    const result = await spawnClaude({
      workdir: "/nonexistent/path",
      prompt: "hi",
    })
    expect(result.success).toBe(false)
    expect(result.exitCode).toBeNull()
    expect(result.durationMs).toBe(0)
  })

  it("calls onStderr with diagnostic when workdir missing", async () => {
    const stderrChunks: Buffer[] = []
    await spawnClaude({
      workdir: "/nonexistent/path",
      prompt: "hi",
      onStderr: (data) => stderrChunks.push(data),
    })
    const stderr = Buffer.concat(stderrChunks).toString()
    expect(stderr).toContain("Working directory does not exist")
    expect(stderr).toContain("/nonexistent/path")
  })

  it("returns failure for non-existent claude binary", async () => {
    const result = await spawnClaude({
      claudePath: "/nonexistent/bin/claude",
      workdir: "/tmp",
      prompt: "hi",
      timeout: 5_000,
    })
    expect(result.success).toBe(false)
  })

  it("respects abort signal", async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await spawnClaude({
      claudePath: "echo",
      workdir: "/tmp",
      prompt: "hi",
      abortSignal: controller.signal,
      timeout: 5_000,
    })
    expect(result.aborted).toBe(true)
    expect(result.success).toBe(false)
  })
})

describe("spawnClaude integration (real binaries)", () => {
  it("captures stdout via onStdout callback", async () => {
    const chunks: Buffer[] = []
    const result = await spawnClaude({
      claudePath: "/bin/echo",
      workdir: "/tmp",
      prompt: "hello world",
      timeout: 5_000,
      onStdout: (data) => chunks.push(data),
    })
    // echo receives ['--print', 'hello world'] and prints them
    const output = Buffer.concat(chunks).toString()
    expect(output).toContain("hello world")
    expect(result.durationMs).toBeGreaterThan(0)
    expect(result.pid).toBeDefined()
    expect(typeof result.pid).toBe("number")
  })

  it("captures stderr via onStderr callback", async () => {
    const stderrChunks: Buffer[] = []
    // Use bash -c to write to stderr
    const result = await spawnClaude({
      claudePath: "/bin/bash",
      workdir: "/tmp",
      prompt: "unused",
      extraArgs: ["-c", "echo errormsg >&2; exit 1"],
      timeout: 5_000,
      onStderr: (data) => stderrChunks.push(data),
    })
    // bash -c receives: ['--print', '-c', 'echo errormsg >&2; exit 1', 'unused']
    // It will interpret -c as a flag and run the command
    // Actually bash gets args: --print -c "echo errormsg >&2; exit 1" unused
    // bash doesn't know --print so it may error. Let's just check stderr was called.
    const stderr = Buffer.concat(stderrChunks).toString()
    expect(stderr.length).toBeGreaterThan(0)
  })

  it("timeout kills the process", async () => {
    const start = Date.now()
    // node -e ignores extra positional args after the script, so
    // spawnClaude's ['--print', '-e', 'setTimeout(()=>{},60000)', 'unused']
    // won't cause issues — node runs the -e script and ignores the rest.
    const result = await spawnClaude({
      claudePath: process.execPath,
      workdir: "/tmp",
      prompt: "unused",
      extraArgs: ["-e", "setTimeout(()=>{},60000)"],
      timeout: 500,
    })
    const elapsed = Date.now() - start

    expect(result.killed).toBe(true)
    expect(result.success).toBe(false)
    // Should complete in well under 60 seconds
    expect(elapsed).toBeLessThan(5_000)
  })

  it("result.durationMs is > 0 for real processes", async () => {
    const result = await spawnClaude({
      claudePath: "/bin/echo",
      workdir: "/tmp",
      prompt: "test",
      timeout: 5_000,
    })
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it("result.pid is set for real processes", async () => {
    const result = await spawnClaude({
      claudePath: "/bin/echo",
      workdir: "/tmp",
      prompt: "test",
      timeout: 5_000,
    })
    expect(result.pid).toBeDefined()
    expect(result.pid).toBeGreaterThan(0)
  })
})
