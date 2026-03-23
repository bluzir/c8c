# Content Guided Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable full guided experience (routing agent, intents, spine, domain context) for the Content domain, matching what Dev already has.

**Architecture:** Extend the existing domain-parameterized routing infrastructure. The Dev routing path (`create-entry-router.ts`) gains a Content branch with its own agent prompt, domain context collector, banned entries, and spine mapping. No new frameworks — same patterns, different config.

**Tech Stack:** TypeScript, Jotai atoms, Claude Agent SDK (bounded routing call), Vitest.

**Spec:** `docs/superpowers/specs/2026-03-23-content-guided-experience-design.md`

---

### Task 1: Add Content banned entry templates

**Files:**
- Modify: `src/shared/create-entry-routing.ts`

- [ ] **Step 1: Add CONTENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS**

```typescript
export const CONTENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS = new Set([
  "content-ready-posts",
  "content-distribution-bundle",
  "content-editorial-calendar",
  "content-idea-backlog",
])
```

- [ ] **Step 2: Update isBannedDirectCreateEntryTemplateId to handle content**

Replace the dev-only check:

```typescript
export function isBannedDirectCreateEntryTemplateId(
  modeId: ResultModeId,
  templateId: string,
): boolean {
  if (modeId === "development")
    return DEVELOPMENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS.has(templateId)
  if (modeId === "content")
    return CONTENT_BANNED_DIRECT_ENTRY_TEMPLATE_IDS.has(templateId)
  return false
}
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/create-entry-routing.ts
git commit -m "feat: add content banned entry templates"
```

---

### Task 2: Add Content spine mapping

**Files:**
- Modify: `src/renderer/lib/process-spine.ts`

- [ ] **Step 1: Add content template stage overrides**

Add to `TEMPLATE_STAGE_OVERRIDES`:

```typescript
// Content Lab
"content-trend-watch": "shape_map",
"content-post-calendar": "plan",
"content-draft-post": "implement",
"content-qa-review": "verify",
"content-ready-posts": "ship",
"content-repurposing-factory": "implement",
"content-pipeline": "ship",
"content-editorial-calendar": "plan",
"content-idea-backlog": "shape_map",
"content-distribution-bundle": "ship",
"predictable-text-factory": "implement",
"copy-quality-pipeline": "verify",
```

- [ ] **Step 2: Add content pack IDs to spine detection**

Add `"content-factory-alpha"` to the pack ID sets that trigger spine awareness. Find or create a `CONTENT_PROCESS_PACK_IDS` set and integrate it alongside `DEV_PROCESS_PACK_IDS` in the spine building logic.

- [ ] **Step 3: Add JOURNEY_STAGE_TO_PROCESS_STAGE entries for content stage_family values**

Verify these mappings exist in the `JOURNEY_STAGE_TO_PROCESS_STAGE` record. Add if missing:

```typescript
design: "plan",
evaluate: "verify",
deliver: "ship",
understand: "shape_map",
```

`design` and `deliver` are currently missing. `evaluate` maps to `verify`, `understand` maps to `shape_map`.

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/process-spine.ts
git commit -m "feat: add content template spine mapping"
```

---

### Task 3: Update placeholder text and guided path for Content

**Files:**
- Modify: `src/renderer/lib/result-modes.ts`

- [ ] **Step 1: Update content result mode**

Find the content entry in `RESULT_MODES` and update:

```typescript
{
  id: "content",
  composerPlaceholder: "Describe the content you want — a post, a calendar, a trend digest, a strategy. Add audience and tone constraints if they matter...",
  startActionLabel: "Start from request",
  guidedPath: ["Understand", "Plan", "Build", "Check", "Ship"],
}
```

Key changes:
- `composerPlaceholder`: content-specific but guided, not marketing-jargon
- `startActionLabel`: same as dev ("Start from request"), not "Start guided path"
- `guidedPath`: universal spine labels matching dev

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/result-modes.ts
git commit -m "feat: update content placeholder and guided path to universal spine"
```

---

### Task 4: Build Content domain context collector

**Files:**
- Create: `src/main/lib/create-entry-content-context.ts`
- Modify: `src/main/ipc/templates.ts` (add IPC handler)
- Modify: `src/preload/index.ts` (expose to renderer)

- [ ] **Step 1: Define ContentDomainContext type**

Add to `src/shared/types.ts`:

```typescript
export interface ContentDomainContext {
  previousResults: Array<{
    kind: string
    title: string
    ageMs: number
  }>
  templatesRun: string[]
  availableTools: string[]
}
```

- [ ] **Step 2: Create content context collector**

Create `src/main/lib/create-entry-content-context.ts`:

