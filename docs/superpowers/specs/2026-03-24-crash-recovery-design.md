# Crash Recovery: Seamless Resume After App Close

## Goal

When a user closes the app during a running flow and reopens it, the flow appears as if paused — showing partial progress with a "Continue" button that resumes from the exact point of interruption. Works for all flow topologies: linear, splitter branches, evaluator loops.

## Decisions

- **CLI subprocess on close**: orphan (let it finish in background). If alive on reopen, reconnect. If dead, show interrupted state from disk.
- **Auto-open on reopen**: single interrupted/completed flow auto-opens. Multiple → sidebar signals only.
- **Resume**: full resume via existing `rerunFromNode` + `findResumeNodeId`. All topologies supported — splitter branches preserve completed siblings, eval loops preserve iteration count.

## Architecture

Three new pieces, all using existing infrastructure:

1. **Persist manifest** (renderer, `beforeunload`) — lightweight pointer to in-flight workspaces in localStorage
2. **Startup scan** (renderer + new IPC) — check each workspace on disk, reconstruct terminal state
3. **Interrupted UI** (renderer) — new `terminalVariant` with "Continue" as primary CTA

No changes to workflow-runner package, execution engine, or state management architecture.

## Data Flow

```
App closing (beforeunload)
  → save { workflowKey: { runId, workspace, workflowPath, workflowName } } to localStorage

App reopening (renderer mount)
  → getActiveExecutions() rehydrates still-alive CLI runs (existing path, no changes)
  → read manifest from localStorage
  → for each manifest entry NOT already rehydrated:
      → IPC getTerminalRunSnapshot(workspace)
        → main reads run-result.json → completed
        → main reads run-state.json (no result) → interrupted
        → neither → workspace gone, skip
  → populate workflowExecutionStatesAtom with reconstructed state
  → clear manifest
  → auto-open if single recovered flow
```

## Section 1: Persist Manifest on Close

**Where**: new effect in `src/renderer/features/execution/useExecutionController.ts` (or a dedicated hook mounted in app root).

**When**: `window.addEventListener("beforeunload", ...)` — fires on graceful close.

**What**:
```ts
const MANIFEST_KEY = "c8c:in-flight-runs"

// On beforeunload:
const states = store.get(workflowExecutionStatesAtom)
const manifest: Record<string, InFlightManifestEntry> = {}
for (const [key, state] of Object.entries(states)) {
  if (!isRunInFlight(state.runStatus) || !state.workspace) continue
  manifest[key] = {
    runId: state.runId!,
    workspace: state.workspace,
    workflowPath: state.runWorkflowPath,
    workflowName: state.workflowName,
  }
}
localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest))
```

**Type**:
```ts
interface InFlightManifestEntry {
  runId: string
  workspace: string
  workflowPath: string | null
  workflowName: string
}
```

**Edge case — force quit**: `beforeunload` doesn't fire. Stale manifest from previous session may exist. Startup scan validates each entry against disk — stale entries with no workspace files are discarded.

**Edge case — multiple windows**: each window has its own execution state. Manifest captures whatever was in-flight in the window that closed. If another window is still open, its runs are alive (not in manifest).

## Section 2: New IPC — getTerminalRunSnapshot

**Handler**: `src/main/ipc/executor.ts`, new IPC channel `executor:get-terminal-run-snapshot`.

**Input**: `workspace: string`

**Logic**:
1. Try read `{workspace}/run-result.json` → if exists, parse as `RunResult` → return `{ status: "completed", result }`
2. Try read `{workspace}/run-state.json` → if exists, parse → return `{ status: "interrupted", snapshot: PersistedRunState }`
3. Neither exists → return `null`

**Security**: validate workspace path against `allowedReportRoots()` from `src/main/lib/security-paths.ts` (same roots used for run workspace access).

**Reuse existing code**: the handler should reuse the existing `loadPersistedRunSnapshot()` function at `src/main/ipc/executor.ts:371` for reading `run-state.json`. For `run-result.json`, reuse the existing `loadRunResult()` pattern from `run-workspace-store.ts`.

