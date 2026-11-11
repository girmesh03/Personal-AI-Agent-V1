/**
 * @file backend/src/models/Chat.js
 * @module models/Chat
 * @description Conversation thread and LangGraph execution state model for Operon (Personal AI Agent V1).
 * Manages thread metadata, branching DAG topology, and LangGraph checkpointer mapping.
 *
 * Architectural Invariants:
 * 1. Zero Embedded Messages Array: Strictly zero embedded messages in the document (Anti-Trap §4.5 & §22).
 *    All messages live in their own standalone Message collection referencing `chat`.
 * 2. LangGraph Identity Mapping: `langgraph.threadId` is required, unique, and automatically defaults
 *    to `String(this._id)` via pre-validate hook.
 * 3. DAG Branching Model: Manages alternative conversation branches via `branches[]` (`branchId`,
 *    `parentBranchId`, `forkAfterSequence`, `label`), supporting non-destructive timeline forks.
 * 4. Single-User Isolation: Scoped strictly to the owning supervisor (`user: { type: ObjectId, ref: 'User', required: true }`).
 * 5. Full-Text Search Stemmer Protection: Text index uses `{ default_language: 'none', language_override: 'no_language_override' }`
 *    to protect Ethiopic (Amharic) characters and prevent `language: null` subfield conflicts.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { BASE_SCHEMA_OPTIONS, EMBEDDED_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import {
  AI_PROVIDERS,
  AI_MODELS,
  CHAT_CONSTANTS,
} from '../utils/constants.js';

/**
 * @typedef {Object} IChatConfig
 * @property {'google'|'addis_ai'} [provider='google'] - AI model provider for the conversation session.
 * @property {string} [model='gemini-3.1-flash-lite'] - Model identifier strictly compatible with provider.
 * @property {number} [thinkingBudget=2048] - Allocated reasoning token budget (0 to 24576).
 * @property {number} [temperature=1.0] - Sampling temperature (0.0 to 2.0).
 * @property {string} [language='auto'] - Conversation language preference ('auto'|'am'|'en'|'om'|'ti').
 */

/**
 * @typedef {Object} IChatPendingInterrupt
 * @property {string|null} [interruptId=null] - Unique identifier for the human-in-the-loop interrupt.
 * @property {string|null} [checkpointId=null] - LangGraph checkpoint identifier at interrupt pause point.
 * @property {string|null} [nonceHash=null] - Cryptographic SHA-256 hash preventing replay attacks.
 * @property {string|null} [toolCallId=null] - Interrupted tool call invocation ID.
 * @property {string|null} [toolName=null] - Interrupted tool name.
 * @property {number} [actionCount=0] - Number of proposed actions requiring approval.
 * @property {string|null} [actionCategory=null] - Classification category of dangerous action.
 * @property {string|null} [payloadHash=null] - SHA-256 hash of exact proposed tool invocation parameters.
 * @property {string|null} [proposedSummary=null] - Human-readable summary of proposed tool execution.
 * @property {string[]} [allowedDecisions=['approve', 'reject', 'edit']] - Valid decision options for resolution.
 * @property {Date|null} [expiresAt=null] - Expiration timestamp after which the interrupt lease expires.
 * @property {Date|null} [createdAt=null] - Timestamp when the interrupt was registered.
 */

/**
 * @typedef {Object} IChatActiveRun
 * @property {string|null} [runId=null] - Active streaming or tool execution run identifier.
 * @property {string|null} [turnId=null] - Conversational turn UUID associated with the run.
 * @property {string|null} [branchId='main'] - Conversation branch in which the run is executing.
 * @property {import('mongoose').Types.ObjectId|null} [userMessageId=null] - User prompt message document ID.
 * @property {import('mongoose').Types.ObjectId|null} [assistantMessageId=null] - Assistant streaming message document ID.
 * @property {'queued'|'running'|'waiting_approval'|'stopping'|'completed'|'failed'|'aborted'|'timeout'} [status='completed'] - Execution status.
 * @property {string} [stage='idle'] - Granular execution pipeline stage.
 * @property {'standard'|'agent'|'fast'|null} [mode=null] - Execution mode of the LangGraph agent.
 * @property {string|null} [provider=null] - AI provider executing the run.
 * @property {string|null} [model=null] - AI model executing the run.
 * @property {number} [lastEventSeq=0] - Monotonic SSE event sequence counter for stream resume.
 * @property {Date|null} [startedAt=null] - Timestamp when run started.
 * @property {Date|null} [lastHeartbeatAt=null] - Timestamp of last agent heartbeat.
 * @property {Date|null} [leaseExpiresAt=null] - Timestamp when execution lock expires if unrenewed.
 * @property {Date|null} [abortRequestedAt=null] - Timestamp when user requested stop.
 * @property {Date|null} [completedAt=null] - Timestamp when run reached terminal status.
 * @property {string|null} [errorMessage=null] - Truncated error message if run failed.
 * @property {string|null} [errorCode=null] - Machine-readable error code if run failed.
 * @property {IChatPendingInterrupt} [pendingInterrupt] - Pending HITL tool approval state.
 */

/**
 * @typedef {Object} IChatBranch
 * @property {string} branchId - Unique branch identifier ('main' or UUID/slug).
 * @property {string|null} parentBranchId - Parent branch identifier from which fork originated (null for 'main').
 * @property {number} forkAfterSequence - Sequence number in parent branch after which branch forked.
 * @property {import('mongoose').Types.ObjectId|null} [forkedFromMessageId=null] - Message document from which branch forked.
 * @property {string|null} [forkedFromTurnId=null] - Turn UUID from which branch forked.
 * @property {string|null} [forkedFromCheckpointId=null] - LangGraph checkpoint at fork time.
 * @property {string|null} [headCheckpointId=null] - Most recent LangGraph checkpoint on this branch.
 * @property {string|null} [label=null] - Human-readable branch label.
 * @property {boolean} [isArchived=false] - Archival flag for soft-deleted branch.
 * @property {Date} createdAt - Branch creation timestamp.
 */

/**
 * @typedef {Object} IChatLangGraph
 * @property {string} threadId - LangGraph thread identifier (matches stringified chat _id).
 * @property {string} [checkpointNs='operon-v1'] - Checkpoint namespace.
 * @property {string|null} [activeCheckpointId=null] - Currently active LangGraph checkpoint ID.
 * @property {string|null} [lastCompletedCheckpointId=null] - Most recently completed checkpoint ID.
 */

/**
 * @typedef {Object} IChat
 * @property {import('mongoose').Types.ObjectId} _id - Unique conversation session identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor user reference.
 * @property {string|null} [title=null] - Contextual session title generated by agent or set by user.
 * @property {string|null} [titleSource=null] - Source of title ('user'|'agent'|'system').
 * @property {Date|null} [titleUpdatedAt=null] - Timestamp of last title change.
 * @property {boolean} [isPinned=false] - Pinning flag for quick sidebar access.
 * @property {Date|null} [pinnedAt=null] - Timestamp when chat was pinned.
 * @property {IChatConfig} config - Session AI model configuration.
 * @property {string} [activeBranchId='main'] - Current active conversation branch ID.
 * @property {IChatBranch[]} branches - Non-destructive DAG branch topology array.
 * @property {IChatLangGraph} langgraph - LangGraph thread and checkpoint binding.
 * @property {IChatActiveRun} activeRun - Real-time execution run state and distributed lock lease.
 * @property {boolean} [isArchived=false] - Soft-deletion archival flag.
 * @property {Date|null} [archivedAt=null] - Timestamp when chat was archived.
 * @property {boolean} [hasActiveRun] - Derived virtual indicating if run lock is active and unexpired.
 * @property {boolean} [hasPendingInterrupt] - Derived virtual indicating if run is waiting for HITL approval.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Returns allowed models for a specific AI provider.
 * @param {string} provider - Provider name.
 * @returns {Array<string>} List of supported models.
 */
const getAllowedModelsForProvider = (provider) =>
  typeof provider === 'string' && Object.hasOwn(AI_MODELS.BY_PROVIDER, provider)
    ? AI_MODELS.BY_PROVIDER[provider]
    : [];

/**
 * Returns the default model for a specific AI provider.
 * @param {string} provider - Provider name.
 * @returns {string|undefined} Default model identifier.
 */
const getDefaultModelForProvider = (provider) =>
  typeof provider === 'string' && Object.hasOwn(AI_MODELS.DEFAULT_BY_PROVIDER, provider)
    ? AI_MODELS.DEFAULT_BY_PROVIDER[provider]
    : undefined;

/**
 * Locates the innermost container object and key holding a dotPath.
 * @param {Record<string, any>} container - Object to search.
 * @param {string} dotPath - Dotted path string.
 * @returns {{ target: Record<string, any>, key: string, value: any }|null} Location result.
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
 * Extracts a value from an object using a dotted path.
 * @param {Record<string, any>} container - Object to traverse.
 * @param {string} dotPath - Dotted path.
 * @returns {any} Value at path or undefined.
 */
const extractObjectPath = (container, dotPath) => findPathLocation(container, dotPath)?.value;

/**
 * Extracts an updated field value from Mongoose query update operators ($set, $setOnInsert, or direct keys).
 * @param {Record<string, any>} update - Query update payload.
 * @param {string} dotPath - Target path.
 * @returns {any} Resolved update value.
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
 * Determines whether candidatePath equals, is an ancestor of, or is a descendant of dotPath.
 * @param {string} candidatePath - Path to test.
 * @param {string} dotPath - Reference path.
 * @returns {boolean} True if paths touch.
 */
const pathTouchesTarget = (candidatePath, dotPath) =>
  candidatePath === dotPath ||
  dotPath.startsWith(`${candidatePath}.`) ||
  candidatePath.startsWith(`${dotPath}.`);

/**
 * Checks whether an operator layer touches dotPath, an ancestor prefix, or a descendant path.
 * @param {Record<string, any>} layer - Object layer to inspect.
 * @param {string} dotPath - Target path.
 * @returns {boolean} True if a conflict exists.
 */
function hasLayerPathConflict(layer, dotPath) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
    return false;
  }
  return Object.keys(layer).some((key) => pathTouchesTarget(key, dotPath));
}

/**
 * Factory validator ensuring that model is strictly supported by the active provider.
 *
 * @param {string} providerPath - Path to provider field.
 * @param {object} [options] - Validator configuration options.
 * @param {boolean} [options.allowNull=false] - Whether null is permissible.
 * @param {string} [options.defaultProvider=AI_PROVIDERS.DEFAULT] - Fallback provider name.
 * @param {string|null} [options.modelPath=null] - Path to model field.
 * @returns {(value: any) => boolean} Validation function.
 */
