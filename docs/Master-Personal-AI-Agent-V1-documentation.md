# Master Personal AI Agent V1 Documentation

**Document:** `docs/Master-Personal-AI-Agent-V1-documentation.md`
**Authority:** Authoritative product, architecture, implementation, verification, and governance specification for V1
**Prepared:** 2026-11-05
**Status:** Architecture baseline for phased implementation; product decisions and phase changes remain subject to the review gates in this document
**Primary implementation language:** JavaScript ES Modules (`.js`, `.jsx`) unless a reviewed Architecture Decision Record (ADR) authorizes an exception
**Application shape:** Single-user, personal AI partner; browser SPA + Node.js API + MongoDB; remote model inference only

---

## Document control, authority, and interpretation

### 1.1 Purpose

This document is the single consolidated specification for designing, implementing, testing, reviewing, and releasing Personal AI Agent V1. It is an engineering specification, not a conversational prompt and not a request to implement blindly. The implementation agent must use it as the authoritative source for V1 requirements, architecture, domain boundaries, constraints, file organization, sequencing, quality gates, and review protocol.

The implementation agent receives this file and two read-only source exports:

- `docs/Backend-Personal-AI-Agent-V0-Codebase.md`
- `docs/Client-Personal-AI-Agent-V0-Codebase.md`

Those source exports are historical functional and implementation references only. They must never become V1 architecture authorities. Do not access, request, locate, or depend on the original V0 repository. The Markdown exports are the supplied source boundary.

### 1.2 Authority hierarchy

Resolve conflicts in this order:

1. Explicit, current direction from the product owner in the active conversation.
2. This master V1 specification, including any later owner-approved amendments.
3. Owner-approved ADRs and phase-specific acceptance criteria that do not conflict with this master specification.
4. Verified current official documentation for the relevant framework, package, provider, browser API, and security standard.
5. Source code and product requirements found in the read-only reference exports, as evidence of existing behavior only.
6. Agent assumptions, defaults, generated plans, examples, and comments.

A code comment, old implementation plan, package README, model output, or historical requirement is not an authority to override a security invariant or a current user instruction.

### 1.3 Handling contradictions and uncertainty

Do not silently reconcile conflicting requirements. Record the conflict in `docs/adr/` or `findings.md`, state the competing interpretations, assess consequences, and recommend one. Resolve product decisions with the owner at the next review gate. Security, data integrity, ownership, and paid-action safeguards must fail closed while unresolved. Technical choices that are reversible and within approved constraints may be decided by the architect and recorded as an ADR.

Classify every relevant requirement as:

- **Confirmed:** directly supported by an explicit owner instruction or this specification.
- **Source-observed:** visible in the supplied exports; it proves V0 had the behavior, not necessarily that V1 must use the same implementation.
- **Research-verified:** supported by current official documentation or provider terms, with URL and access date.
- **Inferred:** a logical engineering consequence; explain its reason.
- **Unverified:** requires runtime, account, package, environment, or owner confirmation.

Never turn an unverified point into a factual claim or a release promise.

### 1.4 Reference-file integrity

The two source exports are immutable inputs. Do not edit, rename, delete, regenerate, or reformat them. Do not copy source code wholesale into V1. Extract behavior and contracts, classify each file using the disposition register in this document, and write a new implementation that follows V1 architecture. The source exports contain approximately 21,491 backend lines across 61 source sections and 39,082 client lines across 153 source sections. The agent must validate the section headers and counts before relying on the inventory; if the export is incomplete, record the discrepancy rather than inventing missing files.

### 1.5 No guarantee of zero defects

No specification can guarantee a defect-free application. V1 must instead use explicit invariants, reproducible tests, security review, owner review, regression testing, and documented release evidence. Never claim “zero bugs,” “100% secure,” or “fully tested” without defining and supplying the relevant evidence.

---

## 2. Product identity, purpose, and boundaries

### 2.1 Product identity

Personal AI Agent is a private, general-purpose AI partner that helps one individual manage and execute work across professional and personal life. It should be useful for planning, communication, research, writing, document understanding, decisions, projects, reminders, data analysis, and authorized actions. The product must not be globally branded, architected, or constrained as a restaurant reporting tool, employee-management system, or industry-specific chatbot.

The user may have professional roles, projects, contacts, and domain-specific workflows. These are contextual workspaces or modules within the broader personal product, not the identity of the whole application.

### 2.2 V1 account model

V1 is for an individual account. A person may maintain contacts, branch personnel, collaborators, vendors, or other people as domain records, but those records do not automatically become application accounts. Do not build organization tenancy, team workspaces, staff login, RBAC, enterprise administration, or account switching unless the owner explicitly approves a later requirement and ADR.

All user-owned data must be isolated using the authenticated server-side user identity. Client-provided `userId`, owner IDs, tenant IDs, role claims, and similar values are never trusted for authorization.

### 2.3 Domain-module boundary

The existing multi-branch restaurant operations capability must remain represented as an independently bounded domain module. Preserve its user-visible capabilities: branch directory and detail; branch archival/restoration; branch metrics and history; operational reports; branch visits and time records; activities; issues; observations/comments; report editing and archiving; Amharic dossier rendering; Ethiopian calendar support; audio-backed reporting; report document generation; Google Drive and Telegram delivery where connected and authorized.

The domain module must not impose its entities, words, prompts, fields, routes, or workflows on the global product. It must be possible to disable or remove this module without breaking authentication, chat, files, memory, projects, tasks, or the general AI partner. Domain tools are registered by module and receive the same security/approval infrastructure as core tools.

### 2.4 Scope principles

- Preserve V0 user-facing functionality unless this document explicitly changes its implementation or a behavior is unsafe, contradictory, or impossible to support responsibly.
- Preserve the *capability*, not its original code, database shape, route design, dependencies, or defects.
- Keep core product capabilities independent from the restaurant operations module.
- Do not invent a requirement merely because a package advertises it.
- Do not expose an unfinished feature as supported. Use explicit unavailable, disabled, or not-yet-supported states.
- No hidden paid use, no silent provider substitution, and no unauthorized external side effects.

---

## 3. Input-derived capability preservation register

This register establishes what must be preserved as an observable capability, redesigned, or deferred. The agent must trace each item to UI entry points, API contracts, data entities, services, permissions, failure modes, and acceptance tests before implementation.

| Capability family | V1 disposition | Required V1 behavior |
|---|---|---|
| Registration, login, logout, session restore | Preserve and harden | Email/password auth; Google sign-in where correctly configured; HTTP-only cookie sessions; secure refresh rotation; clear logged-in and logged-out states; safe account linking. |
| Profile and preferences | Preserve and generalize | Profile, language, locale, timezone, model/provider settings, directives, privacy, security, connectors, and data controls. |
| AI model configuration | Replace architecture | Provider-neutral registry and per-user provider/model selection, capability metadata, secure key storage, validation, and explicit provider consent. |
| Chat and history | Preserve and redesign | Create/list/search/rename/pin/archive/delete threads; message pagination; stable ordering; streaming; stop; retry; continue; edit; branch; model switching; recoverable errors. |
| Chat tool interactions | Preserve and secure | Typed tool calls/results, execution timeline, deterministic status, traceability, approval gates, safe result rendering, and idempotent execution. |
| Text input | Preserve | Empty-text message is valid when a valid attachment/audio input or explicit operation is present. Text-only is first-class. |
| Images and documents | Preserve and generalize | Upload, private storage, preview, reference across turns/projects, extraction, grounded Q&A, and provenance. Original asset remains distinct from derived content. |
| Audio attachments and recording | Preserve and redesign | Audio-only message acceptance; recording; upload state; transcription; raw-asset retention; transcript continuity; explicit capability disclosure. |
| Live speech-to-text | Conditional preservation | Keep only after remote provider qualification for latency, language, price, terms, privacy, and Ethiopia access. Provide a clear fallback or disabled state; do not pretend transcript is raw audio understanding. |
| Text-to-speech | Conditional preservation | Retain as an optional capability only with a qualified remote provider, user control, and cost/consent handling. |
| PDF, DOCX, XLSX, CSV, TXT, Markdown, JSON | Preserve | Parse supported input types and generate supported output types; validate tables, Unicode, dates, formulas, layouts, and large files. |
| Google Drive | Preserve as optional connector | OAuth least privilege, list/search/create/manage, private-by-default behavior, scoped folder access, safe exports, and approval for external sharing/deletion. |
| Telegram | Preserve as optional connector | Text and image-card delivery; configurable destinations/channels; explicit destination preview and approval before sending. |
| Dashboard | Preserve, generalize | General personal overview plus module-specific widgets. Operational metrics appear only when the domain module is enabled. |
| Branch/report module | Preserve as bounded module | All core branch/report CRUD, analytics, history, archive/restore, Amharic report rendering, calendar behavior, and delivery capabilities. |
| Ethiopian calendar and Amharic | Preserve where relevant | Ethiopia timezone support; Ethiopic font/rendering verification; bilingual domain data where needed; Gregorian/Ethiopian date mapping stored and normalized deliberately. |
| Directives and report templates | Preserve and secure | User-editable preferences and templates with scoped application; directives cannot override authorization, safety, or system security. |
| Attachments across turns | Redesign | Durable asset IDs, access checks, provenance, derived representation tracking, and intentional inclusion in future model context. |
| Local/public upload paths | Replace | No direct public static serving of private user uploads. All private retrieval requires authorization or short-lived signed access after ownership check. |
| In-memory generated file registry | Replace | Durable metadata and ownership record; safe object storage; expiration and cleanup reconciliation. |
| Single large Chat.messages array | Replace | Separate thread, turn, message, run, event, and attachment records; stable IDs and cursor pagination. |
| Raw internal reasoning display | Replace | Show safe progress/status and user-facing explanations, not private chain-of-thought or hidden reasoning tokens. |
| Autonomous destructive tools | Replace | Human approval with exact action preview, parameter hash, one-time approval token, ownership check, and audit trail. |
| V0-specific persona and global domain prompt | Replace | General personal AI partner persona; modular skills and domain-specific context loaded only when relevant. |

**Acceptance rule:** “Preserved” means the relevant user can still accomplish the task in V1 through an approved user-facing flow. It does not require matching the exact V0 screen, component name, route, or implementation.

---

## 4. Non-negotiable first principles and engineering invariants

### 4.1 Correctness and ownership

1. The database and server are the source of truth for identity, permissions, persisted data, run status, and approvals.
2. Every owner-scoped query, update, deletion, download, background job, connector callback, and tool operation must apply server-derived ownership scope.
3. Never rely on the model, UI, prompt, or client-provided IDs as an authorization boundary.
4. Return a consistent 404 for inaccessible owner-scoped resources where revealing existence would create an enumeration risk.
5. Validate every boundary: HTTP request, upload, provider response, tool output, connector payload, persisted record, and browser event.
6. Prefer explicit state machines and stable identifiers to inferred state based on array position, timing, or message adjacency.
7. Every external side effect must be attributable to an authenticated user, a tool/run, an exact payload, and an authorization decision.
8. Use database transactions for multi-document invariants where MongoDB transaction support is actually available. Never label a session-only operation as transactional.
9. Never perform irreversible filesystem/object-storage deletion before the database transaction that makes the deletion authoritative has committed. Use an outbox/reconciliation workflow.
10. Use idempotency keys for retried requests, jobs, tools, and connector actions that can create side effects.

### 4.2 Code quality and organization

11. Use modern JavaScript ES Modules and JSDoc by default, consistent with the existing JavaScript-first codebase. TypeScript is not introduced without an ADR and owner approval.
12. Maintain one canonical dependency manifest and one lockfile at repository root. Do not create `backend/package.json`, `client/package.json`, nested package-lock files, or nested dependency trees.
13. Do not install a package merely because it appears in this document. Verify its current API, version, Node compatibility, React compatibility, MUI compatibility, license, maintenance, security status, and paid-feature boundary first.
14. Prefer small, explicit application services over duplicated frameworks and excessive abstraction.
15. A feature has one source of truth. Do not maintain two competing stores for the same chat messages, model config, upload status, session status, or job state.
16. Keep backend controllers thin: authenticate, validate, invoke application service, map response. Business rules belong in domain/application services.
17. Keep UI components focused on presentation and user interaction. Do not embed database, authorization, provider selection, or agent orchestration rules in React components.
18. Remove dead code, redundant adapters, stale constants, copied prompt blocks, unused dependencies, and transitional shims after a migration is complete and verified.
19. Do not introduce hardcoded model names, quota assumptions, page limits, upload limits, branch names, or date formats in multiple layers. Define canonical configuration and validate it.
20. Keep every dependency version and integration contract traceable to one version-approval record.

### 4.3 AI and model governance

21. Remote inference is mandatory. Do not use local LLMs, local model runtimes, locally hosted model weights, GPU/VRAM dependencies, Ollama, llama.cpp, vLLM, or equivalents.
22. Do not perform local AI inference for embeddings, OCR, speech-to-text, or text-to-speech. Deterministic file parsing, media conversion/chunking, hashing, and arithmetic are allowed locally.
23. A free JavaScript SDK does not make a hosted inference API free. Provider price, free quota, account requirements, credit-card requirements, availability in Ethiopia, commercial terms, data retention, and modality support must be independently checked.
24. No paid inference may be invoked silently. No automatic paid fallback is allowed. BYOK paid access is optional, explicitly activated by the owner, and clearly disclosed before use.
25. If the provider cannot cap spend, the application must require explicit per-request confirmation for paid operations or disable them.
26. A model's declared modality is not enough. Qualify each provider/model for each capability: text, streaming, tool calling, structured output, vision, audio input, transcription, TTS, embedding, and context size.
27. Never tell the user a model received raw audio/video when it received only transcript, extracted text, or a transformed payload.
28. Model output is untrusted. Validate structured output, tool arguments, generated links, claims, and all resource references before acting.
29. Agent prompts and user directives cannot override backend authorization, cost rules, data boundaries, or approval requirements.
30. Do not expose hidden chain-of-thought. Stream safe status, concise rationale, citations, and tool progress only.

### 4.4 Frontend and interaction

31. UI must distinguish loading, empty, partial, stopped, failed, unauthorized, retryable, and complete states. Do not convert fetch failures into empty data.
32. The composer must keep upload progress separate from generation progress.
33. A valid audio-only or file-only user message is not an empty message.
34. Retry, edit, continue, branch, and model-switch operations must each have explicit semantics and preserve the correct attachment/tool history.
35. Canceling a browser stream is not proof that a remote model call or external tool side effect stopped.
36. No untrusted Markdown/HTML, SVG, code, or generated UI is rendered without suitable sanitization and a constrained rendering strategy.
37. Preserve keyboard accessibility, mobile responsiveness, focus handling, and a usable error recovery path.
38. Maintain application UI in English unless an explicit localized interface is designed; support Amharic and Ethiopic content where user data or output requires it. Do not mix UI language mandates with domain-content mandates.

### 4.5 Security, privacy, and retention

39. Secrets, provider keys, OAuth tokens, session credentials, and connector tokens never appear in frontend bundles, URLs, logs, analytics, prompts, or error messages.
40. Encrypt user-supplied provider/API credentials before persistence using an envelope-encryption design with a separately managed key-encryption key, unique nonce per encryption, authenticated additional data, rotation support, and redaction. Do not invent key-management infrastructure; document deployment prerequisites.
41. Minimize provider data disclosure. Before first use of each provider/capability, explain the categories of data sent and let the owner control the provider.
42. Treat uploaded documents, web pages, MCP results, and third-party content as untrusted data. Delimit them and prevent their contents from becoming tool/authorization instructions.
43. Enforce upload allowlists, actual file signature/content inspection, file-size and decompression limits, safe filenames, malware-scanning boundary where feasible, and private storage.
44. Protect against CSRF, SSRF, IDOR, path traversal, XSS, injection, insecure redirects, replay, confused-deputy tool invocation, and resource exhaustion.
45. Provide account data export and deletion with a clear retention/deletion state machine, including assets, derived content, checkpoints, memory, indexes, connectors, and generated files.
46. Audit security-sensitive events without logging secrets or unnecessary personal content.

### 4.6 Execution discipline

47. Do not modify the reference exports. Do not access the old source repository. Do not create implementation code before the relevant phase/task has been analyzed and its scope is clear.
48. Work in dedicated feature branches; never commit directly to `main`.
49. Every task ends at an explicit owner review gate. Every phase ends at a separate integration and merge gate.
50. A review request is a stop point. Do not stage, commit, merge, push, delete branches, or start the next task/phase unless the owner approves the specific action.
51. Do not fabricate subagent participation, tests, browser results, external actions, package availability, or provider qualification.
52. If tools or required services are unavailable, report the exact limitation and continue with independent work that does not depend on the blocked item.

---

## 5. Functional requirements register

The requirements below consolidate the current product direction with behavior visible in the reference code. Priority means release priority, not permission to bypass user review.

### 5.1 Authoritative requirement register (52 unique requirements)

Requirement identifiers and priorities below retain the exact IDs and priorities of the product requirements specification supplied for review. This master document consolidates their architecture and acceptance; the traceability file must carry forward these IDs without renaming them.

#### Core platform (43 requirements)

| Requirement ID | Priority | Requirement title | V1 treatment |
|---|---:|---|---|
| `FR-CORE-ASST-001` | **P0** | General-Purpose Partner Identity | Core launch requirement |
| `FR-CORE-ASST-002` | **P0** | Dynamic Linguistic Mirroring | Core launch requirement |
| `FR-CORE-ASST-003` | **P0** | Structured Decision Analysis | Core launch requirement |
| `FR-CORE-CONV-001` | **P0** | Reliable Incremental Response Streaming | Core launch requirement |
| `FR-CORE-CONV-002` | **P0** | In-Place Turn Lifecycle and Explicit Branching | Core launch requirement |
| `FR-CORE-CONV-003` | **P0** | Dynamic Model Selection (Between Turns) | Core launch requirement |
| `FR-CORE-CONV-004` | **P0** | Observable Task Progress & Execution Statuses | Core launch requirement |
| `FR-CORE-CONV-005` | **P0** | Conversation Search & History Pagination | Core launch requirement |
| `FR-CORE-CONV-006` | **P0** | Multi-Turn Attachment Continuity & Context Retention | Core launch requirement |
| `FR-CORE-MEM-001` | **P0** | Declarative User Directives Engine (SSOT) | Core launch requirement |
| `FR-CORE-MEM-002` | **P0** | Conversational Directive Modification | Core launch requirement |
| `FR-CORE-MEM-003` | **P1** | Multi-Tier Episodic Memory with Provenance | V1 capability; provider/modality qualification applies |
| `FR-CORE-MEM-004` | **P1** | Sovereign Memory Governance (Search, Edit, Delete with Invalidation) | V1 capability; provider/modality qualification applies |
| `FR-CORE-MEDIA-001` | **P0** | Modality Ingestion Neutrality | Core launch requirement |
| `FR-CORE-MEDIA-002` | **P1** | Acoustic Audio Understanding (Speech vs Ambient Audio) | V1 capability; provider/modality qualification applies |
| `FR-CORE-MEDIA-003` | **P1** | Speech-to-Text Transcription Pipeline | V1 capability; provider/modality qualification applies |
| `FR-CORE-MEDIA-004` | **P1** | Real-Time Live Speech Dictation | V1 capability; provider/modality qualification applies |
| `FR-CORE-MEDIA-005` | **P1** | Multilingual Text-to-Speech (TTS) Synthesis | V1 capability; provider/modality qualification applies |
| `FR-CORE-MEDIA-006` | **P1** | Native Multimodal Document and Visual Layout Understanding | V1 capability; provider/modality qualification applies |
| `FR-CORE-DOC-001` | **P0** | Multi-Format Document Ingestion | Core launch requirement |
| `FR-CORE-DOC-002` | **P0** | Autonomous Document Generation & File Export | Core launch requirement |
| `FR-CORE-DOC-003` | **P0** | Asset Distinction & Durable Reconciliation Lifecycle | Core launch requirement |
| `FR-CORE-BIZ-001` | **P0** | Professional Correspondence & Authorship | Core launch requirement |
| `FR-CORE-RES-001` | **P1** | Grounded Document Question Answering | V1 capability; provider/modality qualification applies |
| `FR-CORE-RES-002` | **P1** | Abstracted Live Web Research Connector | V1 capability; provider/modality qualification applies |
| `FR-CORE-TASK-001` | **P1** | Conversational Action Item & Task Extraction | V1 capability; provider/modality qualification applies |
| `FR-CORE-TASK-002` | **P1** | Context-Aware Reminders & Scheduling | V1 capability; provider/modality qualification applies |
| `FR-CORE-PROJ-001` | **P1** | Project Workspaces & Context Isolation | V1 capability; provider/modality qualification applies |
| `FR-CORE-DATA-001` | **P0** | Verifiable Numerical & Tabular Data Analysis | Core launch requirement |
| `FR-CORE-AGENT-001` | **P0** | Multi-Step Autonomous Tool Execution | Core launch requirement |
| `FR-CORE-AGENT-002` | **P0** | Exact-Parameter Action Authorization Gates (Human-in-the-Loop) | Core launch requirement |
| `FR-CORE-AGENT-003` | **P1** | Durable Execution State & Idempotent Recovery | V1 capability; provider/modality qualification applies |
| `FR-CORE-MODEL-001` | **P0** | Remote Model Provider Configuration and Free Usage Management | Core launch requirement |
| `FR-CORE-SEC-001` | **P0** | Individual Account Data Isolation Baseline | Core launch requirement |
| `FR-CORE-SEC-002` | **P0** | Protected BYOK Credential Storage | Core launch requirement |
| `FR-CORE-SEC-003` | **P0** | User Account Deletion & Data Export Lifecycle | Core launch requirement |
| `FR-CORE-SEC-004` | **P0** | Background Data Maintenance & Asset Lifecycle | Core launch requirement |
| `FR-CORE-SEC-005` | **P0** | Local Authentication and Secure Session Lifecycle | Core launch requirement |
| `FR-CORE-SEC-006` | **P0** | Verified Single Sign-On (SSO) & Safe Account Linking | Core launch requirement |
| `FR-CORE-SEC-007` | **P0** | Remote Provider Data Transparency and User Consent | Core launch requirement |
| `FR-CORE-INT-001` | **P1** | Extensible Integration Connector Architecture | V1 capability; provider/modality qualification applies |
| `FR-CORE-PRO-001` | **P1** | Scheduled User Reminders and Notification Dispatch | V1 capability; provider/modality qualification applies |
| `FR-CORE-PRO-002` | **P2** | Proactive Daily Morning Briefing Engine | Post-launch enhancement; not a core launch blocker |

#### Operations domain module (9 requirements)

| Requirement ID | Priority | Requirement title | V1 treatment |
|---|---:|---|---|
| `FR-DOM-REST-001` | **P1** | Branch Directory and Location Profiles | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-002` | **P1** | Operational Inspection and Checklist Capture | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-003` | **P1** | Single-Branch and Multi-Branch Visit Workflows | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-004` | **P1** | Issue Tracking, Assignment, and Remediation Follow-Up | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-005` | **P1** | Dual Calendar Support (Ethiopian and Gregorian) | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-006` | **P1** | Bilingual Operational Reporting (Amharic and English) | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-007` | **P1** | Operational Media and Evidence Association | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-008` | **P1** | Inspection Report Viewing, Editing, Export, and Authorized Sharing | Preserve as a bounded domain-module capability |
| `FR-DOM-REST-009` | **P0** | Modular Domain Isolation and Bounded Context | Module isolation is a P0 architectural gate |

#### Requirement count and release interpretation

| Register | P0 | P1 | P2 | Total |
|---|---:|---:|---:|---:|
| Core platform | 27 | 15 | 1 | 43 |
| Optional operations module | 1 module-only gate | 8 | 0 | 9 |
| Combined | 28 | 23 | 1 | 52 |

The domain module isolation gate (`FR-DOM-REST-009`) means the core application can run with the module detached; it does not make restaurant features a core-launch dependency. P1 modalities such as acoustic understanding, STT, TTS, and OCR remain conditional on the independent remote provider qualification and language gates in Section 9. Failure of a P1 modality does not block core P0 launch. P2 proactive morning briefing is not a launch blocker.

### 5.3 Requirement traceability

Maintain a traceability register in `docs/requirements/traceability.md` mapping every FR to:

- Product use case and user-visible acceptance criteria.
- API route and request/response schema.
- Database entities/indexes and owner scope.
- Frontend page/component/state.
- Agent tool or workflow, if applicable.
- Security/approval/cost controls.
- Unit, integration, contract, and end-to-end tests.
- Phase/task where implemented and review evidence.

A requirement is not complete just because a UI button exists or a model can describe the feature.

---

## 6. System architecture and module boundaries

### 6.1 High-level architecture

```text
Browser (React + Vite + MUI)
  ├─ Application shell, pages, forms, accessible components
  ├─ MUI X Chat (only if current package/feature/license passes evaluation)
  ├─ One chat runtime/state owner and one adapter boundary
  ├─ RTK Query for ordinary HTTP API/cache if retained
  └─ Authenticated HTTPS + one documented SSE/UI-message stream contract
          │
          ▼
Node.js API (Express)
  ├─ Security, auth/session, validation, rate limiting
  ├─ Application/domain services
  ├─ Asset and document lifecycle
  ├─ Conversation/message/run/event services
  ├─ Provider registry and model adapters
  ├─ LangChain agent/tool layer
  ├─ LangGraph workflows/checkpointing where justified
  ├─ Approval and audit service
  ├─ Optional connectors and domain modules
  └─ Durable scheduler/worker boundary
          │
          ├── MongoDB (Mongoose models + verified LangGraph persistence adapter)
          ├── Private object storage (provider-qualified storage implementation)
          ├── Remote model inference endpoints (free-qualified baseline / opt-in BYOK)
          └── External connectors (OAuth/MCP/Telegram/etc., consent- and approval-gated)
```

### 6.2 Preferred technology direction

- **Runtime/API:** supported Node.js LTS, Express, JavaScript ES Modules.
- **Database:** MongoDB with Mongoose where ODM benefits are justified; native MongoDB driver may be used by a specialized adapter only if the connection/pooling and transaction boundary remain coherent.
- **Frontend:** React + Vite + React Router + Material UI Core. MUI X packages are selected individually after license/stability and feature-tier verification.
- **Agent/model:** LangChain JS with LangGraph JS only for stateful orchestration/checkpointing; `@langchain/openai` ChatOpenAI wrapper for verified OpenAI-compatible endpoints.
- **Validation:** Zod for agent tools/structured outputs; HTTP payloads validated at the API boundary using one consistent schema strategy.
- **Client cache/state:** RTK Query / Redux Toolkit only for shared app server-cache and non-chat application state where justified. MUI Chat state or the selected chat runtime owns live chat state; do not mirror the entire message stream in another Redux slice.
- **Streaming:** one canonical backend stream contract and one frontend adapter path. LangChain event stream is normalized by a backend stream mapper. The browser must not understand provider-specific event details.
- **Storage:** private durable object storage abstraction, selected after data residency, privacy, cost, free-tier, and deployment checks.
- **Scheduling:** durable database-backed jobs with lease/claim, retry, idempotency, and recovery. Do not rely on a `setInterval` timer as the only durable scheduler.

### 6.3 Single repository with independent workspace manifests

The repository is organized as a single monorepo using root npm workspaces:

- Root `package.json` orchestrates workspace scripts (`dev`, `dev:backend`, `dev:client`, `verify`, `kill-ports`).
- `backend/` maintains its own `package.json`, `package-lock.json`, and `node_modules`.
- `client/` maintains its own `package.json`, `package-lock.json`, and `node_modules`.

Root scripts orchestrate commands across both packages using npm workspaces (`npm run dev --workspace=backend`, `npm run dev --workspace=client`) or targeted individual dev scripts (`dev:backend`, `dev:client`).

Before installation or updates:

1. Maintain dependency manifests within their respective application boundaries (`backend/package.json` for server/agent dependencies, `client/package.json` for frontend/MUI dependencies).
2. Write `docs/architecture/dependency-catalog.md` listing package, exact candidate version, package role, official documentation, license, Node/React peer compatibility, maintenance state, vulnerability status, free/paid feature boundary, and selected/not-selected decision.
3. Verify that dependencies do not create duplicate or conflicting state owners (e.g. ensuring `chatSlice.js` manages thread list/history metadata without competing or conflicting with the live message streaming runtime).
4. Run verification using `npm run verify` across both backend and client.

### 6.4 Dependency-selection rules

- A package must have a concrete requirement and owner in the architecture.
- Do not add two packages that solve the same concern without a documented reason.
- Do not mix incompatible generations of LangChain, LangGraph, MUI X Chat, or React adapters.
- Verify peer dependencies and named exports from installed package types/source, not from an outdated tutorial.
- Do not pin an old version simply because an example uses it. The approved exact version must be current at implementation time and recorded.
- Do not add `@ai-sdk/react`/`useChat` when MUI's AI SDK adapter already owns that UI runtime. Do not add Vercel AI Gateway as a provider or hidden billing layer.
- Do not add `deepagents` for ordinary chat by default; its planning/filesystem/subagent harness is more powerful than V1 requires and needs a dedicated security/need analysis.
- Do not add direct `openai` SDK if the selected LangChain model wrapper already covers the required endpoint; add it only for a distinct justified use case.
- Do not add vector infrastructure before retrieval use cases, privacy, embedding provider qualification, indexing lifecycle, and cost are approved.

### 6.5 Internal module boundaries

Core domains should be isolated into modules with explicit service interfaces:

- `identity`: account, authentication, sessions, account lifecycle.
- `provider`: provider definitions, model capability catalogue, credentials, consent, quotas, usage and cost records.
- `conversation`: threads, turns, messages, branches, runs, events, message pagination.
- `agent`: LangChain configuration, graph workflows, tool registry, middleware and context assembly.
- `asset`: upload, private storage, processing, derived representation, access, retention.
- `document`: parsing, extraction, citations, deterministic generation/export.
- `memory`: short-term state/checkpoints and long-term user/project memories.
- `project`: workspace/project scoping.
- `task`: user tasks, reminders, schedules, notifications.
- `connector`: external OAuth/API/MCP connections.
- `operations`: isolated branch/report business module.
- `audit`: security events, agent actions, approvals, data lifecycle events.

Modules may share infrastructure utilities, but should not import another module's private persistence layer directly. Define a stable application service contract and test it.

---

## 7. LangChain and LangGraph: documented capabilities and V1 decisions

**Research date:** 2026-11-05.
**Source rule:** The URLs below are the official LangChain/LangGraph documentation/reference pages consulted for this architecture. During implementation, verify the latest documented API and currently published package version again. LangChain is actively evolving; do not treat an API example as a permanent version pin.

### 7.1 Core components

| LangChain area | V1 decision | How it should be used |
|---|---|---|
| Agents | Adopt | Use `createAgent` for standard model/tool loops where a simple agent meets requirements. Give it explicit model, tools, system prompt, response format, and middleware. In current APIs the option is `model`, not an assumed `llm` alias. Keep app-specific orchestration outside provider-specific code. |
| Models | Adopt | Use LangChain model abstractions and provider adapters; resolve selected user provider/model through the provider registry at runtime. Maintain model capabilities as explicit metadata and qualify each model. |
| Messages | Adopt | Use normalized message/content-block representation internally. Preserve role, IDs, tool-call IDs, attachment references, usage, timestamps and provenance. Map to provider-specific formats only at model adapter boundary. |
| Tools | Adopt | Define server-side tools with Zod schemas and strict types. Keep tool name, description, schema, ownership, side-effect class, approval requirement, idempotency policy and audit policy in a central registry. |
| Short-term memory | Adopt | Use LangGraph checkpointer for thread/run state only when durable checkpointing and recovery are required. Key by server-authorized `thread_id`, never client-supplied ownership. Persist in production using a verified compatible checkpointer; do not rely on in-memory saver. |
| Event streaming | Adopt | Consume typed LangGraph/LangChain stream events and normalize them to V1's canonical browser event schema. Stream tool-call lifecycle, status, message deltas, usage/metadata and terminal state. Do not expose raw provider objects. |
| Streaming | Adopt | Use async streaming for responsive text and tool status. Cancellation is cooperative; persist run state and handle late provider results safely. Never claim cancel stopped a remote side effect unless confirmed. |
| Structured output | Adopt | Use Zod/JSON schema structured output for deterministic business payloads, tool results, report data, task proposals and UI components. Validate the parsed output in application code before persistence or action. |

Official documentation: [Agents](https://docs.langchain.com/oss/javascript/langchain/agents), [Models](https://docs.langchain.com/oss/javascript/langchain/models), [Messages](https://docs.langchain.com/oss/javascript/langchain/messages), [Tools](https://docs.langchain.com/oss/javascript/langchain/tools), [Short-term memory](https://docs.langchain.com/oss/javascript/langchain/short-term-memory), [Streaming](https://docs.langchain.com/oss/javascript/langchain/streaming), [Structured output](https://docs.langchain.com/oss/javascript/langchain/structured-output).

### 7.2 Model adapter: OpenAI-compatible endpoints

The preferred provider-neutral model pattern is `ChatOpenAI` from `@langchain/openai` configured per request/session with:

- the user-authorized API key;
- exact provider model ID;
- provider's verified OpenAI-compatible base URL via the documented `configuration.baseURL` option;
- only those request options confirmed by the provider/model;
- explicit timeout, retry, usage, streaming, and capability configuration.

This wrapper is a client adapter, not the inference provider. It does not turn the hosted API into a free service. A provider is not fully “OpenAI compatible” merely because it accepts `/v1/chat/completions`. Qualification must test:

1. message roles/content blocks and system/developer instruction mapping;
2. plain text generation and streaming order;
3. tool definitions, tool-call IDs, parallel or sequential tool calls, and tool results;
4. structured output / JSON schema mode and error behavior;
5. stream usage metadata; disable or adapt `streamUsage` when a provider does not support the required stream options;
6. cancellation/abort and timeouts;
7. multimodal input format and size limits;
8. reasoning/token metadata without exposing hidden reasoning;
9. context window, request/response limits and quota behavior;
10. authentication headers and nonstandard provider requirements.

A provider-specific adapter may be used when OpenAI compatibility is incomplete, but it must implement the same internal interface and tests. Never leak provider-specific assumptions into domain services, tools, database schema, or UI.

Official docs: [ChatOpenAI integration](https://docs.langchain.com/oss/javascript/integrations/chat/openai).

### 7.3 Tools and trusted runtime context

Every tool invocation must receive trusted server-side runtime context including authenticated `userId`, active thread/project/run identifiers, permissions, connector grants, request correlation ID, locale/timezone, approval state, and audit context. The model must not choose or override those values.

Use tool schemas to constrain arguments, but remember that schema validation is not authorization. The tool service must re-load authoritative records under owner scope, validate state transitions, check permission and approval status, and execute idempotently. Tool results must be bounded and sanitized before they re-enter model context or the UI.

Official docs: [Tools](https://docs.langchain.com/oss/javascript/langchain/tools), [Runtime](https://docs.langchain.com/oss/javascript/langchain/runtime).

### 7.4 Middleware

Use built-in middleware selectively and document why each is present:

- **Human-in-the-loop:** use for consequential tool approval when the graph/checkpoint model is appropriate.
- **Model/tool call limits:** guard runaway loops, calls, duration, token use, and excessive tool fan-out.
- **Model retry:** retry transient errors with bounded backoff only; do not retry non-idempotent side effects blindly.
- **Summarization/context editing:** control long thread context; never silently discard evidence needed for a grounded answer.
- **PII detection/redaction:** defense-in-depth for logging and model context; never substitute it for authorization.
- **Model fallback:** use only as an explicit user-authorized policy with visible model identity and provider disclosure. Never automatic fallback to a paid provider.
- **Tool selection:** expose only tools relevant to current scope/permissions; do not let the model create new authority.
- **Filesystem/subagent planning middleware:** do not enable broad arbitrary filesystem access in the normal request agent.

Custom middleware is appropriate for correlation IDs, request budgets, approval enforcement, provider disclosure, prompt-context sanitation, and consistent audit capture. Middleware must not become a hidden second business-logic layer. Keep authorization in application services and database predicates.

Official docs: [Built-in middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in), [Custom middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/custom), [Guardrails](https://docs.langchain.com/oss/javascript/langchain/guardrails).

### 7.5 Runtime and context engineering

Keep these contexts distinct:

- **Model context:** messages and selected evidence sent to the LLM.
- **Tool context:** trusted server identity, data scope, permissions, connectors, approval and budget.
- **Lifecycle context:** thread/run state, checkpoint, event cursor, cancellation, retry, and recovery metadata.

Build prompt context just-in-time. Select only relevant profile preferences, project memories, recent turns, authorized assets, and module-specific context. Context assembly must be inspectable and testable; it must not dump all private data into every prompt. User directives influence style/workflow but cannot grant access or override safety.

Official docs: [Runtime](https://docs.langchain.com/oss/javascript/langchain/runtime), [Context engineering](https://docs.langchain.com/oss/javascript/langchain/context-engineering).

### 7.6 LangGraph and workflow usage

Use LangGraph when a workflow requires durable multi-step execution, explicit state transitions, interrupts/approval, checkpoint/resume, parallel or conditional branches, recovery, or subagent coordination. Do not wrap every ordinary text response in an unnecessarily complex graph.

Potential V1 graph workflows:

- consequential tool request → validate → approval interrupt → revalidate → idempotent execute → audit/result;
- document ingestion → classify → parse → normalize → cite/extract → persist derived representation;
- research → search → source evaluation → summarize with citations;
- long-running task/reminder/connector job → enqueue → execute → retry/recover → notify;
- multi-agent orchestration for an actual multi-domain task that benefits from bounded expert contexts.

Use a persistent checkpointer in production. A thread identifier must be authenticated and scoped; it is not a permission token. If a node may run again after interrupt or recovery, make side effects idempotent and do not execute them before the approval interrupt. Do not catch or swallow the graph interrupt signal. Test resume and replay behavior, including duplicate side effects.

Mongo persistence is a candidate because MongoDB is already the chosen application database. Evaluate the official MongoDB checkpointer package (`@langchain/langgraph-checkpoint-mongodb`) for exact LangGraph compatibility, transaction behavior, index/setup requirements, connection lifecycle, package maintenance and licensing. Do not create multiple unmanaged Mongo clients/pools. If compatibility or operational requirements fail, implement an application-owned checkpointer adapter behind the LangGraph interface and document it.

Official docs: [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), [Checkpoints](https://docs.langchain.com/oss/javascript/langgraph/checkpoints), [Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts), [Fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance), [MongoDB checkpointer reference](https://reference.langchain.com/javascript/langchain/langgraph-checkpoint-mongodb).

### 7.7 Human-in-the-loop protocol

An approval request is a durable object containing: action ID, requesting run, tool name, normalized arguments, target record IDs, human-readable impact summary, destination/provider, estimated cost if relevant, required permission, payload hash, expiry, and state (`pending`, `approved`, `rejected`, `expired`, `executing`, `completed`, `failed`, `cancelled`).

The UI displays the exact action and its consequences. Approval is bound to the exact normalized payload hash and a one-time nonce. Any material parameter change invalidates approval. On resume, revalidate ownership, current resource state, user permission, connector grant, and price/capability before execution. Approval is not transferable across users or payloads.

Actions that normally require approval: permanent deletion, external sharing, sending/posting/emailing, purchases or any paid API usage, credential/permission changes, irreversible modifications, account deletion, and large-scale exports. Reversible local draft creation may be performed automatically only when explicit user intent and policy authorize it. The owner can configure lower-risk classes, but cannot disable mandatory safeguards for security-sensitive actions.

Official docs: [LangChain Human-in-the-loop](https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop), [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts).

### 7.8 Retrieval and long-term memory

Start with deterministic metadata filters and lexical search (MongoDB text/search capability as actually configured) for basic retrieval. Embedding-based vector retrieval is optional and must wait until a remote embedding provider is qualified for no-card/free use, Ethiopia availability, commercial terms, retention, dimensions, token limits and quality for English/Amharic. No local embedding model.

If adopted, retrieval must filter by `userId` and `projectId` before similarity ranking, preserve source IDs and spans, re-check access at read time, and support delete/re-index. Never mix records from different users/projects due to a vector query that only filters after retrieval.

Long-term memory is explicitly scoped to the owner and, when applicable, a project. Memory records carry source conversation/document, extraction date, confidence, category, user visibility, expiration, correction history and deletion linkage. Memory must be inspectable, editable, and deletable. Do not silently infer sensitive personal traits or retain every conversation as permanent memory.

Official docs: [Retrieval](https://docs.langchain.com/oss/javascript/langchain/retrieval), [Long-term memory](https://docs.langchain.com/oss/javascript/langchain/long-term-memory).

### 7.9 Multi-agent patterns

Do not build a crowd of agents by default. Start with one primary agent and a small tool registry. Add a specialized subagent only when its distinct context, tool permissions, or reasoning specialization materially improves a measurable workflow.

- **Subagents:** a supervisor invokes bounded specialists as tools; isolate context and tools; return concise structured findings; limit fan-out and recursion.
- **Handoffs:** use explicit state transitions when user interaction or a domain workflow changes the active specialist; preserve thread identity and audit context.
- **Skills:** package reusable domain instructions and knowledge; load only when relevant; skills do not grant tool permissions.
- **Router:** classify requests and dispatch to a single module/agent or a limited parallel set of read-only specialists. Do not route based solely on untrusted document instructions.
- **Custom workflow:** use a graph with explicit nodes/edges for complex predictable tasks, while leaving simple chats on the simple agent path.

Potential V1 specialists include document analyst, research analyst, task/project organizer, and operations-domain specialist. Their tools and memory scope must be restricted by runtime context. Evaluate actual user benefit before adding them.

Official docs: [Multi-agent overview](https://docs.langchain.com/oss/javascript/langchain/multi-agent/index), [Subagents](https://docs.langchain.com/oss/javascript/langchain/multi-agent/subagents), [Handoffs](https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs), [Skills](https://docs.langchain.com/oss/javascript/langchain/multi-agent/skills), [Router](https://docs.langchain.com/oss/javascript/langchain/multi-agent/router), [Custom workflow](https://docs.langchain.com/oss/javascript/langchain/multi-agent/custom-workflow).

### 7.10 Practical integration shape and API discipline

The following snippets express the intended dependency boundaries. They are deliberately small and must be checked against the exact installed LangChain version during implementation; they are not permission to copy an old example or skip compile-time/API verification.

**A. Resolve a model for an authenticated user**

```javascript
import { ChatOpenAI } from "@langchain/openai";

