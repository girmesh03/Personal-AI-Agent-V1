/**
 * @file backend/src/models/Message.js
 * @module models/Message
 * @description Decoupled multimodal conversation message schema for Operon (Personal AI Agent V1).
 * Supports branching DAG lineage, generation retry attempts, continuation segments, interleaved ordered parts
 * (text, safe steps, LangChain tool executions + artifacts, Asset references, grounded citations, data cards,
 * recoverable errors), token telemetry, and full multilingual search with Stemmer isolation.
 *
 * Architectural Invariants:
 * 1. Standalone Collection: Messages live in an independent collection referencing `chat` (zero embedded array in Chat).
 * 2. Polymorphic Parts Discriminators: Validates parts (`text`, `step`, `tool`, `asset`, `citation`, `data`, `error`).
 * 3. Multimodal Non-Empty Constraint: User messages require non-empty text or at least one asset attachment.
 * 4. Grounded Citations: Citations enforce `sourceType` ('url', 'asset', 'domain_record', 'text').
 * 5. Single-User Isolation: Scoped strictly to the owning supervisor (`user: { type: ObjectId, ref: 'User', required: true }`).
 * 6. Full-Text Search Stemmer Protection: Text index uses `{ default_language: 'none', language_override: 'no_language_override' }`.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import {
  BASE_SCHEMA_OPTIONS,
  SUBDOCUMENT_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
} from '../config/schemaOptions.js';
import {
  AI_MODELS,
  CHAT_CONSTANTS,
  CHAT_PAGINATION,
  MESSAGE_CONSTANTS,
} from '../utils/constants.js';

/**
 * @typedef {Object} ITextPart
 * @property {'text'} type - Discriminator type identifier.
 * @property {string|null} [runId=null] - Run execution identifier.
 * @property {string} text - Message text or markdown string.
 * @property {'markdown'|'plain'|'html'} [format='markdown'] - Text rendering format.
 */

/**
 * @typedef {Object} IStepPart
 * @property {'step'} type - Discriminator type identifier.
 * @property {string|null} [runId=null] - Run execution identifier.
 * @property {string} stepKey - Machine identifier for reasoning step.
 * @property {string} label - Human-readable description of current step.
 * @property {'running'|'done'|'failed'} [state='done'] - Execution lifecycle state of step.
 * @property {Date|null} [startedAt=null] - Step start timestamp.
 * @property {Date|null} [completedAt=null] - Step completion timestamp.
 * @property {number|null} [durationMs=null] - Duration of step execution in milliseconds.
 */

/**
 * @typedef {Object} IToolPart
 * @property {'tool'} type - Discriminator type identifier.
 * @property {string|null} [runId=null] - Run execution identifier.
 * @property {string} toolCallId - Tool call UUID correlated with tool result.
 * @property {string} toolName - Canonical name of invoked tool.
 * @property {'read'|'action'|'system'} [category='read'] - Tool execution category.
 * @property {'running'|'success'|'error'|'requires_approval'|'aborted'} [status='running'] - Execution status.
 * @property {Record<string, any>} [args={}] - Input arguments passed to tool.
 * @property {Record<string, any>|null} [result=null] - Tool execution output payload.
 * @property {string|null} [error=null] - Error message if tool failed.
 * @property {number|null} [durationMs=null] - Execution duration in milliseconds.
 * @property {import('mongoose').Types.ObjectId[]} [artifacts=[]] - Generated Asset references.
 */

/**
 * @typedef {Object} IAssetPart
 * @property {'asset'} type - Discriminator type identifier.
 * @property {string|null} [runId=null] - Run execution identifier.
 * @property {import('mongoose').Types.ObjectId} asset - Referenced Asset document identifier.
 * @property {'inline'|'attachment'|'card'|'audio_player'} [presentation='inline'] - Rendering presentation.
 * @property {string|null} [caption=null] - Optional textual caption.
 */

/**
 * @typedef {Object} ICitationPart
 * @property {'citation'} type - Discriminator type identifier.
 * @property {string|null} [runId=null] - Run execution identifier.
 * @property {'url'|'asset'|'domain_record'|'text'} sourceType - Type of grounding source.
 * @property {string} title - Citation title or display label.
 * @property {string|null} [url=null] - Grounding web URL (required when sourceType is 'url').
 * @property {import('mongoose').Types.ObjectId|null} [asset=null] - Grounding Asset document ID.
 * @property {number|null} [pageNumber=null] - Page number in grounded document.
 * @property {string|null} [snippet=null] - Grounding text snippet or excerpt.
 */

/**
 * @typedef {Object} IDataPart
 * @property {'data'} type - Discriminator type identifier.
 * @property {string|null} [runId=null] - Run execution identifier.
 * @property {'tabular'|'json'|'metric_card'|'chart'} [viewType='tabular'] - Data visualization format.
 * @property {string} title - Display header for data block.
 * @property {Record<string, any>|Array<any>} data - Structured payload container.
 * @property {string|null} [schemaRef=null] - Optional schema reference.
 */

/**
 * @typedef {Object} IErrorPart
 * @property {'error'} type - Discriminator type identifier.
 * @property {string|null} [runId=null] - Run execution identifier.
 * @property {string} code - Machine-readable error code.
 * @property {string} message - Human-readable error description.
 * @property {boolean} [retryable=true] - Whether client may retry generation.
 * @property {Record<string, any>|null} [details=null] - Additional diagnostic error context.
 */

/**
 * @typedef {ITextPart|IStepPart|IToolPart|IAssetPart|ICitationPart|IDataPart|IErrorPart} IMessagePart
 */

/**
 * @typedef {Object} IMessageRuntimeConfig
 * @property {'google'|'addis_ai'} [provider='google'] - AI provider used for turn generation.
 * @property {string} [model='gemini-3.1-flash-lite'] - Model identifier used for generation.
 * @property {number} [thinkingBudget=2048] - Reasoning token budget.
 * @property {number} [temperature=1.0] - Sampling temperature.
 */

/**
 * @typedef {Object} IMessageUsage
 * @property {number|null} [promptTokens=null] - Input prompt tokens.
 * @property {number|null} [candidatesTokens=null] - Generated output tokens.
 * @property {number|null} [totalTokens=null] - Total tokens consumed.
 * @property {number|null} [estimatedCostUsd=null] - Estimated USD cost of generation.
 */

/**
 * @typedef {Object} IMessage
 * @property {import('mongoose').Types.ObjectId} _id - Unique message identifier.
 * @property {import('mongoose').Types.ObjectId} chat - Owning conversation Chat reference.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor User reference.
 * @property {number} sequence - Strictly monotonic causal turn order sequence within the chat.
 * @property {string} turnId - Conversational turn UUID.
 * @property {'user'|'assistant'|'system'} role - Participant role.
 * @property {IMessagePart[]} parts - Polymorphic ordered parts array.
 * @property {string} [branchId='main'] - Conversation branch identifier.
 * @property {number} [branchSequence=1] - Sequence number within the specific branch.
 * @property {import('mongoose').Types.ObjectId|null} [parentMessageId=null] - Parent turn message reference.
 * @property {number} [turnAttempt=1] - Attempt index for regenerated turns.
 * @property {boolean} [isActiveAttempt=true] - Flag indicating active attempt in branch timeline.
 * @property {string|null} [checkpointId=null] - LangGraph checkpoint identifier associated with turn.
 * @property {IMessageRuntimeConfig} [runtimeConfig] - AI provider and model parameters.
 * @property {IMessageUsage} [usage] - Token usage and cost telemetry.
 * @property {boolean} [isDeleted=false] - Soft-deletion flag.
 * @property {Date|null} [deletedAt=null] - Timestamp when message was soft-deleted.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Returns allowed models for a specific AI provider.
 * @param {string} provider - Provider identifier.
 * @returns {Array<string>} Allowed model list.
 */
const getAllowedModelsForProvider = (provider) =>
  typeof provider === 'string' && Object.hasOwn(AI_MODELS.BY_PROVIDER, provider)
    ? AI_MODELS.BY_PROVIDER[provider]
    : [];

/**
 * Checks whether a specific field path is selected in the current document projection.
 *
 * @param {import('mongoose').Document} doc - Document instance.
 * @param {string} path - Schema dot-path.
 * @returns {boolean} True if field is selected or projection is absent.
 */
const isPathSelected = (doc, path) => {
  if (!doc || typeof doc.isSelected !== 'function') return true;
  return doc.isSelected(path);
};

/**
 * Checks whether all discriminator-critical fields in parts are selected in projection.
 *
 * @param {import('mongoose').Document} doc - Document instance.
 * @returns {boolean} True if all necessary discriminator fields are selected.
 */
const isPartsFullySelected = (doc) =>
  isPathSelected(doc, 'parts.type') &&
  isPathSelected(doc, 'parts.text') &&
  isPathSelected(doc, 'parts.asset') &&
  isPathSelected(doc, 'parts.role') &&
  isPathSelected(doc, 'parts.toolCallId') &&
  isPathSelected(doc, 'parts.generatedAssets') &&
  isPathSelected(doc, 'parts.sourceType');

/**
 * Checks whether a candidate dot-path equals, prefixes, or extends a target path.
 *
 * @param {string} path - Candidate path.
 * @param {string} target - Target path.
 * @returns {boolean} True if paths intersect.
 */
const pathTouchesTarget = (path, target) =>
  typeof path === 'string' &&
  (path === target || path.startsWith(`${target}.`) || target.startsWith(`${path}.`));

/**
 * Traverses a container object to find the innermost container and key for a dotPath.
 *
 * @param {Record<string, any>} container - Object to inspect.
 * @param {string} dotPath - Dotted path string.
 * @returns {{ target: Record<string, any>, key: string, value: any }|null} Search result.
 */
function findPathLocation(container, dotPath) {
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(container, dotPath)) {
    return { target: container, key: dotPath, value: container[dotPath] };
  }
  const parts = dotPath.split('.');
  for (let split = parts.length - 1; split >= 1; split -= 1) {
    const prefix = parts.slice(0, split).join('.');
    if (Object.prototype.hasOwnProperty.call(container, prefix)) {
      return findPathLocation(container[prefix], parts.slice(split).join('.'));
    }
  }
  return null;
}

/**
 * Extracts a value from a container using a dotted path.
 *
 * @param {Record<string, any>} container - Object to traverse.
 * @param {string} dotPath - Dotted path string.
 * @returns {any} Value at path or undefined.
 */
const extractObjectPath = (container, dotPath) => findPathLocation(container, dotPath)?.value;

/**
 * Resolves an updated field value across $set, $setOnInsert, or top-level query layers.
 *
 * @param {Record<string, any>} update - Query update payload.
 * @param {string} dotPath - Dotted path string.
 * @returns {any} Resolved field value or undefined.
 */
function resolveUpdateField(update, dotPath) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return undefined;
  }
  for (const layer of [update.$set, update.$setOnInsert, update]) {
    const value = extractObjectPath(layer, dotPath);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/**
 * Tests if an operator payload layer conflicts with a target path.
 *
 * @param {Record<string, any>} layer - Update operator layer.
 * @param {string} target - Reference path.
 * @returns {boolean} True if any key intersects target.
 */
const hasLayerPathConflict = (layer, target) =>
  Boolean(
    layer &&
      typeof layer === 'object' &&
      !Array.isArray(layer) &&
      Object.keys(layer).some((k) => pathTouchesTarget(k, target))
  );

/**
 * Factory validator ensuring that model is strictly supported by the active provider.
 *
 * @param {string} providerPath - Path to provider field.
 * @param {object} [options] - Validator configuration.
 * @param {boolean} [options.allowNull=false] - Whether null is permissible.
 * @param {string|null} [options.defaultProvider=null] - Fallback provider name.
 * @param {string|null} [options.modelPath=null] - Path to model field.
 * @returns {(value: any) => boolean} Validation function.
 */
function createProviderModelValidator(
  providerPath,
  { allowNull = false, defaultProvider = null, modelPath = null } = {}
) {
  return function validateModelForProvider(value) {
    if (allowNull && value === null) return true;
    let provider;
    if (typeof this?.getUpdate === 'function') {
      provider = resolveUpdateField(this.getUpdate(), providerPath);
      if (provider === undefined) {
        const filterProvider = extractObjectPath(this.getFilter?.(), providerPath);
        provider = typeof filterProvider === 'string' ? filterProvider : undefined;
      }
      if (provider === undefined) return false;
    } else if (!this) {
      return true;
    } else {
      if (
        !this.isNew &&
        typeof this.isSelected === 'function' &&
        !this.isSelected(providerPath) &&
        !this.isModified(providerPath)
      ) {
        if (modelPath && typeof this.isModified === 'function' && !this.isModified(modelPath)) {
          return true;
        }
        return false;
      }
      const docVal =
        typeof this.get === 'function'
          ? this.get(providerPath)
          : extractObjectPath(this, providerPath);
      provider = allowNull ? (docVal === undefined ? null : docVal) : (docVal || defaultProvider);
    }
    if (provider === null) return false;
    return getAllowedModelsForProvider(provider).includes(value);
  };
}

/**
 * Checks whether a candidate value is a non-empty string.
 * @param {any} value - Value to check.
 * @returns {boolean} True if string has non-whitespace characters.
 */
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Checks whether a candidate value is a valid Date instance.
 * @param {any} value - Value to check.
 * @returns {boolean} True if value is a non-NaN Date.
 */
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Checks whether a candidate value is a plain JSON container (plain object or array).
 * @param {any} value - Candidate value.
 * @returns {boolean} True if plain object or array.
 */
const isPlainJsonContainer = (value) =>
  value !== null &&
  value !== undefined &&
  (Array.isArray(value) ||
    (typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]'));

/**
 * Factory validator checking whether a JSON object serializes within maxBytes.
 * @param {number} maxBytes - Maximum permitted byte size in UTF-8.
 * @param {object} [options] - Options.
 * @param {boolean} [options.allowNull=true] - Whether null/undefined is permitted.
 * @returns {(value: any) => boolean} Bounded validator function.
 */
const isBoundedJsonPayload = (maxBytes, { allowNull = true } = {}) => (value) => {
  if (value === null || value === undefined) return allowNull;
  if (!isPlainJsonContainer(value)) return false;
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') <= maxBytes;
  } catch (_err) {
    return false;
  }
};

/**
 * Checks whether a candidate string is a valid HTTP/HTTPS URL.
 * @param {any} value - Candidate URL.
 * @returns {boolean} True if matches HTTP/HTTPS URL pattern.
 */
const isValidHttpUrl = (value) =>
  typeof value === 'string' && MESSAGE_CONSTANTS.HTTP_URL_REGEX.test(value.trim());

/**
 * Checks whether a candidate value is a valid MongoDB ObjectId or 24-hex string.
 * @param {any} value - Candidate ObjectId value.
 * @returns {boolean} True if valid ObjectId.
 */
const isValidObjectIdValue = (value) =>
  value instanceof mongoose.Types.ObjectId ||
  (typeof value === 'string' &&
    mongoose.Types.ObjectId.isValid(value) &&
    String(new mongoose.Types.ObjectId(value)) === value);

/**
 * Normalizes an ObjectId or string identifier to its canonical string representation.
 * @param {any} value - ID value.
 * @returns {string|null} Stringified ID or null.
 */
const normalizeIdString = (value) => (value ? String(value) : null);

/**
 * Creates an empty, sanitized message error container object with default null values.
 * @returns {object} Default error descriptor object.
 */
const createEmptyMessageError = () => ({
  code: null,
  message: null,
  reason: null,
  retryable: true,
  failedProvider: null,
  failedModel: null,
  suggestedModels: [],
  occurredAt: null,
});

/**
 * Extracts and deduplicates all valid Asset ObjectIds referenced in a parts array.
 * Inspects 'asset', 'citation', and 'tool' (generatedAssets) parts.
 *
 * @param {Array<object>} [parts=[]] - Message parts array.
 * @returns {Array<import('mongoose').Types.ObjectId|string>} Array of unique Asset IDs.
 */
function extractPartAssetIds(parts = []) {
  if (!Array.isArray(parts)) return [];
  const seen = new Set();
  const ids = [];
  const pushId = (val) => {
    if (!isValidObjectIdValue(val)) return;
    const key = String(val);
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(val);
    }
  };
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'asset' || part.type === 'citation') {
      pushId(part.asset);
    } else if (part.type === 'tool' && Array.isArray(part.generatedAssets)) {
      for (const gid of part.generatedAssets) {
        pushId(gid);
      }
    }
  }
  return ids;
}

