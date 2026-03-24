# QA Audit Findings — Bug Registry

> Source: 5 parallel QA agents (Electron lifecycle, CLI subprocess, state management, JTBD scenarios, file system). Date: 2026-03-24.

## Severity Legend

- **P0** — crash, data loss, security
- **P1** — broken feature, invisible resource waste
- **P2** — degraded experience, race conditions, incorrect state
- **P3** — defensive, cosmetic, low-probability edge cases

---

## P1 — Critical (3)

### E-1: Chat sessions not cancelled on window close

**File:** `src/main/lib/chat-agent.ts`
**Trigger:** Close window while chat agent is responding.
**Impact:** CLI subprocess orphaned. `activeSessions` keeps stale entry. On reopen, same-workflow chat returns "A chat session is already running for this flow."
**Root cause:** No `window.once("closed")` lifecycle binding for chat sessions. Compare with `executor.ts` (`bindWindowLifecycle`) and `templates.ts` (`bindGenerateLifecycle`) which both have this pattern.
**Fix:** Add `bindChatLifecycle` that aborts all active sessions for the closed window. Follow the `bindGenerateLifecycle` pattern in `templates.ts:67-74`.

### E-2: withIpcTimeout race — invisible running execution after timeout

**File:** `src/renderer/features/execution/commands.ts:137-157`, `src/renderer/features/execution/useExecutionCommands.ts:299-303`
**Trigger:** `executor:run` IPC takes >30s (slow scaffold, slow provider). Timeout fires → renderer rolls back to idle. But IPC eventually succeeds → main process starts CLI subprocess. Events stream to renderer but find no matching workflowKey (cleared by rollback) → buffered and pruned.
**Impact:** Invisible CLI process consuming API tokens. No way to cancel from UI.
**Root cause:** `stopLateStartedRun` only runs in the success path, not in the timeout/catch path. The renderer has no correlation ID to track or cancel the late-started run.
**Fix:** After timeout+rollback, poll `getActiveExecutions` once and cancel any run matching the workflow key. Or: have main process return a `correlationId` before starting the actual run.

### C-10: SIGKILL on node timeout — no graceful shutdown

**File:** `packages/workflow-runner/src/node/claude-cli.ts:211-214`
**Trigger:** Skill node exceeds 10-minute timeout.
**Impact:** `SIGKILL` kills CLI immediately — no chance to flush file writes, persist session state, or clean up tool operations. Workspace may be left dirty. Contrast with the abort handler (lines 216-221) which correctly sends SIGTERM first, SIGKILL after 5s.
**Fix:** Replace timeout handler with SIGTERM-then-SIGKILL pattern:
```ts
const timer = setTimeout(() => {
  killed = true
  child.kill("SIGTERM")
  setTimeout(() => { if (!child.killed) child.kill("SIGKILL") }, 5_000).unref()
}, timeout)
```

---

## P2 — Important (15)

### S-2: Approval queue removes wrong request on concurrent mutation

**File:** `src/renderer/components/ApprovalDialog.tsx:277-282`
**Trigger:** Approve request at index 1. During async IPC, new approval arrives → array reordered by controller. `removeCurrentRequest` filters by `clampedIndex` — now a different request.
**Impact:** Wrong request removed from local queue. Approved request stays visible. Backend correct, UI wrong.
**Fix:** Capture `requestKey = workflowKey::nodeId` before IPC. Filter by identity:
```ts
setRequests((prev) => prev.filter(
  (r) => `${r.workflowKey}::${r.nodeId}` !== targetKey
))
```

### S-10: Controller local mirror diverges from Jotai atom

**File:** `src/renderer/features/execution/controller.ts:72,97,104-120`
**Trigger:** User resets execution (atom write) + event arrives before next `sync()` layout effect. Controller reads stale local mirror, applies update, commits → clobbers reset.
**Impact:** Flow appears to still run after user clicked reset.
**Fix:** Remove local mirror. Have `commitExecutionState` accept updater function `(prev) => next` — Jotai resolves against latest value.

### J-1: No input length limit — OOM on large paste

