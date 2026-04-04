import type { NodeType } from "@shared/types"
import {
  BarChart3,
  FileInput,
  FileOutput,
  GitFork,
  Hand,
  Merge,
  MessageSquare,
  Terminal,
  type LucideIcon,
  Zap,
} from "lucide-react"

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  input: FileInput,
  output: FileOutput,
  skill: Zap,
  evaluator: BarChart3,
  splitter: GitFork,
  merger: Merge,
  approval: Hand,
  human: MessageSquare,
  action: Terminal,
}

export const NODE_LABELS: Record<NodeType, string> = {
  input: "Input",
  output: "Output",
  skill: "Skill",
  evaluator: "Check",
  splitter: "Split work",
  merger: "Merge",
  approval: "Approval",
  human: "Human input",
  action: "Action",
}

export const NODE_ICON_TONES: Record<NodeType, string> = {
  input: "border-status-info/30 bg-status-info/10 text-status-info",
  output: "border-hairline bg-surface-1 text-muted-foreground",
  skill: "border-foreground/20 bg-foreground/10 text-foreground-subtle",
  evaluator:
    "border-status-warning/30 bg-status-warning/10 text-status-warning",
  splitter: "border-status-info/25 bg-status-info/8 text-status-info",
  merger: "border-status-success/25 bg-status-success/8 text-status-success",
  approval: "border-status-danger/22 bg-status-danger/8 text-status-danger",
  human: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  action: "border-foreground/15 bg-foreground/5 text-foreground-subtle",
}
