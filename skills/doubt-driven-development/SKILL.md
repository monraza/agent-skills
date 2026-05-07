---
name: doubt-driven-development
description: Subjects every non-trivial decision to a fresh-context adversarial review before it stands. Use when correctness matters more than speed, when working in unfamiliar code, when stakes are high (production, security-sensitive logic, irreversible operations), or any time a confident output would be cheaper to verify now than to debug later.
---

# Doubt-Driven Development

## Overview

A confident answer is not a correct one. Long sessions accumulate context that quietly turns assumptions into "facts" without anyone noticing. Doubt-driven development is the discipline of materializing a fresh-context reviewer — biased to **disprove**, not approve — before any non-trivial output stands.

This is not `/review`. `/review` is a verdict on a finished artifact. This is an in-flight posture: non-trivial decisions get cross-examined while course-correction is still cheap.

## When to Use

A decision is **non-trivial** when at least one of these is true:

- It introduces or modifies branching logic
- It crosses a module or service boundary
- It asserts a property the type system or compiler cannot verify (thread safety, idempotence, ordering, invariants)
- Its correctness depends on context the future reader cannot see
- Its blast radius is irreversible (production deploy, data migration, public API change)

Apply the skill when:

- About to make an architectural decision under uncertainty
- About to commit non-trivial code
- About to claim a non-obvious fact ("this is safe", "this scales", "this matches the spec")
- Working in code you don't fully understand

**When NOT to use:**

- Mechanical operations (renaming, formatting, file moves)
- Following a clear, unambiguous user instruction
- Reading or summarizing existing code
- One-line changes with obvious correctness
- Pure tooling operations (running tests, listing files)
- The user has explicitly asked for speed over verification

If you doubt every keystroke, you ship nothing. The skill applies only to non-trivial decisions as defined above.

## Loading Constraints

This skill is designed for the **main-session orchestrator**, where Step 3 can spawn a fresh-context reviewer.

- **Do NOT add this skill to a persona's `skills:` frontmatter.** A persona that follows Step 3 spawns another persona, which is the orchestration anti-pattern explicitly forbidden by `references/orchestration-patterns.md` ("personas do not invoke other personas").
- **If you find yourself applying this skill from inside a subagent context** (where Claude Code prevents nested subagent spawn): use the manual fallback — rewrite ARTIFACT + CONTRACT as a fresh self-prompt, set a hard mental separator from your prior reasoning, and walk Steps 1–5 as a self-questioning exercise. Or surface to the user that doubt-driven cannot run nested.

## The Process

Copy this checklist when applying the skill:

```
Doubt cycle:
- [ ] Step 1: CLAIM — wrote the claim + why-it-matters
- [ ] Step 2: EXTRACT — isolated artifact + contract, stripped reasoning
- [ ] Step 3: DOUBT — invoked fresh-context reviewer with adversarial prompt
- [ ] Step 4: RECONCILE — classified every finding against the artifact text
- [ ] Step 5: STOP — met stop condition (trivial findings, 3 cycles, or user override)
```

### Step 1: CLAIM — Surface what stands

Name the decision in two or three lines:

```
CLAIM: "The new caching layer is thread-safe under the
        read-heavy workload described in the spec."
WHY THIS MATTERS: a race here corrupts user data and is
                  hard to detect in QA.
```

If you can't write the claim that compactly, you have a vibe, not a decision. Surface it before scrutinizing it.

### Step 2: EXTRACT — Smallest reviewable unit

A fresh-context reviewer needs the **artifact** and the **contract**, not the journey.

- Code: the diff or the function — not the whole file
- Decision: the proposal in 3–5 sentences plus the constraints it has to satisfy
- Claim: the assertion plus the evidence that supposedly supports it

Strip your reasoning. If you hand over conclusions, you'll get back validation of your conclusions. The unit must be small enough that a reviewer can hold it in mind in one read — if it's a 500-line PR, decompose first.

### Step 3: DOUBT — Invoke the fresh-context reviewer

The reviewer's prompt **must be adversarial**. Framing decides the answer.

```
Adversarial review. Find what is wrong with this artifact.
Assume the author is overconfident. Look for:
- Unstated assumptions
- Edge cases not handled
- Hidden coupling or shared state
- Ways the contract could be violated
- Existing conventions this might break
- Failure modes under unexpected input

Do NOT validate. Do NOT summarize. Find issues, or state
explicitly that you cannot find any after thorough examination.

ARTIFACT: <paste artifact>
CONTRACT: <paste contract>
```

**Pass ARTIFACT + CONTRACT only. Do NOT pass the CLAIM.** Handing the reviewer your conclusion biases it toward agreement. The reviewer must independently determine whether the artifact satisfies the contract.

In Claude Code, prefer the existing role-based reviewers in `agents/` — they start with isolated context by design. Pick by domain:

- code-quality concerns → `code-reviewer`
- security boundaries → `security-auditor`
- coverage / test-correctness → `test-engineer`

#### When (and how) to escalate cross-model

For genuinely irreversible decisions (production data migration, security boundary, public API contract), a single-model reviewer shares blind spots with the original author. A different model is colder and catches them.

**Do not assume any specific CLI is installed or invoke it directly.** External tools (Gemini CLI, Codex CLI, etc.) change syntax, require trust flags, need auth, etc. Hardcoded commands break.

When a user is present (interactive session):

1. Pause and ask: *"Do you have a different-model CLI available locally? If so, how would you like me to invoke it, or would you prefer to run it yourself and paste the output back?"*
2. Confirm exact invocation with the user before running.
3. Pass only ARTIFACT + CONTRACT + the adversarial prompt. No session context.
4. Take the output back into Step 4 (RECONCILE) like any other finding.

