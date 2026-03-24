# UX, Copy & Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all UX, copy, vocabulary, and interaction issues found across 10 corridor tests (onboarding, happy path, resume, templates, approvals, errors, skills, settings, results, navigation).

**Architecture:** Pure renderer-side changes. No IPC protocol changes, no main-process changes, no new dependencies. All fixes are in `src/renderer/` — copy strings, JSX, and minor conditional logic.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Jotai, Lucide icons.

**Source audit:** All findings come from 10 parallel corridor test agents. Full report in conversation context. Every fix references exact file:line.

---

## File Map

### Canon Vocabulary Fixes

- Modify: `src/renderer/lib/artifact-inspect.ts:62-78`
- Modify: `src/renderer/components/output/ResultTab.tsx:253,359`
- Modify: `src/renderer/components/output/FinalResultSection.tsx:113`
- Modify: `src/renderer/components/workflow-panel/WorkflowPanelInlineSections.tsx:141,187,209,405`
- Modify: `src/renderer/components/WorkflowCreatePage.tsx:160-161`
- Modify: `src/renderer/components/OnboardingWizard.tsx:359,398,408,479,524-525,567`
- Modify: `src/renderer/components/templates/PendingTemplateDialog.tsx:72,158`
- Modify: `src/renderer/components/ApprovalDialog.tsx:422`
- Modify: `src/renderer/components/sidebar/SidebarWorkflowDialogs.tsx:141-142,155,178,188`
- Modify: `src/renderer/components/ProjectSidebar.tsx:426`

### Error & Recovery Fixes

- Modify: `src/renderer/components/OutputPanel.tsx:535`
- Modify: `src/renderer/lib/workflow-execution.ts:224`
- Modify: `src/renderer/features/execution/useExecutionCommands.ts:125,261,345,419,541`
- Modify: `src/renderer/features/execution/useExecutionController.ts:294`
- Modify: `src/renderer/components/ApprovalDialog.tsx:258,283`

### Cancelled State Bug Fix

- Modify: `src/renderer/components/output/ResultTab.tsx:307-363`

### Settings & Skills Copy

- Modify: `src/renderer/components/settings/SettingsSections.tsx` (exec defaults help text, safety profiles)
- Modify: `src/renderer/components/McpIntegrationsSection.tsx` (pre-run jargon)
- Modify: `src/renderer/components/McpServersSection.tsx` (MCP explanation)
- Modify: `src/renderer/components/skills/skill-dialogs.tsx:75`
- Modify: `src/renderer/components/skills/SkillSourceCards.tsx:149`

---

## Task 1: Canon Vocabulary — "artifact" → "result"

**Files:**

- Modify: `src/renderer/lib/artifact-inspect.ts:62-78`

The word "artifact" appears in 3 user-facing strings. Canon decrees: never show "artifact" in UI — use "result."

- [ ] **Step 1: Fix the 3 canon violations**

In `artifact-inspect.ts`, change the return object (lines 62-78):

```typescript
// Line 66: old
: "Saved artifact. No next step is ready from this artifact alone yet.",
// Line 66: new
: "Saved result. No next step is ready from this result alone yet.",

// Line 74: old
: "No upstream artifacts were recorded for this saved artifact.",
// Line 74: new
: "No upstream results were recorded for this saved result.",

// Line 78: old
: "No next step is ready from this artifact alone yet.",
// Line 78: new
: "No next step is ready from this result alone yet.",
```

- [ ] **Step 2: Run canon check**

```bash
npm run canon:check
```

Expected: no "artifact" violations in user-facing strings.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/artifact-inspect.ts
git commit -m "fix(copy): replace banned 'artifact' with 'result' in inspect strings"
```

---

## Task 2: Canon Vocabulary — Remaining Leaks

**Files:**

- Modify: `src/renderer/components/output/ResultTab.tsx:253,359`
- Modify: `src/renderer/components/output/FinalResultSection.tsx:113`
- Modify: `src/renderer/components/templates/PendingTemplateDialog.tsx:72,158`
- Modify: `src/renderer/components/ApprovalDialog.tsx:422`
- Modify: `src/renderer/components/skills/skill-dialogs.tsx:75`
- Modify: `src/renderer/components/skills/SkillSourceCards.tsx:149`

- [ ] **Step 1: Fix ResultTab.tsx vocabulary**

Line 253 — "Start this step over" → "Run this step again" (more natural):

```tsx
// old
          Start this step over
