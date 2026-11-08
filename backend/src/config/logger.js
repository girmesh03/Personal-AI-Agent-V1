/**
 * @module config/logger
 * @description Structured asynchronous logger with ISO timestamps, daily file rotation, and deep recursive sensitive-data redaction.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { ENVIRONMENTS, SENSITIVE_KEYS } from '../utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.resolve(__dirname, '../../logs');

const nodeEnv = process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
const isProduction = nodeEnv === ENVIRONMENTS.PRODUCTION;

/**
 * Deeply and recursively traverses an object, array, or primitive to redact sensitive keys.
 * Handles circular references safely using a WeakSet.
 *
 * @param {unknown} data - The data structure to sanitize.
 * @param {WeakSet<object>} [seen] - Set of visited objects to prevent circular reference cycles.
 * @returns {unknown} Sanitized clone of the input data with sensitive values replaced by '[REDACTED]'.
 */
function redactSensitiveData(data, seen = new WeakSet()) {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (seen.has(data)) {
    return '[CIRCULAR]';
  }
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, seen));
  }

  const redacted = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sensitivePattern) =>
      lowerKey.includes(sensitivePattern)
    );

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object') {
      redacted[key] = redactSensitiveData(value, seen);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Winston custom format that applies deep redaction to log metadata.
 */
const redactFormat = winston.format((info) => {
  return redactSensitiveData(info);
});

// Daily file rotation transport for all application logs
const dailyRotateTransport = new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: 'application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    redactFormat(),
    winston.format.json()
  ),
});

// Daily file rotation transport strictly for error-level logs
const errorRotateTransport = new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    redactFormat(),
    winston.format.json()
  ),
});

// Console transport formatted for development readability or production JSON
const consoleTransport = new winston.transports.Console({
  level: isProduction ? 'info' : 'debug',
  format: isProduction
    ? winston.format.combine(
        winston.format.timestamp(),
        redactFormat(),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        redactFormat(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level}: ${message}${metaString}`;
        })
      ),
});

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  transports: [
    consoleTransport,
    dailyRotateTransport,
    errorRotateTransport,
  ],
  exitOnError: false,
});

/**
 * Morgan HTTP request logging stream adapter.
 */
export const logStream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

export default logger;
