#!/usr/bin/env bash
# Test skill triggering with naive prompts (Antigravity 2.0 version)
# Usage: ./run-test.sh <skill-name> <prompt-file> [max-timeout]
#
# Tests whether Antigravity triggers a skill based on a natural prompt
# (without explicitly mentioning the skill name)
#
# In Antigravity, skills auto-load from plugins -- there is no explicit
# "Skill" tool call -- so detection here is transcript/event-based rather
# than prose-based. The authoritative signal (Check 3) is a `view_file`
# tool-call event, parsed from an `agy --output-format stream-json` NDJSON
# capture, that targets the skill's own SKILL.md. Tool calls are not
# reliably visible in plain `text`-format output at all (docs:
# https://antigravity.google/docs/cli/headless -- "Set --output-format
# stream-json to emit one JSON object per line (NDJSON) as the run
# progresses"), which is why earlier versions of this test -- grepping
# prose output for "view_file"/"SKILL.md" -- could never really pass.
#
# Secondary, informational-only signals (not authoritative; retained only
# as a fallback for when the stream-json capture itself is unavailable):
#   - Skill name mentions in the output text
#   - "I'm using the" / "using the ... skill" announcements
#   - SKILL.md mentions in prose
#   - Behavioral evidence (e.g., subagent dispatch for dispatching-parallel-agents)

set -e

SKILL_NAME="$1"
PROMPT_FILE="$2"
TIMEOUT="${3:-300}"

if [ -z "$SKILL_NAME" ] || [ -z "$PROMPT_FILE" ]; then
    echo "Usage: $0 <skill-name> <prompt-file> [timeout-seconds]"
    echo "Example: $0 systematic-debugging ../../skill-triggering/prompts/systematic-debugging.txt"
    exit 1
fi

# Get script and repo directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$HELPERS_DIR/test-helpers.sh"

# Check agy is available
if ! command -v agy &>/dev/null; then
    echo "[SKIP] 'agy' command not found. Install Antigravity CLI to run this test."
    exit 0
fi

TIMESTAMP=$(date +%s)
OUTPUT_DIR="/tmp/superpowers-agy-tests/${TIMESTAMP}/skill-triggering/${SKILL_NAME}"
mkdir -p "$OUTPUT_DIR"

# Read prompt from file
if [ ! -f "$PROMPT_FILE" ]; then
    echo "[FAIL] Prompt file not found: $PROMPT_FILE"
    exit 1
fi
PROMPT=$(cat "$PROMPT_FILE")

echo "=== Skill Triggering Test (Antigravity) ==="
echo "Skill: $SKILL_NAME"
echo "Prompt file: $PROMPT_FILE"
echo "Timeout: ${TIMEOUT}s"
echo "Output dir: $OUTPUT_DIR"
echo ""

# Copy prompt for reference
cp "$PROMPT_FILE" "$OUTPUT_DIR/prompt.txt"

# Run Antigravity. Two captures of the same prompt: the default (text)
# capture via run_antigravity feeds the informational prose checks below;
# a second, explicit --output-format stream-json capture to its own file
# feeds the authoritative event-based Check 3. (Two agy invocations means
# two model runs -- accepted here because the two capture formats can't
# both come from a single `agy` process per the documented --output-format
# flag, which selects exactly one wire format per run.)
LOG_FILE="$OUTPUT_DIR/agy-output.txt"
STREAM_FILE="$OUTPUT_DIR/agy-stream.jsonl"
cd "$OUTPUT_DIR"

echo "Running agy --print with naive prompt (text capture)..."
OUTPUT=$(run_antigravity "$PROMPT" "$TIMEOUT") || true
echo "$OUTPUT" > "$LOG_FILE"

echo "Running agy --print with naive prompt (stream-json capture for event detection)..."
# Capture run_antigravity's own exit status without letting `set -e` abort
# here on a nonzero exit -- the `&&`/`||` list form is exempt from errexit
# for the command before the final `&&`/`||`, so a failing run still falls
# through to STREAM_EXIT=$? instead of killing the script.
STREAM_OUTPUT=$(run_antigravity "$PROMPT" "$TIMEOUT" "stream-json") && STREAM_EXIT=0 || STREAM_EXIT=$?
# printf, not echo: echo always writes at least a trailing newline, so an
# EMPTY $STREAM_OUTPUT (a failed/empty capture) would still leave the file
# 1 byte long -- making `[ -s "$STREAM_FILE" ]` true even when nothing was
# actually captured. printf '%s' writes zero bytes for an empty string.
printf '%s' "$STREAM_OUTPUT" > "$STREAM_FILE"

STREAM_CAPTURE_OK=false
if [ "$STREAM_EXIT" -eq 0 ] && [ -s "$STREAM_FILE" ]; then
    STREAM_CAPTURE_OK=true
fi

echo ""
echo "=== Results ==="
echo ""

TRIGGERED=false
EVENT_CHECK_RAN=false

# --- Check 3 (authoritative): view_file tool event on the skill's SKILL.md ---
# Pattern per the transcript/event-based detection design: grep the NDJSON
# for a tool-call event named "view_file" whose payload also mentions
# "<skill-name>/SKILL" (i.e. it opened this skill's own SKILL.md). jq is
# used when available for a more structure-tolerant match; otherwise the
# two-stage grep below is the literal fallback.
SKILL_MD_PATTERN="${SKILL_NAME}/SKILL"

