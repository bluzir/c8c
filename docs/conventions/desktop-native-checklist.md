# Desktop-Native Checklist

Goal: keep the UI consistent and platform-accurate for Electron desktop apps without changing product logic.

## 1) Platform Precision
- [x] Window chrome is platform-aware (macOS, Windows, Linux).
- [x] Titlebar drag region and spacing are enabled only where needed.
- [x] Keyboard hints use platform-native labels (`⌘` vs `Ctrl`).
- [x] Native dialogs and external link handling are used from main/preload.
- [x] Window restore bounds are validated against current displays (multi-monitor safe).
- [x] Fullscreen/maximized state changes are propagated to renderer runtime.

## 2) Layout Rhythm
- [ ] UI spacing follows one scale: `4 / 8 / 12 / 16 / 20 / 24`.
- [ ] No ad-hoc fractional paddings/margins for repeated components.
- [ ] Page shell uses a consistent gutter and vertical cadence.

## 3) Typography
- [ ] Three text levels only for product UI: `title`, `body`, `meta`.
- [ ] Shared line-height/weight per level.
- [ ] No random per-screen font stacks or decorative tracking.

## 4) Controls
- [ ] Buttons, inputs, selects, tabs use shared `sm/md/lg` heights.
- [ ] Hover/active/focus/disabled behavior is consistent across controls.
- [ ] Focus ring style is uniform and high-contrast.

## 5) Shape and Elevation
- [ ] Two radii only: control and container.
- [ ] Two elevation styles only: base panel and overlay.
- [ ] Avoid stacking blur + heavy shadow + thick borders on the same element.

## 6) Color Discipline
- [ ] Neutral palette for surfaces and text.
- [ ] Accent is reserved for action and focus, not for passive UI.
- [ ] Status colors are semantic tokens only (`success`, `warning`, `danger`, `info`).

## 7) Motion Discipline
- [x] One duration range for standard controls (`120-180ms`).
- [x] One easing family for standard transitions.
- [x] Reduced-motion fallback is present.

## 8) Desktop Performance
- [x] No unnecessary layout shifts on panel resize/view switch.
- [x] Canvas and heavy panels avoid forced remounts.
- [ ] First meaningful paint remains lightweight (no visual overdraw spikes).

## Screen Audit (Current Pass)
- [x] Main shell and page scaffold
- [x] Project sidebar
- [x] Workflow panel (list/canvas mode)
- [x] Canvas board (nodes/edges/controls)
- [x] Skills and templates pages
- [x] Chat panel shortcut hints

## Notes
- Keep this checklist as an acceptance gate for visual PRs.
- If a change requires a one-off style, add a system token or utility first.