// new
          Run this step again
```

Line 359 — "Edit flow graph" → "Edit flow" (remove internal "graph"):

```tsx
// old
          Edit flow graph
// new
          Edit flow
```

- [ ] **Step 2: Fix FinalResultSection.tsx hardcoded label**

Line 113 — "Use in new flow" → match the dynamic pattern from ResultTab:

```tsx
// old
          Use in new flow
// new
          Start next flow
```

- [ ] **Step 3: Fix PendingTemplateDialog.tsx**

Line 72 — "Start this starting point" → "Start this flow":

```tsx
// old
              : "Start this starting point"}
// new
              : "Start this flow"}
```

Line 158 (search for "Replace current draft") → "Replace current flow":

```tsx
// old
                  Replace current draft
// new
                  Replace current flow
```

- [ ] **Step 4: Fix ApprovalDialog.tsx**

Line 422 — "dashboard" → "Runs panel":

```tsx
// old
              Closing this dialog keeps the flow paused and moves it to the
              dashboard.
// new
              Closing this dialog keeps the flow paused and moves it to the
              Runs panel.
```

- [ ] **Step 5: Fix skill-dialogs.tsx**

Line ~75 — `` `skillRef` `` → "skill steps":

```tsx
// old (search for "skillRef")
I understand this may break `skillRef` in the current flow
// new
I understand this may break skill steps in the current flow
```

- [ ] **Step 6: Fix SkillSourceCards.tsx fallback description**

Line ~149 — "Plugin bundle for executable pipeline assets" → user-friendly:

```tsx
// old
"Plugin bundle for executable pipeline assets"
// new
"Skill pack — no description provided."
```

- [ ] **Step 7: Run lint + canon check**

```bash
npm run lint && npm run canon:check
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/output/ResultTab.tsx src/renderer/components/output/FinalResultSection.tsx src/renderer/components/templates/PendingTemplateDialog.tsx src/renderer/components/ApprovalDialog.tsx src/renderer/components/skills/skill-dialogs.tsx src/renderer/components/skills/SkillSourceCards.tsx
git commit -m "fix(copy): fix vocabulary leaks — graph, draft, dashboard, skillRef, starting point"
```

---

## Task 3: Cancelled State — Missing Action Buttons (Critical Bug)

**Files:**

- Modify: `src/renderer/components/output/ResultTab.tsx:307-363`

When `terminalVariant === "cancelled"`, no action items are pushed — the user sees a verdict card with zero buttons. The `canStartFreshRun` flag was enabled for cancelled in commit `49d6ca9` but never consumed.

- [ ] **Step 1: Add cancelled branch after the failed branch**

After line 363 (the closing `}` of the `else if (terminalVariant === "failed")` block), add:

```tsx
  } else if (terminalVariant === "cancelled") {
    if (canStartFreshRun && onStartNewRun) {
      actionItems.push(
        <Button
          key="run-again"
          type="button"
          size="sm"
          onClick={onStartNewRun}
        >
          <ArrowRight size={12} />
          Run again
        </Button>,
      )
    }

    if (hasUseInNewFlowAction && onUseInNewFlow) {
      actionItems.push(
        <Button
          key="use-in-new-flow"
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            void Promise.resolve(onUseInNewFlow())
          }}
        >
          {verdictData.followUpLabel || "Start next flow"}
        </Button>,
      )
    }

    if (onViewActivity) {
      actionItems.push(
        <Button
          key="view-activity"
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
          onClick={onViewActivity}
        >
          View summary
        </Button>,
      )
    }
  }
```

- [ ] **Step 2: Verify by running the app**

```bash
npm run dev
```

Cancel a running flow, confirm the result card shows "Run again" + "View summary" buttons.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/output/ResultTab.tsx
git commit -m "fix: add action buttons to cancelled flow state"
```

---

## Task 4: Error Surface — "Run needs attention" → "Run failed"

**Files:**

