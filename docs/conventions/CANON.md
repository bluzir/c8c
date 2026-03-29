# CANON

> When this document conflicts with any other spec, this document wins.

Single source of truth for c8c product decisions. All specs, plans, and implementation work must conform to it. If something is not covered here, the strategy specs (listed in Section 13) apply. If those conflict with each other, raise it here.

**[Current focus] R2.5 Eval Data Layer + Iteration Loop.** Dev and Content guided experiences are shipped. Marketing and Courses remain library-only. The underlying patterns (flows, steps, checks, approvals, typed results) are domain-agnostic by design. Content design spec: `docs/superpowers/specs/2026-03-23-content-guided-experience-design.md`.

---

## 0. Current Focus

> This section is the FIRST thing to read. It says where we are, what to do next, and why.
> Update this section as things get done. Everything else in CANON is stable rules.

### 0.1 Where we are now (facts)

**Done:**

- Dev guided experience — full (routing, intents, spine, continuation, quality loops, approval surfaces, reopen bookmarks, MCP integration registry)
- Content guided experience — full (routing, intents, domain context, router destination registry, spine, continuation)
- 3 domain modes (dev/content/courses) with template libraries
- Runtime shell with resume, blocked, running, completed states
- All 16 NSM moves completed (archived: `docs/specs/historical/2026-03-23-nsm-moves-archive.md`)

**Done (2026-03-24):**

- Crash recovery — seamless resume after app close (persist manifest, startup scan, interrupted UI)
- QA audit Wave 1 (5 P1/critical P2) + Wave 2 (10 P2) — fixed. Registry: `docs/superpowers/specs/2026-03-24-qa-audit-findings.md`
- Intent context — user's original request flows through all nodes via `WorkflowInput.context`
- Prompt priority — node prompt is "YOUR TASK", skill is "methodology reference"
- Deep research v2 — dual researcher (web/reddit), source evaluation, topic-scout pre-split
- Template design guide — `docs/conventions/TEMPLATE-DESIGN-GUIDE.md`
- All 5 Canon ship blockers (Section 8) verified SHIPPED

**In progress:**

- Content guided experience — routing agent, intents, domain context

**Roadmap** (validated by Karpathy + Huang thesis analyses, grounded against JTBD scenarios and segments)

All waves framed through user experience, not internal engineering. Everything under the surface is hidden orchestration. User sees: input → result, with smart behavior in between.

---

**Wave 1: "Flow стал умнее и сам чинится"** — **90% shipped**

Already done:

- ✅ Eval persistence across runs (`improvement-store.ts`, evidence.jsonl, per-run scores/thresholds)
- ✅ Pass-rate surfacing + improvement recommendations (`HistoryTab.tsx`, per-variant success rates)
- ✅ macOS notifications on approval/completion/human-task (`workflow-notifications.ts`, dock bounce, window flash)
- ✅ Evaluator auto-retry with fix_instructions injection (workflow-runner, `maxRetries` + `retryFrom`)
- ✅ Evaluator override button (step log, `EvalResultsSection`)
- ✅ `evaluator_save_rate` / `gate_pass@1` metrics derivable from persisted evidence

Remaining:

- **Promote eval exhaustion to first-class blocked state.** Currently eval override is a button buried in the step log tab. Approval nodes get: modal dialog, queue sidebar, toast, macOS notification, keyboard shortcut. Eval exhaustion should get the same treatment — it IS the "system tried everything and needs you" moment. Route eval-exhausted through the same notification/badge/queue pipeline as approvals. Effort: S-M.
- **"Close call" badge** on near-threshold scores (optional, S effort — informational badge, flow doesn't pause)

JTBD: HiL audit confirmed design is correct — 0-1 human decisions per average flow (sparse, strategic). The one gap is eval exhaustion visibility.

---

**Wave 2: "Flow можно сохранить, отдать, найти готовый"** — R2.5, ~2 weeks (parallel with Wave 1)

What the user sees change:

- Export flow → file. Colleague: Import → flow works
- App closed during run → reopened → "Flow was at step 3/5 — [Continue]"
- ClawHub: browse and install community flows with one click
- "I need a skill that reviews TypeScript for security" → generated and attached
- Project has `.claude/commands/` → c8c auto-discovers and offers them
- Before Run: "This flow will use ~X tokens." After Run: token count in summary

Under the hood: YAML format stability contract (v1 backward-compatible forever), `c8c-format: 1` header for measurability, crash recovery (persist manifest, startup scan, interrupted UI with "Continue"), MCP server manifest, freeze `human` node from creation UI, companion metric `workflows_in_wild`.

JTBD coverage: E4 (share flow), F4 (import template), S1-S3 (crash/close/resume), E5 (install from ClawHub), M6 (token anxiety). Serves segments 1-4. New scenarios: Git-Native Flow Distribution, Import Flow from Shared File, First-Time ClawHub Publication.

Progressive autonomy presets — flow-level trust config (conservative / balanced / autonomous) controlling default gate behavior. Suggest improvement after run — system proposes concrete changes based on eval metrics, user approves with one click.

---

**Wave 3: "c8c учится из моего опыта"** — R3 Early, ~1-2 months

What the user sees change:

- "This skill passes 90% of the time — reliable" (per-skill health visible)
- "This skill fails often on TypeScript — consider adjusting" (actionable insight)
- Per-project quality defaults: "production = strict, prototype = relaxed"
- Community gallery: curated flows to browse and import
- Harness users: `.claude/commands/` auto-converted to c8c flows with quality gates

Under the hood: eval history as first-class object, quality profile per project, community gallery (curated, read-only), harness import bridge (gstack first), capability taxonomy (2-of-3 security, design-time warnings), consolidate `human` into `approval` with form mode.

JTBD coverage: M12 (debuggability over time), M13 (A/B compare configs), E6 (harness migration). Serves segments 1-3. New scenarios: Gallery Browse, Project Quality Calibration.

---

**Wave 4: "c8c работает даже когда я не смотрю"** — R3 Late, ~2-3 months

What the user sees change:

- 3 flows running, 2 need decisions → single queue: "Review findings: approve? Audit severity: override?" → cleared in 30 seconds
- "Prompt B works 20% better than A — promote?" (variant comparison)
- OpenClaw: flows run on schedule, results arrive via Telegram

Under the hood: operator control plane (decision queue, approval routing, idle detection), self-improving harness (observe: variant comparison, run evidence), OpenClaw Telegram bridge.

JTBD coverage: O1 (what's running), O3 (parallel runs), Manual Flow Chaining (#12). Starts serving segment 4+ (Developer-Consultant with multiple clients). New scenarios: Decision Queue, Judgment Carry-Forward.

---

**Vision: R4+** — track, don't act

- "Describe what you want, c8c handles everything" (zero-graph, point-B auto-composes)
- Per-node model tier optimization (cheap tokens for drafting, premium for eval)
- Node type reduction (simplify architecture, user never notices)
- "Operator → Architect" — product identity evolution
- 1B market entry (web, zero-install) — after 30M proven

**Not working / incomplete:**

- Marketing remains library-only
- Courses remain library-only

### 0.2 Path to NSM

**NSM:** share of point-B requests that reach a named result without graph literacy.

16 moves completed across 4 phases (primary path → surface clarity → durable memory → async). Full archive: `docs/specs/historical/2026-03-23-nsm-moves-archive.md`.

**Current focus:** Wave 1 remaining (eval exhaustion promotion) → Wave 2.

**HiL audit finding (2026-03-24):** Human-in-the-loop design is correct. 0-1 human decisions per average flow. Evaluator auto-retries with fix_instructions are the feedback loop — human needed only on strategic approvals and eval exhaustion (last resort). One gap: eval exhaustion notification parity with approval nodes.

### 0.3 What we're NOT doing (and why)

| Skip                                | Why it doesn't improve NSM now                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory as primary UX               | Single point-B → result first. Factory = scale story after path works                                                                                                                                             |
| Operator dashboard / control plane  | Single-path clarity first. Parallel ops after async runtime (R4)                                                                                                                                                  |
| Auto-mutating flows                 | Self-observing first (R3), self-improving with approval later (R4). **Boundary:** "suggest improvement after run" (R2.5) is NOT auto-mutation — system proposes, human decides. Only _silent_ mutation is banned. |
| Generic integrations / "become n8n" | Repo-adjacent first (PR, issues, docs). Generic = scope death                                                                                                                                                     |
| Multi-user collaboration            | Single operator. Team features = R5+ if ever                                                                                                                                                                      |

### 0.4 Known tensions and their resolution

Surfaced by cross-doc audit 2026-03-23. Status tracked here.

1. **Continuation scope** | Status: **design spec ready — implementation next**
   - Job: "I left the cafe, came home, want to finish what I started."
   - R2 must persist: last result + current position + next step suggestion. Not full R3 case model — a "bookmark."
   - Cross-session resume = R2 requirement, not deferred to R3.
   - Full durable case model (artifacts survive as product memory) remains R3.
   - **Design spec:** `docs/superpowers/specs/2026-03-24-crash-recovery-design.md` — seamless resume after app close. Persist in-flight manifest, startup scan, interrupted verdict UI with "Continue" button, full resume for all topologies via `rerunFromNode`.

2. **Typed result vocabulary** | Status: **fixed**
   - `KnownArtifactKind` already has 30+ types including marketing/content (`trend_digest`, `editorial_calendar`, `draft`, `content_brief`).
   - Problem: templates were missing `contractOut` and related metadata, so results stayed too generic and auto-chaining broke.
   - Fix: template normalization pass completed. Built-in templates now declare `contractOut`, `recommendedNext`, and `suggestedTools`.

3. **"Must show" in specs** | Status: **fixed**
   - R2-QUALITY-LOOPS: 2 edits (iteration delta, iteration count → accessible)
   - R3-DURABLE-GATE: 4 edits (audit trail, display list, requirements → accessible)

4. **Cross-flow handoff** | Status: **fixed**
   - `WorkflowCreateContinuationCard` + `recommendedNext` + contract matching now run on normalized template metadata.
   - Auto-suggested next steps work from saved typed results, not only from live session state.

5. **Continuation recommendation** | Status: **fixed**
   - `recommendedNext` arrays + contract satisfaction check in `deriveWorkflowCreateContinuations()` are now backed by normalized built-in template metadata.
   - No agent needed — template graph is pre-authored and the data gap is closed.

6. **Human-in-loop speed vs safety** | Status: **resolved — progressive autonomy**
   - Tension: approval gates = quality guarantee, but also = latency bottleneck. Trend pressure ("get humans out ASAP") means competitors offering full-auto mode will attract speed-seeking users. Source: Diamandis thesis analysis #12 (Salem's organizational singularity).
   - Resolution: progressive autonomy presets (conservative/balanced/autonomous). User controls the tradeoff, not the product. Default = balanced. This is NOT auto-mutation — it's gate behavior configuration.
   - The human role remains "sparse strategic correction" (CANON 2.1.1), not watchman/babysitter. The presets shift WHERE on the spectrum the user sits, not whether human judgment matters.

7. **Moat durability** | Status: **acknowledged — template ecosystem is the answer**
   - Tension: evaluator nodes, splitter/merger, YAML portability — all mechanically simple, copyable in weeks. Cursor/Windsurf with 10M users adds "workflow mode" and c8c loses on distribution. Source: Diamandis thesis analysis #14.
   - Resolution: runtime mechanics are not the moat. The moat is the **domain-authored knowledge layer**: calibrated templates with contractOut/recommendedNext, 36+ typed result kinds (KnownArtifactKind), 4 domain-specific router prompts, and evaluator criteria tuned per domain. Each new domain with quality templates increases this moat nonlinearly. Community template sharing (R3) compounds it.
   - Companion metric: `evaluator_save_rate` — quantifies trust ("c8c caught X% bad outputs"). Defensible data, not defensible code.

8. **Platform risk — Anthropic as competitor** | Status: **acknowledged — insurance in R3**
   - Tension: c8c is software layer on top of Anthropic software layer. Pattern: community validates demand → Anthropic ships native (happened with Agent Teams Feb 2026). If Anthropic ships native workflow orchestration, c8c is redundant.
   - Mitigation (R3): partial cross-model support as insurance (e.g. OpenAI for skill nodes, Claude for eval). Not full portability — just enough that provider switch is cheap if needed.
   - Mitigation (now): make c8c valuable _to_ Anthropic — demonstrate that Claude CLI + orchestration = measurable productivity gain. Showcasing, not competing.
   - Counterargument: Anthropic benefits from third-party orchestration (increases compute consumption). AWS didn't kill Terraform. Platform providers rarely build opinionated tooling.

### 0.5 NSM reminder

**Primary:** share of point-B requests that reach a named result without graph literacy.

Every proposed change must reduce a specific drop-off in the point-B → result funnel. If it doesn't → it doesn't belong.

---

## 1. Vocabulary Decree

### 1.1 Shipped UI terms

These are the ONLY product terms a user should encounter in the interface:

| UI Term                | Meaning                                                                     | Where it appears                                                                                                |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **flow**               | An executable chain of steps the user can see and follow                    | Sidebar, headers, runtime shell, command palette                                                                |
| **step**               | One unit of work inside a flow                                              | Runtime shell, progress indicators, continuation                                                                |
| **starting point**     | A curated job entry in the create surface                                   | Create surface, library                                                                                         |
| **skill**              | A reusable capability attached to a step                                    | Step detail panels, customization (secondary context only — not in primary create flow or default runtime view) |
| **check**              | An automated decision point (system decided)                                | Runtime shell, step status                                                                                      |
| **approval**           | A human decision point (user must decide)                                   | Approval cards, runtime shell                                                                                   |
| **flow rules**         | User-readable policy governing a flow                                       | Pre-launch preview, settings                                                                                    |
| **thread**             | A conversation grouping that owns one or more flow runs                     | Sidebar, headers, panel toggles                                                                                 |
| **run**                | One execution of a flow                                                     | Status indicators, history, sidebar                                                                             |
| **result** (with type) | The output of a completed step — always with type name in specific contexts | Result surface, continuation cards. Generic: "result". Specific: "Review findings", "Codebase map"              |

### 1.2 Code / internal terms

These exist in code, specs, and developer conversations. They must not appear in shipped UI:

| Internal Term         | What It Maps To    | Notes                                                                                                 |
| --------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| workflow              | flow               | Graph definition (nodes + edges)                                                                      |
| stage / phase         | step               | Delivery spine segment                                                                                |
| template              | starting point     | Predefined workflow YAML                                                                              |
| process               | flow (holistic)    | Full delivery spine run from entry to exit                                                            |
| factory               | (no UI equivalent) | Backing model for flow lifecycle; behind feature flag; unproven                                       |
| case                  | (no UI equivalent) | Persistent state of one flow run; behind feature flag                                                 |
| chain                 | (no UI equivalent) | Legacy name, fully retired                                                                            |
| capability            | skill              | Never shipped; use "skill"                                                                            |
| gate                  | check or approval  | Depends on outcome type (see Section 1.1)                                                             |
| evaluator             | check              | The node type that performs automated quality decisions                                               |
| artifact              | result (with type) | Results carry visible type info: "Review findings", "Verification report" — never the word "artifact" |
| chat                  | thread             | Internal entity (Chat, ChatRun, chatId); UI always says "thread"                                      |
| session               | thread             | Never shipped; use "thread"                                                                           |
| conversation          | thread             | Never shipped; use "thread"                                                                           |
| policy                | flow rules         | Preset rule sets governing automation and approval                                                    |
| `auto` (helpModeHint) | (no UI label)      | Internal enum value meaning "no mode selected"; UI shows no-selection state, not the word "Auto"      |

### 1.3 Banned in UI

The following terms must not appear in any user-facing surface (labels, headers, tooltips, placeholder text, status messages):

`workflow`, `template`, `process`, `stage`, `phase`, `factory`, `case`, `chain`, `capability`, `spine`, `delivery pack`, `gate`, `artifact`, `pipeline`, `orchestration`, `engine`, `autonomy level`, `trust score`, `chat`, `session`, `conversation`

### 1.4 Typed results

Banning "artifact" does not mean losing type information. Results carry visible type names in the UI. Result types are domain-specific — each domain defines its own type vocabulary.

Development examples:

- "Review findings" (not "artifact" or just "result")
- "Verification report"
- "Implementation patch"
- "Codebase map"

Marketing / Content will define equivalent type names (e.g., "Audience segment map", "Campaign brief", "Draft outline") when their starting points ship.

The UI label is always "result" in generic contexts, but when showing a specific output, the type name is displayed. This preserves the contract semantics that steps produce typed outputs consumed by downstream steps.

### 1.5 Vocabulary migration

**P0 — immediate (next code pass):** All primary navigation labels, page headers, and primary action buttons. These are the first things a user reads:

- "Start a process" → "Start a flow"
- "Process name" → "Flow name"
- "Creating process" → "Creating flow"
- "Attach capability" → "Attach skill"
- Tab labels, sidebar items, empty states

**P1 — with next feature touch:** When a file is modified for any reason, migrate all user-facing strings in that file.

**P2 — sweep:** Remaining UI strings in untouched files.

**Scope:** Full sweep identified ~194 violations across ~35 renderer files. Breakdown by banned term: workflow (46), gate (47), stage (45), process (25), artifact (24), template (5), capability (2). Heaviest files: `useToolbarActions.ts`, `FactoryOperationsView.tsx`, `useFactoryData.ts`, `ApprovalDialog.tsx`, `ArtifactsPage.tsx`, `workflow-entry.ts`.

**Enforcement:** CI runs `npm run canon:check`, an AST-based guard over `src/renderer/` user-facing strings (JSX text, copy props, and toast/error messages). The gate blocks canon vocabulary violations.

---

## 2. Entry Model

### 2.1 One surface, one model

The create surface is a **composer with a router inside**:

```
User types point B in composer
         |
    Optional: user selects intent (Do / Plan / Review)
         |
    Router decides first step (agent)
         |
    Lands in chosen step shell
         |
    User explicitly presses Run
```

- **Router** is the default. User writes what they want, system chooses the best starting point.
- There is no "Auto" label in the UI. The default state (no intent selected) means "system decides." The intent selector starts with nothing pressed. Pressing an already-selected intent toggles it off (back to default).
- **Chat / agent-assisted creation** is a secondary path: "Create with agent" or "Customize" in overflow. It is not the primary create IA.

### 2.1.1 North star interpretation

The create and runtime model compresses to one sentence:

> Open -> describe point B -> get result. Pipe under the hood.

This sentence is not marketing garnish. It is the operating constraint for product decisions:

- The product must deliver value before demanding graph literacy or builder understanding.
- The hidden machinery may be sophisticated, but the visible path must stay result-first and legible.
- The intended human role is **sparse strategic correction** at explicit checks and approvals, not constant supervision.
- The product must not drift into zero-human-autonomy framing. Human judgment stays first-class at high-leverage decisions.
- "Run first, understand later" beats "study the machinery before you see value."

#### Strategic framing

c8c is a "bigger IDE" where the basic unit of interest shifts from file to flow/agent. The human role is sparse strategic correction at high-leverage checkpoints — not constant supervision and not zero-human autonomy. We take the process-centric, command-center mindset; we reject the "AI employee" fantasy, dashboard theater, and removing human judgment from high-stakes decisions.

#### Secondary operating principles

These follow from the north star but apply to later release layers (R3+). They are recorded here so future specs don't reinvent them:

- **Operator throughput is a secondary goal, not the primary one.** The primary metric is point-B-to-result completion. Parallel runs, concurrent approvals, and idle detection are R4+ concerns that must never compete with the single-path clarity of R2.
- **The product must help the user formulate a good point B.** Routing a weak ask well is not enough. The composer should surface missing context, constraints, and quality bar expectations before the run starts — compact chips and short forks, not a form or a prompt-engineering school. "Make a good run easier than a bad run."
- **Self-improving flows require self-observing flows first.** Before the system can recommend recipe/policy/prompt improvements (R4+), it must persist run evidence: check outcomes, retries, chosen paths, human edits, continuation success (R3). Promotion of a variant is always an explicit human action, never silent mutation. **Exception (R2.5):** "suggest improvement after run" is allowed — propose concrete changes based on eval metrics, user approves with one click. This is recommendation, not mutation.
- **Autonomy is a spectrum, not a binary.** The product must not force "always human" or "always auto." Progressive autonomy presets (conservative/balanced/autonomous) let the user choose their comfort level. The human role stays "sparse strategic correction" regardless of preset — the presets control WHERE checks require human attention, not WHETHER human judgment matters.
- **Expansion beyond repo-local work starts with repo-adjacent digital operations.** The first external systems are PRs, issues, docs, browser QA, research sources, and messaging-based approvals/delivery. This product must not drift into generic automation mesh or n8n-style integration sprawl.
- **Execution detail must stay secondary to the current decision surface.** Verbose streaming logs and step-level chatter must not drive whole-shell renderer churn or displace the current result/status/action grammar. Future implementation work is tracked in `docs/specs/active/2026-03-24-renderer-execution-event-batching-spec.md`.

### 2.2 Intent layer (Do / Plan / Review)

Do / Plan / Review are **first-class user intents**, not router hints:

| Intent        | Meaning                          | Router constraint                                                                                                                   |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Do it**     | Execute the change               | Router must prefer execution-oriented steps. Must not route to plan-only paths.                                                     |
| **Plan it**   | Prepare a plan without executing | Router must prefer planning steps. Must not silently proceed to implementation. Plan is a full first-class mode, not diminished Do. |
| **Review it** | Critique/verify existing work    | Router must prefer review-oriented steps. Only valid when review context exists.                                                    |

**Rules:**

- When user selects an intent, it is a **hard constraint** the router must honor, not a soft bias.
- The same point B with different intents must produce different paths and different output promises.
- The intent layer is visible on the create surface as a compact selector (segmented control), not explained with long text.
- Intent is shown for Development and Content domains. Marketing / Courses may add intents later.

### 2.3 Disambiguation fork

When agent confidence is below threshold, the system surfaces a short fork.

**The fork presents intent-level choices** ("Do it / Plan it / Review it"), not starting-point-level choices. The user decides what kind of help they want; the router then picks the best starting point for that intent.

Exception: when the ambiguity is between genuinely different job domains (e.g., "review" could mean code review or UI audit), the fork may present 2-3 job-level options. But intent fork is the default.

This is NOT a catalog. It is a disambiguation moment.

### 2.4 Routing contract

The router receives: `point B description` + `domain context` + `optional intent override`.

Domain context is domain-specific. The router contract accepts it as an opaque input; each domain's routing agent interprets it.

**Development** domain context: **project inspection** (git state, manifests, file density, project kind).

**Content** domain context: **content state** (previous content typed results and their age, content templates previously run, available MCP tools for research). Full spec: `docs/superpowers/specs/2026-03-23-content-guided-experience-design.md` §3.

The router returns: one recommended starting point + up to 2 alternates + reason + confidence.

**Routing is agent-first. No heuristics.**

All routing decisions are made by a bounded LLM agent call. There is no regex/keyword heuristic layer and no post-agent guard layer that overrides agent decisions.

The only programmatic (non-agent) signals allowed are **structural facts** about the project that the agent receives as context:

- Project exists vs. empty directory (no code at all)
- Has git history vs. fresh init
- Project kind detection (frontend, backend, monorepo, etc.)

These facts are **inputs to the agent**, not routing decisions. The agent interprets them. No code path should map a structural fact directly to a template selection without going through the agent.

Agent call is bounded: allowed options are pre-filtered, max 8 turns, 20s timeout, no tool use. This is classification, not generation. The agent must handle requests in any language (English, Russian, mixed).

### 2.5 Router destination registry

Each domain maintains its own registry of router destinations.

**It does NOT define what the user sees as choices.** Users see these entries only when the router recommends one or during a disambiguation fork — never as a browsable catalog on the primary create surface.

#### Development registry

| Job entry            | Internal template          | When router selects it                                    |
| -------------------- | -------------------------- | --------------------------------------------------------- |
| Explore this project | `delivery-map-codebase`    | Existing repo, orientation needed                         |
| Build from brief     | `delivery-shape-project`   | Greenfield or brief-first                                 |
| Plan the change      | `delivery-plan-phase`      | User wants plan before execution, or Plan intent selected |
| Review before ship   | `delivery-review-phase`    | Review-ready context exists, or Review intent selected    |
| Code audit           | `full-stack-code-audit`    | Security/quality review request                           |
| UI polish            | `impeccable-ui-pipeline`   | UI review-and-polish request                              |
| UX audit             | `ux-ui-polish-audit`       | Repo-wide UX/UI audit                                     |
| Visual test          | `playwright-visual-audit`  | Browser-based visual regression                           |
| Fix a bug            | `delivery-investigate-bug` | User reports something broken, incident, crash            |

**`delivery-implement-phase`**: Reachable only via continuation from Plan, not as a direct create entry. The user says "Change the app" → router picks the best _first_ step (often Map or Shape), which then continues into implementation.

**Critical rule:** A job entry is NOT a stage alias. "Change the app" may route through Map → Plan → Implement internally. The router picks the best _first_ step, not the only step.

#### Content registry

| Job entry              | Internal template             | When router selects it                                       |
| ---------------------- | ----------------------------- | ------------------------------------------------------------ |
| Watch trends           | `content-trend-watch`         | Needs evidence base before planning                          |
| Draft posts            | `content-post-drafter`        | Has a source document, needs post drafts — one per topic     |
| Review content quality | `content-qa-review`           | Has a draft, needs quality/tone/slop check                   |
| Build content strategy | `content-pipeline`            | Needs full strategy from product brief → marketing outputs   |
| Repurpose content      | `content-repurposing-factory` | Has existing material, needs it in different formats         |
| Generate text          | `predictable-text-factory`    | Needs structured text output (copy, descriptions, sequences) |
| Check copy quality     | `copy-quality-pipeline`       | Has text, needs quality/clarity/tone evaluation              |

### 2.6 Banned as direct entry

Each domain defines its own ban list. The principle is universal: router routes to coarse job entries, not to internal loop mechanics.

#### Development banned entries

- **Implement** (as direct entry) — reachable only via continuation from Plan or Shape
- **Ship** — requires everything before it
- **Verify** (as standalone) — a loop (verify → fail → fix → verify) that requires both implementation results and review findings as input; cannot be a standalone entry
- **Fix from review feedback** — internal loop sub-step
- **Any loop iteration** (Re-Review, retry, re-verify)
- **Any internal approval sub-step**

**Banned template IDs:**

- `delivery-implement-phase` — reachable only via continuation
- `delivery-verify-phase` — reachable only as part of review/verify loop (Note: `delivery-review-phase` is NOT banned — it is a valid direct entry when review context exists)

#### Content banned entries

- `content-ready-posts` — final assembly, downstream from draft + QA
- `content-distribution-bundle` — packaging, downstream from strategy
- `content-editorial-calendar` — intermediate output of calendar planning flow
- `content-idea-backlog` — internal accumulation, not a user-facing entry

Principle: router routes to **coarse job entries**, not to **internal loop mechanics**.

**Enforcement:** The ban list must be enforced in the router itself (server-side), not only filtered in UI components. A shared constant (`BANNED_DIRECT_ENTRY_TEMPLATES` in `src/shared/constants.ts`) is consumed by both the router (primary enforcement) and UI (defense-in-depth). See agentic-entry-routing-spec Section A3 for implementation detail.

### 2.7 Starting points and library

- **Starting points** in the create surface are curated job entries. They use job language ("Change the app") not internal language ("delivery-implement-phase").
- **Library** (browse starting points) groups entries by jobs, not by internal taxonomy. It is a secondary action, not the primary create path.
- Starting points are contextual: what shows depends on project inspection (greenfield vs existing repo vs review-ready).
- A starting point is a `WorkflowTemplate` with a display wrapper providing job-language label, description, and context conditions. No new data model type needed — the mapping lives in the routing/catalog layer.

### 2.8 Command palette

The command palette (`Cmd+K`) follows the same vocabulary and routing rules:

- Palette entries use job language: "Start new: Plan this feature", not "Run delivery-plan-phase"
- Palette can surface recent flows, starting points, and quick actions
- Palette must not expose raw template IDs or internal stage names

---

## 3. Runtime Shell

### 3.1 Core principle

> Hide structure, show state.

The runtime answers four questions at glance:

1. What is happening right now?
2. What do I need to do?
3. What happens after this?
4. Where is the next button?

### 3.2 What the runtime shows

- **Control header**: flow name, current step (in job language, not internal stage name), status token
- **Current input/result**: the dominant object in the viewport
- **One primary action**: the next thing the user can do (Run, Approve, Continue, View Result)
- **Compact supporting state**: step progress, check/approval status, loop iteration count
- **Step labels** in the runtime must use job-language descriptions ("Reviewing changes", "Checking code quality"), not stage-family names ("Review", "Verify"). A mapping from internal stage IDs to user-facing labels lives in the catalog layer.

### 3.3 What the runtime does NOT show

- Paragraph-level explanations of what the system is doing
- Internal stage names or phase taxonomy as labels
- Graph topology as primary view (canvas is secondary/advanced)
- Raw template IDs or factory metadata
- Autonomy scores, trust levels, or abstract policy language

### 3.4 Loop visibility

Loops (Review → Fix → Re-Review, Verify → Fail → Fix → Verify) are first-class visible structures, not hidden reruns:

- **Current state (primary)**: iteration count, current step within loop, trigger reason ("2 critical findings"), what changed since last iteration
- **Loop history (secondary)**: inspectable but collapsed by default — previous iterations with diffs
- **Exit states** shown as compact tokens: `Passed`, `Needs attention` (escalated to human), `Blocked`, `Stopped`
- **Escalation**: when loop cap is reached, the system escalates to human decision with a clear explanation of what was tried

Development defines two distinct loop types that must remain distinguishable in the UI:

- **Review loop**: critique and polish (quality findings)
- **Verify loop**: validation against contracts (test results, acceptance criteria)

Other domains may introduce domain-specific loop types (e.g., stakeholder approval loops, A/B test loops, editorial review loops). The UI pattern — iteration count, trigger reason, exit states, escalation — applies to all loop types regardless of domain.

### 3.5 Continuation contract

When a step completes and the flow continues, the continuation surface must:

- Show what was just completed (result summary with type)
- Show what happens next (next step name in job language + brief description)
- Provide a clear primary action: "Continue to [next step]" or "Review result first"

Continuation labels use job language. The canonical CTA pattern is **"Continue to [job description]"**:

- "Continue to Check completion" (not "Continue: Verify" or "Next")
- "Continue to Apply approved changes" (not "Continue: Implement")
- "Review before shipping" (not "Review Phase")

The button label is always "Continue to..." not "Next" — "Continue" communicates process continuity, "Next" is generic.

### 3.6 Keyboard baseline

These keyboard interactions are part of shipped UX, not footnotes:

| Shortcut    | Action                                                                           |
| ----------- | -------------------------------------------------------------------------------- |
| `Cmd+Enter` | Submit / Run / Approve (contextual primary action)                               |
| `Cmd+K`     | Open command palette                                                             |
| `Cmd+N`     | New flow                                                                         |
| `Cmd+1..5`  | Switch between recent/open flows (keyboard shortcut, no dedicated rail required) |

All primary frequent actions must be accessible from keyboard. Mouse-only interactions are ship blockers.

---

## 4. Control Model

### 4.1 Two decision point types

| UI term      | Internal term                  | What it means                     | When shown                                        |
| ------------ | ------------------------------ | --------------------------------- | ------------------------------------------------- |
| **check**    | gate (auto-pass / auto-return) | System made an automated decision | After the fact — compact status token with reason |
| **approval** | gate (human decision)          | User must decide                  | Blocking card requiring action                    |

A check says: "The system decided X because Y." An approval says: "You need to decide X. Here's the context."

### 4.2 Approval card (human decisions)

Self-sufficient approval card:

- Flow name and step name (user must know WHICH flow they're approving)
- What step is about to run (name + brief description in job language)
- What input it will use (preview of actual content)
- What result to expect (typed result: "Review findings", not just "result")
- What happens on approve (next step)
- What happens on reject (stop / return to previous step)
- Optional: edit/narrow before continuing

Same component for pre-run confirmation and runtime approval gates.

### 4.3 Check record (automated decisions)

Compact after-the-fact explanation:

- Status token: `Passed`, `Returned to [step]`, `Escalated`
- One-line reason: "0 critical findings" or "3 test failures, returning to fix"
- Expandable detail (secondary)

### 4.4 Flow rules (policy)

Flow rules are user-readable presets governing automation and human involvement:

- Surfaced as readable rules before risky steps: "Continue automatically if 0 critical findings", "Always ask before shipping"
- Preset rules only in R2 (no full rule-builder)
- No abstract language: no "autonomy level", "trust score", "AI mode"
- Development application points: pre-launch, loop continuation, ship readiness. Other domains will define equivalent points aligned to their lifecycle (e.g., Marketing: pre-send, approval loop, publish readiness)

### 4.5 Rules

- Approval must be understandable without any external context
- No paragraph explanations — compact UI elements only
- Same approval component for pre-run and runtime
- Check records must explain WHY the system decided, not just that it did

---

## 5. Domain Model

### 5.1 Domain-parameterized architecture

The guided experience is **domain-parameterized, not dev-hardcoded**:

- Spine model, routing context, intent sets, destination registries, and ban lists are all scoped per domain
- Dev is shipped and stable. Content is in progress. Each new domain plugs into the same patterns — own routing signals, own domain context, own intents

### 5.1.1 North star: user-defined domains

Dev, Content, Marketing are shipped presets. The architecture goal is that a domain is a configurable package:

```
Domain = {
  name,
  spine,              // stage labels and order
  intents,            // Do/Plan/Review or domain-specific
  routerDestinations, // starting points the router can pick
  bannedEntries,      // templates reachable only via continuation
  domainContext,      // what signals the router receives
  placeholderText,    // composer hint
  templates[],        // available templates
}
```

Three operations: **Fork** (customize an existing domain), **Create** (build a new one — "Recruiting", "Sales ops", "Course production"), **Share** (publish via OpenClaw as community package).

We support the **format**, not a fixed list of domains. Shipped domains prove the pattern; community domains extend it. User-defined domains ship when the format stabilizes through at least two shipped presets (Dev + Content).

### 5.2 Domain selector

The create surface includes a compact domain selector:

| Domain          | Guided experience                            | Templates available | Notes                                              |
| --------------- | -------------------------------------------- | ------------------- | -------------------------------------------------- |
| **Development** | Full (routing, intents, spine, continuation) | ~20                 | Shipped and stable                                 |
| **Content**     | Full (routing, intents, spine, continuation) | ~12                 | Shipped guided domain                              |
| **Marketing**   | Library only (browse and pick)               | ~17                 | Templates functional, guided routing not yet built |

- Compact segmented control, not cards. One line, instant switching.
- Switching domain changes: placeholder text, available starting points, available intents, and template filter.
- Marketing templates are real and functional — users can browse and run them. Marketing doesn't get intelligent routing or intent-driven entry yet.
- This is an app-mode switch, not a promotional card with explanation.

---

## 6. Operational Additivity

### 6.1 Relationship to execution specs

CANON governs **vocabulary, entry model, control model vocabulary, and spec hierarchy**. It does NOT replace:

- **R2-EXECUTION-PLAN ship blockers** — all 11 blockers continue to apply. Canon Section 8 is additive context, not a replacement.
- **Design philosophy audit workstreams** — all 9 workstreams (WS-01 through WS-09) continue to apply with their phasing and acceptance criteria.
- **R2-EXECUTION-PLAN acceptance checks** (AC-01 through AC-07) — continue to apply.
- **Density guardrails** from R2-EXECUTION-PLAN Section 2.D — continue to apply: "process map = persistent navigation, not hero section", "loop state = compact operational object", "capability intake = attach-and-return, not marketplace."

When these execution specs use vocabulary that conflicts with CANON (e.g., "stage" instead of "step", "gate" instead of "check/approval"), read the intent and apply canon vocabulary. The operational requirements still hold.

### 6.2 What Canon adds to execution

Canon adds constraints that execution specs must also follow:

- Intent layer (Do/Plan/Review) is first-class, not a router hint
- Starting points are router destinations, not UI catalogs
- Two decision point types (check + approval), not one
- Typed results, not generic "result" everywhere
- Keyboard baseline is ship-blocking
- Vocabulary migration has enforcement (CI gate)

---

## 7. Spec Status Registry

### 7.1 Canon (R2 strategy layer)

These specs are authoritative. They define the system model. When they conflict with CANON on vocabulary, entry model, or control model vocabulary, CANON wins. On everything else, they apply:

| Document                               | Role                          | Notes                                                                                                   |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| R2-VIBECODING-COMPOSER-NORTH-STAR-SPEC | Product thesis                | Simple composer, hidden orchestration                                                                   |
| R2-EXECUTION-PLAN                      | Operational roadmap           | Workstreams, milestones, ship blockers — all apply additively                                           |
| R2-JOB-FIRST-PACKAGING-SPEC            | Packaging philosophy          | Point B + intent + hidden spine                                                                         |
| R2-CREATE-SURFACE-REDESIGN-SPEC        | Historical create UX baseline | Superseded by the March 21 main/templates hierarchy redesign; still useful for composer-first rationale |
| R2-DEV-PROCESS-MAP-SPEC                | Internal spine                | Step families as hidden backbone                                                                        |
| R2-QUALITY-LOOPS-AND-POLICY-SPEC       | Control model                 | Visible loops, readable policy, three gate outcomes                                                     |
| R2-SKILL-DISCOVERY-AND-IMPORT-SPEC     | Skill intake                  | Subordinate to flow-first UX                                                                            |

### 7.2 Canon (operational plans)

| Document                                       | Role              | Notes                                             |
| ---------------------------------------------- | ----------------- | ------------------------------------------------- |
| 2026-03-18 agentic-entry-routing-spec          | Routing model     | Bounded router, coarse job entries                |
| 2026-03-19 design-philosophy-audit-remediation | Audit + execution | 9 workstreams closing philosophy gaps — all apply |

### 7.3 Subordinate (useful detail, must defer to canon)

These contain valid implementation detail but use pre-canon vocabulary and models. Use for context, not as source of truth for product decisions:

| Document                                     | Why subordinate                                                     |
| -------------------------------------------- | ------------------------------------------------------------------- |
| 2026-03-18 run-first-process-entry-spec      | R1 predecessor; vocabulary pre-lock ("workflow", "stage")           |
| 2026-03-15 workflow-chat-first-creation-spec | R1 creation UX; chat-first is now secondary path, not primary model |
| 2026-03-16 flow-first-run-monitor-jtbd-spec  | Long-term runtime vision; factory model is substrate not UX in R2   |

### 7.4 Not R2

These concepts are explicitly out of R2 scope:

- **Factory as primary UX** — substrate only, behind flag, may be deleted
- **Case management / persistent state across runs** — R3+ if factory proves out
- **Marketplace / registry for skills** — explicit scope rejection
- **Full rule-builder for policy authoring** — preset rules only in R2
- **Remote approval inbox** — local-first only
- **Multi-user collaboration** — single operator

---

## 8. What Blocks Ship (Canon-specific)

These are canon-specific ship blockers **in addition to** the R2-EXECUTION-PLAN blockers and design audit workstreams (see Section 6.1):

1. **Vocabulary alignment** — ~~P0 strings migrated, CI gate active for banned terms in new code~~ **SHIPPED.** AST-based `canon:check` blocks 11 banned terms in renderer JSX; integrated into pre-release builds.
2. **Intent layer shipped** — ~~Do/Plan/Review visible as compact selector on create surface, honored as hard constraints by router~~ **SHIPPED.** Dropdown selector with toggle; router enforces intent as hard constraint via `filterOptionsForIntent()`.
3. **Two decision point types** — ~~checks (automated) and approvals (human) are distinct in UI, not collapsed into one pattern~~ **SHIPPED.** `ApprovalDialog` for human decisions, `ExecutionLoopCard` for automated checks. Visually distinct icons, badges, outcomes.
4. **Continuation in job language** — ~~continuation labels read as next jobs, not stage names~~ **SHIPPED.** "Continue to [job label]" pattern; `getRuntimeNodeLabel()` returns job descriptions, never stage names.
5. **Starting points are not a catalog** — ~~create surface does not display a browsable grid of all starting points~~ **SHIPPED.** Composer-first; suggestions are contextual; "Browse starting points" is secondary overflow action.

---

## 9. Visual Hierarchy (Ship-Blockers)

Five hard rules. Every renderer change must pass all five. Source: DESIGN-PHILOSOPHY.md §8 (absorbed here).

1. **One Figure Per State** — only the primary object gets card treatment (border+bg+elevation). Everything else is flat ground.
2. **≤5 Visible Actions Per State** — excess goes to overflow. One `variant="default"` CTA per state. No dual primary buttons.
3. **Show Only What Matters Now** — no empty tabs, no disabled-but-visible controls, no sections for future states.
4. **One Status Signal Per Fact** — progress, blocked status, current step each appear in exactly one place.
5. **No Cards Inside Cards** — a bordered container never nests another bordered container.

### 9.1 Surface weight ladder

| Level      | What                               | When                                  |
| ---------- | ---------------------------------- | ------------------------------------- |
| 0 — Flat   | No border, no bg, no elevation     | Default for all components            |
| 1 — Tint   | bg tint only, no border            | Grouping, hover states, selected rows |
| 2 — Well   | bg + subtle border or inset shadow | Inset panels, input areas             |
| 3 — Figure | border + bg + elevation            | ONE per state — the primary object    |

### 9.2 Technical detail = secondary by default

Evaluator metrics (score, threshold, attempt, criteria breakdown), flow rules, loop diagnostics — all behind disclosure by default. Primary surface shows: verdict sentence + action + type badge. Technical detail accessible via "Technical details" disclosure.

### 9.3 Thresholds

Two scopes, both apply:

**Per component:**

- ≤1 bordered container per component
- ≤5 clickable elements per component

**Per screen state (across all components):**

- ≤3 bordered containers total
- ≤5 visible actions total
- 0 duplicate status signals
- 0 nested cards (Level 3 inside Level 3)
- 0 rendered-but-empty sections

### 9.4 Before rendering any component

Three questions, all must pass:

1. Does it have content?
2. Does the user need it NOW?
3. Does it duplicate something already visible?

Pass all three → render. Fail any → don't.

---

## 10. Screen Composition

Source: SCREEN-COMPOSITION-GUIDE.md (core principle absorbed here, full guide kept as reference).

### 10.1 One question per screen

Every screen answers exactly one question. Define the question before laying out the screen. If the screen tries to answer two questions, split it.

The question is an internal composition tool, not a UI slogan. Do not print it into everyday runtime surfaces. Primary copy stays compact and operational: status, object, action.

### 10.2 Composition stack

```
Chrome → Context → Verdict (card) → Evidence Panel → Input → Depth
```

- **Chrome**: persistent navigation (sidebar, toolbar, tab bar)
- **Context**: breadcrumbs, status strip, scope indicators
- **Verdict**: the ONE answer to the screen's question (card treatment, Level 3)
- **Evidence**: supporting facts for the verdict (flat, behind disclosure if complex)
- **Input**: composer, form fields, action buttons
- **Depth**: advanced detail, history, graph — accessible but not primary

### 10.3 Three verdict variants

| Variant        | Example                      | Headline style                         |
| -------------- | ---------------------------- | -------------------------------------- |
| **Outcome**    | Pass/fail, completed/blocked | "Passed" / "2 findings need attention" |
| **Diagnostic** | Root cause, findings         | "Memory leak in auth service"          |
| **Document**   | Conclusion + reading surface | "Feature Spec: OAuth integration"      |

---

## 11. Pre-Ship Checklist

Source: NEW-ENTITY-CHECKLIST.md (condensed here, full trace kept as reference).

Before shipping a new surface, component, or runtime state — trace through both directions:

**Top-down (Job → Pixel):**

1. WHO is this for? (segment)
2. WHAT job does it close? (JTBD scenario)
3. WHY now? (prioritization)
4. WHAT to build? (vocabulary, routing, registry)
5. HOW should it feel? (UX principle, visual hierarchy)
6. HOW to compose? (one question, verdict variant, composition stack)
7. HOW it looks? (surface level, hierarchy roles, tone)
8. WHAT to ship? (spec, state, compliance)

**Bottom-up (Pixel → Job):**

- Can you trace from this component → to its question → to the job it closes?
- If any layer has no answer → don't ship it.

**Kill criteria:** Remove entity if it answers no clear question, duplicates another surface, or has no content on the primary path.

---

## 12. NSM & Metrics

Source: PRODUCT-FIT-AUDIT.md §8 (absorbed here).

### 12.1 Primary metric

Share of point-B requests that reach a named result without requiring graph literacy or manual template chaining.

### 12.2 Secondary metrics (phased by release)

- **R2**: completed results per session; share of runs using guided entry vs blank creation
- **R3**: median time-to-next-decision for waiting approvals; runs that advanced while user was away
- **R4**: completed results per operator hour; concurrent waiting items resolved without opening graph

### 12.3 Anti-metrics (what we do NOT optimize for)

- Number of flows created (builder activity, not value delivery)
- Number of node edits (graph literacy, not result-first)
- Token burn / cost-per-run (wrong incentive)
- Time spent in graph editor (advanced layer, not primary path)

### 12.4 How to measure (telemetry events)

NSM is meaningless without observability. These events must exist:

| Event                                                 | What it proves                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `point_b_entered`                                     | User typed in composer and submitted                                                             |
| `routing_completed`                                   | Agent picked a starting point (+ which one)                                                      |
| `routing_alternative_selected`                        | User rejected agent choice, picked alternative                                                   |
| `flow_started`                                        | Run began                                                                                        |
| `step_completed`                                      | One step finished (+ step type, duration, token count)                                           |
| `check_passed` / `check_returned` / `check_escalated` | Quality gate outcome                                                                             |
| `approval_presented` / `approval_resolved`            | Human decision point (+ latency)                                                                 |
| `flow_completed`                                      | Named result reached                                                                             |
| `graph_editor_opened`                                 | User opened ChainBuilder (should be rare — if high, NSM is failing)                              |
| `template_chained_manually`                           | User manually browsed library for next flow (should be rare — if high, auto-chaining is failing) |
| `flow_resumed`                                        | User returned to bookmarked flow                                                                 |
| `continuation_followed`                               | User clicked "Continue to [next flow]"                                                           |

**Derived metrics:**

- `completion_rate` = `flow_completed` / `point_b_entered`
- `graph_escape_rate` = `graph_editor_opened` / `flow_started` (target: <10%)
- `manual_chain_rate` = `template_chained_manually` / `continuation_followed` (target: <20%)
- `approval_latency` = time between `approval_presented` and `approval_resolved`

**Gate reliability metrics (future, R3+):**

- `gate_pass@1` = first-attempt pass rate per evaluator template
- `gate_pass@3` = pass rate within 3 retries (measures retry effectiveness)
- `gate_pass^3` = all 3 attempts pass (measures consistency — catches intermittent failures)
- Track per template, per project. If pass@1 < 50% → threshold likely miscalibrated. If pass@3 ≈ pass@1 → retries not helping, fix the skill not the threshold

---

## 13. Error and Recovery States

Enumerated failure modes with user-facing contract. If a failure mode is not listed here, it is unsupported in current release — show generic error toast.

| Failure                                 | User sees                                                               | Recovery path                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Router timeout** (>20s)               | "Couldn't choose a starting point. Try again." + preserved point-B text | Retry button (same text), or "Browse starting points" fallback                             |
| **Router wrong choice**                 | Normal routed result + "Show alternatives" button                       | User picks from 2-3 alternatives without re-typing                                         |
| **Network drop mid-run**                | Step shows "Connection lost" status                                     | Auto-retry when connection restores. If step was mid-stream, restart step (not whole flow) |
| **Provider unavailable**                | Pre-run check: "Claude/Codex not reachable. Check connection."          | Block run start, don't fail mid-execution                                                  |
| **Template not found**                  | "This starting point is no longer available."                           | Redirect to composer with preserved point-B                                                |
| **MCP server crash**                    | Step shows "Tool unavailable" + continues without that tool             | Result may be degraded. User informed via step status                                      |
| **Skill execution error**               | Step shows "Step failed" + error summary (not stack trace)              | "Retry step" button. If retry fails, escalate to user                                      |
| **App crash mid-run**                   | On reopen: resume header with "Flow was interrupted" + last known state | "Resume" restarts from last completed step, not from scratch                               |
| **Evaluator disagreement** (multi-eval) | Not supported in current release                                        | Document as unsupported. Single evaluator per gate                                         |

---

## 13. Document Index

This section replaces the old Spec Status Registry and serves as the single index of all product documentation.

### 13.1 Tier 1 — Single source of truth

| Document              | Governs                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **This file (CANON)** | Vocabulary, entry model, runtime shell, control model, visual hierarchy, screen composition, NSM, spec hierarchy |
| **CLAUDE.md**         | Repo-level guardrails, path aliases, commands, design tokens                                                     |
| **AGENTS.md**         | Agent-only decision architecture, no-heuristics rule                                                             |

### 13.2 Tier 2 — Living reference (detail behind CANON rules)

| Document                    | Role                                                              | Absorbed into CANON?                                     |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| DESIGN-PHILOSOPHY.md        | Full design system + anti-patterns + copy rules + token reference | §8 hard rules → CANON §9. Rest = reference               |
| SCREEN-COMPOSITION-GUIDE.md | Full composition methodology + verdict patterns + field routing   | Core principle → CANON §10. Full guide = reference       |
| COMPONENT-AUDIT-PLAN.md     | Per-component audit template + component registry                 | Thresholds → CANON §9.3. Audit template = reference      |
| NEW-ENTITY-CHECKLIST.md     | Bidirectional 8-layer trace                                       | Condensed → CANON §11. Full trace = reference            |
| DAY-30-OPERATOR-CONTRACT.md | Daily-driver UX expectations for mature product                   | Key principles already in CANON §3. Document = reference |
| UX-SCENARIOS.md             | 9 scenarios → 4 meta-patterns (pattern library)                   | Reference only                                           |
| HUB-WRITING-GUIDE.md        | Template card copy formula                                        | Reference only                                           |

### 13.3 Tier 3 — R2 strategy specs (authoritative, additive to CANON)

| Document                               | Role                                                                           | Status |
| -------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| R2-VIBECODING-COMPOSER-NORTH-STAR-SPEC | Product thesis                                                                 | Active |
| R2-JOB-FIRST-PACKAGING-SPEC            | Packaging philosophy                                                           | Active |
| R2-DEV-PROCESS-MAP-SPEC                | Internal spine                                                                 | Active |
| R2-QUALITY-LOOPS-AND-POLICY-SPEC       | Control model detail                                                           | Active |
| R2-SKILL-DISCOVERY-AND-IMPORT-SPEC     | Skill intake (**subordinate to flow-first UX — skills are secondary context**) | Active |

### 13.4 Tier 4 — Operational plans (tactical, living docs)

| Document              | Role                                            |
| --------------------- | ----------------------------------------------- |
| R2-EXECUTION-PLAN.md  | 11 ship blockers + 6 workstreams + 5 milestones |
| R3-EXECUTION-PLAN.md  | R3 tactical roadmap                             |
| RELEASE-ITERATIONS.md | Release sequencing (R0→R5)                      |
| RELEASE-DETAILS.md    | Per-release 8-section taxonomy                  |

### 13.5 Tier 5 — Implementation specs (audited 2026-03-23)

Each spec must conform to CANON on vocabulary and visual hierarchy.

**Done (move to `docs/specs/implemented/` when convenient):**

| Spec                                                 | What                                                        | Status |
| ---------------------------------------------------- | ----------------------------------------------------------- | ------ |
| 2026-03-21-audit-follow-up-remediation-spec          | Provider settings, Codex subprocess, files IPC, infra tests | DONE   |
| 2026-03-21-workflow-page-hierarchy-redesign          | Runtime shell hierarchy (phases 1-3)                        | DONE   |
| 2026-03-23-headless-execution-verification           | Headless runner, OpenClaw compat, CLI — 79% match           | DONE   |
| 2026-03-21-component-audit-findings                  | Workflow shell, sidebar, history cleanup                    | DONE   |
| 2026-03-21-entry-state-contracts                     | 4 shared decision contracts                                 | DONE   |
| 2026-03-21-execution-boundary-hardening-spec         | Path validation, window ownership, CSP, MCP                 | DONE   |
| 2026-03-21-main-and-templates-hierarchy-redesign     | Start surface + library hierarchy                           | DONE   |
| 2026-03-21-onboarding-and-sidebar-hierarchy-redesign | Onboarding + sidebar flattened                              | DONE   |
| 2026-03-21-ux-ui-polish-remediation-plan             | Renderer remediation steps 1-5                              | DONE   |

**Partial (infrastructure exists, completion unverified):**

| Spec                                                   | What                                            | Gap                                                                        |
| ------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-03-22-architecture-reliability-dx-audit           | Arch audit + reliability findings               | YAML validation done; rate-limit backoff, double-run race, CSP unaddressed |
| 2026-03-22-cross-flow-handoff-and-fresh-start-contract | Cross-flow vs fresh-start isolation             | Continuation infra exists; fresh-start pollution unclear                   |
| 2026-03-22-jtbd-audit-follow-up-remediation-spec       | JTBD audit: transition states, approval context | Fixes coded; full validation needed                                        |
| 2026-03-22-outputpanel-settings-lab-composition        | OutputPanel/Settings/Lab composition            | Components exist; composition audit incomplete                             |
| 2026-03-23-template-normalization-audit                | Map 61 templates to stage families              | Type system ready; template assignment completeness unknown                |
| R2-QUALITY-LOOPS-AND-POLICY-SPEC                       | Loops, gates, policy as visible UI              | Gates/loops infra exists; full visibility unverified                       |
| R2-SKILL-DISCOVERY-AND-IMPORT-SPEC                     | Skill discovery/attachment                      | Sourcing/picker exist; discovery ranking unverified                        |
| R2-VIBECODING-COMPOSER-NORTH-STAR-SPEC                 | Simple composer, hidden orchestration           | Composer-first evident; stage-name leakage unverified                      |
| R3-ARTIFACT-AND-CASE-MODEL-SPEC                        | Durable artifacts, case identity                | Stores exist; "product memory" claim unvalidated                           |
| R3-CONTINUATION-AND-READINESS-SPEC                     | Continuation survives time                      | Ready logic coded; full lifecycle untested                                 |
| R3-DURABLE-GATE-STATE-SPEC                             | Gate outcomes durable + audit trail             | Gate persistence coded; audit trail completeness unclear                   |

**Active (goals defined, implementation pending):**

| Spec                             | What                                       |
| -------------------------------- | ------------------------------------------ |
| R2-DEV-PROCESS-MAP-SPEC          | 6 universal stage families in UI/routing   |
| R2-JOB-FIRST-PACKAGING-SPEC      | Point-B language over internal stage names |
| 2026-03-23-skill-metadata-schema | stageFit/keywords in skill frontmatter     |

**Stale (archive):**

| Spec                        | Why                                                           |
| --------------------------- | ------------------------------------------------------------- |
| 2026-03-22-cto-priority-map | Status snapshot, not implementation spec — move to historical |

### 13.6 Tier 6 — Research & reference

`docs/research/` (JTBD, STRATEGY, PRODUCT-FIT-AUDIT, segment) — facts and context, not rules.
`docs/reference/` (BRAND, REFERENCES, COMMUNICATION) — positioning and framing.

### 13.7 Tier 7 — Historical (archive)

`docs/specs/historical/` — pre-R2 specs. Explicitly subordinate (pre-canon vocabulary). Context only.

### 13.8 Resolution rule

When any two documents conflict:

1. CANON wins on vocabulary, entry model, control model, visual hierarchy, NSM
2. R2-EXECUTION-PLAN wins on operational sequencing and ship blockers
3. Dated implementation specs win on surface-specific detail
4. Everything else is context, not authority

---

## 14. Decision Log

| Date       | Decision                                             | Context                                                                                                            |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-03-19 | `flow` over `process` in shipped UI                  | Closer to n8n mental model, lighter, less enterprise                                                               |
| 2026-03-19 | `step` over `stage` in shipped UI                    | Simpler, more natural                                                                                              |
| 2026-03-19 | No "Auto" label in UI                                | Default = no mode selected, system decides                                                                         |
| 2026-03-19 | Factory = substrate, not UX                          | Unproven model, behind flag, took what we could                                                                    |
| 2026-03-19 | Chat-first = secondary path                          | "Create with agent" in overflow, not primary IA                                                                    |
| 2026-03-19 | Coarse job entries only                              | Router never routes to internal loop steps                                                                         |
| 2026-03-19 | One approval primitive                               | Same component for pre-run and runtime gates                                                                       |
| 2026-03-19 | Do/Plan/Review = first-class intent, not router bias | Hard constraint when selected, not soft suggestion                                                                 |
| 2026-03-19 | `check` + `approval` as two distinct UI concepts     | Automated decisions and human decisions need different surfaces                                                    |
| 2026-03-19 | Section 2.5 is router registry, not UI catalog       | Users never see all starting points as a grid                                                                      |
| 2026-03-19 | Canon is additive to execution specs                 | Canon does not replace Execution Plan blockers or audit workstreams                                                |
| 2026-03-19 | Implement banned as direct entry                     | Reachable only via continuation from Plan/Shape                                                                    |
| 2026-03-19 | `skill` is secondary context only                    | Not in primary create flow or default runtime view                                                                 |
| 2026-03-19 | Typed results preserve contract semantics            | "Review findings", not just "result"                                                                               |
| 2026-03-19 | Dev = R2 proving ground, not the only domain         | Architecture domain-parameterized; Marketing/Content templates available but guided experience ships for Dev first |
| 2026-03-19 | All domain-specific specs labeled as such            | Spine, routing registry, ban list, loop types, flow rule application points — all scoped per domain, not universal |
| 2026-03-23 | R2-CANON → CANON                                     | Product-level source of truth, not release-specific. Release-specific scope marked as `[Current focus]`            |
| 2026-03-23 | Design rules absorbed into CANON §9-§11              | Visual hierarchy, screen composition, thresholds, pre-ship checklist consolidated from 4 convention docs           |
| 2026-03-23 | NSM absorbed into CANON §12                          | Primary metric, secondary by release, anti-metrics — from PRODUCT-FIT-AUDIT                                        |
| 2026-03-23 | §0 Current Focus added                               | Living section: where we are, next moves, why each move matters for NSM                                            |
| 2026-03-23 | Full spec audit + Document Index §13                 | Every spec classified: DONE/PARTIAL/ACTIVE/STALE with gaps listed                                                  |
| 2026-03-23 | docs/ fully in .gitignore                            | No docs in git until localized to English                                                                          |
| 2026-03-23 | MCP Integration Registry decision                    | §15 — universal registry, no hardcoded providers in renderer                                                       |

## 15. MCP Integration Model

> The agent edits `.mcp.json`. That's the whole model.

### Problem

Flows need external tools (Exa, Serper, Notion, Linear, Slack, GitHub). Building a custom registry/engine/UI for each provider doesn't scale and creates hardcoded provider names in renderer code.

### Solution: Agent-Editable Project Config

MCP configuration is a **project-level file** (`.mcp.json`). The same file Claude Code and Codex already use. The agent can read and write it.

```
User: "I need Notion for my content calendar"
  → Agent reads Notion MCP docs (or knows the pattern)
  → Agent writes to {project}/.mcp.json:

    {
      "mcpServers": {
        "notion": {
          "command": "npx",
          "args": ["-y", "@notionhq/notion-mcp-server"],
          "env": { "NOTION_API_KEY": "user-provides-this" }
        }
      }
    }

  → c8c picks up .mcp.json on next run
  → Done. No registry, no engine, no custom UI.
```

### How It Works

1. **Config file:** `{project}/.mcp.json` — standard MCP config, same format as Claude Code
2. **Agent writes it:** When a flow needs a tool that's not configured, the agent can offer to set it up. User provides the API key, agent writes the config.
3. **Pre-run check:** Template declares `suggestedTools: ["exa"]`. Before run, system checks if `.mcp.json` has a server that provides those tools. If not → agent offers to configure.
4. **Keys stay local:** API keys live in `.mcp.json` env vars or in `~/.c8c/keyring.json` (for keys shared across projects). Both gitignored.
5. **c8c reads on run:** `prepareWorkspaceMcpConfig()` already merges project `.mcp.json` into the run workspace. No new infrastructure needed.

### Rules

1. **No provider registry in code.** The "registry" is the internet — agent reads docs and writes config.
2. **No provider-specific UI.** Settings shows configured MCP servers from `.mcp.json`, generically. No "Exa section" or "Notion section".
3. **No hardcoded provider names in renderer.** UI shows what `.mcp.json` contains, nothing more.
4. **Agent is the installer.** "Add Notion" = agent writes `.mcp.json` entry. Same as `claude mcp add` but through the flow agent.
5. **User provides secrets.** Agent never guesses API keys. It prompts, user pastes, agent writes to config.

### User Paths

**Path A — Implicit (pre-run):**
Flow needs `exa` → `.mcp.json` doesn't have it → pre-run prompt: "This flow needs web search. Set up Exa? [Paste API key]" → agent writes config → run starts.

**Path B — Explicit (composer):**
User types "connect Notion" or pastes docs URL → agent reads docs → writes `.mcp.json` → confirms "Notion MCP configured. Your flows can now access Notion pages."

**Path C — Settings (management):**
Settings → MCP Servers shows entries from `.mcp.json`. Edit/remove/test. No "add from catalog" — that's the agent's job.

### What to clean up (debt)

- Remove hardcoded `exaKeyConfigured`, `exaKeyringPath`, `toolingSetupApiKey` state from renderer
- Remove `data/config/mcp-keyring.json` pattern (migrate to `.mcp.json` env vars or `~/.c8c/keyring.json`)
- Pre-run check should read `.mcp.json` servers, not a custom keyring

---

## 16. YAML Format Stability Contract

### 16.1 Version 1 backward-compatibility guarantee

Version 1 of the workflow YAML format is backward-compatible forever:

- All future parsers MUST load version 1 YAMLs without error.
- New fields are always additive (optional properties). Never rename or remove existing fields.
- If a breaking change is ever necessary, it ships as version 2 with a migration function in the codebase.
- Exported YAMLs include a `# c8c-format: 1` header comment for discoverability.

This contract is the foundation of install base — every YAML committed to a git repo is a switching cost that accumulates.
