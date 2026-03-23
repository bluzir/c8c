# Domain Entity Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract scattered domain config from 11 files into a single `DomainDefinition` object per domain, so adding a new domain = adding one file.

**Architecture:** Create `src/shared/domains/` with one file per domain (development, content, marketing, courses) plus types and registry. Each consumer file migrates from if-branches to `getDomain(id)` lookups. Incremental — each task produces a working, type-checked state.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-03-23-domain-entity-extraction-design.md`

---

### Task 1: Create DomainDefinition types and registry

**Files:**
- Create: `src/shared/domains/types.ts`
- Create: `src/shared/domains/index.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/shared/domains/types.ts
import type {
  CreateEntryRouteInput,
  CreateEntryRouteOption,
  ResultModeId,
  WorkflowTemplate,
  WorkflowTemplateStage,
} from "../types"

export interface ResultModeConfigField {
  id: string
  label: string
  placeholder: string
  type?: "textarea"
}

export interface DomainQuickStart {
  templateId: string
  label: string
  summary: string
  intentLabel: string
}

export interface DomainDefinition {
  id: ResultModeId
  label: string
  emoji: string
  primaryDomain?: boolean

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
  bannedEntryTemplateIds: Set<string>

  // Templates + Scoring
  packIds: string[]
  templateIds: Set<string>
  metadataTokens: string[]
  stagePreferences: WorkflowTemplateStage[]
  quickStarts: DomainQuickStart[]
  scoreTemplate: (template: WorkflowTemplate) => number

  // Spine
  templateStageOverrides: Record<string, string>
  spinePackIds: Set<string>

  // Intents
  intentsEnabled: boolean

  // Config form
  configFields: ResultModeConfigField[]
  configLabels: Record<string, string>

  // Factory
  factoryFallbackLabel: string
  factoryTitleFieldId: string
  factorySuccessFieldId?: string
  factoryCheckpoints: string[]
  qualityPolicy: string[]
  caseGenerationRule: string
  successSignal: string
  buildOutcomeSections?: (
    values: Record<string, string>,
  ) => Array<{ label: string; value: string }>
  buildConstraints?: (values: Record<string, string>) => string[]
  buildAudience?: (values: Record<string, string>) => string | undefined
}
```

- [ ] **Step 2: Create index.ts registry**

```typescript
// src/shared/domains/index.ts
import type { ResultModeId } from "../types"
import type { DomainDefinition } from "./types"

const DOMAINS: DomainDefinition[] = []
const DOMAIN_MAP = new Map<ResultModeId, DomainDefinition>()

export function registerDomain(domain: DomainDefinition): void {
  DOMAINS.push(domain)
  DOMAIN_MAP.set(domain.id, domain)
}

export function getDomain(id: ResultModeId): DomainDefinition {
  return DOMAIN_MAP.get(id) || DOMAINS[0]
}

export function allDomains(): DomainDefinition[] {
  return DOMAINS
}

export function isGuidedDomain(id: ResultModeId): boolean {
  return getDomain(id).guidedRouting
}

export type { DomainDefinition, DomainQuickStart, ResultModeConfigField } from "./types"
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/shared/domains/
git commit -m "feat: add DomainDefinition types and registry"
```

---

### Task 2: Create all 4 domain definition files

**Files:**
- Create: `src/shared/domains/development.ts`
- Create: `src/shared/domains/content.ts`
- Create: `src/shared/domains/marketing.ts`
- Create: `src/shared/domains/courses.ts`

Each domain file exports a `DomainDefinition` and calls `registerDomain()`. Extract all per-domain constants from `result-modes.ts`, `result-mode-config.ts`, `result-mode-factory.ts`, `create-entry-routing.ts`, and `process-spine.ts`.

- [ ] **Step 1: Create development.ts**

Extract from current files:
- `DEVELOPMENT_PACK_IDS`, `DEVELOPMENT_TEMPLATE_IDS`, `DEVELOPMENT_METADATA_TOKENS` from `result-modes.ts`
- `DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS` from `create-entry-routing.ts`
- Dev template stage overrides from `process-spine.ts`
- Dev config fields from `result-mode-config.ts`
- Dev factory defaults from `result-mode-factory.ts`
- Dev scoring logic from `templateScoreForMode()` development branch
- Dev quick starts from `QUICK_STARTS_BY_MODE.development`
- Dev RESULT_MODES entry

The `scoreTemplate` function imports `isProductTemplate` from `@/lib/template-filters` — but since domain files live in `src/shared/`, they can't import from `@/`.

**Solution:** scoring functions are defined separately in the renderer and attached to the domain at registration time. Domain files export everything EXCEPT `scoreTemplate`, and a renderer-side init file attaches the scoring functions. Alternative: move the scoring helpers needed to `src/shared/`.

Simpler approach: domain files in `src/shared/domains/` define all data. A thin renderer-side `src/renderer/lib/domain-scoring.ts` defines scoring functions that reference both domain data and `template-filters.ts`. The registry init in the renderer calls `registerDomain({ ...domainDef, scoreTemplate })`.

Actually simplest: keep domain files in `src/shared/domains/` with `scoreTemplate: undefined as any` placeholder, and have `src/renderer/lib/domain-init.ts` that builds the full definitions with scoring attached. This avoids circular deps.

**Revised approach:** Domain data files export plain objects (no scoring). A single `src/renderer/lib/domain-init.ts` imports data + scoring helpers, assembles complete `DomainDefinition` objects, registers them. Called once at app startup.

```
src/shared/domains/
  types.ts              — DomainDefinition interface
  index.ts              — registry (getDomain, allDomains, registerDomain)
  development-data.ts   — dev domain data (no scoring)
  content-data.ts       — content domain data (no scoring)
  marketing-data.ts     — marketing domain data (no scoring)
  courses-data.ts       — courses domain data (no scoring)

