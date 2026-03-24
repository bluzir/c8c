# Hub Writing Guide

How to write communication for c8c hub templates. For anyone adding a new template or rewriting an existing card.

---

## The rule

Every template card answers one question: **"What job does this do for me?"**

Not what nodes it has. Not what skills it calls. Not how many evaluators or splitters are inside. The user has a task → finds the card → reads 6 lines → decides if this is the one.

---

## Card format

Every template card has exactly 6 fields:

```
HEADLINE: [verb] + [what you get]
WHEN:     [the situation that makes you need this]
INPUT:    [what you provide]
OUTPUT:   [what you get back]
HOW:      [what happens — one sentence]
TIME:     [how long it takes]
```

That's it. No seventh field. No "features" section. No "powered by" section.

---

## How to write each field

### HEADLINE

Starts with a verb. Describes the outcome, not the process.

| Bad | Good |
|-----|------|
| "Comprehensive Code Quality Pipeline" | "Audit a codebase across security, quality, and architecture" |
| "AI-Powered Content Repurposing System" | "Turn one piece of content into platform-ready variants" |
| "Advanced Research Pipeline with Multi-Lens Analysis" | "Research any topic from multiple angles" |
| "Impeccable UI Enhancement Flow" | "Polish a UI feature from audit to ship-ready" |

Rules:
- Starts with a verb (audit, turn, research, ship, polish, generate, decode, organize)
- No adjectives that don't add information (comprehensive, advanced, AI-powered, intelligent)
- The reader should understand the outcome in under 3 seconds
- Max 10 words

### WHEN

The trigger situation. Not who the user is — when they need this.

| Bad | Good |
|-----|------|
| "For developers who want better code" | "Your codebase grew and you're not sure where the risks are" |
| "When you need content" | "You wrote a blog post and need it adapted for 5 channels" |
| "For founders" | "You have a feature to build and want the full cycle without babysitting" |

Rules:
- Starts with "You" + situation, or describes the moment directly
- Describes a specific trigger, not a role
- The reader thinks "that's me right now" or moves on — both are good outcomes
- Max 2 sentences
- No "Do you..." rhetorical questions

### INPUT

What the user provides. One sentence. Concrete.

| Bad | Good |
|-----|------|
| "Any relevant project information" | "A codebase path or repository" |
| "Content to be processed" | "A blog post, article, or long-form content piece" |
| "Product details and requirements" | "A product idea or feature concept" |

Rules:
- Specific enough that the user knows exactly what to paste or point at
- One sentence, max 15 words
- No "any relevant..." — be specific about what format works

### OUTPUT

What the user gets back. Named artifacts, not descriptions.

| Bad | Good |
|-----|------|
| "A comprehensive analysis" | "Audit report covering security, quality, architecture, and test coverage" |
| "Improved content" | "Platform-specific variants: social posts, newsletter intro, thread" |
| "Actionable insights" | "Prioritized lead list with company profiles and outreach angles" |

Rules:
- Name the artifacts: "report", "spec", "PR", "spreadsheet", "email sequences"
- If multiple outputs, list them separated by commas
- "Actionable insights" is banned — say what the insights are
- "Comprehensive" is banned — say what it covers
- Max 2 sentences

### HOW

One sentence explaining what happens inside. Human terms, not node terms.

| Bad | Good |
|-----|------|
| "Uses 6 skill nodes with 2 evaluators, a splitter for parallel processing, and a merger for output compilation" | "Splits the codebase into audit areas, reviews each in parallel, then synthesizes findings into one report" |
| "Leverages advanced AI capabilities with quality gates" | "Drafts each section independently, runs quality checks per section and across the whole piece" |

Rules:
- One sentence, max 30 words
- Describe the process in human terms: "researches", "drafts", "reviews", "compares", "merges"
- No node types: don't say "evaluator node", "splitter node", "merger node"
- No "leverages", "utilizes", "harnesses the power of"
- The sentence should make sense to someone who has never seen a directed graph

### TIME

Approximate run time. Sets expectations.

| Bad | Good |
|-----|------|
| "Depends on input complexity" | "~8-12 min" |
| "Fast" | "~5 min for a 3-page document" |
| (missing) | "~15-25 min for a medium feature" |

