import { useEffect, useState } from "react"

import { toast } from "sonner"

import { toastErrorFromCatch } from "@/lib/toast-error"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { buildTemplateRunContext } from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type { WorkflowTemplate, WorkflowFile, Workflow } from "@shared/types"

export function useAppShellDeepLinkTemplate({
  deepLinkTemplate,
  setDeepLinkTemplate,
  selectedProject,
  projects,
  workflow,
  selectedWorkflowPath,
  selectedInboxTaskKey,
  selectedPastRun,
  selectedWorkflowTemplateContext,
  webSearchBackend,
  clearReviewState,
  setSelectedProject,
  setWorkflows,
  setWorkflow,
  setWorkflowSavedSnapshot,
  setSelectedWorkflowPath,
  setSelectedInboxTaskKey,
  setSelectedPastRun,
  setWorkflowTemplateContextForKey,
  setMainView,
}: {
  deepLinkTemplate: WorkflowTemplate | null
  setDeepLinkTemplate: (value: WorkflowTemplate | null) => void
  selectedProject: string | null
  projects: string[]
  workflow: Workflow
  selectedWorkflowPath: string | null
  selectedInboxTaskKey: string | null
  selectedPastRun: import("@shared/types").RunResult | null
  selectedWorkflowTemplateContext: ReturnType<typeof buildTemplateRunContext> | null
  webSearchBackend: import("@/lib/web-search-backend").WebSearchBackend
  clearReviewState: () => void
  setSelectedProject: (value: string | null) => void
  setWorkflows: (value: WorkflowFile[]) => void
  setWorkflow: (value: Workflow) => void
  setWorkflowSavedSnapshot: (value: ReturnType<typeof workflowSnapshot>) => void
  setSelectedWorkflowPath: (value: string | null) => void
  setSelectedInboxTaskKey: (value: string | null) => void
  setSelectedPastRun: (value: import("@shared/types").RunResult | null) => void
  setWorkflowTemplateContextForKey: (value: {
    key: string
    context: ReturnType<typeof buildTemplateRunContext> | null
  }) => void
  setMainView: (value: string) => void
}) {
  const [deepLinkTargetProject, setDeepLinkTargetProject] = useState<string | null>(selectedProject)

  useEffect(() => {
    const unsubTemplate = window.api.onDeepLinkTemplate((template) => {
      setDeepLinkTemplate(template)
    })
    const unsubError = window.api.onDeepLinkTemplateError((err) => {
      toastErrorFromCatch(`Could not load library flow "${err.templateId}"`, err.error)
    })
    return () => {
      unsubTemplate()
      unsubError()
    }
  }, [setDeepLinkTemplate])

  useEffect(() => {
    if (!deepLinkTemplate) return
    if (selectedProject && projects.includes(selectedProject)) {
      setDeepLinkTargetProject(selectedProject)
      return
    }
    setDeepLinkTargetProject(projects[0] ?? null)
  }, [deepLinkTemplate, projects, selectedProject])

  const applyDeepLinkTemplate = () => {
    if (!deepLinkTemplate) return
    const previousWorkflow = structuredClone(workflow)
    const previousWorkflowPath = selectedWorkflowPath
    const previousReviewState = {
      selectedInboxTaskKey,
      selectedPastRun,
    }
    const previousTemplateContext = selectedWorkflowTemplateContext
    const nextWorkflow = resolveTemplateWorkflow(deepLinkTemplate, webSearchBackend)
    setWorkflow(nextWorkflow)
    setSelectedWorkflowPath(null)
    clearReviewState()
    setWorkflowTemplateContextForKey({
      key: toWorkflowExecutionKey(null),
      context: buildTemplateRunContext({
        template: {
          ...deepLinkTemplate,
          workflow: nextWorkflow,
        },
        workflowPath: null,
      }),
    })
    setMainView("thread")
    setDeepLinkTemplate(null)
    toast.success(`Library flow "${deepLinkTemplate.name}" applied`, {
      action: {
        label: "Undo",
        onClick: () => {
          setWorkflow(previousWorkflow)
          setSelectedWorkflowPath(previousWorkflowPath)
          setSelectedInboxTaskKey(previousReviewState.selectedInboxTaskKey)
          setSelectedPastRun(previousReviewState.selectedPastRun)
          setWorkflowTemplateContextForKey({
            key: toWorkflowExecutionKey(null),
            context: previousWorkflowPath === null ? previousTemplateContext : null,
          })
          setWorkflowTemplateContextForKey({
            key: toWorkflowExecutionKey(previousWorkflowPath),
            context: previousTemplateContext,
          })
        },
      },
    })
  }

  const createDeepLinkTemplate = async () => {
    if (!deepLinkTemplate || !deepLinkTargetProject) return
    const nextWorkflow = resolveTemplateWorkflow(deepLinkTemplate, webSearchBackend)
    try {
      const filePath = await window.api.createWorkflow(deepLinkTargetProject, deepLinkTemplate.name, nextWorkflow)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const refreshed = await window.api.listProjectWorkflows(deepLinkTargetProject)
      setWorkflows(refreshed)
      setSelectedProject(deepLinkTargetProject)
      setSelectedWorkflowPath(filePath)
      setWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      clearReviewState()
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(filePath),
        context: buildTemplateRunContext({
          template: {
            ...deepLinkTemplate,
            workflow: loadedWorkflow,
          },
          workflowPath: filePath,
        }),
      })
      setMainView("thread")
      setDeepLinkTemplate(null)
      toast.success(`Created "${loadedWorkflow.name || deepLinkTemplate.name}" from library`)
    } catch (error) {
      toastErrorFromCatch("Could not create flow", error)
    }
  }

  return {
    deepLinkTargetProject,
    setDeepLinkTargetProject,
    applyDeepLinkTemplate,
    createDeepLinkTemplate,
  }
}
