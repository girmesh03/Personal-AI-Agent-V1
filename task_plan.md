# Task Plan: Personal AI Agent (Operon) V1 Platform Re-engineering

Use this file as the durable roadmap for the task. Create it before complex work and keep it current as phases change. Subsequent phases will be appended as they start without overriding existing historical records.

## Goal

Systematically re-engineer the functional capabilities of historical V0 into a production-grade, clean-slate Express 5 / React 19 / LangGraph V1 platform adhering strictly to all 59 Governing Protocols.

## Next Step

Await Product Owner authorization for Git commit on `phase-1-foundational-architecture`, then await Product Owner direction for the next phase.

## Current Phase

Phase 1 (Completed & Verified)

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

*(Next phases will be appended here as designated by the Product Owner without overriding).*

## Key Questions

1. **How should Google Gemini and regional models be configured in LangChain?**  
   *Answer:* Use clean Protocol 28 identifiers (`gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-3-flash-preview`, `addis-1`) without speculative proxy URLs, and never reference `@langchain/google-genai`.
2. **How should user media assets be persisted?**  
   *Answer:* Cloudinary is the exclusive cloud storage backend for user avatars and attachments; zero local application server `/uploads` filesystem access is permitted.
3. **What constants belong in `constants.js` at Phase 1?**  
   *Answer:* Only constants actively imported and used by Phase 1 foundational files (`HTTP_STATUS`, `AI_MODELS`, `STT_ENGINES`, `EMAIL_REGEX`, `USER_NAME_LENGTH`, `PASSWORD_MIN_LENGTH`, `BCRYPT_SALT_ROUNDS`, `JWT_EXPIRY`, `COOKIE_MAX_AGE`, `CHAT_CONSTANTS`, `TTS_CONSTANTS`, `REPORT_CONSTANTS`). Unused constants (pagination limits, regexes, UI display labels) are strictly purged until their respective phases.

## Decisions Made

| Decision | Rationale |
| :--- | :--- |
| Embedded Mongoose transforms directly in `User.js` | User explicitly instructed that `schemaOptions.js` was not requested; embedding transforms isolates User schema concerns cleanly. |
| Replaced Morgan with native Express logger streaming to Winston | Morgan was not installed in `backend/package.json`; native middleware provides zero extra dependencies and streams directly to Winston's PII-sanitized logger. |
| Dynamic JWT and cookie lifespans via `parseDurationToMs` | Avoids hardcoding static millisecond literals; respects environment configuration in `backend/.env`. |
| Envelope encryption at rest for BYOK and connector credentials | Enforces Protocol 22: API keys and secrets stored as AES-256-GCM ciphertexts with `select: false`. |
| 1-to-1 constants parity with client | Enforces Protocol 8 & 27: prevents contract drift between server and client while keeping both free of unused bloat. |

## Errors Encountered

| Error | Attempt | Resolution |
| :--- | :--- | :--- |
| `ERR_MODULE_NOT_FOUND` on `morgan` in `app.js` | 1 | Replaced `morgan` import with lightweight native Express logging middleware streaming to Winston `logStream`. |
| PowerShell `&&` syntax failure in terminal commands | 1 | Replaced `&&` statement separators with PowerShell `;` syntax. |
| Unused constants bloat in `constants.js` | 1 | Audited all usages across `backend/src/` and purged unreferenced constants (`DEFAULT_PAGE_LIMIT`, `PASSWORD_REGEX`, UI display labels/formatting helpers). |

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

- All changes remain uncommitted on branch `phase-1-foundational-architecture` until explicit Product Owner authorization (Protocol 25 & 59).
- Subsequent phases will be appended sequentially to this file as they are initiated.
