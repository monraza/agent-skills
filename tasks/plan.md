# Implementation Plan: Monitor (workflow panel) — V1

Source spec: SPEC.md

## Overview

Build `monitor`, a read-only Claude Code mod in `mods/monitor/`. Its pane shows the session's place in the agent-skills workflow, with the evidence for that guess, plus the session's activity, tasks, changed files, commits and checks. The first task records what the real engine sends, so every later test is built on real event shapes. After that, each task adds one section of the pane end to end: the hook, a pure function, the state, the drawing and the tests. The panel is usable after every task.

## Architecture Decisions

- **Live check before any integration test.** A throwaway probe mod records real events into the scratchpad. The fixtures in `hooks/fixtures/live-events.ts` come from those records, never from guesses, which is spec success criterion 16.
- **Pure logic, thin wiring.**
  - `phases.ts`, `artifacts.ts` and `classify.ts` have no `$` and no I/O.
  - `register.tsx` maps events to those functions and writes atoms.
  - `view.tsx` only draws.
  - Unit tests call the pure modules directly, and integration tests go through the engine `$`.
- **One list of sections, two outputs.** `sections.ts` turns session data into the ordered sections. `view.tsx` draws them as the pane, and `summary.ts` writes them as `/monitor`'s text for screens that show no panes, such as the Android app (spec Decision 8). Each later task adds its section once and gets both.
- **Observe, never steer.** Every hook records, then returns `next(e)` unchanged. Each slice ships its own pass-through test, so a hook that rewrites anything fails in the task that added it.
- **Auto-open at most once per session.** An `autoOpened` flag in `$.state` lets the pane open on its own once, and it survives reloads. That covers "after you close it, only `/monitor` reopens it" without detecting the close.
- **Dev loop in this cloud session.**
  - The session hot-reloads only its own mods folder (`/root/.claude/dev-mods/<session>/`), not the repo.
  - Task 1 tests whether a symlink from there to `mods/monitor/` is followed. If not, each live check copies the folder there first, leaving out `.claude-plugin/types/`.
  - If the symlink works, the engine also writes `.claude-plugin/types/` into the repo folder, which `tsc -p mods/monitor` needs. Otherwise type-checking uses the types file's header `tsconfig.json`, kept in the scratchpad.
  - **Result (Task 1):** a symlink from the session's mods folder is followed, and the linked mod loaded. Live checks use `ln -s /home/user/agent-skills/mods/monitor <mods folder>/monitor`.
- **Commit after every task**, because the container and the session's mods folder are temporary.

## Dependency Graph

```
Task 1 live check ──→ fixtures + decisions (isError, TaskCreate id, /monitor clash, name formats, event order)
   │
Task 2 skeleton: /monitor opens an empty pane
   │
Task 2a shared sections + /monitor text summary
   │
   ├── Task 3 phase + evidence + activity ──┐
   ├── Task 4 artifacts: done marks, Build x/y ─┤
   │                                         ├── Task 8 opening rules (needs phase table + artifacts)
   ├── Task 5 files + commits                │
   ├── Task 6 checks        (Decision 1)     │
   └── Task 7 session tasks (Decision 2)     │
                                             │
Task 9 layout across surfaces and widths ←───┘ (needs every section)
Task 10 reload, old shapes, caps
Task 11 packaging: marketplace entry, README, repo checks
```

Tasks 3 to 7 only depend on Task 2. They're ordered by risk: phase (the headline guess) first, then the two that depend on Task 1's open decisions.

## Task List

Full tasks, with acceptance criteria, verification steps and files, are in `tasks/todo.md`.

### Phase 1: Foundation
- [x] Task 1: Live event check: record real events, settle Decisions 1–3
- [x] Task 2: Mod skeleton: loads, validates, `/monitor` opens an empty pane
- [x] Task 2a: Shared sections and the `/monitor` text summary (added at Checkpoint A)

### Checkpoint A: Foundation
- [ ] The fixtures file exists, and Decisions 1–3 in SPEC.md record their outcomes
- [ ] validate, tsc and test pass; `/monitor` opens the pane in a live session
- [ ] Human review

### Phase 2: Core sections
- [x] Task 3: Active phase with evidence, and the Activity list
- [x] Task 4: Done marks and Build progress from SPEC / plan / todo
- [x] Task 5: Files changed and commits
- [x] Task 6: Checks with pass/fail
- [x] Task 7: Session tasks

### Checkpoint B: Core sections
- [ ] validate, tsc and test pass
- [ ] Live run in a scratch repo: `/spec` → `/plan` → edit `tasks/todo.md` → run a check → commit, with the pane matching each step
- [ ] Human review

### Phase 3: Behaviour and polish
- [x] Task 8: Opening rules
- [ ] Task 9: Layout across surfaces and widths
- [ ] Task 10: Reload, old state shapes and caps
- [ ] Task 11: Packaging: marketplace entry, README, repo checks

### Checkpoint C: Complete
- [ ] Spec success criteria 1–16 each have a passing test or a recorded manual check
- [ ] The repo's four checks pass
- [ ] Definition of Done (`references/definition-of-done.md`): Correctness, Quality, Integration and Documentation
- [ ] Human review before anything goes to the fork's `main`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Real event names or shapes differ from what the spec assumes | High | Task 1 records them first, and tests are built from the records |
| `/spec` typed fires `skill.prompt` as well as `command.run`, logging two activity rows | Med | Task 1 records the order. If both fire, Task 3 merges them into one row |
| The mod API changes when Claude Code updates itself | Med | Validate, tsc and test on every task. The README states the version it was tested with (2.1.326) |
| `/monitor` clashes with an existing command | Med | Task 1 checks. On a clash, stop and ask for a name (Decision 3) |
| The mobile app attaches no surface, so no pane (or any mod drawing) shows there; only a command's text reply reaches the phone | High (you use mobile) | Decided at Checkpoint A: `/monitor` replies with a text summary when the pane isn't placed (Task 2a, spec Decision 8) |
| A reload of the mod's code starts it fresh: the session's data is lost (seen live after Tasks 6 and 7) | Low in real use | Accepted for V1 at Checkpoint B (spec Decision 9): only developing the mod, a plugin update or a worker restart triggers it |
| The model can't type slash commands, so live checks need the user | Low | Task 1 and Checkpoint B list exactly which commands to type |
| The repo folder isn't hot-reloaded in this session | Low | Symlink or copy into the session's mods folder (Architecture Decisions) |
| `validate-versions.js` reads only `plugins[0]` of the marketplace file | Low | The `monitor` entry goes after `agent-skills` |
| Upstream sync conflicts in `marketplace.json` | Low | Accepted (spec Decision 4) |

## Open Questions

None. Times are relative (spec Decision 7).
