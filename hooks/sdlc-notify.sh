#!/bin/bash
# sdlc-notify.sh — Hook for Notification, Stop, PostToolUse (Write|Edit)
#
# Pages a human when an autonomous /sdlc run needs one.
#
#   Notification            → the harness itself is waiting (permission prompt, idle)
#   PostToolUse Write|Edit  → tasks/sdlc-state.md just gained an [open] escalation
#   Stop                    → the run stopped; classify why from the state file
#
# Reads tasks/sdlc-state.md, classifies the run's state, dedupes against the
# last thing it sent, and delivers through the first channel configured:
# SDLC_NOTIFY_CMD, SDLC_NOTIFY_WEBHOOK, desktop notifier, terminal bell.
# Always also appends to .claude/sdlc-notify.log.
#
# Never blocks, never fails the run: every path exits 0.
#
# Dependencies: none required. Uses jq and curl when present.

# Deliberately no `set -e`: a notifier must not abort the run it watches.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
STATE_FILE="${SDLC_STATE_FILE:-$PROJECT_DIR/tasks/sdlc-state.md}"
DEDUPE_FILE="${SDLC_NOTIFY_DEDUPE:-$PROJECT_DIR/.claude/.sdlc-notify-state}"
LOG_FILE="${SDLC_NOTIFY_LOG:-$PROJECT_DIR/.claude/sdlc-notify.log}"

# blocking → BLOCKED, APPROVAL, INPUT
# review   → the above plus QUESTIONS, DONE   (default)
# all      → the above plus PAUSED (one ping per phase stop)
LEVEL="${SDLC_NOTIFY_LEVEL:-review}"

if [ -t 0 ]; then INPUT="{}"; else INPUT=$(cat 2>/dev/null); fi
[ -z "$INPUT" ] && INPUT="{}"

# ── Parse hook input ──────────────────────────────────────────────────────────
# jq when available; a sed fallback keeps notifications working without it,
# since losing alerts to a missing dependency defeats the purpose of the hook.
json_field() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r --arg k "$key" 'getpath($k | split(".")) // empty' 2>/dev/null
  else
    printf '%s' "$INPUT" \
      | sed -n "s/.*\"${key##*.}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
      | head -1
  fi
}

EVENT=$(json_field 'hook_event_name')
FILE_PATH=$(json_field 'tool_input.file_path')
MESSAGE=$(json_field 'message')

# ── Fast exits ────────────────────────────────────────────────────────────────
# PostToolUse fires on every write in the session; only the state file matters.
if [ "$EVENT" = "PostToolUse" ]; then
  case "$(basename "${FILE_PATH:-}")" in
    sdlc-state.md) ;;
    *) exit 0 ;;
  esac
fi

