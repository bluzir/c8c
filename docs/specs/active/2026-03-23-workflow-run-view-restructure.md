# Workflow Run View Restructure

**Date:** 2026-03-23
**Status:** Active
**Scope:** Restructure OutputPanel from tab-based multiplexer to step-centric run view
**Source:** User feedback — "Result" shows after step 1, History broken, step log confused with run log

---

## 1. Problem

The current OutputPanel multiplexes four unrelated concerns into one tab bar:

```
[Summary] [Result] [Step log] [History]
```

This creates confusion:

1. **"Result" appears after step 1 completes**, even though the run has 4 more steps. User sees "Start next flow" and thinks the run is done.
2. **"Step log" shows one step's log**, but which step depends on ProcessSpine selection — no explicit connection.
3. **"History" is a tab inside the current run**, mixing past run browsing with current run monitoring.
4. **No way to see step-level results** — user can't click step 2 and see what it produced.
5. **Fan-out branches** take over the entire surface instead of being compact progress on their parent step.

The UI pretends a run has one result + one log. A run actually has N steps, each with its own result and log.

---

## 2. Design

### 2.1 Navigation Model

```
Workflow page
 │
 ├── [Running / Idle / Blocked] ─── Steps Progress View (primary surface)
 │    │
 │    ├── Step 1: "Map codebase" ── done ✓
 │    │    └── [click to expand: result + log inline]
 │    │
 │    ├── Step 2: "Plan changes" ── done ✓
 │    │    └── [click to expand]
 │    │
 │    ├── Step 3: "Implement" ── running...
 │    │    ├── live log visible (auto-expanded)
 │    │    └── fan-out: 4/10
 │    │
 │    ├── Step 4: "Review" ── pending
 │    └── Step 5: "Ship" ── pending
 │
 ├── [Completed ONLY] ─── Final Result
 │    └── verdict card + continuation CTA + "Start next flow"
 │
 └── [Toolbar: "Runs" button] ─── History Page (separate)
      ├── Run 1 — completed, 2d ago  [click → open]
      ├── Run 2 — failed, 1d ago     [click → open]
      └── Run 3 — current            [click → open]
```

### 2.2 Steps Progress View

The **primary surface** during a run. Replaces Summary + Step log tabs.

Each step row shows:
- Icon (type-specific: skill ⚡, evaluator 📊, splitter 🔀, approval 🤚, etc.)
- Name (job language, not node type)
- Status: `pending` | `running` | `done` | `failed` | `blocked`
- Duration (when done): "4m 54s"
- Fan-out compact: "4/10 branches" (not expanded inline)

**Click on a step** → inline accordion expands below the row:
- **Done step:** result content (markdown/text) + cost + "View full log" disclosure
- **Running step:** live streaming log (auto-expanded, auto-scrolled)
- **Failed step:** error message + last log lines + "View full log" disclosure
- **Blocked step:** what it's waiting for (approval prompt, input needed)
- **Pending step:** nothing (row is dimmed, not clickable)

**Only one step expanded at a time.** Clicking another step collapses the previous one. Running step is auto-expanded by default.

### 2.3 Final Result

Appears **ONLY when run status = completed**. Not a tab — a section that materializes below the steps list.

Contains:
- Verdict card (headline + evidence strip + primary CTA)
- Continuation CTA: "Continue to [next flow]" (from `recommendedNext`)
- "Use in new flow" secondary action
- Artifact persistence status

**Never visible during running, blocked, or failed states.**

"Start next flow" / "Continue to X" — **only here, never on intermediate steps.**

### 2.4 Fan-Out Display

When a step is a splitter with parallel branches:
- **Collapsed (default):** step row shows "Fan out · 4/14 active"
- **Expanded (click):** shows branch list inside the accordion, each branch as a sub-row with status

No separate fan-out section at the bottom of the page.

### 2.5 History — Separate Page

History is **not a tab**. It's a separate page accessible via:
- "Runs" button in toolbar (already exists in sidebar nav)
- Cmd+K → "Run history"

**History page shows:**
- List of past runs for this workflow
- Each row: status badge, date, duration, cost, step count
- Click → opens run in the same Steps Progress View, read-only
- "Back to current" button to return

**History page replaces the current "History" tab entirely.**

