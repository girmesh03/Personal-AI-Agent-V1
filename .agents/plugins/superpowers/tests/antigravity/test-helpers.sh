#!/usr/bin/env bash
# Helper functions for Antigravity 2.0 skill tests
# Parallel to tests/claude-code/test-helpers.sh but adapted for the agy CLI

# Run Antigravity in headless mode with a prompt and capture output.
#
# Always passes --print-timeout and --dangerously-skip-permissions: without
# the former, headless `agy --print` self-terminates after agy's documented
# default of 5 minutes; without the latter, agy's default permission mode
# pauses for interactive diff review, which hangs indefinitely for any test
# that writes files (docs: https://antigravity.google/docs/cli/headless,
# "Flag reference" table -- --print-timeout default "5m", example
# "--print-timeout 15m"; --dangerously-skip-permissions "Auto-approve all
# tool permission requests").
#
# Two optional env vars pin model/effort for a whole test run:
#   AGY_TEST_MODEL  -> passed as --model  ("Model slug for this run", see `agy models`)
#   AGY_TEST_EFFORT -> passed as --effort ("Reasoning effort: low, medium, or high")
#
# Usage: run_antigravity "prompt text" [timeout_seconds] [output_format]
#   output_format: text|json|stream-json (omit for agy's own default, "text")
run_antigravity() {
    local prompt="$1"
    local timeout_secs="${2:-300}"
    local output_format="${3:-}"
    local output_file
    output_file=$(mktemp)

    # Check agy is available
    if ! command -v agy &>/dev/null; then
        echo "ERROR: 'agy' command not found. Install Antigravity CLI first." >&2
        rm -f "$output_file"
        return 127
    fi

    # agy's own --print-timeout documents only whole-minute durations
    # (default "5m", example "15m" -- no seconds unit is ever shown), so
    # round the requested budget up to the nearest whole minute.
    local print_timeout_minutes=$(( (timeout_secs + 59) / 60 ))
    if [ "$print_timeout_minutes" -lt 1 ]; then
        print_timeout_minutes=1
    fi

    # The external `timeout` wrapper stays as a backstop for hangs that
    # happen before agy's own --print-timeout can engage (auth prompts,
    # network stalls, etc). It must never be tighter than the internal
    # budget it is backstopping, so widen it to that budget plus margin.
    local external_timeout_secs=$(( print_timeout_minutes * 60 + 60 ))
    if [ "$external_timeout_secs" -lt "$timeout_secs" ]; then
        external_timeout_secs="$timeout_secs"
    fi

    local -a agy_args=(--print "$prompt" --print-timeout "${print_timeout_minutes}m" --dangerously-skip-permissions)
    if [ -n "$output_format" ]; then
        agy_args+=(--output-format "$output_format")
    fi
    if [ -n "${AGY_TEST_MODEL:-}" ]; then
        agy_args+=(--model "$AGY_TEST_MODEL")
    fi
    if [ -n "${AGY_TEST_EFFORT:-}" ]; then
        agy_args+=(--effort "$AGY_TEST_EFFORT")
    fi

    # Run Antigravity in headless (--print) mode with timeout
    if timeout "$external_timeout_secs" agy "${agy_args[@]}" > "$output_file" 2>&1; then
        cat "$output_file"
        rm -f "$output_file"
        return 0
    else
        local exit_code=$?
        cat "$output_file" >&2
        rm -f "$output_file"
        return $exit_code
    fi
}

# Check if output contains a pattern
# Usage: assert_contains "output" "pattern" "test name"
assert_contains() {
    local output="$1"
    local pattern="$2"
    local test_name="${3:-test}"

    if echo "$output" | grep -qi "$pattern"; then
        echo "  [PASS] $test_name"
        return 0
    else
        echo "  [FAIL] $test_name"
        echo "  Expected to find: $pattern"
        echo "  In output:"
        echo "$output" | sed 's/^/    /' | head -30
        return 1
    fi
}

# Check if output does NOT contain a pattern
# Usage: assert_not_contains "output" "pattern" "test name"
assert_not_contains() {
    local output="$1"
    local pattern="$2"
    local test_name="${3:-test}"

    if echo "$output" | grep -qi "$pattern"; then
        echo "  [FAIL] $test_name"
        echo "  Did not expect to find: $pattern"
        echo "  In output:"
        echo "$output" | sed 's/^/    /' | head -30
        return 1
    else
        echo "  [PASS] $test_name"
        return 0
    fi
}