function createProviderModelValidator(
  providerPath,
  { allowNull = false, defaultProvider = AI_PROVIDERS.DEFAULT, modelPath = null } = {}
) {
  return function validateModelForProvider(value) {
    if (allowNull && value === null) {
      return true;
    }
    let provider;
    if (typeof this?.getUpdate === 'function') {
      provider = resolveUpdateField(this.getUpdate(), providerPath);
      if (provider === undefined) {
        const filterProvider = extractObjectPath(this.getFilter?.(), providerPath);
        provider = typeof filterProvider === 'string' ? filterProvider : undefined;
      }
      if (provider === undefined) {
        return false;
      }
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
    if (provider === null) {
      return false;
    }
    return getAllowedModelsForProvider(provider).includes(value);
  };
}

/**
 * Shared sanitizing serializer for both toJSON and toObject transforms on Chat.
 * Strips version key, default id virtual, unselected virtuals, and sensitive interrupt nonceHash fields.
 *
 * @param {import('mongoose').Document} _doc - Source document.
 * @param {Record<string, any>} ret - Transformed plain JavaScript object.
 * @returns {Record<string, any>} Sanitized chat object.
 */
function sanitizeChatTransform(_doc, ret) {
  delete ret.__v;
  delete ret.id;

  if (ret.hasActiveRun === undefined) {
    delete ret.hasActiveRun;
  }
  if (ret.hasPendingInterrupt === undefined) {
    delete ret.hasPendingInterrupt;
  }

  if (ret.activeRun?.pendingInterrupt) {
    delete ret.activeRun.pendingInterrupt.nonceHash;
  }

  return ret;
}

/**
 * Root Mongoose schema definition for the Chat model.
 * Enforces zero embedded messages, LangGraph thread binding, DAG branching,
 * and distributed run lock leasing.
 */
const chatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Chat must belong to an authenticated user.'],
      immutable: true,
    },
    title: {
      type: String,
      default: null,
      trim: true,
      set: (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      maxlength: [
        CHAT_CONSTANTS.TITLE_MAX_LENGTH,
        `Title cannot exceed ${CHAT_CONSTANTS.TITLE_MAX_LENGTH} characters.`,
      ],
    },
    titleSource: {
      type: String,
      enum: [...CHAT_CONSTANTS.TITLE_SOURCES, null],
      default: null,
    },
    titleUpdatedAt: {
      type: Date,
      default: null,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    config: {
      provider: {
        type: String,
        enum: CHAT_CONSTANTS.PROVIDERS,
        default: CHAT_CONSTANTS.DEFAULT_PROVIDER,
      },
      model: {
        type: String,
        enum: CHAT_CONSTANTS.SUPPORTED_MODELS,
        default: function () {
          const provider = this?.config?.provider || AI_PROVIDERS.DEFAULT;
          return getDefaultModelForProvider(provider) || AI_MODELS.DEFAULT;
        },
        trim: true,
        validate: {
          validator: createProviderModelValidator('config.provider', {
            allowNull: false,
            defaultProvider: AI_PROVIDERS.DEFAULT,
            modelPath: 'config.model',
          }),
          message: 'Session model is incompatible with the selected session provider.',
        },
      },
      thinkingBudget: {
        type: Number,
        default: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
        min: [
          CHAT_CONSTANTS.MIN_THINKING_BUDGET,
          `Thinking budget cannot be less than ${CHAT_CONSTANTS.MIN_THINKING_BUDGET}.`,
        ],
        max: [
          CHAT_CONSTANTS.MAX_THINKING_BUDGET,
          `Thinking budget cannot exceed ${CHAT_CONSTANTS.MAX_THINKING_BUDGET} tokens.`,
        ],
        validate: {
          validator: Number.isInteger,
          message: 'Thinking budget must be an integer token count.',
        },
      },
      temperature: {
        type: Number,
        default: CHAT_CONSTANTS.DEFAULT_TEMPERATURE,
        min: [
          CHAT_CONSTANTS.MIN_TEMPERATURE,
          `Temperature cannot be lower than ${CHAT_CONSTANTS.MIN_TEMPERATURE}.`,
        ],
        max: [
          CHAT_CONSTANTS.MAX_TEMPERATURE,
          `Temperature cannot exceed ${CHAT_CONSTANTS.MAX_TEMPERATURE}.`,
        ],
        validate: {
          validator: Number.isFinite,
          message: 'Temperature must be a finite number.',
        },
      },
      language: {
        type: String,
        enum: CHAT_CONSTANTS.SUPPORTED_LANGUAGES,
        default: CHAT_CONSTANTS.DEFAULT_LANGUAGE,
      },
      sttEngine: {
        type: String,
        enum: CHAT_CONSTANTS.STT_ENGINES,
        default: CHAT_CONSTANTS.DEFAULT_STT_ENGINE,
      },
      sessionInstructions: {
        type: String,
        default: null,
        trim: true,
        set: (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
        maxlength: [
          CHAT_CONSTANTS.SESSION_INSTRUCTIONS_MAX_LENGTH,
          `Session instructions cannot exceed ${CHAT_CONSTANTS.SESSION_INSTRUCTIONS_MAX_LENGTH} characters.`,
        ],
      },
    },
    activeBranchId: {
      type: String,
      required: [true, 'Active branch identifier is required.'],
      trim: true,
      default: CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
      maxlength: [
        CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH,
        `Branch ID cannot exceed ${CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH} characters.`,
      ],
    },
    branches: {
      type: [
        new mongoose.Schema(
          {
            branchId: {
              type: String,
              required: [true, 'Branch entry identifier is required.'],
              trim: true,
              maxlength: [
                CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH,
                `Branch ID cannot exceed ${CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH} characters.`,
              ],
            },
            parentBranchId: {
              type: String,
              default: null,
              trim: true,
              maxlength: [
                CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH,
                `Parent branch ID cannot exceed ${CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH} characters.`,
              ],
            },
            forkAfterSequence: {
              type: Number,
              default: 0,
              min: [0, 'Fork sequence cannot be negative.'],
              validate: {
                validator: Number.isInteger,
                message: 'Fork sequence must be an integer.',
              },
            },
            forkedFromMessageId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Message',
              default: null,
            },
            forkedFromTurnId: {
              type: String,
              default: null,
              trim: true,
              maxlength: [
                CHAT_CONSTANTS.TURN_ID_MAX_LENGTH,
                `Forked turn ID cannot exceed ${CHAT_CONSTANTS.TURN_ID_MAX_LENGTH} characters.`,
              ],
            },
            forkedFromCheckpointId: {
              type: String,
              default: null,
              trim: true,
              maxlength: [
                CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH,
                `Forked checkpoint ID cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH} characters.`,
              ],
            },
            headCheckpointId: {
              type: String,
              default: null,
              trim: true,
              maxlength: [
                CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH,
                `Head checkpoint ID cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH} characters.`,
              ],
            },
            label: {
              type: String,
              default: null,
              trim: true,
              maxlength: [
                CHAT_CONSTANTS.BRANCH_LABEL_MAX_LENGTH,
                `Branch label cannot exceed ${CHAT_CONSTANTS.BRANCH_LABEL_MAX_LENGTH} characters.`,
              ],
            },
            isArchived: {
              type: Boolean,
              default: false,
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
          EMBEDDED_SCHEMA_OPTIONS
        ),
      ],
      default: function () {
        return [
          {
            branchId: CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
            parentBranchId: null,
            forkAfterSequence: 0,
            forkedFromMessageId: null,
            forkedFromTurnId: null,
            forkedFromCheckpointId: null,
            headCheckpointId: null,
            label: null,
            isArchived: false,
            createdAt: new Date(),
          },
        ];
      },
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length <= CHAT_CONSTANTS.MAX_BRANCHES_PER_CHAT;
        },
        message: `Chat cannot exceed ${CHAT_CONSTANTS.MAX_BRANCHES_PER_CHAT} branches.`,
      },
    },
    headSequence: {
      type: Number,
      default: 0,
      min: [0, 'Head sequence cannot be negative.'],
      validate: {
        validator: Number.isInteger,
        message: 'Head sequence must be an integer.',
      },
    },
    messageCount: {
      type: Number,
      default: 0,
      min: [0, 'Message count cannot be negative.'],
      validate: {
        validator: Number.isInteger,
        message: 'Message count must be an integer.',
      },
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessageRole: {
      type: String,
      enum: [...CHAT_CONSTANTS.LAST_MESSAGE_ROLES, null],
      default: null,
    },
    lastMessagePreview: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.PREVIEW_MAX_LENGTH,
        `Last message preview cannot exceed ${CHAT_CONSTANTS.PREVIEW_MAX_LENGTH} characters.`,
      ],
    },
    langgraph: {
      threadId: {
        type: String,
        required: [true, 'LangGraph thread ID is required.'],
        trim: true,
        immutable: true,
        maxlength: [
          CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH,
          `LangGraph thread ID cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH} characters.`,
        ],
        default: function () {
          return this._id ? String(this._id) : undefined;
        },
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
      activeCheckpointId: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH,
          `Active checkpoint ID cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH} characters.`,
        ],
      },
      lastCompletedCheckpointId: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH,
          `Last completed checkpoint ID cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH} characters.`,
        ],
      },
      cleanupStatus: {
        type: String,
        enum: CHAT_CONSTANTS.CHECKPOINT_CLEANUP_STATUSES,
        default: CHAT_CONSTANTS.DEFAULT_CHECKPOINT_CLEANUP_STATUS,
      },
    },
    activeRun: {
      runId: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.RUN_ID_MAX_LENGTH,
          `Active run ID cannot exceed ${CHAT_CONSTANTS.RUN_ID_MAX_LENGTH} characters.`,
        ],
      },
      turnId: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.TURN_ID_MAX_LENGTH,
          `Active turn ID cannot exceed ${CHAT_CONSTANTS.TURN_ID_MAX_LENGTH} characters.`,
        ],
      },
      branchId: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH,
          `Active run branch ID cannot exceed ${CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH} characters.`,
        ],
      },
      userMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
      },
      assistantMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
      },
      status: {
        type: String,
        enum: CHAT_CONSTANTS.RUN_STATUSES,
        default: CHAT_CONSTANTS.DEFAULT_RUN_STATUS,
      },
      stage: {
        type: String,
        enum: CHAT_CONSTANTS.RUN_STAGES,
        default: CHAT_CONSTANTS.DEFAULT_RUN_STAGE,
      },
      mode: {
        type: String,
        enum: [...CHAT_CONSTANTS.RUN_MODES, null],
        default: null,
      },
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
          validator: createProviderModelValidator('activeRun.provider', {
            allowNull: true,
            modelPath: 'activeRun.model',
          }),
          message: 'Active run model is incompatible with the active run provider.',
        },
      },
      lastEventSeq: {
        type: Number,
        default: 0,
        min: [0, 'Event sequence cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Event sequence must be an integer.',
        },
      },
      startedAt: {
        type: Date,
        default: null,
      },
      lastHeartbeatAt: {
        type: Date,
        default: null,
      },
      leaseExpiresAt: {
        type: Date,
        default: null,
      },
      abortRequestedAt: {
        type: Date,
        default: null,
      },
      completedAt: {
        type: Date,
        default: null,
      },
      errorMessage: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.ERROR_MAX_LENGTH,
          `Error message cannot exceed ${CHAT_CONSTANTS.ERROR_MAX_LENGTH} characters.`,
        ],
      },
      errorCode: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH,
          `Error code cannot exceed ${CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH} characters.`,
        ],
      },
      pendingInterrupt: {
        interruptId: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            CHAT_CONSTANTS.INTERRUPT_ID_MAX_LENGTH,
            `Interrupt ID cannot exceed ${CHAT_CONSTANTS.INTERRUPT_ID_MAX_LENGTH} characters.`,
          ],
        },
        checkpointId: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH,
            `Interrupt checkpoint ID cannot exceed ${CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH} characters.`,
          ],
        },
        nonceHash: {
          type: String,
          default: null,
          trim: true,
          select: false,
          maxlength: [
            CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH,
            `Interrupt nonceHash cannot exceed ${CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH} characters.`,
          ],
        },
        toolCallId: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            CHAT_CONSTANTS.TOOL_CALL_ID_MAX_LENGTH,
            `Interrupt toolCallId cannot exceed ${CHAT_CONSTANTS.TOOL_CALL_ID_MAX_LENGTH} characters.`,
          ],
        },
        toolName: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            CHAT_CONSTANTS.TOOL_NAME_MAX_LENGTH,
            `Interrupt toolName cannot exceed ${CHAT_CONSTANTS.TOOL_NAME_MAX_LENGTH} characters.`,
          ],
        },
        actionCount: {
          type: Number,
          default: 0,
          min: [0, 'Action count cannot be negative.'],
          validate: {
            validator: Number.isInteger,
            message: 'Action count must be an integer.',
          },
        },
        actionCategory: {
          type: String,
          enum: [...CHAT_CONSTANTS.APPROVAL_CATEGORIES, null],
          default: null,
        },
        payloadHash: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH,
            `Interrupt payloadHash cannot exceed ${CHAT_CONSTANTS.PAYLOAD_HASH_MAX_LENGTH} characters.`,
          ],
        },
        proposedSummary: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            CHAT_CONSTANTS.APPROVAL_SUMMARY_MAX_LENGTH,
            `Approval summary cannot exceed ${CHAT_CONSTANTS.APPROVAL_SUMMARY_MAX_LENGTH} characters.`,
          ],
        },
        allowedDecisions: [
          {
            type: String,
            enum: CHAT_CONSTANTS.APPROVAL_DECISIONS,
          },
        ],
        expiresAt: {
          type: Date,
          default: null,
        },
        createdAt: {
          type: Date,
          default: null,
        },
      },
    },
    compaction: {
      branchId: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH,
          `Compaction branch ID cannot exceed ${CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH} characters.`,
        ],
      },
      summary: {
        type: String,
        default: null,
        trim: true,
        maxlength: [
          CHAT_CONSTANTS.COMPACTION_SUMMARY_MAX_LENGTH,
          `Compaction summary cannot exceed ${CHAT_CONSTANTS.COMPACTION_SUMMARY_MAX_LENGTH} characters.`,
        ],
      },
      summarizedUpToSequence: {
        type: Number,
        default: 0,
        min: [0, 'Summarized sequence boundary cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Summarized sequence boundary must be an integer.',
        },
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    usageSummary: {
      inputTokens: {
        type: Number,
        default: 0,
        min: [0, 'Input token total cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Input token total must be an integer.',
        },
      },
      outputTokens: {
        type: Number,
        default: 0,
        min: [0, 'Output token total cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Output token total must be an integer.',
        },
      },
      totalTokens: {
        type: Number,
        default: 0,
        min: [0, 'Total tokens cannot be negative.'],
        validate: {
          validator: Number.isInteger,
          message: 'Total tokens must be an integer.',
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
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      virtuals: true,
      transform: sanitizeChatTransform,
    },
    toObject: {
      virtuals: true,
      transform: sanitizeChatTransform,
    },
  }
);


chatSchema.index({ 'langgraph.threadId': 1 }, { unique: true });

chatSchema.index(
  { user: 1, isPinned: -1, lastMessageAt: -1, updatedAt: -1, _id: -1 },
  { partialFilterExpression: { isArchived: false } }
);

chatSchema.index(
  { user: 1, archivedAt: -1, _id: -1 },
  { partialFilterExpression: { isArchived: true } }
);

chatSchema.index(
  { archivedAt: 1 },
  { partialFilterExpression: { isArchived: true } }
);

chatSchema.index(
  { 'activeRun.status': 1, 'activeRun.leaseExpiresAt': 1 },
  {
    partialFilterExpression: {
      'activeRun.status': { $in: CHAT_CONSTANTS.ACTIVE_RUN_STATUSES },
    },
  }
);

chatSchema.index(
  { 'langgraph.cleanupStatus': 1, updatedAt: 1 },
  {
    partialFilterExpression: {
      'langgraph.cleanupStatus': { $in: ['pending', 'failed'] },
    },
  }
);

chatSchema.index({ user: 1, title: 'text' }, { default_language: 'none', language_override: 'no_language_override' });

chatSchema.plugin(mongoosePaginate);

/**
 * Derived virtual getter: hasActiveRun
 * Evaluates whether chat currently owns an active streaming or tool-execution lease.
 *
 * @memberof chatSchema
 * @returns {boolean|undefined} True if run status is active and lease has not expired; undefined if projection omitted.
 */
chatSchema.virtual('hasActiveRun').get(function () {
  if (typeof this.isSelected === 'function' && !this.isSelected('activeRun.status')) {
    return undefined;
  }
  const status = this.activeRun?.status;
  if (!status || CHAT_CONSTANTS.TERMINAL_RUN_STATUSES.includes(status)) {
    return false;
  }
  if (typeof this.isSelected === 'function' && !this.isSelected('activeRun.leaseExpiresAt')) {
    return undefined;
  }
  const lease = this.activeRun?.leaseExpiresAt;
  return !lease || lease.getTime() > Date.now();
});

/**
 * Derived virtual getter: hasPendingInterrupt
 * Evaluates whether chat currently has a paused human-in-the-loop tool approval pending.
 *
 * @memberof chatSchema
 * @returns {boolean|undefined} True if status is 'waiting_approval' with an active interruptId; undefined if projection omitted.
 */
chatSchema.virtual('hasPendingInterrupt').get(function () {
  if (typeof this.isSelected === 'function' && !this.isSelected('activeRun.status')) {
    return undefined;
  }
  if (this.activeRun?.status !== 'waiting_approval') {
    return false;
  }
  if (
    typeof this.isSelected === 'function' &&
    !this.isSelected('activeRun.pendingInterrupt.interruptId')
  ) {
    return undefined;
  }
  return Boolean(this.activeRun?.pendingInterrupt?.interruptId);
});

/**
 * Creates an empty, sanitized pending interrupt payload object with default null values.
 *
 * @returns {IChatPendingInterrupt} Fresh default interrupt object.
 */
const createEmptyPendingInterrupt = () => ({
  interruptId: null,
  checkpointId: null,
  nonceHash: null,
  toolCallId: null,
  toolName: null,
  actionCount: 0,
  actionCategory: null,
  payloadHash: null,
  proposedSummary: null,
  allowedDecisions: [],
  expiresAt: null,
  createdAt: null,
});

/**
 * Creates a root default branch entry for the 'main' branch of a newly created conversation.
 *
 * @param {Date} [now=new Date()] - Creation timestamp.
 * @returns {IChatBranch} Root 'main' branch descriptor.
 */
const createRootBranchEntry = (now = new Date()) => ({
  branchId: CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
  parentBranchId: null,
  forkAfterSequence: 0,
  forkedFromMessageId: null,
  forkedFromTurnId: null,
  forkedFromCheckpointId: null,
  headCheckpointId: null,
  label: null,
  isArchived: false,
  createdAt: now,
});

/**
 * Creates an idle, completed activeRun payload object representing a quiescent session state.
 *
 * @returns {IChatActiveRun} Idle active run descriptor.
 */
const createIdleActiveRun = () => ({
  runId: null,
  turnId: null,
  branchId: null,
  userMessageId: null,
  assistantMessageId: null,
  status: CHAT_CONSTANTS.DEFAULT_RUN_STATUS,
  stage: CHAT_CONSTANTS.DEFAULT_RUN_STAGE,
  mode: null,
  provider: null,
  model: null,
  lastEventSeq: 0,
  startedAt: null,
  lastHeartbeatAt: null,
  leaseExpiresAt: null,
  abortRequestedAt: null,
  completedAt: null,
  errorMessage: null,
  errorCode: null,
  pendingInterrupt: createEmptyPendingInterrupt(),
});

/**
 * Resets selected or modified pending interrupt fields to null/defaults.
 *
 * @param {import('mongoose').Document} doc - Target chat document.
 * @param {IChatActiveRun} run - Active run container object.
 * @param {boolean} [forceAll=false] - If true, resets all fields regardless of selection state.
 */
const resetPendingInterruptFields = (doc, run, forceAll = false) => {
  if (!run || !run.pendingInterrupt) {
    return;
  }
  for (const [key, resetVal] of Object.entries(createEmptyPendingInterrupt())) {
    const path = `activeRun.pendingInterrupt.${key}`;
    if (forceAll || (doc && (doc.isSelected(path) || doc.isModified(path)))) {
      run.pendingInterrupt[key] = resetVal;
    }
  }
};

/**
 * Validates the topological integrity, cycle-freedom, root existence, and bounds of a branch DAG array.
 *
 * @param {Array<IChatBranch>} branches - Array of branch descriptors.
 * @param {string} activeBranchId - Current active branch ID.
 * @param {object} [options] - Validation options.
 * @param {boolean} [options.requireActiveMatch=true] - Whether activeBranchId must exist and be unarchived.
 * @returns {{ ok: boolean, errorPath?: string, message?: string, branchById?: Map<string, IChatBranch> }} Validation result.
 */
function validateBranchGraph(branches, activeBranchId, { requireActiveMatch = true } = {}) {
  if (!Array.isArray(branches) || branches.length === 0) {
    return { ok: false, errorPath: 'branches', message: 'branches must be a non-empty array.' };
  }
  if (branches.length > CHAT_CONSTANTS.MAX_BRANCHES_PER_CHAT) {
    return {
      ok: false,
      errorPath: 'branches',
      message: `Chat cannot exceed ${CHAT_CONSTANTS.MAX_BRANCHES_PER_CHAT} branches.`,
    };
  }

  const branchById = new Map();
  for (const entry of branches) {
    if (!entry || typeof entry.branchId !== 'string' || !entry.branchId.trim()) {
      return {
        ok: false,
        errorPath: 'branches',
        message: 'Every branch entry must specify a valid non-empty branchId.',
      };
    }
    const cleanId = entry.branchId.trim();
    if (cleanId.length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH) {
      return {
        ok: false,
        errorPath: 'branches',
        message: `Branch ID cannot exceed ${CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH} characters.`,
      };
    }
    if (
      entry.parentBranchId !== null &&
      entry.parentBranchId !== undefined &&
      (typeof entry.parentBranchId !== 'string' ||
        !entry.parentBranchId.trim() ||
        entry.parentBranchId.trim().length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH)
    ) {
      return {
        ok: false,
        errorPath: 'branches',
        message: `Invalid parentBranchId on branch "${cleanId}".`,
      };
    }
    if (
      entry.forkAfterSequence !== undefined &&
      (!Number.isInteger(entry.forkAfterSequence) || entry.forkAfterSequence < 0)
    ) {
      return {
        ok: false,
        errorPath: 'branches',
        message: `Invalid forkAfterSequence on branch "${cleanId}".`,
      };
    }
    if (
      (typeof entry.forkedFromTurnId === 'string' &&
        entry.forkedFromTurnId.trim().length > CHAT_CONSTANTS.TURN_ID_MAX_LENGTH) ||
      (typeof entry.forkedFromCheckpointId === 'string' &&
        entry.forkedFromCheckpointId.trim().length > CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH) ||
      (typeof entry.headCheckpointId === 'string' &&
        entry.headCheckpointId.trim().length > CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH) ||
      (typeof entry.label === 'string' &&
        entry.label.trim().length > CHAT_CONSTANTS.BRANCH_LABEL_MAX_LENGTH)
    ) {
      return {
        ok: false,
        errorPath: 'branches',
        message: `Branch metadata length exceeds allowed bounds on "${cleanId}".`,
      };
    }
    if (branchById.has(cleanId)) {
      return {
        ok: false,
        errorPath: 'branches',
        message: `Duplicate branchId "${cleanId}" in chat branches.`,
      };
    }
    branchById.set(cleanId, entry);
  }

  const rootEntry = branchById.get(CHAT_CONSTANTS.DEFAULT_BRANCH_ID);
  if (!rootEntry || rootEntry.isArchived || rootEntry.parentBranchId !== null) {
    return {
      ok: false,
      errorPath: 'branches',
      message: `Root branch "${CHAT_CONSTANTS.DEFAULT_BRANCH_ID}" must exist, have null parentBranchId, and remain unarchived.`,
      branchById,
    };
  }

  for (const entry of branches) {
    const entryId = entry.branchId.trim();
    if (entryId !== CHAT_CONSTANTS.DEFAULT_BRANCH_ID) {
      const parentId = typeof entry.parentBranchId === 'string' ? entry.parentBranchId.trim() : '';
      if (!parentId || parentId === entryId || !branchById.has(parentId)) {
        return {
          ok: false,
          errorPath: 'branches',
          message: `Branch "${entryId}" must reference an existing non-self parentBranchId.`,
          branchById,
        };
      }
    }
    const visited = new Set([entryId]);
    let cursor = typeof entry.parentBranchId === 'string' ? entry.parentBranchId.trim() : null;
    while (cursor) {
      if (visited.has(cursor)) {
        return {
          ok: false,
          errorPath: 'branches',
          message: `Circular branch lineage detected involving "${cursor}".`,
          branchById,
        };
      }
      visited.add(cursor);
      const parentNode = branchById.get(cursor);
      if (!entry.isArchived && parentNode?.isArchived) {
        return {
          ok: false,
          errorPath: 'branches',
          message: `Branch "${entryId}" cannot remain active under archived ancestor "${cursor}".`,
          branchById,
        };
      }
      cursor =
        typeof parentNode?.parentBranchId === 'string'
          ? parentNode.parentBranchId.trim()
          : null;
    }
  }

  if (requireActiveMatch) {
    const cleanActive = typeof activeBranchId === 'string' ? activeBranchId.trim() : '';
    const activeEntry = branchById.get(cleanActive);
    if (!activeEntry || activeEntry.isArchived) {
      return {
        ok: false,
        errorPath: 'activeBranchId',
        message: 'activeBranchId must reference an active, non-archived entry in branches.',
        branchById,
      };
    }
  }

  return { ok: true, branchById };
}

/**
 * Document Pre-validation Middleware:
 * Validates immutable binding between langgraph.threadId and chat._id, synchronizes config provider/model,
 * validates DAG branching topology, auto-initializes root 'main' branch, and enforces activeRun invariants.
 */
chatSchema.pre('validate', function () {
  if (
    (this.isNew ||
      this.isSelected('langgraph.threadId') ||
      this.isModified('langgraph.threadId') ||
      this.isDirectModified('langgraph')) &&
    (!this.langgraph?.threadId || this.langgraph.threadId !== String(this._id))
  ) {
    this.invalidate('langgraph.threadId', 'langgraph.threadId must equal stringified chat _id.');
  }

  const configModelVisible =
    this.isNew ||
    this.isSelected('config.model') ||
    this.isDirectModified('config.model') ||
    this.isDirectModified('config');
  const configProviderChanged = !this.isNew && this.isModified('config.provider');
  if (this.config && (configModelVisible || configProviderChanged)) {
    const provider = this.config.provider || AI_PROVIDERS.DEFAULT;
    const allowedModels = getAllowedModelsForProvider(provider);
    const defaultModel = getDefaultModelForProvider(provider) || AI_MODELS.DEFAULT;

    if (!this.config.model && configModelVisible) {
      this.config.model = defaultModel;
    } else if (
      configProviderChanged &&
      !this.isDirectModified('config.model') &&
      !this.isDirectModified('config') &&
      !allowedModels.includes(this.config.model)
    ) {
      this.config.model = defaultModel;
    }
  }

  const touchesTitle =
    this.isNew ||
    this.isSelected('title') ||
    this.isModified('title') ||
    this.isModified('titleSource') ||
    this.isModified('titleUpdatedAt');
  if (touchesTitle) {
    const titleKnown = this.isNew || this.isSelected('title') || this.isModified('title');
    if (!titleKnown && this.isModified('titleSource') && this.titleSource !== null) {
      this.invalidate(
        'title',
        'title must be selected or set when setting a non-null titleSource.'
      );
    }
    if (titleKnown && !this.title) {
      if (this.title !== null && (this.isNew || this.isSelected('title') || this.isModified('title'))) {
        this.title = null;
      }
      if (this.isNew || this.isModified('title') || this.isSelected('titleSource')) {
        this.titleSource = null;
      }
      if (this.isNew || this.isModified('title') || this.isSelected('titleUpdatedAt')) {
        this.titleUpdatedAt = null;
      }
    } else if (this.title) {
      if (!this.titleSource && (this.isNew || this.isSelected('titleSource'))) {
        this.titleSource = 'auto';
      }
      if (this.isModified('title') && !this.isModified('titleUpdatedAt')) {
        this.titleUpdatedAt = new Date();
      } else if (
        !this.titleUpdatedAt &&
        (this.isNew || this.isSelected('titleUpdatedAt') || this.isModified('title'))
      ) {
        this.titleUpdatedAt = new Date();
      }
    }
  }

  const touchesArchiveOrPin =
    this.isNew ||
    this.isSelected('isArchived') ||
    this.isModified('isArchived') ||
    this.isSelected('isPinned') ||
    this.isModified('isPinned');
  if (touchesArchiveOrPin) {
    const archivedKnown =
      this.isNew || this.isSelected('isArchived') || this.isModified('isArchived');
    if (!archivedKnown && this.isModified('isPinned') && this.isPinned === true) {
      this.invalidate(
        'isArchived',
        'isArchived must be selected or false when pinning a chat.'
      );
    }
    if (this.isArchived === true) {
      if (
        this.isPinned !== false &&
        (this.isNew ||
          this.isSelected('isPinned') ||
          this.isModified('isPinned') ||
          this.isModified('isArchived'))
      ) {
        this.isPinned = false;
      }
      if (
        this.pinnedAt !== null &&
        (this.isNew ||
          this.isSelected('pinnedAt') ||
          this.isModified('isPinned') ||
          this.isModified('isArchived'))
      ) {
        this.pinnedAt = null;
      }
      if (
        !this.archivedAt &&
        (this.isNew || this.isSelected('archivedAt') || this.isModified('isArchived'))
      ) {
        this.archivedAt = new Date();
      }
    } else {
      if (
        (this.isArchived === false || this.isNew) &&
        (this.isNew || this.isSelected('archivedAt') || this.isModified('isArchived'))
      ) {
        this.archivedAt = null;
      }
      if (this.isPinned === true) {
        if (
          !this.pinnedAt &&
          (this.isNew || this.isSelected('pinnedAt') || this.isModified('isPinned'))
        ) {
          this.pinnedAt = new Date();
        }
      } else if (
        (this.isPinned === false || this.isNew) &&
        this.pinnedAt !== null &&
        (this.isNew || this.isSelected('pinnedAt') || this.isModified('isPinned'))
      ) {
        this.pinnedAt = null;
      }
    }
  }

  if (typeof this.get === 'function' && this.get('activeRun') === null) {
    this.set('activeRun', createIdleActiveRun());
  }
  const statusKnown =
    this.isNew ||
    this.isSelected('activeRun.status') ||
    this.isModified('activeRun.status') ||
    this.isDirectModified('activeRun');
  const coupledActiveRunPaths = [
    'activeRun.runId',
    'activeRun.turnId',
    'activeRun.branchId',
    'activeRun.userMessageId',
    'activeRun.assistantMessageId',
    'activeRun.mode',
    'activeRun.stage',
    'activeRun.provider',
    'activeRun.model',
    'activeRun.leaseExpiresAt',
    'activeRun.abortRequestedAt',
    'activeRun.pendingInterrupt',
  ];
  const runProvVisible =
    this.isNew ||
    this.isSelected('activeRun.provider') ||
    this.isModified('activeRun.provider') ||
    this.isDirectModified('activeRun');
  const runModelVisible =
    this.isNew ||
    this.isSelected('activeRun.model') ||
    this.isModified('activeRun.model') ||
    this.isDirectModified('activeRun');
  if (!this.isNew && this.isModified('activeRun.provider') && !runModelVisible) {
    this.invalidate(
      'activeRun.model',
      'activeRun.model must be selected or updated when modifying activeRun.provider.'
    );
  }
  if (
    this.activeRun &&
    runProvVisible &&
    runModelVisible &&
    ((this.activeRun.provider === null && this.activeRun.model !== null) ||
      (this.activeRun.provider !== null &&
        !getAllowedModelsForProvider(this.activeRun.provider).includes(this.activeRun.model)))
  ) {
    this.invalidate(
      'activeRun.model',
      'activeRun.provider and activeRun.model must either both be null or form a valid pair.'
    );
  }
  if (
    this.activeRun &&
    (this.isNew || this.isSelected('activeRun.status') || this.isModified('activeRun'))
  ) {
    if (!statusKnown) {
      if (coupledActiveRunPaths.some((path) => this.isModified(path))) {
        this.invalidate(
          'activeRun.status',
          'activeRun.status must be selected or modified when modifying status-coupled activeRun fields.'
        );
      }
    } else if (CHAT_CONSTANTS.TERMINAL_RUN_STATUSES.includes(this.activeRun.status)) {
      const forceRunReset =
        this.isNew || this.isModified('activeRun.status') || this.isDirectModified('activeRun');
      if (
        forceRunReset ||
        this.isSelected('activeRun.stage') ||
        this.isModified('activeRun.stage')
      ) {
        this.activeRun.stage = CHAT_CONSTANTS.DEFAULT_RUN_STAGE;
      }
      if (
        forceRunReset ||
        this.isSelected('activeRun.mode') ||
        this.isModified('activeRun.mode')
      ) {
        this.activeRun.mode = null;
      }
      if (
        forceRunReset ||
        this.isSelected('activeRun.leaseExpiresAt') ||
        this.isModified('activeRun.leaseExpiresAt')
      ) {
        this.activeRun.leaseExpiresAt = null;
      }
      if (
        forceRunReset ||
        this.isSelected('activeRun.abortRequestedAt') ||
        this.isModified('activeRun.abortRequestedAt')
      ) {
        this.activeRun.abortRequestedAt = null;
      }
      resetPendingInterruptFields(this, this.activeRun, forceRunReset);
    } else {
      const checkRunId =
        this.isNew ||
        this.isSelected('activeRun.runId') ||
        this.isModified('activeRun.runId') ||
        this.isDirectModified('activeRun');
      if (checkRunId && !this.activeRun.runId) {
        this.invalidate(
          'activeRun.runId',
          `activeRun.runId is required while status is ${this.activeRun.status}.`
        );
      }

      const checkRunProviderModel =
        this.isNew ||
        (this.isSelected('activeRun.provider') && this.isSelected('activeRun.model')) ||
        this.isModified('activeRun.provider') ||
        this.isModified('activeRun.model') ||
        this.isDirectModified('activeRun');
      if (!this.isNew && this.isModified('activeRun.status') && (!runProvVisible || !runModelVisible)) {
        this.invalidate(
          'activeRun.model',
          'activeRun.provider and activeRun.model must be selected when activating Chat.activeRun.'
        );
      } else if (checkRunProviderModel && (!this.activeRun.provider || !this.activeRun.model)) {
        this.invalidate(
          'activeRun.model',
          'activeRun.provider and activeRun.model are required while a run is active.'
        );
      }

      const pi = this.activeRun.pendingInterrupt;
      if (this.activeRun.status === 'waiting_approval') {
        const checkInterruptCore =
          this.isNew ||
          this.isModified('activeRun.status') ||
          this.isDirectModified('activeRun') ||
          this.isDirectModified('activeRun.pendingInterrupt') ||
          (this.isSelected('activeRun.pendingInterrupt.interruptId') &&
            this.isSelected('activeRun.pendingInterrupt.checkpointId') &&
            this.isSelected('activeRun.pendingInterrupt.payloadHash') &&
            this.isSelected('activeRun.pendingInterrupt.expiresAt'));
        const checkInterruptNonce =
          this.isNew ||
          this.isSelected('activeRun.pendingInterrupt.nonceHash') ||
          this.isModified('activeRun.status') ||
          this.isDirectModified('activeRun.pendingInterrupt.nonceHash') ||
          this.isDirectModified('activeRun.pendingInterrupt') ||
          this.isDirectModified('activeRun');

        const missingCore =
          checkInterruptCore &&
          (!pi?.interruptId || !pi?.checkpointId || !pi?.payloadHash || !pi?.expiresAt);
        const missingNonce = checkInterruptNonce && !pi?.nonceHash;
        if (missingCore || missingNonce) {
          this.invalidate(
            'activeRun.pendingInterrupt',
            'waiting_approval status requires interruptId, checkpointId, nonceHash, payloadHash, and expiresAt.'
          );
        }
      } else if (
        (this.activeRun.status === 'queued' || this.activeRun.status === 'running') &&
        (pi?.interruptId || pi?.nonceHash)
      ) {
        this.invalidate(
          'activeRun.pendingInterrupt',
          'pendingInterrupt may only be populated when activeRun.status is waiting_approval.'
        );
      }
    }
  }

  // Branch lineage DAG integrity & activeBranchId verification (partial-projection safe & fail-closed)
  const branchesFullKnown =
    this.isNew ||
    this.isDirectModified('branches') ||
    (this.isSelected('branches.branchId') &&
      this.isSelected('branches.parentBranchId') &&
      this.isSelected('branches.forkAfterSequence') &&
      this.isSelected('branches.isArchived'));
  const branchesModified =
    !this.isNew && (this.isDirectModified('branches') || this.isModified('branches'));
  const activeBranchKnown =
    this.isNew ||
    this.isSelected('activeBranchId') ||
    this.isDirectModified('activeBranchId') ||
    this.isModified('activeBranchId');

  if (
    this.isNew &&
    branchesFullKnown &&
    (!Array.isArray(this.branches) || this.branches.length === 0)
  ) {
    this.branches = [createRootBranchEntry()];
  }

  let branchById = null;
  if (branchesModified && !branchesFullKnown) {
    this.invalidate(
      'branches',
      'Full branch metadata must be selected when modifying Chat.branches.'
    );
  } else if (branchesModified && !activeBranchKnown) {
    this.invalidate(
      'activeBranchId',
      'activeBranchId must be selected when modifying Chat.branches.'
    );
  }

  if (branchesFullKnown) {
    const graphCheck = validateBranchGraph(this.branches, this.activeBranchId, {
      requireActiveMatch: activeBranchKnown,
    });
    branchById = graphCheck.branchById || null;
    if (!graphCheck.ok) {
      this.invalidate(graphCheck.errorPath, graphCheck.message);
    }
  } else if (activeBranchKnown && this.isModified('activeBranchId')) {
    this.invalidate(
      'branches',
      'branches must be selected when modifying activeBranchId via document validation.'
    );
  }

  // Compaction branch binding coherence (partial-projection safe & fail-closed)
  const compactionSeqKnown =
    this.isNew ||
    this.isSelected('compaction.summarizedUpToSequence') ||
    this.isModified('compaction.summarizedUpToSequence') ||
    this.isDirectModified('compaction');
  const compactionBranchKnown =
    this.isNew ||
    this.isSelected('compaction.branchId') ||
    this.isModified('compaction.branchId') ||
    this.isDirectModified('compaction');
  const compactionModified =
    !this.isNew &&
    (this.isModified('compaction') || this.isDirectModified('compaction'));

  if (this.compaction && compactionModified && (!compactionSeqKnown || !compactionBranchKnown)) {
    this.invalidate(
      'compaction.branchId',
      'compaction.summarizedUpToSequence and compaction.branchId must be selected together when modifying compaction.'
    );
  } else if (this.compaction && compactionSeqKnown && compactionBranchKnown) {
    if ((this.compaction.summarizedUpToSequence || 0) > 0) {
      if (!this.compaction.branchId) {
        if (activeBranchKnown && this.activeBranchId) {
          this.compaction.branchId = this.activeBranchId;
        } else {
          this.invalidate(
            'compaction.branchId',
            'compaction.branchId is required when compaction.summarizedUpToSequence > 0.'
          );
        }
      }
    } else if (
      !this.compaction.summary &&
      (this.isNew ||
        this.isSelected('compaction.summary') ||
        this.isModified('compaction.summary'))
    ) {
      this.compaction.branchId = null;
    }
    if (this.compaction.branchId) {
      if (!branchesFullKnown) {
        if (
          this.isModified('compaction.branchId') ||
          this.isModified('compaction.summarizedUpToSequence')
        ) {
          this.invalidate(
            'branches',
            'branches must be selected when setting or updating a non-null compaction.branchId.'
          );
        }
      } else if (branchById && !branchById.has(this.compaction.branchId)) {
        this.invalidate(
          'compaction.branchId',
          'compaction.branchId must reference an existing chat branch.'
        );
      }
    }
  }
});

/**
 * Query Pre-update Middleware:
 * Enforces path immutability for user and langgraph.threadId, guards branch DAG integrity on query updates,
 * synchronizes config models across provider updates, and validates activeRun state transitions.
 */
chatSchema.pre(['findOneAndUpdate', 'updateOne'], function () {
  const update = this.getUpdate();
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return;
  }

  const operatorEntries = Object.entries(update).filter(([key]) => key.startsWith('$'));

  const blockedPaths = ['user', 'langgraph.threadId'];
  for (const [op, opLayer] of operatorEntries) {
    if (!opLayer || typeof opLayer !== 'object' || Array.isArray(opLayer)) {
      continue;
    }
    for (const blockedPath of blockedPaths) {
      if (
        hasLayerPathConflict(opLayer, blockedPath) ||
        (op === '$rename' &&
          Object.values(opLayer).some(
            (dst) => typeof dst === 'string' && pathTouchesTarget(dst, blockedPath)
          ))
      ) {
        throw new Error(`Cannot mutate immutable Chat field (${blockedPath}).`);
      }
    }
  }
  for (const key of Object.keys(update)) {
    if (!key.startsWith('$')) {
      for (const blockedPath of blockedPaths) {
        if (pathTouchesTarget(key, blockedPath)) {
          throw new Error(`Cannot mutate immutable Chat field (${blockedPath}).`);
        }
      }
    }
  }

  const touchesExactOrRoot = (layer, target) =>
    Boolean(layer && typeof layer === 'object' && !Array.isArray(layer) && Object.hasOwn(layer, target));
  const nonNullProtectedPaths = [
    'config',
    'config.provider',
    'config.model',
    'activeRun',
    'activeRun.status',
    'branches',
    'activeBranchId',
  ];
  for (const p of nonNullProtectedPaths) {
    if (
      resolveUpdateField(update, p) === null ||
      touchesExactOrRoot(update.$unset, p) ||
      (update.$rename &&
        typeof update.$rename === 'object' &&
        (touchesExactOrRoot(update.$rename, p) ||
          Object.values(update.$rename).some((dst) => dst === p)))
    ) {
      throw new Error(`Cannot set ${p} to null or unset/rename it.`);
    }
  }
  for (const pairedPath of ['activeRun.provider', 'activeRun.model']) {
    if (
      touchesExactOrRoot(update.$unset, pairedPath) ||
      (update.$rename &&
        typeof update.$rename === 'object' &&
        (touchesExactOrRoot(update.$rename, pairedPath) ||
          Object.values(update.$rename).some((dst) => dst === pairedPath)))
    ) {
      throw new Error(`Cannot unset or rename paired Chat field (${pairedPath}); set to null together instead.`);
    }
  }

  if (
    (update.$pop && typeof update.$pop === 'object' && touchesExactOrRoot(update.$pop, 'branches')) ||
    hasLayerPathConflict(update.$pull, 'branches') ||
    hasLayerPathConflict(update.$pullAll, 'branches') ||
    (update.$addToSet && typeof update.$addToSet === 'object' && touchesExactOrRoot(update.$addToSet, 'branches'))
  ) {
    throw new Error('Cannot shrink, pull, or $addToSet entries on Chat.branches directly via generic query updates; use branch lifecycle methods.');
  }

  const chatRootKeysObj = Object.fromEntries(Object.entries(update).filter(([k]) => !k.startsWith('$')));
  const allChatLayers = [...operatorEntries, ['_root', chatRootKeysObj]];
  for (const [op, opLayer] of allChatLayers) {
    if (!opLayer || typeof opLayer !== 'object' || Array.isArray(opLayer)) continue;
    for (const [k, v] of Object.entries(opLayer)) {
      if (k.startsWith('branches.')) {
        if (
          op === '$set' &&
          k === 'branches.$.headCheckpointId' &&
          typeof v === 'string' &&
          v.trim().length > 0 &&
          v.trim().length <= CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH
        ) {
          continue;
        }
        throw new Error(
          'Cannot mutate Chat.branches elements via dotted query updates; only branches.$.headCheckpointId is permitted.'
        );
      }
    }
  }

  const hasModifiers = operatorEntries.length > 0;
  const ensureWriteLayer = () => (hasModifiers ? (update.$set ??= {}) : update);

  const hasExternalConflict = (dotPath, targetLayer) => {
    const hasOpConflict = operatorEntries.some(([op, opLayer]) => {
      if (opLayer === targetLayer) {
        return false;
      }
      if (hasLayerPathConflict(opLayer, dotPath)) {
        return true;
      }
      return (
        op === '$rename' &&
        opLayer &&
        typeof opLayer === 'object' &&
        Object.values(opLayer).some(
          (dst) => typeof dst === 'string' && pathTouchesTarget(dst, dotPath)
        )
      );
    });
    const hasRootConflict =
      targetLayer !== update &&
      Object.keys(update).some((key) => !key.startsWith('$') && pathTouchesTarget(key, dotPath));
    return hasOpConflict || hasRootConflict;
  };

  const setDerivedField = (dotPath, value, { force = false } = {}) => {
    if (force) {
      const hasNonAssignConflict = operatorEntries.some(([op, opLayer]) => {
        if (op === '$set' || op === '$setOnInsert') {
          return false;
        }
        if (hasLayerPathConflict(opLayer, dotPath)) {
          return true;
        }
        return (
          op === '$rename' &&
          opLayer &&
          typeof opLayer === 'object' &&
          Object.values(opLayer).some(
            (dst) => typeof dst === 'string' && pathTouchesTarget(dst, dotPath)
          )
        );
      });
      if (hasNonAssignConflict) {
        return;
      }
      let updatedExisting = false;
      for (const layer of [update.$set, update.$setOnInsert, update]) {
        const loc = findPathLocation(layer, dotPath);
        if (loc) {
          loc.target[loc.key] = value;
          updatedExisting = true;
        }
      }
      if (updatedExisting) {
        return;
      }
    }

    const targetLayer = ensureWriteLayer();
    if (hasExternalConflict(dotPath, targetLayer)) {
      return;
    }
    if (!force && resolveUpdateField(update, dotPath) !== undefined) {
      return;
    }

    const parts = dotPath.split('.');
    for (let split = parts.length - 1; split >= 1; split -= 1) {
      const parentPath = parts.slice(0, split).join('.');
      const parentLoc = findPathLocation(targetLayer, parentPath);
      if (parentLoc && parentLoc.value && typeof parentLoc.value === 'object' && !Array.isArray(parentLoc.value)) {
        const restParts = parts.slice(split);
        let cursor = parentLoc.value;
        for (let i = 0; i < restParts.length - 1; i += 1) {
          const k = restParts[i];
          if (!cursor[k] || typeof cursor[k] !== 'object' || Array.isArray(cursor[k])) {
            if (!force) {
              return;
            }
            cursor[k] = {};
          }
          cursor = cursor[k];
        }
        const leafKey = restParts.at(-1);
        if (!force && Object.prototype.hasOwnProperty.call(cursor, leafKey)) {
          return;
        }
        cursor[leafKey] = value;
        return;
      }
    }

    if (hasLayerPathConflict(targetLayer, dotPath)) {
      if (!force || !Object.prototype.hasOwnProperty.call(targetLayer, dotPath)) {
        return;
      }
    }
    targetLayer[dotPath] = value;
  };

  const providerPath = 'config.provider';
  const modelPath = 'config.model';
  if (resolveUpdateField(update, modelPath) === undefined) {
    for (const layer of [update.$set, update.$setOnInsert, update]) {
      const found = findPathLocation(layer, providerPath);
      if (!found) {
        continue;
      }
      const syncedModel = getDefaultModelForProvider(found.value);
      if (!syncedModel) {
        break;
      }
      const modelKey = found.key.replace(/provider$/, 'model');
      const hasOpConflict = operatorEntries.some(([op, opLayer]) => {
        if (opLayer !== layer && hasLayerPathConflict(opLayer, modelPath)) {
          return true;
        }
        return (
          op === '$rename' &&
          opLayer &&
          typeof opLayer === 'object' &&
          Object.values(opLayer).some(
            (dst) => typeof dst === 'string' && pathTouchesTarget(dst, modelPath)
          )
        );
      });
      const hasRootConflict =
        layer !== update &&
        Object.keys(update).some((key) => !key.startsWith('$') && pathTouchesTarget(key, modelPath));
      if (!hasOpConflict && !hasRootConflict && !hasLayerPathConflict(found.target, modelKey)) {
        found.target[modelKey] = syncedModel;
      }
      break;
    }
  }

  const filterObj = this.getFilter?.() || {};
  const effConfigProv =
    resolveUpdateField(update, providerPath) ??
    (typeof extractObjectPath(filterObj, providerPath) === 'string'
      ? extractObjectPath(filterObj, providerPath)
      : undefined);
  const updConfigModel = resolveUpdateField(update, modelPath);
  if (updConfigModel !== undefined || resolveUpdateField(update, providerPath) !== undefined) {
    if (updConfigModel !== undefined) {
      if (
        typeof effConfigProv !== 'string' ||
        !getAllowedModelsForProvider(effConfigProv).includes(updConfigModel)
      ) {
        throw new Error(
          'Query update on config.model or config.provider must supply or filter a compatible provider/model pair.'
        );
      }
    } else if (
      typeof effConfigProv !== 'string' ||
      !CHAT_CONSTANTS.PROVIDERS.includes(effConfigProv)
    ) {
      throw new Error('Invalid config.provider in Chat query update.');
    }
  }

  const updRunProv = resolveUpdateField(update, 'activeRun.provider');
  const updRunModel = resolveUpdateField(update, 'activeRun.model');
  if (updRunProv !== undefined || updRunModel !== undefined) {
    const fRunProv = extractObjectPath(filterObj, 'activeRun.provider');
    const fRunModel = extractObjectPath(filterObj, 'activeRun.model');
    const effRunProv =
      updRunProv !== undefined
        ? updRunProv
        : typeof fRunProv === 'string' || fRunProv === null
          ? fRunProv
          : undefined;
    const effRunModel =
      updRunModel !== undefined
        ? updRunModel
        : typeof fRunModel === 'string' || fRunModel === null
          ? fRunModel
          : undefined;
    if (effRunProv === undefined || effRunModel === undefined) {
      throw new Error(
        'Query update touching activeRun.provider or activeRun.model must supply or filter both paired fields.'
      );
    }
    if (effRunProv !== null || effRunModel !== null) {
      if (
        typeof effRunProv !== 'string' ||
        !getAllowedModelsForProvider(effRunProv).includes(effRunModel)
      ) {
        throw new Error(
          'Query update activeRun.provider and activeRun.model must be null together or form a compatible pair.'
        );
      }
    }
  }

  const nextArchived = resolveUpdateField(update, 'isArchived');
  const nextPinned = resolveUpdateField(update, 'isPinned');
  if (nextArchived === true) {
    setDerivedField('isPinned', false, { force: true });
    setDerivedField('pinnedAt', null, { force: true });
    setDerivedField('archivedAt', new Date());
  } else {
    if (nextArchived === false) {
      setDerivedField('archivedAt', null);
    }
    if (nextPinned === true) {
      setDerivedField('pinnedAt', new Date());
    } else if (nextPinned === false) {
      setDerivedField('pinnedAt', null);
    }
  }

  const nextTitle = resolveUpdateField(update, 'title');
  const isTitleUnset = hasLayerPathConflict(update.$unset, 'title');
  if (isTitleUnset || nextTitle === null || (typeof nextTitle === 'string' && nextTitle.trim() === '')) {
    if (typeof nextTitle === 'string' && nextTitle.trim() === '' && !isTitleUnset) {
      for (const layer of [update.$set, update.$setOnInsert, update]) {
        const titleLoc = findPathLocation(layer, 'title');
        if (titleLoc) {
          titleLoc.target[titleLoc.key] = null;
        }
      }
    }
    setDerivedField('titleSource', null, { force: true });
    setDerivedField('titleUpdatedAt', null, { force: true });
  } else if (typeof nextTitle === 'string') {
    setDerivedField('titleUpdatedAt', new Date());
  }

  const nextRunStatus = resolveUpdateField(update, 'activeRun.status');
  if (
    typeof nextRunStatus === 'string' &&
    CHAT_CONSTANTS.TERMINAL_RUN_STATUSES.includes(nextRunStatus)
  ) {
    setDerivedField('activeRun.stage', CHAT_CONSTANTS.DEFAULT_RUN_STAGE, { force: true });
    setDerivedField('activeRun.mode', null, { force: true });
    setDerivedField('activeRun.leaseExpiresAt', null, { force: true });
    setDerivedField('activeRun.abortRequestedAt', null, { force: true });
    for (const [k, v] of Object.entries(createEmptyPendingInterrupt())) {
      setDerivedField(`activeRun.pendingInterrupt.${k}`, v, { force: true });
    }
  }

  const updBranches = resolveUpdateField(update, 'branches');
  const updActiveBranchId = resolveUpdateField(update, 'activeBranchId');
  if (updBranches !== undefined) {
    const graphCheck = validateBranchGraph(updBranches, updActiveBranchId ?? null, {
      requireActiveMatch: updActiveBranchId !== undefined,
    });
    if (!graphCheck.ok) {
      throw new Error(graphCheck.message);
    }
  }
  if (update.$push && typeof update.$push === 'object' && Object.hasOwn(update.$push, 'branches')) {
    const rawPush = update.$push.branches;
    if (
      !rawPush ||
      typeof rawPush !== 'object' ||
      '$slice' in rawPush ||
      '$position' in rawPush ||
      '$sort' in rawPush
    ) {
      throw new Error('Chat.branches $push updates cannot use $slice, $position, or $sort modifiers.');
    }
    const pushedEntries = Array.isArray(rawPush?.$each) ? rawPush.$each : [rawPush];
    for (const b of pushedEntries) {
      if (
        !b ||
        typeof b !== 'object' ||
        typeof b.branchId !== 'string' ||
        !b.branchId.trim() ||
        b.branchId.trim().length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH ||
        b.branchId.trim() === CHAT_CONSTANTS.DEFAULT_BRANCH_ID ||
        typeof b.parentBranchId !== 'string' ||
        !b.parentBranchId.trim() ||
        b.parentBranchId.trim() === b.branchId.trim() ||
        b.parentBranchId.trim().length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH
      ) {
        throw new Error('Pushed branch entry must specify valid distinct bounded branchId and parentBranchId.');
      }
      if (
        b.forkAfterSequence !== undefined &&
        (!Number.isInteger(b.forkAfterSequence) || b.forkAfterSequence < 0)
      ) {
        throw new Error('Pushed branch forkAfterSequence must be a non-negative integer.');
      }
    }
  }
  if (updActiveBranchId !== undefined) {
    if (
      typeof updActiveBranchId !== 'string' ||
      !updActiveBranchId.trim() ||
      updActiveBranchId.trim().length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH
    ) {
      throw new Error('activeBranchId must be a valid bounded non-empty string.');
    }
    const cleanActiveTarget = updActiveBranchId.trim();
    const matchedInSetBranches =
      Array.isArray(updBranches) &&
      updBranches.some((b) => b?.branchId?.trim() === cleanActiveTarget && !b.isArchived);
    const rawPushBranches = update.$push?.branches;
    const pushedBranchArr = rawPushBranches
      ? Array.isArray(rawPushBranches.$each)
        ? rawPushBranches.$each
        : [rawPushBranches]
      : [];
    const matchedInPushBranches = pushedBranchArr.some(
      (b) => b?.branchId?.trim() === cleanActiveTarget && !b.isArchived
    );
    const branchElemMatch = filterObj.branches?.$elemMatch;
    const matchedInFilter =
      branchElemMatch &&
      branchElemMatch.branchId === cleanActiveTarget &&
      branchElemMatch.isArchived === false;
    if (!matchedInSetBranches && !matchedInPushBranches && !matchedInFilter) {
      throw new Error(
        'Query update setting activeBranchId must supply or filter an unarchived entry in Chat.branches.'
      );
    }
  }
});

