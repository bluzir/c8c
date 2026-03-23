import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { NodeState, SkillNodeConfig, WorkflowNode } from "../schema"
import {
  buildSkillNodeOutput,
  createAgentNodeOutput,
  selectIncomingInput,
} from "./run-output"

function state(
  status: NodeState["status"],
  completedAt: number,
  content?: string,
): NodeState {
  return {
    status,
    attempts: status === "completed" ? 1 : 0,
    completedAt,
    output: content ? { content, metadata: { source: status } } : undefined,
    log: [],
  }
}

describe("run-output", () => {
  it("prefers the newest completed incoming output and breaks ties by edge type", () => {
    const input = selectIncomingInput(
      [
        { id: "e-default", source: "draft", target: "node", type: "default" },
        { id: "e-pass", source: "pass", target: "node", type: "pass" },
        { id: "e-fail", source: "fail", target: "node", type: "fail" },
      ],
      {
        draft: state("completed", 1, "default"),
        pass: state("completed", 2, "pass"),
        fail: state("completed", 2, "fail"),
      },
    )

    expect(input?.content).toBe("fail")
  })

  it("extracts structured diagnostic summary from frontmatter", () => {
    const node: WorkflowNode = {
      id: "audit",
      type: "skill",
      position: { x: 0, y: 0 },
      config: { skillRef: "dev/audit", prompt: "" },
    }

    const output = createAgentNodeOutput(
      node,
      [
        "---",
        "diagnostic_summary:",
        "  headline: Broken auth path",
        "  tone: danger",
        "  top_findings:",
        "    - id: f1",
        "      label: Missing auth check",
        "---",
        "",
        "# Report",
        "Failure details",
      ].join("\n"),
    )

    expect(output.content).toBe("# Report\nFailure details")
    expect(output.metadata.diagnostic_summary).toMatchObject({
      headline: "Broken auth path",
      tone: "danger",
      topFindings: [{ id: "f1", label: "Missing auth check" }],
    })
  })

  it("prefers the content file when stdout looks like progress narration", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "run-output-"))
    const contentFile = join(workspace, "content-audit.md")
    await mkdir(join(workspace, "outputs"), { recursive: true })
    await writeFile(contentFile, "# Audit report\nActionable findings\n")

    const node: WorkflowNode = {
      id: "audit",
      type: "skill",
      position: { x: 0, y: 0 },
      config: { skillRef: "dev/audit", prompt: "", outputMode: "auto" },
    }

    const output = await buildSkillNodeOutput(
      { warn: () => {} },
      node,
      node.config as SkillNodeConfig,
      "thinking...\nwriting the output to the content file",
      contentFile,
      "Original input",
    )

    expect(output.content).toContain("Audit report")
    expect(output.metadata.output_source).toBe("content_file")
  })
})