**Return type**:
```ts
type TerminalRunSnapshot =
  | { status: "completed"; result: RunResult }
  | {
      status: "interrupted"
      snapshot: PersistedRunSnapshot  // reuse existing type from src/shared/types.ts
      resumeNodeId: string | null
    }
  | null
```

`PersistedRunSnapshot` already exists in `src/shared/types.ts` with optional fields (`runtimeNodes?`, `runtimeEdges?`, `runtimeMeta?`, `input?`). The IPC handler normalizes these with defaults (empty arrays/objects) — same pattern as `loadPersistedRunSnapshot` already does.

`resumeNodeId` is computed server-side using existing `findResumeNodeId(savedState)` from `packages/workflow-runner/src/lib/persisted-run-state.ts`. This avoids shipping the function to renderer.

**Preload bridge**: add `getTerminalRunSnapshot(workspace: string)` to `window.api`.

## Section 3: Startup Scan

**Where**: new hook `useRecoverInterruptedRuns()` mounted in app root, runs once on mount.

**Sequence**:
1. Wait for `getActiveExecutions` rehydrate to complete (existing useEffect in `useExecutionController`)
2. Read manifest from localStorage (`MANIFEST_KEY`)
3. If empty → done
4. For each entry:
   - Check `workflowExecutionStatesAtom[key]` — if already has `isRunInFlight` status → skip (alive, reconnected)
   - Call `window.api.getTerminalRunSnapshot(entry.workspace)`
   - If `null` → skip
   - If `completed` → merge into empty state:
     ```ts
     { ...createEmptyWorkflowExecutionState(),
       runStatus: "done", runOutcome: "completed",
       runId: entry.runId, workspace: entry.workspace,
       runWorkflowPath: entry.workflowPath, workflowName: entry.workflowName,
       finalContent: result.report || "" }
     ```
   - If `interrupted` → merge into empty state to fill all required fields:
     ```ts
     { ...createEmptyWorkflowExecutionState(),
       runStatus: "done", runOutcome: "interrupted",
       runId: entry.runId, workspace: entry.workspace,
       runWorkflowPath: entry.workflowPath, workflowName: entry.workflowName,
       nodeStates: snapshot.nodeStates || {},
       runtimeNodes: snapshot.runtimeNodes || [],
       runtimeEdges: snapshot.runtimeEdges || [],
       runtimeMeta: snapshot.runtimeMeta || {},
       evalResults: snapshot.evalResults || {},
       resumeNodeId: snapshot.resumeNodeId }
     ```
5. Clear manifest from localStorage
6. Auto-open: if exactly one entry was recovered → select that workflow (`setSelectedWorkflowPath` + `setMainView("thread")`)

**New field on WorkflowExecutionState**: `resumeNodeId: string | null` — set only for interrupted runs. Used by UI to enable "Continue" button.

## Section 4: runOutcome "interrupted"

**Type**: `"interrupted"` already exists in the `RunStatus` union (`src/shared/types.ts:917`). `WorkflowExecutionState.runOutcome` is typed as `RunStatus | null`, so no type change needed. Only consuming code needs new branches.

**`useVerdictData`**: currently maps `runOutcome === "interrupted"` to `terminalVariant: "failed"` (line ~344). Change this to a new `terminalVariant: "interrupted"` — add `"interrupted"` to the `VerdictTerminalVariant` union type at `src/renderer/components/output/useVerdictData.ts:11`.

**Where runOutcome is checked** (places that need `"interrupted"` handling):
- `useVerdictData` — new `"interrupted"` terminalVariant with warning tone + custom headline
- `ResultTab` — new action items branch for `terminalVariant === "interrupted"`
- `deriveSidebarWorkflowRowState` — add interrupted badge
- `buildExecutionSurfaceNotice` — no change needed (interrupted is terminal, not an active error)
- `screen-state.ts` — interrupted should resolve to the same screen state as completed (show result surface)
- `showResultSurface` — already covers interrupted via `runStatus === "done" && runOutcome !== "blocked"` fallthrough. Adding explicit `"interrupted"` check is optional for readability.

## Section 5: Interrupted UI

