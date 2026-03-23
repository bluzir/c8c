# Content Domain — Guided Experience Design

**Date:** 2026-03-23 | **Status:** Draft v1

> Dev guided experience is proven and stable (routing, intents, spine, continuation, quality loops — all shipped and working). Content is the next domain to receive the full guided treatment.
>
> **Confidence note:** Dev domain has S-grade/A-grade user validation. Content domain user data is C-grade (hypothesis from JTBD Segments 2-3). This expansion is primarily architecture-proving: demonstrating that the domain-parameterized patterns work beyond Dev. User validation comes from usage after ship.

---

## 0. Context

### What exists today

- **Content Lab** pack: 8 connected templates with contracts (`content-trend-watch` → `content-post-calendar` → `content-draft-post` → `content-qa-review` + `content-idea-backlog`, `content-ready-posts`, `content-editorial-calendar`, `content-repurposing-factory`)
- **Additional content templates:** `content-pipeline`, `content-distribution-bundle`, `predictable-text-factory`, `copy-quality-pipeline`
- **Contract chain:** Content Lab templates have `contract_in`/`contract_out` and `recommended_next` — auto-chaining works within the pack
- **Domain selector:** exists in UI as compact segmented control (Dev / Marketing / Content)
- **Content templates are functional** — users can browse and run them from the library

### What's missing

- No Content routing agent — user must browse library, not describe point B
- No Content intent layer — Do/Plan/Review not wired for content domain
- No Content domain context — routing agent has no signals about user's content state
- No Content router destination registry — no mapping from point-B to starting points
- Content spine stages not mapped to content-specific job language
- CANON §0.2 roadmap (Moves 1-16) is all done — should be archived to keep CANON readable

---

## 1. Spine

Content uses the same universal spine as Dev:

```
Understand → Plan → Execute → Check → Ship
```

Each stage maps to content-specific jobs:

| Spine stage | Content interpretation | Example |
|-------------|----------------------|---------|
| **Understand** | Research trends, gather signals, analyze audience | "What's happening in my space?" |
| **Plan** | Build editorial calendar, plan content strategy | "What should I write about this week?" |
| **Execute** | Draft posts, repurpose content, generate assets | "Write this post" |
| **Check** | QA review, slop detection, tone consistency | "Is this ready to publish?" |
| **Ship** | Final package, distribution bundle | "Bundle and publish" |

Same spine labels in the UI. Different job language in step descriptions.

### Stage family mapping

Existing content templates use `stage_family` values that don't always match spine labels. The mapping layer translates:

| YAML `stage_family` | Spine label | Templates |
|---------------------|-------------|-----------|
| `understand` | Understand | `content-trend-watch` |
| `design` | Plan | `content-post-calendar`, `content-editorial-calendar` |
| `execute` | Execute | `content-draft-post`, `content-repurposing-factory`, `predictable-text-factory` |
| `evaluate` | Check | `content-qa-review`, `copy-quality-pipeline` |
| `deliver` | Ship | `content-pipeline`, `content-ready-posts`, `content-distribution-bundle` |

This mapping already exists for Dev (`stageFamily` → spine label). Content reuses the same mapping layer — no new abstraction needed, just confirming coverage.

---

## 2. Intents

Same three intents as Dev: **Do / Plan / Review**.

| Intent | Content meaning | Router constraint |
|--------|----------------|-------------------|
| **Do** | Create content — draft a post, repurpose material, build assets | Must route to execution-oriented starting points (Draft, Repurpose, Strategy) |
| **Plan** | Plan content — editorial calendar, content strategy, trend research | Must route to planning-oriented starting points (Calendar, Trend Watch, Strategy) |
| **Review** | Critique content — QA review, tone check, slop detection | Must route to review-oriented starting points (QA Review). Only valid when draft exists |

Rules (same as Dev):
- Intent is a hard constraint the router must honor
- Same point B + different intent = different path
- Compact selector (segmented control), same as Dev

---

## 3. Domain Context

