# `@c8c-ai/cli`

Headless CLI for running c8c workflows without the desktop app.

## Install

```bash
npm install -g @c8c-ai/cli
```

Requirements:

1. Node.js 20+
2. Claude CLI and/or Codex CLI installed
3. Auth completed for the provider you plan to use

## Quickstart

Validate a workflow:

```bash
c8c-workflow validate ./workflow.yaml
```

Check provider readiness:

```bash
c8c-workflow doctor
```

Run a workflow:

```bash
c8c-workflow run ./workflow.yaml --input "Draft release notes"
```

Resume a paused run:

```bash
c8c-workflow resume /abs/path/to/project/.c8c/runs/<run-id>
```

Resolve a human-in-the-loop task:

```bash
c8c-workflow hil list --project /abs/path/to/project
c8c-workflow hil approve --task '<task-ref>'
```

Run the optional Telegram bridge for remote approvals:

```bash
export C8C_TELEGRAM_BOT_TOKEN=...
c8c-workflow hil telegram serve --config /abs/path/to/hil-telegram.json
```

## Commands

```bash
c8c-workflow run <workflow-path>
c8c-workflow resume <workspace>
c8c-workflow rerun-from <workspace> <nodeId>
c8c-workflow inspect <workspace>
c8c-workflow events <workspace>
c8c-workflow hil list
c8c-workflow hil show --task <task-ref>
c8c-workflow hil respond --task <task-ref> --data-json '{"field":"value"}'
c8c-workflow hil approve --task <task-ref>
c8c-workflow hil reject --task <task-ref>
c8c-workflow hil telegram serve --config /abs/path/to/hil-telegram.json
c8c-workflow validate <workflow-path>
c8c-workflow doctor
c8c-workflow --version
```

`resume` and `rerun-from` support legacy forms with an explicit workflow path, but the preferred v1 UX is workspace-first.

## JSON output

Use `--json` for structured summaries and `--jsonl` for streamed run events.

Tool mode for external orchestrators stays available:

```bash
c8c-workflow run --mode tool /abs/path/workflow.yaml --args-json '{"input":"draft","projectPath":"/abs/path/project"}'
```

## Telegram bridge

`hil telegram serve` is a local convenience adapter on top of the same durable HIL task store used by the desktop app and CLI. It does not become the source of truth.

Minimal config:

```json
{
  "botTokenEnv": "C8C_TELEGRAM_BOT_TOKEN",
  "chatId": "123456789",
  "allowedUserIds": ["123456789"],
  "pollIntervalSec": 10
}
```

Optional fields:

- `projectPaths`: explicit project roots to scan for `.c8c/runs`
- `statePath`: custom path for bridge polling state

Supported interactions:

- inline approve/reject buttons for approval tasks
- `/tasks`
- `/show <taskId>`
- `/approve <taskId>`
- `/reject <taskId>`
- `/respond <taskId> {"answers":{"field":"value"}}`

## OpenClaw compatibility

The package also ships a compatibility wrapper at:

```bash
/abs/path/to/node_modules/@c8c-ai/cli/dist/lobster
```

Use that path only when an external integration explicitly expects a file named `lobster`.

## Troubleshooting

1. `c8c-workflow doctor --json` shows provider availability and auth state.
2. `c8c-workflow validate` catches structural workflow issues before a run starts.
3. If `resume` fails on an older workspace, rerun it with the legacy form that includes the workflow path.
