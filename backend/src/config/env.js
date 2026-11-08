/**
 * @module config/env
 * @description Schema-driven environment variable validator. Fails closed on missing required configuration.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ENVIRONMENTS } from '../utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
const backendEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: backendEnvPath });

/**
 * Validates and normalizes an environment configuration dictionary.
 * Fails closed immediately if any required variable is missing or invalid.
 *
 * @param {Record<string, string | undefined>} source - Source environment dictionary (e.g. process.env).
 * @returns {Readonly<object>} Frozen, validated environment configuration.
 * @throws {Error} If any validation rule fails.
 */
export function validateEnv(source = process.env) {
  const errors = [];

  const nodeEnv = source.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
  if (!Object.values(ENVIRONMENTS).includes(nodeEnv)) {
    errors.push(`Invalid NODE_ENV "${nodeEnv}". Expected one of: ${Object.values(ENVIRONMENTS).join(', ')}`);
  }

  const rawPort = source.PORT || 4000;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`Invalid PORT "${rawPort}". Expected an integer between 1 and 65535.`);
  }

  const clientOrigin = source.CLIENT_ORIGIN || 'http://localhost:3000';
  try {
    new URL(clientOrigin);
  } catch {
    errors.push(`Invalid CLIENT_ORIGIN "${clientOrigin}". Expected a valid URL.`);
  }

  const mongoUri = source.MONGO_URI ? source.MONGO_URI.trim() : '';
  if (!mongoUri) {
    errors.push('Missing required environment variable: MONGO_URI.');
  } else if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    errors.push('Invalid MONGO_URI. Expected a connection string starting with "mongodb://" or "mongodb+srv://".');
  }

  const isTest = nodeEnv === ENVIRONMENTS.TEST;

  const jwtAccessSecret = source.JWT_ACCESS_SECRET ? source.JWT_ACCESS_SECRET.trim() : '';
  if (!jwtAccessSecret && !isTest) {
    errors.push('Missing required environment variable: JWT_ACCESS_SECRET.');
  }

  const jwtRefreshSecret = source.JWT_REFRESH_SECRET ? source.JWT_REFRESH_SECRET.trim() : '';
  if (!jwtRefreshSecret && !isTest) {
    errors.push('Missing required environment variable: JWT_REFRESH_SECRET.');
  }

  if (errors.length > 0) {
    const message = `Environment configuration validation failed:\n - ${errors.join('\n - ')}`;
    throw new Error(message);
  }

  const googleClientId = source.GOOGLE_CLIENT_ID || source.OAUTH_GOOGLE_CLIENT_ID || '';
  const googleClientSecret = source.GOOGLE_CLIENT_SECRET || source.OAUTH_GOOGLE_CLIENT_SECRET || '';
  const googleCallbackUrl = source.GOOGLE_CALLBACK_URL || source.OAUTH_GOOGLE_CALLBACK_URL || '';

  return Object.freeze({
    NODE_ENV: nodeEnv,
    PORT: port,
    CLIENT_ORIGIN: clientOrigin,
    MONGO_URI: mongoUri,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    JWT_ACCESS_EXPIRES_IN: source.JWT_ACCESS_EXPIRES_IN || '15m',
    JWT_REFRESH_EXPIRES_IN: source.JWT_REFRESH_EXPIRES_IN || '7d',
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    GOOGLE_CALLBACK_URL: googleCallbackUrl,
    isDevelopment: nodeEnv === ENVIRONMENTS.DEVELOPMENT,
    isProduction: nodeEnv === ENVIRONMENTS.PRODUCTION,
    isTest: nodeEnv === ENVIRONMENTS.TEST,
  });
}

export const env = validateEnv(process.env);
export default env;