**useVerdictData** — new case:
- `terminalVariant: "interrupted"`
- `headline`: "Flow interrupted at step {completedCount}/{totalCount}"
- `tone`: `"warning"` (amber)
- `evidenceItems`: completed step count, duration if available

**ResultTab action items** — new branch for `terminalVariant === "interrupted"`:
```tsx
} else if (terminalVariant === "interrupted") {
  // Primary: Continue from where it stopped
  if (resumeNodeId && onResumeFromNode) {
    actionItems.push(
      <Button key="continue" size="sm" onClick={() => onResumeFromNode(resumeNodeId)}>
        <ArrowRight size={12} />
        Continue
      </Button>
    )
  }
  // Secondary: full restart
  if (canStartFreshRun && onStartNewRun) {
    actionItems.push(
      <Button key="run-again" variant="ghost" size="sm" onClick={onStartNewRun}>
        Run again
      </Button>
    )
  }
  // Tertiary: inspect
  if (onViewActivity) {
    actionItems.push(
      <Button key="view-activity" variant="ghost" size="sm" onClick={onViewActivity}>
        View summary
      </Button>
    )
  }
}
```

**"Continue" handler**: calls existing IPC `rerunFromNode(runId, resumeNodeId, workflow, workspace)`. The workflow-runner reads `run-state.json`, preserves completed outputs, resets downstream from `resumeNodeId`, and continues. All topologies (linear, splitter, eval loop) handled by existing `prepareRerunState`.

**Sidebar badge**: `deriveSidebarWorkflowRowState` adds:
```ts
if (runOutcome === "interrupted") return { badge: "Interrupted", variant: "warning" }
```

**showResultSurface**: add `effectiveRunOutcome === "interrupted"` alongside existing `"cancelled"` check so the verdict card renders.

## Edge Cases

**Stale manifest (force quit + restart + no workspace)**: startup scan calls `getTerminalRunSnapshot` → returns null → entry discarded.

**CLI finished while app was closed**: `run-result.json` exists → scan returns `completed` → user sees finished result on reopen. Best case.

**CLI still alive on reopen**: `getActiveExecutions` finds it → normal rehydrate → manifest entry skipped. Seamless.

**Multiple interrupted flows**: sidebar shows badges, no auto-open. User picks which to resume.

**Interrupted flow's .chain file was deleted/moved**: workflow snapshot is in `run-state.json` (runtimeNodes/Edges). Can still show partial results but "Continue" needs the workflow definition. If workflowPath is invalid → disable "Continue", show "Run again" only.

**Workspace cleaned up by retention policy**: `run-state.json` gone → scan returns null → no recovery. Acceptable — retention is ≥20 runs / 30 days.

## Files to Create/Modify

### New files
- `src/renderer/hooks/useRecoverInterruptedRuns.ts` — startup scan + auto-open

### Modify: Main process
- `src/main/ipc/executor.ts` — add `executor:get-terminal-run-snapshot` handler
- `src/preload/index.ts` — add `getTerminalRunSnapshot` to window.api
- `src/shared/types.ts` — add `TerminalRunSnapshot` type (`"interrupted"` already exists in `RunStatus` union)

### Modify: Renderer
- `src/renderer/lib/workflow-execution.ts` — add `resumeNodeId` to `WorkflowExecutionState`, update `createEmptyWorkflowExecutionState`
- `src/renderer/features/execution/state.ts` — add `resumeNodeIdAtom`
- `src/renderer/components/output/useVerdictData.ts` — add interrupted case
- `src/renderer/components/output/ResultTab.tsx` — add interrupted action branch
- `src/renderer/components/output/useOutputPanelDerivedState.ts` — add interrupted to `showResultSurface`
- `src/renderer/components/sidebar/projectSidebarUtils.ts` — add interrupted badge
- `src/renderer/App.tsx` — mount `useRecoverInterruptedRuns`
- `src/renderer/features/execution/useExecutionController.ts` — add beforeunload manifest persist

### Modify: Shared
- `src/shared/c8c-api.ts` — add `getTerminalRunSnapshot` to API type
