# monitor

A Claude Code mod that shows where your session is in the agent-skills workflow (Define → Plan → Build → Verify → Review → Ship), and what the session has done. It only watches: it never changes, blocks or delays anything the session does.

```
✓ Define ─ ✓ Plan ─ ● Build 3/7 ─ ○ Verify ─ ○ Review ─ ○ Ship

BUILD
started by /build · 4 min ago

Tasks · 3 of 7 done
  ✓ Task 1: Live event check
  ✓ Task 2: Mod skeleton
  ✓ Task 3: Phase and activity
  ▸ Task 4: Done marks from files
  ○ Task 5: Files and commits
  ○ Task 6: Checks
  ○ Task 7: Session tasks

Recent
  ✓ npm test                      just now
  edited hooks/phases.ts          2 min ago

5 files changed · 1 commit · 2 checks, 1 failed · 2/4 tasks
```

## What it shows

- **Stepper:** ● the current step, ✓ a step that's done or that the session has been through, ○ a step not reached yet. ✓ also comes from your files: Define when a spec exists (`SPEC.md`, a root `SPEC-*.md`, `docs/SPEC.md` or a file under `spec/`), Plan when `tasks/plan.md` exists, and Build once every box in `tasks/todo.md` is checked. Build shows that file's count.
- **The current step**, large and in your theme's accent color, with what started it. It is set by the most recent agent-skills command (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`…), or by an agent-skills skill in a turn that didn't start with a command. Because it's a guess, the panel always says what started it.
- **Build's tasks:** while Build is the current step, `tasks/todo.md`'s tasks: ✓ done, ▸ the first open one (next up), ○ the rest. A task is a checkbox line starting with `Task`, or every checkbox line when none does. Without a `tasks/todo.md`, the session's own task list.
- **Recent:** the newest 4 workflow events. These are agent-skills commands and skills, files created or edited, commits, and checks with ✓ or ✗. Checks are test, lint and validate commands: `npm test`, `tsc`, `eslint`, `jest`, `vitest`, `pytest`, `go test`, `cargo test`, `claude plugin validate|test`, and this repo's `run-evals`, `validate-*` and hook tests.
- **Totals:** files changed, commits, checks (with failures), and the session's own tasks.

Commands and skills outside the workflow (`/model`, `/monitor`, other plugins' skills) aren't shown. Times are relative (`just now`, `4 min ago`) and stay current. Each list keeps its newest 200 entries.

## Look back

Press a step in the stepper to see what happened while it was the current step: the files created or edited, and its commands, skills, commits and checks. **Back**, or pressing the step again, returns to the current step. On the phone, `/monitor plan` (or any step's name) gives the same view as text.

## Where it shows

- **Claude Code on your own machine** (the terminal, or a local session in the desktop app's Code tab) draws it as a pane beside the chat.
- **Where no screen shows panes** (the mobile app, or the desktop app viewing a cloud session), `/monitor` replies with the same panel as text, and `/monitor <step>` with that step's look-back view. Run it again to refresh.

The pane opens on its own once per session: at session start in a project with a spec or a `tasks/` folder, otherwise on the first agent-skills command or skill. After that, `/monitor` opens it.

## Install

At the prompt of a terminal session:

```
/plugin install monitor --marketplace monraza/agent-skills
```

From a shell:

```
claude plugin install monitor --marketplace monraza/agent-skills
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `monraza/agent-skills`, then **Add plugin**.

The marketplace is read from the repository's default branch, so the mod installs once it is merged there.

## Try it from a clone

```
claude --plugin-dir ./mods/monitor
```

## Limits

- **Pipes:** a check piped into another command (`npm test | tail`) shows the last command's exit status, as the shell reports it.
- **Background checks:** a check still running in the background isn't listed.
- **Quiet commits:** `git commit -q` prints nothing, so Claude Code reports no commit and it isn't listed.
- **Fresh loads:** if the mod is loaded afresh mid-session (re-enabled, or Claude Code's worker restarts), the session's activity, files, commits and checks start empty. Counts read from files come back. Ordinary reloads keep everything.
- **What it reads:** only `SPEC*.md`, `docs/SPEC.md`, `spec/`, `tasks/plan.md` and `tasks/todo.md`, for flags and counts. It writes no files and makes no network requests.

## Develop

```
claude plugin validate mods/monitor
tsc -p mods/monitor            # after Claude Code has loaded the mod once and written .claude-plugin/types/
claude plugin test mods/monitor
```

The tests build their events from `hooks/fixtures/live-events.ts`, which was recorded from a real session. The spec is `SPEC.md` at the repository root.

Tested with Claude Code 2.1.326. The mod API is early access and can change between releases.
