---
description: Run the whole SDLC loop autonomously — spec, plan, build, review, ship — stopping only for critical decisions
---

Invoke agent-skills:planning-and-task-breakdown, agent-skills:incremental-implementation, agent-skills:test-driven-development, agent-skills:code-review-and-quality, agent-skills:doubt-driven-development, and agent-skills:debugging-and-error-recovery as each phase demands.

`/sdlc` chains the individual lifecycle commands into one supervised loop. The existing commands stop at every phase boundary by design; this one carries state across them so a run can go spec → ship with a single human gate, escalating only on the triggers listed below.

## Modes

Parse `$ARGUMENTS` for the tokens below; whatever is left over is the scope description.

| Arguments | Autonomy | Scope | Branch |
|-----------|----------|-------|--------|
| *(empty)* | stepped — one phase, report, stop | whole spec | current |
| `auto` / `all` | autonomous | whole spec | current |
| `auto <description>` | autonomous | whole spec, seeding DEFINE | current |
| `feature <id>` | stepped | one feature from the spec | its own |
| `auto feature <id>` | autonomous | one feature from the spec | its own |
| `auto features` | autonomous | **every** feature in the spec, in dependency order | one per feature |

`<id>` is a feature's number or name from `tasks/features.md` (or, before that exists, from `SPEC.md`).

Autonomous is **not** a lower bar — every task is still test-driven, reviewed, and committed individually. It removes the human stepping *between* phases, never the verification.

## Preflight (every mode, before anything else)

1. **Branch.** Never commit on `main`/`master`. In whole-spec mode, refuse to run there — switch to a feature branch first. In per-feature mode, *starting* from `main` is expected: the first act of each feature is to cut its own branch, so the default branch is only ever the base you branch from.
2. **Clean baseline.** `git status --porcelain` must be empty apart from planning artifacts (`SPEC.md`, `docs/SPEC.md`, `spec/*`, `tasks/*`). Otherwise stop and ask — autonomous per-task commits must not absorb unrelated local work.
3. **Verification commands.** Identify the test, lint, typecheck, and build commands from CLAUDE.md, `package.json`, or the equivalent manifest. If you cannot verify the code mechanically, stop and ask — an autonomous loop without a green/red signal is not autonomous, it's unsupervised.
4. **State file.** Read the run's state file if present and resume from the recorded phase; otherwise create it (format below). Whole-spec and outer-loop runs use `tasks/sdlc-state.md`; a feature's own run uses `tasks/[feature]/sdlc-state.md`.

## The loop

Run phases in order. Each phase has an exit condition — do not advance until it holds.

| # | Phase | Action | Exit condition |
|---|-------|--------|----------------|
| 1 | DEFINE | `/spec` — skip if a spec at `SPEC.md`, `docs/SPEC.md`, or `spec/*` already covers this scope | Spec exists and covers the requested scope |
| 2 | PLAN | `/plan` — dependency-ordered, vertically sliced tasks into `tasks/plan.md` | Every task has acceptance criteria and a verification step |
| 3 | **GATE** | Present spec summary + full plan + the escalation policy you will run under. Wait for an unambiguous affirmative ("approve", "go", "yes"). Hedged answers ("looks reasonable", "I guess") are **not** approval | Explicit approval recorded in the state file |
| 4 | BUILD | `/build auto` semantics per task: RED → GREEN → full suite → build → commit → mark complete | Every task complete, suite green, build clean |
| 5 | VERIFY | Full test suite, lint, typecheck, build from a clean state. Browser-facing change → agent-skills:browser-testing-with-devtools | All checks green on the current HEAD |
| 6 | REVIEW | `/review` five-axis pass on the accumulated diff | No Critical findings; Important findings fixed or explicitly deferred with a reason |
| 7 | SIMPLIFY | `/code-simplify` — only if review flagged complexity. Behavior-preserving; tests stay green | Tests green, diff smaller or clearer |
| 8 | SHIP | `/ship` fan-out → go/no-go + rollback plan. **Produce the decision; never execute the deploy** | Written GO/NO-GO with a rollback plan |