/**
 * Validates the structure and bounded constraints of an individual message part payload.
 *
 * @param {object} part - Candidate message part object.
 * @returns {{ ok: boolean, message?: string }} Validation outcome.
 */
function validatePartPayload(part) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    return { ok: false, message: 'Message part must be an object.' };
  }
  if (!MESSAGE_CONSTANTS.PART_TYPES.includes(part.type)) {
    return { ok: false, message: `Unsupported message part type "${part.type}".` };
  }
  if (
    part.runId !== undefined &&
    part.runId !== null &&
    (typeof part.runId !== 'string' || part.runId.trim().length > CHAT_CONSTANTS.RUN_ID_MAX_LENGTH)
  ) {
    return {
      ok: false,
      message: `Part runId cannot exceed ${CHAT_CONSTANTS.RUN_ID_MAX_LENGTH} characters.`,
    };
  }

  switch (part.type) {
    case 'text': {
      if (
        typeof part.text !== 'string' ||
        part.text.length === 0 ||
        part.text.length > MESSAGE_CONSTANTS.PART_TEXT_MAX_LENGTH
      ) {
        return {
          ok: false,
          message: `Text part requires non-empty string within ${MESSAGE_CONSTANTS.PART_TEXT_MAX_LENGTH} characters.`,
        };
      }
      if (part.format !== undefined && !MESSAGE_CONSTANTS.TEXT_FORMATS.includes(part.format)) {
        return { ok: false, message: `Unsupported text part format "${part.format}".` };
      }
      return { ok: true };
    }
    case 'step': {
      if (
        !isNonEmptyString(part.stepKey) ||
        part.stepKey.trim().length > MESSAGE_CONSTANTS.STEP_KEY_MAX_LENGTH ||
        !isNonEmptyString(part.label) ||
        part.label.trim().length > MESSAGE_CONSTANTS.STEP_LABEL_MAX_LENGTH
      ) {
        return { ok: false, message: 'Step part requires bounded non-empty stepKey and label.' };
      }
      if (part.state !== undefined && !MESSAGE_CONSTANTS.STEP_STATES.includes(part.state)) {
        return { ok: false, message: `Invalid step part state "${part.state}".` };
      }
      if (
        part.durationMs !== undefined &&
        part.durationMs !== null &&
        (!Number.isInteger(part.durationMs) || part.durationMs < 0)
      ) {
        return { ok: false, message: 'Step durationMs must be null or a non-negative integer.' };
      }
      return { ok: true };
    }
    case 'tool': {
      if (
        !isNonEmptyString(part.toolCallId) ||
        part.toolCallId.trim().length > CHAT_CONSTANTS.TOOL_CALL_ID_MAX_LENGTH ||
        !isNonEmptyString(part.toolName) ||
        part.toolName.trim().length > CHAT_CONSTANTS.TOOL_NAME_MAX_LENGTH
      ) {
        return { ok: false, message: 'Tool part requires bounded non-empty toolCallId and toolName.' };
      }
      if (part.state !== undefined && !MESSAGE_CONSTANTS.TOOL_STATES.includes(part.state)) {
        return { ok: false, message: `Invalid tool part state "${part.state}".` };
      }
      if (
        part.actionCategory !== undefined &&
        part.actionCategory !== null &&
        !CHAT_CONSTANTS.APPROVAL_CATEGORIES.includes(part.actionCategory)
      ) {
        return { ok: false, message: `Invalid tool actionCategory "${part.actionCategory}".` };
      }
      if (
        !isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: true })(
          part.input
        ) ||
        !isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: true })(
          part.artifact
        )
      ) {
        return { ok: false, message: 'Tool input and artifact must be bounded JSON objects/arrays.' };
      }
      if (
        typeof part.outputSummary === 'string' &&
        part.outputSummary.length > MESSAGE_CONSTANTS.TOOL_OUTPUT_SUMMARY_MAX_LENGTH
      ) {
        return { ok: false, message: 'Tool outputSummary exceeds allowed length.' };
      }
      if (
        typeof part.errorText === 'string' &&
        part.errorText.trim().length > MESSAGE_CONSTANTS.TOOL_ERROR_MAX_LENGTH
      ) {
        return { ok: false, message: 'Tool errorText exceeds allowed length.' };
      }
      if (part.generatedAssets !== undefined) {
        if (
          !Array.isArray(part.generatedAssets) ||
          part.generatedAssets.length > MESSAGE_CONSTANTS.GENERATED_ASSET_MAX_PER_TOOL ||
          !part.generatedAssets.every(isValidObjectIdValue)
        ) {
          return { ok: false, message: 'Tool generatedAssets must contain valid bounded Asset IDs.' };
        }
      }
      if (
        part.durationMs !== undefined &&
        part.durationMs !== null &&
        (!Number.isInteger(part.durationMs) || part.durationMs < 0)
      ) {
        return { ok: false, message: 'Tool durationMs must be null or a non-negative integer.' };
      }
      if (part.state === 'approval-requested') {
        if (
          !isNonEmptyString(part.approval?.interruptId) ||
          part.approval.interruptId.trim().length > CHAT_CONSTANTS.INTERRUPT_ID_MAX_LENGTH ||
          !isNonEmptyString(part.approval?.payloadHash) ||
          part.approval.payloadHash.trim().length > CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH ||
          part.approval?.status !== 'pending'
        ) {
          return {
            ok: false,
            message:
              'Tool state "approval-requested" requires bounded interruptId, payloadHash, and approval.status === "pending".',
          };
        }
      } else if (
        part.state === 'approval-responded' &&
        !['approved', 'edited', 'rejected', 'expired'].includes(part.approval?.status)
      ) {
        return {
          ok: false,
          message:
            'Tool state "approval-responded" requires a resolved approval.status (approved, edited, rejected, or expired).',
        };
      }
      return { ok: true };
    }
    case 'asset': {
      if (
        !isValidObjectIdValue(part.asset) ||
        !MESSAGE_CONSTANTS.ASSET_MODALITIES.includes(part.modality) ||
        !MESSAGE_CONSTANTS.ASSET_PART_ROLES.includes(part.role)
      ) {
        return { ok: false, message: 'Asset part requires valid asset ObjectId, modality, and role.' };
      }
      if (
        part.deliveryMode !== undefined &&
        !MESSAGE_CONSTANTS.ASSET_DELIVERY_MODES.includes(part.deliveryMode)
      ) {
        return { ok: false, message: `Invalid asset deliveryMode "${part.deliveryMode}".` };
      }
      return { ok: true };
    }
    case 'citation': {
      if (
        !MESSAGE_CONSTANTS.CITATION_SOURCE_TYPES.includes(part.sourceType) ||
        !isNonEmptyString(part.title) ||
        part.title.trim().length > MESSAGE_CONSTANTS.CITATION_TITLE_MAX_LENGTH
      ) {
        return { ok: false, message: 'Citation part requires valid sourceType and bounded non-empty title.' };
      }
      if (part.sourceType === 'url') {
        if (
          !isValidHttpUrl(part.url) ||
          part.url.trim().length > MESSAGE_CONSTANTS.CITATION_URL_MAX_LENGTH
        ) {
          return { ok: false, message: 'Citation url must be a bounded valid http/https URL.' };
        }
      } else if (
        part.url !== undefined &&
        part.url !== null &&
        (!isValidHttpUrl(part.url) ||
          part.url.trim().length > MESSAGE_CONSTANTS.CITATION_URL_MAX_LENGTH)
      ) {
        return { ok: false, message: 'Optional citation url must be a bounded valid http/https URL.' };
      }
      if (part.sourceType === 'asset') {
        if (!isValidObjectIdValue(part.asset)) {
          return { ok: false, message: 'Citation with sourceType "asset" requires valid asset ObjectId.' };
        }
      } else if (
        part.asset !== undefined &&
        part.asset !== null &&
        !isValidObjectIdValue(part.asset)
      ) {
        return { ok: false, message: 'Optional citation asset must be a valid ObjectId.' };
      }
      if (
        part.quoteSnippet !== undefined &&
        part.quoteSnippet !== null &&
        (typeof part.quoteSnippet !== 'string' ||
          part.quoteSnippet.trim().length > MESSAGE_CONSTANTS.CITATION_QUOTE_MAX_LENGTH)
      ) {
        return { ok: false, message: 'Citation quoteSnippet exceeds allowed length.' };
      }
      if (
        part.sourceType === 'domain_record' &&
        (!isNonEmptyString(part.domainModel) ||
          part.domainModel.trim().length > MESSAGE_CONSTANTS.CITATION_DOMAIN_MODEL_MAX_LENGTH ||
          !isValidObjectIdValue(part.domainRecordId))
      ) {
        return {
          ok: false,
          message: 'Citation with sourceType "domain_record" requires bounded domainModel and valid domainRecordId.',
        };
      }
      if (
        (part.pageNumber !== undefined &&
          part.pageNumber !== null &&
          (!Number.isInteger(part.pageNumber) || part.pageNumber < 1)) ||
        (part.chunkIndex !== undefined &&
          part.chunkIndex !== null &&
          (!Number.isInteger(part.chunkIndex) || part.chunkIndex < 0)) ||
        (part.startIndex !== undefined &&
          part.startIndex !== null &&
          (!Number.isInteger(part.startIndex) || part.startIndex < 0)) ||
        (part.endIndex !== undefined &&
          part.endIndex !== null &&
          (!Number.isInteger(part.endIndex) || part.endIndex < 0))
      ) {
        return { ok: false, message: 'Citation position bounds must be valid integers.' };
      }
      if (
        part.startIndex !== undefined &&
        part.startIndex !== null &&
        part.endIndex !== undefined &&
        part.endIndex !== null &&
        part.endIndex < part.startIndex
      ) {
        return { ok: false, message: 'Citation endIndex must be >= startIndex.' };
      }
      return { ok: true };
    }
    case 'data': {
      if (
        !isNonEmptyString(part.schemaName) ||
        part.schemaName.trim().length > MESSAGE_CONSTANTS.DATA_SCHEMA_NAME_MAX_LENGTH ||
        !isNonEmptyString(part.schemaVersion) ||
        part.schemaVersion.trim().length > MESSAGE_CONSTANTS.DATA_SCHEMA_VERSION_MAX_LENGTH ||
        !MESSAGE_CONSTANTS.DATA_SCHEMA_VERSION_REGEX.test(part.schemaVersion.trim()) ||
        !isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: false })(
          part.payload
        )
      ) {
        return { ok: false, message: 'Data part requires bounded schemaName, schemaVersion, and JSON payload.' };
      }
      return { ok: true };
    }
    case 'error': {
      if (
        !isNonEmptyString(part.message) ||
        part.message.trim().length > CHAT_CONSTANTS.ERROR_MAX_LENGTH
      ) {
        return { ok: false, message: 'Error part requires bounded non-empty message.' };
      }
      if (
        part.code !== undefined &&
        part.code !== null &&
        (typeof part.code !== 'string' ||
          part.code.trim().length > CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH)
      ) {
        return { ok: false, message: 'Error part code exceeds allowed length.' };
      }
      if (
        part.reason !== undefined &&
        part.reason !== null &&
        !MESSAGE_CONSTANTS.FAILURE_REASONS.includes(part.reason)
      ) {
        return { ok: false, message: `Invalid error part reason "${part.reason}".` };
      }
      if (
        part.retryable !== undefined &&
        typeof part.retryable !== 'boolean'
      ) {
        return { ok: false, message: 'Error part retryable must be a boolean.' };
      }
      if (
        part.failedProvider !== undefined &&
        part.failedProvider !== null &&
        !CHAT_CONSTANTS.PROVIDERS.includes(part.failedProvider)
      ) {
        return { ok: false, message: `Invalid error part failedProvider "${part.failedProvider}".` };
      }
      if (
        part.failedModel !== null &&
        part.failedModel !== undefined &&
        (!part.failedProvider ||
          !getAllowedModelsForProvider(part.failedProvider).includes(part.failedModel))
      ) {
        return { ok: false, message: 'Error part failedModel is incompatible with failedProvider.' };
      }
      return { ok: true };
    }
    default:
      return { ok: false, message: 'Invalid message part type.' };
  }
}

