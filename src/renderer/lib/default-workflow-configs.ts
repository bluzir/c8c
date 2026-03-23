import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  MergerNodeConfig,
  SkillNodeConfig,
  SplitterNodeConfig,
} from "@shared/types"

export const DEFAULT_EVALUATOR_CONFIG: Omit<EvaluatorNodeConfig, "retryFrom"> =
  {
    criteria: "Score 1-10 on clarity, engagement, and effectiveness",
    threshold: 7,
    maxRetries: 3,
  }

export const DEFAULT_FANOUT_PATTERN: {
  splitter: SplitterNodeConfig
  worker: Pick<SkillNodeConfig, "skillRef" | "prompt">
  merger: Pick<MergerNodeConfig, "strategy">
} = {
  splitter: {
    strategy: "Split into independent subtasks",
    maxBranches: 8,
  },
  worker: {
    skillRef: "",
    prompt: "Run this subtask",
  },
  merger: {
    strategy: "concatenate",
  },
}

export const DEFAULT_APPROVAL_CONFIG: ApprovalNodeConfig = {
  message: "Review and approve this step before continuing.",
  show_content: true,
  allow_edit: false,
}

export const DEFAULT_HUMAN_CONFIG: HumanNodeConfig = {
  mode: "form",
  requestSource: "static",
  staticRequest: {
    version: 1,
    kind: "form",
    title: "Need human input",
    instructions: "Provide the missing information before the flow continues.",
    fields: [
      {
        id: "response",
        type: "textarea",
        label: "Response",
        required: true,
        placeholder: "Enter the information the flow needs...",
      },
    ],
  },
  timeoutAction: "fail_node",
  submitAction: "complete_node",
  rejectAction: "fail_node",
  allowRevisions: true,
  autoContinue: false,
}
