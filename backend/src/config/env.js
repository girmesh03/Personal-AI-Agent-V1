/**
 * @module config/env
 * @description Centralized, schema-validated, and deeply frozen environment configuration.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from backend directory or workspace root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

/**
 * Parses a string duration (e.g. '15m', '7d', '24h', '60s') into milliseconds.
 * @function parseDurationToMs
 * @param {string} durationStr - Formatted duration string.
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

const isTestEnv = process.env.NODE_ENV === 'test';

/**
 * Zod schema defining all required and optional environment configuration fields.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),

  MONGO_URI: isTestEnv
    ? z.string().default('mongodb://127.0.0.1:27017/operon-test')
    : z.string().min(1, 'MONGO_URI is required'),

  JWT_ACCESS_SECRET: isTestEnv
    ? z.string().default('test_jwt_access_secret_min_32_characters_long_for_testing!')
    : z.string().min(1, 'JWT_ACCESS_SECRET is required'),

  JWT_REFRESH_SECRET: isTestEnv
    ? z.string().default('test_jwt_refresh_secret_min_32_characters_long_for_testing!')
    : z.string().min(1, 'JWT_REFRESH_SECRET is required'),

  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  ADDIS_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),

  FFMPEG_PATH: z.string().optional().default(''),
  FFPROBE_PATH: z.string().optional().default(''),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_URL: z.string().optional().default(''),

  OAUTH_GOOGLE_CLIENT_ID: z.string().optional().default(''),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  OAUTH_GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/api/v1/auth/google/callback'),

  TELEGRAM_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_MANAGEMENT_CHAT_ID: z.string().optional().default(''),
  TELEGRAM_MAINTENANCE_CHAT_ID: z.string().optional().default(''),
  TELEGRAM_GENERAL_CHAT_ID: z.string().optional().default(''),
});

// Resolve aliases and fallbacks
const rawConfig = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
  MONGO_URI: process.env.MONGO_URI,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
  ADDIS_API_KEY: process.env.ADDIS_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  FFMPEG_PATH: process.env.FFMPEG_PATH,
  FFPROBE_PATH: process.env.FFPROBE_PATH,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_URL: process.env.CLOUDINARY_URL,
  OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
  OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  OAUTH_GOOGLE_CALLBACK_URL:
    process.env.OAUTH_GOOGLE_CALLBACK_URL || process.env.GOOGLE_CALLBACK_URL,
  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_MANAGEMENT_CHAT_ID: process.env.TELEGRAM_MANAGEMENT_CHAT_ID,
  TELEGRAM_MAINTENANCE_CHAT_ID: process.env.TELEGRAM_MAINTENANCE_CHAT_ID,
  TELEGRAM_GENERAL_CHAT_ID: process.env.TELEGRAM_GENERAL_CHAT_ID,
};

const parsedResult = envSchema.safeParse(rawConfig);

if (!parsedResult.success) {
  const issues = parsedResult.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`[FATAL] Environment configuration validation failed:\n${issues}\nPlease check your .env file.`);
}

/**
 * Deeply frozen application environment configuration.
 * @constant
 */
export const env = Object.freeze(parsedResult.data);

export default env;
