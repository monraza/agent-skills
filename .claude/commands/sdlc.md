---
description: Run the whole SDLC loop autonomously — spec, plan, build, review, ship — stopping only for critical decisions
---

Invoke agent-skills:planning-and-task-breakdown, agent-skills:incremental-implementation, agent-skills:test-driven-development, agent-skills:code-review-and-quality, agent-skills:doubt-driven-development, and agent-skills:debugging-and-error-recovery as each phase demands.

`/sdlc` chains the individual lifecycle commands into one supervised loop. The existing commands stop at every phase boundary by design; this one carries state across them so a run can go spec → ship with a single human gate, escalating only on the triggers listed below.

## Modes

`$ARGUMENTS` selects the mode; everything after the mode word is the scope description.

- **`/sdlc`** — stepped. Run one phase, report, stop. Same guarantees, human between every phase.
- **`/sdlc auto`** — autonomous. One approval at the plan gate, then run every phase to a ship decision, pausing only on an escalation trigger.
- **`/sdlc auto <description>`** — same, seeding the spec phase with what to build.

Treat `auto` or `all` as autonomous; anything else (or empty) is stepped. Autonomous is **not** a lower bar — every task is still test-driven, reviewed, and committed individually. It removes the human stepping *between* phases, never the verification.

## Preflight (both modes, before anything else)

1. **Branch.** Refuse to run on `main`/`master`. Create or switch to a feature branch first.
2. **Clean baseline.** `git status --porcelain` must be empty apart from planning artifacts (`SPEC.md`, `docs/SPEC.md`, `spec/*`, `tasks/*`). Otherwise stop and ask — autonomous per-task commits must not absorb unrelated local work.
3. **Verification commands.** Identify the test, lint, typecheck, and build commands from CLAUDE.md, `package.json`, or the equivalent manifest. If you cannot verify the code mechanically, stop and ask — an autonomous loop without a green/red signal is not autonomous, it's unsupervised.
4. **State file.** Read `tasks/sdlc-state.md` if present and resume from the recorded phase; otherwise create it (format below).

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

## State file — `tasks/sdlc-state.md`

Write it after every phase transition, every escalation, and every task completion. It is what makes the loop resumable across sessions and context compactions.

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

## Running it unattended

`/sdlc auto` is a single supervised run. To have it run on a schedule, in headless mode, or in CI — and to tune which triggers actually stop the loop — see [docs/autonomous-sdlc.md](../../docs/autonomous-sdlc.md).
