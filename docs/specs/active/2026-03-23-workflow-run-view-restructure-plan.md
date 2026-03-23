# Workflow Run View Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tab-based OutputPanel with step-centric run view where steps are the primary surface, Final Result appears only on completion, and History is a separate page.

**Architecture:** Keep existing hooks (`useVerdictData`, `useOutputPanelDerivedState`, `useOutputPanelActions`) and rendering components (`LogTab`, `LogEntryCard`, `ResultTab` verdict logic). Replace the orchestration layer: remove tab switching, add StepRow accordion, move History to page. Five phases — each produces a working intermediate state.

**Tech Stack:** React 19, Jotai atoms, existing c8c design system tokens, Vitest

**Spec:** `docs/specs/active/2026-03-23-workflow-run-view-restructure.md`

---

## File Structure

### New files
- `src/renderer/components/output/StepRow.tsx` — Single step row with accordion (status, click to expand result/log)
- `src/renderer/components/output/StepsList.tsx` — Ordered list of StepRow components (replaces ProcessSpine + ActivityTab + tab switching)
- `src/renderer/components/output/FinalResultSection.tsx` — Verdict + continuation CTAs (extracted from ResultTab, rendered only on completion)
- `src/renderer/components/output/RunView.tsx` — New orchestrator (replaces OutputPanel tab logic)
- `src/renderer/components/RunHistoryPage.tsx` — Standalone history page (replaces HistoryTab-as-tab)
- `src/renderer/components/output/StepRow.test.tsx` — Tests for step row
- `src/renderer/components/output/StepsList.test.tsx` — Tests for steps list
- `src/renderer/components/output/FinalResultSection.test.tsx` — Tests for final result section
- `src/renderer/components/output/RunView.test.tsx` — Tests for run view orchestrator

### Reused (no changes needed)
- `src/renderer/components/output/LogEntryCard.tsx` — Renders inside step accordion
- `src/renderer/components/output/OutputSections.tsx` — `LogTab` reused inside step accordion
- `src/renderer/components/output/useVerdictData.ts` — Verdict computation for FinalResultSection
- `src/renderer/components/output/useOutputPanelActions.ts` — Copy/open handlers
- `src/renderer/lib/workflow-execution.ts` — Per-step data source
- `src/renderer/components/output/outputFormatters.ts` — Duration/token formatting

### Modified
- `src/renderer/components/OutputPanel.tsx` — Gutted: tab bar removed, delegates to RunView
- `src/renderer/components/output/OutputPanelHeader.tsx` — Simplified: no tabs, just scope/status
- `src/renderer/components/output/ResultTab.tsx` — Extracted into FinalResultSection (verdict + actions)
- `src/renderer/components/output/ActivityTab.tsx` — Replaced by StepsList (content reused)
- `src/renderer/components/workflow-panel/WorkflowPanelTabContents.tsx` — Updated to use RunView
- `src/renderer/components/WorkflowPanel.tsx` — History button in toolbar, remove history tab refs
- `src/renderer/App.tsx` — Add RunHistoryPage route

### Removed (after all phases complete)
- Tab switching logic in `useOutputPanelSurfaceState.ts` — No longer needed
- `OutputPanelHistoryContent.tsx` — Replaced by RunHistoryPage
- `outputPanelTypes.ts` `OutputTabValue` type — No tabs

---

## Task 1: StepRow Component

**Files:**
- Create: `src/renderer/components/output/StepRow.tsx`
- Create: `src/renderer/components/output/StepRow.test.tsx`

- [ ] **Step 1: Write StepRow test**

Test that StepRow renders step name, status icon, duration. Test that clicking expands accordion. Test that running step is auto-expanded.

