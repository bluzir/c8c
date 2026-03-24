import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  NodeInput,
  MergerNodeConfig,
  RuntimeMetaEntry,
  SkillNodeConfig,
  WorkflowNode,
} from "@shared/types"

function compactCopy(value: string | undefined | null, maxLength = 72) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

export interface RuntimeStagePresentation {
  kind: "Input" | "Role" | "Check" | "Cluster" | "Merge" | "Result" | "Approval"
  group: string
  title: string
  outcomeLabel: string
  outcomeText: string
  artifactLabel: string
  artifactRoleLabel: string
}

function getRuntimeArtifactRoleLabel(
  role?: NodeInput["metadata"]["artifact_role"],
) {
  if (role === "input") return "Input"
  if (role === "decision") return "Decision"
  if (role === "final") return "Final"
  return "Working"
}

function buildArtifactOutcomeText(
  role: NodeInput["metadata"]["artifact_role"] | undefined,
  artifactLabel: string,
  fallbackText: string,
) {
  if (!artifactLabel) return fallbackText
  if (role === "input")
    return `This step brings ${artifactLabel} into the flow.`
  if (role === "decision")
    return `This step records ${artifactLabel} before the flow continues.`
  if (role === "final")
    return `This step delivers ${artifactLabel} ready to review.`
  return `This step produces ${artifactLabel} for the next step.`
}

export function humanizeRuntimeIdentifier(value: string) {
  return value
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 3) return part.toUpperCase()
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
    })
    .join(" ")
}

export function getRuntimeBranchLabel(key: string) {
  return humanizeRuntimeIdentifier(key)
}

export function getRuntimeBranchDetail(meta?: RuntimeMetaEntry | null) {
  return compactCopy(meta?.subtaskContent, 78)
}

export function getRuntimeRoleMonogram(value: string) {
  const words = value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  if (words.length === 0) return "AG"
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase()
}

