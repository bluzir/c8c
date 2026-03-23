import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  InputNodeConfig,
  MergerNodeConfig,
  SkillNodeConfig,
  WorkflowNode,
} from "@shared/types"

export function getWorkflowNodeLabel(node: WorkflowNode): string {
  if (node.type === "skill") {
    return (node.config as SkillNodeConfig).skillRef || "skill"
  }
  if (node.type === "evaluator") {
    const cfg = node.config as EvaluatorNodeConfig
    return `evaluator (${cfg.threshold}/10)`
  }
  if (node.type === "splitter") return "splitter"
  if (node.type === "merger") {
    const cfg = node.config as MergerNodeConfig
    return `merger (${cfg.strategy})`
  }
  if (node.type === "approval") {
    const cfg = node.config as ApprovalNodeConfig
    return cfg.message || "approval"
  }
  if (node.type === "human") {
    const cfg = node.config as HumanNodeConfig
    return cfg.staticRequest?.title || `${cfg.mode} task`
  }
  if (node.type === "input") {
    const cfg = node.config as InputNodeConfig
    const parts: string[] = []
    if (cfg.inputType && cfg.inputType !== "auto") {
      parts.push(
        cfg.inputType === "url"
          ? "URL"
          : cfg.inputType.charAt(0).toUpperCase() + cfg.inputType.slice(1),
      )
    }
    if (cfg.required === false) parts.push("optional")
    return parts.length > 0 ? `input (${parts.join(", ")})` : "input"
  }
  return node.type
}
