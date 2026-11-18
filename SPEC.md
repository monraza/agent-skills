# Spec: Workflow Panel — V1

## Objective

A Claude Code panel that sits beside the chat and shows where the current session is in the agent-skills workflow (Define → Plan → Build → Verify → Review → Ship), plus a running record of what the session has done.

**User:** someone using the agent-skills commands and skills in Claude Code, in the terminal, desktop app, VS Code or the mobile app. Today they have to scroll the transcript to see which phase they're in, which tasks remain, what changed, and whether checks passed.

**What it is:** a Claude Code mod (a function-hooks plugin) named `monitor`. It lives in its own folder in this fork and is listed in the fork's marketplace file. It only watches and displays. It never changes, blocks or delays anything the session does.

Where no screen shows panes (the Android app attaches none to a cloud session), `/monitor` replies with the same content as text instead, so the panel is readable on a phone.

**User stories**

- As I run `/spec`, `/plan`, `/build`…, I see the current phase highlighted and the phases I've been through marked.
- When I open a session in a repo that already has a spec, plan and todo list, I see their progress before I run anything.
- I see which agent-skills commands and skills were used this session, and when.
- I see open vs done tasks from `tasks/todo.md` and from the session's own task list.
- I see which files were changed and which commits were made this session.
- I see which checks (tests, lint, evals, validators) ran and whether each passed.

### Assumptions

