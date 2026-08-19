# Worked example: `/sdlc auto` on a new app

A full trace of the [autonomous SDLC loop](../autonomous-sdlc.md) against one idea — *"an app for celestial events happening in my area"* — showing where it runs unattended, where it stops, and why.

The point of the example is the **escalation policy in action**. A loop that never interrupts you is unsafe; one that interrupts constantly is worse than doing it yourself. This is what the middle looks like.

---

## What you type

```
/sdlc auto a web app showing celestial events visible from my location
```

## Phase 1 — DEFINE (a conversation, by nature)

`/spec` cannot guess a product, so this phase asks. It batches into one round rather than trickling:

> **Scope questions (1 of 1):**
> 1. "My area" — browser geolocation, manual city entry, or both? *(recommend: both — geolocation is denied often enough that manual entry can't be a follow-up)*
> 2. Which events? *(recommend: meteor showers, ISS passes, eclipses, planetary conjunctions, moon phases)*
> 3. Does "visible" account for weather and light pollution, or only astronomical position?
> 4. Notifications, or open-the-app-and-look?
> 5. Accounts and saved locations, or stateless?

You answer once. It writes `SPEC.md` — objective, the six core areas, and a **boundaries** section. Every boundary written here is one escalation you don't get interrupted by later.

> **Shortcut:** write `SPEC.md` yourself first and this phase is skipped entirely, leaving the gate as your only touchpoint.

## Phase 2 — PLAN

`/plan` writes `tasks/plan.md`, sliced vertically — each task is one working path, not a layer:

| # | Task | Depends on |
|---|------|------------|
| 1 | Location resolution: geolocation → manual entry → persisted | — |
| 2 | Ephemeris core: rise/set/altitude for sun, moon, planets given lat/lon/date | — |
| 3 | Event feed: next 30 days, sorted | 1, 2 |
| 4 | Visibility score: altitude at darkness + moon interference | 2, 3 |
| 5 | Weather overlay: cloud cover per event window | 3 |
| 6 | Event detail: what it is, when to look, which direction | 3 |
| 7 | ISS pass predictions | 1 |
| 8 | Responsive layout + red-on-black night theme | 3, 6 |

## Phase 3 — GATE ← your only planned approval

Spec summary, full plan, and the escalation policy it will run under. You say "go." That is the last mandatory human step.

## Phases 4–8 — the autonomous stretch

Eight tasks, each RED → GREEN → full suite → build → commit, then verify → review → ship decision.

**Decided alone** — logged to the state file, never surfaced as questions:

- Vitest over Jest (matched the existing config)
- Extracted `toLocalMidnight()` after the third duplicate
- Added circumpolar test cases at lat 68°, where there is no rise or set at all — the naive implementation returned `NaN`
- Added a "moon washes out this shower" case after review flagged the interaction
- Cached moon-phase results per day; lint, format, and typecheck fixes throughout
- Wrote the empty-state copy for "nothing visible for six nights"

---

## The three times it stops

### ① Task 2 — a new dependency

*Trigger 5 (scope expansion) — non-blocking, so it kept building and asked at the phase boundary.*

> Ephemeris math isn't something I should hand-roll. Two options:
> - **`astronomy-engine`** — MIT, no network, no key, computes offline. *Recommended.*
> - A hosted ephemeris API — a network dependency and a key on every page load.
>
> The spec named neither. I proceeded on `astronomy-engine` and finished tasks 2–4 against it; say the word and I'll swap before task 7.
>
> Also batched: **task 5's timezone bug.** Event times drift an hour across the DST boundary. Two fix attempts failed, both treating the local offset as fixed. My read is that the pipeline needs to carry UTC and format at the edge, which touches tasks 3–5. Want that refactor?

### ② Task 7 — an API key

*Trigger 1 (secrets, outward-facing) — blocking, asked immediately.*

> ISS passes need an N2YO API key. That's a credential and an outward-facing call, so I stopped rather than deciding.
>
> Options: (a) you provide a key and I put it behind a server route so it never reaches the client, (b) drop ISS passes to a follow-up task, (c) a different provider. **Recommend (a)** — a client-side key on a public app is a free key for the internet.

### ③ REVIEW → SHIP — a Critical security finding

*Trigger 3 — blocking.*

> `security-auditor` returned a Critical: the weather API key is referenced as `NEXT_PUBLIC_WEATHER_KEY`, which inlines it into the client bundle. Exactly the trap flagged at ②, reintroduced in task 5. The fix is a server-side route handler, ~20 lines, patch ready. Confirming before touching anything auth-adjacent.

Then the ship decision — **written, never executed**:

```
## Ship Decision: GO (after the API-key fix)

Blockers (fixed): weather key exposed client-side → moved to route handler
Recommended: no rate limiting on /api/weather — one bot could burn the quota
Acknowledged risks: light pollution data is a static atlas, not live
Rollback: revert to <sha>, redeploy — RTO ~4 min.
          Trigger: >2% error rate on /api/weather, or geolocation failures
```

---

## The state file mid-run

```markdown
# SDLC run — feat/celestial-events — started 2026-08-19
Mode: auto
Phase: BUILD (4/8)
Approved at gate: yes — 2026-08-19

## Tasks
- [x] 1. Location resolution — commit 3f2a891
- [x] 2. Ephemeris core — commit 8c14d02
- [x] 3. Event feed — commit a91e7b5
- [ ] 4. Visibility score
- [ ] 5. Weather overlay — BLOCKED, see escalations

## Budgets
Review cycles: 0/3 · Fix attempts on current failure: 2/2 · Ship attempts: 0/2

## Decisions
- Vitest over Jest (matched existing config)
- astronomy-engine for ephemeris (offline, MIT) — see open questions

## Open questions (batched, non-blocking)
- Ephemeris library choice — proceeding on: astronomy-engine

## Escalations
- [open] trigger 4 (stuck) — DST offset bug in task 5, 2/2 attempts spent
```

This file is why the loop survives interruption. Close the laptop mid-run; `/sdlc auto` tomorrow resumes at task 4 with budgets and decisions intact. It is also what the [notification hook](../../hooks/SDLC-NOTIFY.md) watches — `[open]` and `Phase: DONE` are the markers that tell it to page you.

## Running this one unattended

```bash
claude -p "/sdlc auto" --permission-mode acceptEdits --max-turns 200
```

Headless has nobody to answer ①–③, so it stops and records them. That's correct behavior, not a failure — pair it with the notify hook so a stop reaches you instead of sitting in a terminal.

For an app that touches keys and a deploy target, add the wall as well as the policy:

```json
{ "permissions": { "deny": ["Read(./.env*)", "Bash(*vercel deploy*)", "Bash(*netlify deploy*)"] } }
```

That turns ② and ③ from *policy the agent follows* into *a boundary it cannot cross* — the difference between a loop you trust overnight and one you hover over.

## The same spec, feature by feature

The run above builds all eight tasks on one branch. Your alternative is one branch and one review per feature:

```
/sdlc auto features --pr
```

Same spec, same escalation policy, different granularity. It derives the feature list from `SPEC.md`, approves it once, then loops: cut `feat/<slug>` → plan → build → verify → review → ship decision → draft PR → back to base → next feature.

What changes in practice:

- **Escalation ② parks instead of blocking.** ISS passes need an API key you haven't supplied, so feature 7 is marked `blocked` and the loop moves on to feature 8 rather than idling. You get every blocker in one batch at the end.
- **Dependent features stack.** Visibility score depends on the event feed, so it branches from `feat/event-feed` and its PR targets that branch — the diff shows the scoring work, not the feed it builds on.
- **Review scope collapses.** Instead of one review of eight tasks, `code-reviewer` sees one feature at a time. The DST bug from ① is far harder to miss in a 200-line diff than a 2,000-line one.
- **You get a merge queue.** Seven draft PRs in dependency order, each with its own GO verdict and rollback plan, waiting on you. Nothing is merged and nothing is marked ready for review.

The trade is integration risk: features that pass in isolation can still conflict when merged. Ship decisions are per feature; the integration test is still yours.

## Related

- [autonomous-sdlc.md](../autonomous-sdlc.md) — running the loop headless, scheduled, or in CI
- [`/sdlc` command](../../.claude/commands/sdlc.md) — the loop and its full escalation policy
- [sdlc-notify hook](../../hooks/SDLC-NOTIFY.md) — get told when the loop blocks