**Loop-back edges** (this is the loop, not a pipeline):

- Review returns Critical or Important findings → back to phase 4 for those items only, then re-run 5–6. **Max 3 review cycles**, then escalate.
- A test fails → agent-skills:debugging-and-error-recovery. **Max 2 distinct fix attempts** per failure, then escalate.
- Build reveals missing work inside the spec's scope → append a task to `tasks/plan.md` and continue. Outside the spec's scope → escalate (trigger 5).
- Ship returns NO-GO → back to phase 4 with the blockers as tasks. Second NO-GO → escalate.

## Per-feature mode

`auto features` runs the loop above **once per feature**, each on its own branch, so review and ship stay scoped to one coherent change. The spec is written once; everything downstream of it is per feature.

### Artifact layout

```
SPEC.md                        one spec, every feature
tasks/features.md              the registry — features, branches, dependencies, status
tasks/[feature]/plan.md        that feature's plan
tasks/[feature]/todo.md        that feature's task list
tasks/[feature]/sdlc-state.md  that feature's run state
tasks/sdlc-state.md            the outer loop's own state (which feature is current)
```

Never let two features share `tasks/plan.md` or `tasks/sdlc-state.md`. The second feature's plan would overwrite the first, and resume would read the wrong run's phase and budgets.

### The registry — `tasks/features.md`

Derived from `SPEC.md` at the start of the run, updated after every feature:

```markdown
# Features — derived from SPEC.md
| # | Feature | Slug | Branch | Base | Depends on | Status |
|---|---------|------|--------|------|-----------|--------|
| 1 | Location resolution | location | feat/location | main | — | shipped |
| 2 | Event feed | event-feed | feat/event-feed | feat/location | 1 | in-progress |
| 3 | Visibility score | visibility | feat/visibility | feat/event-feed | 2 | deferred (deps) |
```

Status is one of `pending` → `in-progress` → `ready` (a GO decision is written) → `shipped` (a human merged it), plus `blocked` and `deferred (deps)`.

### Branching

- **Base** is the branch the run started from. Independent features branch from it directly.
- **A feature with declared dependencies branches from its last dependency's branch**, not from base — otherwise it cannot see code it is specified to build on. Record that parent in the registry's Base column.
- After a feature's ship decision, return to base and leave the branch intact. **Never merge and never deploy** — merging into a shared branch is outward-facing (trigger 1). Open a PR only if asked.

### The outer loop

