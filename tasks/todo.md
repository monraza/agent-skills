# Tasks: Monitor (workflow panel) — V1

Source spec: SPEC.md · Plan: tasks/plan.md

Every task, before it's checked off:
- `claude plugin validate mods/monitor`, `tsc -p mods/monitor` and `claude plugin test mods/monitor` pass, from Task 2 on
- each new hook has a pass-through test (spec success criterion 13)
- from Task 2a on, each new section goes into `hooks/sections.ts`, so it shows in both the pane and `/monitor`'s text summary, and its tests check both
- it's committed and pushed to the working branch

## Phase 1: Foundation

- [x] **Task 1: Live event check** · S · Dependencies: none
  - **What:** a throwaway probe mod in the session's mods folder, never committed. It records the inputs and results of `turn.start`, `command.run`, `skill.prompt` and `tool.call` as JSON lines in the scratchpad.
  - **Acceptance:**
    - Records exist for each of these:
      - the user types `/spec probe` and `/monitor`
      - an agent-skills or plugin skill runs through the Skill tool
      - a passing and a failing Bash command
      - a `git commit` in a scratch repo
      - `TaskCreate` then `TaskUpdate`
      - an Edit and a Write
    - Decisions 1–3 in SPEC.md are updated with what was seen:
      - does `isError` mark a non-zero exit?
      - does `TaskCreate` return an id?
      - does `/monitor` clash with an existing command?
    - The command and skill name formats, and the order of events for a typed command, are written down in the fixtures file's header comment.
    - Whether a symlinked mod folder is followed is noted in tasks/plan.md.
  - **Verify:** read the JSON lines. Every success criterion that depends on a shape has a matching record.
  - **Needs the user:** to type `/spec probe` and `/monitor` once the probe has loaded.
  - **Files:** `mods/monitor/hooks/fixtures/live-events.ts`, `SPEC.md` (Decisions), `tasks/plan.md` (dev-loop note)

- [x] **Task 2: Mod skeleton: `/monitor` opens an empty pane** · M · Dependencies: 1
  - **Acceptance:**
    - The mod loads with no failed-hook line.
    - `/monitor` opens a pane titled "Workflow" that shows `No phase yet` and `No activity yet.`
    - The state contract declares its atoms.
  - **Verify:**
    - Test: mount on `desktop`, find both texts.
    - Live: type `/monitor`.
  - **Files:** `mods/monitor/.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/view.tsx`, `types/index.d.ts`, `tsconfig.json`, `hooks/pane.test.tsx`. That's 7 files, but two are one-line config files.

- [x] **Task 2a: Shared sections and the `/monitor` text summary** · M · Dependencies: 2
  - **What:** what the pane shows moves into `sections.ts` (pure: session data → ordered sections). `view.tsx` draws those sections, and `summary.ts` turns them into plain text. `/monitor` replies with the text when the pane isn't placed.
  - **Acceptance:**
    - Spec success criterion 17 holds for the sections that exist now (the empty state: `No phase yet`, `No activity yet.`).
    - The reply starts `No screen here shows panes, so here is the Workflow panel as text.`
    - When the pane is placed, `/monitor` still replies `Workflow panel opened.`
  - **Verify:**
    - Unit: the sections and summary of an empty session.
    - Integration: `/monitor` with `ui.open` answering `isPlaced: false` → the summary text. The pane still draws the same texts on all four surfaces.
    - Live: type `/monitor` on the phone → the summary.
  - **Files:** `hooks/sections.ts`, `hooks/summary.ts`, `hooks/view.tsx`, `hooks/register.tsx`, `hooks/pane.test.tsx`, `hooks/sections.test.ts`

### Checkpoint A
- [x] The fixtures exist, and the Decisions are updated
- [x] validate, tsc and test pass
- [x] `/monitor` works live: it's registered, runs, and opens the pane. On the Android app the pane is open but undrawn, because the app attaches no surface (`$.session.surfaces()` is empty). `/monitor` now says so instead of claiming success.
- [x] Human review: text summary from `/monitor` chosen for screens without panes (spec Decision 8, Task 2a)

