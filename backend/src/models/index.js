/**
 * @file backend/src/models/index.js
 * @module models
 * @description Centralized barrel exports for all authoritative Operon (Personal AI Agent V1) domain models.
 * Consolidates the complete application data layer across user accounts, conversation DAG threads,
 * standalone polymorphic messages, multimodal digital assets, physical operational branches, and daily inspection reports.
 */

import User from './User.js';
import Chat from './Chat.js';
import Message from './Message.js';
import Asset from './Asset.js';
import Branch from './Branch.js';
import Report from './Report.js';

export {
  /**
   * User model representing the single-user account identity, preferences, encrypted BYOK credentials,
   * and directives SSOT.
   */
  User,
  /**
   * Chat model representing conversation thread metadata, LangGraph execution state, and branch DAGs.
   * Contains strictly zero embedded messages array.
   */
  Chat,
  /**
   * Message model representing discrete conversational turns with polymorphic parts
   * (text, reasoning, tool execution, citations, and multimodal asset references).
   */
  Message,
  /**
   * Asset model representing modality-neutral file records (documents, images, audio, video)
   * with storage abstraction, reverse provenance links, and TTL purge policies.
   */
  Asset,
  /**
   * Branch model representing physical operational facilities with code uniqueness,
   * geographical location metadata, and audit preservation guards.
   */
  Branch,
  /**
   * Report model representing streamlined operational inspection records with inline sub-arrays,
   * derived Julian Day Number Ethiopian/Gregorian virtuals, and daily uniqueness enforcement.
   */
  Report,
};

/**
 * Default export containing all 6 domain models as properties of a single cohesive object.
 */
export default {
  User,
  Chat,
  Message,
  Asset,
  Branch,
  Report,
};