```tsx
// StepRow.test.tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StepRow } from "./StepRow"

describe("StepRow", () => {
  it("renders step name and done status", () => {
    render(<StepRow name="Map codebase" status="done" duration="4m 12s" expanded={false} onToggle={() => {}} />)
    expect(screen.getByText("Map codebase")).toBeInTheDocument()
    expect(screen.getByText("4m 12s")).toBeInTheDocument()
  })

  it("shows live indicator for running step", () => {
    render(<StepRow name="Implement" status="running" expanded={true} onToggle={() => {}} />)
    expect(screen.getByText("Implement")).toBeInTheDocument()
    // running step should have beacon/pulse indicator
  })

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn()
    render(<StepRow name="Plan" status="done" expanded={false} onToggle={onToggle} />)
    await userEvent.click(screen.getByText("Plan"))
    expect(onToggle).toHaveBeenCalled()
  })

  it("renders fan-out progress for splitter steps", () => {
    render(<StepRow name="Fan out" status="running" expanded={false} onToggle={() => {}} fanOutProgress="4/10" />)
    expect(screen.getByText("4/10")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/output/StepRow.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StepRow**

```tsx
// StepRow.tsx
// Collapsible step row with: icon, name, status, duration, fan-out progress
// Click toggles accordion showing children (result content, log entries)
// Design tokens: ui-section-divider between rows, ui-selected-row-tint on expanded
// Running step: ui-status-beacon + ui-running-pulse
// Done step: CheckCircle2 icon in status-success color
// Failed step: XCircle icon in status-danger color
// Blocked step: Clock icon in status-warning color
// Pending step: dimmed text, not clickable
```

Key implementation notes:
- Read existing `NodesTab` in `OutputSections.tsx` (line 111-448) for per-node status rendering patterns
- Read existing `SelectedStepSummaryPanel` for step presentation pattern
- Use `ui-collapsible` / `ui-collapsible-inner` for accordion animation
- Props: `name`, `status`, `duration`, `cost`, `expanded`, `onToggle`, `fanOutProgress`, `children` (accordion content)
- Step types from `WorkflowNode.type`: input, skill, evaluator, splitter, merger, output, approval
- Icon per type: reuse `node-ui-config.ts` for type→icon mapping

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/renderer/components/output/StepRow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/output/StepRow.tsx src/renderer/components/output/StepRow.test.tsx
git commit -m "feat: add StepRow accordion component for run view"
```

---

## Task 2: StepsList Component

**Files:**
- Create: `src/renderer/components/output/StepsList.tsx`
- Create: `src/renderer/components/output/StepsList.test.tsx`

- [ ] **Step 1: Write StepsList test**

Test that StepsList renders all steps from workflow nodes. Test that only one step is expanded at a time. Test that running step auto-expands.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement StepsList**

Key implementation notes:
- Props: `nodes` (from workflow), `nodeStates` (from execution), `expandedStepId`, `onExpandStep`, `evalResults`, `activeNodeId`
- Maps workflow nodes → StepRow components
- Passes log entries as children to expanded StepRow (reuse `LogTab` from OutputSections.tsx)
- Passes result content as children to expanded done StepRow
- Read `useOutputPanelDerivedState.ts` for how `selectedStagePresentation` is derived — similar logic needed per step
- Read `NodesTab` in OutputSections.tsx for node ordering and status derivation
- Running step: auto-expanded, shows streaming log via existing `LogTab`
- Done step: shows result markdown + "View full log" disclosure
- Fan-out step: shows "N/M branches" badge, expanded shows branch sub-rows

- [ ] **Step 4: Run test to verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/output/StepsList.tsx src/renderer/components/output/StepsList.test.tsx
git commit -m "feat: add StepsList component with accordion navigation"
```

---

## Task 3: FinalResultSection Component

**Files:**
- Create: `src/renderer/components/output/FinalResultSection.tsx`
- Create: `src/renderer/components/output/FinalResultSection.test.tsx`

- [ ] **Step 1: Write FinalResultSection test**

Test that it renders nothing when run is not completed. Test that it renders verdict card when completed. Test that continuation CTA appears.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement FinalResultSection**

Key implementation notes:
- Extract from `ResultTab.tsx` (lines 200-600): verdict card, evidence strip, action buttons, continuation CTAs, loop disclosure
- Reuse `useVerdictData()` hook directly (548 LOC, already pure)
- Only renders when `runStatus === "done"` (or reviewing completed past run)
- **Critical:** Move "Start next flow" / "Continue to X" CTA here. Remove from any per-step context.
- Surface class: `surface-figure` (this is THE figure when run completes)
- Preserve ALL existing ResultTab functionality: markdown rendering, evidence panel, loop card, artifact save status, copy result, rerun actions

- [ ] **Step 4: Run test to verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/output/FinalResultSection.tsx src/renderer/components/output/FinalResultSection.test.tsx
git commit -m "feat: add FinalResultSection (completion-only verdict)"
```

---

## Task 4: RunView Orchestrator

**Files:**
- Create: `src/renderer/components/output/RunView.tsx`
- Create: `src/renderer/components/output/RunView.test.tsx`

- [ ] **Step 1: Write RunView test**

Test that RunView shows StepsList during running. Test that FinalResultSection appears on completion. Test that FinalResultSection is NOT visible during running.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement RunView**

Key implementation notes:
- This replaces OutputPanel's tab orchestration
- Layout: `StepsList` (always visible) + `FinalResultSection` (conditional, below steps)
- No tab bar. No tab state.
- Reads from same atoms as current OutputPanel via `useOutputPanel()` hook
- Delegates derived state to `useOutputPanelDerivedState()` (1140 LOC hook, reuse as-is initially)
- Handles: idle state (show stage contract message), starting state (show spinner), running/blocked/completed/failed
- Preserves: notice banners (`ExecutionSurfaceNoticeBanner`), context menus, keyboard shortcuts
- Error recovery: reuse `deriveFailureRecovery()` from OutputPanel.tsx