```typescript
import type { ContentDomainContext } from "@shared/types"

const CONTENT_RESULT_KINDS = new Set([
  "trend_digest",
  "editorial_calendar",
  "draft",
  "content_brief",
  "distribution_bundle",
])

const CONTENT_TEMPLATE_PREFIXES = ["content-", "predictable-text-", "copy-quality-"]

export async function inspectContentDomainContext(
  projectPath: string,
  deps: {
    listSavedArtifacts: (projectPath: string) => Promise<Array<{ kind: string; title: string; savedAt: number }>>
    listRunHistory: (projectPath: string) => Promise<Array<{ templateId: string }>>
    listAvailableMcpTools: (projectPath: string) => Promise<string[]>
  },
): Promise<ContentDomainContext> {
  const now = Date.now()

  const [artifacts, runs, tools] = await Promise.all([
    deps.listSavedArtifacts(projectPath).catch(() => []),
    deps.listRunHistory(projectPath).catch(() => []),
    deps.listAvailableMcpTools(projectPath).catch(() => []),
  ])

  const previousResults = artifacts
    .filter((a) => CONTENT_RESULT_KINDS.has(a.kind))
    .map((a) => ({ kind: a.kind, title: a.title, ageMs: now - a.savedAt }))
    .slice(0, 10)

  const templatesRun = [
    ...new Set(
      runs
        .filter((r) =>
          CONTENT_TEMPLATE_PREFIXES.some((prefix) =>
            r.templateId.startsWith(prefix),
          ),
        )
        .map((r) => r.templateId),
    ),
  ]

  const availableTools = tools.filter((t) =>
    ["web_search", "exa", "serper"].includes(t),
  )

  return { previousResults, templatesRun, availableTools }
}
```

- [ ] **Step 3: Wire IPC handler**

Add to `src/main/ipc/templates.ts`:

```typescript
ipcMain.handle(
  "templates:inspect-content-domain-context",
  async (_event, projectPath: string) => {
    return inspectContentDomainContext(projectPath, {
      listSavedArtifacts: /* wire to existing artifact store */,
      listRunHistory: /* wire to existing run history */,
      listAvailableMcpTools: /* wire to existing MCP registry */,
    })
  },
)
```

Wire the actual dependencies by reading how the existing artifact/run/MCP APIs work in the same file.

- [ ] **Step 4: Expose in preload**

Add to `src/preload/index.ts`:

```typescript
inspectContentDomainContext: (projectPath: string) =>
  ipcRenderer.invoke("templates:inspect-content-domain-context", projectPath),
```

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/lib/create-entry-content-context.ts src/main/ipc/templates.ts src/preload/index.ts
git commit -m "feat: add content domain context collector"
```

---

### Task 5: Build Content routing agent prompt and extend router

**Files:**
- Modify: `src/main/lib/create-entry-router.ts`

- [ ] **Step 1: Add buildContentRouterPrompt function**

Add below the existing `buildRouterPrompt`:

```typescript
function buildContentRouterPrompt(
  input: CreateEntryRouteInput,
  contentContext: ContentDomainContext,
  allowedOptions: CreateEntryRouteOption[],
): string {
  const requestSections = {
    draftPrompt: normalize(input.draftPrompt),
    requestedResult: normalize(input.requestedResult),
    helpModeHint: input.helpModeHint || null,
  }

  const allowedOptionSummary = allowedOptions
    .map(
      (option) =>
        `- ${option.templateId}: ${option.label}${option.intentLabel ? ` [${option.intentLabel}]` : ""}`,
    )
    .join("\n")

  return [
    "You are c8c's bounded entry router for the Content domain.",
    "Choose the best FIRST starting point for the user's content request. Return JSON only.",
    "",
    "Content domain contract:",
    "- The user wants to create, plan, or review content — posts, calendars, strategies, quality checks.",
    "- Trend research is the right first step when the user needs an evidence base before planning.",
    "- Calendar planning is right when the user has context and needs to decide what to publish.",
    "- Drafting is right when the user has a specific topic or slot and wants a post written.",
    "- Quality review is right when the user has a draft and needs slop/tone/quality check.",
    "- Strategy is right when the user needs a full content strategy from a product brief.",
    "- Repurposing is right when the user has existing material and wants it in different formats.",
    "- Recurring/cadence requests should route to calendar planning (full recurring execution is not yet available).",
    "- Help mode is a hard constraint when present.",
    "- Handle English, Russian, and mixed-language requests.",
    "",
    "Allowed starting points:",
    allowedOptionSummary,
    "",
    "Content context:",
    JSON.stringify(contentContext, null, 2),
    "",
    "User request:",
    JSON.stringify(requestSections, null, 2),
    "",
    "Clarification policy:",
    "- Use `help_mode` clarification when the ambiguity is mainly about kind of help: Do it vs Plan it vs Review it.",
    "- Use `job_route` clarification when the ambiguity is between different content jobs (e.g., draft vs strategy vs quality check).",
    "- If helpModeHint is already present, avoid clarification unless the request is still ambiguous.",
    "",
    "Route output schema:",
    '{"kind":"route","recommendedTemplateId":"string","alternateTemplateIds":["string"],"domainMode":"content","reason":"one sentence","confidence":0.0}',
    "",
    "Clarification output schema:",
    '{"kind":"clarification","recommendedTemplateId":"string","alternateTemplateIds":["string"],"domainMode":"content","reason":"one sentence","confidence":0.0,"clarification":{"kind":"help_mode|job_route","title":"string","message":"string","options":[{"value":"string","label":"string","description":"string","disabled":false,"templateId":"string"}]}}',
  ].join("\n")
}
```

- [ ] **Step 2: Extend routeCreateEntry to accept content mode**

Replace the dev-only guard at line 401:

```typescript
if (input.modeId !== "development" && input.modeId !== "content") {
  throw new Error(
    "Agent routing is currently available only for development and content modes.",
  )
}
```

- [ ] **Step 3: Branch prompt building by domain**

After the options filtering block (around line 434), branch the prompt:

```typescript
const prompt =
  input.modeId === "content"
    ? buildContentRouterPrompt(
        sanitizedInput,
        input.contentContext ?? { previousResults: [], templatesRun: [], availableTools: [] },
        constrainedOptions,
      )
    : buildRouterPrompt(sanitizedInput, projectInspection, constrainedOptions)
