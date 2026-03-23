# Template Normalization Audit

**Date:** 2026-03-23
**Status:** Active
**Scope:** Map all 61 templates to canonical stage families, identify gaps and mismatches
**Source:** R2-DEV-PROCESS-MAP-SPEC.md (canonical spine: Shape/Map → Plan → Implement → Review → Verify → Ship)

---

## 1. Current State

**61 YAML templates** across 7 packs + standalone files.

### Type System Gap

Two existing type systems, neither matches the canonical 6-stage spine:

| Type | Values | Problem |
|---|---|---|
| `WorkflowTemplateStage` | research, strategy, content, code, outreach, operations | Domain classifier, not process stage |
| `WorkflowTemplateJourneyStage` | map, intake, shape, research, plan, execute, verify, operate | Closer but missing `review`, `ship`; has non-canonical values |

**Action:** Add `stageFamily` field to `WorkflowTemplate` type with canonical values: `shape`, `plan`, `implement`, `review`, `verify`, `ship`.

---

## 2. Stage Family Coverage

| Stage Family | Templates | Dev-focused | Gap? |
|---|---|---|---|
| **Shape/Map** | 14 | delivery-map-codebase, delivery-shape-project, delivery-research-phase, deep-research | No |
| **Plan** | 7 | delivery-plan-phase, cto-product-spec | No |
| **Implement** | 18 | delivery-implement-phase | No |
| **Review** | 6 | delivery-review-phase, full-stack-code-audit, cto-optimise-audit, ux-ui-polish-audit | No |
| **Verify** | 4 | delivery-verify-phase, gstack-preflight-gate, playwright-visual-audit | No |
| **Ship** | 3 | gstack-release-room | **Yes — no Delivery Lab ship template** |

---

## 3. Mismatched Labels

| Template | Current `journey_stage` | Correct | Fix |
|---|---|---|---|
| `content-qa-review` | `verify` | `review` | Rename — performs review/approval |
| `courses-launch-assets` | `verify` | `operate` | Rename — packages for launch |
| `delivery-investigate-bug` | `apply` | _(non-canonical)_ | Remove or map to `shape` |

---

## 4. Multi-Stage Templates (11)

These span multiple stage families. Decision needed: decompose or assign primary.

| Template | Stages spanned | Recommendation |
|---|---|---|
| `content-pipeline` | Shape+Implement+Review | Assign `implement` (primary output) |
| `design-code-test` | Implement+Review+Verify | Assign `implement` |
| `impeccable-ui-pipeline` | Review+Implement | Assign `review` (audit drives the flow) |
| `remotion-video-director-pipeline` | Plan+Implement+Review+Ship | Assign `implement` |
| `cold-outreach-pipeline` | Research+Implement+Review | Assign `implement` |
| `new-vertical-to-live-campaign` | Research→Ship | Assign `implement` |
| `delivery-investigate-bug` | Shape+Implement+Verify | Assign `shape` (investigation drives it) |
| `landing-audit-loop` | Review+Implement | Assign `review` |
| `gstack-feature-squad` | Shape+Plan | Assign `shape` |
| `gstack-preflight-gate` | Review+Verify | Assign `verify` |
| `segmented-outreach-launchpad` | Implement+Ship | Assign `implement` |

---

## 5. Non-Dev Templates (22)

These serve marketing, sales, content, operations — not the dev process. They don't naturally map to the dev spine.

| Domain | Count | Examples |
|---|---|---|
| Marketing | 6 | AI CMO pack |
| Content | 5 | content standalone |
| Outreach/Sales | 5 | cold-outreach, segmented-outreach |
| Research (market) | 4 | lead-research, segment-research |
| Operations | 2 | invoice-chaos, meeting-actions |

**Decision needed:** Do non-dev templates get `stageFamily` at all? Options:
- A) Force-map to closest dev stage (messy but unified)
- B) Allow `stageFamily: null` for non-dev templates (clean, honest)
- C) Create parallel domain spines later (R5 scope)

**Recommendation:** Option B for R2. Non-dev templates get `stageFamily: null` and are excluded from the dev process map UI. R5 adds domain-specific spines.

---

## 6. The Canonical Dev Pack: Delivery Lab

The Delivery Lab pack is the **only pack that maps cleanly** to the full dev spine:

```
delivery-map-codebase     → Shape/Map
delivery-shape-project    → Shape/Map
delivery-research-phase   → Shape/Map (research branch)
delivery-plan-phase       → Plan
delivery-implement-phase  → Implement
delivery-review-phase     → Review
delivery-verify-phase     → Verify
(missing)                 → Ship ← GAP
```

**Action:** Create `delivery-ship-phase` template for the Delivery Lab pack covering: changelog, release notes, deployment checklist.

---

## 7. Action Items

### P0 (R2 blocker)
1. Add `stageFamily?: "shape" | "plan" | "implement" | "review" | "verify" | "ship"` to `WorkflowTemplate` type
2. Assign `stageFamily` to all 39 dev-relevant templates
3. Fix 3 mismatched `journey_stage` labels
4. Create `delivery-ship-phase` template

### P1 (R2 follow-up)
5. Decide primary `stageFamily` for 11 multi-stage templates
6. Set `stageFamily: null` on 22 non-dev templates
7. Update UI routing to use `stageFamily` for process map display

### P2 (R5 prep)
8. Design domain-specific process spines for content, outreach, operations