/**
 * Validates and guards dotted submutation paths on Message.parts inside query updates.
 * Prevents positional operator bypasses, bounded JSON overflow, and invalid state transitions.
 *
 * @param {object} params - Submutation parameters.
 * @param {string} params.op - Update operator ($set, $push, etc.).
 * @param {Record<string, any>} params.opLayer - Target operator layer object.
 * @param {string} params.pathKey - Dotted update path key.
 * @param {any} params.val - Target mutation value.
 * @param {string} [params.updRole] - Message role context.
 * @returns {Record<string, any>} Validated submutation outcome.
 * @throws {Error} If dotted path submutation violates schema invariants.
 */
function validateDottedPartSubmutation({ op, opLayer, pathKey, val, updRole }) {
  if (/^parts\.(\d+|\$|\$\[[^\]]*\])$/.test(pathKey)) {
    throw new Error(
      'Cannot replace individual Message.parts elements via indexed or positional query update; supply full parts array or save the document.'
    );
  }
  if (/^parts\.(\$\[\]|\$\[[^\]]+\])\./.test(pathKey)) {
    throw new Error(
      'Cannot use broadcast $[] or filtered $[...] array operators on Message.parts; supply full parts array or save the document.'
    );
  }
  const match = pathKey.match(/^parts\.(?:\d+|\$)\.(.+)$/);
  if (!match) {
    throw new Error(`Unsupported Message.parts query update path "${pathKey}".`);
  }
  const subPath = match[1];
  const elemPrefix = pathKey.slice(0, pathKey.length - subPath.length);

  if (op === '$addToSet') {
    if (subPath !== 'generatedAssets') {
      throw new Error(`$addToSet on Message.parts sub-path "${subPath}" is not permitted.`);
    }
    const addIds = Array.isArray(val?.$each) ? val.$each : [val];
    if (
      addIds.length === 0 ||
      addIds.length > MESSAGE_CONSTANTS.GENERATED_ASSET_MAX_PER_TOOL ||
      !addIds.every(isValidObjectIdValue)
    ) {
      throw new Error('Dotted generatedAssets $addToSet must contain valid bounded Asset ObjectIds.');
    }
    return { addGeneratedAssetIds: addIds };
  }
  if (op !== '$set') {
    throw new Error(`Operator "${op}" is not permitted on Message.parts sub-path "${subPath}".`);
  }

  const maxTextLen =
    updRole === 'user'
      ? MESSAGE_CONSTANTS.USER_TEXT_MAX_LENGTH
      : updRole === 'system'
        ? MESSAGE_CONSTANTS.SYSTEM_TEXT_MAX_LENGTH
        : MESSAGE_CONSTANTS.PART_TEXT_MAX_LENGTH;

  switch (subPath) {
    case 'runId':
      if (val !== null && (typeof val !== 'string' || val.trim().length > CHAT_CONSTANTS.RUN_ID_MAX_LENGTH)) {
        throw new Error(`Dotted part runId cannot exceed ${CHAT_CONSTANTS.RUN_ID_MAX_LENGTH} characters.`);
      }
      return {};
    case 'text':
      if (typeof val !== 'string' || val.length === 0 || val.length > maxTextLen) {
        throw new Error(`Dotted part text must be a non-empty string within ${maxTextLen} characters.`);
      }
      return {};
    case 'format':
      if (!MESSAGE_CONSTANTS.TEXT_FORMATS.includes(val)) {
        throw new Error(`Invalid dotted text format "${val}".`);
      }
      return {};
    case 'label':
      if (!isNonEmptyString(val) || val.trim().length > MESSAGE_CONSTANTS.STEP_LABEL_MAX_LENGTH) {
        throw new Error('Dotted step label must be a bounded non-empty string.');
      }
      return {};
    case 'state': {
      const validStates = [...MESSAGE_CONSTANTS.STEP_STATES, ...MESSAGE_CONSTANTS.TOOL_STATES];
      if (!validStates.includes(val)) {
        throw new Error(`Invalid dotted part state "${val}".`);
      }
      if (val === 'approval-requested') {
        const wholeApproval = opLayer[`${elemPrefix}approval`];
        const intId = wholeApproval?.interruptId ?? opLayer[`${elemPrefix}approval.interruptId`];
        const pHash = wholeApproval?.payloadHash ?? opLayer[`${elemPrefix}approval.payloadHash`];
        const appStatus = wholeApproval?.status ?? opLayer[`${elemPrefix}approval.status`];
        if (!isNonEmptyString(intId) || !isNonEmptyString(pHash) || appStatus !== 'pending') {
          throw new Error(
            'Setting dotted part state "approval-requested" requires interruptId, payloadHash, and approval.status === "pending" in the same update.'
          );
        }
      } else if (val === 'approval-responded') {
        const wholeApproval = opLayer[`${elemPrefix}approval`];
        const appStatus = wholeApproval?.status ?? opLayer[`${elemPrefix}approval.status`];
        if (!['approved', 'edited', 'rejected', 'expired'].includes(appStatus)) {
          throw new Error(
            'Setting dotted part state "approval-responded" requires a resolved approval.status in the same update.'
          );
        }
      }
      return {};
    }
    case 'input':
    case 'artifact':
      if (!isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: true })(val)) {
        throw new Error(`Dotted part "${subPath}" must be a bounded JSON object/array.`);
      }
      return {};
    case 'payload':
      if (!isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: false })(val)) {
        throw new Error('Dotted data payload must be a non-null bounded JSON object/array.');
      }
      return {};
    case 'outputSummary':
      if (val !== null && (typeof val !== 'string' || val.length > MESSAGE_CONSTANTS.TOOL_OUTPUT_SUMMARY_MAX_LENGTH)) {
        throw new Error('Dotted tool outputSummary exceeds allowed length.');
      }
      return {};
    case 'errorText':
      if (val !== null && (typeof val !== 'string' || val.trim().length > MESSAGE_CONSTANTS.TOOL_ERROR_MAX_LENGTH)) {
        throw new Error('Dotted tool errorText exceeds allowed length.');
      }
      return {};
    case 'approval': {
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        throw new Error('Dotted tool approval replacement must be a plain object.');
      }
      if (
        !isNonEmptyString(val.interruptId) ||
        val.interruptId.trim().length > CHAT_CONSTANTS.INTERRUPT_ID_MAX_LENGTH ||
        !isNonEmptyString(val.payloadHash) ||
        val.payloadHash.trim().length > CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH ||
        !MESSAGE_CONSTANTS.APPROVAL_DECISION_STATUSES.includes(val.status)
      ) {
        throw new Error(
          'Dotted tool approval replacement requires valid interruptId, payloadHash, and approval.status.'
        );
      }
      if (val.decidedAt !== undefined && val.decidedAt !== null && !isValidDate(val.decidedAt)) {
        throw new Error('Dotted tool approval.decidedAt must be null or a valid Date.');
      }
      const companionState = opLayer[`${elemPrefix}state`];
      if (
        (val.status === 'pending' && companionState !== 'approval-requested') ||
        (val.status !== 'pending' && companionState !== 'approval-responded')
      ) {
        throw new Error(
          'Dotted tool approval replacement requires matching parts.*.state ("approval-requested" or "approval-responded") in the same update.'
        );
      }
      return {};
    }
    case 'approval.status': {
      if (!MESSAGE_CONSTANTS.APPROVAL_DECISION_STATUSES.includes(val)) {
        throw new Error(`Invalid dotted approval.status "${val}".`);
      }
      const companionState = opLayer[`${elemPrefix}state`];
      if (val === 'pending') {
        const intId = opLayer[`${elemPrefix}approval.interruptId`];
        const pHash = opLayer[`${elemPrefix}approval.payloadHash`];
        if (companionState !== 'approval-requested' || !isNonEmptyString(intId) || !isNonEmptyString(pHash)) {
          throw new Error(
            'Dotted approval.status "pending" requires state "approval-requested", interruptId, and payloadHash in the same update.'
          );
        }
      } else if (companionState !== undefined && companionState !== 'approval-responded') {
        throw new Error('Resolved approval.status conflicts with dotted tool state.');
      }
      return {};
    }
    case 'approval.decidedAt':
      if (val !== null && !isValidDate(val)) {
        throw new Error('Dotted approval.decidedAt must be null or a valid Date.');
      }
      return {};
    case 'approval.interruptId':
      if (!isNonEmptyString(val) || val.trim().length > CHAT_CONSTANTS.INTERRUPT_ID_MAX_LENGTH) {
        throw new Error('Dotted approval.interruptId must be a bounded non-empty string.');
      }
      return {};
    case 'approval.payloadHash':
      if (!isNonEmptyString(val) || val.trim().length > CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH) {
        throw new Error('Dotted approval.payloadHash must be a bounded non-empty string.');
      }
      return {};
    case 'startedAt':
    case 'completedAt':
      if (val !== null && !isValidDate(val)) {
        throw new Error(`Dotted part "${subPath}" must be null or a valid Date.`);
      }
      return {};
    case 'durationMs':
      if (val !== null && (!Number.isInteger(val) || val < 0)) {
        throw new Error('Dotted part durationMs must be null or a non-negative integer.');
      }
      return {};
    case 'deliveryMode':
      if (!MESSAGE_CONSTANTS.ASSET_DELIVERY_MODES.includes(val)) {
        throw new Error(`Invalid dotted asset deliveryMode "${val}".`);
      }
      return {};
    case 'title':
      if (!isNonEmptyString(val) || val.trim().length > MESSAGE_CONSTANTS.CITATION_TITLE_MAX_LENGTH) {
        throw new Error('Dotted citation title must be a bounded non-empty string.');
      }
      return {};
    case 'url':
      if (val !== null && (!isValidHttpUrl(val) || val.trim().length > MESSAGE_CONSTANTS.CITATION_URL_MAX_LENGTH)) {
        throw new Error('Dotted citation url update must be null or a bounded valid http/https URL.');
      }
      return {};
    case 'quoteSnippet':
      if (
        val !== null &&
        (typeof val !== 'string' || val.trim().length > MESSAGE_CONSTANTS.CITATION_QUOTE_MAX_LENGTH)
      ) {
        throw new Error('Dotted citation quoteSnippet exceeds allowed length.');
      }
      return {};
    case 'code':
      if (val !== null && (typeof val !== 'string' || val.trim().length > CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH)) {
        throw new Error('Dotted error part code exceeds allowed length.');
      }
      return {};
    case 'message':
      if (!isNonEmptyString(val) || val.trim().length > CHAT_CONSTANTS.ERROR_MAX_LENGTH) {
        throw new Error('Dotted error part message must be a bounded non-empty string.');
      }
      return {};
    case 'reason':
      if (val !== null && !MESSAGE_CONSTANTS.FAILURE_REASONS.includes(val)) {
        throw new Error(`Invalid dotted error part reason "${val}".`);
      }
      return {};
    case 'retryable':
      if (typeof val !== 'boolean') {
        throw new Error('Dotted error part retryable must be a boolean.');
      }
      return {};
    case 'failedProvider':
    case 'failedModel': {
      const fProv = opLayer[`${elemPrefix}failedProvider`];
      const fModel = opLayer[`${elemPrefix}failedModel`];
      if (fProv === undefined || fModel === undefined) {
        throw new Error(
          'Dotted error part failedProvider and failedModel must be supplied together in the same update.'
        );
      }
      if (fProv !== null || fModel !== null) {
        if (!CHAT_CONSTANTS.PROVIDERS.includes(fProv) || !getAllowedModelsForProvider(fProv).includes(fModel)) {
          throw new Error('Dotted error part failedProvider and failedModel are incompatible.');
        }
      }
      return {};
    }
    default:
      throw new Error(
        `Direct dotted update to Message.parts sub-path "${subPath}" is not permitted; supply full parts array or save the document.`
      );
  }
}

/**
 * Polymorphic base subdocument schema for message parts.
 * Uses discriminatorKey 'type' for polymorphically typed array elements.
 */
const basePartSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Message part type is required.'],
      enum: {
        values: MESSAGE_CONSTANTS.PART_TYPES,
        message: 'Message part type "{VALUE}" is not supported.',
      },
    },
    runId: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.RUN_ID_MAX_LENGTH,
        `Part runId cannot exceed ${CHAT_CONSTANTS.RUN_ID_MAX_LENGTH} characters.`,
      ],
    },
  },
  { ...SUBDOCUMENT_SCHEMA_OPTIONS, discriminatorKey: 'type' }
);

/**
 * Subdocument discriminator schema for text and markdown content parts.
 */
const textPartSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Text part content cannot be empty.'],
      maxlength: [
        MESSAGE_CONSTANTS.PART_TEXT_MAX_LENGTH,
        `Text part cannot exceed ${MESSAGE_CONSTANTS.PART_TEXT_MAX_LENGTH} characters.`,
      ],
    },
    format: {
      type: String,
      enum: MESSAGE_CONSTANTS.TEXT_FORMATS,
      default: MESSAGE_CONSTANTS.DEFAULT_TEXT_FORMAT,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Subdocument discriminator schema for agent reasoning and execution progress steps.
 */
const stepPartSchema = new mongoose.Schema(
  {
    stepKey: {
      type: String,
      required: [true, 'Step key is required.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.STEP_KEY_MAX_LENGTH,
        `Step key cannot exceed ${MESSAGE_CONSTANTS.STEP_KEY_MAX_LENGTH} characters.`,
      ],
    },
    label: {
      type: String,
      required: [true, 'Step label is required.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.STEP_LABEL_MAX_LENGTH,
        `Step label cannot exceed ${MESSAGE_CONSTANTS.STEP_LABEL_MAX_LENGTH} characters.`,
      ],
    },
    state: {
      type: String,
      enum: MESSAGE_CONSTANTS.STEP_STATES,
      default: 'done',
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
      min: [0, 'Step duration cannot be negative.'],
      validate: {
        validator: (v) => v === null || Number.isInteger(v),
        message: 'Step durationMs must be null or an integer.',
      },
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Subdocument discriminator schema for agent tool call telemetry, parameters, results, and approval state.
 */
const toolPartSchema = new mongoose.Schema(
  {
    toolCallId: {
      type: String,
      required: [true, 'Tool call ID is required for tool result correlation.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.TOOL_CALL_ID_MAX_LENGTH,
        `Tool call ID cannot exceed ${MESSAGE_CONSTANTS.TOOL_CALL_ID_MAX_LENGTH} characters.`,
      ],
    },
    toolName: {
      type: String,
      required: [true, 'Tool name is required.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.TOOL_NAME_MAX_LENGTH,
        `Tool name cannot exceed ${MESSAGE_CONSTANTS.TOOL_NAME_MAX_LENGTH} characters.`,
      ],
    },
    state: {
      type: String,
      required: true,
      enum: MESSAGE_CONSTANTS.TOOL_STATES,
      default: 'input-available',
    },
    actionCategory: {
      type: String,
      enum: [...CHAT_CONSTANTS.APPROVAL_CATEGORIES, null],
      default: null,
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      validate: {
        validator: isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: true }),
        message: `Tool input must be a bounded JSON object/array within ${MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES} bytes.`,
      },
    },
    outputSummary: {
      type: String,
      default: null,
      maxlength: [
        MESSAGE_CONSTANTS.TOOL_OUTPUT_SUMMARY_MAX_LENGTH,
        `Tool output summary cannot exceed ${MESSAGE_CONSTANTS.TOOL_OUTPUT_SUMMARY_MAX_LENGTH} characters.`,
      ],
    },
    artifact: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      validate: {
        validator: isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: true }),
        message: `Tool artifact must be a bounded JSON object/array within ${MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES} bytes.`,
      },
    },
    errorText: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.TOOL_ERROR_MAX_LENGTH,
        `Tool error text cannot exceed ${MESSAGE_CONSTANTS.TOOL_ERROR_MAX_LENGTH} characters.`,
      ],
    },
    approval: {
      interruptId: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.INTERRUPT_ID_MAX_LENGTH,
          `Approval interruptId cannot exceed ${CHAT_CONSTANTS.INTERRUPT_ID_MAX_LENGTH} characters.`,
        ],
      },
      payloadHash: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH,
          `Approval payloadHash cannot exceed ${CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH} characters.`,
        ],
      },
      status: {
        type: String,
        enum: [...MESSAGE_CONSTANTS.APPROVAL_DECISION_STATUSES, null],
        default: null,
      },
      decidedAt: {
        type: Date,
        default: null,
      },
    },
    generatedAssets: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Asset',
        },
      ],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.length <= MESSAGE_CONSTANTS.GENERATED_ASSET_MAX_PER_TOOL,
        message: `A single tool call cannot reference more than ${MESSAGE_CONSTANTS.GENERATED_ASSET_MAX_PER_TOOL} generated assets.`,
      },
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
      min: [0, 'Tool duration cannot be negative.'],
      validate: {
        validator: (v) => v === null || Number.isInteger(v),
        message: 'Tool durationMs must be null or an integer.',
      },
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