## Phase 2: Core sections

- [x] **Task 3: Active phase with evidence, and the Activity list** · M · Dependencies: 2
  - **Acceptance:**
    - Spec success criteria 1, 2, 3 and 15 pass.
    - Activity lists commands and skills newest first, with time and phase.
    - A typed command that fires both events shows as one row, if Task 1 found that.
  - **Verify:**
    - Unit: every phase-table row, with and without the `agent-skills:` prefix. Command beats skill within a turn. Evidence text.
    - Integration: fixture events → the pane shows `Build · since /build, just now`. Advancing the mock clock 4 minutes shows `4 min ago` with no new event.
  - **Files:** `hooks/phases.ts`, `hooks/phases.test.ts`, `hooks/register.tsx`, `hooks/view.tsx`, `types/index.d.ts`

- [x] **Task 4: Done marks and Build progress from files** · M · Dependencies: 2
  - **Acceptance:**
    - Spec success criteria 4 and 5 pass.
    - A spec at any accepted path (`SPEC.md`, `SPEC-*.md`, `docs/SPEC.md`, `spec/*`) marks Define done.
    - `tasks/plan.md` marks Plan done, and the `tasks/todo.md` count shows on Build.
    - Files are re-read at session start, at turn start, and after an Edit or Write to a tracked path.
  - **Verify:**
    - Unit: todo counting (nested items, `[X]`, non-task lines), and spec path detection.
    - Integration: a stubbed `fs` with 3 of 7 checked → `Build 3/7`. An Edit to `tasks/todo.md` → the count updates.
  - **Files:** `hooks/artifacts.ts`, `hooks/artifacts.test.ts`, `hooks/register.tsx`, `hooks/view.tsx`, `types/index.d.ts`

- [x] **Task 5: Files changed and commits** · M · Dependencies: 2
  - **Acceptance:**
    - Spec success criteria 6 and 7 pass.
    - Paths are relative to the working directory, listed once each, with a count.
    - Only the commit's short hash and subject are kept.
  - **Verify:**
    - Unit: making paths relative (inside and outside the working directory), and commit-output parsing for success and failure.
    - Integration: fixture Edit, Write and commit events → the pane shows them.
  - **Files:** `hooks/classify.ts`, `hooks/classify.test.ts`, `hooks/register.tsx`, `hooks/view.tsx`, `types/index.d.ts`

- [x] **Task 6: Checks with pass/fail** · S · Dependencies: 2, and Decision 1
  - **Acceptance:**
    - Spec success criterion 8 passes as Decision 1 settled it: ✓/✗, or ran/interrupted only.
    - The built-in check list matches, and near-misses (`npm install`, `cat package.json`) don't.
  - **Verify:**
    - Unit: the match table.
    - Integration: fixture passing and failing Bash events → ✓ and ✗ rows.
  - **Files:** `hooks/classify.ts`, `hooks/classify.test.ts`, `hooks/register.tsx`, `hooks/view.tsx`

- [x] **Task 7: Session tasks** · S · Dependencies: 2, and Decision 2
  - **Acceptance:**
    - Spec success criterion 9 passes using the source Decision 2 settled on: `TaskCreate` ids, or `TodoWrite` / `TaskList`.
    - The Tasks line shows both counts: `todo.md 3/7 done · session 2/4 done`.
  - **Verify:**
    - Integration: fixture task events → the counts update. A deleted task is dropped.
  - **Files:** `hooks/register.tsx`, `hooks/view.tsx`, `types/index.d.ts`, `hooks/tasks.test.tsx`

### Checkpoint B
- [x] validate, tsc and test pass (71 tests)
- [x] Live run, in this session, through `/monitor` on the phone. Between reloads it showed the done marks and Build count, a changed file, a commit and a passing check. A quiet commit (`-q`) isn't listed. A reload of the mod's code wiped the session's data.
- [x] Human review: reloads accepted for V1 (spec Decision 9; corrected in Task 10: only a fresh load empties the panel)

