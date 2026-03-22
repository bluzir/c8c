import { useMemo } from "react"

import { getSkillSourceKind, getSkillSourceLabel } from "@/lib/skill-source"
import type { SkillLibrary } from "@/lib/store"
import type {
  DiscoveredSkill,
  InstalledPlugin,
  MarketplaceSource,
  PluginMcpServerInfo,
  Workflow,
} from "@shared/types"

import {
  FAVORITE_LIBRARY_ORDER,
  findWorkflowRefsBySkills,
} from "@/components/skills/skills-page-helpers"

const CAPABILITY_SOURCE_SECTIONS = [
  {
    id: "project",
    title: "Project skills",
    description: "Found in this repo or workspace.",
    kinds: new Set(["project"]),
  },
  {
    id: "personal",
    title: "Personal skills",
    description: "Reusable across your work.",
    kinds: new Set(["user"]),
  },
  {
    id: "imported",
    title: "Imported skills",
    description: "Connected from libraries and plugins.",
    kinds: new Set(["library", "plugin"]),
  },
] as const

export function useSkillsPageDerivedState({
  libraries,
  skills,
  marketplaces,
  plugins,
  pluginMcpServers,
  query,
  currentWorkflow,
  currentWorkflowName,
  selectedWorkflowPath,
  pendingUninstall,
  pendingDisablePlugin,
  pendingRemoveMarketplace,
}: {
  libraries: SkillLibrary[]
  skills: DiscoveredSkill[]
  marketplaces: MarketplaceSource[]
  plugins: InstalledPlugin[]
  pluginMcpServers: PluginMcpServerInfo[]
  query: string
  currentWorkflow: Workflow
  currentWorkflowName?: string | null
  selectedWorkflowPath?: string | null
  pendingUninstall: SkillLibrary | null
  pendingDisablePlugin: InstalledPlugin | null
  pendingRemoveMarketplace: MarketplaceSource | null
}) {
  const skillsCountByLibrary = useMemo(() => {
    const counter = new Map<string, number>()
    for (const skill of skills) {
      if (skill.sourceScope !== "library" || !skill.library) continue
      counter.set(skill.library, (counter.get(skill.library) ?? 0) + 1)
    }
    return counter
  }, [skills])

  const skillsByLibrary = useMemo(() => {
    const map = new Map<string, DiscoveredSkill[]>()
    for (const skill of skills) {
      if (skill.sourceScope !== "library" || !skill.library) continue
      const list = map.get(skill.library) || []
      list.push(skill)
      map.set(skill.library, list)
    }
    return map
  }, [skills])

  const skillsCountByPlugin = useMemo(() => {
    const counter = new Map<string, number>()
    for (const skill of skills) {
      if (skill.sourceScope !== "plugin" || !skill.pluginId) continue
      counter.set(skill.pluginId, (counter.get(skill.pluginId) ?? 0) + 1)
    }
    return counter
  }, [skills])

  const skillsByPlugin = useMemo(() => {
    const map = new Map<string, DiscoveredSkill[]>()
    for (const skill of skills) {
      if (skill.sourceScope !== "plugin" || !skill.pluginId) continue
      const list = map.get(skill.pluginId) || []
      list.push(skill)
      map.set(skill.pluginId, list)
    }
    return map
  }, [skills])

  const pluginMcpByPlugin = useMemo(() => {
    const map = new Map<string, PluginMcpServerInfo[]>()
    for (const server of pluginMcpServers) {
      const list = map.get(server.pluginId) || []
      list.push(server)
      map.set(server.pluginId, list)
    }
    return map
  }, [pluginMcpServers])

  const libraryById = useMemo(() => {
    return new Map(libraries.map((library) => [library.id, library]))
  }, [libraries])

  const pluginsByMarketplaceId = useMemo(() => {
    const map = new Map<string, InstalledPlugin[]>()
    for (const plugin of plugins) {
      const list = map.get(plugin.marketplaceId) || []
      list.push(plugin)
      map.set(plugin.marketplaceId, list)
    }
    return map
  }, [plugins])

  const filteredLibraries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return libraries
    return libraries.filter((library) =>
      `${library.name} ${library.description} ${library.id}`.toLowerCase().includes(normalizedQuery),
    )
  }, [libraries, query])

  const filteredMarketplaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return marketplaces
    return marketplaces.filter((marketplace) =>
      `${marketplace.name} ${marketplace.description} ${marketplace.id} ${marketplace.owner || ""}`.toLowerCase().includes(normalizedQuery),
    )
  }, [marketplaces, query])

  const filteredPlugins = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const list = !normalizedQuery
      ? plugins
      : plugins.filter((plugin) =>
        [
          plugin.name,
          plugin.description,
          plugin.marketplaceName,
          plugin.category || "",
          plugin.tags?.join(" ") || "",
          plugin.capabilities.join(" "),
        ].join(" ").toLowerCase().includes(normalizedQuery),
      )

    return [...list].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      if (a.marketplaceName !== b.marketplaceName) return a.marketplaceName.localeCompare(b.marketplaceName)
      return a.name.localeCompare(b.name)
    })
  }, [plugins, query])

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const list = !normalizedQuery
      ? skills
      : skills.filter((skill) =>
        `${skill.name} ${skill.description} ${skill.category} ${getSkillSourceLabel(skill)}`.toLowerCase().includes(normalizedQuery),
      )
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills, query])

  const currentProcessLabel = useMemo(() => {
    const workflowName = currentWorkflowName?.trim()
    if (workflowName) return workflowName
    if (!selectedWorkflowPath) return null
    const fileName = selectedWorkflowPath.split("/").pop() || ""
    return fileName.replace(/\.(yaml|yml|json)$/i, "") || null
  }, [currentWorkflowName, selectedWorkflowPath])

  const groupedSkills = useMemo(() => {
    return CAPABILITY_SOURCE_SECTIONS.map((section) => {
      const items = filteredSkills.filter((skill) => section.kinds.has(getSkillSourceKind(skill)))
      return { ...section, items }
    }).filter((section) => section.items.length > 0)
  }, [filteredSkills])

  const installedLibraries = useMemo(
    () => filteredLibraries.filter((library) => library.installed),
    [filteredLibraries],
  )
  const favoriteLibraries = useMemo(
    () => filteredLibraries
      .filter((library) => !library.installed && FAVORITE_LIBRARY_ORDER.has(library.id))
      .sort((a, b) => (FAVORITE_LIBRARY_ORDER.get(a.id) ?? 999) - (FAVORITE_LIBRARY_ORDER.get(b.id) ?? 999)),
    [filteredLibraries],
  )
  const availableLibraries = useMemo(
    () => filteredLibraries.filter((library) => !library.installed && !FAVORITE_LIBRARY_ORDER.has(library.id)),
    [filteredLibraries],
  )
  const installedMarketplaces = useMemo(
    () => filteredMarketplaces.filter((marketplace) => marketplace.installed),
    [filteredMarketplaces],
  )
  const availableMarketplaces = useMemo(
    () => filteredMarketplaces.filter((marketplace) => !marketplace.installed),
    [filteredMarketplaces],
  )
  const enabledPlugins = useMemo(
    () => filteredPlugins.filter((plugin) => plugin.enabled),
    [filteredPlugins],
  )
  const disabledPlugins = useMemo(
    () => filteredPlugins.filter((plugin) => !plugin.enabled),
    [filteredPlugins],
  )

  const pendingUninstallRefs = useMemo(() => {
    if (!pendingUninstall) return []
    const librarySkills = skillsByLibrary.get(pendingUninstall.id) || []
    return findWorkflowRefsBySkills(currentWorkflow, librarySkills)
  }, [currentWorkflow, pendingUninstall, skillsByLibrary])

  const pendingDisablePluginRefs = useMemo(() => {
    if (!pendingDisablePlugin) return []
    const pluginSkills = skillsByPlugin.get(pendingDisablePlugin.id) || []
    return findWorkflowRefsBySkills(currentWorkflow, pluginSkills)
  }, [currentWorkflow, pendingDisablePlugin, skillsByPlugin])

  const pendingRemoveMarketplaceRefs = useMemo(() => {
    if (!pendingRemoveMarketplace) return []
    const marketplacePlugins = pluginsByMarketplaceId.get(pendingRemoveMarketplace.id) || []
    const marketplaceSkills = marketplacePlugins.flatMap((plugin) => skillsByPlugin.get(plugin.id) || [])
    return findWorkflowRefsBySkills(currentWorkflow, marketplaceSkills)
  }, [currentWorkflow, pendingRemoveMarketplace, pluginsByMarketplaceId, skillsByPlugin])

  return {
    skillsCountByLibrary,
    skillsByLibrary,
    skillsCountByPlugin,
    skillsByPlugin,
    pluginMcpByPlugin,
    libraryById,
    pluginsByMarketplaceId,
    filteredMarketplaces,
    filteredPlugins,
    filteredSkills,
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
  }
}