What the Content routing agent receives as signals (analogous to Dev's project inspection):

### Minimal (ship with this)

| Signal | How to detect | What it tells the router |
|--------|--------------|------------------------|
| **Previous content results** | Check saved typed results for content kinds (`trend_digest`, `editorial_calendar`, `draft`, `content_brief`) | User has existing content work → can continue, not just start fresh |
| **Content templates previously run** | Check run history for content template IDs | User's content maturity — first time vs returning |
| **Available MCP tools** | Check integration registry for `web_search`, `exa`, `serper` | Whether research-dependent flows can run |

### Later (R4+)

- Tone of voice profile (if defined in project)
- Channel list (blog, twitter, telegram, newsletter)
- Last trend digest as context for continuity
- Audience profile, brand guidelines

### What the agent receives

```
{
  domain: "content",
  pointB: "<user's description>",
  intent: "do" | "plan" | "review" | null,
  context: {
    previousResults: [{ kind: "trend_digest", age: "2d" }, ...],
    templatesRun: ["content-trend-watch", "content-draft-post"],
    availableTools: ["web_search", "exa"]
  }
}
```

The agent interprets these signals to pick the best starting point. No heuristics — agent-only routing (CANON §2.4).

---

## 4. Router Destination Registry

Content starting points the router can select:

| Job entry (user sees) | Internal template | When router selects it |
|---|---|---|
| **Watch trends** | `content-trend-watch` | Needs evidence base before planning. No recent trend digest exists |
| **Plan content calendar** | `content-post-calendar` | Has trends/context, needs a publishing plan |
| **Draft a post** | `content-draft-post` | Has a specific topic or calendar slot, needs a draft |
| **Review content quality** | `content-qa-review` | Has a draft, needs quality/tone/slop check |
| **Build content strategy** | `content-pipeline` | Needs full strategy from product brief → marketing outputs |
| **Repurpose content** | `content-repurposing-factory` | Has existing material, needs it in different formats |
| **Generate text** | `predictable-text-factory` | Needs structured text output (copy, descriptions, sequences) |
| **Check copy quality** | `copy-quality-pipeline` | Has text, needs quality/clarity/tone evaluation |

### Banned as direct entry

These are reachable only via continuation, not as router destinations:

| Banned template | Reason |
|----------------|--------|
| `content-ready-posts` | Final assembly — downstream from draft + QA |
| `content-distribution-bundle` | Packaging — downstream from strategy |
| `content-editorial-calendar` | Intermediate output of calendar planning flow |
| `content-idea-backlog` | Internal accumulation, not a user-facing entry |

### Routing examples

| Point B | Intent | Router picks | Why |
|---------|--------|-------------|-----|
| "Что нового в AI агентах?" | null | Watch trends | Research request, no existing digest |
| "Напиши пост про новый Claude" | Do | Draft a post | Specific topic + Do intent |
| "Что мне писать на этой неделе?" | Plan | Plan content calendar | Planning request |
| "Проверь мой черновик" | Review | Review content quality | Has draft, Review intent |
| "Нужна контент-стратегия для лендинга" | null | Build content strategy | Strategy-level request |
| "Сделай из подкаста 5 постов" | Do | Repurpose content | Transform existing material |
| "Мне нужен контент каждую неделю" | Plan | Plan content calendar | Cadence request → best current coverage is calendar planning. Full recurring execution is R4 |
| "Напиши описания для 10 фич" | Do | Generate text | Structured text batch |
| "Проверь тексты на лендинге" | Review | Check copy quality | Copy quality evaluation |

---

## 5. Content-Specific Typed Results

Results that Content flows produce (already in `KnownArtifactKind`):

| User sees | Internal kind | Produced by |
|-----------|--------------|-------------|
| "Trend digest" | `trend_digest` | Watch trends |
| "Editorial calendar" | `editorial_calendar` | Plan content calendar |
| "Draft post" | `draft` | Draft a post |
| "Content brief" | `content_brief` | Build content strategy |
| "Distribution bundle" | `distribution_bundle` | Repurpose content |

---

## 6. Content Flow Chaining

Content Lab already has `recommended_next` chains:

```
Watch trends → Plan content calendar → Draft a post → Review content quality → Ready posts
```

This chain maps to the spine: Understand → Plan → Execute → Check → Ship.

When a flow completes and `recommendedNext` exists, the result surface shows "Continue to [next flow]" as primary CTA. Same contract as Dev (CANON §0.2 Move 7).

---

## 7. CANON Changes

### 7.1 Archive §0.2

Move CANON §0.2 "Path to NSM" (Moves 1-16, all done) to `docs/specs/historical/2026-03-23-nsm-moves-archive.md`.

### 7.2 Update §0.1

Replace current "Not working / incomplete" with:

```
**Done:**
- Dev guided experience — full (routing, intents, spine, continuation, quality loops)
- Content guided experience — in progress

**Not working / incomplete:**
- Marketing remains library-only
- Courses remain library-only
```

### 7.3 Update §0.3

Remove "Multi-domain guided experience" from skip list — Content is no longer skipped. Justification: Dev guided experience is fully shipped and stable (Moves 1-16 done). The architecture was designed domain-parameterized from the start (CANON §5.1). Content expansion validates this design.

### 7.8 Update §2.2

Change "Intent is shown only for the Development domain" to "Intent is shown for Development and Content domains. Marketing / Courses may add intents later."

### 7.4 Add Content router destination registry to §2.5

Add Content registry table alongside Dev registry (same section, separate subsection).

### 7.5 Add Content banned entries to §2.6

Add Content ban list alongside Dev ban list.

### 7.6 Update §5.2 domain selector

Change Content row from "Library only" to "Guided (routing, intents, spine, continuation)".

### 7.7 Add Content domain context to §2.4

Add Content context shape alongside Dev's project inspection description.

---

## 8. Implementation Scope

### What needs to be built

1. **Content routing agent** — new agent prompt that receives content domain context and returns starting point recommendation. Same bounded call contract as Dev (max 8 turns, 20s timeout, no tool use). Lives as a domain branch inside the existing `create-entry-router.ts` — the router already dispatches by domain, this adds the content prompt and destination list
2. **Content domain context collector** — function analogous to `inspectCreateEntryProject()` but for content domain. Gathers: previous content typed results, content templates run, available MCP tools. Returns a `ContentDomainContext` that the routing agent receives
3. **Wire intents for Content domain** — enable Do/Plan/Review selector when domain = content (currently gated to Dev only)
4. **Wire spine for Content domain** — confirm `stage_family` → spine label mapping covers all content templates (see §1 mapping table). Fix any templates with missing or wrong `stage_family`
5. **Content-specific placeholder text** — composer placeholder changes on domain switch

### What already works (no changes needed)

- Content Lab templates with contracts and chaining
- Template normalization (contractOut, recommendedNext, suggestedTools)
- Runtime shell, quality loops, approval surfaces — all domain-agnostic
- Result persistence, continuation, reopen bookmarks — all domain-agnostic
- MCP integration registry for suggested tools
- Library browse path — remains available as fallback for users who prefer manual template selection

### What's explicitly out of scope

- Marketing guided experience (remains library-only)
- Courses guided experience (remains library-only)
- Recurring execution / cross-run memory (R4) — Content Cadence (JTBD-PIPE #4) partially served by calendar planning, full cadence requires recurring infra
- Video/Reel pipeline templates (R5)
- Content analytics / audience tracking
- Expanding `content-trend-watch` output types beyond `trend_digest` (Product-Fit-Audit recommendation, deferred — ship with current typed results first)

---

## 9. North Star: User-Defined Domains

Dev, Content, Marketing are shipped presets. The architecture goal is that a domain is a configurable package, not a hardcoded mode:

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

Three operations:

| Operation | What it means |
|-----------|--------------|
| **Fork** | Take an existing domain, customize starting points, add/remove templates, adjust routing |
| **Create** | Build a new domain from scratch — "Recruiting", "Sales ops", "Course production" |
| **Share** | Publish a domain as a community package via OpenClaw |

This resolves a strategic tension: we don't need to decide which domains to support. We support the **format**. Shipped domains (Dev, Content) are curated presets that prove the pattern. Community domains extend it.

**Scope:** This is north-star direction, not R2/R3 scope. Current work (Dev + Content) validates the domain-parameterized architecture. User-defined domains ship when the format stabilizes through at least two shipped presets.

**CANON change:** Add to §5 as §5.3 "Domain model north star" — domains are configurable packages, shipped presets prove the pattern, user-defined domains are the destination.

---

## 10. Success Criteria

Content guided experience is done when:

1. User types content point-B in composer with Content domain selected → routing agent picks the right starting point
2. Do/Plan/Review intents work for Content and constrain the router
3. Spine shows content-appropriate step labels during execution
4. Flow chaining works within Content Lab pack via continuation CTAs
5. No graph literacy required — same NSM bar as Dev