**File:** `src/renderer/components/input/TextareaWithMention.tsx`, `src/renderer/lib/input-type.ts:58-102`
**Trigger:** Paste 1MB+ text. No `maxLength` on textarea. IPC passes unvalidated. CLI receives full payload.
**Impact:** Renderer DOM lag, IPC serialization cost, wasted API tokens on huge context.
**Fix:** Add `maxLength` to textarea (100K chars). Add server-side validation in `executor.ts`.

### J-2: rerunFrom/continueRun missing double-click guard

**File:** `src/renderer/features/execution/useExecutionCommands.ts:378-487, 489-668`
**Trigger:** Double-click "Continue" or "Restart from step". No `runStartingRef` guard (unlike `run()` which has it).
**Impact:** Two IPC calls fire → two backend runs for same workflow key. Second is orphaned.
**Fix:** Add `runStartingRef.current` guard to `rerunFrom`, `continueWithWorkflow`, `continueRun`.

### J-11: Batch panel renders all items without virtualization

**File:** `src/renderer/components/BatchPanel.tsx:531-640`
**Trigger:** Batch with 1000+ items. All rendered as real DOM nodes.
**Impact:** UI freeze. `items.sort()` on every completion is O(n² log n) total.
**Fix:** Virtualized list (react-window). Cap max batch size. Stream results to disk.

### C-1: Codex spawn error+close double settlement

**File:** `packages/workflow-runner/src/node/providers/codex-agent-provider.ts:390-476`
**Trigger:** Codex binary not found (ENOENT). `error` fires → reject. `close` fires → resolve (no-op on settled promise). But stdout flush callback still runs on dead pipeline. Abort listener never cleaned up.
**Fix:** Add `settled` boolean guard. Always resolve on whichever fires first (same pattern as `claude-cli.ts`).

### C-5: Cross-run execution pool exhaustion

**File:** `packages/workflow-runner/src/lib/run-lifecycle.ts:91-96`
**Trigger:** 2 concurrent splitter flows × 8 branches = 16 tasks for 8 pool slots. Queued tasks hit 30-min timeout.
**Impact:** Tasks fail with timeout, not because of actual work but because of pool starvation.
**Fix:** Per-run pool budget. Or warn when `maxParallel × activeRuns > poolLimit`.

### C-7: Auth expiry undetected during run

**File:** `packages/workflow-runner/src/node/providers/claude-agent-provider.ts:78-88`
**Trigger:** OAuth token expires mid-run. 401/403 from API. Not in `classifyError` patterns → `errorKind: "unknown"`.
**Impact:** Generic error, no re-auth guidance.
**Fix:** Add `"unauthorized"`, `"forbidden"`, `"401"`, `"403"` to `classifyError` as `"auth"` kind.

### C-9: stderr accumulation unbounded

**File:** `packages/workflow-runner/src/lib/run-node-executors.ts:561`
**Trigger:** Long-running skill node with verbose CLI output. `skillStderr += text` grows without limit. `state.log` array also grows.
**Impact:** Memory bloat proportional to execution duration.
**Fix:** Cap `skillStderr` to rolling 64KB window. Evict old `state.log` entries beyond threshold.

### E-4: No global uncaught exception handler in main process

**File:** `src/main/index.ts`
**Trigger:** Any unhandled throw outside IPC handlers (timers, event callbacks).
**Impact:** Silent crash or corrupted state. No diagnostics.
**Fix:** Add `process.on('uncaughtException')` and `process.on('unhandledRejection')` with `logError` + telemetry.

### E-6: sendWorkflowEvent TOCTOU on destroyed window

**File:** `src/main/workflow-notifications.ts:74-77`
**Trigger:** Window destroyed between `isDestroyed()` check and `webContents.send()`. `handleWorkflowNotification` calls `window.isFocused()` on destroyed window → throws.
**Fix:** Wrap `sendWorkflowEvent` body in try/catch, or add `if (window.isDestroyed()) return` at top.

### E-7: Batch cancel deletes snapshot map before final persist

**File:** `src/main/lib/batch-runner.ts:358-369`
**Trigger:** Cancel batch → `cancelBatch` deletes `activeBatchSnapshots` → `runBatch` finally can't persist "cancelled" state.
**Impact:** On restart, batch recovery shows stale data.
**Fix:** Don't delete snapshot maps in `cancelBatch`. Let `runBatch` finally persist "cancelled" then clean up.