- Modify: `src/renderer/components/OutputPanel.tsx:535`
- Modify: `src/renderer/lib/workflow-execution.ts:224`

The error banner uses the euphemism "Run needs attention" for terminal failures. Users need directness.

- [ ] **Step 1: Fix OutputPanel.tsx**

Line 535 — change the title for failure notices:

```tsx
// old
          title: "Run needs attention",
// new
          title: "Run failed",
```

- [ ] **Step 2: Fix workflow-execution.ts**

Line 224 — same change:

```tsx
// old
      title: "Run needs attention",
// new
      title: "Run failed",
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/OutputPanel.tsx src/renderer/lib/workflow-execution.ts
git commit -m "fix(copy): replace 'Run needs attention' euphemism with 'Run failed'"
```

---

## Task 5: Error Surface — "Check the main flow" Jargon (8 occurrences)

**Files:**

- Modify: `src/renderer/components/ApprovalDialog.tsx:258,283`
- Modify: `src/renderer/features/execution/useExecutionCommands.ts:125,261,345,419,541`
- Modify: `src/renderer/features/execution/useExecutionController.ts:294`

All 8 occurrences of "Check the main flow and try again." use developer-facing jargon.

- [ ] **Step 1: Replace all 8 occurrences**

Use `replace_all` or manual edit. The replacement varies slightly by context:

| File                        | Line | Old                                                                       | New                                                                                                  |
| --------------------------- | ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ApprovalDialog.tsx`        | 258  | `"Approval timed out. Check the main flow and try again."`                | `"Approval timed out. Try again, or restart the app if the problem continues."`                      |
| `ApprovalDialog.tsx`        | 283  | `"Stopping the flow timed out. Check the main flow and try again."`       | `"Stopping the flow timed out. Try again, or restart the app if the problem continues."`             |
| `useExecutionCommands.ts`   | 125  | `"Late-started run cancel timed out. Check the main flow and try again."` | `"A late-started run could not be stopped. Try again, or restart the app if the problem continues."` |
| `useExecutionCommands.ts`   | 261  | `"Run start timed out. Check the main flow and try again."`               | `"Run start timed out. Try again, or restart the app if the problem continues."`                     |
| `useExecutionCommands.ts`   | 345  | `"Run cancel timed out. Check the main flow and try again."`              | `"Run cancel timed out. Try again, or restart the app if the problem continues."`                    |
| `useExecutionCommands.ts`   | 419  | `"Restart timed out. Check the main flow and try again."`                 | `"Restart timed out. Try again, or restart the app if the problem continues."`                       |
| `useExecutionCommands.ts`   | 541  | `"Continue run timed out. Check the main flow and try again."`            | `"Continue timed out. Try again, or restart the app if the problem continues."`                      |
| `useExecutionController.ts` | 294  | `"Result saving timed out. Check the main flow and try again."`           | `"Result saving timed out. Try again, or restart the app if the problem continues."`                 |

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ApprovalDialog.tsx src/renderer/features/execution/useExecutionCommands.ts src/renderer/features/execution/useExecutionController.ts
git commit -m "fix(copy): replace 'Check the main flow' jargon in 8 timeout messages"
```

---

## Task 6: Onboarding — Copy Polish

**Files:**

- Modify: `src/renderer/components/OnboardingWizard.tsx`

- [ ] **Step 1: Remove "No custom skills needed to start" from Step 1 AND Step 3**

Delete line 407-409 (the `<p>` containing this text in `StepCheckCli`):

```tsx
// DELETE these lines from StepCheckCli (around line 407):
<p className="ui-meta-text text-muted-foreground">
  No custom skills needed to start.
</p>
```

Also delete line 566-568 (the same text in `StepUnderstandWorkflow`):

```tsx
// DELETE these lines from StepUnderstandWorkflow (around line 567):
<p className="ui-meta-text text-muted-foreground">
  No custom skills needed to start.
</p>
```

- [ ] **Step 2: Fix auth verification copy (line 359)**

```tsx
// old
                          ? "Authentication could not be verified automatically"
// new
                          ? "Sign-in could not be verified — try running the CLI manually"
```

- [ ] **Step 3: Fix vague single-provider message (line 398)**

