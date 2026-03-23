import { beforeEach, describe, expect, it } from "vitest"
import {
  __getSerialTaskQueueSizeForTests,
  __resetSerialTaskQueuesForTests,
  runSerialTask,
} from "./serial-task"

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("workflow-runner serial-task", () => {
  beforeEach(() => {
    __resetSerialTaskQueuesForTests()
  })

  it("serializes tasks that share a key", async () => {
    const gate = deferred<void>()
    let active = 0
    let maxActive = 0
    const started: string[] = []

    const first = runSerialTask("provider-settings", async () => {
      started.push("first")
      active += 1
      maxActive = Math.max(maxActive, active)
      await gate.promise
      active -= 1
      return "first"
    })

    const second = runSerialTask("provider-settings", async () => {
      started.push("second")
      active += 1
      maxActive = Math.max(maxActive, active)
      active -= 1
      return "second"
    })

    await Promise.resolve()
    expect(started).toEqual(["first"])

    gate.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ])
    expect(maxActive).toBe(1)
  })

  it("allows different keys to run in parallel", async () => {
    const gate = deferred<void>()
    let active = 0
    let maxActive = 0

    const runTask = (key: string) =>
      runSerialTask(key, async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await gate.promise
        active -= 1
        return key
      })

    const first = runTask("provider-settings")
    const second = runTask("mcp-manager")

    await Promise.resolve()
    expect(maxActive).toBe(2)

    gate.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual([
      "provider-settings",
      "mcp-manager",
    ])
  })

  it("releases the queue after a task throws", async () => {
    const first = runSerialTask("provider-settings", async () => {
      throw new Error("boom")
    })

    const second = runSerialTask("provider-settings", async () => "recovered")

    await expect(first).rejects.toThrow("boom")
    await expect(second).resolves.toBe("recovered")
  })

  it("does not leak queue entries after completion", async () => {
    await runSerialTask("provider-settings", async () => "done")
    expect(__getSerialTaskQueueSizeForTests()).toBe(0)
  })
})
