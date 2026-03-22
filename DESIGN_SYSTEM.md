# DESIGN_SYSTEM.md

This file documents the c8c design system for Claude Code. Use these tokens, primitives, and rules when building or modifying UI.

## Sources of Truth

- **CSS variables**: `src/renderer/styles/globals.css` (:root + .dark)
- **Tailwind extensions**: `tailwind.config.js`
- **UI primitives**: `src/renderer/components/ui/`
- **Known debt**: `docs/ui-consistency-audit-2026-03-11.md`

## Scope and Precedence

This document defines the renderer design system at four levels:

- **Tokens**: color, type, spacing, radius, elevation, motion
- **Primitives**: buttons, badges, dialogs, page shell, inputs, tabs
- **Reusable patterns**: approved figure shells, flat disclosures, detail panels, list rows
- **Usage constraints**: when card weight is allowed, what must flatten, and what should move to overflow

Precedence is explicit:

1. **Surface-specific product specs** own per-state figure selection and routing decisions
2. **`docs/DESIGN-PHILOSOPHY.md`** owns hard hierarchy laws and ship-blocker review rules
3. **`DESIGN_SYSTEM.md`** operationalizes those laws into tokens, primitives, and reusable implementation patterns
4. Local component conventions may specialize, but must not violate the three sources above

This file does not override surface ownership contracts from specs such as:

- `docs/superpowers/specs/2026-03-21-workflow-page-hierarchy-redesign.md`
- `docs/superpowers/specs/2026-03-21-main-and-templates-hierarchy-redesign.md`
- `docs/superpowers/specs/2026-03-21-onboarding-and-sidebar-hierarchy-redesign.md`

## Hard Hierarchy Rules

These rules are mandatory whenever you build or modify renderer UI.

| Rule | Required implementation |
|------|--------------------------|
| **One Figure Per State** | Only one object may receive Level 3 treatment (`border + background + elevation`) for a given state. Everything else stays Level 0-2. |
| **<=5 Visible Actions** | Count buttons, tabs, links, chips, selectors, toggles, and inline CTAs. If there are more than 5 visible actions, move excess into overflow or disclosure. |
| **Show Only What Matters Now** | Future-state UI, empty tabs, empty sections, and disabled-but-primary-looking controls do not render. |
| **One Status Signal Per Fact** | Progress, blocked state, dirty state, and current-step ownership appear in exactly one place. |
| **No Cards Inside Cards** | A Level 3 figure may contain flat content, separators, and tints, but not nested bordered/elevated sub-cards. |

Review thresholds:

| Metric | Target | Shippable (follow-up) | Ship-blocker |
|--------|--------|------------------------|--------------|
| Level 3 figures per state | 1 | 2 | >2 |
| Bordered containers per state | <=3 | 4-5 | >5 |
| Visible clickable elements per state | <=5 | 6-8 | >8 |
| Duplicate status signals | 0 | 0 | >0 |
| Nested cards | 0 | 0 | >0 |
| Rendered-but-empty sections | 0 | 0 | >0 |

## State-Conditional Rendering

Before a component renders, it must pass this checklist:

1. **Does it have content now?** If the section is empty, placeholder-only, or disabled-without-value, do not render it.
2. **Does the user need it in this state?** If the control serves a future or alternate state, keep it hidden until that state is active.
3. **Does it duplicate another visible fact?** If yes, one instance must go.
4. **Is it figure or ground?** Ground uses Level 0-2 treatment only. Level 3 is reserved for the current figure.
5. **Does it fit the action budget?** If not, move secondary actions into overflow, disclosure, or contextual reveal.

Common consequences:

- Tabs render only when their panel has content.
- Empty states are plain text plus one clear next action, not `surface-soft` shells.
- Suggestions, continuations, details panels, and routing states must be orchestrated by a single parent state contract rather than rendering independently at full weight.
- Sidebar and library surfaces must choose one dominant content region at a time rather than layering browse, search, empty, and detail states together.

## Surface Archetypes

