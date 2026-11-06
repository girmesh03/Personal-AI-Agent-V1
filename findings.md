# Findings & Architecture Discoveries: Personal AI Agent V1 (Operon)

Authoritative Reference: `docs/Master-Personal-AI-Agent-V1-documentation.md`

## 1. Specification & Requirements Findings
- **Product Identity:** Personal AI Agent V1 (Operon) is an individual, general-purpose private AI partner for professional and personal life. It is NOT globally branded or constrained as a restaurant reporting tool.
- **Operations Domain Module:** The restaurant supervision capabilities (branches, reports, visits, issues, Ethiopian calendar, bilingual Amharic dossiers) must remain 100% functional, but encapsulated as an isolated, detachable domain module (`modules/operations/`).
- **Requirements Breakdown:** 52 total requirements:
  - 43 Core Platform (27 P0, 15 P1, 1 P2)
  - 9 Operations Domain Module (1 P0 isolation gate, 8 P1 functional requirements)
  - Combined: 28 P0, 23 P1, 1 P2.
- **Provider Architecture:** Extensible provider registry. Initial LLM providers:
  1. Google Gemini via `@langchain/google` (`ChatGoogle`).
  2. Addis AI via `@langchain/openai` (`ChatOpenAI` configured with custom `baseURL`).
  - **PROHIBITION:** Complete architectural ban on `@google/genai` and raw `GoogleGenAI` SDK.
  - Both inherit from LangChain's `BaseChatModel`, presenting an identical uniform interface (`.invoke()`, `.stream()`, `.bindTools()`) to application services and agents.
  - Remote model inference only. Absolutely no local LLMs, no local OCR, no local whisper/speech models, no local embedding models.
- **Chat State Ownership:** Single canonical chat runtime on frontend (MUI X Chat adapter) translating a canonical server-side SSE event stream. No competing Redux live-message store.

## 2. Repository & Infrastructure Baseline
- **Operating System:** Windows (PowerShell 5.1).
- **Node.js Runtime:** `v24.15.0`.
- **npm Package Manager:** `11.11.0`.
- **Current Git Branch:** `main` (Unborn, no commits yet).
- **Remote Git Status:** `origin` configured to `https://github.com/girmesh03/Personal-AI-Agent-V1.git`. Remote repository is completely empty (`git ls-remote origin` returned 0 branches/tags/commits).
- **Single Root Manifest Rule:**
  - Root `package.json` currently declares `"workspaces": ["backend", "client"]`.
  - Nested manifests exist: `backend/package.json` and `client/package.json` (and `client/package-lock.json`).
  - Master specification Section 6.3 mandates a single root `package.json` and single root `package-lock.json`. Nested manifests and lockfiles must be retired.
  - **Package Installation Policy:** Never hand-code version numbers in `package.json`. Always run native `npm install` from root so npm resolves current compatible versions and produces the root `package-lock.json`.
  - **Cloud Deployment Architecture:**
    - Render (`render.yaml`): `rootDir: .`, `buildCommand: npm install --include=optional`, `startCommand: npm run start:api`. Automatic Ethiopic fonts/FFmpeg permission install via root `postinstall`.
    - Vercel (`vercel.json`): `buildCommand: npm run build:web`, `outputDirectory: client/dist`, `framework: vite`. Vercel builds from root and serves `client/dist`.
- **Existing Scripts Accounting:**
  - `backend/scripts/installFonts.js`: Headless font and binary permission installer for Render/Docker. Wired to root `"postinstall": "node backend/scripts/installFonts.js"`.
  - `backend/scripts/killPort.js`: Cross-platform TCP port termination. Wired to root `"kill-ports": "node backend/scripts/killPort.js"` and pre-dev commands.
  - `client/scripts/cleanDist.js`: Client build directory cleaner. Wired to root `"clean:client": "node client/scripts/cleanDist.js"`.
  - `client/scripts/killPort.js`: Port 3000 cleaner. Preserved for client-specific targeting.

