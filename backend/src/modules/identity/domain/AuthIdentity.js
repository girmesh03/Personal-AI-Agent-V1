/**
 * @module modules/identity/domain/AuthIdentity
 * @description Mongoose model for linking external identity providers (Google SSO, etc.) to canonical User records.
 */

import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';

const authIdentitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required.'],
      index: true,
    },
    provider: {
      type: String,
      required: [true, 'Identity provider name is required.'],
      enum: ['google', 'apple', 'github', 'local'],
    },
    providerId: {
      type: String,
      required: [true, 'Provider unique subject identifier is required.'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    profileData: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Compound unique index guaranteeing one unique identity per provider account
authIdentitySchema.index({ provider: 1, providerId: 1 }, { unique: true });

export const AuthIdentity = mongoose.model('AuthIdentity', authIdentitySchema);
export default AuthIdentity;
