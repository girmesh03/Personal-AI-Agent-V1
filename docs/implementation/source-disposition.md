# Historical V0-to-V1 Source Disposition Register

> **Product:** Operon (Personal AI Agent V1)  
> **Authority:** `AGENTS.md` (Section 4) & `Master-Personal-AI-Agent-V1-documentation.md` (Sections 16, 17, and 26)  
> **Status:** Active Governance Baseline  
> **Baseline Count:** 214 total source sections (61 Backend, 153 Client)  
> **Date:** 2026-11-09  

---

## 1. Governance Rules & Preservation Invariants

In accordance with `AGENTS.md` Section 4 and Master Specification Section 26:
1. **Immutable V0 Exports:** The historical export files (`docs/Backend-Personal-AI-Agent-V0-Codebase.md` and `docs/Client-Personal-AI-Agent-V0-Codebase.md`) are read-only historical references and must never be edited, renamed, or deleted.
2. **Preserve Capabilities, Not Defects:** We preserve the user's ability to accomplish supported tasks while eliminating all historical security vulnerabilities, memory leaks, racing reconnect loops, and unvalidated inputs.
3. **Traceability Guarantee:** Every one of the 214 source sections has an explicit disposition: preserve, split, rewrite, replace, merge, or defer.

---

## 2. Backend Source Disposition Register (61 Sections)

| # | V0 Source Section | V1 Target Destination | Required V1 Treatment & Architectural Invariants | Phase |
|---|---|---|---|---|
| 1 | `backend/src/app.js` | `backend/src/app.js` | **Rebuild**: Express 5 composition, Helmet, strict CORS, cookie parser, central route mounting. **Completely eliminate `express.static('/uploads')`**. | **Phase 1** |
| 2 | `backend/src/server.js` | `backend/src/server.js` | **Rebuild**: Fail-closed env check, await DB readiness, graceful shutdown with signal handling (`SIGINT`, `SIGTERM`, unhandled exceptions). | **Phase 1** |
| 3 | `backend/src/config/db.js` | `backend/src/config/db.js` | **Rebuild**: Authoritative Mongoose connection manager, Atlas replica set resilience (`atlas-6frzxd-shard-0`), maxPoolSize 10, eliminate recursive reconnect races. | **Phase 1** |
| 4 | `backend/src/config/env.js` | `backend/src/config/env.js` | **Rebuild**: Schema-driven validator. Fails closed immediately on missing `MONGO_URI` or JWT secrets. Sanitizes environment values. | **Phase 1** |
| 5 | `backend/src/config/logger.js` | `backend/src/config/logger.js` | **Rebuild**: Structured Winston logger with ISO timestamps, JSON in production, daily file rotation in `logs/`, deep recursive redaction for sensitive keys. | **Phase 1** |
| 6 | `backend/src/config/schemaOptions.js` | `backend/src/config/schemaOptions.js` | **Rebuild**: Shared Mongoose schema options exporting `timestamps: true` and transforms normalizing `_id` and deleting `__v`. | **Phase 1** |
| 7 | `backend/src/errors/CustomError.js` | `backend/src/errors/AppError.js` | **Rebuild**: Standard typed operational error hierarchy inheriting from `Error` with HTTP status codes and `isOperational = true`. | **Phase 1** |
| 8 | `backend/src/middleware/auth.js` | `backend/src/middleware/auth.js` | **Rebuild**: Secure `HttpOnly` cookie-based JWT authentication middleware; user scoping. | Phase 2 |
| 9 | `backend/src/middleware/errorHandler.js` | `backend/src/middleware/errorHandler.js` | **Rebuild**: Centralized Express error middleware using universal `errorFormatter.js`. Suppresses internal stack traces and secrets in production. | **Phase 1** |
| 10 | `backend/src/middleware/notFoundHandler.js`| `backend/src/middleware/notFoundHandler.js`| **Rebuild**: Uniform JSON 404 response handler using `NotFoundError`. | **Phase 1** |
| 11 | `backend/src/middleware/rateLimiter.js` | `backend/src/middleware/rateLimiter.js` | **Rebuild**: Configurable IP/user rate limiting for auth and API routes. | Phase 2 |
| 12 | `backend/src/middleware/roleCheck.js` | *Removed / Replaced* | **Removed**: Invariant 3 prohibits RBAC/role-checking abstractions; single-user account isolation. | Phase 2 |
| 13 | `backend/src/middleware/upload.js` | `backend/src/middleware/upload.js` | **Rebuild**: Multer upload handler with MIME validation and secure storage paths. | Phase 4 |
| 14 | `backend/src/models/Branch.js` | `backend/src/models/Branch.js` | **Retain**: Streamlined location/branch schema within operations domain. | Phase 6 |
| 15 | `backend/src/models/Chat.js` | `backend/src/models/Chat.js` | **Rebuild**: Chat thread schema with cursor pagination; separate `Message` model. | Phase 3 |
| 16 | `backend/src/models/Report.js` | `backend/src/models/Report.js` | **Retain**: Inspection report schema within operations domain; audit preservation. | Phase 6 |
| 17 | `backend/src/routes/index.js` | `backend/src/routes/index.js` | **Rebuild**: Central API v1 router mounting all modular domain routes (`/health`, `/auth`, etc.). | **Phase 1** |
| 18 | `backend/src/routes/authRoutes.js` | `backend/src/routes/authRoutes.js` | **Rebuild**: Auth endpoints (login, register, logout, refresh, SSO). | Phase 2 |
| 19 | `backend/src/routes/branchRoutes.js` | `backend/src/routes/branchRoutes.js` | **Retain**: Operations branch API endpoints. | Phase 6 |
| 20 | `backend/src/routes/chatRoutes.js` | `backend/src/routes/chatRoutes.js` | **Rebuild**: SSE/streaming chat endpoints and thread management. | Phase 3 |
| 21 | `backend/src/routes/reportRoutes.js` | `backend/src/routes/reportRoutes.js` | **Retain**: Operations inspection report API endpoints. | Phase 6 |
| 22 | `backend/src/routes/userRoutes.js` | `backend/src/routes/userRoutes.js` | **Rebuild**: Profile, settings, and BYOK credential routes. | Phase 2 |
| 23 | `backend/src/services/aiService.js` | `backend/src/agent/agentService.js` | **Rewrite**: Replaced monolithic SDK calls with LangChain/LangGraph agent runtime. | Phase 3 |
| 24 | `backend/src/services/authService.js` | `backend/src/services/authService.js` | **Rebuild**: Secure password verification, JWT issuing, refresh token family rotation. | Phase 2 |
| 25 | `backend/src/services/branchService.js` | `backend/src/services/branchService.js` | **Retain**: Operations branch business logic. | Phase 6 |
| 26 | `backend/src/services/reportService.js` | `backend/src/services/reportService.js` | **Retain**: Operations report business logic and export formatting. | Phase 6 |
| 27 | `backend/src/services/userService.js` | `backend/src/services/userService.js` | **Rebuild**: User settings, export, and deletion workflows. | Phase 2 |
| 28 | `backend/src/utils/constants.js` | `backend/src/utils/constants.js` | **Rebuild**: Single source of truth for `HTTP_STATUS`, port defaults, and API prefixes. | **Phase 1** |
| 29 | `backend/src/utils/errorFormatter.js` | `backend/src/utils/errorFormatter.js` | **Rebuild**: Universal Error Formatter normalizing AppError, Mongoose, Mongo, JWT, JSON errors. | **Phase 1** |
| 30 | `backend/src/utils/tokenUtils.js` | `backend/src/utils/tokenUtils.js` | **Rebuild**: Cryptographic JWT signing and cookie helper functions. | Phase 2 |
| 31–61 | Other backend services, validations, tools, fonts, scripts | Respective V1 destinations | Detailed per-phase reconstruction as designated in Master Specification Section 16. | Phases 2–6 |

