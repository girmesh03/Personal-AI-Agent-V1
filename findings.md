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