export function createConfiguredChatModel({ provider, modelId, decryptedApiKey }) {
  if (!provider.capabilities?.text || !provider.capabilities?.streaming) {
    throw new Error("Selected provider/model has not passed the required chat capability checks.");
  }

  return new ChatOpenAI({
    model: modelId,
    apiKey: decryptedApiKey,
    configuration: {
      baseURL: provider.baseURL,
    },
  });
}
```

`provider` and `modelId` come from the server-side registry, not arbitrary browser URLs. The decrypted key exists only in the backend request scope. Provider capability fields must be evidence-backed. Add timeout/usage/stream options only after confirming the chosen integration's current API and the provider's support.

**B. Construct a basic agent**

```javascript
import { createAgent } from "langchain";

export function createRequestAgent({ model, tools, systemPrompt, middleware = [] }) {
  return createAgent({
    model,
    tools,
    systemPrompt,
    middleware,
  });
}
```

Important: use the current `createAgent` contract with `model`. Do not assume `llm` is a valid option. Do not start with deprecated legacy `createReactAgent` patterns when the current `createAgent` API meets the need. If the installed package exports/signatures differ from this shape, stop and reconcile against the installed type definitions and official documentation before building dependent modules.

**C. Define a constrained tool**

A tool definition uses a schema (Zod is the preferred schema library here), a concise description, and a server application service. Its execution wrapper must obtain owner, project and approval context from trusted runtime context and invoke the application service only after deterministic authorization. Never put `req.user` or authorization IDs into model-generated arguments. The exact `tool()` signature and runtime context API must be confirmed against the installed LangChain version before coding; the policy boundary is mandatory even if the helper signature changes.

**D. Keep a clear agent/workflow split**

- Simple conversational answer or one bounded read tool: use the basic agent path.
- Durable multi-step workflow, approval interrupt, process restart or multiple external steps: use a LangGraph workflow with a persistent checkpointer and idempotent side-effect nodes.
- Domain CRUD with deterministic validation: application service first; the agent is only an intent/argument interface.
- A scheduler or notification job: durable application queue/worker first; do not treat an interactive chat agent as a scheduler.

**E. Keep frontend out of the LangChain implementation details**

The browser sees `runId`, `threadId`, stable message/part IDs, sequence numbers, typed events, approval handles and safe user-facing metadata. It does not receive graph state, checkpointer internals, provider API keys, arbitrary callbacks, server runtime context or raw model objects.

## 8. Frontend integration strategy and evaluation of requested ecosystems

The user's requested frontend topics are not one interchangeable product. They describe distinct UI patterns, runtime APIs, components, and integration ecosystems. Select one chat runtime owner and one backend transport contract.

### 8.1 Preferred MUI X Chat evaluation

MUI X Chat exposes a `ChatAdapter` transport boundary: `sendMessage` is required; history/list/stop functions are optional and can be implemented as needed. It accepts typed `ReadableStream` chunks and normalizes text, tool, file, source, data, step, and metadata parts into its message store. This maps well to the existing React/MUI direction and avoids building a bespoke message store and renderer from scratch.

However, MUI X Chat must pass a version/license/feature-tier/stability review before adoption. The agent must verify the actual package, current status, API, supported features, and license for every needed component. Do not assume every X feature is free or stable. Do not use Pro/Premium-only functionality in the core V1 path. If the required Chat runtime is not available under a commercially acceptable license/tier or is too unstable, implement the UI on MUI Core with a deliberately small internal chat store/adapter rather than paying or depending on preview-only features.

Official pages: [MUI X Chat core](https://mui.com/x/react-chat/core/), [Chat adapters](https://mui.com/x/react-chat/core/adapters/), [Building an adapter](https://mui.com/x/react-chat/backend/building-an-adapter/).

### 8.2 The single canonical adapter decision

Evaluate these two alternatives with a small technical proof before selecting:

**Option A — MUI-native `ChatAdapter` (preferred fallback and baseline candidate):** implement `sendMessage`, then `listMessages`, `listConversations`, `stop`, and required operations. Translate the canonical server stream contract into MUI `ReadableStream` chunks. This retains control over the backend protocol and does not require the Vercel AI SDK runtime.

**Option B — MUI `createAiSdkAdapter`:** use only if the backend emits the documented AI SDK UI Message Stream protocol and MUI's exact package/version supports the required tool, source, file, data, stop, and error cases. This adapter is structurally compatible with UI Message Stream chunks; the MUI documentation states that the adapter itself does not require a runtime dependency on the `ai` package just to accept its structural chunk types. The server can implement the protocol without Vercel AI Gateway or a Vercel-hosted model.

**Do not combine Option A and Option B in one live chat state path.** Do not also use `@ai-sdk/react` `useChat` as a second state owner when `ChatBox` and `createAiSdkAdapter` already own the UI runtime. Avoid parallel adapters, duplicated message state, duplicate cancellation controls, duplicate history pagination, and conflicting upload state.

The proof-of-concept must demonstrate initial user message, multi-turn history, streamed deltas, structured data parts, tool input/output, file references, stop, error, retry, continuation, edit, branch, reconnection, and message pagination before the choice is frozen in an ADR.

Official pages: [MUI AI SDK adapter](https://mui.com/x/react-chat/backend/built-in-adapters/ai-sdk-adapter/), [AI SDK UI Message Stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol).

### 8.3 Frontend patterns

| Requested pattern | V1 decision | Implementation interpretation |
|---|---|---|
| Patterns / `useStream` | Evaluate; do not run beside MUI's runtime | LangChain's frontend integration exposes a UI-agnostic stream hook. Use it only if the project chooses the LangChain frontend runtime as the chat state owner. If MUI owns chat state, connect it through an adapter and do not create a second hook-managed message store. |
| Markdown messages | Adopt | Use safe Markdown rendering; sanitize raw HTML; constrain links/images; code blocks are copyable and horizontally scrollable. Do not render arbitrary HTML from model output. |
| Tool calling | Adopt | Display typed tool status, inputs (with sensitive fields redacted), outputs, failures, and approval states. Pair every tool result with its exact tool-call ID. |
| Headless tools | Use narrowly | Browser-only actions such as clipboard, file picker, and local UI state can run client-side. Privileged file access, network calls, secret handling, and application mutations remain server-side. |
| Human-in-the-loop | Adopt | Render approval cards and resume the exact checkpointed run after approval. UI cannot manufacture approval; server verifies it. |
| Branching chat | Adopt | Create branch/fork records and map them to supported checkpoint state. Branch history is immutable or versioned; branch changes do not mutate unrelated threads. |
| Reasoning tokens | Do not expose hidden reasoning | Show safe progress status, tool activity, brief rationale, and completed explanation. Never render private chain-of-thought just because a provider sends a reasoning field. |
| Structured output | Adopt | Render validated typed cards for tasks, plans, citations, tables, reports, and proposals. Unknown schema versions fall back to safe JSON/text view. |
| Message queues | Adopt app-owned durable queue | Use a database-backed run/job queue with locking, idempotency, timeouts, retries, and recovery. Do not assume LangChain Agent Server features exist in custom Express. |
| Join/rejoin streams | Adopt durable event log | Persist run events with monotonic sequence IDs. Reconnect using `runId` plus `Last-Event-ID`/cursor; replay missing events then stream live. This is an app-owned feature unless adopting a compatible agent server is separately justified. |
| Time travel | Use cautiously | Provide run/checkpoint inspection and safe branch/fork when useful. Replay must not repeat external side effects. Require idempotency and approvals before side-effecting re-execution. |

Official LangChain frontend pages: [Overview](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/overview), [Markdown messages](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/markdown-messages), [Tool calling](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/tool-calling), [Headless tools](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/headless-tools), [Human-in-the-loop](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/human-in-the-loop), [Branching chat](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/branching-chat), [Reasoning tokens](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/reasoning-tokens), [Structured output](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/structured-output), [Message queues](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/message-queues), [Join/rejoin streams](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/join-rejoin), [Time travel](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/time-travel).

### 8.4 Generative UI

V1 uses a controlled progression:

1. **Controlled UI — V1 default:** backend produces validated structured objects with known schema and version. Frontend maps each approved type to a code-authored React/MUI component. Examples: task proposal, approval card, document citation, branch/report summary, table, chart specification, connector result.
2. **Declarative UI — optional later V1/P1:** model emits a constrained UI description from a finite component catalog. Validate schema, component allowlist, props, size, nesting depth, link policy, and accessibility. UI description is data, not JSX/HTML/JavaScript.
3. **Open-ended UI — defer:** no model-generated arbitrary executable JavaScript, HTML, CSS, React component, iframe, or remote script. Revisit only with a separate sandbox/security review.

LangChain generative UI docs are a pattern reference, not a reason to accept arbitrary model-generated executable UI. [Generative UI](https://docs.langchain.com/oss/javascript/langchain/frontend/generative-ui).

### 8.5 Requested ecosystem integration decisions

| Ecosystem | V1 decision | Reason / constraint |
|---|---|---|
| CopilotKit | Do not include by default | It introduces another UI/runtime integration paradigm. Reconsider only if a concrete feature requires it and it interoperates with the chosen MUI/stream architecture without duplicate state. |
| AI Elements | Reference only | Useful examples/patterns, but it is another component system and should not be added beside MUI just to copy chat components. |
| assistant-ui | Alternative, not parallel | Evaluate only as an alternative chat frontend/runtime if MUI X Chat is unsuitable. Do not run two chat runtimes. |
| OpenUI | Research/defer | A constrained UI language may support future declarative UI, but it is not needed for V1's controlled component catalog. |
| Vercel AI SDK | Protocol compatibility only by default | A server/client SDK may be used only when the chosen MUI adapter requires it. Do not assume it supplies inference for free and do not use Vercel AI Gateway as an invisible provider route. |

Official integration references: [LangChain frontend integrations](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/), [MUI X Chat](https://mui.com/x/react-chat/core/).

---

## 9. Model provider qualification and cost governance

### 9.1 Provider qualification is a gate, not a guess

The project must qualify at least one hosted remote inference provider for core text chat without requiring a credit card or paid subscription. Account/API-key registration may be necessary, but it must be distinguished from a paid plan. The provider must be accessible to a user in Ethiopia under current provider terms. Do not treat a provider as qualified based only on a pricing page or an OpenAI-compatible URL.

For every candidate provider, record in `docs/providers/provider-qualification.md`:

- Official product, pricing, free tier, terms of service, commercial-use, acceptable-use and privacy/data-retention links.
- Account and identity requirements; whether a card is required at sign-up or later.
- Whether free tier is available in Ethiopia and any region-specific restrictions.
- Current quota: requests/minute, tokens/minute/day/month, context window, max input/output, concurrency, data retention, rate-limit semantics, and inactivity/expiration rules.
- Text, English, Amharic, mixed-language performance from representative test prompts; do not claim “supports Amharic” based solely on broad multilingual marketing.
- Streaming correctness, tool calling, structured output, vision/audio if claimed, cancellation, usage, and error behavior.
- Commercial license and whether the planned usage is allowed.
- Measured response latency, failure rates, and quota behavior using a non-sensitive synthetic test corpus.
- Date checked, country/region, method, tester, and evidence.

Qualification must include direct account creation/key creation if possible and an actual request from the target environment. A blocked region, unavailable API, missing API access, or card-required free trial is a failed qualification, not a successful one.

### 9.2 No silent paid fallback

- The default model route must be one of the approved free-qualified providers.
- When quota is exhausted or a provider fails, show the user the failure and available actions. Do not silently switch to a paid endpoint.
- Switching between free endpoints is allowed only if the user explicitly enabled a fallback policy and the alternate endpoint is independently qualified. The UI must report the actual model/provider used.
- A paid BYOK provider is disabled until the user saves credentials, reviews data disclosure, chooses the paid provider/model and explicitly enables paid use.
- If the cost cannot be reliably bounded, require per-request approval before sending the prompt or attachment to that paid provider.
- Maintain usage/cost records per provider/model/run. Be honest that the client library can be free while inference, storage, web search, email, hosting, and egress may cost money.

### 9.3 Capability matrix

Maintain a runtime capability registry at provider + model granularity:

`text`, `streaming`, `toolCalling`, `parallelToolCalls`, `structuredOutput`, `vision`, `audioInput`, `audioPerception`, `transcription`, `tts`, `embeddings`, `contextWindow`, `maxOutputTokens`, `cancellation`, `usageTelemetry`.

Do not infer one capability from another. For example, an audio upload endpoint that transcribes speech does not mean the chat model can analyze raw audio; a vision API does not guarantee PDF document-layout understanding; tool schema acceptance does not guarantee correct tool-call ID streaming.

### 9.4 OpenAI-compatible custom endpoints

Allow the owner to configure provider display name, OpenAI-compatible base URL, model ID, API key, and optional safe extra headers. Base URL validation must reject non-HTTPS hosts except explicitly allowed local development addresses; reject loopback/private/link-local destinations in production; prevent SSRF through DNS resolution and redirect checks. Provider-specific headers cannot override authorization or inject arbitrary internal routing.

Never send API keys from browser to model endpoint. The browser sends a provider selection identifier; the server resolves the encrypted key and provider configuration from the authenticated owner record.

### 9.5 Free and paid capability policy

Core V1 release cannot depend on paid inference. Audio STT/TTS, vision, OCR, embeddings, web search, and external connectors each have their own qualification decision. If no no-card free remote provider supports a P0 capability at acceptable quality, do not emulate it with local AI, do not silently charge a provider, and do not market the capability as supported. Reassess its priority with the owner; preserve the ability to store the original asset while clearly showing that semantic processing is unavailable until a provider is approved.

---

## 10. Data model and persistence architecture

This is a conceptual data contract, not a blind schema prescription. The architecture phase must refine fields, indexes, retention, and normalization based on access patterns and MongoDB behavior. Avoid one monolithic document for entities with unbounded growth.

### 10.1 Core records

| Entity | Responsibility / required principles |
|---|---|
| `User` | Identity, profile, locale/timezone and preferences; sensitive credentials separated or encrypted; no client-controlled ownership. |
| `AuthIdentity` | Verified identity provider + subject; safely linked email/password/Google identities; enforce unique provider-subject. |
| `Session` / `RefreshTokenFamily` | Session/device record, rotation, revocation, replay detection, expiry, audit, secure cookie lifecycle. Store token hashes, not bearer tokens. |
| `ProviderConnection` | Provider configuration, encrypted credential reference, owner, enabled state, last validation and capability qualification. |
| `ProviderConsent` | Consent version, provider, model/capabilities, data categories, price class, timestamp, revoke state. |
| `Thread` | Owner, optional project, title, branch/head metadata, pin/archive state, timestamps, latest activity, model preference if per-thread. |
| `Turn` | Stable logical user request and corresponding assistant output(s), parent/fork relationship, status, idempotency key, sequence. |
| `Message` | Individual user/assistant/tool message, stable ID, turn, role, ordered sequence, parts/content references, status, timestamp. |
| `MessageBranch` | A branch/fork head and lineage; avoid mutating unrelated branch history. |
| `AgentRun` | One generation/workflow execution, selected model/provider, status, checkpoint ID, token/usage/cost, cancellation and terminal reason. |
| `RunEvent` | Ordered durable event log keyed by run and sequence for reconnection/replay. Bound retention and redact sensitive payloads. |
| `ToolExecution` | Tool name, call ID, validated args reference/hash, actor, run, state, output reference, idempotency and audit. |
| `ActionApproval` | Exact normalized action, payload hash, expiry, one-time nonce hash, approval/rejection actor, status and audit. |
| `Asset` | Original uploaded/generated asset identity, owner, project, private storage object key, checksum, content metadata, lifecycle state. |
| `AssetRepresentation` | OCR/text/transcript/table extraction/chunk derivative, processor/provider version, source asset, page/section/time ranges, provenance. |
| `ProcessingJob` | Durable ingestion/derivative work, lease, attempts, result, failure, idempotency. |
| `Project` | Owner-scoped workspace with metadata, attached assets, threads, tasks and scoped memory. |
| `Memory` | Owner/project-scoped memory with source, confidence, type, visibility, expiry, correction/deletion lineage. |
| `Task` | Task title/description, state, due date/timezone, project, recurrence, source and activity history. |
| `Reminder` | Delivery time/zone, schedule, recipient/target, status, dedup key, retry state and notification policy. |
| `Notification` | User-visible notice, type, source run/task, read state, channel delivery and timestamps. |
| `Connector` | OAuth/API connection metadata, scopes, enabled state, health, encrypted credentials or vault reference. |
| `AuditEvent` | Security-relevant, tool, approval, connector, export, delete and account lifecycle event, with redacted context. |
| Operations module records | Branch/report/visit/activity/issue/comment models isolated under the module; all records owner-scoped and referenced through module service boundaries. |

### 10.2 Conversation invariants

- Never store an unbounded list of all messages inside one `Thread` document.
- Use stable immutable identifiers; database `_id` may be primary persistence identity, but public API IDs must be consistent and not confused with client-generated IDs.
- Store a logical `Turn` separately from message records; user input, assistant result, tool messages and multiple generation attempts remain associated with that turn.
- Use deterministic sequence numbers or a stable cursor tuple (`createdAt`, immutable ID) for ordering and pagination. Array-index cursors are not acceptable.
- Enforce one active generation per thread/branch unless concurrent runs are an explicitly designed feature. Use optimistic concurrency/versioning and a server-side lock/lease.
- Retry creates a new generation attempt for the same logical user turn; it does not create a duplicate user turn.
- Continue extends a stopped/partial assistant generation only where supported; it must not resubmit a duplicate user turn.
- Edit creates a new branch or explicit history revision from the edited turn; dependent downstream history must not be silently mixed with the old path.
- A model switch affects the selected generation attempt, not the user's original request identity.
- Tool messages are linked by `tool_call_id` and run ID. Persist complete tool inputs/outputs securely, redact secrets, and keep large binary content in asset/object storage.
- A reconnect uses durable run events and sequence cursor; do not start another model call merely because the browser reconnected.

### 10.3 Checkpoint storage relationship

LangGraph checkpoint state is execution/workflow state, not the entire product database. It must reference stable app entities (`threadId`, `turnId`, `runId`, `userId`, project) and must be subject to owner isolation, retention, encryption and deletion. Keep application messages/events and model graph state coherent without making the frontend depend on LangGraph's internal serialization format.

### 10.4 Transactions and external operations

Use MongoDB transactions for database invariants only when deployment topology supports them. Do not include external HTTP requests, storage deletes, email, or Telegram sends inside a database transaction and assume they can roll back. Use an outbox or durable action state:

1. Validate and commit an intent/audit record.
2. Await approval if needed.
3. Claim the outbox action with a lease and idempotency key.
4. Execute external side effect.
5. Persist completion/failure/result.
6. Reconcile uncertain outcomes rather than repeating blindly.

---

## 11. Canonical chat stream and lifecycle protocol

### 11.1 Stream contract

Define one internal event schema independent of LangChain, provider, and frontend library. A minimum event envelope:

```json
{
  "version": 1,
  "runId": "opaque-stable-id",
  "threadId": "opaque-stable-id",
  "turnId": "opaque-stable-id",
  "sequence": 42,
  "eventId": "run-id:42",
  "type": "message.text.delta",
  "timestamp": "ISO-8601",
  "data": { "messageId": "opaque-id", "partId": "opaque-id", "delta": "..." }
}
```

Minimum event families:

- `run.accepted`, `run.started`, `run.heartbeat`, `run.waiting_approval`, `run.resumed`, `run.cancel_requested`, `run.cancelled`, `run.completed`, `run.failed`;
- `message.started`, `message.text.start`, `message.text.delta`, `message.text.end`, `message.completed`, `message.status`;
- `tool.started`, `tool.input.delta`, `tool.awaiting_approval`, `tool.approved`, `tool.rejected`, `tool.completed`, `tool.failed`;
- `asset.processing`, `asset.ready`, `asset.failed`;
- `source.added`, `structured_data`, `usage.updated`, `title.updated`, `stream.reset` only when semantics are explicit;
- terminal `run.completed`, `run.failed`, or `run.cancelled` must close the stream deterministically.

Use monotonic sequence and persisted run event records. SSE should support heartbeats, reconnect cursor, and no-cache headers. Validate the stream protocol with contract tests and a client adapter test fixture. Never stream provider raw chunks directly to the browser.

### 11.2 Stream mapper

LangChain/LangGraph events flow into an application mapper. The mapper:

1. Correlates event to server-owned run/turn/thread.
2. Converts provider/model content blocks to normalized V1 message parts.
3. Preserves tool call IDs and exact tool-result linkage.
4. Suppresses private chain-of-thought/reasoning. It may map allowed progress status into user-safe status events.
5. Redacts sensitive values in tool input/result previews.
6. Assigns event sequence and persists critical events before sending where reconnect correctness requires it.
7. Maps usage/cost metadata without exposing credentials or private provider payloads.
8. Handles partial failure, retry, failover, cancellation, and terminal state transitions consistently.

### 11.3 Cancellation protocol

Browser `AbortSignal` is a cancellation request. Backend sets `cancel_requested`, signals provider cancellation when supported, prevents new tools from starting, and awaits/records in-flight action state. Tool side effects require idempotency and approval. A browser disconnection alone must not silently mark a tool side effect as cancelled. The UI displays “stop requested” until backend confirms terminal state.

### 11.4 Failover protocol

No paid failover. Free-to-free failover is only from the user's pre-authorized provider policy. A failover resets or versions only the incomplete assistant generation segment; it does not leave partial text concatenated with the successful model response. Record provider/model identity for each attempt. Do not erase valid user messages or completed tool outputs. Show the user which model answered.

### 11.5 Rejoin and message queues

For any long-running graph or job, persist run ID, sequence cursor, state, lease, and status. On reconnect, authorize the owner, replay missed events, then attach to live events. If the run is terminal, return the durable result rather than starting a new run. Queue workers claim jobs atomically with leases, retry bounded transient failures, and route poison jobs to a reviewable terminal-failure state.

---

## 12. Asset, document, and multimodal lifecycle

### 12.1 Asset is a first-class entity

An attachment is not merely a URL or a transcript string embedded in a message. The application must retain an asset identity and separately track derived representations. A user may attach an asset once and refer to it in later turns or projects without re-uploading it, subject to access and retention rules.

Keep these concepts separate:

1. Original uploaded file (immutable bytes, checksum, size, MIME evidence, original filename).
2. Private storage object (provider/key/version, encryption and access policy).
3. Derived content (transcript, OCR/text extraction, page blocks, table cells, thumbnails, audio metadata, embeddings if later approved).
4. Provider request representation (temporary URI/base64/content block sent to a model; short-lived and not the canonical asset).
5. User-visible message reference (asset ID with display name and authorized access path).
6. Generated artifact (new asset with generation provenance and ownership).

Do not overwrite an original file with a compressed, transcoded, OCR'd, transcribed, or summarized version. Keep derived content linked to the original and processor/provider/version metadata.

### 12.2 Upload and storage flow

1. Authenticate user and validate project/thread scope.
2. Validate count, size, declared MIME, filename and extension.
3. Inspect actual file signature/content; quarantine unsupported or suspicious files.
4. Create upload/asset record with `pending` state and server-generated storage key.
5. Stream to private storage; enforce maximum bytes while streaming; calculate checksum.
6. Persist verified metadata and transition asset to `stored`.
7. Create ingestion job to parse/extract/transcribe only when capability is available and user has authorized the provider.
8. Store derived representations separately; transition asset/job to ready or failed with retry metadata.
9. Return asset ID and status to browser; do not expose internal storage key or direct public path.
10. At message submission, verify user ownership of every referenced asset and bind its ID to the turn.

Support draft uploads that have no text. A message is valid if it contains meaningful text OR at least one authorized valid attachment/audio asset OR a valid retry/continuation operation with a known existing turn. Reject only genuinely empty input.

### 12.3 Supported input and output handling

Input types to support and test:

- Images: preserve original; inspect metadata and use provider vision only when qualified.
- PDF: extract text and page locations; determine whether OCR/layout extraction is needed and only use a qualified remote AI or deterministic parser. Do not imply text extraction works for scanned pages without OCR.
- DOCX: parse paragraphs, headings, tables, hyperlinks, metadata and embedded content as supported; preserve document structure/provenance where possible.
- XLSX: extract sheet names, cell values, formulas, ranges and data types. Keep spreadsheet computations deterministic in a calculation library/engine, not model arithmetic.
- CSV: parse robustly with delimiter/encoding detection under size/row/column limits; protect against formula injection on export.
- TXT/Markdown/JSON: parse safely, preserve encoding and bounded content.
- Audio: preserve raw file, metadata and optional transcript separately; transcription must not imply raw acoustic understanding.
- Other formats: reject with a supported-format explanation or store as opaque attachment only if user chooses and safe policy permits.

Outputs: PDF, DOCX, XLSX, CSV, Markdown, JSON. Outputs must be valid machine-readable files, not renamed text. Use correct Ethiopic fonts for Amharic output; test PDF render and printed layout on actual supported environments. For PDF and DOCX, verify text extraction and visual rendering. For XLSX, verify formulas/cell types and no unintended formula injection. For CSV, escape dangerous leading characters when opening in spreadsheet software.

### 12.4 Historical attachment context

When the user refers to a prior attachment:

- resolve the exact asset ID from an authorized historical message or explicit selection;
- verify the asset remains available and belongs to the user/project;
- choose the appropriate derived representation for the selected model's capabilities;
- include citations to page/section/sheet/time ranges where available;
- if only a transcript/extract is sent, clearly identify this as derived text, not raw media;
- if the original has been deleted or access revoked, explain that it is unavailable instead of fabricating content.

### 12.5 Audio and media handling

Keep audio recording, file attachment, live dictation, transcription, and TTS as distinct workflows. Recording UI should have stable states (`idle`, `requesting_permission`, `recording`, `stopping`, `uploading`, `transcribing`, `ready`, `failed`, `discarded`). A stopped recorder must flush final buffered audio and release MediaStream tracks.

FFmpeg/FFprobe may be used for deterministic inspection, conversion and chunking where appropriate; they are not AI inference. No local AI transcription, speech model, OCR or embedding model. Remote STT/TTS/vision providers require their own qualification and user consent. When STT is unavailable, allow raw audio asset upload and clearly disclose that semantic audio analysis is unavailable; do not send a placeholder transcript as if it were the file's content.

### 12.6 Citation and grounding contract

For document-grounded answers, every cited item must reference an actual asset representation and location. A citation object should contain asset ID, original filename, representation ID, page/section/sheet/time interval, excerpt/hash, extraction method and version. UI citations open the correct private asset/page only after authorization. Missing citations must not be invented. If extraction is incomplete or confidence is poor, state the limitation and ask for a better source or qualified OCR capability.

---

## 13. Tool registry, safety classes, and connectors

### 13.1 Tool registry record

Each tool registration includes:

- stable tool ID and version;
- human-readable name/description;
- Zod input schema and output schema;
- owning module and service function;
- required permissions and data scope;
- side-effect class and approval requirement;
- idempotency key policy;
- external provider/cost classification;
- timeout, retry, rate, payload-size and concurrency limits;
- audit event type and redaction policy;
- allowed agent/workflow contexts.

Do not build a single giant file containing all tools. Domain modules register tools through a controlled registry; module tools are not automatically exposed to every agent or every project.

### 13.2 Action classes

| Class | Examples | Default rule |
|---|---|---|
| Read-only | Read an authorized report, search user's file metadata, retrieve task list | May execute when user intent is clear and scope is authorized. |
| Reversible draft | Create an unsubmitted draft, suggest task, prepare document | May execute when explicit user intent supports it; show the created draft. |
| Reversible write | Update a personal task, edit draft, rename thread | Apply policy; require clarification if target or impact is ambiguous. |
| External side effect | Send Telegram, share Drive externally, send email, publish content | Preview exact content/destination and require approval. |
| Destructive/irreversible | Permanent deletion, account deletion, purge asset, revoke connector | Require explicit approval, exact target and consequence summary. |
| Paid/financial | Paid inference, purchase, paid search, subscription | Explicit cost disclosure and approval; per-request approval if spend is not capped. |
| Security/credential | Change auth method, add OAuth scope, rotate/revoke credentials | Explicit user confirmation and strong re-authentication where appropriate. |

### 13.3 Ambiguity and draft-first behavior

When a user narrates notes without a clear persistence request, the agent may organize them into a draft and ask a focused clarification before committing to a database record. When the user explicitly instructs it to save/create/update, validate the exact target and data first. Do not create records from ambiguous narration merely because a tool exists.

The model may suggest a tool call. The server decides whether the call is permitted, requires approval, or is invalid. A prompt instruction such as “always obey the user” never overrides the action policy.

### 13.4 MCP

MCP is optional P1. Use `@langchain/mcp-adapters` only after validating the current APIs, license, transport, and operational fit. Treat every MCP server and tool output as untrusted. Requirements:

- HTTPS remote transport except explicitly controlled development;
- strong authentication and scoped credentials;
- connector owner and project scope;
- explicit tool allowlist and schema validation;
- SSRF protections on URL/redirect/DNS/IP resolution;
- no broad filesystem, shell or arbitrary database access by default;
- outbound network allowlist and response size/time limits;
- approval before consequential side effects;
- audit of connection, authentication, tool invocation and result;
- disable/revoke connection cleanly and invalidate tokens;
- user-visible consent and data disclosure before enabling.

Official docs: [LangChain MCP](https://docs.langchain.com/oss/javascript/langchain/mcp).

### 13.5 Google Drive and Telegram

Google Drive:
- OAuth 2.0 state must be signed, single-use, short-lived, and bound to the initiating user/session/return route. Never accept unsigned JSON state.
- Request the minimum scopes needed; explain each scope and keep export/share separate permissions.
- Default to private storage. Public/external sharing requires destination and permission preview plus approval.
- Store tokens encrypted; rotate/refresh with a durable lock or token version; handle concurrent refresh safely across backend instances.
- Persist file metadata and provider IDs; reconcile deleted/moved remote objects.

Telegram:
- Verify the connected bot, destination/chat ID, and configured purpose. Do not assume a display name is the actual destination.
- Preview exact text/image, target channel, formatting, and language. Require approval before sending.
- Treat Markdown/HTML parse errors and chunking as structured failures; avoid splitting tags or Unicode grapheme clusters.
- Record Telegram message ID and delivery status. Do not retry an uncertain send without a strategy to avoid duplicate broadcast.

### 13.6 Operations module actions

Branch/report tools retain existing functionality but must obey the same policy. The domain layer must validate branch identity and prevent forged IDs. Report creation should draft/clarify/confirm where facts are ambiguous. Destructive branch deletion must not silently delete active reports. Archive/deletion is a lifecycle state machine with documented retention and dependency rules. Database commits and filesystem deletion must be decoupled through outbox reconciliation.

---

## 14. Security and privacy architecture

### 14.1 Authentication/session

- Prefer short-lived access session credentials in `HttpOnly`, `Secure`, appropriately configured `SameSite` cookies; refresh rotation must be durable and replay-aware.
- No JWT access/refresh tokens in `localStorage`, Redux persistence, URLs, or JavaScript-readable cookies.
- Require CSRF mitigation for cookie-authenticated state-changing requests (token/header/origin strategy, SameSite plus strict Origin/Referer validation as appropriate).
- Configure exact allowed origins. Never allow every subdomain of a shared hosting domain with credentials unless there is a documented and verified trust boundary.
- Login/register/refresh/OAuth endpoints need rate limits and abuse controls.
- Google SSO must validate issuer, audience, signature, expiry, nonce/state, verified email and account-linking consent. Do not auto-link solely on a matching unverified email string.
- Logout revokes the server session/refresh family, not just the browser cookie.

### 14.2 Credential encryption

- Use envelope encryption: each credential encrypted with a data-encryption key; KEK managed outside the application database and source tree.
- Use authenticated encryption (e.g. AES-256-GCM where supported), cryptographically random unique nonce, authentication tag and AAD including owner/credential/purpose identifiers.
- Persist ciphertext, nonce, tag, key version and non-secret metadata only.
- Keep plaintext short-lived in server memory; never log it or return it in profile responses.
- Support key rotation and re-encryption; fail closed if key material unavailable.
- Document deployment KMS/secret-manager requirement. Do not hardcode an encryption master key in `.env` that ships with the code or backups without a threat model.

### 14.3 Upload and file security

- Private object storage; no public `express.static('/uploads')` for user-private files.
- File content sniffing, allowlisted formats, maximum file size/count, parser resource caps, decompression ratio/entry count limits, safe path generation, and safe download headers.
- Sanitize `Content-Disposition` filenames; prevent path traversal and unsafe inline rendering.
- Validate ownership on every asset/derived-asset read, update, export and delete.
- Signed download links must be short-lived and generated only after ownership validation; never expose permanent public object URLs.
- Treat PDF/DOCX/XLSX and archives as hostile input; parsing must be isolated/resource bounded.

### 14.4 Agent and prompt injection

- User data, uploaded documents, webpages, tool outputs and MCP content are untrusted data.
- Use explicit delimiters and source metadata; never include retrieved instructions as system/developer-level instructions.
- Agent tool set is least privilege and narrowed per workflow.
- Every tool independently authorizes the action and target.
- Approval is server-verified and bound to exact payload.
- Guardrails may detect/mitigate PII and unsafe content but are defense-in-depth, not the security boundary.

### 14.5 Infrastructure, SSRF and abuse

- Restrict outbound requests to approved provider/connector hosts where feasible.
- Resolve DNS and reject loopback, private, link-local, multicast, reserved and cloud metadata addresses; revalidate redirects and DNS to prevent rebinding.
- Rate limit auth, chat, uploads, transcription, document generation, connectors and tools separately.
- Bound request size, stream duration, output token count, active runs per user, tool recursion/depth, queue attempts and concurrent jobs.
- Configure secure headers, exact CORS, TLS at ingress, trusted proxy settings, request timeouts, body size limits, and structured errors.
- Use dependency audit, secret scanning and static analysis; keep an upgrade process for security fixes.

### 14.6 Data export and deletion

Deletion is not simply removing one MongoDB record. The workflow must enumerate sessions, provider credentials, threads, messages, checkpoints, run events, assets, representations, embeddings, projects, tasks, notifications, connectors, operational records, generated files and backups subject to lawful retention. Mark deletion intent, prevent new actions, revoke credentials, remove active resources, enqueue external storage cleanup, reconcile failures, and record only minimal deletion audit metadata. Clearly disclose any backup retention window.

---

## 15. Proposed V1 repository structure

This is the target architecture, derived from the clarity and simplicity of V0 and aligned with V1 requirements. All runtime source is organized under standard, un-bloated application directories beneath `backend/` and `client/`.

```text
Personal-AI-Agent-V1/
├── package.json                         # Root manifest orchestrating workspace scripts
├── .gitignore
├── README.md
├── docs/
│   ├── Master-Personal-AI-Agent-V1-documentation.md
│   ├── Backend-Personal-AI-Agent-V0-Codebase.md       # read-only reference
│   ├── Client-Personal-AI-Agent-V0-Codebase.md        # read-only reference
│   ├── adr/
│   ├── architecture/
│   ├── requirements/
│   ├── security/
│   └── testing/
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   ├── node_modules/
│   ├── .env
│   ├── render.yaml
│   ├── scripts/
│   │   ├── installFonts.js
│   │   ├── killPort.js
│   │   └── tests/                      # Native backend API tests
│   └── src/
│       ├── app.js                      # Express 5 app setup, security pipeline, route mounting
│       ├── server.js                   # HTTP server bootstrap, MongoDB connection, graceful shutdown
│       ├── config/
│       │   ├── db.js                   # Mongoose connection & pool management
│       │   ├── env.js                  # Schema-validated environment variables
│       │   ├── logger.js               # Structured logging with redaction
│       │   └── schemaOptions.js        # Shared Mongoose serialization options
│       ├── errors/
│       │   └── AppError.js             # Typed domain errors
│       ├── middleware/
│       │   ├── authMiddleware.js       # Server-side JWT/session validation & owner context
│       │   ├── errorHandler.js         # Centralized safe error translation
│       │   ├── notFoundHandler.js      # API 404 handler
│       │   ├── uploadMiddleware.js     # Streaming multipart upload & MIME validation
│       │   └── validate.js             # Request boundary validation middleware
│       ├── models/                     # Database Models & Schemas
│       │   ├── User.js                 # Known: User profile, credentials, directives
│       │   ├── Branch.js               # Known: Operations branch directory, location, contact
│       │   ├── Report.js               # Known: Operations audit reports, visits, issues
│       │   ├── Chat.js                 # Known: Conversation records & messages
│       │   ├── Audio.js                # Known: Audio records & transcripts
│       │   └── [Others TBD]            # Future models (e.g. Project, Task, Memory) TBD
│       ├── routes/                     # API Routes
│       │   ├── authRoutes.js           # Known: Registration, login, logout, refresh, SSO
│       │   ├── branchRoutes.js         # Known: Branch CRUD, metrics, history
│       │   ├── chatRoutes.js           # Known: Chat threads, history, streaming
│       │   ├── dashboardRoutes.js      # Known: Dashboard aggregation
│       │   ├── reportRoutes.js         # Known: Report CRUD, dossier, items
│       │   ├── sttRoutes.js            # Known: Speech-to-text endpoints
│       │   ├── userRoutes.js           # Known: Profile, directives, settings
│       │   └── [Others TBD]            # Future routes TBD
│       ├── controllers/                # Known HTTP Controllers
│       │   ├── authController.js       # Known: Auth & cookie lifecycle
│       │   ├── branchController.js     # Known: Branch management
│       │   ├── chatController.js       # Known: Chat & stream coordination
│       │   ├── dashboardController.js  # Known: Dashboard metrics
│       │   ├── reportController.js     # Known: Report lifecycle
│       │   ├── sttController.js        # Known: Audio transcription
│       │   ├── userController.js       # Known: User preferences & settings
│       │   └── [Others TBD]            # Future controllers TBD
│       ├── services/                   # Known Application Services
│       │   ├── documentGenerationService.js # Known: PDF, DOCX, XLSX, CSV generation
│       │   ├── googleDriveService.js   # Known: Google Drive integration
│       │   ├── storageService.js       # Known: File storage & cleanup
│       │   ├── telegramService.js      # Known: Telegram bot notifications
│       │   ├── ttsService.js           # Known: Text-to-speech synthesis
│       │   └── [Others TBD]            # Future services TBD
│       ├── agent/                      # Agent Boundary (Details TBD)
│       ├── providers/                  # Provider Registry & Adapters (Details TBD)
│       ├── validations/                # Request Schemas
│       ├── jobs/                       # Background Tasks & Workers
│       ├── utils/
│       │   └── constants.js            # Shared Constants (Others as needed)
│       └── assets/
│           └── fonts/                  # Licensed fonts (Inter, NotoSansEthiopic, NotoSansLatin)
└── client/
    ├── package.json
    ├── package-lock.json
    ├── node_modules/
    ├── .env
    ├── eslint.config.js
    ├── index.html
    ├── vercel.json
    ├── vite.config.js
    ├── public/
    │   ├── favicon.svg
    │   ├── icons.svg
    │   ├── manifest.json
    │   ├── sw.js
    │   └── pwa-*.png
    ├── scripts/
    │   ├── cleanDist.js
    │   └── killPort.js
    └── src/
        ├── main.jsx                    # Root React bootstrap, StrictMode, theme & Redux providers
        ├── App.jsx                     # App shell, session hydration, route outlet
        ├── router.jsx                  # Route definitions with lazy loading & auth guards
        ├── layouts/
        │   ├── AppShell.jsx            # Authenticated responsive shell & navigation drawer
        │   ├── AvatarMenu.jsx          # User avatar, account menu, logout trigger
        │   ├── Logo.jsx                # Personal AI Agent brand mark
        │   ├── MuiSidebar.jsx          # Collapsible navigation drawer
        │   ├── PublicLayout.jsx        # Public pages layout (Landing, Login, Register)
        │   └── ThemeToggle.jsx         # Light/dark mode toggle button
        ├── pages/                      # Application Pages (All located directly in pages/)
        │   ├── Landing.jsx             # Universal Personal AI Agent landing page
        │   ├── Login.jsx               # Email/password & Google SSO login
        │   ├── Register.jsx            # Account registration
        │   ├── Chat.jsx                # Conversational AI partner workspace
        │   ├── Dashboard.jsx           # Personal KPI deck, recent activities & quick actions
        │   ├── Profile.jsx             # Full multi-tab user settings & configuration hub
        │   ├── Branches.jsx            # Branch directory, search, grid/list view
        │   ├── BranchDetail.jsx        # Branch metrics, location, audit history
        │   ├── Reports.jsx             # Report ledger, date filters, card/grid view
        │   ├── ReportDetail.jsx        # Report dossier, Amharic view, audio playback
        │   ├── ReportEdit.jsx          # Comprehensive report editing & validation
        │   └── NotFound.jsx            # 404 error page with navigation fallback
        ├── components/
        │   ├── auth/
        │   │   └── GoogleSsoButton.jsx
        │   ├── chat/                   # Complete Chat Component Suite (26 components)
        │   │   ├── index.js
        │   │   ├── MuiComposerInput.jsx
        │   │   ├── MuiSendButton.jsx
        │   │   ├── MuiAttachButton.jsx
        │   │   ├── MuiAudioRecorder.jsx
        │   │   ├── MuiLiveSttButton.jsx
        │   │   ├── MuiModelSelector.jsx
        │   │   ├── MuiComposerTopToolbar.jsx
        │   │   ├── MuiComposerBottomToolbar.jsx
        │   │   ├── MuiChatMessageListContent.jsx
        │   │   ├── MuiChatEmptyState.jsx
        │   │   ├── MuiUserMessage.jsx
        │   │   ├── MuiUserMessageBody.jsx
        │   │   ├── MuiUserMessageBottomBar.jsx
        │   │   ├── MuiUserAttachmentShelf.jsx
        │   │   ├── MuiAgentMessage.jsx
        │   │   ├── MuiAgentMessageBody.jsx
        │   │   ├── MuiAgentMessageBottomBar.jsx
        │   │   ├── MuiMessageContent.jsx
        │   │   ├── MuiAgentExecutionTimeline.jsx
        │   │   ├── MuiToolCallPart.jsx
        │   │   ├── MuiReasoningAccordion.jsx
        │   │   ├── MuiCloudDocumentCard.jsx
        │   │   ├── MuiTtsPlayButton.jsx
        │   │   ├── MuiRecentChat.jsx
        │   │   └── MuiErrorNotice.jsx
        │   ├── dashboard/
        │   │   ├── DashboardKpiDeck.jsx
        │   │   ├── DashboardQuickActions.jsx
        │   │   ├── DashboardAuditTrendChart.jsx
        │   │   ├── DashboardBranchVisitChart.jsx
        │   │   └── DashboardRecentAuditsLedger.jsx
        │   ├── landing/
        │   │   ├── LandingHero.jsx
        │   │   ├── LandingFeaturesDeck.jsx
        │   │   ├── LandingArchitectureShowcase.jsx
        │   │   └── LandingFooter.jsx
        │   ├── profile/
        │   │   ├── ProfileHeaderHero.jsx
        │   │   ├── ProfileAccountTab.jsx
        │   │   ├── ProfileSecurityTab.jsx
        │   │   ├── ProfileAgentConfigTab.jsx
        │   │   ├── ProfileDirectivesTab.jsx
        │   │   ├── CloudIntegrationsTab.jsx
        │   │   ├── ProfileTelegramTab.jsx
        │   │   ├── ProfileReportTemplatesSection.jsx
        │   │   └── ProfileDangerZone.jsx
        │   ├── branches/
        │   │   ├── BranchHero.jsx
        │   │   ├── BranchCard.jsx
        │   │   ├── BranchCardGrid.jsx
        │   │   ├── BranchDataGrid.jsx
        │   │   ├── BranchControlStrip.jsx
        │   │   ├── BranchAnalyticsCharts.jsx
        │   │   ├── BranchAuditHistory.jsx
        │   │   ├── BranchDangerZone.jsx
        │   │   └── MuiBranchDialog.jsx
        │   ├── reports/
        │   │   ├── ReportHero.jsx
        │   │   ├── ReportCard.jsx
        │   │   ├── ReportCardGrid.jsx
        │   │   ├── ReportDataGrid.jsx
        │   │   ├── ReportControlStrip.jsx
        │   │   ├── ReportActivitiesCard.jsx
        │   │   ├── ReportIssuesCard.jsx
        │   │   ├── ReportCommentsCard.jsx
        │   │   ├── ReportVisitsLedger.jsx
        │   │   ├── ReportAudioPlayerDeck.jsx
        │   │   ├── ReportAmharicDossier.jsx
        │   │   ├── ReportDangerZone.jsx
        │   │   └── MuiReportTelegramShareButton.jsx
        │   ├── columns/
        │   │   ├── branchColumns.jsx
        │   │   ├── reportColumns.jsx
        │   │   └── auditHistoryColumns.jsx
        │   ├── reusable/
        │   │   ├── ErrorBoundary.jsx
        │   │   ├── LoadingSpinner.jsx
        │   │   ├── MuiAppbar.jsx
        │   │   ├── MuiButton.jsx
        │   │   ├── MuiTextField.jsx
        │   │   ├── MuiSearchInput.jsx
        │   │   ├── MuiDatePicker.jsx
        │   │   ├── MuiTimePicker.jsx
        │   │   ├── MuiDialog.jsx
        │   │   ├── MuiConfirmDialog.jsx
        │   │   ├── MuiActionMenu.jsx
        │   │   ├── MuiEmptyState.jsx
        │   │   ├── MuiPagination.jsx
        │   │   ├── MuiStatCard.jsx
        │   │   ├── MuiStatusChip.jsx
        │   │   ├── MuiDataGrid.jsx
        │   │   └── MuiDataGridToolbar.jsx
        │   ├── search/
        │   │   └── GlobalSearchModal.jsx
        │   └── common/
        │       ├── GlobalErrorFallback.jsx
        │       └── RootHydrateFallback.jsx
        ├── hooks/
        │   ├── useAudioRecorder.js
        │   ├── useAddisLiveStt.js
        │   ├── useAddisTts.js
        │   └── useLogout.js
        ├── redux/
        │   ├── app/
        │   │   ├── store.js
        │   │   ├── apiSlice.js
        │   │   └── authClient.js
        │   └── features/
        │       ├── authSlice.js
        │       ├── chatSlice.js        # Thread list & history cache (isolated from streaming)
        │       ├── userSlice.js
        │       ├── dashboardSlice.js
        │       ├── branchSlice.js
        │       ├── reportSlice.js
        │       └── sttSlice.js
        ├── routes/
        │   ├── ProtectedRoute.jsx
        │   └── PublicRoute.jsx
        ├── utils/
        │   ├── constants.js
        │   ├── avatarUtils.js
        │   ├── attachmentRegistry.js
        │   ├── validateChatAttachment.js
        │   ├── imageOptimizer.js
        │   ├── addisAudioPlayer.js
        │   ├── ethiopianCalendar.js
        │   └── AdapterEthiopianDayjs.js
        ├── assets/
        │   ├── hero.png
        │   ├── notFound_404.svg
        │   ├── react.svg
        │   └── vite.svg
        └── theme/                      # Material UI Design System (Preserved)
            ├── AppTheme.jsx
            ├── themePrimitives.js
            ├── useThemeMode.js
            └── customizations/
                ├── index.js
                ├── inputs.js
                ├── dataDisplay.js
                ├── feedback.js
                ├── navigation.js
                ├── surfaces.js
                ├── charts.js
                ├── dataGrid.js
                └── datePickers.js