### F-1: loadProjectsConfig write-on-load race

**File:** `src/main/lib/projects-config.ts:50-56`
**Trigger:** Two concurrent IPC calls read config, both detect stale project, both write — second overwrites first's prune.
**Impact:** Project entries silently dropped.
**Fix:** Move pruning into the serialized config operation queue, not inside load.

### F-2: chatPathFor can overwrite workflow file

**File:** `src/main/lib/chat-storage.ts:10`
**Trigger:** `workflowPath` without `.chain`/`.yaml` extension → regex no-op → chat JSON written to workflow path.
**Impact:** Workflow file corrupted with chat data.
**Fix:** Assert path ends with supported extension. Throw if not.

### F-5: MCP config cache never invalidated on external edits

**File:** `src/main/lib/mcp-config.ts:25-26`
**Trigger:** Edit `.mcp.json` in VS Code or via `claude mcp add`. Cache serves stale version forever.
**Impact:** External MCP changes invisible until restart.
**Fix:** TTL on cache, or check `mtime` before returning cached value.

---

## P3 — Low Priority (15)

| # | Bug | File | One-liner |
|---|-----|------|-----------|
| E-3 | `pendingCancelledRunIds` unbounded growth | `workflow-runner.ts:34` | Add TTL-based pruning |
| E-5 | No flush timeout in `before-quit` | `index.ts:445` | `Promise.race([flush(), sleep(2000)])` |
| C-2 | `runWorkspaces` map never cleaned | `runner.ts:477` | Delete in finally block |
| C-3 | Spawn error swallowed — no diagnostic | `claude-cli.ts:253` | Include `error.message` in result |
| C-4 | Retention vs snapshot read race | `run-workspace-retention.ts:38` | Skip running workspaces |
| C-6 | Mid-run provider switch possible | `provider-runtime.ts:25` | Snapshot settings at run start |
| J-3 | Rename can unlink under running process | `workflows.ts:270` | Check active runs before unlink |
| J-5 | Splitter passes empty content downstream | `splitter.ts:362` | Reject empty subtasks |
| J-6 | No recovery for deleted project folder | `executor.ts:900` | Detect ENOENT, surface specific message |
| J-7 | "Retry N Failed" includes cancelled items | `BatchPanel.tsx:110` | Label: "Retry N incomplete" |
| J-9 | `duration_ms` NaN guard | `BatchPanel.tsx:597` | `(item.duration_ms ?? 0)` |
| F-3 | `uniqueWorkflowPath` TOCTOU | `workflows.ts:24` | Use `O_CREAT\|O_EXCL` |
| F-4 | `listChains` creates dirs on read | `yaml-io.ts:47` | Catch ENOENT from readdir instead |
| F-6 | `run-state.json` parsed without validation | `executor.ts:371` | Add schema validation |
| F-12 | No file watching for external edits | N/A | Check mtime before save, warn |

---

## Implementation Priority

### Wave 1 — Fix now (P1 + critical P2)

1. **S-2** Approval queue identity fix — our code, just added, easy fix
2. **E-1** Chat session lifecycle binding — one function, copy existing pattern
3. **C-10** SIGTERM before SIGKILL — one line
4. **J-2** Double-click guard for rerun/continue — copy `runStartingRef` pattern
5. **F-2** chatPathFor extension guard — one assertion

### Wave 2 — Fix soon (remaining P2)

6. **E-2** Timeout+reconciliation for late-started runs
7. **S-10** Controller mirror removal (Jotai updater pattern)
8. **J-1** Input length limit
9. **C-7** Auth error classification
10. **E-4** Global exception handler
11. **E-6** sendWorkflowEvent try/catch
12. **E-7** Batch cancel persist fix
13. **F-1** Config write serialization
14. **F-5** MCP cache invalidation
15. **C-9** Stderr cap

### Wave 3 — When convenient (P3)

All 15 P3 items — can be batched into a maintenance pass.

### Out of scope (require design decisions)

- **C-5** Cross-run pool budget — needs pool architecture change
- **J-11** Batch virtualization — needs react-window dependency
- **F-12** File watching — needs design decision on scope
