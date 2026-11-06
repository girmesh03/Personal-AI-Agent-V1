/**
 * @module infrastructure/database/schemaOptions
 * @description Centralized Mongoose base schema configuration and serialization options.
 */

/**
 * Standard Mongoose schema options applied across all root domain models.
 * Enforces automatic createdAt/updatedAt timestamps, virtuals inclusion, and secret/internal key stripping.
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
 * Disables duplicate `id` virtual getter (`id: false`) and strips `__v`.
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
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      return ret;
    },
  },
});

export default {
  BASE_SCHEMA_OPTIONS,
  SUBDOCUMENT_SCHEMA_OPTIONS,
};
