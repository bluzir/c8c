import { Eye, Library, Loader2, Package, RefreshCw, Store } from "lucide-react"
import type {
  InstalledPlugin,
  MarketplaceSource,
} from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/cn"
import type { SkillLibrary } from "@/lib/store"
import {
  formatPluginAssetCount,
  marketplaceBadgeVariant,
  pluginBadgeVariant,
} from "@/components/skills/skills-page-helpers"

export function MarketplaceCard({
  marketplace,
  pluginCount,
  busy,
  actionLabel,
  onInstall,
  onUpdate,
  onRemove,
}: {
  marketplace: MarketplaceSource
  pluginCount: number
  busy: boolean
  actionLabel: string | null
  onInstall: () => void
  onUpdate: () => void
  onRemove: () => void
}) {
  return (
    <article className="ui-interactive-card rounded-lg surface-panel px-4 py-3 flex items-center gap-3">
      <div className="h-control-lg w-control-lg rounded-lg bg-surface-2 flex items-center justify-center">
        <Store size={18} className="text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-body-md font-semibold truncate">{marketplace.name}</h3>
          <Badge variant={marketplaceBadgeVariant(marketplace)} size="pill">
            {marketplace.installed ? "installed" : "available"}
          </Badge>
          {pluginCount > 0 && (
            <Badge variant="outline" size="compact">{pluginCount} plugin{pluginCount === 1 ? "" : "s"}</Badge>
          )}
          {actionLabel && (
            <Badge variant="secondary" size="compact">{actionLabel}</Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground line-clamp-2">{marketplace.description}</p>
        <p className="ui-meta-text text-muted-foreground mt-0.5">
          {marketplace.owner ? `${marketplace.owner} · ` : ""}{marketplace.repo}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {marketplace.installed ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onUpdate}
              disabled={busy}
              aria-label={`Update ${marketplace.name}`}
            >
              {busy && actionLabel === "Updating" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRemove}
              disabled={busy}
            >
              Remove
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onInstall}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Install
          </Button>
        )}
      </div>
    </article>
  )
}

export function PluginCard({
  plugin,
  skillsCount,
  mcpCount,
  busy,
  actionLabel,
  onToggle,
  onPreview,
}: {
  plugin: InstalledPlugin
  skillsCount: number
  mcpCount: number
  busy: boolean
  actionLabel: string | null
  onToggle: (nextChecked: boolean) => void
  onPreview: () => void
}) {
  return (
    <article className="ui-interactive-card rounded-lg surface-panel px-4 py-3 flex items-center gap-3">
      <div className="h-control-lg w-control-lg rounded-lg bg-surface-2 flex items-center justify-center">
        <Package size={18} className="text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-body-md font-semibold truncate">{plugin.name}</h3>
          <Badge variant={pluginBadgeVariant(plugin)} size="pill">
            {plugin.enabled ? "enabled" : "disabled"}
          </Badge>
          {actionLabel && (
            <Badge variant="secondary" size="compact">{actionLabel}</Badge>
          )}
          {plugin.capabilities.map((capability) => (
            <Badge key={capability} variant="outline" size="compact">
              {formatPluginAssetCount(plugin, capability)}
            </Badge>
          ))}
        </div>
        <p className="text-body-sm text-muted-foreground line-clamp-2">
          {plugin.description || "Plugin bundle for executable pipeline assets."}
        </p>
        <p className="ui-meta-text text-muted-foreground mt-0.5">
          {plugin.marketplaceName}
          {plugin.version ? ` · v${plugin.version}` : ""}
          {skillsCount > 0 ? ` · ${skillsCount} discovered skill${skillsCount === 1 ? "" : "s"}` : ""}
          {mcpCount > 0 ? ` · ${mcpCount} MCP pack${mcpCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreview}
          disabled={busy}
          aria-label={`Preview ${plugin.name}`}
        >
          <Eye size={14} />
        </Button>
        <Switch
          checked={plugin.enabled}
          onCheckedChange={onToggle}
          disabled={busy}
          aria-label={plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
        />
      </div>
    </article>
  )
}

export function SkillLibraryCard({
  library,
  installedSkillsCount,
  busy,
  actionLabel,
  onToggle,
  onUpdate,
  onPreview,
}: {
  library: SkillLibrary
  installedSkillsCount: number
  busy: boolean
  actionLabel: string | null
  onToggle: (nextChecked: boolean) => void
  onUpdate: () => void
  onPreview: () => void
}) {
  return (
    <article
      className={cn(
        "ui-interactive-card rounded-lg surface-panel px-4 py-3",
        "flex items-center gap-3",
      )}
    >
      <div className="h-control-lg w-control-lg rounded-lg bg-surface-2 flex items-center justify-center">
        <Library size={18} className="text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-body-md font-semibold truncate">{library.name}</h3>
          {library.installed && (
            <Badge variant="outline">
              {installedSkillsCount} skills
            </Badge>
          )}
          {actionLabel && (
            <Badge variant="secondary">{actionLabel}</Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground truncate">
          {library.description}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreview}
          disabled={busy}
          aria-label={`Preview ${library.name}`}
        >
          <Eye size={14} />
        </Button>
        {library.installed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onUpdate}
            disabled={busy}
            aria-label={`Update ${library.name}`}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
        )}
        <Switch
          checked={library.installed}
          onCheckedChange={onToggle}
          disabled={busy}
          aria-label={library.installed ? `Uninstall ${library.name}` : `Install ${library.name}`}
        />
      </div>
    </article>
  )
}