Use one of these archetypes per active surface instead of mixing them:

| Archetype | Figure | Typical use |
|-----------|--------|-------------|
| `decision` | Verdict / decision card | approvals, failures, ready-to-continue states |
| `document` | Artifact or report body | saved reports, completed audits, briefs, specs |
| `activity` | Streaming feed / step stream | running and paused execution |
| `log` | Log viewer / inspector | trace/debug views |

Implementation rules:

- Allow **one strong page-level header** for the workflow or project. Do not restyle child surfaces as additional hero headers.
- Inside child surfaces, use a **flat context strip** for local title, status, and secondary links.
- Low-emphasis local navigation between sibling surfaces (`result`, `activity`, `log`, `history`) is allowed inside the owner surface when it replaces heavier tab chrome.
- For `document` and `log` archetypes, the content body owns Level 3. Metadata above it stays Level 0-1.

### Figure surface class

The figure per state uses `surface-elevated` (Level 3), NOT `surface-panel` (Level 2). `surface-elevated` has stronger elevation (`--elevation-overlay`) that visually separates it from all `surface-panel` containers. Without this distinction, the figure looks identical to surrounding panels.

| Surface class | Level | Use |
|--------------|-------|-----|
| `surface-panel` | Level 2 | Supporting containers: settings panels, editor cards, form sections |
| `surface-elevated` | Level 3 | **The figure only:** verdict card, prompt composer shell, active approval card, detail panel when selected |

Currently `surface-elevated` is used only in `dialog.tsx`. It must be applied to figure components per state. This is the implementation gap that makes "One Figure Per State" invisible in the shipped UI.

### Verdict tone via severity surfaces

Verdict/check/loop components must use outcome-toned surfaces, not neutral `bg-surface-2`:

| Outcome | Surface class |
|---------|--------------|
| Passed / success | `surface-success-soft` |
| Warning / returned | `surface-warning-soft` |
| Failed / danger | `surface-danger-soft` |
| Info / neutral | `surface-info-soft` |

These classes exist in `globals.css` but are currently unused on verdict components (`ExecutionCheckRecord`, `ExecutionLoopCard` both use neutral `bg-surface-2/55`). Fix: derive surface class from `record.status` or `summary.outcome`.

## Color Palette

All colors are HSL via CSS custom properties. Light and dark mode defined in globals.css.

### Semantic colors

| Token | Usage |
|-------|-------|
| `background` / `foreground` | Page base |
| `card` / `card-foreground` | Card surfaces |
| `popover` / `popover-foreground` | Floating overlays |
| `primary` / `primary-foreground` | Primary actions (buttons, rings) |
| `secondary` / `secondary-foreground` | Secondary fills |
| `muted` / `muted-foreground` | Subdued backgrounds, helper text |
| `accent` / `accent-foreground` | Hover highlights |
| `destructive` / `destructive-foreground` | Danger actions |

### Surface tokens

These tokens describe fill colors only. They do **not** grant permission to create additional card-weight containers.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `surface-1` | white | 10% | Cards, panels, dialogs |
| `surface-2` | 96% | 12% | Recessed areas, hover fills |
| `surface-3` | 92% | 15% | Deep insets, active states |

### Surface emphasis ladder

Use the lightest level that communicates the role:

| Level | Treatment | Typical implementation |
|-------|-----------|------------------------|
| **0 - Ground** | No border, no background, no shadow | plain page content, helper copy, input areas, metadata, lists |
| **1 - Separator** | Hairline border only | `border-hairline`, row dividers, section breaks |
| **2 - Tint** | Background emphasis only, no elevation | `bg-surface-2/40`, selected rows, active pills, current-step highlight |
| **3 - Figure** | Border + background + elevation | `surface-panel`, `surface-elevated`, one dominant shell for the active state |

Rules:

- Level 3 is earned by figure ownership, not by convenience.
- `surface-1`, `surface-2`, and `surface-3` may be used inside Levels 0-2 as tints and fills, but they do not justify nested cards.
- A Level 3 figure may contain Level 0-2 internals only.
- When in doubt, flatten first and escalate only if the surface truly owns the state.

