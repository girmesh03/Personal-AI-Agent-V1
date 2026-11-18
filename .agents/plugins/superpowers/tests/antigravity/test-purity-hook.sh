#!/usr/bin/env bash
# Test: PreToolUse Purity Hook (Behavioral)
# Feeds fixture PreToolUse JSON payloads into hooks/purity-check.sh over
# stdin and asserts the emitted decision JSON + exit code. This is a real
# behavioral test of the script (not a grep of its source): it does not
# know or care whether the jq branch or the python3 fallback branch is
# doing the work internally. Deterministic, agy-free.
#
# NOTE on fixture authoring: every payload below is built as a single-quoted
# bash literal and delivered with `printf '%s' "$payload"` (never a bare
# `printf '<literal>'`), so bash/printf never re-interpret the \n / \" bytes
# that are meant for the hook's own JSON parser. Using `printf '<literal>'`
# directly here would let printf's own escape processing turn `\n` into a
# real newline before the hook ever saw it, breaking the JSON.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/purity-check.sh"
# The hook now scopes deny decisions to THIS repo's own skills/ tree
# (resolved from the hook script's own on-disk location -- see
# hooks/purity-check.sh). Fixtures whose EXPECTED outcome is "deny" must
# therefore target a real, absolute path under $REPO_ROOT/skills/ -- a bare
# relative "skills/..." TargetFile would only land in scope if this test
# happened to be invoked with $REPO_ROOT as $PWD, which isn't guaranteed.
# Nothing under these paths is ever actually written; the hook only ever
# reads TargetFile out of the fixture's JSON.
REPO_SKILLS_DIR="$REPO_ROOT/skills"

echo "========================================"
echo " Test: PreToolUse Purity Hook (Behavioral)"
echo "========================================"
echo ""

[ -f "$HOOK" ] || { echo "  [FAIL] hook not found: $HOOK"; exit 1; }

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

# Invoked as `bash "$HOOK"`, not `"$HOOK"` directly, and NOT gated on the
# executable bit: this repo has core.fileMode=false (confirmed against an
# existing tracked sibling script, also 100644), so a fresh clone/checkout
# never carries the exec bit regardless of local `chmod +x`. The hook
# manifest (hooks.example.json; renamed to hooks.json when opted in)
# invokes the script the same way ("bash ./hooks/purity-check.sh")
# for the same reason -- this test exercises the real invocation path.
#
# run_hook <payload> -- sets HOOK_OUT / HOOK_CODE. Written to survive
# `set -e`: the failure branch of the hook call (which should never
# actually happen, since the hook always exits 0 by design) is captured
# via an `if`, one of the contexts errexit does not fire inside.
run_hook() {
    local payload="$1"
    if HOOK_OUT="$(printf '%s' "$payload" | bash "$HOOK")"; then
        HOOK_CODE=0
    else
        HOOK_CODE=$?
    fi
}

assert_allow() {
    local desc="$1" payload="$2"
    run_hook "$payload"
    if [ "$HOOK_CODE" -eq 0 ] && [ "$HOOK_OUT" = '{"decision":"allow"}' ]; then
        pass "$desc"
    else
        fail "$desc (exit=$HOOK_CODE out=$HOOK_OUT)"
    fi
}

assert_deny() {
    local desc="$1" payload="$2" want_substr="$3"
    run_hook "$payload"
    case "$HOOK_OUT" in
        '{"decision":"deny","reason":"'*'"}')
            case "$HOOK_OUT" in
                *"$want_substr"*)
                    if [ "$HOOK_CODE" -eq 0 ]; then
                        pass "$desc"
                    else
                        fail "$desc (deny shape ok but exit=$HOOK_CODE)"
                    fi
                    ;;
                *)
                    fail "$desc (reason missing expected term '$want_substr': $HOOK_OUT)"
                    ;;
            esac
            ;;
        *)
            fail "$desc (not a deny shape: $HOOK_OUT)"
            ;;
    esac
}

# run_hook_in_dir <dir> <payload> -- like run_hook, but invokes the hook
# with $PWD set to <dir> for that call only (the `cd` happens inside the
# command substitution's own subshell, so this script's own CWD is never
# touched). Exists to prove a decision does NOT depend on the hook's
# invocation CWD.
run_hook_in_dir() {
    local dir="$1" payload="$2"
    if HOOK_OUT="$(cd "$dir" && printf '%s' "$payload" | bash "$HOOK")"; then
        HOOK_CODE=0
    else
        HOOK_CODE=$?
    fi
}

