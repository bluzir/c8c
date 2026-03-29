# Navigation State Machine

## Problem

Navigation state is spread across 5 independent Jotai atoms synchronized by 3 `useEffect` chains in ProjectSidebar. This session we fixed 12 bugs from this architecture — all from the same pattern: race conditions between atoms that must agree but sync reactively.

Root cause: **distributed state without a coordinator**.

## Design

### FSM States

```typescript
type NavPhase =
  | { phase: "idle" }
  | { phase: "chat_selected"; chatId: string; workflowPath: string | null }
  | { phase: "routing"; chatId: string; sessionId: string }
  | { phase: "running"; chatId: string; workflowPath: string; runId: string;
      paused?: { nodeId: string; reason: "approval" | "eval-exhausted" } }
  | { phase: "done"; chatId: string; workflowPath: string }
  | { phase: "error"; chatId: string; workflowPath: string | null;
      errorSource: "routing" | "execution";
      variant: "error" | "cancelled" | "interrupted" | "timeout";
      error: string }
```

Each phase carries **only the fields guaranteed to exist** in that state. `paused` sub-state on `running` handles approval gates and eval-exhausted decisions without a separate phase. Error phase carries `errorSource` and `variant` for granular recovery.

### Transitions

```
idle → chat_selected          (select_chat, restore_session)
idle → routing                (create_chat + start_routing)
chat_selected → routing       (start_routing — follow-up or new prompt)
routing → running             (run_started)
routing → error               (routing_failed)
routing → chat_selected       (cancel_routing)
running → done                (run_completed)
running → error               (run_failed, cancel_run)
done → routing                (start_routing — follow-up)
error → routing               (start_routing — retry)
error → done                  (accept_error_result — eval override)
any → idle                    (switch_project, navigate_away)
any → chat_selected           (select_chat)
```

Invalid transitions return current state unchanged (same reference). No throws, no side effects in reducer.

### Commands

```typescript
type NavCommand =
  // User actions
  | { type: "select_chat"; chatId: string }
  | { type: "create_chat"; chatId: string; name: string; projectPath: string }
  | { type: "start_routing"; chatId: string; sessionId: string; prompt: string }
  | { type: "cancel_routing" }
  | { type: "cancel_run" }
  | { type: "accept_error_result" }
  // System events (from routing/execution pipeline)
  | { type: "routing_complete"; sessionId: string; workflowPath: string; chatId: string }
  | { type: "routing_failed"; sessionId: string; error: string }
  | { type: "run_started"; runId: string; workflowPath: string }
  | { type: "run_completed"; runId: string; artifactIds: string[] }
  | { type: "run_failed"; runId: string; error: string; variant?: "error" | "cancelled" | "interrupted" | "timeout" }
  // Navigation
  | { type: "switch_project" }
  | { type: "navigate_away" }
  // Startup
  | { type: "restore_session"; chatId: string | null; workflowPath: string | null }
```

15 commands. Each is the **only way** to change NavPhase.

### Reducer

Pure function, testable without React. Zero side effects, zero atom reads.

```typescript
function navReducer(state: NavPhase, cmd: NavCommand): NavPhase
```

Commands must carry **all data the reducer needs**. UUID generation, atom reads, and IPC calls happen in the dispatch layer BEFORE calling the reducer.

### Architecture: Sync Reducer + Async Effects

Per V16 validation: async dispatch is unsafe (stale reads, no queuing). Instead:

```typescript
// navStateAtom — single source of truth
export const navStateAtom = atom<NavPhase>({ phase: "idle" })

// dispatchNavAtom — SYNCHRONOUS reducer + legacy sync
export const dispatchNavAtom = atom(null, (get, set, cmd: NavCommand) => {
  const prev = get(navStateAtom)
  const next = navReducer(prev, cmd)
  if (next === prev) return

  set(navStateAtom, next)

  // Sync derived legacy atoms (synchronous, in same Jotai batch)
  syncLegacyAtoms(set, next)
})

// Side effects — in useEffect, not in dispatch
// React manages lifecycle, cancellation, cleanup
```

Side effects (IPC calls, workflow loading) happen in a `useNavSideEffects()` hook that watches `navStateAtom` transitions, NOT inside `dispatchNavAtom`. This prevents stale reads, enables cancellation, and matches existing codebase patterns.

### Legacy Atoms — Derived Immediately (Not Strangler Fig)

Per V20 recommendation: skip the strangler fig pattern. Make legacy atoms **read-only derived** from `navStateAtom` in the same commit as FSM goes live. TypeScript catches all broken writers at compile time.

```typescript
// BEFORE: writable, 9+ scattered writers
export const selectedWorkflowPathAtom = atomWithStorage<string | null>(...)

// AFTER: derived, read-only, zero writers except FSM
export const selectedWorkflowPathAtom = atom<string | null>((get) => {
  const nav = get(navStateAtom)
  return "workflowPath" in nav ? nav.workflowPath ?? null : null
})

export const selectedChatIdAtom = atom<string | null>((get) => {
  const nav = get(navStateAtom)
  return "chatId" in nav ? nav.chatId : null
})
```

