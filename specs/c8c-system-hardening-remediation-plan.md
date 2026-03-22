# c8c System Hardening Remediation Plan

Status: Active v2.0 — core remediation implemented, medium backlog integrated
Updated: 2026-03-22
Source inputs:
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/mapper-1.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__graph-engine.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__workflow-runner.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__workflow-orchestration.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__executor-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__c8c-api-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__run-artifacts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__cases.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__chat.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__chat-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__mcp-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/content-auditor-1__process-model.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/content-auditor-1__projects-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/content-auditor-1__libraries-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/content-auditor-1__skills-2.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__skills-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__check-canon-vocabulary-mjs.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__workflow-config-validation-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__workflow-execution-validation-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__run-recovery.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__run-snapshot-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__persistence.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__global-workflows.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__system-ts.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__monorepo-packages.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__utilities.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__run-electron-smoke-mjs.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__state.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__cost-warnings.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__distribution.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__electron-builder.md`
- `.c8c/runs/run-1-1774146922471-OGVEIF/outputs/auditor-1__claude-runner.md`

## Purpose

This document turns the repo-wide audit output into one execution plan the team can actually ship against.

The goal is not to fix every finding from the audit in one wave. The goal is to remove the highest-risk structural weaknesses first:

1. duplicated execution paths,
2. weak security and contract enforcement at privileged boundaries,
3. incomplete persistence, registry, and recovery guarantees,
4. expensive or stale chat, MCP, skills, and library hot paths,
5. weak release, package, and governance gates.

## Core Synthesis

The audit points to six systemic failures.

### 1. Safety-critical logic is duplicated across multiple "authoritative" paths

- workflow execution exists both in Electron main-process code and in `@c8c/workflow-runner`
- legacy `chain-runner.ts` still coexists with the DAG-based path
- path assertion, store helpers, MCP normalization, subprocess logic, and logging helpers are reimplemented in multiple places

This creates drift. The same workflow can pass one path, fail another, recover differently, or emit different metadata depending on which codepath was hit.

### 2. Security and type safety are overstated at the privileged boundaries where runtime guarantees matter

- preload uses repeated `as Promise<T>` assertions instead of a typed IPC wrapper
- several IPC entry points accept unvalidated workflow payloads or tool mutations
- Electron process boundaries still rely on implicit defaults instead of explicit sandbox, sender-frame, and production CSP guarantees
- chat and runtime subsystems use structural assumptions that are not enforced before side effects

The result is false confidence: TypeScript looks strict, but malformed or stale runtime data can still cross the boundary and fail late, while privileged Electron surfaces remain broader than they should be.

### 3. Persistence exists, but operational discipline is incomplete

- run workspaces and case state accumulate without retention
- artifact and case readers do not validate consistently
- some writes are atomic, but related cross-store updates are not
- resume/log persistence has correctness gaps
- live snapshot and event-log writes can still race or grow without bound

The system already saves a lot, but it does not yet fully guarantee that saved state is bounded, internally consistent, and recoverable.

### 4. Chat, MCP, and extensibility surfaces are limited by avoidable hot-path work, stale caches, and permissive local assumptions

- skill scans run too often
- MCP config is prepared repeatedly inside loops
- tool discovery caching exists but is not wired into production
- session lifecycle ownership is split across multiple maps and modules
- skill frontmatter restrictions are parsed inconsistently
- skill and library file operations are not always constrained at the narrowest root
- renderer execution-state and local-storage surfaces still have unbounded records and split-brain write paths

This is less about architecture invention and more about finishing the architecture that already exists.

### 5. Registry, format, and recovery surfaces are more fragile than they look

- project selection, global workflow storage, and library/workflow registries have weak runtime guards and limited tests
- dual workflow formats still coexist with unsafe edge cases at the YAML migration boundary
- crash recovery and PID cleanup work, but still rely on duplicated modules and fragile process identification

These systems are foundational and user-facing. When they drift, they break trust more than an isolated feature regression does.

### 6. Quality gates and package boundaries are not yet strong enough to protect the product

- critical subsystems still have weak or zero test coverage
- the canon checker misses real violations and also carries false positives
- release packaging can proceed without strong test gates
- distribution hardening is incomplete
- workspace packages present themselves as reusable boundaries while still depending on monorepo-only internals
- smoke verification can still report green without proving anything meaningful

The repo has standards, but the enforcement layer is not yet trustworthy enough to be a release gate.

## Goals

1. Establish one canonical execution path for workflow runs and recovery.
2. Enforce runtime validation on every high-risk IPC and mutation boundary.
3. Make run persistence bounded, versioned, and internally consistent.
4. Harden Electron, IPC, and privileged file-operation boundaries explicitly rather than by convention.
5. Remove avoidable repeated work from chat, MCP, skills, and library hot paths.
6. Strengthen release, copy, package, and regression gates so they catch issues before users do.

## Non-Goals

This plan does not attempt to solve everything surfaced by the audit.

Out of scope for this wave:
- broad UX redesigns outside hardening needs
- full design-system modernization or Storybook rollout
- large content/template catalog work
- x64/universal packaging expansion unless needed by release hardening
- speculative architecture cleanup that does not remove a current correctness, security, or release risk

## Priority Rules

1. Remove duplicated safety-critical paths before polishing local abstractions.
2. Runtime correctness beats convenience features.
3. IPC handlers must validate and sanitize before any filesystem or subprocess side effect.
4. A cache without invalidation is a correctness bug, not an optimization.
5. Exported library and registry functions must be safe even if a future caller skips today's IPC guard.
6. New tests, docs, and gates must target the canonical path only.
7. A release check that can go green with zero assertions does not count as a gate.

## Workstream Summary

### WS-01 Runtime Convergence and Scheduler Correctness

Priority: P0

Key outcomes:
- one canonical DAG execution path for new runs
- no pool slot can hang forever without timeout or reject handling
- preflight validation and runtime scheduling share the same readiness rules
- resume, log persistence, and approval persistence no longer lose or desync critical state
- run-state and event-log persistence are serialized where parallel branches can otherwise clobber each other

Audit inputs:
- `graph-engine`
- `workflow-runner`
- `workflow-orchestration`
- `executor-ts`
- `run-snapshot-ts`
- `persistence`

### WS-02 IPC, Process Boundary, and Contract Hardening

Priority: P0

Key outcomes:
- Electron renderer security posture is explicit (`sandbox`, sender-frame guard, production CSP, release test-harness guard)
- one shared project-path assertion entry point
- one canonical symlink-safe root-containment utility is used wherever privileged paths are checked
- typed IPC invoke/subscribe wrappers instead of repeated manual casts
- discriminated start/result contracts where today null and undefined encode state
- workflow, chat, project, and system mutation payloads validated before execution

Audit inputs:
- `c8c-api-ts`
- `executor-ts`
- `chat`
- `chat-ts`
- `process-model`
- `projects-ts`
- `system-ts`
- `utilities`

### WS-03 Persistence, Recovery, Registry, and Retention Discipline

Priority: P0

Key outcomes:
- bounded retention for run workspaces and case state
- artifact and case readers enforce the same schema/version guarantees
- cross-store writes become explicit at the orchestration layer
- artifact addressing survives project moves and recovery reads
- global workflow and project registries do not crash or mutate unexpectedly on read paths
- recovery, manifest, and global-workflow persistence paths stop depending on duplicated or weakly validated modules
- event logs are capped and recovery/snapshot hydration stays correct under long-running or parallel runs

Audit inputs:
- `run-artifacts`
- `cases`
- `executor-ts`
- `workflow-runner`
- `run-recovery`
- `run-snapshot-ts`
- `persistence`
- `global-workflows`
- `projects-ts`

### WS-04 Chat, MCP, Skills, and Library Surface Hardening

Priority: P1

Key outcomes:
- chat turns stop repeating skill scans and MCP setup unnecessarily
- session lifecycle has one owner
- chat surfaces sanitized structured failures instead of raw errors
- MCP discovery cache is live, project-aware, and invalidated correctly
- MCP config mutations become visible immediately to downstream execution
- skill restrictions and frontmatter contracts are parsed consistently in all scanners
- skill and library file operations are constrained to intended roots, with path traversal and over-broad read surfaces removed
- library install/update behavior is explicit about trust and rollback expectations
- renderer execution-state and preflight-warning surfaces are bounded, provider-aware, and do not bypass their own source of truth

Audit inputs:
- `chat`
- `chat-ts`
- `mcp-ts`
- `skills-2`
- `skills-ts`
- `libraries-ts`
- `state`
- `cost-warnings`

### WS-05 Release, Package Boundary, and Governance Gates

Priority: P1

Key outcomes:
- release builds cannot ship without passing tests
- packaging and updater behavior match the expected trust model
- canon checking catches known violations without obvious false positives
- subprocess/runtime packages have documented and tested safety behavior
- workspace package boundaries have an explicit source-of-truth strategy for shared types, validators, and runner internals
- key registry/system IPC modules gain enough test coverage to act as real release gates
- smoke verification cannot pass with zero assertions or duplicate build ambiguity

Audit inputs:
- `check-canon-vocabulary-mjs`
- `electron-builder`
- `claude-runner`
- `distribution`
- `monorepo-packages`
- `system-ts`
- `run-electron-smoke-mjs`

## Status Snapshot

As of 2026-03-22, the stop-the-line hardening wave from this plan is implemented in code and verified with targeted tests plus a full production build.

Implemented now:
- WS-01: canonical execution-pool timeout/reject handling, serialized run-state/manifest/result/event-log persistence, bounded run workspace retention, bounded event-log writes, and runtime validation for evaluator `retryFrom`.
- WS-02: explicit Electron `sandbox`, sender-frame IPC guard, production CSP for packaged `file://` renderer, release test-harness build guard, fail-fast IPC registration, canonical registered-project assertions, executor/chat workflow payload parsing, canonical `system:get-project-status` root checks, stricter provider-settings / API-key validation, full generic typed invoke coverage across the preload bridge, and removal of the legacy step-based chain compatibility path from desktop workflow loading/saving.
- WS-03: run workspace retention sweep, event-log tail capping, ENOENT-safe persisted event reads, UTF-8-safe tail truncation, and continued recovery compatibility across persisted snapshots.
- WS-04: skill scan TTL caching, one-time MCP config preparation per chat turn, project-aware MCP tool cache wired into production, MCP config-cache invalidation after mutations, safer MCP IPC fallbacks, local toggle single-read mutation flow, Codex stdio add guard, normalized skill/library frontmatter parsing, markdown-only `skills:read-content`, library path hardening, renderer stale-response guard for MCP discovery, shared pricing source, and tested cost-warning controller behavior.
- WS-05: release packaging now requires canon + tests + build, smoke no longer passes with zero assertions, and key hardening modules now have regression coverage (`workflows`, `system`, `mcp`, `executor`, `security-paths`, `run-snapshot`, `useCostWarning`, `mcp-config`, `mcp-manager`).

