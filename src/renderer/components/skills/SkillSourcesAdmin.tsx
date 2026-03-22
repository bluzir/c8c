import type {
  InstalledPlugin,
  MarketplaceSource,
  PluginMcpServerInfo,
} from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { SectionHeading } from "@/components/ui/page-shell"
import { Skeleton } from "@/components/ui/skeleton"
import type { SkillLibrary } from "@/lib/store"
import {
  SkillLibraryCard,
  MarketplaceCard,
  PluginCard,
} from "@/components/skills/SkillSourceCards"
import {
  LIBRARY_ACTION_LABEL,
  type LibraryAction,
  MARKETPLACE_ACTION_LABEL,
  type MarketplaceAction,
  PLUGIN_ACTION_LABEL,
  type PluginAction,
} from "@/components/skills/skills-page-helpers"

interface SkillsActionState<TAction extends string> {
  id: string
  action: TAction
}

interface SkillSourcesAdminProps {
  libraries: SkillLibrary[]
  totalMarketplaceCount: number
  installedLibraries: SkillLibrary[]
  favoriteLibraries: SkillLibrary[]
  availableLibraries: SkillLibrary[]
  filteredMarketplaces: MarketplaceSource[]
  installedMarketplaces: MarketplaceSource[]
  availableMarketplaces: MarketplaceSource[]
  enabledPlugins: InstalledPlugin[]
  disabledPlugins: InstalledPlugin[]
  skillsCountByLibrary: Map<string, number>
  skillsCountByPlugin: Map<string, number>
  pluginMcpByPlugin: Map<string, PluginMcpServerInfo[]>
  pluginsByMarketplaceId: Map<string, InstalledPlugin[]>
  libraryAction: SkillsActionState<LibraryAction> | null
  marketplaceAction: SkillsActionState<MarketplaceAction> | null
  pluginAction: SkillsActionState<PluginAction> | null
  refreshing: boolean
  loading: boolean
  hasQuery: boolean
  onSetLibraryInstalled: (library: SkillLibrary, nextChecked: boolean) => void
  onUpdateLibrary: (library: SkillLibrary) => void
  onPreviewLibrary: (library: SkillLibrary) => void
  onInstallMarketplace: (marketplace: MarketplaceSource) => void
  onUpdateMarketplace: (marketplace: MarketplaceSource) => void
  onRequestRemoveMarketplace: (marketplace: MarketplaceSource) => void
  onSetPluginEnabled: (plugin: InstalledPlugin, nextChecked: boolean) => void
  onPreviewPlugin: (plugin: InstalledPlugin) => void
}

