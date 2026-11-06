# Dependency Catalog & Governance Record

**Project:** Personal AI Agent V1 (*Operon*)  
**Architecture:** Single Root Manifest (`package.json`) and Single Lockfile (`package-lock.json`)  
**Generated:** 2026-11-06  
**Node.js Runtime:** `v24.15.0` (Requirement: Node 20+)  
**Package Manager:** `npm 11.11.0`  

---

## 1. Overview & Dependency Governance Rules

The V1 application operates under strict single-root manifest dependency governance:
1. Exactly one `package.json` at repository root. Nested manifests (`backend/package.json`, `client/package.json`) and nested lockfiles (`client/package-lock.json`) are strictly retired.
2. Version Resolution Policy: Dependencies are resolved and installed using native `npm install` directly against the official npm registry—never by guessing or hardcoding version numbers manually.
3. Provider Neutrality: `@google/genai` is strictly prohibited. Remote LLM inference is provided via `@langchain/google` and `@langchain/openai`.

---

## 2. Production Dependencies Catalog (`dependencies`)

| Package | Resolved Version | Role in Architecture | License | Peer Requirements & Compatibility |
| :--- | :--- | :--- | :--- | :--- |
| `react` | `^19.3.1` | Core UI library for Single Page Application | MIT | Requires Node 20+, compatible with React 19 StrictMode |
| `react-dom` | `^19.3.1` | React DOM renderer and client mount | MIT | Pairs with `react` |
| `prop-types` | `^15.8.1` | Runtime prop validation for Material UI theme components | MIT | Compatible with React 19 |
| `@mui/material` | `^9.5.0` | Material UI v6 core component library | MIT | Pairs with `@emotion/react` and `@emotion/styled` |
| `@emotion/react` | `^11.14.0` | CSS-in-JS style engine for Material UI | MIT | Peer dependency of MUI |
| `@emotion/styled` | `^11.14.1` | Styled component API for Material UI | MIT | Peer dependency of MUI |
| `@mui/icons-material` | `^9.5.0` | Material Design icon set for navigation and actions | MIT | Compatible with MUI v6 |
| `@mui/x-charts` | `^9.17.0` | Data visualization components for dashboard and operations | MIT (Community) | Used in `client/src/theme/customizations/charts.js` |
| `@mui/x-data-grid` | `^9.17.0` | Advanced tabular data display for operational reports | MIT (Community) | Used in `client/src/theme/customizations/dataGrid.js` |
| `@mui/x-date-pickers` | `^9.17.0` | Date and time pickers supporting Gregorian/Ethiopian workflows | MIT (Community) | Used in `client/src/theme/customizations/datePickers.js` |
| `express` | `^5.3.0` | Core backend HTTP API server | MIT | Node 20+ ES Module support |
| `cors` | `^2.8.6` | Cross-Origin Resource Sharing middleware | MIT | Configured for exact origin allowlist |
| `helmet` | `^8.3.0` | HTTP security headers middleware | MIT | Standard security baseline |
| `cookie-parser` | `^1.4.7` | Signed cookie parser for HttpOnly session authentication | MIT | Essential for cookie-based session auth |
| `morgan` | `^1.12.1` | HTTP request logger middleware | MIT | Streams to Winston structured logging |
| `dotenv` | `^18.0.9` | Environment variable loader | BSD-2-Clause | Parses `.env` during local development |
| `zod` | `^4.6.7` | Runtime schema validation for APIs and agent tool schemas | MIT | Standard schema validator across frontend & backend |
| `mongoose` | `^9.12.0` | MongoDB Object Data Modeling (ODM) | MIT | Connects to MongoDB Atlas `operon-v1` |
| `jsonwebtoken` | `^9.0.3` | JWT signing and verification for session tokens | MIT | Auth identity management |
| `bcryptjs` | `^3.0.3` | Password hashing using secure salt rounds | MIT | Pure JS implementation, no native build dependencies |
| `winston` | `^3.19.0` | Multi-transport structured logger with secret redaction | MIT | Production logging infrastructure |
| `multer` | `^2.5.0` | Streaming multipart/form-data upload middleware | MIT | Handles raw file uploads into private storage |
| `@langchain/core` | `^1.3.5` | Core abstractions, messages, tools, BaseChatModel | MIT | Foundational peer dependency for all LangChain packages |
| `langchain` | `^1.6.2` | Agent execution framework (`createAgent`) | MIT | Main agent loop and tool executor |
| `@langchain/langgraph` | `^1.7.0` | Durable stateful workflow engine and checkpoints | MIT | Multi-step workflows and human-in-the-loop interrupts |
| `@langchain/google` | `^0.2.12` | Official LangChain Google Gemini adapter (`ChatGoogle`) | MIT | Direct native Google Gemini integration (no `@google/genai`) |
| `@langchain/openai` | `^1.8.0` | Official LangChain OpenAI-compatible adapter (`ChatOpenAI`) | MIT | Addis AI integration via custom `configuration.baseURL` |

