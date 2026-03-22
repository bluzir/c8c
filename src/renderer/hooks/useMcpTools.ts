import { useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import {
  currentWorkflowAtom,
  defaultProviderAtom,
  mcpDiscoveredToolsAtom,
  selectedProjectAtom,
} from "@/lib/store"
import type { McpToolInfo } from "@shared/types"

export function useMcpTools(): {
  tools: McpToolInfo[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [tools, setTools] = useAtom(mcpDiscoveredToolsAtom)
  const [loading, setLoading] = useState(false)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const provider = workflow.defaults?.provider || defaultProvider
  const latestRequestRef = useRef(0)

  const refresh = async () => {
    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId
    setLoading(true)
    try {
      const discovered = await window.api.mcpDiscoverTools(provider, undefined, selectedProject ?? undefined)
      if (latestRequestRef.current !== requestId) return
      setTools(discovered)
    } catch (error) {
      console.error("[useMcpTools] discoverTools failed:", error)
    } finally {
      if (latestRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    // Auto-fetch on first mount if cache is empty
    if (tools.length === 0) {
      void refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, selectedProject])

  return { tools, loading, refresh }
}