# Check if output matches a count
# Usage: assert_count "output" "pattern" expected_count "test name"
assert_count() {
    local output="$1"
    local pattern="$2"
    local expected="$3"
    local test_name="${4:-test}"

    local actual
    actual=$(echo "$output" | grep -ci "$pattern" || echo "0")

    if [ "$actual" -eq "$expected" ]; then
        echo "  [PASS] $test_name (found $actual instances)"
        return 0
    else
        echo "  [FAIL] $test_name"
        echo "  Expected $expected instances of: $pattern"
        echo "  Found $actual instances"
        echo "  In output:"
        echo "$output" | sed 's/^/    /' | head -30
        return 1
    fi
}

# Check if pattern A appears before pattern B
# Usage: assert_order "output" "pattern_a" "pattern_b" "test name"
assert_order() {
    local output="$1"
    local pattern_a="$2"
    local pattern_b="$3"
    local test_name="${4:-test}"

    # Get line numbers where patterns appear
    local line_a
    local line_b
    line_a=$(echo "$output" | grep -ni "$pattern_a" | head -1 | cut -d: -f1)
    line_b=$(echo "$output" | grep -ni "$pattern_b" | head -1 | cut -d: -f1)

    if [ -z "$line_a" ]; then
        echo "  [FAIL] $test_name: pattern A not found: $pattern_a"
        echo "  In output:"
        echo "$output" | sed 's/^/    /'
        return 1
    fi

    if [ -z "$line_b" ]; then
        echo "  [FAIL] $test_name: pattern B not found: $pattern_b"
        echo "  In output:"
        echo "$output" | sed 's/^/    /'
        return 1
    fi

    if [ "$line_a" -lt "$line_b" ]; then
        echo "  [PASS] $test_name (A at line $line_a, B at line $line_b)"
        return 0
    else
        echo "  [FAIL] $test_name"
        echo "  Expected '$pattern_a' before '$pattern_b'"
        echo "  But found A at line $line_a, B at line $line_b"
        return 1
    fi
}

# Create a temporary test project directory
# Usage: test_project=$(create_test_project)
create_test_project() {
    local test_dir
    test_dir=$(mktemp -d)
    echo "$test_dir"
}

# Cleanup test project
# Usage: cleanup_test_project "$test_dir"
cleanup_test_project() {
    local test_dir="$1"
    if [ -d "$test_dir" ]; then
        rm -rf "$test_dir"
    fi
}

# Create a simple plan file for testing
# Usage: create_test_plan "$project_dir" "$plan_name"
create_test_plan() {
    local project_dir="$1"
    local plan_name="${2:-test-plan}"
    local plan_file="$project_dir/docs/superpowers/plans/$plan_name.md"

    mkdir -p "$(dirname "$plan_file")"

    cat > "$plan_file" <<'EOF'
# Test Implementation Plan

## Task 1: Create Hello Function

Create a simple hello function that returns "Hello, World!".

**File:** `src/hello.js`

**Implementation:**
```javascript
export function hello() {
  return "Hello, World!";
}
```

**Tests:** Write a test that verifies the function returns the expected string.

**Verification:** `npm test`

## Task 2: Create Goodbye Function

Create a goodbye function that takes a name and returns a goodbye message.

**File:** `src/goodbye.js`

**Implementation:**
```javascript
export function goodbye(name) {
  return `Goodbye, ${name}!`;
}
```

**Tests:** Write tests for:
- Default name
- Custom name
- Edge cases (empty string, null)

**Verification:** `npm test`
EOF

    echo "$plan_file"
}

