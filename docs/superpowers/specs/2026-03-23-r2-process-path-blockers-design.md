# R2 Process Path Blockers — Design Spec

Four code changes + document cleanup that close the gap between R2 strategy docs and shipped product. Each change removes builder-shaped friction from the primary path.

Authority chain: R2-CANON > this spec > implementation detail.

---

## 1. Spine Always Visible

### Job

When I return to a flow after a pause, or after a step completes — I want to immediately see where I am in the process and what's next, without opening anything or remembering context.

### Current state

`shouldShowProcessSpine()` in `screen-state.ts:78-84` returns `false` on `fresh_start`, `cross_flow_handoff`, and `one_off_done`. The user sees a result but not "where this sits in the process." Feels like "I got a file", not "I'm on step 3 of 6."

### Change

`shouldShowProcessSpine()` returns `true` for all states except `fresh_start` without a template (nothing to show). Logic: `if (state === "fresh_start") return hasTemplate; return true;`

| State | Before | After |
|-------|--------|-------|
| `fresh_start` without template | hidden | hidden |
| `fresh_start` with template | hidden | **visible** |
| `cross_flow_handoff` | hidden | **visible** |
| `one_off_done` | hidden | **visible** |
| all others | visible | visible |

**Degenerate case:** For single-step flows (no multi-step spine), spine shows one completed step. This is still useful — the user sees "this was a one-step flow, it's done" rather than wondering if there's more.

### Files

- `src/renderer/components/workflow-panel/screen-state.ts` — gate logic, add `hasTemplate` parameter
- `src/renderer/components/workflow-panel/useWorkflowPanelShellDerivations.ts` — pass `hasTemplate` to caller
- Update tests in `screen-state.test.ts` — existing assertions for `fresh_start` and `cross_flow_handoff` returning `false` need updating

### Acceptance criteria

- User returning to saved work sees "where I am" without clicking
- User who got a final result sees the full path they walked
- Empty composer without template — spine not shown (nothing to show)
- Spine is a compact progress bar of steps, not technical information
- Single-step flows show one step in spine (not hidden)

---

## 2. Kill Regex Routing

### Job

When I type "проверь мой лендинг" — the system should understand what I need based on meaning, not word matching. Russian, mixed-language, or non-standard phrasing should work equally well.

### Current state

`inferResultModeFromText()` in `result-modes.ts:485-498` uses hardcoded regex (`/\b(codebase|repo|feature)\b/`) to classify domain mode. Russian text returns default "development." Direct violation of R2-CANON §2.4: "No regex, no keyword matching."

### Change

Delete `inferResultModeFromText()` and the three regex constants (`DEVELOPMENT_TEXT_RE`, `CONTENT_TEXT_RE`, `COURSES_TEXT_RE`). Domain mode becomes a side-product of the routing agent call that already exists in the create flow. One agent call receives text + project context → returns template + domain.

**Structural facts (code, not agent) — allowed as agent inputs:**
- `package.json` / `tsconfig.json` present → dev project signal
- Empty directory → greenfield signal
- Git history → existing work signal
- File/folder structure

**Interpretation (agent only):**
- Which domain
- Which intent
- Which starting point

**Fallback:** If agent unavailable for 5s → default to "development". Timeout lives in the routing agent caller (main process IPC handler). Composer shows subtle loading indicator during wait.

**Scope boundary — regex that stays:**
- `templateScoreForMode()` in `result-modes.ts` uses the same regex constants for template filtering/sorting. These operate on template metadata (structured internal data), not user natural language input. They are structural-fact-gathering about the template catalog and do not violate R2-CANON §2.4. However, they must be refactored to not depend on the deleted constants — extract their own local patterns or switch to template metadata fields.
- `template-filters.ts` has parallel regex for template classification. Same rule: operates on internal metadata, not user input. Out of scope for this spec but should be tracked as follow-up cleanup.
- `inferLoopLabel()` in `execution-loops.ts` uses regex on evaluator node titles. Same rule: internal metadata, not user text. Out of scope.

