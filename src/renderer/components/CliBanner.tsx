import { useAtom } from "jotai"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import {
  defaultProviderAtom,
  mainViewAtom,
  providerAuthStatusAtom,
  providerAvailabilityAtom,
  providerSetupBannerDismissedKeyAtom,
} from "@/lib/store"
import { resolveProviderBannerState } from "@/lib/provider-readiness"

export function CliBanner() {
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const [providerAvailability] = useAtom(providerAvailabilityAtom)
  const [providerAuthStatus] = useAtom(providerAuthStatusAtom)
  const [dismissedKey, setDismissedKey] = useAtom(
    providerSetupBannerDismissedKeyAtom,
  )
  const [, setMainView] = useAtom(mainViewAtom)
  const banner = resolveProviderBannerState(
    defaultProvider,
    providerAvailability[defaultProvider],
    providerAuthStatus[defaultProvider],
  )

  if (!banner || dismissedKey === banner.dismissKey) return null

  const toneClass =
    banner.tone === "danger" ? "text-status-danger" : "text-status-warning"
  const bannerClass =
    banner.tone === "danger" ? "ui-alert-danger" : "ui-alert-warning"

  return (
    <div className={cn("mx-3 mt-3 flex items-center gap-2", bannerClass)}>
      <AlertTriangle size={14} className={cn("shrink-0", toneClass)} />
      <span className={cn("flex-1 text-body-sm", toneClass)}>
        {banner.message}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={toneClass}
        onClick={() => setMainView("settings")}
      >
        Open Settings
      </Button>
      <button
        type="button"
        className={cn("ui-icon-button shrink-0", toneClass)}
        onClick={() => setDismissedKey(banner.dismissKey)}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
