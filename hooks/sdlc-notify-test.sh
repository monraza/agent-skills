#!/bin/bash
# sdlc-notify-test.sh — Tests for the SDLC notification hook
#
# Runs the hook against synthetic hook payloads and state files, capturing
# delivery through SDLC_NOTIFY_CMD so nothing leaves the machine.
#
# Usage: bash hooks/sdlc-notify-test.sh

set -uo pipefail

HOOK="$(cd "$(dirname "$0")" && pwd)/sdlc-notify.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# ── Harness ───────────────────────────────────────────────────────────────────

# run <payload-json> [state-file-contents] — returns hook output in $CAPTURED
run() {
  local payload="$1" state="${2-}"
  : > "$WORK/captured"
  if [ -n "$state" ]; then
    mkdir -p "$WORK/tasks"
    printf '%s\n' "$state" > "$WORK/tasks/sdlc-state.md"
  else
    rm -f "$WORK/tasks/sdlc-state.md"
  fi
  printf '%s' "$payload" | \
    CLAUDE_PROJECT_DIR="$WORK" \
    SDLC_NOTIFY_CMD="cat >> $WORK/captured" \
    SDLC_NOTIFY_LEVEL="${LEVEL_OVERRIDE:-review}" \
    bash "$HOOK" 2>/dev/null
  HOOK_EXIT=$?
  CAPTURED="$(cat "$WORK/captured" 2>/dev/null)"
}

# run_feature <payload> <slug> <state> — per-feature run, no top-level state file
run_feature() {
  local payload="$1" slug="$2" state="$3"
  : > "$WORK/captured"
  rm -f "$WORK/tasks/sdlc-state.md"
  mkdir -p "$WORK/tasks/$slug"
  printf '%s\n' "$state" > "$WORK/tasks/$slug/sdlc-state.md"
  printf '%s' "$payload" | \
    CLAUDE_PROJECT_DIR="$WORK" \
    SDLC_NOTIFY_CMD="cat >> $WORK/captured" \
    SDLC_NOTIFY_LEVEL="${LEVEL_OVERRIDE:-review}" \
    bash "$HOOK" 2>/dev/null
  HOOK_EXIT=$?
  CAPTURED="$(cat "$WORK/captured" 2>/dev/null)"
}

reset_dedupe() { rm -f "$WORK/.claude/.sdlc-notify-state"; }

check() {
  local label="$1" condition="$2"
  if [ "$condition" = "1" ]; then
    printf '  ✓  %s\n' "$label"; pass=$((pass + 1))
  else
    printf '  ✗  %s\n' "$label"; fail=$((fail + 1))
  fi
}

contains() { case "$CAPTURED" in *"$1"*) echo 1 ;; *) echo 0 ;; esac; }
is_silent() { [ -z "$CAPTURED" ] && echo 1 || echo 0; }

BLOCKED_STATE='# SDLC run — feat/x
Phase: BUILD (4/8)
Approved at gate: yes — 2026-08-19

## Escalations
- [open] trigger 1 (secrets) — ISS pass API key needed'

echo "Testing sdlc-notify hook..."
echo

# ── Silence when there is nothing to say ──────────────────────────────────────

reset_dedupe
run '{"hook_event_name":"Stop"}'
check "Stop with no state file is silent (not an sdlc run)" "$(is_silent)"

reset_dedupe
run '{"hook_event_name":"PostToolUse","tool_input":{"file_path":"/x/src/index.ts"}}' "$BLOCKED_STATE"
check "PostToolUse on an unrelated file is silent" "$(is_silent)"

reset_dedupe
run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: BUILD (4/8)
Approved at gate: yes — 2026-08-19'
check "Stop mid-phase with nothing pending is silent at level=review" "$(is_silent)"

# ── The blocking cases ────────────────────────────────────────────────────────

reset_dedupe
run '{"hook_event_name":"Stop"}' "$BLOCKED_STATE"
check "open escalation on Stop notifies BLOCKED" "$(contains '[BLOCKED]')"
check "notification carries the escalation text" "$(contains 'ISS pass API key needed')"

reset_dedupe
run '{"hook_event_name":"PostToolUse","tool_input":{"file_path":"/x/tasks/sdlc-state.md"}}' "$BLOCKED_STATE"
check "state-file write notifies mid-run, before the agent stops" "$(contains '[BLOCKED]')"

reset_dedupe
run '{"hook_event_name":"Notification","message":"Claude needs your permission to use Bash"}'
check "Notification event notifies INPUT with no state file" "$(contains '[INPUT]')"
check "INPUT carries the harness message" "$(contains 'permission to use Bash')"

reset_dedupe
run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: GATE (3/8)
Approved at gate: pending'
check "pending gate notifies APPROVAL" "$(contains '[APPROVAL]')"

# ── Review-level cases ────────────────────────────────────────────────────────

reset_dedupe
run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: BUILD (4/8)
Approved at gate: yes — 2026-08-19

## Open questions (batched, non-blocking)
- Ephemeris library choice — proceeding on: astronomy-engine

## Escalations'
check "batched questions on Stop notify QUESTIONS" "$(contains '[QUESTIONS]')"
check "QUESTIONS carries the question text" "$(contains 'Ephemeris library choice')"

reset_dedupe
run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: DONE
Approved at gate: yes — 2026-08-19'
check "finished run notifies DONE" "$(contains '[DONE]')"

# ── Precedence ────────────────────────────────────────────────────────────────

reset_dedupe
run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: DONE
Approved at gate: yes

