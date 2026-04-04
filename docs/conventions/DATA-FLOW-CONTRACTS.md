# Data Flow Contracts — Type-Level Guarantees Against Content Leakage

## Проблема

TypeScript видит `string` везде. Template name, artifact content, user input, workflow name — всё `string`. Компилятор не ловит когда metadata (название шаблона) попадает туда, где должен быть content (trend digest).

Контракты (contractIn/contractOut на шаблонах) работают на уровне artifact kind matching, но **не на уровне типов**. Они проверяют "подходит ли audit_report → contractIn: audit_report", но не "содержит ли input-1 реальный контент, а не metadata".

## Инцидент

`routing-runner.ts` при follow-up создавал `kind: "text"` attachments с `content: ""` и использовал `intent.requestedResult` (название шаблона "Content Lab: Post Drafter") как `baseValue`. Splitter получал название шаблона вместо trend digest и генерировал мусор.

## Корневая причина

Нет type-level различия между:
```typescript
// Все три — просто string
const templateName: string = "Content Lab: Post Drafter"
const userInput: string = "AI тренды марта: cursor agent, context engineering..."
const artifactContent: string = "## Trend 1: Cursor Agent Mode\n..."
```

## Решение: Branded Types для content boundaries

### Уровень 1: Branded string types (минимальный)

```typescript
// Branded type — структурно string, номинально отличается
type Brand<T, B extends string> = T & { readonly __brand: B }

type ContentString = Brand<string, "content">     // Реальный контент (user input, artifact, report)
type MetadataString = Brand<string, "metadata">    // Metadata (names, labels, IDs)
type DisplayString = Brand<string, "display">      // UI display text (descriptions, placeholders)

// Создатели — единственные точки конвертации
function asContent(s: string): ContentString { return s as ContentString }
function asMetadata(s: string): MetadataString { return s as MetadataString }

// Input assembler принимает только ContentString
function assembleInputWithAttachments(
  baseValue: ContentString,          // NOT string
  requestedResult: DisplayString,    // NOT ContentString
  attachments: InputAttachment[],
  ...
): Promise<ContentString>

// WorkflowInput хранит только ContentString
interface WorkflowInput {
  type: "text"
  value: ContentString               // NOT string
}
```

Теперь `intent.requestedResult` (MetadataString) нельзя передать как `baseValue` (ContentString) без явного `asContent()`. Компилятор ловит.

### Уровень 2: Attachment contract enforcement

```typescript
// Attachment должен доказать что content загружен
type ResolvedAttachment = InputAttachment & { __resolved: true }

// assembler принимает ТОЛЬКО resolved attachments
function assembleInputWithAttachments(
  baseValue: ContentString,
  requestedResult: DisplayString,
  attachments: ResolvedAttachment[],  // MUST be resolved
  ...
): Promise<ContentString>

// Resolver — единственный путь создания resolved attachment
async function resolveAttachment(
  raw: InputAttachment,
  deps: InputAssemblerDeps,
): Promise<ResolvedAttachment> {
  if (raw.kind === "text" && raw.content === "") {
    throw new Error("Empty text attachment — content not loaded from source")
  }
  // ... load file/run content
  return { ...raw, __resolved: true } as ResolvedAttachment
}
```

### Уровень 3: Runtime validation на границах

```typescript
// В input-assembler.ts — runtime guard
function assertContentNotMetadata(value: string, context: string): void {
  const METADATA_PATTERNS = [
    /^[A-Z][a-z]+(\s[A-Z][a-z]+)*:\s/,  // "Content Lab: Post Drafter"
    /^[a-z-]+$/,                           // "content-lab-post-drafter"
  ]
  for (const pattern of METADATA_PATTERNS) {
    if (pattern.test(value.trim()) && value.length < 100) {
      console.warn(
        `[data-flow] Suspicious metadata-like content in ${context}: "${value.slice(0, 50)}"`
      )
    }
  }
}
```

## Приоритеты

| Уровень | Effort | Coverage | Когда |
|---------|--------|----------|-------|
| **Runtime warning** (Level 3) | 1 день | Ловит в dev | Сейчас |
| **Branded types** (Level 1) | 3 дня | Compile-time | Следующий спринт |
| **Resolved attachments** (Level 2) | 2 дня | Attachment pipeline | После Level 1 |

## Audit results (2026-03-29)

20 data flow points проверены:

| Статус | Кол-во | Детали |
|--------|--------|--------|
| SAFE | 15 | Artifact → file/run attachments, seed generation, atom isolation |
| FIXED | 1 | routing-runner.ts: matched artifacts → run attachments, baseValue cleared |
| MEDIUM RISK | 4 | seed.primaryInputValue fallback (2), entry state persistence (2) |
| HIGH RISK | 0 | После фикса |

## Чеклист для каждого нового data handoff

Перед добавлением кода, который передаёт строку между контекстами:

- [ ] **Откуда эта строка?** user input / artifact content / template metadata / UI label?
- [ ] **Куда она идёт?** input node / attachment / display / log?
- [ ] **Может ли metadata попасть в content path?** Есть ли fallback на `.name` или `.title`?
- [ ] **Есть ли empty fallback?** `content: ""` или `|| intent.requestedResult`?
- [ ] **Attachment kind корректен?** `"run"` для workspace-based, `"file"` для file-based, `"text"` только для inline user content?