```tsx
// old
                : "A provider is ready to go."}
// new
                : `${PROVIDER_LABELS[readyProviders[0]]} is ready.`}
```

- [ ] **Step 4: Fix "first real flow" in Step 2 (line 479)**

```tsx
// old
            Continue to start your first real flow.
// new
            Continue to start your first flow.
```

- [ ] **Step 5: Fix "starting path" in Step 3 (line 525)**

```tsx
// old
    "The system picks the best starting path and runs the first steps.",
// new
    "c8c picks the best starting point and runs the first steps.",
```

- [ ] **Step 6: Run lint + typecheck**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/OnboardingWizard.tsx
git commit -m "fix(copy): polish onboarding — remove repetition, fix vocabulary, improve clarity"
```

---

## Task 7: Onboarding — Remove Repeated Copy from Sidebar

**Files:**

- Modify: `src/renderer/components/ProjectSidebar.tsx:426`

- [ ] **Step 1: Remove "No custom skills needed to start" from sidebar empty state**

Find line 426 and delete the line:

```tsx
// DELETE:
                  No custom skills needed to start.
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/ProjectSidebar.tsx
git commit -m "fix(copy): remove repeated 'No custom skills needed' from sidebar"
```

---

## Task 8: WorkflowPanelInlineSections — Copy Polish

**Files:**

- Modify: `src/renderer/components/workflow-panel/WorkflowPanelInlineSections.tsx`

- [ ] **Step 1: Fix "handle the rest" overpromise (line 141)**

```tsx
// old
            First time? Describe what you need — c8c will handle the rest.
// new
            First time? Describe what you need — c8c will suggest the best starting point.
```

- [ ] **Step 2: Fix same in EmptyWorkspaceState (line 187-188)**

```tsx
// old
            First time? Open a project and describe what you need — c8c will
            handle the rest.
// new
            First time? Open a project and describe what you need — c8c will
            suggest the best starting point.
```

- [ ] **Step 3: Fix "agent" and "prompt" in WorkflowDraftSkeleton (lines 208-210)**

```tsx
// old
            The agent is turning your prompt into a runnable flow. This view
            will populate as soon as the draft is ready.
// new
            c8c is building a flow from your request. This view will update
            when the draft is ready.
```

- [ ] **Step 4: Fix arrow syntax in resume header (line 405)**

```tsx
// old
          `Attached: ${resumeSummary.attachText} -> used by this step`,
// new
          `Attached: ${resumeSummary.attachText} — used by this step`,
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/workflow-panel/WorkflowPanelInlineSections.tsx
git commit -m "fix(copy): polish inline sections — fix vocabulary, overpromise, arrow syntax"
```

---

## Task 9: WorkflowCreatePage — Copy Polish

**Files:**

- Modify: `src/renderer/components/WorkflowCreatePage.tsx:159-161`

- [ ] **Step 1: Fix routing state copy**

Lines 159-161:

```tsx
// old
          Using your request and project context to pick the first flow. This
          only chooses the start. It does not run anything yet.
// new
          Using your request and project context to pick the best starting
          point. Nothing runs until you approve.
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/WorkflowCreatePage.tsx
git commit -m "fix(copy): improve routing state clarity — starting point, approval language"
```

---

## Task 10: Sidebar Context Menu — Reduce "global" prefix

**Files:**

- Modify: `src/renderer/components/sidebar/SidebarWorkflowDialogs.tsx:155,178,188`

The "global flow" prefix on every menu item is noisy. The globe icon on the row already signals scope.

- [ ] **Step 1: Simplify global workflow menu labels**

```tsx
// Line 155: old
              Open global flow
// new
              Open flow

// Line 178: old
              Rename global flow
// new
              Rename flow

// Line 188: old
              Duplicate global flow
// new
              Duplicate flow
```

Keep "Delete global flow" as-is (destructive action benefits from specificity).

- [ ] **Step 2: Add destructive styling to project workflow delete (lines 135-143)**

Find the `<DropdownMenuItem>` that calls `requestDeleteWorkflow` (around line 135-143):

```tsx
// old (lines 135-143):
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestDeleteWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Delete flow
            </DropdownMenuItem>

