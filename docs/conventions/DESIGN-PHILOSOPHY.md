# Design Philosophy

> **Key rules absorbed into [CANON.md](./CANON.md) §9.** This file contains the full design system reference (anti-patterns, copy rules, tokens, surface archetypes). CANON is authoritative for visual hierarchy hard rules and thresholds.

Единый документ подхода к дизайну интерфейса c8c. Консолидирует принципы из DAY-30-OPERATOR-CONTRACT, execution plans, UX-SCENARIOS, BRAND, HUB-WRITING-GUIDE, copy-style-guide.

---

## 1. Кто пользователь и что за продукт

**c8c — daily-driver инструмент для оператора AI-процессов.** Не лендинг, не демо, не маркетинговый сайт.

Оператор работает с c8c каждый день. У него одновременно 3+ активных процессов. Он переключается между ними, утверждает гейты, прикрепляет capabilities, запускает батчи. Интерфейс должен работать на этого человека на 30-й день использования, а не впечатлять на первом скриншоте.

**Brand qualities:** Calm · Legible · Accountable · Capable

**Product feel:** Human-aware, but not cute. Technical, but not cold. Powerful, but not overloaded. Serious, but not enterprise-theater.

---

## 2. Каноничный guardrail: UI elements > text

> Сначала слова помогают назвать работу. Потом интерфейс позволяет делать эту работу почти без объяснения.

JTBD и walkthrough-текст — это design scaffolding. Они помогают выбрать правильные продуктовые объекты, назвать состояния и действия. Но shipped UI не должен зависеть от narrative copy.

**Тест:** если убрать из surface весь paragraph-level текст и она перестаёт работать — surface не готова. Нужны лучший layout, hierarchy, badges, counters, actions.

**Роль слов в shipped UI:**
- Помогают выбрать правильные product objects
- Называют states, actions, outcomes
- Временно поддерживают новый mental model (при первом контакте)

**Что слова НЕ должны делать:**
- Заменять layout, hierarchy, controls
- Объяснять то, что должно быть понятно через badges, counters, rows, buttons, stage state
- Зависимость: если surface понятна только после чтения параграфа текста — не дотягивает до quality bar

---

## 3. Шесть UX-принципов daily-driver

### 3.1 Run until next decision
Один запуск продвигает процесс до следующего человеческого решения. Автоматически продолжать, когда поведение детерминистично. Останавливаться на: approval gates, blocked states, ambiguous outcomes, explicit user pause.

### 3.2 Keyboard-first
Частые действия обязаны иметь клавиатурные шорткаты.

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Primary action (Run, Continue, Approve) |
| `Esc` | Close detail/dialog |
| `Cmd+K` | Command palette |
| `Cmd+N` | New process |
| `Cmd+1..5` | Quick switch |

Shortcuts ускоряют ту же IA, а не создают параллельный expert-only продукт.

### 3.3 Status at a glance
Пользователь понимает состояние процесса за секунды: текущий stage, compact outcome token, next decision, pending approval/blocked. App shell показывает 3+ активных процессов с current stage и status token без открытия каждого.

### 3.4 Progressive disclosure by familiarity
Первый запуск может быть explanatory. Повторный должен быть compact. Объяснения коллапсируются после первого понимания. Loop history и policy detail остаются inspectable, но не expanded по умолчанию.

### 3.5 Inline over click-through
Если пользователь в контексте — решай inline. Dominant artifact preview видим inline, потом full inspect. Next action видно рядом с артефактом.

### 3.6 Words are scaffolding, not the product
(См. секцию 2 — каноничный guardrail)

---

## 4. Принципы редактора

### P-01: Feedback where user is looking
После действия — feedback в текущей области фокуса. Edit field → feedback в inspector. Canvas action → feedback на canvas. Workflow run → progress в активной surface.

### P-02: Hidden power OK, hidden basics — not
Advanced actions могут жить в canvas, context menu, shortcuts. Basic actions не могут зависеть только от них.

### P-03: One editor → one undo model
Одинаковый undo mechanism независимо от того, где сделано изменение (list, canvas, inspector, auto-layout).