---

## 3. Development Dependencies Catalog (`devDependencies`)

| Package | Resolved Version | Role in Architecture | License |
| :--- | :--- | :--- | :--- |
| `vite` | `^8.3.6` | Next-generation frontend bundler and development server | MIT |
| `@vitejs/plugin-react` | `^6.2.1` | Official Vite plugin for React 19 Fast Refresh | MIT |
| `eslint` | `^10.14.0` | Pluggable linting utility for JavaScript and JSX | MIT |
| `@eslint/js` | `^10.0.1` | ESLint recommended configuration rules | MIT |
| `eslint-plugin-react-hooks` | `^7.1.1` | ESLint rules for React Hooks rules enforcement | MIT |
| `eslint-plugin-react-refresh` | `^0.5.7` | ESLint rules for Vite React Fast Refresh | MIT |
| `globals` | `^17.14.0` | Global identifier definitions for browser and Node | MIT |
| `@types/node` | `^26.6.6` | TypeScript declarations for Node.js built-ins and runtime | MIT |
| `@types/express` | `^5.0.6` | TypeScript declarations for Express 5 | MIT |
| `@types/morgan` | `^1.9.10` | TypeScript declarations for Morgan HTTP logger | MIT |
| `@types/cors` | `^2.8.19` | TypeScript declarations for CORS middleware | MIT |
| `@types/cookie-parser` | `^1.4.10` | TypeScript declarations for Cookie Parser | MIT |
| `@types/jsonwebtoken` | `^9.0.10` | TypeScript declarations for JSON Web Token | MIT |
| `@types/bcryptjs` | `^2.4.6` | TypeScript declarations for Bcryptjs | MIT |
| `@types/multer` | `^2.3.0` | TypeScript declarations for Multer file upload | MIT |
| `@types/react` | `^19.3.0` | TypeScript definitions for React (used by IDE/ESLint) | MIT |
| `@types/react-dom` | `^19.3.0` | TypeScript definitions for React DOM | MIT |
| `nodemon` | `^3.1.14` | Process monitor for automated backend server restart | MIT |
| `concurrently` | `^10.0.6` | Concurrent task execution runner for full-stack dev | MIT |

---

## 4. Operational Scripts Catalog

| Script Command | Target / Invocation | Description |
| :--- | :--- | :--- |
| `npm run postinstall` | `node backend/scripts/installFonts.js` | Automated font and FFmpeg binary permission installer for Render/Linux |
| `npm run kill-ports` | `node backend/scripts/killPort.js` | Terminates lingering processes on ports 4000 and 3000 |
| `npm run clean:client` | `node client/scripts/cleanDist.js` | Deletes `client/dist/` post-build |
| `npm run dev` | `concurrently -n "api,web" ...` | Runs backend (4000) and client (3000) concurrently |
| `npm run dev:api` | `nodemon backend/src/server.js` | Runs backend development server on port 4000 |
| `npm run dev:web` | `vite client` | Runs Vite development server on port 3000 |
| `npm run start:api` | `node backend/src/server.js` | Production backend startup command |
| `npm run build:web` | `vite build client` | Compiles and bundles production client SPA |
| `npm run preview:web`| `vite preview client` | Previews production client build locally |
| `npm run lint` | `eslint client` | Static analysis across client source |
| `npm run verify` | `npm run lint && npm run build:web` | Complete quality check verifying linting and build |