export function getRuntimeStagePresentation(
  node: WorkflowNode,
  options?: { fallbackId?: string; output?: NodeInput | null },
): RuntimeStagePresentation {
  const artifactOverrideLabel = compactCopy(
    options?.output?.metadata?.artifact_label,
    72,
  )
  const artifactRole = options?.output?.metadata?.artifact_role

  if (node.type === "skill") {
    const config = node.config as SkillNodeConfig
    const skillRef = (config.skillRef || "").trim()
    if (skillRef) {
      const parts = skillRef.split("/").filter(Boolean)
      const leaf = parts.length > 0 ? parts[parts.length - 1] : skillRef
      const artifactLabel =
        artifactOverrideLabel || `${humanizeRuntimeIdentifier(leaf)} output`
      return {
        kind: "Role",
        group:
          parts.length > 1
            ? parts
                .slice(0, -1)
                .map((part) => humanizeRuntimeIdentifier(part))
                .join(" / ")
            : "Agent role",
        title: humanizeRuntimeIdentifier(leaf),
        outcomeLabel: "Produces",
        outcomeText: buildArtifactOutcomeText(
          artifactRole || "intermediate",
          artifactLabel,
          compactCopy(config.prompt, 80) || "Result for the next role.",
        ),
        artifactLabel,
        artifactRoleLabel: getRuntimeArtifactRoleLabel(
          artifactRole || "intermediate",
        ),
      }
    }

    const title =
      compactCopy(config.prompt, 48) ||
      humanizeRuntimeIdentifier(options?.fallbackId || "skill")
    const artifactLabel = artifactOverrideLabel || `${title} output`
    return {
      kind: "Role",
      group: "Agent role",
      title,
      outcomeLabel: "Produces",
      outcomeText: buildArtifactOutcomeText(
        artifactRole || "intermediate",
        artifactLabel,
        "Result for the next role.",
      ),
      artifactLabel,
      artifactRoleLabel: getRuntimeArtifactRoleLabel(
        artifactRole || "intermediate",
      ),
    }
  }

  if (node.type === "evaluator") {
    const config = node.config as EvaluatorNodeConfig
    const artifactLabel = artifactOverrideLabel || "Quality decision"
    return {
      kind: "Check",
      group: "Quality check",
      title: config.threshold
        ? `Quality check ${config.threshold}/10`
        : "Quality check",
      outcomeLabel: "Decides",
      outcomeText: buildArtifactOutcomeText(
        artifactRole || "decision",
        artifactLabel,
        "Whether work is strong enough to continue.",
      ),
      artifactLabel,
      artifactRoleLabel: getRuntimeArtifactRoleLabel(
        artifactRole || "decision",
      ),
    }
  }

  if (node.type === "splitter") {
    const artifactLabel = artifactOverrideLabel || "Branch assignments"
    return {
      kind: "Cluster",
      group: "Parallel work",
      title: "Decompose",
      outcomeLabel: "Creates",
      outcomeText: buildArtifactOutcomeText(
        artifactRole || "intermediate",
        artifactLabel,
        "Parallel branch assignments for downstream roles.",
      ),
      artifactLabel,
      artifactRoleLabel: getRuntimeArtifactRoleLabel(
        artifactRole || "intermediate",
      ),
    }
  }

  if (node.type === "merger") {
    const config = node.config as MergerNodeConfig
    const artifactLabel =
      artifactOverrideLabel ||
      (config.strategy === "summarize"
        ? "Merged summary"
        : config.strategy === "select_best"
          ? "Best branch result"
          : "Merged result")
    return {
      kind: "Merge",
      group: "Merge",
      title:
        config.strategy === "summarize"
          ? "Summarize branches"
          : config.strategy === "select_best"
            ? "Select best branch"
            : "Merge branches",
      outcomeLabel: "Produces",
      outcomeText: buildArtifactOutcomeText(
        artifactRole || "intermediate",
        artifactLabel,
        "One combined result from the branch work.",
      ),
      artifactLabel,
      artifactRoleLabel: getRuntimeArtifactRoleLabel(
        artifactRole || "intermediate",
      ),
    }
  }

  if (node.type === "approval") {
    const config = node.config as ApprovalNodeConfig
    const artifactLabel = artifactOverrideLabel || "Approved content"
    return {
      kind: "Approval",
      group: "Review check",
      title: compactCopy(config.message, 42) || "Review and continue",
      outcomeLabel: "Approves",
      outcomeText: buildArtifactOutcomeText(
        artifactRole || "decision",
        artifactLabel,
        "A human decision before the flow can continue.",
      ),
      artifactLabel,
      artifactRoleLabel: getRuntimeArtifactRoleLabel(
        artifactRole || "decision",
      ),
    }
  }

  if (node.type === "human") {
    const config = node.config as HumanNodeConfig
    const artifactLabel = artifactOverrideLabel || "Human response"
    return {
      kind: config.mode === "approval" ? "Approval" : "Input",
      group: config.mode === "approval" ? "Review check" : "Human input",
      title:
        compactCopy(config.staticRequest?.title, 42) ||
        (config.mode === "approval" ? "Review and continue" : "Provide input"),
      outcomeLabel: config.mode === "approval" ? "Approves" : "Collects",
      outcomeText: buildArtifactOutcomeText(
        artifactRole || "decision",
        artifactLabel,
        config.mode === "approval"
          ? "A human decision before the flow can continue."
          : "Structured answers from a human before the flow can continue.",
      ),
      artifactLabel,
      artifactRoleLabel: getRuntimeArtifactRoleLabel(
        artifactRole || "decision",
      ),
    }
  }

  if (node.type === "output") {
    const artifactLabel =
      artifactOverrideLabel ||
      compactCopy(node.config.title, 42) ||
      "Final result"
    return {
      kind: "Result",
      group: "Result",
      title: compactCopy(node.config.title, 42) || "Final result",
      outcomeLabel: "Delivers",
      outcomeText: buildArtifactOutcomeText(
        artifactRole || "final",
        artifactLabel,
        "The final output ready to review, copy, or export.",
      ),
      artifactLabel,
      artifactRoleLabel: getRuntimeArtifactRoleLabel(artifactRole || "final"),
    }
  }

  const artifactLabel = artifactOverrideLabel || "Source input"
  return {
    kind: "Input",
    group: "Input",
    title: "Input",
    outcomeLabel: "Provides",
    outcomeText: buildArtifactOutcomeText(
      artifactRole || "input",
      artifactLabel,
      "The source material this flow works from.",
    ),
    artifactLabel,
    artifactRoleLabel: getRuntimeArtifactRoleLabel(artifactRole || "input"),
  }
}

export function getRuntimeStageIdentity(
  node: WorkflowNode,
  options?: { fallbackId?: string },
) {
  const presentation = getRuntimeStagePresentation(node, options)
  return {
    group: presentation.group,
    title: presentation.title,
  }
}

export function getRuntimeNodeLabel(
  node: WorkflowNode,
  options?: { fallbackId?: string },
) {
  return getRuntimeStagePresentation(node, options).title
}
