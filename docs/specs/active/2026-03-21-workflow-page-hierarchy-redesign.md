# Workflow Page Hierarchy Redesign

**Date:** 2026-03-21
**Status:** Implemented for runtime-shell hierarchy pass (Phases 1-3) plus Phase 4 renderer and explicit diagnostic-summary contract support. Further template adoption is routine maintenance, not an open hierarchy blocker.
**Scope:** List view + output panel + runtime shell. Batch runs are out of scope. Canvas/settings view mode entry points ARE in scope (chrome changes affect them).
**Source:** 6-agent UX audit (Figure-Ground, Hick's Law, Progressive Disclosure, Hierarchy, Dead Weight, Canon §3 Compliance)

---

## Problem Statement

The workflow page is an equal-weight hamburger. Every section has border + background + elevation. There is no dominant visual object in any state. Users see 15-25 clickable elements simultaneously and cannot answer "what do I do next?" without scanning the full page.

Audit numbers:

| State | Bordered containers | Visible actions | Figure-Ground |
|-------|-------------------|----------------|---------------|
| Idle | 8-10 | ~17 | BROKEN |
| Ready | 7-10 | ~21 | BROKEN |
| Blocked | 5-7 | ~17+n | AMBIGUOUS |
| Running | 7-10 | ~15 | AMBIGUOUS |
| Completed | 8-12 | ~25 | BROKEN |

Target (from DESIGN-PHILOSOPHY.md §8, three-tier):

| Metric | Target | Shippable (file follow-up) | Ship-blocker |
|--------|--------|---------------------------|-------------|
| Bordered containers | ≤3 | 4-5 | >5 |
| Clickable elements | ≤5 | 6-8 | >8 |
| Duplicate status signals | 0 | 0 | >0 |
| Nested cards | 0 | 0 | >0 |
| Rendered-but-empty | 0 | 0 | >0 |

---

## Implementation Status

This redesign is **implemented** for the workflow/runtime shell pass:

- Phases 1-3 shipped in the current UI pass
- State-machine consistency, visual-weight reduction, progressive rendering, and blocked/ready/completed shell ownership are in place
- Smoke coverage passes against the updated shell contract

**Deferred follow-up:** No remaining Phase 4 item blocks the hierarchy redesign. Any future expansion is template/runtime maintenance work, not an unresolved workflow-shell redesign dependency.

---

## Design Principles Applied

1. **One Figure Per State** — each state has exactly one primary visual object
2. **≤5 Visible Actions** — excess to menu bar / Cmd+K / right-click
3. **Show Only What Matters Now** — no premature chrome
4. **One Status Signal Per Fact** — no duplicates
5. **No Cards Inside Cards** — flat content inside cards
6. **Contextual Depth, Not Page Chrome** — if an inspect/result state becomes a dead end without depth access, allow local depth navigation inside the owner surface. This may be one low-emphasis advanced link or a compact content-aware tab strip (`Result`, `Activity`, `Step log`, `History`). Never render empty tabs, and never use page-chrome tabs for idle/create states.
7. **One Page Header** — the workflow may have one strong top-level header. Child surfaces below it use flat context strips, not second-level hero headers.

---

## Per-State Redesign

### State 1: IDLE (flow opened, ready to configure and run)

**Figure:** The stage contract — what the first step will do, what input it needs, what result to expect. This is a guided surface, not a flow editor.

**Design intent:** The user arrives to RUN something, not to BUILD something. The idle surface reads like "here's what's about to happen, provide input, press Run." Orchestration (flow outline, graph, settings) stays accessible but hidden behind disclosure. This aligns with R2-CANON "hide structure, show state" and the run-first entry model.

**Current problems:**
- OutputPanel renders with 4 tabs, all empty/disabled
- Graph | Defaults tabs compete as primary peers
- Flow outline dominates as if this were an editor, not a runner
- 8-10 bordered containers

**Changes:**

| Zone | Current | After |
|------|---------|-------|
| Chrome | Flow name + `Flow\|Graph\|Defaults` tabs + Edit toggle | Flow name only. No tabs, no toggles, **no `...` button**. Secondary actions (Edit flow, Graph view, Defaults, Undo/Redo) live in the command palette (Cmd+K) and right-click context menu. |
| Stage contract | Not shown as a unified object | **THE figure.** A compact card showing: first step name in job language, what it does, expected result type, required input labels. This is the stage shell from DESIGN-PHILOSOPHY §7. |
| InputPanel | `surface-panel` (border + bg + elevation) | Flat (Level 0). Textarea sits below the stage contract as the natural input area. |
| ChainBuilder | Each NodeCard: `rounded-xl border ui-elevation-base` | **Hidden by default.** Accessible via Cmd+K → "Edit flow." Steps render as flat rows (Level 0-1) when opened. |
| OutputPanel | Full 4-tab chrome + empty placeholders | **Absent.** Not rendered until first run starts. |

**Resulting layout (top → bottom):**
```
┌─ Chrome: flow name ──────────────────────────────┐
│                                                    │
│  ┌─ Stage Contract (THE figure) ────────────────┐  │
│  │  Step: Explore this project                  │  │
│  │  Result: Codebase map                        │  │
│  │  Approach: Maps file structure, key modules  │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  [textarea — flat, provide input]                  │
│                                                    │
│  (no flow outline, no output panel)                │
│  (secondary actions via Cmd+K or right-click)      │
└────────────────────────────────────────────────────┘
```

**Bordered containers:** 1 (stage contract card).
**Visible actions:** Run (toolbar), Agent toggle = 2. Everything else via Cmd+K or right-click.

**Edit flow access:** Cmd+K → "Edit flow" opens the flow outline inline below (flat rows, Level 0-1). Also accessible via right-click on the page. Closes on re-click or when the user presses Run.

**Action discoverability (desktop app):** No `...` overflow buttons on any section. Secondary actions are distributed across three native desktop tiers:

1. **Menu bar** (Electron native, always visible) — File: Save, Export. Edit: Undo, Redo. View: Graph view, Flow defaults, Toggle editor. Flow: Run, Run again, Cancel, History. This is the standard desktop location for actions that don't need to be buttons. Users expect it.
2. **Cmd+K command palette** — for discovery and power-user speed. All menu bar actions are also in the palette. Palette is the fastest path for users who know what they want.
3. **Right-click context menu** — context-specific actions on elements (steps, results, artifacts). Native Electron context menu, not a web dropdown.

No `...` buttons. No per-section overflow. The menu bar IS the overflow — it's where desktop apps have always put secondary actions. Cmd+K hint (`Cmd+K for actions`) shows in chrome during first 3-5 sessions, then disappears.

---

### State 2: READY (continuation, resume header visible)

**Figure:** Resume Header (ScopeBanner) — the single card telling the user what to do.

**Current problems:**
- Two Run buttons (Toolbar + Resume Header)
- ScopeBanner grid cards (3× bordered sub-cards inside the card)
- StageInputSection as a separate competing card below

**Changes:**

| Zone | Current | After |
|------|---------|-------|
| Chrome | "Step shell" badge replaces tabs | Flow name (read-only). No badge, no tabs. Clean. |
| Toolbar Run | `variant="default"` primary button | **Hidden** when Resume Header is visible. Resume Header owns the CTA. One primary button per state, period. |
| Resume Header | ScopeBanner with 3× `rounded-lg border bg-surface-1/70` grid cards | ScopeBanner keeps outer border. **Grid cards become flat label+value pairs** — no borders, no backgrounds. Just `ui-meta-label` + `text-body-sm` value. |
| StageInputSection | Separate `surface-panel` card below header | **Flat below header (Level 0).** Input area renders as a flat textarea below the Resume Header card, not inside it and not as its own card. Per CLAUDE.md runtime shell constraint — no extra sections inside the header. |
| OutputPanel | Renders with past run data + "Saved run" selector | **No full OutputPanel.** Resume Header shows a compact previous result summary as a flat label+value (typed result label + one-line outcome). This satisfies R2-CANON §3.5: "Show what was just completed." Full result accessible via Cmd+K → "Open previous result" or right-click on the result label (opens in artifact inspector panel, not inline). No expandable sections inside the header — per CLAUDE.md runtime shell constraint. |

**CLAUDE.md runtime shell constraint:** CLAUDE.md specifies "Max visual weight: badges row + title + 3-column status grid + action row." Adding the input area inside the header exceeds this. **Decision:** the input area renders as flat content BELOW the Resume Header, not inside it. It is not a separate card — just a flat textarea on the page ground, visually subordinate to the header. This preserves the compact header contract.

**Resulting layout:**
```
┌─ Chrome: flow name (read-only) ────────────────────┐
│                                                      │
│  ✓ Explore → ● Plan (you are here) → ○ Apply        │
│                                                      │
│  ┌─ Resume Header (THE card) ─────────────────────┐  │
│  │  [badges: Ready · Step label]                  │  │
│  │  Title: "Plan the feature change"              │  │
│  │                                                │  │
│  │  Previous: Codebase map (completed)            │  │
│  │  Attached: codebase-map.md → used by this step │  │
│  │  Status: Ready    Next: Apply changes          │  │
│  │                                                │  │
│  │  ────────────── [▶ Run] ───────────────────    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  [input area — flat, below header, no card]          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Continuation contract compliance (R2-CANON §3.5):**
- "What was just completed" → typed result label + outcome ("Previous: Codebase map — completed")
- "What artifacts are attached" → explicit list of artifacts flowing into this step, with names and source ("Attached: codebase-map.md → used by this step"). User sees what the step will consume, not just what was produced.
- "What happens next" → "Next: Apply changes" + compact spine above
- "Clear primary action" → single Run button in header
- Full previous result: Cmd+K → "Open previous result" or right-click on result label → artifact inspector. No inline expansion.

**Artifact handoff principle:** The user must be able to read the handoff — which artifacts exist, where they live, and whether they flow into the next step — without opening an inspector or any menu. This is flat text inside the Resume Header card, not a separate section.

**Note:** Compact spine is visible above the header for multi-stage flows, answering "What happens after this?" at a glance.

**Bordered containers:** 1 (Resume Header).
**Visible actions:** Run (in header), Cmd+K / right-click = 2.

---

### State 3: BLOCKED (approval / human task)

**Figure:** Task Panel (the approval form / human task fields).

**Current problems:**
- Resume Header button scrolls to task panel (meta-action, not the action)
- 3 action surfaces: Toolbar Run (disabled), Resume Header, Task Panel
- Design-time buttons (Refine, Edit, Attach) visible during approval
- "Review tasks open" banner in Output is generic

**Changes:**

| Zone | Current | After |
|------|---------|-------|
| Chrome | "Step shell" badge | Flow name (read-only). Blocked badge inline. |
| Toolbar Run | Disabled with blocker banner | **Hidden.** Not rendered when blocked. No blocker banner. The blocked state is communicated by the Task Panel itself. |
| Resume Header | Separate card above Task Panel | **Merged.** Resume context (why blocked, which step) becomes a compact header INSIDE the Task Panel card, not a separate card. |
| Task Panel | Separate card: `rounded-lg border bg-surface-2/70` | **THE card.** Approval form + why paused + submit/reject. Everything in one surface. |
| Design-time buttons | Refine, Edit flow, Attach skill visible | **Hidden.** These return after the block is resolved. |
| Output banner | "Review tasks open" generic copy | **Removed.** The Task Panel is self-sufficient. |

**Approval contract checklist (R2-CANON §4):**

The Task Panel must be **self-sufficient** — readable without relying on chrome or surrounding context. All of these as flat content inside the single card:

- [x] **Flow identity** — flow name at the top of the card (panel does not rely on chrome for this)
- [x] **Which step paused** — step name in job language ("Review changes")
- [x] **Why it paused** — specific reason ("2 critical findings need your decision")
- [x] **Top findings inline** — the actual findings that caused the block, not just the count. Show 2-3 one-line summaries directly in the card (e.g., "Missing error handling in upload path", "Public S3 bucket policy"). The gate must be worth stopping for — if the user has to open an inspector to understand why they're blocked, the gate is a speed bump, not a decision surface.
- [x] **Step input** — the actual input/artifacts this step will consume (not just a preview of the previous result — show what the step sees)
- [x] **What happens on Approve** — "Continues to: Apply changes. Expected result: Implementation patch."
- [x] **What happens on Reject** — "Stops the flow. Results saved for later."
- [x] **Decision form** — approval fields, optional edit/narrow capability
- [x] **Two actions only** — Reject (secondary) + Approve & Continue (primary)

**Resulting layout:**
```
┌─ Chrome: flow name · [status] Blocked ────────────────┐
│                                                         │
│  ┌─ Task Panel (THE card) ────────────────────────────┐ │
│  │  Feature delivery flow                             │ │
│  │                                                     │ │
│  │  Step: Review changes                              │ │
│  │  Reason: 2 critical findings need decision         │ │
│  │   · Missing error handling in upload path          │ │
│  │   · Public S3 bucket policy                        │ │
│  │                                                     │ │
│  │  Input: Implementation patch (2,400 lines, 11 files)│ │
│  │  On approve → Apply changes (Implementation patch) │ │
│  │  On reject  → Flow stops, results saved            │ │
│  │                                                     │ │
│  │  [approval form / human task fields]               │ │
│  │                                                     │ │
│  │  ─── [Reject] ────────── [✓ Approve & Continue] ────── │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Bordered containers:** 1 (Task Panel).
**Visible actions:** Approve, Reject, Cmd+K / right-click = 3.

---

### State 4: RUNNING

**Figure:** The streaming activity feed — this is where the user's eyes should be. The step list above is context, not the figure.

**Current problems:**
- 7 hamburger layers
- RunStrip duplicates OutputPanel progress
- Disabled toolbar buttons (Undo/Redo/Save/Actions) take space
- Non-active NodeCards retain full card weight

**Changes:**

| Zone | Current | After |
|------|---------|-------|
| Toolbar | 8 elements (4 disabled) | **Collapse disabled items.** Running toolbar: Cancel + Agent toggle only. Pause inside Cancel as a hold-variant or dropdown. |
| Chrome | Flow name + 3 tabs | Flow name + compact status token (running badge + elapsed time). No tabs. |
| RunStrip | Separate `border-b` bar with progress + View activity button | **Merged into chrome.** Status token in chrome IS the run strip. One bar, not two. |
| ChainBuilder | All cards at full `border ui-elevation-base` weight | **All steps are flat rows** — completed steps get a checkmark, active step gets a highlight (background tint, no border), pending steps are dimmed. No card treatment on any individual step. |
| OutputPanel | Full 4-tab bar. Activity shows live data. | **Activity content as the figure — gets the card treatment.** Subtle surface lift on the streaming area. Use a compact, content-aware local tab strip inside the OutputPanel header: `Activity` appears on run start, `Result` on first output, `Step log` when a step is inspectable. No idle/empty tabs, and no page-chrome tabs. |

**Figure/card alignment:** The activity feed area gets the single card treatment (subtle `bg-surface-1` lift or light border). Steps above are flat context rows. Chrome is a thin status bar. This ensures the streaming content — where the user should be looking — is the clear visual figure.

**Resulting layout:**
```
┌─ Chrome: flow name · [status] Running · 2/5 · 0:42 ─ [Cancel] ─┐
│                                                                   │
│  ✓ Explore project                                               │
│  ✓ Plan changes                                                  │
│  ▸ Apply changes (highlighted row, not a card)                   │
│  ○ Review                                                         │
│  ○ Check                                                          │
│                                                                   │
│  ┌─ Live Activity (THE figure) ──────────────────────────────┐    │
│  │  [streaming output...]                                     │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Bordered containers:** 1 (activity feed area). Steps above are flat rows (Level 0-2). Active step uses Level 2 (background tint only, no border).
**Visible actions:** Cancel, Agent toggle, Cmd+K / right-click = 3.

---

### State 5: COMPLETED / SAVED REVIEW

**Figure:** Completed has two valid archetypes:
- **Decision-first** — verdict card, when a next action dominates (`Continue`, `Retry`, `Run again`)
- **Document-first** — the artifact body itself, when the primary job is reading the result

**Design intent:** Do not force all completed states through a verdict card. If the user is reviewing a report, brief, audit, or saved artifact, the document body is the figure and the header above it must stay thin.

**Current problems:**
- Result prose has LESS visual weight than metadata cards above it (figure-ground inverted)
- 6 flat buttons in Result tab (Continue, Results, Open Report, Copy, Export, New run)
- RunStrip echoes "Completed" + "View result" for already-visible content
- Chain builder occupies space above result
- "Saved run" selector for single run
- Screen reads as a document viewer, not a result dashboard

**Changes:**

| Zone | Current | After |
|------|---------|-------|
| Chrome | Flow name + 3 tabs + RunStrip "Completed" | Flow name + Completed badge. No page-chrome tabs. No RunStrip. |
| Chain builder | Full editable cards in viewport | **Collapsed to compact spine.** One horizontal row: `✓ Explore → ✓ Plan → ✓ Apply → ✓ Review → ✓ Check`. Expandable on click. |
| Result summary card | `rounded-lg border bg-surface-2/60` with badges | Removed as a separate concept. Completed either uses a verdict card (decision-first) or a thin result strip (document-first). |
| Verdict card | Does not exist | **Decision-first only.** One card that answers three questions in three lines. |
| Result prose | `prose-c8c` as dominant content | **Document-first only.** The document body becomes the figure. Context above it is a flat strip, not a hero card. |
| Result buttons | 6× flat row | One primary CTA only when the state is decision-first. Inspect depth lives in a compact local tab strip inside the OutputPanel header (`Result`, `Activity`, `Step log`, `History`) plus context menu / Cmd+K. |
| Saved run selector | Dropdown in OutputPanelHeader | Hidden by default. Only show compact review context or run switching when multiple saved runs exist. |
| History tab | Peer tab in OutputPanel | Allowed as part of the compact local inspect strip when history exists. Never as idle chrome, and never as an always-visible empty tab. |

**Decision-first content hierarchy (mandatory order inside verdict card):**

1. **Outcome Headline** — one sentence, biggest text. "All checks passed. 3 minor issues auto-fixed." This IS the result. If the user reads nothing else, they have the answer.
2. **Evidence Strip** — 3-5 compact key facts on one line. `8.5/10 · 0 critical · 3 warnings · 2m 14s`. Numbers, not prose. Scannable in 1 second.
3. **Primary CTA** — "Continue to Check completion →". The one thing to do next. Inside the card, not below it.
4. **Artifact reference** — one line. `review-findings.md → feeds into Check`. Where the full result lives.

That's it inside the card. Four lines. No paragraphs. No badges that repeat what the headline says.

**Allowed exception:** the owner surface may expose secondary diagnostic depth either as one low-emphasis contextual link such as `View step activity` or as a compact local tab strip when the user is explicitly inspecting a result. This is not page chrome; it is local depth navigation owned by the result surface.

**Below the card (secondary, on the ground):**
- Full report prose — scrollable, no card border, Level 0. The user reads it if the verdict raises a question. Not the default reading.

**Document-first layout (saved reports, completed audits, readable artifacts):**
- Keep the workflow header as the only strong header on the page.
- Below it, render a **flat result strip** with artifact title, time, compact evidence line, and low-emphasis local navigation.
- The **document body** gets the single Level 3 treatment.
- Do not wrap artifact metadata in a second hero card.

**Resulting layout:**
```
┌─ Chrome: flow name · [done] Completed ──────────────┐
│                                                       │
│  ✓ Explore → ✓ Plan → ✓ Apply → ✓ Review → ✓ Check   │
│                                                       │
│  ┌─ Verdict (THE figure) ──────────────────────────┐  │
│  │                                                  │  │
│  │  All checks passed. 3 minor issues auto-fixed.  │  │
│  │                                                  │  │
│  │  8.5/10 · 0 critical · 3 warnings · 2m 14s      │  │
│  │                                                  │  │
│  │  [Continue to Check completion →]                │  │
│  │                                                  │  │
│  │  review-findings.md → feeds into Check           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                       │
│  Review Report                                        │
│  Analyzed 11 files across 3 modules. The              │
│  implementation correctly handles photo upload...     │
│  Finding 1: Missing error boundary in upload          │
│  component. Auto-fixed: wrapped in ErrorBoundary...   │
│  ...                                                  │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Bordered containers:** 1 (verdict card).
**Visible actions:** Continue CTA + local inspect tabs when content exists. Everything else via menu bar / Cmd+K / right-click.

**Anti-patterns this prevents:**
- Document-as-figure: prose is secondary, verdict is primary
- Storage-first header: no "Saved result" / "Saved run" as page lead
- Badge soup: evidence strip is numbers, not pills
- Widget stack: checks and loop state merge into evidence strip, not separate widgets

**Result Actions Contract:**

Primary (visible):
- **Continue to [next step] →** — when a next stage exists

Secondary (menu bar + Cmd+K + right-click on result):
- **Copy as report** (Edit menu + right-click) — copies result with meta-header (flow name, step, date, model). Not raw text. This is a typed export, not clipboard dump.
- **Run again** (Flow menu + Cmd+K) — starts a new run with the previous input pre-filled. User can edit before submitting. Not a blank "New run."
- **Export as file** (File menu) — saves to disk
- **Open report** (right-click on result) — opens the .md artifact in default editor
- **View run history** (Flow menu + Cmd+K) — opens history panel

The distinction between "Copy as report" (with meta-header) and "Run again" (with prefilled input) is a ship-blocker per R2 surrounding scenarios. Generic "Copy" and "New run" are insufficient.

---

### State 6: FAILED / ERROR

**Figure:** Verdict card — what failed, why, what to do about it.

Same structure as Completed: verdict card is the figure, everything else is ground. The card is danger-toned.

**Content Hierarchy (mandatory order inside verdict card):**

1. **Outcome Headline** — "Context window exceeded. Apply changes couldn't finish in one pass."
2. **Evidence Strip** — `Step 3/5 · 12/12 turns used · 7 of 11 files written`
3. **Primary CTA** — "Retry from this step →". Secondary: "Edit flow" as text link.
4. **What's preserved** — "Previous steps intact. Fresh context on retry."

**Layout:**
```
┌─ Chrome: flow name · [status] Failed ───────────────┐
│                                                       │
│  ✓ Explore → ✓ Plan → ✗ Apply (failed) → ○ Review    │
│                                                       │
│  ┌─ Verdict (THE figure, danger tone) ─────────────┐  │
│  │                                                  │  │
│  │  Context window exceeded.                        │  │
│  │  Apply changes couldn't finish in one pass.      │  │
│  │                                                  │  │
│  │  Step 3/5 · 12/12 turns · 7 of 11 files written │  │
│  │                                                  │  │
│  │  [Retry from this step →]   Edit flow ↗          │  │
│  │                                                  │  │
│  │  Previous steps intact. Fresh context on retry.  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                       │
│  [partial output if any — flat text, secondary]       │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Bordered containers:** 1 (verdict card).
**Visible actions:** Retry CTA + Edit flow link = 2.

---

### State 7: CANCELLED

Treated as a variant of Completed. Chrome badge shows `Cancelled` (neutral). The result area shows partial results if any were produced, or a brief "Run cancelled at step N" message. Primary action: "Run again" (prefilled previous input) or "Retry from [step]."

**Bordered containers:** 1.
**Visible actions:** ≤3.

---

### State 8: PAUSED

Treated as a variant of Running. Same layout: activity feed is the figure (Level 3 card), steps are flat rows, active step uses Level 2 tint. Chrome shows `Paused` badge (info tone). Primary action changes from Cancel to **Resume**.

**Layout:**
```
┌─ Chrome: flow name · [status] Paused · 2/5 · 0:42 ── [Resume] ─┐
│                                                                   │
│  (same as Running layout — activity feed is the figure)           │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Bordered containers:** 1 (activity feed area).
**Visible actions:** Resume, Cancel (secondary), Cmd+K / right-click = 3.

---

### Transient states: STARTING, CANCELLING

These are brief transitions (<2s typically). They render identically to RUNNING but with different chrome badge text: "Starting..." or "Cancelling...". No distinct layout needed.

---

## Cross-State Changes

### Chrome Simplification

| Current | After |
|---------|-------|
| `Flow \| Graph \| Defaults` tabs (3 primary peers) | Flow name only. No tabs, no toggles, **no `...` button**. Graph view, Defaults, Edit flow accessible via Cmd+K and right-click context menu. `"settings"` view mode reached via Cmd+K → "Flow defaults." |
| "Step shell" badge in resume/blocked | Removed. Chrome shows flow name + optional status badge (Ready/Blocked/Running/etc). |
| Editable flow name in idle | Keep — inline in the header, but it does not compete with the stage contract figure. |
| Edit flow / View flow toggle | Remove from primary chrome. Idle exposes **Edit flow** only through Cmd+K or right-click. |

### Toolbar Simplification

| State | Current Toolbar | After |
|-------|----------------|-------|
| Idle | Undo, Redo, Save, Actions, Agent, Validation, Run, Run mode | **Run, Agent** only. Undo/Redo/Save/Export → menu bar (File, Edit). Graph/Defaults → menu bar (View). |
| Ready | Same + Resume Header has its own Run | **Resume Header owns CTA.** Toolbar: Agent only. Run hidden. |
| Blocked | Same (Run disabled + blocker banner) | **Agent only.** No Run, no blocker banner. |
| Running | Pause, Stop, disabled Undo/Redo/Save/Actions, Agent | **Cancel, Agent** only. |
| Completed | Full toolbar restored | **Agent only.** Run again → menu bar (Flow). Save/Export → menu bar (File). |

### OutputPanel Lifecycle

| State | Current | After |
|-------|---------|-------|
| Idle (no runs) | 4-tab bar + empty placeholders | **Not rendered.** |
| Running | 4-tab bar, Activity active | **Activity content first.** Compact local tab strip appears only for tabs with real content: `Activity` on run start, `Result` on first output, `Step log` when a step is inspectable. |
| Completed | 4-tab bar, Result active, History enabled | **Result content dominant.** Keep a compact local tab strip for `Result`, `Activity`, `Step log`, `History` when those sections exist. No page-chrome tabs. |
| Review (past run) | Full 4-tab bar + Saved run selector | **Result content + compact local inspect tabs.** Show saved-run context in the header; allow switching depth through the same local tab strip. |

---

## Component Impact Map

| Component | Change Type | Effort |
|-----------|------------|--------|
| `WorkflowPanelChrome.tsx` | Remove tab switcher entirely. Graph/Defaults/Edit flow accessible via menu bar (View) and Cmd+K. Merge RunStrip into chrome status token. | Medium |
| `WorkflowPanelTabContents.tsx` | Conditional OutputPanel rendering. Chain builder → flat rows (Level 0-1), compact spine after completion. | Medium |
| `WorkflowPanelInlineSections.tsx` | Flatten ScopeBanner grid cards → label+value. Keep StageInput below header (flat, not absorbed). Merge Resume context into Task Panel for blocked. Self-sufficient Task Panel (flow name, step input, approve/reject consequences). | Large |
| `OutputPanelHeader.tsx` | Replace always-visible tabs with a compact content-aware local tab strip. Activity on run start, Result on first output, Step log when inspectable, History when runs exist. Keep readiness pulse and saved-run context. | Medium |
| `OutputPanel.tsx` | Not rendered until first run. Activity feed gets Level 3 card treatment during running (the figure). | Medium |
| `Toolbar.tsx` / `WorkflowRunControls.tsx` | State-dependent collapse. Idle: Run + Agent. Ready: Agent only (Run hidden). Running: Cancel + Agent. Undo/Redo via menu bar (Edit) in all states. | Medium |
| `WorkflowPanel.tsx` | Orchestrate new visibility rules per state. Toolbar Run hidden when Resume Header visible. | Large |
| `RunStrip.tsx` | Remove as separate component. Status merges into chrome bar. | Small |
| `InputPanel.tsx` | Strip `surface-panel` → flat (Level 0). Ring-on-focus only. | Small |
| `ChainBuilder` / node cards | All steps flat rows (Level 0-1). Active step in running: Level 2 tint only (no border). No card treatment on any individual step. | Medium |
| `ResultTab.tsx` | Split completed into `decision-first` vs `document-first`. Collapse 6 buttons to 1 CTA in decision mode; use a thin local strip + document body in document mode. Other actions via menu bar (File → Export, Flow → Run again) and right-click. | Medium |

---

## Output Shell Scope Contract

The output area below the FLOW step list is scoped by user selection. A **scope strip** between the step list and the tabs tells the user exactly what they're looking at.

### Scope strip content

| Selection | Scope strip |
|---|---|
| Nothing (run level) | `Run: CTO Optimise Audit · 2/7 done` |
| Regular step | `Viewing: System Mapper · Completed` |
| Fan-out parent | `Viewing: Fan out · 3/6 branches · Current stage` |
| Fan-out branch | `Viewing: Security audit · Branch of Fan out · Completed` |
| Result tab active | `Result from: CTO Optimisation Report · Final output` |

### Tab ownership

| Tab | Scope | What it shows | NOT its job |
|---|---|---|---|
| **Summary** | Run-level or focused step | Run progress, focus stage, result readiness, fan-out breakdown, attention block | Step list, per-step navigation |
| **Result** | Run-level (final) or per-step | Verdict card + artifact document. Always shows provenance: `Result from: [step]` | Step progression |
| **Step log** | Per-step or per-branch | Full execution log, tool calls, streaming output | Step list, run-level progress |
| **History** | Run-level (not scoped to selection) | Past runs list | Current run state |

### Tab preservation on scope change

When the user clicks a different step/branch, the current tab is PRESERVED unless it becomes invalid for the new scope:

| Current tab | New scope has content? | Behavior |
|---|---|---|
| Summary | Always valid | Stay on Summary |
| Result | New scope has a result | Stay on Result |
| Result | New scope has NO result | Fall back to Summary |
| Step log | New scope is a step/branch | Stay on Step log |
| Step log | New scope is run-level (no step) | Fall back to Summary |
| History | Always valid (run-level) | Stay on History |

Never auto-switch tab just because selection changed. Predictable UI.

### Fan-out in step list

Fan-out steps expand inline to show branches as sub-items:

```
▸ Fan out                    3/6 branches done    [▾]
  ├─ ✓ Security audit        2.1kt · $0.03
  ├─ ✓ Code quality          1.8kt · $0.02
  ├─ ▸ IPC integrity         running...
  ├─ ○ Build hygiene         queued
  ├─ ○ Performance           queued
  └─ ○ Architecture          queued
```

**Clicking a branch:** scope strip updates, tabs re-scope to that branch, current tab preserved.
**Clicking the parent "Fan out":** scope strip shows aggregate, Summary shows branch counts + per-branch one-line status.
**Clicking away from fan-out:** branches collapse, scope returns to regular step view.

### Tab order and defaults

Order: `Summary → Result → Step log → History` (Summary always first)

| Run state | Default active tab |
|---|---|
| Running / paused | Summary |
| Blocked | Summary |
| Completed (with result) | Result |
| Idle (no runs yet) | Summary |

---

## Migration Strategy

### Phase 1: Strip Visual Weight (implemented)
- Remove `surface-panel` from InputPanel → flat Level 0
- Remove borders from ScopeBanner grid cards → flat label+value pairs
- Remove `surface-soft` from empty state placeholders → plain text Level 0
- All ChainBuilder step items → flat rows (Level 0-1 hairline separators). Active step in running → Level 2 tint only.
- Collapse Result tab 6 buttons → 1 CTA (other actions via menu bar + right-click)

### Phase 2: Progressive Rendering (implemented)
- OutputPanel absent until first run starts
- Tabs appear individually: Activity on run start, Result on first output, History on first completed run
- Chain builder collapses to compact spine row after run completion
- Graph/Defaults/Edit flow → menu bar (View) + Cmd+K
- Undo/Redo → menu bar (Edit) + Cmd+Z/Cmd+Shift+Z

### Phase 3: Structural Merges (implemented)
- StageInput stays below Resume Header (flat, not inside the header card)
- Resume context merged into Task Panel for blocked state (self-sufficient: flow name, step input, consequences)
- RunStrip → status token in chrome bar (removed as separate component)
- Toolbar state-dependent collapse (Run hidden when Resume Header visible)
- Activity feed → Level 3 card treatment during running (the figure)

### Phase 4: Verdict Variants + Cross-Flow (implemented)

**Shipped in renderer/runtime:**
- Verdict surface now supports 3 practical variants: outcome, diagnostic, document (see SCREEN-COMPOSITION-GUIDE.md §3.4)
- Tone mapping reflects findings severity and structured evaluator outcomes, not raw execution success (§3.5)
- Evidence Panel renders as flat content when structured evaluator metadata is available (`criteriaBreakdown`, threshold, score delta) (§3.6)
- Cross-flow CTA is owned by the result surface and opens the existing "Use in new flow" path from the verdict card/context menu (§3.7)
- Lightweight/urgent path is now routed explicitly and can auto-run eligible lightweight starts instead of forcing the full preview path (§3.8)
- Non-evaluator diagnostic and audit flows can now emit explicit `diagnostic_summary` frontmatter (`headline`, `tone`, `severity_counts`, `top_findings`, optional root cause/next action), and the runner strips it from the visible markdown while preserving it in output metadata
- Result surfaces now render generalized evidence panels from that structured diagnostic summary, not only from evaluator-loop metadata

**Follow-on maintenance only:**
- adopt the same explicit `diagnostic_summary` contract in any additional built-in or plugin templates that produce diagnostic-style reports
- extend the contract further only if a future product surface needs more structured evidence than the current verdict/evidence strip can render

---

## Clarifications

**Textarea borders:** Input fields retain standard `ring-on-focus` treatment (browser convention for editable fields). Focus rings do not count toward the bordered container budget — the rule targets card-weight containers (border + background + elevation), not input affordances.

**Compact spine expansion (Completed state):** Clicking the compact spine expands it as an inline disclosure below the spine row, pushing result content down. Expanded spine shows step cards in a compact read-only list (no edit affordances). The result prose remains the Figure — expanded spine is secondary (no card treatment, just a list). Collapsing returns to the one-row spine.

**Status icons in chrome:** Layouts in this spec use emoji as representational shorthand. Shipped code uses Lucide icons: `CheckCircle` (success), `XCircle` (error), `Pause` (paused), `Loader2` (running), `AlertTriangle` (blocked). Never literal emoji in shipped UI.

**Component paths:** `WorkflowPanelChrome` is currently defined inside `src/renderer/components/workflow-panel/WorkflowPanelChrome.tsx` as a separate file. `WorkflowPanelInlineSections` is similarly at `src/renderer/components/workflow-panel/WorkflowPanelInlineSections.tsx`.

**DESIGN-PHILOSOPHY.md §10 vocabulary:** The vocabulary list in §10 predates R2-CANON. When they conflict, R2-CANON §1 wins. This spec uses Canon vocabulary throughout.

**Outcome Headline progressive collapse:** Per DESIGN_SYSTEM.md, the Outcome Headline shows a full sentence on first encounter with a flow/step, then collapses to a compact one-liner or verdict badge on subsequent visits. Day-30 power users should not re-read paragraphs they already understand. Implementation: track `hasRunBefore` per flow template; when true, render headline as a single-line badge (e.g., "All checks passed · 8.5/10") instead of a full sentence.

**Blocked approval: findings inline.** The "why it paused" reason must include the actual top findings, not just a count. Show 2-3 one-line finding summaries directly in the Task Panel card. The gate should be a decision surface, not a speed bump. If findings are too long, show first 2-3 with "and N more" disclosure.

**No overflow buttons on the page.** Zero `...` buttons. c8c is a desktop app — secondary actions use the three native tiers: (1) menu bar (File/Edit/View/Flow), (2) Cmd+K command palette, (3) right-click context menus. The menu bar is always visible in the OS chrome and handles Save, Undo, Export, View switches. Cmd+K is for power-user speed. Right-click is for context-specific actions on elements.

---

## Compliance Checklist

Current implementation status:

- [x] **Idle:** 1 dominant stage figure, ≤5 actions, no OutputPanel before first run
- [x] **Ready:** 1 dominant continuation figure, toolbar Run hidden, previous result / handoff context visible without opening a secondary panel
- [x] **Blocked:** 1 bordered container (Task Panel), ≤3 actions, no design-time buttons, approval contract checklist complete
- [x] **Running:** 1 bordered container (activity feed), ≤3 actions, steps are flat rows, no disabled toolbar items
- [x] **Completed / Saved review:** 1 dominant figure (verdict card in decision-first or document body in document-first), low-emphasis local navigation only, chain builder collapsed
- [x] **Failed:** 1 dominant verdict surface, ≤2 visible actions, evidence/preserved-context visible
- [x] **Cancelled:** 1 dominant terminal surface, ≤3 actions, partial results visible if any
- [x] **Paused:** 1 bordered container (activity feed), ≤3 actions, Resume is primary CTA
- [x] **All states:** 0 nested cards, 0 duplicate status signals, 0 rendered-but-empty sections in the shipped runtime shell pass