Residual follow-up that remains intentionally outside this implementation wave:
- full convergence of duplicated runtime/graph modules into a single shared package
- shared fs / MCP normalization utility extraction across all remaining duplicate copies
- signing/notarization/x64 distribution posture and related CI release decisions
- chat session ownership simplification beyond the hot-path fixes already shipped

## Medium Addendum From `run-1-1774146922471-OGVEIF`

Medium findings now implemented from the audit corpus:
- `content-auditor-1__process-model.md`: production CSP for packaged `file://` renderer, non-silent handler registration, executor workflow payload validation, chat workflow payload validation, and `MAX_CONCURRENT_EXECUTIONS_PER_WINDOW`.
- `auditor-1__mcp-ts.md` and `auditor-1__mcp-config.md`: production wiring for MCP tool cache, project-aware cache keys, mutation-driven cache invalidation, `mcp:list-all-servers` fail-closed behavior, removal of the redundant pre-serial toggle read, and Codex stdio command validation.
- `auditor-1__run-snapshot-ts.md` and `auditor-1__run-artifacts.md`: ENOENT-safe persisted event-tail reads, UTF-8-safe tail truncation, bounded event-log retention, and serialized snapshot/event-log writes.
- `auditor-1__cost-warnings.md`: shared pricing source-of-truth, summarize-merger cost counting, Codex-provider warning suppression path, tested cost-warning concurrency/cancel flow, and renderer-side stale-response protection for MCP discovery.
- `auditor-1__skills.md`, `content-auditor-1__projects-ts.md`, `auditor-1__system-ts.md`, and `auditor-1__utilities.md`: canonical registered-project-path guard reused across IPC domains, skill scan caching in production paths, and canonical root checks in `system:get-project-status`.
- `auditor-1__tsc-noemit.md`: preload now uses one shared generic typed invoke helper across the full `window.api` and test-harness bridge, removing the remaining direct `ipcRenderer.invoke(...)` bridge calls and inline `as Promise<T>` assertions.
- legacy chain/runtime follow-up: `ChainDefinition`, `yamlToChain`, and `legacy-chain-runner` are removed from the desktop app path; YAML remains supported only as a graph-workflow format, not as the old `steps[]` chain format.

