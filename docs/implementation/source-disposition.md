# Source File Disposition Register (214 Sections)

**Project:** Personal AI Agent V1 (*Operon*)  
**Authority:** `docs/Master-Personal-AI-Agent-V1-documentation.md` (Sections 16 & 17)  
**Historical References:**  
- `docs/Backend-Personal-AI-Agent-V0-Codebase.md` (61 files, 21,491 lines)  
- `docs/Client-Personal-AI-Agent-V0-Codebase.md` (153 files, 39,082 lines)  
**Generated:** 2026-11-06  

---

## 1. Backend Source File Dispositions (61 Files)

| # | V0 Source File Section | Target V1 Destination | Architectural Action & Preservation Scope | Status |
|---:|:---|:---|:---|:---|
| 1 | `backend/src/app.js` | `backend/src/app.js` | Express 5 composition, security headers, exact CORS, middleware pipeline, private upload routing (remove public static upload serving). | Implemented (Phase 1) |
| 2 | `backend/src/server.js` | `backend/src/server.js` | Bootstrap, DB readiness, worker startup, SIGTERM/SIGINT signal handling, stream/job drain, graceful shutdown. | Implemented (Phase 1) |
| 3 | `backend/src/config/db.js` | `backend/src/infrastructure/database/connection.js` | Mongoose/Mongo connection lifecycle, pool management, worker and checkpointer connection sharing. | Implemented (Phase 2) |
| 4 | `backend/src/config/env.js` | `backend/src/config/env.js` | Zod schema-based environment validation; parsing URLs, booleans, secrets, limits; fail closed. | Implemented (Phase 1) |
| 5 | `backend/src/config/logger.js` | `backend/src/config/logger.js` | Structured Winston logging, request correlation IDs, secret/prompt redaction; no plaintext credentials. | Implemented (Phase 1) |
| 6 | `backend/src/config/schemaOptions.js` | `backend/src/infrastructure/database/schemaOptions.js` | Shared serialization options (virtuals, getters, timestamps); safe projection rules. | Implemented (Phase 2) |
| 7 | `backend/src/errors/CustomError.js` | `backend/src/shared/errors/AppError.js` | Typed application errors, normalized public HTTP error codes, security-safe error sanitization. | Implemented (Phase 1) |
| 8 | `backend/src/middleware/authMiddleware.js` | `backend/src/infrastructure/http/middleware/requireUser.js` | Server-derived user identity, session validation, cookie parsing; reject client owner claims. | Pending |
| 9 | `backend/src/middleware/errorHandler.js` | `backend/src/infrastructure/http/middleware/errorHandler.js` | Central error mapping, request correlation, safe client-facing errors without stack traces. | Implemented (Phase 1) |
| 10 | `backend/src/middleware/notFoundHandler.js` | `backend/src/infrastructure/http/middleware/notFoundHandler.js` | Consistent API 404 handler, enumeration prevention. | Implemented (Phase 1) |
| 11 | `backend/src/middleware/uploadMiddleware.js` | `backend/src/modules/assets/http/uploadMiddleware.js` | Streaming multipart parser, MIME magic byte sniffing, file size bounds, safe temp paths. | Pending |
| 12 | `backend/src/middleware/validate.js` | `backend/src/infrastructure/http/middleware/validate.js` | Request body, query, and param validation middleware using Zod schemas. | Implemented (Phase 2, Task 2.2) |
| 13 | `backend/src/routes/authRoutes.js` | `backend/src/modules/identity/http/authRoutes.js` | Routes for register, login, logout, refresh, and Google OAuth 2.0. | Implemented (Phase 2, Task 2.2) |
| 14 | `backend/src/routes/branchRoutes.js` | `backend/src/modules/operations/branches/http/branchRoutes.js` | Branch CRUD, archival/restoration, metrics, history within isolated domain module. | Pending |
| 15 | `backend/src/routes/chatRoutes.js` | Split: `modules/conversations/http/threadRoutes.js`, `messageRoutes.js`, `runsRoutes.js` | Thread lifecycle, message pagination, and agent run execution routes. | Pending |
| 16 | `backend/src/routes/dashboardRoutes.js` | `backend/src/modules/dashboard/http/dashboardRoutes.js` | General personal AI metrics and activity; operations module widgets conditional. | Pending |
| 17 | `backend/src/routes/index.js` | `backend/src/infrastructure/http/routes.js` | Master API v1 route mounting and module feature-flag enablement. | Implemented (Phase 1) |
| 18 | `backend/src/routes/reportRoutes.js` | `backend/src/modules/operations/reports/http/reportRoutes.js` | Operational inspection report routes, checklist capture, export, and sharing. | Pending |
| 19 | `backend/src/routes/sttRoutes.js` | `backend/src/modules/audio/http/speechRoutes.js` | Audio transcription routes using capability-qualified remote speech adapters. | Pending |
| 20 | `backend/src/routes/userRoutes.js` | Split: `identity/http/profileRoutes.js`, `providers/http/providerRoutes.js` | User profile, preferences, and provider BYOK configuration routes. | Pending |
| 21 | `backend/src/services/documentGenerationService.js` | `backend/src/modules/documents/generation/documentGenerationService.js` | PDF (with Ethiopic fonts), DOCX, XLSX, CSV, Markdown, and JSON file generation. | Pending |
| 22 | `backend/src/services/googleDriveService.js` | `backend/src/modules/connectors/googleDrive/googleDriveService.js` | Google Drive connector: OAuth state verification, file export, private sharing. | Pending |
| 23 | `backend/src/services/storageService.js` | `backend/src/modules/assets/storage/storageService.js` | Private durable object storage service with checksum validation and signed URLs. | Pending |
| 24 | `backend/src/services/telegramService.js` | `backend/src/modules/connectors/telegram/telegramService.js` | Telegram delivery service: formatting, preview cards, channel delivery with approval. | Pending |
| 25 | `backend/src/services/ttsService.js` | `backend/src/modules/audio/ttsService.js` | Optional remote TTS synthesis with cost controls and user consent. | Pending |
| 26 | `backend/src/utils/attachmentProcessor.js` | Split: `assets/processing/assetProcessor.js`, `documents/ingestion/*` | Deterministic file extraction, metadata extraction, text normalization, and chunking. | Pending |
| 27 | `backend/src/utils/audioChunker.js` | `backend/src/modules/audio/audioChunker.js` | Deterministic FFmpeg media chunking and conversion utilities. | Pending |
| 28 | `backend/src/utils/constants.js` | `backend/src/utils/constants.js` | System limits, HTTP status codes, action categories, role definitions. | Implemented (Phase 1) |
| 29 | `backend/src/utils/errorFormatter.js` | `backend/src/utils/errorFormatter.js` | Provider-specific error mapping into standardized domain errors. | Implemented (Phase 1) |
| 30 | `backend/src/utils/ethiopianCalendar.js` | `backend/src/modules/operations/calendar/ethiopianCalendar.js` | Ethiopian-Gregorian dual calendar conversion and holiday calculation. | Pending |
| 31 | `backend/src/utils/promptAssembler.js` | Split: `modules/agent/context/contextAssembler.js`, system policy | Dynamic prompt construction from directives, recent turns, and module skills. | Pending |
| 32 | `backend/src/utils/token.js` | `backend/src/infrastructure/security/tokenService.js` | JWT signing, verification, and refresh token hashing. | Implemented (Phase 2, Task 2.2) |
| 33 | `backend/src/utils/transliterate.js` | `backend/src/modules/operations/search/transliterate.js` | Amharic phonetic transliteration and search normalization. | Pending |
| 34-41 | `backend/src/assets/fonts/*` (8 font files) | `backend/src/assets/fonts/*` | Bilingual Inter and Noto Sans Ethiopic fonts for PDF generation and rendering. | Protected |
| 42 | `backend/src/assets/fonts/fonts.conf` | `backend/src/assets/fonts/fonts.conf` | Fontconfig XML configuration with Ethiopic fallback mappings. | Protected |
| 43 | `backend/src/controllers/authController.js` | `backend/src/modules/identity/http/authController.js` | Controller for user authentication, session creation, refresh, and logout. | Implemented (Phase 2, Task 2.2) |
| 44 | `backend/src/controllers/branchController.js` | `backend/src/modules/operations/branches/http/branchController.js` | Controller for branch operations and metrics within domain module. | Pending |
| 45 | `backend/src/controllers/chatController.js` | Split: `conversations/application/*`, `agent/application/runService.js` | Decoupled conversation management, stream generation, and run orchestration. | Pending |
| 46 | `backend/src/controllers/dashboardController.js` | `backend/src/modules/dashboard/http/dashboardController.js` | Controller for aggregated dashboard data. | Pending |
| 47 | `backend/src/controllers/reportController.js` | `backend/src/modules/operations/reports/http/reportController.js` | Controller for operational inspection reports and dossier exports. | Pending |
| 48 | `backend/src/controllers/sttController.js` | `backend/src/modules/audio/http/speechController.js` | Controller for audio transcription requests. | Pending |
| 49 | `backend/src/controllers/userController.js` | `backend/src/modules/identity/http/profileController.js` | Controller for user profile, settings, and BYOK credentials. | Pending |
| 50 | `backend/src/jobs/sweeper.js` | `backend/src/jobs/reconciliation/storageReconciliationJob.js` | Database-backed asset cleanup, outbox reconciliation, orphan file pruning. | Pending |
| 51 | `backend/src/models/Audio.js` | Replaced by `modules/assets/persistence/Asset.js` | Unified asset model with audio representation subdocuments. | Pending |
| 52 | `backend/src/models/Branch.js` | `backend/src/modules/operations/branches/persistence/Branch.js` | Branch schema and indices under operations module. | Pending |
| 53 | `backend/src/models/Chat.js` | Replaced by `Thread.js`, `Turn.js`, `Message.js`, `MessageBranch.js` | Deconstructed conversation persistence models (no unbounded message arrays). | Pending |
| 54 | `backend/src/models/Report.js` | `backend/src/modules/operations/reports/persistence/Report.js` | Operational inspection report schema and indices under operations module. | Pending |
| 55 | `backend/src/models/User.js` | Split: `User.js`, `AuthIdentity.js`, `Session.js`, `ProviderConnection.js` | Normalized user identity, authentication identities, sessions, and encrypted BYOK keys. | Implemented (Phase 2, Task 2.1) |
| 56 | `backend/src/tools/agentTools.js` | Split: `modules/agent/tools/registry.js`, `core/*`, `operations/*` | Modular tool definitions with Zod schemas, runtime context, and HITL gates. | Pending |
| 57 | `backend/src/validations/authValidation.js` | `backend/src/modules/identity/http/authSchemas.js` | Zod validation schemas for auth endpoints. | Implemented (Phase 2, Task 2.2) |
| 58 | `backend/src/validations/branchValidation.js` | `backend/src/modules/operations/branches/http/branchSchemas.js` | Zod validation schemas for branch endpoints. | Pending |
| 59 | `backend/src/validations/chatValidation.js` | `backend/src/modules/conversations/http/conversationSchemas.js` | Zod schemas for thread creation, messages, pagination, retry, and edit. | Pending |
| 60 | `backend/src/validations/reportValidation.js` | `backend/src/modules/operations/reports/http/reportSchemas.js` | Zod validation schemas for inspection reports. | Pending |
| 61 | `backend/src/validations/userValidation.js` | `backend/src/modules/identity/http/profileSchemas.js` | Zod schemas for user profile updates and provider credentials. | Pending |

