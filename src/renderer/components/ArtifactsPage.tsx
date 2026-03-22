import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { cn } from "@/lib/cn"
import {
  ArrowUpRight,
  FileStack,
  FileText,
  FolderOpen,
  LayoutTemplate,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
} from "lucide-react"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { errorToUserMessage } from "@/lib/error-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CollectionToolbar } from "@/components/ui/collection-toolbar"
import { PageHeader, PageShell, SectionHeading } from "@/components/ui/page-shell"
import { ScopeBanner } from "@/components/ui/scope-banner"
import { ArtifactInspectPanel } from "@/components/artifacts/ArtifactInspectPanel"
import { ArtifactListRow } from "@/components/artifacts/ArtifactListRow"
import { formatRelativeTime, projectFolderName } from "@/components/sidebar/projectSidebarUtils"
import {
  currentWorkflowAtom,
  factoryBetaEnabledAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  mainViewAtom,
  selectedFactoryIdAtom,
  selectedInboxTaskKeyAtom,
  selectedProjectAtom,
  selectedFactoryCaseIdAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  webSearchBackendAtom,
  workflowsAtom,
} from "@/lib/store"
import {
  areTemplateContractsSatisfied,
  deriveArtifactCaseKey,
  formatArtifactContractLabel,
  selectArtifactsForTemplateContracts,
} from "@/lib/workflow-entry"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { selectedPastRunAtom } from "@/features/execution"
import type { ArtifactRecord, CaseStateRecord, WorkflowTemplate } from "@shared/types"

