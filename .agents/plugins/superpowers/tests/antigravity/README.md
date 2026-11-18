# Antigravity 2.0 Test Suite

Testing Superpowers skills on the Antigravity 2.0 platform (Google DeepMind's agentic coding assistant).

## Overview

This test suite validates that Superpowers skills work correctly on Antigravity 2.0, covering:

- **Plugin discovery** — Verifies Antigravity loads the superpowers plugin and exposes skills
- **Skill triggering** — Tests that naive prompts trigger the correct skill
- **Subagent dispatch** — Validates the `subagent-driven-development` workflow using `invoke_subagent`
- **Skill tool purity** — Static validation that skill files contain no legacy tool names or platform references
- **Purity hook (behavioral)** — Fixture-driven validation that the `PreToolUse` purity gate denies banned-vocabulary writes into `skills/` at edit time and allows everything else
- **Rule/skill mirror sync** — Static validation that the Always-On rule bootstrap mirrors `skills/using-superpowers/SKILL.md` exactly
- **Workspace isolation** — Confirms worktree/branch workspace guidance works

## Prerequisites

1. **Antigravity CLI** (`agy`) must be installed and available on `$PATH`
2. **Superpowers plugin** must be symlinked or copied into `~/.gemini/config/plugins/superpowers/`
3. **bash** 4.0+ with standard GNU utils (`grep`, `sed`, `timeout`, `jq`)
   - `jq` is genuinely exercised now, not just listed: `find_transcript`'s
     cache lookup and `test-skill-triggering/run-test.sh`'s event-based
     Check 3 both prefer it, falling back to `python3`/`python` and then a
     best-effort `grep`/`awk` extraction if neither is present -- the
     suite never hard-fails on a machine without `jq`.

### Environment Variables

Two optional env vars pin model/effort for a whole test run:

| Variable | Passed as | Values |
|----------|-----------|--------|
| `AGY_TEST_MODEL`  | `--model`  | A model slug (see `agy models`) |
| `AGY_TEST_EFFORT` | `--effort` | `low`, `medium`, or `high` |

### Headless Invocation Flags

Every `agy --print` call in this suite (`run_antigravity` in
`test-helpers.sh`, and the direct invocation in `test-subagent-dispatch.sh`)
always passes:

- **`--print-timeout <N>m`** — headless `agy --print` self-terminates after
  agy's own documented default of 5 minutes if this isn't raised. The
  documented flag reference shows only whole-minute durations (default
  `5m`, example `--print-timeout 15m`), so this suite rounds requested
  second-based budgets up to the nearest minute rather than passing seconds
  directly. The external `timeout` wrapper is kept as a backstop for hangs
  that occur before agy's own timeout can engage, widened so it's never
  tighter than the internal budget it backstops.
- **`--dangerously-skip-permissions`** — without it, agy's default
  permission mode pauses for interactive diff review, which hangs
  indefinitely for any test that writes files.

Source: https://antigravity.google/docs/cli/headless ("Flag reference" table).

### Plugin Installation

```bash
# Symlink from repo root:
ln -sfn "$(pwd)" ~/.gemini/config/plugins/superpowers
```

## How to Run Tests

### All skill-triggering tests

```bash
cd tests/antigravity/test-skill-triggering
./run-all.sh
```

### Individual skill-triggering test

```bash
cd tests/antigravity/test-skill-triggering
./run-test.sh systematic-debugging ../../../tests/skill-triggering/prompts/systematic-debugging.txt
```

### Plugin discovery

```bash
cd tests/antigravity
./test-plugin-discovery.sh
```

### Subagent dispatch

```bash
cd tests/antigravity
./test-subagent-dispatch.sh
```

### Skill tool purity (static, no agy required)

```bash
cd tests/antigravity
./test-skill-tool-purity.sh
```

### Workspace isolation

```bash
cd tests/antigravity
./test-worktree-workspace.sh
```

## Session Transcript Format

> **Not documented API.** The `brain/` directory layout, `transcript.jsonl`,
> and the field names below were learned by watching the filesystem while
> using the CLI — none of it appears on https://antigravity.google/docs.
> Treat this section as empirically observed behavior that could change
> without notice, not a stable, published contract. (Contrast with
> `last_conversations.json` below, which the CLI's docs do describe.)

Antigravity 2.0 stores session transcripts as **JSONL** files at:

```
~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/transcript.jsonl
```

Each line is a JSON object with these key fields:

| Field | Description |
|-------|-------------|
| `step_index` | Sequential index of the step in the trajectory |
| `source` | Origin of the action: `USER_EXPLICIT`, `MODEL`, `SYSTEM` |
| `type` | Step type: `USER_INPUT`, `PLANNER_RESPONSE`, `VIEW_FILE`, etc. |
| `status` | Outcome: `DONE`, `ERROR` |
| `content` | Text content (user request or model response) |
| `tool_calls` | Array of tool invocations with their arguments |

### Example transcript entry

```json
{
  "step_index": 5,
  "source": "MODEL",
  "type": "PLANNER_RESPONSE",
  "status": "DONE",
  "content": "I'll use the subagent-driven-development skill...",
  "tool_calls": [
    {
      "name": "invoke_subagent",
      "arguments": {
        "TypeName": "self",
        "Role": "Implementer",
        "Prompt": "Implement Task 1..."
      }
    }
  ]
}
```

### Finding transcripts

`find_transcript` (in `test-helpers.sh`) now resolves the transcript
deterministically first, via the CLI's *documented*
`~/.gemini/antigravity-cli/cache/last_conversations.json` — "A JSON map
associating absolute workspace directory paths with their most recently
active conversation ID" per the CLI's Resume Command guide — before falling
back to the mtime scan below (which isn't workspace-scoped and can pick up
an unrelated, concurrently-running conversation):

```bash
# Primary (documented): cache keyed by absolute workspace path
jq -r --arg ws "$PWD" '.[$ws] // empty' ~/.gemini/antigravity-cli/cache/last_conversations.json

# Fallback (not documented): most-recently-modified transcript in a window
find ~/.gemini/antigravity/brain -name "transcript.jsonl" -mmin -60

# Search for specific tool calls in a transcript
grep '"invoke_subagent"' ~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl
```

## Troubleshooting

### `agy` command not found

Ensure the Antigravity CLI is installed and on your `$PATH`:

```bash
which agy
```

If not installed, the test scripts will detect this and print a helpful error message.

### Plugin not loading

1. Check the plugin symlink exists:
   ```bash
   ls -la ~/.gemini/config/plugins/superpowers/
   ```
2. Verify `plugin.json` is present in the plugin directory
3. Look for plugin loading errors in Antigravity output

### Skills not triggering

- Skills auto-load in Antigravity; there's no explicit `Skill` tool call to grep for
- Instead, look for evidence the skill was read (`view_file` on `SKILL.md`) or skill name mentions in output
- Check that the plugin directory structure is correct: `skills/<skill-name>/SKILL.md`
- `run-test.sh`'s authoritative check parses a `view_file` tool-call event
  from an `--output-format stream-json` NDJSON capture — tool calls are not
  reliably visible in plain `text` output at all, so if you're debugging a
  triggering failure, inspect `agy-stream.jsonl` in the test's output
  directory, not `agy-output.txt`

### Transcript not found

`find_transcript` tries the documented `last_conversations.json` cache
first (see "Finding transcripts" above); if that cache file is missing, has
no entry for the current workspace, or `jq`/`python3`/`python` are all
unavailable, it falls back to the empirically-observed
`~/.gemini/antigravity/brain/` layout. Each conversation gets a UUID
directory:

```bash
# List recent conversations
ls -lt ~/.gemini/antigravity/brain/ | head -10

# Find transcript files
find ~/.gemini/antigravity/brain -name "transcript.jsonl" -mmin -60
```

### Test timeouts

- Default timeout is 300 seconds (5 minutes) for simple tests
- Subagent dispatch tests use 1800 seconds (30 minutes)
- Increase via the timeout parameter if needed
- Check for network issues if Antigravity is slow to respond