src/renderer/lib/
  domain-init.ts        — imports data + scoring, registers complete domains
```

- [ ] **Step 2: Create development-data.ts**

Export all dev domain data as a plain object (type `Omit<DomainDefinition, "scoreTemplate">`).

- [ ] **Step 3: Create content-data.ts**

Export all content domain data.

- [ ] **Step 4: Create marketing-data.ts**

Export all marketing domain data.

- [ ] **Step 5: Create courses-data.ts**

Export all courses domain data.

- [ ] **Step 6: Create domain-init.ts in renderer**

```typescript
// src/renderer/lib/domain-init.ts
import { registerDomain } from "@shared/domains"
import { developmentDomainData } from "@shared/domains/development-data"
import { contentDomainData } from "@shared/domains/content-data"
import { marketingDomainData } from "@shared/domains/marketing-data"
import { coursesDomainData } from "@shared/domains/courses-data"
import { isProductTemplate, isContentTemplate, isMarketingTemplate } from "./template-filters"

function metadataText(template: WorkflowTemplate): string {
  // move from result-modes.ts
}

function metadataIncludesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token))
}

// Build scoring functions using domain data + template-filters
function buildDevScore(template: WorkflowTemplate): number { ... }
function buildContentScore(template: WorkflowTemplate): number { ... }
function buildMarketingScore(template: WorkflowTemplate): number { ... }
function buildCoursesScore(template: WorkflowTemplate): number { ... }

export function initDomains(): void {
  registerDomain({ ...developmentDomainData, scoreTemplate: buildDevScore })
  registerDomain({ ...contentDomainData, scoreTemplate: buildContentScore })
  registerDomain({ ...marketingDomainData, scoreTemplate: buildMarketingScore })
  registerDomain({ ...coursesDomainData, scoreTemplate: buildCoursesScore })
}
```

Call `initDomains()` from the renderer entry point (e.g., `src/renderer/main.tsx` or `App.tsx`).

- [ ] **Step 7: Also create main-process domain init**

The main process needs `getDomain()` for the router. Create `src/main/lib/domain-init.ts` that registers domains without scoring (scoring is renderer-only). Or just import the data files and register with a no-op scorer.

```typescript
// src/main/lib/domain-init.ts
import { registerDomain } from "@shared/domains"
import { developmentDomainData } from "@shared/domains/development-data"
import { contentDomainData } from "@shared/domains/content-data"
import { marketingDomainData } from "@shared/domains/marketing-data"
import { coursesDomainData } from "@shared/domains/courses-data"

const noopScore = () => 0

export function initDomains(): void {
  registerDomain({ ...developmentDomainData, scoreTemplate: noopScore })
  registerDomain({ ...contentDomainData, scoreTemplate: noopScore })
  registerDomain({ ...marketingDomainData, scoreTemplate: noopScore })
  registerDomain({ ...coursesDomainData, scoreTemplate: noopScore })
}
```

Call from main process entry before IPC handlers register.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add src/shared/domains/ src/renderer/lib/domain-init.ts src/main/lib/domain-init.ts
git commit -m "feat: create domain definition files for all 4 domains"
```

---

### Task 3: Migrate result-modes.ts

