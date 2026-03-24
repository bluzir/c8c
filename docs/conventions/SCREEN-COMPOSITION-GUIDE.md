# Screen Composition Guide

> **Core principle absorbed into [CANON.md](./CANON.md) §10.** This file contains the full composition methodology (verdict patterns, field routing, common screen types). CANON is authoritative for the one-question-per-screen rule and composition stack.

How to go from "what the user needs" to "what the screen shows." The bridge between JTBD (what questions to answer) and DESIGN_SYSTEM.md (what tokens to use).

**Source principles:** Apple HIG philosophy (Jobs-era: one task per screen, hide structure, show state, progressive disclosure, defaults over configuration), adapted for an agent/workflow desktop product where inspectability, trust, and evidence matter as much as simplicity.

---

## The One Rule

> Show only what the user needs for a confident next step.

Not "show everything the system knows." Not "show nothing and be magical." Show exactly enough for the user to understand what happened, trust it, and act.

---

## 1. Every Screen Answers One Question

Before laying out a screen, write down the single question it answers. If you can't pick one, the screen is doing too much.

| State | The One Question |
|-------|-----------------|
| Idle | What will happen when I press Run? |
| Ready / Continuation | What happened before, and am I ready to continue? |
| Blocked / Approval | What decision does the system need from me? |
| Running | What is happening right now? |
| Completed | What was the result, and what do I do next? |
| Failed | What went wrong, and how do I recover? |
| Empty | How do I start? |

If a screen tries to answer "what happened" AND "what is my full run history" AND "what are my artifacts" AND "how do I configure this flow" — it's answering four questions. Strip it to one. The rest goes to secondary surfaces (menu bar, Cmd+K, right-click, inspector panels).

---

## 2. The Composition Stack

Every screen is composed of exactly these layers, in this order. Skip layers that don't apply, but never reorder them.