/**
 * Checks whether a candidate value is a non-empty string.
 * @param {any} v - Value to check.
 * @returns {boolean} True if string has non-whitespace characters.
 */
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Checks whether a candidate value is a valid non-NaN Date instance.
 * @param {any} v - Value to check.
 * @returns {boolean} True if valid Date.
 */
const isValidDate = (v) => v instanceof Date && !Number.isNaN(v.getTime());

/**
 * Checks whether a candidate value is a positive finite number.
 * @param {any} v - Value to check.
 * @returns {boolean} True if positive finite number.
 */
const isPositiveFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Atomically acquires an exclusive distributed run lease on a conversation thread.
 * Guarantees single-concurrency execution per chat, preventing race conditions.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Lock acquisition parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.runId - Unique run execution ID.
 * @param {string} [params.turnId] - Conversational turn UUID.
 * @param {string} [params.branchId='main'] - Target branch ID.
 * @param {import('mongoose').Types.ObjectId|string|null} [params.userMessageId=null] - User prompt message document ID.
 * @param {import('mongoose').Types.ObjectId|string|null} [params.assistantMessageId=null] - Streaming assistant message ID.
 * @param {string} params.provider - AI provider ('google'|'addis_ai').
 * @param {string} params.model - Target AI model identifier.
 * @param {string} [params.stage='ingesting_media'] - Initial execution pipeline stage.
 * @param {'standard'|'agent'|'fast'} [params.mode='standard'] - Agent execution mode.
 * @param {number} [params.leaseMs=60000] - Lock duration lease in milliseconds.
 * @param {Date} [params.now=new Date()] - Acquisition timestamp.
 * @returns {Promise<import('mongoose').Document|null>} Acquired chat document, or null if lock acquisition failed.
 */