**Files:**
- Modify: `src/renderer/lib/result-modes.ts`
- Modify: `src/renderer/lib/result-modes.test.ts`

- [ ] **Step 1: Replace RESULT_MODES array**

Replace the hardcoded `RESULT_MODES` array and all per-domain constants with domain registry reads:

```typescript
import { allDomains, getDomain } from "@shared/domains"

// Build RESULT_MODES from domain registry
export const RESULT_MODES: WorkflowResultMode[] = allDomains().map((domain) => ({
  id: domain.id,
  label: domain.label,
  emoji: domain.emoji,
  summary: domain.summary,
  useFor: domain.useFor,
  youProvide: domain.youProvide,
  youGetFirst: domain.youGetFirst,
  userRole: domain.userRole,
  composerPlaceholder: domain.composerPlaceholder,
  scaffoldPlaceholders: domain.scaffoldPlaceholders,
  packIds: domain.packIds,
  templateIds: Array.from(domain.templateIds),
  stagePreferences: domain.stagePreferences,
  startTemplateId: domain.startTemplateId,
  startActionLabel: domain.startActionLabel,
  guidedPath: domain.guidedPath,
  runtimeLine: domain.runtimeLine,
}))
```

- [ ] **Step 2: Replace templateScoreForMode**

```typescript
function templateScoreForMode(
  template: WorkflowTemplate,
  modeId: ResultModeId,
): number {
  return getDomain(modeId).scoreTemplate(template)
}
```

- [ ] **Step 3: Replace quick starts**

```typescript
function getResultModeQuickStartOptions(
  modeId: ResultModeId,
): WorkflowResultModeQuickStart[] {
  return getDomain(modeId).quickStarts
}
```

- [ ] **Step 4: Delete all per-domain constants**

Remove: `DEVELOPMENT_PACK_IDS`, `CONTENT_PACK_IDS`, `MARKETING_PACK_IDS`, `COURSES_PACK_IDS`, `DEVELOPMENT_TEMPLATE_IDS`, `CONTENT_TEMPLATE_IDS`, `MARKETING_TEMPLATE_IDS`, `COURSES_TEMPLATE_IDS`, all `*_METADATA_TOKENS`, `COURSES_STAGE_TOKENS`, `QUICK_STARTS_BY_MODE`, the old `RESULT_MODES` array.

- [ ] **Step 5: Update tests**

Tests should still pass — same data, different source.

- [ ] **Step 6: Type-check + test**

Run: `npx tsc --noEmit && npx vitest run src/renderer/lib/result-modes.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/lib/result-modes.ts src/renderer/lib/result-modes.test.ts
git commit -m "refactor: migrate result-modes.ts to domain registry"
```

---

### Task 4: Migrate result-mode-config.ts and result-mode-factory.ts

**Files:**
- Modify: `src/renderer/lib/result-mode-config.ts`
- Modify: `src/renderer/lib/result-mode-factory.ts`
- Modify: test files for both

- [ ] **Step 1: Migrate result-mode-config.ts**

Replace `RESULT_MODE_CONFIG_FIELDS` with domain lookup:

```typescript
import { getDomain } from "@shared/domains"

export function getResultModeConfigFields(modeId: ResultModeId) {
  return getDomain(modeId).configFields
}
```

Replace `RESULT_MODE_CONFIG_LABELS` with:

```typescript
function getConfigLabel(fieldId: string, modeId: ResultModeId): string {
  return getDomain(modeId).configLabels[fieldId] || fieldId
}
```

- [ ] **Step 2: Migrate result-mode-factory.ts**

Replace all branching functions with domain lookups:

```typescript
import { getDomain } from "@shared/domains"

function factoryLabelForMode(mode, values, existingFactory) {
  const domain = getDomain(mode.id)
  return firstFilled(
    values[domain.factoryTitleFieldId],
    existingFactory?.label,
    existingFactory?.outcome?.title,
    domain.factoryFallbackLabel,
  )
}

function defaultQualityPolicy(mode) {
  return getDomain(mode.id).qualityPolicy
}

function defaultCaseGenerationRule(mode) {
  return getDomain(mode.id).caseGenerationRule
}

function defaultSuccessSignal(mode) {
  return getDomain(mode.id).successSignal
}

function buildStrategistCheckpoints(mode, values, existingFactory) {
  if (mode.id === "development") {
    const configured = splitLines(values.strategist_checkpoints)
    if (configured.length > 0) return configured
  }
  if (existingFactory?.recipe?.strategistCheckpoints?.length) {
    return existingFactory.recipe.strategistCheckpoints
  }
  return getDomain(mode.id).factoryCheckpoints
}

function buildOutcomeStatement(mode, values) {
  const domain = getDomain(mode.id)
  if (domain.buildOutcomeSections) {
    const sections = domain.buildOutcomeSections(values)
    if (sections.length === 0) return undefined
    return sections.map((s) => `${s.label}: ${s.value}`).join("\n")
  }
  return undefined
}

function buildConstraints(mode, values, existingFactory) {
  const domain = getDomain(mode.id)
  const next = [...(existingFactory?.outcome?.constraints || [])]
  if (domain.buildConstraints) {
    next.push(...domain.buildConstraints(values))
  }
  return dedupe(next)
}

function buildAudience(mode, values, existingFactory) {
  const domain = getDomain(mode.id)
  if (domain.buildAudience) {
    return domain.buildAudience(values) || existingFactory?.outcome?.audience
  }
  return existingFactory?.outcome?.audience
}
```

And in `buildFactoryFromResultMode()`, replace the per-mode field selections:

```typescript
const domain = getDomain(mode.id)
const outcomeTitle = firstFilled(
  normalizedValues[domain.factoryTitleFieldId],
  existingFactory?.outcome?.title,
  label,
) || label
// ...
successSignal: firstFilled(
  domain.factorySuccessFieldId ? normalizedValues[domain.factorySuccessFieldId] : undefined,
  existingFactory?.outcome?.successSignal,
  defaultSuccessSignal(mode),
),
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/renderer/lib/result-mode-config.test.ts src/renderer/lib/result-mode-factory.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/lib/result-mode-config.ts src/renderer/lib/result-mode-factory.ts src/renderer/lib/result-mode-config.test.ts src/renderer/lib/result-mode-factory.test.ts
git commit -m "refactor: migrate result-mode-config and result-mode-factory to domain registry"
```

---

### Task 5: Migrate shared utilities

**Files:**
- Modify: `src/shared/create-entry-routing.ts`
- Modify: `src/renderer/lib/process-spine.ts`

- [ ] **Step 1: Migrate create-entry-routing.ts**

Replace banned entry constants and if-chain:

```typescript
import { getDomain } from "./domains"

export function isBannedDirectCreateEntryTemplateId(
  modeId: ResultModeId,
  templateId: string,
): boolean {
  return getDomain(modeId).bannedEntryTemplateIds.has(templateId)
}
```

Delete `DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS` and `CONTENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS`.

- [ ] **Step 2: Migrate process-spine.ts**

Replace hardcoded overrides and pack IDs:

```typescript
import { allDomains } from "@shared/domains"

// Build merged overrides from all domains
const TEMPLATE_STAGE_OVERRIDES: Record<string, ProcessSpineStageId> =
  Object.fromEntries(
    allDomains().flatMap((d) => Object.entries(d.templateStageOverrides)),
  )

const PROCESS_PACK_IDS = new Set(
  allDomains().flatMap((d) => [...d.spinePackIds]),
)
```

Delete `DEV_PROCESS_PACK_IDS`, `CONTENT_PROCESS_PACK_IDS`, and the old hardcoded `TEMPLATE_STAGE_OVERRIDES`.

- [ ] **Step 3: Type-check + test**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/shared/create-entry-routing.ts src/renderer/lib/process-spine.ts
git commit -m "refactor: migrate create-entry-routing and process-spine to domain registry"
```

---

### Task 6: Migrate create-entry-router.ts (main process)

**Files:**
- Modify: `src/main/lib/create-entry-router.ts`

- [ ] **Step 1: Replace mode guards with domain lookup**

```typescript
import { getDomain } from "@shared/domains"

// In routeCreateEntry():
if (!getDomain(input.modeId).guidedRouting) {
  throw new Error("Agent routing is not available for this domain.")
}

// In runAgentRouteDecision():
const domain = getDomain(input.modeId)
if (!domain.guidedRouting || allowedOptions.length === 0) return null
```

- [ ] **Step 2: Move prompt building to domain lookup**

The dev router prompt (`buildRouterPrompt`) stays in this file for now — it's the default fallback. The content router prompt (`buildContentRouterPrompt`) moves to the content domain data file.

In `runAgentRouteDecision()`:

```typescript
const domain = getDomain(input.modeId)

// Gather domain-specific context if needed
let routerContext: Record<string, unknown> = projectInspection
if (input.modeId === "content") {
  const artifacts = await listProjectArtifacts(projectInspection.projectPath).catch(() => [])
  routerContext = buildContentDomainContext(artifacts)
}