1. **Derive the features** from `SPEC.md` and write `tasks/features.md` in dependency order.
2. **Outer gate.** Present the feature list, the order, and the branch topology. Approve once. In `auto features` this is the *only* planned gate — individual feature plans are not separately gated, or you are back to stepping by hand. (In `auto feature <id>`, that one feature's plan is the gate.)
3. **For each feature** whose dependencies are satisfied: re-run preflight → cut its branch → run phases 2–8 scoped to it → return to base → update the registry.
4. **A blocked feature parks the feature, not the run.** Mark it `blocked`, record the escalation in *its* state file, and move to the next feature whose dependencies are satisfied. Mark anything downstream of it `deferred (deps)`. Present every parked escalation together at the end — that is the whole point of scoping per feature: one stuck feature should not idle the other five.
5. **Two exceptions that stop the entire loop**, because continuing would compound the problem:
   - A Critical or High security finding (trigger 3) — it usually lives in shared code, and shipping more features on top of it widens the blast radius.
   - Any trigger-1 item the *whole spec* depends on, such as a migration every feature needs.
6. **Stop after two consecutive blocked features.** Individual blockers are normal; two in a row means something systemic — a thin spec, a red baseline, a bad dependency order — and grinding through the rest wastes the run.
7. **Re-check the base between features.** If base has gone red, stop: every later feature would inherit a broken baseline and blame the wrong change.

### Budgets

Per-feature budgets are per feature — feature 3 starts with a fresh 3 review cycles. The consecutive-blocked counter in rule 6 is the only budget that spans features.

## Escalation policy

This is the part that decides how often you interrupt the user. Apply it literally.

### Stop and ask — critical

1. **Irreversible or outward-facing.** Anything you cannot undo with `git revert`: schema migrations that drop or transform data, deletions, deploys and releases, payments or billing, auth/authz/permission changes, secrets and credentials, infra/DNS, sending mail or notifications, writes to third-party systems.
2. **Spec gap.** A requirement is missing, ambiguous, or self-contradictory, and the answer changes what gets built. Do not invent product decisions.
3. **Security.** Any Critical or High finding from `security-auditor` or the review's security axis.
4. **Stuck.** The same failure survives 2 distinct fix attempts, a fix reintroduces a previously fixed failure, or review cycles hit the cap without converging.
5. **Scope expansion.** The change would add a dependency, break a public API or contract, or touch files well outside the plan's declared footprint.
6. **Green requires a prohibited move** (see below).
7. **Ship blockers.** NO-GO verdict, or GO on a change that touches anything in trigger 1.

### Decide yourself — never ask

Formatting, lint, and typecheck fixes. Missing test cases. Review Suggestions and Importants inside the diff you already own. Internal renames and extractions. Docs, comments, and changelog entries. Reordering independent tasks. Re-running a test once when it failed before its body ran (checkout, install, runner loss). Choosing between implementations the spec does not constrain — pick the one matching existing patterns and record the choice in the state file.

### Prohibited moves — escalate instead

Never delete, skip, `.only`, quarantine, or weaken a test to reach green. Never `--no-verify`, `git add -A`, force-push, or amend someone else's commit. Never disable type checking, loosen lint rules, or widen permissions to make an error go away. If green is only reachable through one of these, that *is* the escalation.

### How to escalate

- **Blocking** (triggers 1, 2, 3, 6, 7): stop, write state, ask now. Give: what you hit, why it blocks, the options, your recommendation, and what happens on each choice. Enough context to answer without scrolling back.
- **Non-blocking** (everything else): log it under `## Open questions` in the state file, keep working on independent tasks, and present the batch at the next phase boundary. One question set at a time — do not trickle.
- **Resume**: re-invoking `/sdlc auto` reads the state file and continues from the recorded phase. An escalation must have a recorded answer before its item resumes.

## State file

`tasks/sdlc-state.md` for a whole-spec or outer-loop run; `tasks/[feature]/sdlc-state.md` for a feature's own run. Same format either way. Write it after every phase transition, every escalation, and every task completion — it is what makes the loop resumable across sessions and context compactions.

```markdown
# SDLC run — <branch> — started <date>
Mode: auto | stepped
Phase: BUILD (4/8)
Approved at gate: pending | yes — <date>

## Tasks
- [x] 1. <task> — commit abc1234
- [ ] 2. <task>

## Budgets
Review cycles: 1/3 · Fix attempts on current failure: 0/2 · Ship attempts: 0/2

## Decisions
- <choice made autonomously and why>

## Open questions (batched, non-blocking)
- <question> — proceeding on assumption: <assumption>

## Escalations
- [open] <trigger> — asked <date> — blocking phase <n>
- [resolved] <trigger> — asked <date> — answer: <answer>
```

Three markers matter to anything watching the file from outside: `Approved at gate: pending` while the plan awaits approval, `[open]` on an escalation waiting on a human, and `Phase: DONE` once the ship decision is written. A scheduler uses them to decide whether to re-invoke or hand back; the [sdlc-notify hook](../../hooks/SDLC-NOTIFY.md) uses them to decide whether to page you.

## Final report

Phases completed · tasks and commits · tests added · review findings fixed vs deferred · every autonomous decision worth knowing about · the ship decision and rollback plan · anything left for the user. State clearly what was **not** done and why.

In per-feature mode, report per feature — branch, commits, ship verdict, and blocker if any — then the parked escalations as one batch, and say plainly which branches are waiting to be merged and in what order.

## Running it unattended

`/sdlc auto` is a single supervised run. To have it run on a schedule, in headless mode, or in CI — and to tune which triggers actually stop the loop — see [docs/autonomous-sdlc.md](../../docs/autonomous-sdlc.md).