# Look up a single candidate workspace path in Antigravity's conversation
# cache. Echoes the conversation UUID on a hit, or nothing on a miss. Never
# returns non-zero itself (all three branches are guarded) so a malformed
# or missing cache file can never trip `set -e`/`pipefail` in a caller --
# it should just look like a miss and fall through to the mtime scan.
# jq is preferred; python3/python next; a best-effort fixed-string
# grep + awk extraction (NOT a general JSON parser) is the last resort so
# the suite never hard-fails on a machine with neither jq nor python.
_agy_cache_lookup() {
    local cache_file="$1"
    local key="$2"
    local result=""

    if command -v jq &>/dev/null; then
        result=$(jq -r --arg ws "$key" '.[$ws] // empty' "$cache_file" 2>/dev/null || true)
    elif command -v python3 &>/dev/null || command -v python &>/dev/null; then
        local py_bin="python3"
        command -v python3 &>/dev/null || py_bin="python"
        result=$("$py_bin" -c '
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        data = json.load(fh)
    print(data.get(sys.argv[2], ""))
except Exception:
    pass
' "$cache_file" "$key" 2>/dev/null || true)
    else
        result=$(grep -F -- "$key" "$cache_file" 2>/dev/null | head -1 | awk -F'"' -v k="$key" '
            { for (i = 1; i <= NF; i++) { if ($i == k) { print $(i + 2); exit } } }
        ' 2>/dev/null || true)
    fi

    printf '%s' "$result"
}

# Find the most recent Antigravity transcript JSONL file.
#
# Primary lookup (documented API): the Antigravity CLI "Resume Command"
# guide documents ~/.gemini/antigravity-cli/cache/last_conversations.json
# as "A JSON map associating absolute workspace directory paths with their
# most recently active conversation ID." We read the conversation ID for
# the workspace agy was run from and go straight to its transcript -- this
# is deterministic (right workspace, right conversation), unlike the mtime
# scan below, which can pick up an unrelated concurrent conversation.
#
# On Windows Git Bash, agy itself is typically a native Windows binary, so
# it may record the workspace path with backslashes/drive-letter form even
# though bash's $PWD is POSIX-style ("/c/..."). We also try a
# cygpath-converted key (both backslash and forward-slash forms) when
# cygpath is available. If none of the candidate keys resolve (cache file
# absent, key format we didn't anticipate, etc.), we fall through to the
# fallback below -- this is a best-effort optimization, not a hard
# dependency.
#
# Fallback lookup (NOT documented API -- empirically observed by watching
# the filesystem while using the CLI, not published anywhere): Antigravity
# stores transcripts at:
#   ~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl (CLI)
#   ~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/transcript.jsonl (IDE / Fallback)
# and here we just take the most recently modified transcript.jsonl within
# the requested window -- can be wrong if more than one conversation was
# active concurrently, which is exactly what the primary lookup above
# fixes when it's available.
#
# Usage: transcript=$(find_transcript [minutes_ago] [workspace_dir])
find_transcript() {
    local minutes="${1:-60}"
    local workspace_dir="${2:-$PWD}"
    local brain_dir="$HOME/.gemini/antigravity-cli/brain"
    if [ ! -d "$brain_dir" ]; then
        brain_dir="$HOME/.gemini/antigravity/brain"
    fi

    # --- Primary: documented workspace -> conversation-UUID cache lookup ---
    local cache_file="$HOME/.gemini/antigravity-cli/cache/last_conversations.json"
    local conversation_id=""

    if [ -f "$cache_file" ]; then
        local -a candidate_keys=("$workspace_dir")
        if command -v cygpath &>/dev/null; then
            local win_path=""
            win_path=$(cygpath -w "$workspace_dir" 2>/dev/null || true)
            if [ -n "$win_path" ]; then
                candidate_keys+=("$win_path" "${win_path//'\'//}")
            fi
        fi

        local key
        for key in "${candidate_keys[@]}"; do
            conversation_id=$(_agy_cache_lookup "$cache_file" "$key")
            if [ -n "$conversation_id" ]; then
                break
            fi
        done
    fi

    if [ -n "$conversation_id" ]; then
        local candidate_root candidate
        for candidate_root in "$HOME/.gemini/antigravity-cli/brain" "$HOME/.gemini/antigravity/brain"; do
            candidate="$candidate_root/$conversation_id/.system_generated/logs/transcript.jsonl"
            if [ -f "$candidate" ]; then
                echo "$candidate"
                return 0
            fi
        done
        # Cache pointed at a conversation ID but no transcript exists for it
        # (e.g. a deleted conversation) -- fall through to the mtime scan.
    fi

    # --- Fallback: most-recently-modified transcript within the window ---
    if [ ! -d "$brain_dir" ]; then
        echo "ERROR: Brain directory not found: $brain_dir" >&2
        return 1
    fi

    # Find the most recently modified transcript.jsonl
    local transcript=""
    local files
    files=$(find "$brain_dir" -name "transcript.jsonl" -mmin "-${minutes}" -type f 2>/dev/null)
    if [ -n "$files" ]; then
        transcript=$(echo "$files" | xargs ls -t 2>/dev/null | head -1)
    fi

    if [ -z "$transcript" ]; then
        echo "ERROR: No transcript found in last $minutes minutes" >&2
        return 1
    fi

    echo "$transcript"
}

# Check if a transcript contains a specific tool call
# Usage: transcript_has_tool "$transcript_file" "invoke_subagent"
transcript_has_tool() {
    local transcript="$1"
    local tool_name="$2"

    grep -q "\"$tool_name\"" "$transcript" 2>/dev/null
}

# Count tool invocations in a transcript
# Usage: count=$(transcript_tool_count "$transcript_file" "invoke_subagent")
transcript_tool_count() {
    local transcript="$1"
    local tool_name="$2"

    grep -c "\"$tool_name\"" "$transcript" 2>/dev/null || echo "0"
}

# Export functions for use in tests
export -f run_antigravity
export -f assert_contains
export -f assert_not_contains
export -f assert_count
export -f assert_order
export -f create_test_project
export -f cleanup_test_project
export -f create_test_plan
export -f _agy_cache_lookup
export -f find_transcript
export -f transcript_has_tool
export -f transcript_tool_count