```

### 15.1 Placement rules

- All pages are located directly in `client/src/pages/` (including branch and report pages).
- All models reside directly in `backend/src/models/`, routes in `backend/src/routes/`, and controllers in `backend/src/controllers/`.
- No separate `operations/` directory is used; domain capabilities are grouped by component/file names rather than nested folders.
- `chatSlice.js` strictly manages thread list and history query caching; it must not compete with or duplicate the active live message stream state.
- Keep LangChain/LangGraph-specific orchestration inside `backend/src/agent/` and model provider wrappers inside `backend/src/providers/`.
- Maintain separate `package.json`, `package-lock.json`, and `node_modules` in `backend/` and `client/`, orchestrated by root npm workspaces.

---

## 16. Source-file disposition register: backend (61 sections)

The left column is the exact source-section path in the read-only export. It is included only for traceability. The right column is the target V1 path/decision. “Rebuild” means preserve the responsibility and behavior but implement it against the V1 contracts. A split indicates the source file carries multiple responsibilities and must not remain monolithic.

| # | Reference source section | V1 destination and required treatment |
|---:|---|---|
| 1 | `backend/src/app.js` | `backend/src/app.js` — rebuild Express application composition, exact CORS, security middleware, request parsing, route mounting and private asset routes. Remove public static upload serving. |
| 2 | `backend/src/server.js` | `backend/src/server.js` — rebuild bootstrap, DB readiness, worker startup, signal handling, stream/job drain, and deterministic shutdown. |
| 3 | `backend/src/config/db.js` | `backend/src/config/db.js` — retain Mongoose/Mongo connection lifecycle; unify pool ownership; remove recursive reconnect races. |
| 4 | `backend/src/config/env.js` | `backend/src/config/env.js` — rebuild schema-based environment validation; parse URL, booleans, secrets and numeric limits; fail closed. |
| 5 | `backend/src/config/logger.js` | `backend/src/config/logger.js` — retain structured logging/rotation as appropriate; add field- and content-aware redaction and correlation IDs; no secret/raw prompt logging. |
| 6 | `backend/src/config/schemaOptions.js` | `backend/src/config/schemaOptions.js` — keep shared safe serialization/timestamp conventions. |
| 7 | `backend/src/errors/CustomError.js` | `backend/src/errors/AppError.js` — rebuild typed application errors and normalized public error codes; never leak stack/provider secrets. |
| 8 | `backend/src/middleware/authMiddleware.js` | `backend/src/middleware/authMiddleware.js` — rebuild server-derived identity, session validation and owner context; no client owner claims. |
| 9 | `backend/src/middleware/errorHandler.js` | `backend/src/middleware/errorHandler.js` — preserve centralized error translation with safe correlation IDs and no sensitive provider payloads. |
| 10 | `backend/src/middleware/notFoundHandler.js` | `backend/src/middleware/notFoundHandler.js` — preserve API 404 contract and non-enumerating resource semantics. |
| 11 | `backend/src/middleware/uploadMiddleware.js` | `backend/src/middleware/uploadMiddleware.js` — rebuild streaming private uploads, MIME/content validation, quotas, safe names and resource limits. |
| 12 | `backend/src/middleware/validate.js` | `backend/src/middleware/validate.js` — retain reusable validation middleware. |
| 13 | `backend/src/routes/authRoutes.js` | `backend/src/routes/authRoutes.js` — rebuild registration/login/logout/refresh/Google OAuth routes; secure state and refresh rotation. |
| 14 | `backend/src/routes/branchRoutes.js` | `backend/src/routes/branchRoutes.js` — preserve branch CRUD, archival, metrics and history. |
| 15 | `backend/src/routes/chatRoutes.js` | `backend/src/routes/chatRoutes.js` — thread persistence, message history, and canonical SSE stream route. |
| 16 | `backend/src/routes/dashboardRoutes.js` | `backend/src/routes/dashboardRoutes.js` — rebuild dashboard aggregation endpoints. |
| 17 | `backend/src/routes/index.js` | *Integrated* — central router mounting in `app.js` or `routes/`. |
| 18 | `backend/src/routes/reportRoutes.js` | `backend/src/routes/reportRoutes.js` — preserve reports and subresource APIs; correct ownership, lifecycle and date semantics. |
| 19 | `backend/src/routes/sttRoutes.js` | `backend/src/routes/sttRoutes.js` — remote speech transcription endpoint. |
| 20 | `backend/src/routes/userRoutes.js` | `backend/src/routes/userRoutes.js` — profile, directives, and user settings endpoints. |
| 21 | `backend/src/services/documentGenerationService.js` | `backend/src/services/documentGenerationService.js` — preserve PDF/DOCX/XLSX/CSV/MD/JSON generation; verify fonts, Unicode, safety and format validity. |
| 22 | `backend/src/services/googleDriveService.js` | `backend/src/services/googleDriveService.js` — rebuild OAuth/token refresh, scoped operations, private-by-default sharing and durable state. |
| 23 | `backend/src/services/storageService.js` | `backend/src/services/storageService.js` — private durable filesystem storage interface and cleanup reconciliation. |
| 24 | `backend/src/services/telegramService.js` | `backend/src/services/telegramService.js` — preserve text/image delivery, improve chunking/Unicode, add destination preview/approval and idempotency. |
| 25 | `backend/src/services/ttsService.js` | `backend/src/services/ttsService.js` — optional remote TTS synthesis service. |
| 26 | `backend/src/utils/attachmentProcessor.js` | `backend/src/utils/attachmentProcessor.js` — deterministic text extraction and metadata processing with hard resource bounds. |
| 27 | `backend/src/utils/audioChunker.js` | `backend/src/utils/audioChunker.js` — retain deterministic FFmpeg chunking only as needed; robust duration/codec limits. |
| 28 | `backend/src/utils/constants.js` | `backend/src/utils/constants.js` — single source of truth for limits, constants, and defaults. |
| 29 | `backend/src/utils/errorFormatter.js` | `backend/src/utils/errorFormatter.js` — normalize provider and HTTP error formatting. |
| 30 | `backend/src/utils/ethiopianCalendar.js` | `backend/src/utils/ethiopianCalendar.js` — preserve tested Ethiopian conversions and explicit Gregorian mapping. |
| 31 | `backend/src/utils/promptAssembler.js` | `backend/src/agent/promptAssembler.js` — context assembler combining system policy and user preferences. |
| 32 | `backend/src/utils/token.js` | `backend/src/utils/token.js` — session and refresh token minting/verification with secure signing. |
| 33 | `backend/src/utils/transliterate.js` | `backend/src/utils/transliterate.js` — preserve relevant Amharic transliteration/search. |
| 34 | `backend/src/assets/fonts/Inter-Bold.ttf` | `backend/src/assets/fonts/Inter-Bold.ttf` — licensed font asset. |
| 35 | `backend/src/assets/fonts/Inter-Regular.ttf` | `backend/src/assets/fonts/Inter-Regular.ttf` — licensed font asset. |
| 36 | `backend/src/assets/fonts/NotoSansEthiopic-Bold.ttf` | `backend/src/assets/fonts/NotoSansEthiopic-Bold.ttf` — licensed Ethiopic font asset. |
| 37 | `backend/src/assets/fonts/NotoSansEthiopic-Bold.woff` | `backend/src/assets/fonts/NotoSansEthiopic-Bold.woff` — web font format. |
| 38 | `backend/src/assets/fonts/NotoSansEthiopic-Regular.ttf` | `backend/src/assets/fonts/NotoSansEthiopic-Regular.ttf` — licensed Ethiopic font asset. |
| 39 | `backend/src/assets/fonts/NotoSansEthiopic-Regular.woff` | `backend/src/assets/fonts/NotoSansEthiopic-Regular.woff` — web font format. |
| 40 | `backend/src/assets/fonts/NotoSansLatin-Bold.ttf` | `backend/src/assets/fonts/NotoSansLatin-Bold.ttf` — licensed Latin font asset. |
| 41 | `backend/src/assets/fonts/NotoSansLatin-Regular.ttf` | `backend/src/assets/fonts/NotoSansLatin-Regular.ttf` — licensed Latin font asset. |
| 42 | `backend/src/assets/fonts/fonts.conf` | `backend/src/assets/fonts/fonts.conf` — Fontconfig configuration for PDF rendering. |
| 43 | `backend/src/controllers/authController.js` | `backend/src/controllers/authController.js` — auth endpoints, cookie setting, Google OAuth callback. |
| 44 | `backend/src/controllers/branchController.js` | `backend/src/controllers/branchController.js` — branch management and metrics. |
| 45 | `backend/src/controllers/chatController.js` | `backend/src/controllers/chatController.js` — chat thread handling and SSE streaming delegation. |
| 46 | `backend/src/controllers/dashboardController.js` | `backend/src/controllers/dashboardController.js` — dashboard aggregation endpoints. |
| 47 | `backend/src/controllers/reportController.js` | `backend/src/controllers/reportController.js` — report CRUD, date/time handling, archival. |
| 48 | `backend/src/controllers/sttController.js` | `backend/src/controllers/sttController.js` — audio transcription controller. |
| 49 | `backend/src/controllers/userController.js` | `backend/src/controllers/userController.js` — profile and user directives controller. |
| 50 | `backend/src/jobs/sweeper.js` | `backend/src/jobs/sweeper.js` — file cleanup, lease maintenance, outbox reconciliation. |
| 51 | `backend/src/models/Audio.js` | `backend/src/models/Audio.js` — audio asset schema and transcription state. |
| 52 | `backend/src/models/Branch.js` | `backend/src/models/Branch.js` — branch directory schema with unique indexes. |
| 53 | `backend/src/models/Chat.js` | `backend/src/models/Chat.js` — chat conversation schema with turn and message records. |
| 54 | `backend/src/models/Report.js` | `backend/src/models/Report.js` — operational audit report schema with visits and issues. |
| 55 | `backend/src/models/User.js` | `backend/src/models/User.js` — user schema with encrypted credentials and directives. |
| 56 | `backend/src/tools/agentTools.js` | `backend/src/agent/agentTools.js` — Zod schema tools with runtime context and authorization. |
| 57 | `backend/src/validations/authValidation.js` | `backend/src/validations/authValidation.js` — auth input validation schemas. |
| 58 | `backend/src/validations/branchValidation.js` | `backend/src/validations/branchValidation.js` — branch input validation schemas. |
| 59 | `backend/src/validations/chatValidation.js` | `backend/src/validations/chatValidation.js` — chat and message input validation schemas. |
| 60 | `backend/src/validations/reportValidation.js` | `backend/src/validations/reportValidation.js` — report input validation schemas. |
| 61 | `backend/src/validations/userValidation.js` | `backend/src/validations/userValidation.js` — user settings and directives validation schemas. |

### 16.1 Backend-specific migration cautions

- The current chat controller combines persistence, provider streaming, context building, tool orchestration, retry, failover and cleanup. Split by responsibility before broad feature additions.
- Model-specific request payloads stay in provider adapters; business tools consume normalized app contracts.
- Preserve all branch/report REST and conversational functionality behind module services; don't make the operations module a requirement for general chat.
- Audio records and files must migrate conceptually to assets plus representations; no public URL assumption.
- Keep file cleanup asynchronous and reconcilable; database transaction and storage operation are not one atomic transaction.
- Keep prompt policies and user preferences separate with a defined precedence table.

---

## 17. Source-file disposition register: frontend (153 sections)

Every section in the client export is accounted for. The target path may be adjusted only through an ADR and updated traceability. Components may be split or consolidated after their behavior has been mapped and tested. Do not keep unused Vite/React template assets in the production application.

| # | Reference source section | V1 destination and required treatment |
|---:|---|---|
| 1 | `client/src/App.jsx` | `client/src/App.jsx` — rebuild session hydration and route outlet; avoid auth state flicker and stale persisted identity. |
| 2 | `client/src/main.jsx` | `client/src/main.jsx` — root React bootstrap, StrictMode, single theme mount, localization, error boundary. |
| 3 | `client/src/router.jsx` | `client/src/router.jsx` — rebuild route tree with ProtectedRoute/PublicRoute and lazy page boundaries. |
| 4 | `client/src/adapters/MuiChatAdapter.js` | *Deferred / Replaced* — standalone adapter file removed; stream protocol integrated directly into chat runtime. |
| 5 | `client/src/assets/hero.png` | `client/src/assets/hero.png` — retain brand hero image asset. |
| 6 | `client/src/assets/notFound_404.svg` | `client/src/assets/notFound_404.svg` — retain accessible 404 illustration. |
| 7 | `client/src/assets/react.svg` | `client/src/assets/react.svg` — retain static icon asset. |
| 8 | `client/src/assets/vite.svg` | `client/src/assets/vite.svg` — retain static icon asset. |
| 9 | `client/src/contexts/ChatAdapterContext.js` | *Removed* — context layer removed; no redundant state container. |
| 10 | `client/src/layouts/AppShell.jsx` | `client/src/layouts/AppShell.jsx` — rebuild global authenticated shell and navigation outlets. |
| 11 | `client/src/layouts/AvatarMenu.jsx` | `client/src/layouts/AvatarMenu.jsx` — preserve account/profile/logout access; display no secret/model key. |
| 12 | `client/src/layouts/Logo.jsx` | `client/src/layouts/Logo.jsx` — adapt to global Personal AI Agent partner identity. |
| 13 | `client/src/layouts/MuiSidebar.jsx` | `client/src/layouts/MuiSidebar.jsx` — general navigation drawer with routes for all application pages. |
| 14 | `client/src/layouts/PublicLayout.jsx` | `client/src/layouts/PublicLayout.jsx` — public pages shell for Landing, Login, Register. |
| 15 | `client/src/layouts/ThemeToggle.jsx` | `client/src/layouts/ThemeToggle.jsx` — preserve light/dark mode with theme token consistency. |
| 16 | `client/src/pages/BranchDetail.jsx` | `client/src/pages/BranchDetail.jsx` — preserve branch detail, analytics, audit history and lifecycle controls directly in `pages/`. |
| 17 | `client/src/pages/Branches.jsx` | `client/src/pages/Branches.jsx` — preserve branch search, filters, grid/card responsiveness and CRUD directly in `pages/`. |
| 18 | `client/src/pages/Chat.jsx` | `client/src/pages/Chat.jsx` — preserve full-screen chat canvas, sidebar thread list, composer and history. |
| 19 | `client/src/pages/Dashboard.jsx` | `client/src/pages/Dashboard.jsx` — general personal dashboard; operational metrics cards optional. |
| 20 | `client/src/pages/Landing.jsx` | `client/src/pages/Landing.jsx` — universal Personal AI Partner positioning (writing, research, planning, tasks). |
| 21 | `client/src/pages/Login.jsx` | `client/src/pages/Login.jsx` — secure email login and Google sign-in. |
| 22 | `client/src/pages/NotFound.jsx` | `client/src/pages/NotFound.jsx` — preserve accessible fallback. |
| 23 | `client/src/pages/Profile.jsx` | `client/src/pages/Profile.jsx` — full multi-tab settings (Account, Security, AI Configuration, Directives, Danger Zone). |
| 24 | `client/src/pages/Register.jsx` | `client/src/pages/Register.jsx` — preserve registration with validation and account-linking behavior. |
| 25 | `client/src/pages/ReportDetail.jsx` | `client/src/pages/ReportDetail.jsx` — preserve report detail, dossier, audio, visits and export workflows directly in `pages/`. |
| 26 | `client/src/pages/ReportEdit.jsx` | `client/src/pages/ReportEdit.jsx` — preserve full and item-level report edit directly in `pages/`. |
| 27 | `client/src/pages/Reports.jsx` | `client/src/pages/Reports.jsx` — preserve report filters, pagination, grid/card views directly in `pages/`. |
| 28 | `client/src/theme/AppTheme.jsx` | `client/src/theme/AppTheme.jsx` — retain authoritative MUI theme provider and CSS variables. |
| 29 | `client/src/theme/customizations/charts.js` | `client/src/theme/customizations/charts.js` — retain MUI X Charts overrides. |
| 30 | `client/src/theme/customizations/dataDisplay.js` | `client/src/theme/customizations/dataDisplay.js` — retain data display overrides. |
| 31 | `client/src/theme/customizations/dataGrid.js` | `client/src/theme/customizations/dataGrid.js` — retain DataGrid overrides. |
| 32 | `client/src/theme/customizations/datePickers.js` | `client/src/theme/customizations/datePickers.js` — preserve date/time picker overrides. |
| 33 | `client/src/theme/customizations/feedback.js` | `client/src/theme/customizations/feedback.js` — retain feedback overrides. |
| 34 | `client/src/theme/customizations/index.js` | `client/src/theme/customizations/index.js` — central customization composition. |
| 35 | `client/src/theme/customizations/inputs.js` | `client/src/theme/customizations/inputs.js` — retain form input styling. |
| 36 | `client/src/theme/customizations/navigation.js` | `client/src/theme/customizations/navigation.js` — retain navigation overrides. |
| 37 | `client/src/theme/customizations/surfaces.js` | `client/src/theme/customizations/surfaces.js` — retain surface/paper style tokens. |
| 38 | `client/src/theme/themePrimitives.js` | `client/src/theme/themePrimitives.js` — consolidate colors, spacing, elevation, typography. |
| 39 | `client/src/theme/useThemeMode.js` | `client/src/theme/useThemeMode.js` — retain safe theme preference hook. |
| 40 | `client/src/components/auth/GoogleSsoButton.jsx` | `client/src/components/auth/GoogleSsoButton.jsx` — preserve Google sign-in button. |
| 41 | `client/src/components/branches/BranchAnalyticsCharts.jsx` | `client/src/components/branches/BranchAnalyticsCharts.jsx` — preserve branch metrics and charts. |
| 42 | `client/src/components/branches/BranchAuditHistory.jsx` | `client/src/components/branches/BranchAuditHistory.jsx` — preserve audit timeline and pagination. |
| 43 | `client/src/components/branches/BranchCard.jsx` | `client/src/components/branches/BranchCard.jsx` — preserve responsive branch card/action states. |
| 44 | `client/src/components/branches/BranchCardGrid.jsx` | `client/src/components/branches/BranchCardGrid.jsx` — preserve mobile list/card flow. |
| 45 | `client/src/components/branches/BranchControlStrip.jsx` | `client/src/components/branches/BranchControlStrip.jsx` — preserve search/filter/view switch. |
| 46 | `client/src/components/branches/BranchDangerZone.jsx` | `client/src/components/branches/BranchDangerZone.jsx` — archive, restore, and permanent delete with confirmation. |
| 47 | `client/src/components/branches/BranchDataGrid.jsx` | `client/src/components/branches/BranchDataGrid.jsx` — preserve branch table view. |
| 48 | `client/src/components/branches/BranchHero.jsx` | `client/src/components/branches/BranchHero.jsx` — preserve branch headline, location, and status. |
| 49 | `client/src/components/branches/MuiBranchDialog.jsx` | `client/src/components/branches/MuiBranchDialog.jsx` — preserve branch create/edit modal form with validation. |
| 50 | `client/src/components/chat/MuiAgentExecutionTimeline.jsx` | `client/src/components/chat/MuiAgentExecutionTimeline.jsx` — preserve user-safe tool/status timeline; no hidden reasoning. |
| 51 | `client/src/components/chat/MuiAgentMessage.jsx` | `client/src/components/chat/MuiAgentMessage.jsx` — preserve assistant message lifecycle, status, actions. |
| 52 | `client/src/components/chat/MuiAgentMessageBody.jsx` | `client/src/components/chat/MuiAgentMessageBody.jsx` — Markdown, citation, artifact rendering. |
| 53 | `client/src/components/chat/MuiAgentMessageBottomBar.jsx` | `client/src/components/chat/MuiAgentMessageBottomBar.jsx` — copy/retry/branch/TTS actions. |
| 54 | `client/src/components/chat/MuiAttachButton.jsx` | `client/src/components/chat/MuiAttachButton.jsx` — file picker trigger. |
| 55 | `client/src/components/chat/MuiAudioRecorder.jsx` | `client/src/components/chat/MuiAudioRecorder.jsx` — preserve audio capture lifecycle, waveform HUD, stop/attach. |
| 56 | `client/src/components/chat/MuiChatEmptyState.jsx` | `client/src/components/chat/MuiChatEmptyState.jsx` — personal assistant suggestion chips. |
| 57 | `client/src/components/chat/MuiChatMessageListContent.jsx` | `client/src/components/chat/MuiChatMessageListContent.jsx` — message list loading, stream states, stable keys. |
| 58 | `client/src/components/chat/MuiCloudDocumentCard.jsx` | `client/src/components/chat/MuiCloudDocumentCard.jsx` — cloud/generated document card with private download links. |
| 59 | `client/src/components/chat/MuiComposerBottomToolbar.jsx` | `client/src/components/chat/MuiComposerBottomToolbar.jsx` — attach, voice, model selector, send button layout. |
| 60 | `client/src/components/chat/MuiComposerInput.jsx` | `client/src/components/chat/MuiComposerInput.jsx` — multiline text entry, low-latency typing, submit triggers. |
| 61 | `client/src/components/chat/MuiComposerTopToolbar.jsx` | `client/src/components/chat/MuiComposerTopToolbar.jsx` — staged attachment preview and remove buttons. |
| 62 | `client/src/components/chat/MuiErrorNotice.jsx` | `client/src/components/chat/MuiErrorNotice.jsx` — stream error alert banner with retry trigger. |
| 63 | `client/src/components/chat/MuiLiveSttButton.jsx` | `client/src/components/chat/MuiLiveSttButton.jsx` — live speech dictation button. |
| 64 | `client/src/components/chat/MuiMessageContent.jsx` | `client/src/components/chat/MuiMessageContent.jsx` — message content parts renderer. |
| 65 | `client/src/components/chat/MuiModelSelector.jsx` | `client/src/components/chat/MuiModelSelector.jsx` — provider/model selector with capability indicators. |
| 66 | `client/src/components/chat/MuiReasoningAccordion.jsx` | `client/src/components/chat/MuiReasoningAccordion.jsx` — safe execution progress details; omit private model thoughts. |
| 67 | `client/src/components/chat/MuiRecentChat.jsx` | `client/src/components/chat/MuiRecentChat.jsx` — sidebar thread item, pin/unpin, rename, delete actions. |
| 68 | `client/src/components/chat/MuiSendButton.jsx` | `client/src/components/chat/MuiSendButton.jsx` — send/stop state machine button. |
| 69 | `client/src/components/chat/MuiToolCallPart.jsx` | `client/src/components/chat/MuiToolCallPart.jsx` — tool execution display and interactive HITL approval card. |
| 70 | `client/src/components/chat/MuiTtsPlayButton.jsx` | `client/src/components/chat/MuiTtsPlayButton.jsx` — speech audio playback trigger and loading state. |
| 71 | `client/src/components/chat/MuiUserAttachmentShelf.jsx` | `client/src/components/chat/MuiUserAttachmentShelf.jsx` — attachment chips on user messages. |
| 72 | `client/src/components/chat/MuiUserMessage.jsx` | `client/src/components/chat/MuiUserMessage.jsx` — user message presentation, edit, status. |
| 73 | `client/src/components/chat/MuiUserMessageBody.jsx` | `client/src/components/chat/MuiUserMessageBody.jsx` — user text and attachment display. |
| 74 | `client/src/components/chat/MuiUserMessageBottomBar.jsx` | `client/src/components/chat/MuiUserMessageBottomBar.jsx` — message timestamp, edit action, copy action. |
| 75 | `client/src/components/chat/index.js` | `client/src/components/chat/index.js` — controlled barrel exports for chat component suite. |
| 76 | `client/src/components/columns/auditHistoryColumns.jsx` | `client/src/components/columns/auditHistoryColumns.jsx` — audit history DataGrid columns. |
| 77 | `client/src/components/columns/branchColumns.jsx` | `client/src/components/columns/branchColumns.jsx` — branch DataGrid column definitions. |
| 78 | `client/src/components/columns/reportColumns.jsx` | `client/src/components/columns/reportColumns.jsx` — report DataGrid column definitions. |
| 79 | `client/src/components/common/GlobalErrorFallback.jsx` | `client/src/components/common/GlobalErrorFallback.jsx` — global error recovery UI. |
| 80 | `client/src/components/common/RootHydrateFallback.jsx` | `client/src/components/common/RootHydrateFallback.jsx` — initial auth rehydration loading screen. |
| 81 | `client/src/components/dashboard/DashboardAuditTrendChart.jsx` | `client/src/components/dashboard/DashboardAuditTrendChart.jsx` — operational audit trend chart widget. |
| 82 | `client/src/components/dashboard/DashboardBranchVisitChart.jsx` | `client/src/components/dashboard/DashboardBranchVisitChart.jsx` — operational branch visit chart widget. |
| 83 | `client/src/components/dashboard/DashboardKpiDeck.jsx` | `client/src/components/dashboard/DashboardKpiDeck.jsx` — general personal partner KPI cards. |
| 84 | `client/src/components/dashboard/DashboardQuickActions.jsx` | `client/src/components/dashboard/DashboardQuickActions.jsx` — quick action buttons. |
| 85 | `client/src/components/dashboard/DashboardRecentAuditsLedger.jsx` | `client/src/components/dashboard/DashboardRecentAuditsLedger.jsx` — operational recent audit reports widget. |
| 86 | `client/src/components/landing/LandingArchitectureShowcase.jsx` | `client/src/components/landing/LandingArchitectureShowcase.jsx` — landing page architecture showcase. |
| 87 | `client/src/components/landing/LandingFeaturesDeck.jsx` | `client/src/components/landing/LandingFeaturesDeck.jsx` — landing page feature deck. |
| 88 | `client/src/components/landing/LandingFooter.jsx` | `client/src/components/landing/LandingFooter.jsx` — landing page footer. |
| 89 | `client/src/components/landing/LandingHero.jsx` | `client/src/components/landing/LandingHero.jsx` — landing page headline and CTA. |
| 90 | `client/src/components/profile/CloudIntegrationsTab.jsx` | `client/src/components/profile/CloudIntegrationsTab.jsx` — Google Drive integration settings. |
| 91 | `client/src/components/profile/ProfileAccountTab.jsx` | `client/src/components/profile/ProfileAccountTab.jsx` — profile name, email, avatar settings. |
| 92 | `client/src/components/profile/ProfileAgentConfigTab.jsx` | `client/src/components/profile/ProfileAgentConfigTab.jsx` — model provider configuration, default parameters, BYOK inputs. |
| 93 | `client/src/components/profile/ProfileDangerZone.jsx` | `client/src/components/profile/ProfileDangerZone.jsx` — account export and deletion controls. |
| 94 | `client/src/components/profile/ProfileDirectivesTab.jsx` | `client/src/components/profile/ProfileDirectivesTab.jsx` — user directives, style guidelines, vocabulary mappings. |
| 95 | `client/src/components/profile/ProfileHeaderHero.jsx` | `client/src/components/profile/ProfileHeaderHero.jsx` — profile banner with account details & avatar. |
| 96 | `client/src/components/profile/ProfileReportTemplatesSection.jsx` | `client/src/components/profile/ProfileReportTemplatesSection.jsx` — report template settings. |
| 97 | `client/src/components/profile/ProfileSecurityTab.jsx` | `client/src/components/profile/ProfileSecurityTab.jsx` — password change and session settings. |
| 98 | `client/src/components/profile/ProfileTelegramTab.jsx` | `client/src/components/profile/ProfileTelegramTab.jsx` — Telegram bot configuration. |
| 99 | `client/src/components/reports/MuiReportTelegramShareButton.jsx` | `client/src/components/reports/MuiReportTelegramShareButton.jsx` — Telegram share button with preview dialog and approval. |
| 100 | `client/src/components/reports/ReportActivitiesCard.jsx` | `client/src/components/reports/ReportActivitiesCard.jsx` — report activities list with status indicators. |
| 101 | `client/src/components/reports/ReportAmharicDossier.jsx` | `client/src/components/reports/ReportAmharicDossier.jsx` — formatted Amharic report dossier with Ethiopic font support. |
| 102 | `client/src/components/reports/ReportAudioPlayerDeck.jsx` | `client/src/components/reports/ReportAudioPlayerDeck.jsx` — report audio evidence player deck. |
| 103 | `client/src/components/reports/ReportCard.jsx` | `client/src/components/reports/ReportCard.jsx` — summary card for operational report. |
| 104 | `client/src/components/reports/ReportCardGrid.jsx` | `client/src/components/reports/ReportCardGrid.jsx` — responsive report card collection. |
| 105 | `client/src/components/reports/ReportCommentsCard.jsx` | `client/src/components/reports/ReportCommentsCard.jsx` — report observations and comments card. |
| 106 | `client/src/components/reports/ReportControlStrip.jsx` | `client/src/components/reports/ReportControlStrip.jsx` — report date picker, status filter, view switcher. |
| 107 | `client/src/components/reports/ReportDangerZone.jsx` | `client/src/components/reports/ReportDangerZone.jsx` — report archival, restore, and permanent deletion. |
| 108 | `client/src/components/reports/ReportDataGrid.jsx` | `client/src/components/reports/ReportDataGrid.jsx` — report table view with sorting and pagination. |
| 109 | `client/src/components/reports/ReportHero.jsx` | `client/src/components/reports/ReportHero.jsx` — report headline, branch name, date, auditor. |
| 110 | `client/src/components/reports/ReportIssuesCard.jsx` | `client/src/components/reports/ReportIssuesCard.jsx` — operational issues list with severity tags. |
| 111 | `client/src/components/reports/ReportVisitsLedger.jsx` | `client/src/components/reports/ReportVisitsLedger.jsx` — branch visit arrival/departure timeline. |
| 112 | `client/src/components/reusable/ErrorBoundary.jsx` | `client/src/components/reusable/ErrorBoundary.jsx` — component-level error boundary. |
| 113 | `client/src/components/reusable/LoadingSpinner.jsx` | `client/src/components/reusable/LoadingSpinner.jsx` — reusable loading indicator. |
| 114 | `client/src/components/reusable/MuiActionMenu.jsx` | `client/src/components/reusable/MuiActionMenu.jsx` — accessible popover action menu. |
| 115 | `client/src/components/reusable/MuiAppbar.jsx` | `client/src/components/reusable/MuiAppbar.jsx` — top application bar with sidebar toggle & actions. |
| 116 | `client/src/components/reusable/MuiButton.jsx` | `client/src/components/reusable/MuiButton.jsx` — styled button wrapper. |
| 117 | `client/src/components/reusable/MuiConfirmDialog.jsx` | `client/src/components/reusable/MuiConfirmDialog.jsx` — reusable confirmation modal dialog. |
| 118 | `client/src/components/reusable/MuiDataGrid.jsx` | `client/src/components/reusable/MuiDataGrid.jsx` — consistent DataGrid wrapper. |
| 119 | `client/src/components/reusable/MuiDataGridToolbar.jsx` | `client/src/components/reusable/MuiDataGridToolbar.jsx` — DataGrid search and export toolbar. |
| 120 | `client/src/components/reusable/MuiDatePicker.jsx` | `client/src/components/reusable/MuiDatePicker.jsx` — locale-aware date picker with Ethiopian calendar integration. |
| 121 | `client/src/components/reusable/MuiDialog.jsx` | `client/src/components/reusable/MuiDialog.jsx` — accessible responsive dialog wrapper. |
| 122 | `client/src/components/reusable/MuiEmptyState.jsx` | `client/src/components/reusable/MuiEmptyState.jsx` — generic empty state placeholder. |
| 123 | `client/src/components/reusable/MuiPagination.jsx` | `client/src/components/reusable/MuiPagination.jsx` — reusable pagination controls. |
| 124 | `client/src/components/reusable/MuiSearchInput.jsx` | `client/src/components/reusable/MuiSearchInput.jsx` — search input with clear button and query debounce. |
| 125 | `client/src/components/reusable/MuiStatCard.jsx` | `client/src/components/reusable/MuiStatCard.jsx` — stat card with trend indicator. |
| 126 | `client/src/components/reusable/MuiStatusChip.jsx` | `client/src/components/reusable/MuiStatusChip.jsx` — status chip with standardized palette. |
| 127 | `client/src/components/reusable/MuiTextField.jsx` | `client/src/components/reusable/MuiTextField.jsx` — form text field wrapper. |
| 128 | `client/src/components/reusable/MuiTimePicker.jsx` | `client/src/components/reusable/MuiTimePicker.jsx` — 24-hour time picker wrapper. |
| 129 | `client/src/components/search/GlobalSearchModal.jsx` | `client/src/components/search/GlobalSearchModal.jsx` — keyboard-triggered search across threads & files. |
| 130 | `client/src/hooks/useAddisLiveStt.js` | `client/src/hooks/useAddisLiveStt.js` — live speech dictation WebSocket hook. |
| 131 | `client/src/hooks/useAddisTts.js` | `client/src/hooks/useAddisTts.js` — speech playback hook with bounded audio caching. |
| 132 | `client/src/hooks/useAudioRecorder.js` | `client/src/hooks/useAudioRecorder.js` — audio recorder lifecycle with MIME fallbacks. |
| 133 | `client/src/hooks/useLogout.js` | `client/src/hooks/useLogout.js` — server session revocation & RTK cache purge hook. |
| 134 | `client/src/redux/app/apiSlice.js` | `client/src/redux/app/apiSlice.js` — RTK Query base query with automatic JWT refresh. |
| 135 | `client/src/redux/app/authClient.js` | `client/src/redux/app/authClient.js` — single-flight refresh token mutex utility. |
| 136 | `client/src/redux/app/store.js` | `client/src/redux/app/store.js` — Redux store configuration. |
| 137 | `client/src/redux/features/authSlice.js` | `client/src/redux/features/authSlice.js` — auth state slice (user, isAuthenticated, loading). |
| 138 | `client/src/redux/features/branchSlice.js` | `client/src/redux/features/branchSlice.js` — branch API endpoints & tags. |
| 139 | `client/src/redux/features/chatSlice.js` | `client/src/redux/features/chatSlice.js` — thread list & history cache (strictly isolated from live streaming). |
| 140 | `client/src/redux/features/dashboardSlice.js` | `client/src/redux/features/dashboardSlice.js` — dashboard query endpoints. |
| 141 | `client/src/redux/features/reportSlice.js` | `client/src/redux/features/reportSlice.js` — report API endpoints & tags. |
| 142 | `client/src/redux/features/sttSlice.js` | `client/src/redux/features/sttSlice.js` — speech-to-text API state. |
| 143 | `client/src/redux/features/userSlice.js` | `client/src/redux/features/userSlice.js` — user profile, preferences, and directives API. |
| 144 | `client/src/routes/ProtectedRoute.jsx` | `client/src/routes/ProtectedRoute.jsx` — route guard checking authenticated session. |
| 145 | `client/src/routes/PublicRoute.jsx` | `client/src/routes/PublicRoute.jsx` — route guard redirecting authenticated users away from login. |
| 146 | `client/src/utils/AdapterEthiopianDayjs.js` | `client/src/utils/AdapterEthiopianDayjs.js` — Ethiopian calendar adapter for MUI DatePickers. |
| 147 | `client/src/utils/addisAudioPlayer.js` | `client/src/utils/addisAudioPlayer.js` — browser audio playback utility with cleanup. |
| 148 | `client/src/utils/attachmentRegistry.js` | `client/src/utils/attachmentRegistry.js` — client upload queue & asset reference store. |
| 149 | `client/src/utils/avatarUtils.js` | `client/src/utils/avatarUtils.js` — avatar initials and color generator. |
| 150 | `client/src/utils/constants.js` | `client/src/utils/constants.js` — shared frontend constants and route paths. |
| 151 | `client/src/utils/ethiopianCalendar.js` | `client/src/utils/ethiopianCalendar.js` — Ethiopian calendar date math & Amharic month names. |
| 152 | `client/src/utils/imageOptimizer.js` | `client/src/utils/imageOptimizer.js` — canvas-based client-side image downscaling. |
| 153 | `client/src/utils/validateChatAttachment.js` | `client/src/utils/validateChatAttachment.js` — client preflight checks for file size and MIME type. |

### 17.1A Mandatory complete source-section examination before disposition

For each of the 214 source sections, the implementation agent must read the entire corresponding section in the supplied Markdown export. Do not rely on an upload preview, search snippet, partial context window, or generated inventory alone. When a source section is longer than one retrieval window, continue reading from the provided continuation cursor/range until the closing code fence and next section separator are reached.

Before changing or replacing a source section, record in `docs/implementation/source-disposition.md`:

1. Exact source section path and source-export line range.
2. File type and full code-fence/content completeness status.
3. Imports/dependencies and every exported symbol.
4. Every function, class, hook, component, route, model, schema, validation chain, middleware, constant, job, integration, event type or static asset included.
5. Inputs, outputs, side effects, persistent records touched, owner scope and external services called.
6. Frontend/backend contracts and any shared assumptions.
7. User-visible behavior and relevant acceptance/edge cases.
8. Defects, security risks, duplicate logic, unused code, hidden coupling and unresolved assumptions found in the source.
9. V1 disposition (`keep`, `rewrite`, `split`, `merge`, `replace`, `remove`, `conditional`, or `defer`) and the rationale.
10. Exact V1 target file(s), requirement IDs, tests and phase/task that will preserve or intentionally retire the behavior.

A source section is not “covered” merely because its filename appears in the table. Every export/function/UI behavior that can affect product behavior must either be mapped to V1 or explicitly recorded as removed/deferred with an owner-approved rationale. Binary/font/image assets require a metadata/license/rendering review rather than a source-code symbol list. The agent must not copy an entire file and later claim it was re-engineered; it must show the mapped behavior and the new architecture boundary.

### 17.1 Rules for the file inventory

- The target paths are architectural destinations, not a requirement to copy old source. Read each source file section in full when implementing its related phase.
- Mark each source entry as `implemented`, `merged`, `split`, `replaced`, `removed`, or `deferred` in `docs/implementation/source-disposition.md` with links to V1 tests and target files.
- For every item marked removed/deferred, list its user-visible behavior and the reason; verify whether that capability is preserved elsewhere.
- Static assets must be checked for copyright/license, attribution, file size, format and use before reusing. Do not copy font binaries unless their license permits the intended redistribution.
- Do not create artificial files just to match the source count. V1 may have more or fewer files after proper modularization.
- Directory restructuring is allowed only when traceability remains complete and relevant tests pass.

---

## 18. Phased implementation roadmap

Implementation is incremental, reviewable, end-to-end, and browser-observable. Every phase delivers a vertically integrated slice that can be verified immediately from the web browser (`http://localhost:3000`) by running `npm run dev`.

