# Spec: Workflow Panel — V1

## Objective

A Claude Code panel that sits beside the chat and shows where the current session is in the agent-skills workflow (Define → Plan → Build → Verify → Review → Ship), plus a running record of what the session has done.

**User:** someone using the agent-skills commands and skills in Claude Code, in the terminal, desktop app, VS Code or the mobile app. Today they have to scroll the transcript to see which phase they're in, which tasks remain, what changed, and whether checks passed.

**What it is:** a Claude Code mod (a function-hooks plugin) named `workflow-panel`. It lives in its own folder in this fork and is listed in the fork's marketplace file. It only watches and displays. It never changes, blocks or delays anything the session does.

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
5. The pane opens on its own at session start, and a `/monitor` command reopens it.
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

Unmapped commands and skills appear in the activity list but never change the phase.

**Active phase:**
- Set by the most recent mapped slash command (`command.run`).
- A mapped skill (`skill.prompt`) sets it only when the skill fires in a turn that didn't start with a mapped command. For example, `/test` followed by test-driven-development firing in the same turn stays in Verify.

**Phase states:** `todo`, `active`, `visited` (was active earlier this session) or `done`. `done` comes from files in the session's working directory:
- **Define is done** when a spec exists at one of the paths `/build` accepts: `SPEC.md`, a root `SPEC-*.md`, `docs/SPEC.md`, or a file under `spec/`.
- **Plan is done** when `tasks/plan.md` exists.
- **Build shows progress** as `checked/total` from the `- [ ]` / `- [x]` items in `tasks/todo.md`. It is done when there's at least one item and all are checked.
- **Verify, Review and Ship** have no file to read, so they are only ever `todo`, `active` or `visited`.

**Freshness:** these files are read at session start, at each turn start, and after any Edit, Write or NotebookEdit call whose path is one of them.

### What's tracked

| Section | Source event | Kept |
|---|---|---|
| Activity | `command.run`, `skill.prompt` | time, kind, name, phase (if mapped) |
| Tasks | `tasks/todo.md`; `TodoWrite`, `TaskCreate`, `TaskUpdate` tool calls | file counts; session task subject and status |
| Files changed | `Edit`, `Write`, `NotebookEdit` tool calls | path relative to the working directory, once each |
| Commits | successful Bash calls containing `git commit` | short hash and subject parsed from the commit's output |
| Checks | Bash calls matching the check list below | time, label, pass/fail |

**Check commands (V1, built in):** `npm test` / `npm run test` / `npm run lint`, `node scripts/run-evals.js`, `node scripts/validate-*.js`, `bash hooks/*-test.sh`, `claude plugin validate|test`, `tsc`, `eslint`, `jest`, `vitest`, `pytest`, `go test`, `cargo test`.

Each list keeps its newest 200 entries.

### Pane layout (V1, read-only)

```
Workflow
✓ Define  ✓ Plan  ◉ Build 3/7  · Verify  ○ Review  ○ Ship

Tasks      todo.md 3/7 done · session 2/4 done
Activity   12:05 skill spec-driven-development
           12:03 /spec
Files (5)  skills/…/SKILL.md, SPEC.md, …
Commits    a1b2c3d docs(spec): add workflow panel spec
Checks     ✓ run-evals 12:10   ✗ npm test 12:08
```

- When the pane is 40 columns or narrower (and on `mobile`), the phase row stacks to one phase per line.
- Lists show newest first and are cut to fit the pane's rows, with "+N more".
- When there's nothing to show, the pane says so ("No activity yet.").

## Tech Stack

- Claude Code mod (function-hooks plugin), API from the `claude-code` module of Claude Code 2.1.326
- TypeScript / TSX, compiled by the engine. JSX uses the global `h`, and elements come from `$.ui.resolve(e)`.
- State lives in `atom`/`read`/`update` over `$.state`, declared in `types/index.d.ts`
- File reads use `$.fs`. No `package.json` and no npm dependencies.
- Tooling: `claude` 2.1.326 CLI and `tsc` (TypeScript, installed globally)

## Commands

```
Validate:    claude plugin validate mods/workflow-panel
Type-check:  tsc -p mods/workflow-panel      # after the engine has loaded the mod once and written .claude-plugin/types/
Test:        claude plugin test mods/workflow-panel
Try it:      claude --plugin-dir ./mods/workflow-panel
Install:     /plugin install workflow-panel --marketplace monraza/agent-skills   # once on the fork's main

Repo checks that must stay green:
             node scripts/validate-skills.js
             node scripts/validate-versions.js
             node scripts/run-evals.js
             claude plugin validate .
```

