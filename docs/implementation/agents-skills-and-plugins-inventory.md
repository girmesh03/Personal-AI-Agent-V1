# Agents, Skills, and Plugins Inventory

**Project:** Personal AI Agent V1 (*Operon*)  
**Location:** `.agents/`  
**Lockfile:** `skills-lock.json`  
**Generated:** 2026-11-06  

---

## 1. Overview

The repository houses an engineering environment composed of two primary layers under `.agents/`:
1. **Superpowers Plugin (`.agents/plugins/superpowers/`, v6.3.0):** Native Antigravity 2.0 plugin delivering development process rules, 15 engineering skills, 4 review subagents, test suites, and purity check hooks.
2. **Core Skills Suite (`.agents/skills/`):** 23 specialized agent engineering, harness, framework, evaluation, and persistent planning skills (85 files across 36 directories), version-locked via `skills-lock.json`.

---

## 2. Superpowers Plugin (`.agents/plugins/superpowers/`)

### 2.1 Plugin Metadata & Mandatory Rules
- **Plugin Manifest:** `plugin.json` (v6.3.0), `package.json`
- **Mandatory Rule:** `rules/using-superpowers.md` — Enforces invocation of relevant skills BEFORE any response or action.
- **Purity Hook:** `hooks/purity-check.sh` — Validates tool and skill purity.

### 2.2 Specialized Subagents
| Subagent | Definition File | Role & Capabilities | Applicable Tasks |
| :--- | :--- | :--- | :--- |
| `code-reviewer` | `agents/code-reviewer.md` | Rigorous code review specialist evaluating architecture, tests, maintainability, and security with Critical/Important/Minor severity. | Task completion reviews, architectural compliance checks. |
| `implementer` | `agents/implementer.md` | Executes tasks from approved implementation plans; writes tests and code, verifies, and reports status. | Focused task implementation runs. |
| `re-reviewer` | `agents/re-reviewer.md` | Verifies fix diffs against previous review findings; verdicts findings as ADDRESSED or NOT ADDRESSED. | Follow-up review after addressing review feedback. |
| `spec-reviewer` | `agents/spec-reviewer.md` | Verifies task implementation matches requirement specification; detects Missing/Extra/Misunderstood behavior. | Task and phase acceptance verification. |

### 2.3 Superpowers Skills (15 Skills)
| Skill | Directory | Purpose | Usage in V1 Project |
| :--- | :--- | :--- | :--- |
| `using-superpowers` | `skills/using-superpowers/` | Foundation rule: invoke skills before any response or action. | Active in every session. |
| `brainstorming` | `skills/brainstorming/` | Requirements exploration and design before implementation. | Used before major architectural or design steps. |
| `writing-plans` | `skills/writing-plans/` | Structured plan authoring with verification steps. | Authoring phase and task implementation plans. |
| `executing-plans` | `skills/executing-plans/` | Step-by-step plan execution with review checkpoints. | Executing planned phases in controlled batches. |
| `test-driven-development` | `skills/test-driven-development/` | Red-Green-Refactor discipline enforcement. | Backend API test-first development. |
| `systematic-debugging` | `skills/systematic-debugging/` | 4-phase root-cause analysis before fixing bugs. | Investigating test failures or runtime defects. |
| `verification-before-completion` | `skills/verification-before-completion/` | Evidence-first verification before claiming task completion. | Mandatory gate before presenting tasks for owner review. |
| `requesting-code-review` | `skills/requesting-code-review/` | Automated dispatch of code review specialist. | Independent task review before owner review. |
| `receiving-code-review` | `skills/receiving-code-review/` | Evidence-based processing of code review feedback. | Handling owner or reviewer feedback. |
| `finishing-a-development-branch` | `skills/finishing-a-development-branch/` | Clean branch finalization, verification, and integration. | Phase completion and branch merge procedures. |
| `subagent-driven-development` | `skills/subagent-driven-development/` | Parallel subagent dispatch and verification. | Coordinating independent subtasks. |
| `dispatching-parallel-agents` | `skills/dispatching-parallel-agents/` | Multi-agent orchestration for independent tasks. | Independent research or test execution. |
| `browser-testing` | `skills/browser-testing/` | Visual and behavioral UI verification. | Frontend task verification (ONLY after owner approval). |
| `using-git-worktrees` | `skills/using-git-worktrees/` | Workspace isolation via native git worktrees. | Branch isolation when required. |
| `writing-skills` | `skills/writing-skills/` | Guide and linter for creating agent skills. | Reference for skill structure. |

---

## 3. Core Skills Suite (`.agents/skills/`)

