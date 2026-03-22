import { useCallback, useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import {
  currentWorkflowAtom,
  librariesAtom,
  mainViewAtom,
  selectedProjectAtom,
  selectedNodeIdAtom,
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
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { PageHeader, PageShell } from "@/components/ui/page-shell"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SkillSourcesAdmin } from "@/components/skills/SkillSourcesAdmin"
import { SkillsPageDialogs } from "@/components/skills/skill-dialogs"
import { SkillsActionStatus } from "@/components/skills/SkillsActionStatus"
import { SkillsAttachSection } from "@/components/skills/SkillsAttachSection"
import { useSkillsPageDerivedState } from "@/components/skills/useSkillsPageDerivedState"
import {
  LIBRARY_ACTION_LABEL,
  LIBRARY_PREVIEW_HINTS,
  MARKETPLACE_ACTION_LABEL,
  type LibraryAction,
  type MarketplaceAction,
  PLUGIN_ACTION_LABEL,
  type PluginAction,
} from "@/components/skills/skills-page-helpers"

export function SkillsPage() {
  const [libraries, setLibraries] = useAtom(librariesAtom)
  const [skills, setSkills] = useAtom(skillsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [, setMainView] = useAtom(mainViewAtom)

  const [marketplaces, setMarketplaces] = useState<MarketplaceSource[]>([])
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [pluginMcpServers, setPluginMcpServers] = useState<PluginMcpServerInfo[]>([])
  const [query, setQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [activeSection, setActiveSection] = useState<"attach" | "sources">(selectedWorkflowPath ? "attach" : "sources")
  const [libraryAction, setLibraryAction] = useState<{ id: string; action: LibraryAction } | null>(null)
  const [marketplaceAction, setMarketplaceAction] = useState<{ id: string; action: MarketplaceAction } | null>(null)
  const [pluginAction, setPluginAction] = useState<{ id: string; action: PluginAction } | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [pendingUninstall, setPendingUninstall] = useState<SkillLibrary | null>(null)
  const [pendingDisablePlugin, setPendingDisablePlugin] = useState<InstalledPlugin | null>(null)
  const [pendingRemoveMarketplace, setPendingRemoveMarketplace] = useState<MarketplaceSource | null>(null)
  const [previewLibrary, setPreviewLibrary] = useState<SkillLibrary | null>(null)
  const [previewPlugin, setPreviewPlugin] = useState<InstalledPlugin | null>(null)
  const [acknowledgeBrokenRefs, setAcknowledgeBrokenRefs] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<DiscoveredSkill | null>(null)
  const refreshRequestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1
    refreshRequestIdRef.current = requestId
    setRefreshing(true)
    try {
      const [loadedLibraries, loadedMarketplaces, loadedPlugins, loadedPluginMcpServers, scanned] = await Promise.all([
        window.api.listLibraries(),
        window.api.listMarketplaces(),
        window.api.scanPlugins(),
        window.api.mcpListPluginServers(),
        selectedProject ? window.api.scanSkills(selectedProject) : Promise.resolve([] as DiscoveredSkill[]),
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
  }, [pendingDisablePlugin?.id, pendingRemoveMarketplace?.id, pendingUninstall?.id])

  const {
    skillsCountByLibrary,
    skillsByLibrary,
    skillsCountByPlugin,
    skillsByPlugin,
    pluginMcpByPlugin,
    libraryById,
    filteredMarketplaces,
    filteredPlugins,
    filteredSkills,
    pluginsByMarketplaceId,
    currentProcessLabel,
    groupedSkills,
    installedLibraries,
    favoriteLibraries,
    availableLibraries,
    installedMarketplaces,
    availableMarketplaces,
    enabledPlugins,
    disabledPlugins,
    pendingUninstallRefs,
    pendingDisablePluginRefs,
    pendingRemoveMarketplaceRefs,
  } = useSkillsPageDerivedState({
    libraries,
    skills,
    marketplaces,
    plugins,
    pluginMcpServers,
    query,
    currentWorkflow,
    currentWorkflowName: currentWorkflow.name,
    selectedWorkflowPath,
    pendingUninstall,
    pendingDisablePlugin,
    pendingRemoveMarketplace,
  })

  useEffect(() => {
    if (!selectedSkill) return
    const stillVisible = filteredSkills.some((skill) => skill.path === selectedSkill.path)
    if (!stillVisible) {
      setSelectedSkill(null)
    }
  }, [filteredSkills, selectedSkill])

  const setLibraryInstalled = useCallback(async (library: SkillLibrary, nextChecked: boolean) => {
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
  }, [refresh])

  const mutateMarketplace = useCallback(async (
    marketplace: MarketplaceSource,
    action: MarketplaceAction,
    operation: () => Promise<boolean>,
  ) => {
    setMarketplaceAction({ id: marketplace.id, action })
    try {
      await operation()
      const verb = action === "installing" ? "installed" : action === "updating" ? "updated" : "removed"
      toast.success(`Marketplace ${verb}: ${marketplace.name}`)
      setStatusMessage(`${marketplace.name} ${verb}`)
      await refresh()
    } catch (error) {
      const verb = action === "installing" ? "install" : action === "updating" ? "update" : "remove"
      toastErrorFromCatch(`Could not ${verb} ${marketplace.name}`, error)
      setStatusMessage(`Failed to ${verb} ${marketplace.name}`)
    } finally {
      setMarketplaceAction(null)
    }
  }, [refresh])

  const installMarketplace = useCallback(async (marketplace: MarketplaceSource) => {
    await mutateMarketplace(marketplace, "installing", () => window.api.installMarketplace(marketplace.id))
  }, [mutateMarketplace])

  const updateMarketplace = useCallback(async (marketplace: MarketplaceSource) => {
    await mutateMarketplace(marketplace, "updating", () => window.api.updateMarketplace(marketplace.id))
  }, [mutateMarketplace])

  const requestRemoveMarketplace = useCallback((marketplace: MarketplaceSource) => {
    setPendingRemoveMarketplace(marketplace)
  }, [])

  const commitRemoveMarketplace = useCallback(async () => {
    const marketplace = pendingRemoveMarketplace
    if (!marketplace) return
    if (pendingRemoveMarketplaceRefs.length > 0 && !acknowledgeBrokenRefs) {
      return
    }
    setPendingRemoveMarketplace(null)
    await mutateMarketplace(marketplace, "removing", () => window.api.removeMarketplace(marketplace.id))
    setAcknowledgeBrokenRefs(false)
  }, [acknowledgeBrokenRefs, mutateMarketplace, pendingRemoveMarketplace, pendingRemoveMarketplaceRefs.length])

  const setPluginEnabled = useCallback(async (plugin: InstalledPlugin, nextChecked: boolean) => {
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
  }, [refresh])

  const commitDisablePlugin = useCallback(async () => {
    const plugin = pendingDisablePlugin
    if (!plugin) return
    if (pendingDisablePluginRefs.length > 0 && !acknowledgeBrokenRefs) {
      return
    }
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
  }, [acknowledgeBrokenRefs, pendingDisablePlugin, pendingDisablePluginRefs.length, refresh])

  const updateLibrary = useCallback(async (library: SkillLibrary) => {
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
  }, [refresh])

  const commitUninstall = useCallback(async () => {
    const library = pendingUninstall
    if (!library) return
    if (pendingUninstallRefs.length > 0 && !acknowledgeBrokenRefs) {
      return
    }
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
  }, [acknowledgeBrokenRefs, pendingUninstall, pendingUninstallRefs.length, refresh])

  const addToWorkflowDisabledReason = !selectedProject
    ? "Select a project first."
    : !selectedWorkflowPath
      ? "Open a flow first."
      : null

  const addSkillToWorkflow = useCallback((skill: DiscoveredSkill) => {
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
      nextSelectedId = next.nodes.find((node) => !previousIds.has(node.id))?.id ?? null
      return next
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
    toast.success(`Skill attached: ${skill.name}`, {
      description: "The new step is ready in Edit flow.",
      action: {
        label: "Edit flow",
        onClick: () => setMainView("thread"),
      },
    })
    setStatusMessage(`${skill.name} attached to flow`)
  }, [selectedProject, selectedWorkflowPath, setCurrentWorkflow, setMainView, setSelectedNodeId])

  const createSkill = async () => {
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
          description: "Starter file is ready. Open it from your file explorer.",
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
  }

  const previewItems = previewLibrary
    ? (skillsByLibrary.get(previewLibrary.id) || []).map((skill) => `${skill.category}/${skill.name}`)
    : []
  const previewHints = previewLibrary ? (LIBRARY_PREVIEW_HINTS[previewLibrary.id] || []) : []
  const currentLibraryActionLabel = libraryAction
    ? `${LIBRARY_ACTION_LABEL[libraryAction.action]} ${libraryById.get(libraryAction.id)?.name || "library"}...`
    : null
  const currentMarketplaceActionLabel = marketplaceAction
    ? `${MARKETPLACE_ACTION_LABEL[marketplaceAction.action]} ${marketplaces.find((item) => item.id === marketplaceAction.id)?.name || "marketplace"}...`
    : null
  const currentPluginActionLabel = pluginAction
    ? `${PLUGIN_ACTION_LABEL[pluginAction.action]} ${plugins.find((item) => item.id === pluginAction.id)?.name || "plugin"}...`
    : null
  const previewPluginSkills = previewPlugin
    ? (skillsByPlugin.get(previewPlugin.id) || []).map((skill) => `${skill.category}/${skill.name}`)
    : []
  const previewPluginMcpServers = previewPlugin
    ? (pluginMcpByPlugin.get(previewPlugin.id) || []).map((server) => server.name)
    : []
  const initialLoading = refreshing && !hasLoadedOnce
  const toolbarSummary = initialLoading
    ? "Loading skills..."
    : `${filteredMarketplaces.length} marketplace${filteredMarketplaces.length === 1 ? "" : "s"} · ${filteredPlugins.length} plugin${filteredPlugins.length === 1 ? "" : "s"} · ${filteredSkills.length} skill${filteredSkills.length === 1 ? "" : "s"}`

  return (
    <PageShell>
      <PageHeader
        title="Skills"
        subtitle="Manage skill sources and attach the right skill to the current flow."
      />

      <CollectionToolbar
        ariaLabel="Skill controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search skills, plugins, and sources"
        searchAriaLabel="Search skills, plugins, and sources"
        summary={toolbarSummary}
        surface="flat"
        action={(
          <Button
            size="sm"
            variant="outline"
            onClick={() => void createSkill()}
            disabled={!selectedProject}
            title={selectedProject ? undefined : "Select a project first to create a skill."}
          >
            <Plus size={14} />
            New skill
          </Button>
        )}
      />

      <SkillsActionStatus
        libraryActionLabel={currentLibraryActionLabel}
        marketplaceActionLabel={currentMarketplaceActionLabel}
        pluginActionLabel={currentPluginActionLabel}
      />

      <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as "attach" | "sources")} className="space-y-4">
        <TabsList aria-label="Skills page sections">
          <TabsTrigger value="attach">Attach to flow</TabsTrigger>
          <TabsTrigger value="sources">Manage sources</TabsTrigger>
        </TabsList>

        <TabsContent value="attach">
          <SkillsAttachSection
            filteredSkills={filteredSkills}
            allSkillsCount={skills.length}
            currentFlowLabel={currentProcessLabel}
            groupedSkills={groupedSkills}
            selectedSkill={selectedSkill}
            loading={initialLoading}
            onSelectSkill={setSelectedSkill}
            onAttachSkill={addSkillToWorkflow}
            addToFlowDisabledReason={addToWorkflowDisabledReason}
            onCloseSkillDetail={() => setSelectedSkill(null)}
          />
        </TabsContent>

        <TabsContent value="sources">
          <SkillSourcesAdmin
            libraries={libraries}
            totalMarketplaceCount={marketplaces.length}
            installedLibraries={installedLibraries}
            favoriteLibraries={favoriteLibraries}
            availableLibraries={availableLibraries}
            filteredMarketplaces={filteredMarketplaces}
            installedMarketplaces={installedMarketplaces}
            availableMarketplaces={availableMarketplaces}
            enabledPlugins={enabledPlugins}
            disabledPlugins={disabledPlugins}
            skillsCountByLibrary={skillsCountByLibrary}
            skillsCountByPlugin={skillsCountByPlugin}
            pluginMcpByPlugin={pluginMcpByPlugin}
            pluginsByMarketplaceId={pluginsByMarketplaceId}
            libraryAction={libraryAction}
            marketplaceAction={marketplaceAction}
            pluginAction={pluginAction}
            refreshing={refreshing}
            loading={initialLoading}
            hasQuery={Boolean(query.trim())}
            onSetLibraryInstalled={(library, nextChecked) => void setLibraryInstalled(library, nextChecked)}
            onUpdateLibrary={(library) => void updateLibrary(library)}
            onPreviewLibrary={setPreviewLibrary}
            onInstallMarketplace={(marketplace) => void installMarketplace(marketplace)}
            onUpdateMarketplace={(marketplace) => void updateMarketplace(marketplace)}
            onRequestRemoveMarketplace={requestRemoveMarketplace}
            onSetPluginEnabled={(plugin, nextChecked) => void setPluginEnabled(plugin, nextChecked)}
            onPreviewPlugin={setPreviewPlugin}
          />
        </TabsContent>
      </Tabs>

      <div aria-live="polite" className="sr-only">{statusMessage}</div>

      <SkillsPageDialogs
        pendingUninstall={pendingUninstall}
        pendingUninstallRefs={pendingUninstallRefs}
        onPendingUninstallChange={setPendingUninstall}
        onCommitUninstall={() => void commitUninstall()}
        pendingDisablePlugin={pendingDisablePlugin}
        pendingDisablePluginRefs={pendingDisablePluginRefs}
        onPendingDisablePluginChange={setPendingDisablePlugin}
        onCommitDisablePlugin={() => void commitDisablePlugin()}
        pendingRemoveMarketplace={pendingRemoveMarketplace}
        pendingRemoveMarketplaceRefs={pendingRemoveMarketplaceRefs}
        onPendingRemoveMarketplaceChange={setPendingRemoveMarketplace}
        onCommitRemoveMarketplace={() => void commitRemoveMarketplace()}
        acknowledgeBrokenRefs={acknowledgeBrokenRefs}
        onAcknowledgeBrokenRefsChange={setAcknowledgeBrokenRefs}
        previewLibrary={previewLibrary}
        previewItems={previewItems}
        previewHints={previewHints}
        onPreviewLibraryChange={setPreviewLibrary}
        previewPlugin={previewPlugin}
        previewPluginSkills={previewPluginSkills}
        previewPluginMcpServers={previewPluginMcpServers}
        onPreviewPluginChange={setPreviewPlugin}
        onOpenMcpSettings={() => setMainView("settings")}
      />
    </PageShell>
  )
}
