import type { LogEntry } from "@shared/types"

function isProgressTextEntry(entry: LogEntry): boolean {
  return entry.type === "text" && entry.content.startsWith("[progress]")
}

function canMergeDisplayLogEntries(
  previous: LogEntry,
  next: LogEntry,
): boolean {
  if (previous.type !== next.type) return false
  if (isProgressTextEntry(previous) || isProgressTextEntry(next)) return false
  return (
    previous.type === "thinking" ||
    previous.type === "text" ||
    previous.type === "error"
  )
}

function mergeDisplayLogEntries(previous: LogEntry, next: LogEntry): LogEntry {
  if (previous.type === "thinking" && next.type === "thinking") {
    return {
      ...previous,
      content: previous.content + next.content,
      timestamp: next.timestamp,
    }
  }

  if (previous.type === "text" && next.type === "text") {
    return {
      ...previous,
      content: previous.content + next.content,
      timestamp: next.timestamp,
    }
  }

  if (previous.type === "error" && next.type === "error") {
    return {
      ...previous,
      content: previous.content + next.content,
      timestamp: next.timestamp,
    }
  }

  return next
}

export function mergeLogEntriesForDisplay(log: LogEntry[]): LogEntry[] {
  const merged: LogEntry[] = []

  for (const entry of log) {
    const previous = merged.at(-1)
    if (previous && canMergeDisplayLogEntries(previous, entry)) {
      merged[merged.length - 1] = mergeDisplayLogEntries(previous, entry)
      continue
    }
    merged.push(entry)
  }

  return merged
}
