# Design System Guide: Constraints Over Components

How to build interfaces that feel like working tools, not generic AI slop. Distilled from c8c — a flow composer where every rule exists because we shipped the wrong thing first.

This is not a component library. It's a set of **constraints with numeric thresholds** that prevent entropy. Components rot. Constraints hold.

---

## 1. Every Screen Answers One Question

Before drawing any screen:

1. Write **The One Question** the screen answers ("Did the run pass?", "What should I do next?")
2. Write the **verdict** — the answer in one sentence
3. List 3-5 **evidence facts** that support it
4. Name the **ONE primary action**
5. Only then — layout

**Composition stack** (top to bottom):

```
Chrome → Context → Verdict (card) → Evidence Panel → Input → Depth
```

The verdict card is the only Level 3 element (border + bg + shadow). Everything else is ground.

**Three verdict variants:**

| Variant | When | Example |
|---------|------|---------|
| Outcome | pass/fail result | Green/red status + summary |
| Diagnostic | root cause + findings | Findings list + severity |
| Document | conclusion + reading surface | Report + scroll area |

**If you can't write The One Question — don't ship the screen.**

---

## 2. Figure-Ground via Surface Weight Ladder

Most projects make everything a card. Every block gets border + shadow. Nothing stands out because everything does.

**Four levels:**

| Level | Role | CSS class | When |
|-------|------|-----------|------|
| 0 | Ground | (none) | Default. Most elements live here |
| 1 | Context strip | `ui-context-strip` | Identity, status, scope binding |
| 2 | Grouping | `ui-slab`, `ui-inset-well` | Visual grouping without card treatment |
| 3 | Figure | `surface-figure` | **ONE per screen.** The answer to The One Question |

**Rule:** a component is Level 0 by default. To earn Level 3, it must be **the answer** to the screen's One Question.

**Implementation:** `surface-figure` is the only CSS class with `border + bg + shadow`. All other surface classes lack elevation. This makes accidental card-in-card structurally impossible.

---

## 3. Numeric Thresholds, Not Vibes

"Keep it clean" means nothing. Everyone interprets it differently. Use numbers.

| Metric | Threshold | Failure = ship blocker |
|--------|-----------|----------------------|
| Bordered containers per screen | ≤ 3 | yes |
| Clickable elements per state | ≤ 5 | yes |
| Duplicate status signals | 0 | yes |
| Nested cards (card-in-card) | 0 | yes |
| Rendered-but-empty sections | 0 | yes |
| Lines per component file | ≤ 300 | yes |

**Before every render** — three gates:

1. Does the component have content?
2. Does the user need it NOW?
3. Does it duplicate something already visible?

All three pass → render. Any fail → don't.

---

## 4. Connective Tissue Vocabulary

Design libraries have Card, Button, Input. For everything that "groups but isn't a card" — ad-hoc Tailwind: `rounded-lg border border-gray-200 bg-gray-50 p-4`. Different every time.

**Named structural vocabulary:**

```css
.ui-context-strip   /* L0-1: binds identity, status, scope */
.ui-slab            /* L2: tinted region, groups rows */
.ui-inset-well      /* L2: focal area inside owner surface */
.ui-section-divider /* L0: standard hairline between sections */
.ui-empty-state-box /* L1: dashed-border empty state container */
.ui-evidence-item   /* L1: compact fact display in verdict cards */
```

These are not cosmetic utilities — they encode **structural intent**: "this is grouping, not a card", "this is context, not content".

**Severity is also named:**

```typescript
toneToSurface("danger")  → "surface-danger-soft"
toneToBadge("success")   → "ui-status-badge ui-status-badge-success"
```

Not `bg-red-50 border-red-200` — a semantic mapping through a function. One source of truth, not scattered color choices.

---

## 5. UI Closes Jobs, Not Text

Every screen in a generic AI project is a landing page. Heading, description paragraph, another paragraph, button. For a daily-use tool this is torture.

**The test:**

> Remove all paragraph-level text. Does the user still understand the interface? If not — the interface isn't done. It needs better layout, hierarchy, badges, counters, actions.

