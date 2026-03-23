# Skill Metadata Schema for Discovery

**Date:** 2026-03-23
**Status:** Active
**Scope:** Define metadata fields on skill files for stage-fit inference and discovery ranking
**Source:** R2-SKILL-DISCOVERY-AND-IMPORT-SPEC.md

---

## 1. Purpose

The skill discovery system (R2 WS-D) needs structured metadata on skill files to:
- Rank skills by relevance to the current stage
- Show provenance (Local / Project / Imported)
- Filter by stage fit during inline attach

Currently skill `.md` files have YAML frontmatter with `name`, `description`, and sometimes `tags`. This spec adds `stageFit` and `keywords` for discovery.

---

## 2. Schema

### New frontmatter fields

```yaml
---
name: code-reviewer
description: Review code changes against project conventions
# ── Discovery metadata (new) ──
stageFit:
  - evaluate      # primary stage family
  - validate      # secondary (also useful here)
keywords:
  - code review
  - pull request
  - conventions
  - quality
---
```

### Field definitions

| Field | Type | Required | Description |
|---|---|---|---|
| `stageFit` | `string[]` | No | Canonical stage families where this skill is most relevant. Values: `understand`, `design`, `execute`, `evaluate`, `validate`, `deliver`. First value = primary. |
| `keywords` | `string[]` | No | Free-text keywords for search/ranking. Supplements `description` for fuzzy matching. |

### Inference rules (when `stageFit` is absent)

If a skill file has no `stageFit`, the discovery system infers it from:

1. **Skill name patterns:**
   - Contains `review`, `audit`, `lint`, `check`, `assess` → `evaluate`
   - Contains `test`, `verify`, `validate`, `qa` → `validate`
   - Contains `plan`, `spec`, `design`, `architect`, `strategy` → `design`
   - Contains `map`, `explore`, `research`, `investigate`, `discover` → `understand`
   - Contains `build`, `implement`, `create`, `generate`, `write`, `execute` → `execute`
   - Contains `ship`, `release`, `deploy`, `publish`, `deliver`, `distribute` → `deliver`

2. **Description keyword scan:** Same patterns applied to `description` field.

3. **Fallback:** If no signal, skill is stage-neutral (available everywhere, ranked lower).

---

## 3. Provenance

Provenance is derived from file location, not metadata:

| Source | Location | Label in UI |
|---|---|---|
| **Project** | `{project}/.c8c/skills/` or `{project}/.claude/skills/` | "Project" |
| **User** | `~/.c8c/skills/` | "Your skills" |
| **Library** | `~/.c8c/libraries/*/` | Library name |
| **Built-in** | `resources/skills/` in app bundle | "Built-in" |

No metadata field needed — resolved at scan time by `scanSkills()`.

---

## 4. Discovery Ranking

When the user attaches a skill during a stage, rank by:

1. **Exact stageFit match** — skill's primary `stageFit` matches current stage → highest
2. **Secondary stageFit match** — skill's secondary `stageFit` entries match → high
3. **Inferred stageFit match** — name/description inference matches → medium
4. **Keyword match** — user's search query matches `keywords` → medium
5. **Description match** — fuzzy match against `description` → low
6. **No signal** — stage-neutral skills → lowest

---

## 5. Action Items

### P0 (R2 WS-D)
1. Add `stageFit` and `keywords` to skill frontmatter parser (`gray-matter` already handles this)
2. Add inference function `inferStageFit(name, description): string[]`
3. Add ranking function `rankSkillsForStage(skills, stageFamily): ScoredSkill[]`
4. Populate `stageFit` on built-in skills in `resources/skills/`

### P1 (R2 follow-up)
5. Show `stageFit` badges in skill picker UI
6. Filter skill picker by current stage family when attaching inline