## Project Structure

```
mods/workflow-panel/
  .claude-plugin/plugin.json   → name, version, description, "types": "./types/index.d.ts"
  .claude-plugin/types/        → written by the engine on load; gitignored by the engine
  hooks/hooks.json             → { "modules": ["./register.tsx"] }
  hooks/register.tsx           → wiring only: events → pure functions → atoms; the /monitor command; opens the pane
  hooks/phases.ts              → phase map and active/visited/done rules (pure)
  hooks/artifacts.ts           → spec / plan / todo detection and checkbox counting (pure)
  hooks/classify.ts            → check-command matching, commit-output parsing, path relativising (pure)
  hooks/view.tsx               → the pane's drawing, per surface and width
  hooks/*.test.ts(x)           → claude plugin test suites
  types/index.d.ts             → PluginState contract for every $.state value
  tsconfig.json                → extends .claude-plugin/types/tsconfig.json
  README.md                    → what it shows, install line, how to try it
.claude-plugin/marketplace.json → adds one entry: { "name": "workflow-panel", "source": "./mods/workflow-panel" }, after agent-skills
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
  - keep the mod self-contained in `mods/workflow-panel/`
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
  - copy file contents into state (only counts and paths)

## Success Criteria

1. Running `/spec` makes Define active. Then running `/plan` makes Plan active and shows Define as visited (or done if a spec file exists).
2. With no command run, a Skill-tool invocation of `test-driven-development` makes Build active. `agent-skills:build` and `build` map the same way.
3. `/test` followed by test-driven-development firing in the same turn leaves Verify active.
4. In a repo with `SPEC.md`, `tasks/plan.md` and a `tasks/todo.md` with 3 of 7 items checked, the pane shows Define ✓, Plan ✓ and Build 3/7 at session start, before any command runs.
5. Checking a todo item via an Edit call updates the Build count after that call.
6. Each file changed by Edit, Write or NotebookEdit appears once, as a path relative to the working directory, with the total count.
7. A successful `git commit` Bash call adds its short hash and subject. A failed one adds nothing.
8. A matching check command appears with ✓ when its Bash call had no `isError` and wasn't interrupted, and with ✗ otherwise. A Bash command that isn't a check doesn't appear.
9. `TodoWrite`, `TaskCreate` and `TaskUpdate` calls are reflected in the session tasks' done/total.
10. The pane draws on `terminal`, `desktop`, `vscode` and `mobile` with no failed-hook notice. At 40 columns or fewer, the phase row stacks.
11. The pane opens at session start, and `/monitor` reopens it after it's closed.
12. After a mod reload, the session's data is still shown. A stored value of an older shape is dropped without error.
13. For every hooked event, the returned result equals the engine's (pass-through test).
14. `claude plugin validate mods/workflow-panel`, `tsc -p mods/workflow-panel` and `claude plugin test mods/workflow-panel` all pass. The four repo checks under Commands still pass.

## Out of Scope (Deferred)

- Buttons, such as "run the next command": V1 is read-only by choice.
- A "suggested next command" hint: it goes with the button idea.
- History across sessions (`$.store`): V1 is about the current session.
- User-configurable check-command patterns (`userConfig`): the built-in list comes first, so we learn what's missing.
- A separate view of subagent activity: it adds a second event stream to reason about.
- A status-line or above-prompt band version: a second surface to design.
- Showing `CONSTRAINTS.md` gate status: that belongs to constraint-driven-development and is its own feature.
- A CI job running the mod's tests: changing CI is ask-first, and it needs a decision on CI cost.
- Contributing upstream to addyosmani/agent-skills: needs the CONTRIBUTING.md pre-flight and maintainer buy-in.

## Decisions

1. **Bash pass/fail: test during the build.** Before the Checks section relies on `isError`, the build confirms in a live session that a non-zero exit sets it. If it doesn't, Checks show ran/interrupted only, and pass/fail moves to Deferred.
2. **Matching session tasks: test during the build.** Before session tasks rely on it, the build confirms that a `TaskCreate` result carries the new task's id. If it doesn't, session tasks come from `TodoWrite` lists and `TaskList` results instead.
3. **Command name: `/monitor`.** The mod and folder keep the name `workflow-panel`.
4. **Sync conflicts: accepted for now.** The entry stays in the shared `.claude-plugin/marketplace.json`, and any conflict is resolved at sync time.
5. **Phase-less items: confirmed.** `constraint-driven-development`, `using-agent-skills` and `/constraints` show in Activity without changing the phase.

## Open Questions

None.