toolPartSchema.pre('validate', function () {
  if (
    this.state === 'approval-requested' &&
    (!isNonEmptyString(this.approval?.interruptId) ||
      !isNonEmptyString(this.approval?.payloadHash) ||
      this.approval?.status !== 'pending')
  ) {
    this.invalidate(
      'approval',
      'Tool state "approval-requested" requires approval.interruptId, approval.payloadHash, and approval.status === "pending".'
    );
  }
  if (
    this.state === 'approval-responded' &&
    !['approved', 'edited', 'rejected', 'expired'].includes(this.approval?.status)
  ) {
    this.invalidate(
      'approval.status',
      'Tool state "approval-responded" requires approval.status in approved, edited, rejected, or expired.'
    );
  }
  if (Array.isArray(this.generatedAssets) && this.generatedAssets.length > 1) {
    const seen = new Set();
    const deduped = [];
    for (const id of this.generatedAssets) {
      const s = normalizeIdString(id);
      if (s && !seen.has(s)) {
        seen.add(s);
        deduped.push(id);
      }
    }
    this.generatedAssets = deduped;
  }
});

/**
 * Subdocument discriminator schema for multimodal asset attachments and media references.
 */
const assetPartSchema = new mongoose.Schema(
  {
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: [true, 'Asset part must reference a persisted Asset ID.'],
    },
    modality: {
      type: String,
      required: [true, 'Asset part modality is required.'],
      enum: MESSAGE_CONSTANTS.ASSET_MODALITIES,
    },
    role: {
      type: String,
      required: [true, 'Asset part role is required.'],
      enum: MESSAGE_CONSTANTS.ASSET_PART_ROLES,
    },
    deliveryMode: {
      type: String,
      enum: MESSAGE_CONSTANTS.ASSET_DELIVERY_MODES,
      default: 'pending',
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Subdocument discriminator schema for verifiable source grounding citations.
 */
const citationPartSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      required: [true, 'Citation sourceType is required.'],
      enum: MESSAGE_CONSTANTS.CITATION_SOURCE_TYPES,
    },
    title: {
      type: String,
      required: [true, 'Citation title is required.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.CITATION_TITLE_MAX_LENGTH,
        `Citation title cannot exceed ${MESSAGE_CONSTANTS.CITATION_TITLE_MAX_LENGTH} characters.`,
      ],
    },
    url: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.CITATION_URL_MAX_LENGTH,
        `Citation URL cannot exceed ${MESSAGE_CONSTANTS.CITATION_URL_MAX_LENGTH} characters.`,
      ],
      validate: {
        validator: function (val) {
          if (this.sourceType === 'url') {
            return isValidHttpUrl(val);
          }
          return val === null || val === undefined || isValidHttpUrl(val);
        },
        message: 'Citation url must be a valid http/https URL (and is required for sourceType "url").',
      },
    },
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      default: null,
      validate: {
        validator: function (val) {
          if (this.sourceType === 'asset') {
            return isValidObjectIdValue(val);
          }
          return val === null || val === undefined || isValidObjectIdValue(val);
        },
        message: 'Citation asset ObjectId is required when sourceType is "asset".',
      },
    },
    pageNumber: {
      type: Number,
      default: null,
      min: [1, 'Citation pageNumber must be at least 1.'],
      validate: {
        validator: (v) => v === null || Number.isInteger(v),
        message: 'Citation pageNumber must be null or an integer.',
      },
    },
    chunkIndex: {
      type: Number,
      default: null,
      min: [0, 'Citation chunkIndex cannot be negative.'],
      validate: {
        validator: (v) => v === null || Number.isInteger(v),
        message: 'Citation chunkIndex must be null or an integer.',
      },
    },
    startIndex: {
      type: Number,
      default: null,
      min: [0, 'Citation startIndex cannot be negative.'],
      validate: {
        validator: (v) => v === null || Number.isInteger(v),
        message: 'Citation startIndex must be null or an integer.',
      },
    },
    endIndex: {
      type: Number,
      default: null,
      min: [0, 'Citation endIndex cannot be negative.'],
      validate: {
        validator: function (val) {
          if (val === null || val === undefined) return true;
          if (!Number.isInteger(val)) return false;
          if (this.startIndex !== null && this.startIndex !== undefined) {
            return val >= this.startIndex;
          }
          return true;
        },
        message: 'Citation endIndex must be an integer >= startIndex.',
      },
    },
    quoteSnippet: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.CITATION_QUOTE_MAX_LENGTH,
        `Citation quoteSnippet cannot exceed ${MESSAGE_CONSTANTS.CITATION_QUOTE_MAX_LENGTH} characters.`,
      ],
    },
    domainModel: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.CITATION_DOMAIN_MODEL_MAX_LENGTH,
        `Citation domainModel cannot exceed ${MESSAGE_CONSTANTS.CITATION_DOMAIN_MODEL_MAX_LENGTH} characters.`,
      ],
    },
    domainRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

citationPartSchema.pre('validate', function () {
  if (
    this.sourceType === 'domain_record' &&
    (!isNonEmptyString(this.domainModel) || !isValidObjectIdValue(this.domainRecordId))
  ) {
    this.invalidate(
      'domainRecordId',
      'Citation with sourceType "domain_record" requires both domainModel and domainRecordId.'
    );
  }
});

/**
 * Subdocument discriminator schema for structured tabular, metric, or chart datasets.
 */
const dataPartSchema = new mongoose.Schema(
  {
    schemaName: {
      type: String,
      required: [true, 'Structured UI data schemaName is required.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.DATA_SCHEMA_NAME_MAX_LENGTH,
        `Data schemaName cannot exceed ${MESSAGE_CONSTANTS.DATA_SCHEMA_NAME_MAX_LENGTH} characters.`,
      ],
    },
    schemaVersion: {
      type: String,
      required: [true, 'Structured UI data schemaVersion is required.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.DATA_SCHEMA_VERSION_MAX_LENGTH,
        `Data schemaVersion cannot exceed ${MESSAGE_CONSTANTS.DATA_SCHEMA_VERSION_MAX_LENGTH} characters.`,
      ],
      match: [
        MESSAGE_CONSTANTS.DATA_SCHEMA_VERSION_REGEX,
        'Data schemaVersion contains invalid characters.',
      ],
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Structured UI data payload is required.'],
      validate: {
        validator: isBoundedJsonPayload(MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES, { allowNull: false }),
        message: `Data payload must be a bounded JSON object/array within ${MESSAGE_CONSTANTS.MAX_JSON_PAYLOAD_BYTES} bytes.`,
      },
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Subdocument discriminator schema for recoverable tool execution and generation errors.
 */
const errorPartSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH,
        `Error code cannot exceed ${CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH} characters.`,
      ],
    },
    message: {
      type: String,
      required: [true, 'Error part message is required.'],
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.ERROR_MAX_LENGTH,
        `Error message cannot exceed ${CHAT_CONSTANTS.ERROR_MAX_LENGTH} characters.`,
      ],
    },
    reason: {
      type: String,
      enum: [...MESSAGE_CONSTANTS.FAILURE_REASONS, null],
      default: null,
    },
    retryable: {
      type: Boolean,
      default: true,
    },
    failedProvider: {
      type: String,
      enum: [...CHAT_CONSTANTS.PROVIDERS, null],
      default: null,
    },
    failedModel: {
      type: String,
      enum: [...CHAT_CONSTANTS.SUPPORTED_MODELS, null],
      default: null,
      trim: true,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

errorPartSchema.pre('validate', function () {
  if (this.failedModel !== null && this.failedModel !== undefined) {
    if (
      !this.failedProvider ||
      !getAllowedModelsForProvider(this.failedProvider).includes(this.failedModel)
    ) {
      this.invalidate(
        'failedModel',
        'Error part failedModel is incompatible with failedProvider.'
      );
    }
  }
});

/**
 * Root Mongoose schema definition for the Message model.
 * Enforces decoupled multimodal parts, branch lineage, attempt tracking, and citation grounding.
 */
const messageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: [true, 'Message must belong to a conversation thread.'],
      immutable: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Message must belong to an authenticated account owner.'],
      immutable: true,
      index: true,
    },
    role: {
      type: String,
      required: [true, 'Message role is required.'],
      enum: MESSAGE_CONSTANTS.ROLES,
      default: MESSAGE_CONSTANTS.DEFAULT_ROLE,
      immutable: true,
    },
    sequence: {
      type: Number,
      required: [true, 'Monotonic thread sequence number is required.'],
      min: [1, 'Message sequence must start at 1.'],
      immutable: true,
      validate: {
        validator: Number.isInteger,
        message: 'Message sequence must be an integer.',
      },
    },
    turnId: {
      type: String,
      required: [true, 'Logical turn identifier is required.'],
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.TURN_ID_MAX_LENGTH,
        `Turn ID cannot exceed ${CHAT_CONSTANTS.TURN_ID_MAX_LENGTH} characters.`,
      ],
      default: () => String(new mongoose.Types.ObjectId()),
      immutable: true,
    },
    branchId: {
      type: String,
      required: [true, 'Branch identifier is required.'],
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH,
        `Branch ID cannot exceed ${CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH} characters.`,
      ],
      default: CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
      immutable: true,
    },
    parentMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      immutable: true,
    },
    forkedFromMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      immutable: true,
    },
    editedFromMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      immutable: true,
    },
    attemptNumber: {
      type: Number,
      default: 1,
      min: [1, 'Attempt number must be at least 1.'],
      immutable: true,
      validate: {
        validator: Number.isInteger,
        message: 'Attempt number must be an integer.',
      },
    },
    isActiveAttempt: {
      type: Boolean,
      default: true,
    },
    supersededByMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    // LangChain / LangGraph Runtime Linkage
    langchainMessageId: {
      type: String,
      required: [true, 'LangChain message ID is required.'],
      trim: true,
      maxlength: [
        MESSAGE_CONSTANTS.ID_MAX_LENGTH,
        `LangChain message ID cannot exceed ${MESSAGE_CONSTANTS.ID_MAX_LENGTH} characters.`,
      ],
      default: function () {
        return this._id ? String(this._id) : undefined;
      },
      immutable: true,
    },
    runId: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.RUN_ID_MAX_LENGTH,
        `Run ID cannot exceed ${CHAT_CONSTANTS.RUN_ID_MAX_LENGTH} characters.`,
      ],
    },
    checkpointId: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH,
        `Checkpoint ID cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH} characters.`,
      ],
    },
    checkpointNs: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.CHECKPOINT_NS_MAX_LENGTH,
        `Checkpoint namespace cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_NS_MAX_LENGTH} characters.`,
      ],
    },

    // Execution Status & Continuation
    status: {
      type: String,
      required: [true, 'Message status is required.'],
      enum: MESSAGE_CONSTANTS.STATUSES,
      default: function () {
        return this.role === 'assistant' ? MESSAGE_CONSTANTS.DEFAULT_STATUS : 'completed';
      },
    },
    finishReason: {
      type: String,
      enum: [...MESSAGE_CONSTANTS.FINISH_REASONS, null],
      default: null,
    },
    continuationCount: {
      type: Number,
      default: 0,
      min: [0, 'Continuation count cannot be negative.'],
      validate: {
        validator: Number.isInteger,
        message: 'Continuation count must be an integer.',
      },
    },
    editedAt: {
      type: Date,
      default: null,
    },

    // Executed vs Requested Provider/Model Snapshot (FR-CORE-CONV-003, §22 attribution)
    provider: {
      type: String,
      enum: [...CHAT_CONSTANTS.PROVIDERS, null],
      default: null,
    },
    model: {
      type: String,
      enum: [...CHAT_CONSTANTS.SUPPORTED_MODELS, null],
      default: null,
      trim: true,
      validate: {
        validator: createProviderModelValidator('provider', {
          allowNull: true,
          modelPath: 'model',
        }),
        message: 'Message model is incompatible with message provider.',
      },
    },
    requestedProvider: {
      type: String,
      enum: [...CHAT_CONSTANTS.PROVIDERS, null],
      default: null,
    },
    requestedModel: {
      type: String,
      enum: [...CHAT_CONSTANTS.SUPPORTED_MODELS, null],
      default: null,
      trim: true,
      validate: {
        validator: createProviderModelValidator('requestedProvider', {
          allowNull: true,
          modelPath: 'requestedModel',
        }),
        message: 'Requested model is incompatible with requested provider.',
      },
    },
    generationConfig: {
      thinkingBudget: {
        type: Number,
        default: null,
        min: [
          CHAT_CONSTANTS.MIN_THINKING_BUDGET,
          `Thinking budget cannot be less than ${CHAT_CONSTANTS.MIN_THINKING_BUDGET}.`,
        ],
        max: [
          CHAT_CONSTANTS.MAX_THINKING_BUDGET,
          `Thinking budget cannot exceed ${CHAT_CONSTANTS.MAX_THINKING_BUDGET} tokens.`,
        ],
        validate: {
          validator: (v) => v === null || Number.isInteger(v),
          message: 'Thinking budget snapshot must be null or an integer.',
        },
      },
      temperature: {
        type: Number,
        default: null,
        min: [
          CHAT_CONSTANTS.MIN_TEMPERATURE,
          `Temperature cannot be lower than ${CHAT_CONSTANTS.MIN_TEMPERATURE}.`,
        ],
        max: [
          CHAT_CONSTANTS.MAX_TEMPERATURE,
          `Temperature cannot exceed ${CHAT_CONSTANTS.MAX_TEMPERATURE}.`,
        ],
        validate: {
          validator: (v) => v === null || Number.isFinite(v),
          message: 'Temperature snapshot must be null or a finite number.',
        },
      },
      language: {
        type: String,
        enum: [...CHAT_CONSTANTS.SUPPORTED_LANGUAGES, null],
        default: null,
      },
      sttEngine: {
        type: String,
        enum: [...CHAT_CONSTANTS.STT_ENGINES, null],
        default: null,
      },
    },

    // Normalized LangChain Usage Telemetry (`usage_metadata`)
    usage: {
      inputTokens: {
        type: Number,
        default: 0,
        min: [0, 'Input token count cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Input token count must be an integer.',
        },
      },
      outputTokens: {
        type: Number,
        default: 0,
        min: [0, 'Output token count cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Output token count must be an integer.',
        },
      },
      reasoningTokens: {
        type: Number,
        default: 0,
        min: [0, 'Reasoning token count cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Reasoning token count must be an integer.',
        },
      },
      cachedInputTokens: {
        type: Number,
        default: 0,
        min: [0, 'Cached input token count cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Cached input token count must be an integer.',
        },
      },
      totalTokens: {
        type: Number,
        default: 0,
        min: [0, 'Total token count cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Total token count must be an integer.',
        },
      },
      estimatedCostUsd: {
        type: Number,
        default: 0,
        min: [0, 'Estimated cost cannot be negative.'],
        validate: {
          validator: Number.isFinite,
          message: 'Estimated cost must be a finite number.',
        },
      },
    },

    // Recoverable Failure State (non-null message only when status === 'failed')
    error: {
      code: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH,
          `Error code cannot exceed ${CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH} characters.`,
        ],
      },
      message: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.ERROR_MAX_LENGTH,
          `Error message cannot exceed ${CHAT_CONSTANTS.ERROR_MAX_LENGTH} characters.`,
        ],
      },
      reason: {
        type: String,
        enum: [...MESSAGE_CONSTANTS.FAILURE_REASONS, null],
        default: null,
      },
      retryable: {
        type: Boolean,
        default: true,
      },
      failedProvider: {
        type: String,
        enum: [...CHAT_CONSTANTS.PROVIDERS, null],
        default: null,
      },
      failedModel: {
        type: String,
        enum: [...CHAT_CONSTANTS.SUPPORTED_MODELS, null],
        default: null,
        trim: true,
      },
      suggestedModels: {
        type: [
          {
            type: String,
            enum: CHAT_CONSTANTS.SUPPORTED_MODELS,
          },
        ],
        default: [],
        validate: {
          validator: (arr) =>
            Array.isArray(arr) && arr.length <= MESSAGE_CONSTANTS.MAX_SUGGESTED_MODELS,
          message: `Cannot suggest more than ${MESSAGE_CONSTANTS.MAX_SUGGESTED_MODELS} fallback models.`,
        },
      },
      occurredAt: {
        type: Date,
        default: null,
      },
    },

    // Ordered Polymorphic Message Parts (Single Source of Content Ordering)
    parts: {
      type: [basePartSchema],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.length <= MESSAGE_CONSTANTS.MAX_PARTS_PER_MESSAGE,
        message: `Message cannot contain more than ${MESSAGE_CONSTANTS.MAX_PARTS_PER_MESSAGE} parts.`,
      },
    },

    // Denormalized Top-Level Unique Asset ObjectIds (O(log N) sweeper & deletion ref-checks)
    assets: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Asset',
        },
      ],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.length <= MESSAGE_CONSTANTS.MAX_ASSETS_PER_MESSAGE,
        message: `Message cannot reference more than ${MESSAGE_CONSTANTS.MAX_ASSETS_PER_MESSAGE} assets.`,
      },
    },

    // Server-Only Opaque Provider Signatures (e.g. Gemini 3 encrypted thoughtSignature tokens; NEVER plaintext reasoning, ALWAYS select:false)
    opaqueSignatures: {
      type: [
        new mongoose.Schema(
          {
            partIndex: {
              type: Number,
              required: true,
              min: 0,
              validate: {
                validator: Number.isInteger,
                message: 'Opaque signature partIndex must be a non-negative integer.',
              },
            },
            partType: {
              type: String,
              required: true,
              enum: MESSAGE_CONSTANTS.PART_TYPES,
            },
            toolCallId: {
              type: String,
              default: null,
              trim: true,
              maxlength: MESSAGE_CONSTANTS.TOOL_CALL_ID_MAX_LENGTH,
            },
            signature: {
              type: String,
              required: true,
              validate: {
                validator: (val) =>
                  typeof val === 'string' &&
                  val.length > 0 &&
                  Buffer.byteLength(val, 'utf8') <= MESSAGE_CONSTANTS.OPAQUE_SIGNATURE_MAX_BYTES,
                message: 'Opaque signature exceeds allowed byte budget.',
              },
            },
          },
          EMBEDDED_SCHEMA_OPTIONS
        ),
      ],
      select: false,
      default: undefined,
      validate: {
        validator: (arr) =>
          arr === undefined ||
          (Array.isArray(arr) && arr.length <= MESSAGE_CONSTANTS.MAX_OPAQUE_SIGNATURES),
        message: `Cannot store more than ${MESSAGE_CONSTANTS.MAX_OPAQUE_SIGNATURES} opaque provider signatures.`,
      },
    },

    // Soft Deletion / Branch Purge Lifecycle
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Register Polymorphic Array Discriminators on parts
const partsArrayPath = messageSchema.path('parts');
partsArrayPath.discriminator('text', textPartSchema);
partsArrayPath.discriminator('step', stepPartSchema);
partsArrayPath.discriminator('tool', toolPartSchema);
partsArrayPath.discriminator('asset', assetPartSchema);
partsArrayPath.discriminator('citation', citationPartSchema);
partsArrayPath.discriminator('data', dataPartSchema);
partsArrayPath.discriminator('error', errorPartSchema);

