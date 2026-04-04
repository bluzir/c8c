import { useCallback, useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import {
  currentWorkflowAtom,
  flowSurfaceModeAtom,
  librariesAtom,
  mainViewAtom,
  selectedNodeIdAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  skillsAtom,
  type SkillLibrary,
} from "@/lib/store"
import { addSkillNodeToWorkflow } from "@/lib/workflow-mutations"
import type {
  DiscoveredSkill,
  InstalledPlugin,
  MarketplaceSource,
  PluginMcpServerInfo,
} from "@shared/types"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import {
  LIBRARY_ACTION_LABEL,
  MARKETPLACE_ACTION_LABEL,
  PLUGIN_ACTION_LABEL,
  type LibraryAction,
  type MarketplaceAction,
  type PluginAction,
} from "@/components/skills/skills-page-helpers"

export function useSkillsPageActions() {
  const [libraries, setLibraries] = useAtom(librariesAtom)
  const [skills, setSkills] = useAtom(skillsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setFlowSurfaceMode] = useAtom(flowSurfaceModeAtom)

  const [marketplaces, setMarketplaces] = useState<MarketplaceSource[]>([])
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [pluginMcpServers, setPluginMcpServers] = useState<
    PluginMcpServerInfo[]
  >([])
  const [query, setQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [libraryAction, setLibraryAction] = useState<{
    id: string
    action: LibraryAction
  } | null>(null)
  const [marketplaceAction, setMarketplaceAction] = useState<{
    id: string
    action: MarketplaceAction
  } | null>(null)
  const [pluginAction, setPluginAction] = useState<{
    id: string
    action: PluginAction
  } | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [pendingUninstall, setPendingUninstall] = useState<SkillLibrary | null>(
    null,
  )
  const [pendingDisablePlugin, setPendingDisablePlugin] =
    useState<InstalledPlugin | null>(null)
  const [pendingRemoveMarketplace, setPendingRemoveMarketplace] =
    useState<MarketplaceSource | null>(null)
  const [previewLibrary, setPreviewLibrary] = useState<SkillLibrary | null>(
    null,
  )
  const [previewPlugin, setPreviewPlugin] = useState<InstalledPlugin | null>(
    null,
  )
  const [acknowledgeBrokenRefs, setAcknowledgeBrokenRefs] = useState(false)
  const refreshRequestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1
    refreshRequestIdRef.current = requestId
    setRefreshing(true)
    try {
      const [
        loadedLibraries,
        loadedMarketplaces,
        loadedPlugins,
        loadedPluginMcpServers,
        scanned,
      ] = await Promise.all([
        window.api.listLibraries(),
        window.api.listMarketplaces(),
        window.api.scanPlugins(),
        window.api.mcpListPluginServers(),
        selectedProject
          ? window.api.scanSkills(selectedProject)
          : Promise.resolve([] as DiscoveredSkill[]),
      ])
      if (refreshRequestIdRef.current !== requestId) return
      setLibraries(loadedLibraries)
      setMarketplaces(loadedMarketplaces)
      setPlugins(loadedPlugins)
      setPluginMcpServers(loadedPluginMcpServers)
      setSkills(scanned)
    } catch (error) {
      if (refreshRequestIdRef.current !== requestId) return
      toastErrorFromCatch("Could not refresh skills", error)
    } finally {
      if (refreshRequestIdRef.current !== requestId) return
      setRefreshing(false)
      setHasLoadedOnce(true)
    }
  }, [selectedProject, setLibraries, setSkills])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setAcknowledgeBrokenRefs(false)
  }, [
    pendingDisablePlugin?.id,
    pendingRemoveMarketplace?.id,
    pendingUninstall?.id,
  ])

  // ── Library actions ───────────────────────────────────

  const setLibraryInstalled = useCallback(
    async (library: SkillLibrary, nextChecked: boolean) => {
      if (!nextChecked) {
        setPendingUninstall(library)
        return
      }
      setLibraryAction({ id: library.id, action: "installing" })
      try {
        await window.api.installLibrary(library.id)
        toast.success(`Library installed: ${library.name}`)
        setStatusMessage(`${library.name} installed`)
        await refresh()
      } catch (error) {
        toastErrorFromCatch(`Could not install ${library.name}`, error)
        setStatusMessage(`Failed to install ${library.name}`)
      } finally {
        setLibraryAction(null)
      }
    },
    [refresh],
  )

  const updateLibrary = useCallback(
    async (library: SkillLibrary) => {
      setLibraryAction({ id: library.id, action: "updating" })
      try {
        await window.api.installLibrary(library.id)
        toast.success(`Library updated: ${library.name}`)
        setStatusMessage(`${library.name} updated`)
        await refresh()
      } catch (error) {
        toastErrorFromCatch(`Could not update ${library.name}`, error)
        setStatusMessage(`Failed to update ${library.name}`)
      } finally {
        setLibraryAction(null)
      }
    },
    [refresh],
  )

  const commitUninstall = useCallback(async () => {
    const library = pendingUninstall
    if (!library) return
    setPendingUninstall(null)
    setLibraryAction({ id: library.id, action: "removing" })
    try {
      await window.api.removeLibrary(library.id)
      toast.success(`Library removed: ${library.name}`)
      setStatusMessage(`${library.name} removed`)
      await refresh()
    } catch (error) {
      toastErrorFromCatch(`Could not remove ${library.name}`, error)
      setStatusMessage(`Failed to remove ${library.name}`)
    } finally {
      setLibraryAction(null)
      setAcknowledgeBrokenRefs(false)
    }
  }, [pendingUninstall, refresh])

  // ── Marketplace actions ───────────────────────────────

  const mutateMarketplace = useCallback(
    async (
      marketplace: MarketplaceSource,
      action: MarketplaceAction,
      operation: () => Promise<boolean>,
    ) => {
      setMarketplaceAction({ id: marketplace.id, action })
      try {
        await operation()
        const verb =
          action === "installing"
            ? "installed"
            : action === "updating"
              ? "updated"
              : "removed"
        toast.success(`Marketplace ${verb}: ${marketplace.name}`)
        setStatusMessage(`${marketplace.name} ${verb}`)
        await refresh()
      } catch (error) {
        const verb =
          action === "installing"
            ? "install"
            : action === "updating"
              ? "update"
              : "remove"
        toastErrorFromCatch(`Could not ${verb} ${marketplace.name}`, error)
        setStatusMessage(`Failed to ${verb} ${marketplace.name}`)
      } finally {
        setMarketplaceAction(null)
      }
    },
    [refresh],
  )

  const installMarketplace = useCallback(
    async (marketplace: MarketplaceSource) => {
      await mutateMarketplace(marketplace, "installing", () =>
        window.api.installMarketplace(marketplace.id),
      )
    },
    [mutateMarketplace],
  )

  const updateMarketplace = useCallback(
    async (marketplace: MarketplaceSource) => {
      await mutateMarketplace(marketplace, "updating", () =>
        window.api.updateMarketplace(marketplace.id),
      )
    },
    [mutateMarketplace],
  )

  const requestRemoveMarketplace = useCallback(
    (marketplace: MarketplaceSource) => {
      setPendingRemoveMarketplace(marketplace)
    },
    [],
  )

  const commitRemoveMarketplace = useCallback(async () => {
    const marketplace = pendingRemoveMarketplace
    if (!marketplace) return
    setPendingRemoveMarketplace(null)
    await mutateMarketplace(marketplace, "removing", () =>
      window.api.removeMarketplace(marketplace.id),
    )
    setAcknowledgeBrokenRefs(false)
  }, [mutateMarketplace, pendingRemoveMarketplace])

  // ── Plugin actions ────────────────────────────────────

  const setPluginEnabled = useCallback(
    async (plugin: InstalledPlugin, nextChecked: boolean) => {
      if (!nextChecked) {
        setPendingDisablePlugin(plugin)
        return
      }
      setPluginAction({ id: plugin.id, action: "enabling" })
      try {
        await window.api.setPluginEnabled(plugin.id, true)
        toast.success(`Plugin enabled: ${plugin.name}`)
        setStatusMessage(`${plugin.name} enabled`)
        await refresh()
      } catch (error) {
        toastErrorFromCatch(`Could not enable ${plugin.name}`, error)
        setStatusMessage(`Failed to enable ${plugin.name}`)
      } finally {
        setPluginAction(null)
      }
    },
    [refresh],
  )

  const commitDisablePlugin = useCallback(async () => {
    const plugin = pendingDisablePlugin
    if (!plugin) return
    setPendingDisablePlugin(null)
    setPluginAction({ id: plugin.id, action: "disabling" })
    try {
      await window.api.setPluginEnabled(plugin.id, false)
      toast.success(`Plugin disabled: ${plugin.name}`)
      setStatusMessage(`${plugin.name} disabled`)
      await refresh()
    } catch (error) {
      toastErrorFromCatch(`Could not disable ${plugin.name}`, error)
      setStatusMessage(`Failed to disable ${plugin.name}`)
    } finally {
      setPluginAction(null)
      setAcknowledgeBrokenRefs(false)
    }
  }, [pendingDisablePlugin, refresh])

  // ── Attach skill to workflow ──────────────────────────

  const addToWorkflowDisabledReason = !selectedProject
    ? "Select a project first."
    : !selectedWorkflowPath
      ? "Open a flow first."
      : null

  const addSkillToWorkflow = useCallback(
    (skill: DiscoveredSkill) => {
      if (!selectedProject) {
        toastError("Select a project first.")
        return
      }
      if (!selectedWorkflowPath) {
        toastError("Open a flow first, then attach a skill.")
        return
      }
      let nextSelectedId: string | null = null
      setCurrentWorkflow((prev) => {
        const next = addSkillNodeToWorkflow(prev, skill)
        const previousIds = new Set(prev.nodes.map((node) => node.id))
        nextSelectedId =
          next.nodes.find((node) => !previousIds.has(node.id))?.id ?? null
        return next
      })
      if (nextSelectedId) {
        setSelectedNodeId(nextSelectedId)
      }
      toast.success(`Skill attached: ${skill.name}`, {
        description: "The new step is ready in Edit flow graph.",
        action: {
          label: "Edit flow graph",
          onClick: () => {
            setMainView("thread")
            setFlowSurfaceMode("edit")
          },
        },
      })
      setStatusMessage(`${skill.name} attached to flow`)
    },
    [
      selectedProject,
      selectedWorkflowPath,
      setCurrentWorkflow,
      setFlowSurfaceMode,
      setMainView,
      setSelectedNodeId,
    ],
  )

  // ── Create skill ──────────────────────────────────────

  const createSkill = useCallback(async () => {
    if (!selectedProject) {
      toastError("Select a project first, then create a skill.")
      return
    }
    try {
      const skillPath = await window.api.createSkillTemplate(selectedProject)
      await refresh()
      const openError = await window.api.openPath(skillPath)
      const fileName = skillPath.split("/").pop() || "skill file"
      if (openError) {
        toast.success(`Skill created: ${fileName}`, {
          description:
            "Starter file is ready. Open it from your file explorer.",
          action: {
            label: "Open file",
            onClick: () => void window.api.openPath(skillPath),
          },
        })
      } else {
        toast.success(`Skill created and opened: ${fileName}`)
      }
      setStatusMessage("Skill starter created")
    } catch (error) {
      toastErrorFromCatch("Could not create skill starter", error)
      setStatusMessage("Failed to create skill starter")
    }
  }, [refresh, selectedProject])

  return {
    // Atoms
    libraries,
    skills,
    selectedProject,
    selectedWorkflowPath,
    currentWorkflow,
    // Local state
    marketplaces,
    plugins,
    pluginMcpServers,
    query,
    setQuery,
    refreshing,
    hasLoadedOnce,
    libraryAction,
    marketplaceAction,
    pluginAction,
    statusMessage,
    pendingUninstall,
    setPendingUninstall,
    pendingDisablePlugin,
    setPendingDisablePlugin,
    pendingRemoveMarketplace,
    setPendingRemoveMarketplace,
    previewLibrary,
    setPreviewLibrary,
    previewPlugin,
    setPreviewPlugin,
    acknowledgeBrokenRefs,
    setAcknowledgeBrokenRefs,
    // Actions
    refresh,
    setLibraryInstalled,
    updateLibrary,
    commitUninstall,
    mutateMarketplace,
    installMarketplace,
    updateMarketplace,
    requestRemoveMarketplace,
    commitRemoveMarketplace,
    setPluginEnabled,
    commitDisablePlugin,
    addToWorkflowDisabledReason,
    addSkillToWorkflow,
    createSkill,
    setMainView,
  }
}