assert_allow_in_dir() {
    local desc="$1" dir="$2" payload="$3"
    run_hook_in_dir "$dir" "$payload"
    if [ "$HOOK_CODE" -eq 0 ] && [ "$HOOK_OUT" = '{"decision":"allow"}' ]; then
        pass "$desc"
    else
        fail "$desc (exit=$HOOK_CODE out=$HOOK_OUT)"
    fi
}

echo "=== Fixtures ==="
echo ""

# 1. Clean skills/ write -> allow.
FIXTURE_CLEAN='{"toolCall":{"name":"write_to_file","args":{"TargetFile":"'"$REPO_SKILLS_DIR"'/example-skill/SKILL.md","CodeContent":"# Example Skill\n\nThis skill helps with a task. It mentions no legacy tool names.\n","Overwrite":true}},"stepIdx":1,"conversationId":"test-1"}'
assert_allow "clean skills/ write -> allow" "$FIXTURE_CLEAN"

# 2. TodoWrite (CC_TOOLS group) mentioned in a skills/ write -> deny, naming it.
FIXTURE_CC_DENY='{"toolCall":{"name":"replace_file_content","args":{"TargetFile":"'"$REPO_SKILLS_DIR"'/example-skill/SKILL.md","Instruction":"clarify guidance","ReplacementContent":"Use the TodoWrite tool to track your progress through the plan."}},"stepIdx":2,"conversationId":"test-2"}'
assert_deny "TodoWrite in skills/ write -> deny naming the pattern" "$FIXTURE_CC_DENY" "TodoWrite"

# 3. Same banned content, but the target file is OUTSIDE skills/ -> allow.
FIXTURE_OUTSIDE_SKILLS='{"toolCall":{"name":"replace_file_content","args":{"TargetFile":"docs/notes.md","Instruction":"note","ReplacementContent":"Use the TodoWrite tool to track your progress through the plan."}},"stepIdx":3,"conversationId":"test-3"}'
assert_allow "same banned content OUTSIDE skills/ -> allow" "$FIXTURE_OUTSIDE_SKILLS"

# 4. Malformed JSON -> documented fail-safe (always emit {"decision":"allow"}).
FIXTURE_MALFORMED='{"toolCall": {"name": "write_to_file", "args": {'
assert_allow "malformed JSON -> fail-safe allow" "$FIXTURE_MALFORMED"

# 5. multi_replace_file_content with chunk[0] clean and chunk[1] bad -> deny.
# Proves every element of ReplacementChunks is checked, not just the first.
FIXTURE_MULTI_ONE_BAD='{"toolCall":{"name":"multi_replace_file_content","args":{"TargetFile":"'"$REPO_SKILLS_DIR"'/example-skill/SKILL.md","Instruction":"tidy up","ReplacementChunks":[{"StartLine":1,"EndLine":2,"TargetContent":"old header","ReplacementContent":"# Example Skill\n\nClean chunk, nothing wrong here.\n"},{"StartLine":40,"EndLine":42,"TargetContent":"old footer","ReplacementContent":"Historically this workflow was Claude Code specific.\n"}]}},"stepIdx":5,"conversationId":"test-5"}'
assert_deny "multi_replace with one bad chunk (2nd of 2) -> deny" "$FIXTURE_MULTI_ONE_BAD" "Claude Code"

# 6. Platform-name group (not CC_TOOLS) also wired in: Codex CLI in skills/ -> deny.
FIXTURE_PLATFORM_DENY='{"toolCall":{"name":"write_to_file","args":{"TargetFile":"'"$REPO_SKILLS_DIR"'/example-skill/reference.md","CodeContent":"This used to require Codex CLI specifically.\n"}},"stepIdx":6,"conversationId":"test-6"}'
assert_deny "platform-name group (Codex CLI) in skills/ -> deny" "$FIXTURE_PLATFORM_DENY" "Codex CLI"

# 7. Tool-mapping-reference group also wired in: antigravity-tools in skills/ -> deny.
FIXTURE_MAPPING_DENY='{"toolCall":{"name":"replace_file_content","args":{"TargetFile":"'"$REPO_SKILLS_DIR"'/example-skill/reference.md","ReplacementContent":"See antigravity-tools for the mapping.\n"}},"stepIdx":7,"conversationId":"test-7"}'
assert_deny "mapping-reference group (antigravity-tools) in skills/ -> deny" "$FIXTURE_MAPPING_DENY" "antigravity-tools"

# 8. Self-review case: the CI gate's own pattern-definition text, written to a
# path under tests/ (not skills/) -> allow. Confirms the scope check is a
# real path-prefix check, not a bare content grep.
FIXTURE_SELF_REVIEW='{"toolCall":{"name":"write_to_file","args":{"TargetFile":"tests/antigravity/test-skill-tool-purity.sh","CodeContent":"CC_TOOLS=\"TodoWrite|EnterWorktree|Task tool|Skill tool\"\n","Overwrite":true}},"stepIdx":8,"conversationId":"test-8"}'
assert_allow "banned pattern text under tests/ (not skills/) -> allow" "$FIXTURE_SELF_REVIEW"

