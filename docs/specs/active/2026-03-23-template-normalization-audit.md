# Template Normalization Audit

**Date:** 2026-03-23
**Status:** Active
**Scope:** Map all 61 templates to domain-agnostic stage families
**Source:** R2-DEV-PROCESS-MAP-SPEC.md, NSM ("Start with one flow. Grow into a factory.")

---

## 1. Domain-Agnostic Stage Families

The NSM is multi-domain — not just dev. Stage families must work for code, content, outreach, and operations. Six universal stages:

| Stage | Code name | Dev example | Content example | Outreach example |
|---|---|---|---|---|
| **Understand** | `understand` | Map codebase | Research trends | Research market |
| **Design** | `design` | Write spec/plan | Editorial calendar | Campaign strategy |
| **Execute** | `execute` | Write code | Write content | Run outreach |
| **Evaluate** | `evaluate` | Code review | Copy QA | Response analysis |
| **Validate** | `validate` | Run tests | Fact-check | A/B test |
| **Deliver** | `deliver` | Ship/deploy | Publish/distribute | Launch campaign |

These replace the dev-specific names (Shape/Map, Plan, Implement, Review, Verify, Ship).

---

## 2. Type System

### Current (broken)

| Type | Values | Problem |
|---|---|---|
| `WorkflowTemplateStage` | research, strategy, content, code, outreach, operations | Domain classifier, not process stage |
| `WorkflowTemplateJourneyStage` | map, intake, shape, research, plan, execute, verify, operate | Dev-centric, missing evaluate/deliver |

### Proposed

Add `stageFamily` field to `WorkflowTemplate`:

```ts
type StageFamily = "understand" | "design" | "execute" | "evaluate" | "validate" | "deliver"
```

All 61 templates get a value — no nulls, no domain exclusions.

---

## 3. Full Template Mapping

### Understand (14 templates)

| Template | Domain | Pack |
|---|---|---|
| delivery-map-codebase | dev | Delivery Lab |
| delivery-shape-project | dev | Delivery Lab |
| delivery-research-phase | dev | Delivery Lab |
| delivery-investigate-bug | dev | Delivery Lab |
| deep-research | dev | standalone |
| ai-cmo-growth-thesis | marketing | AI CMO |
| content-trend-watch | content | Content Lab |
| courses-audience-offer | education | Courses Lab |
| gstack-feature-squad | dev | Gstack |
| indispensable-jtbd-pipeline | strategy | standalone |
| irresistible-resonance-pipeline | strategy | standalone |
| lead-research-machine | sales | standalone |
| seed-account-map-pipeline | sales | standalone |
| segment-research-gate | strategy | standalone |

### Design (7 templates)

| Template | Domain | Pack |
|---|---|---|
| delivery-plan-phase | dev | Delivery Lab |
| cto-product-spec | dev | standalone |
| content-idea-backlog | content | Content Lab |
| content-editorial-calendar | content | Content Lab |
| content-post-calendar | content | Content Lab |
| courses-curriculum-map | education | Courses Lab |
| meeting-actions-plan | operations | standalone |

### Execute (18 templates)

| Template | Domain | Pack |
|---|---|---|
| delivery-implement-phase | dev | Delivery Lab |
| ai-cmo-seo-engine | marketing | AI CMO |
| ai-cmo-geo-engine | marketing | AI CMO |
| ai-cmo-hacker-news-engine | marketing | AI CMO |
| ai-cmo-reddit-engine | marketing | AI CMO |
| ai-cmo-x-engine | marketing | AI CMO |
| content-draft-post | content | Content Lab |
| content-ready-posts | content | Content Lab |
| content-repurposing-factory | content | standalone |
| courses-lesson-system | education | Courses Lab |
| courses-trigger-playbook | education | Courses Lab |
| design-code-test | dev | standalone |
| landing-page-generator | content | standalone |
| predictable-text-factory | content | standalone |
| application-tailoring-pipeline | outreach | standalone |
| raw-list-to-verified-contacts | outreach | standalone |
| twitter-growth-machine | marketing | standalone |
| invoice-chaos-fixer | operations | standalone |

### Evaluate (9 templates)

| Template | Domain | Pack |
|---|---|---|
| delivery-review-phase | dev | Delivery Lab |
| content-qa-review | content | Content Lab |
| full-stack-code-audit | dev | standalone |
| cto-optimise-audit | dev | standalone |
| ux-ui-polish-audit | dev | standalone |
| copy-quality-pipeline | content | standalone |
| impeccable-ui-pipeline | dev | standalone |
| landing-audit-loop | content | standalone |
| remotion-video-director-pipeline | dev | standalone |

### Validate (5 templates)

| Template | Domain | Pack |
|---|---|---|
| delivery-verify-phase | dev | Delivery Lab |
| gstack-preflight-gate | dev | Gstack |
| gstack-web-quality-board | dev | Gstack |
| playwright-visual-audit | dev | standalone |
| vertical-pain-to-target-list | strategy | standalone |

### Deliver (8 templates)

| Template | Domain | Pack |
|---|---|---|
| gstack-release-room | dev | Gstack |
| content-distribution-bundle | content | Content Lab |
| courses-launch-assets | education | Courses Lab |
| content-pipeline | content | standalone |
| cold-outreach-pipeline | outreach | standalone |
| new-vertical-to-live-campaign | outreach | standalone |
| segmented-outreach-launchpad | outreach | standalone |
| content-distribution-bundle | content | Content Lab |

---

## 4. Mismatched Labels to Fix

| Template | Current `journey_stage` | Correct `stageFamily` |
|---|---|---|
| content-qa-review | verify | **evaluate** |
| courses-launch-assets | verify | **deliver** |
| delivery-investigate-bug | apply | **understand** |

---

## 5. Missing: Delivery Lab Ship Template

The Delivery Lab pack covers 5 of 6 stages but has no **deliver** template. Create `delivery-ship-phase` covering: changelog, release notes, deployment checklist.

---

## 6. Action Items

### P0 (R2 blocker)
1. Add `stageFamily` type: `"understand" | "design" | "execute" | "evaluate" | "validate" | "deliver"`
2. Add `stageFamily` field to `WorkflowTemplate` in `src/shared/types.ts`
3. Assign `stageFamily` to all 61 builtin YAML templates
4. Fix 3 mismatched `journey_stage` labels
5. Create `delivery-ship-phase` template

### P1 (R2 follow-up)
6. Hub catalog entries also get `stageFamily`
7. UI process map uses `stageFamily` for navigation spine
8. Skill `stageFit` aligned to same 6 values
