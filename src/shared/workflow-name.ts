export function normalizeWorkflowTitle(title: string): string {
  return title.normalize("NFKC").trim().replace(/\s+/g, " ")
}

export function nextWorkflowTitle(
  existingTitles: string[],
  baseTitle = "New flow",
): string {
  const normalizedExisting = new Set(
    existingTitles.map((name) =>
      normalizeWorkflowTitle(name).toLocaleLowerCase(),
    ),
  )

  let suffix = 1
  let candidate = baseTitle
  while (normalizedExisting.has(candidate.toLocaleLowerCase())) {
    suffix += 1
    candidate = `${baseTitle} ${suffix}`
  }
  return candidate
}

export function toWorkflowFileStem(title: string): string {
  const normalized = normalizeWorkflowTitle(title).toLocaleLowerCase()
  const stem = normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
  return stem || "flow"
}