### P-04: Spatial actions honor spatial intent
Если пользователь кликнул в конкретную точку, добавил ноду, вручную выложил граф — система не должна молча отбрасывать этот intent.

### P-05: Disabled is explanatory
Disabled control объясняет ПОЧЕМУ и что сделать, чтобы включить.

### P-06: One concept → one label
Flow, Graph, Run, Output, Edit mode, Settings — однозначные, непересекающиеся термины.

---

## 5. Четыре мета-паттерна (покрывают все сценарии)

### Multi-Phase Process
```
STAGE 1 → GATE → STAGE 2 → GATE → STAGE 3 → ... → RESULT
```
Последовательные стадии с человеческими решениями между ними. Каждый stage = отдельный cognitive mode, fresh context, named artifact.

### Quality Loop
```
ACTION → CHECK → PASS? → yes: forward / no: FIX → CHECK → ...
```
Замкнутый цикл с quality threshold + iteration limit. Auto-retry при fail; escalation к человеку при лимите.

### Fan-Out / Fan-In
```
ONE INPUT → CORE → PARALLEL: [A] [B] [C] [D] → CONSISTENCY CHECK → PACKAGE
```
Один вход порождает N named outputs. Consistency check между генерацией и доставкой.

### Chaos → Clarity
```
RAW DATA → CLASSIFY → FILTER NOISE → PRIORITIZE → ACTIONS
```
Неструктурированный вход → структурированный actionable выход.

---

## 6. Принципы UX-сценариев

1. **Process → Stage → Step** — три уровня: стратегический (всегда видно), тактический (текущий artifact + decision), операционный (collapsible)
2. **Quality Gates** — три режима: auto-pass (score > threshold), auto-return (critical found), human decision (borderline)
3. **Closed loops** — Review → Fix → Re-review с iteration limit + escalation
4. **Artifact Handoff** — каждый stage получает нужные артефакты и релевантный контекст предыдущих (не "всё")
5. **Observation > Intervention** — пользователь supervisor, не orchestrator. Вмешивается только на gates.
6. **Named artifacts** — каждый stage создаёт named output с type, version, relationships
7. **Summary as proof of value** — финал: "3 бага найдено и исправлено, 9 тестов, 87% покрытие"
8. **Approval before execution** — гейт ПЕРЕД исполнением. Пользователь утверждает план, не 2000 строк кода
9. **Granular approval** — не только да/нет: "approve steps 1-2 / edit plan / approve + add rate limiting"
10. **Self-sufficient approval context** — каждый approval request читается standalone
11. **Execution Policy** — настраиваемые правила: "if 0 critical → continue without me"
12. **Channel-adaptive progress** — Desktop: real-time stream; Background: system notification

---

## 7. Продуктовые объекты R2

| Object | Суть | Формат |
|--------|------|--------|
| Process map spine | Цепочка stages с state | Compact persistent navigation, не explanatory hero |
| Stage shell | Current stage + readiness + artifact + next decision | Control header, не onboarding screen |
| Loop state | Iteration number, trigger, outcome | Compact strip/row/block near stage, не status text в логах |
| Policy summary | Active policy, intent, next action | Concise control panel, не essay about autonomy |
| Capability intake | List/card с provenance, scope, attach action | Attachable row/card, не marketplace/file browser |
| Process status rail | Active processes с stage + status token | Quick switch, "что происходит?" за один взгляд |
| Keyboard layer | Stable shortcuts для frequent actions | `Cmd+Enter`, `Cmd+K`, `Cmd+N` — shipped UX, не footnotes |

---

## 8. Visual Hierarchy Laws — Hard Rules

These rules are non-negotiable. Every PR touching renderer UI must pass all of them. Violations are ship-blockers.

### Rule 1: One Figure Per State

For each runtime state (idle, ready, blocked, running, completed), there is exactly ONE primary visual object — the figure. Everything else is ground.

**Test:** Cover the primary object with your hand. Can you still tell what state the page is in? If yes, something else is competing. Strip it.