## Phase 3: Behaviour and polish

- [x] **Task 8: Opening rules** · S · Dependencies: 3, 4
  - **Acceptance:**
    - Spec success criterion 11 passes.
    - The pane auto-opens at session start in a directory with a spec or `tasks/`.
    - Otherwise it auto-opens on the first phase-table command or skill.
    - It auto-opens at most once per session, including after a reload.
    - `/monitor` works anywhere.
  - **Verify:**
    - Integration: count the `ui.open` calls in each case, including a reload after auto-open (no second open).
  - **Files:** `hooks/register.tsx`, `types/index.d.ts`, `hooks/opening.test.tsx`

- [x] **Task 9: Layout across surfaces and widths** · M · Dependencies: 3–7
  - **Acceptance:**
    - Spec success criterion 10 passes.
    - At 40 columns or fewer, and on `mobile`, the phase row stacks.
    - Lists are newest first and cut to the pane's rows with "+N more". The text summary shows the newest 5 of each list, then "+N more".
    - Empty sections say so.
  - **Verify:**
    - Integration: mount on `terminal`, `desktop`, `vscode` and `mobile`, at wide and ≤40 columns, with a full and an empty session.
  - **Files:** `hooks/view.tsx`, `hooks/layout.test.tsx`

- [x] **Task 10: Reload, old state shapes and caps** · S · Dependencies: 3–7
  - **Acceptance:**
    - Spec success criterion 12 passes.
    - Each list keeps its newest 200 entries.
  - **Verify:**
    - Integration: seed `state.get` with an older shape → empty state, no failure. Seed current data → it survives. Push 250 entries → 200 kept.
  - **Files:** `hooks/register.tsx`, `types/index.d.ts`, `hooks/state.test.tsx`

- [x] **Task 11: Packaging** · S · Dependencies: 8–10
  - **Acceptance:**
    - Spec success criterion 14 passes.
    - The `monitor` entry sits in `.claude-plugin/marketplace.json` after `agent-skills`.
    - The README says what the pane shows, how to install it, how to try it, and the Claude Code version it was tested with.
  - **Verify:**
    - `node scripts/validate-skills.js`, `node scripts/validate-versions.js`, `node scripts/run-evals.js`
    - `claude plugin validate .`, `claude plugin validate mods/monitor`
  - **Files:** `.claude-plugin/marketplace.json`, `mods/monitor/README.md`

### Checkpoint C: Complete
- [x] Spec success criteria 1–17 each have a passing test or a recorded manual check:
  - 1–3, 15: `activity.test.tsx`, `phases.test.ts`; live: `◉ Build · since /build` on the phone
  - 4–5: `progress.test.tsx`, `artifacts.test.ts`; live: `✓ Define ✓ Plan ◉ Build 17/23`
  - 6–7: `changes.test.tsx`, `classify.test.ts`; live: a changed file and commit `27caa2a` (not `-q` commits, a documented limit)
  - 8: `checks.test.tsx`, `classify.test.ts`; live: ✓ and ✗ both seen
  - 9: `tasks.test.tsx`; live: `session 4/4 done`
  - 10: `layout.test.tsx` on all four surfaces at both widths. Live drawing still to be seen: no surface attaches to a cloud session (Decision 8)
  - 11: `opening.test.tsx`
  - 12: `state.test.tsx`; live: data kept across the hot reloads after Tasks 8 and 9
  - 13: a pass-through test in each test file
  - 14: validate, tsc, 89 tests, and every CI check
  - 16: every integration test imports `hooks/fixtures/live-events.ts`
  - 17: `pane.test.tsx` and each section's summary test; live: `/monitor` on Android and the Windows desktop app
