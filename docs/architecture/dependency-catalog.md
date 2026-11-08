# Dependency Catalog

> **Product:** Operon (Personal AI Agent V1)  
> **Authority:** `AGENTS.md` (Sections 5.3 & 5.4)  
> **Status:** Active Governance Baseline  
> **Date:** 2026-11-09  

---

## 1. Overview & Monorepo Package Boundaries

The Operon monorepo operates under root npm workspaces with isolated manifests, lockfiles, and `node_modules` across `backend/` and `client/`:
- **Root Workspace:** Orchestrates workspace execution without shared runtime dependencies.
- **Backend Boundary (`backend/package.json`):** Node.js 20+ runtime, Express 5, Mongoose 9, Winston logging, security middleware.
- **Client Boundary (`client/package.json`):** Pure React 19 Single-Page Application (SPA), Vite bundler, Material UI design system.

---

## 2. Backend Dependencies (`backend/package.json`)

| Package Name | Exact Version | Purpose & Owning Module | Official Docs | License | Node/Peer Compatibility | Maintenance State |
|---|---|---|---|---|---|---|
| `express` | `^5.2.1` | Core HTTP framework, route handling, middleware pipeline | https://expressjs.com/ | MIT | Node.js >= 18 | Active (Express 5 LTS) |
| `mongoose` | `^9.10.2` | MongoDB ODM, connection pooling, schema validation | https://mongoosejs.com/ | MIT | Node.js >= 18, MongoDB >= 6.0 | Active (Mongoose 9) |
| `dotenv` | `^18.0.4` | Environment variable loader from `.env` files | https://github.com/motdotla/dotenv | BSD-2-Clause | Node.js >= 12 | Active |
| `helmet` | `^8.3.0` | HTTP security headers (CSP, HSTS, frameguard) | https://helmetjs.github.io/ | MIT | Node.js >= 18 | Active |
| `cors` | `^2.8.6` | Cross-Origin Resource Sharing with credentials whitelist | https://github.com/expressjs/cors | MIT | Node.js >= 0.10 | Active |
| `cookie-parser`| `^1.4.7` | Parses `HttpOnly` authentication cookies | https://github.com/expressjs/cookie-parser | MIT | Node.js >= 0.8 | Active |
| `winston` | `^3.19.0` | Structured logging with JSON and console formatting | https://github.com/winstonjs/winston | MIT | Node.js >= 12 | Active |
| `winston-daily-rotate-file` | `^5.0.0` | Daily log rotation transport in `logs/` directory | https://github.com/winstonjs/winston-daily-rotate-file | MIT | Winston >= 3 | Active |
| `jsonwebtoken` | `^9.0.3` | HMAC/RSA token signing and verification for sessions | https://github.com/auth0/node-jsonwebtoken | MIT | Node.js >= 12 | Active |
| `bcryptjs` | `^3.0.3` | Password hashing for local credentials | https://github.com/dcodeIO/bcrypt.js | MIT | Node.js >= 0.8 | Active |
| `express-mongo-sanitize` | `^2.2.0` | Sanitizes user input to prevent NoSQL query injection | https://github.com/fiznool/express-mongo-sanitize | MIT | Express >= 4 | Active |
| `express-rate-limit` | `^8.7.0` | Rate limiting protection on auth and API endpoints | https://express-rate-limit.mintlify.app/ | MIT | Express >= 4 | Active |
| `compression` | `^1.8.2` | Gzip/deflate response payload compression | https://github.com/expressjs/compression | MIT | Node.js >= 0.8 | Active |
| `express-async-handler` | `^1.2.0` | Middleware wrapper forwarding async errors to handler | https://github.com/Abazhenov/express-async-handler | MIT | Express >= 4 | Active |
| `mongoose-paginate-v2` | `^1.9.5` | Paginated querying for chat history and domain records | https://github.com/arunbandarat/mongoose-paginate-v2 | MIT | Mongoose >= 8 | Active |
| `multer` | `^2.4.0` | Multipart/form-data processor for file uploads | https://github.com/expressjs/multer | MIT | Node.js >= 18 | Active |
| `@ffmpeg-installer/ffmpeg` | `^1.1.0` | Self-contained FFmpeg binary installer for media | https://github.com/descriptinc/ffmpeg-installer | ISC | Cross-platform | Active |
| `@ffprobe-installer/ffprobe` | `^2.1.2` | Self-contained FFprobe binary installer for media | https://github.com/descriptinc/ffprobe-installer | LGPL-2.1 | Cross-platform | Active |

### Backend Dev Dependencies
| Package Name | Exact Version | Purpose | License |
|---|---|---|---|
| `nodemon` | `^3.1.14` | Local dev server hot-reloader | MIT |

---

## 3. Client Dependencies (`client/package.json`)

### Core Runtime
| Package Name | Exact Version | Purpose & Owning Module | Official Docs | License | React 19 Compatible |
|---|---|---|---|---|---|
| `react` | `^19.3.1` | React 19 core UI library | https://react.dev/ | MIT | Yes (Native) |
| `react-dom` | `^19.3.1` | React DOM renderer | https://react.dev/ | MIT | Yes (Native) |

### Protected Theme Peer Dependencies (Targeted for Task 1.5)
| Package Name | Target Version | Purpose in Protected Theme | License | React 19 Status |
|---|---|---|---|---|
| `@mui/material` | `^6.4.5` | Material UI components and theme engine | MIT | Supported |
| `@emotion/react` | `^11.14.0` | Emotion CSS-in-JS engine | MIT | Supported |
| `@emotion/styled` | `^11.14.0` | Styled component primitives | MIT | Supported |
| `@mui/icons-material` | `^6.4.5` | Material UI icon set used in theme inputs | MIT | Supported |
| `@mui/x-charts` | `^7.26.0` | Charts styling customizations in theme | MIT | Supported |
| `@mui/x-data-grid` | `^7.26.0` | DataGrid tabular styling customizations in theme | MIT | Supported |
| `@mui/x-date-pickers` | `^7.26.0` | Date and time picker styling in theme | MIT | Supported |
| `prop-types` | `^15.8.1` | Runtime prop validation for theme components | MIT | Supported |

### Client Dev Dependencies
| Package Name | Exact Version | Purpose | License |
|---|---|---|---|
| `vite` | `^8.3.6` | Fast modern frontend bundler and dev server | MIT |
| `@vitejs/plugin-react` | `^6.1.2` | Vite plugin for React Fast Refresh and JSX | MIT |
| `eslint` | `^10.14.0` | JavaScript and JSX static analysis linter | MIT |
| `@eslint/js` | `^10.0.1` | Standard ESLint recommended configurations | MIT |
| `eslint-plugin-react-hooks` | `^7.1.1` | Enforces React hooks rules | MIT |
| `eslint-plugin-react-refresh` | `^0.5.7` | Validates components for safe fast refresh | MIT |
| `globals` | `^17.13.0` | Global variable identifiers for ESLint | MIT |

---

## 4. Planned Phase-Specific Additions

The following dependencies are designated for subsequent phases per the Master Specification:
- **Phase 2 (Auth & User System):** `@reduxjs/toolkit` and `react-redux` for client session store.
- **Phase 3 (Core Agent & LangChain):** `@langchain/core`, `langchain`, `@langchain/langgraph`, `@langchain/google`, `langsmith`.
- **Prohibited Dependencies:** `@google/genai` (unapproved raw SDK), TypeScript (`.ts`/`.tsx`), Tailwind CSS, Jest, Mocha, Vitest, Cypress, Playwright.