## Open questions
- something minor

## Escalations
- [open] trigger 3 (security) — Critical finding in review'
check "an open escalation outranks DONE and QUESTIONS" "$(contains '[BLOCKED]')"

# ── Level filtering ───────────────────────────────────────────────────────────

reset_dedupe
LEVEL_OVERRIDE=blocking run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: DONE
Approved at gate: yes'
check "level=blocking suppresses DONE" "$(is_silent)"
unset LEVEL_OVERRIDE

reset_dedupe
LEVEL_OVERRIDE=all run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: BUILD (4/8)
Approved at gate: yes'
check "level=all surfaces a mid-phase PAUSED stop" "$(contains '[PAUSED]')"
unset LEVEL_OVERRIDE

# ── Dedupe ────────────────────────────────────────────────────────────────────

reset_dedupe
run '{"hook_event_name":"Stop"}' "$BLOCKED_STATE"
first="$(contains '[BLOCKED]')"
run '{"hook_event_name":"Stop"}' "$BLOCKED_STATE"
second="$(is_silent)"
check "identical state notifies once, then stays quiet" \
  "$([ "$first" = "1" ] && [ "$second" = "1" ] && echo 1 || echo 0)"

run '{"hook_event_name":"Stop"}' '# SDLC run
Phase: BUILD (5/8)
Approved at gate: yes

## Escalations
- [open] trigger 5 (scope) — new dependency needs a decision'
check "a different escalation breaks the dedupe and notifies again" "$(contains 'new dependency')"

# ── Per-feature runs (/sdlc auto features) ────────────────────────────────────

reset_dedupe
run_feature '{"hook_event_name":"Stop"}' 'event-feed' '# SDLC run — feat/event-feed
Phase: BUILD (4/8)
Approved at gate: yes

## Escalations
- [open] trigger 5 (scope) — new dependency needs a decision'
check "finds tasks/<feature>/sdlc-state.md when there is no top-level state" "$(contains '[BLOCKED]')"
check "names the feature in the alert" "$(contains 'feature: event-feed')"

reset_dedupe
rm -rf "${WORK:?}/tasks"
mkdir -p "$WORK/tasks/feature-a" "$WORK/tasks/feature-b"
printf '# a\nPhase: DONE\nApproved at gate: yes\n' > "$WORK/tasks/feature-a/sdlc-state.md"
sleep 1
printf '# b\nPhase: BUILD (4/8)\nApproved at gate: yes\n\n## Escalations\n- [open] trigger 2 — spec gap in feature b\n' \
  > "$WORK/tasks/feature-b/sdlc-state.md"
: > "$WORK/captured"
printf '%s' '{"hook_event_name":"Stop"}' | CLAUDE_PROJECT_DIR="$WORK" \
  SDLC_NOTIFY_CMD="cat >> $WORK/captured" bash "$HOOK" 2>/dev/null
CAPTURED="$(cat "$WORK/captured")"
check "picks the most recently updated feature when several are in flight" "$(contains 'spec gap in feature b')"

reset_dedupe
rm -rf "${WORK:?}/tasks"
mkdir -p "$WORK/tasks/feature-c"
printf '# c\nPhase: BUILD\nApproved at gate: yes\n\n## Escalations\n- [open] trigger 4 — stuck in feature c\n' \
  > "$WORK/tasks/feature-c/sdlc-state.md"
: > "$WORK/captured"
printf '%s' '{"hook_event_name":"PostToolUse","tool_input":{"file_path":"'"$WORK"'/tasks/feature-c/sdlc-state.md"}}' \
  | CLAUDE_PROJECT_DIR="$WORK" SDLC_NOTIFY_CMD="cat >> $WORK/captured" bash "$HOOK" 2>/dev/null
CAPTURED="$(cat "$WORK/captured")"
check "PostToolUse classifies the exact file that was written" "$(contains 'stuck in feature c')"

# Two features blocked on different things are two alerts, not one.
reset_dedupe
rm -rf "${WORK:?}/tasks"
run_feature '{"hook_event_name":"Stop"}' 'feat-one' '# one
Phase: BUILD
Approved at gate: yes

## Escalations
- [open] trigger 1 — API key needed'
first="$(contains 'feat-one')"
run_feature '{"hook_event_name":"Stop"}' 'feat-two' '# two
Phase: BUILD
Approved at gate: yes

## Escalations
- [open] trigger 1 — API key needed'
second="$(contains 'feat-two')"
check "dedupe is per feature — identical blockers on two features both alert" \
  "$([ "$first" = "1" ] && [ "$second" = "1" ] && echo 1 || echo 0)"

rm -rf "${WORK:?}/tasks"

# ── Robustness ────────────────────────────────────────────────────────────────

reset_dedupe
run 'not json at all' "$BLOCKED_STATE"
check "malformed hook input exits 0" "$([ "$HOOK_EXIT" = "0" ] && echo 1 || echo 0)"

reset_dedupe
run '{}' "$BLOCKED_STATE"
check "empty payload exits 0" "$([ "$HOOK_EXIT" = "0" ] && echo 1 || echo 0)"

reset_dedupe
run '{"hook_event_name":"Stop"}' "$BLOCKED_STATE"
check "delivery is logged to .claude/sdlc-notify.log" \
  "$(grep -q 'BLOCKED' "$WORK/.claude/sdlc-notify.log" 2>/dev/null && echo 1 || echo 0)"

# ── Result ────────────────────────────────────────────────────────────────────

echo
echo "$((pass + fail)) checks — $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
