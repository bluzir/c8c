---
name: exa/search-financial
description: Search SEC filings, earnings reports, 10-K filings, and financial documents via Exa
allowedTools:
  - mcp__exa__web_search_advanced_exa
  - Agent
---

# Financial Report Search via Exa

Search for SEC filings, earnings reports, quarterly earnings, annual reports, and financial documents.

## Tool Usage

Always use `web_search_advanced_exa` with `category: "financial report"`.

### Supported Parameters

- `query` (required), `numResults`, `type`
- `includeDomains`, `excludeDomains` — filter by source
- `startPublishedDate`, `endPublishedDate` — date range (ISO 8601)
- `includeText` — single-item array only, e.g. `["revenue growth"]`
- `textMaxCharacters`, `enableSummary`, `summaryQuery`
- `enableHighlights`, `highlightsNumSentences`, `highlightsPerUrl`
- `livecrawl` — set to `"preferred"` for recent filings

### NOT Supported (will cause 400 error)

- `excludeText` — DO NOT USE with financial report category

## Token Isolation

Always spawn Agent subagents for Exa calls. Never run searches in the main context.

## Output Format

1. **Results** — company name, filing type, date, key figures/highlights
2. **Sources** — filing URLs with publication dates
3. **Notes** — reporting period, restatements, auditor notes if relevant