Medium findings intentionally left as follow-up backlog after this wave:
- replace `claude mcp get` stdout scraping with structured JSON output if the CLI supports it
- extract duplicated `exists` / `errorCode` / MCP normalization helpers that still remain outside the hardened hot paths
- converge duplicated workflow/runtime support modules into a shared package boundary rather than keeping synchronized copies
- settle distribution posture decisions that are product/release-governance questions rather than stop-the-line correctness bugs

## Iteration Plan

### Iteration 1: Stop-the-Line Runtime Safety

Target length: 3-4 days

Scope:
- add timeout or reject-path guarantees to the canonical execution pool
- align runtime readiness with validation rules used before execution
- fix high-risk resume/log/approval persistence bugs in the canonical runner
- add runtime validation at high-risk execution entry points
- make Electron boundary guarantees explicit on the highest-risk path (`sandbox`, sender-frame guard, release test-harness guard)
- serialize snapshot/event-log writes where concurrent branch completion can otherwise lose state
- add first critical-path tests for runner execution and chat-agent orchestration

Ship gate:
- no workflow run can occupy an execution slot indefinitely
- a workflow that passes preflight does not fail immediately because runtime rules disagree
- malformed workflow or chat payloads are rejected structurally before side effects
- privileged IPC calls are rejected when they do not come from the expected renderer frame
- a parallel run cannot silently drop persisted branch state because two snapshot writes raced
- critical runner and chat orchestration paths have executable regression coverage