// new:
            <DropdownMenuItem
              className="text-status-danger focus:text-status-danger"
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestDeleteWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Delete flow
            </DropdownMenuItem>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/sidebar/SidebarWorkflowDialogs.tsx
git commit -m "fix(copy): simplify global flow menu labels, add destructive styling to delete"
```

---

## Task 11: Settings — Copy Polish

**Files:**

- Modify: `src/renderer/components/settings/SettingsSections.tsx`
- Modify: `src/renderer/components/McpIntegrationsSection.tsx`
- Modify: `src/renderer/components/McpServersSection.tsx`

- [ ] **Step 1: Fix execution defaults help text**

Find "Maximum agentic turns per step" and replace:

```tsx
// old
"Maximum agentic turns per step."
// new
"How many times the AI can act before a step completes."
```

Find "Max parallel branches per fan-out step" and replace:

```tsx
// old
"Max parallel branches per fan-out step."
// new
"Maximum steps that can run at the same time when work is split."
```

- [ ] **Step 2: Fix MCP integrations description**

In `McpIntegrationsSection.tsx`, find the description text containing "Discovery still happens from flows at pre-run" and replace:

```tsx
// old
Discovery still happens from flows at pre-run; this section is for management.
// new
Flows check for required connections before running.
```

- [ ] **Step 3: Add MCP explanation to McpServersSection.tsx**

Find the section heading for MCP Servers. Add a description line after it:

```tsx
// Add after section heading:
<p className="ui-meta-text text-muted-foreground">
  MCP servers extend flows with external tools — file systems, APIs, databases.
</p>
```

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/settings/SettingsSections.tsx src/renderer/components/McpIntegrationsSection.tsx src/renderer/components/McpServersSection.tsx
git commit -m "fix(copy): polish settings — remove jargon from exec defaults, MCP, integrations"
```

---

## Task 12: Approval — Post-Action Toasts

**Files:**

- Modify: `src/renderer/components/ApprovalDialog.tsx`

After approve/reject, the dialog closes silently. Other state transitions (pause, resume) already show toasts. Add matching toasts.

- [ ] **Step 1: Add `toast` import**

At the top of `ApprovalDialog.tsx`, add alongside existing imports:

```tsx
import { toast } from "sonner"
```

- [ ] **Step 2: Add success toast after approve**

In `handleApprove`, after the `await withIpcTimeout(...)` resolves successfully (before `shiftRequest()`), add:

```tsx
toast.success("Step approved — flow continuing.")
```

- [ ] **Step 3: Add success toast after reject**

In `handleReject`, after the `await withIpcTimeout(...)` resolves successfully, add:

```tsx
toast.success("Step rejected — flow stopped.")
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ApprovalDialog.tsx
git commit -m "fix(ux): add confirmation toasts after approve/reject actions"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run canon:check` passes
- [ ] `npm run test` passes
- [ ] Manual check: open app, walk through onboarding (step 1-3), create a flow, run it, see result, cancel a run, check cancelled state has buttons
- [ ] Manual check: open Settings, verify exec defaults help text reads clearly
- [ ] Manual check: trigger an approval, verify toast appears after approve/reject
- [ ] Manual check: sidebar context menus show simplified labels

---

## Out of Scope (Documented for Future)

These items were identified in corridor tests but require architectural changes beyond copy/UI fixes:

1. **Input pre-fill on "Run again"** — requires wiring `lastRunInputRef` → `inputValueAtom` on `prepareNewRun`. Medium effort.
2. **Approval queue navigator** — FIFO-only queue needs skip/preview for parallel approvals. Medium effort.
3. **Rate limit detection & translation** — needs error classification layer in execution pipeline. Medium effort.
4. **Silent validation failure** — `useExecutionCommands.run()` returns without feedback when `resolvedInput.valid === false`. Needs toast + field highlight. Small effort.
5. **Blocked flow signal in status bar** — persistent badge for background blocked flows. Small effort.
6. **App crash recovery** — persist execution state to disk. Large effort.
7. **Flow import UI** — file picker + YAML preview for shared flows. Medium effort.
8. **Cost aggregation** — per-flow/project cost tracking beyond per-run. Medium effort.
9. **Results page sidebar nav** — currently hidden behind comment. Gate behind factory beta flag. Small effort.
10. **Runs dashboard as page-level view** — promote from modal dialog. Medium effort.

