import { ipcMain } from "electron"
import {
  getLibraries,
  installLibrary,
  removeLibrary,
  PREDEFINED_LIBRARIES,
  scanAllLibraries,
} from "../lib/libraries"
import { errorMessage } from "../lib/error-utils"
import { trackTelemetryEvent } from "../lib/telemetry/service"
import { logError, logInfo } from "../lib/structured-log"
import type { DiscoveredSkill } from "@shared/types"

const mutationQueueByLibraryId = new Map<string, Promise<void>>()
let scanInFlight: Promise<DiscoveredSkill[]> | null = null

function runSerializedLibraryMutation<T>(
  libraryId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = mutationQueueByLibraryId.get(libraryId) ?? Promise.resolve()
  const next = previous.then(operation)
  const tracked = next.then(
    () => undefined,
    () => undefined,
  )
  mutationQueueByLibraryId.set(libraryId, tracked)
  void tracked.finally(() => {
    if (mutationQueueByLibraryId.get(libraryId) === tracked) {
      mutationQueueByLibraryId.delete(libraryId)
    }
  })
  return next
}

async function waitForMutationQueuesToDrain(): Promise<void> {
  while (mutationQueueByLibraryId.size > 0) {
    const pending = Array.from(mutationQueueByLibraryId.values())
    await Promise.allSettled(pending)
  }
}

async function waitForActiveScanToComplete(): Promise<number> {
  const startedAt = Date.now()
  while (scanInFlight) {
    const activeScan = scanInFlight
    await activeScan.catch(() => undefined)
    if (scanInFlight === activeScan) break
  }
  return Date.now() - startedAt
}

