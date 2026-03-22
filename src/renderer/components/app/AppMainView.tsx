import { memo, useEffect, useRef } from "react"
import { useAtom, useAtomValue } from "jotai"
import { mainViewAtom, factoryBetaEnabledAtom } from "@/lib/store"
import { WorkflowPanel } from "@/components/WorkflowPanel"
import { SkillsPage } from "@/components/SkillsPage"
import { WorkflowsTemplatesPage } from "@/components/WorkflowsTemplatesPage"
import { ArtifactsPage } from "@/components/ArtifactsPage"
import { FactoryPage } from "@/components/FactoryPage"
import { SettingsPage } from "@/components/SettingsPage"
import { NotificationsPage } from "@/components/NotificationsPage"
import { OnboardingWizard } from "@/components/OnboardingWizard"
import { WorkflowCreatePage } from "@/components/WorkflowCreatePage"

export const AppMainView = memo(function AppMainView() {
  const [mainView] = useAtom(mainViewAtom)
  const factoryBetaEnabled = useAtomValue(factoryBetaEnabledAtom)
  const viewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      viewRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mainView])

  const view = mainView === "onboarding"
    ? <OnboardingWizard />
    : mainView === "factory"
      ? (factoryBetaEnabled ? <FactoryPage /> : <WorkflowPanel />)
      : mainView === "workflow_create"
        ? <WorkflowCreatePage />
        : mainView === "skills"
          ? <SkillsPage />
          : mainView === "templates"
            ? <WorkflowsTemplatesPage />
            : mainView === "artifacts"
              ? <ArtifactsPage />
              : mainView === "settings"
                ? <SettingsPage />
                : mainView === "inbox"
                  ? <NotificationsPage />
                  : <WorkflowPanel />

  return (
    <div
      key={mainView}
      ref={viewRef}
      tabIndex={-1}
      className="h-full min-h-0 outline-none ui-fade-slide-in"
      aria-label={`${mainView} view`}
    >
      {view}
    </div>
  )
})