```

Add `contentContext?: ContentDomainContext` to `CreateEntryRouteInput` in `src/shared/types.ts`.

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/main/lib/create-entry-router.ts src/shared/types.ts
git commit -m "feat: add content routing agent prompt and extend router"
```

---

### Task 6: Wire intents for Content domain in renderer

**Files:**
- Modify: `src/renderer/components/WorkflowCreatePage.tsx`

- [ ] **Step 1: Find the dev-only intent gate**

Look for where `developmentHelpModeHint` is conditionally used only when domain is development. The intent selector and the help mode logic need to also fire for `modeId === "content"`.

Search for conditions like `modeId === "development"` or `selectedResultModeId === "development"` that gate:
- Passing `helpModeHint` to the router
- Showing intent selector UI
- Handling clarification responses

- [ ] **Step 2: Extend intent gate to include content**

Change each dev-only condition to also allow content. Pattern:

```typescript
// Before:
if (selectedResultModeId === "development") { /* intent logic */ }

// After:
if (selectedResultModeId === "development" || selectedResultModeId === "content") { /* intent logic */ }
```

- [ ] **Step 3: Pass contentContext when routing content domain**

In the `routeCreateEntry` call, when `selectedResultModeId === "content"`, fetch content domain context first:

```typescript
const contentContext =
  selectedResultModeId === "content" && selectedProject?.path
    ? await window.api.inspectContentDomainContext(selectedProject.path)
    : undefined
```

Include it in the route input.

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Manual test — switch to Content domain, type a request, verify routing fires**

1. Switch domain selector to Content
2. Type "Что нового в AI агентах?"
3. Verify routing agent fires (not library fallback)
4. Verify spine shows with correct labels

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/WorkflowCreatePage.tsx
git commit -m "feat: wire intents and routing for content domain"
```

---

### Task 7: Update template filtering for Content Lab pack

**Files:**
- Modify: `src/renderer/lib/result-modes.ts`

- [ ] **Step 1: Add content-factory-alpha to Content pack scoring**

Find the content scoring section (around lines 601-621). Add `"content-factory-alpha"` to the pack membership check alongside `"ai-cmo"`:

```typescript
// Content Lab + ai-cmo packs get highest score
if (packId === "content-factory-alpha" || packId === "ai-cmo") return 100
```

- [ ] **Step 2: Add Content Lab template IDs to explicit content list**

Ensure these template IDs are in the content scoring list:

```typescript
"content-trend-watch",
"content-post-calendar",
"content-draft-post",
"content-qa-review",
"content-pipeline",
"content-repurposing-factory",
"predictable-text-factory",
"copy-quality-pipeline",
```

- [ ] **Step 3: Update content quick starts**

Update the content quick starts to feature the Content Lab entry points:

```typescript
// Content quick starts
{ templateId: "content-trend-watch", intentLabel: "Plan it" },
{ templateId: "content-draft-post", intentLabel: "Do it" },
{ templateId: "content-qa-review", intentLabel: "Review it" },
{ templateId: "content-pipeline", intentLabel: "Do it" },
```

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/result-modes.ts
git commit -m "feat: update content template filtering and quick starts"
```

---

### Task 8: Integration test — full Content routing flow

- [ ] **Step 1: Run the app**

Run: `npm run dev`

- [ ] **Step 2: Test Content routing with various inputs**

| Input | Expected route |
|-------|---------------|
| "Что нового в AI агентах?" | Watch trends |
| "Напиши пост про Claude" | Draft a post |
| "Спланируй контент на неделю" | Plan content calendar |
| "Проверь мой черновик" | Review content quality |
| "Нужна контент-стратегия" | Build content strategy |
| "Сделай из подкаста 5 постов" | Repurpose content |

- [ ] **Step 3: Test intents**

- Select Do → type "пост про AI" → should route to Draft
- Select Plan → type "контент на неделю" → should route to Calendar
- Select Review → type "проверь текст" → should route to QA Review

- [ ] **Step 4: Test spine visibility**

After routing, verify the spine shows `Understand → Plan → Build → Check → Ship` with the correct stage highlighted for the selected starting point.

- [ ] **Step 5: Test flow chaining**

Run a content-trend-watch flow to completion. Verify the result surface shows "Continue to Plan content calendar" CTA.

- [ ] **Step 6: Final commit**

```bash
git commit -m "feat: content guided experience — routing, intents, spine, domain context"
```