Rules:
- Use tilde (~) — these are estimates, not guarantees
- Give a range if it varies significantly
- Add context if helpful: "per prospect batch", "for a medium feature", "depending on volume"
- Never omit this field — users need to know if they're committing 5 minutes or 45

---

## Banned words and patterns

### Banned in headlines

```
comprehensive, advanced, AI-powered, intelligent, cutting-edge,
next-generation, state-of-the-art, robust, scalable, innovative
```

### Banned in any field

```
leverage, utilize, harness the power of, unlock, empower,
game-changer, revolutionary, transformative, seamless,
it's important to note, at the end of the day, deep dive
```

### Banned structural patterns

- Feature dumps: "Features: evaluator nodes, splitter nodes, merger nodes, approval gates..."
- Node counts: "6-node pipeline with 2 quality gates"
- Internal architecture: "directed acyclic graph with typed edges"
- Rhetorical questions: "Tired of messy invoices?"
- Emotion diagnosis: "You'll feel confident knowing..."
- Fake empathy: "We understand how frustrating..."

---

## Quality checklist

Before publishing a template card, check:

- [ ] Headline starts with a verb
- [ ] Headline has no banned adjectives
- [ ] "When" describes a trigger moment, not a user role
- [ ] "Input" is specific enough to know what to paste
- [ ] "Output" names concrete artifacts, not "insights" or "analysis"
- [ ] "How" is one sentence in human terms, no node types mentioned
- [ ] "Time" has a tilde-range estimate
- [ ] No banned words anywhere in the card
- [ ] A non-technical person reading the card can understand what they'll get
- [ ] The card is under 100 words total (excluding field labels)

---

## Workflow for adding a new template to the hub

1. **Read the YAML.** Understand what the template actually does — nodes, edges, evaluators, approvals.
2. **Identify the job.** What does the user accomplish when this flow completes? That's the headline.
3. **Identify the trigger.** When does someone need this? What just happened that made them look?
4. **Write the 6 fields.** Follow the format exactly. No extra fields.
5. **Run the quality checklist.** Every box checked.
6. **Read it once as a user.** Would you install this based on the card? If not, rewrite.

---

## How categories work on the hub page

Templates are tagged with a `stage` in their YAML. The hub shows these as filter tabs:

| YAML `stage` | Hub filter label | User's question |
|-------------|-----------------|-----------------|
| `research` | Research | "What do I need to know before deciding?" |
| `strategy` | Strategy | "What should I build, and why?" |
| `code` | Build & Audit | "Make this work. Make this better." |
| `content` | Content | "Turn this into something I can publish." |
| `outreach` | Outreach | "Get this in front of the right people." |
| `operations` | Operations | "Keep this running without me babysitting it." |

When writing a card, the category should be obvious from the headline. If you have to explain which category it belongs to, the headline is too vague.

---

## Example: writing a card from scratch

### Input: the YAML

```yaml
id: meeting-actions-plan
stage: operations
headline: Turn meeting transcripts into action plans
how: Analyzes meeting transcript, extracts action items, prioritizes
     and plans each in parallel, and compiles into a project document
input: A meeting transcript or recording notes
output: Structured action plan with owners, priorities, and deadlines
```

### Step 1: Identify the job

The user had a meeting. Now they need to know who does what by when. The job: "turn this mess of notes into something I can actually track."

### Step 2: Identify the trigger

Just finished a 45-minute meeting. Have raw notes or a transcript. Don't want to spend another 30 minutes organizing it.

### Step 3: Write the card

```
HEADLINE: Turn meeting notes into an action plan
WHEN:     You just finished a meeting and have raw notes or a transcript.
          You don't want to spend 30 minutes organizing what was said.
INPUT:    A meeting transcript or recording notes.
OUTPUT:   Action plan with owners, priorities, and deadlines
          for each item — ready to drop into your project tracker.
HOW:      Extracts action items, prioritizes and plans each in parallel,
          then compiles into one structured document.
TIME:     ~5-8 min.
```

### Step 4: Checklist

- [x] Headline starts with verb ("Turn")
- [x] No banned adjectives
- [x] "When" = trigger moment (just finished a meeting)
- [x] "Input" = specific (transcript or notes)
- [x] "Output" = named artifact (action plan with owners, priorities, deadlines)
- [x] "How" = one sentence, human terms
- [x] "Time" = tilde-range
- [x] No banned words
- [x] Non-technical person can understand
- [x] Under 100 words

Done.