---

## 2. Frontend Source File Dispositions (153 Files)

### 2.1 Theme & Layout Engine (Protected Assets)
- `client/src/theme/AppTheme.jsx` -> `client/src/theme/AppTheme.jsx` (Protected)
- `client/src/theme/themePrimitives.js` -> `client/src/theme/themePrimitives.js` (Protected)
- `client/src/theme/useThemeMode.js` -> `client/src/theme/useThemeMode.js` (Protected)
- `client/src/theme/customizations/*` (9 files: `charts.js`, `dataDisplay.js`, `dataGrid.js`, `datePickers.js`, `feedback.js`, `index.js`, `inputs.js`, `navigation.js`, `surfaces.js`) -> Protected

### 2.2 Core Application & Shell
- `client/src/App.jsx` -> `client/src/app/App.jsx` (Rebuild: authenticated session hydration, root router outlet)
- `client/src/main.jsx` -> `client/src/main.jsx` (Rebuild: React 19 root bootstrap, AppTheme, error boundary)
- `client/src/router.jsx` -> `client/src/app/router.jsx` (Rebuild: Protected and public routes, lazy loaded pages)
- `client/src/layouts/AppShell.jsx` -> `client/src/layouts/AppShell.jsx` (Rebuild: Responsive shell with sidebar, header, outlets)
- `client/src/layouts/AvatarMenu.jsx` -> `client/src/layouts/AccountMenu.jsx` (Rebuild: User profile, provider status, logout)
- `client/src/layouts/Logo.jsx` -> `client/src/components/navigation/BrandMark.jsx` (General personal AI brand mark)
- `client/src/layouts/MuiSidebar.jsx` -> `client/src/layouts/Sidebar.jsx` (Navigation items, operations drawer conditional)
- `client/src/layouts/PublicLayout.jsx` -> `client/src/layouts/PublicLayout.jsx` (Public auth shell)
- `client/src/layouts/ThemeToggle.jsx` -> `client/src/components/common/ThemeToggle.jsx` (Light/dark mode switch)

