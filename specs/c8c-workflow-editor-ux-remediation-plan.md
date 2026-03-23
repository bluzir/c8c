# c8c Workflow Editor UX Remediation Plan

Status: Draft v1.0
Updated: 2026-03-17
Source inputs:

- local synthesis in `docs/plans/2026-03-17-c8c-workflow-editor-ux-remediation-spec.md`
- tracked backlog in `tasks/prd-c8c-ux-overhaul.md`

## Purpose

This is the tracked source of truth for workflow-editor remediation sequencing. It extracts the editor-specific part of the broader UX overhaul and turns it into an implementation order the team can ship against.

## Core Synthesis

The workflow editor has three systemic failures:

1. Feedback gap
   - validation is computed per field but not shown in the inspector where users edit
   - pause changes run state but barely changes the canvas
   - run starts from canvas but the UI can move users to another surface
2. Hidden affordances
   - `Graph` is not part of the main tab model
   - editable graph mode is hidden behind preview/read-only defaults
   - evaluator, splitter, and human-gate actions are buried behind vague add-step copy
3. Fragmented editor model
   - list, canvas, inspector, and auto-layout do not share one undo/recovery contract
   - spatial intent is not preserved consistently

## Goals

1. Show feedback where the user is already looking.
2. Make `Graph` a first-class editing surface.
3. Preserve one consistent editor model for add, connect, pause, run, and undo.
4. Surface validation during editing, not only at run time.
5. Put differentiating workflow primitives on the main path.
6. Improve keyboard and accessibility parity for graph editing.

## Priority Rules

1. Undo inconsistency is P0, not polish.
2. Validation must surface in `NodeInspector`, not only in node cards or pre-run gating.
3. `Graph` discoverability and mode clarity come before deeper canvas polish.
4. Controls users have already seen should stay visible; prefer disabled plus explanation over hiding.

## Workstream Summary

### WS-01 Validation Feedback at Point of Edit

Priority: P0

Key outcomes:

- field-level validation in `NodeInspector`
- persistent validation count near Run
- one-click navigation from validation list to offending node/field

Backlog mapping:

- `US-B01`
- `US-B02`
- `US-B03`

### WS-02 Graph Access and Mode Clarity

Priority: P0

Key outcomes:

- `Graph` becomes a primary tab
- editable graph surface becomes default
- `Preview` naming replaces misleading read-only labels
- add-step affordances use explicit copy and descriptions

Backlog mapping:

- `US-D06`
- `US-D08`
- `US-I02` subset

### WS-03 Run and Pause Visibility in the Active Surface

Priority: P0

Key outcomes:

- no forced auto-switch away from canvas on run start
- visible paused overlay inside canvas
- persistent completion/failure feedback in the active surface

Backlog mapping:

- `US-K01`
- `US-K05`
- `US-K03` subset

### WS-04 Spatial Editing and Connection Clarity

Priority: P0

Key outcomes:

- context-menu insertion honors click location
- manual positions persist until explicit reset
- effective connection hit targets are at least 24px
- pass/fail connection intent is clearer during drag

Backlog mapping:

- `US-D01`
- `US-D03`
- `US-D04`
- `US-D07`

### WS-05 Undo and Recovery Consistency

Priority: P0

Key outcomes:

- one undo/redo model across list, canvas, inspector, and auto-layout
- canvas deletion and layout actions recover through the same history stack
- debounced checkpointing for text editing

Backlog mapping:

- `US-E01`
- `US-C03`
- `US-D01` subset

### WS-06 Configuration Clarity and Accessibility Layer

Priority: P1

Key outcomes:

- high-frequency jargon explained inline
- defaults/settings/override relationship visible
- disabled controls explain blockers
- keyboard users can discover graph and add-step paths

Backlog mapping:

- `US-I02`
- `US-P01` to `US-P06`
- targeted node-editor copy cleanup

## Iteration Plan

### Iteration 1: Validation Visibility and Run-Surface Trust

Target length: 2-3 days

Scope:

- field-level validation inside `NodeInspector`
- shared validation rendering between list and inspector
- persistent validation badge near Run
- remove forced switch away from canvas on run start

Ship gate:

- users can find the offending field from the inspector without trial-and-error
- validation count is visible before pressing Run
- starting a run from canvas no longer changes the active surface by default

Stories:

- `US-B01`
- `US-B02`
- `US-B03`
- `US-K05` subset

### Iteration 2: Shared Undo and Recovery Backbone

Target length: 3-4 days

Scope:

- shared undo/redo model across list, canvas, inspector, and auto-layout
- debounced snapshot strategy for text fields
- recoverable canvas deletion and auto-layout actions
- visible undo/redo affordances

Ship gate:

- `Cmd+Z` reverts the last edit regardless of surface
- auto-layout and canvas deletions no longer rely on toast-only recovery
- no high-frequency workflow mutation bypasses the shared history stack

Stories:

- `US-E01`
- `US-C03`
- `US-D01` subset

### Iteration 3: Graph as a First-Class Editing Surface

Target length: 2-3 days

Scope:

- move `Graph` into the primary tab strip
- keep `Graph` visible during runs
- default to editable graph mode and persist mode choice
- rename read-only graph label to `Preview`
- replace vague add-step copy and improve splitter guidance

Ship gate:

- keyboard navigation reaches `Graph` as part of the same tab model as `Flow` and `Defaults`
- workflow switches do not silently drop users back into read-only preview
- first-session users can find evaluator and splitter actions from the primary add path

Stories:

- `US-D06`
- `US-D08`
- `US-I02` subset

### Iteration 4: Spatial Editing Fidelity

Target length: 3-4 days

Scope:

- context-menu insertion uses clicked coordinates
- manual positions persist until explicit reset
- connection hit targets increase to an effective 24px target area
- pass/fail connection cues improve during drag
- reset-to-auto-layout remains explicit and recoverable

Ship gate:

- node added from context menu lands at or near the clicked position
- edge creation no longer depends on tiny-hit-target precision
- manual layout survives routine editing until reset explicitly

Stories:

- `US-D01`
- `US-D03`
- `US-D04`
- `US-D07`

### Iteration 5: Active-Surface Runtime Feedback

Target length: 2-3 days

Scope:

- visible paused overlay/banner on canvas
- pause copy clarifies current-node behavior
- persistent completion/failure feedback in the active workflow surface
- runtime cues that do not rely on color alone

Ship gate:

- paused state is recognizable from canvas within one glance
- completion and failure remain visible even if the initial toast is missed
- runtime state remains understandable without relying on color alone

Stories:

- `US-K01`
- `US-K05`
- `US-K03` subset

### Iteration 6: Configuration Clarity and Accessibility Layer

Target length: 3-4 days

Scope:

- high-frequency jargon help in node editors
- explicit defaults/settings/override inheritance cues
- consistent list/inspector field ordering
- disabled-state explanations
- shortcut hints and keyboard discoverability

Ship gate:

- high-frequency node configs are understandable without external docs
- settings/defaults/override relationship is visible in the UI
- no high-frequency disabled editor control remains silent
- keyboard users can discover the main graph and add-step paths from the UI

Stories:

- `US-I02`
- `US-P01` to `US-P06`

## Suggested Ship Grouping

### Cycle A

- Iteration 1
- Iteration 2

Outcome:

- editor correctness and trust baseline

### Cycle B

- Iteration 3
- Iteration 4

Outcome:

- graph discoverability and spatial editing reliability

### Cycle C

- Iteration 5
- Iteration 6

Outcome:

- runtime readability, config clarity, and accessibility hardening

If only two cycles are available:

1. Cycle A:
   - Iteration 1
   - Iteration 2
   - Iteration 3
2. Cycle B:
   - Iteration 4
   - Iteration 5
   - Iteration 6

## Net-New Backlog Items Added by This Plan

1. `US-B03`
   - inspector validation visibility and persistent error count
2. `US-D06`
   - `Graph` as a first-class tab
3. `US-D07`
   - context-menu insertion honors click position
4. `US-D08`
   - add-step discoverability and splitter guidance
5. `US-K05`
   - active-surface runtime feedback

## Success Metrics

1. Users can locate an invalid field from the validation badge in one navigation step.
2. `Graph` usage in first-session editing grows without a matching rise in immediate bounce-back to list mode.
3. Context-menu insertion lands nodes close to the clicked point in manual QA.
4. `Cmd+Z` successfully reverts list, canvas, inspector, and auto-layout edits.
5. Paused state is recognized from the canvas within one second in moderated testing.

## Open Questions

1. Should `Graph` remain partially interactive during all run states, or should some actions disable while the tab stays visible?
2. Should manual canvas positions stay local-only or become part of the exported workflow schema?
3. Should validation dropdown navigation auto-focus the exact field, or is select plus scroll sufficient?
4. Should the canvas inspector ultimately replace `NodeCard`, or coexist long-term?
