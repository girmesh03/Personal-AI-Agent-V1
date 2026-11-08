# Functional Requirements Traceability Matrix

> **Product:** Operon (Personal AI Agent V1)  
> **Authority:** `AGENTS.md` (Section 3) & `Master-Personal-AI-Agent-V1-documentation.md` (Section 3)  
> **Status:** Active Governance Baseline  
> **Total Requirements:** 52 unique functional requirements (28 P0, 23 P1, 1 P2)  
> **Date:** 2026-11-09  

---

## 1. Traceability Summary

The V1 specification establishes 52 authoritative functional requirements: 43 Core Platform requirements and 9 Operations Domain requirements. In accordance with `AGENTS.md`, requirement IDs are strictly preserved and tracked across planning, implementation, and verification phases.

| Category | Priority | Count | Target Phase | Implementation Status |
|---|---|---|---|---|
| Core Foundation & Security | P0 | 4 | Phase 1 | `In Progress` (Baseline established) |
| Core Auth, User & Credential | P0 | 4 | Phase 2 | `Pending` |
| Core Conversation & Streaming | P0 | 6 | Phase 3 | `Pending` |
| Core Directives & Memory | P0 / P1 | 4 | Phase 3 / Phase 4 | `Pending` |
| Core Document & Asset Lifecycle | P0 | 3 | Phase 4 | `Pending` |
| Core Multimodal & Media | P0 / P1 | 6 | Phase 4 | `Pending` |
| Core Agent, Tools & Verification | P0 / P1 | 3 | Phase 3 / Phase 5 | `Pending` |
| Core Models & Free Governance | P0 | 1 | Phase 3 | `Pending` |
| Core Research, Task, Project & Proactive | P1 / P2 | 7 | Phase 5 / Post-V1 | `Pending` |
| Operations Bounded Isolation Gate | P0 | 1 | Phase 1 (Architectural Gate) | `Satisfied by Architecture` |
| Operations Domain Capabilities | P1 | 8 | Phase 6 (Optional Module) | `Pending` |

---

## 2. Core Functional Requirements (43 Requirements)

### 2.1 Assistant Identity & Communication (3 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-ASST-001` | **P0** | General-Purpose Partner Identity | Phase 3 | Prompt assertions, system boundary audit |
| `FR-CORE-ASST-002` | **P0** | Dynamic Linguistic Mirroring | Phase 3 | Multilingual turn evaluation (English, Amharic) |
| `FR-CORE-ASST-003` | **P0** | Structured Decision Analysis | Phase 3 | Multi-criteria analysis formatting tests |

### 2.2 Conversation & Interaction Lifecycle (6 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-CONV-001` | **P0** | Reliable Incremental Response Streaming | Phase 3 | SSE / WebSocket chunk continuity tests |
| `FR-CORE-CONV-002` | **P0** | In-Place Turn Lifecycle and Explicit Branching | Phase 3 | Branching tree tests with message parent pointers |
| `FR-CORE-CONV-003` | **P0** | Dynamic Model Selection (Between Turns) | Phase 3 | Mid-thread model switch verification |
| `FR-CORE-CONV-004` | **P0** | Observable Task Progress & Execution Statuses | Phase 3 | Execution step progress stream assertion |
| `FR-CORE-CONV-005` | **P0** | Conversation Search & History Pagination | Phase 3 | Cursor pagination & text index search tests |
| `FR-CORE-CONV-006` | **P0** | Multi-Turn Attachment Continuity & Context Retention | Phase 3 / Phase 4 | Attachment reference continuity across turns |

### 2.3 Memory & Directives (4 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-MEM-001` | **P0** | Declarative User Directives Engine (SSOT) | Phase 3 | System prompt injection & priority test |
| `FR-CORE-MEM-002` | **P0** | Conversational Directive Modification | Phase 3 | Tool-driven directive update confirmation |
| `FR-CORE-MEM-003` | **P1** | Multi-Tier Episodic Memory with Provenance | Phase 4 | Episodic recall with source citation |
| `FR-CORE-MEM-004` | **P1** | Sovereign Memory Governance (Search, Edit, Delete) | Phase 4 | Memory invalidation and tombstone checks |

### 2.4 Multimodal Media & Ingestion (6 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-MEDIA-001` | **P0** | Modality Ingestion Neutrality | Phase 4 | Ingestion pipeline tests across text/image/audio |
| `FR-CORE-MEDIA-002` | **P1** | Acoustic Audio Understanding | Phase 4 | Speech vs non-speech audio qualification |
| `FR-CORE-MEDIA-003` | **P1** | Speech-to-Text Transcription Pipeline | Phase 4 | Audio-to-text pipeline accuracy test |
| `FR-CORE-MEDIA-004` | **P1** | Real-Time Live Speech Dictation | Phase 4 | Streaming audio input buffer tests |
| `FR-CORE-MEDIA-005` | **P1** | Multilingual Text-to-Speech (TTS) Synthesis | Phase 4 | Audio synthesis stream & cache tests |
| `FR-CORE-MEDIA-006` | **P1** | Native Multimodal Document and Layout Understanding | Phase 4 | Document visual OCR and layout extraction |

### 2.5 Document & Asset Engine (3 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-DOC-001` | **P0** | Multi-Format Document Ingestion | Phase 4 | PDF, DOCX, XLSX, CSV parsing tests |
| `FR-CORE-DOC-002` | **P0** | Autonomous Document Generation & File Export | Phase 4 | DOCX/PDF export binary generation tests |
| `FR-CORE-DOC-003` | **P0** | Asset Distinction & Durable Reconciliation Lifecycle | Phase 4 | Durable asset ownership & cleanup tests |