## 3. Historical Codebase Source Inventory (V0 Reference)
- Authoritative exports verified:
  - `docs/Backend-Personal-AI-Agent-V0-Codebase.md`: 61 source sections, 21,491 lines.
  - `docs/Client-Personal-AI-Agent-V0-Codebase.md`: 153 source sections, 39,082 lines.
  - Total source sections: **214 sections**.
- All 214 sections have been cross-checked and mapped in `docs/implementation/source-disposition.md`.
- Functional capabilities to preserve:
  - Authentication, sessions, profile, preferences, BYOK credentials.
  - Chat management, message history, streaming, stop, retry, continue, edit, branching.
  - File upload, preview, extraction, citations, durable multi-turn context (images, audio, PDF, DOCX, XLSX, CSV, TXT, Markdown).
  - Document generation (PDF with Ethiopic fonts, DOCX, XLSX, CSV, Markdown, JSON).
  - Connectors (Google Drive with signed OAuth, Telegram with message preview/approval).
  - Operations domain (branches, reports, visits, issues, Ethiopian calendar, bilingual Amharic dossiers).

## 4. Protected Assets
- **Material UI Theme (`client/src/theme/`):**
  - Fully implemented design system with design tokens (`themePrimitives.js`), color schemes, CSS baseline, and component customizations for inputs, data display, feedback, navigation, surfaces, charts, dataGrid, datePickers, and chat streaming/typing indicators (`AppTheme.jsx`).
  - Marked strictly **PROTECTED**. No modifications permitted unless a genuine runtime defect originating inside the theme itself is reproduced, documented, and approved by the owner.
- **Font Assets (`backend/src/assets/fonts/`):**
  - 8 font files for Latin and Ethiopic typography (`Inter-Bold.ttf`, `Inter-Regular.ttf`, `NotoSansEthiopic-Bold.ttf/woff`, `NotoSansEthiopic-Regular.ttf/woff`, `NotoSansLatin-Bold.ttf/Regular.ttf`) plus `fonts.conf`.

## 5. Agents, Skills, and Plugins Inventory
- Installed under `.agents/`:
  - `superpowers` plugin (v6.3.0) with 15 process/engineering skills, 4 subagents (`code-reviewer`, `implementer`, `re-reviewer`, `spec-reviewer`), rules (`using-superpowers.md`), and test suites.
  - 23 skills in `.agents/skills/`, locked by `skills-lock.json`, covering LangChain, LangGraph, Deep Agents, Swarm, Eval Engineering, and Planning with Files.

## 6. Testing Architecture Decisions
- **Backend API Testing:**
  - Postman-style end-to-end HTTP integration tests using native Node.js HTTP/fetch requests and assertions against the actual running Express app on a dedicated test port.
  - Tests exercise full stack: HTTP route -> middleware -> validation -> controller -> service -> Mongo database -> SSE stream parser.
  - Isolated test database (`operon-test`). No mocked controller unit tests as substitute for API tests.
- **Frontend Verification & Owner Approval Gate:**
  - Static checks, ESLint, type-checking, and production Vite builds run automatically.
  - **MANDATORY GATE:** Antigravity browser testing is strictly owner-controlled. The agent must NEVER launch or automate browser testing without preparing the test plan and receiving explicit owner approval.

## 7. Base Express Application Bootstrap & Security Architecture
- **Environment Schema (`config/env.js`):**
  - Fully schema-validated via Zod. Replaces V0's unvalidated array checks with strict type coercion, defaults, duration parsing (`parseDurationToMs`), and test environment fallbacks.
  - Deeply frozen `env` object prevents runtime configuration mutation.
- **Error Architecture (`shared/errors/AppError.js`):**
  - Inherits from `AppError` base class with `isOperational = true`, `statusCode`, `errorCode`, and `details`.
  - Invariant strictly enforced: 401 status is `UNAUTHENTICATED` (never `UNAUTHORIZED`).
  - Compatibility bridges established for `errors/CustomError.js`, `middleware/errorHandler.js`, `middleware/notFoundHandler.js`, and `routes/index.js`.
