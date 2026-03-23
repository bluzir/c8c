import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildOpenClawApprovalRequest,
  buildOpenClawHumanInputRequest,
  decodeOpenClawResumeToken,
  encodeOpenClawResumeToken,
  loadWorkflow,
  parseOpenClawArgsJson,
} from "../../../packages/workflow-cli/src/index.js"

describe("openclaw cli helpers", () => {
  it("loads workflows from json files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "c8c-openclaw-cli-json-"))
    const workflowPath = join(workspace, "workflow.json")

    await writeFile(
      workflowPath,
      JSON.stringify({
        version: 1,
        name: "JSON Workflow",
        nodes: [],
        edges: [],
      }),
      "utf-8",
    )

    await expect(loadWorkflow(workflowPath)).resolves.toMatchObject({
      version: 1,
      name: "JSON Workflow",
    })
  })

  it("loads workflows from yaml files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "c8c-openclaw-cli-yaml-"))
    const workflowPath = join(workspace, "workflow.yaml")

    await writeFile(
      workflowPath,
      ["version: 1", "name: YAML Workflow", "nodes: []", "edges: []", ""].join(
        "\n",
      ),
      "utf-8",
    )

    await expect(loadWorkflow(workflowPath)).resolves.toMatchObject({
      version: 1,
      name: "YAML Workflow",
    })
  })

  it("parses args-json payloads for tool mode", () => {
    expect(parseOpenClawArgsJson(undefined)).toEqual({})
    expect(
      parseOpenClawArgsJson(
        '{"input":"draft","inputType":"text","projectPath":"/tmp/project","provider":"codex"}',
      ),
    ).toEqual({
      input: "draft",
      inputType: "text",
      projectPath: "/tmp/project",
      provider: "codex",
    })
  })

  it("rejects invalid args-json payloads", () => {
    expect(() => parseOpenClawArgsJson("[]")).toThrow(
      "--args-json must decode to a JSON object",
    )
    expect(() => parseOpenClawArgsJson('{"provider":"openai"}')).toThrow(
      "argsJson.provider must be one of: claude, codex",
    )
  })

  it("round-trips resume tokens", () => {
    const token = encodeOpenClawResumeToken({
      version: 1,
      workspace: "/tmp/workspace",
      nodeId: "approval-1",
    })

    expect(decodeOpenClawResumeToken(token)).toEqual({
      version: 1,
      workspace: "/tmp/workspace",
      nodeId: "approval-1",
    })
  })

  it("rejects malformed resume tokens", () => {
    const malformed = Buffer.from(
      JSON.stringify({ version: 1, workspace: "/tmp/workspace" }),
      "utf-8",
    ).toString("base64url")

    expect(() => decodeOpenClawResumeToken(malformed)).toThrow(
      "Invalid OpenClaw resume token",
    )
  })

  it("builds approval requests from human approval tasks when no approval event exists", () => {
    const approvalRequest = buildOpenClawApprovalRequest(
      {
        runId: "run-1",
        status: "blocked",
        workspace: "/tmp/workspace",
        reportPath: undefined,
        totalCost: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        evalScores: {},
        durationMs: 12,
      },
      null,
      {
        task: "task-token",
        taskId: "human-approval-1",
        request: {
          version: 1,
          kind: "approval",
          title: "Approve draft",
          instructions: "Review the final draft.",
          fields: [],
          defaults: {
            editedContent: "Edited by reviewer",
          },
        },
        state: {
          version: 1,
          taskId: "human-approval-1",
          chainId: "/tmp/workspace",
          sourceRunId: "run-1",
          kind: "approval",
          checkpointKind: "human",
          status: "open",
          workspace: "/tmp/workspace",
          nodeId: "human-1",
          workflowName: "Human flow",
          title: "Approve draft",
          instructions: "Review the final draft.",
          summary: "Draft summary",
          allowEdit: true,
          requestHash: "hash",
          responseRevision: 0,
          createdAt: 1,
          updatedAt: 2,
        },
        latestResponse: null,
      },
    )

    expect(approvalRequest).toMatchObject({
      type: "approval_request",
      prompt: "Review the final draft.",
      taskId: "task-token",
      items: [
        {
          nodeId: "human-1",
          taskId: "task-token",
          content: "Edited by reviewer",
          allowEdit: true,
        },
      ],
    })
    expect(decodeOpenClawResumeToken(approvalRequest.resumeToken)).toEqual({
      version: 1,
      workspace: "/tmp/workspace",
      nodeId: "human-1",
    })
  })

  it("builds human input requests for generic human tasks", () => {
    const humanInputRequest = buildOpenClawHumanInputRequest({
      task: "task-token",
      taskId: "human-form-1",
      request: {
        version: 1,
        kind: "form",
        title: "Capture reviewer notes",
        instructions: "Collect reviewer details before continuing.",
        fields: [
          {
            id: "reviewer",
            type: "text",
            label: "Reviewer",
            required: true,
          },
        ],
      },
      state: {
        version: 1,
        taskId: "human-form-1",
        chainId: "/tmp/workspace",
        sourceRunId: "run-1",
        kind: "form",
        checkpointKind: "human",
        status: "open",
        workspace: "/tmp/workspace",
        nodeId: "human-1",
        workflowName: "Human flow",
        title: "Capture reviewer notes",
        instructions: "Collect reviewer details before continuing.",
        summary: "Need reviewer details",
        requestHash: "hash",
        responseRevision: 0,
        createdAt: 1,
        updatedAt: 2,
      },
      latestResponse: null,
    })

    expect(humanInputRequest).toMatchObject({
      type: "human_task",
      prompt: "Collect reviewer details before continuing.",
      task: "task-token",
      taskId: "human-form-1",
      request: {
        kind: "form",
        fields: [
          {
            id: "reviewer",
          },
        ],
      },
    })
  })
})
