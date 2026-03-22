# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

c8c (cybernetic) is a flow composer with hidden orchestration underneath. Simple on the outside (one input, one flow), powerful inside (directed graphs of skill nodes executed via CLI backends).

North star: the user describes point B, c8c picks the best first step, then reveals state instead of structure as the flow runs.

## Product Vocabulary (R2-CANON)

Canonical product decisions live in `docs/conventions/R2-CANON.md`. When writing or modifying user-facing strings, use these terms:

| User sees                        | Code uses                    | Never in UI                   |
| -------------------------------- | ---------------------------- | ----------------------------- |
| **flow**                         | workflow                     | workflow, process, chain      |
| **step**                         | stage, phase                 | stage, phase                  |
| **starting point**               | template, entry route        | template                      |
| **skill**                        | skill ref                    | capability                    |
| **check**                        | gate (auto-pass/auto-return) | gate                          |
| **approval**                     | gate (human decision)        | gate                          |
| **flow rules**                   | policy                       | policy, autonomy, trust score |
| typed result ("Review findings") | artifact                     | artifact                      |

Internal code (variable names, types, file names) keeps existing vocabulary. Only user-facing strings (JSX text, placeholders, labels, tooltips, toasts, errors) must follow this table.

## Decision Architecture: Agent-Only, No Heuristics

Any logic that interprets user natural language (routing, intent classification, disambiguation) **must go through an LLM agent call**. No regex, no keyword matching, no `if prompt.includes(...)` patterns.

The only non-agent logic allowed is reading structural project facts (empty dir vs has code, project kind, git state). These are **inputs to the agent**, not decision branches.

See `AGENTS.md` and `docs/conventions/R2-CANON.md` Section 2.4 for full spec.

## Visual Hierarchy Rules (Ship-Blockers)

Five hard rules from `docs/DESIGN-PHILOSOPHY.md` §8. Every renderer change must pass:

1. **One Figure Per State** — only the primary object gets card treatment (border+bg+elevation). Everything else is flat ground.
2. **≤5 Visible Actions Per State** — excess goes to overflow. One `variant="default"` CTA per state. No dual primary buttons.
3. **Show Only What Matters Now** — no empty tabs, no disabled-but-visible controls, no sections for future states.
4. **One Status Signal Per Fact** — progress, blocked status, current step each appear in exactly one place.
5. **No Cards Inside Cards** — a bordered container never nests another bordered container.

One exception is allowed: contextual depth when the state would otherwise be a dead end. It must live inside the figure or its local context strip and may be either a single low-emphasis advanced link or a compact content-aware tab strip (`Result`, `Activity`, `Step log`, `History`). Never render empty tabs, and never promote these tabs into page chrome for idle/create states.

Workflow and project pages get one strong top-level header. Child surfaces below that header must use flat context strips, not repeated hero headers.

Thresholds: ≤3 bordered containers, ≤5 clickable elements, 0 duplicate signals, 0 nested cards, 0 rendered-but-empty sections.

**Surface weight:** Components are flat by default (Level 0). Card treatment (border+bg+elevation, Level 3) is only for the figure. See `docs/conventions/DESIGN-PHILOSOPHY.md` §8 Surface Weight Ladder for the full 4-level hierarchy.

**Before rendering a component:** Does it have content? Does the user need it NOW? Does it duplicate something visible? Pass all three → render. Fail any → don't.

**Composer-first guardrail:** On create/start surfaces, a dominant continuation may own the card weight, but it must not hide or replace the primary point-B input path. The composer stays directly visible and focusable.

**Screen composition:** Before laying out any screen, define The One Question it answers, then follow the composition stack: Chrome → Context → Verdict (card) → Evidence Panel → Input → Depth. Three verdict variants: outcome (pass/fail), diagnostic (root cause/findings), document (conclusion + reading surface). Full guide: `docs/conventions/SCREEN-COMPOSITION-GUIDE.md`.

**Before adding a new surface:** Run the bidirectional checklist in `docs/conventions/NEW-ENTITY-CHECKLIST.md` — top-down (job → question → verdict → layout) AND bottom-up (component → question → job). If any layer has no answer, don't ship it.

**Auditing existing components:** Follow `docs/conventions/COMPONENT-AUDIT-PLAN.md` — per-component check against all 8 layers with numeric thresholds.

## Commands

```bash
npm run dev          # Start Electron with hot reload
npm run build        # Build for production
npm run lint         # Run ESLint
npm run format       # Format the repo with Prettier
npm run canon:check  # Check renderer copy against canon vocabulary
npm run test         # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npx tsc --noEmit     # Type-check without emitting
```