### Iteration 2: Converge Duplicated Execution and Store Paths

Target length: 4-5 days

Scope:
- define the canonical run path and deprecate or wrap `chain-runner.ts`
- remove duplicated readiness/parsing/store helper logic on the main path
- move hidden cross-store side effects out of store modules and into orchestration
- unify artifact and case record validation
- introduce relative-path-first artifact resolution and retention policy hooks
- fix global workflow format edge cases and remove read-path directory creation or crash behavior in registries
- cap run workspace and event-log growth with an explicit retention/write policy

Ship gate:
- all new workflow runs enter through one canonical orchestration path
- recovery sees the same run model the executor writes
- store reads use one validation contract per record type
- retention policy is defined and implemented for run workspaces
- global workflow and project registry reads are side-effect free and format-safe
- long-running runs cannot grow `events.jsonl` without a defined ceiling or truncation strategy

### Iteration 3: Chat, MCP, and Extensibility Boundary Hardening

Target length: 3-4 days

Scope:
- cache skill scans per project with explicit invalidation rules
- prepare MCP config once per turn, not per tool-call iteration
- consolidate chat session ownership into one module
- stop blocking the IPC request for the full lifetime of an agent turn where practical
- wire MCP tools cache into production with project-aware keys and invalidation
- add error boundaries and stale-response protection to MCP fetch paths
- fix skills `allowed-tools` parsing, empty-frontmatter pollution, and overly broad `skills:read-content`
- add path guards and trust-policy handling to library install/remove flows
- bound renderer-side execution state growth and remove direct storage writes that bypass Jotai state
- make cost/preflight warning logic share one pricing source and respect provider differences