### 2.3 Chat Runtime & Adapter
- `client/src/adapters/MuiChatAdapter.js` -> `client/src/features/chat/adapter/ChatAdapter.js` (Canonical stream adapter translating SSE into MUI X Chat chunks)
- `client/src/contexts/ChatAdapterContext.js` -> `client/src/features/chat/adapter/ChatRuntimeContext.jsx`
- `client/src/pages/Chat.jsx` -> `client/src/features/chat/pages/ChatPage.jsx` (Chat container with history sidebar, composer, turn timeline)
- Chat UI components (composer, attachment shelf, message bubbles, tool cards, approval cards, stream indicator, scroll affordance) mapped to `features/chat/components/`.

### 2.4 Operations Domain Module Pages & Components
- `client/src/pages/Branches.jsx` -> `client/src/features/operations/branches/pages/BranchesPage.jsx`
- `client/src/pages/BranchDetail.jsx` -> `client/src/features/operations/branches/pages/BranchDetailPage.jsx`
- `client/src/pages/Reports.jsx` -> `client/src/features/operations/reports/pages/ReportsPage.jsx`
- `client/src/pages/ReportDetail.jsx` -> `client/src/features/operations/reports/pages/ReportDetailPage.jsx`
- `client/src/pages/ReportEdit.jsx` -> `client/src/features/operations/reports/pages/ReportEditPage.jsx`
- Branch & report cards, inspection checklist editors, Amharic dossier views, visit tables mapped to `features/operations/`.

### 2.5 Auth, Profile, and Settings
- `client/src/pages/Login.jsx` -> `client/src/features/auth/pages/LoginPage.jsx`
- `client/src/pages/Register.jsx` -> `client/src/features/auth/pages/RegisterPage.jsx`
- `client/src/pages/Profile.jsx` -> Split into tabs: `features/auth/pages/ProfilePage.jsx`, `features/providers/pages/ProvidersPage.jsx`, `features/connectors/pages/ConnectorsPage.jsx`
- `client/src/pages/Dashboard.jsx` -> `client/src/pages/DashboardPage.jsx` (General personal metrics + optional operational widgets)
- `client/src/pages/Landing.jsx` -> `client/src/pages/LandingPage.jsx` (Personal AI Partner marketing & positioning)
- `client/src/pages/NotFound.jsx` -> `client/src/pages/NotFoundPage.jsx`

---

## 3. Preservation Governance
- No source section from the 214 reference sections may be discarded or omitted without explicit recorded owner approval.
- Every task report will reference the exact V0 source lines examined and confirm the preserved behavior.