// Use domain's prompt builder or fallback to dev prompt
const prompt = domain.buildRouterPrompt
  ? domain.buildRouterPrompt(input, routerContext, allowedOptions)
  : buildRouterPrompt(input, projectInspection, allowedOptions)
```

Note: `buildRouterPrompt` (dev prompt) stays in this file as the fallback. Domain-specific prompts live in domain data files. `buildContentRouterPrompt` moves to `content-data.ts`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/main/lib/create-entry-router.ts
git commit -m "refactor: migrate create-entry-router to domain registry"
```

---

### Task 7: Migrate renderer components

**Files:**
- Modify: `src/renderer/components/WorkflowCreatePage.tsx`
- Modify: `src/renderer/components/create/WorkflowCreateComposerFooter.tsx`
- Modify: `src/renderer/components/create/useWorkflowCreateDerivedState.ts`
- Modify: `src/renderer/components/templates/templateLibraryModel.ts`
- Modify: `src/renderer/components/ui/result-mode-card.tsx`

- [ ] **Step 1: WorkflowCreatePage.tsx**

Replace:
```typescript
const isGuidedRouting =
  selectedResultMode.id === "development" ||
  selectedResultMode.id === "content"
```
With:
```typescript
import { isGuidedDomain } from "@shared/domains"
const isGuidedRouting = isGuidedDomain(selectedResultMode.id)
```

Same for `preRoutingActive`.

- [ ] **Step 2: WorkflowCreateComposerFooter.tsx**

Replace:
```typescript
{selectedResultMode.id === "development" ||
 selectedResultMode.id === "content" ? (
```
With:
```typescript
import { isGuidedDomain } from "@shared/domains"
// ...
{isGuidedDomain(selectedResultMode.id) ? (
```

- [ ] **Step 3: useWorkflowCreateDerivedState.ts**

Replace 6 `selectedResultMode.id === "development"` checks. For the ones that are truly dev-only (contextual route options, quick start prioritization), check `selectedResultMode.id === "development"` is still correct — or determine if these should extend to guided domains.

For routing-related checks, use `isGuidedDomain()`. For dev-specific presentation (contextual route options, special quick start ordering), keep the dev check for now — these can be migrated to domain properties in a follow-up.

- [ ] **Step 4: templateLibraryModel.ts**

Replace hardcoded mappings in `deriveCreateModeId()`:

```typescript
import { allDomains } from "@shared/domains"

export function deriveCreateModeId(
  activeCategory: TemplateCategoryKey,
  fallbackModeId: ResultModeId,
  selectedTemplate: WorkflowTemplate | null,
): ResultModeId {
  if (selectedTemplate?.pack?.id) {
    const domain = allDomains().find((d) =>
      d.packIds.includes(selectedTemplate.pack!.id),
    )
    if (domain) return domain.id
  }
  // category-to-mode mapping stays simple
  if (activeCategory === "product") return "development"
  if (activeCategory === "marketing") return "marketing"
  if (activeCategory === "content") return "content"
  return fallbackModeId
}
```

- [ ] **Step 5: result-mode-card.tsx**

Replace:
```typescript
{mode.id === "development" ? (
  <span ...>Primary</span>
) : null}
```
With:
```typescript
import { getDomain } from "@shared/domains"
// ...
{getDomain(mode.id).primaryDomain ? (
  <span ...>Primary</span>
) : null}
```

- [ ] **Step 6: Type-check + full test suite**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/
git commit -m "refactor: migrate renderer components to domain registry"
```

---

### Task 8: Clean up and verify

- [ ] **Step 1: Verify no remaining if-branches**

Search for leftover mode-specific patterns:

```bash
grep -rn '"development"\|"content"\|"marketing"\|"courses"' src/renderer/lib/result-modes.ts src/renderer/lib/result-mode-config.ts src/renderer/lib/result-mode-factory.ts src/shared/create-entry-routing.ts src/renderer/lib/process-spine.ts
```

Expected: zero matches (all moved to domain files).

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: all existing tests pass, zero regressions.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
- Switch between Dev, Content, Marketing, Courses domains
- Verify templates filter correctly per domain
- Verify routing works for Dev and Content
- Verify spine shows for Dev and Content
- Verify intent selector shows for Dev and Content, hidden for Marketing/Courses

- [ ] **Step 5: Final commit**

```bash
git commit -m "refactor: domain entity extraction complete — one file per domain"
```