if [ "$STREAM_CAPTURE_OK" = "true" ]; then
    EVENT_CHECK_RAN=true
    if command -v jq &>/dev/null; then
        # -R (raw input) + fromjson? processes the capture line-by-line and
        # skips any line that isn't valid JSON on its own, instead of
        # parsing the whole file as one JSON stream. The stream-json capture
        # can contain non-JSON lines (stderr merged in, banner/prose output,
        # etc.); feeding those through the default (non-raw) jq input mode
        # aborts parsing at the first bad line and loses every event that
        # would otherwise have followed it.
        VIEW_FILE_HIT=$(jq -R -c 'fromjson? | .. | objects | select(.name? == "view_file")' "$STREAM_FILE" 2>/dev/null | grep -F "$SKILL_MD_PATTERN" || true)
    else
        VIEW_FILE_HIT=$(grep -E '"name" *: *"view_file"' "$STREAM_FILE" 2>/dev/null | grep -F "$SKILL_MD_PATTERN" || true)
    fi

    if [ -n "$VIEW_FILE_HIT" ]; then
        echo "  [EVENT] view_file(${SKILL_NAME}/SKILL.md) found in stream-json transcript"
        TRIGGERED=true
    else
        echo "  [EVENT] No view_file event targeting ${SKILL_NAME}/SKILL.md found in stream-json transcript"
    fi
else
    echo "  [EVENT] stream-json capture unavailable -- falling back to informational prose checks below"
fi

# --- Checks 1, 2, 4 (informational only -- do NOT set TRIGGERED on their
# own; they're prone to both false positives (the model can name-drop a
# skill without using it) and false negatives (tool calls don't reliably
# show up in `text` output). They only decide TRIGGERED as a genuine
# fallback, when the authoritative event check above couldn't run at all. ---
INFO_HIT=false

# Check 1: Direct skill name mention
if echo "$OUTPUT" | grep -qi "$SKILL_NAME"; then
    echo "  (info) Skill name '$SKILL_NAME' mentioned in output"
    INFO_HIT=true
fi

# Check 2: "I'm using" / "using the" skill announcements
if echo "$OUTPUT" | grep -qiE "(I'm using|using the|I will use|invoking|activating).*${SKILL_NAME}"; then
    echo "  (info) Skill usage announcement detected"
    INFO_HIT=true
fi

# Check 2b (legacy "Check 3"): SKILL.md mention in prose. Superseded by the
# event-based Check 3 above; kept only as an informational signal since
# tool calls aren't reliably visible in text-format output at all.
if echo "$OUTPUT" | grep -qi "SKILL.md"; then
    echo "  (info) SKILL.md file reference detected in prose output"
    INFO_HIT=true
fi

# Check 4: Skill-specific behavioral evidence
case "$SKILL_NAME" in
    dispatching-parallel-agents|subagent-driven-development)
        if echo "$OUTPUT" | grep -qi "subagent\|invoke_subagent\|parallel"; then
            echo "  (info) Subagent dispatch behavior detected"
            INFO_HIT=true
        fi
        ;;
    systematic-debugging)
        if echo "$OUTPUT" | grep -qiE "hypothes[ie]s|bisect|isolat|diagnos"; then
            echo "  (info) Systematic debugging behavior detected"
            INFO_HIT=true
        fi
        ;;
    test-driven-development)
        if echo "$OUTPUT" | grep -qiE "red.green.refactor|test.first|write.*test.*before"; then
            echo "  (info) TDD behavior detected"
            INFO_HIT=true
        fi
        ;;
    writing-plans)
        if echo "$OUTPUT" | grep -qiE "implementation.plan|plan.*task|break.*down"; then
            echo "  (info) Planning behavior detected"
            INFO_HIT=true
        fi
        ;;
    requesting-code-review)
        if echo "$OUTPUT" | grep -qiE "code.review|review.*code|reviewer"; then
            echo "  (info) Code review behavior detected"
            INFO_HIT=true
        fi
        ;;
    brainstorming)
        if echo "$OUTPUT" | grep -qiE "brainstorm|ideas|options|approaches|alternatives"; then
            echo "  (info) Brainstorming behavior detected"
            INFO_HIT=true
        fi
        ;;
esac

# Informational prose evidence only decides TRIGGERED when the authoritative
# event-based check could not run at all (stream-json capture unavailable).
if [ "$EVENT_CHECK_RAN" = "false" ] && [ "$INFO_HIT" = "true" ]; then
    TRIGGERED=true
fi

echo ""
if [ "$TRIGGERED" = "true" ]; then
    echo "✅ PASS: Skill '$SKILL_NAME' was triggered"
else
    echo "❌ FAIL: Skill '$SKILL_NAME' was NOT triggered"
fi

# Show first portion of output for debugging
echo ""
echo "Output excerpt (first 500 chars):"
echo "$OUTPUT" | head -c 500
echo ""

echo ""
echo "Full log: $LOG_FILE"
echo "Timestamp: $TIMESTAMP"

if [ "$TRIGGERED" = "true" ]; then
    exit 0
else
    exit 1
fi
