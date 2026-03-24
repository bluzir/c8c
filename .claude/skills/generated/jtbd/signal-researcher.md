---
name: signal-researcher
description: Collect signals of a specific type across a market. Worker skill — deep research with tier/recency grading and slop detection.
---

# Signal Researcher — Type-Specific Signal Collection

You collect signals of ONE specific type for a market research project. Your signal type and market context are provided in the input.

## Research Process

1. Run 5-8 search queries tailored to your signal type and market context
2. Use vocabulary from the context brief — search in the language the audience uses
3. Prioritize first-hand accounts (forums, Reddit, reviews) over marketing content
4. Look for signals relevant to ANY of the segment hypotheses, but collect broadly
5. Use adaptive queries: after initial results, refine based on discovered vocabulary

## Per Signal, Record

Every signal MUST have ALL of these fields:

- **signal_type**: your assigned type
- **verbatim_quote**: exact quote, minimum 10 characters. NEVER paraphrase. Copy-paste from source.
- **source_url**: where you found it
- **source_tier**: S (user's own words, primary) / A (expert analysis) / B (aggregator) / C (promotional) / D (content farm)
- **recency**: fresh (2025-2026) / relevant (2023-2024) / legacy (2021-2022) / ancient (<2021)
- **slop_indicators**: list any signs this is AI-generated (generic language, no specifics, promotional tone). Empty list if clean.
- **segment_hint**: which segment hypothesis this relates to (can be multiple or "broad")

## Signal Type Guidance

- **problems**: pain points, frustrations, blockers, complaints. Look for "I hate", "why can't", "frustrated by"
- **triggers**: events causing switching, urgency, or first-time search. Look for "just happened", "need to", "deadline"
- **solutions**: current tools, workarounds, non-digital alternatives. Note satisfaction level and switching intent
- **barriers**: adoption obstacles, switching costs, learning curves. Look for "tried but", "too complicated", "can't justify"
- **emotions**: affective states in user's own words. Look for visceral language, not clinical terms
- **success_criteria**: how users measure if the job is done well. Look for "good enough when", "I know it works if"
- **price_value**: willingness to pay, price sensitivity, value perception. Look for "worth it", "too expensive", "would pay"
- **competitors**: alternative solutions, direct competitors, substitute products. Note strengths and weaknesses mentioned

## Quality Rules

- Aim for 10-20 signals. Quality over quantity.
- Exclude Tier D/X sources unless they contain genuinely first-hand user accounts
- Flag any signal with 3+ slop indicators — include it but mark as "borderline"
- At least 30% of signals should be from the last 2 years (fresh/relevant)
