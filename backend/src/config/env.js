/**
 * @module config/env
 * @description Centralized, Zod-validated, and deeply frozen environment configuration.
 * Validates all required and development-only environment variables loaded from backend/.env.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Parses a string duration (e.g. '15m', '7d', '24h', '60s') into milliseconds.
 *
 * @function parseDurationToMs
 * @param {string} [durationStr] - Formatted duration string.
 * @param {number} defaultMs - Fallback millisecond value if parsing fails.
 * @returns {number} Duration in milliseconds.
 */
export const parseDurationToMs = (durationStr, defaultMs) => {
  if (!durationStr || typeof durationStr !== 'string') {
    return defaultMs;
  }
  const match = durationStr.trim().match(/^(\d+)([smhd])$/);
  if (!match) {
    return defaultMs;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return defaultMs;
  }
};

/**
 * Strict Zod schema validating backend environment variables.
 * @type {import('zod').ZodObject<any>}
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().optional().default(''),

  GOOGLE_SSO_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_SSO_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_SSO_CALLBACK_URL: z.string().optional().default('http://localhost:4000/api/v1/auth/google/sso/callback'),

  GOOGLE_DRIVE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_DRIVE_CALLBACK_URL: z.string().optional().default('http://localhost:4000/api/v1/users/integrations/google-drive/callback'),

  GEMINI_DEVELOPMENT_ONLY_API_KEY: z.string().optional().default(''),
  ADDIS_AI_DEVELOPMENT_ONLY_API_KEY: z.string().optional().default(''),

  TELEGRAM_DEVELOPMENT_ONLY_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_DEVELOPMENT_ONLY_MANAGEMENT_CHAT_ID: z.string().optional().default(''),
  TELEGRAM_DEVELOPMENT_ONLY_MAINTENANCE_CHAT_ID: z.string().optional().default(''),
  TELEGRAM_DEVELOPMENT_ONLY_GENERAL_CHAT_ID: z.string().optional().default(''),

  CLOUDINARY_DEVELOPMENT_ONLY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_DEVELOPMENT_ONLY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_DEVELOPMENT_ONLY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_DEVELOPMENT_ONLY_URL: z.string().optional().default(''),
});

/**
 * Validates an environment object against the Zod schema.
 *
 * @function validateEnv
 * @param {Record<string, any>} [envObj=process.env] - Environment dictionary to validate.
 * @returns {z.infer<typeof envSchema>} Parsed and validated environment configuration.
 * @throws {Error} If validation fails with detailed error descriptions.
 */
export const validateEnv = (envObj = process.env) => {
  const result = envSchema.safeParse(envObj);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `[${issue.path.join('.')}]: ${issue.message}`)
      .join(', ');
    throw new Error(`[FATAL] Environment validation failed: ${errorDetails}`);
  }
  return result.data;
};

// Validate environment on initial load
const parsedEnv = validateEnv(process.env);

// Enforce Protocol 64: Production isolation warning when dedicated ENCRYPTION_KEY is unset
if (parsedEnv.NODE_ENV === 'production' && !parsedEnv.ENCRYPTION_KEY) {
  console.warn(
    '[SECURITY WARNING] Production environment detected without dedicated ENCRYPTION_KEY. Falling back to JWT_ACCESS_SECRET for envelope encryption is not recommended for production deployments (Protocol 64).'
  );
}

/**
 * Deeply frozen application environment configuration.
 * @constant
 * @type {Readonly<import('zod').infer<typeof envSchema>>}
 */
export const env = Object.freeze({
  PORT: parsedEnv.PORT,
  NODE_ENV: parsedEnv.NODE_ENV,
  CLIENT_ORIGIN: parsedEnv.CLIENT_ORIGIN,
  MONGO_URI: parsedEnv.MONGO_URI,

  JWT_ACCESS_SECRET: parsedEnv.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: parsedEnv.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: parsedEnv.JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: parsedEnv.JWT_REFRESH_EXPIRES_IN,
  ENCRYPTION_KEY: parsedEnv.ENCRYPTION_KEY || parsedEnv.JWT_ACCESS_SECRET,

  GOOGLE_SSO_CLIENT_ID: parsedEnv.GOOGLE_SSO_CLIENT_ID,
  GOOGLE_SSO_CLIENT_SECRET: parsedEnv.GOOGLE_SSO_CLIENT_SECRET,
  GOOGLE_SSO_CALLBACK_URL: parsedEnv.GOOGLE_SSO_CALLBACK_URL,

  GOOGLE_DRIVE_CLIENT_ID: parsedEnv.GOOGLE_DRIVE_CLIENT_ID,
  GOOGLE_DRIVE_CLIENT_SECRET: parsedEnv.GOOGLE_DRIVE_CLIENT_SECRET,
  GOOGLE_DRIVE_CALLBACK_URL: parsedEnv.GOOGLE_DRIVE_CALLBACK_URL,

  GEMINI_DEVELOPMENT_ONLY_API_KEY: parsedEnv.GEMINI_DEVELOPMENT_ONLY_API_KEY,
  ADDIS_AI_DEVELOPMENT_ONLY_API_KEY: parsedEnv.ADDIS_AI_DEVELOPMENT_ONLY_API_KEY,

  TELEGRAM_DEVELOPMENT_ONLY_BOT_TOKEN: parsedEnv.TELEGRAM_DEVELOPMENT_ONLY_BOT_TOKEN,
  TELEGRAM_DEVELOPMENT_ONLY_MANAGEMENT_CHAT_ID: parsedEnv.TELEGRAM_DEVELOPMENT_ONLY_MANAGEMENT_CHAT_ID,
  TELEGRAM_DEVELOPMENT_ONLY_MAINTENANCE_CHAT_ID: parsedEnv.TELEGRAM_DEVELOPMENT_ONLY_MAINTENANCE_CHAT_ID,
  TELEGRAM_DEVELOPMENT_ONLY_GENERAL_CHAT_ID: parsedEnv.TELEGRAM_DEVELOPMENT_ONLY_GENERAL_CHAT_ID,

  CLOUDINARY_DEVELOPMENT_ONLY_CLOUD_NAME: parsedEnv.CLOUDINARY_DEVELOPMENT_ONLY_CLOUD_NAME,
  CLOUDINARY_DEVELOPMENT_ONLY_API_KEY: parsedEnv.CLOUDINARY_DEVELOPMENT_ONLY_API_KEY,
  CLOUDINARY_DEVELOPMENT_ONLY_API_SECRET: parsedEnv.CLOUDINARY_DEVELOPMENT_ONLY_API_SECRET,
  CLOUDINARY_DEVELOPMENT_ONLY_URL: parsedEnv.CLOUDINARY_DEVELOPMENT_ONLY_URL,
});

export default env;