### 2.6 What Happens to Current Tabs

| Current | New location | Notes |
|---|---|---|
| **Summary tab** | Steps Progress View | Steps list IS the summary |
| **Result tab** | Final Result section (below steps, completion only) | No longer a tab |
| **Step log tab** | Inline accordion on step click | Per-step, not global |
| **History tab** | Separate "Runs" page | Not a tab inside run |

---

## 3. State Rules

### 3.1 What's visible per run state

| Run state | Steps list | Step accordion | Final Result | History access |
|---|---|---|---|---|
| **Idle** (not started) | Stage contract (existing) | — | — | Toolbar button |
| **Running** | All steps with live status | Running step auto-expanded | **Hidden** | Toolbar button |
| **Blocked** | All steps, blocked step highlighted | Blocked step auto-expanded | **Hidden** | Toolbar button |
| **Completed** | All steps with ✓/✗ | Click to expand any | **Visible** (verdict + CTA) | Toolbar button |
| **Failed** | All steps, failed step highlighted | Failed step auto-expanded | **Hidden** (error shown in step) | Toolbar button |
| **Review** (past run) | All steps (read-only) | Click to expand any | Visible if was completed | "Back to current" button |

### 3.2 Key rules

1. **"Result" never appears during running.** Period. Step outputs are accessible per-step.
2. **"Start next flow" / continuation CTA only on Final Result.** Never on intermediate step completions.
3. **One expanded step at a time.** Running step gets priority.
4. **Fan-out = compact progress on parent step.** Not a separate section.
5. **History = separate page.** Not a tab coexisting with current run.

---

## 4. Data Preservation

Everything currently shown must remain accessible in the new structure:

| Current feature | Where it lives now | Where it lives after |
|---|---|---|
| Live streaming output | Step log tab | Running step accordion (auto-expanded) |
| Branch previews | ActivityTab branch section | Fan-out step accordion (branch sub-rows) |
| Verdict cards | Result tab | Final Result section (completion only) |
| Evidence strip | Result tab | Final Result section |
| Continuation CTAs | Result tab | Final Result section |
| Scope labels | OutputPanelHeader | Step row context (which step selected) |
| Run cost/duration | ActivityTab summary rows | Step rows (per-step) + Final Result (total) |
| Saved run review | History tab → review mode | History page → open run → read-only view |
| Process spine | Top of OutputPanel | Steps list IS the spine (replaces ProcessSpine) |
| Blocked task panel | Separate surface | Blocked step accordion |
| Error display | Activity/Result tabs | Failed step accordion |
| "Run again" button | Result tab actions | Final Result section actions |
| "View summary" link | Result tab | Not needed — steps list IS the summary |
| Quality loop info | Result tab disclosure | Final Result section disclosure |
| Artifact save status | Result tab | Final Result section |

---

## 5. Implementation Approach

### Phase 1: Steps Progress View
- Replace ProcessSpine + ActivityTab with unified steps list
- Each step = collapsible row with status, click to expand
- Running step shows live log inline
- Remove Summary tab

### Phase 2: Final Result Section
- Move Result tab content to a section below steps list
- Only render when `runStatus === "completed"`
- Move all continuation CTAs here
- Remove Result tab

### Phase 3: Step Log Inline
- Move Step log tab content into step accordion
- "View full log" disclosure inside expanded step
- Remove Step log tab

### Phase 4: History Page
- Create separate Runs page (reuse HistoryTab data)
- Click on run → opens in steps view (read-only)
- Remove History tab
- Add "Runs" button to toolbar

### Phase 5: Cleanup
- Remove OutputPanelHeader tab bar
- Remove tab state management
- Remove Summary/Result/StepLog/History tab switching logic

---

## 6. Non-Goals

- Redesigning the input panel or stage contract
- Changing how workflows are created or started
- Multi-run dashboard changes
- Batch panel changes
- Factory page changes

---

## 7. Success Criteria

1. User never sees "Result" or "Start next flow" while run is still executing
2. User can click any completed step and see what it produced
3. User can see all step progress simultaneously during a running flow
4. Fan-out shows compact "4/10" on parent step, not a separate section
5. History is a separate page, not a tab mixed with current run
6. ALL current functionality preserved — nothing lost, only reorganized
