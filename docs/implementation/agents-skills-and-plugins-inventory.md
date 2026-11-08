# Agents, Skills, and Plugins Inventory

> **Product:** Operon (Personal AI Agent V1)  
> **Environment:** Antigravity 2.0  
> **Authority:** `AGENTS.md` (Section 6.4) & `Master-Personal-AI-Agent-V1-documentation.md` (Section 26.13.1)  
> **Status:** Active Governance Baseline  
> **Date:** 2026-11-09  

---

## 1. Executive Summary

This inventory establishes the authoritative registry of all AI agent skills, plugins, custom subagents, and built-in Antigravity tooling configured within this repository. In accordance with `AGENTS.md` Section 6.4, these skills must be actively utilized throughout the engineering lifecycle for structured planning, test-driven development, code reviews, and framework-level LangChain/LangGraph agent implementation.

---

## 2. Superpowers Engineering Process Skills

The repository includes the Superpowers workflow suite (`.agents/plugins/superpowers/skills/`):

| Skill Name | Location | Primary Purpose & Usage Phase |
|---|---|---|
| `using-superpowers` | `.agents/plugins/superpowers/skills/using-superpowers` | Universal meta-skill: enforces skill selection and invocation rules before any response or action. |
| `brainstorming` | `.agents/plugins/superpowers/skills/brainstorming` | Architectural, bounded, and spike design exploration; required before creating features or planning changes. |
| `writing-plans` | `.agents/plugins/superpowers/skills/writing-plans` | Converts architectural specifications into bite-sized, TDD-ready, verifiable implementation plans. |
| `subagent-driven-development` | `.agents/plugins/superpowers/skills/subagent-driven-development` | Orchestrates independent task execution with fresh subagents and two-stage review gates. |
| `test-driven-development` | `.agents/plugins/superpowers/skills/test-driven-development` | Strict TDD loop: failing test -> verification -> minimal implementation -> passing test -> commit. |
| `verification-before-completion` | `.agents/plugins/superpowers/skills/verification-before-completion` | Prohibits unverified completion claims; mandates explicit test execution and evidence before commit. |
| `systematic-debugging` | `.agents/plugins/superpowers/skills/systematic-debugging` | Structured 4-phase root-cause investigation for bugs and test failures before proposing fixes. |
| `browser-testing` | `.agents/plugins/superpowers/skills/browser-testing` | Frontend visual and interactive verification in the browser (strictly owner-authorized in V1). |
| `requesting-code-review` | `.agents/plugins/superpowers/skills/requesting-code-review` | Dispatches read-only code review before task acceptance or branch merges. |
| `receiving-code-review` | `.agents/plugins/superpowers/skills/receiving-code-review` | Technical evaluation and surgical addressing of code review findings with regression testing. |
| `executing-plans` | `.agents/plugins/superpowers/skills/executing-plans` | Executes written multi-task plans with checkpoints in fresh or resumed sessions. |
| `dispatching-parallel-agents` | `.agents/plugins/superpowers/skills/dispatching-parallel-agents` | Fans out 2+ independent, non-overlapping tasks to parallel subagents. |
| `finishing-a-development-branch` | `.agents/plugins/superpowers/skills/finishing-a-development-branch` | Phase-end review, merge preparation, and branch closure workflow. |
| `using-git-worktrees` | `.agents/plugins/superpowers/skills/using-git-worktrees` | Workspace isolation for concurrent branch or feature development. |
| `writing-skills` | `.agents/plugins/superpowers/skills/writing-skills` | Meta-skill for authoring, editing, and verifying new agent skills. |

---

## 3. LangChain, LangGraph, and Deep Agents Skills

The repository incorporates 22 LangChain ecosystem skills (`.agents/skills/`), tracked under `skills-lock.json`:

| Skill Name | Framework Layer | Primary Purpose |
|---|---|---|
| `ecosystem-primer` | Foundation | Framework routing: LangChain vs LangGraph vs Deep Agents selection guide. |
| `langchain-dependencies` | Packaging | Package compatibility, version pinning (LangChain 1.0 LTS, Node 20+), peer dependencies. |
| `langchain-fundamentals` | LangChain | `create_agent`, tool binding, model wrappers, standard agent loops. |
| `langchain-middleware` | LangChain | Human-in-the-loop tool approval middleware, structured outputs with Zod/Pydantic. |
| `langchain-rag` | LangChain | Text splitters, embeddings, vector stores (Pinecone, Chroma, FAISS). |
| `langchain-typescript-quickstart` | Quickstart | Scaffolding minimal TypeScript/Node LangChain agents. |
| `langchain-python-quickstart` | Quickstart | Scaffolding minimal Python LangChain agents. |
| `langgraph-fundamentals` | LangGraph | `StateGraph`, node functions, conditional routing, edge definitions, streaming. |
| `langgraph-human-in-the-loop` | LangGraph | Interrupt-and-resume workflows (`interrupt()`, `Command(resume=...)`), 4-tier error handling. |
| `langgraph-persistence` | LangGraph | Durable state persistence, thread checkpointers, cross-thread shared memory. |
| `langgraph-decision-models` | LangGraph | Deterministic fast routing models without full LLM round-trips. |
| `langgraph-cli` | Tooling | LangGraph CLI scaffolding and deployment commands. |
| `langgraph-typescript-quickstart` | Quickstart | Scaffolding minimal TypeScript/Node LangGraph runtimes. |
| `langgraph-python-quickstart` | Quickstart | Scaffolding minimal Python LangGraph runtimes. |
| `deep-agents-core` | Deep Agents | `create_deep_agent`, harness architecture, toolsets, and execution harness. |
| `deep-agents-memory` | Deep Agents | Cross-session memory backends (`StoreBackend`, `CompositeBackend`). |
| `deep-agents-orchestration` | Deep Agents | Hierarchical subagent delegation, task decomposition, human interrupts. |
| `deepagents-typescript-quickstart` | Quickstart | Scaffolding minimal TypeScript/Node Deep Agents applications. |
| `deepagents-python-quickstart` | Quickstart | Scaffolding minimal Python Deep Agents applications. |
| `managed-deep-agents` | Deep Agents | Cloud-managed deep agents deployment in LangSmith. |
| `eval-engineering` | Quality | Agent benchmark design, Harbor tasks, eval verification. |
| `planning-with-files` | Process | Persistent on-disk planning (`task_plan.md`, `findings.md`, `progress.md`), session recovery. |
| `swarm` | Parallelism | Data-driven fan-out of batched tasks across worker agents. |

---

## 4. Antigravity Built-in Skills & Extensions

| Skill Name | Origin | Primary Purpose |
|---|---|---|
| `agy-customizations` | Antigravity Built-in | Documentation for Antigravity rules, hooks, skills, and configuration hierarchy. |
| `antigravity-guide` | Antigravity Built-in | Reference guide for AGY CLI, IDE shortcuts, and workspace features. |
| `automation` | Antigravity Built-in | Scheduled background jobs and cron-driven agent tasks. |
| `generative_ui` | Antigravity Built-in | Interactive HTML widgets and rich UI artifacts. |
| `migrate-workflows` | Antigravity Built-in | Migrates legacy workflows to modern SKILL.md specs. |
| `plugin` | Antigravity Built-in | Plugin packaging and marketplace management. |
| `ui-plugin-navigation` | Antigravity Built-in | UI sidecar and plugin panel navigation. |

---

## 5. Execution Governance Rules

1. **Mandatory Planning with Files:** All multi-step work must maintain `task_plan.md`, `findings.md`, and `progress.md` at the project root.
2. **Framework Compliance:** When implementing AI agent features (Phases 3–5), `ecosystem-primer` and `langchain-dependencies` must be invoked first.
3. **No Unapproved Packages:** Never install or use `@google/genai` or unapproved raw SDKs. Google Gemini must be accessed through `@langchain/google` and `ChatGoogle`.
4. **Owner Review Precedence:** Skills provide structure; owner review gates in `AGENTS.md` and the master specification always take precedence.