/**
 * Shared serialization transform for toJSON and toObject on Message.
 * Strips opaque Google model continuation signatures, version key, and unselected virtuals.
 *
 * @param {import('mongoose').Document} _doc - Source document instance.
 * @param {Record<string, any>} ret - Transformed plain JavaScript object.
 * @returns {Record<string, any>} Sanitized plain object.
 */
const sanitizeMessageTransform = (_doc, ret) => {
  delete ret.opaqueSignatures;
  delete ret.id;
  delete ret.__v;
  for (const key of ['text', 'toolCallCount', 'citationCount', 'isError', 'isStopped', 'isStreaming']) {
    if (ret[key] === undefined) {
      delete ret[key];
    }
  }
  return ret;
};

messageSchema.set('toJSON', {
  ...BASE_SCHEMA_OPTIONS.toJSON,
  transform: sanitizeMessageTransform,
});
messageSchema.set('toObject', {
  ...BASE_SCHEMA_OPTIONS.toObject,
  transform: sanitizeMessageTransform,
});


// 1. Strict unique causal sequence per conversation thread
messageSchema.index({ chat: 1, sequence: 1 }, { unique: true });

// 2. Primary active branch timeline & keyset cursor pagination
messageSchema.index({ chat: 1, branchId: 1, isDeleted: 1, isActiveAttempt: 1, sequence: -1 });

// 3. Branch sibling switcher (< 1 / M > edited alternatives sharing parentMessageId)
messageSchema.index({ chat: 1, parentMessageId: 1, role: 1, isDeleted: 1, sequence: 1 });

// 4. Retry attempt switcher (< Attempt 1 / N > sharing logical turnId)
messageSchema.index({ chat: 1, turnId: 1, role: 1, attemptNumber: 1 });

// 5. Bijective LangChain / LangGraph checkpoint message mapping
messageSchema.index({ chat: 1, langchainMessageId: 1 }, { unique: true });

// 6. Fast owner-scoped Asset reference lookup (deletion & orphan sweeper protection)
messageSchema.index(
  { user: 1, assets: 1 },
  { partialFilterExpression: { isDeleted: false } }
);

// 7. Owner-scoped multilingual English + Amharic/Ethiopic full-text search (Snowball stemmer disabled)
messageSchema.index(
  { user: 1, 'parts.text': 'text' },
  { name: 'message_parts_text_search', default_language: 'none', language_override: 'no_language_override', weights: { 'parts.text': 10 } }
);

// 8. Owner-scoped chronological index & compliance export
messageSchema.index({ user: 1, chat: 1, isDeleted: 1, createdAt: -1 });

// Pagination plugin
messageSchema.plugin(mongoosePaginate);

/**
 * Derived virtual getter: text
 * Joins all text parts into a single newline-delimited plain string.
 *
 * @memberof messageSchema
 * @returns {string|undefined} Concatenated text content, or undefined if parts/type/text was omitted in projection.
 */
messageSchema.virtual('text').get(function () {
  if (
    !isPathSelected(this, 'parts.type') ||
    !isPathSelected(this, 'parts.text') ||
    !Array.isArray(this.parts)
  ) {
    return undefined;
  }
  return this.parts
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n');
});

/**
 * Derived virtual getter: toolCallCount
 * Computes the total number of tool parts contained in this message turn.
 *
 * @memberof messageSchema
 * @returns {number|undefined} Count of tool parts or undefined if parts was omitted in projection.
 */
messageSchema.virtual('toolCallCount').get(function () {
  if (!isPathSelected(this, 'parts.type') || !Array.isArray(this.parts)) return undefined;
  return this.parts.filter((p) => p?.type === 'tool').length;
});

/**
 * Derived virtual getter: citationCount
 * Computes the total number of citation parts contained in this message turn.
 *
 * @memberof messageSchema
 * @returns {number|undefined} Count of citation parts or undefined if parts was omitted in projection.
 */
messageSchema.virtual('citationCount').get(function () {
  if (!isPathSelected(this, 'parts.type') || !Array.isArray(this.parts)) return undefined;
  return this.parts.filter((p) => p?.type === 'citation').length;
});

/**
 * Derived virtual getter: isError
 * Checks whether message execution status is 'failed'.
 *
 * @memberof messageSchema
 * @returns {boolean|undefined} True if status is 'failed'; undefined if status omitted in projection.
 */
messageSchema.virtual('isError').get(function () {
  if (!isPathSelected(this, 'status')) return undefined;
  return this.status === 'failed';
});

/**
 * Derived virtual getter: isStopped
 * Checks whether message execution status is 'stopped'.
 *
 * @memberof messageSchema
 * @returns {boolean|undefined} True if status is 'stopped'; undefined if status omitted in projection.
 */
messageSchema.virtual('isStopped').get(function () {
  if (!isPathSelected(this, 'status')) return undefined;
  return this.status === 'stopped';
});

/**
 * Derived virtual getter: isStreaming
 * Checks whether message execution status is 'queued' or 'streaming'.
 *
 * @memberof messageSchema
 * @returns {boolean|undefined} True if message is currently streaming; undefined if status omitted in projection.
 */
messageSchema.virtual('isStreaming').get(function () {
  if (!isPathSelected(this, 'status')) return undefined;
  return this.status === 'queued' || this.status === 'streaming';
});

/**
 * Document Pre-validation Middleware:
 * Enforces multimodal non-empty constraint, synchronizes denormalized assets array from parts,
 * validates tool call/result pairing, verifies citation integrity, and guards branch invariants.
 */
