import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { selectTemplatesForResultChaining } from "@/lib/result-flow-chaining"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { selectArtifactsForTemplateContracts } from "@/lib/workflow-entry"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import type { ArtifactRecord, InputAttachment, WorkflowTemplate } from "@shared/types"

interface OpenWorkflowCreateOptions {
  projectPath?: string | null
  locked?: boolean
  prompt?: string
  sourceArtifacts?: ArtifactRecord[]
  initialAttachments?: InputAttachment[]
}

export function useWorkflowUseInNewFlow({
  selectedProject,
  canUseInNewFlow,
  artifactRecords,
  resultSourceAttachments,
  webSearchBackend,
  openWorkflowCreate,
  openPreparedTemplateStage,
}: {
  selectedProject: string | null
  canUseInNewFlow: boolean
  artifactRecords: ArtifactRecord[]
  resultSourceAttachments: InputAttachment[]
  webSearchBackend: WebSearchBackend
  openWorkflowCreate: (options?: OpenWorkflowCreateOptions) => void
  openPreparedTemplateStage: (
    launch: Awaited<ReturnType<typeof prepareTemplateStageLaunch>>,
    options: {
      autoRunIfAllowed: boolean
      successMessage: string
      approvalMessage?: string
    },
  ) => void
}) {
  const [useInNewFlowOpen, setUseInNewFlowOpen] = useState(false)
  const [useInNewFlowLoading, setUseInNewFlowLoading] = useState(false)
  const [useInNewFlowPending, setUseInNewFlowPending] = useState(false)
  const [useInNewFlowTemplates, setUseInNewFlowTemplates] = useState<WorkflowTemplate[]>([])
  const [selectedUseInNewFlowTemplateId, setSelectedUseInNewFlowTemplateId] = useState<string | null>(null)
  const [useInNewFlowIntent, setUseInNewFlowIntent] = useState("")
  const useInNewFlowTemplatesRequestIdRef = useRef(0)

  const suggestedUseInNewFlowTemplates = useMemo(
    () => selectTemplatesForResultChaining({
      templates: useInNewFlowTemplates,
      sourceArtifacts: artifactRecords,
    }),
    [artifactRecords, useInNewFlowTemplates],
  )

  const handleOpenUseInNewFlow = useCallback(() => {
    if (!selectedProject || !canUseInNewFlow) {
      toastError("Open a project and finish a result before starting a new flow from it.")
      return
    }
    if (artifactRecords.length === 0) {
      openWorkflowCreate({
        projectPath: selectedProject,
        sourceArtifacts: [],
        initialAttachments: resultSourceAttachments,
      })
      return
    }
    setUseInNewFlowIntent("")
    setSelectedUseInNewFlowTemplateId(null)
    setUseInNewFlowOpen(true)
  }, [artifactRecords.length, canUseInNewFlow, openWorkflowCreate, resultSourceAttachments, selectedProject])

  const handleConfirmUseInNewFlow = useCallback(async () => {
    if (!selectedProject || useInNewFlowPending) return

    const selectedTemplate = suggestedUseInNewFlowTemplates.find((template) => template.id === selectedUseInNewFlowTemplateId) || null
    if (!selectedTemplate && !useInNewFlowIntent.trim()) return

    setUseInNewFlowPending(true)
    try {
      if (selectedTemplate) {
        const launch = await prepareTemplateStageLaunch({
          projectPath: selectedProject,
          template: selectedTemplate,
          webSearchBackend,
          artifacts: selectArtifactsForTemplateContracts(selectedTemplate.contractIn, artifactRecords),
        })
        openPreparedTemplateStage(launch, {
          autoRunIfAllowed: false,
          successMessage: `Opened ${selectedTemplate.name} from this result`,
          approvalMessage: `Opened ${selectedTemplate.name} from this result and paused for approval`,
        })
      } else {
        openWorkflowCreate({
          projectPath: selectedProject,
          prompt: useInNewFlowIntent.trim(),
          sourceArtifacts: artifactRecords,
          initialAttachments: resultSourceAttachments,
        })
      }

      setUseInNewFlowOpen(false)
    } catch (error) {
      toastErrorFromCatch("Could not start the next flow", error)
    } finally {
      setUseInNewFlowPending(false)
    }
  }, [
    artifactRecords,
    openPreparedTemplateStage,
    openWorkflowCreate,
    resultSourceAttachments,
    selectedProject,
    selectedUseInNewFlowTemplateId,
    suggestedUseInNewFlowTemplates,
    useInNewFlowIntent,
    useInNewFlowPending,
    webSearchBackend,
  ])

  useEffect(() => {
    if (!useInNewFlowOpen) {
      useInNewFlowTemplatesRequestIdRef.current += 1
      return
    }

    const requestId = useInNewFlowTemplatesRequestIdRef.current + 1
    useInNewFlowTemplatesRequestIdRef.current = requestId
    setUseInNewFlowLoading(true)

    void window.api.listTemplates()
      .then((templates) => {
        if (useInNewFlowTemplatesRequestIdRef.current !== requestId) return
        setUseInNewFlowTemplates(templates)
      })
      .catch((error) => {
        if (useInNewFlowTemplatesRequestIdRef.current !== requestId) return
        setUseInNewFlowTemplates([])
        toastErrorFromCatch("Could not load flow suggestions", error)
      })
      .finally(() => {
        if (useInNewFlowTemplatesRequestIdRef.current === requestId) {
          setUseInNewFlowLoading(false)
        }
      })

    return () => {
      if (useInNewFlowTemplatesRequestIdRef.current === requestId) {
        useInNewFlowTemplatesRequestIdRef.current += 1
      }
    }
  }, [useInNewFlowOpen])

  return {
    useInNewFlowOpen,
    setUseInNewFlowOpen,
    useInNewFlowLoading,
    useInNewFlowPending,
    selectedUseInNewFlowTemplateId,
    setSelectedUseInNewFlowTemplateId,
    useInNewFlowIntent,
    setUseInNewFlowIntent,
    suggestedUseInNewFlowTemplates,
    handleOpenUseInNewFlow,
    handleConfirmUseInNewFlow,
  }
}
