import { useCallback, useEffect, useRef, useState } from "react"
import { errorToUserMessage } from "@/lib/error-message"
import type {
  ArtifactRecord,
  CaseStateRecord,
  HumanTaskSummary,
  ProjectFactoryBlueprint,
  ProjectFactoryState,
  WorkflowTemplate,
} from "@shared/types"

export function useFactoryResources(selectedProject: string | null) {
  const [humanTasks, setHumanTasks] = useState<HumanTaskSummary[]>([])
  const [humanTasksLoading, setHumanTasksLoading] = useState(false)
  const [humanTasksError, setHumanTasksError] = useState<string | null>(null)
  const [factoryBlueprint, setFactoryBlueprint] =
    useState<ProjectFactoryBlueprint | null>(null)
  const [factoryBlueprintLoading, setFactoryBlueprintLoading] = useState(false)
  const [factoryBlueprintError, setFactoryBlueprintError] = useState<
    string | null
  >(null)
  const [factoryState, setFactoryState] = useState<ProjectFactoryState | null>(
    null,
  )
  const [factoryStateLoading, setFactoryStateLoading] = useState(false)
  const [factoryStateError, setFactoryStateError] = useState<string | null>(
    null,
  )
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [caseStates, setCaseStates] = useState<CaseStateRecord[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)

  const humanTasksRequestIdRef = useRef(0)
  const artifactsRequestIdRef = useRef(0)
  const blueprintRequestIdRef = useRef(0)
  const factoryStateRequestIdRef = useRef(0)

  const refreshHumanTasks = useCallback(async () => {
    const requestId = humanTasksRequestIdRef.current + 1
    humanTasksRequestIdRef.current = requestId
    if (!selectedProject) {
      setHumanTasks([])
      setHumanTasksLoading(false)
      setHumanTasksError(null)
      return
    }

    setHumanTasksLoading(true)
    setHumanTasksError(null)
    try {
      const nextTasks = await window.api.listHumanTasks(selectedProject)
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasks(nextTasks)
    } catch (error) {
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasks([])
      setHumanTasksError(errorToUserMessage(error))
    } finally {
      if (humanTasksRequestIdRef.current !== requestId) return
      setHumanTasksLoading(false)
    }
  }, [selectedProject])

  const refreshArtifacts = useCallback(async () => {
    const requestId = artifactsRequestIdRef.current + 1
    artifactsRequestIdRef.current = requestId
    if (!selectedProject) {
      setArtifacts([])
      setCaseStates([])
      setArtifactsLoading(false)
      setArtifactsError(null)
      return
    }

    setArtifactsLoading(true)
    setArtifactsError(null)
    try {
      const [nextArtifacts, nextCaseStates] = await Promise.all([
        window.api.listProjectArtifacts(selectedProject),
        window.api
          .listProjectCaseStates(selectedProject)
          .catch(() => [] as CaseStateRecord[]),
      ])
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts(nextArtifacts)
      setCaseStates(nextCaseStates)
    } catch (error) {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifacts([])
      setCaseStates([])
      setArtifactsError(errorToUserMessage(error))
    } finally {
      if (artifactsRequestIdRef.current !== requestId) return
      setArtifactsLoading(false)
    }
  }, [selectedProject])

  const refreshFactoryBlueprint = useCallback(async () => {
    const requestId = blueprintRequestIdRef.current + 1
    blueprintRequestIdRef.current = requestId
    if (!selectedProject) {
      setFactoryBlueprint(null)
      setFactoryBlueprintLoading(false)
      setFactoryBlueprintError(null)
      return
    }

    setFactoryBlueprintLoading(true)
    setFactoryBlueprintError(null)
    try {
      const nextBlueprint =
        await window.api.loadProjectFactoryBlueprint(selectedProject)
      if (blueprintRequestIdRef.current !== requestId) return
      setFactoryBlueprint(nextBlueprint)
    } catch (error) {
      if (blueprintRequestIdRef.current !== requestId) return
      setFactoryBlueprint(null)
      setFactoryBlueprintError(errorToUserMessage(error))
    } finally {
      if (blueprintRequestIdRef.current !== requestId) return
      setFactoryBlueprintLoading(false)
    }
  }, [selectedProject])

  const refreshFactoryState = useCallback(async () => {
    const requestId = factoryStateRequestIdRef.current + 1
    factoryStateRequestIdRef.current = requestId
    if (!selectedProject) {
      setFactoryState(null)
      setFactoryStateLoading(false)
      setFactoryStateError(null)
      return
    }

    setFactoryStateLoading(true)
    setFactoryStateError(null)
    try {
      const nextFactoryState =
        await window.api.loadProjectFactoryState(selectedProject)
      if (factoryStateRequestIdRef.current !== requestId) return
      setFactoryState(nextFactoryState)
    } catch (error) {
      if (factoryStateRequestIdRef.current !== requestId) return
      setFactoryState(null)
      setFactoryStateError(errorToUserMessage(error))
    } finally {
      if (factoryStateRequestIdRef.current !== requestId) return
      setFactoryStateLoading(false)
    }
  }, [selectedProject])

  const refreshFactoryData = useCallback(async () => {
    await Promise.all([
      refreshFactoryBlueprint(),
      refreshFactoryState(),
      refreshHumanTasks(),
      refreshArtifacts(),
    ])
  }, [
    refreshArtifacts,
    refreshFactoryBlueprint,
    refreshFactoryState,
    refreshHumanTasks,
  ])

  useEffect(() => {
    void refreshFactoryData()
  }, [refreshFactoryData])

  useEffect(() => {
    let cancelled = false
    setTemplatesLoading(true)
    setTemplatesError(null)

    void window.api
      .listTemplates()
      .then((nextTemplates) => {
        if (cancelled) return
        setTemplates(nextTemplates)
      })
      .catch((error) => {
        if (cancelled) return
        setTemplates([])
        setTemplatesError(errorToUserMessage(error))
      })
      .finally(() => {
        if (!cancelled) {
          setTemplatesLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return {
    artifacts,
    artifactsError,
    artifactsLoading,
    caseStates,
    factoryBlueprint,
    factoryBlueprintError,
    factoryBlueprintLoading,
    factoryState,
    factoryStateError,
    factoryStateLoading,
    humanTasks,
    humanTasksError,
    humanTasksLoading,
    refreshFactoryData,
    refreshFactoryState,
    setFactoryBlueprint,
    setFactoryBlueprintError,
    setFactoryState,
    setFactoryStateError,
    templates,
    templatesError,
    templatesLoading,
  }
}