The roadmap sequence follows:
$$\text{Foundation} \longrightarrow \text{Models (Schemas)} \longrightarrow \text{Auth \& Shell Navigation} \longrightarrow \text{Agent \& Chat} \longrightarrow \text{Assets} \longrightarrow \text{Tools \& HITL} \longrightarrow \text{Audio} \longrightarrow \text{Operations} \longrightarrow \text{Workspace} \longrightarrow \text{Connectors} \longrightarrow \text{Hardening}$$

```mermaid
flowchart TD
    P1["Phase 1: Full-Stack Foundation & Quality System"] --> P2["Phase 2: Database Models & Schemas (Entire Codebase)"]
    P2 --> P3["Phase 3: Auth, Sessions, Full Profile & Page Shell Navigation"]
    P3 --> P4["Phase 4: Agent & Core Chat (Streaming SSE, Canvas UI)"]
    P4 --> P5["Phase 5: Assets, Files & Ingestion (Private Storage, Uploads)"]
    P5 --> P6["Phase 6: Agent Tools & HITL Approvals (Timeline, Approval Cards)"]
    P6 --> P7["Phase 7: Audio, Voice & Speech (Recorder HUD, Live STT, TTS)"]
    P7 --> P8["Phase 8: Operations Capabilities (Branches, Reports, Amharic Dossier)"]
    P8 --> P9["Phase 9: Personal Workspace (Projects, Tasks, Reminders, Memory)"]
    P9 --> P10["Phase 10: External Connectors (Google Drive & Telegram)"]
    P10 --> P11["Phase 11: Production Polish, Security Hardening & Release"]
```

### Phase 1 — Full-Stack Foundation & Engineering Quality System

- **Purpose:** Establish the single monorepo workspace foundation with both backend and client running, verified database connection, theme mounting, and health checks.
- **Backend Deliverables:**
  - `backend/src/server.js`, `app.js`, `config/env.js`, `config/db.js`, `config/logger.js`.
  - Health check endpoint: `GET /api/v1/health` returning system and MongoDB readiness status.
  - Native scripts: `npm run dev:backend`, `npm run verify --workspace=backend`.
- **Frontend Deliverables:**
  - `client/src/main.jsx`, `App.jsx`, `theme/AppTheme.jsx` mounting MUI CssBaseline and theme primitives.
  - Basic application shell foundation.
  - Native scripts: `npm run dev:client`, `npm run build`.
- **Browser Observation & Verification:**
  - Run root command: `npm run dev`.
  - Open browser at `http://localhost:3000`.
  - **Verify visually:** The application loads instantly with dark/light theme background and displays the Operon application shell.

### Phase 2 — Database Models & Schemas (Entire Codebase)

- **Purpose:** Define and establish all Mongoose schemas and models required across the entire codebase before introducing domain logic.
- **Backend Deliverables:**
  - `backend/src/config/schemaOptions.js` defining timestamps, transformation, and safe JSON serialization.
  - Complete codebase schemas in `backend/src/models/`:
    - `User.js` — User profile, encrypted credentials, preferences, directives.
    - `Branch.js` — Branch identity, location, contact, metadata, archival status.
    - `Report.js` — Operational audit reports, date index, visits, activities, issues, comments.
    - `Chat.js` — Conversations, threads, turns, messages, and streaming event markers.
    - `Audio.js` — Audio assets, metadata, transcription records.
    - Additional models (e.g., Project, Task, Memory) defined or prepared as TBD.
  - Index definitions: unique indexes, compound date/owner indexes, text search indexes.
  - Backend schema verification test in `backend/scripts/tests/` asserting all schemas compile, validate constraints, and connect cleanly to MongoDB.
- **Browser / Execution Verification:**
  - Run automated schema test suite: asserts MongoDB connection and schema validation against the configured Atlas database.
  - Backend starts up with all models registered and indexes synced without error.

### Phase 3 — Auth, Sessions, Full Profile & Page Shell Navigation

- **Purpose:** Deliver complete user identity, authentication, session persistence, a full Profile page, and themed placeholder shells for all application routes so the user can navigate page-to-page in the browser.
- **Backend Deliverables:**
  - Authentication routes and controller: `authRoutes.js`, `authController.js`, `authService.js`.
  - JWT access/refresh token rotation with secure httpOnly cookies.
  - Auth middleware (`authMiddleware.js`) and user profile endpoints (`userRoutes.js`, `userController.js`).
- **Frontend Deliverables:**
  - `Login.jsx` and `Register.jsx` pages with complete validation and feedback.
  - Route guards: `ProtectedRoute.jsx` and `PublicRoute.jsx`.
  - App navigation shell: `AppShell.jsx`, `MuiSidebar.jsx`, `AvatarMenu.jsx`, `ThemeToggle.jsx`.
  - **Full Profile page (`Profile.jsx`)** with tabs: Account, Security, AI Configuration, Directives, Danger Zone.
  - **Themed placeholder shells for ALL application pages** with clear titles, breadcrumbs, and layout frames:
    - `Landing.jsx`
    - `Chat.jsx` (placeholder canvas)
    - `Dashboard.jsx` (placeholder metrics deck)
    - `Branches.jsx` (placeholder branch directory)
    - `BranchDetail.jsx` (placeholder branch detail)
    - `Reports.jsx` (placeholder report ledger)
    - `ReportDetail.jsx` (placeholder report view)
    - `ReportEdit.jsx` (placeholder report editor)
    - `NotFound.jsx` (404 error page)
- **Browser Observation & Verification:**
  - Open `http://localhost:3000`. Unauthenticated request redirects smoothly to `/login`.
  - Register an account -> user is authenticated and redirected to `/dashboard`.
  - Refresh the page (`F5`): session persists seamlessly with zero auth flicker.
  - **Page-to-Page Navigation Test:** Click every link in the sidebar and top navigation:
    - Click **Chat** -> navigates to `/chat` with styled workspace frame.
    - Click **Dashboard** -> navigates to `/dashboard` with styled KPI cards.
    - Click **Branches** -> navigates to `/branches` with styled directory frame.
    - Click **Reports** -> navigates to `/reports` with styled ledger frame.
    - Click **Profile** -> opens the full Profile page; switch between Account, Security, and Configuration tabs.
    - Click **Logout** in Avatar menu -> terminates session and returns cleanly to `/login`.

### Phase 4 — Agent & Core Chat (Streaming SSE & Canvas UI)

- **Purpose:** Deliver the conversational AI partner experience with real-time SSE streaming.
- **Backend Deliverables:**
  - Model provider abstraction in `backend/src/providers/` (model-agnostic, supporting Gemini and Addis AI, specific models TBD).
  - LangChain agent integration in `backend/src/agent/`.
  - SSE chat streaming route & controller: `POST /api/v1/chat`.
- **Frontend Deliverables:**
  - Full Chat page (`Chat.jsx`) with message list (`MuiChatMessageListContent.jsx`) and composer (`MuiComposerInput.jsx`).
  - Send/Stop button state machine (`MuiSendButton.jsx`).
  - Assistant message (`MuiAgentMessage.jsx`) with streaming Markdown rendering.
  - Thread list in sidebar (`MuiRecentChat.jsx`) managed cleanly by `chatSlice.js` (isolated from live streaming state).
- **Browser Observation & Verification:**
  - Open `http://localhost:3000/chat`.
  - Type a prompt in the composer and press Enter.
  - **Verify visually:** User bubble renders immediately. Send button switches to a red Stop button. Assistant message streams word-by-word with auto-scroll. Clicking Stop halts streaming cleanly.
  - History persists in sidebar; reloading the page rehydrates the conversation.

### Phase 5 — Assets, Files & Ingestion (Private Storage & Uploads)

- **Purpose:** Enable safe multimodal uploads, private file storage, text extraction, and document Q&A.
- **Backend Deliverables:**
  - Private storage service (`storageService.js`) storing files outside public static directories.
  - Multer upload middleware with MIME sniffing and size quotas.
  - Text extraction pipeline for PDF, DOCX, XLSX, CSV, Markdown, and TXT.
- **Frontend Deliverables:**
  - Attachment button (`MuiAttachButton.jsx`) and staged attachment tray (`MuiComposerTopToolbar.jsx`).
  - Upload progress chips and validation warnings (`validateChatAttachment.js`).
  - Asset reference card (`MuiCloudDocumentCard.jsx`) in chat messages.
- **Browser Observation & Verification:**
  - In chat, click the attachment paperclip icon and select a PDF or text document.
  - **Verify visually:** A staged file chip appears above the composer with file icon, name, and size.
  - Send the document with a prompt: "Summarize this file."
  - **Verify visually:** The file uploads, an asset card renders in the message list, and the assistant responds using the extracted contents.

### Phase 6 — Agent Tools & Human-in-the-Loop (HITL) Approvals

- **Purpose:** Equip the agent with authorized tool execution, observable progress, and explicit human approval cards.
- **Backend Deliverables:**
  - Tool registry with Zod validation in `agent/`.
  - LangGraph interrupt/resume workflow for actions requiring human confirmation.
  - Execution audit log.
- **Frontend Deliverables:**
  - Execution timeline (`MuiAgentExecutionTimeline.jsx`) showing real-time tool invocation steps.
  - Tool execution part (`MuiToolCallPart.jsx`) rendering interactive HITL approval cards with exact parameters and "Approve" / "Reject" buttons.
- **Browser Observation & Verification:**
  - Ask the assistant to perform an action requiring a tool.
  - **Verify visually:** The execution timeline displays active progress ("Invoking Tool...").
  - An approval card renders displaying the exact target and parameters with "Approve" and "Reject" buttons.
  - Click "Approve": the tool executes, and the final answer streams into the assistant message.

### Phase 7 — Audio, Voice & Speech (Recorder HUD, Live STT & TTS)

- **Purpose:** Restore voice interaction with audio recording, live dictation, and speech playback.
- **Backend Deliverables:**
  - Audio chunking and metadata inspection.
  - Remote STT adapter endpoint for transcription.
  - Remote TTS synthesis endpoint.
- **Frontend Deliverables:**
  - Audio recorder component (`MuiAudioRecorder.jsx`) with live audio waveform visualization.
  - Live speech dictation button (`MuiLiveSttButton.jsx`).
  - Audio playback button on assistant messages (`MuiTtsPlayButton.jsx`).
- **Browser Observation & Verification:**
  - Click the microphone button in composer.
  - **Verify visually:** An audio recording overlay appears with live animated audio frequency bars and a timer.
  - Click "Stop & Attach": audio attaches as a voice note.
  - Send the voice note: agent transcribes and responds. Click the speaker icon to play synthesized audio.

### Phase 8 — Operations Capabilities (Branches, Reports & Amharic Dossier)

- **Purpose:** Restore complete multi-branch operations, Ethiopian calendar support, and Amharic reporting.
- **Backend Deliverables:**
  - Branch and Report controllers, routes, and services (`branchController.js`, `reportController.js`, `branchRoutes.js`, `reportRoutes.js`).
  - Ethiopian/Gregorian date conversion utilities and Amharic search transliteration.
- **Frontend Deliverables:**
  - Fully implemented operations pages: `Branches.jsx`, `BranchDetail.jsx`, `Reports.jsx`, `ReportDetail.jsx`, `ReportEdit.jsx`.
  - Component suites for branches (`components/branches/*`) and reports (`components/reports/*`).
  - Ethiopian calendar picker integration (`AdapterEthiopianDayjs.js`).
  - Amharic dossier view (`ReportAmharicDossier.jsx`).
- **Browser Observation & Verification:**
  - Navigate to `/branches`: manage branch directory, create new branches, view metrics.
  - Navigate to `/reports`: create/edit reports using Ethiopian calendar date pickers.
  - Open Report Detail: view formatted Amharic dossier with Ethiopic font rendering.

### Phase 9 — Personal Workspace (Projects, Tasks, Reminders & Memory)

- **Purpose:** Deliver personal productivity tools beyond chat: project workspaces, actionable tasks, and editable agent memories.
- **Backend Deliverables:**
  - Project, Task, and Memory models and routes.
  - Background scheduler (`jobs/`) for reminders and notifications.
- **Frontend Deliverables:**
  - Project switcher in sidebar/header.
  - Task and reminder manager.
  - Memory review and deletion tab in Profile.
- **Browser Observation & Verification:**
  - Create tasks with due dates; verify reminder notifications.
  - Instruct agent to remember personal preferences; review and delete memories in Profile -> Memory tab.

### Phase 10 — External Connectors (Google Drive & Telegram)

- **Purpose:** Connect approved external services with strict authorization and destination previews.
- **Backend Deliverables:**
  - Google Drive OAuth and file sync service (`googleDriveService.js`).
  - Telegram bot delivery service (`telegramService.js`).
- **Frontend Deliverables:**
  - Cloud Integrations tab and Telegram settings tab.
  - Delivery preview and confirmation dialogs.
- **Browser Observation & Verification:**
  - Configure Google Drive and Telegram credentials in settings.
  - Trigger test delivery: verify approval dialog shows destination chat ID and preview before sending.

### Phase 11 — Production Polish, Security Hardening & Release

- **Purpose:** Execute full-system regression, verify security boundaries, and validate production builds.
- **Deliverables:**
  - Automated test runner in `backend/scripts/tests/`.
  - Production build verification (`npm run build`).
  - Security review: IDOR prevention, CSRF protection, credential redaction in logs.
- **Browser Observation & Verification:**
  - Final end-to-end browser walkthrough across all core and operations workflows.

---

## 19. Mandatory implementation protocol: task, review, phase merge

This protocol is derived from the supplied implementation records. It is mandatory and applies to every phase, every task, and any corrective follow-up. The owner review is a real stop, not a notification that the agent may ignore.

### 19.1 Hierarchy

```text
Phase initialization
  ↓
Dedicated phase branch
  ↓
Task analysis → implementation → verification
  ↓
Task walkthrough and user review (STOP)
  ↓
User feedback → root-cause analysis → amendment → re-test → re-review
  ↓
After task approval: exact-file stage + task commit on phase branch
  ↓
Repeat task loop until all phase tasks are approved
  ↓
Full phase integration/regression verification
  ↓
Phase walkthrough and user review (STOP)
  ↓
User feedback → amendments → full re-verification → re-review
  ↓
After explicit phase approval: fast-forward merge to main
  ↓
Verify merge/working tree; close/delete local phase branch only after safe merge
  ↓
Prepare next phase branch and begin next phase
```

Reviews and task commits occur per task. The merge into `main` occurs per phase. Never collapse those gates into one.

### 19.2 Phase initialization / Pre-Git

Before each phase:

1. Read `task_plan.md`, `findings.md`, `progress.md`, this master document, relevant ADRs and current phase status.
2. Inspect `pwd`, `git status --short --branch`, `git branch -vv`, `git log --oneline --decorate -n 15`, remotes, and current branch.
3. Do not discard or overwrite dirty user work. If existing changes are unrelated or their ownership is unclear, stop and ask the owner how to preserve/isolate them.
4. Confirm the correct base branch is `main` and it is clean/up to date. Fetch/pull only if a remote exists and credentials/network access permit; never claim it is updated if not verified.
5. Never commit directly to `main`.
6. Create a dedicated branch named `phase-N-short-description`, for example `phase-1-foundation`. If branch name already exists, inspect it and recover safely; never overwrite it blindly.
7. If the repository is not initialized or no `main` branch exists, report actual state and ask for approval before initializing or creating a new base branch. Do not invent a remote.
8. Record branch, starting commit and working-tree status in `progress.md`.

### 19.3 Task analysis before editing

For each task:

1. Identify exact requirements and acceptance tests.
2. Read the relevant source export section(s) completely, including related modules and frontend/backend contracts.
3. Inspect current V1 code, schemas, interfaces, imports, package versions and tests before edits.
4. Map current behavior, target behavior, dependencies, side effects and failure modes.
5. State a concise implementation plan and identify what must not change.
6. Identify migration needs and backward/data compatibility concerns; do not assume a clean database or empty data unless verified.
7. If a design decision changes a shared architecture contract, write/propose ADR before coding.
8. If unresolved ambiguity affects safety, data destruction, paid use, privacy, or product behavior, ask the owner before implementing. Do not ask about routine technical choices the architect can determine.

### 19.4 Task implementation

1. Implement one coherent task at a time; avoid unrelated cleanup.
2. Respect the approved directory map and root-only package policy.
3. Keep changes minimal but complete across API, service, database, agent, client and test layers required by the task.
4. Do not use TODO placeholders as delivered functionality. Mark deliberate deferrals clearly.
5. Never disable validation/security to make tests pass.
6. Do not introduce package dependencies without the dependency approval process.
7. Update source-disposition and requirement traceability as the implementation evolves.
8. Maintain `task_plan.md`, `findings.md`, and `progress.md` at task boundaries. Do not replace these files with a freshly generated empty plan; preserve history and current status.

### 19.5 Verification before task review

Run only commands that exist in the actual root package scripts and installed environment. If a command is unavailable, do not pretend it ran. Minimum tiered checks:

**Tier A — static and focused:**
- lint/format check where configured;
- `node --check` for applicable JavaScript modules where meaningful;
- unit tests for changed business logic;
- schema, validation and serialization checks;
- no unused imports, unreachable code, secrets or debug residue.

**Tier B — integration and contract:**
- API request/response tests;
- database transaction/ownership tests against a test database with required MongoDB transaction topology;
- provider adapter fixtures and stream protocol fixtures;
- upload/download and document parsing tests;
- job/retry/idempotency/approval tests;
- regression tests for adjacent modules.

**Tier C — app build/runtime:**
- root clean-install or lockfile consistency check when appropriate;
- backend startup/health readiness;
- frontend production build;
- server/browser smoke tests where an actual browser tool or owner-run browser is available;
- console errors, React warnings, unhandled promise rejections and accessibility checks.

**Tier D — visual browser review (UI tasks):**
- verify mobile around 375px wide, tablet around 768px, desktop around 1440px;
- verify forms, dialog focus, keyboard interaction, responsive overflow, scrolling and real click behavior;
- verify loading, empty, error, stopped, approval and success states;
- inspect browser console and network failures.

Do not mandate artificial “0 warnings” where a third-party package emits an unavoidable warning; identify its source and decide if it blocks the phase. App-owned errors/warnings must be fixed or explicitly explained.

The implementation agent may run automated/browser tests only when the relevant execution tools truly exist. If the older implementation notes reserve particular browser checks for the owner, keep that allocation: present the exact steps and wait for owner validation. Never fabricate browser evidence.

### 19.6 Task walkthrough and review gate

After the task is implemented and validated, STOP and present:

1. Task ID/title and requirement IDs addressed.
2. Summary of behavior changed and what remains unchanged.
3. Exact files created, edited, moved, split, removed, and why.
4. Important design/logic decisions and any ADR.
5. Database schema/index/migration impact.
6. API/provider/stream/tool contract changes.
7. Security, privacy, cost and permission implications.
8. Commands actually executed and exact results (include exit codes and counts); distinguish not run/unavailable.
9. Relevant screenshots/browser evidence or exact manual verification steps.
10. Remaining defects, risks, known limitations and deferred items.
11. Git status and current branch/diff summary; do not stage or commit yet unless the owner already explicitly authorized that task's commit.
12. Ask the owner to review the task and state whether the task is accepted or needs changes.

Do not start the next task while the review gate is open. Do not make a change based on silence. Do not interpret casual feedback as permission to commit/merge unless it clearly approves that stage.

### 19.7 Handling owner review feedback

For every user comment:

1. Repeat the issue accurately and identify the affected requirement/invariant.
2. Analyze from first principles across affected frontend, backend, database, provider, agent, and connector paths.
3. Classify as defect, intended behavior, requirement ambiguity, or enhancement; support the classification with code/tests/contracts.
4. If defect: find root cause, not just symptom. Propose a complete fix and regression tests.
5. If not a defect: explain the evidence and consequences respectfully; do not dismiss the owner's observation.
6. If an ambiguity or product choice: present concise options and consequences and ask for that decision.
7. Implement only the accepted correction or an unambiguous correction within the approved task scope.
8. Re-run relevant tests and affected regressions. Re-present the result and wait again.

The owner review may result in changes. The implementation agent must not treat a review comment as permission to rewrite unrelated modules.

### 19.8 Task commit gate

Only after explicit task acceptance:

1. Inspect `git diff` and `git status` again.
2. Stage only the exact reviewed task files. Do not use blind `git add .`.
3. Review staged diff and secret scan.
4. Create one or more conventional commits with scope/task reference, e.g. `feat(conversation): add durable message persistence (Task 4.2)`.
5. Record commit hash and verification evidence in `progress.md`.
6. Do not push merely because a remote exists. Push only when owner has authorized remote updates and credentials are available.
7. Proceed to the next task only after the accepted task is committed or the owner explicitly directs a different Git handling path.

### 19.9 Phase completion and phase review gate

When every task in a phase is implemented, reviewed and committed:

1. Run full phase-level regression, integration tests, production build, migration/index checks, and applicable security tests.
2. Verify acceptance criteria for every task and every P0 requirement assigned to that phase.
3. Verify no untracked generated artifacts, secrets, temp files or unreviewed modifications exist.
4. Update traceability and source disposition.
5. Update `task_plan.md`, `findings.md`, and `progress.md` with completed work, test evidence, known issues, branch/commit summary, and the next phase proposal.
6. Prepare a phase walkthrough that includes the same evidence as the task walkthrough plus complete phase diff, migrations, deployment/config changes and rollback plan.
7. STOP and ask the owner to review the entire phase.
8. If the owner requests changes, remain on the same phase branch, perform root-cause analysis, amend, re-test the full affected regression set, and ask for re-review.
9. Do not merge until the owner explicitly approves the phase and merge.

### 19.10 Post-review merge and branch closure

After explicit approval:

1. Confirm the working tree is clean and all phase commits are present on the dedicated branch.
2. Confirm base `main` has not moved unexpectedly. If it has moved, stop and reconcile with the owner; do not force-reset/rebase automatically.
3. Prefer a fast-forward merge when valid. If not possible, report the divergence and ask for a safe merge strategy; no force push.
4. Run the post-merge smoke/regression verification on `main`.
5. Push `main` only when the owner authorized it and remote access is configured.
6. Delete the local phase branch only after the merge is verified and owner authorized branch closure. Do not delete an unmerged or unverified branch. Delete remote branch only with explicit authorization.
7. Verify `main` working tree clean, record merge commit/target commit and branch cleanup result.
8. Only then prepare the next phase's dedicated branch.

### 19.11 Git safety prohibitions

Unless the owner gives explicit instruction after being informed of the consequence, never run:

- `git reset --hard`;
- `git clean -fd` or similarly destructive clean operations;
- `git checkout -- <file>` to discard user changes;
- force push;
- branch deletion before verified merge;
- automatic rebase/merge that might rewrite or destroy user work;
- package lockfile regeneration without review of the dependency changes.

### 19.12 Review language / stop condition

A review report must end with a direct request for review, for example:

> “Task 4.2 is implemented and verified on `phase-4-conversations`. No files have been staged or committed. Please review the walkthrough and tell me whether to amend it or approve the task so I can commit it and continue.”

At phase level:

> “Phase 4 is complete on `phase-4-conversations`, with the listed verification evidence. It has not been merged. Please review and explicitly approve or request changes. I will merge/close the branch and prepare the next phase only after your approval.”

This is a hard execution stop, not a soft reminder.

---



---

## 20. Integrated user scenarios and acceptance suite

The platform behavior is specified across 28 acceptance scenarios (Scenarios A through AB). These scenarios define verification coverage; they are not evidence that implementation or testing has already passed. They are retained as acceptance intent and must be executed by the relevant phase. Any scenario involving a P1 modality is conditional on that modality passing independent remote-provider qualification and language tests. A failed P1 qualification must not be hidden or replaced with local inference or a paid fallback.

### Scenario A: Acoustic Audio Understanding (Speech vs Ambient Audio) & Streaming
- **User Intent**: User uploads an audio recording containing acoustic instrumental sounds and background cafe ambient noise, asking what is heard.
- **System Behavior**: The application first stores the uploaded audio as a conversation attachment. The original binary is transmitted to a remote provider only when the user has consented to the applicable provider disclosure and a qualified P1 acoustic-analysis service is enabled. The assistant streams its response incrementally via Server-Sent Events or WebSocket (`FR-CORE-CONV-001`). When the service is enabled, the assistant provides a cautious description of observable sound characteristics and background environmental noise, communicates uncertainty, and does not identify a specific instrument, song, or artist. If no qualified service is enabled or the user declines provider consent, the application explains that acoustic analysis is unavailable; file upload and retention remain available. It does not invent spoken dialogue or claim unverified instrument/artist identification.
- **Acceptance Verification**: Tested against `FR-CORE-MEDIA-001`, `FR-CORE-MEDIA-002`, `FR-CORE-CONV-001`. Modality output reflects acoustic reality with explicit epistemic uncertainty, incremental token streaming is visually verified, and no invented dialogue is observed in the tested benchmark samples.