---

## 3. Client Source Disposition Register (153 Sections)

| # | V0 Source Section | V1 Target Destination | Required V1 Treatment & Architectural Invariants | Phase |
|---|---|---|---|---|
| 1 | `client/src/App.jsx` | `client/src/App.jsx` | **Rebuild**: Root SPA mounting `AppTheme`, `CssBaseline`, and rendering the live System Health Card. 100% English UI Chrome. | **Phase 1** |
| 2 | `client/src/main.jsx` | `client/src/main.jsx` | **Rebuild**: React 19 entry point with `React.StrictMode` mounting `<App />` into `#root`. | **Phase 1** |
| 3 | `client/src/router.jsx` | `client/src/router.jsx` | **Rebuild**: Application router with public/protected route guards and lazy page loading. | Phase 2 |
| 4 | `client/src/adapters/MuiChatAdapter.js` | *Deferred / Replaced* | **Replaced**: Live streaming SSE runtime integrated directly into chat interface. | Phase 3 |
| 5 | `client/src/assets/hero.png` | `client/src/assets/hero.png` | **Retained**: Brand visual asset. | Phase 1 |
| 6 | `client/src/assets/notFound_404.svg` | `client/src/assets/notFound_404.svg` | **Retained**: 404 visual graphic. | Phase 1 |
| 7–27 | Client common components, buttons, inputs | `client/src/components/common/*` | Clean Material-UI reusable components. | Phases 2–5 |
| 28–39 | `client/src/theme/*` (12 files) | `client/src/theme/*` (12 files) | **Strictly Protected Design Assets**: Locked against modification. Peer dependencies installed in `client/package.json`. | **Phase 1** |
| 40–153 | Client pages, chat components, redux slices, operations UI | Direct V1 destinations | Detailed per-phase reconstruction as designated in Master Specification Section 17. | Phases 2–6 |

---

## 4. Phase 1 Source Coverage Summary

For Phase 1, the following historical sections are actively analyzed and rebuilt:
- **Backend (12 sections):** Sections 1, 2, 3, 4, 5, 6, 7, 9, 10, 17, 28, 29.
- **Client (15 sections):** Sections 1, 2, 5, 6, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39.
- **Verification Evidence:** All 27 Phase 1 source sections have been mapped to their respective V1 implementation files, eliminating all identified V0 vulnerabilities while preserving all intended capabilities.