- **Security Middlewares (`app.js`):**
  - Standard Helmet security headers (`nosniff`, `SAMEORIGIN`, etc.).
  - CORS with exact allowed origins from `CLIENT_ORIGIN` plus local dev ports and production `*.vercel.app`.
  - JSON and URL-encoded body parsers with 10MB bounds.
  - **Prohibition Enforced:** Direct public static upload serving (`express.static('/uploads')`) is omitted completely. All asset access will require authenticated, owner-scoped download routes.
- **Native Postman-Style HTTP Integration Harness (`tests/api/health.test.js`):**
  - Real over-the-wire HTTP requests to ephemeral port using native Node.js test runner (`node:test`) and native `fetch`.
  - 6 test cases covering canonical `/api/v1/health`, `/health`, `/api/health`, 404 structured envelope, Helmet security headers, and CORS credentials.
  - Extraneous `/healthz` container alias was removed to strictly adhere to the master specification and historical contract.
  - 100% pass rate in < 2 seconds.

## 8. TypeScript Declaration & IDE Workspace Configuration
- **Type Declaration Strategy:**
  - Standardized on official `@types/*` devDependencies for plain JavaScript libraries lacking built-in types:
    `@types/node`, `@types/express`, `@types/morgan`, `@types/cors`, `@types/cookie-parser`, `@types/jsonwebtoken`, `@types/bcryptjs`, `@types/multer`.
  - Installed via native `npm install -D` without hardcoded versions.
- **Root Workspace Configuration (`jsconfig.json`):**
  - Configured ES2022 / NodeNext module resolution, `checkJs: false`, and `skipLibCheck: true`.
  - Resolves all implicit-any diagnostics while providing full autocomplete, parameter hints, and type safety for developer ergonomics.

## 9. Phase 1 Completion & Gate Merge Review
- **Deliverables:** Single root manifest and lockfile, consolidated dependencies, build and lint pipelines, base Express 5 app, Zod environment validation, operational error handling, Winston structured logging, native API health test suite, and cloud deployment manifests (`render.yaml`, `vercel.json`).
- **Gate Status:** 100% verified and approved by owner. Merged to `main` via fast-forward merge. Ready for Phase 2 initialization.

## 10. Phase 2 Identity & Session Security Architecture (Task 2.1)
- **Database Connection Engine (`infrastructure/database/connection.js`):**
  - Exponential backoff (1s -> 2s -> 4s -> ... up to 30s) with 10% random jitter.
  - Exposes `isDbConnected()` and `getDbStatus()` allowing `/health` and `/api/v1/health` probes to distinguish HTTP service health from database readiness.
- **Session Registry & Breach Detection (`modules/identity/domain/Session.js`):**
  - **No Plaintext Tokens:** Refresh tokens are hashed via SHA-256 before persistence.
  - **Family Lineage:** Each login establishes a unique `family` UUID. When rotating a token (`rotateSession`), the old session is marked revoked, and the new session inherits the same family.
  - **Replay / Breach Detection:** If a client presents an already revoked refresh token (indicating token theft / interception), the engine revokes *all* active sessions in that family immediately and throws `UnauthenticatedError('... TOKEN_REUSE_DETECTED')`.
  - **TTL Expiration:** MongoDB TTL index automatically cleans up expired sessions without needing manual cron jobs.
- **User Domain Model (`modules/identity/domain/User.js`):**
  - Password hashed using `bcryptjs` with 12 salt rounds in an async pre-save hook.
  - Safe serialization: `toJSON` strips password, third-party integration tokens (Google Drive access/refresh tokens, Telegram botToken), and raw API keys, while projecting boolean capability flags (`hasGeminiKey`, `hasAddisKey`).
- **External Provider Linking (`modules/identity/domain/AuthIdentity.js`):**
  - Normalizes external OAuth identities with compound unique index on `{ provider: 1, providerId: 1 }`.

