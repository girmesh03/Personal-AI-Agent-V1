# Task Plan: Personal AI Agent (Operon) V1 Platform Re-engineering

Use this file as the durable roadmap for the task. Create it before complex work and keep it current as phases change. Subsequent phases will be appended as they start without overriding existing historical records.

## Goal

Systematically re-engineer the functional capabilities of historical V0 into a production-grade, clean-slate Express 5 / React 19 / LangGraph V1 platform adhering strictly to all 71 Governing Protocols.

## Next Step

Phase 3 complete, merged into main, synced to remote, and feature branch cleaned up. Ready for Phase 4 (Conversational State Machine, SSE Streaming & Chat Routes) input recognition and planning.

## Current Phase

Phase 3: Conversational Intelligence Core — Chat, Message & Asset Schema Architecture (Complete & Merged to Main)

## Phases

### Phase 1: Foundational Architecture & Security Core

- [x] Analyze 13 Phase 1 core backend files from V0 baseline
- [x] Design clean-slate Express 5 setup, Mongoose 9 replica set connector, Winston PII logger, Zod 4 env validation
- [x] Implement AES-256-GCM envelope encryption utility (`crypto.js`) for BYOK and connector credentials
- [x] Implement dual-token JWT and secure cookie helpers (`token.js`) with dynamic durations
- [x] Implement Mongoose 9 User model (`User.js`) with Cloudinary/Drive/Telegram integrations and Protocol 37 directives
- [x] Implement Express 5 middleware pipeline (`authMiddleware.js`, `notFoundHandler.js`, `errorHandler.js`)
- [x] Configure canonical `/api/v1` router and health endpoints; purge legacy aliases and static `/uploads`
- [x] Establish universal constants with 1-to-1 backend/client parity; purge unused constants
- [x] Author standard Protocol 24 REST Client vertical-slice specification (`.http`) with explicit test assertions
- [x] Verify multi-suite checks: backend verify (0 errors), client lint (0 errors, 0 warnings), client build (0 errors)
- **Status:** complete

### Phase 2: Authentication & User Management

- [x] Exhaustive audit of 6 V0 auth and user backend files and 14 client files
- [x] Reconcile Phase 1 files (`routes/index.js`, `utils/constants.js`, `models/User.js`, `middleware/authMiddleware.js`, `utils/token.js`, `utils/crypto.js`)
- [x] Author comprehensive Phase 2 Implementation Plan artifact at `<appDataDir>/brain/<conversation-id>/phase-2-auth-user-plan.md`
- [x] Await Product Owner review and explicit confirmation/approval (Zero-Code Invariant)
- [x] Implement generic Zod 4 request validation middleware (`backend/src/middleware/validate.js`)
- [x] Implement pure utility helpers for identity derivation and chat ID normalization (`backend/src/utils/authUtils.js`)
- [x] Implement Zod 4 strict schemas (`authValidation.js`, `userValidation.js`) enforcing Protocol 32, 37, 39, 40
- [x] Implement Authentication service, controller, and routes (`authService.js`, `authController.js`, `authRoutes.js`)
- [x] Implement User domain service, controller, and routes (`userService.js`, `userController.js`, `userRoutes.js`)
- [x] Mount `/auth` and `/users` routes on `/api/v1` router (`backend/src/routes/index.js`)
- [x] Reconcile constants across `backend/src/utils/constants.js` and `client/src/utils/constants.js` (Protocol 8, 27)
- [x] Author deterministic Protocol 24 REST Client vertical-slice tests across 32 scenarios (`backend/tests/phase2-auth-user.http`)
- [x] Boost Task 1: Multi-Provider AI Architecture & Upstream Documentation Alignment (`AI_PROVIDERS`, `AI_MODELS`, `MODEL_PROVIDER_MAP`, `AI_PROVIDER_CONFIG`, `CHAT_CONSTANTS`, Protocol 63)
- [x] Boost Task 2: Elimination of Trivial `DEFAULT_POSITION` Constant (Protocol 67)
- [x] Boost Task 3: Development-Only Credentials & BYOK Production Isolation (`env.js` warning, `backend/.env.example`, Protocol 64)
- [x] Boost Task 4: Total Purge of "Supervisor" Nomenclature across code, tests, and documentation (Protocol 65)
- [x] Boost Task 5: Canonical RESTful Integrations Hierarchy (`/integrations/:service/*`), Cloudinary Integration, and JSDoc Protocol 20/36/44/60 Compliance (Protocol 66)
- [x] Boost Task 6: Dual-Modality Automated & Interactive Test Architecture (`tests/http/`, `tests/integration/`, `testHarness.js`, `phase1-foundation.test.js`, `phase2-auth-user.test.js`, guaranteed teardown hygiene, Protocol 68)
- [x] Boost Task 7: Pure Provider-Namespaced AI Foundation Models (`AI_MODELS`, `SUPPORTED_AI_MODELS`, dynamic `MODEL_PROVIDER_MAP`, `CHAT_CONSTANTS`, Protocol 69)
- [x] Boost Task 8: Unified Agent Configuration & BYOK Route Consolidation (`PATCH /api/v1/users/agent-config` with `apiKeys`, purged `/api-keys`, Protocol 70)
- [x] Boost Task 9: Universal JSDoc Consistency & Strong Type Contracts Across Non-Theme Runtimes (Protocol 71)
- [x] Extract Protocols 68 to 71 into `docs/Governing-rules.md`, `AGENTS.md`, `MASTER_PROMPT.md`
- [x] Verify multi-suite checks: all 35 integration tests PASS (9 in phase 1, 26 in phase 2), backend verify (0 errors), client lint (0 errors, 0 warnings), client build (0 errors)
- [x] Product Owner authorized git commit, merge to main, push to origin/main, and feature branch cleanup
- **Status:** complete

