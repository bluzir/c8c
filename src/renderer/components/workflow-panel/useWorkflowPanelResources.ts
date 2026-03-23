import { useEffect, useState } from "react"
import { errorToUserMessage } from "@/lib/error-message"
import { toastErrorFromCatch } from "@/lib/toast-error"
import type {
  ArtifactRecord,
  CaseStateRecord,
  ProjectFactoryBlueprint,
  WorkflowTemplate,
} from "@shared/types"
import type { WorkflowTemplateRunContext } from "@/lib/workflow-entry"

interface UseWorkflowPanelResourcesParams {
  selectedProject: string | null
  selectedWorkflowTemplateContext: WorkflowTemplateRunContext | null
  artifactRecords: ArtifactRecord[]
}

export function useWorkflowPanelResources({
  selectedProject,
  selectedWorkflowTemplateContext,
  artifactRecords,
}: UseWorkflowPanelResourcesParams) {
  const [projectArtifacts, setProjectArtifacts] = useState<ArtifactRecord[]>([])
  const [projectCaseStates, setProjectCaseStates] = useState<CaseStateRecord[]>(
    [],
  )
  const [projectArtifactsLoading, setProjectArtifactsLoading] = useState(false)
  const [projectArtifactsError, setProjectArtifactsError] = useState<
    string | null
  >(null)
  const [factoryBlueprint, setFactoryBlueprint] =
    useState<ProjectFactoryBlueprint | null>(null)
  const [packTemplates, setPackTemplates] = useState<WorkflowTemplate[]>([])

  useEffect(() => {
    if (!selectedProject) {
      setProjectArtifacts([])
      setProjectCaseStates([])
      setProjectArtifactsLoading(false)
      setProjectArtifactsError(null)
      setFactoryBlueprint(null)
      return
    }

    let cancelled = false
    setProjectArtifactsLoading(true)
    setProjectArtifactsError(null)

    void Promise.all([
      window.api.listProjectArtifacts(selectedProject),
      window.api
        .listProjectCaseStates(selectedProject)
        .catch(() => [] as CaseStateRecord[]),
    ])
      .then(([artifacts, caseStates]) => {
        if (cancelled) return
        setProjectArtifacts(artifacts)
        setProjectCaseStates(caseStates)
      })
      .catch((error) => {
        if (cancelled) return
        setProjectArtifacts([])
        setProjectCaseStates([])
        setProjectArtifactsError(errorToUserMessage(error))
      })
      .finally(() => {
        if (!cancelled) {
          setProjectArtifactsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedProject, artifactRecords])

  useEffect(() => {
    if (!selectedProject) {
      setFactoryBlueprint(null)
      return
    }

    let cancelled = false
    void window.api
      .loadProjectFactoryBlueprint(selectedProject)
      .then((blueprint) => {
        if (cancelled) return
        setFactoryBlueprint(blueprint)
      })
      .catch(() => {
        if (!cancelled) {
          setFactoryBlueprint(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedProject])

  useEffect(() => {
    if (!selectedWorkflowTemplateContext?.pack?.id) {
      setPackTemplates([])
      return
    }

    let cancelled = false
    void window.api
      .listTemplates()
      .then((templates) => {
        if (cancelled) return
        setPackTemplates(templates)
      })
      .catch((error) => {
        if (cancelled) return
        console.error("[WorkflowPanel] failed to load pack templates:", error)
        setPackTemplates([])
        toastErrorFromCatch("Could not load starting points", error)
      })

    return () => {
      cancelled = true
    }
  }, [selectedWorkflowTemplateContext])

  return {
    projectArtifacts,
    projectCaseStates,
    projectArtifactsLoading,
    projectArtifactsError,
    factoryBlueprint,
    packTemplates,
  }
}