**Enforcement:**
- Only the figure gets `border + background + elevation` (card treatment).
- Secondary elements use flat text, hairline separators, or transparent backgrounds — never their own card.
- Removing nested cards does **not** mean removing structure. Use Level 0-2 connective tissue — context strips, slabs/lanes, inset wells, and selected-row tint — to bind related content without creating a competing figure.
- This rule applies most directly to runtime and inspect states where the user is answering one dominant question. Compound admin pages may still have one dominant figure plus a small number of lower-emphasis chapter shells for durable configuration groups.
- A section inside a card (e.g., grid cells inside ScopeBanner) must NOT have its own border+background. Use label+value pairs instead.
- Empty states ("No activity yet") are borderless text, not `surface-soft` cards.

### Rule 2: ≤5 Visible Actions Per State

Hick's Law target. Count every visible clickable element (buttons, tabs, links, selectors, toggles). If the total exceeds 5 for a given state, move excess into overflow.

**Enforcement:**
- One primary CTA per state. It is the only `variant="default"` button visible.
- If two components render the same action (e.g., Toolbar Run + Resume Header Run), one must defer: hide, become ghost, or disable.
- Secondary actions (Copy, Export, Open Report) live in an overflow menu, not a flat button row.
- Tab bars show only tabs with content. Disabled/empty tabs are hidden, not rendered as disabled.

### Rule 3: Show Only What Matters Now

Progressive disclosure. An element renders only in the states where it provides actionable value.

**Enforcement:**
- OutputPanel (and its tab bar) is absent until the first run starts. Before that: no tabs, no placeholders, no "No activity yet."
- Tabs appear individually when their content arrives: Summary on run start, Result on first output, History on first completed run.
- After run completion, the chain builder (flow editor) collapses. Result rises to top of viewport.
- Graph and Defaults tabs are secondary — behind overflow, icon, or Cmd+K. Not primary peers of Flow.
- Design-time affordances (Edit flow, Refine, Attach skill) are hidden in blocked/approval states.
- On create/start surfaces, dominant continuation may demote the composer visually, but it must NOT hide or replace the primary point-B input path. The composer stays directly visible and focusable without an extra click.

### Rule 4: One Status Signal Per Fact

A piece of state (progress, blocked status, current step) appears in exactly one place. Never two.

**Enforcement:**
- If RunStrip shows progress, OutputPanel header does not repeat it.
- If Resume Header shows "Blocked", Toolbar does not show a separate blocker banner.
- If Result tab is auto-selected, RunStrip's "View result" button has no reason to exist.

### Rule 5: No Cards Inside Cards

Nested bordered containers break figure-ground. A card (border + background) may contain flat content, but never another card.

**Enforcement:**
- ScopeBanner's internal grid uses flat label+value pairs, not `rounded-lg border bg-surface-1/70` sub-cards.
- InputPanel's inset card (`surface-inset-card`) flattens into the parent when inside a resume header context.
- Activity/Result tab's inner summary cards recede to `border-hairline` only (no background, no elevation) when nested inside OutputPanel.
- Allowed exception: the figure may contain inset wells or tinted sub-regions if they stay at Level 0-2 and clearly belong to the figure, not as peer cards.

### Measuring Compliance

Two tiers: **target** (what we aim for) and **ship-blocker** (what fails review). The gap between them is "not ideal but shippable — file a follow-up."

| Metric | Target | Shippable (file follow-up) | Ship-blocker (must fix) |
|--------|--------|---------------------------|------------------------|
| Bordered containers per state | ≤3 | 4-5 | >5 |
| Visible clickable elements per state | ≤5 | 6-8 | >8 |
| Duplicate status signals | 0 | 0 | >0 |
| Nested cards (card inside card) | 0 | 0 | >0 |
| Rendered-but-empty sections | 0 | 0 | >0 |

The last three (duplicates, nesting, empty sections) are always ship-blockers — no shippable middle ground.

---

### Surface Weight Ladder

Components are **flat by default**. Card treatment (border + background + elevation) is earned, not given. Use the lightest surface that communicates the role:

| Level | Treatment | When to use |
|-------|-----------|-------------|
| **0 — Ground** | No border, no background, no shadow. Content sits on the page. | Secondary/supporting content: input areas, step lists, metadata, labels. The default. |
| **1 — Separator** | `border-hairline` line only, no background. | Dividing siblings within the same context: step rows, list items, section breaks. |
| **2 — Tint** | Background tint only (`bg-surface-2/40` or status color at low opacity), no border. | Highlighting the active item in a list (e.g., active step during running). Temporary emphasis, not containment. |
| **3 — Card** | `border + background + elevation` (`surface-panel` or `rounded-xl border ui-elevation-base`). | **Only the figure.** One per state. This is the visual object that answers "what am I looking at?" |

`surface-soft` and `surface-inset-card` are Level 3 — they create card weight. Do not use them for empty states, placeholders, or secondary info. Empty states are Level 0 (plain text).

### Connective Tissue After Flattening

Subtractive cleanup is phase one.
If that cleanup leaves the page reading like divider soup, the fix is not "bring back lots of cards." The fix is to restore relationships using Level 0-2 structure.

Use these patterns:

| Pattern | Level | Purpose | Test |
|--------|-------|---------|------|
| **Context strip** | 0-1 | Tie local title, status, scope, and links together above the figure | If removed, the figure still makes sense, but the user loses "what am I looking at below?" |
| **Slab / lane** | 1-2 | Make a group of related rows read as one region | If removed, the rows feel unrelated rather than over-decorated |
| **Chapter shell** | 2 | Bind a heading to a long administrative body on a compound page | If removed, the page turns into loose section headings plus hanging content |
| **Inset well** | 2 | Create a local focal point inside the figure or selected row | If removed, the page loses local emphasis but not figure ownership |
| **Selected-row tint** | 2 | Mark the current item in a collection | If removed, the page loses current-item clarity but not global state clarity |

What these are **not**:

- not a second figure
- not a mini-card grid
- not a bordered empty-state shell
- not a place to repeat the same status signal in a louder style

Examples:

- **Run summary:** one owner surface, then grouped `Run progress`, `Result`, and `Fan-out` rows separated by hairlines, with one status-toned inset well when something needs attention.
- **Settings:** one dominant provider-status figure; below it, chapter shells bind `Access & Providers`, `Run behavior`, and `App controls`; provider entries stay flat rows with dividers, and the `CODEX_API_KEY` area may be one inset well because it is a local action cluster, not a second card.
- **Lab:** one owner figure per populated state; overview metrics stay as a rail; track groups use lanes; selected tracks use tint or a local detail owner, not equal-weight cards everywhere.

### Compound Admin Pages

Some pages do not answer one ephemeral runtime question. They answer several durable administrative questions at once:

- Is my provider setup healthy?
- What defaults will new runs use?
- What app-level controls are enabled?

`Settings` is the clearest example.
These pages still need hierarchy, but the hierarchy cannot be "one figure and everything else is loose headings on the ground."

Use this model:

1. Keep one dominant figure if the page has a page-level health, readiness, or current-problem object.
2. Below that figure, allow `2-4` **chapter shells**.
3. A chapter shell is weaker than a figure:
   - `border + faint fill`
   - no elevation
   - no competing CTA treatment
4. A chapter shell owns a heading and a long body together. Headings for long forms/lists must not float separately from their content.
5. Chapter shells group by **user task/domain**, not by renderer module or data source.
6. Chapter shells may contain flat rows, section dividers, slabs, and inset wells, but never nested chapter shells or second figures.

Example for `Settings`:

1. `Provider readiness` remains the page figure.
2. `Access & Providers` chapter shell contains provider defaults, provider identities, and MCP setup.
3. `Run behavior` chapter shell contains run defaults and research configuration.
4. `App controls` chapter shell contains privacy, lab, and update controls.

This is a narrow extension, not a rollback of the flattening doctrine.
`No cards inside cards` still holds.
What changes is that the system now recognizes a page-level secondary structure between a loose slab and a true figure.

### State-Conditional Rendering Checklist

Before rendering a component in a given state, pass this test:

1. **Does it have content?** If every child is empty, disabled, or placeholder → do not render.
2. **Does the user need it NOW?** If it serves a future state (e.g., Result tab before any run) → do not render. Show it when the trigger arrives.
3. **Does it duplicate something already visible?** If another component shows the same fact (progress, status, current step) → one of them must go.
4. **Is it the figure or the ground?** If ground → Level 0-2 treatment. If figure → Level 3. If neither → question whether it should render at all.