### Scenario B: Multi-Document Contract Analysis & Grounded Citations
- **User Intent**: User uploads two PDF commercial lease agreements and asks for a comparative indemnification clause review.
- **System Behavior**: For digitally readable PDFs, extracts text and sections using the document-ingestion pipeline. Where scanned pages or visual layouts require the P1 remote visual-understanding service, that service must first pass its provider and language qualification gate, and the user must have consented to the exact data categories transmitted to that provider. It identifies indemnification clauses, compares liability caps, formats a table with page citations, and flags missing mutual liability protections without claiming unsupported OCR accuracy.
- **Acceptance Verification**: Tested against `FR-CORE-ASST-003`, `FR-CORE-MEDIA-006`, `FR-CORE-DOC-001`, `FR-CORE-RES-001`. The test set includes one digitally generated contract and one scanned contract PDF. Native-text extraction and the separately qualified visual-understanding path are tested independently. Output contains verifiable page/section citations, and claims are checked against the source PDFs.

### Scenario C: Professional Correspondence & Standing Directive Precedence
- **User Intent**: User requests drafting an executive letter to a business partner while standing directives mandate concise, bulleted communication.
- **System Behavior**: Applies persistent directives (`FR-CORE-MEM-001`) to format draft with executive clarity. In the current prompt, user explicitly requests a full narrative paragraph; the system applies Tier 4 precedence, allowing the current prompt to override the standing directive for that turn without corrupting the stored profile schema.
- **Acceptance Verification**: Tested against `FR-CORE-ASST-001`, `FR-CORE-MEM-001`, `FR-CORE-BIZ-001`. Confirms Tier 4 overriding Tier 5 directive without corrupting saved profile.

### Scenario D: Multi-Document Spreadsheet Synthesis & Deterministic Calculation
- **User Intent**: User provides three CSV sales files and requests a consolidated quarterly revenue workbook.
- **System Behavior**: Deterministically calculates quarterly totals, category breakdowns, and growth percentages using a computational formula script. Generates a multi-sheet XLSX file with formulas and provides an immediate download link.
- **Acceptance Verification**: Tested against `FR-CORE-MEDIA-001`, `FR-CORE-DOC-001`, `FR-CORE-DOC-002`, `FR-CORE-DATA-001`, `FR-CORE-AGENT-001`. Generated workbook opens cleanly; formula calculations match deterministic script output.

### Scenario E: Voice Dictation, Multilingual TTS & Task Extraction with Ambiguity Confirmation
- **User Intent**: User dictates an operational follow-up memo in Amharic with noisy background, verifies the transcribed text, requests audio playback, and extracts an action item.
- **System Behavior**: Dictation and speech synthesis execute conditionally based on verified language-specific qualification gates (`FR-CORE-MEDIA-003`, `FR-CORE-MEDIA-004`, `FR-CORE-MEDIA-005`). When qualified and after the user has consented to the applicable speech-provider disclosure, the system streams recognized Amharic Fidel text into the composer. Agent detects an embedded action item (*"review lease terms with landlord next Tuesday"*), prompts the user to resolve ambiguous timing (*"Tuesday, Nov 10 at 10 AM, in the saved timezone"*), converts the confirmed time to a stored UTC timestamp, and provides a one-click confirmation to save the extracted task (`FR-CORE-TASK-001`, `FR-CORE-TASK-002`). Synthesizes Amharic speech playback via qualified remote TTS upon clicking "Listen" only when the Amharic TTS P1 gate has passed; otherwise, the unavailable language option is not advertised and the feature remains deferred.
- **Acceptance Verification**: Tested against `FR-CORE-ASST-002`, `FR-CORE-MEDIA-003`, `FR-CORE-MEDIA-004`, `FR-CORE-MEDIA-005`, `FR-CORE-TASK-001`, `FR-CORE-TASK-002`. Where the P1 speech and TTS services have passed their separate no-card/no-subscription language gates, Amharic text and speech are evaluated against the approved benchmarks. The action item is extracted and confirmed; the ambiguous deadline is resolved in the saved timezone and stored as UTC before saving. Failure of a P1 modality defers that feature and does not block the initial P0 core launch.

### Scenario F: Grounded Web Research with Observable Progress & Verified Citations
- **User Intent**: User asks for recent regulatory updates regarding renewable energy tariffs.
- **System Behavior**: Displays distinct visual progress indicators (`FR-CORE-CONV-004`) during multi-step execution: *Formulating Search Queries*, *Searching Documents*, and *Synthesizing Results*. Before sending user-derived queries to the configured search service, the system displays the provider and data disclosure and obtains the required consent under `FR-CORE-SEC-007`. If no free qualified search service is available, it explains that live search is unavailable rather than invoking a paid endpoint. After consent, it queries the web research connector, retrieves sources, synthesizes key changes, and attaches verifiable source links. Explicitly states where information is pending official publication.
- **Acceptance Verification**: Tested against `FR-CORE-CONV-004`, `FR-CORE-RES-002`, and `FR-CORE-SEC-007`. Visual progress transitions, dated free-search-provider qualification, pre-transmission consent, and relevant source citations are verified.

### Scenario G: Google Drive Action with Exact-Parameter Authorization & Tool Recovery
- **User Intent**: User instructs agent to save an executive summary PDF to a specific Google Drive folder.
- **System Behavior**: Displays observable progress state *Preparing Document Upload* (`FR-CORE-CONV-004`). Before executing external mutation, pauses execution and renders an exact-parameter authorization card (`FR-CORE-AGENT-002`) displaying: Target Service (Google Drive), Destination Folder (`/Corporate/Summaries`), File Name (`Q3_Summary.pdf`), File Size (245 KB), and a one-time approval button. The action approval is strictly decoupled from provider cost authorization. Upon user click, validates single-use nonce, verifies authorized OAuth token, uploads file, and checkpoints execution state.
- **Acceptance Verification**: Tested against `FR-CORE-CONV-004`, `FR-CORE-AGENT-001`, `FR-CORE-AGENT-002`, `FR-CORE-INT-001`. Exact parameters are visible prior to authorization; file appears in target destination; zero unauthorized folders accessed.

### Scenario H: Stop, In-Place Edit, and Explicit Conversation Branching
- **User Intent**: User prompts agent for a complex code refactoring, stops generation midway, edits prompt to add a constraint, and resubmits.
- **System Behavior**: Immediately halts remote inference upon Stop. Upon edit submission, creates a user-visible branch fork (Branch 2 of 2), preserving previous turns, and streams fresh response incorporating new constraint.
- **Acceptance Verification**: Tested against `FR-CORE-CONV-001`, `FR-CORE-CONV-002`. Remote inference cancelled; database reflects consistent conversation branch history.

### Scenario I: Mid-Conversation Model Switching Between Turns
- **User Intent**: User uses a lightweight model for initial brainstorming, then switches to a high-capacity remote reasoning model for complex architectural analysis in the same thread.
- **System Behavior**: Accepts model switch for Turn 2. Incorporates Turn 1 context into prompt, routes request to newly selected remote model, and records model metadata in turn record.
- **Acceptance Verification**: Tested against `FR-CORE-CONV-003`. Turn 1 tagged with Model A; Turn 2 tagged with Model B; conversational context preserved.

### Scenario J: Isolated Restaurant Operational Inspection Audit (Optional Domain Module)
- **User Intent**: The individual account owner creates or updates a branch profile, conducts an inspection at that branch as part of a multi-branch visit, records the inspection date in the Ethiopian calendar, attaches photo and voice-note evidence to checklist items, assigns a corrective action to a named employee contact, reviews the report, and requests that the finalized report be shared with an authorized recipient.
- **System Behavior**: The module creates or updates the branch record without creating application accounts for listed staff contacts. The inspector records checklist results, scores, notes, timestamps, and the visit order across branches. The Ethiopian date is converted and displayed with its Gregorian equivalent. Failed checklist items create severity-tagged issues assigned to named staff contacts, and outstanding issues appear on later visits. Photos and voice notes are attached to the relevant checklist items or issues; voice recordings are stored as evidence even when no qualified speech-processing service is enabled. The report viewer displays scores, findings, outstanding issues, dates, and associated evidence. The user edits the draft before finalization, exports PDF/DOCX and an XLSX audit summary, then requests external sharing. The system displays the exact recipient, channel, file, and message in an authorization card and dispatches only after approval.
- **Acceptance Verification**: Tested against `FR-CORE-ASST-002`, `FR-CORE-DOC-002`, `FR-DOM-REST-001`, `FR-DOM-REST-002`, `FR-DOM-REST-003`, `FR-DOM-REST-004`, `FR-DOM-REST-005`, `FR-DOM-REST-006`, `FR-DOM-REST-007`, and `FR-DOM-REST-008`. Validates branch CRUD, checklist scoring, multi-branch visit grouping, issue lifecycle, Ethiopian/Gregorian conversion, bilingual Fidel rendering, item-level media association, report editing and all required exports, and exact-parameter approval before external sharing. Staff contacts receive no application accounts. This optional module's successful operation does not make it a dependency of core platform functionality.
### Scenario K: Secure Google SSO Account Linking
- **User Intent**: Existing user with local password-authenticated account signs in using Google SSO with the same email address.
- **System Behavior**: Detects email collision. Refuses automatic linking. Requires user to authenticate with their existing local password first. Upon validation, safely associates Google identity claim with user profile.
- **Acceptance Verification**: Tested against `FR-CORE-SEC-005`, `FR-CORE-SEC-006`. Prevents pre-authentication account takeover; confirms safe identity linking.

### Scenario L: Cross-Account Data Access Denial (Account Isolation & Enumeration Defense)
- **User Intent**: Malicious client issues API request attempting to fetch conversation history or file metadata belonging to another user ID.
- **System Behavior**: Authentication middleware validates session. Query layer enforces `userId = authenticatedUserId`. Request is rejected with a uniform **HTTP 404 Not Found** response—identical to the response for a nonexistent resource ID. Response body contains zero metadata, ownership clues, or resource existence confirmations. Security audit event is logged.
- **Acceptance Verification**: Tested against `FR-CORE-SEC-001`, `FR-CORE-SEC-005`. Uniform HTTP 404 returned for nonexistent and unauthorized resources; zero cross-account information leakage.

### Scenario M: Attachment Continuity Across Turns with Diarization Limitation Notice & Asset Lifecycle
- **User Intent**: User uploads an audio recording in Turn 1 and asks for a transcript. In Turn 3, user asks: *"Who was the second speaker mentioned in that recording?"* Later, temporary retention period expires.
- **System Behavior**: Resolves reference to the Turn 1 audio attachment (`FR-CORE-CONV-006`). If the qualified remote STT service did not perform speaker diarization, the agent explicitly states: *"The transcript does not contain verified speaker diarization data, so I cannot confirm the identity of the second speaker."* It does not invent speaker identities. In addition, when the temporary audio upload buffer reaches its retention expiry (`FR-CORE-DOC-003`), background maintenance safely purges the binary audio file while retaining the derived transcript text for ongoing conversational reasoning.
- **Acceptance Verification**: Tested against `FR-CORE-CONV-006`, `FR-CORE-DOC-003`, `FR-CORE-MEDIA-003`. Attachment association persists across turns; agent communicates provider modality limits honestly; asset lifecycle reconciles temporary binaries while preserving derived text.

### Scenario N: Action-Specific Authorization Gate for Destructive Operation
- **User Intent**: User asks agent to delete a stored file.
- **System Behavior**: Agent formats exact-parameter authorization card specifying: Target Resource Name, Size, Permanent Deletion Warning. Execution paused. Resumes only upon explicit user button click.
- **Acceptance Verification**: Tested against `FR-CORE-AGENT-002`. Typing generic text does not execute deletion; only cryptographic authorization card submission triggers operation.

### Scenario O: Account Export, Data Purge & Background Asset Sweeper
- **User Intent**: User requests a full data export, followed by account deletion.
- **System Behavior**: Generates downloadable ZIP archive containing all user conversations, attachments, memories, directives, projects, tasks, preferences, provider configurations, nonsecret credential metadata, and domain records (`FR-CORE-SEC-003`). Plaintext secrets (API keys, passwords, tokens) are strictly excluded from the export. After recent reauthentication and final confirmation, purges primary database records, vector/search indexes, caches, stored files, active sessions, queued jobs, scheduled reminders, domain records, and locally stored BYOK/integration credentials. Attempts remote OAuth revocation; an unavailable provider leaves the local token disabled and shows a revocation-pending notice. External Drive files are not deleted. Informs the user that protected database backup snapshots will expire and be purged according to the documented retention schedule. Background sweeper cleans active upload temp buffers (`FR-CORE-DOC-003`, `FR-CORE-SEC-004`).
- **Acceptance Verification**: Tested against `FR-CORE-DOC-003`, `FR-CORE-SEC-003`, `FR-CORE-SEC-004`. Zero plaintext secrets in export archive; zero residual user records in primary database and filesystem post-purge.

### Scenario P: Remote Model Provider Configuration, Free Quota Exhaustion & No Silent Paid Fallback
- **User Intent**: The user configures a qualified free hosted model provider. During a high-volume session, the provider quota is exhausted.
- **System Behavior**:
  1. Provider qualification is verified against a dated audit record confirming no credit card or paid subscription was required for account registration.
  2. The application verifies network connectivity, valid authentication, and exposed rate-limit headers at runtime.
  3. The interface displays active provider, model, observed request counts, and authoritative remaining quota (or clearly marks quota unexposed).
  4. When the provider returns a quota exhaustion error (HTTP 429), the application halts generation and alerts the user cleanly.
  5. The application offers another configured eligible free provider where available.
  6. The application strictly refuses to fall back silently to any configured paid BYOK key or commercial provider.
- **Acceptance Verification**: Tested against `FR-CORE-MODEL-001` and `FR-CORE-CONV-001`. Dated qualification audit verified; runtime connectivity validated; simulated quota exhaustion triggers clean user notification; zero silent paid fallback occurs.

### Scenario Q: Conversation History Full-Text Search and Cursor Pagination
- **User Intent**: User searches for a conversation discussing *"quarterly lease review"* among 200 historical conversation sessions.
- **System Behavior**: Executes indexed full-text query matching conversation titles and message contents. Loads results with cursor-based pagination. Clicking a match loads the thread and navigates to the exact message turn.
- **Acceptance Verification**: Tested against `FR-CORE-CONV-005`. Validates full-text search accuracy and pagination performance.

### Scenario R: Conversational Directive Modification
- **User Intent**: User says: *"From now on, always summarize financial data in bullet points before showing tables."*
- **System Behavior**: Agent detects directive modification intent, parses the rule change, asks confirmation, and updates the user's standing profile schema. Confirms update to user; subsequent turns adhere to the updated rule.
- **Acceptance Verification**: Tested against `FR-CORE-MEM-002`. Confirms directive extraction, schema persistence, and immediate application.

### Scenario S: Cross-Session Episodic Memory Recall and Sovereign Memory Deletion with Cache Invalidation
- **User Intent**: User recalls a project fact stored in episodic memory from a previous session, then requests deleting that memory.
- **System Behavior**: Retrieves episodic memory with provenance citation. User navigates to Memory Governance UI and clicks Delete on that memory record. System immediately purges the record and invalidates active retrieval caches and vector index entries.
- **Acceptance Verification**: Tested against `FR-CORE-MEM-003`, `FR-CORE-MEM-004`. Memory recall verified with provenance; post-deletion query confirms memory is completely unretrievable.

### Scenario T: Project Workspace Context Isolation
- **User Intent**: User operates within Project Alpha and asks a question about project documents, while Project Beta contains unrelated confidential files.
- **System Behavior**: Queries are strictly filtered by `projectId = ProjectAlpha`. Content, files, and notes from Project Beta are excluded from semantic retrieval and tool context. Global user directives are preserved.
- **Acceptance Verification**: Tested against `FR-CORE-PROJ-001`. Confirms zero context leakage between distinct project workspaces.

### Scenario U: Protected BYOK Credential Storage with Authenticated Envelope Encryption
- **User Intent**: User configures an optional commercial model API key for specialized tasks.
- **System Behavior**: Encrypts API key using AES-256-GCM envelope encryption with a unique 96-bit nonce, application-level DEK protected by an external KEK, and AAD bound to user ID and credential ID (`FR-CORE-SEC-002`). Decrypts key strictly in volatile memory only when executing authorized requests. Client API responses, database records, and logs show masked placeholders (`sk-...xxxx`). Backups contain only ciphertext.
- **Acceptance Verification**: Tested against `FR-CORE-SEC-002`. Validates authenticated envelope encryption at rest, DEK/KEK separation, AAD binding, unique nonces, memory-only decryption, and zero plaintext in logs or database records.

### Scenario V: Remote Provider Data Transparency, Data Category Disclosure and Consent Lifecycle
- **User Intent**: User uploads a legal agreement for analysis while using a free remote model provider whose terms state user inputs may be used for service improvement.
- **System Behavior**: Before first transmission, displays provider name, model, plan/policy identifier, verified data-handling terms, and the exact transmitted data categories (prompt text, history excerpts, document OCR text, and any attachment data actually sent). Presents a distinct warning regarding provider training or service-improvement use. The user declines and switches to an alternative eligible provider; before that provider receives content, the system presents its own disclosure and obtains separate consent. The consent record is bound to the user, provider, plan/policy version, and disclosure version. A simulated material policy change forces reconfirmation before the next transmission. The user then revokes consent for future transmissions, and the next request is blocked until new consent is recorded (`FR-CORE-SEC-007`).
- **Acceptance Verification**: Tested against `FR-CORE-SEC-007`. Validates complete consent lifecycle: pre-transmission disclosure, training warning, data category enumeration, user ability to decline, and zero data leakage.

### Scenario W: Scheduled Reminder Notification Delivery, Channel Failure and Retry
- **User Intent**: User approves a scheduled reminder notification for 9:00 AM to an external messaging channel.
- **System Behavior**: The action approval cryptographically binds recipient, channel, message content, and recurrence schedule (`FR-CORE-AGENT-002`, `FR-CORE-PRO-001`). At 9:00 AM, system triggers in-app notification and attempts external dispatch. External network fails temporarily. System logs delivery failure, queues retry with exponential backoff. For external delivery, it retries only when a provider idempotency key is supported or a delivery-status check confirms the prior attempt did not succeed; uncertain outcomes are reconciled or surfaced for review rather than blindly resent. A subsequent request to change the recipient triggers a new authorization requirement.
- **Acceptance Verification**: Tested against `FR-CORE-TASK-002`, `FR-CORE-PRO-001`, and `FR-CORE-AGENT-002`. Validates scheduling, user timezone handling, durable retry behavior, external delivery reconciliation, deduplication controls, and authorization invalidation upon parameter alteration.

### Scenario X: Durable Tool Execution Interruption and Restart Recovery
- **User Intent**: Multi-step tool workflow (search -> parse -> calculate -> export) is running when server process unexpectedly restarts.
- **System Behavior**: System persists checkpoints after each completed step (`FR-CORE-AGENT-003`). Upon process restart, job worker detects interrupted task, inspects last completed step (calculate), and resumes at step 4 (export) without re-running earlier non-idempotent steps.
- **Acceptance Verification**: Tested against `FR-CORE-AGENT-003`. Validates checkpoint resumption and zero duplicate side effects.

### Scenario Y: Session Token Expiration, Refresh Rotation, and Family Revocation
- **User Intent**: User logs in from desktop, uses application, and later has refresh token rotated. An attacker attempts to replay the invalidated prior refresh token.
- **System Behavior**: Authenticates with secure HttpOnly cookies. Every token refresh issues a new refresh token and invalidates the previous token. When the system detects reuse of an invalidated refresh token, it immediately revokes the entire compromised refresh token family and terminates all active sessions associated with that account (`FR-CORE-SEC-005`).
- **Acceptance Verification**: Tested against `FR-CORE-SEC-005`. Validates token rotation, reuse detection, and immediate family-wide session revocation.

### Scenario Z: Modular Domain Module Detachment (Core Platform Continuity)
- **User Intent**: The deployment operator disables or removes the optional Restaurant & Multi-Branch domain module from a deployment.
- **System Behavior**: The core platform starts without loading domain schemas or tools. Core P0 chat, file ingestion, memory directives, and security acceptance tests execute without importing or requiring the optional domain module.
- **Acceptance Verification**: Tested against `FR-DOM-REST-009`. Validates that the core platform builds and passes its designated acceptance suite without the optional domain module.

### Scenario AA: Proactive Daily Morning Briefing Generation (P2 Post-Launch)
- **User Intent**: User receives daily morning briefing at 7:30 AM summarizing upcoming calendar events, open tasks, and active project milestones.
- **System Behavior**: Background scheduler triggers briefing generation, collates active reminders, calendar commitments, and project task statuses, formats a concise bulleted morning briefing using neutral, general-purpose briefing language, and presents it in the notification inbox. Does not perform unauthorized external weather research.
- **Acceptance Verification**: Tested against `FR-CORE-PRO-002`. Validates scheduled collation and briefing generation based on internal commitments and projects without unapproved external research.


### Scenario AB: Optional Integration Connector Enablement, Disablement, and Revocation
- **User Intent**: The user enables an optional Google Drive connector, authorizes its requested scope, uses it for a file operation, then disables the connector and removes its authorization.
- **System Behavior**: The connector is registered through the documented connector interface. After OAuth authorization, its credential is stored using the authenticated envelope-encryption requirements; plaintext tokens do not appear in database records or logs. Enabling it makes only its approved tools available to that user's account; disabling it removes those tools from future model/tool selection without requiring an application server restart. The application deletes the locally stored encrypted token, attempts provider-side revocation, and reports any pending revocation if the provider is unavailable. Re-enabling requires a new authorization flow and the user sees the scopes requested. Other connectors and core chat continue to operate.
- **Acceptance Verification**: Tested against `FR-CORE-INT-001` and `FR-CORE-SEC-002`. Validates connector enable/disable lifecycle, per-account scope isolation, envelope-encrypted token storage, token removal/revocation status, and continued operation of unrelated core functionality.
---


## 21. Non-functional requirements and measurable quality

The following requirements are technology-neutral and must be assigned concrete numeric targets during the foundation/architecture phase, based on measured workloads and the actual deployment tier. Do not make up latency or availability figures before establishing a baseline.

### 21.1 Availability and resilience

- **NFR-REL-001 — Graceful provider degradation:** provider/tool downtime must produce a clear user-facing failure and a user-directed alternative among qualified, consented free providers. No hidden cross-provider transmission and no application-process crash.
- **NFR-REL-002 — Backup and disaster recovery:** establish measurable RPO/RTO, backup encryption, snapshot rotation, restore testing, and evidence. MongoDB and object storage recovery must be considered together.
- **NFR-REL-003 — Durable long-running work:** persist checkpoints and resumable job state; restart resumes at last verified safe step without duplicating non-idempotent side effects.

### 21.2 Performance

- **NFR-PERF-001 — Empirical benchmark method:** measure standard workloads such as a 500-token prompt, five-page PDF ingestion, and 60-second audio file using ordinary consumer internet connections. Report hardware/network/provider assumptions.
- **NFR-PERF-002 — Streaming latency:** measure application transport overhead separately from provider time-to-first-token. Define p50/p95 budgets and reconnection behavior from observed measurements.
- Bound prompt/context assembly, message pagination, asset processing, structured output, and tool loops. Never solve a performance issue by removing ownership checks or data validation.

### 21.3 Privacy, retention, and cost

- **NFR-SEC-001 — Provider consent lifecycle:** prior to sending prompts, history, attachments, transcripts, OCR text, embeddings, or user-derived search queries to a provider, disclose provider/model/plan and data categories; record consent; reconfirm material policy changes; show training/service-improvement terms where applicable; allow decline/switch/revoke; block undisclosed secondary transmission.
- **NFR-SEC-002 — Credential encryption:** store BYOK and integration tokens with authenticated envelope encryption (AES-256-GCM, unique 96-bit nonce, external KEK, user/credential-bound AAD, key version, rotation). This is a requirement, not proof that an external KMS has been configured.
- **NFR-SEC-003 — Retention:** temporary upload buffers must be purged according to a documented retention window (24 hours is an example, not an unconditional universal retention value). Saved project assets follow the user's retention controls.
- **NFR-SEC-004 — Isolation:** every route, query, file access, vector retrieval, cache read, background job and tool enforces authenticated user ownership. Unauthorized and nonexistent owner resources use the same 404 status and response shape; timing is measured and mitigated without claiming identical network timing.
- **NFR-COST-001 — Cost and quota safeguards:** track quotas and costs where exposed; no automatic paid inference/search/storage/messaging request; optional paid services require explicit enablement, cost disclosure and appropriate per-request or enforceable budget approval. Explain that the application cannot control how a provider bills an already-authorized request.

### 21.4 Observability and auditability

- **NFR-OBS-001:** security-sensitive actions (login, refresh reuse, approval, credential update, connector change, account deletion, export) emit structured, timestamped audit events. Never log passwords, decrypted keys, bearer tokens, or private document contents.
- **NFR-OBS-002:** protected health checks report app/database/worker readiness. Provider reachability may be summarized safely; no keys, private prompt contents, or full provider error bodies in health responses.
- Every log/run/approval event should be correlatable through request ID, run ID, tool execution ID and audit ID.

### 21.5 Accessibility and responsive design

- **NFR-UI-001:** target WCAG 2.2 AA. Test keyboard operation, focus management, screen-reader labels, contrast, reduced motion, mobile layout and overflow. Verify on current supported desktop and mobile browser versions.

### 21.6 Performance budget decision record

During Phase 1/2, benchmark:

- API health and authenticated profile request;
- thread list/history with 20, 100 and 500 messages;
- chat TTFT and stream inter-chunk timing with provider latency separately reported;
- 5-page PDF and 60-second audio asset ingestion;
- document export size/time;
- concurrent upload, chat, and background processing;
- provider error, 429 and timeout recovery.

Record baselines and p50/p95/p99 as appropriate, then agree on release thresholds. A failed threshold creates a performance issue/ADR; it does not automatically justify adding another paid service.

---

## 22. Regression battery: defects and architectural traps not to repeat

The following are source-observed implementation hazards in the reference exports. They must become explicit V1 regression tests. Their mention does not mean V1 has those defects; it identifies what must be prevented.

| Risk/defect pattern | Required V1 prevention and regression |
|---|---|
| Private uploads mounted as public static files | No public static user upload path; test unauthenticated and cross-user access denial for every asset URL. |
| Generated artifact download omits owner comparison | Every generated artifact resolves owner from server-side metadata; test user A cannot fetch user B's document. |
| OAuth callback accepts unsigned JSON state after JWT verification failure | Signed, single-use, short-lived OAuth state only; tampered/missing/replayed state rejected. |
| Mongoose session used without `withTransaction` but described as ACID | Test that multi-record database mutations run inside actual supported transactions; don't infer from session presence. |
| Branch cascade removes reports irrespective archive status | Deletion dependency rules prevent accidental active-report deletion; preview dependency set, approval and archive/retention policy. |
| Disk/object deletion happens before DB commit | Outbox/reconciliation; simulate transaction failure and ensure original file remains recoverable. |
| Tool calls execute without action-specific user approval | Exact-payload approval state machine; rejected/expired/modified payload cannot execute. |
| Chat history stored as an unbounded array | Separate message records and stable cursor pagination; stress test long conversations. |
| Pagination uses array offsets that shift during editing/retry | Stable ID/sequence cursor; append/edit/branch operations don't skip/duplicate history. |
| Retry identity inferred from position or sent-ID set | Server-validated `turnId` and explicit operation intent; retry never adds another user turn. |
| Retry trusts client attachments or blob URLs | Retry uses persisted server-side asset references; reject blob URLs and arbitrary paths. |
| `continueGeneration` supports fewer events than normal send | One normalized event consumer across send, continue and rejoin; protocol conformance tests. |
| `reset_stream` adds new parts without replacing failed partial output | Generation-attempt-specific message parts; old attempt is marked discarded/failed and not concatenated. |
| Audio-only request rejected as empty | Message validity recognizes audio asset ID even without user text. Test every send/retry/error-retry/edit/stop/continue/model-switch path. |
| Audio history queried by ID without owner scope | Asset/representation retrieval always includes owner/project scope. |
| `useSyncExternalStore` snapshot getter returns a new object on each read | Stable cached immutable snapshot; React test verifies no infinite rerender/warnings. |
| TTS cache key uses text length and first 64 chars | Content hash + voice/model/locale/version; bounded TTL/LRU eviction. |
| TTS/STT provider fallback not disclosed | Capability registry and consent per provider; no silent provider switching. |
| Raw chain-of-thought shown in message UI | Safe progress events only; test reasoning blocks cannot render private content. |
| User directives declared supreme over all other instructions | Preferences cannot override authorization, ownership, cost, security, consent or action approval. |
| Provider/model hidden behind generic label | UI and run metadata report actual provider/model for each attempt. |
| Failed API fetch rendered as empty conversation | Separate loading, empty, failed and unauthorized state; no data-loss illusion. |
| In-memory generated file registry and cleanup | Durable generated asset metadata with ownership, expiry, and multi-instance-safe cleanup. |
| Audio player or recorder does not release browser resources | Media tracks, object URLs, AudioContext and event listeners cleaned up on stop/unmount. |
| Ethiopian date parsing differs across UI, DB and server | Shared test vectors across Gregorian/Ethiopian conversion, time zone, indexes, and midnight boundary. |

### 22.1 Mandatory chat lifecycle test matrix

At minimum, automated tests must verify:

1. New empty thread initial state and first user send.
2. Multi-turn sequence `U0 → A0 → U1 → A1 → U2 → A2` with stable IDs and order.
3. User sends text only.
4. User sends attachment only.
5. User sends audio only with no text.
6. User sends text plus multiple attachments and audio.
7. Upload fails before send; user can retry upload without phantom message.
8. Model request fails before any token; user message persists with recoverable error state.
9. Stream fails after partial text; failed partial attempt is not falsely presented as final response.
10. 429/503 on free provider; bounded retry/backoff; authorized free fallback only; no paid fallback.
11. Stop before first token, stop mid-text, stop during tool request, stop while tool side effect is pending.
12. Continue after stopped response; does not duplicate user turn.
13. Retry assistant response; same logical turn, new generation attempt, no duplicated user message.
14. Retry after error; same semantics and durable attachment reference.
15. Edit earlier user turn; branch/prune behavior and downstream history consistent.
16. Switch model between turns; previous messages remain unchanged and active attempt records actual model.
17. Reload browser during stream and rejoin by run ID/cursor.
18. Backend restarts during multi-step workflow; resume at safe checkpoint.
19. Tool call and result pair by call ID through history reload.
20. Tool approval pending, approved, rejected, expired, altered-parameter, replayed and resumed cases.
21. Message and thread pagination while new messages arrive and branches exist.
22. Two browser tabs attempt concurrent generation on same thread.
23. User logs out while upload, stream, or background action is running.
24. Unauthorized/cross-user asset, thread, task, project, memory, tool, connector and document IDs.
25. Amharic/English mixed prompt, Unicode and attachment context.

### 22.2 Cross-layer acceptance

A capability is accepted only when its UI, API, persistence, authorization, agent/provider integration, and failure modes agree. A button click is not functional acceptance. A model response that appears successful while the database is wrong is a failure. A database write hidden by UI cache mismatch is a failure. A generated download without ownership validation is a failure. A stream that cannot reload/rejoin is not durable.

---

## 23. Planning files, skills, reviewers, and working discipline

### 23.1 Persistent planning files

Maintain three durable files in the V1 root:

- `task_plan.md`: phases, task sequence, dependencies, acceptance criteria, current review gate and next permitted action.
- `findings.md`: discoveries, source references, architecture findings, unresolved questions, research links, risk decisions and ADR summaries.
- `progress.md`: dated activity log, current branch/commit, task status, test evidence, owner decisions/approvals, blockers and restart instructions.

These files are working state, not competing specifications. They must point back to this master file and approved ADRs. Do not modify this master specification without owner approval. If an amendment is approved, record version/date/reason and update affected traceability.

### 23.2 Available agent skills/plugins

At phase start, inspect `.agents/` and available skills/tools. Use relevant skills only when actually present and their instructions are read:

- `planning-with-files`: persistent plan/findings/progress synchronization;
- `systematic-debugging`: isolate the root cause before implementing a fix;
- `verification-before-completion`: require terminal evidence before reporting success;
- `requesting-code-review` and `receiving-code-review`: independent review where a real subagent/reviewer tool exists;
- `finishing-a-development-branch`: help with safe branch completion only after owner approval;
- browser-testing skill/MCP: use only if the actual browser-control tool is available;
- official `mui` and LangChain documentation tools/MCP if available and verified.

Do not assume these skills, MCP servers, or subagents are installed. If an independent reviewer cannot truly be spawned, disclose that and perform an explicit self-review/checklist; do not claim a second agent reviewed the code. A self-review is not independent review.

### 23.3 Specialist reviewer roles

Where genuine subagents are available, assign bounded review scopes:

- LangChain/LangGraph architecture and provider compatibility;
- database/data integrity and migration;
- application security and authorization;
- frontend state/runtime/accessibility;
- multimodal/document and file pipeline;
- operations module parity and Ethiopian date/Amharic output.

Reviewers receive the exact requirements, diff, and relevant code only; they return findings with severity, file/line, reproducible reason and remediation. The implementing agent owns integration and must not hide conflicting reviews. Owner review gates remain mandatory regardless of subagent findings.

### 23.4 Debugging protocol

When a defect appears:

1. Reproduce it with deterministic steps or a test.
2. Capture expected vs actual behavior, logs and state snapshots with secrets redacted.
3. Trace the data and state across UI, network, controller, service, DB, provider, tool and event stream.
4. Form a root-cause hypothesis and falsify alternatives.
5. Fix the smallest correct boundary, not the visible symptom only.
6. Add a regression test before closing the issue where possible.
7. Run adjacent regression cases and explain residual risk.
8. Present to owner at review gate.

### 23.5 Research protocol

- Prefer current official primary documentation for framework API, providers, license and security.
- Record URL, access date, version and exact point verified.
- Verify API shape from current docs and installed package exports after installation.
- For provider pricing/region/terms, cite official pricing, terms, and region support sources. Re-check before release because free quotas and availability change.
- Use community material only as supplemental evidence; never treat it as provider contract.
- Distinguish research result from implementation test result.

---

## 24. LangChain official documentation index and research checklist

The following official pages define the research basis for the LangChain decisions in Sections 7 and 8. Read the currently relevant pages again when implementing the specific phase and record API/version verification. The index is deliberately broad to cover the user's requested categories; it does **not** mean every feature should be installed or used.

### Core components

