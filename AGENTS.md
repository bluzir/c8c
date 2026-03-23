# Repo Guardrails

## No Heuristics — Agent-Only Decisions

- **All non-trivial decisions must be made by LLM agents, not by regex/keyword heuristics.**
- This applies to: routing (which template to pick), intent classification, disambiguation, and any decision that interprets user natural language.
- The only programmatic (non-agent) logic allowed is reading **structural facts** about the project (empty vs has code, has git history, project kind). These facts are passed as context to the agent — they do not map directly to decisions.
- No keyword matching, no regex routing, no `if prompt.includes("audit")` patterns. If it interprets human language, it goes through an LLM.
- When agent confidence is low, surface a clarification fork to the user — do not fall back to a heuristic guess.

## Visual Hierarchy — Ship-Blocker Rules

- **One Figure Per State**: only the primary object gets border+bg+elevation. Everything else is flat.
- **≤5 visible actions per state**: excess → overflow. One primary CTA. No dual Run buttons.
- **Show only what matters now**: no empty tabs, no disabled-but-visible controls, no premature chrome.
- **Composer-first guardrail**: on create/start surfaces, dominant continuation may own the card weight, but it must not hide or replace the primary point-B input.
- **One status signal per fact**: no duplicate progress/status across components.
- **No cards inside cards**: bordered containers never nest other bordered containers.
- **Contextual depth only where real content exists**: if an inspect/result state would otherwise become a dead end, allow local depth navigation inside the owner surface. This may be one low-emphasis advanced link or a compact content-aware tab strip (`Result`, `Activity`, `Step log`, `History`). Never render empty tabs, and never use page-chrome tabs for idle/create states.
- **Technical detail stays secondary**: thresholds, rule inventories, per-check breakdowns, rubric scores, and other execution diagnostics should default to disclosure or local depth. Keep the primary surface focused on the current decision, outcome, and next action.
- **One page header**: a workflow or project gets one strong top-level header. Child surfaces below it use flat context strips, not repeated hero headers.
- Thresholds: ≤3 bordered containers, ≤5 clickable elements, 0 duplicate signals, 0 nested cards, 0 rendered-but-empty sections per state.
- Full spec: `docs/conventions/DESIGN-PHILOSOPHY.md` §8.

## UI Surfaces

- Do not add or reintroduce the app-shell flow/status rail for now.
- No horizontal quick-switch rail on any page until there is an explicit IA pass and approval for it.
- Keep flow switching on existing surfaces like the sidebar, command palette, and keyboard shortcuts.
