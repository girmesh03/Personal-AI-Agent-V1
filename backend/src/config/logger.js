/**
 * @module config/logger
 * @description Centralized Winston logger with PII sanitization and HTTP stream adapter.
 */

import winston from 'winston';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists at backend/logs
const logDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Sensitive field names to sanitize from logs.
 * @constant
 * @type {readonly string[]}
 */
const SENSITIVE_KEYS = Object.freeze([
  'password',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'authorization',
  'cookie',
  'client_secret',
  'secret',
]);

/**
 * Recursively sanitizes sensitive credentials and PII from log payloads.
 * @function sanitizePii
 * @param {*} data - Raw data to sanitize.
 * @returns {*} Sanitized copy.
 */
export const sanitizePii = (data) => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    let sanitized = data.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]');
    return sanitized;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePii(item));
  }

  if (typeof data === 'object') {
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizePii(value);
      }
    }
    const symbols = Object.getOwnPropertySymbols(data);
    for (const sym of symbols) {
      sanitizedObj[sym] = data[sym];
    }
    return sanitizedObj;
  }

  return data;
};

const piiSanitizerFormat = winston.format((info) => sanitizePii(info));

const transports = [
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: winston.format.json(),
  }),
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    level: 'info',
    format: winston.format.json(),
  }),
];

if (env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return stack
            ? `[${timestamp}] [${level}]: ${message}\n${stack}`
            : `[${timestamp}] [${level}]: ${message}`;
        })
      ),
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

/**
 * Application Winston logger instance.
 */
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    piiSanitizerFormat()
  ),
  defaultMeta: { service: 'personal-ai-agent-backend' },
  transports,
  silent: env.NODE_ENV === 'test',
});

/**
 * Morgan-compatible stream adapter.
 */
export const logStream = Object.freeze({
  write: (message) => {
    logger.info(message.trim());
  },
});

export default logger;
