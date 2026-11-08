/**
 * @module config/schemaOptions
 * @description Centralized Mongoose base schema configuration.
 */

/**
 * Standard Mongoose schema options applied across all root domain models.
 * Enforces automatic timestamps, virtuals inclusion, and sanitizing transforms that strip __v and delete duplicate id alias.
 * @constant
 * @type {Readonly<Record<string, any>>}
 */
export const BASE_SCHEMA_OPTIONS = Object.freeze({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      delete ret.id;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      delete ret.id;
      return ret;
    },
  },
});

/**
 * Standard Mongoose schema options applied to identifiable subdocuments (_id: true).
 * Disables Mongoose duplicate id virtual getter (id: false) to prevent collision with explicit schema fields.
 * @constant
 * @type {Readonly<Record<string, any>>}
 */
export const SUBDOCUMENT_SCHEMA_OPTIONS = Object.freeze({
  _id: true,
  id: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      delete ret.id;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      delete ret.id;
      return ret;
    },
  },
});

/**
 * Standard Mongoose schema options applied to embedded configuration and value objects (_id: false).
 * Omits independent MongoDB ObjectIds and internal Mongoose duplicate id aliases.
 * @constant
 * @type {Readonly<Record<string, any>>}
 */
export const EMBEDDED_SCHEMA_OPTIONS = Object.freeze({
  _id: false,
  id: false,
});

export default {
  BASE_SCHEMA_OPTIONS,
  SUBDOCUMENT_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
};