messageSchema.pre('validate', function () {
  const roleKnown = this.isNew || isPathSelected(this, 'role');
  const statusKnown = this.isNew || isPathSelected(this, 'status') || this.isModified('status');
  const partsKnown =
    this.isNew || isPartsFullySelected(this) || this.isDirectModified('parts');
  const partsModified = !this.isNew && (this.isDirectModified('parts') || this.isModified('parts'));
  const assetsKnown =
    this.isNew || isPathSelected(this, 'assets') || this.isDirectModified('assets') || this.isModified('assets');
  const assetsModified = !this.isNew && (this.isDirectModified('assets') || this.isModified('assets'));
  const parentKnown = this.isNew || isPathSelected(this, 'parentMessageId') || this.isModified('parentMessageId');

  // Guard partial-projection edits to parts or assets before touching assets sync
  if (partsModified && (!partsKnown || !roleKnown || !assetsKnown)) {
    this.invalidate(
      'parts',
      'Modifying parts on an existing Message requires role, assets, and full parts selection.'
    );
  }
  if (assetsModified && (!partsKnown || !roleKnown)) {
    this.invalidate(
      'assets',
      'Modifying assets on an existing Message requires role and full parts selection.'
    );
  }

  // 1. LangChain message ID coherence
  const lcIdKnown = this.isNew || isPathSelected(this, 'langchainMessageId') || this.isModified('langchainMessageId');
  if (lcIdKnown && !isNonEmptyString(this.langchainMessageId) && this._id) {
    this.langchainMessageId = String(this._id);
  }

  // 2. Collect asset refs from parts & sync Message.assets cleanly when full state is known
  let totalTextLength = 0;
  let hasNonEmptyText = false;
  const partAssetIds = [];
  const seenToolCallIds = new Set();

  if (partsKnown && Array.isArray(this.parts)) {
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      if (!part) continue;

      if (roleKnown && this.role === 'user' && !MESSAGE_CONSTANTS.USER_ALLOWED_PART_TYPES.includes(part.type)) {
        this.invalidate(
          `parts.${i}.type`,
          `User messages may only contain part types: ${MESSAGE_CONSTANTS.USER_ALLOWED_PART_TYPES.join(', ')}.`
        );
      } else if (roleKnown && this.role === 'system' && !MESSAGE_CONSTANTS.SYSTEM_ALLOWED_PART_TYPES.includes(part.type)) {
        this.invalidate(
          `parts.${i}.type`,
          `System messages may only contain part types: ${MESSAGE_CONSTANTS.SYSTEM_ALLOWED_PART_TYPES.join(', ')}.`
        );
      }

      if (part.type === 'text' && typeof part.text === 'string') {
        totalTextLength += part.text.length;
        if (part.text.trim().length > 0) hasNonEmptyText = true;
      } else if (part.type === 'tool') {
        if (typeof part.toolCallId === 'string' && part.toolCallId.trim()) {
          const cleanToolId = part.toolCallId.trim();
          if (seenToolCallIds.has(cleanToolId)) {
            this.invalidate(`parts.${i}.toolCallId`, `Duplicate toolCallId "${cleanToolId}" within single message.`);
          } else {
            seenToolCallIds.add(cleanToolId);
          }
        }
        if (Array.isArray(part.generatedAssets)) {
          for (const aid of part.generatedAssets) {
            if (isValidObjectIdValue(aid)) partAssetIds.push(aid);
          }
        }
      } else if (part.type === 'asset') {
        if (roleKnown && this.role === 'assistant' && part.role === 'user_upload') {
          this.invalidate(`parts.${i}.role`, 'Assistant messages cannot hold asset parts with role "user_upload".');
        } else if (roleKnown && this.role === 'user' && part.role !== 'user_upload') {
          this.invalidate(`parts.${i}.role`, 'User messages may only hold asset parts with role "user_upload".');
        }
        if (isValidObjectIdValue(part.asset)) {
          partAssetIds.push(part.asset);
        }
      } else if (part.type === 'citation' && isValidObjectIdValue(part.asset)) {
        partAssetIds.push(part.asset);
      }
    }

    if (roleKnown) {
      const roleMax =
        this.role === 'user'
          ? MESSAGE_CONSTANTS.USER_TEXT_MAX_LENGTH
          : this.role === 'assistant'
            ? MESSAGE_CONSTANTS.ASSISTANT_TEXT_MAX_LENGTH
            : MESSAGE_CONSTANTS.SYSTEM_TEXT_MAX_LENGTH;
      if (totalTextLength > roleMax) {
        this.invalidate(
          'parts',
          `Total ${this.role} text length (${totalTextLength}) exceeds the ${roleMax} character limit.`
        );
      }
    }
  }

  if (assetsKnown && partsKnown && (this.isNew || (roleKnown && (partsModified || assetsModified)))) {
    const mergeSources = [];
    const preserveShorthandAssets =
      (this.isNew || this.isDirectModified('assets') || !this.isModified('parts')) &&
      Array.isArray(this.assets);
    if (preserveShorthandAssets) {
      for (const a of this.assets) {
        if (isValidObjectIdValue(a)) mergeSources.push(a);
      }
    }
    for (const a of partAssetIds) {
      mergeSources.push(a);
    }
    const seenAssets = new Set();
    const dedupedAssets = [];
    for (const aid of mergeSources) {
      const key = String(aid);
      if (!seenAssets.has(key)) {
        seenAssets.add(key);
        dedupedAssets.push(aid);
      }
    }
    this.assets = dedupedAssets;
  }

  // 3. Role-specific invariants (partial-projection safe & fail-closed)
  if (!this.isNew && this.isModified('status') && !roleKnown) {
    this.invalidate('role', 'role must be selected when modifying message status.');
  }
  if (roleKnown && this.role === 'user') {
    if (statusKnown && !MESSAGE_CONSTANTS.USER_ALLOWED_STATUSES.includes(this.status)) {
      this.invalidate('status', `User messages only allow status: ${MESSAGE_CONSTANTS.USER_ALLOWED_STATUSES.join(', ')}.`);
    }
    if ((this.isNew || isPathSelected(this, 'attemptNumber')) && this.attemptNumber !== 1) {
      this.invalidate('attemptNumber', 'User messages must have attemptNumber equal to 1.');
    }
    if (partsKnown && assetsKnown) {
      const assetCount = Array.isArray(this.assets) ? this.assets.length : 0;
      if (!hasNonEmptyText && assetCount === 0) {
        this.invalidate(
          'parts',
          'User message must include non-empty text or at least one valid Asset attachment/audio reference.'
        );
      }
      if (assetCount > MESSAGE_CONSTANTS.MAX_USER_ASSETS_PER_MESSAGE) {
        this.invalidate(
          'assets',
          `User message cannot exceed ${MESSAGE_CONSTANTS.MAX_USER_ASSETS_PER_MESSAGE} assets per turn.`
        );
      }
    }
  } else if (roleKnown && this.role === 'assistant') {
    if (parentKnown && !isValidObjectIdValue(this.parentMessageId)) {
      this.invalidate(
        'parentMessageId',
        'Assistant message must reference an anchor user parentMessageId.'
      );
    }
    if (statusKnown && this.status === 'completed') {
      if (!partsKnown) {
        if (!this.isNew && this.isModified('status')) {
          this.invalidate('parts', 'Full parts must be selected when marking an assistant message completed.');
        }
      } else if (!Array.isArray(this.parts) || this.parts.length === 0) {
        this.invalidate('parts', 'Completed assistant message must contain at least one content part.');
      }
    }
  } else if (roleKnown && this.role === 'system') {
    if (statusKnown && !MESSAGE_CONSTANTS.SYSTEM_ALLOWED_STATUSES.includes(this.status)) {
      this.invalidate('status', `System messages only allow status: ${MESSAGE_CONSTANTS.SYSTEM_ALLOWED_STATUSES.join(', ')}.`);
    }
  }

  // 4. Symmetric Provider / Model invariants across roles and completion states
  const providerKnown = this.isNew || isPathSelected(this, 'provider') || this.isModified('provider');
  const modelKnown = this.isNew || isPathSelected(this, 'model') || this.isModified('model');
  const reqProvKnown = this.isNew || isPathSelected(this, 'requestedProvider') || this.isModified('requestedProvider');
  const reqModelKnown = this.isNew || isPathSelected(this, 'requestedModel') || this.isModified('requestedModel');

  if (!this.isNew) {
    if (this.isModified('provider') && !modelKnown) {
      this.invalidate('model', 'model must be selected or updated when modifying provider.');
    }
    if (this.isModified('requestedProvider') && !reqModelKnown) {
      this.invalidate(
        'requestedModel',
        'requestedModel must be selected or updated when modifying requestedProvider.'
      );
    }
  }
  if (
    providerKnown &&
    modelKnown &&
    ((this.provider === null && this.model !== null) ||
      (this.provider !== null && !getAllowedModelsForProvider(this.provider).includes(this.model)))
  ) {
    this.invalidate('model', 'provider and model must both be null or form a compatible pair.');
  }
  if (
    reqProvKnown &&
    reqModelKnown &&
    ((this.requestedProvider === null && this.requestedModel !== null) ||
      (this.requestedProvider !== null &&
        !getAllowedModelsForProvider(this.requestedProvider).includes(this.requestedModel)))
  ) {
    this.invalidate(
      'requestedModel',
      'requestedProvider and requestedModel must both be null or form a compatible pair.'
    );
  }

  if (roleKnown && (this.role === 'user' || this.role === 'system')) {
    if (providerKnown && this.provider !== null) {
      this.invalidate('provider', `${this.role} messages cannot carry an LLM provider attribution.`);
    }
    if (modelKnown && this.model !== null) {
      this.invalidate('model', `${this.role} messages cannot carry an LLM model attribution.`);
    }
    if (reqProvKnown && this.requestedProvider !== null) {
      this.invalidate('requestedProvider', `${this.role} messages cannot carry a requestedProvider attribution.`);
    }
    if (reqModelKnown && this.requestedModel !== null) {
      this.invalidate('requestedModel', `${this.role} messages cannot carry a requestedModel attribution.`);
    }
  } else if (roleKnown && this.role === 'assistant' && statusKnown && this.status === 'completed') {
    if (!this.isNew && this.isModified('status') && (!providerKnown || !modelKnown)) {
      this.invalidate(
        'model',
        'provider and model must be selected when marking an assistant message completed.'
      );
    } else if ((providerKnown && !this.provider) || (modelKnown && !this.model)) {
      this.invalidate('model', 'Completed assistant messages must record both provider and model.');
    }
  }

  // 5. Top-level error coherence (partial-projection safe & fail-closed across ALL statuses)
  const errMsgKnown =
    this.isNew ||
    isPathSelected(this, 'error.message') ||
    this.isModified('error.message') ||
    this.isDirectModified('error');
  const errMsgChanged =
    this.isNew || this.isModified('error.message') || this.isDirectModified('error');
  const errFailedProvKnown =
    this.isNew ||
    isPathSelected(this, 'error.failedProvider') ||
    this.isModified('error.failedProvider') ||
    this.isDirectModified('error');
  const errFailedModelKnown =
    this.isNew ||
    isPathSelected(this, 'error.failedModel') ||
    this.isModified('error.failedModel') ||
    this.isDirectModified('error');

  if (!this.isNew && this.isModified('error.failedProvider') && !errFailedModelKnown) {
    this.invalidate(
      'error.failedModel',
      'error.failedModel must be selected or updated when modifying error.failedProvider.'
    );
  }
  if (errFailedModelKnown && this.error?.failedModel) {
    if (!errFailedProvKnown) {
      this.invalidate('error.failedProvider', 'error.failedProvider must be selected with error.failedModel.');
    } else if (
      !this.error.failedProvider ||
      !getAllowedModelsForProvider(this.error.failedProvider).includes(this.error.failedModel)
    ) {
      this.invalidate('error.failedModel', 'error.failedModel is incompatible with error.failedProvider.');
    }
  }

  if (errMsgChanged && isNonEmptyString(this.error?.message)) {
    if (!statusKnown) {
      this.invalidate('status', 'status must be selected or updated when setting error.message.');
    } else if (this.status !== 'failed') {
      this.invalidate('error.message', 'error.message may only be non-empty when status is "failed".');
    }
  }

  if (statusKnown && this.status === 'failed') {
    if (!errMsgKnown) {
      this.invalidate('error.message', 'error.message must be selected or provided when status is "failed".');
    } else if (!isNonEmptyString(this.error?.message)) {
      this.invalidate('error.message', 'Failed messages must include a non-empty error.message.');
    }
    if ((this.isNew || isPathSelected(this, 'error.occurredAt') || this.isModified('status')) && this.error && !this.error.occurredAt) {
      this.error.occurredAt = new Date();
    }
  } else if (statusKnown && this.status !== 'failed') {
    if (errMsgKnown && isNonEmptyString(this.error?.message)) {
      if (this.isNew || !this.isModified('status') || this.isModified('error.message') || this.isDirectModified('error')) {
        this.invalidate('error.message', `Messages with status "${this.status}" cannot carry an active failure error.message.`);
      } else {
        this.error = createEmptyMessageError();
      }
    } else if (this.isNew || this.isModified('status')) {
      this.error = createEmptyMessageError();
    }
  }

  // 6. Soft-deletion timestamp coherence (syncs deletedAt cleanly even when deletedAt is unselected)
  const deletedKnown = this.isNew || isPathSelected(this, 'isDeleted') || this.isModified('isDeleted');
  const deletedAtKnown = this.isNew || isPathSelected(this, 'deletedAt') || this.isModified('deletedAt');
  if (deletedKnown && (this.isNew || this.isModified('isDeleted') || deletedAtKnown)) {
    if (this.isDeleted) {
      this.deletedAt = this.deletedAt || new Date();
    } else {
      this.deletedAt = null;
    }
  } else if (!deletedKnown && deletedAtKnown && this.isModified('deletedAt') && this.deletedAt !== null) {
    this.invalidate('isDeleted', 'isDeleted must be selected or set when setting deletedAt.');
  }
});

/**
 * Query Pre-update Middleware:
 * Enforces path immutability for chat, user, sequence, turnId, role, and branchId;
 * guards discriminator part integrity on update, synchronizes denormalized assets array,
 * and validates soft-deletion timestamp consistency.
 */
