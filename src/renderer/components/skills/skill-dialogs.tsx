import type { InstalledPlugin, MarketplaceSource } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { SkillLibrary } from "@/lib/store"
import {
  formatPluginAssetCount,
  pluginBadgeVariant,
} from "@/components/skills/skills-page-helpers"

function DependencyWarningDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  refs,
  acknowledgeId,
  acknowledgeBrokenRefs,
  onAcknowledgeBrokenRefsChange,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  warning: string
  refs: string[]
  acknowledgeId: string
  acknowledgeBrokenRefs: boolean
  onAcknowledgeBrokenRefsChange: (nextChecked: boolean) => void
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {refs.length > 0 && (
          <div className="ui-alert-warning space-y-2">
            <p className="text-body-sm text-status-warning">{warning}</p>
            <div className="flex flex-wrap gap-1">
              {refs.slice(0, 6).map((skillRef) => (
                <Badge key={skillRef} variant="outline" className="font-mono">
                  {skillRef}
                </Badge>
              ))}
              {refs.length > 6 && (
                <Badge variant="outline">+{refs.length - 6} more</Badge>
              )}
            </div>
            <Label
              htmlFor={acknowledgeId}
              className="text-body-sm flex items-center gap-2 cursor-pointer"
            >
              <Switch
                id={acknowledgeId}
                checked={acknowledgeBrokenRefs}
                onCheckedChange={onAcknowledgeBrokenRefsChange}
              />
              I understand this may break skill steps in the current flow.
            </Label>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={refs.length > 0 && !acknowledgeBrokenRefs}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SkillsPageDialogs({
  pendingUninstall,
  pendingUninstallRefs,
  onPendingUninstallChange,
  onCommitUninstall,
  pendingDisablePlugin,
  pendingDisablePluginRefs,
  onPendingDisablePluginChange,
  onCommitDisablePlugin,
  pendingRemoveMarketplace,
  pendingRemoveMarketplaceRefs,
  onPendingRemoveMarketplaceChange,
  onCommitRemoveMarketplace,
  acknowledgeBrokenRefs,
  onAcknowledgeBrokenRefsChange,
  previewLibrary,
  previewItems,
  previewHints,
  onPreviewLibraryChange,
  previewPlugin,
  previewPluginSkills,
  previewPluginMcpServers,
  onPreviewPluginChange,
  onOpenMcpSettings,
}: {
  pendingUninstall: SkillLibrary | null
  pendingUninstallRefs: string[]
  onPendingUninstallChange: (library: SkillLibrary | null) => void
  onCommitUninstall: () => void
  pendingDisablePlugin: InstalledPlugin | null
  pendingDisablePluginRefs: string[]
  onPendingDisablePluginChange: (plugin: InstalledPlugin | null) => void
  onCommitDisablePlugin: () => void
  pendingRemoveMarketplace: MarketplaceSource | null
  pendingRemoveMarketplaceRefs: string[]
  onPendingRemoveMarketplaceChange: (
    marketplace: MarketplaceSource | null,
  ) => void
  onCommitRemoveMarketplace: () => void
  acknowledgeBrokenRefs: boolean
  onAcknowledgeBrokenRefsChange: (nextChecked: boolean) => void
  previewLibrary: SkillLibrary | null
  previewItems: string[]
  previewHints: string[]
  onPreviewLibraryChange: (library: SkillLibrary | null) => void
  previewPlugin: InstalledPlugin | null
  previewPluginSkills: string[]
  previewPluginMcpServers: string[]
  onPreviewPluginChange: (plugin: InstalledPlugin | null) => void
  onOpenMcpSettings: () => void
}) {
  return (
    <>
      <DependencyWarningDialog
        open={pendingUninstall !== null}
        onOpenChange={(open) => !open && onPendingUninstallChange(null)}
        title="Uninstall library?"
        description={`Remove "${pendingUninstall?.name || "library"}" and its installed skills from this app profile?`}
        warning="Dependency warning: current flow references skills from this library."
        refs={pendingUninstallRefs}
        acknowledgeId="acknowledge-broken-refs"
        acknowledgeBrokenRefs={acknowledgeBrokenRefs}
        onAcknowledgeBrokenRefsChange={onAcknowledgeBrokenRefsChange}
        confirmLabel="Uninstall"
        onConfirm={onCommitUninstall}
      />

      <DependencyWarningDialog
        open={pendingDisablePlugin !== null}
        onOpenChange={(open) => !open && onPendingDisablePluginChange(null)}
        title="Disable plugin?"
        description={`Disable "${pendingDisablePlugin?.name || "plugin"}" and hide its packaged skills, library flows, and MCP packs from the active profile?`}
        warning="Dependency warning: current flow references skills from this plugin."
        refs={pendingDisablePluginRefs}
        acknowledgeId="acknowledge-disable-plugin-refs"
        acknowledgeBrokenRefs={acknowledgeBrokenRefs}
        onAcknowledgeBrokenRefsChange={onAcknowledgeBrokenRefsChange}
        confirmLabel="Disable"
        onConfirm={onCommitDisablePlugin}
      />

      <DependencyWarningDialog
        open={pendingRemoveMarketplace !== null}
        onOpenChange={(open) => !open && onPendingRemoveMarketplaceChange(null)}
        title="Remove marketplace?"
        description={`Remove "${pendingRemoveMarketplace?.name || "marketplace"}" and all plugin packs installed from it?`}
        warning="Dependency warning: current flow references skills from plugins in this marketplace."
        refs={pendingRemoveMarketplaceRefs}
        acknowledgeId="acknowledge-remove-marketplace-refs"
        acknowledgeBrokenRefs={acknowledgeBrokenRefs}
        onAcknowledgeBrokenRefsChange={onAcknowledgeBrokenRefsChange}
        confirmLabel="Remove"
        onConfirm={onCommitRemoveMarketplace}
      />

      <Dialog
        open={previewLibrary !== null}
        onOpenChange={(open) => !open && onPreviewLibraryChange(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {previewLibrary?.name || "Library"} preview
            </DialogTitle>
            <DialogDescription>
              {previewLibrary?.installed
                ? "Detected skills from this installed library."
                : "Typical skills available after installation."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {previewLibrary?.installed && previewItems.length > 0 ? (
              <div className="surface-inset-card max-h-56 space-y-1 overflow-y-auto p-2 ui-scroll-region">
                {previewItems.slice(0, 20).map((item) => (
                  <div
                    key={item}
                    className="ui-meta-text font-mono text-foreground-subtle"
                  >
                    {item}
                  </div>
                ))}
                {previewItems.length > 20 && (
                  <div className="ui-meta-text text-muted-foreground">
                    +{previewItems.length - 20} more
                  </div>
                )}
              </div>
            ) : previewHints.length > 0 ? (
              <div className="surface-inset-card space-y-1 p-2">
                {previewHints.map((item) => (
                  <div
                    key={item}
                    className="text-body-sm text-foreground-subtle"
                  >
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Install this library to scan exact skills for your project.
              </p>
            )}

            {previewLibrary && (
              <p className="ui-meta-text text-muted-foreground">
                Source: {previewLibrary.repo}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onPreviewLibraryChange(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewPlugin !== null}
        onOpenChange={(open) => !open && onPreviewPluginChange(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{previewPlugin?.name || "Plugin"} preview</DialogTitle>
            <DialogDescription>
              Packaged skills, library flows, and MCP packs discovered from this
              installed plugin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {previewPlugin && (
              <div className="flex flex-wrap gap-1">
                <Badge variant={pluginBadgeVariant(previewPlugin)} size="pill">
                  {previewPlugin.enabled ? "enabled" : "disabled"}
                </Badge>
                {previewPlugin.capabilities.map((capability) => (
                  <Badge key={capability} variant="outline" size="compact">
                    {formatPluginAssetCount(previewPlugin, capability)}
                  </Badge>
                ))}
              </div>
            )}

            {previewPluginSkills.length > 0 && (
              <div className="space-y-1">
                <p className="text-body-md font-medium text-foreground">
                  Skills
                </p>
                <div className="surface-inset-card max-h-56 space-y-1 overflow-y-auto p-2 ui-scroll-region">
                  {previewPluginSkills.slice(0, 20).map((item) => (
                    <div
                      key={item}
                      className="ui-meta-text font-mono text-foreground-subtle"
                    >
                      {item}
                    </div>
                  ))}
                  {previewPluginSkills.length > 20 && (
                    <div className="ui-meta-text text-muted-foreground">
                      +{previewPluginSkills.length - 20} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {previewPluginMcpServers.length > 0 && (
              <div className="space-y-1">
                <p className="text-body-md font-medium text-foreground">
                  MCP packs
                </p>
                <div className="surface-inset-card space-y-1 p-2">
                  {previewPluginMcpServers.map((serverName) => (
                    <div
                      key={serverName}
                      className="ui-meta-text font-mono text-foreground-subtle"
                    >
                      {serverName}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewPlugin && (
              <p className="ui-meta-text text-muted-foreground">
                Source: {previewPlugin.marketplaceName}
                {previewPlugin.version ? ` · v${previewPlugin.version}` : ""}
              </p>
            )}
          </div>

          <DialogFooter>
            {previewPlugin?.capabilities.includes("mcp") ? (
              <Button variant="outline" onClick={onOpenMcpSettings}>
                Open MCP Settings
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => onPreviewPluginChange(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
