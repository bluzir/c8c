---
name: c8c-workflow-runner
description: Execute quality-gated multi-step workflows with evaluator checks, approval gates, and typed results. Orchestrates Claude Code and Codex CLI skills into reproducible flows with auto-retry on failure.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: [node]
    emoji: "⚡"
    homepage: https://github.com/anthropics/c8c
---

# c8c Workflow Runner

Use this skill when you want OpenClaw to execute a deterministic workflow
instead of improvising the entire task in a single agent session.

## When to use it

Use the packaged CLI compatibility path when:

- the task already exists as a workflow file
- the task needs deterministic branching, evaluators, or retry behavior
- the task may suspend for approval and resume later

Do not use it when:

- the task is a one-off chat answer
- no workflow file exists yet
- you need arbitrary shell piping instead of a workflow graph

## Setup checklist

1. Install: `npm install -g @c8c-ai/cli`
2. Verify: `lobster --help` (the `lobster` binary is registered globally after install)
3. Keep workflow files in a stable project path.
4. Use absolute paths for workflow files when calling from OpenClaw.

## Invocation pattern

```bash
lobster run --mode tool /abs/path/workflow.yaml --args-json '{"input":"...","inputType":"text","projectPath":"/abs/path/project","provider":"claude"}'
```

If the result returns `needs_approval`, resume with:

```bash
lobster resume --token '<resume-token>' --approve yes
lobster resume --token '<resume-token>' --approve no
```

## Local operator fallback

If the checkpoint should be resolved outside OpenClaw, use:

```bash
c8c-workflow hil list --project /abs/path/project
c8c-workflow hil show --task '<task-token>'
c8c-workflow hil approve --task '<task-token>'
```

## Failure modes

- `ok: false`: treat as a runtime or contract error
- `status: "cancelled"`: the approval was explicitly rejected
- `status: "needs_approval"`: the workflow is safe to resume later; do not restart it from scratch