```
┌─ 1. CHROME (identity + status) ─────────────────────┐
│    Flow name · status badge · elapsed time           │
│    Thinnest possible. One line. Not a section.       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  2. CONTEXT (where am I in the larger process)       │
│     Compact spine or breadcrumb. Optional.           │
│     Flat text, Level 0-1. Not a card.                │
│                                                      │
│  ┌─ 3. VERDICT (the answer to The One Question) ──┐  │
│  │   Headline: one sentence, biggest text           │  │
│  │   Evidence strip: 3-5 facts, one line            │  │
│  │   Primary CTA: the one thing to do next          │  │
│  │   Reference: where full output lives             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                      │
│  3b. EVIDENCE PANEL (optional, multi-axis only)      │
│     Category breakdown, flat Level 0-1. Not a card.  │
│     Visible without scrolling. Only when strip       │
│     can't carry the dimensional answer.              │
│                                                      │
│  4. INPUT (when the user needs to provide something) │
│     Flat textarea or form. Level 0. Not a card.      │
│                                                      │
│  5. DEPTH (full artifact, log, details — on demand)  │
│     Secondary. Scrollable. No card treatment.         │
│     The user comes here IF the verdict raises a       │
│     question, not by default.                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**The Verdict is the figure.** It gets the single Level 3 card treatment. Everything else is ground (Level 0-2).

**Chrome is not a section.** It's the window frame. Flow name, status badge, elapsed time — inline in the title bar or a single thin strip. Never a bordered container.

**Context is optional.** The compact spine (step progression) appears only for multi-step flows. It's flat — no card, no border.

**Depth is earned, not default.** The full markdown report, the execution log, the artifact list — these appear below the verdict and are scrollable. The user reaches them by scrolling past the verdict, not by tab-switching or clicking through.

### 2.1 Subtraction Is Phase One. Composition Repair Is Phase Two.

The false binary to avoid:

1. a page made of equal-weight cards
2. a page flattened so aggressively that nothing feels related

The correct middle state is:

1. one owner surface
2. connective tissue on the ground

Use these patterns before adding another card:

| Pattern | Level | Role | Example |
|--------|-------|------|---------|
| **Context strip** | 0-1 | Binds local title, status, scope, and low-emphasis links | `Saved run · UX/UI Polish Audit · cancelled` |
| **Slab / lane** | 1-2 | Makes a set of sibling rows read as one region | provider group, track lane, inbox bucket |
| **Chapter shell** | 2 | Binds a heading to a long administrative body without promoting it to the figure | `Access & Providers`, `Run behavior`, `App controls` |
| **Inset well** | 2 | Creates one local focal point inside the owner surface | `Next action`, `API key override`, `Current branch` |
| **Selected-row tint** | 2 | Marks the current item without creating a second figure | selected track, selected artifact, active provider |

Rule of thumb:

- If the page feels noisy, remove weight.
- If the page feels disconnected, add connective tissue.
- If the page still has no obvious owner, create or strengthen the single figure.

### 2.2 Example Repairs

**Run summary**

```
Chrome
flat scope strip
┌─ Summary owner surface ─────────────────────────────┐
│ Selected step summary                              │
│ ────────────────────────────────────────────────── │
│ Run progress                                       │
│ Result ready / not ready                           │
│ Fan-out breakdown                                  │
│ [one optional status-toned inset well]             │
└────────────────────────────────────────────────────┘
```

Not this:

- three mini-cards for progress/result/fan-out
- or three unrelated text rows with no owner

**Settings**

```
Page header
┌─ Provider status figure ───────────────────────────┐
│ Current readiness + single setup action            │
└────────────────────────────────────────────────────┘
┌─ Access & Providers chapter shell ─────────────────┐
│ provider defaults                                  │
│ provider rows with dividers                        │
│ MCP groups                                         │
│ [one inset well for CODEX_API_KEY override]        │
└────────────────────────────────────────────────────┘
┌─ Run behavior chapter shell ───────────────────────┐
│ run defaults                                       │
│ research configuration                             │
└────────────────────────────────────────────────────┘
┌─ App controls chapter shell ───────────────────────┐
│ privacy                                            │
│ lab                                                │
│ updates                                            │
└────────────────────────────────────────────────────┘
```

Not this:

- five equal settings cards
- or a fully flat spreadsheet with no dominant status owner
- or a long stack of peer section headings where body content hangs underneath with no chapter owner

**Lab**

```
Page header
overview rail
selected outcome strip
┌─ Owner surface for current state ──────────────────┐
│ selected case detail OR next actions OR empty path │
└────────────────────────────────────────────────────┘
track lanes / ready lists / inbox rows on the ground
```

Not this:

- every track, queue item, and metric as its own card
- or every section flattened to dashed empty boxes and loose rows

### 2.3 Compound Admin Pages

Some pages are not runtime verdict surfaces. They answer several durable administrative questions in one scroll:

- setup and access
- execution defaults
- app-level controls and privacy

For these pages, the composition stack gains one constrained secondary layer:

1. one dominant figure if the page has a health/readiness owner
2. `2-4` chapter shells below it
3. flat content and local slabs/wells inside each chapter shell

The chapter shell is intentionally narrow:

- stronger than a slab
- weaker than a figure
- border + faint fill
- no elevation
- no nested chapter shells

Use it when a section heading truly owns a long form, list, or interaction cluster and would otherwise float above disconnected content.

Use `Settings` as the reference case:

1. `Provider status` is the figure.
2. `Access & Providers` binds provider controls and MCP setup.
3. `Run behavior` binds defaults and research settings.
4. `App controls` binds privacy, lab, and update settings.

If the page feels disconnected after flattening, ask:

1. is there one figure?
2. do the long secondary regions have chapter ownership?
3. are the internals flat enough to avoid nested-card regression?

---

## 3. Verdict Card Rules

The verdict card is the most important component in the product. It is the single object that answers The One Question. These rules are non-negotiable:

### 3.1 Four elements, four lines

A verdict card contains at most four elements:

1. **Headline** — one sentence. The answer. "All checks passed." / "Context window exceeded." / "2 critical findings need your decision." / "Explore this project — maps file structure and key modules."
2. **Evidence strip** — 3-5 compact facts on one line. Numbers, not prose. `8.5/10 · 0 critical · 3 warnings · 2m 14s`. Scannable in 1 second.
3. **Primary CTA** — one button. The next action. "Run" / "Continue to Check completion →" / "Approve & Continue" / "Retry from this step →". Inside the card.
4. **Reference line** — where the full output lives. `review-findings.md → feeds into Check`. One line.

No paragraphs. No badges that repeat what the headline says. No nested cards. No disclosure sections inside the card.

### 3.2 The headline is not a title

The headline is not the name of the step or the flow. It's the **answer**. Compare:

| Bad (title) | Good (answer) |
|-------------|---------------|
| Review findings | All checks passed. 3 minor issues auto-fixed. |
| Apply changes | Context window exceeded after 12 turns. |
| Review changes | 2 critical findings need your decision. |
| Explore this project | Maps file structure, identifies key modules. |

The Object Header (flow name, step name) lives in Chrome or Context, not in the verdict card.

### 3.3 Progressive collapse

First time a user sees a verdict for a given flow template: full headline sentence.
After they've run this flow before: collapse to compact badge. `Passed · 8.5/10` instead of "All checks passed. 3 minor issues found and auto-fixed. Ready to ship."

Day-1 user gets explanation. Day-30 user gets signal.

### 3.4 Verdict variants

Not all results are pass/fail. Three verdict card variants, same structure (headline + evidence + CTA + reference), different content emphasis:

**Outcome verdict** (feature build, content generation):
Headline = what happened. "All checks passed. 3 minor issues auto-fixed."
Evidence = quality metrics. `8.5/10 · 0 critical · 3 warnings · 2m 14s`
CTA = continue forward. "Continue to Check completion →"

**Diagnostic verdict** (bug investigation, audit):
Headline = what was found. "SSR race condition in login component causes Safari crash."
Evidence = investigation metadata. `3 files affected · introduced: commit abc123 · risk: high`
CTA = act on findings. "Fix critical findings →" or "Create fix flow →"
Note: the root cause or top findings ARE the headline, not a score.

**Document verdict** (research, decision brief) — R5:
Headline = conclusion. "Recommends Stripe. 3 options compared, high confidence."
Evidence = research metadata. `3 options · 12 sources · 4 risk factors`
CTA = act on recommendation. "Start implementing recommendation →"
Note: the document itself is promoted from depth to a reading surface with navigation. Verdict summarizes; document delivers.

### 3.5 Tone matches findings, not execution

The card tone reflects the **severity of findings**, not whether the flow executed successfully. A bug investigation that succeeds (root cause found) but delivers bad news (deep architectural issue, 2 weeks work) should NOT render as green/success.

| Findings | Card tone | Example |
|----------|-----------|---------|
| All good | Neutral/subtle success | "All checks passed." |
| Minor issues | Neutral | "3 warnings, none critical." |
| Significant findings | Warning | "12 findings, 3 critical. Security needs attention." |
| Severe / blocking | Danger | "SSR race condition. Affects all Safari users." |
| Blocked on decision | Warning | "2 critical findings need your decision." |
| Ready to start | Info/neutral | "Plans the feature based on codebase map." |

The test: if the user reads the headline and the card is green, would they feel misled? If yes, the tone is wrong.

Never celebratory. Never alarming without cause. Calm, legible, accountable.

### 3.6 Evidence Panel (optional, for multi-axis results)

When the evidence strip (3-5 facts) can't carry the dimensional breakdown the user needs, an **Evidence Panel** may render between the verdict card and the depth layer. It is flat content (Level 0-1), NOT a card. Visible without scrolling or clicking only when the breakdown is user-facing evidence rather than operator diagnostics.

When to use: results with multiple categories (audit: 5 categories × severity), results with multiple outputs (content: 12 formats), or diagnostic results with multiple affected areas.

When NOT to use: single-axis results (feature review: one score, one finding count). The strip is enough. Also do not use it as the default home for thresholds, rule inventories, rubric scores, or evaluator-only metadata that mainly explains machine scoring. Those belong in local depth such as disclosure, "Checks", or another secondary inspect surface.

**Data requirement:** The agent must generate a structured summary at the end of the step — not just raw output. The evidence panel renders FROM this structured data, not by parsing the markdown report. If the agent doesn't produce structured metadata, the panel doesn't render and the user falls back to the full report.

Example for audit:
```
Accessibility (14)  ■■■■■  critical: 3, warning: 7, minor: 4
Consistency (11)    ■■■    critical: 1, warning: 5, minor: 5
Interaction (9)     ■■     critical: 1, warning: 3, minor: 5
```

### 3.7 Cross-flow CTA

Some results naturally lead to a NEW flow, not continuation of the current one. The primary CTA creates or opens the next flow, pre-seeded with artifacts from this one.

| Result | Cross-flow CTA | What happens |
|--------|---------------|--------------|
| Audit findings | "Create fix flow →" | Opens a new Feature on Existing flow, pre-seeded with audit findings as input |
| Bug root cause | "Create fix flow →" | Opens a new flow with root cause analysis attached |
| Research recommendation | "Start implementing →" | Opens a new flow seeded with the decision document |

Cross-flow CTAs use the same visual treatment as within-flow CTAs (primary button inside the verdict card). The distinction is invisible to the user — they just see "the next step." The system creates the new flow, attaches relevant artifacts, and navigates.

### 3.8 Lightweight path

Not every job needs the full composition stack. When the user's intent is a small, well-understood change ("fix button spacing", "change error message text"), the system should offer a direct path that skips the stage contract preview.

**Trigger:** The agent router classifies the request as a lightweight change (small scope, low risk, high confidence).

**Behavior:** Skip idle-state stage contract. Go directly to running. The verdict card pattern still applies for the result — but the entry ceremony is shorter.

**Urgent variant:** For production incidents, if the user types input and hits Cmd+Enter before the stage contract renders, the system queues the run immediately. Stage contract shows retroactively in the chrome layer while the step is already running. This preserves inspectability without blocking the start.

---

## 4. Jobs Principles, Adapted

These are the Jobs-era principles translated for an agent/workflow desktop product. Each one has a boundary — where the principle applies and where it doesn't.

### 4.1 One dominant task per screen
**Applies fully.** Every screen has one question and one primary action.
**Boundary:** The screen may show supporting context (spine, evidence), but only one element gets card treatment.

### 4.2 Hide internal structure
**Applies fully.** The graph, the YAML, the node types, the evaluator config — none of this is on the primary surface.
**Boundary:** The user must be able to access structure on demand (Cmd+K → Edit flow, View graph). Hidden ≠ removed.

### 4.3 Ruthlessly remove the unnecessary
**Applies fully.** If a UI element doesn't help answer The One Question for this state, it doesn't render.
**Boundary:** "Unnecessary" means unnecessary *right now*, not unnecessary *ever*. History is unnecessary in the running state but necessary in the idle-with-past-runs state.

### 4.4 One conceptual model
**Applies fully.** The user's model is: "I have a flow. It runs steps. Steps produce results. I approve gates. Results feed forward."
**Boundary:** Internal concepts (factory, case, substrate, runtime nodes, splitter branches) never surface in primary UI. They exist in code, not in the user's head.

### 4.5 Good defaults
**Applies fully.** The system chooses the best first step, pre-fills input, auto-selects the right template.
**Boundary:** For irreversible or expensive decisions (approvals, deletes, reruns), the system pauses and explains. Never auto-act on high-stakes decisions.

### 4.6 Progressive disclosure by layers
**Applies fully.** Layer 1: verdict + action. Layer 2: evidence + context. Layer 3: full artifact + history + configuration.
**Boundary:** Layer 2 evidence must be visible without clicking when it is genuinely user-facing evidence. Keep this to concise outcome facts such as finding count, result status, or duration. Thresholds, rule inventories, rubric scores, and evaluator/operator diagnostics should move to local disclosure or Layer 3.

### 4.7 Inspectability over magic (NOT Jobs, but essential for us)
**Our addition.** Jobs-era Apple hides the "how." For an agent/workflow product, the "how" is part of the value. The user needs to trust that the system did the right thing. This means:
- Evidence strip is always visible (not hidden), but it stays outcome-level rather than dumping operator diagnostics
- Approval gates explain consequences (what happens on approve/reject)
- Failed states explain what broke and what's preserved
- Results show provenance (which step, which model, which input)

The principle: **trust through transparency, not through polish.** The user should feel in control, not impressed.

### 4.8 Details matter (craftsmanship)
**Applies fully.** Spacing, alignment, animation timing, label consistency, keyboard shortcuts — all matter. One misaligned element or inconsistent label accumulates cognitive load over 30 days of daily use.

---

## 5. Screen Composition Process

When designing a new screen or redesigning an existing one, follow these steps:

### Step 1: Write The One Question
What single question does this screen answer? Write it down. If you write two questions, you need two screens (or one screen with a clear primary and a secondary that's hidden by default).

### Step 2: Write the Verdict
Before any layout work, write the one-sentence answer the user should read first. This becomes the headline. If you can't write it in one sentence, the screen's purpose is unclear.

### Step 3: List the Evidence
What 3-5 facts support the verdict? These become the evidence strip. If you have more than 5, check: is this a multi-axis result? If yes, the top-line facts go in the strip and the dimensional breakdown goes in an evidence panel below the card. If no, you're over-detailing or the screen answers multiple questions.

### Step 4: Name the Primary Action
What is the ONE thing the user should do after reading the verdict? This becomes the CTA. If there are two equally important actions, one of them should be demoted to menu bar / Cmd+K / right-click.

Check: does the next action continue THIS flow or create a NEW flow? If cross-flow (audit → create fix flow), the CTA still looks the same to the user — one button. The system handles flow creation and artifact handoff behind the scenes.

### Step 5: Identify the Depth
What full content exists below the verdict? Report? Log? Artifact list? History? This is Layer 5 — scrollable, secondary, no card treatment.

### Step 6: Apply the Composition Stack
Place everything in order: Chrome → Context → Verdict (card) → Input (if needed) → Depth. Check against DESIGN_SYSTEM.md surface weight ladder.

### Step 7: Count and Verify
- Level 3 figures: should be 1
- Supporting bordered slabs across the visible page: ideally 0-2 and never competing with the figure
- Visible actions: should be ≤3
- Duplicate status signals: should be 0
- Elements that don't help answer The One Question: should be 0

---

## 6. Common Screen Types

### Result Screen (outcome verdict)
Question: "What was the result?"
Verdict variant: **outcome**. Headline = what happened. Evidence = quality metrics. CTA = continue forward.
Depth: full markdown report below.
Example: feature review → "All checks passed. 3 minor issues auto-fixed."

### Diagnostic Screen (diagnostic verdict)
Question: "What did we find?"
Verdict variant: **diagnostic**. Headline = root cause or top findings. Evidence = investigation metadata. CTA = act on findings (may be cross-flow: "Create fix flow →").
Evidence Panel: optional, for multi-category results (audit breakdown grid).
Depth: full report below.
Example: bug investigation → "SSR race condition in login component causes Safari crash."
Example: audit → "47 findings. Accessibility worst." + evidence panel with per-category breakdown.
Tone: reflects findings severity, not execution success.

### Decision Screen (Approval / Gate)
Question: "What decision does the system need from me?"
Verdict: reason for pause + top findings inline + consequences of approve/reject + Approve CTA.
Depth: full artifact preview below if needed.

### Entry Screen (Idle / Start)
Question: "What will happen when I press Run?"
Verdict: step contract — what the step does, what result to expect, what input is needed.
Depth: flow editor available via Cmd+K.
Lightweight variant: for small tweaks and urgent bugs, skip stage contract — go directly to running. Contract shows retroactively in chrome.

### Progress Screen (Running)
Question: "What is happening right now?"
Verdict: live activity feed (the streaming output).
Context: flat step list with progress indicators above.
Chrome: status + elapsed time + Cancel.

### Output Surface Ownership

The output area below the step list has clear ownership per tab. No tab duplicates another's job.

| Surface | Question answered | Owner of | NOT owner of |
|---------|-------------------|----------|-------------|
| **Summary** | "What's the run-level status?" | Run progress, result availability, attention (blocked/failed), fan-out breakdown | Step list (belongs to process list above), per-step detail (belongs to step log) |
| **Result** | "What was the result?" | Verdict card, artifact document, continuation CTA | Step progression, run metrics without result context |
| **Step log** | "What is this specific step doing?" | Per-step execution log, tool calls, streaming output | Step list, run-level progress |
| **History** | "What happened in past runs?" | Past run list, compare runs | Current run state |

**Key rule:** The step list above (FLOW section) is the ONLY owner of step progression. No tab below repeats step order, step status badges, or step navigation. If a tab needs to reference a step, it links to it — it does not re-render the list.

**Summary tab content (replaces Activity):**

1. **Run progress** — `2/7 done · 1 running · elapsed 68m`. Compact, one line. No step list.
2. **Current step** — what's running now: step name, status, what it's doing. One card or one line. Links to step log.
3. **Result availability** — `No result yet` or `Result ready: report.md →` (link to Result tab). Bridges to Result.
4. **Fan-out breakdown** — only if current/selected step has branches. Branch counts: `3 running · 2 done · 1 queued`. Expandable per-branch detail.
5. **Attention block** — only if something needs user action: blocked approval, failed step, retry loop. Otherwise absent.

**Composition note:** Summary is not a stack of equal mini-cards and not a bare list of unrelated rows. It is one owner surface containing grouped rows, optional branch chips, and at most one status-toned inset well for the current issue or next action.

**Fan-out drill-down:** Step list expands fan-out steps to show branches as sub-items. Clicking a branch scopes the entire output shell (scope strip + tabs) to that branch. Two entry points:
1. Step list → expand fan-out step → click branch → output shell scoped to branch
2. Summary → fan-out breakdown → click branch → output shell scoped to branch

No branch detail is lost. The detail lives in Step log (per-branch depth) and Result (per-branch output).

### Scope Strip

A single thin line between the step list and the tabs. Level 0. Always visible. Updates on every selection change. This is THE answer to "what am I looking at below."

**Composition:**
```
FLOW list (step navigation + selection)
──────────────────────────────────────
Scope strip: "Viewing: [what] · [context]"
──────────────────────────────────────
[Summary]  Result  Step log  History
[selected surface content]
```

**Principles:**
- Scope strip is NOT a tab. It is context for all tabs below it.
- When scope changes (user clicks different step), tabs re-scope — but the CURRENT TAB is preserved unless invalid for the new scope. No teleporting.
- Scope strip uses flat text (Level 0), no card, no border — just a hairline separator above and below.
- Two distinct copy patterns: `Viewing: [step]` for navigation context, `Result from: [step]` for artifact provenance.

**Tab preservation on scope change:**
- User is on Summary, clicks a branch → stays on Summary, scoped to branch.
- User is on Result, clicks a branch that has no result → falls back to Summary.
- User is on Step log, clicks a different step → stays on Step log for new step.
- Never auto-switch tab just because selection changed. Predictable, not jumpy.

**Tab order and defaults:**

Tab ORDER is always: `Summary → Result → Step log → History`

| Run state | Default tab | Why |
|---|---|---|
| Running / paused | Summary | User wants run-level status |
| Blocked | Summary | User needs to see what's blocked |
| Completed (with result) | Result | User wants the outcome |
| Idle (no runs) | Summary | Minimal — shows "Ready to run" |

Summary is always first in order, but Result auto-activates on completion.

Full scope matrix (per-selection scope strip content, fan-out mechanics, tab scoping rules) lives in the owner spec: `docs/specs/active/2026-03-21-workflow-page-hierarchy-redesign.md`.

**What Summary must NOT contain:**
- A second step list (NodesTab)
- Per-step status badges that duplicate the process list
- Generic metrics without context ("6.7k tokens" alone)
- "View step log" as the only content

### Error Screen (Failed)
Question: "What went wrong?"
Verdict variant: **diagnostic**. Headline = what broke. Evidence = what was consumed, what's preserved. CTA = retry or create fix flow.
Depth: partial output below.

### Document Screen (document verdict) — R5
Question: "What's the conclusion?"
Verdict variant: **document**. Headline = conclusion/recommendation. Evidence = research metadata. CTA = act on recommendation (cross-flow).
Depth: the document itself, promoted to reading surface with navigation (not buried as secondary).
Example: decision research → "Recommends Stripe. High confidence." + full comparison document with section nav.

---

## 7. Verdict As State Signal

The user distinguishes flow states by the CONTENT of the verdict card, not by explicit state labels. No "RESUME" / "READY" / "HANDOFF" labels are needed — the verdict card IS the state signal.

**Principles:**

1. **State is read through headline → evidence/provenance → CTA.** An answer headline means "done." A promise headline means "ready to start." A provenance context line means "handoff from another flow." A question headline with approve/reject means "blocked."

2. **State labels are secondary and must not be the only signal.** If removing the label makes the state ambiguous, the card content is insufficient.

3. **Context line and spine live on Level 0.** The figure (verdict card) remains one. Context (spine, provenance "From: [flow] ✓") is flat text above.

4. **If the screen could plausibly read as two different states, the composition is broken.** Test: cover the chrome badge. Can you still tell whether this is a fresh start or a review of old results? If not, fix the card content.

Full state matrix with per-state wireframes, must-hide rules, and content routing lives in the owner spec: `docs/specs/active/2026-03-22-cross-flow-handoff-and-fresh-start-contract.md`.

---

## 8. Field Routing — One Fact, One Place

Every data field the system produces belongs in exactly one layer. If the same fact appears twice, one instance is wrong. If a field has no assigned layer, it does not render.

### The Rule

> If the same fact appears in two places on the same screen, find the higher-priority layer and keep it there. Kill the other instance.

Layer priority: verdict > context > chrome > depth > metadata (right-click/Cmd+K).

### Result / Completed State

| Field | Where it goes | How | Kill if... |
|-------|--------------|-----|------------|
| What happened (summary) | **Verdict headline** | One sentence, biggest text | — |
| Score / rating | **Evidence strip** | One number: `7/10` | Appears as BOTH text AND badge |
| Finding count | **Evidence strip** | `0 critical · 3 warnings` | Appears in strip AND in a separate widget |
| Duration | **Evidence strip** | `11m 2s` | — |
| Artifact file name | **Verdict reference** | `project-brief.md` | — |
| Primary CTA | **Verdict** | One button | — |
| "Saved result" label | **Kill** | Storage metadata. User didn't ask "where is this from." | Always |
| Title repeated with date | **Kill the repeat** | Title once in chrome. Date to right-click → details. | Title shown twice |
| Exact timestamp | **Metadata** | Right-click → "Run details" | Shown on primary surface |
| "completed" badge | **Kill** | If there's a verdict, it completed. Redundant. | Always on result screen |
| "Passed" badge | **Kill** | Redundant with score in evidence strip | Score already shown |
| Loop iteration ("1/2") | **Disclosure** | Inside "Why / checks" expandable | On primary surface |
| "Quality loop" label | **Kill** | Internal vocabulary | Always |
| Check type badge ("Check") | **Kill** | Headline already says what the check found | Always |
| Evaluator reasoning (long text) | **Depth** | Below verdict, scrollable | — |

### Blocked / Approval State

| Field | Where it goes | How | Kill if... |
|-------|--------------|-----|------------|
| Why blocked | **Verdict headline** | One sentence | — |
| Top findings (2-3) | **Verdict bullets** | Flat text below headline | — |
| Step name | **Verdict label+value** | `Step: Review changes` | — |
| Flow name | **Verdict label+value** | `Feature delivery` | — |
| Consequences | **Verdict label+value** | `On approve → ...` | — |
| Approve / Reject | **Verdict CTA** | Two buttons | — |
| Task kind badge ("approval") | **Kill** | Card's existence IS the approval | Always |
| Stage meta badge | **Kill** | Step name already shown | Always |
| Summary if same as reason | **Kill the duplicate** | Keep one instance | Text appears twice |

### Ready / Continuation State

| Field | Where it goes | How | Kill if... |
|-------|--------------|-----|------------|
| Previous result | **Verdict label+value** | `Previous: Codebase map` | — |
| Attached artifacts | **Verdict label+value** | `Attached: codebase-map.md` | — |
| Next step | **Verdict label+value** | `Next: Apply changes` | — |
| Run button | **Verdict CTA** | One button | — |
| Step spine | **Context** | Flat row above | — |
| "Ready" badge | **Chrome** | In title bar | — |
| "Step shell" badge | **Kill** | Internal label | Always |
| "All checks passed" | **Kill if trivial** | Only show if checks found something | By day 30, noise |

### Running State

| Field | Where it goes | How | Kill if... |
|-------|--------------|-----|------------|
| Active step + progress | **Chrome** | `Running · Apply · 2/5 · 0:42` | — |
| Streaming output | **Verdict (feed)** | Level 3 card | — |
| Step list | **Context** | Flat rows: `✓ ✓ ▸ ○ ○` | — |
| Model + tokens | **Context (active row)** | Inline | — |
| Cancel | **Chrome** | Button in bar | — |
| Per-step status dot | **Kill** | Checkmark/arrow/circle is enough | Shown alongside badge AND progress bar |
| Per-step badge ("Running") | **Kill** | Highlighted row IS the running step | Always |
| Per-step progress bar | **Kill** | One indicator per step | Alongside dot + badge |

### Common Duplication Patterns to Catch

| Pattern | What's wrong | Fix |
|---------|-------------|-----|
| Score as badge AND text | Same number twice | Keep in evidence strip only |
| Status as badge AND tone AND label | Three signals for one fact | Card tone only |
| Title as heading AND subtitle with date | Same name twice | Heading only, date to metadata |
| "Passed" + "completed" + green icon | Three words for "done" | Pick ONE |
| Summary in reason field AND as standalone paragraph | Same text in two sections | Keep the higher-priority one |
| Step name in badge AND in label+value | Two locations for same fact | Label+value in the card, kill the badge |

---

## 8. Anti-Patterns

These patterns violate the composition guide:

- **Document-as-figure:** The full markdown report is the primary object. Verdict should be primary; report is depth.
- **Dashboard-as-page:** Multiple equal-weight widgets each showing different aspects of the same result. Merge into one verdict + one evidence strip.
- **Title-as-headline:** The step name or flow name occupies the headline position. The headline should be the *answer*, not the *label*.
- **Everything-visible:** All actions, all history, all artifacts, all settings visible at once. Progressive disclosure — show Layer 1 by default, Layer 2 visible without clicks, Layer 3 on demand.
- **Two primary actions:** Two equally prominent buttons. One primary CTA per screen. The other goes to menu bar.
- **Chrome-as-content:** The toolbar or header bar becomes a significant content area with its own sections, selectors, tabs. Chrome is one thin line.
- **Badge soup as verdict:** The outcome is communicated through 6 small pills instead of one readable sentence.

---

## Source Documents

This guide bridges:
- **JTBD.md / UX-SCENARIOS.md** → what questions screens answer (input)
- **DESIGN-PHILOSOPHY.md** → principles and hard rules (constraints)
- **DESIGN_SYSTEM.md** → tokens, surface weight ladder, content roles (implementation)
- **Surface-specific specs** in `docs/specs/` → per-screen application (output)

Referenced frameworks:
- Apple HIG philosophy (Jobs-era): one task, hide complexity, progressive disclosure, defaults, consistency
- Content Priority Guide (Nathan Curtis / EightShapes): prioritized content per screen
- About Face (Alan Cooper): sovereign posture, goal-directed design
- Data-Ink Ratio (Edward Tufte): maximize information, minimize decoration