---

## Appendix: Workflow State Machine Bugs (Cancelled Run Path)

Found via state audit — 5 bugs that trap users after cancelling a run.

### Bug SM-1: No restart button for cancelled runs (CRITICAL)

**File:** `src/renderer/components/output/ResultTab.tsx` ~line 307
**Problem:** `terminalVariant === "cancelled"` has no action buttons branch. User sees verdict but zero buttons.
**Fix:** Add cancelled case with "Run again" button, same pattern as failed case.

### Bug SM-2: Cancelled run auto-enters review mode (CRITICAL)

**File:** `src/renderer/components/workflow-panel/useWorkflowPanelReviewState.ts` ~line 88
**Problem:** Effect checks `runStatus === "done" && runOutcome !== "blocked"` — matches cancelled. Calls `setShowSavedRunReview(true)`. User trapped in review mode with no exit.
**Fix:** Exclude cancelled: `runOutcome !== "blocked" && runOutcome !== "cancelled"`

### Bug SM-3: "Back to current" invisible or misleading

**File:** `src/renderer/components/OutputPanel.tsx`, `OutputPanelHeader.tsx`
**Problem:** `onExitReview` only renders when `reviewingRunHistory` true. Auto-review from cancel sets `showSavedRunReview` without `reviewingRunHistory`. Button invisible.
**Fix:** After SM-2 fix (no auto-review on cancel), this becomes less critical. Also: rename to "Start over" for cancelled/failed context.

### Bug SM-4: `runStatus === "cancelled"` is dead code

**File:** `src/renderer/components/output/useOutputPanelDerivedState.ts` lines 936, 953
**Problem:** `runStatus` is NEVER set to `"cancelled"`. Cancelled runs have `runStatus: "done"` + `runOutcome: "cancelled"`. All `runStatus === "cancelled"` checks are dead.
**Fix:** Remove dead checks. Rely on `runIsTerminal` (covers done) + `effectiveRunOutcome === "cancelled"` where needed.

### Bug SM-5: showResultSurface doesn't cover cancelled without result

**File:** `src/renderer/components/output/useOutputPanelDerivedState.ts` line 952-959
**Problem:** Cancelled run with no result content → Result tab hidden → user sees nothing.
**Fix:** Add `effectiveRunOutcome === "cancelled"` to showResultSurface condition.

### Execution order

1. SM-2 (stop auto-review on cancel) — biggest impact
2. SM-1 (cancelled action buttons)
3. SM-4 (dead code cleanup)
4. SM-5 (showResultSurface)
5. SM-3 (button label)

### Expected path after fix

```
User presses Cancel → runOutcome = "cancelled"
→ NO auto-review mode
→ Result tab shows "Run cancelled at step N" + "Run again" button
→ Click → resets to idle → user re-runs
```

---

## Appendix: Stuck Branch Detection (Engine-Level)

### Bug ENGINE-1: No per-branch timeout or stuck detection

**Problem:** Claude Code subprocess can hang indefinitely ("No new output for 23m 3s" repeating every minute). Per-run `timeout_minutes: 30` doesn't apply to individual branches. One stuck branch blocks the entire fan-out.

**User sees:** "Thinking..." with no progress, heartbeat messages incrementing. No way to kill one branch without cancelling the whole run.

**Fix (engine-level, not UI):**
1. **Stuck detection**: if no new log entry (excluding heartbeat) for N minutes → mark branch as stuck
2. **UI**: show "This step is not responding" with two options:
   - "Resume" — reconnect to Claude Code session (session ID is in subprocess state)
   - "Skip" — kill subprocess, mark branch as failed, continue with remaining branches
3. **Auto-timeout**: configurable per-node `stuckTimeout` (default 10min for research nodes). After timeout → auto-skip with warning in result.

**Files to modify:**
- `packages/workflow-runner/src/lib/run-node-executors.ts` — heartbeat detection + auto-kill
- `packages/workflow-runner/src/lib/agent-execution.ts` — session resume capability
- `src/renderer/components/output/StepRow.tsx` — "Not responding" UI state

**Priority:** P1 — not blocking ship but severely impacts research/content flows with parallel branches.