- [x] The repo's checks pass: all CI steps, including evals (157 checks) and the 295 script tests
- [x] Definition of Done: Correctness, Quality, Integration and Documentation (README, spec decisions current)
- [ ] Human review before anything goes to the fork's `main`

## Phase 4: Simpler layout (spec Decision 10)

- [x] **Task 12: The new blocks and the text summary** · M · Dependencies: 11
  - **What:**
    - `sections.ts` produces four blocks: the stepper, the current step, Recent (the newest 4 workflow events) and one totals line.
    - Files and commits gain the time of their change.
    - Commands and skills outside the workflow, and empty states other than `No step yet`, are left out.
    - The text summary uses the same blocks.
  - **Acceptance:** spec success criteria 1–4, 6–9, 15, 17 and 18 as revised. The existing behaviour tests are rewritten against the new blocks.
  - **Verify:** `claude plugin test mods/monitor`, `tsc -p mods/monitor`, `claude plugin validate mods/monitor`.
  - **Files:** `hooks/sections.ts`, `hooks/summary.ts`, `hooks/register.tsx`, `hooks/classify.ts`, `types/index.d.ts`, and the tests

- [x] **Task 13: Draw the pane** · S · Dependencies: 12
  - **What:** `view.tsx` draws the blocks:
    - the stepper as a row, or stacked at 40 columns or narrower and on mobile
    - the current step large and bold in the accent color
    - Recent rows with the time on the right
    - ✓ and ✗ in the success and error colors
    - a blank line between blocks
  - **Acceptance:** spec success criterion 10 as revised. Each block draws on all four surfaces at both widths.
  - **Verify:** the layout tests, and a look on a real screen.
  - **Files:** `hooks/view.tsx`, `hooks/layout.test.tsx`

### Checkpoint D: Simpler layout
- [x] Tests, type-check and validate pass (95 tests, every surface)
- [ ] Seen on a real screen (your local session) and on the phone (`/monitor`)
- [ ] Human review

## Phase 5: Build's tasks and looking back (spec Decision 11)

- [x] **Task 14: Build's task list** · M · Dependencies: 13
  - **What:**
    - Reading `tasks/todo.md` also keeps its task lines, title and done (artifacts shape 2).
    - While Build is current, the panel lists them with ✓, ▸ (the first open task) and ○, under `Tasks · N of M done`. It falls back to the session's tasks when there's no todo.
    - The header drops `step N of 6`.
  - **Acceptance:** spec success criteria 15 and 19.
  - **Files:** `hooks/artifacts.ts`, `hooks/sections.ts`, `hooks/register.tsx`, `hooks/view.tsx`, `types/index.d.ts`, and the tests

- [x] **Task 15: File changes as events** · S · Dependencies: 14
  - **What:**
    - Each Edit, Write or NotebookEdit is recorded as `{ path, at, created }` (files shape 3), where `created` comes from Write's `type: 'create'`.
    - Recent shows each path once, as `created` or `edited`.
    - The totals count distinct paths.
    - A pure function gives the step current at any time.
  - **Acceptance:** spec success criterion 6, unchanged in what it shows.
  - **Files:** `hooks/classify.ts`, `hooks/phases.ts`, `hooks/sections.ts`, `hooks/register.tsx`, `types/index.d.ts`, and the tests

- [ ] **Task 16: Look back** · M · Dependencies: 15
  - **What:**
    - Each step in the stepper is a button that sets the step being viewed (a `viewing` atom).
    - The look-back view shows that step's files and activity, with `Back`.
    - `/monitor <step>` replies with the same view as text, and an unknown step name gets the valid names.
  - **Acceptance:** spec success criterion 20, on every surface.
  - **Files:** `hooks/sections.ts`, `hooks/summary.ts`, `hooks/view.tsx`, `hooks/register.tsx`, `types/index.d.ts`, and the tests

### Checkpoint E
- [ ] Tests, type-check and validate pass
- [ ] Seen on a real screen and the phone
- [ ] Human review