- [Agents](https://docs.langchain.com/oss/javascript/langchain/agents)
- [Models](https://docs.langchain.com/oss/javascript/langchain/models)
- [Messages](https://docs.langchain.com/oss/javascript/langchain/messages)
- [Tools](https://docs.langchain.com/oss/javascript/langchain/tools)
- [Short-term memory](https://docs.langchain.com/oss/javascript/langchain/short-term-memory)
- [Streaming](https://docs.langchain.com/oss/javascript/langchain/streaming)
- [Structured output](https://docs.langchain.com/oss/javascript/langchain/structured-output)
- [ChatOpenAI integration](https://docs.langchain.com/oss/javascript/integrations/chat/openai)

### Middleware and runtime

- [Built-in middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in)
- [Custom middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/custom)
- [Runtime](https://docs.langchain.com/oss/javascript/langchain/runtime)
- [Context engineering](https://docs.langchain.com/oss/javascript/langchain/context-engineering)
- [Guardrails](https://docs.langchain.com/oss/javascript/langchain/guardrails)

### Human-in-the-loop, persistence and advanced usage

- [Human-in-the-loop](https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph checkpoints](https://docs.langchain.com/oss/javascript/langgraph/checkpoints)
- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [LangGraph fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance)
- [LangGraph time travel](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel)
- [MongoDB checkpoint package reference](https://reference.langchain.com/javascript/langchain/langgraph-checkpoint-mongodb)
- [MCP](https://docs.langchain.com/oss/javascript/langchain/mcp)

### Multi-agent and retrieval

- [Multi-agent overview](https://docs.langchain.com/oss/javascript/langchain/multi-agent/index)
- [Subagents](https://docs.langchain.com/oss/javascript/langchain/multi-agent/subagents)
- [Handoffs](https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs)
- [Skills](https://docs.langchain.com/oss/javascript/langchain/multi-agent/skills)
- [Router](https://docs.langchain.com/oss/javascript/langchain/multi-agent/router)
- [Custom workflow](https://docs.langchain.com/oss/javascript/langchain/multi-agent/custom-workflow)
- [Retrieval](https://docs.langchain.com/oss/javascript/langchain/retrieval)
- [Long-term memory](https://docs.langchain.com/oss/javascript/langchain/long-term-memory)

### Frontend integrations and generative UI

- [Frontend integration overview](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/overview)
- [Markdown messages](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/markdown-messages)
- [Tool calling](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/tool-calling)
- [Headless tools](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/headless-tools)
- [Human-in-the-loop UI](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/human-in-the-loop)
- [Branching chat](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/branching-chat)
- [Reasoning tokens](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/reasoning-tokens)
- [Structured output UI](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/structured-output)
- [Message queues](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/message-queues)
- [Join/rejoin streams](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/join-rejoin)
- [Time travel UI](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/time-travel)
- [Generative UI](https://docs.langchain.com/oss/javascript/langchain/frontend/generative-ui)
- [Frontend integration catalog](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/)

### Related UI transport contracts

- [MUI X Chat core](https://mui.com/x/react-chat/core/)
- [MUI X Chat adapter contract](https://mui.com/x/react-chat/core/adapters/)
- [Building a MUI Chat adapter](https://mui.com/x/react-chat/backend/building-an-adapter/)
- [MUI X Chat AI SDK adapter](https://mui.com/x/react-chat/backend/built-in-adapters/ai-sdk-adapter/)
- [Vercel AI SDK UI Message Stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)

---

## 25. Release definition, completion checklist, and handover

V1 is ready for release only when the owner has reviewed and approved the final phase and release checklist.

### 25.1 Mandatory release criteria

- [ ] All P0 core FRs in the 52-requirement register are implemented and independently verified.
- [ ] Provider qualification for the core no-card/no-subscription inference route is current, evidenced, and accessible from the target region.
- [ ] No local AI inference or undisclosed paid provider usage exists.
- [ ] Every P1 modality/connector is either qualified and implemented or visibly unavailable/deferred; no unsupported promise is exposed.
- [ ] Thread/turn/message/run/event architecture passes lifecycle, pagination, edit, retry, stop, continuation, branching and rejoin tests.
- [ ] All original V0 user-visible capabilities are mapped in the source-disposition register; every excluded/deferred behavior has a reason and an owner-approved decision.
- [ ] Core platform passes the operations module detached test.
- [ ] Cross-user IDOR, asset, download, memory, tool, connector and cache isolation tests pass.
- [ ] OAuth state, session rotation/replay, credential encryption and account deletion/export tests pass.
- [ ] All consequential actions require exact-payload authorization and have durable audit records.
- [ ] Asset processing, cleanup and generated artifacts are durable and reconcilable.
- [ ] All 28 scenarios A-AB are executed or have an explicit priority-based deferred disposition; P0 scenarios pass.
- [ ] The V1 project is organized as a single repository with root npm workspaces, maintaining independent manifests in backend/ and client/.
- [ ] Dependency license/security review is complete; no prohibited/unapproved dependency.
- [ ] Database indexes/migrations, backup/restore, deployment, monitoring, cost controls, rollback and incident runbooks are documented and verified.
- [ ] Browser/accessibility/responsive verification is complete for supported viewports and browsers.
- [ ] All critical/high security findings are fixed or explicitly accepted in writing with mitigation and owner approval.
- [ ] Documentation, traceability, ADRs, environment configuration guide, operational runbook and known limitations are current.
- [ ] Final branch merge and cleanup completed only after explicit owner approval.

### 25.2 Final handover package

Provide:

1. Product capability checklist with FR IDs and evidence.
2. Final architecture diagram and ADR index.
3. Root dependency catalog/license review.
4. Provider qualification matrix and explicit limitations.
5. API/stream contract reference.
6. Database entity/index/migration reference.
7. Security threat model and outstanding risks.
8. Test report with exact commands, counts, environment, exit codes and failures.
9. Deployment/backup/restore/rollback runbook.
10. User guide for provider keys, privacy/consent, files, tools, approvals, memory, projects and connectors.
11. Source-disposition report for all 214 reference sections.
12. Git branch/merge/commit summary.

### 25.3 Final authority

This master document and owner-approved ADRs define V1. The reference exports preserve source knowledge; they do not dictate code reuse. The implementation agent must not trade correctness, security, privacy, cost transparency, or reviewability for speed or apparent feature completeness.



---

# 26. Mandatory V1 Implementation Clarification Addendum
## Source-First Reconstruction, Per-File Implementation Directives, System Invariants, Testing Ownership, Skills, Dependencies, Provider Architecture, and MUI Theme Protection

**Status:** Mandatory and authoritative
**Applies to:** Every V1 implementation phase and task
**Position in document:** Final addendum; appended after Section 25
**Authority:** This addendum is part of the Master V1 Specification. It is not a separate prompt, optional guidance, or an alternative architecture.

### 26.0.1 Purpose and precedence

This addendum establishes eight implementation requirements that must be followed throughout V1.

It supplements and clarifies Sections 4, 6, 7, 8, 15, 16, 17, 18, 19, 22, 23, and 25.

Where a previous section is less specific or appears to conflict with this addendum, apply the following rules:

1. This addendum takes precedence for the eight subjects it addresses.
2. The directory architecture in Section 15 remains the canonical V1 target architecture, except for the explicit MUI theme protection rule in Section 26.10.
3. Sections 16 and 17 remain the canonical source-file inventory and initial source-to-target mapping. Section 26.3 and Section 26.4 add the mandatory implementation instructions for every inventoried source section.
4. The 52 existing functional requirement IDs and 28 acceptance scenarios remain intact. Do not renumber or silently remove them.
5. All existing user-facing functionality represented in the supplied source exports must be preserved in V1, even when its implementation is replaced or relocated.
6. Defective, unsafe, contradictory, or architecturally incorrect implementation details must not be preserved merely to imitate existing behavior. Preserve the intended functionality and correct the implementation.
7. No instruction in this addendum authorizes modification of the two read-only reference Markdown files.

### 26.0.2 The three authoritative implementation inputs

The implementation agent must work from exactly these three primary specification inputs:

1. `docs/Master-Personal-AI-Agent-V1-documentation.md` — authoritative V1 product, architecture, implementation, testing, security, and governance specification.
2. `docs/Backend-Personal-AI-Agent-V0-Codebase.md` — read-only backend source reference.
3. `docs/Client-Personal-AI-Agent-V0-Codebase.md` — read-only client source reference.

The two source exports represent the complete supplied source-code references. They contain:

- 61 backend file sections.
- 153 client file sections.
- 214 total source-file sections.
- Source code, assets, fonts, and frontend static resources.

Do not search for, request, clone, or depend on the original source repository. The two Markdown exports are sufficient source references for this reconstruction.

The agent must not modify, rewrite, rename, or delete either reference export.

---

## 26.1. Mandatory source-first directory and file reconstruction

### 26.1.1 Recreate the target V1 directory structure before implementation

The directory tree specified in Section 15 is the approved architectural structure for V1.

The implementation agent must:

1. Inspect the physical V1 workspace recursively.
2. Inspect the existing root files and Git state.
3. Compare the actual workspace with Section 15.
4. Create the directories required by the approved V1 structure.
5. Create additional V1 directories only where an identified source responsibility or V1 requirement needs them.
6. Preserve existing user files and configuration unless their replacement has been reviewed and approved.
7. Record every directory created, retained, relocated, or removed in the implementation inventory.

Do not create an artificial empty source file for every possible feature at the beginning of the project. Create real implementation files when their corresponding phase/task is reached.

However, **every one of the 214 source sections must have an explicit and traceable implementation disposition**. A source section must never disappear merely because the preferred V1 architecture has a different folder structure.

### 26.1.2 Mandatory full source extraction before implementing a file

Whenever a task involves a source file, the agent must locate its exact file section in the appropriate reference export and inspect the entire section.

For example:

`backend/src/app.js`

must be located and read in full from:

`docs/Backend-Personal-AI-Agent-V0-Codebase.md`

Likewise:

`client/src/components/chat/MuiAgentMessage.jsx`

must be located and read in full from:

`docs/Client-Personal-AI-Agent-V0-Codebase.md`

The agent must not use only a filename, search snippet, short excerpt, code preview, or remembered description.

For every source file, the agent must inspect:

- The complete code body.
- Every import and dependency.
- Every export.
- Every function, class, hook, component, and event handler.
- Every constant and configuration value.
- Every validation rule and schema.
- Every route and API contract.
- Every side effect.
- Every database operation.
- Every external service interaction.
- Every user-facing state and interaction.
- Every error path.
- Every hidden dependency on another source file.
- Every behavior that the user can currently access.

If a section is too long to retrieve in one operation, continue reading until the complete code fence and section boundary have been reached.

A source file cannot be marked analyzed until its entire source section has been examined.

### 26.1.3 The source-to-target implementation procedure

For each source file, follow this exact sequence:

**Step 1 — Locate**

Identify the exact section and its source-export line range.

**Step 2 — Read**

Read its full source code. Do not begin implementing based on partial content.

**Step 3 — Deconstruct**

Identify all responsibilities and behavior implemented by the file. Separate:

- User-facing behavior.
- Backend or frontend infrastructure.
- Business/domain behavior.
- Persistence behavior.
- External integrations.
- Shared utilities.
- Security controls.
- Incorrect or obsolete implementation details.

**Step 4 — Trace**

Follow imports and callers to understand how the file interacts with the rest of the application.

Do not examine a file in isolation when its behavior depends on another controller, service, component, route, state slice, hook, model, or external integration.

**Step 5 — Classify**

Classify the implementation as one or more of:

- Keep.
- Rebuild.
- Correct.
- Refactor.
- Optimize.
- Split.
- Merge.
- Relocate.
- Replace.
- Remove.
- Conditionally implement.
- Defer.

A decision to remove or defer a user-visible capability must follow the explicit functionality-preservation rule in Section 26.2.2.

**Step 6 — Map**

Identify the exact destination file or files in the Section 15 architecture, using Sections 16 and 17 as the initial mapping.

**Step 7 — Implement**

Implement the responsibility against the approved V1 architecture and its contracts. Reuse a well-designed implementation only when its technical and security properties have been verified. Do not blindly copy an incorrect implementation.

**Step 8 — Validate**

Add or update the backend API tests, frontend tests, component checks, integration tests, or regression scenarios appropriate to the behavior.

**Step 9 — Trace**

Update `docs/implementation/source-disposition.md`, including the source file, its target V1 file(s), preserved behavior, corrections, tests, requirement IDs, and implementation phase.

**Step 10 — Review**

Present the implemented files and their evidence through the task-level review protocol in Section 19.

### 26.1.4 Required source traceability document

Create and maintain:

`docs/implementation/source-disposition.md`

It must contain one record for each of the 214 source sections.

Each record must include:

| Field | Required information |
|---|---|
| Source number | Original inventory number from Section 16 or 17 |
| Source path | Exact path from the source export |
| Source export | Backend or client reference export |
| Source line range | Exact line range in the Markdown export |
| Completeness | Whether the entire section and code fence were inspected |
| Exports | All exported functions, classes, constants, hooks, components, or schemas |
| Dependencies | External packages and internal imports |
| Responsibilities | Every responsibility found in the file |
| User-visible behavior | Every relevant user-facing capability |
| Data effects | Database records, files, or external services affected |
| Defects | Confirmed defects and risks found |
| Disposition | Keep, rebuild, correct, split, merge, replace, remove, conditional, or defer |
| V1 destination | Every target V1 file receiving the responsibility |
| Requirements | Related V1 requirement IDs |
| Tests | Test cases or acceptance scenarios covering the responsibility |
| Phase/task | Exact implementation phase and task |
| Status | Not examined, examined, mapped, implemented, reviewed, or approved |

For a file that is split into multiple V1 files, list every target destination. Do not mark the source file complete while one of its original responsibilities remains unaccounted for.

For a file merged into another module, show exactly where each original responsibility went.

For an asset, record its format, size, license, attribution, purpose, rendering compatibility, and final decision.

**A filename appearing in a source-disposition table does not mean its code has been implemented.** Implementation is complete only when the behavior has been mapped, built, tested, reviewed, and accepted.

### 26.1.5 New V1-only files

V1 will require new source files that do not exist in the reference exports, particularly for:

- LangChain model/provider adapters.
- Provider registration and capability qualification.
- LangGraph workflows and graph state.
- LangChain middleware.
- Persistent graph checkpointing.
- Durable runs and run events.
- Human approval and resume workflows.
- Asset lifecycle and derived representations.
- Document citations and provenance.
- User/project memory.
- Scheduled jobs and notifications.
- MCP connection management.
- Audit events and idempotency.
- The unified chat event/stream mapper.
- V1 backend and frontend regression scripts.

Every new file must have an explicit responsibility, module owner, public interface, dependencies, tests, and destination within Section 15.

Do not create a file merely because a framework offers a feature. Create it only when a defined V1 requirement needs that responsibility.

---

## 26.2. Functionality preservation and interpretation rules

### 26.2.1 Complete functionality-preservation requirement

Every functional capability implemented in the supplied backend and client exports must be accounted for in V1.

The requirement is not limited to the 52 requirement IDs. Those requirements remain authoritative, but the source exports may contain detailed behaviors and edge cases not separately represented in the requirements register.

The agent must therefore maintain two linked forms of traceability:

1. Requirement-to-implementation traceability.
2. Source-behavior-to-implementation traceability.

The target is to preserve all existing user-accessible capabilities, including capabilities that may be implemented in a different module, page, component, API, service, or interaction pattern.

A different implementation is acceptable. An unexplained disappearance of functionality is not.

### 26.2.2 Preserve intent; do not preserve defects

The following distinction is mandatory:

| Source behavior | V1 treatment |
|---|---|
| Correct user-facing functionality | Preserve it. |
| Correct business rules | Preserve and test them. |
| Correct integration capability | Preserve through a secure V1 connector. |
| Incorrect implementation of a valid capability | Reimplement correctly. |
| Security vulnerability | Correct it; never reproduce it. |
| Contradictory instructions | Reconcile under V1 requirements and first principles. |
| Unreliable behavior | Correct the root cause and preserve the intended behavior. |
| Duplicate or unused code | Consolidate or remove after proving its behavior is unnecessary. |
| Deprecated library/API | Replace with a supported equivalent without losing required functionality. |
| External capability unavailable or unqualified | Document the exact limitation and obtain owner direction; do not simulate success. |

Examples:

- Preserve secure file uploads and historical attachment access, but do not preserve public unauthenticated access to private uploads.
- Preserve generated-file downloads, but enforce ownership on every download.
- Preserve tool execution, but add appropriate authorization and approval for consequential actions.
- Preserve retry and edit behavior, but replace unreliable array-index logic with stable turn/message identities.
- Preserve audio uploads and transcription, but do not claim an agent analyzed raw audio when it only received a transcript.
- Preserve Google Drive and Telegram functionality, but add secure OAuth, scoped authorization, preview, idempotency, and approval.
- Preserve Ethiopian-calendar and Amharic report behavior, but establish correct date/time normalization and rendering.

### 26.2.3 No functionality may be silently discarded as optional

The term "optional module" in the architecture describes modularity and enablement. It does not grant permission to silently remove capabilities that are already present in the source exports.

All existing branch/report and related operations functions must remain available in the V1 preservation baseline unless the owner explicitly changes the product scope.

A module may be disabled when appropriate, but its code and functionality must remain architecturally separable and its absence must not damage the general Personal AI Agent platform.

Any proposed capability removal requires:

1. The exact source behavior.
2. Why it should be removed.
3. The user impact.
4. The technical/security reason.
5. The alternative or replacement.
6. Explicit owner approval.

---

## 26.3. Backend file-by-file implementation directives

The following directives expand the backend source disposition table in Section 16. The actual V1 destination remains the path assigned in Section 16 unless a separately reviewed ADR changes it.

For every item, the complete corresponding source code must be extracted and examined as required by Section 26.1.

| No. | Exact source file | Mandatory V1 implementation instructions |
|---:|---|---|
| 1 | `backend/src/app.js` | Rebuild the Express application composition. Preserve the middleware ordering and route behavior that are genuinely required. Configure exact allowed origins, credentialed CORS, security headers, body limits, cookie parsing, request logging, health routes, versioned route registration, 404 handling, and global errors. Do not expose private user uploads through unauthenticated static serving. Mount authenticated asset/document access routes. Ensure request IDs and safe error correlation. |
| 2 | `backend/src/server.js` | Rebuild the process bootstrap. Establish database readiness before accepting application traffic. Start durable workers only after infrastructure is ready. Implement graceful shutdown that stops accepting requests, drains active HTTP streams, handles outstanding jobs, closes shared clients once, and closes the database safely. Preserve fatal-process handling without swallowing critical failures. |
| 3 | `backend/src/config/db.js` | Inspect all MongoDB connection, reconnection, pool, and lifecycle logic. Establish one authoritative MongoDB connection owner. Avoid recursive reconnection races and multiple uncoordinated pools. Coordinate Mongoose, workers, and any LangGraph MongoDB checkpointer through a deliberate connection-sharing design. Test transaction requirements against an actual transaction-capable MongoDB topology. |
| 4 | `backend/src/config/env.js` | Preserve all required configuration concepts, but rebuild validation using a single schema-driven configuration module. Validate type, format, allowed values, URL syntax, secret length, durations, quotas, and production requirements. Separate Google LLM credentials from Google OAuth credentials. Never log secret values. Fail startup for invalid required production configuration. |
| 5 | `backend/src/config/logger.js` | Preserve structured logs, timestamps, rotation where appropriate, and operational diagnostics. Extend redaction to nested objects, arrays, headers, prompts, provider payloads, file paths, credentials, cookies, and personal data. Add request, thread, run, and action correlation IDs. Logs must not become a copy of private user conversations. |
| 6 | `backend/src/config/schemaOptions.js` | Retain shared schema conventions only when they do not hide required data. Preserve timestamps and safe serialization. Do not globally remove identifiers, metadata, versioning, or fields needed for concurrency and audit. Make public DTO serialization explicit. |
| 7 | `backend/src/errors/CustomError.js` | Rebuild the typed error hierarchy. Preserve predictable validation, authentication, authorization, not-found, conflict, provider, rate-limit, and processing error semantics. Separate internal diagnostic details from safe public errors. |
| 8 | `backend/src/middleware/authMiddleware.js` | Rebuild authenticated user/session resolution. The server must derive identity from a valid session, never from a client-supplied `userId`. Attach a trusted request context containing owner, permissions, session, correlation ID, and applicable project scope. Apply consistent 401/403/404 behavior. |
| 9 | `backend/src/middleware/errorHandler.js` | Preserve centralized error normalization. Handle validation, database, provider, upload, streaming, and unexpected errors. Do not leak stack traces, raw provider responses, tokens, connection strings, or private file paths to the client. |
| 10 | `backend/src/middleware/notFoundHandler.js` | Preserve versioned API 404 behavior and safe resource non-enumeration. Ensure unknown resources do not disclose whether another user's resource exists. |
| 11 | `backend/src/middleware/uploadMiddleware.js` | Rebuild private multipart/file ingestion. Enforce file count, individual/batch size, extension, MIME, content-signature, filename, storage quota, and processing limits. Reject executable or unsupported content. Use generated storage keys rather than user filenames as paths. |
| 12 | `backend/src/middleware/validate.js` | Preserve centralized request validation. Use the V1 canonical schema strategy consistently. Validate route parameters, query strings, bodies, multipart metadata, and security-sensitive fields. Validation must precede business logic. |
| 13 | `backend/src/routes/authRoutes.js` | Preserve registration, login, logout, refresh, Google SSO, and account recovery behavior that is in scope. Rebuild Google OAuth state using cryptographically signed/validated state and safe return URLs. Protect every integration route. Prevent unsafe account linking. |
| 14 | `backend/src/routes/branchRoutes.js` | Preserve the complete branch API: create, read, search, update, archive, restore, permanent deletion, metrics, and associated history. Keep every route owner-scoped. Destructive actions must expose their effects and require appropriate approval. |
| 15 | `backend/src/routes/chatRoutes.js` | Decompose the source routes into thread, message, run, stream, retry, edit, continuation, stop, branch, search, attachment association, and tool-approval endpoints as appropriate. Preserve all existing chat management and interaction functionality. Do not let chat persistence and agent execution become one controller. |
| 16 | `backend/src/routes/dashboardRoutes.js` | Preserve general dashboard APIs and existing operational metrics. Isolate operations-specific calculations behind the operations module. Do not require restaurant records for a general personal dashboard to work. |
| 17 | `backend/src/routes/index.js` | Rebuild central API route registration. Ensure every module is mounted exactly once and protected routes have authentication and validation middleware in the correct order. Avoid duplicate or shadowed routes. |
| 18 | `backend/src/routes/reportRoutes.js` | Preserve the full reports API, including creation, listing, filtering, detail, update, activity, issue, comment, visit, archive, restore, deletion, audio, search, and sharing/export behaviors represented by the source. Keep date and ownership semantics consistent. |
| 19 | `backend/src/routes/sttRoutes.js` | Preserve speech-to-text functionality using a provider-neutral speech capability interface. Keep upload transcription and live speech input as distinct flows. Enforce remote provider qualification, user consent, limits, and language capability. |
| 20 | `backend/src/routes/userRoutes.js` | Split profile, preferences, provider configuration, directives, templates, security, memory/privacy, and connector settings into appropriate modules. Preserve every existing supported setting while enforcing server-side ownership and credential protection. |
| 21 | `backend/src/services/documentGenerationService.js` | Preserve all supported output types: PDF, DOCX, XLSX, CSV, Markdown, and JSON. Validate generated files structurally, preserve Unicode/Amharic, verify fonts, handle long tables, prevent spreadsheet formula injection, and keep generated assets private and user-owned. |
| 22 | `backend/src/services/googleDriveService.js` | Preserve Google Drive OAuth connection, status, token refresh, folder, search, file creation, document creation, export, and management functionality. Add least-privilege scopes, safe state, durable credentials, private-by-default sharing, owner checks, idempotency, and explicit approval for external sharing/deletion. |
| 23 | `backend/src/services/storageService.js` | Preserve storage abstraction and asset operations. Build private durable storage with upload, read, delete, metadata, integrity, and cleanup interfaces. Support development storage without making private production assets public. Define retry and reconciliation for external storage failures. |
| 24 | `backend/src/services/telegramService.js` | Preserve text and image-card delivery, destination/channel selection, Amharic text, formatting controls, and report sharing. Add preview, exact target selection, explicit send approval, message-size-aware chunking, safe formatting, idempotency, and reliable partial-failure reporting. |
| 25 | `backend/src/services/ttsService.js` | Preserve remote speech synthesis as a capability where qualified. Support provider/language/voice metadata, user control, cost disclosure, audio storage, and cancellation. No local TTS model. Do not silently switch paid providers. |
| 26 | `backend/src/utils/attachmentProcessor.js` | Rebuild as separate asset and document processors. Preserve image, PDF, DOCX, XLSX, CSV, TXT, Markdown, and audio understanding behavior. Track original asset separately from extracted text, transcripts, normalized tables, and provider payloads. Apply size, page, sheet, row, time, memory, and timeout limits. |
| 27 | `backend/src/utils/audioChunker.js` | Preserve deterministic audio inspection/chunking using FFmpeg/FFprobe where needed. Validate duration, codec, sample rate, channels, output integrity, temporary-file cleanup, and cancellation. Do not treat FFmpeg as AI inference. |
| 28 | `backend/src/utils/constants.js` | Extract every constant and classify it by domain. Move to the V1 central configuration/limits modules. There must be one source of truth for upload caps, audio limits, pagination, model capabilities, file formats, retry counts, and date settings. Do not duplicate frontend/backend business limits without contract tests. |
| 29 | `backend/src/utils/errorFormatter.js` | Preserve provider error normalization but separate it from HTTP error response construction. Map provider-specific transient, quota, auth, content, timeout, and unsupported-feature errors to stable internal categories. |
| 30 | `backend/src/utils/ethiopianCalendar.js` | Preserve the full Ethiopian-calendar conversion functionality and its boundary cases. Create a clear timezone-aware Gregorian/Ethiopian date contract. Test round trips, leap years, date boundaries, and Addis Ababa business-day interpretation. |
| 31 | `backend/src/utils/promptAssembler.js` | Decompose the prompt into system policy, user preferences, selected memories, relevant project context, domain skills, trusted runtime facts, and untrusted evidence. Preserve user directives, language/style rules, report templates, branch grounding, draft-first behavior, and other user-facing capabilities. Eliminate contradictions. Directives must never override authorization or system security. |
| 32 | `backend/src/utils/token.js` | Rebuild secure token/session utilities. Preserve authentication behavior while implementing short-lived access sessions, refresh rotation, session-family revocation, secure cookie handling, expiry, logout, and replay detection. Keep signing keys out of source control and logs. |
| 33 | `backend/src/utils/transliterate.js` | Preserve relevant Amharic transliteration, normalization, and bilingual search behavior. Keep it deterministic, test it against actual branch/report data, and scope it to modules that need it. Do not transliterate or alter original stored user text. |
| 34 | `backend/src/assets/fonts/Inter-Bold.ttf` | Inspect the font license, attribution, glyph coverage, file size, and document-renderer compatibility. Preserve only if required by V1 output and legally distributable. Avoid redundant copies. |
| 35 | `backend/src/assets/fonts/Inter-Regular.ttf` | Apply the same license, attribution, glyph, and renderer checks. Retain only if needed for generated documents. |
| 36 | `backend/src/assets/fonts/NotoSansEthiopic-Bold.ttf` | Verify license, Ethiopic glyph coverage, bold rendering, and PDF/document renderer compatibility. Preserve the required Amharic/Ge'ez output capability. |
| 37 | `backend/src/assets/fonts/NotoSansEthiopic-Bold.woff` | Check whether the chosen renderer actually requires this format. Avoid carrying duplicate formats without a concrete browser or server rendering need. |
| 38 | `backend/src/assets/fonts/NotoSansEthiopic-Regular.ttf` | Verify coverage and legal redistribution. Preserve correct Ethiopic document output where required. |
| 39 | `backend/src/assets/fonts/NotoSansEthiopic-Regular.woff` | Retain only if a real target renderer requires it. Avoid redundant font formats. |
| 40 | `backend/src/assets/fonts/NotoSansLatin-Bold.ttf` | Check whether this duplicates the selected Inter/Noto Sans Latin font. Keep only the required licensed font set. |
| 41 | `backend/src/assets/fonts/NotoSansLatin-Regular.ttf` | Apply the same font duplication and licensing review. |
| 42 | `backend/src/assets/fonts/fonts.conf` | Preserve only if the selected renderer actually uses Fontconfig. If required, make paths portable and test on the intended runtime. Otherwise remove after confirming no renderer depends on it. |
| 43 | `backend/src/controllers/authController.js` | Split into application services and thin HTTP controllers for registration, authentication, Google SSO, session management, and integrations. Preserve correct response behavior. Fix OAuth state, account linking, and session revocation. |
| 44 | `backend/src/controllers/branchController.js` | Preserve branch CRUD, metrics, archive/restore, and historical relationships. Move business logic into branch services. Correct cascade deletion, transaction handling, and destructive approval. |
| 45 | `backend/src/controllers/chatController.js` | Decompose the large controller into thread/message/run application services, agent invocation, streaming, retry, edit, continuation, stop, history construction, and tool dispatch. Preserve every chat interaction while eliminating monolithic orchestration and unstable array-index logic. |
| 46 | `backend/src/controllers/dashboardController.js` | Preserve dashboard data and metrics with explicit module-specific aggregation services. Keep general and operations dashboards independent. |
| 47 | `backend/src/controllers/reportController.js` | Preserve all report CRUD and subresource operations. Separate report-domain rules from HTTP handling. Correct date boundaries, visit timing, branch ownership, transactions, audio linkage, and cascade behavior. |
| 48 | `backend/src/controllers/sttController.js` | Preserve upload transcription and live STT endpoints as distinct workflows. Use provider adapters, authoritative upload metadata, language capability checks, quotas, and secure error handling. |
| 49 | `backend/src/controllers/userController.js` | Split profile, user preferences, directives, report templates, API keys, provider models, security, and connector settings into focused services. Do not expose hidden credentials through profile responses. |
| 50 | `backend/src/jobs/sweeper.js` | Preserve all required cleanup and scheduled maintenance behavior. Rebuild as durable, idempotent jobs with database-grounded reference checks. Never delete active referenced assets. Separate temporary scratch cleanup from persistent user assets. External file cleanup must be reconciled safely after database operations. |
| 51 | `backend/src/models/Audio.js` | Preserve audio metadata, ownership, duration, MIME, storage information, transcript relationships, and report/chat references. Add explicit original-asset and derived-transcript relationships. |
| 52 | `backend/src/models/Branch.js` | Preserve branch fields, owner, code, bilingual identity, location, manager, status, archive metadata, and uniqueness behavior. Maintain it inside the isolated operations module. |
| 53 | `backend/src/models/Chat.js` | Do not reproduce the single growing embedded message array as the V1 conversation store. Extract the complete semantics of title, pinning, preferences, model configuration, and chat lifecycle. Rebuild using durable thread/turn/message/run/event records with stable IDs and pagination. |
| 54 | `backend/src/models/Report.js` | Preserve all report fields, visits, activities, issues, comments, transcription, audio references, custom sections, metadata, archival behavior, and Ethiopian date relationships. Correct relational integrity and date/time normalization. |
| 55 | `backend/src/models/User.js` | Preserve account identity, password/auth provider behavior, profile, directives, preferences, templates, model settings, speech preferences, and connector capabilities. Split sensitive credentials into protected persistence where appropriate. Never serialize provider secrets into ordinary profile responses. |
| 56 | `backend/src/tools/agentTools.js` | Extract every tool name, description, schema, behavior, result shape, and side effect. Rebuild as LangChain tools with Zod schemas and trusted runtime context. Keep the existing business capabilities. Add owner checks, permission checks, approval class, idempotency, bounded output, and audit records. Do not permit the model to choose its own authority. |
| 57 | `backend/src/validations/authValidation.js` | Preserve and improve every registration, login, password, OAuth, and session validation rule. Reconcile with the V1 account-linking and authentication policy. |
| 58 | `backend/src/validations/branchValidation.js` | Preserve branch field validation, IDs, search, status, archive/restore, and destructive operation constraints. Ensure owner and immutable IDs cannot be overridden. |
| 59 | `backend/src/validations/chatValidation.js` | Preserve all message/attachment/audio/chat configuration validation. Explicitly permit audio-only or valid-attachment-only messages with empty text. Validate retry/edit/continue semantics using stable identities, not positional trust. |
| 60 | `backend/src/validations/reportValidation.js` | Preserve all report and subdocument validation. Add temporal consistency, valid branch references, status transitions, maximum text sizes, Ethiopian/Gregorian mapping checks, and ownership-safe update fields. |
| 61 | `backend/src/validations/userValidation.js` | Preserve account/profile/settings validation. Add provider configuration validation, credential write-only handling, directive limits, preference scopes, and rejection of client-supplied ownership or privilege fields. |

---

## 26.4. Client file-by-file implementation directives

The following directives expand the client source disposition table in Section 17.

**Important:** Section 26.10 overrides earlier suggested theme refactoring. The existing `client/src/theme/*` implementation is protected and must be used as-is unless a concrete runtime defect is demonstrated.

### 26.4.1 Application bootstrap, routing, adapters, layouts, pages, and assets

| No. | Exact source file | Mandatory V1 implementation instructions |
|---:|---|---|
| 1 | `client/src/App.jsx` | Preserve root route outlet and session hydration behavior. Rebuild authentication revalidation without stale persisted identity, SSO callback confusion, or route flicker. |
| 2 | `client/src/main.jsx` | Preserve React root bootstrap, StrictMode, provider composition, error boundary, localization, notifications, and service-worker behavior where applicable. Ensure the existing theme is mounted exactly once. |
| 3 | `client/src/router.jsx` | Preserve all route behavior while moving routes into the Section 15 feature structure. Keep public/protected routes, lazy loading, not-found handling, and route parameters consistent. |
| 4 | `client/src/adapters/MuiChatAdapter.js` | Extract the complete adapter contract and rewrite against the selected MUI Chat runtime. Preserve send, load history, list threads, upload, retry, edit, stop, continue, stream reconnect, branching, metadata, tool parts, and error handling. Use one canonical stream translation path. |
| 5 | `client/src/assets/hero.png` | Inspect the actual image, license, dimensions, and purpose. Reuse only if it fits the V1 product identity and visual system. Do not use a starter or unrelated image as a permanent product asset. |
| 6 | `client/src/assets/notFound_404.svg` | Preserve or adapt the not-found illustration after checking accessibility, visual quality, and licensing. |
| 7 | `client/src/assets/react.svg` | Remove if it is only unused Vite/React template residue. |
| 8 | `client/src/assets/vite.svg` | Remove if it is only unused Vite template residue. |
| 9 | `client/src/contexts/ChatAdapterContext.js` | Preserve adapter/runtime dependency injection only if required by the chosen MUI architecture. Do not establish a second store or duplicate runtime state. |
| 10 | `client/src/layouts/AppShell.jsx` | Preserve authenticated application shell, navigation, responsive behavior, route outlet, and independent chat layout requirements. Generalize navigation to the personal-agent product. |
| 11 | `client/src/layouts/AvatarMenu.jsx` | Preserve account menu, profile navigation, and logout behavior. Never show stored API keys, OAuth tokens, or other credentials. |
| 12 | `client/src/layouts/Logo.jsx` | Preserve the brand component but apply the global Personal AI Agent identity, not a domain-only identity. |
| 13 | `client/src/layouts/MuiSidebar.jsx` | Preserve responsive navigation, drawer lifecycle, active route state, and all required feature destinations. Operations navigation must be module-aware. |
| 14 | `client/src/layouts/PublicLayout.jsx` | Preserve public-page shell, branding, accessibility, and responsive layout. |
| 15 | `client/src/layouts/ThemeToggle.jsx` | Preserve light/dark theme switching. Use the existing theme provider and tokens without creating a competing theme implementation. |
| 16 | `client/src/pages/BranchDetail.jsx` | Preserve branch details, analytics, historical audits, location/contact, archive/restore, and deletion workflows. Use the operations module. |
| 17 | `client/src/pages/Branches.jsx` | Preserve branch creation, listing, search, active/archived filtering, responsive list/grid, pagination, edit, archive, restore, and deletion. |
| 18 | `client/src/pages/Chat.jsx` | Preserve chat canvas behavior, composer, history, conversation/thread list, new-chat transition, loading, empty state, retry, continuation, and attachment display. Align with the single MUI chat runtime. |
| 19 | `client/src/pages/Dashboard.jsx` | Preserve existing dashboard behaviors, but generalize the page for the personal-agent product. Provide operations metrics through the module instead of making them mandatory globally. |
| 20 | `client/src/pages/Landing.jsx` | Preserve landing functionality and presentation structure while using the universal Personal AI Agent product identity. Do not make restaurant supervision the global product framing. |
| 21 | `client/src/pages/Login.jsx` | Preserve email/password login, validation, error messaging, return navigation, and optional configured Google SSO. Do not silently link accounts or invent a password for an OAuth-only account. |
| 22 | `client/src/pages/NotFound.jsx` | Preserve context-aware navigation recovery and accessible error presentation. |
| 23 | `client/src/pages/Profile.jsx` | Preserve all profile/settings functionality. Split account, security, preferences, models/providers, directives, templates, connectors, memory/privacy, and data controls into appropriate settings features. |
| 24 | `client/src/pages/Register.jsx` | Preserve account registration, validation, duplicate-account feedback, and successful navigation. Align form behavior with the server's actual registration/auth-provider policy. |
| 25 | `client/src/pages/ReportDetail.jsx` | Preserve report dossier, Amharic display, visits, activities, issues, observations/comments, audio, item-level edit, export/download/print, and delivery behavior. |
| 26 | `client/src/pages/ReportEdit.jsx` | Preserve full report editing, validation, Ethiopian/Gregorian date behavior, visit timing, activities, issues, comments, and save/cancel handling. |
| 27 | `client/src/pages/Reports.jsx` | Preserve report listing, search, date filters, pagination, archived records, grid/card presentation, and action behavior. |
| 28 | `client/src/theme/AppTheme.jsx` | **Do not modify or relocate.** Use the existing theme provider exactly as supplied. Only consider a minimal correction if a proven runtime failure requires it. |
| 29 | `client/src/theme/customizations/charts.js` | **Do not modify or relocate.** Use the existing chart overrides. |
| 30 | `client/src/theme/customizations/dataDisplay.js` | **Do not modify or relocate.** Use the existing data-display overrides. |
| 31 | `client/src/theme/customizations/dataGrid.js` | **Do not modify or relocate.** Use the existing Data Grid overrides. |
| 32 | `client/src/theme/customizations/datePickers.js` | **Do not modify or relocate.** Use the existing Date Picker overrides and locale styling. |
| 33 | `client/src/theme/customizations/feedback.js` | **Do not modify or relocate.** Use the existing feedback/loading/error component overrides. |
| 34 | `client/src/theme/customizations/index.js` | **Do not modify or relocate.** Preserve the existing composition of component customizations. |
| 35 | `client/src/theme/customizations/inputs.js` | **Do not modify or relocate.** Use the existing input styling and semantic tokens. |
| 36 | `client/src/theme/customizations/navigation.js` | **Do not modify or relocate.** Use the existing navigation overrides. |
| 37 | `client/src/theme/customizations/surfaces.js` | **Do not modify or relocate.** Use the existing surface and paper overrides. |
| 38 | `client/src/theme/themePrimitives.js` | **Do not modify, rename, or relocate.** It is part of the supplied theme system and remains the existing source of theme primitives. |
| 39 | `client/src/theme/useThemeMode.js` | **Do not modify or relocate.** Use the existing theme-mode hook. |
| 40 | `client/src/components/auth/GoogleSsoButton.jsx` | Preserve the SSO button when OAuth is enabled. Handle loading, disabled, error, return destination, and unavailable configuration states. |
| 41 | `client/src/components/branches/BranchAnalyticsCharts.jsx` | Preserve branch analytics, time trends, status distribution, empty/loading states, and responsive layout. |
| 42 | `client/src/components/branches/BranchAuditHistory.jsx` | Preserve historical audit listing, filtering, pagination, and responsive presentation. |
| 43 | `client/src/components/branches/BranchCard.jsx` | Preserve branch identity, location/contact, status, and action-state presentation. |
| 44 | `client/src/components/branches/BranchCardGrid.jsx` | Preserve mobile/card layout, loading/empty state, and pagination. |
| 45 | `client/src/components/branches/BranchControlStrip.jsx` | Preserve search, active/archived filtering, view switching, and low-latency input behavior. |
| 46 | `client/src/components/branches/BranchDangerZone.jsx` | Preserve archive, restore, and permanent deletion. Add dependency preview, exact-target confirmation, and server approval workflow for destructive actions. |
| 47 | `client/src/components/branches/BranchDataGrid.jsx` | Preserve branch table, sorting/filtering, row identity, actions, and responsive states. Check the selected MUI X Community/Paid feature boundary. |
| 48 | `client/src/components/branches/BranchHero.jsx` | Preserve branch headline, bilingual identity, location, manager/contact, status, and quick metrics. |
| 49 | `client/src/components/branches/MuiBranchDialog.jsx` | Preserve create/edit dialog fields, validation, conflict feedback, loading, save/cancel, and mobile behavior. |
| 50 | `client/src/components/chat/MuiAgentExecutionTimeline.jsx` | Preserve user-safe execution progress, tool lifecycle, timestamps, and status. Do not display hidden chain-of-thought. |
| 51 | `client/src/components/chat/MuiAgentMessage.jsx` | Preserve assistant message lifecycle, author, status, retry, copy, and message action behavior. |
| 52 | `client/src/components/chat/MuiAgentMessageBody.jsx` | Preserve Markdown, code, citation, attachment, structured result, and generated artifact rendering with safe sanitization. |
| 53 | `client/src/components/chat/MuiAgentMessageBottomBar.jsx` | Preserve message actions, timestamps, retry, copy, and permitted share options. Bind each action to the correct message/run identity. |
| 54 | `client/src/components/chat/MuiAttachButton.jsx` | Preserve picker, supported format handling, drag/drop integration, count/size feedback, and file selection behavior. |
| 55 | `client/src/components/chat/MuiAudioRecorder.jsx` | Preserve the complete audio recorder lifecycle, MIME fallback, permissions, timer, waveform/HUD, pause/resume if supported, discard, stop, attach, preview, and zero-loss finalization. Do not redesign or remove functionality. |
| 56 | `client/src/components/chat/MuiChatEmptyState.jsx` | Preserve empty-state structure and suggestions. Generalize prompts beyond restaurant operations. |
| 57 | `client/src/components/chat/MuiChatMessageListContent.jsx` | Preserve message list loading, empty, error, streaming, stopped, and history states. Use stable IDs and avoid duplicate or out-of-order messages. |
| 58 | `client/src/components/chat/MuiCloudDocumentCard.jsx` | Preserve generated/cloud-document presentation, filename, type, size, download/open status, and ownership-safe access. Generalize beyond reports. |
| 59 | `client/src/components/chat/MuiComposerBottomToolbar.jsx` | Preserve attachment, voice, send/stop, model selection, and other composer controls. Keep upload state distinct from model-generation state. |
| 60 | `client/src/components/chat/MuiComposerInput.jsx` | Preserve text input, multiline behavior, draft isolation, keyboard submit, IME behavior, and low-latency typing. |
| 61 | `client/src/components/chat/MuiComposerTopToolbar.jsx` | Preserve attachment shelf/preview, upload state, remove/retry, and composer expansion behavior. |
| 62 | `client/src/components/chat/MuiErrorNotice.jsx` | Preserve readable recoverable error states, model/provider context, retry, and recovery actions. Do not silently conceal failed turns. |
| 63 | `client/src/components/chat/MuiLiveSttButton.jsx` | Preserve live speech-to-text entry, permission, connection, recording, transcription, error, and stop behavior. Only activate a provider after live-STT qualification. |
| 64 | `client/src/components/chat/MuiMessageContent.jsx` | Preserve all message part rendering and map every new V1 typed part to an explicit safe renderer. |
| 65 | `client/src/components/chat/MuiModelSelector.jsx` | Preserve model selection, current model identity, thinking/setting controls, and provider/model capability display. Generalize from a fixed Gemini-only list to the provider registry. |
| 66 | `client/src/components/chat/MuiReasoningAccordion.jsx` | Preserve user-safe progress information and execution timing. Replace raw hidden reasoning disclosure with safe summaries/status. |
| 67 | `client/src/components/chat/MuiRecentChat.jsx` | Preserve recent-thread list presentation, selection, title, timestamps, pin state, rename, and delete actions. |
| 68 | `client/src/components/chat/MuiSendButton.jsx` | Preserve send/stop state machine, disabled/loading behavior, keyboard accessibility, and cancellation signaling. |
| 69 | `client/src/components/chat/MuiToolCallPart.jsx` | Preserve tool name, arguments where safe, status, progress, result, error, and approval state. Hide secrets and sensitive tool payloads. |
| 70 | `client/src/components/chat/MuiTtsPlayButton.jsx` | Preserve speech playback controls only when TTS is qualified and enabled. Handle audio loading, playback, pause, failure, and cleanup. |
| 71 | `client/src/components/chat/MuiUserAttachmentShelf.jsx` | Preserve file/audio previews, upload status, remove, retry, metadata, and association with the exact message. |
| 72 | `client/src/components/chat/MuiUserMessage.jsx` | Preserve user message presentation, edit, attachments, audio, metadata, and status. |
| 73 | `client/src/components/chat/MuiUserMessageBody.jsx` | Preserve safe text and attachment rendering, original names, previews, and download/open behavior. |
| 74 | `client/src/components/chat/MuiUserMessageBottomBar.jsx` | Preserve timestamp, edit, copy, and relevant user message actions. |
| 75 | `client/src/components/chat/index.js` | Preserve a controlled public barrel for chat components. Export only intended reusable components. |
| 76 | `client/src/components/columns/auditHistoryColumns.jsx` | Preserve all relevant audit fields, actions, widths, labels, and safe row identity. |
| 77 | `client/src/components/columns/branchColumns.jsx` | Preserve all branch fields, action visibility, sorting, status, and responsive column sizing. |
| 78 | `client/src/components/columns/reportColumns.jsx` | Preserve report date, visit/activity/issue indicators, status, and actions. |
| 79 | `client/src/components/common/GlobalErrorFallback.jsx` | Preserve global recovery, retry/reset behavior, safe diagnostics, and accessible error messaging. |
| 80 | `client/src/components/common/RootHydrateFallback.jsx` | Preserve initial application hydration/loading UI and prevent public/authenticated route flashes. |
| 81 | `client/src/components/dashboard/DashboardAuditTrendChart.jsx` | Preserve audit trend visualization as an operations dashboard widget. |
| 82 | `client/src/components/dashboard/DashboardBranchVisitChart.jsx` | Preserve branch-visit analytics as an operations dashboard widget. |
| 83 | `client/src/components/dashboard/DashboardKpiDeck.jsx` | Preserve the KPI layout and data semantics, but support general personal-agent dashboard metrics and module-specific cards. |
| 84 | `client/src/components/dashboard/DashboardQuickActions.jsx` | Preserve quick-action behavior and route targets. Generalize actions by enabled V1 features. |
| 85 | `client/src/components/dashboard/DashboardRecentAuditsLedger.jsx` | Preserve recent audit ledger as an operations widget. |
| 86 | `client/src/components/landing/LandingArchitectureShowcase.jsx` | Preserve integration/security capability presentation, but show only integrations that are genuinely implemented and available. |
| 87 | `client/src/components/landing/LandingFeaturesDeck.jsx` | Preserve feature presentation and responsive cards while reflecting actual V1 capabilities. |
| 88 | `client/src/components/landing/LandingFooter.jsx` | Preserve footer links, responsive layout, and accessibility. |
| 89 | `client/src/components/landing/LandingHero.jsx` | Preserve the hero layout and brand quality, but use the Personal AI Agent identity. |
| 90 | `client/src/components/profile/CloudIntegrationsTab.jsx` | Preserve Google Drive connection, status, disconnect, reconnect, and cloud file actions. Never display integration tokens. |
| 91 | `client/src/components/profile/ProfileAccountTab.jsx` | Preserve profile fields, update behavior, avatar, and validation. |
| 92 | `client/src/components/profile/ProfileAgentConfigTab.jsx` | Preserve model preferences, language, inference settings, and user-level agent configuration. Replace Gemini-specific assumptions with provider/model registry data. |
| 93 | `client/src/components/profile/ProfileDangerZone.jsx` | Preserve account deletion/export controls. Require explicit confirmation, user reauthentication where appropriate, and complete data-lifecycle handling. |
| 94 | `client/src/components/profile/ProfileDirectivesTab.jsx` | Preserve directive creation, editing, deletion, vocabulary, phrase mapping, and preferences. Make scope and precedence explicit. Directives never override authorization or security. |
| 95 | `client/src/components/profile/ProfileHeaderHero.jsx` | Preserve profile summary/header and account status, without exposing private settings. |
| 96 | `client/src/components/profile/ProfileReportTemplatesSection.jsx` | Preserve report templates and formatting preferences as an operations module capability. |
| 97 | `client/src/components/profile/ProfileSecurityTab.jsx` | Preserve password changes, session/security settings, and account protection. Add session revocation controls if included in the V1 identity design. |
| 98 | `client/src/components/profile/ProfileTelegramTab.jsx` | Preserve Telegram connection and destination configuration, but conceal tokens and require confirmation for consequential broadcasts. |
| 99 | `client/src/components/reports/MuiReportTelegramShareButton.jsx` | Preserve report-to-Telegram sharing, channel selection, text/image mode, loading, and result feedback. Add destination preview, explicit approval, and idempotency. |
| 100 | `client/src/components/reports/ReportActivitiesCard.jsx` | Preserve activity count/list, add/edit/delete, status, and validation. |
| 101 | `client/src/components/reports/ReportAmharicDossier.jsx` | Preserve the Amharic dossier content, formatting, typography, and report presentation. Validate actual output, not only source strings. |
| 102 | `client/src/components/reports/ReportAudioPlayerDeck.jsx` | Preserve audio list, playback, duration, transcript relationship, and player cleanup. |
| 103 | `client/src/components/reports/ReportCard.jsx` | Preserve report summary identity, date, branch visits, counts, status, and action access. |
| 104 | `client/src/components/reports/ReportCardGrid.jsx` | Preserve responsive report card collection and pagination. |
| 105 | `client/src/components/reports/ReportCommentsCard.jsx` | Preserve comments/observations listing, creation, inline edit, delete, and empty/loading states. |
| 106 | `client/src/components/reports/ReportControlStrip.jsx` | Preserve search, date/status filters, sorting, layout selection, and low-latency controls. |
| 107 | `client/src/components/reports/ReportDangerZone.jsx` | Preserve archive/restore/permanent delete. Show exact target and impact and use explicit destructive authorization. |
| 108 | `client/src/components/reports/ReportDataGrid.jsx` | Preserve report grid functionality and responsive behavior. Check MUI X license/tier requirements. |
| 109 | `client/src/components/reports/ReportHero.jsx` | Preserve report identity, date, owner, duration, visit summary, and status. |
| 110 | `client/src/components/reports/ReportIssuesCard.jsx` | Preserve issue description, status, edit, delete, and validation. |
| 111 | `client/src/components/reports/ReportVisitsLedger.jsx` | Preserve branch visits, arrival/departure times, duration, edit, and chronological ordering. |
| 112 | `client/src/components/reusable/ErrorBoundary.jsx` | Preserve reusable error boundary behavior where it is not redundant with the root boundary. |
| 113 | `client/src/components/reusable/LoadingSpinner.jsx` | Preserve shared loading feedback, labels, and accessibility. |
| 114 | `client/src/components/reusable/MuiActionMenu.jsx` | Preserve reusable action menu, keyboard control, focus behavior, and accessible item labels. |
| 115 | `client/src/components/reusable/MuiAppbar.jsx` | Preserve application header behavior, responsive layout, and navigation actions. |
| 116 | `client/src/components/reusable/MuiButton.jsx` | Preserve reusable button semantics only if it adds real application consistency. Do not create a wrapper that hides required MUI accessibility props. |
| 117 | `client/src/components/reusable/MuiConfirmDialog.jsx` | Preserve reusable confirmation dialogs. Use correct focus management; do not disable focus enforcement merely to silence warnings. |
| 118 | `client/src/components/reusable/MuiDataGrid.jsx` | Preserve table abstraction if required by selected MUI X tier. Keep row identity, empty/loading states, and responsive behavior. |
| 119 | `client/src/components/reusable/MuiDataGridToolbar.jsx` | Preserve grid filter/search/export toolbar capabilities actually used by the app. |
| 120 | `client/src/components/reusable/MuiDatePicker.jsx` | Preserve date input behavior, Ethiopian calendar display/integration, localization, validation, and canonical date semantics. |
| 121 | `client/src/components/reusable/MuiDialog.jsx` | Preserve responsive dialog and form behavior. Maintain keyboard focus, accessibility, escape handling, and mobile presentation. |
| 122 | `client/src/components/reusable/MuiEmptyState.jsx` | Preserve reusable empty states and action slots. |
| 123 | `client/src/components/reusable/MuiPagination.jsx` | Preserve pagination controls. Use stable server cursor/page semantics and correct has-more handling. |
| 124 | `client/src/components/reusable/MuiSearchInput.jsx` | Preserve search input and responsive styling. Do not debounce the user's keystroke rendering; debounce only the network query if needed. |
| 125 | `client/src/components/reusable/MuiStatCard.jsx` | Preserve reusable metric cards, number formatting, labels, and responsive display. |
| 126 | `client/src/components/reusable/MuiStatusChip.jsx` | Preserve status labels and visual consistency. Use a single domain status vocabulary. |
| 127 | `client/src/components/reusable/MuiTextField.jsx` | Preserve field behavior, validation, adornments, password visibility, error display, and accessibility. |
| 128 | `client/src/components/reusable/MuiTimePicker.jsx` | Preserve 24-hour time entry, validation, localization, clear behavior, and explicit timezone/business-time semantics. |
| 129 | `client/src/components/search/GlobalSearchModal.jsx` | Preserve keyboard-triggered global search, modal behavior, and route/result navigation. Extend only to authorized V1 resources. |
| 130 | `client/src/hooks/useAddisLiveStt.js` | Preserve live Addis speech recognition where qualified. Handle connection state, stream lifecycle, language, error, reconnect, and cancellation. |
| 131 | `client/src/hooks/useAddisTts.js` | Preserve Addis speech synthesis where qualified. Fix cache identity collisions, add bounded cache eviction, and handle audio lifecycle. |
| 132 | `client/src/hooks/useAudioRecorder.js` | Preserve the complete recording lifecycle and all supported MIME fallback behavior. Ensure final buffers are flushed before finalizing the recording. |
| 133 | `client/src/hooks/useLogout.js` | Preserve server-side session logout, local state reset, RTK Query cache reset, chat state isolation, and redirect behavior. |
| 134 | `client/src/redux/app/apiSlice.js` | Preserve RTK Query as the shared HTTP API/cache layer if selected. Keep base URL, cookie credentials, error normalization, safe reauthentication, and tag invalidation centralized. |
| 135 | `client/src/redux/app/authClient.js` | Preserve the shared single-flight refresh behavior. Align it with server session rotation and ensure refresh failures are distinguished from network outages. |
| 136 | `client/src/redux/app/store.js` | Preserve the global Redux store where required. Do not persist secrets, active streams, duplicate messages, or server-authoritative records. |
| 137 | `client/src/redux/features/authSlice.js` | Preserve minimal authentication/profile state and selectors. Server session state remains authoritative. |
| 138 | `client/src/redux/features/branchSlice.js` | Preserve branch query/mutation behavior inside the operations module. Maintain cache invalidation and pagination correctness. |
| 139 | `client/src/redux/features/chatSlice.js` | Preserve necessary thread API/cache behavior. Must not compete with or duplicate the live message streaming runtime; chatSlice manages thread list and history query metadata only. |
| 140 | `client/src/redux/features/dashboardSlice.js` | Preserve dashboard API queries and cache behavior. Keep operations metrics module-specific. |
| 141 | `client/src/redux/features/reportSlice.js` | Preserve report queries, mutations, pagination, and cache invalidation under the operations module. |
| 142 | `client/src/redux/features/sttSlice.js` | Preserve speech API interaction if required. Keep original audio and transcription assets authoritative on the server. |
| 143 | `client/src/redux/features/userSlice.js` | Split profile, preferences, model/provider settings, directives, connectors, privacy, and security APIs by domain while preserving current behavior. |
| 144 | `client/src/routes/ProtectedRoute.jsx` | Preserve protected-route behavior and server session validation. Never trust local storage as proof of current authentication. |
| 145 | `client/src/routes/PublicRoute.jsx` | Preserve public-route behavior and redirect authenticated users appropriately. |
| 146 | `client/src/utils/AdapterEthiopianDayjs.js` | Preserve only if the selected official MUI picker APIs support the adapter correctly. Test Gregorian/Ethiopian conversion, timezone, and picker boundaries. |
| 147 | `client/src/utils/addisAudioPlayer.js` | Preserve audio playback utilities, browser compatibility, resource cleanup, and error handling. Keep provider-specific details behind the audio service boundary. |
| 148 | `client/src/utils/attachmentRegistry.js` | Rebuild as a stable upload-state store. Fix referential stability and snapshot issues. Durable attachment identity must be the server asset ID, not a browser blob URL. |
| 149 | `client/src/utils/avatarUtils.js` | Preserve avatar normalization and fallback behavior. Validate remote/local URL policy and prevent unsafe image sources. |
| 150 | `client/src/utils/constants.js` | Extract every constant and align with the backend contract. Do not duplicate model identifiers, upload limits, statuses, or date rules across independently maintained files. |
| 151 | `client/src/utils/ethiopianCalendar.js` | Preserve all Ethiopian calendar utilities used by the interface. Test against the backend calendar contract and timezone rules. |
| 152 | `client/src/utils/imageOptimizer.js` | Preserve deterministic browser-side image optimization. Store optimized derivatives separately; never overwrite or discard the original uploaded file. |
| 153 | `client/src/utils/validateChatAttachment.js` | Preserve instant client-side validation for user experience, but repeat every authoritative check on the backend. Keep audio-only messages valid. |

### 26.4.2 Source-file completeness rule

The 153 entries above are not an invitation to implement only the summary sentence.

For every component, hook, page, slice, adapter, utility, and layout:

- Read its full source.
- Record all props and their contracts.
- Record every imported service/hook/slice.
- Record every user interaction.
- Record loading, error, empty, disabled, and success states.
- Record route and navigation behavior.
- Record responsive behavior.
- Record persisted state and API interactions.
- Record its relationships with other components.
- Preserve relevant accessibility and keyboard functionality.
- Implement its mapped functionality in the approved V1 structure.
- Add relevant tests and traceability.

When one V0 component becomes several V1 components, each responsibility must be mapped and tested separately.

---

## 26.5. Additional V1-only source files that must be created

The V1 architecture introduces new capabilities and boundaries that do not have direct one-to-one source files in the reference exports.

The agent must create these files when their corresponding phase is reached. Exact filenames may be refined through an ADR, but their responsibilities are mandatory.

### 26.5.1 Backend foundation and shared infrastructure

Create or provide equivalent focused files for:

- Environment schema and typed configuration.
- Database connection and lifecycle.
- Shared MongoDB client access.
- HTTP application composition.
- Request correlation and logging.
- Central error normalization.
- Authentication/session middleware.
- Request validation.
- Private asset access.
- Credential encryption/key management.
- Audit event recording.

### 26.5.2 Provider and model registry

Create or provide equivalent files for:

- Provider domain definition.
- Provider registry.
- Model registry.
- Model capability definitions.
- Provider credential service.
- Credential encryption/decryption service.
- Provider qualification service.
- Provider availability/health checks.
- Usage and cost recording.
- Provider error normalization.
- Gemini LangChain model adapter.
- Addis AI LangChain model adapter.
- Future provider extension interface.

### 26.5.3 Agent and LangGraph infrastructure

Create or provide equivalent files for:

- Personal agent factory.
- LangChain model factory.
- Tool registry.
- Tool execution service.
- Tool authorization service.
- Tool idempotency service.
- LangChain middleware registry.
- Context assembly.
- System policy.
- User preference context.
- Project context.
- Memory context.
- Agent stream/event mapper.
- LangGraph workflow definitions.
- Approval interrupt/resume service.
- Checkpointer configuration.
- Run persistence and recovery.
- Agent error handling.

### 26.5.4 Conversation and run persistence

Create or provide equivalent domain/persistence files for:

- Thread.
- Turn.
- Message.
- Message part.
- Message event.
- Agent run.
- Generation attempt.
- Tool execution record.
- Conversation branch.
- Stream cursor/reconnection metadata.
- Message search and pagination.
- Context compaction/summarization metadata.

These records must be related by stable identifiers and owner-scoped relationships. Do not reintroduce the single indefinitely growing messages array.

### 26.5.5 Asset and document infrastructure

Create or provide equivalent files for:

- Asset metadata.
- Asset storage adapter.
- Upload service.
- Private download service.
- Asset authorization.
- Asset processing orchestration.
- Document extraction.
- Spreadsheet extraction.
- Image processing.
- OCR/vision capability adapter, if qualified.
- Audio transcription adapter.
- Audio synthesis adapter.
- Derived representation persistence.
- Document citation/provenance.
- Document generation.
- File integrity and cleanup reconciliation.

### 26.5.6 Memory, projects, tasks, and notifications

Create or provide equivalent files for:

- Project model and service.
- User memory model and service.
- Memory retrieval.
- Memory write/update/delete.
- Memory provenance.
- Memory access and namespace isolation.
- Durable task model and service.
- Reminder scheduling.
- Job claiming and leases.
- Retry and dead-letter handling.
- Notification model/service.
- Notification delivery adapters.

### 26.5.7 MCP and connectors

Create or provide equivalent files for:

- MCP connection registry.
- MCP connection lifecycle.
- MCP authentication/secret storage.
- MCP tool discovery.
- MCP tool filtering/allowlist.
- MCP result normalization.
- MCP approval policy.
- Google Drive connector.
- Telegram connector.
- Connector grant/revocation.
- Connector audit events.

### 26.5.8 Frontend V1-only files

Create or provide equivalent files for:

- Provider settings and capability display.
- Chat runtime adapter.
- Canonical stream decoder/mapper.
- Thread/run event state mapping.
- Tool approval card.
- Tool execution progress card.
- Branching chat controls.
- Reconnect/rejoin UI.
- Generated artifact/asset viewer.
- Asset upload store.
- Attachment reference component.
- Document citation renderer.
- Project context selector.
- Memory controls.
- Task/reminder views.
- Notification center.
- Provider configuration forms.
- Integration permission/connection status.
- Account export/deletion UI.

These are architectural responsibilities, not permission to create unused placeholder components. Each file must be implemented only when its phase requires it.

---

## 26.6. Non-Negotiable System Invariants and Core Principles

The following rules consolidate the relevant invariants found across the supplied source code, implementation plans, and prior development protocol. They apply to V1 where consistent with the V1 architecture.

### 26.6.1 Product identity and scope

1. The global product identity is **Personal AI Agent**.
2. The agent serves the individual's professional, personal, organizational, and practical life.
3. Restaurant operations, branch management, field inspections, and operational reports are domain-specific capabilities, not the global product identity.
4. Domain-specific modules must not constrain general chat, memory, files, tasks, or projects.
5. The core platform must remain functional when an optional connector or domain module is disconnected.
6. Existing functionality must be preserved unless the owner explicitly approves a scope change.

### 26.6.2 Single-user architecture and data ownership

1. V1 is an individual-user personal application.
2. Do not introduce organization tenancy, teams, role hierarchies, or administrative switching without an explicit approved product decision.
3. Do not create an unnecessary `role` field or RBAC system.
4. Every private database record must be associated with its owning user or with an explicitly owner-scoped parent.
5. Every database read, update, delete, and aggregation involving private data must enforce ownership.
6. Never trust a `userId`, owner, project, thread, run, or permission value supplied by the model or browser.
7. Resolve identity and authorization from authenticated server context.
8. A valid MongoDB identifier is not proof of permission.
9. Cross-user resource access must fail safely and consistently.
10. File ownership must be checked before preview, download, processing, sharing, or deletion.
11. Tool ownership checks must occur again inside the service immediately before execution.

### 26.6.3 Identifier and data-contract integrity

1. MongoDB document identity is `_id`.
2. Never overwrite a database primary key with a client-supplied ID.
3. Do not depend on Mongoose's duplicate virtual `id` when it conflicts with explicit message or asset identities.
4. Frontend libraries may require an `id` property. If so, map database `_id` to the required frontend DTO `id` explicitly and deterministically.
5. A frontend `id` is not a replacement for the authoritative database `_id`.
6. Route parameters must identify the resource explicitly, such as `:threadId`, `:messageId`, `:reportId`, or `:branchId`; avoid ambiguous generic route IDs.
7. Foreign-reference fields and DTO mappings must have consistent documented names.
8. Every request and response must have a stable, documented schema.
9. Do not silently accept unknown ownership, privilege, or immutable fields.

### 26.6.4 Architecture and code quality

1. Use modern JavaScript ES Modules (`.js` and `.jsx`) as the project source convention.
2. Do not introduce TypeScript unless an explicit ADR is reviewed and approved by the owner.
3. Use React with Vite as the frontend SPA.
4. Do not introduce SSR or Next.js as an architectural shortcut.
5. Use Express as the backend HTTP application unless a reviewed ADR establishes a concrete need to change it.
6. Keep controllers thin and business logic in application/domain services.
7. Keep provider-specific code inside provider adapters.
8. Keep LangChain/LangGraph-specific orchestration inside the agent module.
9. Domain modules must not instantiate their own model clients directly.
10. Do not create circular dependencies between modules.
11. Do not duplicate business logic in controllers, tools, and frontend components.
12. Reuse shared constants and schemas through explicit boundaries.
13. Avoid unnecessary abstractions and packages.
14. Every dependency must solve an identified V1 requirement.
15. Never disable validation or security to make a test pass.
16. Do not leave placeholder logic, fake success responses, or unimplemented TODOs in a feature marked complete.

### 26.6.5 Workspace and package governance invariant

1. The repository is organized as a single monorepo using root npm workspaces (`workspaces: ["backend", "client"]`).
2. Root `package.json` orchestrates repository commands (`dev`, `dev:backend`, `dev:client`, `verify`, `kill-ports`).
3. `backend/package.json` manages server runtime and development dependencies.
4. `client/package.json` manages frontend runtime and development dependencies.
5. Independent `package-lock.json` and `node_modules` are maintained in both `backend/` and `client/`.
6. Root scripts invoke backend and frontend tools with their correct working directories/workspaces.
7. Do not install duplicate versions of core LangChain packages or incompatible MUI X package families.
8. Keep backend-only dependencies out of the browser bundle.
9. Keep secrets, model API clients, provider credentials, and server tools out of frontend imports.
10. Ensure `chatSlice.js` manages thread metadata without conflicting with the live message streaming runtime.

### 26.6.6 Frontend interaction invariants

1. All general UI chrome must remain in English.
2. Amharic text is supported for user content, conversations, transcripts, and domain-specific content.
3. Do not silently translate user-provided language or alter original text.
4. The user must be able to distinguish loading, uploading, streaming, stopped, failed, approval-pending, and completed states.
5. Upload state must not be confused with response-generation state.
6. A user must not lose an attachment or draft merely because a stream was stopped.
7. Editing one message must not accidentally overwrite the bottom composer draft.
8. Message ordering must match the authoritative server history.
9. Use stable keys and IDs; do not infer message identity from array positions.
10. Every interactive control must have an actual working action.
11. Preserve keyboard, screen-reader, focus, and accessible-label behavior.
12. Preserve responsive behavior across mobile, tablet, and desktop.
13. Use the existing MUI theme. Do not introduce a competing design token system.
14. Do not use arbitrary hardcoded colors where an existing theme token is available.
15. Keep application-level MUI X features within the selected license tier.

### 26.6.7 Chat and turn lifecycle invariants

1. A normal user submission creates exactly one user turn.
2. A normal assistant result belongs to the exact run and user turn that initiated it.
3. Retrying an assistant response must not create a duplicate user turn.
4. Editing a previous user turn must explicitly establish what downstream messages are invalidated or branched.
5. Continuing a stopped response must continue the same intended turn/run lifecycle, not create an accidental new user request.
6. A stream error must be represented as a recoverable state and must not corrupt message ordering.
7. A fallback model attempt must not append tokens to a failed partial answer without an explicit reset/attempt boundary.
8. A model switch must not create an unintended duplicate message.
9. Tool calls and tool results must be associated by stable IDs.
10. A message can have text, files, audio, structured parts, or a valid combination of modalities.
11. A valid audio-only or attachment-only submission is a valid message even when its text is empty.
12. A message is not invalid merely because its text field is empty when it contains a valid supported attachment or audio asset.
13. The server is the source of truth for persisted history.
14. The browser's current message array is not authorization or persistence authority.
15. Pagination must use stable cursors/identifiers and must not depend on mutable array indexes.

### 26.6.8 Multimodal and asset invariants

1. Original uploaded assets must remain distinct from transcripts and extracted representations.
2. Asset identity must be stable across conversation turns.
3. A temporary browser `blob:` URL is never a durable asset identifier.
4. Derived content must record its source asset and processing provenance.
5. If the model receives a transcript rather than raw audio, the application must accurately represent that distinction.
6. Historical context must resolve authorized stored assets and their relevant derived representations.
7. Never substitute placeholder strings for actual supported content without explicitly informing the user.
8. Unsupported file types must fail clearly.
9. File size, page count, worksheet count, row count, duration, and processing time must be bounded.
10. Private assets must never be exposed through unrestricted static URLs.
11. Deleting a user asset must handle derived representations and references deliberately.
12. Temporary cleanup must never delete persistent assets that are still referenced.
13. External storage and database cleanup must be reconciled because they cannot be made atomic merely by opening a MongoDB transaction.

### 26.6.9 AI, model, and tool invariants

1. All LLM invocation must go through LangChain model abstractions or an explicitly approved LangChain-compatible adapter.
2. Do not instantiate raw provider SDK clients inside domain services, controllers, or individual tools.
3. Tool schemas do not replace authorization.
4. Runtime context must be supplied from trusted server-side state.
5. The model cannot grant itself permissions.
6. The model cannot select another user's data by inventing an ID.
7. Every side-effecting tool must have an explicit action classification.
8. Tool execution must be idempotent where retries or recovery can repeat a call.
9. Destructive and external actions must use the V1 human-approval policy.
10. A tool approval must bind to the exact action and parameters reviewed.
11. A changed tool payload requires a new approval.
12. Do not expose hidden reasoning or private chain-of-thought in the UI.
13. Expose safe execution progress, status, and user-facing explanations.
14. Do not fabricate tool results or claim an external action succeeded without an actual response.
15. Do not treat prompt instructions as a security boundary.

### 26.6.10 Draft-first and confirmation principles

Preserve the useful collaborative behaviors represented in the source:

1. When a user narrates information ambiguously, synthesize a draft before committing consequential data.
2. Ask only for unresolved facts that affect the action.
3. Do not invent branch identities, records, dates, recipients, amounts, or external targets.
4. Do not silently substitute another record when the requested record cannot be found.
5. Keep draft content distinguishable from persisted content.
6. An explicit instruction to save a clearly specified record may proceed according to the action policy.
7. An ambiguous request to create or modify an external/persistent record must use the appropriate clarification or approval gate.
8. The AI's conversational statement must match the actual number and status of persisted records.
9. A failed action must never be reported as successful.
10. User directives influence preferences and output style but cannot override application authorization, tool permission, or safety constraints.

### 26.6.11 Security, privacy, and credential invariants

1. HTTP-only secure cookies remain the default browser authentication mechanism.
2. Do not place access tokens, refresh tokens, or provider keys in local storage.
3. Use CSRF protection appropriate to cookie-based authentication.
4. Rotate refresh tokens and detect replay.
5. Validate OAuth state cryptographically; never accept unsigned user-controlled state as equivalent to a verified state.
6. Encrypt provider credentials before persistence.
7. Use authenticated encryption with unique nonces and key separation.
8. Never log secrets, raw authorization headers, cookies, provider API keys, or full sensitive request bodies.
9. All private file reads/downloads require owner authorization.
10. Protect against SSRF, path traversal, unsafe redirects, MIME spoofing, decompression bombs, parser resource exhaustion, XSS, and NoSQL injection.
11. Treat user content, file content, web content, and MCP results as untrusted input.
12. Prompt injection defenses must be implemented through application and tool boundaries, not only prompts.
13. Account export/deletion must cover messages, files, derived data, credentials, memories, scheduled tasks, integrations, and relevant backups/retention behavior.
14. Consent and provider disclosure must be explicit and understandable.

### 26.6.12 Date, calendar, and localization invariants

1. Use `Africa/Addis_Ababa` when Ethiopia-local time is the appropriate business timezone.
2. Do not equate UTC midnight with Addis Ababa business-date boundaries.
3. Keep timestamps in a well-defined canonical format.
4. Keep Ethiopian calendar display and Gregorian instant/date mapping explicit.
5. Store enough information to interpret original user-entered dates correctly.
6. Test date conversion, month/year boundaries, leap years, and midnight transitions.
7. Preserve Amharic and Ethiopic data without lossy transliteration.
8. Transliterated search terms must not replace the original stored name or content.
9. Generated PDF/DOCX/XLSX and browser views must be tested for actual Ethiopic glyph coverage.

### 26.6.13 Testing and verification invariants

1. Backend verification must include real HTTP API requests.
2. Backend integration tests must be Postman-style black-box request/response tests.
3. Backend test scripts must exercise the actual Express routes, middleware, authentication, validation, services, and database behavior.
4. Frontend build/lint/static checks can be run by the implementation agent.
5. Frontend browser automation/visual testing is controlled by the owner-approval protocol in Section 26.7.
6. Never claim tests passed unless the exact commands were executed successfully.
7. Never substitute a successful build for functional testing.
8. Never substitute a mocked controller test for an HTTP API integration test where the behavior concerns routing, middleware, authentication, streaming, or persistence.
9. Every discovered defect must receive a regression test where technically feasible.
10. A phase cannot merge merely because the application compiles.

---

## 26.7. Strict testing protocol: backend Postman-style tests and owner-controlled Antigravity browser testing

This section makes the separation between backend and frontend testing explicit.

### 26.7.1 Backend testing is the implementation agent's responsibility

The implementation agent must build and execute backend tests throughout V1.

The backend test approach must be similar to Postman: the test sends real HTTP requests to a running V1 backend and verifies the actual responses and side effects.

Do not limit backend verification to calling controller functions directly.

### 26.7.2 Native Postman-style API test scripts

Use native API test scripts residing in:

```text
backend/
└── scripts/
    └── tests/
```

Backend test scripts must:

1. Start or connect to the actual V1 backend on a dedicated test port.
2. Send requests through the public HTTP API using native Node.js fetch and assertions.
3. Use actual request methods, headers, cookies, and payloads.
4. Capture response status, headers, body, and timing.
5. Verify expected responses and error responses.
6. Verify database state after requests.
7. Verify associated file/storage state where applicable.
8. Verify owner isolation using separate test users.
9. Clean up only test-owned records and files.
10. Exit with a non-zero status when any required assertion fails.
9. Verify cleanup and fixture preservation.
10. Exit with a non-zero status when any required assertion fails.
11. Produce a readable summary of total scenarios, passed assertions, failed assertions, and elapsed time.
12. Clean up only test-owned records and files.
13. Never use the production database for automated test data.
14. Never claim a scenario passed when it was skipped or not executed.

The native Node.js `fetch`, `http`, `assert`, and built-in test capabilities may be used to implement these scripts. Do not install a separate test runner merely to imitate Postman.

If an actual Postman collection is useful, create and maintain:

`docs/testing/postman/Personal-AI-Agent-V1.postman_collection.json`

and a non-secret environment template. Do not place credentials, API keys, or production endpoints containing secrets into the collection.

Newman is not mandatory. Install it only if the owner approves a concrete need.

### 26.7.3 Required API test coverage

At minimum, the Postman-style suites must test:

**Authentication**
- Registration success.
- Duplicate account.
- Login success/failure.
- Invalid credentials.
- Session refresh.
- Concurrent refresh.
- Refresh replay.
- Logout.
- Expired session.
- Google SSO state validation.
- Unsafe return URL rejection.
- Account-linking conflicts.

**Authorization**
- Unauthenticated access.
- Authenticated owner access.
- Cross-user access denial.
- Unknown resource handling.
- Invalid ObjectId.
- User-supplied owner override.
- Unauthorized connector action.
- Revoked session.

**Assets and documents**
- Valid upload.
- Audio-only upload.
- Image upload.
- PDF/DOCX/XLSX/CSV/TXT/Markdown upload.
- Invalid MIME.
- Content-signature mismatch.
- Unsupported extension.
- Oversized file.
- Too many files.
- Excessive batch size.
- Unauthorized download.
- Valid download.
- Corrupted/unsupported document.
- Extraction timeout.
- Original-versus-derived asset retention.
- Asset deletion and cleanup reconciliation.

**Chat and conversation lifecycle**
- New thread.
- Thread listing/search.
- Message send.
- Attachment-only message.
- Audio-only message with empty text.
- History load.
- Cursor pagination.
- Retry.
- Edit.
- Branch/fork.
- Stop.
- Continue.
- Stream reconnect/rejoin.
- Duplicate request/idempotency.
- Model switch.
- Provider failure.
- Provider quota exhaustion.
- Tool call/result association.
- Error hydration after reload.

**Agent and tools**
- Tool schema validation.
- Trusted runtime context.
- Owner-scoped lookup.
- Invalid tool arguments.
- Unauthorized target.
- Duplicate tool request.
- Tool timeout.
- Tool failure.
- Approval pending.
- Approved execution.
- Rejected execution.
- Changed-parameter approval rejection.
- Graph interruption and resumption.
- Recovery after process interruption.

**Operations module**
- Branch CRUD.
- Branch archive/restore.
- Permanent deletion guard.
- Branch deletion dependency preview.
- Report creation/update/list/detail.
- Date/time validation.
- Ethiopian/Gregorian date behavior.
- Activities.
- Issues.
- Comments.
- Visits.
- Audio association.
- Search.
- Pagination.
- Archive/restore.
- Report deletion.
- Branch/report ownership isolation.
- Dashboard metrics.
- Document output.
- Telegram preview/send/confirmation.

### 26.7.4 Postman-style request and assertion example

The tests should look and behave like an API client:

```javascript
const response = await fetch(`${baseUrl}/api/v1/threads`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: authenticatedCookie,
  },
  body: JSON.stringify({
    title: "Integration Test Thread",
  }),
});

assert.equal(response.status, 201);

const payload = await response.json();

assert.ok(payload.data);
assert.ok(payload.data.thread);
assert.ok(payload.data.thread._id);

const savedThread = await Thread.findOne({
  _id: payload.data.thread._id,
  owner: testUser._id,
});

assert.ok(savedThread);
```

This is an illustrative shape, not a mandatory endpoint naming convention. The implemented API contract in the Master Specification remains authoritative.

### 26.7.5 Streaming API tests

SSE/streaming tests must use actual HTTP requests and consume the response stream.

They must verify:

- Correct content type.
- Initial connection/acknowledgment.
- Stream start.
- Text deltas.
- Tool-call events.
- Tool-result events.
- Status/progress events.
- Approval interruption.
- Terminal finish/abort/error.
- Correct event order.
- Correct run/message identifiers.
- Partial stream handling.
- Client/server disconnect.
- Reconnection and replay behavior.
- Duplicate event handling.
- No duplicate persisted user turns.
- No orphaned tool calls.
- No silent disappearance of terminal status.

The tests must parse the protocol across arbitrary network chunk boundaries. Never assume that one network read equals one complete SSE event.

### 26.7.6 Frontend browser testing requires explicit owner approval

This rule is strict.

**The implementation agent must not run an Antigravity browser test, browser automation, or visual browser inspection without the owner's explicit approval for that testing session.**

After implementing a frontend task, the agent may perform:

- JavaScript syntax checks.
- ESLint or equivalent static checks.
- Import/export validation.
- Component-level non-browser tests where configured.
- Vite production build.
- Static asset checks.
- API contract checks using backend tests.
- Code-level accessibility inspection.

However, browser interaction/visual testing must follow this sequence:

**Step 1 — Prepare the browser test**

The agent prepares an exact Antigravity browser-test plan containing:

- Which local application URL must be opened.
- Which test account/data is needed.
- Which page or route must be visited.
- Exact click/input/keyboard steps.
- Expected behavior after each step.
- Expected network/API behavior.
- Expected responsive behavior.
- Expected console/network outcome.
- Whether any test action will create, update, send, or delete real data.
- How test data will be cleaned up safely.

**Step 2 — Present the browser test to the owner**

The agent must stop and ask:

> "The frontend implementation and static checks are complete. I have prepared the Antigravity browser test for this task. Do you approve me to execute the browser test, or will you perform the browser test yourself?"

**Step 3 — Wait**

The agent must not execute the browser test until the owner explicitly approves it.

The owner can choose to:

- Approve the agent's Antigravity browser test.
- Perform the browser test personally.

Silence is not approval.

**Step 4 — Execute only after approval**

If approved, the agent must use the browser-testing capability provided by Antigravity, when available. It must not silently switch to another browser automation framework or browser connector.

If the owner chooses to test personally, the agent must provide the exact steps and wait for the owner's result.

**Step 5 — Record the actual result**

The task report must distinguish:

- Browser test executed by the agent using Antigravity.
- Browser test executed by the owner.
- Browser test not yet executed.
- Browser test unavailable due to environment/tooling.

Never claim a frontend task passed browser testing merely because the production build succeeded.

### 26.7.7 Browser testing restrictions

Unless explicitly authorized by the owner, do not introduce or use:

- Playwright.
- Cypress.
- Puppeteer.
- Selenium.
- Another external browser automation platform.
- An unrelated browser-control MCP tool.
- A substitute browser testing system.

Antigravity's browser-testing capability is the required browser automation route when the owner approves agent execution.

The owner may perform manual browser verification instead.

### 26.7.8 Test ownership and phase gates

- Backend API/Postman-style tests: implementation agent responsibility.
- Backend unit/service tests: implementation agent responsibility.
- Frontend syntax/lint/build/static tests: implementation agent responsibility.
- Frontend Antigravity browser testing: requires explicit owner approval.
- Manual frontend browser testing: owner-controlled.
- Task review and approval: owner-controlled.
- Phase merge approval: owner-controlled.

This division must not be weakened by a generic statement that all browser checks are automated by the implementation agent.

---

## 26.8. Mandatory use of `.agents/*` skills, plugins, and the installed LangChain skills

### 26.8.1 Initial recursive inventory

Before the first V1 implementation phase, recursively inspect:

`.agents/`

Do not inspect only the top level.

Inventory:

- All skills.
- All plugin directories.
- All `SKILL.md` files.
- All plugin instruction files.
- All agent definitions.
- All MCP/tool configuration references.
- All installed LangChain skills.
- All project-specific agent rules.

The inventory must include the exact path, purpose, instructions, applicability, and the tasks/phases where each skill or plugin will be used.

Create:

`docs/implementation/agents-skills-and-plugins-inventory.md`

### 26.8.2 Mandatory LangChain skills

The LangChain skills repository:

`https://github.com/langchain-ai/langchain-skills`

has already been installed in the supplied V1 workspace under the existing agent skills structure.

The implementation agent must:

1. Locate the installed LangChain skills recursively under `.agents/`.
2. Read the actual skill instructions and all relevant references.
3. Use those skills when designing, implementing, debugging, or reviewing any LangChain/LangGraph functionality.
4. Follow their instructions and workflows.
5. Revisit them when a LangChain version/API change makes a previous example stale.
6. Not reinstall or duplicate the repository if the installed copy is already present.
7. Not claim the skills were used without actually reading/applying the applicable instructions.

The LangChain skills are a required engineering resource for:

- Provider adapters.
- Agent construction.
- Tools.
- Middleware.
- Runtime context.
- LangGraph workflows.
- Persistence/checkpointing.
- Human-in-the-loop.
- Streaming.
- MCP.
- Multi-agent design.
- Retrieval and memory.
- Structured output.
- LangChain debugging and compatibility work.

### 26.8.3 All available skills and plugins

The agent must inspect and use the applicable skills/plugins already available under `.agents/*`, including but not limited to:

- `planning-with-files`.
- `systematic-debugging`.
- `verification-before-completion`.
- `requesting-code-review`.
- `receiving-code-review`.
- `finishing-a-development-branch`.
- Browser-testing skills, subject to Section 26.7 owner approval.
- Installed LangChain skills.
- Available MUI or framework documentation skills.
- Available project-specific skills and plugins.

The agent must not ignore an applicable installed skill simply because it prefers its own workflow.

Before starting a task:

1. Identify applicable skills.
2. Read the relevant skill instructions.
3. Apply the workflow.
4. Record important findings or constraints in the planning files.

For skills/plugins that are clearly unrelated to a task, document why they are not applicable. Do not execute an unrelated tool or expose credentials merely to claim every plugin was used.

### 26.8.4 MCP and external documentation tools

Use an installed official documentation MCP/plugin when it is available and appropriate.

Examples:

- LangChain official documentation resources.
- MUI official documentation resources.
- Browser testing resources from Antigravity, after approval.
- Other installed tools that genuinely support the current task.

MCP/plugin availability is not assumed. Inspect the actual environment and report unavailable tools honestly.

Never fabricate use of a plugin, skill, MCP server, subagent, or browser capability.

### 26.8.5 Planning-file synchronization

Maintain these files throughout implementation:

- `task_plan.md`
- `findings.md`
- `progress.md`
- `docs/implementation/source-disposition.md`
- `docs/implementation/agents-skills-and-plugins-inventory.md`

Preserve their previous history. Do not regenerate them from scratch and erase completed decisions, review records, or unresolved findings.

---

## 26.9. Dependency installation and package governance

### 26.9.1 The source exports are not a complete package manifest

The backend and client exports contain import statements, but they do not provide authoritative package manifests or lockfiles.

Therefore, the agent must extract the external packages used by the source code and combine them with the additional V1 requirements below.

Do not blindly install every package seen in the source exports. Native Node.js built-ins, internal package paths, obsolete packages, and transitive dependencies are not necessarily install candidates.

Create:

`docs/architecture/dependency-catalog.md`

For each direct dependency, record:

- Exact npm package name.
- Exact version selected at implementation time.
- Direct or development dependency.
- Owning module.
- Feature requiring it.
- Official documentation.
- License.
- Commercial-use permission.
- Maintenance status.
- Node/React peer requirements.
- Compatibility with the other selected packages.
- Known security advisories.
- Whether paid/Pro functionality is required.
- Whether it is installed, conditional, or rejected.

Only after the dependency catalog has been reviewed and approved should dependencies be installed.

### 26.9.2 LangChain and LangGraph packages to add

The existing code exports do not implement LangChain. V1 introduces the following core LangChain dependencies through `backend/package.json`:

| Package | Requirement | Responsibility |
|---|---|---|
| `langchain` | Required | LangChain JavaScript agent APIs, including the current `createAgent` entry point. |
| `@langchain/core` | Required direct dependency where imported | Common message, tool, model, runnable, callback, and core abstractions. |
| `@langchain/langgraph` | Required | Stateful graph workflows, commands, interrupts, graph orchestration, and related runtime functionality. |
| `@langchain/google` | Required for the initial Gemini adapter | Official LangChain Google model integration using `ChatGoogle`. |
| `@langchain/openai` | Required for the initial Addis adapter if its endpoint qualifies | `ChatOpenAI` wrapper for a verified OpenAI-compatible Addis AI endpoint. |
| `zod` | Required | Shared schemas for tools, structured outputs, and applicable validation boundaries. |

Important package alignment rules:

1. `langchain`, `@langchain/core`, `@langchain/langgraph`, and provider adapters must be version-compatible.
2. Ensure they resolve to one compatible `@langchain/core` installation.
3. Inspect actual installed exports and package types before writing imports.
4. Do not copy import paths from outdated tutorials without checking current documentation.
5. All LangChain packages belong to `backend/package.json`.
6. LangChain model/agent code belongs to the backend only.

### 26.9.3 LangChain optional/conditional packages

These packages must be considered and installed only when their corresponding V1 capability is actually being implemented.

| Package | Condition |
|---|---|
| `@langchain/langgraph-checkpoint-mongodb` | Install when durable LangGraph checkpoint persistence is implemented using its verified MongoDB checkpointer. |
| `@langchain/mcp-adapters` | Install when the V1 MCP connector phase implements LangChain-compatible MCP connections and tools. |
| `@langchain/mongodb` | Install only if a concrete MongoDB retrieval/vector integration requires it. |
| `@langchain/community` | Install only for a specific required integration that has no more appropriate focused package. Do not add it as a blanket dependency. |
| `@langchain/react` | Do not install by default because MUI X Chat is the selected frontend runtime. Consider only through an approved architecture change. |
| `@langchain/langgraph-sdk` | Do not install by default. The V1 backend runs LangGraph in-process; it is not automatically a LangGraph Platform/Agent Server client. |
| `deepagents` | Do not install by default. Its planning, filesystem, subagent, and skill harness is not required for every ordinary personal-agent turn. Evaluate only when a concrete complex-task requirement justifies it. |
| `langsmith` or related tracing packages | Optional only after privacy, data transmission, account, license, and cost review. Do not make a paid or external tracing service mandatory. |

The MongoDB checkpointer must reuse the existing database connection/client wherever the selected API permits. Do not introduce an unmanaged second connection pool simply because a package example creates a new `MongoClient`.

### 26.9.4 Google Gemini provider package

For the Gemini model integration, use:

`@langchain/google`

and the current documented `ChatGoogle` integration.

Do not use the raw Google GenAI SDK directly.

The provider must be instantiated through the LangChain model abstraction and supplied to the agent/runtime through the provider registry.

Gemini model IDs must be configuration/registry values, not hardcoded in every controller, tool, or React component.

### 26.9.5 Addis AI provider package

For Addis AI model inference, use:

`@langchain/openai`

with `ChatOpenAI` and the documented custom client configuration when the Addis API is verified to support the required OpenAI-compatible protocol.

The candidate configuration pattern is:

```javascript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: configuredModelId,
  apiKey: decryptedUserApiKey,
  configuration: {
    baseURL: verifiedProviderBaseUrl,
  },
});
```

The previously supplied candidate Addis values may be investigated:

- Base URL: `https://api.addisassistant.com/v1`
- Model ID: `addis-1`

They must not be hardcoded into the application or assumed to be currently valid without checking the actual provider API contract.

Before marking Addis AI as supported, test:

- Authentication.
- Model identifier.
- Standard messages.
- System instructions.
- Streaming.
- Stream cancellation.
- Tool calling.
- Tool-call result continuation.
- Structured output/JSON behavior.
- Usage metadata.
- Timeouts.
- Error structure.
- Rate-limit behavior.
- Multimodal capability, if claimed.

If a capability is not supported, mark it unavailable for that provider/model rather than pretending the model supports it.

### 26.9.6 Packages inherited from the source code

The following packages are candidates based on imports found in the source exports. Each must still pass the Section 26.9.1 dependency review.

**Backend/application and infrastructure candidates**

- `express`
- `mongoose`
- `dotenv`
- `helmet`
- `cors`
- `cookie-parser`
- `compression`
- `express-rate-limit`
- `express-mongo-sanitize` only if its current maintenance/compatibility and approach are approved
- `express-validator` only if retained as the single chosen HTTP validation system; otherwise prefer the V1 shared Zod schema boundary
- `express-async-handler` only if needed; Express 5 promise handling must be considered to avoid unnecessary wrappers
- `bcryptjs`
- `jsonwebtoken` if retained in the approved session/token architecture
- `multer` if selected for the bounded multipart ingestion implementation
- `mongoose-paginate-v2` only if its pagination approach is selected
- `morgan` only if retained alongside the chosen logging design; avoid duplicate request logging
- `winston`
- `winston-daily-rotate-file`
- `sharp`
- `pdfkit`
- `docx`
- `mammoth`
- `xlsx`
- `@ffmpeg-installer/ffmpeg` only if the chosen deployment/runtime strategy requires the bundled executable
- `@ffprobe-installer/ffprobe` under the same condition

Native Node.js modules such as `crypto`, `fs`, `path`, `http`, `url`, `child_process`, and `stream` are built-ins and must not be installed as npm packages.

**Frontend/application candidates**

- `react`
- `react-dom`
- `react-router`
- `@reduxjs/toolkit`
- `react-redux`
- `redux-persist` only for explicitly approved non-sensitive persisted state
- `@mui/material`
- `@mui/icons-material`
- `@mui/x-data-grid`
- `@mui/x-charts`
- `@mui/x-date-pickers`
- `@mui/x-chat`
- `@emotion/react`
- `@emotion/styled`
- `react-hook-form`
- `dayjs`
- `prop-types`
- `react-error-boundary`
- `react-toastify` only if retained rather than using the existing MUI notification pattern
- `markdown-to-jsx` only if the selected safe Markdown rendering implementation uses it
- `@fontsource/inter`
- `@fontsource/noto-sans-ethiopic`

The source references also contain imports from `@mui/utils`, `@mui/x-internals`, and `@mui/x-chat-headless`. These must not automatically become direct dependencies.

In particular:

- Use the currently documented public MUI X Chat headless subpath, such as `@mui/x-chat/headless`, where supported by the selected release.
- Install only the package structure documented for the exact chosen MUI X Chat release.
- Do not install two headless chat packages that provide overlapping runtime behavior.
- Do not depend directly on internal `@mui/x-internals` APIs.
- Do not directly import internal MUI implementation files when a supported public API exists.

### 26.9.7 Additional packages to evaluate for V1 capabilities

The following packages are not present as complete capabilities in the source exports but must be considered where the V1 requirements need them.

| Package | Purpose | Decision |
|---|---|---|
| `ai` | Vercel AI SDK stream construction/types when using its UI Message Stream protocol | Conditional; do not install automatically if the MUI-native adapter is selected. |
| `@ai-sdk/react` | Vercel `useChat` React state runtime | Do not install by default; MUI X Chat already provides the selected chat runtime. |
| `@langchain/mcp-adapters` | MCP client/connection integration with LangChain | Conditional on MCP phase. |
| `@langchain/langgraph-checkpoint-mongodb` | MongoDB-backed LangGraph checkpointer | Conditional on durable graph persistence. |
| `file-type` | File content-signature/MIME detection | Evaluate for upload validation. |
| `csv-parse` or equivalent | Robust CSV parsing | Evaluate if source/derived CSV parsing needs more than deterministic line parsing. |
| A maintained PDF text/layout extraction package | PDF extraction | Select after license, security, and file-boundary testing. |
| A maintained DOCX/XLSX generation/extraction package | Document and spreadsheet processing | Preserve existing user-visible functionality while checking package health and output fidelity. |
| A maintained HTML/Markdown sanitization package | Safe rendering of untrusted model/document output | Select and test if the chosen Markdown renderer does not provide sufficient safe behavior. |
| A maintained cron/job package | Durable scheduling support | Only if it provides the chosen job scheduler behavior; a timer alone is not durable scheduling. |

No package in this section should be installed without recording its purpose, exact version, and compatibility in the dependency catalog.

### 26.9.8 Vercel AI SDK and MUI X Chat adapter package rules

The MUI X Chat package provides its own adapter interface and a built-in adapter for the Vercel AI SDK UI Message Stream protocol.

The selected architecture must use **one** canonical UI chat runtime and **one** canonical transport adapter.

The agent must evaluate these two valid patterns:

**Pattern A — MUI-native adapter**

- MUI X Chat owns frontend chat state.
- The custom V1 adapter sends requests to the V1 backend.
- The backend streams LangChain/LangGraph events.
- A backend/client mapper converts those events into the documented MUI X Chat chunk schema.
- The frontend does not receive provider-specific model events.

**Pattern B — MUI AI SDK adapter**

- The backend translates LangChain/LangGraph output into the Vercel AI SDK UI Message Stream protocol.
- MUI X Chat uses its documented `createAiSdkAdapter` in the `@mui/x-chat/headless` public API, where supported by the selected release.
- The backend owns model invocation and tool execution; Vercel AI SDK is used for the stream protocol/adapter role only where necessary.
- The `ai` package is installed only if the selected server-side protocol implementation actually imports it or needs its runtime helpers/types.

The two patterns must not be combined into two independently managed chat state systems.

Do not add `@ai-sdk/react` or Vercel `useChat` merely because the MUI documentation demonstrates it. The MUI AI SDK adapter can consume the UI Message Stream structurally; the official documentation states that a runtime dependency on `ai` is not required solely for the adapter to accept the protocol.

Before finalizing the choice, test:

- MUI version and adapter export.
- Stream protocol version.
- Message start/end lifecycle.
- Text deltas.
- Reasoning/progress parts.
- Tool calls/results.
- Approval state.
- File/data/source parts.
- Finish/abort/error.
- Reconnection.
- Cancellation.
- Retry/regenerate.
- Pagination and conversation loading.

The architecture decision must be recorded in an ADR. Do not install both a custom MUI adapter stack and an unnecessary Vercel runtime stack.

### 26.9.9 Explicit package prohibitions

The following rules are absolute unless the owner explicitly changes the architecture through a reviewed decision:

1. Do not install `@google/genai`.
2. Do not import or instantiate `GoogleGenAI`.
3. Do not build the agent using raw provider SDK clients directly in controllers or tool files.
4. Do not install a second chat runtime that duplicates MUI X Chat.
5. Do not install a separate frontend provider SDK merely to call Gemini or Addis from the browser.
6. Do not expose model/provider API keys to browser code.
7. Do not use Vercel AI Gateway as an invisible paid provider route.
8. Do not install local model inference runtimes.
9. Do not introduce Ollama, llama.cpp, vLLM, or equivalent local inference.
10. Do not install local model/embedding/STT/TTS inference packages.
11. Do not introduce a new UI component library alongside MUI without an approved ADR.
12. Do not add packages that require MUI X Pro/Premium features unless the owner explicitly approves the commercial license.
13. Do not add packages simply because a LangChain tutorial uses them.
14. Do not install every LangChain integration package. Only install the specific providers and capabilities selected for V1.
15. Do not use `@langchain/community` as an unreviewed catch-all dependency.
16. Do not introduce duplicate state managers for the same chat data.
17. Do not create nested package manifests or lockfiles.
18. Do not regenerate the root lockfile without reviewing the dependency tree changes.

### 26.9.10 Dependency compatibility and installation sequence

The installation process must follow this order:

1. Inspect root `package.json` and lockfile state.
2. Confirm Node.js version and npm version.
3. Inspect current package registry metadata and official documentation.
4. Create the dependency catalog.
5. Check Node.js/React peer compatibility.
6. Check LangChain core version alignment.
7. Check LangGraph package compatibility.
8. Check Gemini and Addis model adapter compatibility.
9. Check MUI Core and MUI X major/version compatibility.
10. Confirm MUI Chat headless imports and adapter API.
11. Check package license and MUI commercial tier.
12. Check maintenance and known vulnerabilities.
13. Check direct/transitive duplication.
14. Present the dependency plan through the task review gate.
15. Wait for explicit task acceptance.
16. Install through the repository root only.
17. Inspect `npm ls`, peer warnings, lockfile changes, and dependency tree.
18. Run the agreed static/build/test checks.
19. Record exact installed versions in the dependency catalog.

Do not mix package installation with unrelated application implementation in a single uncontrolled task.

---

## 26.10. Absolute protection of the existing MUI theme system

This rule is specifically based on the supplied client source sections.

The existing `client/src/theme/*` directory contains a complete MUI theme setup. It already provides theme primitives, component customizations, application theme composition, theme mode state, and styling for the relevant MUI component families.

**The V1 implementation agent must use this existing theme setup as provided.**

### 26.10.1 Theme freeze

The following files are protected:

```text
client/src/theme/
├── AppTheme.jsx
├── customizations/
│   ├── charts.js
│   ├── dataDisplay.js
│   ├── dataGrid.js
│   ├── datePickers.js
│   ├── feedback.js
│   ├── index.js
│   ├── inputs.js
│   ├── navigation.js
│   └── surfaces.js
├── themePrimitives.js
└── useThemeMode.js
```

The agent must:

1. Inspect and understand this theme setup.
2. Use it in the V1 frontend.
3. Import and consume its existing components, tokens, overrides, and theme-mode behavior.
4. Keep its directory structure and filenames.
5. Leave its source code untouched by default.
6. Not rewrite it to fit a different preferred theme architecture.
7. Not rename `themePrimitives.js` to another filename.
8. Not move `customizations/*` to another folder.
9. Not create duplicate theme primitives.
10. Not replace the theme with a newly generated MUI theme.
11. Not introduce another theme provider.
12. Not change the theme merely for visual preference or architectural cleanliness.
13. Not refactor the theme as part of an unrelated page/component task.

### 26.10.2 Only permitted exception: demonstrated runtime defect

A theme file may be modified only when the agent has identified a concrete runtime problem that cannot be correctly solved at the point of use.

A qualifying runtime issue includes:

- A reproducible exception or application crash.
- A confirmed incompatible public MUI API.
- A verified theme-provider failure.
- A broken theme-mode state transition.
- A confirmed component override causing incorrect runtime behavior.
- A demonstrated rendering failure caused by the theme itself rather than a consumer component.

A visual preference, style disagreement, minor refactoring opportunity, or desire to rename/move files is not a runtime issue.

Before changing a protected theme file, the agent must:

1. Identify the exact file and lines.
2. Reproduce the issue.
3. Explain why the defect originates in the theme itself.
4. Explain why the issue cannot be fixed in the consuming component.
5. Propose the smallest possible correction.
6. Add a regression check.
7. Present the proposed correction for owner review through the task protocol.

Do not modify a protected theme file before that correction has been accepted.

### 26.10.3 MUI component usage rule

When building V1 pages and components:

- Use the existing theme provider.
- Use the existing theme tokens and semantic overrides.
- Use current public MUI APIs.
- Keep styling consistent with the existing theme.
- Do not duplicate component overrides in individual pages.
- Do not hardcode new design systems.
- Do not disable accessibility or focus behavior to suppress console warnings.
- Verify compatibility of every MUI X component against the selected package version.

The theme is an existing implementation asset, not a blank canvas for redesign.

---

## 26.11. LangChain/LangGraph implementation rules and API discipline

This section makes the LangChain requirements concrete for implementation.

### 26.11.1 Use LangChain's actual agent API

Use the current documented JavaScript API.

The agent factory is imported from:

```javascript
import { createAgent } from "langchain";
```

The current agent configuration uses the `model` option.

The canonical shape is:

```javascript
const agent = createAgent({
  model: configuredChatModel,
  tools: registeredTools,
  systemPrompt: systemPolicy,
});
```

Do not use `llm` as the model option for the current `createAgent` API unless the exact installed version's official API documents that option.

Do not import `createAgent` from an old or incorrect `@langchain/langgraph/prebuilt` path.

Do not confuse older `createReactAgent` examples with the current `createAgent` API.

Before implementing, the agent must check the installed package's exact exports and current LangChain reference.

### 26.11.2 Model and provider construction

Models must be created through a provider factory, not scattered across controllers.

The provider factory must:

1. Receive the selected provider ID and model ID.
2. Resolve the provider configuration from the server-side registry.
3. Retrieve the owner's encrypted credential.
4. Decrypt it only for the required request lifetime.
5. Validate that the selected model is enabled for the user.
6. Validate requested capability compatibility.
7. Instantiate the correct LangChain model adapter.
8. Apply timeouts, retry, usage, and provider-specific settings.
9. Return a LangChain-compatible chat model.
10. Record safe provider/model metadata for auditing and cost tracking.

The domain layer must never directly instantiate `ChatGoogle`, `ChatOpenAI`, or a provider SDK.

### 26.11.3 Standard agent versus custom graph

Use `createAgent` for a normal tool-using conversational agent when it meets the requirement.

Use a custom LangGraph workflow only when the task genuinely needs:

- Multiple controlled steps.
- Conditional routing.
- Durable interruption.
- Human approval.
- Checkpoint/recovery.
- Multi-agent coordination.
- Long-running or scheduled execution.
- A structured process with distinct state transitions.

Do not create a complex graph for a simple text answer without a reason.

### 26.11.4 Messages and multimodal content

Use LangChain's message abstractions and content blocks.

Preserve:

- Message identity.
- Role.
- Content parts.
- Tool-call identity.
- Tool result identity.
- File/asset references.
- Audio transcript provenance.
- Image/document content.
- Usage metadata.
- Provider metadata that is safe and needed.
- Timestamps.
- Run and generation-attempt identity.

Do not flatten all multimodal content into one string.

Do not treat a transcript as equivalent to the original audio file.

### 26.11.5 Tools

Every tool must have:

- A unique stable name.
- A clear description.
- A Zod input schema.
- A specific module owner.
- A trusted runtime context.
- An authorization policy.
- An action-risk category.
- An approval requirement.
- An idempotency strategy.
- A result schema.
- A bounded output size.
- An audit event.

The tool implementation must validate authorization again immediately before data access or external side effects.

### 26.11.6 Middleware

Use built-in middleware where it solves a specific V1 requirement.

Evaluate, where appropriate:

- Model call limits.
- Tool call limits.
- Bounded retries.
- Summarization/context editing.
- Human approval.
- PII detection/redaction.
- Tool selection.
- Structured output validation.
- Context injection.
- Provider disclosure.
- Audit correlation.

Custom middleware must address V1-specific needs without duplicating business logic already owned by application services.

Do not add middleware merely because it exists.

### 26.11.7 Short-term memory and checkpointing

Use a LangGraph checkpointer for durable graph execution state when needed.

The production design must not depend on an in-memory saver.

Use an authenticated server-owned thread identity and explicit checkpoint namespace.

A graph `thread_id` is an identifier, not an authorization token.

The application must validate ownership before loading or resuming graph state.

Checkpoint data must not become a duplicate source of truth for every application record. Thread messages, durable application events, and graph state must have explicit ownership and consistency rules.

### 26.11.8 Human-in-the-loop

Use LangGraph interrupts or an equivalent durable workflow for actions that need approval.

The approval flow must:

1. Validate the requested action.
2. Construct the exact proposed action.
3. Pause before the side effect.
4. Persist approval state.
5. Present exact action details to the user.
6. Bind approval to the exact action and parameters.
7. Resume with the decision.
8. Revalidate ownership and permissions.
9. Execute idempotently if approved.
10. Record the result and audit event.

Do not place a destructive action before an approval interrupt and assume that the interrupt will undo it.

### 26.11.9 MCP

Use the current LangChain MCP adapter when MCP functionality is implemented.

MCP connections must be explicitly registered and configured.

The implementation must cover:

- Connection lifecycle.
- Transport.
- Authentication.
- Credential storage.
- Tool discovery.
- Tool allowlists.
- Result filtering.
- Progress.
- User-input/elicitation.
- Approval.
- Connection shutdown.
- Error reporting.
- Audit events.

MCP tools are external capabilities, not automatically trusted application tools.

Do not expose every tool from every connected MCP server to every agent.

### 26.11.10 Retrieval and long-term memory

Retrieval must be grounded in an actual user need.

Start with deterministic retrieval where it is sufficient:

- Exact search.
- MongoDB text search.
- Metadata filtering.
- Owner/project/thread scoping.
- Keyword search.
- Full-text search.

Do not add embeddings simply because LangChain offers vector retrieval.

Use remote embeddings only after the provider, pricing, region, language, privacy, and capability have been qualified. No local embedding inference.

Long-term memory must have:

- Source/provenance.
- Owner and project scope.
- Memory type.
- Confidence/validity policy.
- Created/updated timestamps.
- User review/edit/delete.
- Retrieval authorization.
- Cache invalidation after update/deletion.

### 26.11.11 Multi-agent and skills

Do not implement a multi-agent system for appearance.

Use subagents or handoffs only when a task genuinely benefits from separate contexts, distinct tools, or independently bounded expertise.

For example, document analysis, web research, operations-domain analysis, and task planning may eventually justify separate specialist contexts, but each must have a defined input/output contract and permission set.

"Skills" loaded into an agent are instructions and reusable workflows. They do not grant permissions.

The user's installed LangChain skills under `.agents/` are development resources; they must not be confused with unrestricted runtime filesystem capabilities for the end-user Personal AI Agent.

---

## 26.12. Provider architecture: any provider in the future, Google Gemini and Addis AI initially

### 26.12.1 Provider-neutral architecture

The long-term provider architecture must allow the application to support different model providers without rewriting the conversation, agent, tool, database, or frontend architecture.

The provider registry must distinguish:

- Provider.
- Model.
- API/base URL.
- Authentication method.
- Model capabilities.
- Context size.
- Input modalities.
- Output modalities.
- Streaming support.
- Tool-calling support.
- Structured-output support.
- Usage metadata.
- Rate limits.
- Quota state.
- User credential.
- Cost/price policy.
- Region/account availability.
- Terms/privacy status.

A provider adapter must return the common LangChain model abstraction or an explicitly documented LangChain-compatible adapter.

### 26.12.2 Initial V1 providers

The initial provider set is:

1. **Google Gemini**
2. **Addis AI**

These are the only initial LLM provider integrations to be implemented and qualified for V1.

The architecture must remain extensible for additional providers later.

Do not implement a dozen additional provider integrations simply because an adapter exists.

### 26.12.3 Google Gemini

Use the LangChain Google integration:

- Package: `@langchain/google`
- Model abstraction: current documented `ChatGoogle`
- Provider: Google Gemini
- Authentication: user-authorized API key or approved credential configuration.
- Invocation: through LangChain and the V1 provider registry.

Do not use the raw Google GenAI SDK.

Do not import or instantiate `GoogleGenAI`.

Do not install `@google/genai`.

Do not put Gemini-specific request payload construction in the chat controller or domain tools.

### 26.12.4 Addis AI

Use the LangChain OpenAI-compatible model wrapper:

- Package: `@langchain/openai`
- Model abstraction: `ChatOpenAI`
- Base URL: verified Addis AI API endpoint.
- Model ID: configured Addis model ID.
- API key: user-authorized credential.

The previous candidate `https://api.addisassistant.com/v1` and `addis-1` must be verified against the current Addis API documentation and actual provider behavior.

Do not treat an API as fully OpenAI compatible merely because it accepts a chat-completion request. Run the qualification suite in Section 9 and Section 26.9.

### 26.12.5 Addis audio capabilities

The Addis speech-to-text and text-to-speech capabilities must be evaluated separately from its LLM chat-completion capabilities.

A provider can support one capability without supporting another.

The agent must establish whether the current Addis API/SDK supports:

- File transcription.
- Live speech-to-text.
- Amharic.
- English.
- Mixed-language transcription.
- Audio playback output.
- Speech synthesis.
- Streaming.
- Cancellation.
- Duration/size limits.
- Cost/quota behavior.

Do not assume `addisai` SDK support for speech means that Addis LLM chat is also integrated, or vice versa.

### 26.12.6 Per-provider capability qualification

Provider support must be recorded at the model/capability level.

For example:

| Capability | Gemini | Addis AI |
|---|---|---|
| Text generation | Must qualify | Must qualify |
| Streaming text | Must qualify | Must qualify |
| Tool calling | Must qualify | Must qualify |
| Structured output | Must qualify | Must qualify |
| Image input | Must qualify | Must qualify |
| PDF/document understanding | Must qualify | Must qualify |
| Audio file understanding | Must qualify | Must qualify |
| Speech transcription | Qualify separately | Qualify separately |
| Live speech-to-text | Qualify separately | Qualify separately |
| Text-to-speech | Qualify separately | Qualify separately |
| Amharic | Must test | Must test |
| English | Must test | Must test |
| Cancellation | Must test | Must test |
| Usage metadata | Must test | Must test |

Do not copy generic capability checkmarks into this matrix without test evidence.

### 26.12.7 User provider/model settings

The user must be able to configure their provider/model according to the selected V1 settings design.

The application must:

- Validate provider URL and model ID.
- Validate API-key presence without returning the full key.
- Test provider connectivity.
- Store credentials securely.
- Support changing the active model between turns.
- Show the provider/model used for a response.
- Record usage and quota metadata where available.
- Clearly handle invalid keys and unsupported capabilities.
- Never silently switch providers.
- Never silently switch to a paid model.

### 26.12.8 Any future provider

A future provider must integrate through the provider registry and LangChain adapter boundary.

It must not require a rewrite of:

- Thread/message persistence.
- Agent tools.
- Domain services.
- Frontend chat runtime.
- Message/stream protocol.
- Approval workflow.
- Memory model.

Provider-specific differences must remain inside the provider adapter and capability qualification logic.

---

## 26.13. Final implementation gates and owner review requirements

The existing implementation protocol in Section 19 remains authoritative. This section makes its application to the eight requirements above explicit.

### 26.13.1 Phase 0 — Source and environment verification

Before implementation begins:

1. Inspect the complete V1 repository.
2. Inspect the entire `.agents/` tree.
3. Read the installed LangChain skills.
4. Inventory every installed applicable plugin/skill.
5. Verify the three authoritative documentation inputs.
6. Confirm the exact 61 backend and 153 client source sections.
7. Build the complete 214-entry source disposition.
8. Reconcile the proposed directory tree with the physical workspace.
9. Identify existing MUI theme files and mark them protected.
10. Inspect root manifest/lockfile state.
11. Establish the package dependency catalog.
12. Verify current LangChain APIs and package exports.
13. Establish the Postman-style backend test harness plan.
14. Establish the Antigravity browser-testing approval process.
15. Present Phase 0 findings through the normal review gate.

Do not begin application implementation while source inventory completeness, dependency architecture, or repository safety remains unresolved.

### 26.13.2 Per-task implementation

For every task:

1. Read the exact source section(s).
2. Trace affected callers and dependencies.
3. Identify all preserved behavior.
4. Identify the V1 target files.
5. Identify relevant invariants.
6. Implement the focused task.
7. Add backend Postman-style API tests where backend behavior is involved.
8. Run applicable automated checks.
9. If a frontend browser test is required, prepare it and request owner approval.
10. Update the source disposition and planning files.
11. Present the complete walkthrough and evidence.
12. Stop for owner review.

Do not move to the next task until the owner accepts the current task according to Section 19.

### 26.13.3 Per-task review report

Every task report must state:

- Task ID and title.
- Requirement IDs.
- Source reference file sections examined.
- Exact source export line ranges.
- V1 target files.
- Behaviors preserved.
- Behaviors corrected.
- Behaviors moved or split.
- Dependencies introduced/removed.
- Database/API/stream contract effects.
- Security and privacy implications.
- Backend tests executed and exact results.
- Frontend static/build checks executed and exact results.
- Browser testing status and owner approval status.
- Screenshots or test evidence when available.
- Remaining risks.
- Current Git branch and working tree status.
- Whether anything has been staged or committed.

The report must ask for review and wait.

### 26.13.4 Per-phase review and merge

When all tasks in a phase have been reviewed and committed:

1. Execute the complete backend API/Postman-style phase suite.
2. Execute relevant regression suites.
3. Execute the client build and static checks.
4. Complete owner-approved browser testing or record that the owner will test manually.
5. Verify source-disposition coverage.
6. Verify requirements traceability.
7. Verify all phase files and dependency changes.
8. Verify no private data, secrets, fixtures, or generated artifacts were accidentally committed.
9. Verify the theme remains untouched unless an approved runtime correction exists.
10. Update planning files and prepare the phase review.
11. Stop for owner review.
12. Merge and close the phase branch only after explicit owner approval.

### 26.13.5 No implicit approval

The following do not count as approval:

- Silence.
- A successful build.
- A successful test script.
- A completed walkthrough.
- A statement that the work looks ready.
- A previous phase approval.
- A subagent's approval.
- A plugin's recommendation.
- A branch being clean.

Task acceptance, browser-test authorization, commit authorization where required by Section 19, and phase merge authorization remain separate decisions.

---

## 26.14. Final governing statement

The purpose of this addendum is to eliminate ambiguity in the implementation of V1.

The agent must not treat the source exports as a loose collection of ideas. They are the complete functional and implementation reference that must be examined, mapped, and accounted for.

The V1 implementation must therefore satisfy all of the following:

1. Recreate the approved V1 directory architecture.
2. Account for all 214 source sections.
3. Read the complete code of every source file before implementing its responsibility.
4. Preserve every existing user-facing capability represented in the source exports.
5. Correct known defects instead of copying defective implementation details.
6. Follow the applicable non-negotiable invariants in this specification.
7. Build and run backend Postman-style API tests.
8. Require explicit owner approval before Antigravity browser testing.
9. Inspect and use all applicable installed `.agents/*` skills and plugins, including the installed LangChain skills.
10. Install the approved additional LangChain, LangGraph, provider, and application packages through their respective backend/client workspace manifests.
11. Never use `@google/genai` or raw `GoogleGenAI` in the V1 agent architecture.
12. Initially integrate Google Gemini and Addis AI through LangChain model abstractions.
13. Keep the provider boundary extensible for future providers.
14. Use the supplied MUI theme files without modification unless a specific runtime defect is proven and accepted.
15. Follow task-level review and phase-level merge approval exactly as specified in Section 19.

**No source-file behavior may be silently omitted. No package may be silently introduced. No protected theme file may be casually changed. No browser test may be run without approval. No task may be treated as accepted without owner review. No phase may be merged without explicit owner authorization.**

This addendum completes and clarifies the mandatory implementation rules for Personal AI Agent V1.

---

**End of Master Personal AI Agent V1 Documentation.**