### Files

- `src/renderer/lib/result-modes.ts` — delete `inferResultModeFromText()` and regex constants; refactor `templateScoreForMode()` to use local patterns or metadata fields
- Create flow routing (existing agent call in main process) — extend response to include `domainMode`
- Callers of `inferResultModeFromText()` — switch to routing agent response
- Update tests — remove tests for deleted function, add tests for agent-based domain classification

### Acceptance criteria

- No regex in `result-modes.ts` for user text intent/domain classification
- Domain mode comes from routing agent response
- Russian text and non-standard phrasing work as well as English
- If agent unavailable 5s — fallback to "development", with loading indicator during wait
- Structural project facts still gathered programmatically as agent inputs
- `templateScoreForMode()` still works (refactored to not depend on deleted constants)

---

## 3. Simplify Quality Loop for User

### Job

When a check returns work for fixes — I want to understand three things: **what's wrong**, **how serious**, and **what to do**. I don't need score/threshold/attempt/delta — that's system internals.

### Current state

`ExecutionLoopCard` in `ui/execution-loop-card.tsx` shows evaluator metrics as primary content: `6/10`, `Bar 8/10`, `Loop 2/3`, `-2 to pass`, `2 below bar`. This is a dashboard for the evaluator author, not for the person driving the work.

### Change

Two levels in `ExecutionLoopCard`:

**Primary (always visible):**
- **Summary sentence** in job language — "2 findings need attention" / "Tests passed" / "Quality below bar — returning for fixes"
- **Action** — what to do — "Review findings" / "Approve and continue" / "System is retrying automatically"
- **Type badge** — "Check" (review loops) or "Verify" (verification loops)

**Secondary (behind "Technical details" disclosure):**
- Score, threshold, attempt count, criteria breakdown, delta
- Everything currently shown as primary moves here

**Default change:** `showTechnicalBadges` default flips from `true` to `false`. Existing callers that explicitly pass `showTechnicalBadges={true}` are unaffected. Callers that relied on the default will now show the simplified view.

Additionally, `ExecutionLoopSummary` type gets optional `loopType: "review" | "verify"` field. This replaces the regex-based `inferLoopLabel()` with an explicit field set by the evaluator config. Vocabulary and icon accent differ by type:

| | Review loop | Verify loop |
|---|---|---|
| Pass | "Approved" | "All checks passed" |
| Return | "Returning for polish" | "Returning to fix failures" |
| Escalate | "Needs human judgment" | "Cannot pass — decide manually" |
| Icon accent | Info (blue) | Warning→Success (amber→green) |
| Criteria label | "Findings" | "Results" |

### Files

- `src/renderer/components/ui/execution-loop-card.tsx` — primary/secondary split, loopType branching, flip `showTechnicalBadges` default
- `src/renderer/lib/execution-loops.ts` — add `loopType` to `ExecutionLoopSummary` type; `loopType` replaces `inferLoopLabel()` regex when available (fallback to existing behavior if `loopType` not set)

### Acceptance criteria

- User without technical context understands what happened and what to do
- Evaluator metrics accessible but not in face (behind disclosure by default)
- Review vs Verify distinguishable by summary language and type badge
- One component, one tab, same layout
- Existing callers passing `showTechnicalBadges={true}` still see full metrics

---

## 4. ChainBuilder to Advanced Access

### Job

When I work with a flow — I'm driving a process: current step, result, decision. I don't need to see the node graph unless I specifically want to look under the hood.

### Current state

`ChainBuilder` renders inline in `WorkflowPanelTabContents.tsx:236-244` alongside ResumeHeader, IdleStageContract, and OutputPanel. On some states, ResumeHeader + ChainBuilder + OutputPanel are visible simultaneously — three bordered containers, no "one figure per state."

### Change

