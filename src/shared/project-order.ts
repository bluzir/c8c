export type ProjectDropPosition = "before" | "after"

function uniqueProjectPaths(projects: string[]): string[] {
  return Array.from(
    new Set(
      projects.filter(
        (project): project is string => typeof project === "string",
      ),
    ),
  )
}

export function moveProjectBeforeOrAfterTarget(
  projects: string[],
  draggedProjectPath: string,
  targetProjectPath: string,
  position: ProjectDropPosition,
): string[] {
  const normalizedProjects = uniqueProjectPaths(projects)
  if (
    draggedProjectPath === targetProjectPath ||
    !normalizedProjects.includes(draggedProjectPath) ||
    !normalizedProjects.includes(targetProjectPath)
  ) {
    return normalizedProjects
  }

  const projectsWithoutDragged = normalizedProjects.filter(
    (projectPath) => projectPath !== draggedProjectPath,
  )
  const targetIndex = projectsWithoutDragged.indexOf(targetProjectPath)
  if (targetIndex < 0) return normalizedProjects

  const insertAt = position === "after" ? targetIndex + 1 : targetIndex
  return [
    ...projectsWithoutDragged.slice(0, insertAt),
    draggedProjectPath,
    ...projectsWithoutDragged.slice(insertAt),
  ]
}

export function mergeProjectOrderWithCurrent(
  currentProjects: string[],
  requestedOrder: string[],
): string[] {
  const normalizedCurrent = uniqueProjectPaths(currentProjects)
  const requestedKnownProjects = uniqueProjectPaths(requestedOrder).filter(
    (projectPath) => normalizedCurrent.includes(projectPath),
  )

  if (requestedKnownProjects.length === 0) {
    return normalizedCurrent
  }

  const remainingProjects = normalizedCurrent.filter(
    (projectPath) => !requestedKnownProjects.includes(projectPath),
  )
  return [...requestedKnownProjects, ...remainingProjects]
}
