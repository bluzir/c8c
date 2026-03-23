type WorkflowTemplateDisplayNameInput = {
  name: string
  pack?: {
    label?: string | null
  } | null
}

export function getWorkflowTemplateDisplayName(
  template: WorkflowTemplateDisplayNameInput,
): string {
  const packLabel = template.pack?.label?.trim()
  const name = template.name.trim()
  if (packLabel && name.startsWith(`${packLabel}: `)) {
    return name.slice(packLabel.length + 2).trim()
  }
  return name
}