export function registerLibrariesHandlers() {
  ipcMain.handle("libraries:list", async () => {
    const startedAt = Date.now()
    const libraries = await getLibraries()
    const installedTotal = libraries.filter(
      (library) => library.installed,
    ).length
    void trackTelemetryEvent("library_action", {
      action: "list",
      status: "success",
      libraries_total: libraries.length,
      installed_total: installedTotal,
      duration_ms: Date.now() - startedAt,
    })
    return libraries
  })

  ipcMain.handle("libraries:install", async (_e, id: string) => {
    const lib = PREDEFINED_LIBRARIES.find((l) => l.id === id)
    if (!lib) {
      void trackTelemetryEvent("library_action", {
        action: "install",
        status: "failed",
        library_id: id,
        error_kind: "unknown_library",
      })
      throw new Error(`Unknown library: ${id}`)
    }

    const scanWaitMs = await waitForActiveScanToComplete()
    if (scanWaitMs > 0) {
      logInfo("libraries-ipc", "mutation_waited_for_scan", {
        action: "install",
        libraryId: id,
        scanWaitMs,
      })
    }

    const queued = mutationQueueByLibraryId.has(id)
    const queueStartAt = Date.now()
    const startedAt = queueStartAt

    if (queued) {
      logInfo("libraries-ipc", "mutation_queued", {
        action: "install",
        libraryId: id,
      })
    }

    await runSerializedLibraryMutation(id, async () => {
      const queueWaitMs = Date.now() - queueStartAt
      try {
        await installLibrary(lib)
        void trackTelemetryEvent("library_action", {
          action: "install",
          status: "success",
          library_id: id,
          queued,
          scan_wait_ms: scanWaitMs,
          queue_wait_ms: queueWaitMs,
          duration_ms: Date.now() - startedAt,
        })
      } catch (error) {
        void trackTelemetryEvent("library_action", {
          action: "install",
          status: "failed",
          library_id: id,
          queued,
          scan_wait_ms: scanWaitMs,
          queue_wait_ms: queueWaitMs,
          duration_ms: Date.now() - startedAt,
          error_kind: "install_failed",
        })
        logError("libraries-ipc", "install_failed", {
          libraryId: id,
          queueWaitMs,
          error: errorMessage(error),
        })
        throw error
      }
    })
    return true
  })

  ipcMain.handle("libraries:remove", async (_e, id: string) => {
    const lib = PREDEFINED_LIBRARIES.find((l) => l.id === id)
    if (!lib) {
      void trackTelemetryEvent("library_action", {
        action: "remove",
        status: "failed",
        library_id: id,
        error_kind: "unknown_library",
      })
      throw new Error(`Unknown library: ${id}`)
    }

    const scanWaitMs = await waitForActiveScanToComplete()
    if (scanWaitMs > 0) {
      logInfo("libraries-ipc", "mutation_waited_for_scan", {
        action: "remove",
        libraryId: id,
        scanWaitMs,
      })
    }

    const queued = mutationQueueByLibraryId.has(id)
    const queueStartAt = Date.now()
    const startedAt = queueStartAt

    if (queued) {
      logInfo("libraries-ipc", "mutation_queued", {
        action: "remove",
        libraryId: id,
      })
    }

    await runSerializedLibraryMutation(id, async () => {
      const queueWaitMs = Date.now() - queueStartAt
      try {
        await removeLibrary(id)
        void trackTelemetryEvent("library_action", {
          action: "remove",
          status: "success",
          library_id: id,
          queued,
          scan_wait_ms: scanWaitMs,
          queue_wait_ms: queueWaitMs,
          duration_ms: Date.now() - startedAt,
        })
      } catch (error) {
        void trackTelemetryEvent("library_action", {
          action: "remove",
          status: "failed",
          library_id: id,
          queued,
          scan_wait_ms: scanWaitMs,
          queue_wait_ms: queueWaitMs,
          duration_ms: Date.now() - startedAt,
          error_kind: "remove_failed",
        })
        logError("libraries-ipc", "remove_failed", {
          libraryId: id,
          queueWaitMs,
          error: errorMessage(error),
        })
        throw error
      }
    })
    return true
  })

  ipcMain.handle("libraries:scan", async () => {
    if (scanInFlight) {
      logInfo("libraries-ipc", "scan_reused_inflight")
      void trackTelemetryEvent("library_action", {
        action: "scan",
        status: "shared_inflight",
        deduped: true,
      })
      return scanInFlight
    }

    const startedAt = Date.now()
    const scanPromise = (async (): Promise<DiscoveredSkill[]> => {
      const pendingMutations = mutationQueueByLibraryId.size
      if (pendingMutations > 0) {
        logInfo("libraries-ipc", "scan_waiting_for_mutations", {
          pendingMutations,
        })
      }
      const waitStartedAt = Date.now()
      await waitForMutationQueuesToDrain()
      const mutationWaitMs = Date.now() - waitStartedAt

      try {
        const skills = await scanAllLibraries()
        const libraries = new Set<string>()
        for (const skill of skills) {
          if (skill.library) libraries.add(skill.library)
        }
        void trackTelemetryEvent("library_action", {
          action: "scan",
          status: "success",
          deduped: false,
          pending_mutations_before_scan: pendingMutations,
          mutation_wait_ms: mutationWaitMs,
          scanned_libraries_total: libraries.size,
          discovered_skills_total: skills.length,
          duration_ms: Date.now() - startedAt,
        })
        return skills
      } catch (error) {
        void trackTelemetryEvent("library_action", {
          action: "scan",
          status: "failed",
          deduped: false,
          pending_mutations_before_scan: pendingMutations,
          mutation_wait_ms: mutationWaitMs,
          duration_ms: Date.now() - startedAt,
          error_kind: "scan_failed",
        })
        logError("libraries-ipc", "scan_failed", {
          pendingMutations,
          mutationWaitMs,
          error: errorMessage(error),
        })
        throw error
      }
    })()

    scanInFlight = scanPromise
    try {
      return await scanPromise
    } finally {
      if (scanInFlight === scanPromise) {
        scanInFlight = null
      }
    }
  })
}
