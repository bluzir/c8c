# Domain Entity Extraction Design

**Date:** 2026-03-23 | **Status:** Draft v1

> Extract the domain definition from 8+ scattered files into a single `DomainDefinition` object per domain. Adding a new domain = adding one file.

---

## 0. Problem

Domain config is currently spread across:

| File | What it stores per domain |
|------|-------------------------|
| `result-modes.ts` | label, placeholder, guidedPath, packIds, templateIds, scoring, quick starts |
| `result-mode-config.ts` | form fields, labels |
| `result-mode-factory.ts` | factory defaults, quality policy, checkpoints |
| `create-entry-router.ts` | router prompt builder, mode guards |
| `create-entry-routing.ts` | banned entry template IDs |
| `process-spine.ts` | template → stage overrides, spine pack IDs |
| `WorkflowCreatePage.tsx` | `isGuidedRouting` condition, `preRoutingActive` condition |
| `WorkflowCreateComposerFooter.tsx` | intent selector gate |
| `useWorkflowCreateDerivedState.ts` | 6 dev-only checks: routing, route options, quick starts, preview |
| `templateLibraryModel.ts` | pack-to-mode and category-to-mode mappings |
| `result-mode-card.tsx` | "Primary" badge for dev mode |

Every new domain requires touching all 8 files with `if (modeId === "xxx")` branches. This doesn't scale.

---

## 1. DomainDefinition Interface

```typescript
interface DomainDefinition {
  id: ResultModeId
  label: string
  emoji: string
  primaryDomain?: boolean  // shows "Primary" badge in mode card

  // Display
  summary: string
  useFor: string
  youProvide: string
  youGetFirst: string
  userRole: string
  composerPlaceholder: string
  scaffoldPlaceholders: Record<string, string>
  guidedPath: string[]
  startTemplateId: string
  startActionLabel: string
  runtimeLine: string

  // Routing
  guidedRouting: boolean
  buildRouterPrompt?: (
    input: CreateEntryRouteInput,
    context: Record<string, unknown>,
    options: CreateEntryRouteOption[],
  ) => string
  buildRouterContext?: (projectPath: string) => Promise<Record<string, unknown>>
  bannedEntryTemplateIds: Set<string>

  // Templates + Scoring
  packIds: string[]
  templateIds: Set<string>
  metadataTokens: string[]
  stagePreferences: string[]
  quickStarts: WorkflowResultModeQuickStart[]
  scoreTemplate: (template: WorkflowTemplate) => number

  // Spine
  templateStageOverrides: Record<string, ProcessSpineStageId>
  spinePackIds: Set<string>

  // Intents
  intentsEnabled: boolean

  // Config form
  configFields: ResultModeConfigField[]
  configLabels: Record<string, string>

  // Factory
  factoryFallbackLabel: string
  factoryTitleFieldId: string       // which config field → factory title (e.g. "project_goal")
  factorySuccessFieldId?: string    // which config field → success signal
  factoryCheckpoints: string[]
  qualityPolicy: string[]
  caseGenerationRule: string
  successSignal: string
  buildOutcomeSections?: (values: Record<string, string>) => Array<{ label: string; value: string }>
  buildConstraints?: (values: Record<string, string>) => string[]
  buildAudience?: (values: Record<string, string>) => string | undefined
}
```

**Key design decisions:**

- **`scoreTemplate` is a function, not config.** Scoring has per-domain nuances (different weights, conditional stage matching, category filters) that resist generic config. Each domain owns its scoring as a pure function.
- **`buildRouterContext` gathers domain-specific context.** Dev calls `inspectProjectForCreateEntry()`, content calls `listProjectArtifacts()` + `buildContentDomainContext()`. The router calls `domain.buildRouterContext?.(projectPath)` and passes the result to `domain.buildRouterPrompt`.
- **`factoryTitleFieldId` / `factorySuccessFieldId`** replace the per-mode if-chains in `buildFactoryFromResultMode()` that pick different config fields.
- **`buildOutcomeSections` / `buildConstraints` / `buildAudience`** are optional overrides. Each domain declares how its config fields map to factory output sections. If omitted, generic fallback applies.
- **Domain files must not import from `@/` (renderer) or `src/main/`.** Only `@shared/` types allowed.

---

## 2. File Structure

```
src/shared/domains/
  types.ts              — DomainDefinition interface + supporting types
  index.ts              — registry: getDomain(id), allDomains(), isGuidedDomain(id)
  development.ts        — dev domain definition
  content.ts            — content domain definition
  marketing.ts          — marketing domain definition
  courses.ts            — courses domain definition
```

Registry API:

```typescript
function getDomain(id: ResultModeId): DomainDefinition
function allDomains(): DomainDefinition[]
function isGuidedDomain(id: ResultModeId): boolean  // domain.guidedRouting
```

---

## 3. Consumer Migration

Each consumer file replaces its if-branches with domain lookups.

