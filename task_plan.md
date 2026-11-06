# Task Plan: Personal AI Agent V1 (Operon)

Authoritative Reference: `docs/Master-Personal-AI-Agent-V1-documentation.md`

## Goal
Deliver a fully verified, production-grade Personal AI Agent V1 with provider-neutral LangChain/LangGraph architecture, single root package manifest, protected MUI theme, durable multimodal chat lifecycle, Postman-style backend API integration test suite, and complete functionality preservation across all 214 historical V0 source sections.

## Next Step
Implement Task 3.6: Asset and document API tests and Phase 3 consolidation.

## Current Phase
Phase 3: Private Asset and Document Foundation - in_progress

## Phases

### Phase 0: Repository & Specification Validation (Preflight)
- [x] Read master specification `docs/Master-Personal-AI-Agent-V1-documentation.md` completely
- [x] Inspect physical repository tree, tools, Node v24.15.0, npm 11.11.0, and package manifests
- [x] Inspect Git status (unborn `main`, empty remote)
- [x] Inventory `.agents/plugins/superpowers` (15 skills, 4 subagents) and `.agents/skills` (23 skills)
- [x] Review LangChain/LangGraph skills and guidelines
- [x] Verify existing Material UI theme (`client/src/theme/*`) and establish strictly protected status
- [x] Confirm historical codebase exports (61 backend files, 153 client files = 214 source sections total)
- [x] Account for existing scripts (`backend/scripts/installFonts.js`, `backend/scripts/killPort.js`, `client/scripts/cleanDist.js`, `client/scripts/killPort.js`)
- [x] Establish source disposition register (`docs/implementation/source-disposition.md`)
- [x] Establish agents, skills, and plugins inventory (`docs/implementation/agents-skills-and-plugins-inventory.md`)
- [x] Remove temporary snapshot `personal-ai-agent-current-codebase-state.md`
- [x] Owner review and approval received
- **Status:** complete

### Phase 1: Root Foundation & Engineering Quality System
- [x] Task 1.1: Root manifest consolidation via native `npm install` (no hardcoded versions), wire existing scripts (`installFonts.js`, `killPort.js`, `cleanDist.js`), remove nested manifests and client lockfile, update `render.yaml`, configure `vercel.json`, document `docs/architecture/dependency-catalog.md` (Approved & Committed in 6df8fb3)
- [x] Task 1.2: Root package scripts for dev, build, lint, backend test, port management (Verified)
- [x] Task 1.3: Clean install verification into root `node_modules` and verify root `package-lock.json` (Verified)
- [x] Task 1.4: Base Express application bootstrap (`backend/src/app.js`, `server.js`) with environment validation and health check (Completed & Verified)
- [x] Task 1.5: Native Postman-style HTTP integration test harness (`tests/api/health.test.js`) (Completed & Verified)
- [x] Task 1.6: Client Vite/React 19 build validation using root dependencies and existing theme (Verified)
- [x] Phase 1 Gate & Owner Merge Review (Approved & Merged in 6c4b80d)
- **Status:** complete

### Phase 2: Identity, Sessions, and Account Security
- [x] Task 2.1: Database connection lifecycle, schema options, User, AuthIdentity, and Session models with secure refresh token rotation (Committed - f6a5a2a)
- [x] Task 2.2: Email/password authentication, password hashing, and Google OAuth 2.0 with signed state validation (Committed - 4dfeb59)
- [x] Task 2.3: Session middleware (`requireUser`), CSRF protection, and rate limiting (Committed - f3debef)
- [x] Task 2.4: Credential envelope encryption service for BYOK provider credentials (Committed - 2aef358)
- [x] Task 2.5: Identity and session API tests (Committed - 1f94414)
- [x] Phase 2 Gate & Owner Merge Review (Approved & Merged into main in 1f94414, Synced to origin/main)
- **Status:** complete

### Phase 3: Private Asset and Document Foundation
- [x] Task 3.1: Private object storage abstraction and asset metadata models (Committed - bb9375c)
- [x] Task 3.2: Secure streaming multipart upload pipeline with MIME sniffing and size bounds (Completed & Verified - 20/20 passing)
- [x] Task 3.3: Deterministic document parsing (PDF, DOCX, XLSX, CSV, TXT, Markdown) (Completed & Verified - 12/12 passing)
- [x] Task 3.4: Asset representation and provenance models (Completed & Verified - 7/7 passing)
- [x] Task 3.5: Private signed download and asset lifecycle reconciliation (Completed & Verified - 15/15 passing)
- [ ] Task 3.6: Asset and document API tests
- [ ] Phase 3 Gate & Owner Merge Review
- **Status:** in_progress

### Phase 4: Durable Threads, Turns, Messages, Events
- [ ] Task 4.1: Thread, Turn, Message, and MessageBranch persistence models (non-monolithic)
- [ ] Task 4.2: Cursor-based message pagination and thread management APIs
- [ ] Task 4.3: Turn lifecycle service (normal send, retry, edit, branch, continue)
- [ ] Task 4.4: RunEvent durable event log with sequence cursors for stream replay
- [ ] Task 4.5: Conversation and message API tests
- [ ] Phase 4 Gate & Owner Merge Review
- **Status:** pending