39 readers require zero changes (same atom reference, same type). Broken writers become compile errors — fix each one to dispatch a NavCommand instead.

### Persistence

`navStateAtom` is NOT persisted. On startup:
1. Legacy `atomWithStorage` atoms restore from localStorage (last known chatId + workflowPath)
2. `useNavSessionRestore` hook fires `restore_session` command
3. Reducer transitions `idle → chat_selected` if chatId exists

After FSM stabilizes, persistence migrates: `navStateAtom` becomes `atomWithStorage`, legacy keys become migration source.

### FSM Owns 5 Atoms, Execution Keeps 13

Per V7 boundary analysis:

**FSM (via syncLegacyAtoms):** `selectedChatIdAtom`, `selectedWorkflowPathAtom`, `chatRoutingProgressAtom`, `mainViewAtom`, `viewModeAtom`

**commitEnvelopeAtom (unchanged):** `currentWorkflowAtom`, `workflowSavedSnapshotAtom`, `inputValueAtom`, `inputAttachmentsAtom`, `workflowEntryStateAtom`, `selectedPastRunAtom`, and 7 more workflow/input/create-surface atoms.

FSM's `routing_complete` side effect calls `commitEnvelopeAtom` for the 13 workflow atoms.

### Execution Controller Boundary

Per V8/V17: FSM and execution controller are **orthogonal concerns**.

- Execution controller owns `runStatusAtom`, `nodeStatesAtom`, `evalResultsAtom` — never written by FSM
- Execution controller dispatches NavCommands (`run_started`, `run_completed`, `run_failed`) when run lifecycle events arrive
- FSM transitions based on these commands but does NOT touch execution atoms

```
WorkflowEvent (IPC) → Execution Controller → runStatusAtom update
                                            → dispatchNav("run_completed")
                                            → FSM transitions done
```

### syncLegacyAtoms

```typescript
function syncLegacyAtoms(set: SetAtom, next: NavPhase) {
  const chatId = "chatId" in next ? next.chatId : null
  const workflowPath = "workflowPath" in next ? next.workflowPath : null

  set(selectedChatIdAtom, chatId)
  set(selectedWorkflowPathAtom, workflowPath ?? null)  // null during routing
  set(mainViewAtom, next.phase === "idle" ? "thread" : "thread")
  set(viewModeAtom, "chat")

  if (next.phase === "idle" || next.phase === "chat_selected") {
    set(chatRoutingProgressAtom, null)
  }
}
```

### What Gets Deleted

| Current code | Replaced by |
|---|---|
| ProjectSidebar Effect 3 (bidirectional sync) | **Deleted entirely** |
| ProjectSidebar Effect 1 (chat loading) | `switch_project` side effect |
| `chatIdForWorkflowPathAtom` | **Deleted** — FSM knows chatId directly |
| `handleChatSelect` callback | `dispatchNav("select_chat")` |
| Orphan cleanup in `handleCancel` | `cancel_routing` side effect |
| 7 scattered `setSelectedChatId` calls | Single `dispatchNavAtom` |

### Testing

**~135 tests** across 7 suites:

| Suite | Tests | Focus |
|-------|-------|-------|
| Reducer transitions | 50 | Valid + invalid + universal |
| Phase field invariants | 12 | Correct fields per phase |
| Legacy atom sync | 20 | Atoms match FSM after every command |
| Side effects | 18 | Mocked IPC + store verification |
| Integration sequences | 10 | Multi-step realistic flows |
| Bridge integrity | 14 | Idempotency + consistency |
| Invalid transitions | 11 | Same-reference returns |

### Migration Plan

**One sprint (~5-7 days), not phased over months.**

**Day 1-2: FSM core**
- Create `src/renderer/lib/nav-state.ts` (types + reducer + atoms)
- Write 72+ reducer tests
- No existing code changes yet

**Day 3: Make legacy atoms derived**
- `selectedChatIdAtom` → derived from `navStateAtom`
- `selectedWorkflowPathAtom` → derived from `navStateAtom`
- Fix all compile errors (broken writers → dispatch commands)

**Day 4: Side effects hook**
- `useNavSideEffects()` handles async work per transition
- Delete ProjectSidebar sync effects
- Delete `chatIdForWorkflowPathAtom`

**Day 5-7: Fix broken writers + integration tests**
- Each broken writer becomes `dispatchNav(command)` call
- Integration tests verify multi-step flows
- Manual smoke testing

### Out of scope

- Execution state machine (nodeStates, evalResults) — separate concern
- Chat registry management (CRUD) — stays as is
- Timeline assembly — stays as is
- Artifact pool management — stays as is