function buildArtifactSearchText(
  artifact: ArtifactRecord,
  matchingTemplates: WorkflowTemplate[],
) {
  return [
    artifact.title,
    artifact.description,
    artifact.kind,
    artifact.caseLabel,
    artifact.templateName,
    artifact.workflowName,
    matchingTemplates.map((template) => template.name).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function ArtifactsPage() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedFactoryId] = useAtom(selectedFactoryIdAtom)
  const [selectedCaseId, setSelectedCaseId] = useAtom(selectedFactoryCaseIdAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [, setInputValue] = useAtom(inputValueAtom)
  const [, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [caseStates, setCaseStates] = useState<CaseStateRecord[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<string>("all")
  const [launchingTemplateId, setLaunchingTemplateId] = useState<string | null>(null)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [artifactPreviewById, setArtifactPreviewById] = useState<Record<string, {
    content: string
    truncated: boolean
    error: string | null
  }>>({})
  const [artifactPreviewLoadingId, setArtifactPreviewLoadingId] = useState<string | null>(null)
  const artifactsRequestIdRef = useRef(0)
  const artifactPreviewRequestIdRef = useRef(0)

  const refreshArtifacts = useCallback(async () => {
    const requestId = ++artifactsRequestIdRef.current
    if (!selectedProject) {
      if (artifactsRequestIdRef.current !== requestId) return
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
        window.api.listProjectCaseStates(selectedProject).catch(() => [] as CaseStateRecord[]),
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
      if (artifactsRequestIdRef.current === requestId) {
        setArtifactsLoading(false)
      }
    }
  }, [selectedProject])

  useEffect(() => {
    void refreshArtifacts()
  }, [refreshArtifacts])

  useEffect(() => {
    let cancelled = false
    setTemplatesLoading(true)
    setTemplatesError(null)

    void window.api.listTemplates().then((nextTemplates) => {
      if (cancelled) return
      setTemplates(nextTemplates)
    }).catch((error) => {
      if (cancelled) return
      setTemplates([])
      setTemplatesError(errorToUserMessage(error))
    }).finally(() => {
      if (!cancelled) {
        setTemplatesLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )

  const artifactFactoryKey = useCallback((artifact: ArtifactRecord) => {
    if (artifact.factoryId) return artifact.factoryId
    const template = artifact.templateId ? templateById.get(artifact.templateId) : undefined
    return template?.pack?.id ? `pack:${template.pack.id}` : "project:legacy"
  }, [templateById])

  const factoryScopeArtifacts = useMemo(
    () => selectedFactoryId
      ? artifacts.filter((artifact) => artifactFactoryKey(artifact) === selectedFactoryId)
      : artifacts,
    [artifactFactoryKey, artifacts, selectedFactoryId],
  )

  const selectedFactoryLabel = useMemo(() => {
    if (!selectedFactoryId) return null
    const direct = factoryScopeArtifacts.find((artifact) => artifact.factoryLabel)?.factoryLabel
    if (direct) return direct
    if (selectedFactoryId.startsWith("pack:")) {
      const packId = selectedFactoryId.replace(/^pack:/, "")
      return templates.find((template) => template.pack?.id === packId)?.pack?.label || "Lab"
    }
    return "Lab"
  }, [factoryScopeArtifacts, selectedFactoryId, templates])

  const artifactKinds = useMemo(() => {
    return Array.from(new Set(factoryScopeArtifacts.map((artifact) => artifact.kind))).sort((left, right) =>
      formatArtifactContractLabel(left).localeCompare(formatArtifactContractLabel(right)),
    )
  }, [factoryScopeArtifacts])

  const artifactsByCaseKey = useMemo(() => {
    const next = new Map<string, ArtifactRecord[]>()
    for (const artifact of factoryScopeArtifacts) {
      const caseKey = deriveArtifactCaseKey(artifact)
      const existing = next.get(caseKey)
      if (existing) {
        existing.push(artifact)
      } else {
        next.set(caseKey, [artifact])
      }
    }
    return next
  }, [factoryScopeArtifacts])

  const caseOptions = useMemo(() => {
    return Array.from(artifactsByCaseKey.entries())
      .map(([id, caseArtifacts]) => {
        const latestArtifact = [...caseArtifacts].sort((left, right) => right.updatedAt - left.updatedAt)[0]
        return {
          id,
          label: latestArtifact?.caseLabel || latestArtifact?.workflowName || latestArtifact?.title || "Track",
          count: caseArtifacts.length,
          updatedAt: latestArtifact?.updatedAt || 0,
        }
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [artifactsByCaseKey])

  const selectedCaseOption = useMemo(
    () => caseOptions.find((entry) => entry.id === selectedCaseId) || null,
    [caseOptions, selectedCaseId],
  )

  useEffect(() => {
    if (!selectedCaseId) return
    if (!caseOptions.some((entry) => entry.id === selectedCaseId)) {
      setSelectedCaseId(null)
    }
  }, [caseOptions, selectedCaseId, setSelectedCaseId])

  const scopeArtifacts = useMemo(
    () => (selectedCaseId ? (artifactsByCaseKey.get(selectedCaseId) || []) : factoryScopeArtifacts),
    [artifactsByCaseKey, factoryScopeArtifacts, selectedCaseId],
  )

  const compatibleTemplates = useMemo(() => {
    return templates
      .filter((template) => (template.contractIn?.length || 0) > 0)
      .filter((template) => areTemplateContractsSatisfied(template.contractIn, scopeArtifacts))
  }, [scopeArtifacts, templates])

  const matchingTemplatesByArtifactId = useMemo(() => {
    const next = new Map<string, WorkflowTemplate[]>()
    for (const artifact of factoryScopeArtifacts) {
      const artifactScope = selectedCaseId
        ? scopeArtifacts
        : (artifactsByCaseKey.get(deriveArtifactCaseKey(artifact)) || [artifact])
      const matchingTemplates = compatibleTemplates
        .filter((template) => areTemplateContractsSatisfied(template.contractIn, artifactScope))
        .filter((template) => template.contractIn?.some((contract) => artifactScope.some((candidate) => candidate.kind === contract.kind)))
        .slice(0, 3)
      next.set(artifact.id, matchingTemplates)
    }
    return next
  }, [artifactsByCaseKey, compatibleTemplates, factoryScopeArtifacts, scopeArtifacts, selectedCaseId])

  const filteredArtifacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return scopeArtifacts.filter((artifact) => {
      if (kindFilter !== "all" && artifact.kind !== kindFilter) return false
      if (!normalizedQuery) return true
      return buildArtifactSearchText(
        artifact,
        matchingTemplatesByArtifactId.get(artifact.id) || [],
      ).includes(normalizedQuery)
    })
  }, [kindFilter, matchingTemplatesByArtifactId, query, scopeArtifacts])

  const selectedArtifact = useMemo(
    () => filteredArtifacts.find((artifact) => artifact.id === selectedArtifactId) || null,
    [filteredArtifacts, selectedArtifactId],
  )

  const selectedArtifactScope = useMemo(() => {
    if (!selectedArtifact) return []
    if (selectedCaseId) return scopeArtifacts
    return artifactsByCaseKey.get(deriveArtifactCaseKey(selectedArtifact)) || [selectedArtifact]
  }, [artifactsByCaseKey, scopeArtifacts, selectedArtifact, selectedCaseId])

  const selectedArtifactMatchingTemplates = useMemo(
    () => (selectedArtifact ? (matchingTemplatesByArtifactId.get(selectedArtifact.id) || []) : []),
    [matchingTemplatesByArtifactId, selectedArtifact],
  )
  const caseStateById = useMemo(
    () => new Map(caseStates.map((entry) => [entry.caseId, entry])),
    [caseStates],
  )
  const selectedArtifactCaseState = useMemo(() => {
    if (!selectedArtifact) return null
    return caseStateById.get(deriveArtifactCaseKey(selectedArtifact)) || null
  }, [caseStateById, selectedArtifact])

  const selectedArtifactPreview = selectedArtifact
    ? artifactPreviewById[selectedArtifact.id] || null
    : null

  useEffect(() => {
    if (!selectedArtifactId) return
    if (filteredArtifacts.some((artifact) => artifact.id === selectedArtifactId)) return
    setSelectedArtifactId(null)
  }, [filteredArtifacts, selectedArtifactId])

  useEffect(() => {
    if (!selectedArtifact) return
    if (artifactPreviewById[selectedArtifact.id]) return

    const requestId = ++artifactPreviewRequestIdRef.current
    setArtifactPreviewLoadingId(selectedArtifact.id)

    void window.api.readFileContent(selectedArtifact.contentPath, selectedArtifact.projectPath)
      .then(({ content, truncated }) => {
        if (artifactPreviewRequestIdRef.current !== requestId) return
        setArtifactPreviewById((current) => ({
          ...current,
          [selectedArtifact.id]: {
            content,
            truncated,
            error: null,
          },
        }))
      })
      .catch((error) => {
        if (artifactPreviewRequestIdRef.current !== requestId) return
        setArtifactPreviewById((current) => ({
          ...current,
          [selectedArtifact.id]: {
            content: "",
            truncated: false,
            error: errorToUserMessage(error),
          },
        }))
      })
      .finally(() => {
        if (artifactPreviewRequestIdRef.current !== requestId) return
        setArtifactPreviewLoadingId((current) => current === selectedArtifact.id ? null : current)
      })
  }, [artifactPreviewById, selectedArtifact])

  const openArtifact = async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toastError("Could not open result", {
      description: openError,
    })
  }

  const revealArtifact = async (artifact: ArtifactRecord) => {
    const ok = await window.api.showInFinder(artifact.contentPath)
    if (ok) return
    toastError("Could not reveal result in Finder")
  }

  const inspectArtifact = (artifact: ArtifactRecord) => {
    setSelectedArtifactId(artifact.id)
  }

  const renderInspectPanel = (className?: string) => {
    if (!selectedArtifact) return null

    return (
      <div className={className}>
        <ArtifactInspectPanel
          artifact={selectedArtifact}
          caseState={selectedArtifactCaseState}
          relatedArtifacts={selectedArtifactScope}
          matchingTemplates={selectedArtifactMatchingTemplates}
          loading={artifactPreviewLoadingId === selectedArtifact.id && !selectedArtifactPreview}
          content={selectedArtifactPreview?.content || ""}
          truncated={selectedArtifactPreview?.truncated || false}
          error={selectedArtifactPreview?.error || null}
          launchingTemplateId={launchingTemplateId}
          onLaunchTemplate={launchTemplate}
          onRevealArtifact={revealArtifact}
          onOpenArtifact={openArtifact}
          onClearSelection={() => setSelectedArtifactId(null)}
        />
      </div>
    )
  }

  const launchTemplate = async (template: WorkflowTemplate, sourceArtifacts = scopeArtifacts) => {
    if (!selectedProject || launchingTemplateId) return

    setLaunchingTemplateId(template.id)
    try {
      const launch = await prepareTemplateStageLaunch({
        projectPath: selectedProject,
        template,
        webSearchBackend,
        artifacts: selectArtifactsForTemplateContracts(template.contractIn, sourceArtifacts),
        factory: selectedFactoryId && selectedFactoryLabel
          ? {
            id: selectedFactoryId,
            label: selectedFactoryLabel,
          }
          : null,
      })

      setWorkflows(launch.refreshedWorkflows)
      setSelectedWorkflowPath(launch.filePath)
      setWorkflow(launch.loadedWorkflow)
      setWorkflowSavedSnapshot(launch.savedSnapshot)
      setInputValue(launch.inputSeed)
      setWorkflowEntryState(launch.entryState)
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(launch.filePath),
        context: launch.templateContext,
      })
      setSelectedInboxTaskKey(null)
      setSelectedPastRun(null)
      setMainView("thread")

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setInputAttachments(launch.artifactAttachments)
        })
      })

      toast.success(`Opened ${template.name}`)
    } catch (error) {
      toastErrorFromCatch("Could not open the selected step", error)
    } finally {
      setLaunchingTemplateId(null)
    }
  }

  if (!selectedProject) {
    return (
      <PageShell>
        <PageHeader
          title="Results"
          subtitle="Choose a project in the sidebar to see reusable results and start the next step from them."
          actions={(
            <Button variant="outline" size="sm" onClick={() => setMainView("thread")}>
              <FolderOpen size={14} />
              Back to flow
            </Button>
          )}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Results"
        subtitle={
          selectedCaseOption
            ? `Reusable results for ${selectedCaseOption.label}. Stay in one track and open the next step without rebuilding context in the terminal.`
            : selectedFactoryLabel
              ? `Reusable results for ${selectedFactoryLabel}. Stay inside one lab while you review outputs and launch the next step.`
              : `Reusable results for ${projectFolderName(selectedProject)}. Use them to open the next step without rebuilding context in the terminal.`
        }
        actions={(
          <>
            {factoryBetaEnabled ? (
              <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
                <Rocket size={14} />
                Open lab
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setMainView("templates")}>
              <LayoutTemplate size={14} />
              Starting points
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refreshArtifacts()} disabled={artifactsLoading}>
              {artifactsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </Button>
          </>
        )}
      />

      <CollectionToolbar
        ariaLabel="Result controls"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search results or next steps"
        searchAriaLabel="Search results"
        summary={`${filteredArtifacts.length} result${filteredArtifacts.length === 1 ? "" : "s"}`}
        filters={(
          <>
            <span className="ui-meta-text hidden text-muted-foreground lg:inline-flex">Kind</span>
            <Button
              variant={kindFilter === "all" ? "secondary" : "outline"}
              size="xs"
              onClick={() => setKindFilter("all")}
              aria-pressed={kindFilter === "all"}
            >
              All
            </Button>
            {artifactKinds.map((kind) => (
              <Button
                key={kind}
                variant={kindFilter === kind ? "secondary" : "outline"}
                size="xs"
                onClick={() => setKindFilter(kind)}
                aria-pressed={kindFilter === kind}
              >
                {formatArtifactContractLabel(kind)}
              </Button>
            ))}
            {(caseOptions.length > 1 || selectedCaseOption) && (
              <>
                <span className="ui-meta-text hidden text-muted-foreground lg:inline-flex">Track</span>
                <Button
                  variant={selectedCaseId === null ? "secondary" : "outline"}
                  size="xs"
                  onClick={() => setSelectedCaseId(null)}
                  aria-pressed={selectedCaseId === null}
                >
                  All tracks
                </Button>
                {caseOptions.slice(0, 4).map((entry) => (
                  <Button
                    key={entry.id}
                    variant={selectedCaseId === entry.id ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => setSelectedCaseId(entry.id)}
                    aria-pressed={selectedCaseId === entry.id}
                  >
                    {entry.label}
                  </Button>
                ))}
              </>
            )}
          </>
        )}
      />

      <section className="space-y-4" aria-busy={artifactsLoading || templatesLoading}>
        {selectedFactoryLabel && !selectedCaseOption ? (
          <ScopeBanner
            eyebrow="Lab scope"
            description={`Showing results for ${selectedFactoryLabel}. Go back to the lab when you need a different outcome or path.`}
            actions={factoryBetaEnabled ? (
              <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
                <Rocket size={14} />
                Back to lab
              </Button>
            ) : undefined}
          />
        ) : null}

        {selectedCaseOption ? (
          <ScopeBanner
            eyebrow="Track scope"
            description={`Showing ${selectedCaseOption.count} result${selectedCaseOption.count === 1 ? "" : "s"} for ${selectedCaseOption.label}${selectedFactoryLabel ? ` inside ${selectedFactoryLabel}` : ""}.`}
            actions={(
              <>
                {factoryBetaEnabled ? (
                  <Button variant="outline" size="sm" onClick={() => setMainView("factory")}>
                    <Rocket size={14} />
                    Back to lab
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setSelectedCaseId(null)}>
                  Show all tracks
                </Button>
              </>
            )}
          />
        ) : null}

        <SectionHeading
          title={selectedFactoryLabel ? `${selectedFactoryLabel} results` : "Project results"}
          meta={compatibleTemplates.length > 0 ? (
            <span className="ui-meta-text text-muted-foreground">
              {compatibleTemplates.length} ready next step{compatibleTemplates.length === 1 ? "" : "s"}
            </span>
          ) : null}
        />

        {artifactsError ? (
          <div role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
            {artifactsError}
          </div>
        ) : templatesError ? (
          <div role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger/5 px-4 py-3 text-body-sm text-status-danger">
            {templatesError}
          </div>
        ) : artifactsLoading || templatesLoading ? (
          <div className="ui-empty-state rounded-xl border border-dashed border-hairline bg-surface-2/30 px-4 text-body-sm text-muted-foreground">
            Loading project results and next steps...
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="ui-empty-state rounded-xl border border-dashed border-hairline bg-surface-2/30 px-4 text-body-sm text-muted-foreground">
            {factoryScopeArtifacts.length === 0
              ? selectedFactoryLabel
                ? `No results have been saved for ${selectedFactoryLabel} yet. Run the first step to create reusable outputs.`
                : "No results saved yet. Run a first step to create reusable outputs."
              : "No results match this filter."}
          </div>
        ) : (
          <div className={cn("grid grid-cols-1 gap-4", selectedArtifact && "xl:grid-cols-[minmax(0,1fr)_28rem]")}>
            <div className="min-w-0">
              <div className="overflow-hidden rounded-xl surface-panel">
                {filteredArtifacts.map((artifact, index) => {
                  const matchingTemplates = matchingTemplatesByArtifactId.get(artifact.id) || []
                  const artifactCaseKey = deriveArtifactCaseKey(artifact)
                  const artifactCase = caseOptions.find((entry) => entry.id === artifactCaseKey) || null
                  const artifactScope = selectedCaseId
                    ? scopeArtifacts
                    : (artifactsByCaseKey.get(artifactCaseKey) || [artifact])
                  const isSelected = selectedArtifactId === artifact.id

                  return (
                    <ArtifactListRow
                      key={artifact.id}
                      artifact={artifact}
                      artifactCaseLabel={artifactCase?.label || null}
                      selectedCaseId={selectedCaseId}
                      selected={isSelected}
                      factoryBetaEnabled={factoryBetaEnabled}
                      supportingArtifactCount={artifactScope.length}
                      matchingTemplates={matchingTemplates}
                      launchingTemplateId={launchingTemplateId}
                      onOpenTrack={artifactCase ? () => {
                        setSelectedCaseId(artifactCase.id)
                        setMainView("factory")
                      } : null}
                      onInspect={() => inspectArtifact(artifact)}
                      onReveal={() => { void revealArtifact(artifact) }}
                      onOpen={() => { void openArtifact(artifact) }}
                      onLaunchTemplate={(template) => { void launchTemplate(template, artifactScope) }}
                      detailPanel={isSelected ? renderInspectPanel("xl:hidden") : null}
                    />
                  )
                })}
              </div>
            </div>

            {selectedArtifact ? renderInspectPanel("hidden xl:block xl:sticky xl:top-0 xl:self-start") : null}
          </div>
        )}
      </section>
    </PageShell>
  )
}