### Sidebar

| Token | Usage |
|-------|-------|
| `sidebar` (bg) | Sidebar background |
| `sidebar-active` | Selected item background |
| `sidebar-hover` | Hovered item background |

### Sidebar List Primitives

For thread/workflow lists in sidebar, use these utility classes from `globals.css`:

| Class | Usage |
|-------|-------|
| `.sidebar-list-group` | Wrapper for one project/thread group block |
| `.sidebar-project-row` | Project/folder header row |
| `.sidebar-thread-row` | Thread/workflow list row |
| `.sidebar-thread-row--active` | Selected row state |
| `.sidebar-progress-track` | Thin progress track under active row |
| `.sidebar-progress-bar` | Progress fill inside track |

Rules:
- Keep list layout flat and lightweight; avoid heavy card borders around each row.
- Prefer one active highlight (`sidebar-active`) and subtle hover (`sidebar-hover`).
- Show progress bars only for actionable states (for example running/in-progress), not for every idle row.
- Keep row rhythm compact and consistent: one primary line + optional single meta line below.
- Running state is owner-based: show spinner/progress on the workflow that owns the active run, not on the currently selected row.
- For non-owner selected rows, show historical summary (`Last run`) instead of fake live progress.

### Borders

| Token | Usage |
|-------|-------|
| `border` | Standard border |
| `hairline` | Subtle dividers, shadow outlines |
| `input` | Input field borders |
| `input-background` | Input field fill |

### Status

| Token | Usage |
|-------|-------|
| `status-success` | Green — completed, pass |
| `status-warning` | Amber — caution |
| `status-danger` | Red — failed, error |
| `status-info` | Blue — running, info |

## Typography

### Tailwind font-size tokens

| Class | Size | Line-height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-title-lg` | 1.75rem (28px) | 2.125rem | 600 | Page titles |
| `text-title-md` | 1.125rem (18px) | 1.5rem | 600 | Section headings, dialog titles |
| `text-title-sm` | 1rem (16px) | 1.375rem | 600 | Sub-section headings |
| `text-body-md` | 0.875rem (14px) | 1.25rem | — | Default body text |
| `text-body-sm` | 0.8125rem (13px) | 1.125rem | — | Compact body text, main content areas |
| `text-label-xs` | 0.75rem (12px) | 1rem | 600 | Labels, badges |

### Sidebar-specific tokens

Use these **exclusively** in sidebar — not generic `text-body-*` or `ui-meta-text`:

| Class | Size | Line-height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-sidebar-item` | 0.8125rem (13px) | 1rem | — | Nav items, workflow names, interactive rows |
| `text-sidebar-label` | 0.6875rem (11px) | 1rem | 500 | Project folder group headers |
| `text-sidebar-meta` | 0.625rem (10px) | 0.875rem | — | Timestamps, helper text |

### Sidebar layout

- Default sidebar width is `256px`, resizable within `224px` to `384px`.
- Sidebar nav items use `text-sidebar-item` at regular weight; avoid inheriting heavier button typography.
- Keep sidebar row rhythm compact: project rows at ~26px minimum height, thread rows with tight padding, and only one optional meta line below the primary line.

### CSS utility classes (globals.css)

| Class | Effect |
|-------|--------|
| `.section-kicker` | 11px, fw 600, uppercase, 0.11em tracking — structural section dividers |
| `.ui-title-text` | 28px, fw 600, -0.015em tracking — page titles |
| `.ui-body-text` | 14px, lh 1.25rem — body text |
| `.ui-meta-text` | 12px, lh 1rem, muted-foreground — metadata in main content |
| `.control-cluster-compact` | Reduced-padding variant for dense picker/toolbelt rows under composers and inline cards |
| `.control-badge` | Compact control-height badge chrome for counters, inline meta chips, and small status quantities |
| `.control-badge-compact` | Reduced-padding variant of `control-badge` for tight sidebar/meta usage |
| `.control-pill-compact` | 20px compact pill chrome for embedded provider/model pickers and icon triggers |
| `.ui-empty-state` | Layout-only empty-state helper for centered copy/action stacks; Level 0 by default and does not imply card weight |
| `.ui-interactive-card-subtle` | Quiet interactive card treatment for dense rails/lists; avoids lifted hover shadows that clip in scroll containers |
| `.ui-scrollbar-hidden` | Hides native scrollbar while preserving scroll interaction; use for horizontal rails only when there is another visible affordance such as arrow controls |
| `.ui-scrollbar-transient` | Hides scrollbar by default and shows it only while actively scrolling; use for dense navigation regions like the sidebar |