### 3.1 LangChain Foundations & RAG Suite (7 Skills)
| Skill | Directory | Purpose | Application to V1 |
| :--- | :--- | :--- | :--- |
| `ecosystem-primer` | `ecosystem-primer/` | Framework selection: LangChain vs LangGraph vs Deep Agents. | Primary architectural reference for layer assignment. |
| `langchain-dependencies` | `langchain-dependencies/` | Required package versions, Node 20+ requirement, `@langchain/core` peer requirement. | Root dependency catalog and manifest consolidation. |
| `langchain-fundamentals` | `langchain-fundamentals/` | Core `createAgent` API with `model`, `tools`, and `systemPrompt`. | Foundational conversational agent construction. |
| `langchain-middleware` | `langchain-middleware/` | Middleware hooks, `humanInTheLoopMiddleware`, structured output with Zod. | Safety limits, correlation IDs, output formatting. |
| `langchain-rag` | `langchain-rag/` | Document loaders, text splitters, vector stores. | Document analysis and retrieval workflows. |
| `langchain-python-quickstart` | `langchain-python-quickstart/` | Python quickstart scaffold (reference only). | Conceptual reference only; V1 is JavaScript ES Modules. |
| `langchain-typescript-quickstart`| `langchain-typescript-quickstart/` | TypeScript/Node quickstart scaffold. | Reference for Node.js LangChain patterns. |

### 3.2 LangGraph Architecture Suite (7 Skills)
| Skill | Directory | Purpose | Application to V1 |
| :--- | :--- | :--- | :--- |
| `langgraph-fundamentals` | `langgraph-fundamentals/` | `StateGraph`, nodes, edges, `Command`, `Send`, streaming, error handling. | Stateful agent workflows and durable multi-step execution. |
| `langgraph-persistence` | `langgraph-persistence/` | Durable checkpointers, `thread_id` session isolation, time travel. | Durable graph checkpointing and recovery in MongoDB. |
| `langgraph-human-in-the-loop` | `langgraph-human-in-the-loop/` | `interrupt()`, `Command(resume=...)`, approval workflows. | Human-in-the-loop approval gates for consequential tools. |
| `langgraph-decision-models` | `langgraph-decision-models/` | Deterministic decision model routing. | Fast routing without redundant LLM calls. |
| `langgraph-cli` | `langgraph-cli/` | LangGraph CLI toolchain and configuration. | CLI reference. |
| `langgraph-python-quickstart` | `langgraph-python-quickstart/` | Python LangGraph quickstart (reference only). | Conceptual reference. |
| `langgraph-typescript-quickstart`| `langgraph-typescript-quickstart/`| TypeScript LangGraph quickstart. | Node.js LangGraph reference patterns. |

### 3.3 Deep Agents Architecture Suite (6 Skills)
| Skill | Directory | Purpose | Application to V1 |
| :--- | :--- | :--- | :--- |
| `deep-agents-core` | `deep-agents-core/` | Deep Agents harness architecture and `create_deep_agent()`. | Advanced long-running agent workflows (evaluated per ADR). |
| `deep-agents-memory` | `deep-agents-memory/` | StateBackend and StoreBackend routing. | Memory and persistence patterns. |
| `deep-agents-orchestration` | `deep-agents-orchestration/` | Subagent delegation, TodoList decomposition. | Complex task planning and subagent execution. |
| `managed-deep-agents` | `managed-deep-agents/` | LangSmith managed deep agent deployments. | Observability and deployment reference. |
| `deepagents-python-quickstart` | `deepagents-python-quickstart/` | Python deep agent scaffold (reference only). | Conceptual reference. |
| `deepagents-typescript-quickstart`| `deepagents-typescript-quickstart/`| TypeScript deep agent scaffold. | TypeScript deep agent reference. |

### 3.4 Swarm & Parallel Map-Reduce (1 Skill)
| Skill | Directory | Purpose | Application to V1 |
| :--- | :--- | :--- | :--- |
| `swarm` | `swarm/` | High-throughput fan-out / fan-in parallel processing for tabular work. | Batch document and data processing jobs. |

### 3.5 Evaluation & Benchmark Engineering (1 Skill)
| Skill | Directory | Purpose | Application to V1 |
| :--- | :--- | :--- | :--- |
| `eval-engineering` | `eval-engineering/` | Harbor task authoring, verifiers, multi-turn simulations. | Model capability qualification and regression verification. |

### 3.6 Persistent Disk-Based Planning (1 Skill)
| Skill | Directory | Purpose | Application to V1 |
| :--- | :--- | :--- | :--- |
| `planning-with-files` | `planning-with-files/` | Persistent disk memory via `task_plan.md`, `findings.md`, `progress.md`. | Active session working memory, progress tracking, and reboot recovery. |

---

## 4. Preservation & Integrity Rules
1. **Immutable Skill Assets:** `.agents/`, `.agents/plugins/superpowers/`, `.agents/skills/`, and `skills-lock.json` must remain intact and unmodified.
2. **Runtime Independence:** Skills are engineering environment assets, not application runtime dependencies.
3. **No Fabrication:** Subagents and skills must only be documented as used when actually invoked.
