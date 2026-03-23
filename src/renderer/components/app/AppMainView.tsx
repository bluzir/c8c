import { memo, useEffect, useRef } from "react"
import { useAtom, useAtomValue } from "jotai"
import {
  mainViewAtom,
  factoryBetaEnabledAtom,
  type MainView,
} from "@/lib/store"
import { WorkflowPanel } from "@/components/WorkflowPanel"
import { SkillsPage } from "@/components/SkillsPage"
import { WorkflowsTemplatesPage } from "@/components/WorkflowsTemplatesPage"
import { ArtifactsPage } from "@/components/ArtifactsPage"
import { FactoryPage } from "@/components/FactoryPage"
import { SettingsPage } from "@/components/SettingsPage"
import { NotificationsPage } from "@/components/NotificationsPage"
import { OnboardingWizard } from "@/components/OnboardingWizard"
import { WorkflowCreatePage } from "@/components/WorkflowCreatePage"

const MAIN_VIEW_LABELS: Record<MainView, string> = {
  thread: "Flow runner",
  factory: "Lab",
  workflow_create: "Create flow",
  skills: "Skills",
  templates: "Starting points",
  artifacts: "Results",
  settings: "Settings",
  inbox: "Inbox",
  onboarding: "Setup",
}

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

  let view = <WorkflowPanel />
  switch (mainView) {
    case "onboarding":
      view = <OnboardingWizard />
      break
    case "factory":
      view = factoryBetaEnabled ? <FactoryPage /> : <WorkflowPanel />
      break
    case "workflow_create":
      view = <WorkflowCreatePage />
      break
    case "skills":
      view = <SkillsPage />
      break
    case "templates":
      view = <WorkflowsTemplatesPage />
      break
    case "artifacts":
      view = <ArtifactsPage />
      break
    case "settings":
      view = <SettingsPage />
      break
    case "inbox":
      view = <NotificationsPage />
      break
    case "thread":
      view = <WorkflowPanel />
      break
  }

  return (
    <div
      key={mainView}
      ref={viewRef}
      tabIndex={-1}
      role="region"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden outline-none ui-fade-slide-in"
      aria-label={MAIN_VIEW_LABELS[mainView]}
    >
      {view}
    </div>
  )
})
