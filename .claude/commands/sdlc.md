---
description: Run the whole SDLC loop autonomously — spec, plan, build, review, ship — stopping only for critical decisions
---

Invoke these skills as each phase demands: agent-skills:spec-driven-development, agent-skills:planning-and-task-breakdown, agent-skills:incremental-implementation, agent-skills:test-driven-development, agent-skills:browser-testing-with-devtools, agent-skills:code-review-and-quality, agent-skills:code-simplification, agent-skills:shipping-and-launch, agent-skills:doubt-driven-development, and agent-skills:debugging-and-error-recovery.

`/sdlc` carries state across the lifecycle phases so a run can go spec → ship with a single human gate, escalating only on the triggers listed below.

**How a phase does its work — read this before running the loop.** Every phase below names the skill it runs on. Load that skill (the Skill tool where the harness has one; otherwise read `skills/<name>/SKILL.md`) and follow it.

The `/spec`, `/plan`, `/review`, `/ship` names in the table mark which command a phase corresponds to, for orientation only. **Writing a slash command into your output does not run it** — slash commands expand from what a human types, not from what you emit. So a phase is never satisfied by announcing the command: load the skill, and where a command's body adds orchestration the skill doesn't carry (phase 4's per-task loop, phase 8's fan-out), follow the steps restated here.

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
| `status` | none — read-only | reports where every feature stands | none |

`<id>` is a feature's number or name from `tasks/features.md` (or, before that exists, from `SPEC.md`).

Add **`--pr`** to either feature mode to open a draft pull request for each feature that earns a GO. Off by default — pushing publishes code, so it stays something you ask for. A standing `Always: open a draft PR per shipped feature` in the spec's boundaries authorizes it without the flag.

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
| 1 | DEFINE | agent-skills:spec-driven-development — run its interview and write `SPEC.md`. Skip if a spec at `SPEC.md`, `docs/SPEC.md`, or `spec/*` already covers this scope *(the `/spec` phase)* | Spec exists and covers the requested scope |
| 2 | PLAN | agent-skills:planning-and-task-breakdown — dependency-ordered, vertically sliced tasks into `tasks/plan.md` *(the `/plan` phase)* | Every task has acceptance criteria and a verification step |
| 3 | **GATE** | Present spec summary + full plan + the escalation policy you will run under. Wait for an unambiguous affirmative ("approve", "go", "yes"). Hedged answers ("looks reasonable", "I guess") are **not** approval | Explicit approval recorded in the state file |
| 4 | BUILD | agent-skills:incremental-implementation with agent-skills:test-driven-development, per task: RED → GREEN → full suite → build → commit → mark complete. Stage only that task's files — never `git add -A` *(`/build auto`'s loop, restated because the command will not run itself)* | Every task complete, suite green, build clean |
| 5 | VERIFY | Full test suite, lint, typecheck, build from a clean state. Browser-facing change → agent-skills:browser-testing-with-devtools | All checks green on the current HEAD |
| 6 | REVIEW | agent-skills:code-review-and-quality — five-axis pass on the accumulated diff *(the `/review` phase)* | No Critical findings; Important findings fixed or explicitly deferred with a reason |
| 7 | SIMPLIFY | agent-skills:code-simplification — only if review flagged complexity. Behavior-preserving; tests stay green *(the `/code-simplify` phase)* | Tests green, diff smaller or clearer |
| 8 | SHIP | agent-skills:shipping-and-launch plus the fan-out spelled out below → go/no-go + rollback plan. **Produce the decision; never execute the deploy** *(the `/ship` phase)* | Written GO/NO-GO with a rollback plan |

### Phase 8 — the ship fan-out, restated

`/ship`'s orchestration lives in that command's body, not in the skill it loads, so run it here directly:

1. Load agent-skills:shipping-and-launch.
2. Spawn `code-reviewer`, `security-auditor`, and `test-engineer` against the accumulated diff. **Issue all three calls in a single turn** so they run in parallel — with the Agent tool where the harness has one (`subagent_type` matching each persona's `name`), otherwise run each persona's prompt in sequence and merge as if they had returned together. A user-defined persona in `.claude/agents/` wins over the plugin's.
3. Merge the three reports yourself, in the main context: promote Critical/High security findings to launch blockers, resolve duplicate findings between reviewers, and check what no persona covers — accessibility, infrastructure, documentation.
4. Write the verdict — GO or NO-GO — with acknowledged risks and a rollback plan.

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
| # | Feature | Slug | Branch | Base | Depends on | Status | PR |
|---|---------|------|--------|------|-----------|--------|-----|
| 1 | Location resolution | location | feat/location | main | — | shipped | #41 |
| 2 | Event feed | event-feed | feat/event-feed | feat/location | 1 | ready | #42 (draft) |
| 3 | Visibility score | visibility | feat/visibility | feat/event-feed | 2 | deferred (deps) | — |
```

Status is one of `pending` → `in-progress` → `ready` (a GO decision is written, and with `--pr` a draft PR is open and waiting on a human) → `shipped` (a human merged it), plus `blocked` and `deferred (deps)`.

### Branching

- **Base** is the branch the run started from. Independent features branch from it directly.
- **A feature with declared dependencies branches from its last dependency's branch**, not from base — otherwise it cannot see code it is specified to build on. Record that parent in the registry's Base column.
- After a feature's ship decision, return to base and leave the branch intact. **Never merge and never deploy** — merging into a shared branch is outward-facing (trigger 1). With `--pr`, open a draft PR per the rules below; without it, leave the branch for a human.

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

### Draft pull requests (`--pr`)

A draft PR per shipped feature turns the registry into something reviewable — each feature arrives as its own diff, carrying its own ship decision, in the order it should merge.

**Open one only when all of these hold:**

1. The feature's ship decision is **GO**. A NO-GO or blocked feature gets no PR — an open PR is a request for someone's attention, and a feature you already know is broken hasn't earned it.
2. The branch has commits ahead of its base, and the working tree is clean.
3. No open PR already exists for that head branch. Re-running the loop must not open a second one.
4. The security pass found nothing Critical or High. Pushing publishes; publishing a known secret or vulnerability is worse than a delayed PR.

**How to open it:**

- Push the feature branch to the remote: `git push -u origin <branch>`. Never `--force`, never push anything but that branch.
- Use the repo's PR tooling — the `gh` CLI, a GitHub MCP server, or whatever the project already uses. If none is available, record the intent in the registry and move on. A missing PR tool must never fail a run that has already produced working code.
- **Base the PR on the feature's base branch from the registry**, not on `main`. A stacked feature PRs into its parent so the diff shows only that feature's work. GitHub retargets a child PR when its parent's branch is deleted on merge — but say the intended merge order in the body rather than relying on that.
- **Draft, always.** Never mark it ready for review, never enable auto-merge, never merge it.

**What goes in the body:**

Check for a PR template (`.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/`, or the repo root) and fill its sections in. Failing that, write:

- What the feature does, and the spec section it implements
- The ship decision: verdict, acknowledged risks, rollback plan
- Review findings deferred rather than fixed, with the reason
- Tasks completed and their commits
- Merge order — which PRs must land first
- A line saying the branch was produced by an autonomous `/sdlc` run and what was verified (tests, build, review, security). A reviewer is entitled to know how the code got there.

**When something goes wrong:** a rejected push (the remote has diverged) is an escalation, not a thing to force through — stop and ask. A PR that fails to open is recorded in the registry as `pr: failed — <reason>` and the loop continues to the next feature.

Record the PR URL in the feature's state file as a `PR:` line, so the notification hook can tell you a review is waiting.

### Budgets

Per-feature budgets are per feature — feature 3 starts with a fresh 3 review cycles. The consecutive-blocked counter in rule 6 is the only budget that spans features.

## Status and resume

`/sdlc status` answers "where did I leave this?" — and a run that resumes prints the same board before doing anything, so you never have to ask.

**`status` is strictly read-only.** It reads files and queries git; it never writes, commits, pushes, or changes a branch. Reporting on a run must never disturb it.

### Reconstruct from four sources, not one

The registry is what the loop *believes*. Confirm it against reality before showing it:

| Source | What it gives |
|--------|---------------|
| `tasks/features.md` | Recorded status, branch, base, dependencies, PR |
| `tasks/[feature]/sdlc-state.md` | Phase, budgets spent, open escalations and questions, PR URL |
| Git | Whether the branch exists, commits ahead of base, whether it's merged, last commit date |
| PR tooling (`--pr` runs) | Whether the PR is open, draft, merged, or closed |

A stale registry is worse than no registry — it tells you a feature is waiting when it actually shipped. Reconcile:

- Recorded `ready` or `in-progress`, but the branch is merged into base → it **shipped**; the registry is stale.
- Recorded `in-progress`, but the branch doesn't exist → the branch was deleted. Report it; do not guess whether the work merged or was thrown away.
- Recorded `in-progress`, but the branch has no commits ahead of base → nothing was built; it's effectively `pending`.
- PR merged → `shipped`. PR closed unmerged → `blocked`, and it needs a decision.
- In `status`, **report** drift and stop there. Only a resuming run may correct the registry, and it says so when it does.

### The board

```
SDLC — SPEC.md — 8 features — base: main — last activity 6 days ago

  #  Feature           Status        Phase       Branch            PR
  1  Location          shipped       —           (merged)          #41 merged
  2  Event feed        ready         DONE        feat/event-feed   #42 draft  ← your review
  3  Visibility score  in-progress   BUILD 4/8   feat/visibility   —
  4  Weather overlay   blocked       BUILD 2/6   feat/weather      —          ← trigger 1
  5  Event detail      deferred      —           —                 —          (waits on 3)

Waiting on you (2)
  • Feature 4 — trigger 1 (secrets): needs an API key. Options: <a> <b> <c>
  • PR #42 — draft, GO verdict, waiting for review

Resume point: feature 3, BUILD phase, task 4 of 7
Budgets: review 1/3 · fix attempts 0/2 · consecutive blocked 1
Drift: registry says feature 1 is `ready`, but feat/location merged into main 5 days ago
```

Order features by the registry, not by status — the merge order is the thing a reader is reconstructing. Whole-spec runs get the same board with one row.

### Resuming after a break

1. **Print the board first.** In stepped mode, confirm the resume point before continuing. In auto mode, print and continue — but say what you're picking up, because a run resumed into the wrong phase is expensive to unwind.
2. **Check whether base has moved.** If base has advanced since a feature branched, say so: that feature was built against an older tree, and its tests passed against a baseline that no longer exists. Merge base into the branch before trusting its green.
3. **Re-run preflight.** A week-old working tree may be dirty, dependencies stale, or the toolchain moved.
4. **Escalate drift you cannot resolve** — a deleted branch, a PR closed unmerged, a base that no longer contains a dependency's commits. These are trigger 2: the state doesn't tell you what was decided, and guessing produces confident nonsense.

## Escalation policy

This is the part that decides how often you interrupt the user. Apply it literally.

### Stop and ask — critical

1. **Irreversible or outward-facing.** Anything you cannot undo with `git revert`: schema migrations that drop or transform data, deletions, deploys and releases, payments or billing, auth/authz/permission changes, secrets and credentials, infra/DNS, sending mail or notifications, writes to third-party systems. The single carve-out is `--pr`, which authorizes pushing a feature branch and opening a **draft** PR under the rules above — marking one ready for review, enabling auto-merge, or merging anything stays here.
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
PR: <url>            (per-feature runs with --pr, once the draft PR is open)

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

Four markers matter to anything watching the file from outside: `Approved at gate: pending` while the plan awaits approval, `[open]` on an escalation waiting on a human, `Phase: DONE` once the ship decision is written, and `PR:` carrying the draft PR's URL. A scheduler uses them to decide whether to re-invoke or hand back; the [sdlc-notify hook](../../hooks/SDLC-NOTIFY.md) uses them to decide whether to page you.

## Final report

Phases completed · tasks and commits · tests added · review findings fixed vs deferred · every autonomous decision worth knowing about · the ship decision and rollback plan · anything left for the user. State clearly what was **not** done and why.

In per-feature mode, report per feature — branch, commits, ship verdict, and blocker if any — then the parked escalations as one batch, and say plainly which branches (or draft PRs) are waiting on a human and in what order they should merge.

## Running it unattended

`/sdlc auto` is a single supervised run. To have it run on a schedule, in headless mode, or in CI — and to tune which triggers actually stop the loop — see [docs/autonomous-sdlc.md](../../docs/autonomous-sdlc.md).
