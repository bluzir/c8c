---
name: exa/lead-gen
description: Generate enriched lead lists by ICP using Exa deep search with scoring and CSV output
model: opus
maxTurns: 25
allowedTools:
  - mcp__exa__deep_search_exa
  - Agent
  - Write
  - Bash
---

# Lead Generation via Exa Deep Search

Generate a deduplicated, scored lead list from an Ideal Customer Profile (ICP).

## Architecture

1. **Parse ICP** — extract industry, company size, geography, pain points
2. **Expand queries** — generate 3-5 micro-vertical keyword variations per ICP dimension
3. **Parallel deep search** — spawn subagents, each running `deep_search_exa` with one query batch
4. **Score & deduplicate** — merge results, score ICP fit (1-10), remove duplicates by domain
5. **Output CSV** — compile into `{topic}_leads_{date}.csv`

## Tool Usage

Always use `deep_search_exa` with these required parameters:

```json
{
  "structuredOutput": true,
  "type": "deep",
  "numResults": 50,
  "highlightMaxCharacters": 1
}
```

The `outputSchema` must be flat (max 10 properties, primitives only):

```json
{
  "company_name": "string",
  "website": "string",
  "product_description": "string",
  "icp_fit_score": "number",
  "icp_fit_reasoning": "string"
}
```

## Token Isolation

Never run Exa calls in the main context. Always spawn Agent subagents for searches to avoid context pollution. Each subagent writes results to `/tmp/leads_batch_{n}.json`.

## Output Format

Final CSV with columns: company_name, website, product_description, icp_fit_score, icp_fit_reasoning, source_query.