### Phase 3: Chat, Message & Asset Schema Architecture

- [x] Deep audit of historical V0 chat, message, and asset architecture across backend and client
- [x] Identify all V0 flaws, anti-patterns, and technical debt to eliminate in V1
- [x] Author comprehensive Phase 3 Implementation Plan artifact at `<appDataDir>/brain/<conversation-id>/phase-3-chat-message-asset-plan.md`
- [x] Refine Asset.kind to strictly `['file', 'image', 'audio']`, omit synthetic `purpose` field, clarify selective HITL interrupts vs autonomous tool execution, and document real-world multimodal vs extracted document ingestion
- [x] Create dedicated feature branch `phase-3-chat-message-asset-schema` (Git Protocol compliance)
- [x] Product Owner review & explicit approval granted (Zero-Code Invariant lifted)
- [x] Implement normalized `Chat` schema (`backend/src/models/Chat.js`)
- [x] Implement normalized `Message` schema (`backend/src/models/Message.js`)
- [x] Implement universal `Asset` schema (`backend/src/models/Asset.js`)
- [x] Update centralized constants (`ASSET_CONSTANTS`, `MESSAGE_CONSTANTS`, `CHAT_CONSTANTS`) in 1-to-1 parity
- [x] Author automated integration test suite (`backend/tests/integration/phase3-schema.test.js`)
- [x] Run full multi-suite verification (all 57 tests pass across 3 suites, backend verify 0 errors, client lint 0 errors/warnings, client build 0 errors)
- [x] Skeptical review & flaw eradication: fixed query-level cascading deletion in `Chat.js`, enforced integer constraints on `Message.sequence` and `Asset.sizeBytes`, added asset reference cleanup on `Asset` deletion, and expanded tests to 22 tests in Phase 3
- [x] Product Owner authorized git commit, merge to main, push to origin/main, and feature branch cleanup
- **Status:** complete

*(Next phases will be appended here as designated by the Product Owner without overriding).*

## Key Questions

1. **How should Google Gemini and regional models be configured in LangChain?**
   *Answer:* Use clean Protocol 28 identifiers (`gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-3-flash-preview`, `addis-1`) without speculative proxy URLs, and never reference `@langchain/google-genai`.
2. **How should user media assets be persisted?**
   *Answer:* Cloudinary is the exclusive cloud storage backend for user avatars and attachments; zero local application server `/uploads` filesystem access is permitted.
3. **What constants belong in `constants.js` at Phase 1?**
   *Answer:* Only constants actively imported and used by Phase 1 foundational files (`HTTP_STATUS`, `AI_MODELS`, `STT_ENGINES`, `EMAIL_REGEX`, `USER_NAME_LENGTH`, `PASSWORD_MIN_LENGTH`, `BCRYPT_SALT_ROUNDS`, `JWT_EXPIRY`, `COOKIE_MAX_AGE`, `CHAT_CONSTANTS`, `TTS_CONSTANTS`, `REPORT_CONSTANTS`). Unused constants (pagination limits, regexes, UI display labels) are strictly purged until their respective phases.