### Font stack

```
"SF Pro Text", "SF Pro Display", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

OpenType features enabled: `rlig`, `calt`.

## Spacing

8-step scale via CSS variables, available as Tailwind `p-space-*` / `m-space-*` / `gap-space-*`:

| Token | Value |
|-------|-------|
| `space-1` | 0.25rem (4px) |
| `space-2` | 0.5rem (8px) |
| `space-3` | 0.75rem (12px) |
| `space-4` | 1rem (16px) |
| `space-5` | 1.25rem (20px) |
| `space-6` | 1.5rem (24px) |
| `space-7` | 2rem (32px) |
| `space-8` | 2.5rem (40px) |

Additional rhythm variables (CSS-only, not in Tailwind):
- `--rhythm-1`: 0.5rem — `--rhythm-2`: 0.8125rem — `--rhythm-3`: 1.3125rem — `--rhythm-4`: 2.125rem
- `--content-gutter`: 1.5rem — `--dialog-gutter`: 1.5rem

### Spacing policy

- **Mode**: permissive.
- Prefer `*-space-*` utilities in shared primitives/layout wrappers and reusable component shells.
- Bare Tailwind spacing (for example `px-3`, `gap-2`) is allowed when the value is exactly on the approved spacing scale.
- Arbitrary spacing values must be treated as exceptions and documented.
- `rhythm-*` variables remain CSS-only and reserved for future layout primitives; do not introduce new direct component usage until a dedicated adoption pass exists.

### Opacity policy

- Preferred opacity checkpoints: `/10 /20 /30 /40 /50 /60 /70 /80 /90`.
- Avoid off-grid values such as `/17`, `/42`, `/85`, `/92+`; normalize to the nearest checkpoint.
- For shadows/elevation internals expressed as `rgba()` or `hsl(... / 0.xx)`, keep fine-grained values when needed for visual quality.

## Control Heights

Four sizes for buttons, inputs, and interactive elements:

| Token | Value | Usage |
|-------|-------|-------|
| `control-xs` | 1.25rem (20px) | Compact micro-controls (inline icon actions, tight toggles) |
| `control-sm` | 1.75rem (28px) | Compact controls, icon buttons |
| `control-md` | 2.25rem (36px) | Default buttons, inputs |
| `control-lg` | 2.5rem (40px) | Large CTAs |

Available as `h-control-xs|sm|md|lg`, `w-control-xs|sm|md|lg`, `min-h-control-xs|sm|md|lg`.

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | `calc(var(--radius-control) - 2px)` ≈ 6px | Small elements inside controls |
| `rounded-md` | `var(--radius-control)` = 0.5rem (8px) | Buttons, inputs, interactive elements |
| `rounded-lg` | `var(--radius-container)` = 0.75rem (12px) | Cards, panels, dialogs |

**Rule**: use only `rounded-sm` / `rounded-md` / `rounded-lg` for standard UI. `rounded-full` only for true pills/avatars.

## Elevation

Two shadow levels combining inset highlight + hairline outline + drop shadow:

| Token | Usage |
|-------|-------|
| `--elevation-base` | Cards, panels, surfaces |
| `--elevation-overlay` | Dialogs, popovers, hover-lifted cards |
| `--inset-highlight` | Button/control inset highlight (swaps for dark mode) |
| `--inset-highlight-strong` | Stronger inset highlight for outline buttons |

Applied via:
- `.surface-panel` — default Level 3 shell for the current figure
- `.surface-elevated` — overlay Level 3 shell for dialogs, popovers, and dominant composers
- `.surface-soft` — transitional Level 3 shell; do not use for secondary info, helper panels, or empty states
- `.surface-info-soft` — status-owned Level 3 shell for running/info figures only
- `.surface-warning-soft` / `.surface-danger-soft` — status-owned Level 3 shell for warning/error figures only
- `.surface-depth-header` — decorative header treatment inside an already-owned surface, not a separate figure

## Motion

| Token | Duration | Usage |
|-------|----------|-------|
| `--motion-fast` | 140ms | Hovers, toggles, micro-interactions |
| `--motion-base` | 170ms | Standard transitions |
| `--motion-slow` | 220ms | Emphasis animations |

Easing curves:
- `--ease-standard`: `cubic-bezier(0.2, 0, 0, 1)` — general purpose
- `--ease-emphasis`: `cubic-bezier(0.16, 1, 0.3, 1)` — entrance animations, emphasis

### Utility classes

| Class | Effect |
|-------|--------|
| `.ui-motion-fast` | `transition-duration: var(--motion-fast)` + standard easing |
| `.ui-motion-standard` | `transition-duration: var(--motion-base)` + standard easing |
| `.ui-pressable` | Full transition set + `scale(0.995)` on `:active` |
| `.ui-interactive-card` | `translateY(-1px)` + elevation-overlay on hover |
| `.ui-fade-slide-in` | Entrance: fade + 4px slide-up over `--motion-base` |
| `.lux-hover` | Slow emphasis transitions for premium hover feel |

All motion respects `prefers-reduced-motion: reduce`.

## UI Primitives

Primitives define appearance, not entitlement to render. A primitive may receive Level 3 treatment only when the parent surface contract says it owns the current state.

### Button (`ui/button.tsx`)

CVA variants via `class-variance-authority`:

**Variants**: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
**Sizes**: `bare` (inline/link-style actions), `xs` (control-xs), `sm` (control-sm), `default` (control-md), `lg` (control-lg), `icon-xs` (square control-xs), `icon` (square control-sm)

Each variant includes its own shadow, inset highlight, and border treatment. All use `.ui-pressable` base.

Filter/toggle convention:
- Active filter chips use `secondary`
- Inactive filter chips use `outline`
- Toggle-like button groups should expose `aria-pressed`

### Badge (`ui/badge.tsx`)

**Variants**: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`
**Sizes**: `default`, `compact`, `pill`