## Architecture

Electron app with three app layers:

- **Main** (`src/main/`) — Electron main process. IPC handlers in `ipc/`, business logic in `lib/`
- **Preload** (`src/preload/index.ts`) — Context bridge exposing `window.api` with 40+ IPC methods
- **Renderer** (`src/renderer/`) — React UI

Path aliases: `@` → `src/renderer`, `@shared` → `src/shared` (in tsconfig and electron-vite config).

### Graph-Based Flow Model

Workflows are directed graphs, not linear chains. Defined in `src/shared/types.ts`:

**7 node types**: `input`, `skill`, `evaluator`, `splitter`, `merger`, `output`, `approval`
**3 edge types**: `default`, `pass`, `fail` — evaluator nodes branch on pass/fail

Key configs per node type:

- **Skill**: `skillRef`, `prompt`, `model` (sonnet|opus|haiku), `outputMode`, `maxTurns`, `allowedTools[]`
- **Evaluator**: `criteria`, `threshold` (1-10), `maxRetries`, `retryFrom` node
- **Splitter**: `strategy`, `maxBranches` — fans out into parallel branches at runtime
- **Merger**: `strategy` (concatenate|summarize|select_best)
- **Approval**: human approval with optional edit

Runtime expands the base graph — splitter nodes create parallel branches tracked via `runtimeNodesAtom`/`runtimeEdgesAtom`/`runtimeMetaAtom`.

### State Management

Jotai atoms in `src/renderer/lib/store.ts`. Key patterns:

- `currentWorkflowAtom` holds the full graph (nodes + edges)
- `workflowDirtyAtom` is a computed atom comparing current state against `workflowSavedSnapshotAtom`
- Persistent atoms (sidebar width, main view, chat panel width) survive across sessions
- Execution state: `runStatusAtom` ("idle"|"running"|"done"|"error"), `nodeStatesAtom`, `evalResultsAtom`

### View Routing

`mainViewAtom` switches between: `"thread"` (flow editor), `"skills"`, `"templates"` (Library), `"settings"`.

Flow editing surfaces via `viewModeAtom`: `"list"` (linear chain builder) and `"settings"` (flow defaults).

### IPC Pattern

Main ↔ Renderer communication via `window.api` (defined in preload). Two patterns:

1. **Invoke**: `window.api.runChain()`, `window.api.saveWorkflow()` — request/response
2. **Events**: `window.api.onWorkflowEvent()`, `window.api.onBatchEvent()` — returns unsubscribe function

## Styling

**Design system** built on CSS custom properties + Tailwind extensions.

### Runtime shell constraint

Resume/continuation state renders as a **compact header inside the existing runtime shell**, not as a separate mode or landing page. Rules:

- No full-screen explainers — the header sits above the work surface, not in place of it
- No text prologues — structured elements (badges, label+value grids, action buttons), not paragraphs
- Max visual weight: badges row + title + 3-column status grid + action row. No additional expandable sections, history panels, or detail cards without explicit approval
- The user should reach the primary action (Run / Continue) without scrolling past the header
- Component name: `WorkflowResumeHeader`, never "landing"

### Key tokens

- **Surfaces**: `bg-sidebar`, `bg-surface-1`, `bg-surface-2`, `bg-surface-3` — layered depth
- **Status colors**: `text-status-success`, `text-status-warning`, `text-status-danger`, `text-status-info`
- **Elevation**: `--elevation-base`, `--elevation-overlay` (inset highlights + shadows)
- **Motion**: `--motion-fast` (140ms), `--motion-base` (170ms), `--motion-slow` (220ms)
- **Control heights**: `control-xs` (1.25rem), `control-sm` (1.75rem), `control-md` (2.25rem), `control-lg` (2.5rem)

### Sidebar typography tokens (defined in tailwind.config.js)

Use these for sidebar elements — not generic `text-body-sm` or `ui-meta-text`:

| Token                | Size              | Weight | Purpose                      |
| -------------------- | ----------------- | ------ | ---------------------------- |
| `text-sidebar-item`  | 13px, lh 1rem     | 400    | Nav items, flow names        |
| `text-sidebar-label` | 11px, lh 1rem     | 500    | Project folder group headers |
| `text-sidebar-meta`  | 10px, lh 0.875rem | 400    | Timestamps, helper text      |

Sidebar layout defaults to `256px` width with a supported resize range of `224px` to `384px`.
Sidebar nav items should preserve regular-weight `text-sidebar-item`; do not inherit heavier button typography.
Sidebar rows should stay compact: project headers around 26px minimum height, thread rows with tight padding, and at most one secondary meta line.