**Non-interactive fallback** (CI, `/loop`, autonomous-loop, scheduled runs — no user available):

- Skip cross-model entirely. Proceed with single-model findings.
- **Never invoke an external CLI without explicit user authorization** — this is a load-bearing safety property. Cross-model is opt-in, never default.

Cross-model is heavier (cost, latency, network). Reserve it for irreversible / large-blast-radius decisions even when a user is present.

### Step 4: RECONCILE — Fold findings back

The reviewer's output is data, not verdict. **You are still the orchestrator.** Re-read the artifact text against each finding before classifying — rubber-stamping the reviewer is the same failure mode as ignoring it.

For each finding, classify in this **precedence order** (first matching class wins):

1. **Contract misread** — reviewer flagged something specifically because the CONTRACT you provided was unclear or incomplete. Fix the contract first, re-classify on the next cycle.
2. **Valid + actionable** — real issue requiring a change to the artifact. Change it, re-loop.
3. **Valid trade-off** — issue is real but cost of fixing exceeds cost of accepting. Document the trade-off explicitly so the user sees it.
4. **Noise** — reviewer flagged something that's actually correct under context the reviewer didn't have. Note it, move on, and ask: would adding that context to the contract have prevented the false flag?

A fresh reviewer can be wrong because it lacks context. Don't defer just because it's "fresh."

### Step 5: STOP — Bounded loop, not recursion

Stop when:

- Next iteration returns only trivial or already-considered findings, **or**
- 3 cycles completed (escalate to user, don't grind a fourth alone), **or**
- User explicitly says "ship it"

If after 3 cycles the reviewer still surfaces substantive issues, the artifact may not be ready. Surface this to the user — three unresolved cycles is information about the artifact, not a reason to keep looping.

If 3 cycles is "obviously insufficient" because the artifact is large: the artifact is too big — return to Step 2 and decompose. Do not lift the bound.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'm confident, skip the doubt step" | Confidence correlates poorly with correctness on novel problems. Moments of certainty are exactly when blind spots hide. |
| "Spawning a reviewer is expensive" | Debugging a wrong commit in production is more expensive. The check is bounded; the bug isn't. |
| "The reviewer will just nitpick" | Only if unscoped. Constrain the prompt to "issues that would make this fail under the contract." |
| "I'll do doubt at the end with `/review`" | `/review` is a final gate. Doubt-driven catches wrong directions early when course-correction is cheap. By PR time it's too late. |
| "If I doubt every step I'll never ship" | The skill applies to non-trivial decisions, not every keystroke. Re-read "When NOT to Use." |
| "Two opinions are always better than one" | Not when the second has less context and produces noise. Reconcile, don't defer. |
| "The reviewer disagreed so I was wrong" | The reviewer lacks your context — disagreement is information, not verdict. Re-read the artifact, classify, then decide. |
| "Cross-model is always better" | Cross-model is expensive, slow, and tool-fragile. Reserve for irreversible decisions. Routine escalation defeats the cost discipline. |

## Red Flags

- Spawning a fresh-context reviewer for a one-line rename or formatting change
- Treating reviewer output as authoritative without re-reading the artifact text
- Looping >3 cycles without escalating to the user
- Prompting the reviewer with "is this good?" instead of "find issues"
- Skipping doubt under time pressure on a high-stakes decision
- Re-spawning fresh-context on an unchanged artifact (you'll get the same findings; you're stalling)
- **Doubt theater (checkable signal)**: across 2 or more cycles where the reviewer surfaced substantive findings, zero findings were classified as actionable. You are validating, not doubting. Stop and escalate.
- Doubting only after committing — that's `/review`, not doubt-driven development
- Hardcoding an external CLI invocation without confirming with the user that the tool exists, is configured, and accepts that exact syntax
- Stripping the contract from the reviewer's input
- Passing the CLAIM to the reviewer (biases toward agreement)

## Interaction with Other Skills

- **`code-review-and-quality` / `/review`**: complementary. `/review` is post-hoc PR verdict; doubt-driven is in-flight per-decision. Use both.
- **`source-driven-development`**: SDD verifies *facts about frameworks* against official docs. Doubt-driven verifies *your reasoning about the artifact*. SDD checks the API exists; doubt-driven checks you used it correctly under the contract.
- **`test-driven-development`**: TDD's RED step is doubt made concrete — a failing test is a disproof attempt. When TDD applies, that failing test *is* the doubt step for behavioral claims.
- **`debugging-and-error-recovery`**: when the reviewer surfaces a real failure mode, drop into the debugging skill to localize and fix.
- **Repo orchestration rules** (`references/orchestration-patterns.md`): this skill orchestrates from the main session. A persona calling another persona is anti-pattern B — see Loading Constraints above.

## Verification

After applying doubt-driven development:

- [ ] Every non-trivial decision (per the definition above) was named explicitly as a CLAIM before standing
- [ ] At least one fresh-context review per non-trivial artifact
- [ ] The reviewer received ARTIFACT + CONTRACT — NOT the CLAIM, NOT your reasoning
- [ ] The reviewer's prompt was adversarial ("find issues"), not validating ("is it good")
- [ ] Findings were classified against the artifact text (not rubber-stamped) using the precedence: contract misread / actionable / trade-off / noise
- [ ] A stop condition was met (trivial findings, 3 cycles, or user override)
- [ ] Trivial work (mechanical, unambiguous, low-stakes) was **not** subjected to the cycle
- [ ] Cross-model escalation, if used, was confirmed with the user before invocation; in non-interactive mode, cross-model was skipped
