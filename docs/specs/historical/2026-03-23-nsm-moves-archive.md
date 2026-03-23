# NSM Moves Archive

**Archived from:** CANON §0.2 "Path to NSM"
**Date archived:** 2026-03-23
**Reason:** All 16 moves completed. Moved to historical to keep CANON focused on stable rules.

---

## NSM

**Primary:** share of point-B requests that reach a named result without graph literacy.

Every move below fixed a specific drop-off in the point-B → result funnel.

```
Point-B entered → intent understood → right start chosen → steps execute
→ user stays oriented → checks handled → process stays clean
→ result reached → result survives time → operator scales
```

### Phase 1: Fix primary path drop-offs

Spec: `docs/superpowers/specs/2026-03-23-r2-process-path-blockers-design.md`
Plan: `docs/superpowers/plans/2026-03-23-r2-process-path-blockers.md`

**Move 1 — Spine always visible** | Status: done
- **Job:** J1 "turn idea into code in one pass" / J2 "standardized quality process" — multi-step work. User returns after break → must instantly see where they are
- **Scenario:** #1 Feature on Existing (7 steps), #4 Project Audit, #3 Bug Investigation — any multi-step flow
- **Drop-off:** Spine hidden on resume/completion → "where am I?" → abandons
- **Fix:** Spine visibility driven by process data, not hidden by screen state
- **NSM:** Users stop abandoning mid-process because they lost orientation

**Move 2 — Kill regex routing** | Status: done
- **Job:** J9 "delegate process, not just instructions" — user describes desired outcome in their language, system must understand
- **Scenario:** All 11 — every scenario starts with point-B in composer. Russian/mixed-language users are real segment
- **Drop-off:** Regex can't match non-English → wrong domain → wasted run
- **Fix:** Delete `inferResultModeFromText()`. Domain mode from routing agent call. Add "Show alternatives" button on routed result — if agent is confident but wrong, user can see 2-3 alternate starting points and switch without re-typing point B
- **NSM:** All languages and non-standard phrasing reach the right starting point. Wrong routing recoverable without re-typing point B

**Move 3 — Simplify quality loop** | Status: done
- **Job:** J2 "standardized quality process" — user wants to know "did it pass?" not "what's the score distribution?"
- **Scenario:** #1 Feature (review→verify loop), #4 Audit (findings loop), #5 Content (editorial check)
- **Drop-off:** Evaluator metrics as primary → "what does 6/10 mean?" → abandons at check
- **Fix:** Verdict sentence + action + type badge. Metrics behind disclosure
- **NSM:** Fewer abandonments at check points

**Move 4 — ChainBuilder to advanced access** | Status: done
- **Job:** J1/J9 — user drives process, not graph editor. "I want to ship a feature" not "I want to edit a DAG"
- **Scenario:** All — graph is never part of the user's job. It's our implementation layer
- **Drop-off:** Graph editor inline → user thinks graph literacy required
- **Fix:** ChainBuilder removed from process view. Accessible through Flow → Edit Flow Graph and the command palette
- **NSM:** Graph literacy no longer required — the defining condition of our NSM

### Phase 2: Surface clarity + clean data

**Move 5 — List tab: one question per state** | Status: done
- **Job:** J9 "delegate process" — user wants ONE clear answer per screen, not a dashboard of mixed signals
- **Scenario:** #1 Feature (which step am I on?), #3 Bug (what's blocking?), #11 Manual Chaining (where's my result?)
- **Drop-off:** State multiplexer → "what is this surface for?" → confusion
- **Fix:** ONE QUESTION per screen state → only elements that answer it. Ready start/resume screens keep input behind local depth, blocked-decision screens keep operator detail behind local depth, and cross-flow context stays inside the owner surface instead of duplicating in shell chrome.
- **NSM:** Less cognitive load → faster path to action

**Move 6 — Doc "must show" → "must make available"** | Status: done
- **Job:** Meta — prevents future complexity creep that degrades J1-J9 experience
- **Drop-off:** Implementers read "must show" → add everything as visible → surface overload
- **Fix:** Replace "must show" with "must make available" in specs
- **NSM:** Prevents future complexity accumulation