ChainBuilder is removed from the inline layout entirely. It becomes accessible through:
- **Menu bar** action: Flow → Edit flow graph (per DESIGN-PHILOSOPHY §9: "Zero `...` buttons on any screen. The menu bar IS the overflow.")
- **Command palette**: `Cmd+K → "Edit flow graph"`

Not a tab. Not a disclosure. Not inline. Not an overflow three-dot menu. This is an advanced-layer tool that requires a deliberate action to reach.

**Rendering approach:** ChainBuilder opens as a full-height panel replacing the current list tab content (same viewport, triggered by menu/palette action, back button to return to process view). Not a modal overlay — that would feel like a popup over the real work. Not a side panel — ChainBuilder needs full width.

**Cleanup:** `showFlowEditor` derivation and `chainBuilderMode` prop in `WorkflowPanelTabContents` become dead code and should be removed. The derivation logic in `useWorkflowPanelShellDerivations.ts` that computes these moves to the new trigger location.

In the "list" tab, only process-path elements remain: spine + figure (ResumeHeader/IdleStageContract) → InputSection → OutputPanel. Clean single-figure hierarchy.

### Files

- `src/renderer/components/workflow-panel/WorkflowPanelTabContents.tsx` — remove ChainBuilder, remove `showFlowEditor`/`chainBuilderMode` props
- `src/renderer/components/workflow-panel/useWorkflowPanelShellDerivations.ts` — clean up dead derivations
- Menu bar registration — add "Edit flow graph" under Flow menu
- Command palette — add "Edit flow graph" entry
- New: ChainBuilder panel trigger — render ChainBuilder in-place (replacing list content) when activated, with back navigation

### Acceptance criteria

- ChainBuilder does not render in the main scroll region on any state
- Accessible via menu bar (Flow → Edit flow graph) and command palette
- Opens as full-height in-place panel with back button, not modal or side panel
- Primary path = process path, no graph leakage
- Power user loses nothing — just reaches graph through deliberate action
- Dead code from inline rendering is cleaned up

---

## 5. Document Cleanup

### Job

Someone reading R2-EXECUTION-PLAN should know: what's done, what's next, and in what order — without cross-referencing 5 other documents.

### Change

Update `docs/releases/R2-EXECUTION-PLAN.md`:
- Add status column to ship blocker table (done / in-progress / blocked)
- Add "Next 4 moves" section referencing this spec as concrete execution sequence
- Cross-reference the three strategy insertions made in this session:
  1. R2-CANON §2.1.1 — secondary operating principles (operator throughput, brief-quality, self-improving)
  2. STRATEGY §3 — maturity layers beyond R2 (operator control plane, self-improving harness, brief-quality, repo-adjacent ops)
  3. PRODUCT-FIT-AUDIT §8 — NSM measurement contract (primary metric, secondary metrics by release, anti-metrics)

### Acceptance criteria

- R2-EXECUTION-PLAN reads as actionable status document, not just checklist
- This spec's 4 changes are traceable from execution plan
- No new documents created — updates to existing ones only

---

## Sequencing

| Order | Change | Effort | Risk |
|-------|--------|--------|------|
| 1 | Spine always visible | Hours | Near-zero — gate change only |
| 2 | Kill regex routing | Days | Medium — async flow change, needs fallback, regex refactor in templateScoreForMode |
| 3 | Simplify quality loop | Hours | Low — component refactor, same layout, default flip |
| 4 | ChainBuilder to advanced | Hours–Day | Low-medium — move render location, add menu/palette entries, cleanup dead code |
| 5 | Doc cleanup | Hours | Zero |

Changes 1, 3, 4 are independent and can be parallelized. Change 2 is the only one with architectural weight.

---

## What this does NOT include

- New components or surfaces
- Changes to the create flow layout
- Factory or case management
- New domain packs
- Policy authoring UI
- Regex cleanup in `template-filters.ts` (tracked as follow-up)
- Any R3+ features

This spec closes the gap between R2 strategy and shipped code. Nothing more.