### Dialog (`ui/dialog.tsx`)

Two dialog styles:
- `DialogContent` — standard 600px dialog with close button
- `CanvasDialogContent` — compact 420px dialog for canvas/workflow actions
  - Uses `CanvasDialogHeader` / `CanvasDialogBody` / `CanvasDialogFooter` sub-components
  - Footer has `bg-surface-2/75` tinted background with top border

### Page Shell (`ui/page-shell.tsx`)

- `PageShell` — scrollable container, max-width 72rem, respects `--titlebar-height`
- `PageHeader` — title + optional subtitle + optional action cluster
- `PageHero` — centered hero block for create/onboarding surfaces; uses the same page title typography as the rest of the app
- `SectionHeading` — section title with optional meta slot

Rules:
- Even immersive/create pages should keep a standard `PageHeader` at the top instead of inventing page-level title styles.
- Use `PageHero` only when it is the single figure for that state, not as a decorative intro above another figure.
- Secondary rails and supporting content under a hero should still use `SectionHeading` and standard controls.
- Create surfaces should avoid competing content widths; keep hero-adjacent rails and the primary composer inside one shared support width.
- Large page-level composers should prefer `surface-elevated` with token radius (`rounded-lg`) over ad hoc large radii, unless they reuse an existing shared composer primitive.
- Chat composers in narrow side panels should switch to a compact footer layout (short provider label, reduced helper copy, stacked controls) instead of preserving the wide layout and clipping it.