**Move 7 — Template normalization (stageFamily + contractOut + recommendedNext + suggestedTools)** | Status: done
- **Job:** J7 "analyze competitors" / J8 "repeatable workflow" / J9 "delegate process" — templates must declare everything needed to run, including external tool access
- **Scenario:** #1 Feature (auto-chaining), #5 Content Cadence, #6 Trend Watching (needs web search), #7 Deep Research (needs web search), #8 Market Positioning (needs market data)
- **Drop-off:** 20/33 templates no `contractOut` → auto-chaining broken. Research/content templates no `suggestedTools` → user must manually configure MCP → runs without web access produce empty results
- **Fix:** Every template gets: `stageFamily`, `contractOut`, `recommendedNext`, `suggestedTools` (MCP capabilities needed, e.g. `["web_search"]`). Pre-run check: if suggestedTools unavailable → prompt "This flow recommends web search. Add Exa?" (one-click)
- **NSM:** Auto-chaining works + research/content flows actually get external data → dramatically higher completion for non-dev scenarios

**Flow chaining contract:** When a flow completes and `recommendedNext` exists with satisfied contracts, the result surface shows "Continue to [next flow name]" as primary CTA. No manual library browsing. If multiple next flows match, show top 2-3 as compact options.

**Skill provenance:** Templates and skills should carry `source: "curated" | "community" | "user" | "learned"` with optional confidence score. User sees a badge distinguishing shipped vs community vs auto-generated content. This enables trust calibration and future learning-based promotion (Move 16).

**Note on MCP layer:** Infrastructure is 100% ready (CRUD, discovery, per-skill allow/block, Claude SDK + Codex passthrough, plugin approval). Gap is not capability — gap is that templates don't declare tool needs, so system can't auto-configure or warn. This move closes that gap.

**Move 7.6 — MCP integration registry** | Status: done
- **Job:** J5/J6/J9 — flows need external tools. User shouldn't configure JSON or run CLI.
- **Drop-off:** Flow needs a tool → tool not configured → silent failure → abandons
- **Fix:** Universal integration registry. See §15 for full architecture.
- **NSM:** Any flow can declare tool needs → system ensures tools available before run

**Move 7.5 — Token usage visibility (advanced)** | Status: done
- **Job:** J8 "repeatable workflow" — user running flows regularly needs to understand resource usage patterns, not dollar costs
- **Scenario:** All — every completed step should show its resource footprint
- **Drop-off:** User has no idea if a step used 5K or 500K tokens → can't optimize or predict
- **Fix:** Token summary per step in step log / activity tab (behind disclosure, not primary). Format: "~50K tokens" not "$0.03". This is advanced/secondary information — verdict and action stay primary. No dollar amounts (users on subscriptions, not pay-per-token)
- **NSM:** Users who understand resource usage make better point-B requests and choose appropriate depth

**Move 8 — Job-language surface pass** | Status: done
- **Job:** J1/J2/J9 — user thinks in jobs ("reviewing my changes") not stages ("Review phase")
- **Scenario:** All — every runtime label should speak user language
- **Drop-off:** Internal stage names leak → user needs stage-family literacy
- **Fix:** All step labels use job descriptions
- **NSM:** No internal vocabulary on user-facing surfaces

**Move 9 — Approval surface simplification** | Status: done
- **Job:** J1 "ship feature" — approval is a decision point, not a reading exercise. "Should I proceed?" not "here's everything about the system"
- **Scenario:** #1 Feature (approve before implement), #4 Audit (approve before ship), #3 Bug (approve fix plan)
- **Drop-off:** Approval card shows too much context → overwhelm → slow decision
- **Fix:** Verdict + action primary, context behind disclosure. Same rule applies to blocked-decision surfaces that reuse approval semantics.
- **NSM:** Faster approval decisions → less time blocked

**Move 10 — Reopen bookmark** | Status: done
- **Job:** J1 "feature in one pass" — but "one pass" can span 2 days. "I left the cafe, came home, want to continue"
- **Scenario:** #1 Feature (multi-day), #3 Bug (started investigating, continued next morning), #5 Content (drafted yesterday, editing today)
- **Drop-off:** Close app → progress lost → restart from zero
- **Fix:** Persist latest-run review intent per flow so reopen returns to the last saved result/review state without rediscovering it from history. Use content-hash caching (SHA-256 of result content, not file path) for robust persistence — file renames = cache hit, content change = auto-invalidation
- **NSM:** Multi-day flows become possible

**Move 10.5 — Reopen into saved-work continuation** | Status: done
- **Job:** J1 "feature in one pass" / J9 "delegate process" — returning users should land on the right actionable next step, not only the last result
- **Scenario:** #1 Feature after review/checkpoint, #3 Bug after investigation, #5 Content after draft/review handoff
- **Drop-off:** Reopen returns to history/result only → user still has to rediscover the next step manually
- **Fix:** Persist the saved-work resume-header contract per flow, and move/clear it with workflow lifecycle events so reopen lands directly on the right next-step continuation state
- **NSM:** Multi-day flows resume straight into action, not just inspection

