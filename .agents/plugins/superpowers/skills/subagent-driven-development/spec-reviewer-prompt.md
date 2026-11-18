# Spec Compliance Reviewer Dispatch Template

This role ships as the bundled `spec-reviewer` agent (`agents/spec-reviewer.md`) — no
registration needed. Fill the template below and dispatch:
`invoke_subagent(Subagents: [{TypeName: "spec-reviewer", Role: "<role for this task>", Prompt: <filled template>, Workspace: "inherit"}])`

## Dynamic Prompt Template

```
Review spec compliance for Task {N}: {TASK_NAME}

## What Was Requested

{FULL_TASK_REQUIREMENTS}

## What Implementer Claims They Built

{IMPLEMENTER_REPORT}
```