4. **How are names populated upon registration under Protocol 32 and Protocol 38?**
   *Answer:* Registration body strictly accepts `{ email, password }` only. The `authService.registerUser` method invokes `deriveNamesFromEmail` to deterministically derive `firstName` and `lastName` from the email local part.
5. **How is Three-Tier Account Deletion implemented under Protocol 42?**
   *Answer:* The `DELETE /api/v1/users/account` endpoint executes Tier 1 (purges user record and Cloudinary assets via Mongoose session transaction) and Tier 2 (clears `accessToken` and `refreshToken` cookies across all root and API paths). The response returns a clean confirmation for the client to execute Tier 3 (purge client caches and redirect).

## Decisions Made

| Decision | Rationale |
| :--- | :--- |
| Embedded Mongoose transforms directly in `User.js` | User explicitly instructed that `schemaOptions.js` was not requested; embedding transforms isolates User schema concerns cleanly. |
| Replaced Morgan with native Express logger streaming to Winston | Morgan was not installed in `backend/package.json`; native middleware provides zero extra dependencies and streams directly to Winston's PII-sanitized logger. |
| Dynamic JWT and cookie lifespans via `parseDurationToMs` | Avoids hardcoding static millisecond literals; respects environment configuration in `backend/.env`. |
| Envelope encryption at rest for BYOK and connector credentials | Enforces Protocol 22: API keys and secrets stored as AES-256-GCM ciphertexts with `select: false`. |
| 1-to-1 constants parity with client | Enforces Protocol 8 & 27: prevents contract drift between server and client while keeping both free of unused bloat. |
| Decouple into domain services (`authService.js`, `userService.js`) | Eliminates fat controllers from V0; controllers focus on HTTP serialization, status codes, and cookies; services handle business logic and transactions. |
| Strict Zod 4 request validation middleware (`validate.js`) | Replaces V0 `express-validator`; provides unified schema validation across all route boundaries before controllers (Protocol 18, 39, 40). |
| Extraction of `authUtils.js` for name derivation and chat ID normalization | Enforces Protocol 31: utilities live in dedicated utility modules and are never re-exported from controllers. |
| Dedicated `DELETE /api/v1/users/account` endpoint | Enforces Protocol 42: implements comprehensive three-tier account deletion and resource purge. |

## Errors Encountered & Remediation Log (Phase 1 & 2 Boost Validation)

