# Code Reviewer Dispatch Template

This role ships as the bundled `code-reviewer` agent (`agents/code-reviewer.md`) — no
registration needed. Fill the template below and dispatch:
`invoke_subagent(Subagents: [{TypeName: "code-reviewer", Role: "<role for this task>", Prompt: <filled template>, Workspace: "inherit"}])`

## Dynamic Prompt Template

```
Review code changes for: {DESCRIPTION}

## Requirements / Plan

{PLAN_OR_REQUIREMENTS}

## Git Range to Review

**Base:** {BASE_SHA}
**Head:** {HEAD_SHA}

Run these commands to see the diff:
git diff --stat {BASE_SHA}..{HEAD_SHA}
git diff {BASE_SHA}..{HEAD_SHA}
```

**Placeholders:**
- `{DESCRIPTION}` — brief summary of what was built
- `{PLAN_OR_REQUIREMENTS}` — what it should do (plan task text or requirements)
- `{BASE_SHA}` — starting commit
- `{HEAD_SHA}` — ending commit
