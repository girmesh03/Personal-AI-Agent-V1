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