### 2.6 Professional Correspondence & Data (2 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-BIZ-001` | **P0** | Professional Correspondence & Authorship | Phase 3 | Tone matching & email/formal draft tests |
| `FR-CORE-DATA-001` | **P0** | Verifiable Numerical & Tabular Data Analysis | Phase 4 | Math calculation and tabular output tests |

### 2.7 Autonomous Agent & Tools (3 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-AGENT-001` | **P0** | Multi-Step Autonomous Tool Execution | Phase 3 / Phase 5 | Multi-step tool loop execution tests |
| `FR-CORE-AGENT-002` | **P0** | Exact-Parameter Action Authorization Gates | Phase 3 / Phase 5 | Human-in-the-loop parameter interrupt tests |
| `FR-CORE-AGENT-003` | **P1** | Durable Execution State & Idempotent Recovery | Phase 5 | Checkpoint recovery and resumption tests |

### 2.8 Model Providers & Governance (1 Requirement)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-MODEL-001` | **P0** | Remote Model Provider Configuration & Free Usage | Phase 3 | Rate limiting & free tier quota enforcement |

### 2.9 Security, Privacy & Session Lifecycle (7 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-SEC-001` | **P0** | Individual Account Data Isolation Baseline | Phase 1 | CORS credentials, cookie security, zero static `/uploads` |
| `FR-CORE-SEC-002` | **P0** | Protected BYOK Credential Storage | Phase 2 | AES-256-GCM envelope encryption tests |
| `FR-CORE-SEC-003` | **P0** | User Account Deletion & Data Export Lifecycle | Phase 2 | Soft/hard deletion and JSON data export tests |
| `FR-CORE-SEC-004` | **P0** | Background Data Maintenance & Asset Lifecycle | Phase 1 / Phase 2 | Orphan cleanup cron and storage reconciliation |
| `FR-CORE-SEC-005` | **P0** | Local Authentication and Secure Session Lifecycle | Phase 1 / Phase 2 | HttpOnly cookie auth, refresh rotation & reuse detection |
| `FR-CORE-SEC-006` | **P0** | Verified Single Sign-On (SSO) & Safe Account Linking | Phase 2 | Google OAuth state signature verification |
| `FR-CORE-SEC-007` | **P0** | Remote Provider Data Transparency & Consent | Phase 2 / Phase 3 | Pre-transmission disclosure & consent audit |

### 2.10 Integrations, Tasks, Projects & Proactivity (4 Requirements)
| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-CORE-INT-001` | **P1** | Extensible Integration Connector Architecture | Phase 5 | Connector isolation & token encryption tests |
| `FR-CORE-TASK-001` | **P1** | Conversational Action Item & Task Extraction | Phase 5 | Tool-based task extraction from chat turns |
| `FR-CORE-TASK-002` | **P1** | Context-Aware Reminders & Scheduling | Phase 5 | Timezone-aware notification trigger tests |
| `FR-CORE-PROJ-001` | **P1** | Project Workspaces & Context Isolation | Phase 5 | Project-scoped asset & chat retrieval tests |
| `FR-CORE-RES-001` | **P1** | Grounded Document Question Answering | Phase 4 | RAG pipeline document grounded QA tests |
| `FR-CORE-RES-002` | **P1** | Abstracted Live Web Research Connector | Phase 5 | Provider-native search tool execution tests |
| `FR-CORE-PRO-001` | **P1** | Scheduled User Reminders & Notification Dispatch | Phase 5 | Scheduler job queue and notification tests |
| `FR-CORE-PRO-002` | **P2** | Proactive Daily Morning Briefing Engine | Post-Launch | Briefing collation tests (Post-V1) |

---

## 3. Operations Domain Module Requirements (9 Requirements)

| Requirement ID | Priority | Title | Target Phase | Verification Strategy |
|---|---|---|---|---|
| `FR-DOM-REST-001` | **P1** | Branch Directory and Location Profiles | Phase 6 | Branch CRUD and restore tests |
| `FR-DOM-REST-002` | **P1** | Operational Inspection and Checklist Capture | Phase 6 | Checklist state and observation tests |
| `FR-DOM-REST-003` | **P1** | Single-Branch and Multi-Branch Visit Workflows | Phase 6 | Multi-branch visit timing & assignment tests |
| `FR-DOM-REST-004` | **P1** | Issue Tracking, Assignment & Remediation Follow-Up | Phase 6 | Issue assignment and status transition tests |
| `FR-DOM-REST-005` | **P1** | Dual Calendar Support (Ethiopian & Gregorian) | Phase 6 | Calendar conversion math unit tests |
| `FR-DOM-REST-006` | **P1** | Bilingual Operational Reporting (Amharic & English) | Phase 6 | Amharic dossier generation & font tests |
| `FR-DOM-REST-007` | **P1** | Operational Media and Evidence Association | Phase 6 | Media-to-report attachment tests |
| `FR-DOM-REST-008` | **P1** | Inspection Report Viewing, Editing, Export & Sharing | Phase 6 | Report approval, export and sharing tests |
| `FR-DOM-REST-009` | **P0** | Modular Domain Isolation and Bounded Context | Phase 1 / Phase 6 | Build and pass test suite without domain module |

---

## 4. Phase 1 Scope & Traceability Verification

Phase 1 establishes the technical baseline directly satisfying:
1. **`FR-CORE-SEC-001` (P0):** Origin CORS whitelist with credentials, secure cookie parsing middleware, and complete elimination of public static asset exposure (`/uploads`).
2. **`FR-CORE-SEC-005` (P0):** Schema-driven environment validation for JWT access/refresh secrets, cookie parsing infrastructure, and token security boundaries.
3. **`FR-DOM-REST-009` (P0):** Bounded domain isolation — zero restaurant/operations vocabulary or routes leak into core application bootstrap, error formatters, or system routing.