### Phase 5: Provider Registry and LangChain Model Integration
- [ ] Task 5.1: Provider capability registry and qualification schemas
- [ ] Task 5.2: Central model factory (`createConfiguredChatModel`) supporting ChatGoogle and ChatOpenAI
- [ ] Task 5.3: Google Gemini integration via `@langchain/google` (ChatGoogle)
- [ ] Task 5.4: Addis AI integration via `@langchain/openai` (ChatOpenAI with custom baseURL)
- [ ] Task 5.5: Structured output, token usage tracking, and provider failover policy
- [ ] Task 5.6: Model adapter and provider API tests
- [ ] Phase 5 Gate & Owner Merge Review
- **Status:** pending

### Phase 6: Chat UI and Canonical Stream Adapter
- [ ] Task 6.1: Canonical stream protocol and SSE event mapper
- [ ] Task 6.2: Frontend Chat runtime adapter (MUI X Chat integration)
- [ ] Task 6.3: Chat layout, composer, attachment shelf, and turn rendering
- [ ] Task 6.4: Lifecycle controls: stop, retry, continue, edit, branch, model selection
- [ ] Task 6.5: Stream reconnection, error boundaries, and accessibility validation
- [ ] Task 6.6: Owner browser testing request & verification
- [ ] Phase 6 Gate & Owner Merge Review
- **Status:** pending

### Phase 7: Agent Tools, Workflows, Approval and Audit
- [ ] Task 7.1: Zod-based tool registry with trusted server runtime context
- [ ] Task 7.2: LangGraph workflow engine with durable Mongo checkpointer
- [ ] Task 7.3: Human-in-the-loop approval workflow (interrupt/resume with payload hash)
- [ ] Task 7.4: Core tools: search, memory, file analysis, task draft
- [ ] Task 7.5: Tool execution audit log and error recovery
- [ ] Task 7.6: Tool and workflow API tests
- [ ] Phase 7 Gate & Owner Merge Review
- **Status:** pending

### Phase 8: Multimodal Understanding and Document Workflows
- [ ] Task 8.1: Vision processing pipeline for images and document layouts
- [ ] Task 8.2: Remote speech-to-text pipeline (Amharic & English)
- [ ] Task 8.3: Document Q&A with strict grounding and citations
- [ ] Task 8.4: Autonomous document generation (PDF with Ethiopic fonts, DOCX, XLSX, CSV)
- [ ] Task 8.5: Multimodal continuity across multi-turn sessions
- [ ] Task 8.6: Multimodal API tests
- [ ] Phase 8 Gate & Owner Merge Review
- **Status:** pending

### Phase 9: Projects, Memory, Tasks, Reminders and Notifications
- [ ] Task 9.1: Project workspaces and context isolation
- [ ] Task 9.2: Declarative user directives and long-term memory governance
- [ ] Task 9.3: Personal tasks, context-aware reminders, and durable queue scheduler
- [ ] Task 9.4: Notification center and delivery dispatch
- [ ] Task 9.5: Memory and project API tests
- [ ] Phase 9 Gate & Owner Merge Review
- **Status:** pending

### Phase 10: External Connectors and MCP
- [ ] Task 10.1: Connector authorization framework and encrypted credential storage
- [ ] Task 10.2: Google Drive connector (OAuth, private listing, export, approval for share)
- [ ] Task 10.3: Telegram connector (bot integration, preview, approval for broadcast)
- [ ] Task 10.4: MCP adapter integration with SSRF and allowlist controls
- [ ] Task 10.5: Connector API tests
- [ ] Phase 10 Gate & Owner Merge Review
- **Status:** pending

### Phase 11: Operations Domain Module Preservation
- [ ] Task 11.1: Bounded module architecture: branch management and location profiles
- [ ] Task 11.2: Operational inspection reports, checklist capture, and visit workflows
- [ ] Task 11.3: Issue tracking, assignment, and remediation follow-up
- [ ] Task 11.4: Dual calendar support (Ethiopian & Gregorian) and bilingual reporting
- [ ] Task 11.5: Operational dossier generation and domain agent tools
- [ ] Task 11.6: Module enable/disable boundary verification and API tests
- [ ] Phase 11 Gate & Owner Merge Review
- **Status:** pending

### Phase 12: Hardening, Regression, Release and Handover
- [ ] Task 12.1: Full end-to-end regression test suite (all 52 requirements)
- [ ] Task 12.2: Security review, dependency audit, and SSRF/IDOR penetration tests
- [ ] Task 12.3: Render cloud deployment blueprint and runbook verification
- [ ] Task 12.4: User documentation and release readiness sign-off
- [ ] Phase 12 Gate & Final Release Approval
- **Status:** pending

## Key Decisions & Rules
1. **Package Installation Rule:** Never manually hardcode version numbers in `package.json`. Always run native `npm install` from root so npm resolves current compatible versions and generates the root `package-lock.json`.
2. **Existing Scripts Preservation:** Wire `backend/scripts/installFonts.js` into root `postinstall` for Render deployment; wire `backend/scripts/killPort.js` into root `kill-ports` and pre-dev commands; wire `client/scripts/cleanDist.js` into post-build cleanup.
3. **MUI Theme Protection:** `client/src/theme/*` is marked strictly protected and consumed as-is.
4. **Provider Neutrality:** `@google/genai` is strictly forbidden. Initial providers: Google Gemini (`@langchain/google` ChatGoogle) and Addis AI (`@langchain/openai` ChatOpenAI with custom baseURL).
5. **Git Protocol:** Base commit on `main`, work on `phase-N-*` branches, task commit only after owner approval, phase merge only after owner authorization.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| N/A | 1 | Preflight stage completed cleanly. |