# No state file means no /sdlc run in flight. Stay silent rather than pinging
# on every turn of an ordinary session.
if [ "$EVENT" != "Notification" ] && [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# ── Classify ──────────────────────────────────────────────────────────────────
# Sets KIND, TITLE, DETAIL.
KIND=""; TITLE=""; DETAIL=""

state_get() { [ -f "$STATE_FILE" ] && grep -m1 "$1" "$STATE_FILE" 2>/dev/null; }

OPEN_ESCALATIONS=$(grep -E '^[[:space:]]*-[[:space:]]*\[open\]' "$STATE_FILE" 2>/dev/null)
PHASE=$(state_get '^Phase:' | sed 's/^Phase:[[:space:]]*//')
GATE=$(state_get '^Approved at gate:' | sed 's/^Approved at gate:[[:space:]]*//')
QUESTIONS=$(sed -n '/^## Open questions/,/^## /p' "$STATE_FILE" 2>/dev/null \
  | grep -E '^[[:space:]]*-[[:space:]]' | grep -v '^[[:space:]]*-[[:space:]]*$')

if [ "$EVENT" = "Notification" ]; then
  KIND="INPUT"
  TITLE="Claude is waiting on you"
  DETAIL="${MESSAGE:-The session needs input or a permission decision.}"
elif [ -n "$OPEN_ESCALATIONS" ]; then
  KIND="BLOCKED"
  TITLE="SDLC run blocked — human decision needed"
  DETAIL="$OPEN_ESCALATIONS"
elif printf '%s' "$GATE" | grep -qiE '^(pending|no)'; then
  KIND="APPROVAL"
  TITLE="SDLC run waiting at the plan gate"
  DETAIL="The plan is ready and needs your approval before the autonomous stretch begins."
elif printf '%s' "$PHASE" | grep -qi 'DONE'; then
  KIND="DONE"
  TITLE="SDLC run finished"
  DETAIL="Ship decision written. Review it before acting on it."
elif [ -n "$QUESTIONS" ] && [ "$EVENT" = "Stop" ]; then
  KIND="QUESTIONS"
  TITLE="SDLC run has batched questions for you"
  DETAIL="$QUESTIONS"
elif [ "$EVENT" = "Stop" ]; then
  KIND="PAUSED"
  TITLE="SDLC run stopped mid-phase"
  DETAIL="Phase: ${PHASE:-unknown}. Re-invoke /sdlc auto to resume."
else
  exit 0
fi

# ── Level filter ──────────────────────────────────────────────────────────────
case "$LEVEL" in
  blocking) case "$KIND" in BLOCKED|APPROVAL|INPUT) ;; *) exit 0 ;; esac ;;
  review)   case "$KIND" in PAUSED) exit 0 ;; esac ;;
  all)      ;;
  *)        case "$KIND" in PAUSED) exit 0 ;; esac ;;
esac

# ── Dedupe ────────────────────────────────────────────────────────────────────
# Stop fires on every turn. Without this you get the same alert until the run
# ends, and alerts you learn to ignore are worse than none.
SIGNATURE="${KIND}:$(printf '%s' "$DETAIL" | cksum 2>/dev/null | tr -d ' ')"
if [ -f "$DEDUPE_FILE" ] && [ "$(cat "$DEDUPE_FILE" 2>/dev/null)" = "$SIGNATURE" ]; then
  exit 0
fi
mkdir -p "$(dirname "$DEDUPE_FILE")" 2>/dev/null
printf '%s' "$SIGNATURE" > "$DEDUPE_FILE" 2>/dev/null

# ── Deliver ───────────────────────────────────────────────────────────────────
BODY="[$KIND] $TITLE

$DETAIL

State: $STATE_FILE"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
printf '%s  [%s] %s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$KIND" "$TITLE" \
  "$(printf '%s' "$DETAIL" | tr '\n' ' ')" >> "$LOG_FILE" 2>/dev/null

delivered=0

if [ -n "${SDLC_NOTIFY_CMD:-}" ]; then
  printf '%s' "$BODY" | SDLC_KIND="$KIND" SDLC_TITLE="$TITLE" SDLC_DETAIL="$DETAIL" \
    sh -c "$SDLC_NOTIFY_CMD" >/dev/null 2>&1 && delivered=1
fi

if [ "$delivered" -eq 0 ] && [ -n "${SDLC_NOTIFY_WEBHOOK:-}" ] && command -v curl >/dev/null 2>&1; then
  if command -v jq >/dev/null 2>&1; then
    payload=$(jq -cn --arg t "$BODY" '{text: $t}')
  else
    payload="{\"text\": \"$(printf '%s' "$BODY" | tr '\n' ' ' | sed 's/"/\\"/g')\"}"
  fi
  curl -sS -m 10 -X POST -H 'Content-Type: application/json' \
    -d "$payload" "$SDLC_NOTIFY_WEBHOOK" >/dev/null 2>&1 && delivered=1
fi

if [ "$delivered" -eq 0 ]; then
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${DETAIL//\"/}\" with title \"${TITLE//\"/}\" sound name \"Submarine\"" \
      >/dev/null 2>&1 && delivered=1
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send -u critical "$TITLE" "$DETAIL" >/dev/null 2>&1 && delivered=1
  fi
fi

# Terminal bell + stderr always: the last-resort channel that needs no config.
printf '\a\n🔔 %s\n%s\n\n' "$TITLE" "$DETAIL" >&2

exit 0
