import { useEffect, useRef, useState } from "react"

import type { ProjectInspectionSummary, WorkflowTemplate } from "@shared/types"

import { toastErrorFromCatch } from "@/lib/toast-error"

export function useWorkflowCreateResources({
  targetProjectPath,
  popularTemplateLimit,
}: {
  targetProjectPath: string | null
  popularTemplateLimit: number
}) {
  const [projectInspection, setProjectInspection] =
    useState<ProjectInspectionSummary | null>(null)
  const [popularTemplates, setPopularTemplates] = useState<WorkflowTemplate[]>(
    [],
  )
  const [availableTemplates, setAvailableTemplates] = useState<
    WorkflowTemplate[]
  >([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const templateLoadRequestIdRef = useRef(0)
  const projectInspectionRequestIdRef = useRef(0)

  useEffect(() => {
    const requestId = templateLoadRequestIdRef.current + 1
    templateLoadRequestIdRef.current = requestId
    setLoadingTemplates(true)

    void (async () => {
      try {
        const templates = await window.api.listTemplates(
          targetProjectPath ?? undefined,
        )
        let popular: WorkflowTemplate[] = []

        if (targetProjectPath) {
          try {
            popular = await window.api.listPopularProjectTemplates(
              targetProjectPath,
              popularTemplateLimit,
            )
          } catch (error) {
            if (templateLoadRequestIdRef.current !== requestId) return
            if (!String(error).includes("No handler registered")) {
              toastErrorFromCatch(
                "Could not load popular starting points",
                error,
              )
            }
          }
        }

        if (templateLoadRequestIdRef.current !== requestId) return
        setAvailableTemplates(templates)
        const seen = new Set(popular.map((template) => template.id))
        const supplemented = templates.filter(
          (template) => !seen.has(template.id),
        )
        setPopularTemplates(
          [...popular, ...supplemented].slice(0, popularTemplateLimit),
        )
      } catch (error) {
        if (templateLoadRequestIdRef.current !== requestId) return
        setAvailableTemplates([])
        setPopularTemplates([])
        toastErrorFromCatch("Could not load starting points", error)
      } finally {
        if (templateLoadRequestIdRef.current === requestId) {
          setLoadingTemplates(false)
        }
      }
    })()

    return () => {
      if (templateLoadRequestIdRef.current === requestId) {
        templateLoadRequestIdRef.current += 1
      }
    }
  }, [popularTemplateLimit, targetProjectPath])

  useEffect(() => {
    if (!targetProjectPath) {
      projectInspectionRequestIdRef.current += 1
      setProjectInspection(null)
      return
    }

    const inspectCreateEntryProject = (
      window.api as typeof window.api & {
        inspectCreateEntryProject?: typeof window.api.inspectCreateEntryProject
      }
    ).inspectCreateEntryProject

    if (!inspectCreateEntryProject) {
      projectInspectionRequestIdRef.current += 1
      setProjectInspection(null)
      return
    }

    const requestId = projectInspectionRequestIdRef.current + 1
    projectInspectionRequestIdRef.current = requestId

    void inspectCreateEntryProject(targetProjectPath)
      .then((inspection) => {
        if (projectInspectionRequestIdRef.current !== requestId) return
        setProjectInspection(inspection)
      })
      .catch((error) => {
        if (projectInspectionRequestIdRef.current !== requestId) return
        console.error(
          "[workflow-create] Could not inspect create-entry project",
          error,
        )
        setProjectInspection(null)
      })

    return () => {
      if (projectInspectionRequestIdRef.current === requestId) {
        projectInspectionRequestIdRef.current += 1
      }
    }
  }, [targetProjectPath])

  return {
    projectInspection,
    popularTemplates,
    availableTemplates,
    loadingTemplates,
  }
}