`section-kicker` (11px, fw 600, uppercase, tracked) stays for structural section dividers like "Threads".

### Content typography tokens

`text-body-sm` and `text-body-md` are approved content tokens (defined in `tailwind.config.js`) and can be used in components.

- `text-body-md` (14px) — default readable body text
- `text-body-sm` (13px) — compact body/controls copy
- `ui-body-text` is the utility equivalent of `text-body-md`
- `ui-meta-text` is for metadata/helper text

### Custom utility classes (in globals.css)

- `.surface-panel`, `.surface-elevated`, `.surface-figure`, `.surface-soft`, `.surface-inset-card`, `.surface-depth-header`, `.surface-depth-footer` — layered surface styles
- `.surface-figure` — **Level 3 figure surface** with overlay elevation + radius; use for the ONE primary object per state
- `.surface-info-soft`, `.surface-success-soft`, `.surface-danger-soft`, `.surface-warning-soft` — soft severity surfaces
- `.ui-context-strip`, `.ui-slab`, `.ui-inset-well`, `.ui-selected-row-tint`, `.ui-section-divider` — connective tissue (Level 0-2 grouping without cards)
- `.ui-empty-state-box` — standardized dashed-border empty state container (replaces ad-hoc `rounded-lg border-dashed bg-surface-2/30` patterns)
- `.ui-evidence-strip`, `.ui-evidence-item` — compact fact display for verdict cards
- `.ui-skeleton` — loading placeholder with pulse animation
- `.ui-item-selected` — interactive selection state for selectable items
- `.section-kicker`, `.ui-title-text`, `.ui-body-text`, `.ui-meta-text`, `.ui-meta-label`, `.ui-body-text-medium` — content typography
- `.ui-motion-fast`, `.ui-motion-standard` — transition duration shortcuts
- `.ui-transition-colors`, `.ui-transition-surface`, `.ui-transition-opacity`, `.ui-transition-width` — transition property helpers
- `.ui-scroll-region`, `.ui-scrollbar-hidden`, `.ui-dialog-gutter` — containment + layout helpers
- `.ui-interactive-card`, `.ui-interactive-card-subtle`, `.ui-pressable`, `.ui-icon-button`, `.ui-icon-button-danger`, `.ui-resize-handle`, `.ui-chevron` — interaction feedback
- `.ui-status-badge`, `.ui-status-badge-success|warning|danger|info`, `.ui-status-halo-danger` — status badge/halo patterns
- `.ui-alert-info|warning|danger|success` — compact alert containers; use these when the alert owns its padding/layout, and `surface-*-soft` when the component owns layout
- `.ui-badge-row`, `.ui-empty-state`, `.ui-metric-text`, `.inline-code`, `.prose-c8c`, `.ui-content-shell` — layout/content helpers
- `.control-cluster`, `.control-badge`, `.border-hairline`, `.ui-disclosure` — shared control primitives
- `.ui-elevation-base`, `.ui-elevation-inset`, `.ui-surface-lift`, `.ui-fade-slide-in`, `.ui-fade-slide-in-trailing` — elevation + motion composition
- `.ui-progress-track`, `.ui-progress-bar`, `.sidebar-progress-track`, `.sidebar-progress-bar` — progress primitives
- `.ui-collapsible`, `.ui-collapsible-inner` — collapsible content helpers

### Severity helpers (src/renderer/lib/surface-tokens.ts)

- `toneToSurface(tone)` — maps `"success"|"warning"|"danger"|"info"|"neutral"` to the corresponding `surface-*-soft` class
- `toneToBadge(tone)` — maps tone to the corresponding `ui-status-badge-*` class

Additional approved Tailwind typography tokens: `text-label-xs`, `text-title-sm`, `text-title-md`, `text-title-lg`.

## Key Dependencies

- `@claude-tools/runner` — Claude CLI subprocess spawner (`file:` link to `../shared-claude-tools/packages/claude-runner`)
- `gray-matter` — YAML frontmatter parsing from .md skill files
- `yaml` — Workflow YAML serialization
- `jotai` — Atomic state management
- `sonner` — Toast notifications

## Data Storage

- Projects config: `~/.c8c/config.json`
- Global flows: `~/.c8c/chains/`
- Project flows: `{project}/.c8c/*.yaml` or `{project}/.claude/workflows/*.yaml`

## Stack

Electron 39 + electron-vite, React 19, Tailwind CSS 3, Radix UI, Jotai, Lucide icons, Vitest.
