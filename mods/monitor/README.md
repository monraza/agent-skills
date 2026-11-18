# monitor

A Claude Code mod that shows where your session is in the agent-skills workflow (Define → Plan → Build → Verify → Review → Ship), and what the session has done. It only watches: it never changes, blocks or delays anything the session does.

```
✓ Define ─ ✓ Plan ─ ● Build 3/7 ─ ○ Verify ─ ○ Review ─ ○ Ship

BUILD
started by /build · 25 min ago

Tasks · 3 of 7 done
▸ Completed · 3
▾ In progress · 1
    ● 4. Done marks from files
▾ To do · 3
    ○ 5. Files and commits
    ○ 6. Checks
    ○ 7. Session tasks

Files changed · 2
  edited hooks/phases.ts                   2 min ago
  created hooks/phases.test.ts             9 min ago

Commits · 1
  2fffc88 feat(monitor): phases            5 min ago

Checks · 2, 1 failing
  ✗ tsc                                    just now
  ✓ claude plugin test                     3 min ago
```

## What it shows

- **Stepper,** pinned at the top with the step's name, while everything below scrolls:
  - ● is the current step, ✓ a step that's done or that the session has been through, and ○ a step not reached yet.
  - ✓ also comes from your files:
    - Define, when a spec exists (`SPEC.md`, a root `SPEC-*.md`, `docs/SPEC.md` or a file under `spec/`)
    - Plan, when `tasks/plan.md` exists
    - Build, once every task in `tasks/todo.md` is done. Build shows that file's count.
- **The step's name,** large, with what started it. The current step is the one set by the most recent agent-skills command (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`…), or by an agent-skills skill in a turn that didn't start with a command. Because it's a guess, the panel always says what started it.
- **Build's tasks,** in three groups, in this order: Completed, In progress and To do.
  - **Folding:** press a group's name to fold or unfold it. Completed starts folded.
  - **Numbers:** each task shows its number, from its `Task N:` title.
  - **In progress:** a task with some of its boxes checked, or else the first open one.
  - **Where tasks come from** (`tasks/todo.md`), in this order of preference:
    - checkbox lines starting with `Task`
    - the planning skill's `## Task N:` headings, one task each, done when every box under it is checked
    - every checkbox line
  - **Without a `tasks/todo.md`,** the session's own task list.
- **Files changed:** each file created or edited during the step, once.
- **Commits:** the commits made during the step.
- **Checks:** each check once, with its latest ✓ or ✗; the title counts the failing ones. Checks are test, lint and validate commands:
  - `npm test`, `tsc`, `eslint`, `jest`, `vitest`, `pytest`, `go test`, `cargo test`
  - `claude plugin validate|test`
  - this repo's `run-evals`, `validate-*` and hook tests

Each file, commit and check belongs to the step that was current when it happened. Commands and skills aren't listed, since the header already names the one that started the step. Times are relative (`just now`, `4 min ago`) and stay current. Each list keeps its newest 200 entries.

## Other steps

Press ✓ Define, ✓ Plan or any started step to see the same view for it. The view shows that step's files, commits and checks, and for Build, its tasks. **Back to Build** (named after the current step) returns, and so does pressing the current step. A step not reached yet isn't a button. On the phone, `/monitor plan` (or any step's name) gives the same view as text.

## Where it shows

- **Claude Code on your own machine** (the terminal, or a local session in the desktop app's Code tab) draws it as a pane beside the chat.
- **Where no screen shows panes** (the mobile app, or the desktop app viewing a cloud session), `/monitor` replies with the same panel as text, every task group unfolded, and `/monitor <step>` with that step's view. Run it again to refresh.

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