Applied specifically to runtime/result surfaces: thresholds, rule inventories, rubric scores, and other execution diagnostics are secondary by default. The primary read should stay on the current decision, outcome, and next action; technical detail belongs in local depth such as disclosure, a compact secondary tab, or another inspect surface.

### Approval & Continuation Content Contract

Every approval gate and every continuation surface must make these elements available in the owner surface. Keep the current decision, outcome, and next action in the default read; supporting detail may live in local disclosure or another compact inspect layer.

**Approval (blocked state):**
- Which step paused (job-language name)
- Why it paused (specific reason, not generic "task open")
- What happens on approve (next step name + expected result type)
- What happens on reject (consequence)
- Decision form (fields, optional edit/narrow)
- Relevant artifact preview (if compact)

**Continuation (ready/completed state):**
- What was just completed (typed result label + one-line outcome)
- What happens next (next step name in job language)
- One primary action ("Continue to [next step]" or "Run")

This contract applies to any surface that pauses for a human decision or offers a next step — not only the workflow page.

---

### Surface Archetypes

Not every terminal state should use the same shell. Pick the archetype that matches the user job:

- **Decision surface** — the user must decide what to do next. Figure = verdict or decision card.
- **Document surface** — the main job is reading or reviewing the artifact itself. Figure = document body.
- **Activity surface** — the main job is monitoring progress. Figure = activity feed / step stream.
- **Log / inspector surface** — the main job is debugging or tracing execution. Figure = log viewer or inspector pane.

**Archetype rules:**
- A workflow or project may have **one strong page-level header**. Do not repeat hero-style headers inside child surfaces.
- Child surfaces use **flat context strips** (title, status, artifact, local links), not second-level hero cards.
- Local navigation between sibling modes (`result`, `activity`, `log`, `history`) is allowed **inside the owner surface** as one low-emphasis strip when it replaces heavier page chrome.
- If the main object is a document or log, the document/log owns Level 3. Metadata above it stays Level 0-1.

---

### Screen Composition

For the full process of going from JTBD questions to screen layout, see `docs/conventions/SCREEN-COMPOSITION-GUIDE.md`. It defines the composition stack (Chrome → Context → Verdict → Input → Depth), the verdict card rules, and the 7-step composition process.

---

## 9. Anti-patterns

- Dashboard theater: много схем, мало control value
- Default-expanded prose panels: объяснение процесса вместо ведения через него
- Capability discovery как browser raw objects вместо attachable tools
- Process map красивый на демо, плохой для daily-use navigation
- Interface понятен только после чтения narrative copy
- Feature dumps в карточках
- Node counts и внутренняя архитектура видны пользователю
- Rhetorical questions, fake empathy, emotion diagnosis в UI-тексте
- **Equal-weight hamburger:** stacked sections with identical border+bg+shadow treatment where no single section dominates
- **Premature chrome:** tab bars, selectors, toggles rendered before they have content or purpose
- **Zombie buttons:** disabled-but-visible controls that occupy scanning bandwidth without offering action
- **Dual CTA:** two primary-styled buttons for the same action on the same screen
- **Repeated headers:** page title, section title, and artifact title all styled like separate heroes for the same state
- **Overflow button proliferation:** multiple `...` menus on the same screen, each hiding different actions. c8c is a desktop app — secondary actions belong in the **menu bar** (File/Edit/View/Flow), the **command palette** (Cmd+K), or **right-click context menus**. Not in per-section `...` buttons. Zero `...` buttons on any screen. The menu bar IS the overflow — that's where desktop apps have always put secondary actions.

---

## 10. UI-копирайтинг

### Тон
Clear, operational language. Start with user intent. Name the result or next action. Без внутреннего жаргона.

### Формула карточки шаблона (6 полей)
```
HEADLINE: [verb] + [what you get]        — max 10 words
WHEN:     [trigger situation]             — max 2 sentences
INPUT:    [what user provides]            — max 15 words
OUTPUT:   [named artifacts]               — max 2 sentences
HOW:      [what happens]                  — max 30 words, human terms
TIME:     [estimate with ~]
```