Ship gate:
- repeated turns in the same project do not re-scan the same skill tree unnecessarily
- MCP server mutations are reflected in the next discovery call
- chat cancellation does not leave stale active-session bookkeeping behind
- renderer receives sanitized errors and stable session lifecycle events
- skill restrictions and library operations are enforced consistently on the canonical scan/load path
- renderer execution and warning state no longer grows or drifts silently across long sessions

### Iteration 4: Release and Gate Integrity

Target length: 3-4 days

Scope:
- require passing test gates before release packaging
- harden packaging flow around signing, notarization, or explicit documented release posture
- fix canon checker path coverage, banned-term coverage, false-positive hotspots, and test coverage
- document and align subprocess safety behavior in `claude-runner`
- decide and enforce the source of truth for shared package types and duplicated runner support modules
- add regression coverage for key registry and system IPC surfaces (`workflows`, `projects`, `system`)
- make smoke verification assertive enough that a green run implies at least one real assertion per scenario

Ship gate:
- release job cannot package an untested commit
- copy governance checks catch the known live violations from the audit
- core subprocess safety behavior is documented and covered by tests
- release posture is explicit rather than accidental
- package boundaries are explicit enough that a shared-module fix is not required in two silent copies
- smoke CI cannot report success when a scenario exits cleanly but proves nothing

## Cross-Cutting Backlog That Must Follow the Canonical Path

These items should be done only after the relevant canonical workstream is in place:

- helper extraction for `errorCode`, `sanitizeFileSegment`, MCP normalization, and related store utilities
- namespace cleanup for IPC channels such as `run:*` vs `executor:*`
- payload-size guards on large workflow IPC messages
- structured logging consistency in chat and provider runtimes
- shared package extraction or re-export strategy for duplicated types, validators, and manifest helpers
- global workflow YAML-to-`.chain` migration strategy once format-safe loading is in place
- pricing/cost estimation source-of-truth extraction shared between preflight and runtime metrics
- removal of dead or stale modules that become obsolete after convergence

## Deferred Backlog

The audit surfaced worthwhile work that should stay out of this plan unless it becomes blocking:

- Storybook or Chromatic rollout for the full design system
- large-scale renderer token enforcement beyond the minimum canon/design guardrails
- Intel Mac distribution expansion
- deep UI component documentation coverage
- non-critical package flattening and directory reshaping

## Open Decisions

1. Do we fully remove `chain-runner.ts`, or keep it only as a compatibility adapter over the canonical DAG path?
2. Should run retention expose user-facing controls immediately, or ship first as a safe default policy plus manual purge command?
3. Is the direct tool-call bypass in chat acceptable for read-only tools only, or should it be removed entirely once Agent SDK tool use is stable?
4. Do we treat signing and notarization as part of this hardening wave, or explicitly document a temporary unsigned internal-distribution posture?
5. Are `@c8c/workflow-runner` and `@c8c-ai/cli` meant to be genuinely reusable packages, or should we treat them as monorepo-internal artifacts and simplify the boundary accordingly?
6. What supply-chain posture do we want for skill libraries and patched upstream dependencies: pinned commits, trusted-head with warning, or something stricter?

## Success Criteria

This plan is complete when the following statements are true:

1. There is one authoritative execution path for workflow runs, recovery, and runtime validation.
2. High-risk IPC, Electron-process, and mutation entry points reject malformed or untrusted input before any side effect occurs.
3. Run persistence, registries, and recovery data are bounded, version-checked, and recoverable after restart without silent data loss.
4. Chat, MCP, skills, and library paths no longer repeat expensive work, ignore declared restrictions, or serve stale configuration after mutations.
5. Release, package, and governance gates catch the known audit-class regressions before they reach users.
