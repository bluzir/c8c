import { describe, it, expect, vi } from "vitest"
import { createRoutingRunner, type RoutingRunnerDeps } from "./routing-runner"
import type { RoutingEvent, RoutingIntent } from "@shared/routing-types"

function makeMockDeps(
  overrides: Partial<RoutingRunnerDeps> = {},
): RoutingRunnerDeps {
  return {
    listTemplates: vi.fn().mockResolvedValue([
      {
        id: "content-post-drafter",
        name: "Post Drafter",
        description: "Drafts social media posts",
        stage: "execute",
        emoji: "📝",
        headline: "Draft posts",
        how: "AI drafts",
        input: "Topic or trend digest",
        output: "Draft posts",
        steps: ["Draft"],
        contractIn: [{ kind: "trend_digest", title: "Trend Digest" }],
        contractOut: [{ kind: "draft_post", title: "Draft Post" }],
        workflow: {
          nodes: [
            {
              id: "input-1",
              type: "input" as const,
              position: { x: 0, y: 0 },
              config: { inputType: "text" },
            },
          ],
          edges: [],
          version: 1,
          name: "Post Drafter",
          defaults: {},
        },
      },
    ]),
    listProjectArtifacts: vi.fn().mockResolvedValue([
      {
        id: "art-1",
        kind: "trend_digest",
        title: "Trend Digest",
        projectPath: "/tmp/project",
        relativePath: "artifacts/trend.md",
        createdAt: Date.now(),
      },
    ]),
    routeCreateEntry: vi.fn().mockResolvedValue({
      recommendedTemplateId: "content-post-drafter",
      reason: "Content drafting",
      confidence: 0.9,
      source: "agent",
      seed: {
        primaryInputMode: "text",
        primaryInputValue: "Draft posts",
        attachments: [],
      },
      projectInspection: {
        projectPath: "/tmp",
        git: { isRepo: false, branch: "", hasUncommittedDiff: false },
        manifests: [],
        codeDirs: [],
        fileDensity: "active",
        fileCountEstimate: 10,
        projectKind: "existing_repo",
      },
      alternateTemplateIds: [],
      domainMode: "content",
      clarification: null,
    }),
    createWorkflow: vi
      .fn()
      .mockResolvedValue("/tmp/project/.c8c/post-drafter.yaml"),
    loadWorkflow: vi.fn().mockResolvedValue({
      version: 1,
      name: "Post Drafter",
      nodes: [
        {
          id: "input-1",
          type: "input" as const,
          position: { x: 0, y: 0 },
          config: { inputType: "text" },
        },
      ],
      edges: [],
      defaults: {},
    }),
    readFileContent: vi.fn().mockResolvedValue({
      content: "# Trend Digest\nAI agents are trending...",
      truncated: false,
    }),
    loadRunResult: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

async function collectEvents(
  handle: ReturnType<ReturnType<typeof createRoutingRunner>["routeIntent"]>,
): Promise<RoutingEvent[]> {
  const events: RoutingEvent[] = []
  for await (const event of handle.events) {
    events.push(event)
  }
  return events
}

describe("RoutingRunner.routeIntent", () => {
  it("produces full event stream for follow-up with matching artifacts", async () => {
    const deps = makeMockDeps()
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "follow_up",
      projectPath: "/tmp/project",
      requestedResult: "Content Post Drafter",
      templateConstraintId: "content-post-drafter",
      sourceArtifactIds: ["art-1"],
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const types = events.map((e) => e.type)

    expect(types).toContain("routing_started")
    expect(types).toContain("templates_loaded")
    expect(types).toContain("artifacts_resolved")
    expect(types).toContain("route_selected")
    expect(types).toContain("workflow_created")
    expect(types).toContain("input_assembled")
    expect(types).toContain("envelope_ready")

    const envelope = await handle.envelope
    expect(envelope.workflowPath).toBe("/tmp/project/.c8c/post-drafter.yaml")
    expect(envelope.resolvedArtifacts).toHaveLength(1)
    expect(envelope.contractWarnings).toHaveLength(0)
    expect(envelope.autoRun).toBe(true) // follow_up
  })

  it("emits contract warning when artifact kind doesn't match", async () => {
    const deps = makeMockDeps({
      listProjectArtifacts: vi.fn().mockResolvedValue([
        {
          id: "art-wrong",
          kind: "report",
          title: "Report",
          projectPath: "/tmp/project",
          relativePath: "artifacts/report.md",
          createdAt: Date.now(),
        },
      ]),
    })
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "follow_up",
      projectPath: "/tmp/project",
      requestedResult: "Draft posts",
      templateConstraintId: "content-post-drafter",
      sourceArtifactIds: ["art-wrong"],
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const resolved = events.find((e) => e.type === "artifacts_resolved")

    expect(resolved).toBeDefined()
    expect(resolved!.type).toBe("artifacts_resolved")
    if (resolved!.type === "artifacts_resolved") {
      expect(resolved!.warnings).toHaveLength(1)
      expect(resolved!.warnings[0].kind).toBe("missing_artifact")
    }
  })

  it("emits routing_failed when createWorkflow throws", async () => {
    const deps = makeMockDeps({
      createWorkflow: vi.fn().mockRejectedValue(new Error("disk full")),
    })
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "new_flow",
      projectPath: "/tmp/project",
      requestedResult: "Build something",
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const failed = events.find((e) => e.type === "routing_failed")

    expect(failed).toBeDefined()
    if (failed?.type === "routing_failed") {
      expect(failed.error).toContain("disk full")
      expect(failed.phase).toBe("workflow_creation")
    }

    // Envelope promise should reject
    await expect(handle.envelope).rejects.toThrow("disk full")
  })

  it("routes via agent when no templateConstraintId is set", async () => {
    const deps = makeMockDeps()
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "new_flow",
      projectPath: "/tmp/project",
      requestedResult: "Draft some posts",
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const types = events.map((e) => e.type)

    expect(types).toContain("route_inspecting")
    expect(types).toContain("route_selected")
    expect(deps.routeCreateEntry).toHaveBeenCalled()

    const envelope = await handle.envelope
    expect(envelope.routeResult).not.toBeNull()
    expect(envelope.autoRun).toBe(false) // new_flow
  })

  it("skips agent routing when templateConstraintId is set", async () => {
    const deps = makeMockDeps()
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "follow_up",
      projectPath: "/tmp/project",
      requestedResult: "Draft posts",
      templateConstraintId: "content-post-drafter",
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const types = events.map((e) => e.type)

    expect(types).not.toContain("route_inspecting")
    expect(deps.routeCreateEntry).not.toHaveBeenCalled()
  })

  it("emits route_clarification and stops when agent returns clarification", async () => {
    const clarification = {
      type: "help_mode" as const,
      options: [
        {
          id: "opt-1",
          label: "Draft posts",
          description: "Create post drafts",
        },
      ],
      question: "What would you like?",
    }
    const deps = makeMockDeps({
      routeCreateEntry: vi.fn().mockResolvedValue({
        recommendedTemplateId: "content-post-drafter",
        reason: "Clarification needed",
        confidence: 0.5,
        source: "agent",
        seed: {
          primaryInputMode: "text",
          primaryInputValue: "",
          attachments: [],
        },
        projectInspection: {
          projectPath: "/tmp",
          git: { isRepo: false, branch: "", hasUncommittedDiff: false },
          manifests: [],
          codeDirs: [],
          fileDensity: "active",
          fileCountEstimate: 10,
          projectKind: "existing_repo",
        },
        alternateTemplateIds: [],
        domainMode: "dev",
        clarification,
      }),
    })
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "new_flow",
      projectPath: "/tmp/project",
      requestedResult: "Help me",
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const types = events.map((e) => e.type)

    expect(types).toContain("route_clarification")
    expect(types).not.toContain("envelope_ready")
    expect(types).not.toContain("workflow_created")

    // Envelope rejects since clarification stops the pipeline
    await expect(handle.envelope).rejects.toThrow(
      "Routing ended without producing an envelope",
    )
  })

  it("emits routing_failed when listTemplates throws", async () => {
    const deps = makeMockDeps({
      listTemplates: vi.fn().mockRejectedValue(new Error("network error")),
    })
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "new_flow",
      projectPath: "/tmp/project",
      requestedResult: "Something",
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const failed = events.find((e) => e.type === "routing_failed")

    expect(failed).toBeDefined()
    if (failed?.type === "routing_failed") {
      expect(failed.error).toContain("network error")
      expect(failed.phase).toBe("template_load")
    }

    await expect(handle.envelope).rejects.toThrow("network error")
  })

  it("emits routing_failed when no template matches agent recommendation", async () => {
    const deps = makeMockDeps({
      routeCreateEntry: vi.fn().mockResolvedValue({
        recommendedTemplateId: "nonexistent-template",
        reason: "Best match",
        confidence: 0.8,
        source: "agent",
        seed: {
          primaryInputMode: "text",
          primaryInputValue: "Do something",
          attachments: [],
        },
        projectInspection: {
          projectPath: "/tmp",
          git: { isRepo: false, branch: "", hasUncommittedDiff: false },
          manifests: [],
          codeDirs: [],
          fileDensity: "active",
          fileCountEstimate: 10,
          projectKind: "existing_repo",
        },
        alternateTemplateIds: [],
        domainMode: "dev",
        clarification: null,
      }),
    })
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "new_flow",
      projectPath: "/tmp/project",
      requestedResult: "Something",
    }
    const handle = runner.routeIntent(intent)

    const events = await collectEvents(handle)
    const failed = events.find((e) => e.type === "routing_failed")

    expect(failed).toBeDefined()
    if (failed?.type === "routing_failed") {
      expect(failed.error).toContain("No matching template found")
      expect(failed.error).toContain("nonexistent-template")
      expect(failed.phase).toBe("route_selection")
    }

    await expect(handle.envelope).rejects.toThrow("No matching template found")
  })

  it("builds correct entryState and templateContext in envelope", async () => {
    const deps = makeMockDeps()
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "follow_up",
      projectPath: "/tmp/project",
      requestedResult: "Draft posts",
      templateConstraintId: "content-post-drafter",
      sourceArtifactIds: ["art-1"],
    }
    const handle = runner.routeIntent(intent)

    await collectEvents(handle)
    const envelope = await handle.envelope

    // entryState
    expect(envelope.entryState.workflowPath).toBe(
      "/tmp/project/.c8c/post-drafter.yaml",
    )
    expect(envelope.entryState.workflowName).toBe("Post Drafter")
    expect(envelope.entryState.source).toBe("template")
    expect(envelope.entryState.title).toBe("Post Drafter")

    // templateContext
    expect(envelope.templateContext.templateId).toBe("content-post-drafter")
    expect(envelope.templateContext.templateName).toBe("Post Drafter")
    expect(envelope.templateContext.source).toBe("template")
    expect(envelope.templateContext.sourceArtifactIds).toEqual(["art-1"])
    expect(envelope.templateContext.contractIn).toEqual([
      { kind: "trend_digest", title: "Trend Digest" },
    ])
  })

  it("uses custom sessionId when provided", async () => {
    const deps = makeMockDeps()
    const runner = createRoutingRunner(deps)
    const intent: RoutingIntent = {
      type: "new_flow",
      projectPath: "/tmp/project",
      requestedResult: "Something",
      templateConstraintId: "content-post-drafter",
    }
    const handle = runner.routeIntent(intent, {
      sessionId: "custom-session-123",
    })

    const events = await collectEvents(handle)
    for (const event of events) {
      expect(event.sessionId).toBe("custom-session-123")
    }
  })
})
