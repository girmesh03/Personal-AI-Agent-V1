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
- Direct cross-continental TCP latency to `ap-southeast-2` (Australia) requires initial connection server selection timeout of 30,000ms (`serverSelectionTimeoutMS: 30000` in `db.js`) to guarantee handshake resilience across all 3 replica set members (`shard-00-00`, `shard-00-01`, `shard-00-02`). Tested and verified live with successful handshake.
- Strict adherence to `docs/*` enforced: eliminated unapproved variables (`COOKIE_SECRET`, `MONGO_SERVER_SELECTION_TIMEOUT`) from code and configuration.

### 3. Server Entry Point & Process Lifecycle
- `backend/src/server.js` is the standalone process entry point. It exports named lifecycle functions (`startServer`, `gracefulShutdown`) and auto-starts when run directly. Redundant `export default` was removed as nothing consumes it.

### 4. Logging & DevDependencies Boundary
- Core runtime application code (`src/*`) must never import from `devDependencies`.
- `morgan` was located in `devDependencies` while being imported in `app.js`. Removed `morgan` entirely; HTTP request logging is now handled directly by our Winston logger middleware (`logger.http`).
- Obsolete `logStream` adapter removed from `backend/src/config/logger.js`.
- Authoritative database connection logging: removed duplicate `logger.info` in `connectDB()` so only the single `mongoose.connection.on('connected')` listener logs connection events.

### 5. Client Port Lifecycle & Clean Dist
- `client/scripts/cleanDist.js` provides clean teardown of `client/dist`.
- `client/scripts/killPort.js` defaults to port 3000.
- Wired `node scripts/killPort.js 3000 && vite` into `client/package.json` `"dev"` script to guarantee port 3000 is freed before Vite starts.

### 6. Test Suite Architecture & Individual Test Execution
- To prevent monolithic test suites from slowing down development as tests grow, `backend/scripts/runTest.js` provides selective test execution:
  - `npm test <test-name>` or `npm test -- <test-name>` executes only the targeted test.
  - `npm run test:health` executes `scripts/tests/health.test.js` directly.
  - Running `npm test` without arguments prompts the developer with the list of available individual tests.
- Native Node.js `fetch` and `assert` are used exclusively; zero third-party test runners (no Jest, Mocha, or Vitest).