- **Words name the work.** Interface does the work.
- Badge `3 steps · 1 check` instead of "This flow has three working steps and includes one quality check."
- Label-value grid instead of explanatory paragraphs
- Structured question with buttons instead of NLP dialog

**Runtime shell constraint:** resume/continuation state renders as a compact header INSIDE the working surface, not a separate page. The user reaches the primary action without scrolling past the header.

---

## 6. Bidirectional Entity Checklist

"We need a new page" → draw page → unclear why it exists.

**Two-direction validation before shipping any new surface:**

**Top-down:**

```
Job → Question → Verdict → Layout
"Why?" → "What do we answer?" → "What verdict?" → "How does it look?"
```

**Bottom-up:**

```
Component → Question → Job
"This component" → "What question does it answer?" → "What job does it close?"
```

If any layer has no answer — don't ship. This prevents "let's add a tab" without understanding why.

---

## 7. Token-Driven Roles, Not Token-Driven Appearance

Design tokens as colors + spacing is table stakes. The difference: tokens encode **role**, not appearance.

**Surfaces (by depth):**

```
bg-sidebar → bg-surface-1 → bg-surface-2 → bg-surface-3
```

**Typography (by zone):**

```
text-sidebar-item  (13px/400)       — navigation items
text-sidebar-label (11px/500)       — group headers
text-sidebar-meta  (10px/400)       — timestamps, helper text
text-body-md       (14px)           — content
text-body-sm       (13px)           — compact content
section-kicker     (11px/600/upper) — structural dividers
```

**Controls (by size):**

```
control-xs (1.25rem) → control-sm (1.75rem) → control-md (2.25rem) → control-lg (2.5rem)
```

**Motion (by speed):**

```
--motion-fast (140ms) → --motion-base (170ms) → --motion-slow (220ms)
```

Not "pick a font size" but "what zone? sidebar → `text-sidebar-item`". The decision is already made.

---

## 8. Product Vocabulary as Engineering Contract

In code: `workflow`. In UI: "workflow". User sees "workflow" and doesn't understand.

**Translation table:**

| User sees | Code uses | Never in UI |
|-----------|-----------|-------------|
| flow | workflow | workflow, process |
| step | stage, phase | stage, phase |
| starting point | template | template |
| skill | skill ref | capability |
| check | gate (auto) | gate |
| approval | gate (human) | gate |

Internal code keeps `workflowAtom`, `templatesCatalogAtom`. User-facing strings use "flow", "starting point". **A lint script (`canon:check`) enforces this at CI.**

---

## 9. Component Hygiene

A 1400-line component with business logic, IPC calls, atom orchestration, and JSX in one file is a bug, not a feature.

**Three rules:**

1. **≤ 300 lines per file.** If it grows — extract a hook or split the component.
2. **Business logic lives in hooks, not in JSX.** IPC, atoms, multi-step flows → `useFlowRouting()`. The component calls the hook and renders.
3. **One job per file.** If a file does project selection AND routing AND workflow creation — split by responsibility.

**Not "we'll refactor later"** — when touching a file that violates these rules, include a targeted split as part of the current work.

---

## 10. Agent-Only Decisions

`if (prompt.includes("create")) route("create")` — brittle regex routing that breaks on every edge case.

**Rule:** any logic that interprets natural language (routing, intent classification, disambiguation) **must go through an LLM agent call**. No regex, no keyword matching, no `includes()` patterns.

The only non-agent logic allowed: reading structural project facts (empty dir vs has code, git state, project kind). These are **inputs to the agent**, not decision branches.

---

## How to Adopt

1. **Write numeric thresholds** — without concrete numbers, rules don't work
2. **Create a Surface Weight Ladder** — define Level 0-3 for your project, create CSS classes
3. **Name your connective tissue** — give names to "the stuff between cards"
4. **Enforce Screen Composition** — every screen starts with One Question, not components
5. **Enforce vocabulary** — user-facing vs code terms table, lint script to check
6. **Audit by numbers** — regularly count bordered containers, actions, empty sections
7. **Bidirectional checklist** — before every new surface: top-down AND bottom-up

The difference from a "design system" — this is not a component library with a Storybook. It's a set of constraints that prevent the natural entropy of a growing codebase. Ship the constraints first. The components follow.