# 9. Self-review case: a skills/ file quoting a banned term in prose (not as
# an operative instruction) -> still deny. This is deliberate: the CI gate
# (grep -rnE, indiscriminate) would also fail this write, so denying it here
# keeps the live gate and the CI gate enforcing the exact same law.
FIXTURE_PROSE_QUOTE='{"toolCall":{"name":"write_to_file","args":{"TargetFile":"'"$REPO_SKILLS_DIR"'/example-skill/history.md","CodeContent":"Historically, some agents used a tool called TodoWrite for planning.\n","Overwrite":true}},"stepIdx":9,"conversationId":"test-9"}'
assert_deny "skills/ file quoting a banned term in prose -> still deny (same law as CI)" "$FIXTURE_PROSE_QUOTE" "TodoWrite"

# 10. Blast-radius guarantee: the SAME banned content, targeting a skills/
# path under a completely FOREIGN project (not this repo/plugin) -> allow.
# When opted in, the hook runs in every workspace, so without
# the plugin-root anchor this write would have been denied even though it
# has nothing to do with this fork's vocabulary law. This is the direct
# regression fixture for that fix.
FIXTURE_FOREIGN_WORKSPACE='{"toolCall":{"name":"write_to_file","args":{"TargetFile":"/tmp/other-project/skills/x.md","CodeContent":"Use the TodoWrite tool to track your progress through the plan.","Overwrite":true}},"stepIdx":10,"conversationId":"test-10"}'
assert_allow "banned content in a FOREIGN project's skills/ -> allow (blast-radius guarantee)" "$FIXTURE_FOREIGN_WORKSPACE"

# 11. Blast-radius guarantee, relative-path case: a RELATIVE TargetFile
# ("skills/evil.md") with banned content and NO workspacePaths in the
# payload -- no workspace root to confidently join onto. hooks.json invokes
# this script via a relative path ("bash ./hooks/purity-check.sh"), so its
# own $PWD is plausibly THIS plugin's root in every workspace; the fix
# under test removes the old $PWD fallback that let that coincidence
# wrongly resolve a foreign project's relative skills/ write into scope.
# Run twice, from two different CWDs (a throwaway foreign dir, then the
# repo root itself), to pin down that the decision does not depend on
# either -- both must allow.
FOREIGN_CWD="$(mktemp -d)"
trap 'rm -rf "$FOREIGN_CWD"' EXIT

FIXTURE_RELATIVE_NO_WORKSPACE='{"toolCall":{"name":"write_to_file","args":{"TargetFile":"skills/evil.md","CodeContent":"Use the TodoWrite tool to track your progress through the plan.","Overwrite":true}},"stepIdx":11,"conversationId":"test-11"}'
assert_allow_in_dir "relative TargetFile, no workspacePaths, run from a foreign CWD -> allow (fail open)" "$FOREIGN_CWD" "$FIXTURE_RELATIVE_NO_WORKSPACE"
assert_allow_in_dir "same fixture run from repo root CWD -> allow too (decision is CWD-independent)" "$REPO_ROOT" "$FIXTURE_RELATIVE_NO_WORKSPACE"

# 12. Same relative TargetFile and banned content as #11, but this payload
# DOES carry workspacePaths[0] = this repo's own root -- a confident signal
# that "skills/evil.md" resolves inside THIS plugin's skills/ tree -- so
# this one must still deny. Confirms the fix only removed the $PWD guess,
# not the legitimate workspacePaths join.
FIXTURE_RELATIVE_WITH_WORKSPACE='{"toolCall":{"name":"write_to_file","args":{"TargetFile":"skills/evil.md","CodeContent":"Use the TodoWrite tool to track your progress through the plan.","Overwrite":true}},"workspacePaths":["'"$REPO_ROOT"'"],"stepIdx":12,"conversationId":"test-12"}'
assert_deny "relative TargetFile with workspacePaths confidently inside plugin -> deny" "$FIXTURE_RELATIVE_WITH_WORKSPACE" "TodoWrite"

echo ""
echo "========================================"
echo " Test Summary"
echo "========================================"
echo ""

if [ "$FAILURES" -eq 0 ]; then
    echo "[PASS] PreToolUse purity hook test passed (0 failures)"
    exit 0
else
    echo "[FAIL] PreToolUse purity hook test failed ($FAILURES checks failed)"
    exit 1
fi
