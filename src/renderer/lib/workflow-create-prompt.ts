export interface WorkflowCreatePromptScaffold {
  goal: string
  input: string
  constraints: string
  successCriteria: string
}

export const EMPTY_WORKFLOW_CREATE_SCAFFOLD: WorkflowCreatePromptScaffold = {
  goal: "",
  input: "",
  constraints: "",
  successCriteria: "",
}

const SCAFFOLD_SECTIONS: Array<{
  key: keyof WorkflowCreatePromptScaffold
  label: string
}> = [
  { key: "goal", label: "Goal" },
  { key: "input", label: "Input" },
  { key: "constraints", label: "Constraints" },
  { key: "successCriteria", label: "Success criteria" },
]

function normalizeField(value: string): string {
  return value.trim()
}

export function countWorkflowCreateScaffoldFields(
  scaffold: WorkflowCreatePromptScaffold,
): number {
  return SCAFFOLD_SECTIONS.reduce(
    (count, section) =>
      normalizeField(scaffold[section.key]).length > 0 ? count + 1 : count,
    0,
  )
}

export function hasWorkflowCreatePromptContent(
  draftPrompt: string,
  scaffold: WorkflowCreatePromptScaffold,
): boolean {
  return (
    normalizeField(draftPrompt).length > 0 ||
    countWorkflowCreateScaffoldFields(scaffold) > 0
  )
}

export function buildWorkflowCreatePrompt(
  draftPrompt: string,
  scaffold: WorkflowCreatePromptScaffold,
): string {
  const normalizedDraft = normalizeField(draftPrompt)
  const scaffoldSections = SCAFFOLD_SECTIONS.map((section) => ({
    label: section.label,
    value: normalizeField(scaffold[section.key]),
  })).filter((section) => section.value.length > 0)

  if (scaffoldSections.length === 0) {
    return normalizedDraft
  }

  const lines: string[] = []

  if (normalizedDraft) {
    lines.push(normalizedDraft, "", "Additional context:")
  } else {
    lines.push("Create a workflow with the following context:")
  }

  for (const section of scaffoldSections) {
    lines.push(`${section.label}:`, section.value, "")
  }

  return lines.join("\n").trim()
}
