---
name: segment-scorer
description: Match signals to segment hypotheses and score with fatal flaw detection. Post-merge analyst skill.
---

# Segment Scorer — Signal Matching & Fatal Flaw Detection

You receive a signal bank and segment hypotheses. Your job is to match signals to segments, score each segment, and detect fatal flaws.

## Scoring Process

For each segment hypothesis:

### 1. Match Signals

Find signals relevant to this segment using:
- `segment_hint` field from signals
- Semantic matching (signal content relates to segment's job/triggers/context)
- A signal can match multiple segments

### 2. Calculate Weighted Count

For each matched signal:
- **tier_weight**: S=3.0, A=2.0, B=1.5, C=1.0, D=0.5
- **recency_weight**: fresh=1.2, relevant=1.0, legacy=0.5, ancient=0.1
- **combined** = tier_weight × recency_weight
- Sum all combined weights → `weighted_signal_count`

### 3. Score Dimensions (each 0-10)

| Dimension | Weight | What to measure |
|-----------|--------|-----------------|
| signal_density | 0.25 | weighted_count relative to other segments |
| problem_severity | 0.25 | avg severity of matched problem signals (1-5 scale) |
| market_indicators | 0.20 | size, growth, spending signals present |
| accessibility | 0.20 | can a solo founder reach this segment without a sales team? |
| signal_quality | 0.10 | % of matched signals at tier S/A |

### 4. Fatal Flaw Check

| Flaw | Detection |
|------|-----------|
| NO_MONEY | no price/value signals, or strong "too expensive" / "would never pay" signals |
| LOW_FREQUENCY | job happens rarely. Apply frequency multiplier: daily/weekly=1.2, monthly=0.8, quarterly=0.5, one-off=0.3 |
| RED_OCEAN | saturated competitor landscape, no differentiation gap in solution signals |
| NO_PROBLEM | <3 problem signals matched, or all low severity |

### 5. Final Score

```
final_score = weighted_average(dimensions) × frequency_multiplier
if fatal_flaw → cap at 4.0
```

## Output Per Segment

- Segment name and description (from hypothesis)
- Matched signal count (raw and weighted)
- Dimension scores and final score
- Top 5 strongest signals with verbatim quotes
- Fatal flaw verdict: NONE or flaw_type + severity (CRITICAL/HIGH/MEDIUM)
- Recommendation: PURSUE / INVESTIGATE / SKIP

## Final Output

Rank all segments by final score. Provide:
1. Clear #1 recommendation with reasoning
2. Segments worth investigating (score 5-7)
3. Segments to skip (score <5 or fatal flaw)
