# Component Audit Plan

> **Numeric thresholds absorbed into [CANON.md](./CANON.md) §9.3.** This file contains the full audit template and component registry. CANON is authoritative for per-component thresholds.

Systematic review of every renderer surface against the doc stack. Each component is checked top-down: does it trace to a real job? And bottom-up: does its layout follow the composition guide?

---

## How to audit a component

For each component, answer these 7 questions. If any answer is "no" or "unknown," that's a finding.

| # | Question | Layer | Pass criteria |
|---|----------|-------|---------------|
| 1 | **Which job does this close?** | Layer 1-2 (segment + JTBD) | Can name the specific JTBD scenario and segment |
| 2 | **What one question does it answer?** | Layer 6 (composition) | One sentence question from the composition guide |
| 3 | **What is the verdict?** | Layer 6 (composition) | Can write the one-sentence headline |
| 4 | **Does it follow the composition stack?** | Layer 6 (composition) | Chrome → Context → Verdict → Input → Depth, in order |
| 5 | **Does it pass the numeric thresholds?** | Layer 5+7 (philosophy + design system) | ≤1 bordered container, ≤5 actions, 0 duplicates, 0 nested cards, 0 empty sections |
| 6 | **Does the tone match the findings?** | Layer 6 (composition §3.5) | Card tone reflects findings severity, not execution success |
| 7 | **Is the CTA the right next step?** | Layer 6 (composition §3.7) | CTA matches user's actual next action (within-flow OR cross-flow) |

---

## Component Registry

### Tier 1: Primary surfaces (audit first)

These components directly own a runtime state. Each one IS a screen.

| Component | File | Runtime state | One Question |
|-----------|------|--------------|-------------|
| **WorkflowPanel** (idle) | `WorkflowPanel.tsx` | idle, no runs | "What will happen when I press Run?" |
| **WorkflowPanel** (ready) | `WorkflowPanel.tsx` | idle, entry state | "What happened before, am I ready?" |
| **WorkflowPanel** (blocked) | `WorkflowPanel.tsx` | idle, blocked task | "What decision does the system need?" |
| **WorkflowPanel** (running) | `WorkflowPanel.tsx` | running | "What is happening right now?" |
| **WorkflowPanel** (completed) | `WorkflowPanel.tsx` | done | "What was the result?" |
| **WorkflowPanel** (failed) | `WorkflowPanel.tsx` | error | "What went wrong?" |
| **WorkflowCreatePage** | `WorkflowCreatePage.tsx` | create surface | "What do I want to do?" |
| **WorkflowsTemplatesPage** | `WorkflowsTemplatesPage.tsx` | library browse | "Which starting point fits my job?" |

### Tier 2: Figure components (audit second)

These components render AS the figure (Level 3 card) in a given state.

| Component | File | Renders as figure in |
|-----------|------|---------------------|
| **WorkflowResumeHeader** | `WorkflowPanelInlineSections.tsx` | Ready state |
| **SelectedTaskPanel** | `SelectedTaskPanel.tsx` | Blocked state |
| **OutputPanel** (activity) | `OutputPanel.tsx` | Running state |
| **ResultTab** | `ResultTab.tsx` | Completed state |
| **Stage contract** | (to be created) | Idle state |

### Tier 3: Supporting components (audit third)

These are ground-level (Level 0-2) components inside a state.

| Component | File | Audit focus |
|-----------|------|------------|
| **InputPanel** | `InputPanel.tsx` | Must be Level 0 (flat). Currently `surface-panel`. |
| **ChainBuilder** | `ChainBuilder.tsx` | Must be flat rows (Level 0-1). Currently cards with borders. |
| **RunStrip** | `RunStrip.tsx` | Should merge into chrome. Currently separate `border-b` bar. |
| **OutputPanelHeader** | `OutputPanelHeader.tsx` | Tab bar visibility per state. Currently always 4 tabs. |
| **ProcessSpine** | `process-spine.tsx` | Compact context row. Currently `border-b` with its own section. |
| **WorkflowPanelChrome** | `WorkflowPanelChrome.tsx` | Tab removal. Currently Flow\|Graph\|Defaults peer tabs. |

### Tier 4: Chrome and navigation (audit last)

| Component | File | Audit focus |
|-----------|------|------------|
| **Toolbar** | `Toolbar.tsx` | State-dependent collapse. Currently 8 elements in all states. |
| **WorkflowRunControls** | `WorkflowRunControls.tsx` | Run button visibility per state. |
| **ProjectSidebar** | `ProjectSidebar.tsx` | Flow status indicators for multi-flow triage. |
| **AppStatusBar** | `AppStatusBar.tsx` | Global approval badge (missing). |

---

## Audit execution order

### Wave 1: Completed + Failed states (highest user value)

These are the screens where the user sees results. If the verdict card is wrong here, the product fails its primary value proposition.

1. `ResultTab.tsx` — does the verdict match the verdict card rules? Evidence strip? CTA? Tone?
2. `OutputPanel.tsx` — is it the figure in running? Is it absent in idle?
3. `OutputPanelHeader.tsx` — tab visibility per state. Empty tabs? Disabled tabs?

### Wave 2: Blocked + Ready states (decision surfaces)

These are where the user makes decisions. If the approval card or continuation header is wrong, trust breaks.

4. `WorkflowPanelInlineSections.tsx` (WorkflowResumeHeader) — flat label+values? One card? Previous result visible? Artifact handoff?
5. `SelectedTaskPanel` — self-sufficient? Flow name? Inline findings? Consequences?

### Wave 3: Idle state (entry surface)

6. `WorkflowPanelChrome.tsx` — tabs removed? No overflow buttons?
7. Stage contract component (to be created) — follows composition guide entry screen type?
8. `InputPanel.tsx` — flat Level 0?

### Wave 4: Running state

9. `RunStrip.tsx` — merged into chrome? No duplicate progress?
10. `ChainBuilder` in monitor mode — flat rows? Active step Level 2 tint?

### Wave 5: Chrome and navigation

11. `Toolbar.tsx` — state-dependent collapse per spec?
12. `WorkflowRunControls.tsx` — hidden when Resume Header visible?
13. `ProjectSidebar.tsx` — verdict-level flow status? Approval badge?

---

## Per-component audit template

Use this template for each component:

```markdown
## [ComponentName] Audit

**File:** `src/renderer/components/...`
**State(s):** which runtime state(s) does it appear in?
**Role:** figure / context / input / depth / chrome

### Layer trace
- **Job:** [which JTBD scenario]
- **Question:** [the one question]
- **Verdict:** [the headline this component should show]
- **Variant:** outcome / diagnostic / document

### Composition check
- [ ] Follows composition stack order
- [ ] Is the correct surface level (Level 0/1/2/3)
- [ ] No competing figure elements
- [ ] CTA is the right next action
- [ ] Tone reflects findings, not execution

### Numeric thresholds
- Bordered containers in this state: ___ (target: ≤1)
- Visible actions in this state: ___ (target: ≤5)
- Duplicate status signals: ___ (target: 0)
- Nested cards: ___ (target: 0)
- Rendered-but-empty sections: ___ (target: 0)

### Findings
- [ ] ...
```

---

## Success criteria

The audit is complete when:
- Every Tier 1 and Tier 2 component has been audited with the template above
- All findings are logged with severity (P0/P1/P2)
- Each finding references the specific layer and rule it violates
- A prioritized fix list exists, ordered by: user impact × blast radius
