# New Entity Checklist

> **Condensed checklist absorbed into [CANON.md](./CANON.md) §11.** This file contains the full 8-layer trace with detailed questions. CANON is authoritative for the pre-ship checklist.

Before shipping a new screen, component, state, or surface, trace it through all 8 layers in BOTH directions. If any layer has no answer, the entity is not ready to ship.

---

## When to use this checklist

- Adding a new page or screen
- Adding a new runtime state to an existing page
- Adding a new component that owns user attention (is or contains the figure)
- Adding a new template/starting point that creates a new entry path
- Adding a new result type that changes what the completed state shows
- Significantly redesigning an existing surface

NOT needed for: internal refactors that don't change what the user sees, bug fixes, token/style changes.

---

## Top-Down Trace (Job → Pixel)

Start from the user's need, end at the rendered component.

### Layer 1: WHO
- [ ] Which segment uses this? (name it from `docs/segment.md`)
- [ ] Is this segment in scope for the current release? (check `docs/RELEASE-ITERATIONS.md`)
- [ ] What vocabulary does this segment use? (check segment research for natural language)

### Layer 2: WHAT
- [ ] Which JTBD scenario does this serve? (name it from `docs/JTBD-PIPE-SCENARIOS.md` or `docs/JTBD.md`)
- [ ] Which meta-pattern applies? (Multi-Phase / Quality Loop / Fan-Out / Chaos→Clarity / Recurring Pipeline)
- [ ] What typed result does the user expect? (name it: "Implementation plan", "Root cause analysis", etc.)

### Layer 3: WHY
- [ ] Is this scenario prioritized in current strategy? (check `docs/STRATEGY.md`)
- [ ] Does this entity help prove ROI for the target segment?

### Layer 4: WHAT to build
- [ ] Is the entry path registered in `docs/CANON.md` Section 2.5? (if it's a new template/starting point)
- [ ] Does Canon vocabulary apply? (flow, step, check, approval — not workflow, stage, gate)
- [ ] Is the routing contract defined? (agent-based, no heuristics — see AGENTS.md)

### Layer 5: HOW it should feel
- [ ] Which UX principle is primary? (run-until-decision, keyboard-first, status-at-glance, etc.)
- [ ] Does it follow the visual hierarchy rules? (one figure, ≤5 actions, no nested cards, etc.)
- [ ] Is it a daily-driver surface or a first-use surface? (affects progressive disclosure)

### Layer 6: HOW to compose
- [ ] What is The One Question this screen answers? (write it down)
- [ ] What is the verdict headline? (write the one sentence)
- [ ] Which verdict variant? (outcome / diagnostic / document)
- [ ] What goes in the evidence strip? (3-5 facts, write them)
- [ ] Is an evidence panel needed? (multi-axis result?)
- [ ] What is the primary CTA? (one action, write it)
- [ ] Is the CTA within-flow or cross-flow?
- [ ] Does the composition stack apply? (Chrome → Context → Verdict → Evidence Panel → Input → Depth)

### Layer 7: HOW it looks
- [ ] Which surface level? (Level 0 ground / Level 1 separator / Level 2 tint / Level 3 card)
- [ ] Which content hierarchy roles apply? (Object Header, Outcome Headline, Decision, Evidence Strip, Evidence Panel, Artifact Document, Provenance Row)
- [ ] What tone? (neutral / warning / danger — based on findings severity, not execution status)
- [ ] Which existing design system patterns are reused? (verdict card, task panel, stage contract, etc.)

### Layer 8: WHAT to ship
- [ ] Is there a spec or spec section for this? (in `docs/specs/`)
- [ ] Does it fit an existing state in the workflow page hierarchy spec? Or does it need a new state?
- [ ] Compliance checklist passes? (bordered containers, action count, etc.)

---

## Bottom-Up Trace (Pixel → Job)

Start from the rendered component, validate it traces back to a real job.

### From the component
- [ ] What does this component render? (describe what the user sees)
- [ ] In which runtime state(s) does it appear?
- [ ] Is it a figure (Level 3) or ground (Level 0-2)?

### To the composition
- [ ] Which question does it answer? (if you can't name one, it shouldn't exist)
- [ ] Is it part of Chrome, Context, Verdict, Input, or Depth? (if none, it shouldn't exist)
- [ ] Does it duplicate information shown by another component in the same state? (if yes, remove one)

### To the philosophy
- [ ] Does it follow "hide structure, show state"? (does it expose internal model details?)
- [ ] Does it follow "one figure per state"? (does it compete with the figure?)
- [ ] Would removing it make the screen clearer? (if yes, remove it)

### To the job
- [ ] Does the user NEED this to close their job? (not "is it useful" but "would they fail without it?")
- [ ] If this is evidence/context, is it visible without clicking when it is genuinely user-facing evidence? Keep operator diagnostics, thresholds, rubric scores, and rule inventories in disclosure or deeper inspect layers.
- [ ] If this is depth, does the user have to scroll past it to reach the verdict? (if yes, reorder)

---

## Kill criteria

Remove or block the entity if ANY of these are true:

1. **No named job.** You cannot point to a JTBD scenario that this entity serves.
2. **No one question.** The component doesn't answer a single clear question — or it answers two.
3. **Competing figure.** It creates a second Level 3 element in a state that already has one.
4. **Duplicate signal.** It shows the same fact (status, progress, finding count) that another component already shows.
5. **Empty in its primary state.** It renders with placeholder content or disabled children in the state where it's supposed to be useful.
6. **Internal vocabulary.** It shows internal terms (workflow, stage, gate, factory, case) in user-facing text.
7. **Can't write the headline.** If you can't write the one-sentence verdict for this component's output, the component's purpose is unclear.

---

## Examples

### Passes: Task Panel (blocked state)

| Layer | Check | Status |
|-------|-------|--------|
| Job | Bug investigation / feature review — needs decision | Named |
| Question | "What decision does the system need?" | Clear |
| Verdict | "2 critical findings need your decision." + inline findings | Written |
| Composition | Chrome → (Context) → Verdict (Task Panel) | Correct |
| Thresholds | 1 container, 3 actions (Reject + Approve + right-click) | Pass |
| Tone | Warning (reflects findings severity) | Correct |
| CTA | "Approve & Continue" (within-flow) | Correct |
| Job trace back | User needs this to unblock the flow | Yes |

### Fails: OutputPanel with 4 tabs in idle state

| Layer | Check | Status |
|-------|-------|--------|
| Job | No run has happened — no job being closed | **No named job** |
| Question | Can't name one — all 4 tabs answer different questions | **No one question** |
| Composition | Renders 4 empty tabs as figure-weight chrome | **Competing figure** |
| Thresholds | 4 rendered-but-empty sections, 2 disabled tabs | **Fail** |
| Kill? | **Yes.** Not rendered until first run. |

---

## Integration with existing docs

This checklist references:
- `docs/research/segment.md` — Layer 1 (WHO)
- `docs/research/JTBD-PIPE-SCENARIOS.md` / `docs/research/JTBD.md` — Layer 2 (WHAT)
- `docs/research/STRATEGY.md` — Layer 3 (WHY)
- `docs/conventions/CANON.md` — Layer 4 (WHAT to build)
- `docs/conventions/DESIGN-PHILOSOPHY.md` — Layer 5 (HOW it should feel)
- `docs/conventions/SCREEN-COMPOSITION-GUIDE.md` — Layer 6 (HOW to compose)
- `DESIGN_SYSTEM.md` — Layer 7 (HOW it looks)
- `docs/specs/` — Layer 8 (WHAT to ship)