## 11. Authentication Services & Controllers Architecture (Task 2.2)
- **Token Infrastructure (`infrastructure/security/tokenService.js`):**
  - Dual JWT issuance: short-lived 15m `accessToken` and 7d `refreshToken` (uniform lifespan, strictly zero remember-me variation).
  - Secure HttpOnly cookies with `sameSite: 'lax'` (development) / `sameSite: 'none'` (production with HTTPS) and `path: '/'`.
  - Comprehensive clearing across `/`, `/api/v1`, and `/api/v1/auth`.
- **Validation Engine (`infrastructure/http/middleware/validate.js` & `modules/identity/http/authSchemas.js`):**
  - Replaced legacy `express-validator` with type-safe Zod schema validation middleware.
  - Strict enforcement of Single-User Invariant: injecting `role` is immediately rejected with 400 Bad Request.
  - Password complexity checked against canonical character class `[A-Za-z\d@$!%*?&]`.
- **Google OAuth 2.0 & SSO (`modules/identity/services/googleAuthService.js`):**
  - Zero heavy external dependencies: leverages native Node.js `fetch` for Google OpenID Connect endpoints.
  - Tamper-proof HMAC signed state token signed with `JWT_ACCESS_SECRET` prevents OAuth CSRF attacks.
  - Graceful fallback: when Google OAuth credentials are not configured, endpoints report unconfigured state rather than crashing.
- **Session Registry Integration:**
  - Login creates new session with fresh UUID `family`.
  - Refresh rotates token within the same family.
  - Replay of revoked tokens immediately terminates the entire lineage with `TOKEN_REUSE_DETECTED`.

## 12. Session Middleware, CSRF Protection, and Rate Limiting (Task 2.3)
- **Server-Derived Identity Invariant (`infrastructure/http/middleware/requireUser.js`):**
  - Resolves identity strictly from verified JWT access tokens (via HttpOnly cookies or Bearer header).
  - Client-supplied `userId`, query params, or body claims are never trusted for authorization.
  - Attaches verified User model, `req.userId`, and frozen `req.auth = { userId, email }`.
  - Provides `optionalUser` middleware for optional-authentication routes.
- **CSRF Mitigation Architecture (`infrastructure/http/middleware/csrfProtection.js`):**
  - Defends against ambient cookie credential exploitation on state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Safe methods (`GET`, `HEAD`, `OPTIONS`) and public onboarding endpoints are exempted.
  - Requests carrying explicit Bearer authorization headers are exempted (browsers do not attach Bearer headers automatically cross-origin).
  - For cookie-authenticated requests, enforces strict `Origin` and `Referer` validation against allowed origins (`CLIENT_ORIGIN`, localhost dev ports, and production `*.vercel.app`).
  - Supports double-submit CSRF cookie/header matching (`X-CSRF-Token`).
- **CORS Error Normalization (`app.js`):**
  - Cross-origin requests from disallowed origins are cleanly intercepted and thrown as `ForbiddenError` (403 `CORS_ORIGIN_BLOCKED`) rather than generic 500 exceptions.
- **Rate Limiting Engine (`infrastructure/http/middleware/rateLimiter.js`):**
  - Powered by `express-rate-limit`.
  - `authRateLimiter`: 30 requests per 15 minutes per IP on `/api/v1/auth/*` to prevent brute-force attacks.
  - `apiRateLimiter`: 300 requests per 15 minutes per IP on general `/api/v1/*`.
  - Automatically raises thresholds during test environments (`NODE_ENV === 'test'`) to avoid false-positive test suite throttling.

