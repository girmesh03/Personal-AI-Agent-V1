# Findings & Discoveries: Phase 1 — Full-Stack Foundation and Engineering Quality System

> **Product:** Operon (Personal AI Agent V1)  
> **Environment:** Antigravity 2.0  
> **Target Branch:** `phase-1-fullstack-foundation`  

## Codebase Audit Baseline Findings

### 1. Repository Structure & Root State
- Root `package.json` defines npm workspaces: `["backend", "client"]`.
- `backend/` and `client/` have separate manifests, lockfiles, and node_modules. This satisfies the architectural invariant preserving isolated application boundaries.
- Root scripts orchestrate commands using workspaces (`dev`, `dev:backend`, `dev:client`, `verify`, `kill-ports`).

### 2. Backend Inspection & Environment Hardening
- `backend/.env` contains verified connection string to MongoDB Atlas replica set (`atlas-6frzxd-shard-0`) on database `operon-v1`.
- Direct cross-continental TCP latency to `ap-southeast-2` (Australia) requires initial connection server selection timeout of 30,000ms (`SERVER_SELECTION_MS: 30000`) to guarantee handshake resilience across all 3 replica set members (`shard-00-00`, `shard-00-01`, `shard-00-02`). Tested and verified live with successful handshake.
- Stripped unnecessary quotes around Google OAuth client variables and added `COOKIE_SECRET` and `MONGO_SERVER_SELECTION_TIMEOUT`.
- `backend/src/assets/fonts/` contains Inter, NotoSansEthiopic, and NotoSansLatin font assets.

### 3. Error System & Formatter Interoperability
- Bi-directional interoperability confirmed between `AppError`, `ApiError`, and `errorFormatter`:
  - `ApiError` is exported as an alias of `AppError` from both `backend/src/errors/AppError.js` and `backend/src/errors/ApiError.js`.
  - `AppError.prototype.format(req)` and `AppError.prototype.toResponse(req)` methods allow any error instance to directly format itself.
  - `errorFormatter.js` explicitly recognizes `AppError`, `ApiError`, `isOperational`, `name === 'ApiError'`, and numeric `statusCode`.
  - Exports `formatApiError` as an alias of `formatError`.

### 4. Client Inspection
- Client is built with React 19 (`^19.3.1`) and Vite (`^8.3.6`).
- All 12 Material-UI theme files exist in `client/src/theme/` and `client/src/theme/customizations/`.
- Theme peer dependencies will be installed into `client/package.json` in Task 1.5.

### 5. Documentation Baseline & Invariants
- Governance registers established:
  - `docs/implementation/agents-skills-and-plugins-inventory.md`
  - `docs/architecture/dependency-catalog.md`
  - `docs/requirements/traceability.md`
  - `docs/implementation/source-disposition.md`
- 100% English UI Chrome invariant strictly maintained.
- Primary key `_id` invariant strictly maintained.