| Defect / Error | Location | Impact | Resolution |
| :--- | :--- | :--- | :--- |
| `ERR_MODULE_NOT_FOUND` on `morgan` | `app.js` | Import failure | Resolved (native logger stream). |
| PowerShell `&&` syntax failure | Terminal | Command chaining | Resolved (use `;`). |
| Unused constants bloat | `constants.js` | Protocol 30 dead tokens | Resolved (purged unused exports). |
| `validate.js` fails on empty/cookie requests | `middleware/validate.js` | 422 on `POST /auth/refresh`, toggle, and empty bodies | Resolved (applied `req[source] ?? {}`). |
| `User.js` unconditionally requires password | `models/User.js` | Google SSO account creation crashes | Resolved (conditional password required function). |
| Google SSO callback URL mismatch | `env.js`, `.env` | 404 on Google SSO redirect | Resolved (aligned with `/api/v1/auth/google/sso/callback`). |
| REST Client assertion error envelope mismatch | `*.http` test files | Assertions fail reading `error.errorCode` | Resolved (aligned assertions to flat `response.body.errorCode`). |
| Trivial `DEFAULT_POSITION` export | `constants.js` | Protocol 67 trivial constant | Resolved (permanently purged from constants, models, and services). |
| Incomplete upstream headers in `AI_PROVIDER_CONFIG` | `constants.js` | Protocol 63 / Upstream docs alignment | Resolved (added `authHeader: 'x-api-key'` for Addis AI and `authHeader: 'x-goog-api-key'` for Google). |
| Unenforced provider/model consistency in Zod schema | `validations/userValidation.js` | Incompatible model/provider pairs allowed | Resolved (added `.refine()` cross-validating `defaultModel` and `defaultProvider` and enforcing 0 thinking budget for Addis AI). |
| Unsynchronized provider/model update in `userService.js` | `services/userService.js` | Partial updates created mismatched DB state | Resolved (auto-synchronized `defaultProvider` and `defaultModel` and clamped thinking budget to 0 for Addis AI). |
| Dummy assertion in `verifyEndpoints.js` | `scripts/verifyEndpoints.js` | Fake test 15 `assert(true)` | Resolved (replaced with real request testing strict schema field rejection per Protocol 60). |
| Unexercised authenticated flows for new integrations | `scripts/verifyEndpoints.js` | Shallow verification (only 401s tested) | Resolved (expanded suite to 28 assertions exercising real authenticated flows for agent config and Cloudinary). |
| Missing `defaultProvider` in `.http` scenario 20 | `tests/phase2-auth-user.http` | Incomplete test coverage | Resolved (updated scenario 20 and added scenarios 20b and 20c). |
| Incomplete OAuth credential purge | `userService.js` | Refresh tokens & chat IDs retained on disconnect | Resolved (nullified all tokens & IDs on disconnect). |
| Prohibited legacy cookie shim | `authMiddleware.js` | Protocol 44 violation (`req.cookies?.token`) | Resolved (purged legacy `token` cookie check). |
| Missing null guard in `updateUserDirectives` | `userService.js` | Potential 500 on `Object.fromEntries(undefined)` | Resolved (added defensive null-check). |
| Cryptographic key coupling to JWT secret | `crypto.js` | JWT rotation breaks encrypted DB tokens | Resolved (decoupled via dedicated `ENCRYPTION_KEY`). |
| Duplicate / Ambiguous `GOOGLE_*` variables | `.env`, `env.js` | Protocol 44 shim violation; confusing SSO vs Drive | Resolved (canonicalized to `GOOGLE_SSO_*` and `GOOGLE_DRIVE_*`). |
| Missing Google SSO CSRF State & Error Redirection | `authController.js` | Login CSRF vulnerability; raw JSON 401 error pages | Resolved (cryptographic state cookie & client error redirects). |
| Dropped `googleId` identity in Google SSO | `User.js`, `authService.js` | Missing schema field; identity lost on email change | Resolved (added indexed `googleId` to User schema & service). |
| Missing top-level `@authToken` in REST Client | `phase2-auth-user.http` | Protocol 24 diagnostic warnings & input popups | Resolved (purged Bearer auth; aligned with Protocol 17 & 61 pure cookie auth). |
| Deprecated `ZodTypeAny` in JSDoc | `middleware/validate.js` | JSDoc type warning in Zod 4 | Resolved (replaced with `z.ZodType`). |
| Controller direct access to raw `req.body` | `authController.js`, `userController.js` | Bypassed schema validation gate | Resolved (enforced `req.validated.body` per Protocol 60). |
| Sensitive tokens exposed in response JSON | `authController.js` | Security violation; token leakage in body | Resolved (enforced pure HttpOnly cookies per Protocol 17 & 61; zero tokens in JSON). |
| Deprecated `.email()` method signature in Zod 4 | `authValidation.js`, `userValidation.js` | Zod 4 deprecation warning | Resolved (replaced with `.regex(EMAIL_REGEX)`). |
| Body-parser malformed JSON SyntaxError (500) | `errorHandler.js` | Malformed JSON caused 500 UNHANDLED_EXCEPTION | Resolved (intercepted as 400 `MALFORMED_JSON` per Protocol 62). |
| `.http` syntax error (`> {%` sent in POST body) | `phase1-foundation.http`, `phase2-auth-user.http` | Trailing non-whitespace char after JSON | Resolved (purged `> {%` script blocks; clean JSON format). |

## Pending Investigations (Mandatory)

### 1. Re-evaluation of `AI_MODELS` & `CHAT_CONSTANTS`
- **Flagged Date:** 2026-11-19
- **Status:** PENDING ARCHITECTURAL INVESTIGATION (Must be resolved during agent/chat phase)
- **Core Directive:** The current definition, structure, and consumption of `AI_MODELS` and `CHAT_CONSTANTS` in `constants.js` and `User.js` represents an interim foundational baseline. It requires a dedicated, deep architectural investigation before building agent runtime logic.
- **Investigation Items:**
  1. Determine how models should be defined for clean LangChain integration without speculative `baseURL` hacks and strictly avoiding `@langchain/google-genai`.
  2. Evaluate whether models should be resolved via dynamic provider factory adapters rather than static constants.
  3. Validate how Addis AI (`addis-1`) and Google Gemini models (`gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-3-flash-preview`) decouple execution parameters (thinking budgets, token ceilings, fallbacks) from Mongoose schema defaults.
  4. Refactor `constants.js` and `User.js` accordingly once the optimal LangGraph/LangChain architecture is established.

## Notes

- All changes remain uncommitted on branch `phase-2-auth-and-user` until explicit Product Owner authorization (Protocol 25 & 59).
- Subsequent phases will be appended sequentially to this file as they are initiated.
