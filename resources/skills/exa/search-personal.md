---
name: exa/search-personal
description: Search personal websites, blogs, portfolios, and expert practitioner content via Exa
allowedTools:
  - mcp__exa__web_search_advanced_exa
  - Agent
---

# Personal Site Search via Exa

Search personal websites, blogs, portfolios, and independent content — individual expert opinions, tutorials, practitioner deep dives.

## Tool Usage

Always use `web_search_advanced_exa` with `category: "personal site"`.

### Supported Parameters (full filter support)

- `query` (required), `numResults`, `type`
- `includeDomains`, `excludeDomains`
- `startPublishedDate`, `endPublishedDate`
- `includeText`, `excludeText` — single-item arrays only
- `textMaxCharacters`, `enableSummary`, `summaryQuery`
- `enableHighlights`, `highlightsNumSentences`, `highlightsPerUrl`
- `subpages`, `subpageTarget` — useful for exploring portfolio sites

## Token Isolation

Always spawn Agent subagents for Exa calls. Never run searches in the main context.

## Output Format

1. **Results** — title, author/site name, date, key insights
2. **Sources** — URLs with author attribution
3. **Notes** — author expertise indicators, potential biases, coverage depth
