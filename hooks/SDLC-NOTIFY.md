# sdlc-notify hook

Pages a human when an autonomous [`/sdlc`](../.claude/commands/sdlc.md) run needs one — a blocking escalation, a plan waiting for approval, batched questions, or the harness itself sitting on a permission prompt.

Without it, an unattended run that hits a decision just stops and waits in a terminal nobody is looking at. The escalation policy decides *when* to ask; this hook decides *whether you find out*.

## Setup

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      { "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PROJECT_DIR}/hooks/sdlc-notify.sh\"" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PROJECT_DIR}/hooks/sdlc-notify.sh\"" }] }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PROJECT_DIR}/hooks/sdlc-notify.sh\"" }]
      }
    ]
  }
}
```

Then pick a channel (none required — it falls back to a terminal bell):

```bash
export SDLC_NOTIFY_WEBHOOK="https://hooks.slack.com/services/..."   # Slack-shaped {"text": ...}
```

## What each event catches

| Event | Fires when | Why it's here |
|-------|-----------|---------------|
| `Notification` | The harness needs permission, or the session has idled waiting for input | The one signal that means "waiting on you" regardless of what the run thinks |
| `PostToolUse Write\|Edit` | `tasks/sdlc-state.md` is written | Catches an escalation the moment it's recorded — mid-run, before the agent stops |
| `Stop` | The agent's turn ends | Classifies *why* it stopped: blocked, at the gate, finished, or paused |

Three events rather than one because they fail differently. A run can block without stopping (records the escalation, keeps working on independent tasks), and it can stop without blocking (finished a phase, ran out of turns).

## What it reports

The hook classifies the run from `tasks/sdlc-state.md` and sends the highest-priority state it finds:

| Kind | Triggered by | Level |
|------|--------------|-------|
| `BLOCKED` | An `- [open]` line under `## Escalations` | blocking |
| `APPROVAL` | `Approved at gate: pending` | blocking |
| `INPUT` | A `Notification` event from the harness | blocking |
| `QUESTIONS` | Non-empty `## Open questions` when the run stops | review |
| `DONE` | `Phase: DONE` | review |
| `PAUSED` | Stopped mid-phase with nothing pending | all |

`BLOCKED` outranks everything else — a run with an open escalation and a finished phase is blocked, not finished.

## Configuration

| Variable | Default | Effect |
|----------|---------|--------|
| `SDLC_NOTIFY_LEVEL` | `review` | `blocking` (only decisions), `review` (adds questions and completion), `all` (adds every phase stop) |
| `SDLC_NOTIFY_CMD` | — | Arbitrary command. Body on stdin; `SDLC_KIND`, `SDLC_TITLE`, `SDLC_DETAIL` in the environment. Highest precedence |
| `SDLC_NOTIFY_WEBHOOK` | — | POSTs `{"text": "..."}` — works with Slack incoming webhooks |
| `SDLC_STATE_FILE` | `tasks/sdlc-state.md` | Where the run records its state |
| `SDLC_NOTIFY_LOG` | `.claude/sdlc-notify.log` | Append-only delivery log, written on every notification |
| `SDLC_NOTIFY_DEDUPE` | `.claude/.sdlc-notify-state` | Last-sent signature |

Delivery tries channels in order and stops at the first that succeeds: `SDLC_NOTIFY_CMD` → `SDLC_NOTIFY_WEBHOOK` → desktop notifier (`osascript` on macOS, `notify-send` on Linux) → terminal bell. The log and the bell always happen, so a misconfigured webhook can't swallow an alert silently.

Examples:

```bash
# Phone, via ntfy.sh
export SDLC_NOTIFY_CMD='curl -s -d "$SDLC_TITLE: $SDLC_DETAIL" ntfy.sh/my-sdlc-runs'

# Only wake me for real decisions
export SDLC_NOTIFY_LEVEL=blocking
```

## Silence is the feature

Two behaviors keep it from becoming noise you learn to ignore:

- **No state file, no notification.** The hook is inert in ordinary sessions — it only speaks during an `/sdlc` run.
- **Deduped by content.** `Stop` fires on every turn; the same escalation notifies once. A *different* escalation, or a changed phase, breaks the dedupe and notifies again.

## Guarantees

The hook never blocks a tool call and never fails a run. Every path exits 0 — malformed input, missing state file, dead webhook, missing `jq`. It parses hook JSON with `jq` when present and falls back to `sed`, because losing an alert to a missing dependency defeats the point.

## Tests

```bash
bash hooks/sdlc-notify-test.sh
```

20 checks covering classification, precedence, level filtering, dedupe, and robustness against malformed input. Delivery is captured through `SDLC_NOTIFY_CMD`, so the tests never send anything anywhere.

## Requirements

Bash 3.2+. `jq` and `curl` are used when present, neither is required.

## Related

- [`/sdlc` command](../.claude/commands/sdlc.md) — the loop and its escalation policy
- [docs/autonomous-sdlc.md](../docs/autonomous-sdlc.md) — running the loop unattended
- [docs/examples/celestial-events-walkthrough.md](../docs/examples/celestial-events-walkthrough.md) — a run that hits three escalations