### Словарь терминов
`workflow` (не thread) · `run` · `step` · `result` · `approval` · `budget` · `library` · `skill`

Status mapping: `queued` → `waiting` · `waiting_approval` → `waiting for approval` · `Reject changes` → `Stop workflow`

### Запрещённые слова
comprehensive · advanced · AI-powered · intelligent · cutting-edge · next-generation · state-of-the-art · robust · scalable · innovative · leverage · utilize · harness the power of · unlock · empower · game-changer · revolutionary · transformative · seamless

### Empty states
Отвечают на: (1) Что произошло? (2) Что делать дальше?
```
No skills match this filter. Install a library or clear search.
```

### Toasts
Include entity type + name, keep under one short line.
```
Workflow saved: Content QA
Library removed: Anthropic Skills
```

### Budget messaging
Show numeric usage. Text thresholds: 70% = notice, 90% = warning, 100%+ = exceeded. Never color alone.

---

## 11. Дизайн-система (reference)

### Токены

**Surfaces:** `bg-sidebar`, `bg-surface-1` / `-2` / `-3`
**Status:** `text-status-success` / `warning` / `danger` / `info`
**Elevation:** `--elevation-base`, `--elevation-overlay`
**Motion:** `--motion-fast` (140ms), `--motion-base` (170ms), `--motion-slow` (220ms)
**Controls:** `control-xs` (1.25rem), `control-sm` (1.75rem), `control-md` (2.25rem), `control-lg` (2.5rem)

### Типографика

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `text-title-lg` | — | — | Page titles |
| `text-title-md` | — | — | Section titles |
| `text-title-sm` | — | — | Card titles |
| `text-body-md` | 14px | — | Default body |
| `text-body-sm` | 13px | — | Compact body/controls |
| `text-label-xs` | — | — | Small labels |
| `text-sidebar-item` | 13px | 400 | Nav items, workflow names |
| `text-sidebar-label` | 11px | 500 | Group headers |
| `text-sidebar-meta` | 10px | 400 | Timestamps |

### Utility-классы (globals.css)

**Surfaces:** `.surface-panel` · `.surface-elevated` · `.surface-soft` · `.surface-inset-card`
**Severity:** `.surface-info-soft` · `.surface-success-soft` · `.surface-danger-soft` · `.surface-warning-soft`
**Typography:** `.section-kicker` · `.ui-title-text` · `.ui-body-text` · `.ui-meta-text` · `.ui-meta-label`
**Interaction:** `.ui-interactive-card` · `.ui-pressable` · `.ui-icon-button`
**Status:** `.ui-status-badge` · `.ui-status-badge-success|warning|danger|info` · `.ui-status-halo-danger`
**Alerts:** `.ui-alert-info|warning|danger|success`
**Controls:** `.control-cluster` · `.control-badge` · `.border-hairline` · `.ui-disclosure`
**Motion:** `.ui-fade-slide-in` · `.ui-fade-slide-in-trailing`
**Progress:** `.ui-progress-track` · `.ui-progress-bar`

Full reference: `CLAUDE.md` → Styling section, `src/renderer/styles/globals.css`, `tailwind.config.js`.

---

## Источники

Этот документ консолидирует:
- `docs/DAY-30-OPERATOR-CONTRACT.md` — UX-принципы daily-driver
- `docs/R2-EXECUTION-PLAN.md` — продуктовые объекты, guardrails, anti-patterns
- `docs/UX-SCENARIOS.md` — мета-паттерны, 12+ принципов сценариев
- `docs/BRAND.md` — бренд-качества, feel, позиционирование
- `docs/HUB-WRITING-GUIDE.md` — формула карточек, запрещённые слова
- `docs/plans/2026-03-12-copy-style-guide.md` — UI-копирайтинг, словарь
- `docs/plans/2026-03-17-c8c-workflow-editor-ux-remediation-spec.md` — принципы редактора
- `CLAUDE.md` — дизайн-система, токены, утилиты
