import { ipcMain } from "electron"
import type { InstalledPlugin } from "@shared/types"
import {
  getMarketplaces,
  installMarketplace,
  listInstalledPlugins,
  PREDEFINED_MARKETPLACES,
  removeMarketplace,
  setPluginEnabled,
  updateMarketplace,
} from "../lib/plugins"
import { logError, logInfo } from "../lib/structured-log"

const mutationQueueByMarketplaceId = new Map<string, Promise<void>>()
let scanInFlight: Promise<InstalledPlugin[]> | null = null

function runSerializedMarketplaceMutation<T>(
  marketplaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous =
    mutationQueueByMarketplaceId.get(marketplaceId) ?? Promise.resolve()
  const next = previous.then(operation)
  const tracked = next.then(
    () => undefined,
    () => undefined,
  )
  mutationQueueByMarketplaceId.set(marketplaceId, tracked)
  void tracked.finally(() => {
    if (mutationQueueByMarketplaceId.get(marketplaceId) === tracked) {
      mutationQueueByMarketplaceId.delete(marketplaceId)
    }
  })
  return next
}

async function waitForMutationQueuesToDrain(): Promise<void> {
  while (mutationQueueByMarketplaceId.size > 0) {
    await Promise.allSettled(Array.from(mutationQueueByMarketplaceId.values()))
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

export function registerPluginsHandlers() {
  ipcMain.handle("plugins:list-marketplaces", async () => getMarketplaces())

  ipcMain.handle("plugins:install-marketplace", async (_event, id: string) => {
    const marketplace = PREDEFINED_MARKETPLACES.find((entry) => entry.id === id)
    if (!marketplace) {
      throw new Error(`Unknown marketplace: ${id}`)
    }

    const scanWaitMs = await waitForActiveScanToComplete()
    if (scanWaitMs > 0) {
      logInfo("plugins-ipc", "mutation_waited_for_scan", {
        action: "install",
        marketplaceId: id,
        scanWaitMs,
      })
    }

    const queued = mutationQueueByMarketplaceId.has(id)
    const queueStartAt = Date.now()
    if (queued) {
      logInfo("plugins-ipc", "mutation_queued", {
        action: "install",
        marketplaceId: id,
      })
    }

    await runSerializedMarketplaceMutation(id, async () => {
      const queueWaitMs = Date.now() - queueStartAt
      try {
        await installMarketplace(marketplace)
      } catch (error) {
        logError("plugins-ipc", "install_failed", {
          marketplaceId: id,
          queueWaitMs,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })

    return true
  })

  ipcMain.handle("plugins:update-marketplace", async (_event, id: string) => {
    const marketplace = PREDEFINED_MARKETPLACES.find((entry) => entry.id === id)
    if (!marketplace) {
      throw new Error(`Unknown marketplace: ${id}`)
    }

    const scanWaitMs = await waitForActiveScanToComplete()
    if (scanWaitMs > 0) {
      logInfo("plugins-ipc", "mutation_waited_for_scan", {
        action: "update",
        marketplaceId: id,
        scanWaitMs,
      })
    }

    const queued = mutationQueueByMarketplaceId.has(id)
    const queueStartAt = Date.now()
    if (queued) {
      logInfo("plugins-ipc", "mutation_queued", {
        action: "update",
        marketplaceId: id,
      })
    }

    await runSerializedMarketplaceMutation(id, async () => {
      const queueWaitMs = Date.now() - queueStartAt
      try {
        await updateMarketplace(id)
      } catch (error) {
        logError("plugins-ipc", "update_failed", {
          marketplaceId: id,
          queueWaitMs,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })

    return true
  })

  ipcMain.handle("plugins:remove-marketplace", async (_event, id: string) => {
    const marketplace = PREDEFINED_MARKETPLACES.find((entry) => entry.id === id)
    if (!marketplace) {
      throw new Error(`Unknown marketplace: ${id}`)
    }

    const scanWaitMs = await waitForActiveScanToComplete()
    if (scanWaitMs > 0) {
      logInfo("plugins-ipc", "mutation_waited_for_scan", {
        action: "remove",
        marketplaceId: id,
        scanWaitMs,
      })
    }

    const queued = mutationQueueByMarketplaceId.has(id)
    const queueStartAt = Date.now()
    if (queued) {
      logInfo("plugins-ipc", "mutation_queued", {
        action: "remove",
        marketplaceId: id,
      })
    }

    await runSerializedMarketplaceMutation(id, async () => {
      const queueWaitMs = Date.now() - queueStartAt
      try {
        await removeMarketplace(id)
      } catch (error) {
        logError("plugins-ipc", "remove_failed", {
          marketplaceId: id,
          queueWaitMs,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })

    return true
  })

  ipcMain.handle("plugins:scan", async () => {
    if (scanInFlight) {
      logInfo("plugins-ipc", "scan_reused_inflight")
      return scanInFlight
    }

    const scanPromise = (async (): Promise<InstalledPlugin[]> => {
      const pendingMutations = mutationQueueByMarketplaceId.size
      if (pendingMutations > 0) {
        logInfo("plugins-ipc", "scan_waiting_for_mutations", {
          pendingMutations,
        })
      }
      await waitForMutationQueuesToDrain()

      try {
        return await listInstalledPlugins()
      } catch (error) {
        logError("plugins-ipc", "scan_failed", {
          pendingMutations,
          error: error instanceof Error ? error.message : String(error),
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

  ipcMain.handle(
    "plugins:set-enabled",
    async (_event, pluginId: string, enabled: boolean) => {
      const scanWaitMs = await waitForActiveScanToComplete()
      if (scanWaitMs > 0) {
        logInfo("plugins-ipc", "set_enabled_waited_for_scan", {
          pluginId,
          enabled,
          scanWaitMs,
        })
      }
      return setPluginEnabled(pluginId, enabled)
    },
  )
}
