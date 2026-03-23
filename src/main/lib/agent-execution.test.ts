import { describe, expect, it } from "vitest"
import { AsyncEventQueue } from "./agent-execution"

describe("AsyncEventQueue", () => {
  it("delivers buffered events before waiting", async () => {
    const queue = new AsyncEventQueue<number>()
    queue.push(1)

    const iterator = queue[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({ value: 1, done: false })
  })

  it("resolves a pending waiter when a new event is pushed", async () => {
    const queue = new AsyncEventQueue<number>()
    const iterator = queue[Symbol.asyncIterator]()

    const nextPromise = iterator.next()
    queue.push(2)

    await expect(nextPromise).resolves.toEqual({ value: 2, done: false })
  })

  it("closes pending waiters when the queue is closed", async () => {
    const queue = new AsyncEventQueue<number>()
    const iterator = queue[Symbol.asyncIterator]()

    const nextPromise = iterator.next()
    queue.close()

    await expect(nextPromise).resolves.toEqual({ value: undefined, done: true })
  })

  it("completes iteration after buffered items are drained and the queue closes", async () => {
    const queue = new AsyncEventQueue<number>()
    const iterator = queue[Symbol.asyncIterator]()

    queue.push(3)
    queue.close()

    await expect(iterator.next()).resolves.toEqual({ value: 3, done: false })
    await expect(iterator.next()).resolves.toEqual({
      value: undefined,
      done: true,
    })
  })
})