## 13. Authenticated Credential Envelope Encryption (Task 2.4)
- **Standard & Algorithm Compliance (NFR-SEC-002, Scenario U):**
  - Implemented AES-256-GCM envelope encryption with unique 96-bit (12-byte) initialization vectors (IVs) per NIST SP 800-38D.
  - KEK (Key Encryption Key) derived via HKDF-SHA256 from `CREDENTIAL_ENCRYPTION_KEY` (with fallback to `JWT_ACCESS_SECRET` in development/test), tagged with version identifier (`v1`).
  - Ephemeral DEK (Data Encryption Key) generated freshly per credential, encrypted under KEK, and its plaintext memory securely wiped (`dek.fill(0)`) in a `finally` block immediately after use.
  - Authenticated Additional Data (AAD) cryptographically binds the payload and DEK to `{ userId, credentialType, version, role }`, preventing ciphertext transposition or unauthorized cross-user replay.
- **Key Rotation & Serialization:**
  - `rotateCredentialEnvelope`: re-encrypts stored credentials under a new KEK version without decrypting to disk.
  - `serializeEnvelope` / `deserializeEnvelope`: safe base64-encoded JSON representation suitable for database storage and retrieval.
- **User Domain Model Integration (`modules/identity/domain/User.js`):**
  - `setEncryptedApiKey`: automatically encrypts and serializes BYOK keys (`geminiApiKey`, `addisApiKey`), maintaining boolean presence flags.
  - `getDecryptedApiKey`: decrypts keys strictly in volatile memory on demand during authorized requests.
  - `getRedactedApiKey` / `redactCredential`: displays masked placeholders (e.g. `sk-a...7890`) for logs and UI display, returning `"Not Set"` when absent.
  - `toJSON`: completely strips raw and encrypted key fields from client API responses, exposing only boolean status flags (`hasGeminiKey`, `hasAddisKey`).
- **Profile & BYOK HTTP Routes:**
  - `GET /api/v1/users/profile`: authenticated profile retrieval.
  - `PATCH /api/v1/users/profile`: profile information update.
  - `PATCH /api/v1/users/api-keys`: updates BYOK keys using envelope encryption; raw DB record stores only ciphertext.
  - `GET /api/v1/users/api-keys`: returns masked key status without exposing plaintext secrets.
  - Compatibility bridges established for `backend/src/controllers/userController.js` and `backend/src/routes/userRoutes.js`.

## 14. Phase 2 Identity, Session & Account Security Acceptance Suite (Task 2.5)
- **Data Isolation & Anti-IDOR Architecture (`infrastructure/security/userIsolation.js`):**
  - Implemented `assertUserOwnership(resource, userId, ownerField)`: guarantees that unauthorized attempts to access or mutate foreign resources throw the exact same `NotFoundError` (404 `NOT_FOUND`) as missing resources, preventing IDOR enumeration per `NFR-SEC-004`.
  - Implemented `buildOwnerQuery(userId, query, ownerField)`: forces all database lookup and mutation queries to include the authenticated owner boundary.
- **Account Data Export & Permanent Deletion Lifecycle (`modules/identity/services/accountService.js`):**
  - Implemented `exportAccountData(userId)`: extracts user profile, settings, and nonsecret metadata while strictly omitting passwords, raw API keys, and session tokens (`FR-CORE-SEC-003`).
  - Implemented `deleteAccount(userId)`: purges User document, all associated Sessions, and linked AuthIdentities, followed by cookie clearing. Subsequent login attempts are immediately rejected.
- **JWT Collision Mitigation (`infrastructure/security/tokenService.js`):**
  - Added RFC 7519 `jti` (random UUID) to both access and refresh JWT payloads.
  - Prevents hash collisions in MongoDB's unique index on `refreshTokenHash` when rapid or concurrent tokens are generated within the same second for the same user.
- **Accepted Acceptance Scenarios Verified in `tests/api/identity-suite.test.js`:**
  - Full registration, password hashing, HttpOnly cookie issuance, and session reload without localStorage identity authority.
  - Concurrent token rotation and immediate replay breach detection terminating the entire session family (`TOKEN_REUSE_DETECTED`).
  - OAuth state tampering and missing state parameter rejection.
  - Cross-user IDOR rejection ensuring server-derived identity strictly governs data access.
  - Zero plaintext secrets across all responses.
  - Clean account data export and complete database account deletion.
