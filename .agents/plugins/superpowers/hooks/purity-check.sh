#!/usr/bin/env bash
# PreToolUse purity gate -- denies write_to_file / replace_file_content /
# multi_replace_file_content calls that would introduce banned vocabulary
# into THIS PLUGIN'S OWN skills/ tree. This is the SAME law
# tests/antigravity/test-skill-tool-purity.sh enforces (the three pattern
# groups below are copied verbatim from that file's lines 22, 35, 48) --
# this hook just catches it before the write lands instead of after, at
# edit time.
#
# --- Opt-in: this gate is for contributors to THIS repo ------------------
# The hook manifest ships as hooks.example.json; rename it to hooks.json to
# enable the gate. It requires bash to be available to Antigravity's hook
# runner -- on systems without it the platform fails closed and would deny
# the matched writes, which is why it is not enabled by default.
#
# --- Scope: this plugin's skills/ only, never any other project's --------
# When enabled, the hook runs in every workspace, so a naive
# "does this path contain skills/" check would vet ANY open workspace's
# skills/ writes against this fork-internal vocabulary law -- including
# projects that have nothing to do with this repo and don't share its
# terminology rules. The scope check below anchors to $PLUGIN_ROOT
# (resolved from this script's own on-disk location, never from anything
# in the tool-call payload) so a write under some other project's skills/
# tree always passes through untouched, no matter what workspace happens
# to be open in the same Antigravity session.
#
# --- Contract (fetched 2026-07-30, https://antigravity.google/docs/hooks and
#     https://antigravity.google/docs/ide/hooks; tool-arg names from
#     https://antigravity.google/docs/tools) --------------------------------
#   stdin (PreToolUse):  {"toolCall": {"name": <str>, "args": {...}}, ...,
#     "workspacePaths": [<str>, ...]}
#   stdout (PreToolUse): {"decision": "allow|deny|ask|force_ask", "reason": <str>}
#   File-tool arg keys: write_to_file -> TargetFile, CodeContent;
#     replace_file_content -> TargetFile, ReplacementContent;
#     multi_replace_file_content -> TargetFile, ReplacementChunks (array;
#     each chunk carries its own ReplacementContent).
#   Exit-code semantics and the hook command's working directory are NOT
#   documented anywhere on either hooks page (confirmed absent on request).
#
# --- Fail-safe policy -------------------------------------------------------
# Antigravity does NOT treat malformed/empty hook stdout as an implicit
# allow: observed real-world behavior (github.com/manaflow-ai/cmux issue
# #5358) is that an unparseable decision -- even a bare "{}" -- gets the
# tool call DENIED with "invalid_args", for every call the matcher covers,
# not just the one under review. So "fail safe" here means "always print a
# well-formed {"decision":"allow"} unless we are POSITIVELY sure this is a
# banned write under THIS PLUGIN'S OWN skills/" -- never nothing, never a
# malformed shape. An EXIT trap backstops this even against bugs in this
# script itself. The same rule applies to resolving our own plugin root and
# to absolutizing TargetFile: if either can't be pinned down into a
# confident same-plugin/not-same-plugin answer, that's a reason to allow,
# not deny.
#
# Deliberately NOT `set -e`: every code path below must still reach the
# trap's fail-open default if something unexpected fails partway through.
set -uo pipefail

DECIDED=0
CONTENTS_FILE=""

# Always emit exactly one decision line, no matter how we got here.
cleanup_and_default() {
    [ -n "$CONTENTS_FILE" ] && [ -f "$CONTENTS_FILE" ] && rm -f "$CONTENTS_FILE"
    if [ "$DECIDED" -eq 0 ]; then
        printf '{"decision":"allow"}\n'
    fi
}
trap cleanup_and_default EXIT

allow() {
    DECIDED=1
    printf '{"decision":"allow"}\n'
    exit 0
}

deny() {
    # $1 = reason text. Callers only ever pass text drawn from the fixed
    # BANNED vocabulary list below (via grep -oE, no wildcards/capture
    # groups) plus a hardcoded suffix, so it can never itself contain a
    # double quote or backslash -- no extra JSON-escaping needed here.
    DECIDED=1
    printf '{"decision":"deny","reason":"%s"}\n' "$1"
    exit 0
}