### Phase 3: Durable memory (R3)

**Move 11 — Durable result records** | Status: done
- **Job:** J8 "make repeatable workflow" — results must survive as product memory, not just completion payload
- **Scenario:** #5 Content Cadence (each run builds on previous), #6 Trend Watching (memory accumulates), #11 Manual Chaining (result feeds next flow)
- **Drop-off:** Results lost on restart → wasted work
- **Fix:** Results persist as typed records with case lineage
- **NSM:** Completion rate rises because work is never lost

**Move 12 — Continuation beyond live run** | Status: done
- **Job:** J8/J9 — process continues even when I'm not watching. Come back, pick up where I left off
- **Scenario:** #1 Feature (plan today, implement tomorrow), #6 Trend Watching (weekly cadence)
- **Drop-off:** Continuation only works within live session
- **Fix:** Continuation backed by saved artifact+gate state
- **NSM:** Async work patterns become possible

**Move 13 — Gate state persistence** | Status: done
- **Job:** J2 "standardized quality process" — if review passed, it should stay passed. Don't re-run checks I already cleared
- **Scenario:** #1 Feature (verify passed → crash → verify lost), #4 Audit (findings approved → state lost)
- **Drop-off:** Crash after check → check lost → re-runs
- **Fix:** Gate outcomes survive crash. Audit trail
- **NSM:** No wasted re-runs of passed checks

### Phase 4: Async + self-improving (R4)

**Move 14 — Headless pipe execution** | Status: done
- **Job:** J8 "repeatable workflow" / J5 "regular content pipeline" — should run without me staring at screen
- **Scenario:** #5 Content Cadence (scheduled weekly), #6 Trend Watching (daily cron), #7 Deep Research (overnight)
- **Drop-off:** Must have app open → limited throughput
- **Fix:** Flows callable headless via CLI. OpenClaw chains and schedules
- **NSM:** Results accumulate while user is away

**Move 15 — Async approvals** | Status: done
- **Job:** J9 "delegate process" — I'm at dinner, flow needs my approval. Approve from phone, don't make me open laptop
- **Scenario:** #1 Feature (approve deploy from phone), #5 Content (approve draft from Telegram)
- **Drop-off:** Approval blocks flow until app opened → hours of idle
- **Fix:** Approvals via Telegram/notifications
- **NSM:** Decision latency drops → more results

**Move 16 — Evidence-driven improvement** | Status: done (observe+cluster+surface). Promote pending
- **Job:** J8 "repeatable workflow" — each time I run this flow, it should get better at the job, not repeat the same mistakes
- **Scenario:** #5 Content Cadence (learn which prompts produce better drafts), #6 Trend Watching (improve signal detection)
- **Drop-off:** Same recipe fails repeatedly → user manually tweaks
- **Fix:** System persists evidence, compares variants, proposes improvements. Promotion = human action
- **NSM:** Future runs start better → higher completion rate over time
- **Implementation status:**
  1. **Observe — DONE.** `improvement-store.ts` (781 lines) writes typed JSONL evidence after every run completion (`persistProjectImprovementEvidence()`). Records: node evidence (score, threshold, attempts, retries, model, prompt hash, skill ref, duration, error kind), approval summary (total, edited, rejected, timed out). Keyed by template + workflow path. Max 250 records rotated. Guard: only writes when `projectPath` is provided.
  2. **Cluster — DONE.** `deriveProjectImprovementRecommendations()` aggregates evidence into 3 recommendation types: `prefer_variant` (better model/prompt combo found), `stabilize_step` (step keeps failing), `reduce_manual_edits` (humans keep rewriting). Confidence scoring (medium/high based on run count). Variant comparison by success rate, check pass rate, retry average.
  3. **Surface — PARTIAL.** IPC bridge exists (`executor:list-flow-improvement-recommendations`). History tab consumes it. But recommendations surface is minimal — not verdict-style, no prominent placement.
  4. **Promote — NOT STARTED.** No "use this variant as default" action. No project→global promotion logic.
- **Next step:** Surface recommendations prominently (verdict-style card in result/history) + add promotion CTA
- **Architecture note (from ECC instinct-based learning):** Project-scoped by default, promotable to global when seen working in 2+ projects. Promotion is always a human action, never silent mutation
- **Why not EDD now:** Requires baseline datasets. §12.4 telemetry will collect data over time. Formal EDD = after enough runs for statistical baselines
- **Why not iterative retrieval now:** Contract matching covers 90% of context passing. R5+
