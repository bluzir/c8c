# Template Design Guide

Best practices for building flow templates in c8c. Learned from production failures.

## Core Principle

A template is a graph of nodes where each node does ONE job. The node's prompt defines WHAT to do. Skills define HOW. These must not conflict.

## The Fan-Out Pattern

Most templates follow: `input → pre-split → splitter → worker(s) → merger → evaluator → output`

### Pre-split node

The node before splitter does two jobs: understand the input and produce a structure the splitter can decompose.

**Rules:**

- Use a dedicated skill that matches the pre-split job (scout, mapper, planner) — never a worker skill (researcher, auditor, content-creator)
- The agent WILL use whatever tools are available. If you don't want it to research, don't give it a researcher skill. If you want it to search briefly for context, give it a scout skill that bounds the work
- Output format is flexible — splitter handles JSON arrays, markdown tables, bullet lists, and prose. Don't over-constrain the format
- One node is enough. Don't chain scout → planner → splitter unless each step genuinely needs a different agent with different tools

### Splitter

Splitter decomposes pre-split output into parallel branches.

**Rules:**

- Strategy describes HOW to split the pre-split output, not what content to generate
- Never use splitter as a planner — it should decompose existing structure, not create new content. If you need the splitter to "generate 5 tweet ideas" or "identify 6 market segments", that planning belongs in the pre-split node
- If input is already structured (JSON array, list), splitter detects and splits without LLM call. JSON arrays are detected first (highest priority)
- `maxBranches` is a hard cap — splitter won't create more branches than this

### Workers (between splitter and merger)

Cloned per branch. Each clone gets the same prompt + skill but different subtask content.

**Rules:**

- Multiple parallel workers are supported: `splitter → [A, B] → merger` clones both A and B per branch. Use for multi-source patterns (web + Reddit, code + docs)
- Workers receive subtask content as input. The prompt should be generic — the specificity comes from the subtask
- Load methodology skills via `skillRefs` (e.g., source-evaluation). These teach HOW to work, not WHAT to do

### Merger

Collects all branch outputs into one result.

**Rules:**

- `strategy: summarize` uses an LLM to synthesize — give it a prompt describing the output structure
- `strategy: concatenate` just joins outputs — **no LLM call, prompt is ignored**. Don't put assembly instructions in a concatenate merger prompt — they will be silently skipped
- Merger gets 2×N outputs when using parallel workers (N branches × 2 worker types)

### Evaluator

Quality gate with pass/fail. Retry on fail.

**Rules:**

- `retryFrom` must match the fail edge target. If `retryFrom` says `merger-1` but the fail edge goes to `splitter-1`, the config is inconsistent
- `retryFrom` should point to splitter or the pre-split node, not merger (re-running merger on the same inputs won't improve quality)
- `skillRefs` on evaluators inject quality criteria / methodology — never worker skills. Loading `gtm/email-generation` on an evaluator is wrong; loading `source-evaluation` or `slop-check` is right

## Skill–Node Coupling

The #1 source of broken templates: a skill that contradicts the node's task.

**The problem:** Skill says "Research thoroughly, find sources" → node prompt says "Just plan, don't research" → agent tries to do both → chaos.

**Rules:**

- Node prompt = WHAT to do (the task). Skill = HOW to do it (methodology). Never load a skill whose WHAT conflicts with the node's WHAT
- If no existing skill fits the node's job, don't force one. A node with just a prompt and no skillRef is fine
- When in doubt, create a small dedicated skill rather than reusing a generic one that almost fits
- `skillRefs` (plural) loads additional methodology. Use for cross-cutting concerns (source-evaluation, quality criteria) that don't define the task

## maxTurns

**Never use maxTurns as a soft budget.** It is a hard kill — the agent is terminated mid-execution when the limit is hit. Output may be truncated, corrupted, or empty. There is no graceful degradation.

Use maxTurns only as a safety valve against runaway agents (e.g., `defaults.maxTurns: 120` at workflow level). Never use it on individual nodes to "keep them quick."

## Intent Context

Templates can access the user's original request via `WorkflowInput.context`. This is injected into every node's prompt as "User's goal for this flow." Template prompts stay generic — intent context adapts them at runtime.

## Known Anti-Patterns (from audit)

Violations found across existing templates. Fix when touching these templates.

### Worker skill on pre-split node

- `competitor-ad-intelligence`: `context-1` uses `researcher` for a structuring job
- `landing-audit-loop`: `validator-1` uses `researcher` for an analysis job
- `content-repurposing-factory`: `analyzer-1` uses `marketing/Content Creator` for extraction
- `content-distribution-bundle`: same pattern

### Splitter doing the planning job

- `twitter-growth-machine`: splitter generates tweet ideas (should be pre-split)
- `ai-cmo-x-engine`: splitter generates post assignments (should be pre-split)

### maxTurns on individual nodes

- `segment-research-gate` (fixed in `segment-research-jtbd`): `skill-1` had `maxTurns: 15`
- `remotion-video-director-pipeline`: `build-1` has `maxTurns: 120`
- `playwright-visual-audit`: `runner-1` has `maxTurns: 120`

### Worker skillRefs on evaluators

- `new-vertical-to-live-campaign`: evaluators load `gtm/email-generation` etc.
- `segmented-outreach-launchpad`: same pattern

### Concatenate merger with assembly prompt

- `remotion-video-director-pipeline`: `merger-1` uses `strategy: concatenate` but has a complex prompt asking it to assemble code. The prompt is silently ignored.

## Checklist Before Shipping a Template

- [ ] Every node has exactly one job
- [ ] No skill loaded on a node contradicts the node's prompt
- [ ] Pre-split node uses a scout/mapper skill, not a worker skill
- [ ] No maxTurns on individual nodes (only workflow-level safety valve)
- [ ] Splitter strategy describes split logic, not content generation
- [ ] Workers between splitter and merger are self-contained per branch
- [ ] Evaluator `retryFrom` matches the fail edge target
- [ ] Evaluator `skillRefs` are methodology/criteria skills, not worker skills
- [ ] Concatenate mergers have no prompt (or only a label — prompt is ignored)
- [ ] Test with a real input — watch for agents "helping" by doing more than asked