- [ ] **Step 4: Run test to verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/output/RunView.tsx src/renderer/components/output/RunView.test.tsx
git commit -m "feat: add RunView orchestrator replacing tab-based OutputPanel"
```

---

## Task 5: Wire RunView into WorkflowPanel

**Files:**
- Modify: `src/renderer/components/OutputPanel.tsx`
- Modify: `src/renderer/components/output/OutputPanelHeader.tsx`
- Modify: `src/renderer/components/workflow-panel/WorkflowPanelTabContents.tsx`

- [ ] **Step 1: Replace OutputPanel tab body with RunView**

In `OutputPanel.tsx`:
- Remove `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` wrapper
- Import and render `RunView` component instead
- Keep notice banners, context menu, command bindings
- Pass same props through

- [ ] **Step 2: Simplify OutputPanelHeader**

In `OutputPanelHeader.tsx`:
- Remove tab triggers rendering
- Keep scope label and review context badge
- No more `tabOptions` prop

- [ ] **Step 3: Update WorkflowPanelTabContents**

Ensure RunView is rendered in the correct container. Remove references to tab values.

- [ ] **Step 4: Run full test suite**

Run: `npm run test -- --run`
Expected: All existing tests pass (some may need updates for changed structure)

- [ ] **Step 5: Fix any broken tests**

Update test assertions that reference tab elements (Summary/Result/Step log/History buttons).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/OutputPanel.tsx src/renderer/components/output/OutputPanelHeader.tsx src/renderer/components/workflow-panel/WorkflowPanelTabContents.tsx
git commit -m "feat: wire RunView into WorkflowPanel, remove tab switching"
```

---

## Task 6: RunHistoryPage

**Files:**
- Create: `src/renderer/components/RunHistoryPage.tsx`
- Modify: `src/renderer/components/WorkflowPanel.tsx` — add "Runs" toolbar button
- Modify: `src/renderer/components/app/AppMainView.tsx` — add route (if needed)

- [ ] **Step 1: Create RunHistoryPage**

Key implementation notes:
- Reuse `HistoryTab.tsx` (575 LOC) content — past runs list, run metadata, improvement recommendations
- Page layout: `PageShell` + `PageHeader` (consistent with other pages)
- Click on run → navigate to workflow view with that run loaded (read-only review mode)
- "Back to current" button when reviewing a past run
- Reuse existing `workflowHistoryRunsAtom` for data

- [ ] **Step 2: Add "Runs" button to WorkflowPanel toolbar**

In `WorkflowPanel.tsx` or `Toolbar.tsx`:
- Add button that opens RunHistoryPage
- Show run count badge if >0 past runs
- Keyboard shortcut: register in command palette

- [ ] **Step 3: Remove History tab from OutputPanel**

Remove `canInspectHistory`, history tab option, `OutputPanelHistoryContent` rendering.

- [ ] **Step 4: Run tests and fix**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/RunHistoryPage.tsx src/renderer/components/WorkflowPanel.tsx src/renderer/components/OutputPanel.tsx
git commit -m "feat: add RunHistoryPage, remove History tab from output panel"
```

---

## Task 7: Cleanup

**Files:**
- Remove or gut: `src/renderer/components/output/OutputPanelHistoryContent.tsx`
- Remove or gut: `src/renderer/components/output/useOutputPanelSurfaceState.ts` (tab logic)
- Simplify: `src/renderer/components/output/outputPanelTypes.ts` (remove OutputTabValue)
- Update: `src/renderer/components/output/useOutputPanelCommandBindings.ts` (remove tab commands)

- [ ] **Step 1: Remove dead tab-related code**

- OutputPanelHistoryContent.tsx — delete or mark deprecated
- Tab switching in useOutputPanelSurfaceState.ts — remove `activeTab`, `focusStageSurface`, tab nonce logic
- OutputTabValue type — replace with simpler `expandedStepId` state
- Tab-related command bindings (view_result, view_activity, view_log)

- [ ] **Step 2: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove tab-based OutputPanel dead code"
```

---

## Verification Checklist

After all tasks complete, verify against spec §7 Success Criteria:

- [ ] User never sees "Result" or "Start next flow" while run is still executing
- [ ] User can click any completed step and see what it produced
- [ ] User can see all step progress simultaneously during a running flow
- [ ] Fan-out shows compact "4/10" on parent step, not a separate section
- [ ] History is a separate page, not a tab mixed with current run
- [ ] ALL current functionality preserved — nothing lost
- [ ] Lint passes, tests pass, app builds