### result-modes.ts

Before: `CONTENT_PACK_IDS`, `MARKETING_PACK_IDS`, etc., `QUICK_STARTS_BY_MODE`, `templateScoreForMode()` with 4 if-branches, `RESULT_MODES` array.

After: `RESULT_MODES` built from `allDomains()`. Scoring delegates to `domain.scoreTemplate(template)`. Quick starts from `domain.quickStarts`. All per-domain constants (`*_PACK_IDS`, `*_TEMPLATE_IDS`, `*_METADATA_TOKENS`) move into domain files.

### result-mode-config.ts

Before: `RESULT_MODE_CONFIG_FIELDS` object with `content: [...]`, `marketing: [...]`, etc.

After: reads from `getDomain(id).configFields` and `getDomain(id).configLabels`.

### result-mode-factory.ts

Before: `factoryLabelForMode()`, `defaultQualityPolicy()`, `defaultCaseGenerationRule()`, `defaultSuccessSignal()`, `buildStrategistCheckpoints()`, `buildOutcomeStatement()`, `buildConstraints()`, `buildAudience()` — all with if-chains picking different config fields per mode.

After: simple defaults from `domain.factoryFallbackLabel`, `.qualityPolicy`, `.caseGenerationRule`, `.successSignal`, `.factoryCheckpoints`. Field-to-factory mapping via `domain.factoryTitleFieldId`, `domain.factorySuccessFieldId`. Complex section builders via optional `domain.buildOutcomeSections()`, `domain.buildConstraints()`, `domain.buildAudience()`.

### create-entry-router.ts

Before: two hardcoded mode guards + if-branch for prompt building + inline `listProjectArtifacts` call for content context.

After: both guards check `getDomain(input.modeId).guidedRouting`. Context built via `domain.buildRouterContext?.(projectPath)`. Prompt built via `domain.buildRouterPrompt?.(input, context, options)`. Generic dev prompt as fallback.

### create-entry-routing.ts

Before: `DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS`, `CONTENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS`, `isBannedDirectCreateEntryTemplateId()` with if-chain.

After: `getDomain(modeId).bannedEntryTemplateIds.has(templateId)`.

### process-spine.ts

Before: `TEMPLATE_STAGE_OVERRIDES` with dev + content entries, `DEV_PROCESS_PACK_IDS`, `CONTENT_PROCESS_PACK_IDS`, `PROCESS_PACK_IDS`.

After: stage overrides merged from `allDomains()`. Pack IDs merged from `allDomains()`.

### WorkflowCreatePage.tsx

Before: `isGuidedRouting` with hardcoded mode IDs, `preRoutingActive` with hardcoded mode IDs.

After: both use `isGuidedDomain(selectedResultMode.id)`.

### WorkflowCreateComposerFooter.tsx

Before: `selectedResultMode.id === "development" || selectedResultMode.id === "content"`.

After: `isGuidedDomain(selectedResultMode.id)`.

### useWorkflowCreateDerivedState.ts

Before: 6 `selectedResultMode.id === "development"` checks gating routing, route options, quick start prioritization, routing preview.

After: uses `isGuidedDomain()` and domain properties.

### templateLibraryModel.ts

Before: hardcoded pack-to-mode and category-to-mode mappings in `deriveCreateModeId()`.

After: derives mode from `allDomains()` pack membership lookup.

### result-mode-card.tsx

Before: `mode.id === "development"` for "Primary" badge.

After: `domain.primaryDomain`.

---

## 4. What Does NOT Change

- External API (IPC, preload) — no changes
- UI components — no changes, only data source
- Template YAML files — no changes
- CANON docs — no changes needed

---

## 5. Constraints

- **No new abstractions beyond DomainDefinition** — this is data consolidation, not a framework
- **Router prompt builders stay as functions** — they're complex enough to warrant domain-specific code, not config
- **`buildRouterPrompt` lives in the domain file, not in the router** — the router calls `domain.buildRouterPrompt(...)`, the domain owns its prompt
- **Scoring is a per-domain function** — `scoreTemplate(template)` returns a number. Each domain owns its scoring logic because weights and conditions differ too much for generic config
- **Import boundary: `src/shared/domains/` must not import from `@/` (renderer) or `src/main/`** — only `@shared/` types allowed. The `buildRouterContext` function is the exception: it lives in the domain file but is only called from main process code
- **`template-filters.ts` stays separate** — `isProductTemplate()`, `isContentTemplate()`, `isMarketingTemplate()` are imported by domain scoring functions, not replaced by them
- **Tests update by reference** — same logic, different data source

---

## 6. Success Criteria

1. Adding Marketing guided experience = one new file (`marketing.ts`) + set `guidedRouting: true` + add `buildRouterPrompt`
2. Zero `if (modeId === "xxx")` patterns remain in consumer files
3. All existing tests pass
4. Type-check clean
