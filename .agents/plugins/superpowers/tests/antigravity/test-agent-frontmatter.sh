#!/usr/bin/env bash
# Static lint for bundled agent definitions (agents/*.md).
# The platform hangs a subagent whose tools: list contains an unknown name,
# so this gate fails the build on any tool name outside the documented set.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENTS_DIR="$REPO_ROOT/agents"
FAILURES=0

KNOWN_TOOLS="view_file write_to_file replace_file_content multi_replace_file_content list_dir find_by_name grep_search search_web read_url_content run_command manage_task schedule list_permissions ask_permission invoke_subagent define_subagent send_message manage_subagents ask_question generate_image"

fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
pass() { echo "  [PASS] $1"; }

[ -d "$AGENTS_DIR" ] || { echo "[FAIL] agents/ directory missing"; exit 1; }

for f in "$AGENTS_DIR"/*.md; do
  base="$(basename "$f")"
  name="$(sed -n 's/^name: *//p' "$f" | head -1)"
  desc="$(sed -n 's/^description: *//p' "$f" | head -1)"
  [ -n "$name" ] && pass "$base: name present" || fail "$base: missing name"
  [ -n "$desc" ] && pass "$base: description present" || fail "$base: missing description"
  [ "$name.md" = "$base" ] && pass "$base: name matches filename" || fail "$base: name '$name' != filename"
  model="$(sed -n 's/^model: *//p' "$f" | head -1)"
  case "$model" in inherit|flash|pro) pass "$base: model '$model' valid";; *) fail "$base: model '$model' not in inherit|flash|pro";; esac
  # tools entries: lines beginning "  - " between "tools:" and the next top-level key
  tools="$(awk '/^tools:/{t=1;next} t&&(/^[a-zA-Z]/||/^---$/){exit} t&&/^[[:space:]]*- /{print $2}' "$f")"
  for tool in $tools; do
    case " $KNOWN_TOOLS " in
      *" $tool "*) pass "$base: tool '$tool' known";;
      *) fail "$base: tool '$tool' NOT in documented tool set";;
    esac
  done
done

echo ""
if [ "$FAILURES" -eq 0 ]; then echo "[PASS] Agent frontmatter lint passed"; else echo "[FAIL] $FAILURES failure(s)"; exit 1; fi