chatSchema.statics.acquireRunLock = function ({
  chatId,
  userId,
  runId,
  turnId,
  branchId,
  userMessageId = null,
  assistantMessageId = null,
  provider,
  model,
  stage = 'ingesting_media',
  mode = CHAT_CONSTANTS.DEFAULT_RUN_MODE,
  leaseMs = CHAT_CONSTANTS.DEFAULT_RUN_LEASE_MS,
  now = new Date(),
}) {
  if (!isNonEmptyString(runId) || runId.trim().length > CHAT_CONSTANTS.RUN_ID_MAX_LENGTH) {
    return Promise.reject(new Error('Valid bounded runId is required to acquire run lock.'));
  }
  if (
    turnId !== undefined &&
    turnId !== null &&
    (!isNonEmptyString(turnId) || turnId.trim().length > CHAT_CONSTANTS.TURN_ID_MAX_LENGTH)
  ) {
    return Promise.reject(new Error('turnId must be a valid bounded non-empty string when provided.'));
  }
  if (
    branchId !== undefined &&
    branchId !== null &&
    (!isNonEmptyString(branchId) || branchId.trim().length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH)
  ) {
    return Promise.reject(new Error('branchId must be a valid bounded non-empty string when provided.'));
  }
  const cleanBranchId = isNonEmptyString(branchId)
    ? branchId.trim()
    : CHAT_CONSTANTS.DEFAULT_BRANCH_ID;
  const cleanRunId = runId.trim();
  const cleanTurnId = isNonEmptyString(turnId) ? turnId.trim() : null;
  if (!CHAT_CONSTANTS.RUN_MODES.includes(mode)) {
    return Promise.reject(new Error(`Invalid run mode for run lock: ${mode}`));
  }
  if (!getAllowedModelsForProvider(provider).includes(model)) {
    return Promise.reject(new Error('Invalid AI provider/model pair for run lock.'));
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }
  if (!isPositiveFiniteNumber(leaseMs)) {
    return Promise.reject(new Error('leaseMs must be a positive finite number.'));
  }
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return this.findOneAndUpdate(
    {
      _id: chatId,
      user: userId,
      isArchived: false,
      branches: { $elemMatch: { branchId: cleanBranchId, isArchived: false } },
      $or: [
        { activeRun: null },
        { 'activeRun.status': { $in: CHAT_CONSTANTS.TERMINAL_RUN_STATUSES } },
        {
          'activeRun.status': { $ne: 'waiting_approval' },
          'activeRun.leaseExpiresAt': { $lte: now },
        },
        {
          'activeRun.status': 'waiting_approval',
          'activeRun.pendingInterrupt.expiresAt': { $lte: now },
        },
      ],
    },
    {
      $set: {
        'activeRun.runId': cleanRunId,
        'activeRun.turnId': cleanTurnId,
        'activeRun.branchId': cleanBranchId,
        'activeRun.userMessageId': userMessageId,
        'activeRun.assistantMessageId': assistantMessageId,
        'activeRun.status': 'queued',
        'activeRun.stage': stage,
        'activeRun.mode': mode,
        'activeRun.provider': provider,
        'activeRun.model': model,
        'activeRun.lastEventSeq': 0,
        'activeRun.startedAt': now,
        'activeRun.lastHeartbeatAt': now,
        'activeRun.leaseExpiresAt': leaseExpiresAt,
        'activeRun.abortRequestedAt': null,
        'activeRun.completedAt': null,
        'activeRun.errorMessage': null,
        'activeRun.errorCode': null,
        'activeRun.pendingInterrupt': createEmptyPendingInterrupt(),
      },
    },
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Renews the active run distributed lease lock and updates stage, status, and event sequence.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Heartbeat parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.runId - Active run execution ID.
 * @param {string} [params.stage] - Current pipeline stage.
 * @param {'queued'|'running'|'stopping'} [params.status] - Current active run status.
 * @param {number} [params.lastEventSeq] - Monotonic SSE event sequence counter.
 * @param {import('mongoose').Types.ObjectId|string} [params.assistantMessageId] - Streaming assistant message ID.
 * @param {number} [params.leaseMs=60000] - Lock extension in milliseconds.
 * @param {Date} [params.now=new Date()] - Heartbeat timestamp.
 * @returns {Promise<import('mongoose').Document|null>} Updated chat document.
 */
chatSchema.statics.heartbeatRun = function ({
  chatId,
  userId,
  runId,
  stage,
  status,
  lastEventSeq,
  assistantMessageId,
  leaseMs = CHAT_CONSTANTS.DEFAULT_RUN_LEASE_MS,
  now = new Date(),
}) {
  if (!isNonEmptyString(runId)) {
    return Promise.reject(new Error('runId is required to heartbeat active run.'));
  }
  if (status !== undefined && !['queued', 'running', 'stopping'].includes(status)) {
    return Promise.reject(new Error(`Invalid active heartbeat status: ${status}`));
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }
  if (!isPositiveFiniteNumber(leaseMs)) {
    return Promise.reject(new Error('leaseMs must be a positive finite number.'));
  }
  const setFields = {
    'activeRun.lastHeartbeatAt': now,
    'activeRun.leaseExpiresAt': new Date(now.getTime() + leaseMs),
  };
  if (stage !== undefined) setFields['activeRun.stage'] = stage;
  if (status !== undefined) setFields['activeRun.status'] = status;
  if (lastEventSeq !== undefined) setFields['activeRun.lastEventSeq'] = lastEventSeq;
  if (assistantMessageId !== undefined) setFields['activeRun.assistantMessageId'] = assistantMessageId;

  const allowedFilterStatuses =
    status === 'running'
      ? ['queued', 'running']
      : status === 'queued'
        ? ['queued']
        : ['queued', 'running', 'stopping'];

  return this.findOneAndUpdate(
    {
      _id: chatId,
      user: userId,
      'activeRun.runId': runId,
      'activeRun.status': { $in: allowedFilterStatuses },
    },
    { $set: setFields },
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Signals an abort request for the active streaming/tool run, transitioning status to 'stopping'.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Request stop parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} [params.runId] - Optional specific run ID to target.
 * @param {Date} [params.now=new Date()] - Stop request timestamp.
 * @returns {Promise<import('mongoose').Document|null>} Updated chat document.
 */
chatSchema.statics.requestStopRun = function ({ chatId, userId, runId, now = new Date() }) {
  if (runId !== undefined && runId !== null && !isNonEmptyString(runId)) {
    return Promise.reject(new Error('runId must be a non-empty string when provided.'));
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }
  const filter = {
    _id: chatId,
    user: userId,
    'activeRun.status': { $in: ['queued', 'running', 'waiting_approval'] },
  };
  if (runId !== undefined && runId !== null) {
    filter['activeRun.runId'] = runId;
  }
  return this.findOneAndUpdate(
    filter,
    {
      $set: {
        'activeRun.status': 'stopping',
        'activeRun.abortRequestedAt': now,
        'activeRun.pendingInterrupt.nonceHash': null,
      },
    },
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Pauses active run execution and registers a pending human-in-the-loop interrupt for sensitive actions.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Interrupt pause parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.runId - Active run execution ID.
 * @param {IChatPendingInterrupt} params.interrupt - Structured interrupt payload details.
 * @param {Date} [params.now=new Date()] - Interrupt registration timestamp.
 * @returns {Promise<import('mongoose').Document|null>} Updated chat document.
 */
chatSchema.statics.pauseForApproval = function ({
  chatId,
  userId,
  runId,
  interrupt,
  now = new Date(),
}) {
  if (
    !isNonEmptyString(runId) ||
    !isNonEmptyString(interrupt?.interruptId) ||
    !isNonEmptyString(interrupt?.checkpointId) ||
    !isNonEmptyString(interrupt?.nonceHash) ||
    !isNonEmptyString(interrupt?.payloadHash)
  ) {
    return Promise.reject(
      new Error(
        'runId and interrupt (interruptId, checkpointId, nonceHash, payloadHash) are required.'
      )
    );
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }
  const expiresAt =
    interrupt.expiresAt || new Date(now.getTime() + CHAT_CONSTANTS.DEFAULT_APPROVAL_TTL_MS);
  if (!isValidDate(expiresAt) || expiresAt <= now) {
    return Promise.reject(new Error('Interrupt expiresAt must be a valid future Date.'));
  }
  const allowedDecisions = interrupt.allowedDecisions ?? CHAT_CONSTANTS.APPROVAL_DECISIONS;
  if (
    !Array.isArray(allowedDecisions) ||
    allowedDecisions.length === 0 ||
    !allowedDecisions.every((d) => CHAT_CONSTANTS.APPROVAL_DECISIONS.includes(d))
  ) {
    return Promise.reject(new Error('Interrupt allowedDecisions must be a non-empty valid decision list.'));
  }

  return this.findOneAndUpdate(
    {
      _id: chatId,
      user: userId,
      'activeRun.runId': runId,
      'activeRun.status': { $in: ['queued', 'running'] },
    },
    {
      $set: {
        'activeRun.status': 'waiting_approval',
        'activeRun.stage': 'waiting_approval',
        'activeRun.lastHeartbeatAt': now,
        'activeRun.leaseExpiresAt': expiresAt,
        'langgraph.activeCheckpointId': interrupt.checkpointId,
        'activeRun.pendingInterrupt': {
          interruptId: interrupt.interruptId,
          checkpointId: interrupt.checkpointId,
          nonceHash: interrupt.nonceHash,
          toolCallId: interrupt.toolCallId || null,
          toolName: interrupt.toolName || null,
          actionCount: interrupt.actionCount ?? 1,
          actionCategory: interrupt.actionCategory || null,
          payloadHash: interrupt.payloadHash,
          proposedSummary: interrupt.proposedSummary || null,
          allowedDecisions,
          expiresAt,
          createdAt: now,
        },
      },
    },
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Atomically consumes and clears a pending HITL interrupt upon supervisor approval/rejection.
 * Resumes active run status to 'running' with a renewed execution lease.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Interrupt resolution parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} [params.runId] - Optional specific run ID to target.
 * @param {string} params.interruptId - Interrupt ID to consume.
 * @param {string} params.nonceHash - Cryptographic replay-protection nonce hash.
 * @param {string} params.payloadHash - Tool payload SHA-256 hash.
 * @param {'approve'|'reject'|'edit'} [params.decision] - Supervisor decision value.
 * @param {number} [params.leaseMs=60000] - Renewed execution lease duration in milliseconds.
 * @param {Date} [params.now=new Date()] - Consumption timestamp.
 * @returns {Promise<import('mongoose').Document|null>} Resumed chat document.
 */
chatSchema.statics.consumeInterruptApproval = function ({
  chatId,
  userId,
  runId,
  interruptId,
  nonceHash,
  payloadHash,
  decision,
  leaseMs = CHAT_CONSTANTS.DEFAULT_RUN_LEASE_MS,
  now = new Date(),
}) {
  if (!isNonEmptyString(interruptId) || !isNonEmptyString(nonceHash) || !isNonEmptyString(payloadHash)) {
    return Promise.reject(
      new Error('interruptId, nonceHash, and payloadHash are required to consume HITL approval.')
    );
  }
  if (runId !== undefined && runId !== null && !isNonEmptyString(runId)) {
    return Promise.reject(new Error('runId must be a non-empty string when provided.'));
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }
  if (!isPositiveFiniteNumber(leaseMs)) {
    return Promise.reject(new Error('leaseMs must be a positive finite number.'));
  }
  if (
    decision !== undefined &&
    decision !== null &&
    !CHAT_CONSTANTS.APPROVAL_DECISIONS.includes(decision)
  ) {
    return Promise.reject(new Error(`Invalid HITL approval decision: ${decision}`));
  }
  const filter = {
    _id: chatId,
    user: userId,
    isArchived: false,
    'activeRun.status': 'waiting_approval',
    'activeRun.pendingInterrupt.interruptId': interruptId,
    'activeRun.pendingInterrupt.nonceHash': nonceHash,
    'activeRun.pendingInterrupt.payloadHash': payloadHash,
    'activeRun.pendingInterrupt.expiresAt': { $gt: now },
  };
  if (runId !== undefined && runId !== null) {
    filter['activeRun.runId'] = runId;
  }
  if (decision !== undefined && decision !== null) {
    filter['activeRun.pendingInterrupt.allowedDecisions'] = decision;
  }

  return this.findOneAndUpdate(
    filter,
    {
      $set: {
        'activeRun.status': 'running',
        'activeRun.stage': 'running_tool',
        'activeRun.lastHeartbeatAt': now,
        'activeRun.leaseExpiresAt': new Date(now.getTime() + leaseMs),
        'activeRun.pendingInterrupt': createEmptyPendingInterrupt(),
      },
    },
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Releases the distributed run lock and transitions activeRun to a terminal status ('completed', 'failed', 'aborted', 'timeout').
 * Updates checkpoint references and increments cumulative token/cost telemetry counters.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Lock release parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.runId - Active run execution ID.
 * @param {'completed'|'failed'|'aborted'|'timeout'} [params.status='completed'] - Terminal status.
 * @param {string} [params.checkpointId] - Final LangGraph checkpoint ID.
 * @param {boolean} [params.isCompletedCheckpoint=false] - Whether to mark lastCompletedCheckpointId.
 * @param {number} [params.lastEventSeq] - Final SSE event sequence number.
 * @param {string|null} [params.errorMessage=null] - Error message if run failed.
 * @param {string|null} [params.errorCode=null] - Machine-readable error code if run failed.
 * @param {object|null} [params.usageDelta=null] - Incremental token usage and cost delta.
 * @param {Date} [params.now=new Date()] - Completion timestamp.
 * @returns {Promise<import('mongoose').Document|null>} Released chat document.
 */
chatSchema.statics.releaseRunLock = function ({
  chatId,
  userId,
  runId,
  status = 'completed',
  checkpointId,
  isCompletedCheckpoint = false,
  lastEventSeq,
  errorMessage = null,
  errorCode = null,
  usageDelta = null,
  now = new Date(),
}) {
  if (!isNonEmptyString(runId)) {
    return Promise.reject(new Error('runId is required to release run lock.'));
  }
  if (!CHAT_CONSTANTS.TERMINAL_RUN_STATUSES.includes(status)) {
    return Promise.reject(new Error(`Invalid terminal status for releaseRunLock: ${status}`));
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }
  const safeErrorMessage =
    typeof errorMessage === 'string' && errorMessage.trim().length > 0
      ? errorMessage.trim().slice(0, CHAT_CONSTANTS.ERROR_MAX_LENGTH)
      : null;
  const safeErrorCode =
    typeof errorCode === 'string' && errorCode.trim().length > 0
      ? errorCode.trim().slice(0, CHAT_CONSTANTS.ERROR_CODE_MAX_LENGTH)
      : null;

  const setFields = {
    'activeRun.status': status,
    'activeRun.stage': CHAT_CONSTANTS.DEFAULT_RUN_STAGE,
    'activeRun.mode': null,
    'activeRun.leaseExpiresAt': null,
    'activeRun.abortRequestedAt': null,
    'activeRun.completedAt': now,
    'activeRun.errorMessage': safeErrorMessage,
    'activeRun.errorCode': safeErrorCode,
    'activeRun.pendingInterrupt': createEmptyPendingInterrupt(),
  };
  if (lastEventSeq !== undefined) {
    setFields['activeRun.lastEventSeq'] = lastEventSeq;
  }
  if (checkpointId !== undefined) {
    setFields['langgraph.activeCheckpointId'] = checkpointId;
    if (isCompletedCheckpoint) {
      setFields['langgraph.lastCompletedCheckpointId'] = checkpointId;
    }
  }

  const updateOp = { $set: setFields };
  if (usageDelta && typeof usageDelta === 'object') {
    const incFields = {};
    if (Number.isInteger(usageDelta.inputTokens) && usageDelta.inputTokens > 0) {
      incFields['usageSummary.inputTokens'] = usageDelta.inputTokens;
    }
    if (Number.isInteger(usageDelta.outputTokens) && usageDelta.outputTokens > 0) {
      incFields['usageSummary.outputTokens'] = usageDelta.outputTokens;
    }
    if (Number.isInteger(usageDelta.totalTokens) && usageDelta.totalTokens > 0) {
      incFields['usageSummary.totalTokens'] = usageDelta.totalTokens;
    }
    if (
      typeof usageDelta.estimatedCostUsd === 'number' &&
      Number.isFinite(usageDelta.estimatedCostUsd) &&
      usageDelta.estimatedCostUsd > 0
    ) {
      incFields['usageSummary.estimatedCostUsd'] = usageDelta.estimatedCostUsd;
    }
    if (Object.keys(incFields).length > 0) {
      updateOp.$inc = incFields;
    }
  }

  return this.findOneAndUpdate(
    {
      _id: chatId,
      user: userId,
      'activeRun.runId': runId,
      'activeRun.status': { $in: CHAT_CONSTANTS.ACTIVE_RUN_STATUSES },
    },
    updateOp,
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Registers a new fork branch in the conversation DAG from an ancestor turn/checkpoint.
 * Non-destructively preserves parent branch message timeline.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Branch registration parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.branchId - Unique ID for the new branch.
 * @param {string} [params.parentBranchId='main'] - Origin branch ID.
 * @param {number} [params.forkAfterSequence=0] - Message sequence after which fork diverged.
 * @param {import('mongoose').Types.ObjectId|null} [params.forkedFromMessageId=null] - Fork message reference.
 * @param {string|null} [params.forkedFromTurnId=null] - Fork turn UUID.
 * @param {string|null} [params.forkedFromCheckpointId=null] - LangGraph checkpoint at fork time.
 * @param {string|null} [params.label=null] - Optional human-readable branch label.
 * @param {boolean} [params.setAsActive=true] - Whether to immediately activate the new branch.
 * @param {Date} [params.now=new Date()] - Branch creation timestamp.
 * @param {import('mongoose').ClientSession|null} [params.session=null] - Optional MongoDB transaction session.
 * @returns {Promise<import('mongoose').Document|null>} Updated chat document.
 */
chatSchema.statics.registerForkBranch = function ({
  chatId,
  userId,
  branchId,
  parentBranchId = CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
  forkAfterSequence = 0,
  forkedFromMessageId = null,
  forkedFromTurnId = null,
  forkedFromCheckpointId = null,
  label = null,
  setAsActive = true,
  now = new Date(),
  session = null,
}) {
  if (!isNonEmptyString(branchId) || branchId.trim().length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH) {
    return Promise.reject(new Error('Valid bounded branchId is required to register fork branch.'));
  }
  const cleanBranchId = branchId.trim();
  const cleanParentId = typeof parentBranchId === 'string' ? parentBranchId.trim() : '';
  if (cleanBranchId === CHAT_CONSTANTS.DEFAULT_BRANCH_ID || !cleanParentId || cleanParentId === cleanBranchId) {
    return Promise.reject(new Error('Fork branch must have a distinct non-root branchId and valid parentBranchId.'));
  }
  if (!Number.isInteger(forkAfterSequence) || forkAfterSequence < 0) {
    return Promise.reject(new Error('forkAfterSequence must be a non-negative integer.'));
  }
  if (!isValidDate(now)) {
    return Promise.reject(new Error('now must be a valid Date.'));
  }

  const branchEntry = {
    branchId: cleanBranchId,
    parentBranchId: cleanParentId,
    forkAfterSequence,
    forkedFromMessageId,
    forkedFromTurnId: forkedFromTurnId || null,
    forkedFromCheckpointId: forkedFromCheckpointId || null,
    headCheckpointId: forkedFromCheckpointId || null,
    label: typeof label === 'string' && label.trim() ? label.trim().slice(0, CHAT_CONSTANTS.BRANCH_LABEL_MAX_LENGTH) : null,
    isArchived: false,
    createdAt: now,
  };

  const updateOp = {
    $push: { branches: branchEntry },
  };
  if (setAsActive) {
    updateOp.$set = { activeBranchId: cleanBranchId };
  }

  return this.findOneAndUpdate(
    {
      _id: chatId,
      user: userId,
      isArchived: false,
      'branches.branchId': { $ne: cleanBranchId },
      branches: { $elemMatch: { branchId: cleanParentId, isArchived: false } },
      $expr: { $lt: [{ $size: '$branches' }, CHAT_CONSTANTS.MAX_BRANCHES_PER_CHAT] },
    },
    updateOp,
    { returnDocument: 'after', runValidators: true, ...(session ? { session } : {}) }
  );
};

/**
 * Switches the active conversation branch while ensuring no streaming run is active.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Branch switch parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} params.branchId - Target branch to activate.
 * @returns {Promise<import('mongoose').Document|null>} Updated chat document.
 */
chatSchema.statics.switchActiveBranch = function ({ chatId, userId, branchId }) {
  if (!isNonEmptyString(branchId)) {
    return Promise.reject(new Error('branchId is required to switch active branch.'));
  }
  const cleanBranchId = branchId.trim();
  return this.findOneAndUpdate(
    {
      _id: chatId,
      user: userId,
      isArchived: false,
      'activeRun.status': { $in: CHAT_CONSTANTS.TERMINAL_RUN_STATUSES },
      branches: { $elemMatch: { branchId: cleanBranchId, isArchived: false } },
    },
    { $set: { activeBranchId: cleanBranchId } },
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Synchronizes head LangGraph checkpoint identifiers on a specific branch and on root langgraph state.
 *
 * @memberof chatSchema.statics
 * @param {object} params - Checkpoint sync parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.chatId - Target conversation ID.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated owning supervisor ID.
 * @param {string} [params.branchId='main'] - Target branch ID.
 * @param {string} params.checkpointId - New head checkpoint ID.
 * @param {boolean} [params.isCompletedCheckpoint=false] - Whether checkpoint marks a clean completion point.
 * @returns {Promise<import('mongoose').Document|null>} Updated chat document.
 */
chatSchema.statics.syncBranchCheckpoint = function ({
  chatId,
  userId,
  branchId = CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
  checkpointId,
  isCompletedCheckpoint = false,
}) {
  if (
    !isNonEmptyString(branchId) ||
    branchId.trim().length > CHAT_CONSTANTS.BRANCH_ID_MAX_LENGTH ||
    !isNonEmptyString(checkpointId) ||
    checkpointId.trim().length > CHAT_CONSTANTS.CHECKPOINT_ID_MAX_LENGTH
  ) {
    return Promise.reject(
      new Error('Valid bounded branchId and checkpointId are required to sync branch checkpoint.')
    );
  }
  const cleanBranchId = branchId.trim();
  const cleanCheckpointId = checkpointId.trim();
  const setFields = {
    'branches.$.headCheckpointId': cleanCheckpointId,
    'langgraph.activeCheckpointId': cleanCheckpointId,
  };
  if (isCompletedCheckpoint) {
    setFields['langgraph.lastCompletedCheckpointId'] = cleanCheckpointId;
  }
  return this.findOneAndUpdate(
    {
      _id: chatId,
      user: userId,
      isArchived: false,
      branches: { $elemMatch: { branchId: cleanBranchId, isArchived: false } },
    },
    { $set: setFields },
    { returnDocument: 'after', runValidators: true }
  );
};

/**
 * Authoritative Mongoose Model for Chat conversations and LangGraph thread states.
 * @type {import('mongoose').Model<IChat>}
 */
export const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