export function SkillSourcesAdmin({
  libraries,
  totalMarketplaceCount,
  installedLibraries,
  favoriteLibraries,
  availableLibraries,
  filteredMarketplaces,
  installedMarketplaces,
  availableMarketplaces,
  enabledPlugins,
  disabledPlugins,
  skillsCountByLibrary,
  skillsCountByPlugin,
  pluginMcpByPlugin,
  pluginsByMarketplaceId,
  libraryAction,
  marketplaceAction,
  pluginAction,
  refreshing,
  loading,
  hasQuery,
  onSetLibraryInstalled,
  onUpdateLibrary,
  onPreviewLibrary,
  onInstallMarketplace,
  onUpdateMarketplace,
  onRequestRemoveMarketplace,
  onSetPluginEnabled,
  onPreviewPlugin,
}: SkillSourcesAdminProps) {
  const renderCardSkeletons = (keyPrefix: string) => (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`${keyPrefix}-${index}`} className="rounded-lg surface-panel px-4 py-3">
          <div className="flex items-start gap-3">
            <Skeleton className="h-control-lg w-control-lg rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6" aria-busy={loading}>
      <section className="space-y-3">
        <SectionHeading title="Marketplaces" meta={<Badge variant="outline">{loading ? "Loading" : `${installedMarketplaces.length}/${totalMarketplaceCount}`}</Badge>} />

        {loading ? renderCardSkeletons("marketplace-skeleton") : filteredMarketplaces.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline bg-surface-2/25 ui-empty-state px-4 text-body-sm text-muted-foreground">
            No marketplaces match this filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {installedMarketplaces.map((marketplace) => {
              const busy = refreshing || marketplaceAction?.id === marketplace.id
              const actionLabel = marketplaceAction?.id === marketplace.id
                ? MARKETPLACE_ACTION_LABEL[marketplaceAction.action]
                : null
              return (
                <MarketplaceCard
                  key={marketplace.id}
                  marketplace={marketplace}
                  pluginCount={(pluginsByMarketplaceId.get(marketplace.id) || []).length}
                  busy={busy}
                  actionLabel={actionLabel}
                  onInstall={() => undefined}
                  onUpdate={() => onUpdateMarketplace(marketplace)}
                  onRemove={() => onRequestRemoveMarketplace(marketplace)}
                />
              )
            })}
            {availableMarketplaces.map((marketplace) => {
              const busy = refreshing || marketplaceAction?.id === marketplace.id
              const actionLabel = marketplaceAction?.id === marketplace.id
                ? MARKETPLACE_ACTION_LABEL[marketplaceAction.action]
                : null
              return (
                <MarketplaceCard
                  key={marketplace.id}
                  marketplace={marketplace}
                  pluginCount={0}
                  busy={busy}
                  actionLabel={actionLabel}
                  onInstall={() => onInstallMarketplace(marketplace)}
                  onUpdate={() => undefined}
                  onRemove={() => undefined}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Enabled plugins" meta={<Badge variant="outline">{loading ? "Loading" : enabledPlugins.length}</Badge>} />

        {loading ? renderCardSkeletons("enabled-plugin-skeleton") : enabledPlugins.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline bg-surface-2/25 ui-empty-state px-4 text-body-sm text-muted-foreground">
            Install a marketplace and enable a plugin pack to bring in skills, library flows, or MCP integrations.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {enabledPlugins.map((plugin) => {
              const busy = refreshing || pluginAction?.id === plugin.id
              const actionLabel = pluginAction?.id === plugin.id
                ? PLUGIN_ACTION_LABEL[pluginAction.action]
                : null
              return (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  skillsCount={skillsCountByPlugin.get(plugin.id) ?? 0}
                  mcpCount={(pluginMcpByPlugin.get(plugin.id) || []).length}
                  busy={busy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => onSetPluginEnabled(plugin, nextChecked)}
                  onPreview={() => onPreviewPlugin(plugin)}
                />
              )
            })}
          </div>
        )}
      </section>

      {(disabledPlugins.length > 0 || hasQuery) && (
        <section className="space-y-3">
          <SectionHeading title="Installed but disabled" meta={<Badge variant="outline">{loading ? "Loading" : disabledPlugins.length}</Badge>} />

          {loading ? renderCardSkeletons("disabled-plugin-skeleton") : disabledPlugins.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/25 ui-empty-state px-4 text-body-sm text-muted-foreground">
              No disabled plugins match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {disabledPlugins.map((plugin) => {
                const busy = refreshing || pluginAction?.id === plugin.id
                const actionLabel = pluginAction?.id === plugin.id
                  ? PLUGIN_ACTION_LABEL[pluginAction.action]
                  : null
                return (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    skillsCount={skillsCountByPlugin.get(plugin.id) ?? 0}
                    mcpCount={(pluginMcpByPlugin.get(plugin.id) || []).length}
                    busy={busy}
                    actionLabel={actionLabel}
                    onToggle={(nextChecked) => onSetPluginEnabled(plugin, nextChecked)}
                    onPreview={() => onPreviewPlugin(plugin)}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading title="Installed libraries" meta={<Badge variant="outline">{loading ? "Loading" : `${installedLibraries.length}/${libraries.length}`}</Badge>} />

        {loading ? renderCardSkeletons("installed-library-skeleton") : installedLibraries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline bg-surface-2/25 ui-empty-state px-4 text-body-sm text-muted-foreground">
            No libraries installed. Use plugin marketplaces above for the primary packaging model.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {installedLibraries.map((library) => {
              const busy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={skillsCountByLibrary.get(library.id) ?? 0}
                  busy={busy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => onSetLibraryInstalled(library, nextChecked)}
                  onUpdate={() => onUpdateLibrary(library)}
                  onPreview={() => onPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Library favorites" meta={<Badge variant="outline">{loading ? "Loading" : favoriteLibraries.length}</Badge>} />

        {loading ? renderCardSkeletons("favorite-library-skeleton") : favoriteLibraries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline bg-surface-2/25 ui-empty-state px-4 text-body-sm text-muted-foreground">
            {hasQuery
              ? "No favorite libraries match this filter."
              : "Your favorite libraries are already installed."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {favoriteLibraries.map((library) => {
              const busy = refreshing || libraryAction?.id === library.id
              const actionLabel = libraryAction?.id === library.id
                ? LIBRARY_ACTION_LABEL[libraryAction.action]
                : null
              return (
                <SkillLibraryCard
                  key={library.id}
                  library={library}
                  installedSkillsCount={0}
                  busy={busy}
                  actionLabel={actionLabel}
                  onToggle={(nextChecked) => onSetLibraryInstalled(library, nextChecked)}
                  onUpdate={() => undefined}
                  onPreview={() => onPreviewLibrary(library)}
                />
              )
            })}
          </div>
        )}
      </section>

      {(availableLibraries.length > 0 || hasQuery) && (
        <section className="space-y-3">
          <SectionHeading title="More libraries" meta={<Badge variant="outline">{loading ? "Loading" : availableLibraries.length}</Badge>} />

          {loading ? renderCardSkeletons("available-library-skeleton") : availableLibraries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline bg-surface-2/25 ui-empty-state px-4 text-body-sm text-muted-foreground">
              No other libraries match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {availableLibraries.map((library) => {
                const busy = refreshing || libraryAction?.id === library.id
                const actionLabel = libraryAction?.id === library.id
                  ? LIBRARY_ACTION_LABEL[libraryAction.action]
                  : null
                return (
                  <SkillLibraryCard
                    key={library.id}
                    library={library}
                    installedSkillsCount={0}
                    busy={busy}
                    actionLabel={actionLabel}
                    onToggle={(nextChecked) => onSetLibraryInstalled(library, nextChecked)}
                    onUpdate={() => undefined}
                    onPreview={() => onPreviewLibrary(library)}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
