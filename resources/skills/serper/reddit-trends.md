---
name: serper/reddit-trends
description: Extract trending discussions and community insights from Reddit via Serper google_search + scrape. Supports incremental mode for trendwatch.
allowedTools:
  - mcp__serper__google_search
  - mcp__serper__scrape
  - Agent
---

# Reddit Trend Extraction via Serper

Extract community discussions, insights, and sentiment from Reddit using Serper's google_search + scrape pipeline. Designed for trend monitoring with incremental state.

## Why Serper for Reddit

- `google_search` with `site:reddit.com` finds relevant threads
- `scrape` with `includeMarkdown: true` extracts full comments with scores, authors, timestamps
- Preserves thread structure and vote counts
- No Reddit API auth needed
- Handles rate limits automatically

## Input

The caller provides:

- `query` — topic to search (e.g. "AI coding assistants")
- `subreddits` — optional target subreddits (e.g. ["programming", "ExperiencedDevs"])
- `keywords` — optional experience keywords (e.g. ["my experience", "switched to"])
- `max_threads` — default 3
- `max_comments_per_thread` — default 10
- `last_check_timestamp` — for incremental mode (ISO 8601, null on first run)

## Procedure

### Step 1: Build search query

Always prefix with `site:reddit.com`. Add subreddit hints and keywords:

```
site:reddit.com {query} (r/{sub1} OR r/{sub2}) "{keyword1}"
```

Example: `site:reddit.com Cursor vs Copilot (r/programming OR r/ExperiencedDevs) "my experience"`

### Step 2: Search via Serper

```
mcp__serper__google_search(
  q: "{constructed_query}",
  gl: "us",
  hl: "en",
  num: max_threads + 2  // buffer for filtering
)
```

### Step 3: Filter results

- Only URLs with `/r/.../comments/` (actual threads)
- Skip threads older than 2 years
- If incremental: skip threads older than `last_check_timestamp`

### Step 4: Scrape each thread

```
mcp__serper__scrape(
  url: "{thread_url}",
  includeMarkdown: true
)
```

Error handling: skip on timeout, 403, 404, empty response.

### Step 5: Parse comments from markdown

Serper returns structured markdown:

```markdown
# Thread Title

Post body...
**u/author** • _2 days ago_ • ↑234

## Comments

- **u/commenter1** • _5 hours ago_ • ↑89
  Comment text...
  - **u/reply_author** • _3 hours ago_ • ↑12
    Reply text...
```

Extract: author, score, age, comment text, depth (top-level vs reply).

### Step 6: Filter and score

- Skip comments with score < 5
- Skip comments shorter than 50 chars
- Weight by recency: fresh (<6mo) × 1.5, relevant (6-18mo) × 0.7, legacy (18-36mo) × 0.3
- Tier by score: A (≥50), B (10-49), C (5-9)
- Keep top `max_comments_per_thread` per thread sorted by score

### Step 7: Return structured output

```yaml
reddit_results:
  query_used: "{constructed_query}"
  threads_scraped: N
  total_comments: N
  findings:
    - thread_title: "What's everyone's experience with X?"
      subreddit: "r/programming"
      thread_score: 234
      thread_url: "https://reddit.com/r/.../comments/..."
      insights:
        - insight: "Key community opinion"
          quote: "Verbatim quote, max 200 chars"
          author: "u/username"
          score: 89
          tier: A
          age: fresh
        - ...
  metadata:
    check_timestamp: "2026-03-23T12:00:00Z" # save for next incremental run
    period_hours: 24
```

## Usage in content-trend-watch

The template calls this skill for Reddit signals. Results feed into trend detection alongside Exa Twitter results. The template handles merging and digest generation — this skill only does Reddit extraction.

## Limits

- Max 5 threads per search
- Max 10 comments per thread
- Skip score < 5, length < 50 chars
- Skip threads > 2 years old
- One Serper search + N scrapes per invocation
