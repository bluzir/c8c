---
name: exa/search-research
description: Search academic papers, arXiv preprints, and scientific research via Exa
allowedTools:
  - mcp__exa__web_search_advanced_exa
  - Agent
---

# Research Paper Search via Exa

Search for academic papers, arXiv preprints, conference proceedings, and scientific research.

## Tool Usage

Always use `web_search_advanced_exa` with `category: "research paper"`.

### Supported Parameters (full filter support)

- `query` (required), `numResults`, `type`
- `includeDomains`, `excludeDomains`
- `startPublishedDate`, `endPublishedDate`
- `includeText`, `excludeText` — single-item arrays only
- `textMaxCharacters`, `enableSummary`, `summaryQuery`
- `enableHighlights`, `highlightsNumSentences`, `highlightsPerUrl`
- `livecrawl`, `subpages`, `subpageTarget`

## Token Isolation

Always spawn Agent subagents for Exa calls. Never run searches in the main context.

## Output Format

1. **Results** — title, authors, date, abstract summary, key findings
2. **Sources** — URLs with publication venue (arXiv, journal, conference)
3. **Notes** — methodology differences, conflicting findings across papers