1. One capability (one pane fed by one set of session events), so no capability map.
2. Memory lasts for the current session only (`$.state`). Nothing is kept across sessions.
3. It works on all four surfaces the engine draws for: `terminal`, `desktop`, `vscode`, `mobile`.
4. It targets the mod API of Claude Code 2.1.326. The API is early access and can change between releases, and the types file is the authority.
5. The pane opens on its own only where it's relevant (see Opening rules), and `/monitor` opens it any time.
6. A check "passed" when its Bash call returned without `isError` and wasn't interrupted. This is checked early in the build (see Decisions).
7. agent-skills names match with or without the `agent-skills:` prefix (`/spec` from this repo's `.claude/commands/`, `agent-skills:spec` when installed as a plugin).

### Phase rules

**Mapping** (from README's workflow diagram and CLAUDE.md's skills-by-phase list):

| Phase | Commands | Skills |
|---|---|---|
| Define | `/spec` | interview-me, idea-refine, spec-driven-development |
| Plan | `/plan` | planning-and-task-breakdown |
| Build | `/build` | incremental-implementation, test-driven-development, context-engineering, source-driven-development, doubt-driven-development, frontend-ui-engineering, api-and-interface-design |
| Verify | `/test` | browser-testing-with-devtools, debugging-and-error-recovery |
| Review | `/review`, `/code-simplify`, `/webperf` | code-review-and-quality, code-simplification, security-and-hardening, performance-optimization |
| Ship | `/ship` | git-workflow-and-versioning, ci-cd-and-automation, deprecation-and-migration, documentation-and-adrs, observability-and-instrumentation, shipping-and-launch |
| *(no phase)* | `/constraints` | constraint-driven-development, using-agent-skills |

Commands and skills outside the table are recorded but not shown, and never change the phase.

**Active phase:**
- Set by the most recent mapped slash command (`command.run`).
- A mapped skill (`skill.prompt`) sets it only when the skill fires in a turn that didn't start with a mapped command. For example, `/test` followed by test-driven-development firing in the same turn stays in Verify.
- **Evidence is always shown.** The active phase is a guess from the last command or skill, so the panel says what started it and when, e.g. `started by /build · 4 min ago` or `started by skill test-driven-development · just now`. When nothing has set a phase yet, it says `No step yet`, with no guess.

**Phase states:** `todo`, `active`, `visited` (was active earlier this session) or `done`. `done` comes from files in the session's working directory:
- **Define is done** when a spec exists at one of the paths `/build` accepts: `SPEC.md`, a root `SPEC-*.md`, `docs/SPEC.md`, or a file under `spec/`.
- **Plan is done** when `tasks/plan.md` exists.
- **Build shows progress** as `checked/total` from the `- [ ]` / `- [x]` items in `tasks/todo.md`. It is done when there's at least one item and all are checked.
- **Verify, Review and Ship** have no file to read, so they are only ever `todo`, `active` or `visited`.

**Shown as:** ● the current step, ✓ a step that's done or that the session has been through, ○ a step not reached yet.

**Which step an event belongs to:** the step that was current when it happened, i.e. the latest phase-setting command or skill at or before it. Events before any step belong to none.

**Freshness:** these files are read at session start, at each turn start, and after any Edit, Write or NotebookEdit call whose path is one of them.

### Opening rules

Tracking starts at session start whether or not the pane is open, so opening it later shows the whole session.

- **At session start**, the pane opens on its own only when the working directory has a spec at one of the known paths or a `tasks/` folder.
- **Otherwise**, it opens on its own the first time a command or skill from the phase table runs, including the phase-less ones.
- **At most once per session.** After you close it, nothing reopens it except `/monitor`.
- **`/monitor`** opens it any time, in any project. When the engine reports the pane isn't placed (`isPlaced: false`), `/monitor` replies with the text summary instead (see below).

### What's tracked

| Section | Source event | Kept |
|---|---|---|
| Activity | `command.run`, `skill.prompt` | time, kind, name, phase (if mapped) |
| Tasks | `tasks/todo.md`; `TodoWrite`, `TaskCreate`, `TaskUpdate` tool calls | the todo's counts and its task lines (title and done); session task subject and status |
| Files changed | `Edit`, `Write`, `NotebookEdit` tool calls | each change: path relative to the working directory, time, and whether it created the file (`Write` reporting `create`) or edited it |
| Commits | Bash results carrying `gitOperation.commit` | short hash from `gitOperation`, subject from the commit's output line, time |
| Checks | Bash calls matching the check list below | time, label, pass/fail |

**Check commands (V1, built in):** `npm test` / `npm run test` / `npm run lint`, `node scripts/run-evals.js`, `node scripts/validate-*.js`, `bash hooks/*-test.sh`, `claude plugin validate|test`, `tsc`, `eslint`, `jest`, `vitest`, `pytest`, `go test`, `cargo test`.

A `git commit -q` prints nothing, so Claude Code attaches no commit report to the result and the panel doesn't list it (live check, 2026-11-18).

A check's ✓/✗ is its Bash call's result. So a check piped into another command (`npm test | tail`) shows the last command's exit status, as the shell reports it, and a check still running in the background isn't recorded.

Each list keeps its newest 200 entries.

### Pane layout (V1)

Revised after the first draw on a real screen (Decisions 10 and 11): one clear "you are here", room for Build's tasks, one short feed, one line of totals, and a way to look back at an earlier step.

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

- **Stepper.** The six steps on one row. The current one is bold in the theme's accent color, ✓ is in its success color, and ○ is dim. At 40 columns or narrower, and on `mobile`, it stacks one step per line. Each step is a button that opens its look-back view.
- **Current step.** Its name, large and in the accent color, and the line that started it. Before any step: `No step yet`, and that the panel is waiting for an agent-skills command or skill.
- **Build's tasks.** While Build is the current step, the panel lists `tasks/todo.md`'s tasks under `Tasks · N of M done`:
  - the task lines are its checkbox items whose text starts with `Task`; if it has none, all its checkbox items
  - each title is cut at ` · ` and stripped of `**`
  - ✓ done, ▸ the first open task (next up), ○ the rest
  - with no `tasks/todo.md`, the session's own task list, by subject
- **Recent.** The newest 4 events, newest first, each with its relative time:
  - workflow commands and skills (those in the phase table)
  - file changes, as `created <path>` or `edited <path>`, each path once
  - commits, as `committed <sha> <subject>`
  - checks, as `✓ <label>` or `✗ <label>`, in the success or error color

  It's left out when there's nothing yet.
- **Totals.** One dim line: files changed, commits, checks (with how many failed), and session tasks when there are any.
- **Left out:** commands and skills outside the workflow (`/model`, `/monitor`, other plugins' skills), and empty states other than `No step yet`.
- **Times** are relative to now: `just now` under a minute, then `N min ago`, then `N h ago`. While the pane is open it redraws at least once a minute, so they stay current.

#### Look back

Pressing a step in the stepper shows what happened while it was the current step:

```
✓ Define ─ ✓ Plan ─ ● Build 3/7 ─ ○ Verify ─ ○ Review ─ ○ Ship

PLAN · looking back                                   Back
started by /plan · 2 h ago

Files
  created tasks/plan.md           2 h ago
  edited tasks/todo.md            2 h ago

Activity
  skill planning-and-task-breakdown   2 h ago
  /plan                           2 h ago
```

- **Files:** the files created or edited during that step, each path once, newest first. A path counts as created if any change during the step created it.
- **Activity:** that step's commands, skills, commits and checks, newest first.
- **Empty:** a step with nothing recorded says `Nothing recorded for this step yet.`
- **Back:** returns to the current step. So does pressing the step being viewed, or the current one.
- **Phone:** `/monitor <step>` (e.g. `/monitor plan`) gives the same view as text.

### Text summary

When nothing shows the pane, `/monitor` replies with the same blocks as plain text, and `/monitor <step>` with that step's look-back view:

```
Workflow
✓ Define ─ ✓ Plan ─ ● Build 3/7 ─ ○ Verify ─ ○ Review ─ ○ Ship

BUILD
started by /build · 4 min ago

Tasks · 3 of 7 done
  ✓ Task 1: Live event check
  ▸ Task 4: Done marks from files
  …

Recent
  ✓ npm test · just now
  edited hooks/phases.ts · 2 min ago

5 files changed · 1 commit · 2 checks, 1 failed · 2/4 tasks
```

- **Same blocks, same data** as the pane, so the two never disagree.
- **A snapshot:** the text reflects the moment `/monitor` runs. Run it again to refresh.
- **Unknown step:** `/monitor` with anything else after it says which step names it takes.

## Tech Stack

- Claude Code mod (function-hooks plugin), API from the `claude-code` module of Claude Code 2.1.326
- TypeScript / TSX, compiled by the engine. JSX uses the global `h`, and elements come from `$.ui.resolve(e)`.
- State lives in `atom`/`read`/`update` over `$.state`, declared in `types/index.d.ts`
- File reads use `$.fs`. No `package.json` and no npm dependencies.
- Tooling: `claude` 2.1.326 CLI and `tsc` (TypeScript, installed globally)

## Commands

```
Validate:    claude plugin validate mods/monitor
Type-check:  tsc -p mods/monitor      # after the engine has loaded the mod once and written .claude-plugin/types/
Test:        claude plugin test mods/monitor
Try it:      claude --plugin-dir ./mods/monitor
Install:     /plugin install monitor --marketplace monraza/agent-skills   # once on the fork's main

Repo checks that must stay green:
             node scripts/validate-skills.js
             node scripts/validate-versions.js
             node scripts/run-evals.js
             claude plugin validate .
```

## Project Structure

```
mods/monitor/
  .claude-plugin/plugin.json   → name, version, description, "types": "./types/index.d.ts"
  .claude-plugin/types/        → written by the engine on load; gitignored by the engine
  hooks/hooks.json             → { "modules": ["./register.tsx"] }
  hooks/register.tsx           → wiring only: events → pure functions → atoms; the /monitor command; opens the pane
  hooks/phases.ts              → phase map and active/visited/done rules (pure)
  hooks/artifacts.ts           → spec / plan / todo detection and checkbox counting (pure)
  hooks/classify.ts            → check-command matching, commit-output parsing, path relativising (pure)
  hooks/sections.ts            → pure: session data → the ordered sections both outputs show
  hooks/view.tsx               → the pane's drawing of those sections, per surface and width
  hooks/summary.ts             → pure: the same sections as plain text for /monitor
  hooks/*.test.ts(x)           → claude plugin test suites
  hooks/fixtures/live-events.ts → event inputs and results recorded in the live check, trimmed to the fields the mod reads
  types/index.d.ts             → PluginState contract for every $.state value
  tsconfig.json                → extends .claude-plugin/types/tsconfig.json
  README.md                    → what it shows, install line, how to try it
.claude-plugin/marketplace.json → adds one entry: { "name": "monitor", "source": "./mods/monitor" }, after agent-skills
```

Nothing under `skills/`, `.claude/commands/`, `hooks/` (the repo's shell hooks) or the agent-skills `plugin.json` changes.

## Code Style

Same conventions as the engine's own examples: two-space indent, single quotes, no semicolons. Logic lives in pure modules that tests call directly. `register.tsx` only wires events to them. Every observing hook passes the event on unchanged and returns what `next(e)` returned.

```ts
// hooks/phases.ts — pure: no `$`, no I/O
export type PhaseId = 'define' | 'plan' | 'build' | 'verify' | 'review' | 'ship'

const COMMAND_PHASE: Record<string, PhaseId> = {
  spec: 'define',
  plan: 'plan',
  build: 'build',
  test: 'verify',
  review: 'review',
  'code-simplify': 'review',
  webperf: 'review',
  ship: 'ship',
}

export const phaseOfCommand = (name: string): PhaseId | undefined =>
  COMMAND_PHASE[name.replace(/^agent-skills:/, '')]
```

```tsx
// hooks/register.tsx — observe, record, pass through untouched
on('command.run', async ($, e, next) => {
  await update($, activity, list => addCommand(list, e.command, Date.now()))

  return next(e)
})
```

Naming: atoms are named for what they hold (`activity`, `files`, `checks`), and pure functions for what they return (`phaseOfCommand`, `countTodo`). Each atom carries a `shape` tag, bumped whenever its fields change, so a value stored by an older version is dropped after a reload.

## Testing Strategy

All automated tests run under `claude plugin test`, importing `test`, `expect` and `mock` from `claude-code/testing`.

- **Live event check (first, before any integration test):** `claude plugin test` stands in for Claude Code with events we write ourselves, so their shapes must come from the real engine, not from guesses.
  - Load a throwaway probe mod in a real session. It is never committed and lives in the session's mods folder.
  - Record what the engine really sends when we:
    - run `/spec` and `/monitor` (also showing whether `/monitor` clashes with an existing command)
    - let an agent-skills skill fire through the Skill tool
    - run a passing and a failing Bash command
    - make a `git commit`
    - create and update a session task, and edit a file
  - Save the records, trimmed to the fields the mod reads, in `hooks/fixtures/live-events.ts`. Integration tests build their events from these records.

- **Unit (pure modules):**
  - every row of the phase table, with and without the `agent-skills:` prefix
  - command-vs-skill precedence within a turn
  - todo counting (nested items, `[X]`, non-task lines)
  - check-command matching, including near-misses that must not match (`npm install`, `cat package.json`)
  - commit parsing for success and failure output
- **Integration (engine `$`):**
  - drive `session.start`, `command.run`, `skill.prompt` and `tool.call` with stubbed engine hooks beneath the plugin
  - mount the pane with `$.ui.mount` on `terminal`, `desktop`, `vscode` and `mobile`, at a wide and a narrow (≤40 columns) width
  - assert on the drawn text with `ui.find`
  - run `/monitor` with `ui.open` answering `isPlaced: false`, and assert the text summary holds the same sections
- **State compatibility:** seed `state.get` with a value of an older shape. The pane must draw its empty state, not fail.
- **Pass-through:** for each hooked event, the result the plugin returns equals what the stubbed engine returned, so nothing is rewritten.
- **Manual, once per surface available:** load the mod in a live session, run `/spec` → `/plan` → `/build` in a scratch repo, and compare the pane with what happened. Watch the transcript for any failed-hook line.

Coverage target: every rule in this spec has at least one test. No percentage gate.

## Boundaries

- **Always:**
  - pass every event through with `next(e)` unchanged
  - keep all state in `$.state` under the declared contract
  - run validate, type-check and test before each commit
  - keep the repo's existing checks green
  - keep the mod self-contained in `mods/monitor/`
- **Ask first:**
  - adding a `package.json` or any npm dependency
  - changing CI workflows (e.g. adding the mod's tests to CI)
  - editing anything under `skills/`, `.claude/commands/` or the agent-skills `plugin.json`
  - changing `marketplace.json` beyond the one new entry
  - writing to `$.store` or to disk
  - pushing to the fork's `main`
- **Never:**
  - deny, rewrite or delay a tool call, prompt or command
  - make network requests (`$.http`) or run processes (`$.process`)
  - keep command output beyond what's displayed (a commit's hash and subject)
  - copy file contents into state: only counts, paths, and the task titles from `tasks/todo.md`, which Build's task list shows (Decision 11)

## Success Criteria

1. Running `/spec` makes Define the current step. Then running `/plan` makes Plan current and marks Define ✓.
2. With no command run, a Skill-tool invocation of `test-driven-development` makes Build the current step. `agent-skills:build` and `build` map the same way.
3. `/test` followed by test-driven-development firing in the same turn leaves Verify current.
4. In a repo with `SPEC.md`, `tasks/plan.md` and a `tasks/todo.md` with 3 of 7 items checked, the stepper shows ✓ Define, ✓ Plan and ○ Build 3/7 at session start, before any command runs.
5. Checking a todo item via an Edit call updates the Build count after that call.
6. Each file changed by Edit, Write or NotebookEdit counts once in the totals, and shows in Recent as `edited <path>`, relative to the working directory.
7. A successful `git commit` Bash call shows in Recent as `committed <sha> <subject>` and counts in the totals. A failed one adds nothing.
8. A matching check command shows in Recent with ✓ when its Bash call had no `isError` and wasn't interrupted, and with ✗ otherwise. It counts in the totals, with failures. A Bash command that isn't a check doesn't appear.
9. `TodoWrite`, `TaskCreate` and `TaskUpdate` calls are reflected in the totals' session task count.
10. The pane draws on `terminal`, `desktop`, `vscode` and `mobile` with no failed-hook notice. At 40 columns or fewer, and on `mobile`, the stepper stacks.
11. In a directory with `SPEC.md` or `tasks/`, the pane opens at session start. In a directory with neither, it stays closed until a phase-table command or skill runs, then opens once. After it's closed, only `/monitor` reopens it, and `/monitor` works in any directory. Opening it late still shows everything since session start.
12. A stored value of an older shape is dropped without error. After an ordinary hot reload of the mod's code, the session's data is still shown (seen live after Tasks 8 and 9). A fresh load of the mod starts empty (Decision 9).
13. For every hooked event, the returned result equals the engine's (pass-through test).
14. `claude plugin validate mods/monitor`, `tsc -p mods/monitor` and `claude plugin test mods/monitor` all pass. The four repo checks under Commands still pass.
15. The current step always shows the command or skill that started it, and how long ago (`started by /build · 4 min ago`), with no step number. Relative times move on without any new event (`just now` → `1 min ago`).
16. Every integration test builds its events from `hooks/fixtures/live-events.ts`, recorded from a real session, not from hand-written shapes.
17. When the pane isn't placed, `/monitor` replies with the same blocks as text, from the same data. On the Android app, `/monitor` shows that text.
18. Commands and skills outside the workflow, and empty states other than `No step yet`, are not shown. Recent holds at most 4 events.
19. While Build is the current step, the panel lists `tasks/todo.md`'s tasks with ✓ done, ▸ the first open task and ○ the rest, under `Tasks · N of M done`. With no `tasks/todo.md`, it lists the session's own tasks.
20. Pressing a step in the stepper shows the files created or edited, and the commands, skills, commits and checks, from while that step was current. `Back` returns to the current step. `/monitor <step>` gives the same view as text, and an unknown step name gets a reply listing the valid ones.

## Out of Scope (Deferred)

- Buttons that act on the session, such as "run the next command": the only buttons choose which step the panel shows (Decision 11).
- A "suggested next command" hint: it goes with the button idea.
- History across sessions (`$.store`): V1 is about the current session.
- A full list of the session's files, commits and checks: Recent shows the newest 4 and the totals count all (Decision 10).
- Saving the session's data to `$.store` so it survives a fresh load (a re-enable or a worker restart): ordinary hot reloads keep it already, and `$.store` can't survive a new cloud container either (Decision 9).
- User-configurable check-command patterns (`userConfig`): the built-in list comes first, so we learn what's missing.
- A separate view of subagent activity: it adds a second event stream to reason about.
- A status-line or above-prompt band version: a second surface to design.
- Showing `CONSTRAINTS.md` gate status: that belongs to constraint-driven-development and is its own feature.
- A CI job running the mod's tests: changing CI is ask-first, and it needs a decision on CI cost.
- Contributing upstream to addyosmani/agent-skills: needs the CONTRIBUTING.md pre-flight and maintainer buy-in.

## Decisions

1. **Bash pass/fail: confirmed (live check, 2026-11-18).** A non-zero exit sets `isError: true` on the tool.call result, and a zero exit has no `isError` key. ✓/✗ stays as specified.
2. **Matching session tasks: confirmed (live check).** `TaskCreate`'s result carries the new id at `result.task.id`, and `TaskUpdate`'s carries `taskId` and `statusChange`. Session tasks are matched by id.
3. **Name: `monitor`, no clash (live check).** The slash command is `/monitor`, and the mod and its folder are named `monitor` too. The live command list has no `monitor`.
4. **Sync conflicts: accepted for now.** The entry stays in the shared `.claude-plugin/marketplace.json`, and any conflict is resolved at sync time.
5. **Phase-less items: confirmed.** `constraint-driven-development`, `using-agent-skills` and `/constraints` show in Activity without changing the phase.
6. **Commit hash from the engine (live check). A successful `git commit` result carries `result.gitOperation.commit.sha`, so the hash comes from there. The subject is read from the `[branch sha] subject` line of its output.
7. **Relative times.** Times show as `just now`, `N min ago` or `N h ago`, never as clock times, because a cloud session's clock is UTC rather than your local time.
8. **Text summary for screens without panes (Checkpoint A).** The Android app attaches no surface to a cloud session (`$.session.surfaces()` is empty), so the pane never draws there and only a command's text reply reaches the phone. The Windows desktop app viewing the same cloud session doesn't attach one either. The pane draws where Claude Code runs on your own machine: the terminal, or a local session in the desktop app's Code tab. `/monitor` replies with the panel as text whenever the pane isn't placed.
9. **A fresh load starts empty: accepted for V1 (Checkpoint B, corrected in Task 10).** Twice in this cloud session (after Tasks 6 and 7), the session's activity, files, commits and checks were lost. Both times the engine reported that it had turned on mod hot-reloading and loaded the mods, which is a fresh load. The ordinary hot reloads after Tasks 8 and 9 kept the data, as the API docs say `$.state` does. Counts read from files come back either way, since they are re-read. Accepted for V1: a fresh load only happens when the mod is (re-)enabled or the worker restarts.
10. **A simpler layout (after the first draw on a real screen, 2026-11-18).** In the Windows desktop app, in a local session, the pane drew correctly but was dense. Every block had the same weight, three lines were empty states, commands outside the workflow crowded the activity list, and what happened was split across four lists. Chosen from three mockups: a stepper, a large current-step header, a Recent feed of the newest 4 events, and one totals line, in the theme's colors.
11. **Build's tasks and looking back (after the second look, 2026-11-18).** Build is the densest step, so while it's current the panel lists `tasks/todo.md`'s tasks and which are done, and drops the step number. Each step in the stepper becomes a button that shows what happened during it: files created or edited, and its activity. The phone gets the same through `/monitor <step>`. To show task titles, the panel keeps the todo's task lines (title and done) in state.

## Open Questions

None.