### Other primitives

`Input`, `Textarea`, `Select`, `Tabs`, `Switch`, `Tooltip`, `ErrorBoundary`, `Skeleton`

Removed from the active primitive surface:
- `AlertDialog` alias wrapper
- `ScrollArea` div wrapper
- `Separator` div wrapper

## Canonical Figure Patterns

These patterns bridge surface specs and primitives. Reuse them instead of inventing new card stacks.

| Pattern | Figure shell | What stays flat inside | Action model |
|--------|--------------|------------------------|--------------|
| **Stage Contract / Resume Header** | One Level 3 outer shell | key-value rows, artifact handoff lines, inline status/meta | one primary CTA, optional overflow |
| **Task Panel / Approval Surface** | One Level 3 outer shell | reason, step input, consequences, form fields, artifact preview | one primary approve/continue, one secondary reject/cancel |
| **Routing Shell** | One Level 3 outer shell | flat progress list, static snapshot text | 0-1 visible actions |
| **Result Figure** | One Level 3 prose/result shell | inline summary, one continuation line, flat metadata | one primary next-step CTA, overflow for export/history |
| **Project Target Picker / First Action Launcher** | One Level 3 blocking shell | helper copy and reassurance below the shell | one primary CTA, at most one secondary route |
| **Wizard Step Shell** | One persistent Level 3 outer shell for the active step | step-level confirmations, readiness rows, helper copy, and chooser outcomes stay flat inside the shell | footer navigation stays secondary to the step's single next action |
| **Template Detail Panel** | One Level 3 detail shell | section groups separated by hairlines only | one primary start CTA, secondary close/back |
| **Single-Decision Dialog** | One Level 3 dialog shell | radio/choice controls and project selection fields | one affirmative `Continue`, one secondary `Cancel` |
| **Sidebar Content Region** | Ownership by cluster, not elevation | rows, search results, empty-state copy | persistent chrome stays ground; selected row is Level 2 only |

Implementation notes:

- Use label/value groups, separators, and tints inside a figure instead of inset cards.
- When a figure changes, competing figures must flatten or disappear.
- Suggested cards, helper panels, and secondary continuations must degrade to rows, pills, text lists, or disclosures.
- In wizard flows, the step shell may remain the only persistent Level 3 container across steps, but step-complete confirmations and project-ready states must not introduce a second bordered figure inside it.

## Content Hierarchy for Result and Report Surfaces

Result and report screens need more than visual cleanup. They need a stable semantic hierarchy so the page answers the right questions in the right order.

Primary questions, in order:

1. **What happened?**
2. **How good or bad is it?**
3. **Why did the system reach that conclusion?**
4. **What should I do next?**
5. **Where is the full report or artifact?**

If a result screen answers `what data is stored here?` before it answers the five questions above, the hierarchy is wrong even if the spacing and components are clean.

### Core principles

1. **One primary question per page**. A result page is not simultaneously a storage browser, diagnostics board, document viewer, and action launcher at equal weight.
2. **Verdict before evidence**. The user should understand the outcome before parsing checks, loops, badges, or report sections.
3. **Decision before documentation**. If there is a meaningful next action, it outranks the full markdown/report body.
4. **Metadata at the perimeter**. Saved-run labels, timestamps, branch names, artifact type, and duration belong in compact provenance areas, not the semantic center of the screen.
5. **Evidence supports the decision**. Checks, loop states, and scores must be grouped under one evidence model rather than rendered as unrelated peer widgets.
6. **The artifact is not the page**. Raw markdown or saved output is a secondary document layer, not the only explanation of what happened.
7. **Headings express meaning, not styling only**. Each heading level must map to a semantic role on the page.

### Semantic content roles

Every result/report page should organize content into these roles:

| Role | Question answered | Typical content |
|------|-------------------|-----------------|
| **Object Header** | What object am I looking at? | workflow name, artifact label, compact status, compact provenance |
| **Outcome Headline** | What happened overall? | one-sentence verdict in user language. **Progressive collapse:** full sentence on first encounter with a flow/step; collapses to a compact badge or single-line after the user has run this flow before. Day-30 users should not re-read paragraphs they already understand. |
| **Decision / Next Step** | What should I do next? | one primary CTA, optional one-line rationale |
| **Evidence Strip** | What are the key facts behind the verdict? | 3-5 compact facts such as score, critical count, weakest area, readiness |
| **Evidence Panel** | Why is that the verdict? | checks summary, failed criteria, reason, fix-first guidance |
| **Artifact Document** | Where is the full output? | markdown report, merged report, long-form result body |
| **Provenance Row** | Where did this come from? | saved run, duration, branch, generated-at, source path |

These roles are ordered. If two adjacent blocks answer the same question, merge them or demote one.

### Recommended page order

Use this order for result/report surfaces unless a surface-specific spec explicitly overrides it:

1. **Object Header**
2. **Outcome Headline**
3. **Decision / Next Step**
4. **Evidence Strip**
5. **Evidence Panel** (if needed)
6. **Artifact Document**
7. **Secondary actions / history / export**

Meaning:

- The user should never have to read the full artifact body to understand the verdict.
- The primary CTA should sit near the verdict, not below the full report.
- Secondary actions such as export, run again, open artifacts, or history belong in overflow or a low-emphasis utility row.

### Heading model

For long-form result/report pages, heading levels should map like this:

| Level | Meaning | Example |
|-------|---------|---------|
| **H1** | object title | `UX/UI Polish Audit` |
| **H2** | outcome or major section | `4 critical issues block release` / `Executive summary` |
| **H3** | supporting section within the report | `Critical findings` / `Accessibility gaps` |
| **Meta / label** | provenance or structural support | `Saved run`, `Completed in 30m`, `Branches merged` |

Do not use meta labels as headline substitutes.

### System elements to reuse

Build result/report pages from these reusable system elements:

- **Object Header**: title plus compact status/provenance
- **Outcome Headline**: strongest text on the page after the object title
- **Decision Bar**: one clear next action in job language
- **Evidence Strip**: compact key facts, preferably 3-5 items max
- **Evidence Panel**: one grouped explanation surface, not multiple competing mini-surfaces
- **Artifact Document**: the full markdown/report body, secondary in hierarchy
- **Document Navigation**: optional contents/jump links for long reports
- **Secondary Actions Overflow**: export, copy, history, rerun, open artifact

### Result/report rules

- Above the fold, show the verdict and next action before the full artifact body.
- Checks, loop state, score, and pass/fail reasoning should converge into one evidence model whenever they explain the same outcome.
- `Run again` is usually a secondary action. It should not be the default primary CTA when the result implies a more specific next move.
- If multiple result variants exist, the variant selector is a utility layer, not a competing summary block.
- Provenance labels such as `Saved run`, `Completed`, or duration must not occupy the main headline position.
- Long-form reports should have explicit section hierarchy. Do not rely on one continuous markdown blob to communicate structure.

### Anti-patterns

Avoid these result/report failures:

- **Storage-first header**: the page leads with `Saved result`, `Saved run`, timestamps, or artifact labels before stating the outcome.
- **Widget stack summary**: multiple peer summary widgets each trying to explain the result independently.
- **Badge soup**: the verdict is implied through many small pills instead of one readable sentence.
- **Raw artifact as headline**: the markdown/report body appears before the page explains what it means.
- **Generic CTA replacing a specific next move**: `Run again` or `Open` used as the primary action when a concrete next step exists.
- **Document without navigation**: long reports presented as one flat blob without section ownership.

## Restricted / Deprecated Usage

These patterns either violate current hierarchy rules or are allowed only as migration debt.