messageSchema.pre(['findOneAndUpdate', 'updateOne'], function () {
  const update = this.getUpdate();
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return;
  }

  const operatorEntries = Object.entries(update).filter(([key]) => key.startsWith('$'));
  const filterObj = this.getFilter?.() || {};

  // 1. Immutable identity & structural fields cannot be reassigned or unset
  const immutablePaths = [
    'chat',
    'user',
    'role',
    'sequence',
    'turnId',
    'branchId',
    'parentMessageId',
    'forkedFromMessageId',
    'editedFromMessageId',
    'attemptNumber',
    'langchainMessageId',
  ];

  for (const [op, opLayer] of operatorEntries) {
    if (!opLayer || typeof opLayer !== 'object' || Array.isArray(opLayer)) continue;
    for (const blockedPath of immutablePaths) {
      if (
        hasLayerPathConflict(opLayer, blockedPath) ||
        (op === '$rename' &&
          Object.values(opLayer).some(
            (dst) => typeof dst === 'string' && pathTouchesTarget(dst, blockedPath)
          ))
      ) {
        throw new Error(`Cannot mutate immutable Message field (${blockedPath}).`);
      }
    }
  }
  for (const key of Object.keys(update)) {
    if (!key.startsWith('$')) {
      for (const blockedPath of immutablePaths) {
        if (pathTouchesTarget(key, blockedPath)) {
          throw new Error(`Cannot mutate immutable Message field (${blockedPath}).`);
        }
      }
    }
  }

  // 2. Guard non-nullable required containers/scalars & paired fields against null/unset/rename
  const requiredNonNullPaths = [
    'status',
    'parts',
    'assets',
    'isActiveAttempt',
    'isDeleted',
    'error',
    'usage',
    'generationConfig',
  ];
  const touchesExactOrRoot = (layer, target) =>
    Boolean(layer && typeof layer === 'object' && !Array.isArray(layer) && Object.hasOwn(layer, target));

  for (const reqPath of requiredNonNullPaths) {
    if (
      resolveUpdateField(update, reqPath) === null ||
      touchesExactOrRoot(update.$unset, reqPath) ||
      (update.$rename &&
        typeof update.$rename === 'object' &&
        (touchesExactOrRoot(update.$rename, reqPath) ||
          Object.values(update.$rename).some((dst) => dst === reqPath)))
    ) {
      throw new Error(`Cannot set ${reqPath} to null or unset/rename it.`);
    }
  }

  for (const protectedContainer of ['parts', 'assets']) {
    if (
      hasLayerPathConflict(update.$unset, protectedContainer) ||
      hasLayerPathConflict(update.$pull, protectedContainer) ||
      hasLayerPathConflict(update.$pullAll, protectedContainer) ||
      hasLayerPathConflict(update.$pop, protectedContainer) ||
      (update.$rename &&
        typeof update.$rename === 'object' &&
        (hasLayerPathConflict(update.$rename, protectedContainer) ||
          Object.values(update.$rename).some(
            (dst) => typeof dst === 'string' && pathTouchesTarget(dst, protectedContainer)
          )))
    ) {
      throw new Error(`Cannot $unset, $rename, $pull, $pullAll, or $pop ${protectedContainer} via raw query update.`);
    }
  }

  const pairedModelFields = [
    ['provider', 'model'],
    ['requestedProvider', 'requestedModel'],
    ['error.failedProvider', 'error.failedModel'],
  ];
  for (const [provPath, modelPath] of pairedModelFields) {
    for (const p of [provPath, modelPath]) {
      if (
        touchesExactOrRoot(update.$unset, p) ||
        (update.$rename &&
          typeof update.$rename === 'object' &&
          (touchesExactOrRoot(update.$rename, p) ||
            Object.values(update.$rename).some((dst) => dst === p)))
      ) {
        throw new Error(`Cannot unset or rename paired Message field (${p}); set paired null values instead.`);
      }
    }
  }

  // 3. Symmetric provider/model pairing validation (including $setOnInsert & top-level updates)
  const updRole =
    resolveUpdateField(update, 'role') ??
    (typeof filterObj.role === 'string' ? filterObj.role : undefined);

  for (const [provPath, modelPath] of pairedModelFields) {
    const updProvVal = resolveUpdateField(update, provPath);
    const updModelVal = resolveUpdateField(update, modelPath);
    if (updProvVal === undefined && updModelVal === undefined) {
      continue;
    }

    if (
      (updRole === 'user' || updRole === 'system') &&
      provPath !== 'error.failedProvider' &&
      ((updProvVal !== undefined && updProvVal !== null) ||
        (updModelVal !== undefined && updModelVal !== null))
    ) {
      throw new Error(`${updRole} messages cannot carry LLM provider/model attribution.`);
    }

    const filterProv = extractObjectPath(filterObj, provPath);
    const filterModel = extractObjectPath(filterObj, modelPath);
    const effProv =
      updProvVal !== undefined
        ? updProvVal
        : typeof filterProv === 'string' || filterProv === null
          ? filterProv
          : undefined;
    const effModel =
      updModelVal !== undefined
        ? updModelVal
        : typeof filterModel === 'string' || filterModel === null
          ? filterModel
          : undefined;

    if (provPath === 'error.failedProvider') {
      if (updProvVal !== undefined && updModelVal === undefined && filterModel === undefined) {
        throw new Error(`Query update changing ${provPath} must also supply or filter ${modelPath}.`);
      }
      if (effModel !== undefined && effModel !== null) {
        if (typeof effProv !== 'string' || !getAllowedModelsForProvider(effProv).includes(effModel)) {
          throw new Error(`Query update with ${modelPath} must supply compatible ${provPath}.`);
        }
      }
    } else {
      if (effProv === undefined || effModel === undefined) {
        throw new Error(
          `Query update touching ${provPath} or ${modelPath} must supply or filter both paired fields.`
        );
      }
      if (effProv !== null || effModel !== null) {
        if (typeof effProv !== 'string' || !getAllowedModelsForProvider(effProv).includes(effModel)) {
          throw new Error(`Query update ${provPath} and ${modelPath} must be null together or form a valid pair.`);
        }
      }
    }
  }

  // Conflict-safe helper for deriving/resetting scalar/nested fields into the right write layer
  const hasModifiers = operatorEntries.length > 0;
  const ensureWriteLayer = () => (hasModifiers ? (update.$set ??= {}) : update);

  const injectSetField = (field, value, { force = false } = {}) => {
    for (const [op, opLayer] of operatorEntries) {
      if (!opLayer || typeof opLayer !== 'object') continue;
      if (op !== '$set' && op !== '$setOnInsert' && hasLayerPathConflict(opLayer, field)) return;
      if (
        op === '$rename' &&
        Object.values(opLayer).some((dst) => typeof dst === 'string' && pathTouchesTarget(dst, field))
      ) {
        return;
      }
    }
    if (!force && resolveUpdateField(update, field) !== undefined) return;
    const targetLayer = ensureWriteLayer();
    if (hasModifiers) {
      const topDot = Object.keys(update).some(
        (k) => !k.startsWith('$') && pathTouchesTarget(k, field)
      );
      if (topDot) return;
    }
    if (force) {
      for (const layer of [update.$set, update.$setOnInsert, update]) {
        const loc = findPathLocation(layer, field);
        if (loc) loc.target[loc.key] = value;
      }
    }
    const parentRoot = field.split('.')[0];
    if (findPathLocation(targetLayer, parentRoot) && parentRoot !== field) {
      const parentLoc = findPathLocation(targetLayer, parentRoot);
      if (
        parentLoc &&
        parentLoc.value &&
        typeof parentLoc.value === 'object' &&
        !Array.isArray(parentLoc.value)
      ) {
        const leafParts = field.split('.').slice(1);
        let cur = parentLoc.value;
        for (let i = 0; i < leafParts.length - 1; i++) {
          if (!cur[leafParts[i]] || typeof cur[leafParts[i]] !== 'object') {
            if (!force) return;
            cur[leafParts[i]] = {};
          }
          cur = cur[leafParts[i]];
        }
        if (force || !Object.hasOwn(cur, leafParts.at(-1))) {
          cur[leafParts.at(-1)] = value;
        }
        return;
      }
    }
    if (force || !Object.hasOwn(targetLayer, field)) {
      targetLayer[field] = value;
    }
  };

  // 4. Status <-> error & empty parts coherence on query updates
  const updStatus = resolveUpdateField(update, 'status');
  const filterStatus = typeof filterObj.status === 'string' ? filterObj.status : undefined;
  const effStatus = updStatus !== undefined ? updStatus : filterStatus;
  const updErrMsg = resolveUpdateField(update, 'error.message');
  const updParts = resolveUpdateField(update, 'parts');

  if (updStatus === 'failed' && !isNonEmptyString(updErrMsg)) {
    throw new Error('Cannot mark message status "failed" without a non-empty error.message.');
  }
  if (updErrMsg !== undefined && isNonEmptyString(updErrMsg) && effStatus !== 'failed') {
    throw new Error('Cannot set non-empty error.message unless status is "failed".');
  }
  if (typeof updStatus === 'string' && updStatus !== 'failed') {
    const emptyErr = createEmptyMessageError();
    for (const [k, v] of Object.entries(emptyErr)) {
      injectSetField(`error.${k}`, v, { force: true });
    }
  }
  if (updStatus === 'completed' && Array.isArray(updParts) && updParts.length === 0) {
    throw new Error('Cannot set status "completed" alongside an empty parts array.');
  }

  // 5. Strict validation & Message.assets sync for parts/assets query mutations
  const pushedParts = [];
  for (const opKey of ['$push', '$addToSet']) {
    const opLayer = update[opKey];
    if (opLayer && typeof opLayer === 'object' && Object.hasOwn(opLayer, 'parts')) {
      const rawVal = opLayer.parts;
      if (
        opKey === '$push' &&
        rawVal &&
        typeof rawVal === 'object' &&
        ('$slice' in rawVal || '$position' in rawVal || '$sort' in rawVal)
      ) {
        throw new Error('Cannot use $slice, $position, or $sort modifiers on Message.parts query updates.');
      }
      const items = Array.isArray(rawVal?.$each) ? rawVal.$each : [rawVal];
      for (const item of items) {
        pushedParts.push(item);
      }
    }
  }
  const hasGeneratedAssetAddToSet = Boolean(
    update.$addToSet &&
      typeof update.$addToSet === 'object' &&
      Object.keys(update.$addToSet).some(
        (k) => k.startsWith('parts.') && /\.generatedAssets$/.test(k)
      )
  );
  const touchesAssetsInOtherOps =
    operatorEntries.some(
      ([op, opLayer]) => op !== '$addToSet' && hasLayerPathConflict(opLayer, 'assets')
    ) || Object.keys(update).some((k) => !k.startsWith('$') && pathTouchesTarget(k, 'assets'));
  const touchesAssetsAddToSet = hasLayerPathConflict(update.$addToSet, 'assets');

  if (
    (touchesAssetsInOtherOps && updParts === undefined) ||
    (touchesAssetsAddToSet &&
      updParts === undefined &&
      pushedParts.length === 0 &&
      !hasGeneratedAssetAddToSet)
  ) {
    throw new Error(
      'Cannot modify Message.assets directly via query update without supplying aligned parts; modify parts or save the document.'
    );
  }

  const checkRolePartCompatibility = (partItems, role) => {
    if (!role) return;
    for (const p of partItems) {
      if (role === 'user' && !MESSAGE_CONSTANTS.USER_ALLOWED_PART_TYPES.includes(p.type)) {
        throw new Error(`User messages cannot contain part type "${p.type}".`);
      }
      if (role === 'system' && !MESSAGE_CONSTANTS.SYSTEM_ALLOWED_PART_TYPES.includes(p.type)) {
        throw new Error(`System messages cannot contain part type "${p.type}".`);
      }
      if (p.type === 'asset') {
        if (role === 'assistant' && p.role === 'user_upload') {
          throw new Error('Assistant messages cannot hold asset parts with role "user_upload".');
        }
        if (role === 'user' && p.role !== 'user_upload') {
          throw new Error('User messages may only hold asset parts with role "user_upload".');
        }
      }
    }
  };

  if (updParts !== undefined) {
    if (!Array.isArray(updParts) || updParts.length > MESSAGE_CONSTANTS.MAX_PARTS_PER_MESSAGE) {
      throw new Error(`parts must be an array of at most ${MESSAGE_CONSTANTS.MAX_PARTS_PER_MESSAGE} items.`);
    }
    const seenToolCallIds = new Set();
    for (const p of updParts) {
      const check = validatePartPayload(p);
      if (!check.ok) {
        throw new Error(check.message);
      }
      if (p.type === 'tool') {
        const cleanToolId = p.toolCallId.trim();
        if (seenToolCallIds.has(cleanToolId)) {
          throw new Error(`Duplicate toolCallId "${cleanToolId}" within Message.parts.`);
        }
        seenToolCallIds.add(cleanToolId);
      }
    }
    checkRolePartCompatibility(updParts, updRole);

    const partAssetIds = extractPartAssetIds(updParts);
    const updAssets = resolveUpdateField(update, 'assets');
    if (updAssets !== undefined) {
      if (!Array.isArray(updAssets)) {
        throw new Error('assets must be an array.');
      }
      const suppliedSet = new Set(updAssets.filter(isValidObjectIdValue).map(String));
      for (const reqId of partAssetIds) {
        if (!suppliedSet.has(String(reqId))) {
          throw new Error('Explicit Message.assets update must contain all Asset IDs referenced in Message.parts.');
        }
      }
    } else if (
      update.$setOnInsert &&
      Object.hasOwn(update.$setOnInsert, 'parts') &&
      !update.$set?.parts &&
      !Object.hasOwn(update, 'parts')
    ) {
      update.$setOnInsert.assets = partAssetIds;
    } else {
      injectSetField('assets', partAssetIds, { force: true });
    }
  }

  // Validate $push / $addToSet on parts (enforced even if runValidators: true is omitted) + sync assets + toolCallId uniqueness
  if (pushedParts.length > 0) {
    const batchToolIds = new Set();
    for (const item of pushedParts) {
      const check = validatePartPayload(item);
      if (!check.ok) {
        throw new Error(check.message);
      }
      if (item.type === 'tool') {
        const cleanToolId = item.toolCallId.trim();
        if (batchToolIds.has(cleanToolId)) {
          throw new Error(`Duplicate toolCallId "${cleanToolId}" in parts push batch.`);
        }
        batchToolIds.add(cleanToolId);
      }
    }
    checkRolePartCompatibility(pushedParts, updRole);

    if (batchToolIds.size > 0) {
      const idList = [...batchToolIds];
      if (Object.hasOwn(filterObj, 'parts.toolCallId')) {
        this.and([{ 'parts.toolCallId': { $nin: idList } }]);
      } else {
        this.where('parts.toolCallId').nin(idList);
      }
    }

    const pushedAssetIds = extractPartAssetIds(pushedParts);
    if (pushedAssetIds.length > 0) {
      update.$addToSet = update.$addToSet || {};
      const existingAdd = update.$addToSet.assets;
      if (existingAdd && typeof existingAdd === 'object' && Array.isArray(existingAdd.$each)) {
        const merged = [...existingAdd.$each];
        const seen = new Set(merged.map(String));
        for (const aid of pushedAssetIds) {
          if (!seen.has(String(aid))) {
            seen.add(String(aid));
            merged.push(aid);
          }
        }
        existingAdd.$each = merged;
      } else if (existingAdd && isValidObjectIdValue(existingAdd)) {
        const seen = new Set([String(existingAdd)]);
        const merged = [existingAdd];
        for (const aid of pushedAssetIds) {
          if (!seen.has(String(aid))) {
            seen.add(String(aid));
            merged.push(aid);
          }
        }
        update.$addToSet.assets = { $each: merged };
      } else {
        update.$addToSet.assets = pushedAssetIds.length === 1 ? pushedAssetIds[0] : { $each: pushedAssetIds };
      }
    }
  }

  // Guard dotted parts sub-mutations cleanly against strict per-path allowlist & discriminator invariants
  const rootPlainEntries = Object.fromEntries(
    Object.entries(update).filter(([k]) => !k.startsWith('$'))
  );
  const dottedLayers = [...operatorEntries];
  if (Object.keys(rootPlainEntries).length > 0) {
    dottedLayers.push(['_root', rootPlainEntries]);
  }
  for (const [op, opLayer] of dottedLayers) {
    if (!opLayer || typeof opLayer !== 'object' || Array.isArray(opLayer)) continue;
    for (const [pathKey, val] of Object.entries(opLayer)) {
      if (!pathKey.startsWith('parts.')) continue;
      const { addGeneratedAssetIds } = validateDottedPartSubmutation({
        op,
        opLayer,
        pathKey,
        val,
        updRole,
      });
      if (addGeneratedAssetIds && addGeneratedAssetIds.length > 0) {
        update.$addToSet = update.$addToSet || {};
        const curAdd = update.$addToSet.assets;
        const baseList = curAdd
          ? Array.isArray(curAdd.$each)
            ? [...curAdd.$each]
            : [curAdd]
          : [];
        const seen = new Set(baseList.map(String));
        for (const aid of addGeneratedAssetIds) {
          if (!seen.has(String(aid))) {
            seen.add(String(aid));
            baseList.push(aid);
          }
        }
        update.$addToSet.assets = baseList.length === 1 ? baseList[0] : { $each: baseList };
      }
    }
  }

  // 6. Soft-deletion timestamp coherence
  const updIsDeleted = resolveUpdateField(update, 'isDeleted');
  if (updIsDeleted === true && resolveUpdateField(update, 'deletedAt') === undefined) {
    injectSetField('deletedAt', new Date());
  } else if (updIsDeleted === false && resolveUpdateField(update, 'deletedAt') === undefined) {
    injectSetField('deletedAt', null);
  }
});

