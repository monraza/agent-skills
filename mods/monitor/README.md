# monitor

A Claude Code mod that shows where your session is in the agent-skills workflow (Define → Plan → Build → Verify → Review → Ship), and what the session has done. It only watches: it never changes, blocks or delays anything the session does.

```
Workflow
✓ Define  ✓ Plan  ◉ Build 3/7  · Verify  ○ Review  ○ Ship
Build · since /build, 4 min ago

Tasks      todo.md 3/7 done · session 2/4 done
Activity   /build · Build · 4 min ago
Files (5)  SPEC.md, src/rate-limiter.ts, …
Commits    a1b2c3d feat(api): add the rate limiter
Checks     ✓ npm test · just now   ✗ tsc · 3 min ago
```

## What it shows

- **Phases.** The active phase (◉) is set by the most recent agent-skills command (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`…), or by an agent-skills skill in a turn that didn't start with a command. The line below the phases says what set it and when, because it's a guess. Phases you've been through show `·`.
- **Done marks from your files.** ✓ Define when a spec exists (`SPEC.md`, a root `SPEC-*.md`, `docs/SPEC.md` or a file under `spec/`). ✓ Plan when `tasks/plan.md` exists. Build shows the checked boxes in `tasks/todo.md`.
- **Tasks:** the `tasks/todo.md` count and the session's own task list.
- **Activity:** every command and skill the session used, newest first.
- **Files** changed by Edit, Write or NotebookEdit, each listed once.
- **Commits:** short hash and subject of each successful `git commit`.
- **Checks:** test, lint and validate commands (`npm test`, `tsc`, `eslint`, `jest`, `vitest`, `pytest`, `go test`, `cargo test`, `claude plugin validate|test`, and this repo's `run-evals`, `validate-*` and hook tests), with ✓ or ✗.

Times are relative (`just now`, `4 min ago`) and stay current. Each list keeps its newest 200 entries.

## Where it shows

- **Claude Code on your own machine** (the terminal, or a local session in the desktop app's Code tab) draws it as a pane beside the chat.
- **Where no screen shows panes** (the mobile app, or the desktop app viewing a cloud session), `/monitor` replies with the same panel as text. Run it again to refresh.

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
