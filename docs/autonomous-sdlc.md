# Autonomous SDLC

How to run the lifecycle commands as a loop that keeps going on its own and only interrupts you when a decision is genuinely yours.

There are two independent layers, and you need both:

| Layer | Question it answers | Where it lives |
|-------|---------------------|----------------|
| **Orchestration** | What runs next, and when do I stop to ask? | [`/sdlc`](../.claude/commands/sdlc.md) — the loop, its budgets, its escalation policy |
| **Autonomy** | Who approves the tool calls, and who re-invokes the run? | Your harness: permission modes, allow/deny rules, hooks, and a scheduler |

Skip the second layer and `/sdlc auto` still asks you to approve every file write. Skip the first and you have an agent with permissions but no stopping rules — which is the failure mode you actually want to avoid.

---

## Layer 1 — the loop

```
/sdlc auto add rate limiting to the public API
```

One human gate at the plan, then spec → plan → **approve** → build → verify → review → simplify → ship decision, with loop-back edges from review and ship into build. Progress is written to `tasks/sdlc-state.md` after every phase transition, so a run survives a lost session, a context compaction, or an interruption: re-invoke `/sdlc auto` and it resumes from the recorded phase.

The command's escalation policy is the important part — read it before trusting a run. In short:

- **Stops for**: irreversible or outward-facing actions (migrations, deploys, payments, auth, secrets, deletions, third-party writes), spec gaps that change what gets built, Critical/High security findings, being stuck after 2 fix attempts, scope expansion, and any situation where going green would require a prohibited move.
- **Decides alone**: lint/format/typecheck, missing tests, review suggestions inside its own diff, internal renames, docs, task ordering.
- **Never does**: skip or weaken a test, `--no-verify`, `git add -A`, force-push, disable type checks.

Budgets are what stop a runaway loop: 3 review cycles, 2 fix attempts per failure, 2 ship attempts. Hitting one is an escalation, not a retry.

---

## Layer 2 — running it without babysitting

### In an interactive session

Accept file edits automatically but keep prompts for everything else:

```
/permissions          # or start with: claude --permission-mode acceptEdits
/sdlc auto
```

`acceptEdits` is the right default for this loop. It auto-approves edits to files while still prompting on commands, which is where the irreversible things live. Reserve `--dangerously-skip-permissions` for a sandboxed container you are willing to throw away.

### Headless — one run, no terminal

```bash
claude -p "/sdlc auto implement the checkout retry logic" \
  --permission-mode acceptEdits \
  --max-turns 200 \
  --output-format stream-json
```

In headless mode there is nobody to answer an escalation, so the run stops when it hits one. That is the correct behavior — the state file records the question. Read `tasks/sdlc-state.md` when the process exits, answer, and re-invoke.

### On a schedule — the actual loop

Re-invoking is what makes it a loop. The run is resumable, so a scheduler is enough:

```bash
# sdlc-loop.sh — resume until the state file says the run is finished
while ! grep -q '^Phase: DONE' tasks/sdlc-state.md 2>/dev/null; do
  claude -p "/sdlc auto" --permission-mode acceptEdits --max-turns 200 || break
  if grep -q '\[open\]' tasks/sdlc-state.md; then
    echo "Escalation open — human needed. See tasks/sdlc-state.md" >&2
    break
  fi
done
```

Run it under `cron`, a CI job, or your harness's own scheduler. Claude Code on the web can also drive this with a scheduled trigger. Two rules regardless of scheduler: **run on a feature branch**, and **never give the loop deploy credentials** — the ship phase produces a decision, a human executes it.

### Guardrails worth adding

**Deny list over trust.** Put the irreversible commands behind a hard block in `.claude/settings.json` so an escalation trigger is not the only thing standing between the loop and production:

```json
{
  "permissions": {
    "allow": ["Bash(npm test:*)", "Bash(npm run build:*)", "Bash(git commit:*)", "Bash(git diff:*)"],
    "deny": ["Bash(git push --force:*)", "Bash(npm publish:*)", "Bash(*deploy*)", "Read(./.env)"]
  }
}
```

**A hook as the backstop.** Policy in a prompt is guidance; a `PreToolUse` hook is enforcement. Exit code 2 blocks the call and hands the reason back to the agent:

```bash
#!/usr/bin/env bash
# .claude/hooks/block-irreversible.sh
cmd=$(jq -r '.tool_input.command // ""')
case "$cmd" in
  *"migrate"*|*"deploy"*|*"push --force"*|*"DROP TABLE"*)
    echo "Blocked by policy: irreversible. Escalate to the user instead." >&2
    exit 2 ;;
esac
exit 0
```

**Notification on stop.** A `Stop` or `Notification` hook that pings you (Slack, `osascript`, `notify-send`) turns "check on it" into "get told" — the difference between a loop you supervise and one you hover over.

---

## Tuning how often it interrupts you

| Symptom | Change |
|---------|--------|
| Asks about things you don't care about | Move those cases into the command's *decide yourself* list, or state the decision in `SPEC.md` — most questions are spec gaps in disguise |
| Pushes through things you wanted to see | Add the case to *stop and ask*, and back it with a `deny` rule or a hook — a prompt alone is not a control |
| Spins on the same failure | Lower the fix-attempt budget from 2 to 1 |
| Runs out of context mid-loop | Smaller task slices in `/plan`; the state file is what carries the run across compactions |
| You want a checkpoint per phase, not per run | Use `/sdlc` (stepped) instead of `/sdlc auto` |

The escalation policy is a project artifact, not a fixed setting. Edit `.claude/commands/sdlc.md` (and mirror the change to `.gemini/commands/sdlc.toml` and `commands/sdlc.toml`) so the loop matches what your team actually wants to be asked about.

---

## What autonomy does not change

Every task still earns a failing test first, a passing test after, its own commit, and a review pass. `/sdlc auto` removes the human *between* phases — never the verification inside them. A loop that runs unattended and skips tests is not faster; it just moves the discovery of the bug to production.

## Related

- [`/sdlc` command](../.claude/commands/sdlc.md) — the loop and its escalation policy
- [`/build auto`](../.claude/commands/build.md) — the single-phase autonomous pass this loop builds on
- [doubt-driven-development](../skills/doubt-driven-development/SKILL.md) — when an agent should stop and ask
- [debugging-and-error-recovery](../skills/debugging-and-error-recovery/SKILL.md) — the fix-attempt loop
- [agents.md](agents.md) — how commands, personas, and skills compose
