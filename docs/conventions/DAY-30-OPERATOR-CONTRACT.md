# DAY-30-OPERATOR-CONTRACT.md

> **Reference document.** Key principles (keyboard-first, status-at-glance, run-until-next-decision) already in [CANON.md](./CANON.md) §3. This file provides the full daily-driver vision.

A working document about how c8c should feel not on the first demo, but on `day 30` of daily use.
It defines the daily-driver contract against which execution plans, walkthroughs, and the app shell should be validated.

Main sources:

- [docs/REFERENCES.md](./REFERENCES.md)
- [docs/R1-EXECUTION-PLAN.md](./R1-EXECUTION-PLAN.md)
- [docs/releases/R2-EXECUTION-PLAN.md](../releases/R2-EXECUTION-PLAN.md)
- [docs/plans/R1-UX-WALKTHROUGHS.md](./plans/R1-UX-WALKTHROUGHS.md)
- [docs/UX-SCENARIOS.md](./UX-SCENARIOS.md)

---

## 1. Why This Document Exists

c8c already has a strong first-run narrative:

- guided path
- stage shell
- dominant artifact
- continuation

But a desktop product for advanced users cannot be designed only for the first successful run.

We need to separately document how the product should work when the user:

- launches processes every day
- runs several processes in parallel
- no longer wants to re-read explanations
- expects speed, keyboard, and status-at-a-glance

In short:

> `R1` and `R2` should be clear on the first run, but convenient on the thirtieth.

---

## 2. Five Principles of a Day-30 Product

### 2.1 Run until next decision

A single explicit launch should advance the process to the next human decision.

This means:

- the system should not require manually restarting each deterministic stage
- loops and continuations can proceed automatically until a new judgment is needed
- a stop is needed on:
  - approval gate
  - blocked state
  - ambiguous outcome
  - explicit user pause

This does not mean:

- "run everything to the end without control"
- hide stages and gates
- remove process legibility for the sake of magic

The right formula:

> Not `run everything`.
> But `run until next decision`.

### 2.2 Keyboard-first

If an action is repeated every day, it must have a keyboard path.

Minimum:

- the primary action on the active surface must have a shortcut
- the keyboard path must not be worse than the mouse path
- the user should not have to click through the entire flow just because the product did not define a command rhythm

Baseline shortcuts:

- `Cmd+Enter` = primary action on focused process surface
  - `Run`
  - `Continue`
  - `Approve`
- `Esc` = close detail / dialog / secondary inspect surface

Expanded shell shortcuts for later layers:

- `Cmd+K` = command palette
- `Cmd+N` = new process
- `Cmd+1..5` = quick switch between visible processes

### 2.3 Status at a glance

The user should understand the process state within seconds.

At the surface level this means:

- current stage
- compact outcome token
- next decision
- pending approval / blocked state

At the app shell level this means:

- a list of active processes with current stage and status token
- without needing to open each process individually

### 2.4 Progressive disclosure by familiarity

The first run and the thirtieth should not look the same.

Principle:

- the first run can be slightly more explanatory
- repeat runs should be more compact
- a recurring operator should not have to re-read the same helper copy

In practice:

- explanation collapses after first understanding
- loop history and policy detail stay inspectable, but not always expanded
- system uses badges, counters and labels before prose paragraphs

### 2.5 Inline over click-through

If the user is already in a working context, the product should resolve the task inline.

This means:

- dominant artifact preview is first visible inline, then full inspect
- next action is visible next to the artifact
- capability attach is possible from current process or stage when relevant

This does not mean:

- remove separate pages entirely

But it does mean:

- browser/catalog pages are secondary
- click-through only when a deeper inspect or broader browse is actually needed

### 2.6 Words are scaffolding, not the product

`JTBD`, walkthroughs, and explanatory copy are useful because they force us to honestly name:

- what job the user is trying to close
- why a specific stage or gate exists
- what the next expected decision is

But this does not mean that the shipped interface should live as a text narrative.

The right role of words:

- help us choose the right product objects
- name states, actions and outcomes
- temporarily support a new mental model while the surface is not yet readable enough visually

The wrong role of words:

- replace layout, hierarchy and controls
- explain what should already be clear through badges, counters, rows, buttons and stage state
- turn a daily-driver surface into a landing page, walkthrough, or long onboarding paragraph

The right formula:

> First, words help explain the work.
> Then, the interface should let you do that work with almost no explanation.

---

## 3. What This Contract Means for R1

`R1` does not have to be a full daily-driver shell.

But it must lay the baseline without which `R2` would be built on demo-only UX.

### 3.1 R1 baseline

`R1` must provide:

- compact guided entry instead of text-heavy launch cards
- stage shell as control header, not onboarding screen
- dominant artifact with inline preview
- `run until next decision` on the canonical path where downstream behavior is deterministic
- minimal keyboard baseline on active process surfaces:
  - `Cmd+Enter` for run / continue / approve
  - `Esc` for closing secondary detail

### 3.2 What R1 does not yet need to provide

`R1` does not need to:

- solve multi-process status at a glance
- build a full command palette shell
- remember user-specific disclosure preferences everywhere
- implement a full app-wide keyboard matrix

### 3.3 The main test for R1

After the first successful run, the user should not be thinking:

- "now I'll have to press Run five times for every feature flow"
- "this is impossible without a mouse"
- "every time I have to open the artifact in a separate screen"

---

## 4. What This Contract Means for R2

`R2` must turn the baseline into a real daily-driver shell.

### 4.1 R2 expansion

`R2` must provide:

- multi-process status rail / sidebar with active stage and compact status tokens
- keyboard-first shell:
  - `Cmd+Enter`
  - `Cmd+K`
  - `Cmd+N`
  - quick process switching for visible slots
- remembered or default compact disclosure on repeat work
- gate and loop state encoded as badges / counters / concise operator rows
- inline capability attach from current process or stage

### 4.2 What must not be done in R2

Must not:

- build a process map as a pretty demo diagram without operator value
- keep policy detail always expanded
- force capability attach to go through a long browse ritual if the user already knows the current stage context
- design multi-process work as if the user runs only one process at a time
- assume that JTBD-derived copy itself already solves UX if the interface still requires reading long explanations instead of reading state through elements

### 4.3 The main test for R2

A day-30 operator should be able to:

1. see 3+ processes and their state at a glance
2. continue or approve an active process from the keyboard
3. quickly switch to another process
4. attach the needed capability without navigating to an expert-only browse flow

---

## 5. Questions to Ask Every New UX Decision

1. Does this help act on the thirtieth run, not just understand the product on the first?
2. Does this shorten the path to the next decision, or add yet another explain-and-click step?
3. Does this read state through tokens, counters, labels and actions, or only through copy?
4. Is this accessible inline from the current context, or does it for some reason require navigating to a separate browse surface?
5. Is there a keyboard path for this on the frequent-user route?

If at least two answers are negative, the decision is most likely too demo-oriented.
