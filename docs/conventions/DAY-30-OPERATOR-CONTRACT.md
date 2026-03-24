# DAY-30-OPERATOR-CONTRACT.md

> **Reference document.** Key principles (keyboard-first, status-at-glance, run-until-next-decision) already in [CANON.md](./CANON.md) §3. This file provides the full daily-driver vision.

Рабочий документ о том, как c8c должен ощущаться не на первом демо, а на `day 30` ежедневного использования.
Он задаёт daily-driver contract, через который нужно проверять execution plans, walkthroughs и app shell.

Основные источники:
- [docs/REFERENCES.md](./REFERENCES.md)
- [docs/R1-EXECUTION-PLAN.md](./R1-EXECUTION-PLAN.md)
- [docs/releases/R2-EXECUTION-PLAN.md](../releases/R2-EXECUTION-PLAN.md)
- [docs/plans/R1-UX-WALKTHROUGHS.md](./plans/R1-UX-WALKTHROUGHS.md)
- [docs/UX-SCENARIOS.md](./UX-SCENARIOS.md)

---

## 1. Зачем нужен этот документ

У c8c уже есть сильный first-run narrative:

- guided path
- stage shell
- dominant artifact
- continuation

Но desktop product для advanced users нельзя проектировать только под первый успешный прогон.

Нужно отдельно зафиксировать, как продукт должен работать, когда пользователь:

- запускает процессы каждый день
- ведёт несколько процессов параллельно
- больше не хочет перечитывать объяснения
- ожидает скорость, клавиатуру и status-at-a-glance

Коротко:

> `R1` и `R2` должны быть понятны на первом запуске, но удобны на тридцатом.

---

## 2. Пять принципов day-30 продукта

### 2.1 Run until next decision

Один явный запуск должен продвигать процесс до следующего человеческого решения.

Это значит:

- система не должна требовать вручную перезапускать каждую deterministic stage
- loops and continuations могут идти автоматически, пока не нужен новый judgment
- остановка нужна на:
  - approval gate
  - blocked state
  - ambiguous outcome
  - explicit user pause

Это не значит:

- "запусти всё до конца без контроля"
- скрывай stages and gates
- убирай process legibility ради магии

Правильная формула:

> Не `run everything`.  
> А `run until next decision`.

### 2.2 Keyboard-first

Если действие повторяется каждый день, у него должен быть keyboard path.

Минимум:

- primary action на активной поверхности должен иметь shortcut
- keyboard path не должен быть хуже mouse path
- user не должен кликать через весь flow только потому, что продукт не определил command rhythm

Baseline shortcuts:

- `Cmd+Enter` = primary action on focused process surface
  - `Run`
  - `Continue`
  - `Approve`
- `Esc` = close detail / dialog / secondary inspect surface

Expanded shell shortcuts for later layers:

- `Cmd+K` = command palette
- `Cmd+N` = new process
- `Cmd+1..5` = quick switch between visible processes

### 2.3 Status at a glance

Пользователь должен понимать состояние процесса за секунды.

На уровне surface это значит:

- current stage
- compact outcome token
- next decision
- pending approval / blocked state

На уровне app shell это значит:

- список активных процессов с текущей stage и status token
- без необходимости открывать каждый процесс по очереди

### 2.4 Progressive disclosure by familiarity

Первый запуск и тридцатый не должны выглядеть одинаково.

Принцип:

- first run может быть немного более explanatory
- repeat run должен быть более compact
- recurring operator не должен перечитывать один и тот же helper copy

Практически:

- explanation collapses after first understanding
- loop history and policy detail stay inspectable, но не всегда expanded
- system uses badges, counters and labels before prose paragraphs

### 2.5 Inline over click-through

Если пользователь уже находится в рабочем контексте, продукт должен решать задачу inline.

Это значит:

- dominant artifact preview сначала visible inline, потом full inspect
- next action visible рядом с artifact
- capability attach possible from current process or stage when relevant

Это не значит:

- убрать отдельные pages entirely

Но значит:

- browser/catalog pages secondary
- click-through только когда реально нужен deeper inspect or broader browse

### 2.6 Words are scaffolding, not the product

`JTBD`, walkthroughs и explanatory copy полезны, потому что они заставляют нас честно назвать:

- какую работу пользователь пытается закрыть
- зачем существует конкретный stage or gate
- какое следующее решение ожидается

Но это не означает, что shipped interface должен жить как текстовый нарратив.

Правильная роль слов:

- помочь нам выбрать правильные product objects
- назвать states, actions and outcomes
- временно поддержать новую mental model, пока surface ещё не достаточно читается визуально

Неправильная роль слов:

- заменять layout, hierarchy and controls
- объяснять то, что уже должно быть понятно через badges, counters, rows, buttons and stage state
- превращать daily-driver surface в лендинг, walkthrough или длинный onboarding paragraph

Правильная формула:

> Сначала words help explain the work.  
> Потом interface должен позволять делать эту работу почти без объяснения.

---

## 3. Что этот контракт значит для R1

`R1` не обязан быть full daily-driver shell.

Но он обязан заложить baseline, без которого `R2` будет строиться на demo-only UX.

### 3.1 R1 baseline

`R1` должен дать:

- compact guided entry вместо text-heavy launch cards
- stage shell as control header, not onboarding screen
- dominant artifact with inline preview
- `run until next decision` на canonical path там, где downstream behavior deterministic
- minimal keyboard baseline on active process surfaces:
  - `Cmd+Enter` for run / continue / approve
  - `Esc` for closing secondary detail

### 3.2 Что R1 ещё не обязан дать

`R1` не обязан:

- решать multi-process status at a glance
- строить full command palette shell
- помнить user-specific disclosure preferences everywhere
- делать full app-wide keyboard matrix

### 3.3 Главная проверка для R1

После первого успешного прогона пользователь не должен думать:

- "теперь мне придётся пять раз нажимать Run на каждый feature flow"
- "без мыши это невозможно"
- "каждый раз надо открывать артефакт в отдельном экране"

---

## 4. Что этот контракт значит для R2

`R2` должен превратить baseline в настоящий daily-driver shell.

### 4.1 R2 expansion

`R2` должен дать:

- multi-process status rail / sidebar with active stage and compact status tokens
- keyboard-first shell:
  - `Cmd+Enter`
  - `Cmd+K`
  - `Cmd+N`
  - quick process switching for visible slots
- remembered or default compact disclosure on repeat work
- gate and loop state encoded as badges / counters / concise operator rows
- inline capability attach from current process or stage

### 4.2 Что нельзя делать в R2

Нельзя:

- строить process map как красивую демонстрационную схему без operator value
- держать policy detail always expanded
- заставлять capability attach проходить через длинный browse ritual, если user already knows current stage context
- проектировать multi-process work так, будто пользователь ведёт только один процесс за раз
- считать, что JTBD-derived copy itself already solves UX, если interface всё ещё требует читать длинные объяснения вместо чтения state through elements

### 4.3 Главная проверка для R2

Day-30 operator должен уметь:

1. увидеть 3+ процесса и их состояние за один взгляд
2. продолжить или одобрить активный процесс с клавиатуры
3. быстро переключиться в другой процесс
4. attach'ить нужную capability без ухода в expert-only browse flow

---

## 5. Вопросы, которые нужно задавать каждому новому UX-решению

1. Помогает ли это действовать на тридцатом прогоне, а не только понять продукт на первом?
2. Это сокращает путь до следующего решения или добавляет ещё один explain-and-click step?
3. Это читает state через tokens, counters, labels and actions, или только через copy?
4. Это доступно inline из текущего контекста, или почему-то требует перехода в отдельный browse surface?
5. Есть ли keyboard path для этого на frequent-user route?

Если хотя бы на два вопроса ответ отрицательный, решение, скорее всего, слишком demo-oriented.
