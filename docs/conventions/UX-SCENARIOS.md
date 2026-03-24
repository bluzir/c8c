# UX Scenarios — Pattern Library

**Date:** 2026-03-18 | **Method:** 4 UX designers worked through 9 scenarios from JTBD.md, product-agnostic → distilled into design principles

> **How to use this document:**
>
> This is a **north-star pattern library**, not a near-term roadmap. Scenarios are ranked by priority:
>
> - **CORE (Segment 1, near-term roadmap):** Dev Process, Code Review, Refactor Shepherd — build now
> - **NEXT (validated need, future packs):** Content Repurposing, Launch Kit, Telegram Dev Process — patterns for future templates
> - **EXPLORE (hypothesis, C-grade):** Content Engine, Customer Voice, Competitive Intel, Onboarding — if validated
>
> Design principles are divided into **core** (applicable to all scenarios) and **pack-specific** (applicable only to specific patterns).

---

## Table of Contents

1. [Distillation: 4 Meta-Patterns and Design Principles](#distillation)
2. [CORE: Dev Process — Feature Factory + Code Review](#dev-process)
3. [NEXT: Content & Launch — Launch Kit + Content Engine + Repurposing](#content--launch)
4. [EXPLORE: Analysis & Intel — Customer Voice + Competitive Intel + Onboarding](#analysis--intel)
5. [CORE: Quality & Remote — Refactor Shepherd + Telegram Dev Process](#quality--remote)

---

# Distillation

## 4 Meta-Patterns (Cover All 9 Scenarios)

All 9 scenarios reduce to combinations of four meta-patterns:

### Pattern A: Multi-Phase Process (Feature Factory, Refactor, Telegram Dev)

```
STAGE 1 → GATE → STAGE 2 → GATE → STAGE 3 → ... → RESULT
```

Sequential stages with human decisions between them. Each stage = a separate cognitive mode, fresh context, named artifact as output.

### Pattern B: Quality Loop (Code Review, Refactor verification)

```
ACTION → CHECK → PASS? → yes: forward / no: FIX → CHECK → ...
```

A closed loop with a quality threshold and iteration limit. Auto-retry on failure, escalation to human when the limit is reached.

### Pattern C: Fan-Out / Fan-In (Launch Kit, Content Repurposing, Content Engine)

```
ONE INPUT → CORE → PARALLEL: [A] [B] [C] [D] → CONSISTENCY CHECK → PACKAGE
```

One input produces N named outputs. Between generation and delivery — an automatic consistency check across artifacts.

### Pattern D: Chaos → Clarity (Customer Voice, Competitive Intel, Onboarding)

```
RAW DATA → CLASSIFY → FILTER NOISE → PRIORITIZE → ACTIONS
```

Unstructured input is transformed into structured actionable output through 4 stages: chaos → structure → filtering → action.

### Pattern E: Recurring Pipeline with Memory (Content Cadence, Trend Watching, Scheduled Audits)

```
CRON/TRIGGER → SIGNAL COLLECTION → FILTERING (with history) → SYNTHESIS → DELIVERY
                                      ↑                                      │
                                      └──── TYPED RESULT from previous run ──┘
```

The pipe runs on a schedule (cron) or trigger. Each run receives the typed result from the previous run (Trend Lines, Topic Archive, Voice Profile). Memory accumulates: trends are visible, not just point-in-time snapshots. Anti-degradation: drift detection, controlled randomness, human calibration. Escalation: a critical signal does not wait for the cadence.

> Full description of Pattern E and scenarios that use it: [JTBD-PIPE-SCENARIOS.md](./JTBD-PIPE-SCENARIOS.md)

### How Patterns Combine in Scenarios

| Scenario             | A (Process) |   B (Loop)    |      C (Fan-Out)      | D (Chaos→Clarity) |
| -------------------- | :---------: | :-----------: | :-------------------: | :---------------: |
| Feature Factory      | **primary** | within Review |           —           |         —         |
| Code Review Pipeline |      —      |  **primary**  |           —           |         —         |
| Launch Kit           |      —      |       —       |      **primary**      |         —         |
| Content Engine       |  partially  | quality gate  |      **primary**      |         —         |
| Content Repurposing  |      —      |       —       |      **primary**      |         —         |
| Customer Voice       |      —      |       —       |  fan-out by category  |    **primary**    |
| Competitive Intel    |      —      |       —       | fan-out by competitor |    **primary**    |
| Onboarding Optimizer |      —      |       —       |           —           |    **primary**    |
| Refactor Shepherd    | **primary** | verification  |           —           |         —         |
| Telegram Dev Process | **primary** | within review |           —           |         —         |

---

## Design Principles

### CORE — applicable to all scenarios, build now

| #   | Principle                            | Essence                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Process → Stage → Step**           | Three levels: process (strategic, always visible) → stage (tactical, current artifact + decision) → step (operational, collapsible). One screen = one artifact = one decision                                                                                                                |
| 2   | **Quality Gates**                    | Three modes: auto-pass (score > threshold), auto-return (critical found), human decision (borderline case). Configurable thresholds                                                                                                                                                          |
| 3   | **Closed Loops**                     | Review → Fix → Re-review with iteration limit and escalation to human. Visual iteration counter                                                                                                                                                                                              |
| 4   | **Artifact Handoff**                 | Each stage receives **the needed artifacts and relevant context** from previous stages — not "everything," but what is configured. The user sees "this stage used: [list of artifacts]." This is **not** "full context of all stages" — it is artifact-based handoff, preventing context rot |
| 5   | **Observation > Intervention**       | The user is a supervisor, not an orchestrator. Intervenes only at gates. Can take over control at any moment                                                                                                                                                                                 |
| 6   | **Named Artifacts**                  | Each stage produces a named output: "Strategic Verdict," "Design Audit," "Review Report v2." Not a blob, but an object with type, version, relationships                                                                                                                                     |
| 7   | **Summary as Proof of Value**        | Finale: "3 bugs found and fixed, 9 tests, 87% coverage. Without this process, 3 bugs would have shipped to production"                                                                                                                                                                       |
| 8   | **Approval Before Execution**        | The gate stands BEFORE execution. The user approves the plan ("5 files, ~1000 lines, 1 recommendation"), not 2000 lines of code                                                                                                                                                              |
| 9   | **Granular Approval**                | Not "yes/no," but "approve steps 1-2 / edit plan / approve + add rate limiting"                                                                                                                                                                                                              |
| 10  | **Self-Sufficient Approval Context** | Each approval request reads as a standalone document. The user may not have seen the previous 5 messages                                                                                                                                                                                     |
| 11  | **Execution Policy**                 | Configurable rules: "if 0 critical — continue without me," "if /core/ is touched — always ask." The user sets a **policy**, not a "trust level." This is human-gated controllable execution, not an autonomy ladder                                                                          |
| 12  | **Channel-adaptive progress**        | Desktop: real-time stream. Background: system notification. Messenger: edit message. Sound only on decision/error/completion                                                                                                                                                                 |

### PACK-SPECIFIC — applicable to specific patterns

**Fan-Out / Content packs (Pattern C):**

| #   | Principle                    | Pattern | Essence                                                                                                                                     |
| --- | ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | **Content DNA**              | Fan-Out | Before fan-out — extraction and confirmation of the core: key message, talking points, canonical facts. The user confirms BEFORE generation |
| 14  | **Canonical Facts**          | Fan-Out | Facts are locked. "47%" = 47% everywhere. Auto-correction on divergence                                                                     |
| 15  | **Visible Parallelism**      | Fan-Out | Grid of cards, each lights up as it becomes ready. Fastest first                                                                            |
| 16  | **Consistency Verification** | Fan-Out | Matrix of "fact × artifact" with color coding. Consistency score                                                                            |
| 17  | **Cascade Editing**          | Fan-Out | Editing a talking point in one artifact → highlighting dependent locations → suggesting an update                                           |
| 18  | **Review Board**             | Fan-Out | All artifacts side by side on one screen. Approve individually or "Approve All"                                                             |
| 19  | **Package Export**           | Fan-Out | Result = a ready package (.zip), not a scatter of texts                                                                                     |

**Analysis / Intel packs (Pattern D):**

| #   | Principle               | Pattern       | Essence                                                                 |
| --- | ----------------------- | ------------- | ----------------------------------------------------------------------- |
| 20  | **Action First**        | Chaos→Clarity | Top block = "What to do." Data = justification, in collapsible sections |
| 21  | **Three-Level Depth**   | Chaos→Clarity | L1: action. L2: justification (one click). L3: raw data (second click)  |
| 22  | **Honest Uncertainty**  | Chaos→Clarity | Confidence level on each conclusion. A range, not a point               |
| 23  | **Delta, Not Absolute** | Chaos→Clarity | "73 bugs (+12 vs last week)" — trends are visible without extra actions |

---

## How Core Principles Group in the UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CORE: always present                                                    │
│                                                                         │
│  ┌─── PROCESS VIEW (principles 1-3) ─────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [Stage 1] ──◆── [Stage 2] ──◆── [Stage 3] ──◆── [Result]       │  │
│  │              │                │                │                   │  │
│  │           gate            gate (loop)       gate                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── STAGE VIEW (principles 4, 6, 7) ────────────────────────────────┐  │
│  │                                                                    │  │
│  │  "Architecture Plan v2"            Artifacts used:                 │  │
│  │  ├── Affected modules: 3          [verdict] + [audit]             │  │
│  │  └── [Details] [Compare v1]       (artifact handoff, not "everything") │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── APPROVAL VIEW (principles 8-12) ────────────────────────────────┐  │
│  │                                                                    │  │
│  │  "Design ready. 5 files, ~1000 lines, 1 rec."                    │  │
│  │  [Approve] [Approve + rate limiting] [Edit] [Reject]              │  │
│  │                                                                    │  │
│  │  Policy: "if 0 critical — continue automatically"                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  PACK-SPECIFIC: connected via templates                                  │
│                                                                         │
│  ┌─── FAN-OUT (principles 13-19) ─────────────────────────────────────┐  │
│  │  [Article ●] [TW#1 ●] [TW#2 ◐]   Consistency: 92/100            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌─── INSIGHT (principles 20-23) ─────────────────────────────────────┐  │
│  │  ACT: Fix PDF crash   ▸ L2  ▸ L3                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# Dev Process

## Feature Factory [S-GRADE: gstack]

### Ideal Path

```
INPUT: "Add dashboard export to PDF"

  [Stage 1: CEO Review]     →  Artifact: "Strategic Verdict"
       ◆ Gate: "Worth building?" (auto if score>7, otherwise human)
  [Stage 2: Design Review]  →  Artifact: "Design Audit" (80 points)
       ◆ Gate: "Design ready?" (auto if score>70, human if 50-70, auto-return <50)
  [Stage 3: Eng Review]     →  Artifact: "Architecture Plan"
       ◆ Gate: Human approval (always)
  [Stage 4: Implement]      →  Artifact: diff (+1847/-203 lines)
       (automatic transition)
  [Stage 5: Code Review]    →  Artifact: "Review Report v{N}"
       ◆ Gate: Critical>0 → auto-fix → re-review (loop, max 3)
  [Stage 6: QA]             →  Artifact: "QA Report" (9 tests, 87% coverage)
       ◆ Gate: Tests green? (auto on pass, loop on fail)
  [Stage 7: Ship]           →  Artifact: "PR #142"
       ◆ Gate: Human approval (final)

  RESULT: PR + summary "2400 lines, 3 bugs found/fixed, 9 tests"
  + "Without this process, 3 bugs would have shipped to production"
```

**Key point:** the user at each stage sees **one screen with one artifact** and **one decision**. Not a graph, not a log, not a blob — a card with a verdict and buttons.

## Code Review Pipeline [S-GRADE]

### Ideal Path

```
INPUT: git diff (branch feature/pdf-export)

  [Review] → "3 bugs: 1 Critical, 2 Warning"
       ◆ Critical>0 → AUTO-FIX
  [Fix] → "Patch v1: 3 fixes, 2 tests added"
       (automatic transition)
  [Re-Review] → "0 Critical, 0 Warning, 1 Info"
       ◆ PASS
  [Ship] → PR with summary
       ◆ Human: "Merge?"

  Counter: "Iteration 2/3, quality score 92/100"
  Summary: "Without this, 3 bugs in production"
```

**Key point:** a closed loop is a first-class UI primitive, not a hack. Iteration history is visible: v1 → patch → v2.

---

# Content & Launch

## Unified Meta-Pattern for All Three Scenarios

```
INPUT → EXTRACT CORE → CONFIRM → FAN-OUT → EVALUATE → CONSISTENCY → REVIEW BOARD → PACKAGE
```

### Launch Kit

- Input: product description + audience + tone
- Core: "Brand DNA" (key message, 3 benefits, tone vocabulary, canonical facts)
- Fan-out: Landing Copy + PH Listing + Twitter Thread + Email
- Review: 4 cards side by side, consistency 92/100
- Package: Launch Kit .zip

### Content Engine (repeatable, 3-5 times/week)

- Input: topic + talking points
- Core: research brief
- Fan-out: Blog + Twitter + LinkedIn (per platform)
- Quality gate: evaluation by criteria, auto-retry on failure
- Review: approve individually, Ready Queue with weekly progress

### Content Repurposing

- Input: 45-min podcast transcript
- Core: "Content DNA" (5 talking points, canonical facts, 8 quotes, timestamps)
- Fan-out: 12 artifacts (article, 5 threads, newsletter, 3 TikTok, LinkedIn, Telegram, YouTube desc, quote cards)
- Consistency: matrix of "fact × artifact" (47% = 47% everywhere)
- Cascade edit: editing a talking point → updating dependent locations
- Package: Content Package .zip with a meaningful folder structure

---

# Analysis & Intel

## Unified Meta-Pattern: Chaos → Clarity

```
RAW DATA → CLASSIFY → FILTER NOISE → PRIORITIZE → "3 ACTIONS FOR THE WEEK"
```

### Customer Voice Analyzer

- Input: 147 messages (CSV, Discord, Intercom)
- Classify: bug/feature/praise/churn + confidence score
- Output artifacts:
  - "Product Pulse" (dashboard: 73 bugs +12, sentiment 6.2/10 down)
  - "Bug Priority Matrix" (3 bugs for the week with justification)
  - "Feature Demand Map" (23 mentions, growing trend, segment)
  - "Churn Radar" (5 users at risk with recommendations)

### Competitive Intel

- Input: list of 3-5 competitors (URL, Twitter, pricing)
- Parallel: Changelog Scanner + Review Miner + Pricing Analyzer
- Evaluator: significant change (>=6/10) vs noise
- Output artifacts:
  - "Weekly Digest" (ACT / WATCH + "What this means for us")
  - "Competitive Map" (scatter plot: price × features + movement arrows)
  - "Movement Timeline" (timeline with filters)

### Onboarding Optimizer

- Input: step descriptions + screenshots + drop-off data + complaints
- Pipeline: UX Auditor → Best Practices → Improvement Proposer → Impact/Effort Evaluator
- Output artifacts:
  - "Friction Map" (visual funnel with red zones: -36% at step 3)
  - "Root Problem Diagnosis" (current state + what users say + how the best do it)
  - "Sprint Board" (3 improvements sorted by ROI, with mockup descriptions)

**Key principle:** Time from data upload to first action is the main metric. Not accuracy, not beauty. Time to "what to do."

---

# Quality & Remote

## Refactor Shepherd

### Pattern: "Approve the Plan, Not the Result"

```
DIAGNOSIS → PLAN → PLAN VALIDATION → ◆ HUMAN APPROVAL (plan) → EXECUTION → VERIFICATION → PR

The user approves:
┌──────────────────────────────────────────┐
│ Step 1: Extract helper (3 files, LOW)    │
│ Step 2: Remove dupes (5 files, LOW)      │
│ Step 3: Break circular (MED)             │
│                                          │
│ [Approve all] [Steps 1-2] [Edit]         │
└──────────────────────────────────────────┘
```

### Pattern: "Trust Escalation"

```
Week 1:  "Show problems" (diagnosis only)                Trust: 0→1
Week 2:  "Suggest a plan" (+ plan, no execution)         Trust: 1→2
Week 3:  "Do one step" (approval for 1 of 4)             Trust: 2→4
Week 4:  "Do the full plan" (approval for all steps)     Trust: 4→6
Week 6:  "Go ahead, I'll review the PR" (post-hoc review) Trust: 6→8
Week 10: "Every Monday automatically" (scheduled)         Trust: 8→9
```

The system **never escalates autonomy on its own** — only the user decides. On problems — automatic de-escalation: "The last PR had issues. Restore approval before implementation?"

## Telegram Dev Process (OpenClaw)

### Ideal Path in Messenger

```
User: "Add photo upload for sellers. Up to 5MB, S3."

Bot: "Accepted. 7 stages, branch feat/seller-photo-upload. [Start]"

Bot: "Stage 1/7: Analysis — done. 3 upload endpoints, multer→sharp→S3 pattern"
Bot: "Stage 2/7: Design — done. 2 endpoints, ~1000 lines"

Bot: "Decision required.
    Design ready: 5 files, ~1000 lines, 1 recommendation (rate limit).
    [Approve] [Approve + rate limiting] [Edit] [Reject]"

User presses [Approve + rate limiting]

Bot: "Stage 4/7: Implementation 75%"  (edit message)

Bot: "PR #234 ready. 2,400 lines, 9 tests, 0 critical.
    [Open PR] [Run another task]"
```

### Key UX Decisions for Messenger

| Decision                                         | Why                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Edit message** for progress                    | Chat does not get cluttered, one message gets updated                        |
| **Sound only on: decision / completion / error** | Do not spam the user with intermediate updates                               |
| **Inline buttons, not text commands**            | One tap, not "type approve"                                                  |
| **Timeout with default**                         | "If you don't respond within 30 min — I'll continue with the recommendation" |
| **Messenger for decisions, web for details**     | "Details" button opens the full report in browser                            |

---

## Related Documents

| Document           | Contents                               |
| ------------------ | -------------------------------------- |
| `docs/JTBD.md`     | Pure user needs map (product-agnostic) |
| `docs/STRATEGY.md` | Product interpretation and roadmap     |
| `docs/BRAND.md`    | Positioning, tone of voice             |
