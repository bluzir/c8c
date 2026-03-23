---
name: exa/search-tweets
description: Search X/Twitter for discussions, announcements, developer opinions, and community sentiment via Exa
allowedTools:
  - mcp__exa__web_search_advanced_exa
  - Agent
---

# X/Twitter Search via Exa

Search tweets for social discussions, product announcements, developer opinions, trending topics, and community sentiment.

## Tool Usage

Always use `web_search_advanced_exa` with `category: "tweet"`.

### Supported Parameters (LIMITED — tweets have restrictions)

- `query` (required), `numResults`, `type`
- `startPublishedDate`, `endPublishedDate`
- `textMaxCharacters`, `enableSummary`, `summaryQuery`
- `enableHighlights`, `highlightsNumSentences`, `highlightsPerUrl`
- `additionalQueries` — use for hashtag variations
- `livecrawl` — set to `"preferred"` for recent tweets
- `livecrawlTimeout`

### NOT Supported (will cause errors)

- `includeText` — 400 error
- `excludeText` — 400 error
- `includeDomains` — 400 error
- `excludeDomains` — 400 error
- `moderation` — 500 error

## Token Isolation

Always spawn Agent subagents for Exa calls. Never run searches in the main context.

## Output Format

1. **Results** — tweet content, author handle, date, engagement if visible
2. **Sources** — tweet URLs
3. **Notes** — sentiment summary, notable accounts, threads vs single tweets
