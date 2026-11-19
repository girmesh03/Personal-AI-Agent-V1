/**
 * @module config/logger
 * @description Centralized Winston logger with daily log rotation and recursive PII/credential sanitization.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists at backend root
const logDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * List of sensitive field names to mask in log payloads.
 * @constant
 * @type {readonly string[]}
 */
const SENSITIVE_KEYS = Object.freeze([
  'password',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'apisecret',
  'client_secret',
  'authorization',
  'cookie',
  'secret',
]);

/**
 * Recursively sanitizes sensitive PII and authentication credentials from log objects.
 *
 * @function sanitizePii
 * @param {*} data - Raw data to sanitize.
 * @returns {*} Sanitized copy of data.
 */
export const sanitizePii = (data) => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Redact Bearer tokens
    let sanitized = data.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
    // Redact JWT-like strings
    sanitized = sanitized.replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]');
    return sanitized;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePii(item));
  }

  if (typeof data === 'object') {
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizePii(value);
      }
    }
    // Preserve internal Winston Symbol properties (e.g., Symbol.for('level'), Symbol.for('message'))
    const symbols = Object.getOwnPropertySymbols(data);
    for (const sym of symbols) {
      sanitizedObj[sym] = data[sym];
    }
    return sanitizedObj;
  }

  return data;
};

/**
 * Custom Winston format that passes info through the PII sanitizer.
 * @type {import('winston').Logform.FormatWrap}
 */
const piiSanitizerFormat = winston.format((info) => {
  return sanitizePii(info);
});

/**
 * Centralized Winston logger instance.
 * @constant
 * @type {winston.Logger}
 */
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    piiSanitizerFormat()
  ),
  defaultMeta: { service: 'operon-backend' },
  transports: [
    // Daily rotating combined log
    new DailyRotateFile({
      dirname: logDir,
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info',
      format: winston.format.json(),
    }),
    // Daily rotating error log
    new DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: winston.format.json(),
    }),
  ],
});

// In development, add formatted colorized console output
if (env.NODE_ENV !== 'production') {
  logger.add(
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
}

/**
 * Log stream adapter for HTTP request loggers (e.g. Morgan).
 * @constant
 * @type {{ write: (message: string) => void }}
 */
export const logStream = Object.freeze({
  write: (message) => {
    logger.info(message.trim());
  },
});

export default logger;