// Branch Lineage Solver & Query Builders
/**
 * Computes ordered ancestor slice segments `[{ branchId, maxSequence }]` from root `'main'`
 * down to `activeBranchId` for single-query indexed pagination without mutating branch history.
 *
 * @memberof messageSchema.statics
 * @param {Array<object>} branches - `chat.branches` descriptor array.
 * @param {string} [activeBranchId=CHAT_CONSTANTS.DEFAULT_BRANCH_ID] - Active branch ID.
 * @returns {Array<{ branchId: string, maxSequence: number|null }>} Ordered ancestor branch segments.
 */
messageSchema.statics.resolveBranchSegments = function (
  branches = [],
  activeBranchId = CHAT_CONSTANTS.DEFAULT_BRANCH_ID
) {
  const targetId = isNonEmptyString(activeBranchId)
    ? activeBranchId.trim()
    : CHAT_CONSTANTS.DEFAULT_BRANCH_ID;

  if (!Array.isArray(branches) || branches.length === 0) {
    if (targetId !== CHAT_CONSTANTS.DEFAULT_BRANCH_ID) {
      throw new Error(`Branch "${targetId}" cannot be resolved without chat branch metadata.`);
    }
    return [{ branchId: CHAT_CONSTANTS.DEFAULT_BRANCH_ID, maxSequence: null }];
  }

  const byId = new Map();
  for (const entry of branches) {
    if (entry?.branchId) byId.set(entry.branchId, entry);
  }

  const leaf = byId.get(targetId);
  if (!leaf || leaf.isArchived) {
    throw new Error(`Active branch "${targetId}" does not exist or is archived.`);
  }

  const chain = [];
  const visited = new Set();
  let current = leaf;
  let childMaxSequence = null;

  while (current) {
    if (visited.has(current.branchId)) {
      throw new Error(`Circular branch lineage detected at "${current.branchId}".`);
    }
    visited.add(current.branchId);
    chain.unshift({ branchId: current.branchId, maxSequence: childMaxSequence });
    if (!current.parentBranchId) break;
    childMaxSequence = current.forkAfterSequence;
    const parent = byId.get(current.parentBranchId);
    if (!parent) {
      throw new Error(`Missing parent branch "${current.parentBranchId}" for "${current.branchId}".`);
    }
    if (parent.isArchived) {
      throw new Error(`Ancestor branch "${parent.branchId}" of "${targetId}" is archived.`);
    }
    current = parent;
  }

  return chain;
};

/**
 * Builds an owner-scoped MongoDB filter query across the resolved branch ancestor segments.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Query parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {Array<object>} [params.branches=[]] - Branches array from Chat document.
 * @param {string} [params.branchId='main'] - Active leaf branch ID.
 * @param {number|null} [params.beforeSequence=null] - Keyset pagination upper bound cursor.
 * @param {number|null} [params.afterSequence=null] - Keyset pagination lower bound cursor.
 * @param {boolean} [params.includeSuperseded=false] - Whether to include inactive regenerated attempts.
 * @param {boolean} [params.includeDeleted=false] - Whether to include soft-deleted messages.
 * @returns {Record<string, any>} MongoDB query filter object.
 */
messageSchema.statics.buildBranchQuery = function ({
  chatId,
  userId,
  branches = [],
  branchId = CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
  beforeSequence = null,
  afterSequence = null,
  includeSuperseded = false,
  includeDeleted = false,
}) {
  if (!chatId || !userId) {
    throw new Error('chatId and userId are required to build an owner-scoped branch query.');
  }
  const segments = this.resolveBranchSegments(branches, branchId);
  const branchClauses = segments.map((seg) =>
    seg.maxSequence === null
      ? { branchId: seg.branchId }
      : { branchId: seg.branchId, sequence: { $lte: seg.maxSequence } }
  );

  const filter = {
    chat: chatId,
    user: userId,
    ...(branchClauses.length === 1 ? branchClauses[0] : { $or: branchClauses }),
  };

  if (!includeDeleted) filter.isDeleted = false;
  if (!includeSuperseded) filter.isActiveAttempt = true;

  if (beforeSequence !== null && beforeSequence !== undefined) {
    if (!Number.isInteger(beforeSequence) || beforeSequence < 1) {
      throw new Error('beforeSequence cursor must be a positive integer.');
    }
    filter.sequence = { ...(filter.sequence || {}), $lt: beforeSequence };
  }
  if (afterSequence !== null && afterSequence !== undefined) {
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      throw new Error('afterSequence boundary must be a non-negative integer.');
    }
    filter.sequence = { ...(filter.sequence || {}), $gt: afterSequence };
  }

  return filter;
};

/**
 * Paginates backwards in time along the active branch DAG timeline using keyset sequence cursors.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Pagination parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {Array<object>} [params.branches=[]] - Branches array from Chat document.
 * @param {string} [params.branchId='main'] - Active leaf branch ID.
 * @param {number|null} [params.beforeSequence=null] - Keyset cursor sequence.
 * @param {number} [params.limit=50] - Maximum messages to return.
 * @param {boolean} [params.populateAssets=false] - Whether to populate Asset documents.
 * @returns {Promise<{ messages: Array<import('mongoose').Document>, hasMore: boolean, nextCursor: number|null }>} Paginated message page.
 */
messageSchema.statics.paginateBranchHistory = async function ({
  chatId,
  userId,
  branches = [],
  branchId = CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
  beforeSequence = null,
  limit = CHAT_PAGINATION.DEFAULT_MESSAGES_LIMIT,
  populateAssets = false,
}) {
  if (
    !Number.isInteger(limit) ||
    limit < CHAT_PAGINATION.MIN_MESSAGES_LIMIT ||
    limit > CHAT_PAGINATION.MAX_MESSAGES_LIMIT
  ) {
    throw new Error(
      `Pagination limit must be an integer between ${CHAT_PAGINATION.MIN_MESSAGES_LIMIT} and ${CHAT_PAGINATION.MAX_MESSAGES_LIMIT}.`
    );
  }

  const filter = this.buildBranchQuery({
    chatId,
    userId,
    branches,
    branchId,
    beforeSequence,
  });

  let query = this.find(filter).sort({ sequence: -1 }).limit(limit + 1);
  if (populateAssets) {
    query = query.populate('assets');
  }
  const rows = await query.exec();
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const chronological = sliced.reverse();
  const nextCursor = hasMore && chronological.length > 0 ? chronological[0].sequence : null;

  return {
    messages: chronological,
    hasMore,
    nextCursor,
  };
};

/**
 * Retrieves the chronological active context window for LangChain/LangGraph agent prompt construction.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Context window parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {Array<object>} [params.branches=[]] - Branches array from Chat document.
 * @param {string} [params.branchId='main'] - Active branch ID.
 * @param {number} [params.summarizedUpToSequence=0] - Compaction sequence threshold.
 * @param {string|null} [params.compactionBranchId=null] - Branch on which compaction was performed.
 * @param {number} [params.limit=100] - Maximum messages to include in context window.
 * @param {boolean} [params.includeOpaqueSignatures=false] - Whether to include raw cryptographic model signatures.
 * @returns {Promise<Array<import('mongoose').Document>>} Ordered chronological context messages.
 */
messageSchema.statics.getActiveContextWindow = async function ({
  chatId,
  userId,
  branches = [],
  branchId = CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
  summarizedUpToSequence = 0,
  compactionBranchId = null,
  limit = 100,
  includeOpaqueSignatures = false,
}) {
  if (!Number.isInteger(summarizedUpToSequence) || summarizedUpToSequence < 0) {
    throw new Error('summarizedUpToSequence must be a non-negative integer.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Context window limit must be an integer between 1 and 500.');
  }

  const segments = this.resolveBranchSegments(branches, branchId);
  const matchingSeg = compactionBranchId
    ? segments.find((seg) => seg.branchId === compactionBranchId)
    : null;
  const compactionApplies = Boolean(
    summarizedUpToSequence > 0 &&
      matchingSeg &&
      (matchingSeg.maxSequence === null || matchingSeg.maxSequence >= summarizedUpToSequence)
  );
  const effectiveAfterSequence = compactionApplies ? summarizedUpToSequence : 0;

  const filter = this.buildBranchQuery({
    chatId,
    userId,
    branches,
    branchId,
    afterSequence: effectiveAfterSequence,
  });

  let query = this.find(filter).sort({ sequence: -1 }).limit(limit);
  if (includeOpaqueSignatures) {
    query = query.select('+opaqueSignatures');
  }
  const docs = await query.exec();
  return docs.reverse();
};

/**
 * Lists all generation attempts for a specific conversational turn.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Turn parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.turnId - Conversational turn UUID.
 * @returns {Promise<Array<import('mongoose').Document>>} List of attempt documents sorted by attemptNumber.
 */
messageSchema.statics.listTurnAttempts = function ({ chatId, userId, turnId }) {
  if (!chatId || !userId || !isNonEmptyString(turnId)) {
    return Promise.reject(new Error('chatId, userId, and turnId are required to list attempts.'));
  }
  return this.find({
    chat: chatId,
    user: userId,
    turnId: turnId.trim(),
    role: 'assistant',
    isDeleted: false,
  }).sort({ attemptNumber: 1 });
};

/**
 * Lists user prompt sibling variants sharing the same parent message.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Sibling parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {import('mongoose').Types.ObjectId|string|null} [params.parentMessageId=null] - Parent turn message reference.
 * @returns {Promise<Array<import('mongoose').Document>>} List of sibling prompt messages.
 */
messageSchema.statics.listBranchSiblings = function ({ chatId, userId, parentMessageId = null }) {
  if (!chatId || !userId) {
    return Promise.reject(new Error('chatId and userId are required to list branch siblings.'));
  }
  return this.find({
    chat: chatId,
    user: userId,
    role: 'user',
    parentMessageId,
    isDeleted: false,
  }).sort({ sequence: 1 });
};

/**
 * Atomically activates a specific turn attempt while superseding all sibling attempts for that turn.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Activation parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.turnId - Conversational turn UUID.
 * @param {import('mongoose').Types.ObjectId|string} params.attemptMessageId - ID of attempt to activate.
 * @param {import('mongoose').ClientSession|null} [params.session=null] - Optional MongoDB transaction session.
 * @returns {Promise<import('mongoose').Document|null>} Activated message document.
 */
messageSchema.statics.activateAttempt = async function ({
  chatId,
  userId,
  turnId,
  attemptMessageId,
  session = null,
}) {
  if (!chatId || !userId || !isNonEmptyString(turnId) || !isValidObjectIdValue(attemptMessageId)) {
    throw new Error('chatId, userId, turnId, and valid attemptMessageId are required.');
  }
  const sessionOpts = session ? { session } : {};
  const target = await this.findOne(
    {
      _id: attemptMessageId,
      chat: chatId,
      user: userId,
      turnId: turnId.trim(),
      role: 'assistant',
      isDeleted: false,
    },
    null,
    sessionOpts
  );
  if (!target) return null;

  await this.updateMany(
    {
      chat: chatId,
      user: userId,
      turnId: turnId.trim(),
      role: 'assistant',
      _id: { $ne: target._id },
      isActiveAttempt: true,
    },
    { $set: { isActiveAttempt: false, supersededByMessageId: target._id } },
    sessionOpts
  );

  return this.findOneAndUpdate(
    { _id: target._id, chat: chatId, user: userId, isDeleted: false },
    { $set: { isActiveAttempt: true, supersededByMessageId: null } },
    { returnDocument: 'after', runValidators: true, ...sessionOpts }
  );
};

/**
 * Checks whether a specific Asset ID is referenced by any non-deleted message owned by user.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Check parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {import('mongoose').Types.ObjectId|string} params.assetId - Candidate Asset ID to test.
 * @returns {Promise<boolean>} True if referenced; false otherwise.
 */
messageSchema.statics.isAssetReferenced = async function ({ userId, assetId }) {
  if (!userId || !isValidObjectIdValue(assetId)) {
    throw new Error('userId and valid assetId are required to check asset references.');
  }
  const hit = await this.exists({
    user: userId,
    assets: assetId,
    isDeleted: false,
  });
  return Boolean(hit);
};

/**
 * Soft-deletes all messages associated with an array of branch IDs.
 *
 * @memberof messageSchema.statics
 * @param {object} params - Deletion parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string[]} params.branchIds - Array of branch IDs to soft delete.
 * @param {Date} [params.now=new Date()] - Deletion timestamp.
 * @param {import('mongoose').ClientSession|null} [params.session=null] - Optional MongoDB transaction session.
 * @returns {Promise<import('mongodb').UpdateResult>} Update result.
 */
messageSchema.statics.softDeleteBranches = function ({
  chatId,
  userId,
  branchIds,
  now = new Date(),
  session = null,
}) {
  if (!chatId || !userId || !Array.isArray(branchIds) || branchIds.length === 0) {
    return Promise.reject(new Error('chatId, userId, and non-empty branchIds array are required.'));
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }
  return this.updateMany(
    {
      chat: chatId,
      user: userId,
      branchId: { $in: branchIds },
      isDeleted: false,
    },
    { $set: { isDeleted: true, deletedAt: now } },
    session ? { session } : {}
  );
};

/**
 * Authoritative Mongoose Model for multimodal conversation messages.
 * @type {import('mongoose').Model<IMessage>}
 */
export const Message = mongoose.model('Message', messageSchema);
export default Message;
