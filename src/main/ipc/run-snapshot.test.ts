import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { PersistedRunSnapshot } from "@shared/types"
import {
  loadPersistedNodeLogs,
  mergeNodeLogsIntoSnapshot,
  parsePersistedNodeLogs,
  readPersistedEventsTail,
} from "./run-snapshot"

describe("run snapshot log hydration", () => {
  it("parses node logs from persisted workflow events", () => {
    const logs = parsePersistedNodeLogs(
      [
        JSON.stringify({
          type: "node-start",
          runId: "run-1",
          nodeId: "audit",
        }),
        JSON.stringify({
          type: "node-log",
          runId: "run-1",
          nodeId: "audit",
          entry: { type: "text", content: "hello", timestamp: 10 },
        }),
        JSON.stringify({
          type: "node-log",
          runId: "run-1",
          nodeId: "audit",
          entry: { type: "thinking", content: "world", timestamp: 11 },
        }),
      ].join("\n"),
    )

    expect(logs).toEqual({
      audit: [
        { type: "text", content: "hello", timestamp: 10 },
        { type: "thinking", content: "world", timestamp: 11 },
      ],
    })
  })

  it("merges hydrated logs into persisted node states", () => {
    const snapshot: PersistedRunSnapshot = {
      nodeStates: {
        audit: {
          status: "running",
          attempts: 1,
          log: [],
        },
      },
      runtimeNodes: [],
      runtimeEdges: [],
      runtimeMeta: {},
      evalResults: {},
    }

    const hydrated = mergeNodeLogsIntoSnapshot(snapshot, {
      audit: [{ type: "text", content: "streamed", timestamp: 20 }],
      normalize: [{ type: "text", content: "late branch", timestamp: 30 }],
    })

    expect(hydrated.nodeStates.audit.log).toEqual([
      { type: "text", content: "streamed", timestamp: 20 },
    ])
    expect(hydrated.nodeStates.normalize).toEqual({
      status: "pending",
      attempts: 0,
      log: [{ type: "text", content: "late branch", timestamp: 30 }],
    })
  })

  describe("bounded persisted event loading", () => {
    let workspace: string

    afterEach(async () => {
      if (workspace) {
        await rm(workspace, { recursive: true, force: true })
      }
    })

    it("loads only the retained tail of oversized events files", async () => {
      workspace = await mkdtemp(join(tmpdir(), "run-snapshot-test-"))
      const eventsPath = join(workspace, "events.jsonl")
      const oversizedPrefix = `${"x".repeat(5 * 1024 * 1024 + 127)}€`
      const tailEvents = [
        JSON.stringify({
          type: "node-log",
          runId: "run-1",
          nodeId: "kept",
          entry: { type: "text", content: "tail event", timestamp: 20 },
        }),
        JSON.stringify({
          type: "node-log",
          runId: "run-1",
          nodeId: "kept",
          entry: { type: "thinking", content: "still here", timestamp: 21 },
        }),
      ].join("\n")
      await writeFile(
        eventsPath,
        `${oversizedPrefix}\n${tailEvents}\n`,
        "utf-8",
      )

      const logs = await loadPersistedNodeLogs(workspace)

      expect(logs).toEqual({
        kept: [
          { type: "text", content: "tail event", timestamp: 20 },
          { type: "thinking", content: "still here", timestamp: 21 },
        ],
      })
    })

    it("returns null when the events file is missing", async () => {
      workspace = await mkdtemp(join(tmpdir(), "run-snapshot-test-"))

      await expect(readPersistedEventsTail(workspace)).resolves.toBeNull()
    })
  })
})