| Pattern | Status | Guidance |
|--------|--------|----------|
| `surface-soft` for helper panels, suggestion cards, empty states, or sibling surfaces | Deprecated | Use Level 0 text, Level 1 separators, or Level 2 tint unless the component is the figure |
| `surface-inset-card` inside an active figure | Prohibited | Flatten to label/value rows, disclosure content, or plain form fields |
| Nested bordered confirmation blocks inside a wizard/onboarding shell | Prohibited | Keep the wizard shell as the only Level 3 surface and render project-ready or success confirmations as flat content |
| Empty tabs, disabled tabs, or tab bars before content exists | Prohibited | Render tabs only when content exists and matters now |
| Dual affirmative footers such as `Create` + `Replace` | Prohibited | Use explicit decision controls plus one primary `Continue` |
| Duplicate create/settings/status entries in one state | Prohibited | Keep one visible owner per action or fact |
| Elevated selected rows in sidebar | Prohibited | Selected rows use Level 2 tint only |
| Large hero block above a separate composer/detail figure | Prohibited | Keep one figure; everything else stays ground |
| Heavy library/category/filter toolbars rendered as their own card | Deprecated | Use flat strips, compact choosers, or overflow |

Component-specific constraints:

- `Tabs` are a secondary primitive. They must not become a default page chrome pattern for runtime, create, onboarding, or library surfaces when the content can be disclosed progressively instead.
- `Badge` communicates status, but must not duplicate a fact already owned by a row, header, toolbar, or figure.
- `collection-toolbar.tsx` should be treated as a flat control strip on browse surfaces, not as a figure shell.
- `PageHero` and `PromptComposer` may be Level 3, but only when they are the sole figure for the state.

## UI Review Checklist

Every renderer UI PR should answer these questions explicitly:

- What is the figure for each touched state?
- How many Level 3 surfaces are visible in each state?
- How many visible actions are present before contextual hover/reveal actions?
- Which component owns each status fact: progress, blocked state, dirty state, current step, selection?
- Are any empty, disabled, or future-state sections still rendering?
- Did any helper, detail, or suggestion panel accidentally become a second figure?
- Are secondary actions in overflow/disclosure instead of flat button rows?
- If the surface includes a decision, is there one clear affirmative CTA rather than two peers?
- If the surface includes nested content, are all internals Level 0-2 only?

## Platform Integration

- macOS titlebar: `--titlebar-height: 2rem` via `[data-platform="macos"]`
- Drag regions: `.drag-region` / `.no-drag` for Electron frameless window
- Dark mode: `.dark` class on root, full color remap

## Allowed Exceptions

1. **Canvas geometry**: React Flow handles and edge-routing visuals may keep non-control dimensions where library hit-area behavior depends on it.
2. **Elevation internals**: `rgba()`/`hsl(... / 0.xx)` shadow internals can use non-checkpoint opacity for anti-banding and depth consistency.
3. **Content width backlog**: arbitrary width tokens are temporarily allowed and tracked for tokenization:
   - `w-[168px]`, `w-[188px]`, `w-[196px]`, `w-[220px]`
   - `min-w-[156px]`, `min-w-[212px]`, `min-w-[280px]`
   - `max-w-[198px]`, `max-w-[248px]`, `max-w-[280px]`, `max-w-[340px]`, `max-w-[360px]`, `max-w-[380px]`, `max-w-[640px]`
   - `w-[420px]`, `w-[600px]`

## Known Issues and Constraints

Per `docs/ui-consistency-audit-2026-03-11.md`:

1. **Don't use raw Tailwind text sizes** (`text-xs`, `text-sm`, `text-lg`) in components — use the semantic tokens (`text-body-sm`, `text-title-md`, etc.)
2. **Don't hardcode font sizes** (`text-[24px]`, `text-[13px]`) — map to the nearest semantic token
3. **Prefer `Button` variants** over raw `<button>` with local class stacks
4. **Stick to 3 radius tiers** (`rounded-sm/md/lg`) — avoid mixing `rounded-xl`, bare `rounded`, etc.
5. **Sidebar uses its own type tokens** — `text-sidebar-item/label/meta`, not content tokens
6. **Limit text hierarchy per screen** to ~3 tiers (title, body, meta) plus monospace for logs