# This plugin's own root -- hooks/purity-check.sh lives at
# <plugin-root>/hooks/, so one level up from this script's own directory is
# the anchor every scope decision below is measured against. Resolved from
# the script's on-disk location, never from anything in the tool-call
# payload (caller-controlled data, not a trust anchor).
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || PLUGIN_ROOT=""
[ -n "$PLUGIN_ROOT" ] || allow   # couldn't resolve our own root -> ambiguous, fail open

# normalize_drive: "X:/foo" -> "/x/foo" (lowercase drive letter). Bash's own
# `pwd` (used for PLUGIN_ROOT above) returns POSIX-style paths under Git
# Bash/MSYS, so this brings a drive-letter absolute path (TargetFile or
# workspacePaths, Windows-native) into that same convention before either
# side of a prefix comparison is trusted. Anything already POSIX-style, or
# not a drive-letter path at all, passes through unchanged.
normalize_drive() {
    case "$1" in
        [A-Za-z]:/*)
            drive="$(printf '%s' "${1%%:*}" | tr 'A-Z' 'a-z')"
            printf '/%s%s' "$drive" "${1#*:}"
            ;;
        *)
            printf '%s' "$1"
            ;;
    esac
}

PLUGIN_ROOT_NORM="$(normalize_drive "$(printf '%s' "$PLUGIN_ROOT" | tr '\\' '/')")"
PLUGIN_ROOT_NORM="${PLUGIN_ROOT_NORM%/}"

# Same three pattern groups as tests/antigravity/test-skill-tool-purity.sh:22,35,48.
# Kept as separate variables (not pre-merged) so a future diff against that
# file is a straight line-for-line comparison.
CC_TOOLS='TodoWrite|EnterWorktree|Task tool|Skill tool'
PLATFORMS='Claude Code|Codex CLI|Codex App|Copilot CLI|OpenCode|Factory Droid|Gemini CLI'
MAPPINGS='antigravity-tools|copilot-tools|codex-tools|gemini-tools'
BANNED="${CC_TOOLS}|${PLATFORMS}|${MAPPINGS}"

INPUT="$(cat)"
[ -n "$INPUT" ] || allow   # nothing on stdin -> nothing to check, fail open

CONTENTS_FILE="$(mktemp)" || allow   # can't stage content -> fail open

TARGET_FILE=""
WORKSPACE_ROOT=""
PARSE_OK=0
PARSER=""

if command -v jq >/dev/null 2>&1; then
    PARSER="jq"
    TARGET_FILE="$(printf '%s' "$INPUT" | jq -r '.toolCall.args.TargetFile? // empty' 2>/dev/null)"
    TF_OK=$?
    printf '%s' "$INPUT" | jq -r '
        [ .toolCall.args.CodeContent?,
          .toolCall.args.ReplacementContent?,
          (.toolCall.args.ReplacementChunks? // [] | .[]? | .ReplacementContent?)
        ] | map(select(type == "string")) | .[]
    ' > "$CONTENTS_FILE" 2>/dev/null
    CONTENT_OK=$?
    if [ "$TF_OK" -eq 0 ] && [ "$CONTENT_OK" -eq 0 ]; then
        PARSE_OK=1
    fi
elif command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1; then
    PARSER="py"
    PY="$(command -v python3 || command -v python)"
    PY_SRC=$(cat <<'PYEOF'
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
tc = data.get("toolCall") if isinstance(data, dict) else None
args = tc.get("args") if isinstance(tc, dict) else None
if not isinstance(args, dict):
    args = {}
target = args.get("TargetFile")
if not isinstance(target, str):
    target = ""
blobs = []
for key in ("CodeContent", "ReplacementContent"):
    v = args.get(key)
    if isinstance(v, str):
        blobs.append(v)
chunks = args.get("ReplacementChunks")
if isinstance(chunks, list):
    for chunk in chunks:
        if isinstance(chunk, dict):
            v = chunk.get("ReplacementContent")
            if isinstance(v, str):
                blobs.append(v)
with open(sys.argv[1], "w", encoding="utf-8", newline="") as f:
    for b in blobs:
        f.write(b)
        f.write("\n")
sys.stdout.write(target)
PYEOF
)
    if TARGET_FILE="$(printf '%s' "$INPUT" | "$PY" -c "$PY_SRC" "$CONTENTS_FILE" 2>/dev/null)"; then
        PARSE_OK=1
    fi
else
    allow   # no JSON tool available at all -> can't inspect, fail open
fi

[ "$PARSE_OK" -eq 1 ] || allow   # malformed/unparseable stdin -> fail open

# Best-effort workspace-root extraction (payload's workspacePaths[0], per
# the documented PreToolUse stdin shape -- see the header contract note).
# Independent of the TARGET_FILE/content extraction above: a miss or
# malformed field here never blocks the check, it just means a relative
# TargetFile below has no workspace root to join onto and the hook fails
# open (no $PWD fallback -- see the relative-path case below for why).
# Reuses whichever parser already won above ($PY stays set from the elif
# branch when PARSER="py").
if [ "$PARSER" = "jq" ]; then
    WORKSPACE_ROOT="$(printf '%s' "$INPUT" | jq -r '.workspacePaths[0]? // empty' 2>/dev/null)"
else
    WORKSPACE_ROOT="$(printf '%s' "$INPUT" | "$PY" -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
wp = data.get("workspacePaths") if isinstance(data, dict) else None
if isinstance(wp, list) and wp and isinstance(wp[0], str):
    sys.stdout.write(wp[0])
' 2>/dev/null)"
fi

# ---- Scope check: absolutize + normalize TARGET_FILE, then require it be
# under THIS plugin's own skills/ tree specifically (not merely named
# skills/ somewhere) -- any depth, either slash direction so a
# Windows-style TargetFile still normalizes correctly.
NORM_PATH="$(printf '%s' "$TARGET_FILE" | tr '\\' '/')"

case "$NORM_PATH" in
    "")
        allow   # no target path at all -> nothing to anchor, fail open
        ;;
    /*)
        ABS_PATH="$NORM_PATH"
        ;;
    [A-Za-z]:/*)
        ABS_PATH="$(normalize_drive "$NORM_PATH")"
        ;;
    *)
        # Relative path: join onto the payload's workspace root
        # (workspacePaths[0], extracted above). Deliberately NO $PWD
        # fallback: hooks.json invokes this script via a relative path
        # ("bash ./hooks/purity-check.sh"), so $PWD at hook runtime is
        # plausibly this plugin's own root in EVERY workspace -- falling
        # back to it would let a foreign project's relative skills/ write
        # wrongly resolve into scope. Per the policy above, ambiguous scope
        # allows, not denies.
        JOIN_BASE="$WORKSPACE_ROOT"
        [ -n "$JOIN_BASE" ] || allow   # no workspace root -> ambiguous, fail open
        JOIN_BASE="$(normalize_drive "$(printf '%s' "$JOIN_BASE" | tr '\\' '/')")"
        JOIN_BASE="${JOIN_BASE%/}"
        [ -n "$JOIN_BASE" ] || allow   # normalized to empty -> ambiguous, fail open
        ABS_PATH="$JOIN_BASE/$NORM_PATH"
        ;;
esac

case "$ABS_PATH" in
    "$PLUGIN_ROOT_NORM"/skills/*) : ;;   # in scope: under THIS plugin's own skills/, fall through to content check
    *) allow ;;
esac

# ---- Content check: CONTENTS_FILE holds every candidate content blob
# (CodeContent, ReplacementContent, and EVERY ReplacementChunks[].ReplacementContent),
# one per line. grep -E matches per input line regardless of which content
# source contributed that line, so a single pass covers every chunk.
MATCH=""
if [ -s "$CONTENTS_FILE" ]; then
    MATCH="$(grep -oE "$BANNED" "$CONTENTS_FILE" | head -1)" || true
fi

if [ -n "$MATCH" ]; then
    deny "banned vocabulary '${MATCH}' in skills/ write (see tests/antigravity/test-skill-tool-purity.sh)"
else
    allow
fi
