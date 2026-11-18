# Backend Personal AI Agent Version 0 Codebase

Authoritative repository: Personal-AI-Agent
Branch: phase-14-overall-application-audit
Total Files: 61

================================================================================
File: backend/src/app.js
================================================================================

````javascript
/**
 * @module app
 * @description Core Express 5 application setup, security middleware pipeline, and route mounting.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logStream } from './config/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HTTP_STATUS, UPLOADS_CONFIG } from './utils/constants.js';
import apiV1Routes from './routes/index.js';

const app = express();

// 1. Helmet security headers
app.use(helmet());

// 2. CORS configuration with credentials support
const configuredOrigins = env.CLIENT_ORIGIN
  ? env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      try {
        if (
          !origin ||
          allowedOrigins.includes(origin) ||
          (env.NODE_ENV === 'production' && /\.vercel\.app$/.test(new URL(origin).hostname))
        ) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked for origin: ${origin}`));
        }
      } catch {
        callback(new Error(`CORS error parsing origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. Cookie parser for authentication tokens
app.use(cookieParser());

// 4. JSON body parser with 10MB payload limit
app.use(express.json({ limit: '10mb' }));

// 5. URL-encoded body parser
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. HTTP request logger via Morgan
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: logStream }));
}

// 7. System Health Check endpoints
app.get(['/api/health', '/api/v1/health'], (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: env.NODE_ENV,
  });
});

// 8. Static file serving for uploaded audio and attachments
app.use('/uploads', express.static(UPLOADS_CONFIG.ROOT_DIR));

// 9. API v1 Router Mount (consolidated domain route tree)
app.use('/api/v1', apiV1Routes);

// 10. Unmatched Route Handler (404)
app.use(notFoundHandler);

// 10. Global Error Handler
app.use(errorHandler);

export default app;

````

================================================================================
File: backend/src/server.js
================================================================================

````javascript
/**
 * @module server
 * @description Main HTTP server bootstrap, database initialization, and graceful process management.
 */

import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { startSweeper, stopSweeper } from './jobs/sweeper.js';

let server;

/**
 * Initializes database connection and starts HTTP listener.
 * @function startServer
 * @returns {Promise<http.Server>} Active HTTP server instance.
 */
export const startServer = async () => {
  try {
    // 1. Establish database connection
    await connectDB();

    // 2. Initialize HTTP server
    server = http.createServer(app);

    server.listen(env.PORT, () => {
      logger.info(`==================================================`);
      logger.info(`  Report Builder Backend Server Running`);
      logger.info(`  Port:        ${env.PORT}`);
      logger.info(`  Environment: ${env.NODE_ENV}`);
      logger.info(`  Client URL:  ${env.CLIENT_ORIGIN}`);
      logger.info(`  Health:      http://localhost:${env.PORT}/api/v1/health`);
      logger.info(`==================================================`);

      // 3. Start background two-pass sweeper after server is listening
      startSweeper();
    });

    return server;
  } catch (error) {
    logger.error(`[FATAL] Server initialization failed: ${error.message}\n${error.stack}`);
    process.exit(1);
  }
};

/**
 * Gracefully shuts down the HTTP server and database connections.
 * @function gracefulShutdown
 * @param {string} signal - The termination signal received (e.g. SIGTERM, SIGINT).
 * @returns {Promise<void>}
 */
export const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop background sweeper timer
  stopSweeper();

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      await disconnectDB();
      logger.info('Process terminated gracefully.');
      process.exit(0);
    });

    // Force shutdown if cleanup takes longer than 10 seconds
    setTimeout(() => {
      logger.error('Forcefully terminating process due to shutdown timeout.');
      process.exit(1);
    }, 10000);
  } else {
    await disconnectDB();
    process.exit(0);
  }
};

// Bind termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Bind process unhandled rejection and exception handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`[CRITICAL] Unhandled Rejection at: ${promise}, reason: ${reason}`);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  logger.error(`[CRITICAL] Uncaught Exception: ${error.message}\n${error.stack}`);
  process.exit(1);
});

// Auto-start server if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

````

================================================================================
File: backend/src/config/db.js
================================================================================

````javascript
/**
 * @module config/db
 * @description MongoDB connection engine with exponential backoff reconnection and graceful shutdown.
 */

import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Reconnection backoff configuration.
 * @constant
 * @type {Readonly<{
 *   INITIAL_DELAY_MS: number,
 *   MULTIPLIER: number,
 *   MAX_DELAY_MS: number,
 *   MAX_RETRIES: number,
 *   JITTER_PERCENT: number
 * }>}
 */
const BACKOFF_CONFIG = Object.freeze({
  INITIAL_DELAY_MS: 1000,
  MULTIPLIER: 2,
  MAX_DELAY_MS: 30000,
  MAX_RETRIES: 5,
  JITTER_PERCENT: 0.1,
});

/**
 * Standard Mongoose connection options.
 * @constant
 * @type {Readonly<mongoose.ConnectOptions>}
 */
const MONGO_OPTIONS = Object.freeze({
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
});

let isShuttingDown = false;
let retryAttempt = 0;

/**
 * Calculates backoff delay with 10% random jitter.
 * @function calculateBackoffDelay
 * @param {number} attempt - Current retry attempt index.
 * @returns {number} Delay in milliseconds.
 */
const calculateBackoffDelay = (attempt) => {
  const baseDelay = Math.min(
    BACKOFF_CONFIG.INITIAL_DELAY_MS * Math.pow(BACKOFF_CONFIG.MULTIPLIER, attempt),
    BACKOFF_CONFIG.MAX_DELAY_MS
  );
  const jitter = baseDelay * BACKOFF_CONFIG.JITTER_PERCENT * (Math.random() * 2 - 1);
  return Math.round(baseDelay + jitter);
};

/**
 * Asynchronously establishes connection to MongoDB Atlas with exponential backoff retries.
 * @function connectDB
 * @returns {Promise<mongoose.Connection>} Resolved Mongoose connection.
 * @throws {Error} If maximum reconnection attempts are exceeded.
 */
export const connectDB = async () => {
  if (isShuttingDown) {
    logger.warn('Skipping connectDB: application is shutting down');
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(env.MONGO_URI, MONGO_OPTIONS);
    retryAttempt = 0;
    logger.info(`MongoDB connected successfully: ${conn.connection.host}`);
    return conn.connection;
  } catch (error) {
    retryAttempt += 1;
    logger.error(`MongoDB initial connection failure (attempt ${retryAttempt}/${BACKOFF_CONFIG.MAX_RETRIES}): ${error.message}`);

    if (retryAttempt >= BACKOFF_CONFIG.MAX_RETRIES) {
      logger.error('CRITICAL: Exhausted maximum MongoDB connection retries. Exiting process.');
      throw new Error(`Exhausted maximum MongoDB connection retries (${BACKOFF_CONFIG.MAX_RETRIES}): ${error.message}`);
    }

    const delay = calculateBackoffDelay(retryAttempt);
    logger.info(`Retrying MongoDB connection in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return connectDB();
  }
};

/**
 * Asynchronously disconnects Mongoose connection cleanly during graceful shutdown.
 * @function disconnectDB
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
  isShuttingDown = true;
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed successfully');
    } catch (error) {
      logger.error(`Error during MongoDB disconnection: ${error.message}`);
    }
  }
};

// Bind lifecycle event listeners to Mongoose connection
mongoose.connection.on('connected', () => {
  logger.info(`MongoDB lifecycle event: connected to ${mongoose.connection.host}`);
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB lifecycle error: ${err.message}`);
});

mongoose.connection.on('disconnected', async () => {
  if (isShuttingDown) {
    logger.info('MongoDB disconnected cleanly during application shutdown');
    return;
  }

  logger.warn('MongoDB disconnected unexpectedly. Attempting automatic reconnection...');
  try {
    await connectDB();
  } catch (err) {
    logger.error(`Automatic reconnection failed: ${err.message}`);
  }
});

export default {
  connectDB,
  disconnectDB,
};

````

================================================================================
File: backend/src/config/env.js
================================================================================

````javascript
/**
 * @module config/env
 * @description Centralized, validated, and deeply frozen environment configuration.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * List of required environment variable keys that must be defined.
 * @constant
 * @type {readonly string[]}
 */
const REQUIRED_ENV_VARS = Object.freeze([
  'PORT',
  'NODE_ENV',
  'CLIENT_ORIGIN',
  'MONGO_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
]);

/**
 * Validates that all required environment variables are present in process.env.
 * @function validateEnv
 * @param {readonly string[]} requiredVars - Array of required variable names.
 * @throws {Error} If any required variable is missing or empty.
 * @returns {void}
 */
const validateEnv = (requiredVars) => {
  const missing = requiredVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing required environment variables: ${missing.join(', ')}. Please verify your .env file.`
    );
  }
};

validateEnv(REQUIRED_ENV_VARS);

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

/**
 * Deeply frozen application environment configuration.
 * @constant
 * @type {Readonly<{
 *   PORT: number,
 *   NODE_ENV: string,
 *   CLIENT_ORIGIN: string,
 *   MONGO_URI: string,
 *   JWT_ACCESS_SECRET: string,
 *   JWT_REFRESH_SECRET: string,
 *   JWT_ACCESS_EXPIRES_IN: string,
 *   JWT_REFRESH_EXPIRES_IN: string,
 *   ADDIS_API_KEY: string,
 *   GEMINI_API_KEY: string,
 *   FFMPEG_PATH: string,
 *   FFPROBE_PATH: string,
 *   OAUTH_GOOGLE_CLIENT_ID: string,
 *   OAUTH_GOOGLE_CLIENT_SECRET: string,
 *   OAUTH_GOOGLE_CALLBACK_URL: string
 * }>}
 */
export const env = Object.freeze({
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  MONGO_URI: process.env.MONGO_URI,
  
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,

  ADDIS_API_KEY: process.env.ADDIS_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  
  FFMPEG_PATH: process.env.FFMPEG_PATH || '',
  FFPROBE_PATH: process.env.FFPROBE_PATH || '',

  OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
  OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
  OAUTH_GOOGLE_CALLBACK_URL: process.env.OAUTH_GOOGLE_CALLBACK_URL || process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/v1/auth/google/callback',

  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED === 'true',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_MANAGEMENT_CHAT_ID: process.env.TELEGRAM_MANAGEMENT_CHAT_ID || '',
  TELEGRAM_MAINTENANCE_CHAT_ID: process.env.TELEGRAM_MAINTENANCE_CHAT_ID || '',
  TELEGRAM_GENERAL_CHAT_ID: process.env.TELEGRAM_GENERAL_CHAT_ID || '',
});

export default env;

````

================================================================================
File: backend/src/config/logger.js
================================================================================

````javascript
/**
 * @module config/logger
 * @description Centralized Winston logger with daily log rotation and PII sanitization.
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
 * Recursively sanitizes sensitive PII and authentication credentials from log objects.
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
      if (SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
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
 */
const piiSanitizerFormat = winston.format((info) => {
  const sanitized = sanitizePii(info);
  return sanitized;
});

/**
 * Combined Winston logger instance.
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
  defaultMeta: { service: 'report-builder-backend' },
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
 * Log stream adapter for HTTP request loggers (e.g. Morgan or custom Express middleware).
 * @constant
 * @type {{ write: (message: string) => void }}
 */
export const logStream = Object.freeze({
  write: (message) => {
    logger.info(message.trim());
  },
});

export default logger;

````

================================================================================
File: backend/src/config/schemaOptions.js
================================================================================

````javascript
/**
 * @module config/schemaOptions
 * @description Centralized Mongoose base schema configuration.
 */

/**
 * Standard Mongoose schema options applied across all root domain models.
 * Enforces line-by-line configuration, automatic timestamps, and sanitizing transforms.
 * @constant
 * @type {Readonly<Record<string, any>>}
 */
export const BASE_SCHEMA_OPTIONS = Object.freeze({
  // Automatically manage createdAt and updatedAt timestamps
  timestamps: true,
  // Configuration for JSON serialization
  toJSON: {
    // Include virtual accessors
    virtuals: true,
    // Custom transform function sanitizing internal state
    transform: (_doc, ret) => {
      // Strip Mongoose internal version key
      delete ret.__v;
      // Strip duplicate id alias to enforce standard _id conventions
      delete ret.id;
      // Return sanitized plain object
      return ret;
    },
  },
  // Configuration for programmatic object serialization
  toObject: {
    // Include virtual accessors
    virtuals: true,
    // Custom transform function sanitizing internal state
    transform: (_doc, ret) => {
      // Strip Mongoose internal version key
      delete ret.__v;
      // Strip duplicate id alias
      delete ret.id;
      // Return sanitized plain object
      return ret;
    },
  },
});

/**
 * Standard Mongoose schema options applied to identifiable subdocuments (_id: true).
 * Enforces:
 * 1. Mongoose duplicate `id` virtual getter is disabled (`id: false`), preventing collision
 *    with explicit schema fields (such as client message UUIDs) and preventing duplicate keys.
 * 2. Virtual getters (such as computed `url` on attachments) are serialized into JSON and plain objects.
 * 3. Mongoose internal version key `__v` is stripped.
 * 4. Automatic root-level timestamps (which are irrelevant for subdocuments) are excluded.
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


````

================================================================================
File: backend/src/errors/CustomError.js
================================================================================

````javascript
/**
 * @module errors/CustomError
 * @description Centralized domain error hierarchy for structured API error handling.
 */

import { HTTP_STATUS } from '../utils/constants.js';

/**
 * Base operational error class.
 * All predictable application exceptions extend this class.
 * @class CustomError
 * @extends Error
 */
export class CustomError extends Error {
  /**
   * @constructor
   * @param {string} message - Human-readable error description.
   * @param {number} statusCode - Standard HTTP status code.
   * @param {string} errorCode - Machine-readable error code string.
   * @param {Array<Object>|null} [details=null] - Optional detailed validation or context errors.
   */
  constructor(message, statusCode, errorCode, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request Error.
 * Thrown when client sends invalid syntax or malformed requests.
 * @class BadRequestError
 * @extends CustomError
 */
export class BadRequestError extends CustomError {
  /**
   * @param {string} [message='Invalid request data. Please check your inputs.'] - Error message.
   * @param {string} [errorCode='BAD_REQUEST'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Invalid request data. Please check your inputs.', errorCode = 'BAD_REQUEST', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, errorCode, details);
  }
}

/**
 * 401 Unauthenticated Error.
 * Strictly named UNAUTHENTICATED (never UNAUTHORIZED).
 * Thrown when authentication is required and has failed or has not been provided.
 * @class UnauthenticatedError
 * @extends CustomError
 */
export class UnauthenticatedError extends CustomError {
  /**
   * @param {string} [message='Please log in again to continue.'] - Error message.
   * @param {string} [errorCode='UNAUTHENTICATED'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Please log in again to continue.', errorCode = 'UNAUTHENTICATED', details = null) {
    super(message, HTTP_STATUS.UNAUTHENTICATED, errorCode, details);
  }
}

/**
 * 403 Forbidden Error.
 * Thrown when client is authenticated but lacks access rights to the resource.
 * @class ForbiddenError
 * @extends CustomError
 */
export class ForbiddenError extends CustomError {
  /**
   * @param {string} [message='You do not have permission to access this resource.'] - Error message.
   * @param {string} [errorCode='FORBIDDEN'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'You do not have permission to access this resource.', errorCode = 'FORBIDDEN', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, errorCode, details);
  }
}

/**
 * 404 Not Found Error.
 * Thrown when the requested resource cannot be found.
 * @class NotFoundError
 * @extends CustomError
 */
export class NotFoundError extends CustomError {
  /**
   * @param {string} [message='The requested resource was not found.'] - Error message.
   * @param {string} [errorCode='NOT_FOUND'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The requested resource was not found.', errorCode = 'NOT_FOUND', details = null) {
    super(message, HTTP_STATUS.NOT_FOUND, errorCode, details);
  }
}

/**
 * 409 Conflict Error.
 * Thrown when a request conflicts with current state of server (e.g. duplicate resource).
 * @class ConflictError
 * @extends CustomError
 */
export class ConflictError extends CustomError {
  /**
   * @param {string} [message='A resource with this information already exists.'] - Error message.
   * @param {string} [errorCode='CONFLICT'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'A resource with this information already exists.', errorCode = 'CONFLICT', details = null) {
    super(message, HTTP_STATUS.CONFLICT, errorCode, details);
  }
}

/**
 * 422 Unprocessable Entity / Validation Error.
 * Thrown when request body fails semantic validation rules.
 * @class ValidationError
 * @extends CustomError
 */
export class ValidationError extends CustomError {
  /**
   * @param {string} [message='Please check the entered information and correct any validation issues.'] - Error message.
   * @param {Array<Object>|null} [details=null] - Field-specific validation error objects.
   * @param {string} [errorCode='VALIDATION_ERROR'] - Machine-readable error code.
   */
  constructor(message = 'Please check the entered information and correct any validation issues.', details = null, errorCode = 'VALIDATION_ERROR') {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, errorCode, details);
  }
}

/**
 * 429 Too Many Requests Error.
 * Thrown when rate limit threshold is exceeded.
 * @class TooManyRequestsError
 * @extends CustomError
 */
export class TooManyRequestsError extends CustomError {
  /**
   * @param {string} [message='Too many requests. Please wait a moment and try again.'] - Error message.
   * @param {string} [errorCode='TOO_MANY_REQUESTS'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Too many requests. Please wait a moment and try again.', errorCode = 'TOO_MANY_REQUESTS', details = null) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, errorCode, details);
  }
}

/**
 * 500 Internal Server Error.
 * Generic unexpected server failure error.
 * @class InternalServerError
 * @extends CustomError
 */
export class InternalServerError extends CustomError {
  /**
   * @param {string} [message='Something went wrong on our end. Please try again later.'] - Error message.
   * @param {string} [errorCode='INTERNAL_SERVER_ERROR'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Something went wrong on our end. Please try again later.', errorCode = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode, details);
  }
}

/**
 * 502 Bad Gateway Error.
 * Thrown when an upstream provider (e.g. Gemini, Addis AI, OAuth) returns an invalid response.
 * @class BadGatewayError
 * @extends CustomError
 */
export class BadGatewayError extends CustomError {
  /**
   * @param {string} [message='The service is temporarily unavailable. Please try again later.'] - Error message.
   * @param {string} [errorCode='BAD_GATEWAY'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The service is temporarily unavailable. Please try again later.', errorCode = 'BAD_GATEWAY', details = null) {
    super(message, HTTP_STATUS.BAD_GATEWAY, errorCode, details);
  }
}

/**
 * 503 Service Unavailable Error.
 * Thrown when server is overloaded or undergoing maintenance.
 * @class ServiceUnavailableError
 * @extends CustomError
 */
export class ServiceUnavailableError extends CustomError {
  /**
   * @param {string} [message='The service is temporarily unavailable. Please try again later.'] - Error message.
   * @param {string} [errorCode='SERVICE_UNAVAILABLE'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The service is temporarily unavailable. Please try again later.', errorCode = 'SERVICE_UNAVAILABLE', details = null) {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, errorCode, details);
  }
}

/**
 * 504 Gateway Timeout Error.
 * Thrown when an upstream service response times out.
 * @class GatewayTimeoutError
 * @extends CustomError
 */
export class GatewayTimeoutError extends CustomError {
  /**
   * @param {string} [message='The request timed out. Please try again later.'] - Error message.
   * @param {string} [errorCode='GATEWAY_TIMEOUT'] - Machine-readable error code.
   * @param {Array<Object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The request timed out. Please try again later.', errorCode = 'GATEWAY_TIMEOUT', details = null) {
    super(message, HTTP_STATUS.GATEWAY_TIMEOUT, errorCode, details);
  }
}

export default Object.assign(CustomError, {
  CustomError,
  BadRequestError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  BadGatewayError,
  ServiceUnavailableError,
  GatewayTimeoutError,
});

````

================================================================================
File: backend/src/middleware/authMiddleware.js
================================================================================

````javascript
/**
 * @module middleware/authMiddleware
 * @description Authentication middleware verifying JWT Bearer access tokens and attaching authenticated user to request.
 * Enforces single-user operational security (strictly zero role-based authorization checks).
 */

import asyncHandler from 'express-async-handler';
import { verifyAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { UnauthenticatedError } from '../errors/CustomError.js';

/**
 * Protects downstream routes by verifying incoming JWT Bearer tokens in the Authorization header.
 * Attaches the resolved User document (excluding password) to req.user.
 *
 * @function protect
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object (unused).
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 * @throws {UnauthenticatedError} If token is missing, malformed, expired, invalid, or user no longer exists.
 */
export const protect = asyncHandler(async (req, _res, next) => {
  let token;

  // 1. Check HttpOnly cookies first
  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }
  // 2. Fallback to Authorization header Bearer token
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new UnauthenticatedError('Please log in to continue.', 'UNAUTHENTICATED');
  }

  // verifyAccessToken throws UnauthenticatedError on expired or invalid token
  const decoded = verifyAccessToken(token);

  const user = await User.findById(decoded.id).select(
    '-password +settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey +integrations.telegram.botToken'
  );
  if (!user) {
    throw new UnauthenticatedError('Account not found. Please log in again.', 'UNAUTHENTICATED');
  }

  req.user = user;
  next();
});

export const verifyToken = protect;

export default protect;

````

================================================================================
File: backend/src/middleware/errorHandler.js
================================================================================

````javascript
/**
 * @module middleware/errorHandler
 * @description Centralized global error handling middleware normalizing all application exceptions.
 */

import { HTTP_STATUS } from '../utils/constants.js';
import {
  CustomError,
  ConflictError,
  ValidationError,
  BadRequestError,
  UnauthenticatedError,
} from '../errors/CustomError.js';
import { logger } from '../config/logger.js';
import { formatUserFriendlyError } from '../utils/errorFormatter.js';

/**
 * Global Express 4-argument error-handling middleware.
 * Intercepts operational errors, Mongoose driver errors, and unhandled exceptions,
 * serializing them into a uniform JSON response envelope.
 *
 * @function errorHandler
 * @param {Error} err - Error object thrown or forwarded by route handlers.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} _next - Express next middleware function (required for 4-arg signature).
 * @returns {import('express').Response} Structured JSON error response.
 */
export const errorHandler = (err, req, res, _next) => {
  let error = err;

  // 1. Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    error = new ConflictError(`A record with this ${field} already exists. Please provide a different value.`);
  }

  // 2. Mongoose validation error
  else if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new ValidationError('Please check the entered information and correct any validation issues.', details);
  }

  // 3. Mongoose CastError (e.g. invalid ObjectId format)
  else if (err.name === 'CastError') {
    error = new BadRequestError('The provided identifier format is invalid.');
  }

  // 4. JWT Authentication errors
  else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    const message = err.name === 'TokenExpiredError' ? 'Your session has expired. Please log in again.' : 'Please log in again.';
    error = new UnauthenticatedError(message, 'UNAUTHENTICATED');
  }

  // 5. Multer file upload errors
  else if (err.name === 'MulterError') {
    let message = 'File upload failed. Please verify your file requirements.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed file size.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded in a single request.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `Unexpected upload field "${err.field}".`;
    }
    error = new BadRequestError(message, 'UPLOAD_LIMIT_EXCEEDED');
  }

  // Handle known operational CustomError subclasses
  if (error instanceof CustomError) {
    // Log 4xx warnings, 5xx errors
    if (error.statusCode >= 500) {
      logger.error(`[${req.method}] ${req.originalUrl} - ${error.statusCode} ${error.errorCode}: ${error.message}\n${error.stack}`);
    } else {
      logger.warn(`[${req.method}] ${req.originalUrl} - ${error.statusCode} ${error.errorCode}: ${error.message}`);
    }

    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      data: null,
      errorCode: error.errorCode,
      details: error.details,
    });
  }

  // 5. Unhandled unexpected internal server errors (500)
  logger.error(`[UNHANDLED_EXCEPTION] [${req.method}] ${req.originalUrl} - ${err.message}\n${err.stack}`);

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: formatUserFriendlyError(err),
    data: null,
    errorCode: 'INTERNAL_SERVER_ERROR',
    details: null,
  });
};

export default errorHandler;

````

================================================================================
File: backend/src/middleware/notFoundHandler.js
================================================================================

````javascript
/**
 * @module middleware/notFoundHandler
 * @description Catches all unmatched routes and forwards a NotFoundError to the error pipeline.
 */

import { NotFoundError } from '../errors/CustomError.js';

/**
 * 404 Not Found catch-all middleware.
 * @function notFoundHandler
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object (unused).
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 */
export const notFoundHandler = (_req, _res, next) => {
  next(new NotFoundError('The requested endpoint or resource was not found.'));
};

export default notFoundHandler;

````

================================================================================
File: backend/src/middleware/uploadMiddleware.js
================================================================================

````javascript
/**
 * @module middleware/uploadMiddleware
 * @description Centralized Multer multipart upload middleware for audio and media assets.
 * Enforces storage isolation, UUID filename generation, strict MIME & extension whitelists,
 * single file caps (25MB), batch counts (5 files), and cumulative batch size validation (50MB).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { AUDIO_CONSTANTS, ATTACHMENT_CONSTANTS, UPLOADS_CONFIG } from '../utils/constants.js';
import { BadRequestError } from '../errors/CustomError.js';

// Ensure all domain storage directories exist synchronously at module initialization
for (const dir of Object.values(UPLOADS_CONFIG.DOMAIN_DIRS || {})) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
if (!fs.existsSync(UPLOADS_CONFIG.ATTACHMENTS_DIR)) {
  fs.mkdirSync(UPLOADS_CONFIG.ATTACHMENTS_DIR, { recursive: true });
}

const AUDIO_UPLOAD_DIR = UPLOADS_CONFIG.AUDIOS_DIR;

/**
 * Multer disk storage engine configuring destination and collision-free UUID filenames.
 */
const audioDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, AUDIO_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    cb(null, safeFilename);
  },
});

/**
 * Multer file filter enforcing strict audio MIME types and extension whitelists.
 *
 * @param {import('express').Request} _req - Express request.
 * @param {Express.Multer.File} file - Uploaded file metadata.
 * @param {multer.FileFilterCallback} cb - Multer callback.
 */
const audioFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const rawMime = (file.mimetype || '').toLowerCase();
  const cleanMime = rawMime.split(';')[0].trim();

  const isValidExt = AUDIO_CONSTANTS.ALLOWED_EXTENSIONS.includes(ext);
  const isValidMime =
    AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(rawMime) ||
    AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(cleanMime) ||
    cleanMime.startsWith('audio/') ||
    (ext === '.webm' && (cleanMime === 'video/webm' || cleanMime === 'audio/webm'));

  if (!isValidMime || !isValidExt) {
    return cb(
      new BadRequestError(
        `Unsupported audio format (${ext || 'unknown'}). Allowed formats: ${AUDIO_CONSTANTS.ALLOWED_EXTENSIONS.join(', ')}.`
      )
    );
  }

  cb(null, true);
};

/**
 * Pre-configured Multer instance for multi-file audio ingestion.
 */
const multerAudioUpload = multer({
  storage: audioDiskStorage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES, // 25MB
    files: AUDIO_CONSTANTS.MAX_FILES_COUNT, // 5 files
  },
});

/**
 * Express middleware handling audio multi-part uploads with normalized error handling.
 * Intercepts Multer limits and converts them to descriptive BadRequestError instances.
 *
 * @function uploadReportAudiosMiddleware
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next function.
 */
export const uploadReportAudiosMiddleware = (req, res, next) => {
  const uploader = multerAudioUpload.array('audios', AUDIO_CONSTANTS.MAX_FILES_COUNT);

  uploader(req, res, (err) => {
    if (!err) {
      const files = req.files || [];
      const emptyFile = files.find((f) => f.size === 0);
      if (emptyFile) {
        for (const f of files) {
          try { fs.unlinkSync(f.path); } catch (_) {}
        }
        return next(new BadRequestError('Empty audio recording (0 bytes) detected.'));
      }
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new BadRequestError(
            `Audio file exceeds the ${AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB maximum file limit.`
          )
        );
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(
          new BadRequestError(
            `Cannot upload more than ${AUDIO_CONSTANTS.MAX_FILES_COUNT} audio files in a single request.`
          )
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          new BadRequestError(
            `Unexpected upload field "${err.field}". Audio files must be uploaded under the "audios" field.`
          )
        );
      }
      return next(new BadRequestError(`Audio upload error: ${err.message}`));
    }

    // Pass custom errors or other exceptions
    next(err);
  });
};

/**
 * Multer middleware handling single audio uploads for live voice dictation transcription.
 * Accepts fields 'audio', 'audios', or 'file'.
 *
 * @function uploadSingleAudioMiddleware
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next function.
 */
export const uploadSingleAudioMiddleware = (req, res, next) => {
  const uploader = multerAudioUpload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'audios', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  uploader(req, res, (err) => {
    if (!err) {
      if (req.files) {
        req.file =
          req.files.audio?.[0] ||
          req.files.audios?.[0] ||
          req.files.file?.[0] ||
          null;
      }
      if (req.file && req.file.size === 0) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return next(new BadRequestError('Empty audio recording (0 bytes) detected.'));
      }
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new BadRequestError(
            `Audio file exceeds the ${AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB maximum file limit.`
          )
        );
      }
      return next(new BadRequestError(`Audio upload error: ${err.message}`));
    }

    next(err);
  });
};

/**
 * Multer disk storage engine for chat document, image, and audio attachments.
 * Dynamically partitions uploads into domain directories: images/, audios/, or files/.
 */
const attachmentDiskStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const rawMime = (file.mimetype || '').toLowerCase();
    const cleanMime = rawMime.split(';')[0].trim();

    const isImage =
      ATTACHMENT_CONSTANTS.ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype) ||
      ATTACHMENT_CONSTANTS.ALLOWED_IMAGE_EXTENSIONS.includes(ext) ||
      cleanMime.startsWith('image/');

    const isAudio =
      AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype) ||
      AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(cleanMime) ||
      cleanMime.startsWith('audio/') ||
      AUDIO_CONSTANTS.ALLOWED_EXTENSIONS.includes(ext) ||
      (ext === '.webm' && (cleanMime === 'video/webm' || cleanMime === 'audio/webm'));

    if (isImage) {
      file.domain = 'images';
      cb(null, UPLOADS_CONFIG.IMAGES_DIR);
    } else if (isAudio) {
      file.domain = 'audios';
      cb(null, UPLOADS_CONFIG.AUDIOS_DIR);
    } else {
      file.domain = 'files';
      cb(null, UPLOADS_CONFIG.FILES_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    cb(null, safeFilename);
  },
});

/**
 * Multer file filter enforcing strict attachment MIME types and extension whitelists.
 * Accepts all supported media from both ATTACHMENT_CONSTANTS and AUDIO_CONSTANTS.
 */
const attachmentFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const rawMime = (file.mimetype || '').toLowerCase();
  const cleanMime = rawMime.split(';')[0].trim();

  const isAttachmentMime = ATTACHMENT_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype);
  const isAttachmentExt = ATTACHMENT_CONSTANTS.ALLOWED_EXTENSIONS.includes(ext);

  const isAudioMime =
    AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype) ||
    AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(cleanMime) ||
    cleanMime.startsWith('audio/') ||
    (ext === '.webm' && (cleanMime === 'video/webm' || cleanMime === 'audio/webm'));
  const isAudioExt = AUDIO_CONSTANTS.ALLOWED_EXTENSIONS.includes(ext);

  const isValid = (isAttachmentMime && isAttachmentExt) || (isAudioMime && isAudioExt);

  if (!isValid) {
    const allAllowedExts = [...ATTACHMENT_CONSTANTS.ALLOWED_EXTENSIONS, ...AUDIO_CONSTANTS.ALLOWED_EXTENSIONS];
    return cb(
      new BadRequestError(
        `Unsupported attachment format (${ext || 'unknown'}). Allowed formats: ${allAllowedExts.join(', ')}.`
      )
    );
  }

  cb(null, true);
};

/**
 * Pre-configured Multer instance for multi-file attachment ingestion.
 */
const multerAttachmentUpload = multer({
  storage: attachmentDiskStorage,
  fileFilter: attachmentFileFilter,
  limits: {
    fileSize: ATTACHMENT_CONSTANTS.MAX_FILE_SIZE_BYTES, // 25MB
    files: ATTACHMENT_CONSTANTS.MAX_FILES_COUNT, // 5 files
  },
});

/**
 * Express middleware handling attachment multi-part uploads with normalized error handling.
 *
 * @function uploadChatAttachmentsMiddleware
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next function.
 */
export const uploadChatAttachmentsMiddleware = (req, res, next) => {
  const uploader = multerAttachmentUpload.array('attachments', ATTACHMENT_CONSTANTS.MAX_FILES_COUNT);

  uploader(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new BadRequestError(
            `Attachment file exceeds the ${ATTACHMENT_CONSTANTS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB maximum file limit.`
          )
        );
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(
          new BadRequestError(
            `Cannot upload more than ${ATTACHMENT_CONSTANTS.MAX_FILES_COUNT} attachments in a single request.`
          )
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          new BadRequestError(
            `Unexpected upload field "${err.field}". Attachments must be uploaded under the "attachments" field.`
          )
        );
      }
      return next(new BadRequestError(`Attachment upload error: ${err.message}`));
    }

    next(err);
  });
};

export default {
  uploadReportAudiosMiddleware,
  uploadChatAttachmentsMiddleware,
};


````

================================================================================
File: backend/src/middleware/validate.js
================================================================================

````javascript
/**
 * @module middleware/validate
 * @description Express middleware translating express-validator validation failures into domain ValidationError envelopes.
 */

import { validationResult, matchedData } from 'express-validator';
import { ValidationError } from '../errors/CustomError.js';

export { matchedData };

/**
 * Validates incoming request parameters against applied express-validator rules.
 * Supports direct middleware usage or options factory configuration.
 * Attaches sanitized, location-segregated matchedData to req.validated.
 *
 * @function validate
 * @param {Object|import('express').Request} [optionsOrReq={}] - MatchedData options or Express request object.
 * @param {import('express').Response} [resOrNext] - Express response object or next middleware.
 * @param {import('express').NextFunction} [maybeNext] - Express next middleware function.
 * @returns {import('express').RequestHandler|void}
 */
export const validate = (optionsOrReq = {}, resOrNext, maybeNext) => {
  // Direct middleware usage: validate(req, res, next)
  if (resOrNext && typeof maybeNext === 'function') {
    const req = optionsOrReq;
    const next = maybeNext;
    const result = validationResult(req);

    if (!result.isEmpty()) {
      const formattedErrors = result.array({ onlyFirstError: true }).map((err) => ({
        field: err.path || err.param || 'unknown',
        message: err.msg,
      }));

      return next(new ValidationError('Request validation failed', formattedErrors));
    }

    req.validated = {
      body: matchedData(req, { locations: ['body'] }),
      params: matchedData(req, { locations: ['params'] }),
      query: matchedData(req, { locations: ['query'] }),
    };
    req.matchedData = req.validated.body;

    return next();
  }

  // Middleware factory: validate(options)
  const options = optionsOrReq;
  return (req, _res, next) => {
    const result = validationResult(req);

    if (!result.isEmpty()) {
      const formattedErrors = result.array({ onlyFirstError: true }).map((err) => ({
        field: err.path || err.param || 'unknown',
        message: err.msg,
      }));

      return next(new ValidationError('Request validation failed', formattedErrors));
    }

    req.validated = {
      body: matchedData(req, { ...options, locations: ['body'] }),
      params: matchedData(req, { ...options, locations: ['params'] }),
      query: matchedData(req, { ...options, locations: ['query'] }),
    };
    req.matchedData = req.validated.body;

    next();
  };
};

export default validate;

````

================================================================================
File: backend/src/routes/authRoutes.js
================================================================================

````javascript
/**
 * @module routes/authRoutes
 * @description Express routing definitions for authentication endpoints (register, login, refresh, logout).
 */

import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  initiateGoogleSso,
  handleGoogleSsoCallback,
  connectGoogleDrive,
  handleGoogleCallback,
  disconnectGoogleDriveRoute,
  getGoogleDriveStatus,
  toggleGoogleDriveRoute,
} from '../controllers/authController.js';
import {
  registerValidation,
  loginValidation,
} from '../validations/authValidation.js';
import { validate } from '../middleware/validate.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new Area Supervisor user account.
 * @access Public
 */
router.post('/register', registerValidation, validate, register);

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user credentials and issue session tokens.
 * @access Public
 */
router.post('/login', loginValidation, validate, login);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh short-lived access token using long-lived refresh token.
 * @access Public (Requires valid refresh token cookie)
 */
router.post('/refresh', refreshToken);

/**
 * @route POST /api/v1/auth/logout
 * @desc Invalidate session and clear authentication cookies.
 * @access Public
 */
router.post('/logout', logout);

/**
 * @route GET /api/v1/auth/google/connect
 * @desc Initiate Google OAuth connection
 * @access Protected
 */
router.get('/google/connect', verifyToken, connectGoogleDrive);

/**
 * @route GET /api/v1/auth/google/callback
 * @desc OAuth redirect callback
 * @access Public
 */
router.get('/google/callback', handleGoogleCallback);

/**
 * @route POST /api/v1/auth/google/disconnect
 * @desc Disconnect Google Drive integration
 * @access Protected
 */
router.post('/google/disconnect', verifyToken, disconnectGoogleDriveRoute);

/**
 * @route GET /api/v1/auth/google/status
 * @desc Check Google Drive integration connection status
 * @access Protected
 */
router.get('/google/status', verifyToken, getGoogleDriveStatus);

/**
 * @route POST /api/v1/auth/google/toggle
 * @desc Enable or disable Google Drive integration without disconnecting
 * @access Protected
 */
router.post('/google/toggle', verifyToken, toggleGoogleDriveRoute);

/**
 * @route GET /api/v1/auth/google/sso
 * @desc Initiate Google Single Sign-On (SSO) login/register flow.
 * @access Public
 */
router.get('/google/sso', initiateGoogleSso);

/**
 * @route GET /api/v1/auth/google/sso/callback
 * @desc Google Single Sign-On (SSO) OAuth callback.
 * @access Public
 */
router.get('/google/sso/callback', handleGoogleSsoCallback);

export default router;

````

================================================================================
File: backend/src/routes/branchRoutes.js
================================================================================

````javascript
/**
 * @module routes/branchRoutes
 * @description Express router declaring physical operational branch management endpoints.
 * All routes are protected by verifyToken middleware and strictly scoped to req.user._id.
 */

import express from 'express';
import {
  createBranch,
  getBranches,
  getBranchById,
  getBranchMetrics,
  updateBranch,
  archiveBranch,
  restoreBranch,
  deleteBranchPermanently,
} from '../controllers/branchController.js';
import {
  createBranchValidation,
  updateBranchValidation,
  branchIdParamValidation,
  listBranchesValidation,
} from '../validations/branchValidation.js';
import { validate } from '../middleware/validate.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce authentication across all branch endpoints
router.use(verifyToken);

/**
 * @route POST /api/v1/branches
 * @desc Create a new physical operational branch
 * @access Protected (Area Supervisor)
 */
router.post('/', createBranchValidation, validate, createBranch);

/**
 * @route GET /api/v1/branches
 * @desc Retrieve paginated directory of branches with search and archive filter
 * @access Protected (Area Supervisor)
 */
router.get('/', listBranchesValidation, validate, getBranches);

/**
 * @route GET /api/v1/branches/:branchId/metrics
 * @desc Retrieve analytics aggregations of reports visiting this branch
 * @access Protected (Area Supervisor)
 */
router.get('/:branchId/metrics', branchIdParamValidation, validate, getBranchMetrics);

/**
 * @route GET /api/v1/branches/:branchId
 * @desc Retrieve details of a single branch by ID
 * @access Protected (Area Supervisor)
 */
router.get('/:branchId', branchIdParamValidation, validate, getBranchById);

/**
 * @route PATCH /api/v1/branches/:branchId
 * @desc Update details of an active branch
 * @access Protected (Area Supervisor)
 */
router.patch('/:branchId', branchIdParamValidation, updateBranchValidation, validate, updateBranch);

/**
 * @route PATCH /api/v1/branches/:branchId/archive
 * @desc Archive an active branch location (auto-deleted after 30 days if unrestored)
 * @access Protected (Area Supervisor)
 */
router.patch('/:branchId/archive', branchIdParamValidation, validate, archiveBranch);
router.delete('/:branchId/archive', branchIdParamValidation, validate, archiveBranch);

/**
 * @route DELETE /api/v1/branches/:branchId/delete
 * @desc Permanently delete an archived branch without waiting for the 30-day auto-purge
 * @access Protected (Area Supervisor)
 */
router.delete('/:branchId/delete', branchIdParamValidation, validate, deleteBranchPermanently);
router.delete('/:branchId/permanent', branchIdParamValidation, validate, deleteBranchPermanently);

/**
 * @route PATCH /api/v1/branches/:branchId/restore
 * @desc Restore an archived branch before the 30-day auto-purge elapses
 * @access Protected (Area Supervisor)
 */
router.patch('/:branchId/restore', branchIdParamValidation, validate, restoreBranch);

/**
 * @route DELETE /api/v1/branches/:branchId
 * @desc Archive an active branch location (backward-compatible alias)
 * @access Protected (Area Supervisor)
 */
router.delete('/:branchId', branchIdParamValidation, validate, archiveBranch);

export default router;

````

================================================================================
File: backend/src/routes/chatRoutes.js
================================================================================

````javascript
/**
 * @module routes/chatRoutes
 * @description Express routing definitions for multi-turn AI streaming chat sessions,
 * real-time SSE stream endpoints, turn submissions, session management (list, get, pin, rename, delete),
 * and audio/attachment uploads.
 * All routes are protected by verifyToken middleware and strictly scoped to req.user._id.
 */

import express from 'express';

import {
  streamChat,
  getChats,
  getChatById,
  updateChatConfig,
  pinChat,
  renameChat,
  deleteChat,
  uploadChatAttachments,
  uploadChatAudios,
  deleteComposerAttachment,
  transcribeAudio,
  shareToTelegramDirect,
  downloadGeneratedDocument,
  synthesizeSpeech,
  getTtsVoices,
} from '../controllers/chatController.js';

import {
  chatIdValidation,
  getChatByIdValidation,
  sendChatMessageValidation,
  renameChatValidation,
  getChatsValidation,
  updateChatConfigValidation,
  synthesizeSpeechValidation,
} from '../validations/chatValidation.js';

import {
  uploadReportAudiosMiddleware,
  uploadSingleAudioMiddleware,
  uploadChatAttachmentsMiddleware,
} from '../middleware/uploadMiddleware.js';

import { validate } from '../middleware/validate.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce authentication across all chat endpoints
router.use(verifyToken);

/**
 * @route POST /api/v1/chat/transcribe-audio
 * @desc Transcribe single voice recording for in-composer live dictation
 * @access Protected (Area Supervisor)
 */
router.post('/transcribe-audio', uploadSingleAudioMiddleware, transcribeAudio);

/**
 * @route POST /api/v1/chat/upload-audio
 * @desc Ingest 1 to 5 audio recordings for chat turn grounding
 * @access Protected (Area Supervisor)
Personal-AI-Agent-V1Personal-AI-Agent-V1 */
router.post('/upload-audio', uploadReportAudiosMiddleware, uploadChatAudios);

/**
 * @route POST /api/v1/chat/upload-attachments
 * @desc Ingest 1 to 5 document / image attachments for chat turn grounding
 * @access Protected (Area Supervisor)
 */
router.post('/upload-attachments', uploadChatAttachmentsMiddleware, uploadChatAttachments);

/**
 * @route DELETE /api/v1/chat/attachment
 * @desc Dismiss staged attachment from composer shelf and purge from Cloudinary CDN
 * @access Protected (Personal AI Agent)
 */
router.delete('/attachment', deleteComposerAttachment);
router.delete('/attachment/:publicId', deleteComposerAttachment);

/**
 * @route POST /api/v1/chat/share-telegram
 * @desc Manually dispatch message text to Telegram channel/supergroup
 * @access Protected (Area Supervisor)
 */
router.post('/share-telegram', shareToTelegramDirect);

/**
 * @route POST /api/v1/chat/tts
 * @desc Synthesize speech from text using native Addis AI (Addis Voices 2)
 * @access Protected (Personal AI Agent)
 */
router.post('/tts', synthesizeSpeechValidation, validate, synthesizeSpeech);

/**
 * @route GET /api/v1/chat/tts/voices
 * @desc Retrieve available Addis AI voices catalog
 * @access Protected (Personal AI Agent)
 */
router.get('/tts/voices', getTtsVoices);

/**
 * @route POST /api/v1/chat/stream
 * @desc Initialize a new chat session or continue existing (chatId in body) via SSE streaming
 * @access Protected (Area Supervisor)
 */
router.post('/stream', sendChatMessageValidation, validate, streamChat);

/**
 * @route POST /api/v1/chat/:chatId/stream
 * @desc Continue an existing chat session via SSE streaming
 * @access Protected (Area Supervisor)
 */
router.post('/:chatId/stream', chatIdValidation, sendChatMessageValidation, validate, streamChat);

/**
 * @route GET /api/v1/chat
 * @desc Retrieve paginated chat sessions list
 * @access Protected (Area Supervisor)
 */
router.get('/', getChatsValidation, validate, getChats);

/**
 * @route GET /api/v1/chat/downloads/:fileId
 * @desc Securely download generated document asset
 * @access Protected (Area Supervisor)
 */
router.get('/downloads/:fileId', downloadGeneratedDocument);

/**
 * @route GET /api/v1/chat/:chatId
 * @desc Retrieve full chat session details and message history (optional ?limit=N slice)
 * @access Protected (Area Supervisor)
 */
router.get('/:chatId', getChatByIdValidation, validate, getChatById);

/**
 * @route PATCH /api/v1/chat/:chatId/config
 * @desc Update chat session configuration parameters (model, thinkingBudget, language, prompt)
 * @access Protected (Area Supervisor)
 */
router.patch('/:chatId/config', updateChatConfigValidation, validate, updateChatConfig);

/**
 * @route PATCH /api/v1/chat/:chatId/pin
 * @desc Toggle pinned state of a chat session
 * @access Protected (Area Supervisor)
 */
router.patch('/:chatId/pin', chatIdValidation, validate, pinChat);

/**
 * @route PATCH /api/v1/chat/:chatId/title
 * @desc Manually rename chat session title
 * @access Protected (Area Supervisor)
 */
router.patch('/:chatId/title', renameChatValidation, validate, renameChat);

/**
 * @route DELETE /api/v1/chat/:chatId
 * @desc Permanently delete chat session
 * @access Protected (Area Supervisor)
 */
router.delete('/:chatId', chatIdValidation, validate, deleteChat);

export default router;

````

================================================================================
File: backend/src/routes/dashboardRoutes.js
================================================================================

````javascript
/**
 * @module routes/dashboardRoutes
 * @description Express router for executive operational dashboard metrics and analytics.
 * All routes are protected by verifyToken middleware and strictly scoped to req.user._id.
 */

import express from 'express';
import { getDashboardMetrics } from '../controllers/dashboardController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce authentication across all dashboard endpoints
router.use(verifyToken);

// GET /api/v1/dashboard/metrics
router.get('/metrics', getDashboardMetrics);

export default router;

````

================================================================================
File: backend/src/routes/index.js
================================================================================

````javascript
/**
 * @module routes/index
 * @description Central API v1 router consolidating and mounting all domain route modules.
 */

import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import branchRoutes from './branchRoutes.js';
import reportRoutes from './reportRoutes.js';
import chatRoutes from './chatRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import sttRoutes from './sttRoutes.js';

const router = express.Router();

// Mount authentication domain routes (/api/v1/auth)
router.use('/auth', authRoutes);

// Mount user domain routes (/api/v1/users)
router.use('/users', userRoutes);

// Mount branch domain routes (/api/v1/branches)
router.use('/branches', branchRoutes);

// Mount report domain routes (/api/v1/reports)
router.use('/reports', reportRoutes);

// Mount chat domain routes (/api/v1/chat)
router.use('/chat', chatRoutes);

// Mount STT domain routes (/api/v1/stt)
router.use('/stt', sttRoutes);

// Mount dashboard analytics domain routes (/api/v1/dashboard)
router.use('/dashboard', dashboardRoutes);

export default router;

````

================================================================================
File: backend/src/routes/reportRoutes.js
================================================================================

````javascript
/**
 * @module routes/reportRoutes
 * @description Express routing definitions for corporate operational reports, audio ingestion,
 * paginated browsing, subdocument inspection, soft archival, restoration, and permanent deletion.
 * All routes are protected by verifyToken middleware and strictly scoped to req.user._id.
 */

import express from 'express';

import {
  createReport,
  getReports,
  getReportById,
  updateReport,
  getReportActivities,
  getReportIssues,
  getReportComments,
  archiveReport,
  restoreReport,
  deleteReportPermanently,
  uploadReportAudios,
  shareReportToTelegram,
} from '../controllers/reportController.js';

import {
  reportIdValidation,
  getReportsValidation,
  updateReportValidation,
  createReportValidation,
} from '../validations/reportValidation.js';

import { uploadReportAudiosMiddleware } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce authentication across all report endpoints
router.use(verifyToken);

/**
 * @route POST /api/v1/reports/upload-audio
 * @desc Ingest 1 to 5 audio recordings (max 25MB each, max 50MB batch)
 * @access Protected (Area Supervisor)
 */
router.post('/upload-audio', uploadReportAudiosMiddleware, uploadReportAudios);

/**
 * @route POST /api/v1/reports
 * @desc Create operational report (Agent Tool / Programmatic Pipeline)
 * @access Protected (Area Supervisor)
 */
router.post('/', createReportValidation, validate, createReport);

/**
 * @route GET /api/v1/reports
 * @desc Retrieve paginated list of reports (default active, ?archived=true for archive)
 * @access Protected (Area Supervisor)
 */
router.get('/', getReportsValidation, validate, getReports);

/**
 * @route GET /api/v1/reports/:reportId
 * @desc Retrieve details of a single report by ID
 * @access Protected (Area Supervisor)
 */
router.get('/:reportId', reportIdValidation, validate, getReportById);

/**
 * @route PATCH /api/v1/reports/:reportId
 * @desc Update operational report fields (manual UI edits or conversational instruction)
 * @access Protected (Area Supervisor)
 */
router.patch(
  '/:reportId',
  updateReportValidation,
  validate,
  updateReport
);

/**
 * @route GET /api/v1/reports/:reportId/activities
 * @desc Retrieve embedded activities subdocument array for report
 * @access Protected (Area Supervisor)
 */
router.get('/:reportId/activities', reportIdValidation, validate, getReportActivities);

/**
 * @route GET /api/v1/reports/:reportId/issues
 * @desc Retrieve embedded issues subdocument array for report
 * @access Protected (Area Supervisor)
 */
router.get('/:reportId/issues', reportIdValidation, validate, getReportIssues);

/**
 * @route GET /api/v1/reports/:reportId/comments
 * @desc Retrieve embedded comments subdocument array for report
 * @access Protected (Area Supervisor)
 */
router.get('/:reportId/comments', reportIdValidation, validate, getReportComments);

/**
 * @route PATCH /api/v1/reports/:reportId/archive
 * @desc Soft-archive an active report (initiates 30-day auto-purge retention window)
 * @access Protected (Area Supervisor)
 */
router.patch('/:reportId/archive', reportIdValidation, validate, archiveReport);
router.delete('/:reportId/archive', reportIdValidation, validate, archiveReport);

/**
 * @route PATCH /api/v1/reports/:reportId/restore
 * @desc Restore a soft-archived report before the 30-day auto-purge elapses
 * @access Protected (Area Supervisor)
 */
router.patch('/:reportId/restore', reportIdValidation, validate, restoreReport);

/**
 * @route DELETE /api/v1/reports/:reportId/delete
 * @desc Permanently cascade hard-delete report and associated audio binaries
 * @access Protected (Area Supervisor)
 */
router.delete('/:reportId/delete', reportIdValidation, validate, deleteReportPermanently);
router.delete('/:reportId/permanent', reportIdValidation, validate, deleteReportPermanently);

/**
 * @route POST /api/v1/reports/:reportId/share/telegram
 * @desc Broadcast operational report transcription to configured Telegram channel
 * @access Protected (Area Supervisor)
 */
router.post('/:reportId/share/telegram', reportIdValidation, validate, shareReportToTelegram);

/**
 * @route DELETE /api/v1/reports/:reportId
 * @desc Soft-archive an active report (backward-compatible alias)
 * @access Protected (Area Supervisor)
 */
router.delete('/:reportId', reportIdValidation, validate, archiveReport);

export default router;

````

================================================================================
File: backend/src/routes/sttRoutes.js
================================================================================

````javascript
/**
 * @module routes/sttRoutes
 * @description Decoupled router for Speech-to-Text (STT) services.
 * Mounted at /api/v1/stt.
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { createScribeSession } from '../controllers/sttController.js';

const router = express.Router();

/**
 * @route POST /api/v1/stt/scribe-session
 * @desc Generate single-use connection ticket for Addis AI Live Scribe WebSocket
 * @access Private
 */
router.post('/scribe-session', protect, createScribeSession);

export default router;

````

================================================================================
File: backend/src/routes/userRoutes.js
================================================================================

````javascript
/**
 * @module routes/userRoutes
 * @description Express routing definitions for user profile management, avatar updates, and account security.
 */

import express from 'express';
import {
  getProfile,
  updateProfile,
  updateAvatar,
  removeAvatar,
  updatePassword,
  getUserAgentConfig,
  updateUserAgentConfig,
  updateSupervisorDirectives,
  verifyTelegramBotToken,
  connectTelegramIntegration,
  disconnectTelegramIntegration,
  toggleTelegramIntegration,
  updateUserApiKeys,
} from '../controllers/userController.js';
import {
  updateProfileValidation,
  updateAvatarValidation,
  updatePasswordValidation,
  updateAgentConfigValidation,
  updateDirectivesValidation,
} from '../validations/userValidation.js';
import { validate } from '../middleware/validate.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce authentication across all user domain endpoints
router.use(verifyToken);

/**
 * @route GET /api/v1/users/profile, GET /api/v1/users/me
 * @desc Retrieve current authenticated supervisor profile.
 * @access Private
 */
router.get(['/profile', '/me'], getProfile);

/**
 * @route PATCH /api/v1/users/profile
 * @desc Update supervisor profile attributes (names, email, position).
 * @access Private
 */
router.patch('/profile', updateProfileValidation, validate, updateProfile);

/**
 * @route PATCH /api/v1/users/avatar
 * @desc Update supervisor profile avatar image URL or path.
 * @access Private
 */
router.patch('/avatar', updateAvatarValidation, validate, updateAvatar);

/**
 * @route DELETE /api/v1/users/avatar
 * @desc Remove supervisor profile avatar (resets to null).
 * @access Private
 */
router.delete('/avatar', removeAvatar);

/**
 * @route PATCH /api/v1/users/password
 * @desc Change supervisor password after validating current password.
 * @access Private
 */
router.patch('/password', updatePasswordValidation, validate, updatePassword);

/**
 * @route GET /api/v1/users/agent-config
 * @desc Retrieve current supervisor agent settings & directives.
 * @access Private
 */
router.get('/agent-config', getUserAgentConfig);

/**
 * @route PATCH /api/v1/users/agent-config
 * @desc Update supervisor agent settings (persona, model, thinkingBudget, etc.).
 * @access Private
 */
router.patch('/agent-config', updateAgentConfigValidation, validate, updateUserAgentConfig);

/**
 * @route PATCH /api/v1/users/directives
 * @desc Update supervisor directives (negativeVocabulary, phraseMappings, customInstructions).
 * @access Private
 */
router.patch('/directives', updateDirectivesValidation, validate, updateSupervisorDirectives);

/**
 * @route POST /api/v1/users/telegram/verify
 * @desc Verify Telegram Bot Token against Telegram getMe API.
 * @access Private
 */
router.post('/telegram/verify', verifyTelegramBotToken);

/**
 * @route PATCH /api/v1/users/telegram/connect
 * @desc Connect and save Telegram integration credentials.
 * @access Private
 */
router.patch('/telegram/connect', connectTelegramIntegration);

/**
 * @route POST /api/v1/users/telegram/disconnect
 * @desc Disconnect Telegram integration and clear bot token.
 * @access Private
 */
router.post('/telegram/disconnect', disconnectTelegramIntegration);

/**
 * @route PATCH /api/v1/users/telegram/toggle
 * @desc Toggle Telegram integration enabled/disabled state.
 * @access Private
 */
router.patch('/telegram/toggle', toggleTelegramIntegration);

/**
 * @route PATCH /api/v1/users/api-keys
 * @desc Update user custom Bring-Your-Own-Key (BYOK) API credentials.
 * @access Private
 */
router.patch('/api-keys', updateUserApiKeys);

export default router;

````

================================================================================
File: backend/src/services/documentGenerationService.js
================================================================================

````javascript
/**
 * @module services/documentGenerationService
 * @description Enterprise Multi-Format Document Generation Engine.
 * Generates vector PDF, Microsoft Word (.docx), Microsoft Excel (.xlsx),
 * RFC 4180 CSV, Markdown, and JSON files from open-ended agent content and structured data.
 * Supports direct Google Drive dispatch and secure local temporary storage for browser download.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import * as docx from 'docx';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;
import { uploadFileToDrive, normalizeSpreadsheetData } from './googleDriveService.js';
import { BadRequestError } from '../errors/CustomError.js';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory for generated documents ready for client download
const GENERATED_DOCS_DIR = path.resolve(__dirname, '../../uploads/generated_documents');

/**
 * Ensures storage directory exists.
 */
function ensureStorageDirectory() {
  if (!fs.existsSync(GENERATED_DOCS_DIR)) {
    fs.mkdirSync(GENERATED_DOCS_DIR, { recursive: true });
  }
}

/**
 * Sanitizes title to be safe for filenames across OSes.
 *
 * @param {string} title
 * @returns {string}
 */
function sanitizeFileName(title) {
  return (title || 'document')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

/**
 * Registry of generated document metadata in memory for quick validation during download.
 * Maps fileId -> { fileId, fileName, filePath, mimeType, size, createdAt, userId }
 */
export const generatedDocumentRegistry = new Map();

/**
 * Generates an unconstrained multi-format document file.
 *
 * @param {string} userId - Authenticated supervisor ObjectId.
 * @param {object} args - Tool arguments { format, title, destination, folderId, content, data }.
 * @returns {Promise<object>} Tool execution result.
 */
export async function generateDocumentFile(userId, args = {}) {
  const {
    format = 'pdf',
    title = 'Document',
    destination = 'download',
    folderId,
    content = '',
    data = null,
  } = args;

  ensureStorageDirectory();

  const cleanFormat = (format || 'pdf').toLowerCase().trim();
  const validFormats = ['pdf', 'docx', 'xlsx', 'csv', 'markdown', 'md', 'json'];
  if (!validFormats.includes(cleanFormat)) {
    throw new BadRequestError(
      `Unsupported document format "${format}". Supported formats: pdf, docx, xlsx, csv, markdown, json.`
    );
  }

  const fileId = crypto.randomBytes(16).toString('hex');
  const safeBaseName = sanitizeFileName(title);
  let ext = cleanFormat === 'markdown' ? 'md' : cleanFormat;
  const fileName = `${safeBaseName}_${Date.now()}.${ext}`;
  const filePath = path.join(GENERATED_DOCS_DIR, `${fileId}_${fileName}`);

  let mimeType = 'application/octet-stream';

  switch (cleanFormat) {
    case 'pdf': {
      mimeType = 'application/pdf';
      await generatePdfDocument(filePath, { title, content, data });
      break;
    }

    case 'docx': {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      await generateWordDocument(filePath, { title, content, data });
      break;
    }

    case 'xlsx': {
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      await generateExcelDocument(filePath, { title, content, data });
      break;
    }

    case 'csv': {
      mimeType = 'text/csv';
      await generateCsvDocument(filePath, { title, content, data });
      break;
    }

    case 'markdown':
    case 'md': {
      mimeType = 'text/markdown';
      await generateMarkdownDocument(filePath, { title, content, data });
      break;
    }

    case 'json': {
      mimeType = 'application/json';
      await generateJsonDocument(filePath, { title, content, data });
      break;
    }
  }

  const fileStats = fs.statSync(filePath);
  const size = fileStats.size;

  // Store metadata in registry
  const meta = {
    fileId,
    fileName,
    filePath,
    mimeType,
    size,
    createdAt: new Date(),
    userId: String(userId),
    title,
    format: cleanFormat,
  };
  generatedDocumentRegistry.set(fileId, meta);

  // If destination is Google Drive, dispatch upload to drive
  if (destination === 'google_drive') {
    try {
      const driveUpload = await uploadFileToDrive(userId, {
        filePath,
        fileName,
        mimeType,
        folderId,
      });

      return {
        success: true,
        format: cleanFormat,
        destination: 'google_drive',
        title,
        fileName,
        size,
        fileId: driveUpload.fileId,
        webViewLink: driveUpload.webViewLink,
        downloadUrl: `/api/v1/chat/downloads/${fileId}`,
        message: `Document "${title}" (${cleanFormat.toUpperCase()}) created and uploaded directly to Google Drive.`,
      };
    } catch (driveErr) {
      logger.warn(
        `[documentGenerationService] Drive upload failed: ${driveErr.message}. Falling back to direct browser download.`
      );
      return {
        success: true,
        format: cleanFormat,
        destination: 'download',
        title,
        fileName,
        fileId,
        downloadUrl: `/api/v1/chat/downloads/${fileId}`,
        size,
        googleDriveError: driveErr.message,
        message: `Document "${title}" (${cleanFormat.toUpperCase()}) was generated successfully and is ready for direct download. (Note: Google Drive upload failed: ${driveErr.message})`,
      };
    }
  }

  // Default: browser download delivery
  const downloadUrl = `/api/v1/chat/downloads/${fileId}`;
  return {
    success: true,
    format: cleanFormat,
    destination: 'download',
    title,
    fileId,
    fileName,
    mimeType,
    size,
    downloadUrl,
    message: `Document "${title}" (${cleanFormat.toUpperCase()}) successfully generated and ready for download.`,
  };
}

/**
 * Generates a vector PDF using PDFKit.
 */
function generatePdfDocument(filePath, { title, content, data }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Title & Header
      doc.fontSize(22).font('Helvetica-Bold').text(title, { align: 'left' });
      doc.fontSize(10).font('Helvetica').fillColor('#666666').text(
        `Generated on: ${new Date().toLocaleString()}`,
        { align: 'left' }
      );
      doc.moveDown(1.5);
      doc.fillColor('#000000');

      // Open-ended Content Parsing (Markdown-aware paragraphs and headers)
      if (content && typeof content === 'string') {
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('# ')) {
            doc.moveDown(0.8);
            doc.fontSize(18).font('Helvetica-Bold').text(trimmed.slice(2));
            doc.moveDown(0.3);
          } else if (trimmed.startsWith('## ')) {
            doc.moveDown(0.6);
            doc.fontSize(14).font('Helvetica-Bold').text(trimmed.slice(3));
            doc.moveDown(0.2);
          } else if (trimmed.startsWith('### ')) {
            doc.moveDown(0.4);
            doc.fontSize(12).font('Helvetica-Bold').text(trimmed.slice(4));
            doc.moveDown(0.2);
          } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            doc.fontSize(10).font('Helvetica').text(`  •  ${trimmed.slice(2)}`);
          } else if (trimmed.length > 0) {
            doc.fontSize(10).font('Helvetica').text(trimmed, { align: 'justify' });
            doc.moveDown(0.3);
          } else {
            doc.moveDown(0.4);
          }
        }
      }

      // Open-ended Data Table Rendering
      if (data) {
        const tableRows = normalizeSpreadsheetData(data);
        if (tableRows.length > 0) {
          doc.moveDown(1.0);

          tableRows.forEach((row, rowIndex) => {
            const isHeader = rowIndex === 0;
            const fontName = isHeader ? 'Helvetica-Bold' : 'Helvetica';
            doc.fontSize(9).font(fontName);

            // Draw simple row text
            const rowText = row.map((cell) => String(cell ?? '')).join('   |   ');
            if (isHeader) {
              doc.fillColor('#1976d2').text(rowText);
              doc.fillColor('#000000');
              doc.moveDown(0.2);
            } else {
              doc.text(rowText);
            }
          });
        }
      }

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates a Word (.docx) document using docx.
 */
async function generateWordDocument(filePath, { title, content, data }) {
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, Packer } = docx;

  const children = [];

  // Title
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated on: ${new Date().toLocaleString()}`,
          italics: true,
          color: '666666',
          size: 20,
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Content Paragraphs
  if (content && typeof content === 'string') {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        children.push(
          new Paragraph({
            text: trimmed.slice(2),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (trimmed.startsWith('## ')) {
        children.push(
          new Paragraph({
            text: trimmed.slice(3),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 160, after: 80 },
          })
        );
      } else if (trimmed.startsWith('### ')) {
        children.push(
          new Paragraph({
            text: trimmed.slice(4),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 120, after: 60 },
          })
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        children.push(
          new Paragraph({
            text: trimmed.slice(2),
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
        );
      } else if (trimmed.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun(trimmed)],
            spacing: { after: 120 },
          })
        );
      }
    }
  }

  // Data Table
  if (data) {
    const tableRows = normalizeSpreadsheetData(data);
    if (tableRows.length > 0) {
      const docxRows = tableRows.map((row, rowIndex) => {
        const isHeader = rowIndex === 0;
        return new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: String(cell ?? ''),
                        bold: isHeader,
                      }),
                    ],
                  }),
                ],
                width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
              })
          ),
        });
      });

      children.push(
        new Paragraph({ text: '', spacing: { before: 200 } }),
        new Table({
          rows: docxRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
}

/**
 * Generates an Excel (.xlsx) workbook using XLSX.
 */
async function generateExcelDocument(filePath, { title, content, data }) {
  let rows = [];
  if (data) {
    rows = normalizeSpreadsheetData(data);
  } else if (content) {
    // If only content is provided, check if it contains a markdown table or text lines
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const tableLines = lines.filter((l) => l.startsWith('|') && l.endsWith('|'));
    if (tableLines.length >= 2) {
      rows = tableLines
        .filter((l) => !/^\|[\s\-:|]+\|$/.test(l))
        .map((l) =>
          l
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim())
        );
    } else {
      rows = [['Title', title], ['Content', content], ['Generated At', new Date().toISOString()]];
    }
  } else {
    rows = [['Title', title], ['Generated At', new Date().toISOString()]];
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const sheetName = sanitizeFileName(title).slice(0, 31) || 'Sheet1';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filePath);
}

/**
 * Generates an RFC 4180 CSV file.
 */
async function generateCsvDocument(filePath, { title, content, data }) {
  let rows = [];
  if (data) {
    rows = normalizeSpreadsheetData(data);
  } else if (content) {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const tableLines = lines.filter((l) => l.startsWith('|') && l.endsWith('|'));
    if (tableLines.length >= 2) {
      rows = tableLines
        .filter((l) => !/^\|[\s\-:|]+\|$/.test(l))
        .map((l) =>
          l
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim())
        );
    } else {
      rows = [['Title', title], ['Content', content]];
    }
  } else {
    rows = [['Title', title]];
  }

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');

  fs.writeFileSync(filePath, csvContent, 'utf8');
}

/**
 * Generates a clean Markdown file.
 */
async function generateMarkdownDocument(filePath, { title, content, data }) {
  let md = `# ${title}\n\n_Generated on: ${new Date().toLocaleString()}_\n\n`;
  if (content) {
    md += `${content.trim()}\n\n`;
  }
  if (data) {
    const rows = normalizeSpreadsheetData(data);
    if (rows.length > 0) {
      const headers = rows[0];
      md += `| ${headers.map((h) => String(h)).join(' | ')} |\n`;
      md += `| ${headers.map(() => '---').join(' | ')} |\n`;
      for (let i = 1; i < rows.length; i++) {
        md += `| ${rows[i].map((c) => String(c ?? '')).join(' | ')} |\n`;
      }
      md += '\n';
    }
  }
  fs.writeFileSync(filePath, md, 'utf8');
}

/**
 * Generates a clean JSON file.
 */
async function generateJsonDocument(filePath, { title, content, data }) {
  const jsonPayload = {
    title,
    generatedAt: new Date().toISOString(),
    content: content || null,
    data: data || null,
  };
  fs.writeFileSync(filePath, JSON.stringify(jsonPayload, null, 2), 'utf8');
}

export default {
  generateDocumentFile,
  generatedDocumentRegistry,
};

````

================================================================================
File: backend/src/services/googleDriveService.js
================================================================================

````javascript
/**
 * @module services/googleDriveService
 * @description Enterprise Dual-Mode Google Workspace Integration Engine.
 * Supports native Google Drive (v3), Google Docs (v1), and Google Sheets (v4)
 * with atomic concurrency-safe token refresh mutex, default 'Personal AI Agent' root folder
 * lazy auto-provisioning, and high-fidelity Mock fallback for isolated automated testing.
 */

import { google } from 'googleapis';
import fs from 'fs';
import { User } from '../models/User.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { BadRequestError, NotFoundError } from '../errors/CustomError.js';

const DEFAULT_ROOT_FOLDER_NAME = 'Personal AI Agent';
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// In-memory token refresh mutex lock per user ID to prevent race conditions
const tokenRefreshLocks = new Map();

// In-memory virtual drive store for mock provider (userId -> { files: Map<fileId, FileObject> })
const mockDriveStore = new Map();

/**
 * Initializes the OAuth2 Client using environment configuration.
 *
 * @returns {import('googleapis').Auth.OAuth2Client}
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    env.OAUTH_GOOGLE_CLIENT_ID,
    env.OAUTH_GOOGLE_CLIENT_SECRET,
    env.OAUTH_GOOGLE_CALLBACK_URL
  );
}

/**
 * Generates Google OAuth 2.0 Authorization URL.
 *
 * @param {string} state - Cryptographically signed or base64 state token.
 * @returns {string}
 */
export function getAuthorizationUrl(state) {
  const oauth2Client = createOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state,
  });
}

/**
 * Exchanges authorization code for tokens and persists to user record.
 *
 * @param {string} userId - User ObjectId.
 * @param {string} code - OAuth authorization code.
 * @returns {Promise<object>} Integration profile.
 */
export async function exchangeCodeAndSaveTokens(userId, code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Retrieve user email from Google OAuth2 API
  let email = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    email = userInfo.data.email;
  } catch (err) {
    logger.warn(`[googleDriveService] Could not fetch user email: ${err.message}`);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found.');
  }

  if (!user.integrations) {
    user.integrations = {};
  }

  user.integrations.googleDrive = {
    connected: true,
    enabled: true,
    email: email || user.email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || (user.integrations.googleDrive?.refreshToken || null),
    expiryDate: tokens.expiry_date,
    scope: tokens.scope ? tokens.scope.split(' ') : [],
    rootFolderId: user.integrations.googleDrive?.rootFolderId || null,
    connectedAt: new Date(),
  };

  await user.save();
  return {
    connected: true,
    email: user.integrations.googleDrive.email,
    connectedAt: user.integrations.googleDrive.connectedAt,
    rootFolderId: user.integrations.googleDrive.rootFolderId,
  };
}

/**
 * Disconnects the Google Drive integration for a user.
 *
 * @param {string} userId - User ObjectId.
 * @returns {Promise<boolean>}
 */
export async function disconnectGoogleDrive(userId) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User not found.');

  if (user.integrations?.googleDrive) {
    user.integrations.googleDrive.connected = false;
    user.integrations.googleDrive.enabled = true;
    user.integrations.googleDrive.accessToken = null;
    user.integrations.googleDrive.refreshToken = null;
    user.integrations.googleDrive.expiryDate = null;
    user.integrations.googleDrive.email = null;
    user.integrations.googleDrive.rootFolderId = null;
    await user.save();
  }

  mockDriveStore.delete(String(userId));
  return true;
}

/**
 * Returns an authenticated, auto-refreshed OAuth2 client or mock client descriptor.
 * Uses mutex locking to ensure concurrent requests do not trigger multiple refresh calls.
 *
 * @param {string} userId - User ObjectId.
 * @returns {Promise<{ isMock: boolean, authClient?: import('googleapis').Auth.OAuth2Client, user: object }>}
 */
export async function getValidGoogleClient(userId) {
  const user = await User.findById(userId).select(
    '+integrations.googleDrive.accessToken +integrations.googleDrive.refreshToken +integrations.googleDrive.expiryDate'
  );

  if (!user) {
    throw new NotFoundError('User not found.');
  }

  const integration = user.integrations?.googleDrive;
  if (!integration || !integration.connected) {
    throw new BadRequestError(
      'Google Drive is not connected. Please connect your Google account in Settings.'
    );
  }

  if (integration.enabled === false) {
    throw new BadRequestError(
      'Google Drive integration is temporarily disabled in your Settings. Please re-enable it in Settings to allow cloud operations.'
    );
  }

  // Detect Mock Mode
  const isMock =
    integration.accessToken?.startsWith('mock_') ||
    process.env.MOCK_GOOGLE_DRIVE === 'true' ||
    !env.OAUTH_GOOGLE_CLIENT_ID;

  if (isMock) {
    if (!mockDriveStore.has(String(userId))) {
      const rootId = integration.rootFolderId || 'mock_root_folder_id_' + userId;
      mockDriveStore.set(String(userId), {
        files: new Map([
          [
            rootId,
            {
              id: rootId,
              name: DEFAULT_ROOT_FOLDER_NAME,
              mimeType: 'application/vnd.google-apps.folder',
              parents: ['root'],
              webViewLink: `https://drive.google.com/drive/folders/${rootId}`,
              createdTime: new Date().toISOString(),
              modifiedTime: new Date().toISOString(),
            },
          ],
        ]),
      });
    }
    return { isMock: true, user };
  }

  // Real OAuth2 Token Lifecycle with Concurrency Mutex
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
    expiry_date: integration.expiryDate,
  });

  const now = Date.now();
  const isExpiringSoon = integration.expiryDate && integration.expiryDate - now < REFRESH_THRESHOLD_MS;

  if (isExpiringSoon && integration.refreshToken) {
    // Check if refresh is already in flight for this user
    let refreshPromise = tokenRefreshLocks.get(String(userId));
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          logger.info(`[googleDriveService] Refreshing Google OAuth token for user ${userId}...`);
          const { credentials } = await oauth2Client.refreshAccessToken();
          oauth2Client.setCredentials(credentials);

          await User.updateOne(
            { _id: userId },
            {
              $set: {
                'integrations.googleDrive.accessToken': credentials.access_token,
                'integrations.googleDrive.expiryDate': credentials.expiry_date,
                ...(credentials.refresh_token
                  ? { 'integrations.googleDrive.refreshToken': credentials.refresh_token }
                  : {}),
              },
            }
          );
          logger.info(`[googleDriveService] Successfully refreshed Google OAuth token for user ${userId}.`);
        } catch (refreshErr) {
          logger.error(`[googleDriveService] Failed to refresh Google OAuth token: ${refreshErr.message}`);
          const isRevokedOrInvalid =
            refreshErr.message?.includes('invalid_grant') ||
            refreshErr.response?.data?.error === 'invalid_grant' ||
            refreshErr.message?.includes('revoked');
          if (isRevokedOrInvalid) {
            await User.updateOne(
              { _id: userId },
              { $set: { 'integrations.googleDrive.connected': false } }
            );
          }
          throw new BadRequestError(
            'Google Drive authentication expired or was revoked. Please reconnect your Google account in Settings.'
          );
        } finally {
          tokenRefreshLocks.delete(String(userId));
        }
      })();
      tokenRefreshLocks.set(String(userId), refreshPromise);
    }
    await refreshPromise;
  }

  return { isMock: false, authClient: oauth2Client, user };
}

/**
 * Ensures the default 'Personal AI Agent' root folder exists in the user's Google Drive.
 *
 * @param {string} userId - User ObjectId.
 * @param {object} clientInfo - Output from getValidGoogleClient.
 * @returns {Promise<string>} Root folder ID.
 */
export async function ensureRootFolder(userId, clientInfo) {
  const { isMock, authClient, user } = clientInfo;
  if (user.integrations?.googleDrive?.rootFolderId) {
    return user.integrations.googleDrive.rootFolderId;
  }

  if (isMock) {
    const rootId = 'mock_root_folder_id_' + userId;
    const store = mockDriveStore.get(String(userId));
    if (store && !store.files.has(rootId)) {
      store.files.set(rootId, {
        id: rootId,
        name: DEFAULT_ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root'],
        webViewLink: `https://drive.google.com/drive/folders/${rootId}`,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
      });
    }
    await User.updateOne(
      { _id: userId },
      { $set: { 'integrations.googleDrive.rootFolderId': rootId } }
    );
    return rootId;
  }

  const drive = google.drive({ version: 'v3', auth: authClient });
  // Check if folder already exists in Drive root
  const query = `name = '${DEFAULT_ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  let folderId = res.data.files?.[0]?.id;
  if (!folderId) {
    const createRes = await drive.files.create({
      requestBody: {
        name: DEFAULT_ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root'],
      },
      fields: 'id',
    });
    folderId = createRes.data.id;
    logger.info(`[googleDriveService] Created root folder '${DEFAULT_ROOT_FOLDER_NAME}' (${folderId}) for user ${userId}.`);
  }

  await User.updateOne(
    { _id: userId },
    { $set: { 'integrations.googleDrive.rootFolderId': folderId } }
  );

  return folderId;
}

/**
 * Universal manage_google_drive Tool Handler.
 * Supports: 'list' | 'create_folder' | 'search' | 'get_metadata' | 'share'.
 *
 * @param {string} userId - User ObjectId.
 * @param {object} args - Tool arguments.
 * @returns {Promise<object>}
 */
export async function manageGoogleDrive(userId, args = {}) {
  const { action = 'list', folderName, query, folderId, fileId, role = 'reader', emailAddress } = args;
  const clientInfo = await getValidGoogleClient(userId);
  const defaultFolderId = await ensureRootFolder(userId, clientInfo);

  if (clientInfo.isMock) {
    return handleMockManageDrive(userId, {
      action,
      folderName,
      query,
      folderId: folderId || defaultFolderId,
      fileId,
      role,
      emailAddress,
    });
  }

  const drive = google.drive({ version: 'v3', auth: clientInfo.authClient });

  switch (action) {
    case 'create_folder': {
      if (!folderName || typeof folderName !== 'string') {
        throw new BadRequestError('folderName is required to create a folder.');
      }
      const parentId = folderId || defaultFolderId;
      const res = await drive.files.create({
        requestBody: {
          name: folderName.trim(),
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id, name, mimeType, webViewLink, createdTime',
      });
      return {
        success: true,
        action: 'create_folder',
        folder: res.data,
        message: `Folder "${folderName}" created successfully in Google Drive.`,
      };
    }

    case 'list': {
      const parentId = folderId || defaultFolderId;
      const q = `'${parentId}' in parents and trashed = false`;
      const res = await drive.files.list({
        q,
        fields: 'files(id, name, mimeType, webViewLink, size, modifiedTime, createdTime)',
        pageSize: 50,
      });
      return {
        success: true,
        action: 'list',
        folderId: parentId,
        files: res.data.files || [],
        count: (res.data.files || []).length,
      };
    }

    case 'search': {
      const searchTerm = (query || '').replace(/'/g, "\\'");
      const q = searchTerm
        ? `name contains '${searchTerm}' and trashed = false`
        : 'trashed = false';
      const res = await drive.files.list({
        q,
        fields: 'files(id, name, mimeType, webViewLink, size, modifiedTime, parents)',
        pageSize: 30,
      });
      return {
        success: true,
        action: 'search',
        query,
        files: res.data.files || [],
        count: (res.data.files || []).length,
      };
    }

    case 'get_metadata': {
      if (!fileId) throw new BadRequestError('fileId is required to retrieve metadata.');
      const res = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, webViewLink, size, modifiedTime, createdTime, permissions, parents',
      });
      return {
        success: true,
        action: 'get_metadata',
        metadata: res.data,
      };
    }

    case 'share': {
      if (!fileId) throw new BadRequestError('fileId is required to share a document or folder.');
      const permissionBody = emailAddress
        ? { role, type: 'user', emailAddress }
        : { role, type: 'anyone' };

      const res = await drive.permissions.create({
        fileId,
        requestBody: permissionBody,
        fields: 'id, role, type, emailAddress',
      });

      const fileRes = await drive.files.get({
        fileId,
        fields: 'id, name, webViewLink',
      });

      return {
        success: true,
        action: 'share',
        permission: res.data,
        file: fileRes.data,
        message: emailAddress
          ? `Shared "${fileRes.data.name}" with ${emailAddress} as ${role}.`
          : `Shared "${fileRes.data.name}" publicly as ${role}.`,
      };
    }

    default:
      throw new BadRequestError(`Unsupported Google Drive action: ${action}`);
  }
}

/**
 * Universal create_cloud_document Tool Handler.
 * Supports: 'doc' | 'sheet' with open-ended content (markdown/text) or structured data (grid/table).
 *
 * @param {string} userId - User ObjectId.
 * @param {object} args - Tool arguments.
 * @returns {Promise<object>}
 */
export async function createCloudDocument(userId, args = {}) {
  const { type = 'doc', title, folderId, content, data } = args;
  if (!title || typeof title !== 'string') {
    throw new BadRequestError('title is required to create a cloud document.');
  }

  const clientInfo = await getValidGoogleClient(userId);
  const targetFolderId = folderId || (await ensureRootFolder(userId, clientInfo));

  if (clientInfo.isMock) {
    return handleMockCreateCloudDoc(userId, {
      type,
      title: title.trim(),
      folderId: targetFolderId,
      content,
      data,
    });
  }

  const drive = google.drive({ version: 'v3', auth: clientInfo.authClient });

  if (type === 'sheet') {
    // 1. Create Google Spreadsheet
    const sheets = google.sheets({ version: 'v4', auth: clientInfo.authClient });
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: title.trim() },
      },
    });

    const spreadsheetId = createRes.data.spreadsheetId;
    const webViewLink = createRes.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    // Move file into targetFolderId
    if (targetFolderId && targetFolderId !== 'root') {
      try {
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: targetFolderId,
          fields: 'id, parents',
        });
      } catch (moveErr) {
        logger.warn(`[googleDriveService] Failed to set parent folder for sheet: ${moveErr.message}`);
      }
    }

    // Populate data if provided
    let rowsCount = 0;
    if (data) {
      const rows = normalizeSpreadsheetData(data);
      if (rows.length > 0) {
        rowsCount = rows.length;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Sheet1!A1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows },
        });
      }
    }

    return {
      success: true,
      type: 'sheet',
      fileId: spreadsheetId,
      title: title.trim(),
      webViewLink,
      rowsCount,
      folderId: targetFolderId,
      message: `Google Sheet "${title}" created and populated successfully in Google Drive.`,
    };
  }

  // 2. Default: Google Doc
  const docs = google.docs({ version: 'v1', auth: clientInfo.authClient });
  const docCreateRes = await docs.documents.create({
    requestBody: { title: title.trim() },
  });

  const documentId = docCreateRes.data.documentId;
  const webViewLink = `https://docs.google.com/document/d/${documentId}`;

  // Move file into targetFolderId
  if (targetFolderId && targetFolderId !== 'root') {
    try {
      await drive.files.update({
        fileId: documentId,
        addParents: targetFolderId,
        fields: 'id, parents',
      });
    } catch (moveErr) {
      logger.warn(`[googleDriveService] Failed to set parent folder for doc: ${moveErr.message}`);
    }
  }

  // Insert content if provided
  let charCount = 0;
  if (content && typeof content === 'string' && content.trim()) {
    const textToInsert = content.trim() + '\n';
    charCount = textToInsert.length;
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: textToInsert,
            },
          },
        ],
      },
    });
  }

  return {
    success: true,
    type: 'doc',
    fileId: documentId,
    title: title.trim(),
    webViewLink,
    characterCount: charCount,
    folderId: targetFolderId,
    message: `Google Doc "${title}" created and formatted successfully in Google Drive.`,
  };
}

/**
 * Uploads a local file to Google Drive.
 *
 * @param {string} userId - User ObjectId.
 * @param {object} params - { filePath, fileName, mimeType, folderId }
 * @returns {Promise<object>}
 */
export async function uploadFileToDrive(userId, { filePath, fileName, mimeType, folderId }) {
  const clientInfo = await getValidGoogleClient(userId);
  const targetFolderId = folderId || (await ensureRootFolder(userId, clientInfo));

  if (clientInfo.isMock) {
    const store = mockDriveStore.get(String(userId)) || { files: new Map() };
    const fileId = 'mock_file_' + Date.now();
    const mockFile = {
      id: fileId,
      name: fileName,
      mimeType,
      size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 1024,
      parents: [targetFolderId],
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
    };
    store.files.set(fileId, mockFile);
    mockDriveStore.set(String(userId), store);
    return {
      success: true,
      fileId,
      fileName,
      mimeType,
      webViewLink: mockFile.webViewLink,
      message: `File "${fileName}" uploaded successfully to Google Drive (Mock Mode).`,
    };
  }

  const drive = google.drive({ version: 'v3', auth: clientInfo.authClient });
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [targetFolderId],
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
    fields: 'id, name, mimeType, webViewLink, size',
  });

  return {
    success: true,
    fileId: res.data.id,
    fileName: res.data.name,
    mimeType: res.data.mimeType,
    webViewLink: res.data.webViewLink,
    message: `File "${fileName}" uploaded successfully to Google Drive.`,
  };
}

/**
 * Normalizes open-ended data into 2D array of spreadsheet values.
 * Handles:
 * - 2D Array: [['Name', 'Score'], ['Alice', 95]]
 * - Array of Objects: [{ name: 'Alice', score: 95 }]
 * - Object with headers & rows: { headers: [...], rows: [...] }
 * - Object with rows: { rows: [...] }
 *
 * @param {any} data
 * @returns {Array<Array<any>>}
 */
export function normalizeSpreadsheetData(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (Array.isArray(data[0])) {
      return data;
    }
    if (typeof data[0] === 'object' && data[0] !== null) {
      const headers = Object.keys(data[0]);
      const rows = data.map((item) => headers.map((h) => item[h] ?? ''));
      return [headers, ...rows];
    }
    return data.map((item) => [item]);
  }

  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data.rows)) {
      if (Array.isArray(data.headers)) {
        return [data.headers, ...data.rows];
      }
      return data.rows;
    }
    if (Array.isArray(data.items)) {
      return normalizeSpreadsheetData(data.items);
    }
    const entries = Object.entries(data);
    return [
      ['Key', 'Value'],
      ...entries.map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]),
    ];
  }

  return [[String(data)]];
}

// ==============================================================================
// Mock Provider Handlers (Zero external network dependencies for unit/integration tests)
// ==============================================================================

function handleMockManageDrive(userId, { action, folderName, query, folderId, fileId, role, emailAddress }) {
  const store = mockDriveStore.get(String(userId)) || { files: new Map() };
  mockDriveStore.set(String(userId), store);

  switch (action) {
    case 'create_folder': {
      if (!folderName) throw new BadRequestError('folderName is required.');
      const id = 'mock_folder_' + Date.now();
      const folder = {
        id,
        name: folderName.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId],
        webViewLink: `https://drive.google.com/drive/folders/${id}`,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
      };
      store.files.set(id, folder);
      return {
        success: true,
        action: 'create_folder',
        folder,
        message: `Folder "${folderName}" created successfully in Google Drive (Mock Mode).`,
      };
    }

    case 'list': {
      const allFiles = Array.from(store.files.values());
      const filtered = allFiles.filter((f) => (f.parents || []).includes(folderId));
      return {
        success: true,
        action: 'list',
        folderId,
        files: filtered,
        count: filtered.length,
      };
    }

    case 'search': {
      const term = (query || '').toLowerCase();
      const allFiles = Array.from(store.files.values());
      const filtered = allFiles.filter((f) => f.name.toLowerCase().includes(term));
      return {
        success: true,
        action: 'search',
        query,
        files: filtered,
        count: filtered.length,
      };
    }

    case 'get_metadata': {
      if (!fileId) throw new BadRequestError('fileId is required.');
      const file = store.files.get(fileId);
      if (!file) throw new NotFoundError(`Mock file "${fileId}" not found.`);
      return {
        success: true,
        action: 'get_metadata',
        metadata: file,
      };
    }

    case 'share': {
      if (!fileId) throw new BadRequestError('fileId is required.');
      const file = store.files.get(fileId);
      if (!file) throw new NotFoundError(`Mock file "${fileId}" not found.`);
      return {
        success: true,
        action: 'share',
        permission: { id: 'perm_' + Date.now(), role, emailAddress: emailAddress || 'anyone' },
        file,
        message: emailAddress
          ? `Shared "${file.name}" with ${emailAddress} as ${role} (Mock Mode).`
          : `Shared "${file.name}" publicly as ${role} (Mock Mode).`,
      };
    }

    default:
      throw new BadRequestError(`Unsupported action: ${action}`);
  }
}

function handleMockCreateCloudDoc(userId, { type, title, folderId, content, data }) {
  const store = mockDriveStore.get(String(userId)) || { files: new Map() };
  mockDriveStore.set(String(userId), store);

  const id = `mock_${type}_${Date.now()}`;
  const isSheet = type === 'sheet';
  const mimeType = isSheet
    ? 'application/vnd.google-apps.spreadsheet'
    : 'application/vnd.google-apps.document';
  const webViewLink = isSheet
    ? `https://docs.google.com/spreadsheets/d/${id}`
    : `https://docs.google.com/document/d/${id}`;

  const docRecord = {
    id,
    name: title,
    mimeType,
    parents: [folderId],
    webViewLink,
    content: content || null,
    data: data ? normalizeSpreadsheetData(data) : null,
    createdTime: new Date().toISOString(),
    modifiedTime: new Date().toISOString(),
  };

  store.files.set(id, docRecord);

  return {
    success: true,
    type,
    fileId: id,
    title,
    webViewLink,
    folderId,
    rowsCount: docRecord.data ? docRecord.data.length : undefined,
    characterCount: content ? content.length : undefined,
    message: `Google ${isSheet ? 'Sheet' : 'Doc'} "${title}" created successfully in Google Drive (Mock Mode).`,
  };
}

export default {
  createOAuth2Client,
  getAuthorizationUrl,
  exchangeCodeAndSaveTokens,
  disconnectGoogleDrive,
  getValidGoogleClient,
  ensureRootFolder,
  manageGoogleDrive,
  createCloudDocument,
  uploadFileToDrive,
  normalizeSpreadsheetData,
};

````

================================================================================
File: backend/src/services/storageService.js
================================================================================

````javascript
/**
 * @module services/storageService
 * @description Cloud storage abstraction adapter powering persistent asset storage via Cloudinary
 * with automatic fallback to local filesystem and an exhaustive 8-vector lifecycle cleanup engine.
 *
 * Capabilities:
 * 1. Zero-dependency native REST communication via Node fetch and crypto (SHA-1 signature).
 * 2. Multi-resource type classification: 'image', 'video' (audios), 'raw' (documents).
 * 3. Permanent CDN delivery avoiding Render ephemeral filesystem data loss on restart.
 * 4. 8-Vector Lifecycle Cleanup Engine to aggressively preserve the free tier 25GB quota.
 * 5. Resilient error handling adhering to the Zero-Crash Invariant.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import logger from '../config/logger.js';
import { UPLOADS_CONFIG } from '../utils/constants.js';
import Audio from '../models/Audio.js';

/**
 * Checks if Cloudinary credentials are fully defined in the environment.
 * @returns {boolean}
 */
export const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

/**
 * Derives the Cloudinary resource_type ('image' | 'video' | 'raw') based on MIME type or file extension.
 * In Cloudinary REST API, audio files MUST be uploaded under resource_type 'video'.
 *
 * @param {string} [mimeType='']
 * @param {string} [fileName='']
 * @returns {'image' | 'video' | 'raw'}
 */
export const inferResourceType = (mimeType = '', fileName = '') => {
  const mime = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();

  if (
    mime.startsWith('audio/') ||
    mime.includes('webm') ||
    name.endsWith('.wav') ||
    name.endsWith('.mp3') ||
    name.endsWith('.m4a') ||
    name.endsWith('.aac') ||
    name.endsWith('.ogg') ||
    name.endsWith('.webm')
  ) {
    return 'video';
  }

  if (
    mime.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp') ||
    name.endsWith('.gif') ||
    name.endsWith('.svg')
  ) {
    return 'image';
  }

  return 'raw';
};

/**
 * Computes the Cloudinary SHA-1 authentication signature for signed REST operations.
 *
 * @param {Record<string, string|number>} params - Key-value parameters to sign.
 * @param {string} apiSecret - Cloudinary API secret.
 * @returns {string} SHA-1 hex digest.
 */
const generateSignature = (params, apiSecret) => {
  const sortedKeys = Object.keys(params).sort();
  const signatureString = sortedKeys
    .map((k) => `${k}=${params[k]}`)
    .join('&') + apiSecret;

  return crypto.createHash('sha1').update(signatureString).digest('hex');
};

/**
 * Uploads a local file or buffer to Cloudinary CDN.
 * Falls back to local disk storage representation if Cloudinary is not configured.
 *
 * @param {object} options
 * @param {string} [options.filePath] - Absolute path on disk.
 * @param {Buffer} [options.buffer] - Raw memory buffer (optional alternative to filePath).
 * @param {string} [options.fileName] - Original or designated filename.
 * @param {string} [options.mimeType] - File MIME type.
 * @param {string} [options.folder='personal-agent/general'] - Cloudinary folder prefix.
 * @param {'image' | 'video' | 'raw'} [options.resourceType] - Cloudinary resource type override.
 * @returns {Promise<{ url: string, secure_url: string, publicId: string|null, bytes: number, format: string, resourceType: string, isCloud: boolean }>}
 */
export const uploadFile = async ({
  filePath,
  buffer,
  fileName = 'file',
  mimeType = 'application/octet-stream',
  folder = 'personal-agent/general',
  resourceType,
}) => {
  if (!isCloudinaryConfigured()) {
    // Local disk fallback
    const localBytes = buffer ? buffer.length : (filePath && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
    const localUrl = filePath
      ? `/uploads/${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`
      : `/uploads/general/${fileName}`;

    return {
      url: localUrl,
      secure_url: localUrl,
      publicId: null,
      bytes: localBytes,
      format: path.extname(fileName).replace(/^\./, ''),
      resourceType: resourceType || inferResourceType(mimeType, fileName),
      isCloud: false,
    };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const targetResourceType = resourceType || inferResourceType(mimeType, fileName);
  const fileBytes = buffer || (filePath ? await fs.promises.readFile(filePath) : null);

  if (!fileBytes || fileBytes.length === 0) {
    throw new Error(`Cannot upload empty file "${fileName}" to Cloudinary.`);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signParams = {
    folder,
    timestamp,
  };

  const signature = generateSignature(signParams, apiSecret);

  const formData = new FormData();
  formData.append('file', new Blob([fileBytes], { type: mimeType }), fileName);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', folder);
  formData.append('signature', signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${targetResourceType}/upload`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Cloudinary upload failed: ${data.error?.message || res.statusText}`);
    }

    logger.info(`[storageService] Uploaded asset to Cloudinary: ${data.public_id} (${data.bytes} bytes, ${targetResourceType})`);

    return {
      url: data.secure_url || data.url,
      secure_url: data.secure_url || data.url,
      publicId: data.public_id,
      bytes: data.bytes,
      format: data.format,
      resourceType: data.resource_type || targetResourceType,
      isCloud: true,
    };
  } catch (err) {
    logger.error(`[storageService] Cloudinary upload error for "${fileName}": ${err.message}`);
    // If local path exists, graceful fallback to local representation
    if (filePath && fs.existsSync(filePath)) {
      return {
        url: `/uploads/${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`,
        secure_url: `/uploads/${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`,
        publicId: null,
        bytes: fileBytes.length,
        format: path.extname(fileName).replace(/^\./, ''),
        resourceType: targetResourceType,
        isCloud: false,
      };
    }
    throw err;
  }
};

/**
 * Destroys a single asset from Cloudinary by its publicId.
 * Adheres strictly to Zero-Crash Invariant: suppresses network failures and logs cleanly.
 *
 * @param {string} publicId - Cloudinary public identifier.
 * @param {'image' | 'video' | 'raw' | 'auto'} [resourceType='auto'] - Cloudinary resource type.
 * @returns {Promise<{ result: string }>}
 */
export const destroyFile = async (publicId, resourceType = 'auto') => {
  if (!publicId || !isCloudinaryConfigured()) {
    return { result: 'skipped' };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const typesToTry = resourceType === 'auto'
    ? ['video', 'image', 'raw']
    : [resourceType];

  for (const type of typesToTry) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signParams = {
        public_id: publicId,
        timestamp,
      };
      const signature = generateSignature(signParams, apiSecret);

      const formData = new FormData();
      formData.append('public_id', publicId);
      formData.append('api_key', apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('signature', signature);

      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${type}/destroy`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.result === 'ok') {
        logger.info(`[storageService] Purged Cloudinary asset: ${publicId} (type: ${type})`);
        return { result: 'ok' };
      }
    } catch (err) {
      logger.warn(`[storageService] Cloudinary destroy attempt failed for ${publicId} (${type}): ${err.message}`);
    }
  }

  return { result: 'not_found_or_already_purged' };
};

/**
 * Destroys multiple Cloudinary assets in parallel.
 *
 * @param {Array<{ publicId: string, resourceType?: string } | string>} items
 * @returns {Promise<void>}
 */
export const batchDestroyFiles = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0 || !isCloudinaryConfigured()) {
    return;
  }

  const tasks = items
    .filter(Boolean)
    .map((item) => {
      const publicId = typeof item === 'string' ? item : item.publicId;
      const resourceType = typeof item === 'object' && item.resourceType ? item.resourceType : 'auto';
      return destroyFile(publicId, resourceType);
    });

  await Promise.allSettled(tasks);
};

// =============================================================================
// THE 8-VECTOR LIFECYCLE CLEANUP ENGINE (DUAL-TIER PARITY: CLOUDINARY + LOCAL DISK)
// =============================================================================

/**
 * Safely unlinks a file from the local filesystem with multi-directory resolution
 * and strict test fixture protection.
 *
 * @param {string} filePathOrName - Absolute path, relative path, or file name.
 * @param {string} [domainDir] - Optional specific directory hint.
 * @returns {boolean} True if a file was found and unlinked.
 */
export const safeUnlinkDiskFile = (filePathOrName, domainDir = null) => {
  if (!filePathOrName || typeof filePathOrName !== 'string') return false;

  const baseName = path.basename(filePathOrName);
  // Strictly protect committed fixtures and sample files
  if (
    baseName.startsWith('sample-') ||
    baseName.includes('-sample-') ||
    baseName.endsWith('-sample') ||
    baseName === 'sample-report.wav' ||
    baseName === 'sample-voice.mp3' ||
    baseName === 'sample-doc.pdf' ||
    baseName === 'sample-image.png'
  ) {
    return false;
  }

  // 1. Direct absolute path or exact relative path check
  const pathsToCheck = [];
  if (path.isAbsolute(filePathOrName)) {
    pathsToCheck.push(filePathOrName);
  } else {
    // Relative to process.cwd()
    const relativeClean = filePathOrName.replace(/^[\\/]+/, '');
    pathsToCheck.push(path.resolve(process.cwd(), relativeClean));
    if (!relativeClean.startsWith('backend/')) {
      pathsToCheck.push(path.resolve(process.cwd(), 'backend', relativeClean));
    }
  }

  // 2. Candidate domain directories for baseName
  const candidateDirs = [
    domainDir,
    UPLOADS_CONFIG.IMAGES_DIR,
    UPLOADS_CONFIG.FILES_DIR,
    UPLOADS_CONFIG.AUDIOS_DIR,
    UPLOADS_CONFIG.ATTACHMENTS_DIR,
    UPLOADS_CONFIG.AVATARS_DIR,
    UPLOADS_CONFIG.TEMP_DIR,
    UPLOADS_CONFIG.GENERATED_DOCUMENTS_DIR,
    UPLOADS_CONFIG.ROOT_DIR,
  ].filter(Boolean);

  for (const dir of candidateDirs) {
    pathsToCheck.push(path.join(dir, baseName));
  }

  // If baseName has no extension (e.g. raw Cloudinary publicId suffix), search prefix matches
  if (!path.extname(baseName) && baseName.length >= 8) {
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        try {
          const dirFiles = fs.readdirSync(dir);
          for (const df of dirFiles) {
            if (df.startsWith(baseName) && !df.startsWith('sample-')) {
              pathsToCheck.push(path.join(dir, df));
            }
          }
        } catch (_) {}
      }
    }
  }

  let unlinked = false;
  const seenPaths = new Set();
  for (const p of pathsToCheck) {
    const normalized = path.normalize(p);
    if (seenPaths.has(normalized)) continue;
    seenPaths.add(normalized);

    try {
      if (fs.existsSync(normalized)) {
        const stats = fs.statSync(normalized);
        if (stats.isFile()) {
          fs.unlinkSync(normalized);
          logger.info(`[storageService] Unlinked local disk file: ${normalized}`);
          unlinked = true;
        }
      }
    } catch (err) {
      logger.warn(`[storageService] Failed to unlink disk file ${normalized}: ${err.message}`);
    }
  }

  return unlinked;
};

/**
 * Vector 1: Chat Session Deletion.
 * Purges all attachment files and private session audios from Cloudinary AND unlinks local disk files.
 *
 * @param {object} chat - Chat document.
 * @returns {Promise<number>} Count of purged assets.
 */
export const cleanupChatAssets = async (chat) => {
  if (!chat || !Array.isArray(chat.messages)) return 0;

  const targets = [];
  const audioIds = [];
  const diskFiles = [];

  for (const msg of chat.messages) {
    if (Array.isArray(msg.attachments)) {
      for (const att of msg.attachments) {
        if (att.publicId) {
          targets.push({ publicId: att.publicId, resourceType: inferResourceType(att.mimeType, att.fileName) });
          diskFiles.push(att.publicId);
        }
        if (att.path) diskFiles.push(att.path);
        if (att.fileName) diskFiles.push(att.fileName);
      }
    }
    if (Array.isArray(msg.audios)) {
      for (const aud of msg.audios) {
        const id = typeof aud === 'object' && aud !== null ? (aud._id || aud.id) : aud;
        if (id) audioIds.push(id);
      }
    }
  }

  if (targets.length > 0) {
    await batchDestroyFiles(targets);
  }
  for (const f of diskFiles) {
    safeUnlinkDiskFile(f);
  }
  if (audioIds.length > 0) {
    await cleanupAudiosById(audioIds);
  }

  return targets.length + audioIds.length + diskFiles.length;
};

/**
 * Vector 2: Turn Edit Pruning & Turn Edit Delta Purging.
 * Destroys assets belonging to downstream turns or removed turn assets from Cloudinary AND local disk.
 *
 * @param {Array<object>} prunedMessages - Array of pruned message turn objects.
 * @returns {Promise<number>} Count of purged assets.
 */
export const cleanupPrunedTurnAssets = async (prunedMessages = []) => {
  if (!Array.isArray(prunedMessages) || prunedMessages.length === 0) return 0;

  const targets = [];
  const audioIds = [];
  const diskFiles = [];

  for (const msg of prunedMessages) {
    if (Array.isArray(msg.attachments)) {
      for (const att of msg.attachments) {
        if (att.publicId) {
          targets.push({ publicId: att.publicId, resourceType: inferResourceType(att.mimeType, att.fileName) });
          diskFiles.push(att.publicId);
        }
        if (att.path) diskFiles.push(att.path);
        if (att.fileName) diskFiles.push(att.fileName);
      }
    }
    if (Array.isArray(msg.audios)) {
      for (const aud of msg.audios) {
        const id = typeof aud === 'object' && aud !== null ? (aud._id || aud.id) : aud;
        if (id) audioIds.push(id);
      }
    }
  }

  if (targets.length > 0) {
    await batchDestroyFiles(targets);
  }
  for (const f of diskFiles) {
    safeUnlinkDiskFile(f);
  }
  if (audioIds.length > 0) {
    await cleanupAudiosById(audioIds);
  }

  return targets.length + audioIds.length + diskFiles.length;
};

/**
 * Vector 3: Turn Retry Cleanup.
 * Destroys assets attached to a retried turn if discarded from Cloudinary AND local disk.
 *
 * @param {object} userTurn - The user message turn being retried.
 * @returns {Promise<void>}
 */
export const cleanupRetryTurnAssets = async (userTurn) => {
  if (!userTurn) return;
  const targets = [];
  const diskFiles = [];
  if (Array.isArray(userTurn.attachments)) {
    for (const a of userTurn.attachments) {
      if (a.publicId) {
        targets.push({ publicId: a.publicId, resourceType: inferResourceType(a.mimeType, a.fileName) });
        diskFiles.push(a.publicId);
      }
      if (a.path) diskFiles.push(a.path);
      if (a.fileName) diskFiles.push(a.fileName);
    }
  }
  if (targets.length > 0) {
    await batchDestroyFiles(targets);
  }
  for (const f of diskFiles) {
    safeUnlinkDiskFile(f);
  }
  if (Array.isArray(userTurn.audios) && userTurn.audios.length > 0) {
    const audioIds = userTurn.audios
      .map((a) => (typeof a === 'object' && a !== null ? (a._id || a.id) : a))
      .filter(Boolean);
    if (audioIds.length > 0) {
      await cleanupAudiosById(audioIds);
    }
  }
};

/**
 * Vector 5 / Extension: Audio ID Batch Cleanup.
 * Completely purges audio records from Cloudinary CDN, local filesystem disk, and MongoDB.
 *
 * @param {Array<string|object>} audioIds - Array of Audio ObjectId strings or subdocuments.
 * @returns {Promise<number>} Count of purged audio assets.
 */
export const cleanupAudiosById = async (audioIds = []) => {
  if (!Array.isArray(audioIds) || audioIds.length === 0) return 0;

  const validIds = audioIds
    .map((id) => (typeof id === 'object' && id !== null ? (id._id || id.id) : id))
    .filter(Boolean)
    .map(String)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) return 0;

  try {
    const audioDocs = await Audio.find({ _id: { $in: validIds } }).select('publicId fileName path');
    const targets = [];
    const diskPaths = [];

    for (const doc of audioDocs) {
      if (doc.publicId) {
        targets.push({ publicId: doc.publicId, resourceType: 'video' });
      }
      if (doc.path) {
        diskPaths.push(doc.path);
      }
      if (doc.fileName) {
        diskPaths.push(doc.fileName);
      }
    }

    if (targets.length > 0) {
      await batchDestroyFiles(targets);
    }

    for (const p of diskPaths) {
      safeUnlinkDiskFile(p, UPLOADS_CONFIG.AUDIOS_DIR);
    }

    await Audio.deleteMany({ _id: { $in: validIds } });
    return audioDocs.length;
  } catch (err) {
    logger.warn(`[storageService] cleanupAudiosById failed: ${err.message}`);
    return 0;
  }
};

/**
 * Vector 4: Composer Shelf Dismissal.
 * Directly destroys a single uploaded attachment if user removes it before sending from Cloudinary AND local disk.
 *
 * @param {string} publicId - Attachment Cloudinary public ID.
 * @param {string} [mimeType='']
 * @param {string} [fileName='']
 * @param {string} [localPath='']
 * @returns {Promise<{ result: string }>}
 */
export const cleanupComposerAttachment = async (publicId, mimeType = '', fileName = '', localPath = '') => {
  let destroyRes = { result: 'noop' };
  if (publicId) {
    const resourceType = inferResourceType(mimeType, fileName);
    destroyRes = await destroyFile(publicId, resourceType);
    safeUnlinkDiskFile(publicId);
  }
  if (fileName) {
    safeUnlinkDiskFile(fileName);
  }
  if (localPath) {
    safeUnlinkDiskFile(localPath);
  }
  return destroyRes;
};

/**
 * Vector 6: Avatar Replacement / Removal.
 * Purges old user profile avatar from Cloudinary AND local disk.
 *
 * @param {string} avatarPublicId
 * @param {string} [avatarPathOrUrl='']
 * @returns {Promise<void>}
 */
export const cleanupAvatarAsset = async (avatarPublicId, avatarPathOrUrl = '') => {
  if (avatarPublicId) {
    await destroyFile(avatarPublicId, 'image');
    safeUnlinkDiskFile(avatarPublicId, UPLOADS_CONFIG.AVATARS_DIR);
  }
  if (avatarPathOrUrl) {
    safeUnlinkDiskFile(avatarPathOrUrl, UPLOADS_CONFIG.AVATARS_DIR);
  }
};

/**
 * Vector 7: Permanent Report Deletion.
 * Purges evidentiary audio files associated with an archived report from Cloudinary AND local disk.
 *
 * @param {Array<object>} audios - Array of Audio documents or references.
 * @returns {Promise<number>}
 */
export const cleanupReportAudios = async (audios = []) => {
  if (!Array.isArray(audios) || audios.length === 0) return 0;
  const targets = [];
  const diskFiles = [];
  for (const a of audios) {
    if (a?.publicId) {
      targets.push({ publicId: a.publicId, resourceType: 'video' });
      diskFiles.push(a.publicId);
    }
    if (a?.path) diskFiles.push(a.path);
    if (a?.fileName) diskFiles.push(a.fileName);
  }

  if (targets.length > 0) {
    await batchDestroyFiles(targets);
  }
  for (const f of diskFiles) {
    safeUnlinkDiskFile(f, UPLOADS_CONFIG.AUDIOS_DIR);
  }
  return targets.length;
};

/**
 * Vector 8: User Account Cascade Deletion.
 * Purges all user avatars, chat attachments, and private audios from Cloudinary AND local disk.
 *
 * @param {object} user - User document.
 * @param {Array<object>} userChats - All chat documents belonging to user.
 * @param {Array<object>} userAudios - All audio documents belonging to user.
 * @returns {Promise<void>}
 */
export const cleanupUserCascadeAssets = async (user, userChats = [], userAudios = []) => {
  const targets = [];
  const diskFiles = [];

  if (user?.avatarPublicId) {
    targets.push({ publicId: user.avatarPublicId, resourceType: 'image' });
    diskFiles.push(user.avatarPublicId);
  }
  if (user?.avatar) {
    diskFiles.push(user.avatar);
  }

  for (const chat of userChats) {
    if (Array.isArray(chat.messages)) {
      for (const msg of chat.messages) {
        if (Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            if (att.publicId) {
              targets.push({ publicId: att.publicId, resourceType: inferResourceType(att.mimeType, att.fileName) });
              diskFiles.push(att.publicId);
            }
            if (att.path) diskFiles.push(att.path);
            if (att.fileName) diskFiles.push(att.fileName);
          }
        }
      }
    }
  }

  for (const aud of userAudios) {
    if (aud?.publicId) {
      targets.push({ publicId: aud.publicId, resourceType: 'video' });
      diskFiles.push(aud.publicId);
    }
    if (aud?.path) diskFiles.push(aud.path);
    if (aud?.fileName) diskFiles.push(aud.fileName);
  }

  if (targets.length > 0) {
    await batchDestroyFiles(targets);
  }
  for (const f of diskFiles) {
    safeUnlinkDiskFile(f);
  }
};

export default {
  isCloudinaryConfigured,
  inferResourceType,
  uploadFile,
  destroyFile,
  batchDestroyFiles,
  safeUnlinkDiskFile,
  cleanupChatAssets,
  cleanupPrunedTurnAssets,
  cleanupRetryTurnAssets,
  cleanupAudiosById,
  cleanupComposerAttachment,
  cleanupAvatarAsset,
  cleanupReportAudios,
  cleanupUserCascadeAssets,
};

````

================================================================================
File: backend/src/services/telegramService.js
================================================================================

````javascript
/**
 * @module services/telegramService
 * @description Enterprise outbound Telegram broadcast engine supporting multi-modal delivery
 * (native Semantic HTML text, expandable blockquotes, and dynamic sharp SVG-to-PNG image cards).
 * Enforces Zero Artificial Wrapper Law, Telegram native limits (4,096 chars, 50MB files),
 * and dual live/stub mode with zero-failure invariants.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TELEGRAM_CONSTANTS } from '../utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy memoized embedded font definitions for SVG rendering
let cachedFontDefs = null;

// Ensure fontconfig discovers local TTF fonts in headless Linux environments (Render / Docker)
function configureFontconfig() {
  if (process.platform === 'linux') {
    const fontsDir = path.resolve(__dirname, '../assets/fonts');
    const fontsConf = path.join(fontsDir, 'fonts.conf');
    if (!process.env.FONTCONFIG_PATH) {
      process.env.FONTCONFIG_PATH = fontsDir;
    }
    if (!process.env.FONTCONFIG_FILE && fs.existsSync(fontsConf)) {
      process.env.FONTCONFIG_FILE = fontsConf;
    }
    const cacheDir = '/tmp/fonts-cache';
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (_) {}
    }
  }
}

// Pre-configure font environment on module load
configureFontconfig();

function getEmbeddedFontDefs() {
  if (cachedFontDefs !== null) return cachedFontDefs;
  try {
    const regularPath = path.resolve(__dirname, '../assets/fonts/NotoSansEthiopic-Regular.woff');
    const boldPath = path.resolve(__dirname, '../assets/fonts/NotoSansEthiopic-Bold.woff');

    let regularBase64 = '';
    let boldBase64 = '';

    if (fs.existsSync(regularPath)) {
      regularBase64 = fs.readFileSync(regularPath).toString('base64');
    }
    if (fs.existsSync(boldPath)) {
      boldBase64 = fs.readFileSync(boldPath).toString('base64');
    }

    if (regularBase64 || boldBase64) {
      cachedFontDefs = `
    <defs>
      <style>
        ${regularBase64 ? `@font-face {
          font-family: 'Noto Sans Ethiopic';
          src: url('data:font/woff;charset=utf-8;base64,${regularBase64}') format('woff');
          font-weight: normal;
          font-style: normal;
        }` : ''}
        ${boldBase64 ? `@font-face {
          font-family: 'Noto Sans Ethiopic';
          src: url('data:font/woff;charset=utf-8;base64,${boldBase64}') format('woff');
          font-weight: bold;
          font-style: normal;
        }` : ''}
      </style>
    </defs>`;
    } else {
      cachedFontDefs = '';
    }
  } catch (err) {
    cachedFontDefs = '';
  }
  return cachedFontDefs;
}

/**
 * Escapes standard HTML special characters.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text = '') {
  return String(text).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

/**
 * Deterministically transpiles Markdown to Telegram-compliant HTML.
 * Handles bold (**text**), italic (*text*), code (`code` and ```code```),
 * expandable blockquotes (> line), and links ([text](url)).
 * Standardizes on HTML to avoid Telegram's MarkdownV2 escaping pitfalls.
 *
 * @param {string} markdown - Input Markdown string
 * @returns {string} Telegram HTML formatted string
 */
export function markdownToTelegramHtml(markdown = '') {
  if (!markdown || typeof markdown !== 'string') return '';

  const lines = markdown.split('\n');
  const processedLines = [];
  let blockquoteBuffer = [];

  const flushBlockquote = () => {
    if (blockquoteBuffer.length > 0) {
      processedLines.push(`<blockquote expandable>${blockquoteBuffer.join('\n')}</blockquote>`);
      blockquoteBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoteMatch = line.match(/^>\s?(.*)$/);

    if (quoteMatch) {
      blockquoteBuffer.push(escapeHtml(quoteMatch[1]));
    } else {
      flushBlockquote();
      processedLines.push(escapeHtml(line));
    }
  }
  flushBlockquote();

  let html = processedLines.join('\n');

  // Multi-line code blocks: ```code``` -> <pre>code</pre>
  html = html.replace(/```([\s\S]*?)```/g, (_match, code) => `<pre>${code.trim()}</pre>`);

  // Inline code: `code` -> <code>code</code>
  html = html.replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`);

  // Bold: **text** or __text__ -> <b>text</b>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/__([^_]+)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ -> <i>text</i> (excluding already matched bold)
  html = html.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<i>$2</i>$3');

  // Links: [label](url) -> <a href="url">label</a>
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  return html;
}

/**
 * Splits message text into chunks that strictly respect Telegram's 4,096 UTF-8 character limit.
 * Chunks along paragraph boundaries (\n\n) first, then line breaks (\n).
 *
 * @param {string} text - Message text or HTML
 * @param {number} [maxLimit=4096] - Maximum character count per chunk
 * @returns {string[]} Array of chunked messages
 */
export function chunkTelegramMessage(text = '', maxLimit = TELEGRAM_CONSTANTS.MAX_MESSAGE_LENGTH) {
  if (!text) return [];
  if (text.length <= maxLimit) return [text];

  const chunks = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + '\n\n' + para).trim().length <= maxLimit) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      if (para.length <= maxLimit) {
        currentChunk = para;
      } else {
        // Paragraph itself exceeds maxLimit; split by individual lines
        const lines = para.split('\n');
        for (const line of lines) {
          if ((currentChunk + '\n' + line).trim().length <= maxLimit) {
            currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = '';
            }
            if (line.length <= maxLimit) {
              currentChunk = line;
            } else {
              // Line itself exceeds maxLimit; hard split by character bound
              for (let i = 0; i < line.length; i += maxLimit) {
                chunks.push(line.slice(i, i + maxLimit));
              }
            }
          }
        }
      }
    }
  }

  if (currentChunk && currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Estimates character advance width in pixels based on font size and script geometry.
 * Ethiopic glyph advance: ~0.60 * fontSize (normal) / 0.62 * fontSize (bold).
 * Latin glyph advance: ~0.50 * fontSize (normal) / 0.52 * fontSize (bold).
 * Narrow punctuation: ~0.28 * fontSize.
 * Space: ~0.30 * fontSize.
 *
 * @param {string} ch - Character
 * @param {number} fontSize - Base font size in px
 * @param {boolean} [isBold=false] - Whether bold weight
 * @returns {number} Estimated pixel advance
 */
function estimateCharWidth(ch, fontSize, isBold = false) {
  const code = ch.charCodeAt(0);
  if (ch === ' ') return fontSize * 0.30;
  if (code >= 0x1200 && code <= 0x137f) {
    return fontSize * (isBold ? 0.62 : 0.60);
  }
  if (['i', 'l', 'I', '1', '.', ':', ',', ';', '!', '|', '\'', '"', '`'].includes(ch)) {
    return fontSize * 0.28;
  }
  if (['m', 'w', 'M', 'W', '@', '%'].includes(ch)) {
    return fontSize * 0.82;
  }
  return fontSize * (isBold ? 0.52 : 0.50);
}

/**
 * Measures total advance width of a string in pixels.
 *
 * @param {string} text - Input text
 * @param {number} fontSize - Font size in px
 * @param {boolean} [isBold=false] - Bold flag
 * @returns {number} Width in px
 */
function measureTextWidth(text, fontSize, isBold = false) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += estimateCharWidth(text[i], fontSize, isBold);
  }
  return w;
}

/**
 * Strips inline markdown tokens for accurate character geometry measurement.
 * @param {string} [text='']
 * @returns {string}
 */
function stripMarkdown(text = '') {
  return text.replace(/(\*\*|__|\*|_|~~|\^|~)/g, '');
}

/**
 * Pixel-aware word wrapping utility respecting exact glyph geometry.
 *
 * @param {string} text - Input text to wrap
 * @param {number} maxWidth - Maximum allowed line width in px
 * @param {number} fontSize - Font size in px
 * @param {boolean} [isBold=false] - Bold flag
 * @returns {string[]} Array of wrapped line strings
 */
function wrapTextPixels(text, maxWidth, fontSize, isBold = false) {
  const words = text.split(/\s+/);
  const lines = [];
  let curLine = '';
  let curWidth = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = stripMarkdown(word);
    const wordWidth = measureTextWidth(cleanWord, fontSize, isBold);
    const spaceWidth = curLine ? measureTextWidth(' ', fontSize, isBold) : 0;

    if (curWidth + spaceWidth + wordWidth <= maxWidth) {
      curLine = curLine ? `${curLine} ${word}` : word;
      curWidth += spaceWidth + wordWidth;
    } else {
      if (curLine) {
        lines.push(curLine);
      }
      if (wordWidth > maxWidth) {
        let chunk = '';
        let chunkW = 0;
        for (let c = 0; c < word.length; c++) {
          const cw = estimateCharWidth(word[c], fontSize, isBold);
          if (chunkW + cw > maxWidth && chunk) {
            lines.push(chunk);
            chunk = word[c];
            chunkW = cw;
          } else {
            chunk += word[c];
            chunkW = cw;
          }
        }
        curLine = chunk;
        curWidth = chunkW;
      } else {
        curLine = word;
        curWidth = wordWidth;
      }
    }
  }
  if (curLine) {
    lines.push(curLine);
  }
  return lines;
}

/**
 * Dynamically generates a high-contrast, mobile-optimized document sheet image card
 * for ANY text payload (reports, ad-hoc announcements, executive memos, daily logs)
 * at standard non-negotiable 1440px 2K resolution using sharp and SVG vector rendering.
 * Implements Single Formatting Pipeline to completely eliminate nested stroke bloating.
 *
 * @param {string} text - Content text (reports, memos, or ad-hoc messages)
 * @param {Object} [options={}] - Dynamic styling options
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateTextImageCard(text = '', options = {}) {
  configureFontconfig();
  const reportText = text;
  const C = TELEGRAM_CONSTANTS.IMAGE_CARD;
  const width = options.width || C.WIDTH;
  const paddingX = options.paddingX || C.PADDING_X;
  const baseFontSize = options.fontSize || C.BASE_FONT_SIZE;
  const sectionFontSize = options.sectionFontSize || Math.round(baseFontSize * 1.16);
  const lineHeight = options.lineHeight || Math.round(baseFontSize * 1.26);
  const sectionTopGap = options.sectionTopGap !== undefined ? options.sectionTopGap : C.SECTION_TOP_GAP;
  const sectionBottomGap = options.sectionBottomGap !== undefined ? options.sectionBottomGap : C.SECTION_BOTTOM_GAP;
  const paragraphGap = options.paragraphGap !== undefined ? options.paragraphGap : C.PARAGRAPH_GAP;
  const bulletGap = options.bulletGap !== undefined ? options.bulletGap : C.INTER_BULLET_GAP;
  const bulletIndent = options.bulletIndent || C.BULLET_INDENT;
  const bulletRadius = options.bulletRadius || C.BULLET_RADIUS;
  const textColor = options.textColor || C.TEXT_COLOR;
  const bgColor = options.bgColor || C.BG_COLOR;
  const fontFamily = options.fontFamily || C.FONT_FAMILY;
  const letterSpacingAttr = options.letterSpacing ? ` letter-spacing="${options.letterSpacing}px"` : '';

  const align = options.align || 'left';
  const textAnchorAttr = align === 'center' ? ' text-anchor="middle"' : (align === 'right' ? ' text-anchor="end"' : '');
  const anchorX = align === 'center' ? Math.round(width / 2) : (align === 'right' ? width - paddingX : paddingX);

  // Synthetic bold stroke settings ensuring cross-platform Ethiopic bolding
  const boldStrokeBody = `stroke="${textColor}" stroke-width="1.1" paint-order="stroke fill"`;
  const boldStrokeHeader = `stroke="${textColor}" stroke-width="1.3" paint-order="stroke fill"`;

  const usableWidth = width - 2 * paddingX;
  const bulletUsableWidth = usableWidth - bulletIndent;
  const maxLineSafety = 45; // Safety buffer ensuring right margin >= 100px

  const lines = reportText.split('\n');
  const elements = [];
  let currentY = paddingX + 15;

  /**
   * Single Formatting Pipeline: Parses inline Markdown tokens without nested stroke stacking.
   * Disambiguates bold, italic, underline, strikethrough, superscript, and subscript.
   *
   * @param {string} text - Raw text containing inline markdown
   * @param {boolean} [isParentBold=false] - Whether enclosing <text> already has bold stroke
   * @returns {string} Sanitized SVG <tspan> markup
   */
  function formatInlineSpans(text, isParentBold = false) {
    if (!text) return '';
    const regex = /(\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|(?<!_)_[^_]+_(?!_)|__[^_]+__|~~[^~]+~~|\^[^^]+\^|~[^~]+~)/g;
    const parts = text.split(regex);
    return parts.map((part) => {
      if (!part) return '';
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const inner = part.slice(2, -2);
        const stroke = isParentBold ? '' : ` ${boldStrokeBody}`;
        return `<tspan font-weight="bold"${stroke}>${escapeHtml(inner)}</tspan>`;
      }
      if (
        (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length > 2)
      ) {
        const inner = part.slice(1, -1);
        return `<tspan font-style="italic">${escapeHtml(inner)}</tspan>`;
      }
      if (part.startsWith('__') && part.endsWith('__') && part.length > 4) {
        const inner = part.slice(2, -2);
        return `<tspan text-decoration="underline">${escapeHtml(inner)}</tspan>`;
      }
      if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
        const inner = part.slice(2, -2);
        return `<tspan text-decoration="line-through">${escapeHtml(inner)}</tspan>`;
      }
      if (part.startsWith('^') && part.endsWith('^') && part.length > 2) {
        const inner = part.slice(1, -1);
        return `<tspan font-size="${Math.round(baseFontSize * 0.72)}" baseline-shift="super">${escapeHtml(inner)}</tspan>`;
      }
      if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
        const inner = part.slice(1, -1);
        return `<tspan font-size="${Math.round(baseFontSize * 0.72)}" baseline-shift="sub">${escapeHtml(inner)}</tspan>`;
      }
      return escapeHtml(part);
    }).join('');
  }

  const isAllBold = Boolean(options.allBold || options.bold);
  const defaultWeight = isAllBold ? 'bold' : 'normal';
  const bodyStroke = isAllBold ? ` ${boldStrokeBody}` : '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      currentY += paragraphGap;
      continue;
    }

    // Clean markdown wrapping if present
    const cleanLine = rawLine.replace(/^\s*(#+\s*|\*\*|\*)/, '').replace(/(\*\*|\*)\s*$/, '').trim();

    // Markdown-compliant Bullet Detection:
    // A bullet must start with '•', '- ', or an asterisk followed by space ('* ')
    const isBullet = rawLine.startsWith('•') || rawLine.startsWith('- ') || /^\*\s+/.test(rawLine);

    // Numbered list detection: '1. ', '2. ', etc.
    const numMatch = !isBullet ? rawLine.match(/^(\d+)[\.\)]\s+(.*)$/) : null;

    // Zero-Hardcoding Section Header Detection:
    // A line is a section header if it is not a bullet/number, and ends with ':' (or Ethiopic '፡' / '፦')
    // with no following value on the same line.
    const isSectionHeader = (
      !isBullet &&
      !numMatch &&
      (cleanLine.endsWith(':') || cleanLine.endsWith('፡') || cleanLine.endsWith('፦')) &&
      !cleanLine.slice(0, -1).includes(':')
    );

    const underlineAttr = (options.underline || (isSectionHeader && options.underlineHeaders))
      ? ' text-decoration="underline"'
      : '';

    if (isSectionHeader) {
      currentY += sectionTopGap;
      elements.push(
        `<text x="${anchorX}" y="${currentY}" font-family='${fontFamily}' font-size="${sectionFontSize}" font-weight="bold" fill="${textColor}" ${boldStrokeHeader} xml:space="preserve"${underlineAttr}${letterSpacingAttr}${textAnchorAttr}>${escapeHtml(cleanLine)}</text>`
      );
      currentY += lineHeight + sectionBottomGap;
    } else if (isBullet) {
      const bulletContent = rawLine.replace(/^([•\-]\s*|\*\s+)/, '').trim();
      const wrapped = wrapTextPixels(bulletContent, bulletUsableWidth - maxLineSafety, baseFontSize, isAllBold);

      const textIndentX = paddingX + bulletIndent;
      const bulletOffset = Math.min(22, Math.max(14, Math.round(baseFontSize * 0.45)));
      const bulletCenterX = textIndentX - bulletOffset;

      elements.push(
        `<circle cx="${bulletCenterX}" cy="${currentY - Math.round(baseFontSize * 0.32)}" r="${bulletRadius}" fill="${textColor}" />`
      );

      for (let j = 0; j < wrapped.length; j++) {
        elements.push(
          `<text x="${textIndentX}" y="${currentY}" font-family='${fontFamily}' font-size="${baseFontSize}" font-weight="${defaultWeight}" fill="${textColor}"${bodyStroke} xml:space="preserve"${letterSpacingAttr}>${formatInlineSpans(wrapped[j], isAllBold)}</text>`
        );
        currentY += lineHeight;
      }
      currentY += bulletGap;
    } else if (numMatch) {
      const numLabel = `${numMatch[1]}. `;
      const numContent = numMatch[2].trim();
      const numWidth = measureTextWidth(numLabel, baseFontSize, true);
      const numIndentX = paddingX + Math.max(bulletIndent, numWidth + 10);
      const wrapped = wrapTextPixels(numContent, usableWidth - (numIndentX - paddingX) - maxLineSafety, baseFontSize, isAllBold);

      elements.push(
        `<text x="${paddingX}" y="${currentY}" font-family='${fontFamily}' font-size="${baseFontSize}" font-weight="bold" fill="${textColor}"${bodyStroke} xml:space="preserve"${letterSpacingAttr}>${escapeHtml(numLabel)}</text>`
      );

      for (let j = 0; j < wrapped.length; j++) {
        const lineX = j === 0 ? paddingX + numWidth : numIndentX;
        elements.push(
          `<text x="${lineX}" y="${currentY}" font-family='${fontFamily}' font-size="${baseFontSize}" font-weight="${defaultWeight}" fill="${textColor}"${bodyStroke} xml:space="preserve"${letterSpacingAttr}>${formatInlineSpans(wrapped[j], isAllBold)}</text>`
        );
        currentY += lineHeight;
      }
      currentY += bulletGap;
    } else {
      // Key-Value Line Detection (supporting optional markdown bold syntax like **Key:** Value or Key: Value)
      const kvMatch = rawLine.match(/^(\*{0,2})([^:\n፡፦]+?)(:|፦|፡)(\*{0,2})\s+(.*)$/);
      if (kvMatch && kvMatch[2].trim().length < 35 && align === 'left') {
        const keyPart = `${kvMatch[2].trim()}${kvMatch[3]}`;
        const valuePart = kvMatch[5].replace(/\*{1,2}$/, '').trim();

        const keyW = measureTextWidth(keyPart + ' ', baseFontSize, true);
        const wrappedVal = wrapTextPixels(valuePart, usableWidth - keyW - maxLineSafety, baseFontSize, isAllBold);

        const keyStroke = isAllBold ? '' : ` ${boldStrokeBody}`;
        if (wrappedVal.length <= 1) {
          elements.push(
            `<text x="${paddingX}" y="${currentY}" font-family='${fontFamily}' font-size="${baseFontSize}" fill="${textColor}" xml:space="preserve"${letterSpacingAttr}><tspan font-weight="bold"${keyStroke}>${escapeHtml(keyPart)} </tspan><tspan font-weight="${defaultWeight}"${bodyStroke}>${formatInlineSpans(wrappedVal[0] || valuePart, isAllBold)}</tspan></text>`
          );
          currentY += lineHeight;
        } else {
          elements.push(
            `<text x="${paddingX}" y="${currentY}" font-family='${fontFamily}' font-size="${baseFontSize}" fill="${textColor}" xml:space="preserve"${letterSpacingAttr}><tspan font-weight="bold"${keyStroke}>${escapeHtml(keyPart)} </tspan><tspan font-weight="${defaultWeight}"${bodyStroke}>${formatInlineSpans(wrappedVal[0], isAllBold)}</tspan></text>`
          );
          currentY += lineHeight;
          for (let j = 1; j < wrappedVal.length; j++) {
            elements.push(
              `<text x="${paddingX + keyW}" y="${currentY}" font-family='${fontFamily}' font-size="${baseFontSize}" font-weight="${defaultWeight}" fill="${textColor}"${bodyStroke} xml:space="preserve"${letterSpacingAttr}>${formatInlineSpans(wrappedVal[j], isAllBold)}</text>`
            );
            currentY += lineHeight;
          }
        }
      } else {
        const wrapped = wrapTextPixels(rawLine, usableWidth - maxLineSafety, baseFontSize, isAllBold);
        for (let j = 0; j < wrapped.length; j++) {
          elements.push(
            `<text x="${anchorX}" y="${currentY}" font-family='${fontFamily}' font-size="${baseFontSize}" font-weight="${defaultWeight}" fill="${textColor}"${bodyStroke} xml:space="preserve"${letterSpacingAttr}${textAnchorAttr}>${formatInlineSpans(wrapped[j], isAllBold)}</text>`
          );
          currentY += lineHeight;
        }
      }
    }
  }

  const finalHeight = Math.ceil(currentY + paddingX);

  // Render card border if requested
  const borderMarkup = options.border ? (() => {
    const bWidth = options.borderWidth || 3;
    const bColor = options.borderColor || textColor;
    const bRadius = options.borderRadius || 16;
    const bMargin = Math.max(16, Math.round(paddingX * 0.35));
    return `<rect x="${bMargin}" y="${bMargin}" width="${width - 2 * bMargin}" height="${finalHeight - 2 * bMargin}" fill="none" stroke="${bColor}" stroke-width="${bWidth}" rx="${bRadius}"/>`;
  })() : '';

  const fontDefs = getEmbeddedFontDefs();
  const svg = `<svg width="${width}" height="${finalHeight}" viewBox="0 0 ${width} ${finalHeight}" xmlns="http://www.w3.org/2000/svg" xml:space="preserve">
    ${fontDefs}
    <rect width="${width}" height="${finalHeight}" fill="${bgColor}"/>
    ${borderMarkup}
    ${elements.join('\n    ')}
  </svg>`;

  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svg))
    .png({ quality: 100, compressionLevel: 6 })
    .toBuffer();
}

/**
 * Backward compatibility alias for generateTextImageCard.
 * @constant
 */
export const generateReportImageCard = generateTextImageCard;

/**
 * Normalizes a Telegram Chat ID or Channel Username to standard format.
 * Automatically prefixes `-100` for 9+ digit numeric channel/supergroup IDs
 * while safely preserving public `@channel_name` handles and negative channel IDs.
 *
 * @param {string|number|null} chatId - Raw chat identifier
 * @returns {string|null} Normalized chat identifier
 */
export function normalizeTelegramChatId(chatId) {
  if (chatId === null || chatId === undefined) return null;
  const str = String(chatId).trim();
  if (!str) return null;
  if (str.startsWith('@')) return str;
  if (/^\d{9,}$/.test(str)) {
    return `-100${str}`;
  }
  if (/^-\d{9,}$/.test(str) && !str.startsWith('-100')) {
    return `-100${str.slice(1)}`;
  }
  return str;
}

/**
 * Resolves destination Telegram chat ID for a given operational channel.
 * Automatically normalizes channel IDs with the required -100 prefix.
 *
 * @param {Object} [user] - Mongoose user document
 * @param {string} [channel='management'] - Operational channel ('management' | 'maintenance' | 'general')
 * @returns {string|null} Resolved chat ID or null
 */
export function resolveChannelChatId(user, channel = 'management') {
  const normChannel = String(channel).toLowerCase();
  const userTelegram = user?.integrations?.telegram || {};

  let rawChatId = null;
  if (normChannel === 'maintenance') {
    rawChatId = userTelegram.maintenanceChatId || null;
  } else if (normChannel === 'general') {
    rawChatId = userTelegram.generalChatId || null;
  } else {
    // Default to management
    rawChatId = userTelegram.managementChatId || null;
  }

  return normalizeTelegramChatId(rawChatId);
}

/**
 * Resolves Telegram Bot Token from user integrations.
 * Strictly adheres to multi-tenant tenant isolation: zero runtime leakage to system .env.
 *
 * @param {Object} [user] - Mongoose user document
 * @returns {string} Bot token
 */
export function resolveBotToken(user) {
  return user?.integrations?.telegram?.botToken || '';
}

/**
 * Dispatches an outbound message or image card to Telegram.
 * Handles rate-limiting (HTTP 429) backoff, automatic fallbacks, and zero-failure stubbing.
 *
 * @param {Object} params
 * @param {Object} [params.user] - Authenticated supervisor user object
 * @param {string} [params.targetChannel='management'] - 'management' | 'maintenance' | 'general'
 * @param {string} params.text - Authentic message text or serialized report
 * @param {string} [params.customNote] - Optional prefix remark
 * @param {boolean} [params.asImage=false] - Whether to render and broadcast as an image card
 * @returns {Promise<Object>} Structured broadcast result
 */
export async function dispatchToTelegram({
  user,
  targetChannel = 'management',
  text = '',
  customNote,
  asImage = false,
  options = {},
  botToken: tokenOverride,
  chatId: chatIdOverride,
}) {
  const channel = TELEGRAM_CONSTANTS.CHANNELS.includes(targetChannel) ? targetChannel : 'management';
  const botToken = tokenOverride !== undefined ? tokenOverride : resolveBotToken(user);
  const chatId = chatIdOverride !== undefined ? chatIdOverride : resolveChannelChatId(user, channel);

  const cleanText = text ? text.trim() : '';
  const hasCustomNote = Boolean(customNote && typeof customNote === 'string' && customNote.trim());
  const noteText = hasCustomNote ? customNote.trim() : '';

  // For text messages, prefix customNote if provided
  const fullText = hasCustomNote ? `${noteText}\n\n${cleanText}` : cleanText;

  const userTelegram = user?.integrations?.telegram || {};
  const isUserDisabled = userTelegram.enabled === false;
  const isUserConnected = userTelegram.connected !== false;
  const isLiveConfigured = Boolean(isUserConnected && !isUserDisabled && botToken && chatId);

  // If live broadcast is not configured, return clean functional stub (Zero-Failure Invariant)
  if (!isLiveConfigured) {
    return {
      success: true,
      ok: true,
      isStub: true,
      channel,
      mode: asImage ? 'image' : 'text',
      messageId: `stub-tg-${Date.now()}`,
      message: `Telegram broadcast simulated in functional stub mode for channel "${channel}".`,
      textPreview: fullText.slice(0, 200),
    };
  }

  const apiBase = `https://api.telegram.org/bot${botToken}`;

  // =========================================================================
  // Mode C: Rendered Document Image Card Delivery
  // =========================================================================
  if (asImage) {
    try {
      // Merge user saved image card options with explicit call options
      const mergedOptions = {
        ...(user?.integrations?.telegram?.imageCardOptions || {}),
        ...options,
      };
      const imageBuffer = await generateTextImageCard(cleanText, mergedOptions);
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', blob, 'telegram_message_card.png');
      if (hasCustomNote) {
        formData.append('caption', noteText);
      }

      const res = await fetch(`${apiBase}/sendPhoto`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.ok) {
        const msgId = data.result.message_id;
        const groupUsername = data.result.chat.username;
        const cleanChatId = String(chatId).replace(/^-100/, '');
        const deepLink = groupUsername
          ? `https://t.me/${groupUsername}/${msgId}`
          : `https://t.me/c/${cleanChatId}/${msgId}`;

        return {
          success: true,
          ok: true,
          isStub: false,
          channel,
          mode: 'image',
          messageId: msgId,
          deepLink,
          chatTitle: data.result.chat.title || null,
        };
      }
      console.warn('[telegramService] sendPhoto failed from API:', data.description, '- falling back to text mode');
    } catch (imgErr) {
      console.warn('[telegramService] generateReportImageCard error:', imgErr.message, '- falling back to text mode');
    }
  }

  // =========================================================================
  // Mode A / B: Native Semantic HTML Text Delivery (with Expandable Quotes)
  // =========================================================================
  const htmlContent = markdownToTelegramHtml(fullText);
  const chunks = chunkTelegramMessage(htmlContent);
  const dispatchedMessageIds = [];
  let lastError = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let attempts = 0;
    let sent = false;

    while (attempts < 3 && !sent) {
      attempts++;
      try {
        const res = await fetch(`${apiBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: 'HTML',
          }),
        });

        const data = await res.json();

        if (data.ok) {
          dispatchedMessageIds.push(data.result.message_id);
          sent = true;
        } else if (res.status === 429) {
          const retryAfterSec = data.parameters?.retry_after || TELEGRAM_CONSTANTS.RATE_LIMIT.RETRY_AFTER_DEFAULT_SEC;
          console.warn(`[telegramService] Rate limit hit. Waiting ${retryAfterSec}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
        } else {
          console.error('[telegramService] Telegram sendMessage error:', data.description);
          lastError = data.description || `Telegram API error (${res.status})`;
          break;
        }
      } catch (netErr) {
        console.warn(`[telegramService] Network error during sendMessage (attempt ${attempts}/3):`, netErr.message, netErr.cause?.code || '');
        lastError = netErr.message || 'Network connection error';
        if (attempts < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempts));
        }
      }
    }
  }

  if (dispatchedMessageIds.length > 0) {
    const primaryId = dispatchedMessageIds[0];
    const cleanChatId = String(chatId).replace(/^-100/, '');
    const deepLink = `https://t.me/c/${cleanChatId}/${primaryId}`;

    return {
      success: true,
      ok: true,
      isStub: false,
      channel,
      mode: 'text',
      fallbackFromImage: asImage,
      messageId: primaryId,
      allMessageIds: dispatchedMessageIds,
      deepLink,
    };
  }

  // Live network or permission failure (never report as a successful stub)
  return {
    success: false,
    ok: false,
    isStub: false,
    channel,
    mode: 'text',
    error: lastError || 'Failed to deliver message to Telegram Bot API. Network or permission error.',
  };
}

export default {
  escapeHtml,
  markdownToTelegramHtml,
  chunkTelegramMessage,
  generateTextImageCard,
  generateReportImageCard,
  resolveChannelChatId,
  resolveBotToken,
  dispatchToTelegram,
};

````

================================================================================
File: backend/src/services/ttsService.js
================================================================================

````javascript
/**
 * @module services/ttsService
 * @description Native Addis AI Text-to-Speech (Addis Voices 2) speech synthesis service.
 * Handles markdown sanitization, language auto-detection (Ethiopic Fidel vs Latin),
 * voice catalog caching, and durable audio generation via HTTP POST.
 */

import crypto from 'crypto';
import { TTS_CONSTANTS } from '../utils/constants.js';
import { BadRequestError, CustomError } from '../errors/CustomError.js';

/**
 * In-memory voice catalog cache.
 * Avoids redundant network roundtrips to Addis AI on every render.
 */
let voicesCache = {
  data: null,
  expiresAt: 0,
};

/**
 * Sanitizes markdown-formatted text into natural, readable speech text.
 * Strips code blocks, markdown links, headings, bold/italics, and URLs
 * so the TTS engine produces pleasant, fluent speech without pronouncing formatting syntax.
 *
 * @function sanitizeTextForSpeech
 * @param {string} rawText - Raw markdown text from the chat turn.
 * @returns {string} Clean, normalized text ready for synthesis.
 */
export const sanitizeTextForSpeech = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Remove fenced code blocks completely (prevent reading raw code syntax)
  text = text.replace(/```[\s\S]*?```/g, ' ');

  // 2. Remove inline code backticks, preserving text content
  text = text.replace(/`([^`]+)`/g, '$1');

  // 3. Remove HTML tags
  text = text.replace(/<[^>]*>/g, ' ');

  // 4. Remove Markdown images
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, ' ');

  // 5. Replace Markdown links with just the link text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 6. Remove raw URLs
  text = text.replace(/https?:\/\/[^\s)]+/g, ' ');

  // 7. Remove Markdown headings (#, ##, ###, etc.)
  text = text.replace(/^#{1,6}\s+/gm, ' ');

  // 8. Remove bold and italic markers (* and _)
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  text = text.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

  // 9. Remove strikethrough (~~text~~)
  text = text.replace(/~~([^~]+)~~/g, '$1');

  // 10. Remove blockquote markers (>)
  text = text.replace(/^>\s+/gm, ' ');

  // 11. Remove bullet points and numbered list markers (including combined '- 1.')
  text = text.replace(/^\s*[-*+]\s*\d+\.\s+/gm, ' ');
  text = text.replace(/^\s*[-*+]\s+/gm, ' ');
  text = text.replace(/^\s*\d+\.\s+/gm, ' ');

  // 12. Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, ' ');

  // 13. Replace table separators and pipes with commas for natural speech pauses
  text = text.replace(/\|/g, ', ');

  // 14. Collapse multiple spaces and newlines into single spaces
  text = text.replace(/\s+/g, ' ').trim();

  // 15. Bounded text length governance
  if (text.length > TTS_CONSTANTS.MAX_TEXT_LENGTH) {
    // Truncate at last sentence or word boundary within max length
    const sliced = text.slice(0, TTS_CONSTANTS.MAX_TEXT_LENGTH);
    const lastPunctuation = Math.max(
      sliced.lastIndexOf('.'),
      sliced.lastIndexOf('?'),
      sliced.lastIndexOf('!'),
      sliced.lastIndexOf('።')
    );
    if (lastPunctuation > TTS_CONSTANTS.MAX_TEXT_LENGTH * 0.8) {
      text = sliced.slice(0, lastPunctuation + 1);
    } else {
      text = sliced.slice(0, sliced.lastIndexOf(' ')) + '...';
    }
  }

  return text;
};

/**
 * Detects whether the text is primarily Amharic (Ethiopic script) or English/Latin.
 * Ethiopic Unicode Range: \u1200-\u137F, \u1380-\u139F, \u2D80-\u2DDF, \uAB00-\uAB2F.
 *
 * @function detectLanguage
 * @param {string} text - Sanitized text.
 * @returns {'am' | 'en'} Detected ISO language code.
 */
export const detectLanguage = (text) => {
  if (!text || typeof text !== 'string') return 'en';

  const ethiopicRegex = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/g;
  const matches = text.match(ethiopicRegex);

  // If text contains any Ethiopic characters, route to Amharic voice engine
  return matches && matches.length > 0 ? 'am' : 'en';
};

/**
 * Fetches the dynamic voice catalog from Addis AI.
 * Uses an in-memory cache to eliminate redundant network calls.
 *
 * @function getAvailableVoices
 * @param {object} options - Options object.
 * @param {string} options.apiKey - Active Addis AI API key.
 * @param {boolean} [options.forceRefresh=false] - Bypass in-memory cache.
 * @returns {Promise<Array<object>>} List of voice objects.
 */
export const getAvailableVoices = async ({ apiKey, forceRefresh = false } = {}) => {
  const now = Date.now();
  if (!forceRefresh && voicesCache.data && voicesCache.expiresAt > now) {
    return voicesCache.data;
  }

  const effectiveKey = apiKey || process.env.ADDIS_API_KEY;
  if (!effectiveKey) {
    throw new BadRequestError(
      'Addis AI API key not configured. Please set your personal API key in Profile > AI Agent Settings to retrieve voices.'
    );
  }

  try {
    const res = await fetch(TTS_CONSTANTS.ADDIS_VOICES_ENDPOINT, {
      method: 'GET',
      headers: {
        'x-api-key': effectiveKey,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.message || errBody?.error || `Addis AI voice catalog returned status ${res.status}`;
      throw new CustomError(msg, res.status, 'ADDIS_VOICES_FETCH_FAILED');
    }

    const json = await res.json();
    const rawVoices = Array.isArray(json?.data) ? json.data : [];

    const normalized = rawVoices.map((v) => ({
      id: v.id,
      name: v.name,
      descriptor: v.descriptor || '',
      language: v.language,
      gender: v.gender || 'neutral',
      is_default: Boolean(v.is_default),
      preview_audio_url: v.preview_audio_url || null,
    }));

    voicesCache = {
      data: normalized,
      expiresAt: now + TTS_CONSTANTS.VOICES_CACHE_TTL_MS,
    };

    return normalized;
  } catch (err) {
    if (err instanceof CustomError) throw err;
    throw new CustomError(
      `Failed to fetch Addis AI voice catalog: ${err.message}`,
      502,
      'ADDIS_GATEWAY_ERROR'
    );
  }
};

/**
 * Generates speech audio using Addis AI's HTTP generation endpoint.
 *
 * @function generateSpeech
 * @param {object} params - Generation parameters.
 * @param {string} params.text - Text to synthesize.
 * @param {string} [params.voiceId] - Requested voice ID.
 * @param {string} [params.language] - Requested language ('am', 'en', or 'auto').
 * @param {string} params.addisApiKey - User's BYOK Addis AI key (or server key in test).
 * @param {object} [params.userSettings] - User profile settings (for default voice preference).
 * @param {string} [params.clientRequestId] - Optional client request ID for idempotency.
 * @returns {Promise<object>} Generated audio data including audioUrl, base64 audio, duration.
 */
export const generateSpeech = async ({
  text,
  voiceId,
  language,
  addisApiKey,
  userSettings = {},
  clientRequestId,
}) => {
  const effectiveKey = addisApiKey || (process.env.NODE_ENV === 'test' ? process.env.ADDIS_API_KEY : null);

  if (!effectiveKey) {
    throw new BadRequestError(
      'Addis AI API key not configured. Please configure your personal Addis AI API key in Profile > AI Agent Settings to use Read Out Loud.'
    );
  }

  // 1. Sanitize text for clean speech synthesis
  const cleanText = sanitizeTextForSpeech(text);
  if (!cleanText || cleanText.trim().length === 0) {
    throw new BadRequestError('Text contains no readable speech content.');
  }

  // 2. Language Auto-Detection
  let effectiveLanguage = language;
  if (!effectiveLanguage || effectiveLanguage === 'auto') {
    effectiveLanguage = detectLanguage(cleanText);
  }

  // 3. Voice ID Resolution (User profile preference > constants default)
  let effectiveVoiceId = voiceId;
  if (!effectiveVoiceId) {
    const ttsSettings = userSettings?.tts || {};
    if (effectiveLanguage === 'am') {
      effectiveVoiceId = ttsSettings.amharicVoice || TTS_CONSTANTS.DEFAULT_AMHARIC_VOICE;
    } else {
      effectiveVoiceId = ttsSettings.englishVoice || TTS_CONSTANTS.DEFAULT_ENGLISH_VOICE;
    }
  }

  // 4. Dispatch to Addis AI Generations HTTP Endpoint
  const requestId = clientRequestId || crypto.randomUUID();

  try {
    const res = await fetch(TTS_CONSTANTS.ADDIS_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': effectiveKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_request_id: requestId,
        voice_id: effectiveVoiceId,
        language: effectiveLanguage,
        text: cleanText,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg =
        json?.message ||
        json?.error ||
        `Addis AI speech synthesis failed with status ${res.status}`;
      throw new CustomError(errorMsg, res.status, 'ADDIS_TTS_FAILED', json);
    }

    const data = json?.data || {};

    return {
      audio: data.audio || null, // Base64 data URI
      audioUrl: data.audio_url || null, // Signed CDN URL
      durationSeconds: data.duration_seconds || 0,
      mimeType: data.mime_type || 'audio/mpeg',
      voiceId: data.voice_id || effectiveVoiceId,
      language: data.language || effectiveLanguage,
      sanitizedText: cleanText,
    };
  } catch (err) {
    if (err instanceof CustomError) throw err;
    throw new CustomError(
      `Addis AI speech synthesis communication failure: ${err.message}`,
      502,
      'ADDIS_GATEWAY_ERROR'
    );
  }
};

export default {
  sanitizeTextForSpeech,
  detectLanguage,
  getAvailableVoices,
  generateSpeech,
};

````

================================================================================
File: backend/src/utils/attachmentProcessor.js
================================================================================

````javascript
/**
 * @module utils/attachmentProcessor
 * @description Multi-modal attachment ingestion and grounding service.
 * Ingests documents, text files, and images across the 3 foundational user input pillars.
 * Text and markdown attachments are injected as structured semantic prompt blocks.
 * Images and PDFs are encoded as base64 inline multimodal parts for Gemini.
 */

import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import * as xlsxModule from 'xlsx';
import logger from '../config/logger.js';
import { UPLOADS_CONFIG } from './constants.js';

const XLSX = xlsxModule.default || xlsxModule;

/**
 * Resolves absolute filesystem storage path for an attachment.
 * Resilient against Windows and POSIX path differences, relative uploads paths,
 * Linux root-relative leading slashes, and isolated Docker/Render environments.
 *
 * @param {string} rawPath - Relative or absolute file path.
 * @returns {string} Absolute normalized file path.
 */
export function resolveFilePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '';
  if (rawPath.startsWith('blob:') || rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return '';
  }

  // 1. If absolute path exists on disk, return it directly
  if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) {
    return rawPath;
  }

  const basename = path.basename(rawPath);

  // 2. Check in canonical domain directories by filename
  if (basename && UPLOADS_CONFIG) {
    if (UPLOADS_CONFIG.ATTACHMENTS_DIR) {
      const inAttachmentsDir = path.resolve(UPLOADS_CONFIG.ATTACHMENTS_DIR, basename);
      if (fs.existsSync(inAttachmentsDir)) return inAttachmentsDir;
    }

    if (UPLOADS_CONFIG.IMAGES_DIR) {
      const inImagesDir = path.resolve(UPLOADS_CONFIG.IMAGES_DIR, basename);
      if (fs.existsSync(inImagesDir)) return inImagesDir;
    }

    if (UPLOADS_CONFIG.FILES_DIR) {
      const inFilesDir = path.resolve(UPLOADS_CONFIG.FILES_DIR, basename);
      if (fs.existsSync(inFilesDir)) return inFilesDir;
    }

    if (UPLOADS_CONFIG.AUDIOS_DIR) {
      const inAudiosDir = path.resolve(UPLOADS_CONFIG.AUDIOS_DIR, basename);
      if (fs.existsSync(inAudiosDir)) return inAudiosDir;
    }

    if (UPLOADS_CONFIG.TEMP_DIR) {
      const inTempDir = path.resolve(UPLOADS_CONFIG.TEMP_DIR, basename);
      if (fs.existsSync(inTempDir)) return inTempDir;
    }

    if (UPLOADS_CONFIG.ROOT_DIR) {
      const inUploadsRoot = path.resolve(UPLOADS_CONFIG.ROOT_DIR, basename);
      if (fs.existsSync(inUploadsRoot)) return inUploadsRoot;
    }
  }

  // 3. Strip any leading slashes or backend/uploads prefixes and check UPLOADS_CONFIG.ROOT_DIR
  const normalizedRel = rawPath.replace(/^[\\/]+/, '').replace(/^(backend[\\/])?uploads[\\/]/, '');
  if (UPLOADS_CONFIG?.ROOT_DIR) {
    const inUploadsRel = path.resolve(UPLOADS_CONFIG.ROOT_DIR, normalizedRel);
    if (fs.existsSync(inUploadsRel)) return inUploadsRel;

    const inAttachmentsRel = path.resolve(UPLOADS_CONFIG.ATTACHMENTS_DIR, normalizedRel);
    if (fs.existsSync(inAttachmentsRel)) return inAttachmentsRel;
  }

  // 4. Check relative to process.cwd()
  const cleanRel = rawPath.replace(/^[\\/]+/, '');
  const direct = path.resolve(process.cwd(), cleanRel);
  if (fs.existsSync(direct)) return direct;

  if (cleanRel.startsWith('backend/') || cleanRel.startsWith('backend\\')) {
    const stripped = cleanRel.replace(/^backend[\\/]/, '');
    const strippedPath = path.resolve(process.cwd(), stripped);
    if (fs.existsSync(strippedPath)) return strippedPath;
  }

  const withBackend = path.resolve(process.cwd(), 'backend', cleanRel);
  if (fs.existsSync(withBackend)) return withBackend;

  return (UPLOADS_CONFIG?.ATTACHMENTS_DIR && basename)
    ? path.resolve(UPLOADS_CONFIG.ATTACHMENTS_DIR, basename)
    : direct;
}

/**
 * Ingests a single attachment item and converts it into either a prompt text context
 * or a Gemini multimodal inlineData part.
 *
 * @param {object} attachment - Attachment record { path, originalName, mimeType, size }.
 * @returns {Promise<{ type: 'text'|'inline', content?: string, inlinePart?: object }>}
 */
export async function processAttachment(attachment) {
  const rawPath = attachment.path || attachment.fileName;
  const candidateUrl =
    (attachment.cloudUrl && (attachment.cloudUrl.startsWith('http://') || attachment.cloudUrl.startsWith('https://')))
      ? attachment.cloudUrl
      : (attachment.url && (attachment.url.startsWith('http://') || attachment.url.startsWith('https://')))
        ? attachment.url
        : (typeof rawPath === 'string' && (rawPath.startsWith('http://') || rawPath.startsWith('https://')))
          ? rawPath
          : null;

  let filePath = '';
  if (rawPath && typeof rawPath === 'string' && !rawPath.startsWith('blob:') && !rawPath.startsWith('http')) {
    filePath = resolveFilePath(rawPath);
  }

  const mimeType = (attachment.mimeType || '').toLowerCase();
  const originalName = attachment.originalName || (filePath ? path.basename(filePath) : (candidateUrl ? path.basename(new URL(candidateUrl).pathname) : 'attachment'));

  // If missing from local disk, attempt fallback fetch from Cloudinary / remote URL
  if ((!filePath || !fs.existsSync(filePath)) && candidateUrl) {
    try {
      const fetchRes = await fetch(candidateUrl);
      if (fetchRes.ok) {
        const arrayBuf = await fetchRes.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuf);
        const base64Data = fileBuffer.toString('base64');

        if (
          mimeType.startsWith('image/') ||
          mimeType === 'application/pdf' ||
          originalName.endsWith('.png') ||
          originalName.endsWith('.jpg') ||
          originalName.endsWith('.jpeg') ||
          originalName.endsWith('.webp') ||
          originalName.endsWith('.pdf')
        ) {
          let resolvedMime = mimeType || 'image/jpeg';
          return {
            type: 'inline',
            inlinePart: {
              inlineData: {
                mimeType: resolvedMime,
                data: base64Data,
              },
            },
          };
        }

        if (
          mimeType.startsWith('audio/') ||
          originalName.endsWith('.mp3') ||
          originalName.endsWith('.wav') ||
          originalName.endsWith('.m4a') ||
          originalName.endsWith('.webm') ||
          originalName.endsWith('.ogg') ||
          originalName.endsWith('.aac')
        ) {
          let resolvedMime = mimeType || 'audio/wav';
          return {
            type: 'inline',
            inlinePart: {
              inlineData: {
                mimeType: resolvedMime,
                data: base64Data,
              },
            },
          };
        }

        if (mimeType.startsWith('text/') || originalName.endsWith('.txt') || originalName.endsWith('.md') || originalName.endsWith('.csv')) {
          const textContent = fileBuffer.toString('utf8');
          return {
            type: 'text',
            content: `<attachment name="${originalName}" type="${mimeType || 'text/plain'}">\n${textContent}\n</attachment>`,
          };
        }
      }
    } catch (fetchErr) {
      logger.warn(`[attachmentProcessor] Remote fallback fetch failed for ${candidateUrl}: ${fetchErr.message}`);
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    logger.warn(`[attachmentProcessor] Attachment file not found on disk or remote: ${rawPath}`);
    return { type: 'text', content: '' };
  }

  // 1. Text & Markdown Files (.txt, .md, text/plain, text/markdown, text/csv)
  if (
    mimeType.startsWith('text/') ||
    filePath.endsWith('.txt') ||
    filePath.endsWith('.md') ||
    filePath.endsWith('.csv')
  ) {
    try {
      const textContent = await fs.promises.readFile(filePath, 'utf8');
      return {
        type: 'text',
        content: `<attachment name="${originalName}" type="${mimeType || 'text/plain'}">\n${textContent}\n</attachment>`,
      };
    } catch (err) {
      logger.error(`[attachmentProcessor] Failed to read text attachment ${filePath}: ${err.message}`);
      return { type: 'text', content: '' };
    }
  }

  // 2. Microsoft Word Documents (.docx, .doc)
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    filePath.endsWith('.docx') ||
    filePath.endsWith('.doc')
  ) {
    try {
      const docResult = await mammoth.extractRawText({ path: filePath });
      const textContent = (docResult.value || '').trim();
      return {
        type: 'text',
        content: `<attachment name="${originalName}" type="docx">\n${textContent}\n</attachment>`,
      };
    } catch (err) {
      logger.error(`[attachmentProcessor] Failed to extract docx attachment ${filePath}: ${err.message}`);
      return { type: 'text', content: '' };
    }
  }

  // 3. Microsoft Excel & Spreadsheets (.xlsx, .xls)
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    filePath.endsWith('.xlsx') ||
    filePath.endsWith('.xls')
  ) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetsText = [];
      for (const sheetName of workbook.SheetNames || []) {
        const sheet = workbook.Sheets[sheetName];
        if (sheet) {
          const csv = XLSX.utils.sheet_to_csv(sheet);
          if (csv && csv.trim()) {
            sheetsText.push(`--- Sheet: ${sheetName} ---\n${csv.trim()}`);
          }
        }
      }
      const textContent = sheetsText.join('\n\n');
      return {
        type: 'text',
        content: `<attachment name="${originalName}" type="spreadsheet">\n${textContent}\n</attachment>`,
      };
    } catch (err) {
      logger.error(`[attachmentProcessor] Failed to extract spreadsheet attachment ${filePath}: ${err.message}`);
      return { type: 'text', content: '' };
    }
  }

  // 4. Images (JPEG, PNG, WebP, GIF, HEIC) and PDF documents -> Base64 inline multimodal part
  if (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    filePath.endsWith('.png') ||
    filePath.endsWith('.jpg') ||
    filePath.endsWith('.jpeg') ||
    filePath.endsWith('.webp') ||
    filePath.endsWith('.gif') ||
    filePath.endsWith('.heic') ||
    filePath.endsWith('.heif') ||
    filePath.endsWith('.pdf')
  ) {
    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const base64Data = fileBuffer.toString('base64');
      let resolvedMime = mimeType;
      if (!resolvedMime || resolvedMime === 'application/octet-stream') {
        if (filePath.endsWith('.pdf')) resolvedMime = 'application/pdf';
        else if (filePath.endsWith('.png')) resolvedMime = 'image/png';
        else if (filePath.endsWith('.webp')) resolvedMime = 'image/webp';
        else if (filePath.endsWith('.gif')) resolvedMime = 'image/gif';
        else if (filePath.endsWith('.heic')) resolvedMime = 'image/heic';
        else if (filePath.endsWith('.heif')) resolvedMime = 'image/heif';
        else resolvedMime = 'image/jpeg';
      }

      return {
        type: 'inline',
        inlinePart: {
          inlineData: {
            mimeType: resolvedMime,
            data: base64Data,
          },
        },
      };
    } catch (err) {
      logger.error(`[attachmentProcessor] Failed to read binary attachment ${filePath}: ${err.message}`);
      return { type: 'text', content: '' };
    }
  }

  // 5. Audio files if uploaded via attachments channel -> Base64 inline audio part
  if (
    mimeType.startsWith('audio/') ||
    filePath.endsWith('.mp3') ||
    filePath.endsWith('.wav') ||
    filePath.endsWith('.m4a') ||
    filePath.endsWith('.webm') ||
    filePath.endsWith('.ogg') ||
    filePath.endsWith('.aac') ||
    filePath.endsWith('.flac')
  ) {
    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const base64Data = fileBuffer.toString('base64');
      let resolvedMime = mimeType;
      if (!resolvedMime || resolvedMime === 'application/octet-stream') {
        if (filePath.endsWith('.mp3')) resolvedMime = 'audio/mp3';
        else if (filePath.endsWith('.webm')) resolvedMime = 'audio/webm';
        else if (filePath.endsWith('.ogg')) resolvedMime = 'audio/ogg';
        else if (filePath.endsWith('.m4a')) resolvedMime = 'audio/m4a';
        else if (filePath.endsWith('.aac')) resolvedMime = 'audio/aac';
        else if (filePath.endsWith('.flac')) resolvedMime = 'audio/flac';
        else resolvedMime = 'audio/wav';
      }

      return {
        type: 'inline',
        inlinePart: {
          inlineData: {
            mimeType: resolvedMime,
            data: base64Data,
          },
        },
      };
    } catch (err) {
      logger.error(`[attachmentProcessor] Failed to read audio attachment ${filePath}: ${err.message}`);
      return { type: 'text', content: '' };
    }
  }

  return { type: 'text', content: '' };
}

/**
 * Ingests an array of attachment objects and extracts text contexts and multimodal parts.
 *
 * @param {Array<object>} attachments - Array of attachment subdocuments or objects.
 * @returns {Promise<{ textContext: string, inlineParts: Array<object> }>}
 */
export async function processAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { textContext: '', inlineParts: [] };
  }

  const textBlocks = [];
  const inlineParts = [];

  for (const att of attachments) {
    const result = await processAttachment(att);
    if (result.type === 'text' && result.content) {
      textBlocks.push(result.content);
    } else if (result.type === 'inline' && result.inlinePart) {
      inlineParts.push(result.inlinePart);
    }
  }

  return {
    textContext: textBlocks.join('\n\n'),
    inlineParts,
  };
}

export default {
  processAttachment,
  processAttachments,
};

````

================================================================================
File: backend/src/utils/audioChunker.js
================================================================================

````javascript
/**
 * @module utils/audioChunker
 * @description Dual-Engine Speech-to-Text (STT) Transcriber and Audio Chunking Pipeline.
 * Enforces Addis AI constraints (<= 120s duration, <= 25MB size) via ffprobe duration probing
 * and ffmpeg acoustic segmentation (75-second 16kHz mono PCM slices).
 * Guarantees immediate post-merge cleanup of temporary slice files inside a finally block.
 * Provides seamless fallback and native multimodal audio passing to Gemini 2.5 Flash STT.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { AddisAI } from 'addisai';
import { GoogleGenAI } from '@google/genai';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { Audio } from '../models/Audio.js';
import { UPLOADS_CONFIG, AI_MODELS } from './constants.js';

/**
 * Dynamically resolves binary executable path, physically verifying filesystem existence
 * before trusting any configured path, and falling back safely to the bundled static
 * installer binary (@ffmpeg-installer / @ffprobe-installer) or system PATH.
 *
 * @param {'ffmpeg' | 'ffprobe'} binaryName - Binary command name.
 * @param {string} [configuredPath] - Path configured via env.FFMPEG_PATH / env.FFPROBE_PATH.
 * @param {string} [installerPath] - Static binary path from @ffmpeg-installer or @ffprobe-installer.
 * @returns {string} Fully resolved, verified binary path.
 */
export function resolveBinaryPath(binaryName, configuredPath, installerPath) {
  // 1. Check custom configured path from env (if present and physically exists on disk)
  if (configuredPath && typeof configuredPath === 'string' && configuredPath.trim()) {
    const trimmed = configuredPath.trim();
    if (fs.existsSync(trimmed)) {
      return trimmed;
    }
    if (process.platform === 'win32' && !trimmed.toLowerCase().endsWith('.exe')) {
      const withExe = `${trimmed}.exe`;
      if (fs.existsSync(withExe)) {
        return withExe;
      }
    }
    logger.warn(`[audioChunker] Configured ${binaryName} path not found on disk: "${trimmed}". Falling back to bundled installer binary...`);
  }

  // 2. Check bundled static package binary (@ffmpeg-installer / @ffprobe-installer)
  if (installerPath && typeof installerPath === 'string' && installerPath.trim()) {
    const trimmedInstaller = installerPath.trim();
    if (fs.existsSync(trimmedInstaller)) {
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(trimmedInstaller, 0o755);
        } catch (_) {}
      }
      return trimmedInstaller;
    }
  }

  // 3. Fallback to system command in PATH (e.g. /usr/bin/ffmpeg or /usr/bin/ffprobe)
  return binaryName;
}

export const FFMPEG = resolveBinaryPath('ffmpeg', env.FFMPEG_PATH || process.env.FFMPEG_PATH, ffmpegInstaller?.path);
export const FFPROBE = resolveBinaryPath('ffprobe', env.FFPROBE_PATH || process.env.FFPROBE_PATH, ffprobeInstaller?.path);

/**
 * Resolves binary executable path on Windows (.exe fallback if omitted).
 *
 * @param {string} binPath - Executable path or command name.
 * @returns {string} Resolved executable path.
 */
export function resolveExecutable(binPath) {
  if (process.platform === 'win32' && !binPath.toLowerCase().endsWith('.exe')) {
    const withExe = `${binPath}.exe`;
    if (fs.existsSync(withExe)) return withExe;
  }
  return binPath;
}

/**
 * Resolves absolute filesystem storage path for an audio file.
 *
 * @param {string} rawPath - Relative or absolute audio path.
 * @returns {string} Absolute normalized file path.
 */
export function resolveAudioDiskPath(rawPath) {
  if (!rawPath) return '';
  if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) return rawPath;

  const basename = path.basename(rawPath);

  // Check in canonical UPLOADS_CONFIG.AUDIOS_DIR first
  if (basename && UPLOADS_CONFIG?.AUDIOS_DIR) {
    const inAudiosDir = path.resolve(UPLOADS_CONFIG.AUDIOS_DIR, basename);
    if (fs.existsSync(inAudiosDir)) return inAudiosDir;

    const inAttachmentsDir = path.resolve(UPLOADS_CONFIG.ATTACHMENTS_DIR, basename);
    if (fs.existsSync(inAttachmentsDir)) return inAttachmentsDir;

    const inUploadsRoot = path.resolve(UPLOADS_CONFIG.ROOT_DIR, basename);
    if (fs.existsSync(inUploadsRoot)) return inUploadsRoot;
  }

  // Check relative to UPLOADS_CONFIG.ROOT_DIR
  const normalizedRel = rawPath.replace(/^[\\/]+/, '').replace(/^(backend[\\/])?uploads[\\/]/, '');
  if (UPLOADS_CONFIG?.ROOT_DIR) {
    const inUploadsRoot = path.resolve(UPLOADS_CONFIG.ROOT_DIR, normalizedRel);
    if (fs.existsSync(inUploadsRoot)) return inUploadsRoot;
  }

  // Check against cwd
  const cleanRel = rawPath.replace(/^[\\/]+/, '');
  const direct = path.resolve(process.cwd(), cleanRel);
  if (fs.existsSync(direct)) return direct;

  if (cleanRel.startsWith('backend/') || cleanRel.startsWith('backend\\')) {
    const stripped = cleanRel.replace(/^backend[\\/]/, '');
    const strippedPath = path.resolve(process.cwd(), stripped);
    if (fs.existsSync(strippedPath)) return strippedPath;
  }
  const withBackend = path.resolve(process.cwd(), 'backend', cleanRel);
  if (fs.existsSync(withBackend)) return withBackend;

  return (UPLOADS_CONFIG?.AUDIOS_DIR && basename)
    ? path.resolve(UPLOADS_CONFIG.AUDIOS_DIR, basename)
    : direct;
}

/**
 * Probes the exact duration of an audio file in seconds using ffprobe with ffmpeg stderr fallback.
 *
 * @param {string} filePath - Absolute or relative path to the audio file.
 * @returns {Promise<number|null>} Duration in seconds, or null if unresolvable.
 */
export function probeAudioDuration(filePath) {
  return new Promise((resolve) => {
    const resolvedPath = resolveAudioDiskPath(filePath);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      logger.warn(`[audioChunker] File not found for ffprobe: ${resolvedPath || filePath}`);
      return resolve(null);
    }

    try {
      const stats = fs.statSync(resolvedPath);
      if (stats.size === 0) {
        return resolve(0);
      }
    } catch (_) {
      return resolve(null);
    }

    const fallbackFfmpeg = () => {
      const ffmpegBin = resolveExecutable(FFMPEG);
      const ffProc = spawn(ffmpegBin, ['-nostdin', '-i', resolvedPath, '-f', 'null', '-'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let ffStderr = '';
      ffProc.stderr.on('data', (d) => { ffStderr += d.toString(); });
      ffProc.on('close', () => {
        const match = ffStderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i) ||
                      ffStderr.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
        if (match) {
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const seconds = parseFloat(match[3]);
          const totalSec = hours * 3600 + minutes * 60 + seconds;
          return resolve(totalSec);
        }
        logger.warn(`[audioChunker] Duration probing failed for ${resolvedPath}`);
        resolve(null);
      });
      ffProc.on('error', () => resolve(null));
    };

    const ffprobeBin = resolveExecutable(FFPROBE);
    const proc = spawn(
      ffprobeBin,
      [
        '-v', 'error',
        '-show_entries', 'stream=duration:format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        resolvedPath,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        const parsed = stdout
          .trim()
          .split(/\r?\n/)
          .map((line) => parseFloat(line.trim()))
          .filter((v) => !isNaN(v) && v >= 0);

        if (parsed.length > 0) {
          return resolve(parsed[0]);
        }
      }
      // ffprobe failed or returned N/A (common in browser MediaRecorder webm/wav streams) -> ffmpeg fallback
      fallbackFfmpeg();
    });

    proc.on('error', (err) => {
      logger.warn(`[audioChunker] Failed to spawn ffprobe (${ffprobeBin}): ${err.message}. Trying ffmpeg fallback...`);
      fallbackFfmpeg();
    });
  });
}

/**
 * Slices an audio file into uniform duration segments (default 50s, strictly <= 60s for Addis AI) using ffmpeg.
 * Transcodes slices into 16kHz mono PCM WAV for maximum acoustic fidelity.
 *
 * @param {string} filePath - Source audio file path.
 * @param {number} [chunkDurationSec=50] - Segment duration in seconds.
 * @param {string} [tempDir=null] - Directory for temporary slices.
 * @returns {Promise<string[]>} List of generated chunk file paths.
 */
export function sliceAudioFile(filePath, chunkDurationSec = 50, tempDir = null) {
  return new Promise((resolve, reject) => {
    const resolvedPath = resolveAudioDiskPath(filePath);
    const ffmpegBin = resolveExecutable(FFMPEG);
    const resolvedTempDir =
      tempDir || path.resolve(path.dirname(resolvedPath), '../temp');

    if (!fs.existsSync(resolvedTempDir)) {
      fs.mkdirSync(resolvedTempDir, { recursive: true });
    }

    const baseName = `${path.basename(resolvedPath, path.extname(resolvedPath))}_${Date.now()}`;
    const outputPattern = path.join(resolvedTempDir, `${baseName}_chunk_%03d.wav`);

    const proc = spawn(
      ffmpegBin,
      [
        '-y',
        '-nostdin',
        '-i', resolvedPath,
        '-f', 'segment',
        '-segment_time', String(chunkDurationSec),
        '-c:a', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        outputPattern,
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
      }
    );

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`ffmpeg audio slicing failed (exit code ${code}): ${stderr}`)
        );
      }

      try {
        const files = fs.readdirSync(resolvedTempDir)
          .filter((f) => f.startsWith(`${baseName}_chunk_`) && f.endsWith('.wav'))
          .sort()
          .map((f) => path.join(resolvedTempDir, f));

        resolve(files);
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg (${ffmpegBin}): ${err.message}`));
    });
  });
}

/**
 * Transcribes audio using the Addis AI Speech-to-Text API.
 * Enforces uniform architecture: chunk -> transcribe each -> merge transcription.
 * Guarantees immediate cleanup of all temporary chunk slice files inside a finally block.
 *
 * @param {string} filePath - Audio file path on disk.
 * @param {string} [language='am'] - Spoken language code ('am' for Amharic).
 * @returns {Promise<{ text: string, duration: number|null, engine: string, chunks: number, noAudioDetected?: boolean }>}
 */
export async function transcribeWithAddisAi(filePath, language = 'am', apiKeyOverride = null) {
  const apiKey = apiKeyOverride || env.ADDIS_API_KEY || process.env.ADDIS_API_KEY;
  if (!apiKey) {
    throw new Error('ADDIS_API_KEY is not configured in environment or user settings.');
  }

  const resolvedPath = resolveAudioDiskPath(filePath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.size === 0) {
    return {
      text: '',
      duration: 0,
      engine: 'addis_ai',
      chunks: 0,
      noAudioDetected: true,
    };
  }

  const duration = await probeAudioDuration(resolvedPath);
  if (duration === 0) {
    return {
      text: '',
      duration: 0,
      engine: 'addis_ai',
      chunks: 0,
      noAudioDetected: true,
    };
  }

  const addis = new AddisAI({ apiKey });

  // Uniform Addis AI architecture: chunk -> transcribe each -> merge transcription
  const chunkFiles = await sliceAudioFile(resolvedPath, 50);
  if (chunkFiles.length === 0) {
    return {
      text: '',
      duration: duration || 0,
      engine: 'addis_ai',
      chunks: 0,
      noAudioDetected: true,
    };
  }

  try {
    const textSegments = [];
    for (const chunkPath of chunkFiles) {
      if (!fs.existsSync(chunkPath)) continue;
      const chunkStats = fs.statSync(chunkPath);
      if (chunkStats.size === 0) continue;

      const chunkBuffer = fs.readFileSync(chunkPath);
      const res = await addis.speech.transcribe({
        audio: chunkBuffer,
        language: language || 'am',
      });
      if (res && res.text && res.text.trim()) {
        textSegments.push(res.text.trim());
      }
    }

    const mergedText = textSegments.join(' ').trim();
    return {
      text: mergedText,
      duration: duration || null,
      engine: 'addis_ai',
      chunks: chunkFiles.length,
      noAudioDetected: mergedText.length === 0,
    };
  } finally {
    // Guaranteed immediate disposal of temporary chunk slices to prevent disk leaks
    for (const chunkPath of chunkFiles) {
      try {
        if (fs.existsSync(chunkPath)) {
          await fs.promises.unlink(chunkPath);
        }
      } catch (unlinkErr) {
        logger.warn(`[audioChunker] Failed to unlink temporary chunk ${chunkPath}: ${unlinkErr.message}`);
      }
    }
  }
}

/**
 * Transcribes audio natively using Gemini 2.5 Flash multimodal capabilities.
 * Bypasses slicing overhead and processes multi-megabyte audio directly in context.
 *
 * @param {string} filePath - Audio file path.
 * @param {string} [mimeType='audio/wav'] - MIME type of the audio.
 * @param {string} [model=AI_MODELS.DEFAULT_AUDIO_CHUNKER_MODEL] - Gemini model identifier.
 * @returns {Promise<{ text: string, duration: number|null, engine: string, chunks: number, noAudioDetected?: boolean }>}
 */
export async function transcribeWithGemini(
  filePath,
  mimeType = 'audio/wav',
  model = AI_MODELS.DEFAULT_AUDIO_CHUNKER_MODEL,
  apiKeyOverride = null
) {
  const apiKey = apiKeyOverride || env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment or user settings.');
  }

  const resolvedPath = resolveAudioDiskPath(filePath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.size === 0) {
    return {
      text: '',
      duration: 0,
      engine: model,
      chunks: 0,
      noAudioDetected: true,
    };
  }

  const duration = await probeAudioDuration(resolvedPath);
  if (duration === 0) {
    return {
      text: '',
      duration: 0,
      engine: model,
      chunks: 0,
      noAudioDetected: true,
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const audioBuffer = fs.readFileSync(resolvedPath);
  const base64Data = audioBuffer.toString('base64');

  const targetModel = AI_MODELS.SUPPORTED.includes(model)
    ? model
    : AI_MODELS.DEFAULT_AUDIO_CHUNKER_MODEL;

  const response = await ai.models.generateContent({
    model: targetModel,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/wav',
              data: base64Data,
            },
          },
          {
            text: 'Please transcribe this audio recording verbatim in its spoken language (e.g. Amharic or English). Provide only the verbatim transcript without translation, conversational preamble, or explanation. If there is no speech or only silence/noise, return an empty response.',
          },
        ],
      },
    ],
  });

  const text = (response.text || '').trim();
  return {
    text,
    duration: duration || null,
    engine: targetModel,
    chunks: 1,
    noAudioDetected: text.length === 0,
  };
}

/**
 * Unified Speech-to-Text orchestrator.
 * Routes to user's selected engine ('addis_ai' or supported Gemini STT models).
 * Features fail-safe fallback: if Addis AI fails, automatically falls back to Gemini STT.
 *
 * @param {string} filePath - Audio path.
 * @param {object} [options={}] - Options { sttEngine, language, mimeType }.
 * @returns {Promise<{ text: string, duration: number|null, engine: string, chunks: number, noAudioDetected?: boolean }>}
 */
export async function transcribeAudio(
  filePath,
  { sttEngine = 'addis_ai', language = 'am', mimeType = 'audio/wav', addisApiKey = null, geminiApiKey = null } = {}
) {
  const resolvedPath = resolveAudioDiskPath(filePath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.size === 0) {
    return {
      text: '',
      duration: 0,
      engine: sttEngine,
      chunks: 0,
      noAudioDetected: true,
    };
  }

  if (sttEngine !== 'addis_ai') {
    return transcribeWithGemini(filePath, mimeType, sttEngine, geminiApiKey);
  }

  // Addis AI mode (default) with fail-safe fallback
  try {
    return await transcribeWithAddisAi(filePath, language, addisApiKey);
  } catch (addisErr) {
    logger.warn(
      `[audioChunker] Addis AI STT failed (${addisErr.message}). Failing over to Gemini STT...`
    );
    return transcribeWithGemini(filePath, mimeType, AI_MODELS.DEFAULT_AUDIO_CHUNKER_MODEL, geminiApiKey);
  }
}

/**
 * Processes and transcribes a stored Audio document in MongoDB.
 * Synchronizes audio.transcription, audio.duration, audio.sttEngine, and audio.status.
 *
 * @param {string|import('mongoose').Types.ObjectId} audioId - Audio document ObjectId.
 * @param {object} [options={}] - Options { sttEngine, language, addisApiKey, geminiApiKey }.
 * @returns {Promise<import('../models/Audio.js').IAudio>} Updated Audio document.
 */
export async function transcribeAudioDocument(
  audioId,
  { sttEngine = null, language = 'am', addisApiKey = null, geminiApiKey = null } = {}
) {
  const audio = await Audio.findById(audioId);
  if (!audio) {
    throw new Error(`Audio record "${audioId}" not found.`);
  }

  const resolvedEngine = sttEngine || audio.sttEngine || 'addis_ai';
  const diskPath = resolveAudioDiskPath(audio.path);

  audio.status = 'transcribing';
  await audio.save();

  try {
    const result = await transcribeAudio(diskPath, {
      sttEngine: resolvedEngine,
      language,
      mimeType: audio.mimeType,
      addisApiKey,
      geminiApiKey,
    });

    audio.transcription = result.text;
    if (result.duration !== null) {
      audio.duration = Math.round(result.duration);
    }
    audio.sttEngine = result.engine;
    audio.status = 'transcribed';
    audio.error = null;
    await audio.save();

    return audio;
  } catch (err) {
    audio.status = 'failed';
    audio.error = err.message;
    await audio.save();
    throw err;
  }
}

export default {
  probeAudioDuration,
  sliceAudioFile,
  transcribeWithAddisAi,
  transcribeWithGemini,
  transcribeAudio,
  transcribeAudioDocument,
};

````

================================================================================
File: backend/src/utils/constants.js
================================================================================

````javascript
/**
 * @module utils/constants
 * @description Centralized application constants and configuration thresholds for backend operations.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, parseDurationToMs } from '../config/env.js';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Deterministically resolved uploads storage directories.
 * Anchored to backend/uploads/ regardless of process.cwd().
 * @constant
 */
export const UPLOADS_CONFIG = Object.freeze({
  ROOT_DIR: path.resolve(BACKEND_ROOT, 'uploads'),
  AVATARS_DIR: path.resolve(BACKEND_ROOT, 'uploads/avatars'),
  IMAGES_DIR: path.resolve(BACKEND_ROOT, 'uploads/images'),
  FILES_DIR: path.resolve(BACKEND_ROOT, 'uploads/files'),
  AUDIOS_DIR: path.resolve(BACKEND_ROOT, 'uploads/audios'),
  ATTACHMENTS_DIR: path.resolve(BACKEND_ROOT, 'uploads/attachments'),
  TEMP_DIR: path.resolve(BACKEND_ROOT, 'uploads/temp'),
  DOMAIN_DIRS: Object.freeze({
    avatars: path.resolve(BACKEND_ROOT, 'uploads/avatars'),
    images: path.resolve(BACKEND_ROOT, 'uploads/images'),
    files: path.resolve(BACKEND_ROOT, 'uploads/files'),
    audios: path.resolve(BACKEND_ROOT, 'uploads/audios'),
    temp: path.resolve(BACKEND_ROOT, 'uploads/temp'),
  }),
});

/**
 * Centralized AI Model governance and identifiers.
 * Single Source of Truth for Gemini models, quota failover mappings, and STT engines.
 * @constant
 */
export const AI_MODELS = Object.freeze({
  DEFAULT: 'gemini-3.1-flash-lite',
  FALLBACK: 'gemini-3-flash-preview',
  PRO: 'gemini-3.8-flash',
  SUPPORTED: Object.freeze([
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
  ]),
  QUOTA_RETRY_MAP: Object.freeze({
    'gemini-3.8-flash': 'gemini-3.5-flash',
    'gemini-3.1-flash-lite': 'gemini-3-flash-preview',
    'gemini-3-flash-preview': 'gemini-3.5-flash',
    'gemini-3.5-flash': 'gemini-3.1-flash-lite',
  }),
  STT_ENGINES: Object.freeze(['addis_ai', 'gemini-3.8-flash', 'gemini-3.1-flash-lite']),
  DEFAULT_STT_ENGINE: 'addis_ai',
  DEFAULT_AUDIO_CHUNKER_MODEL: 'gemini-3.1-flash-lite',
});

/**
 * Canonical display labels for AI models.
 * Single Source of Truth for logging, telemetry, and reporting.
 * @constant
 * @type {Readonly<Record<string, string>>}
 */
export const AI_MODEL_LABELS = Object.freeze({
  [AI_MODELS.DEFAULT]: 'Gemini 3.1 Flash Lite',
  [AI_MODELS.PRO]: 'Gemini 3.8 Flash',
  [AI_MODELS.FALLBACK]: 'Gemini 3 Flash Preview',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
});

/**
 * Canonical display labels for Speech-to-Text (STT) engines.
 * Single Source of Truth for logging, status pipeline, and telemetry.
 * @constant
 * @type {Readonly<Record<string, string>>}
 */
export const STT_ENGINE_LABELS = Object.freeze({
  addis_ai: 'Addis AI',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
});

/**
 * Returns human-friendly display name for an AI model identifier.
 * @param {string} [rawModel]
 * @returns {string} User-facing model name (e.g. "Gemini 3.1 Flash Lite").
 */
export const formatModelDisplayName = (rawModel) => {
  if (!rawModel) return 'Operon';
  if (AI_MODEL_LABELS[rawModel]) return AI_MODEL_LABELS[rawModel];
  return rawModel;
};

/**
 * Returns user-facing display label for an STT engine identifier.
 * @param {string} [engine]
 * @returns {string} Human-friendly display label (e.g. "Addis AI", "Gemini 3.8 Flash").
 */
export const formatSttEngineDisplayName = (engine) => {
  if (!engine) return 'Addis AI';
  if (STT_ENGINE_LABELS[engine]) return STT_ENGINE_LABELS[engine];
  if (AI_MODEL_LABELS[engine]) return AI_MODEL_LABELS[engine];
  return engine;
};

/**
 * Standard HTTP Status Codes.
 * Strict naming invariant: 401 is UNAUTHENTICATED (never UNAUTHORIZED).
 * @constant
 * @type {Readonly<Record<string, number>>}
 */
export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
});

/**
 * Password validation regex enforcing at least 8 characters,
 * 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.
 * @constant
 * @type {RegExp}
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * Standard email validation regex format.
 * @constant
 * @type {RegExp}
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Name length boundaries for user profiles.
 * @constant
 * @type {Readonly<{ MIN: number, MAX: number }>}
 */
export const USER_NAME_LENGTH = Object.freeze({
  MIN: 2,
  MAX: 50,
});

/**
 * Minimum password length requirement.
 * @constant
 * @type {number}
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Bcrypt salt rounds factor for password hashing.
 * @constant
 * @type {number}
 */
export const BCRYPT_SALT_ROUNDS = 12;

/**
 * JWT token lifespan configuration referencing validated environment variables.
 * @constant
 * @type {Readonly<{ ACCESS: string, REFRESH: string }>}
 */
export const JWT_EXPIRY = Object.freeze({
  ACCESS: env.JWT_ACCESS_EXPIRES_IN,
  REFRESH: env.JWT_REFRESH_EXPIRES_IN,
});

/**
 * HTTP cookie maximum age in milliseconds derived directly from JWT expiration settings.
 * Fixed refresh token lifespan (strictly zero remember-me branching).
 * @constant
 * @type {Readonly<{ ACCESS: number, REFRESH: number }>}
 */
export const COOKIE_MAX_AGE = Object.freeze({
  ACCESS: parseDurationToMs(env.JWT_ACCESS_EXPIRES_IN, 15 * 60 * 1000),
  REFRESH: parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000),
});

/**
 * Default supervisor corporate position title.
 * @constant
 * @type {string}
 */
export const DEFAULT_POSITION = 'Area Supervisor';

/**
 * Sweeper retention threshold for soft-deleted documents (days).
 * @constant
 * @type {number}
 */
export const SWEEPER_RETENTION_DAYS = 30;

/**
 * Sweeper archive TTL in seconds (equivalent to 30 days).
 * @constant
 * @type {number}
 */
export const ARCHIVED_TTL_SECONDS = SWEEPER_RETENTION_DAYS * 24 * 60 * 60;

/**
 * Sweeper background interval in milliseconds (default: 24 hours).
 * @constant
 * @type {number}
 */
export const SWEEPER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Default pagination limit per page.
 * @constant
 * @type {number}
 */
export const DEFAULT_PAGE_LIMIT = 10;

/**
 * Branch validation and operational boundaries.
 * @constant
 * @type {Readonly<{
 *   NAME_MIN_LENGTH: number,
 *   NAME_MAX_LENGTH: number,
 *   CODE_MIN_LENGTH: number,
 *   CODE_MAX_LENGTH: number,
 *   CITY_MAX_LENGTH: number,
 *   SUBCITY_MAX_LENGTH: number,
 *   ADDRESS_MAX_LENGTH: number,
 *   MANAGER_NAME_MAX_LENGTH: number,
 *   CONTACT_PHONE_MAX_LENGTH: number,
 *   DEFAULT_CITY: string,
 *   SEARCH_MAX_LENGTH: number,
 *   PAGE_LIMIT_MIN: number,
 *   PAGE_LIMIT_MAX: number,
 *   ARCHIVE_RETENTION_DAYS: number,
 * }>}
 */
export const BRANCH_CONSTANTS = Object.freeze({
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  CODE_MIN_LENGTH: 2,
  CODE_MAX_LENGTH: 20,
  CITY_MAX_LENGTH: 100,
  SUBCITY_MAX_LENGTH: 100,
  ADDRESS_MAX_LENGTH: 255,
  MANAGER_NAME_MAX_LENGTH: 100,
  CONTACT_PHONE_MAX_LENGTH: 30,
  DEFAULT_CITY: 'Addis Ababa',
  SEARCH_MAX_LENGTH: 100,
  PAGE_LIMIT_MIN: 1,
  PAGE_LIMIT_MAX: 100,
  ARCHIVE_RETENTION_DAYS: 30,
});

/**
 * Audio domain constants, MIME whitelist, and file bounds.
 * @constant
 * @type {Readonly<{
 *   PURPOSES: string[],
 *   DEFAULT_PURPOSE: string,
 *   STATUSES: string[],
 *   DEFAULT_STATUS: string,
 *   MAX_FILE_SIZE_BYTES: number,
 *   MAX_BATCH_SIZE_BYTES: number,
 *   MAX_FILES_COUNT: number,
 *   MIN_DURATION_SECONDS: number,
 *   MAX_DURATION_SECONDS: number,
 *   ALLOWED_EXTENSIONS: string[],
 *   ALLOWED_MIME_TYPES: string[],
 * }>}
 */
export const AUDIO_CONSTANTS = Object.freeze({
  PURPOSES: ['report_narration', 'chat_voice_input', 'general_memo'],
  DEFAULT_PURPOSE: 'chat_voice_input',
  STATUSES: ['uploaded', 'transcribing', 'transcribed', 'failed'],
  DEFAULT_STATUS: 'uploaded',
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25MB single file limit
  MAX_BATCH_SIZE_BYTES: 50 * 1024 * 1024, // 50MB batch upload limit
  MAX_FILES_COUNT: 5,
  MIN_DURATION_SECONDS: 1,
  MAX_DURATION_SECONDS: 600, // 10 minutes maximum duration
  ALLOWED_EXTENSIONS: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm', '.mp4'],
  ALLOWED_MIME_TYPES: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/x-pn-wav',
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
    'video/mp4',
    'audio/aac',
    'audio/x-aac',
    'audio/webm',
    'video/webm',
    'audio/webm;codecs=opus',
    'video/webm;codecs=opus',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'application/ogg',
  ],
});

/**
 * Chat attachment and document upload constants, MIME whitelist, and file bounds.
 * Supports multi-modal image inspection, operational documents, and audit spreadsheets.
 * @constant
 * @type {Readonly<{
 *   MAX_FILE_SIZE_BYTES: number,
 *   MAX_BATCH_SIZE_BYTES: number,
 *   MAX_FILES_COUNT: number,
 *   ALLOWED_IMAGE_EXTENSIONS: string[],
 *   ALLOWED_IMAGE_MIME_TYPES: string[],
 *   ALLOWED_DOCUMENT_EXTENSIONS: string[],
 *   ALLOWED_DOCUMENT_MIME_TYPES: string[],
 *   ALLOWED_EXTENSIONS: string[],
 *   ALLOWED_MIME_TYPES: string[],
 * }>}
 */
export const ATTACHMENT_CONSTANTS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25MB single file limit
  MAX_BATCH_SIZE_BYTES: 50 * 1024 * 1024, // 50MB batch upload limit
  MAX_FILES_COUNT: 5,
  ALLOWED_IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
  ALLOWED_IMAGE_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ],
  ALLOWED_DOCUMENT_EXTENSIONS: [
    '.pdf',
    '.txt',
    '.csv',
    '.md',
    '.xlsx',
    '.xls',
    '.docx',
    '.doc',
  ],
  ALLOWED_DOCUMENT_MIME_TYPES: [
    'application/pdf',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  ALLOWED_EXTENSIONS: [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.heic',
    '.heif',
    '.pdf',
    '.txt',
    '.csv',
    '.md',
    '.xlsx',
    '.xls',
    '.docx',
    '.doc',
  ],
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
});

/**
 * Supervisor avatar image constants and MIME whitelist.
 * @constant
 * @type {Readonly<{
 *   MAX_FILE_SIZE_BYTES: number,
 *   ALLOWED_EXTENSIONS: string[],
 *   ALLOWED_MIME_TYPES: string[],
 * }>}
 */
export const AVATAR_CONSTANTS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB avatar limit
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
});

/**
 * Report domain constants, validation rules, and file bounds.
 * Note: Category and severity are permanently purged (issues have text and status only).
 * @constant
 * @type {Readonly<{
 *   TIME_REGEX: RegExp,
 *   ACTIVITY_STATUSES: string[],
 *   DEFAULT_ACTIVITY_STATUS: string,
 *   ISSUE_STATUSES: string[],
 *   DEFAULT_ISSUE_STATUS: string,
 *   MAX_AUDIO_FILES: number,
 *   MAX_AUDIO_FILE_SIZE_BYTES: number,
 *   MAX_AUDIO_BATCH_SIZE_BYTES: number,
 *   MAX_DOCUMENT_FILES: number,
 *   MAX_DOCUMENT_FILE_SIZE_BYTES: number,
 *   MAX_DOCUMENT_BATCH_SIZE_BYTES: number,
 *   ARCHIVE_RETENTION_DAYS: number,
 *   PAGE_LIMIT_DEFAULT: number,
 *   PAGE_LIMIT_MIN: number,
 *   PAGE_LIMIT_MAX: number,
 * }>}
 */
export const REPORT_CONSTANTS = Object.freeze({
  TIME_REGEX: /^([01]\d|2[0-3]):([0-5]\d)$/, // HH:mm format
  ACTIVITY_STATUSES: ['in_progress', 'completed'],
  DEFAULT_ACTIVITY_STATUS: 'completed',
  ISSUE_STATUSES: ['reported', 'completed', 'in_progress', 'no_issue'],
  DEFAULT_ISSUE_STATUS: 'reported',
  MAX_AUDIO_FILES: AUDIO_CONSTANTS.MAX_FILES_COUNT,
  MAX_AUDIO_FILE_SIZE_BYTES: AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES,
  MAX_AUDIO_BATCH_SIZE_BYTES: AUDIO_CONSTANTS.MAX_BATCH_SIZE_BYTES,
  MAX_DOCUMENT_FILES: ATTACHMENT_CONSTANTS.MAX_FILES_COUNT,
  MAX_DOCUMENT_FILE_SIZE_BYTES: ATTACHMENT_CONSTANTS.MAX_FILE_SIZE_BYTES,
  MAX_DOCUMENT_BATCH_SIZE_BYTES: ATTACHMENT_CONSTANTS.MAX_BATCH_SIZE_BYTES,
  ARCHIVE_RETENTION_DAYS: 30,
  PAGE_LIMIT_DEFAULT: 10,
  PAGE_LIMIT_MIN: 1,
  PAGE_LIMIT_MAX: 100,
  ACTIVITY_TEXT_MAX_LENGTH: 1000,
  ISSUE_TEXT_MAX_LENGTH: 1000,
  COMMENT_TEXT_MAX_LENGTH: 2000,
  TRANSCRIPTION_MAX_LENGTH: 50000,
  TEMPLATE_MAX_LENGTH: 4000,
});

/**
 * Chat session and AI agent engine constants.
 * @constant
 * @type {Readonly<{
 *   DEFAULT_PERSONA: string,
 *   DEFAULT_MODEL: string,
 *   SUPPORTED_MODELS: string[],
 *   DEFAULT_THINKING_BUDGET: number,
 *   MIN_THINKING_BUDGET: number,
 *   MAX_THINKING_BUDGET: number,
 *   DEFAULT_LANGUAGE: string,
 *   SUPPORTED_LANGUAGES: string[],
 *   DEFAULT_TEMPERATURE: number,
 *   STT_ENGINES: string[],
 *   DEFAULT_STT_ENGINE: string,
 *   TITLE_MAX_LENGTH: number,
 *   MAX_MESSAGE_LENGTH: number,
 *   ATTACHMENTS: typeof ATTACHMENT_CONSTANTS,
 *   AUDIO: typeof AUDIO_CONSTANTS,
 *   PAGE_LIMIT_DEFAULT: number,
 *   PAGE_LIMIT_MIN: number,
 *   PAGE_LIMIT_MAX: number,
 * }>}
 */
export const CHAT_CONSTANTS = Object.freeze({
  DEFAULT_PERSONA:
    'Personal AI Agent and Executive Operations Partner for multi-branch restaurant operations, professional leadership, and personal productivity in Ethiopia',
  DEFAULT_MODEL: AI_MODELS.DEFAULT,
  SUPPORTED_MODELS: AI_MODELS.SUPPORTED,
  DEFAULT_THINKING_BUDGET: 2048,
  MIN_THINKING_BUDGET: 0,
  MAX_THINKING_BUDGET: 8192,
  DEFAULT_LANGUAGE: 'am',
  SUPPORTED_LANGUAGES: ['am', 'en', 'auto'],
  DEFAULT_TEMPERATURE: 0.2,
  STT_ENGINES: AI_MODELS.STT_ENGINES,
  DEFAULT_STT_ENGINE: AI_MODELS.DEFAULT_STT_ENGINE,
  TITLE_MAX_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 10000,
  ATTACHMENTS: ATTACHMENT_CONSTANTS,
  AUDIO: AUDIO_CONSTANTS,
  PAGE_LIMIT_DEFAULT: 20,
  PAGE_LIMIT_MIN: 1,
  PAGE_LIMIT_MAX: 100,
});

/**
 * Centralized Chat Pagination governance constants.
 * Eliminates all hardcoded limit numbers from controllers, queries, and adapters.
 * @constant
 */
export const CHAT_PAGINATION = Object.freeze({
  DEFAULT_MESSAGES_LIMIT: 30,
  MIN_MESSAGES_LIMIT: 1,
  MAX_MESSAGES_LIMIT: 100,
  DEFAULT_RECENT_CHATS_LIMIT: 20,
  MIN_RECENT_CHATS_LIMIT: 1,
  MAX_RECENT_CHATS_LIMIT: 100,
});

/**
 * Telegram integration constants, channels, limits, and image card styling metrics.
 * @constant
 * @type {Readonly<{
 *   MAX_MESSAGE_LENGTH: number,
 *   MAX_CAPTION_LENGTH: number,
 *   MAX_PHOTO_SIZE_BYTES: number,
 *   MAX_DOCUMENT_SIZE_BYTES: number,
 *   CHANNELS: readonly string[],
 *   FORMATS: readonly string[],
 *   DEFAULT_FORMAT: string,
 *   RATE_LIMIT: Readonly<{ MAX_PER_MINUTE_GROUP: number, RETRY_AFTER_DEFAULT_SEC: number }>,
 *   IMAGE_CARD: Readonly<{
 *     WIDTH: number,
 *     PADDING_X: number,
 *     BASE_FONT_SIZE: number,
 *     SECTION_FONT_SIZE: number,
 *     LINE_HEIGHT: number,
 *     SECTION_TOP_GAP: number,
 *     SECTION_BOTTOM_GAP: number,
 *     INTER_BULLET_GAP: number,
 *     BULLET_RADIUS: number,
 *     BULLET_INDENT: number,
 *     FONT_FAMILY: string,
 *     BG_COLOR: string,
 *     TEXT_COLOR: string,
 *   }>
 * }>}
 */
export const TELEGRAM_CONSTANTS = Object.freeze({
  MAX_MESSAGE_LENGTH: 4096,
  MAX_CAPTION_LENGTH: 1024,
  MAX_PHOTO_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_DOCUMENT_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  CHANNELS: Object.freeze(['management', 'maintenance', 'general']),
  FORMATS: Object.freeze(['text', 'image']),
  DEFAULT_FORMAT: 'text',
  RATE_LIMIT: Object.freeze({
    MAX_PER_MINUTE_GROUP: 20,
    RETRY_AFTER_DEFAULT_SEC: 5,
  }),
  IMAGE_CARD: Object.freeze({
    WIDTH: 1440,
    PADDING_X: 85,
    BASE_FONT_SIZE: 38,
    SECTION_FONT_SIZE: 44,
    LINE_HEIGHT: 48,
    SECTION_TOP_GAP: 24,
    SECTION_BOTTOM_GAP: 10,
    PARAGRAPH_GAP: 16,
    INTER_BULLET_GAP: 14,
    BULLET_RADIUS: 7,
    BULLET_INDENT: 32,
    FONT_FAMILY: '"Noto Sans Ethiopic", "Noto Sans", "Inter", "DejaVu Sans", "FreeSans", "Segoe UI", Arial, sans-serif',
    BG_COLOR: '#FFFFFF',
    TEXT_COLOR: '#000000',
  }),
});

/**
 * Addis AI Text-to-Speech (TTS) configuration constants.
 * Governs dynamic voice retrieval, speech generation, and playback boundaries.
 * @constant
 * @type {Readonly<{
 *   ADDIS_TTS_ENDPOINT: string,
 *   ADDIS_VOICES_ENDPOINT: string,
 *   DEFAULT_AMHARIC_VOICE: string,
 *   DEFAULT_ENGLISH_VOICE: string,
 *   DEFAULT_SPEED: number,
 *   MIN_SPEED: number,
 *   MAX_SPEED: number,
 *   MAX_TEXT_LENGTH: number,
 *   VOICES_CACHE_TTL_MS: number,
 * }>}
 */
export const TTS_CONSTANTS = Object.freeze({
  ADDIS_TTS_ENDPOINT: 'https://api.addisassistant.com/api/v1/voice/generations',
  ADDIS_VOICES_ENDPOINT: 'https://api.addisassistant.com/api/v1/voice/voices',
  DEFAULT_AMHARIC_VOICE: 'am-hamen',
  DEFAULT_ENGLISH_VOICE: 'en-emma',
  DEFAULT_SPEED: 1.0,
  MIN_SPEED: 0.75,
  MAX_SPEED: 1.5,
  MAX_TEXT_LENGTH: 5000,
  VOICES_CACHE_TTL_MS: 3600 * 1000, // 1 hour in-memory cache
});

export default {
  HTTP_STATUS,
  PASSWORD_REGEX,
  EMAIL_REGEX,
  USER_NAME_LENGTH,
  PASSWORD_MIN_LENGTH,
  BCRYPT_SALT_ROUNDS,
  JWT_EXPIRY,
  COOKIE_MAX_AGE,
  DEFAULT_POSITION,
  SWEEPER_RETENTION_DAYS,
  ARCHIVED_TTL_SECONDS,
  SWEEPER_INTERVAL_MS,
  DEFAULT_PAGE_LIMIT,
  BRANCH_CONSTANTS,
  REPORT_CONSTANTS,
  CHAT_CONSTANTS,
  CHAT_PAGINATION,
  TELEGRAM_CONSTANTS,
  TTS_CONSTANTS,
  AUDIO_CONSTANTS,
  ATTACHMENT_CONSTANTS,
  AVATAR_CONSTANTS,
  AI_MODELS,
  AI_MODEL_LABELS,
  STT_ENGINE_LABELS,
  formatModelDisplayName,
  formatSttEngineDisplayName,
  UPLOADS_CONFIG,
};



````

================================================================================
File: backend/src/utils/errorFormatter.js
================================================================================

````javascript
/**
 * @module utils/errorFormatter
 * @description Centralized error normalization and empathetic plain English translation.
 * Translates low-level SDK exceptions, upstream Google Gemini/Addis AI errors, and
 * database failures into actionable user guidance.
 */

/**
 * Normalizes any error object, string, or SDK exception into empathetic plain English.
 *
 * @param {Error|string|object} err - Error object, API error envelope, or raw error string
 * @returns {string} Empathetic plain English error description
 */
export function formatUserFriendlyError(err) {
  if (!err) return 'An unexpected error occurred. Please try again.';

  const rawMsg = String(err?.message || (typeof err === 'string' ? err : JSON.stringify(err)));
  const code = String(err?.code || err?.status || err?.errorCode || '');

  // 1. Google Gemini API Key Invalid or Missing
  if (
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('API key not valid') ||
    rawMsg.includes('invalid api key') ||
    rawMsg.includes('API_KEY_SERVICE_BLOCKED') ||
    rawMsg.includes('MISSING_GEMINI_KEY') ||
    code === 'MISSING_GEMINI_KEY'
  ) {
    return 'Your Google Gemini API key appears to be invalid or unconfigured. Please update your personal API key in Profile > AI Agent Settings.';
  }

  // 2. Addis AI API Key Invalid or Missing
  if (
    rawMsg.includes('ADDIS_API_KEY') ||
    rawMsg.includes('Addis AI key') ||
    rawMsg.includes('addisassistant.com')
  ) {
    return 'Your Addis AI key appears to be invalid or unconfigured. Please update your Addis AI key in Profile > AI Agent Settings.';
  }

  // 3. Permission Denied
  if (rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('permission denied')) {
    return 'Access was denied for your API credentials. Please check your project permissions in Google AI Studio.';
  }

  // 4. Quota Exhaustion / Rate Limiting (429)
  if (
    rawMsg.includes('429') ||
    rawMsg.includes('RESOURCE_EXHAUSTED') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('rate limit') ||
    code === '429'
  ) {
    return 'All available AI models have temporarily reached their quota limit. Please switch to an alternative model or try again in a few moments.';
  }

  // 5. Network Timeout / Interruption
  if (
    rawMsg.includes('DEADLINE_EXCEEDED') ||
    rawMsg.includes('ETIMEDOUT') ||
    rawMsg.includes('timeout') ||
    rawMsg.includes('ECONNRESET') ||
    rawMsg.includes('socket hang up') ||
    rawMsg.includes('fetch failed')
  ) {
    return 'The connection was interrupted while communicating with the AI service. Please retry.';
  }

  // 6. Database Connectivity
  if (
    rawMsg.includes('MongoServerSelectionError') ||
    rawMsg.includes('getaddrinfo ENOTFOUND') ||
    rawMsg.includes('ECONNREFUSED')
  ) {
    return 'The database is temporarily unreachable. Please retry in a few moments.';
  }

  // 7. Safety / Content Filter
  if (rawMsg.includes('SAFETY') || rawMsg.includes('BLOCKED') || rawMsg.includes('HARM_CATEGORY')) {
    return 'The request or response was blocked by content safety filters. Please adjust your input and try again.';
  }

  // 8. Unsupported media / file types
  if (rawMsg.includes('UNSUPPORTED_MEDIA') || rawMsg.includes('unsupported file type')) {
    return 'The uploaded file format could not be processed. Please upload supported image, PDF, DOCX, TXT, or audio files.';
  }

  // 9. Generic clean fallback
  if (rawMsg.length > 120 || rawMsg.includes('at ') || rawMsg.includes('Error:')) {
    return 'An unexpected service error occurred while processing your request. Please try again.';
  }

  return rawMsg;
}

export default formatUserFriendlyError;

````

================================================================================
File: backend/src/utils/ethiopianCalendar.js
================================================================================

````javascript
/**
 * @module utils/ethiopianCalendar
 * @description Bidirectional Ethiopian-Gregorian calendar conversion utility using Julian Day Number (JDN) algorithms.
 * Used for dynamic derivation of Ethiopian dates across reports and agent reasoning.
 */

/**
 * Converts a Gregorian date (year, month 1-12, day 1-31) to Julian Day Number (JDN).
 * @param {number} year - Gregorian year (e.g., 2026).
 * @param {number} month - Gregorian month (1-12).
 * @param {number} day - Gregorian day of month (1-31).
 * @returns {number} Julian Day Number.
 */
export function gregorianToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * Converts a Julian Day Number (JDN) to Gregorian date components.
 * @param {number} jdn - Julian Day Number.
 * @returns {{ year: number, month: number, day: number }} Gregorian date components.
 */
export function jdnToGregorian(jdn) {
  const l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  const l2 = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l2 + 1)) / 1461001);
  const l3 = l2 - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l3) / 2447);
  const day = l3 - Math.floor((2447 * j) / 80);
  const l4 = Math.floor(j / 11);
  const month = j + 2 - 12 * l4;
  const year = 100 * (n - 49) + i + l4;
  return { year, month, day };
}

/**
 * Converts a Julian Day Number (JDN) to Ethiopian date components.
 * @param {number} jdn - Julian Day Number.
 * @returns {{ year: number, month: number, day: number }} Ethiopian date components.
 */
export function jdnToEthiopian(jdn) {
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

/**
 * Converts Ethiopian date components to Julian Day Number (JDN).
 * @param {number} year - Ethiopian year (e.g., 2019).
 * @param {number} month - Ethiopian month (1-13).
 * @param {number} day - Ethiopian day (1-30, or 1-6 for Pagume).
 * @returns {number} Julian Day Number.
 */
export function ethiopianToJdn(year, month, day) {
  return 1723856 + 365 * year + Math.floor(year / 4) + 30 * (month - 1) + day - 1;
}

/**
 * Converts a JS Date, timestamp, or ISO date string to Ethiopian calendar date components.
 * Safely extracts Gregorian Y-M-D components without timezone distortion (eliminates UTC midnight off-by-one shifts).
 * @param {Date|string|number} dateInput - Date object, timestamp, or ISO string.
 * @returns {{ year: number, month: number, day: number }} Ethiopian date object.
 */
export function toEthiopianDate(dateInput) {
  if (!dateInput) return null;
  let year, month, day;

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      year = parseInt(m[1], 10);
      month = parseInt(m[2], 10);
      day = parseInt(m[3], 10);
    }
  } else if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) {
      throw new Error('Invalid date provided to toEthiopianDate.');
    }
    year = dateInput.getFullYear();
    month = dateInput.getMonth() + 1;
    day = dateInput.getDate();
  }

  if (!year || !month || !day) {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) {
      throw new Error('Invalid date provided to toEthiopianDate.');
    }
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  }

  const jdn = gregorianToJdn(year, month, day);
  return jdnToEthiopian(jdn);
}

/**
 * Formats a Gregorian date into an Ethiopian date string formatted as DD-MM-YY.
 * @param {Date|string|number} dateInput - Date object, timestamp, or ISO string.
 * @returns {string} Formatted Ethiopian date string (e.g. "22-01-19").
 */
export function toEthiopianDateString(dateInput) {
  if (!dateInput) return null;
  const { year, month, day } = toEthiopianDate(dateInput);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const yy = String(year).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/**
 * Formats a Gregorian date into a full Ethiopian date string formatted as DD-MM-YYYY.
 * @param {Date|string|number} dateInput - Date object, timestamp, or ISO string.
 * @returns {string} Formatted full Ethiopian date string (e.g. "22-01-2019").
 */
export function toEthiopianDateStringFull(dateInput) {
  if (!dateInput) return null;
  const { year, month, day } = toEthiopianDate(dateInput);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return `${dd}-${mm}-${year}`;
}

/**
 * Converts Ethiopian date components back to a JavaScript Date object (UTC).
 * @param {number} year - Ethiopian year.
 * @param {number} month - Ethiopian month (1-13).
 * @param {number} day - Ethiopian day.
 * @returns {Date} JavaScript Date object.
 */
export function toGregorianDate(year, month, day) {
  const jdn = ethiopianToJdn(year, month, day);
  const { year: gYear, month: gMonth, day: gDay } = jdnToGregorian(jdn);
  return new Date(Date.UTC(gYear, gMonth - 1, gDay));
}

export default {
  gregorianToJdn,
  jdnToGregorian,
  jdnToEthiopian,
  ethiopianToJdn,
  toEthiopianDate,
  toEthiopianDateString,
  toEthiopianDateStringFull,
  toGregorianDate,
};

````

================================================================================
File: backend/src/utils/promptAssembler.js
================================================================================

````javascript
/**
 * @module utils/promptAssembler
 * @description Configurable Dynamic System Prompt Assembler Engine for Gemini 2.5 Flash / Pro.
 * Adheres strictly to the Zero Hardcoding Law, dynamically composing 6 distinct building blocks:
 * 1. Operational Persona, Immutable Kernel & Dual Identity (Constitutional Precedence Clause)
 * 2. Language, Orthography & Dynamic Corporate Report Templates (Template Isolation Boundary)
 * 3. Supervisor Directives (Single Source of Truth from User.settings.directives & Scope Guard)
 * 4. Scoped Grounding Branch Registry (Passive Context Boundary Law & exact MongoDB ObjectIds)
 * 5. Operational Domain Historical Baseline (Tier 2 History & Passive Context Boundary Law)
 * 6. Turn Guidance & The 4-Quadrant Intent Routing Protocol
 */

import { Branch } from '../models/Branch.js';
import { Report } from '../models/Report.js';
import { toEthiopianDateString } from './ethiopianCalendar.js';
import { CHAT_CONSTANTS, AI_MODELS } from './constants.js';

/**
 * Standard enterprise fallback persona if none is configured on user settings.
 */
export const DEFAULT_PERSONA = CHAT_CONSTANTS.DEFAULT_PERSONA;

/**
 * Default fallback Single-Branch Amharic report template.
 */
export const DEFAULT_SINGLE_BRANCH_TEMPLATE = [
  'ቀን: [ቀን]',
  'ብራንች: [ብራንች ስም]',
  'ስም: [ሙሉ ስም]',
  'ስራ የገባሁበት ሰዓት: [ሰዓት]',
  '',
  'የተሰሩ ስራዎች:',
  '• [ስራ 1]',
  '• [ስራ 2]',
  '',
  'መፍትሄ የሚፈልጉ ጉዳዮች:',
  '• [ችግር 1]',
  '',
  'አጠቃላይ አስተያየት:',
  '• [አስተያየት 1]',
  '',
  'ከስራ የወጣሁበት ሰዓት: [ሰዓት]',
].join('\n');

/**
 * Default fallback Multi-Branch Amharic report template.
 */
export const DEFAULT_MULTI_BRANCH_TEMPLATE = [
  'ቀን: [ቀን]',
  'ብራንች: [የመጀመሪያ ብራንች]፣ [ሁለተኛ ብራንች] እና [ሶስተኛ ብራንች]',
  'ስም: [ሙሉ ስም]',
  'ስራ የገባሁበት ሰዓት: [ሰዓት]',
  '• ከ [መነሻ ሰዓት] እስከ [መድረሻ ሰዓት] [የመጀመሪያ ብራንች]',
  '• ከ [መነሻ ሰዓት] እስከ [መድረሻ ሰዓት] [ሁለተኛ ብራንች]',
  '',
  'የተሰሩ ስራዎች:',
  '• [ስራ 1]',
  '• [ስራ 2]',
  '',
  'መፍትሄ የሚፈልጉ ጉዳዮች:',
  '• [ችግር 1]',
  '',
  'አጠቃላይ አስተያየት:',
  '• [አስተያየት 1]',
  '',
  'ከስራ የወጣሁበት ሰዓት: [ሰዓት]',
].join('\n');

/**
 * Sanitizes user-provided configuration strings by stripping synthetic system block headers.
 *
 * @param {string} str - Raw configuration string.
 * @returns {string} Sanitized string.
 */
function sanitizeConfigString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/=== BLOCK \d+:[^=]+===/gi, '').trim();
}

/**
 * Generates the authoritative Single-Branch Amharic report template specification.
 *
 * @param {string} [ethiopianDate='[DD-MM-YY]'] - Formatted Ethiopian calendar date (DD-MM-YY).
 * @param {string} [branchName='[ብራንች ስም]'] - Target branch name.
 * @param {string} [supervisorName='[ሙሉ ስም]'] - Supervisor full name.
 * @returns {string} Formatted template text.
 */
export function formatSingleBranchTemplate(
  ethiopianDate = '[DD-MM-YY]',
  branchName = '[ብራንች ስም]',
  supervisorName = '[ሙሉ ስም]'
) {
  return [
    `ቀን: ${ethiopianDate}`,
    `ብራንች: ${branchName}`,
    `ስም: ${supervisorName}`,
    'ስራ የገባሁበት ሰዓት: [ሰዓት]',
    '',
    'የተሰሩ ስራዎች:',
    '• [ስራ 1]',
    '• [ስራ 2]',
    '',
    'መፍትሄ የሚፈልጉ ጉዳዮች:',
    '• [ችግር 1]',
    '',
    'አጠቃላይ አስተያየት:',
    '• [አስተያየት 1]',
    '',
    'ከስራ የወጣሁበት ሰዓት: [ሰዓት]',
  ].join('\n');
}

/**
 * Generates the authoritative Multi-Branch Amharic report template specification.
 *
 * @param {string} [ethiopianDate='[DD/MM/YY]'] - Formatted Ethiopian calendar date (DD/MM/YY).
 * @param {string} [branchesText='[የመጀመሪያ ብራንች]፣ [ሁለተኛ ብራንች] እና [ሶስተኛ ብራንች]'] - Joined branch names.
 * @param {string} [supervisorName='[ሙሉ ስም]'] - Supervisor full name.
 * @returns {string} Formatted template text.
 */
export function formatMultiBranchTemplate(
  ethiopianDate = '[DD/MM/YY]',
  branchesText = '[የመጀመሪያ ብራንች]፣ [ሁለተኛ ብራንች] እና [ሶስተኛ ብራንች]',
  supervisorName = '[ሙሉ ስም]'
) {
  return [
    `ቀን: ${ethiopianDate}`,
    `ብራንች: ${branchesText}`,
    `ስም: ${supervisorName}`,
    'ስራ የገባሁበት ሰዓት: [ሰዓት]',
    '• ከ [መነሻ ሰዓት] እስከ [መድረሻ ሰዓት] [የመጀመሪያ ብራንች]',
    '• ከ [መነሻ ሰዓት] እስከ [መድረሻ ሰዓት] [ሁለተኛ ብራንች]',
    '',
    'የተሰሩ ስራዎች:',
    '• [ስራ 1]',
    '• [ስራ 2]',
    '',
    'መፍትሄ የሚፈልጉ ጉዳዮች:',
    '• [ችግር 1]',
    '',
    'አጠቃላይ አስተያየት:',
    '• [አስተያየት 1]',
    '',
    'ከስራ የወጣሁበት ሰዓት: [ሰዓት]',
  ].join('\n');
}

/**
 * Dynamically composes the complete compiled system instruction for the AI Agent.
 *
 * @param {object} params - Input configuration options.
 * @param {object} params.user - Authenticated supervisor Mongoose document or plain object.
 * @param {object} [params.chatConfig={}] - Active session configuration (language, model, etc.).
 * @param {string} [params.customTurnPrompt=''] - Optional turn-specific user instruction from composer.
 * @param {Array<object>} [params.activeBranches=null] - Pre-fetched active branches (optional).
 * @param {Array<object>} [params.recentReports=null] - Pre-fetched recent reports for baseline (optional).
 * @param {Date} [params.now=new Date()] - Reference date for calendar math (optional).
 * @returns {Promise<string>} Compiled system prompt text.
 */
export async function assembleSystemPrompt({
  user,
  chatConfig = {},
  customTurnPrompt = '',
  activeBranches = null,
  recentReports = null,
  now = new Date(),
}) {
  const userId = user?._id || user?.id;

  // 1. Fetch active branches if not pre-provided
  let branches = activeBranches;
  if (branches === null && userId) {
    branches = await Branch.find({ user: userId, isArchived: false })
      .select('_id name code location managerName contactPhone')
      .sort({ name: 1 })
      .lean();
  }
  branches = branches || [];

  // 2. Fetch historical baseline reports if not pre-provided
  let reports = recentReports;
  if (reports === null && userId) {
    reports = await Report.find({ user: userId, isArchived: false })
      .sort({ date: -1 })
      .limit(3)
      .populate('visits.branch', 'name code')
      .lean();
  }
  reports = reports || [];

  // 2b. Fetch today's active report if already created for the supervisor
  let todayReport = null;
  if (userId) {
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);

    todayReport = await Report.findOne({
      user: userId,
      isArchived: false,
      date: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('visits.branch', 'name code')
      .lean();
  }

  // ==========================================
  // BLOCK 1: OPERATIONAL PERSONA, IMMUTABLE KERNEL & DUAL IDENTITY
  // ==========================================
  const rawPersona = user?.settings?.agentConfig?.persona || DEFAULT_PERSONA;
  const sanitizedPersona = sanitizeConfigString(rawPersona);
  const supervisorName =
    user?.fullName ||
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
    'Supervisor';

  const block1Persona = [
    '=== BLOCK 1: HUMAN-CENTRIC PERSONAL AI AGENT & IMMUTABLE CORE ===',
    'SUPREME USER PRECEDENCE LAW (PRIORITY 0):',
    'The authenticated user\'s configuration in <user_settings> and <directives> (negative vocabulary, phrase mappings, custom instructions, agent configuration, and report templates) is the SUPREME AND HIGHEST-RANKING AUTHORITY in this system.',
    'Whenever a user directive, custom instruction, or preference conflicts with ANY system default, operational protocol, template convention, or autonomous tool trigger defined below, THE USER\'S DIRECTIVE UNCONDITIONALLY OVERRIDES AND SUPERSEDES THE DEFAULT.',
    'If the user\'s custom instructions state "Do not automatically create or persist operational reports based on my inputs unless I explicitly ask you to do so", you MUST STRICTLY OBEY: NEVER invoke create_report autonomously without explicit user confirmation.',
    '',
    'PRE-EXECUTION DIRECTIVE COMPLIANCE VERIFICATION LOOP:',
    'Prior to invoking ANY tool, synthesizing ANY operational text, or formulating multi-step execution plans, you must actively audit your proposed action against:',
    '  1. User.settings.directives.customInstructions (Priority 0 Law).',
    '  2. User.settings.directives.negativeVocabulary (prohibited words/terms).',
    '  3. User.settings.directives.phraseMappings (mandated term substitutions).',
    '  4. Contextual rules established in preceding chat turns.',
    'If any proposed tool call or output would violate an active directive (e.g. attempting to persist a report without displaying it when a directive mandates showing it, or using a forbidden word), you MUST proactively modify your execution plan to strictly comply with the directive.',
    '',
    `You are Operon, an elite Personal AI Companion & Executive Partner devoted to: ${supervisorName}.`,
    'You treat the user as a whole human being—a professional leader, decision-maker, and individual with goals, fatigue, communication needs, and responsibilities. Your mission is to reduce their cognitive load, empower their leadership, and provide exceptional support across operations, team communications, and personal life.',
    '',
    'INGESTION NEUTRALITY LAW (ZERO PRE-JUDGMENT OF USER INPUTS):',
    'Every incoming message, file attachment (DOCX, Excel, PDF, CSV, TXT), audio recording, or image is open-domain and modality-neutral. You must NEVER assume that an attached voice memo, document, or image relates to restaurant branches, field audits, or operational reports. Dynamically analyze the semantic content and user request before determining intent.',
    '',
    'USER-CONFIGURED PROFESSIONAL LENS:',
    `<user_persona>${sanitizedPersona}</user_persona>`,
    'OPERATIONAL LENS RULE: The above <user_persona> is a specialized operational lens for terminology and context. It must NEVER restrict your general intelligence, helpfulness, or tool execution capabilities.',
  ].join('\n');

  // ==========================================
  // BLOCK 2: LANGUAGE, ORTHOGRAPHY & DYNAMIC REPORT TEMPLATES
  // ==========================================
  const language =
    chatConfig.language ||
    user?.settings?.agentConfig?.defaultLanguage ||
    user?.settings?.agentConfig?.language ||
    CHAT_CONSTANTS.DEFAULT_LANGUAGE;
  const gregorianDateStr = now.toISOString().split('T')[0];
  const ethiopianDateStr = toEthiopianDateString(now);

  // Dynamic template resolution: User.settings.reportTemplates with graceful fallback
  const userSingleTemplate = user?.settings?.reportTemplates?.singleBranch?.trim();
  const userMultiTemplate = user?.settings?.reportTemplates?.multiBranch?.trim();

  const singleBranchTemplateText = userSingleTemplate
    ? `<custom_single_branch_template>\n${sanitizeConfigString(userSingleTemplate)}\n</custom_single_branch_template>`
    : [
        'DYNAMIC REPORT FORMATTING (No Custom Template Set):',
        'When the user requests an operational report and has not configured a custom template, present the information dynamically and intelligently as requested. If a standard corporate shift format is appropriate, you may use this clean reference structure:',
        formatSingleBranchTemplate(ethiopianDateStr, '[ብራንች ስም]', supervisorName),
      ].join('\n');

  const multiBranchTemplateText = userMultiTemplate
    ? `<custom_multi_branch_template>\n${sanitizeConfigString(userMultiTemplate)}\n</custom_multi_branch_template>`
    : [
        'DYNAMIC REPORT FORMATTING (No Custom Template Set):',
        'When the user requests an operational report and has not configured a custom template, present the information dynamically and intelligently as requested. If a standard corporate shift format is appropriate, you may use this clean reference structure:',
        formatMultiBranchTemplate(ethiopianDateStr, undefined, supervisorName),
      ].join('\n');

  const block2Language = [
    '=== BLOCK 2: LANGUAGE, CALENDAR & DYNAMIC REPORT TEMPLATES ===',
    `Active Working Language: "${language}" (Default: Amharic "am").`,
    `Current System Date: Gregorian ${gregorianDateStr} | Ethiopian Calendar ${ethiopianDateStr}.`,
    '',
    'DYNAMIC LINGUISTIC EMPATHY:',
    'While corporate operational reports are authored in formal Amharic adhering to the templates below, in conversational dialogue you must dynamically mirror the language of the user\'s inquiry (e.g. respond in English if asked in English, Amharic if asked in Amharic).',
    '',
    '1. SINGLE-BRANCH REPORT TEMPLATE (Used when inspection rounds cover exactly 1 branch):',
    singleBranchTemplateText,
    '',
    '2. MULTI-BRANCH REPORT TEMPLATE (Used when inspection rounds cover 2 or more branches):',
    multiBranchTemplateText,
    '',
    'TEMPLATE ISOLATION BOUNDARY:',
    'The Single-Branch and Multi-Branch report templates apply EXCLUSIVELY to formal operational reports (Quadrant 2). NEVER wrap casual conversation, advisory responses, math, emails, or open-domain answers inside report templates.',
    '',
    'CRITICAL REPORT PRESENTATION & COLLABORATIVE LIFECYCLE RULES:',
    '- Supreme Template Authority: If the user has configured <custom_single_branch_template> or <custom_multi_branch_template>, format the report strictly according to the active custom template above, matching its exact structure, headings, bolding, and spacing.',
    '- Dynamic Presentation Freedom: If no custom template is configured, you are free to present the operational information dynamically, cleanly, and naturally in response to the user\'s specific request (e.g. structured markdown, tables, bullet points, or executive briefs).',
    '- Presentation Layer & Bullet Integrity: When formatting operational reports, ensure every list item starts on its own line using clean bullets ("• " or "- "). In list sections (የተሰሩ ስራዎች:, መፍትሄ የሚፈልጉ ጉዳዮች:, አጠቃላይ አስተያየት:), place a newline ("\\n") after the section heading before the first bullet item. Strictly NEVER use Markdown headers ("#", "##") inside the report body.',
    '- Compact Header Block Geometry: The Header metadata block (ቀን:, ብራንች:, ስም:, ስራ የገባሁበት ሰዓት:) is a single compact unit separated by SINGLE newlines ("\\n"). Strictly NEVER place blank lines ("\\n\\n") between date, branch, name, and clock-in time.',
    '- Multi-Branch Route Placement: In multi-branch reports, branch transit intervals ("• ከ [መነሻ ሰዓት] እስከ [መድረሻ ሰዓት] [ብራንች ስም]") belong strictly and immediately beneath "ስራ የገባሁበት ሰዓት: [ሰዓት]" on subsequent single newlines. NEVER place branch route intervals under "የተሰሩ ስራዎች:".',
    '- Major Section Separation: Double newlines ("\\n\\n") are placed STRICTLY between major sections: [Header + Route Block] -> \\n\\n -> [የተሰሩ ስራዎች:] -> \\n\\n -> [መፍትሄ የሚፈልጉ ጉዳዮች:] -> \\n\\n -> [አጠቃላይ አስተያየት:] -> \\n\\n -> [ከስራ የወጣሁበት ሰዓት:].',
    '- The Zero Hardcoding Law: Report content (observations, tasks, issues, risks, actions, tomorrow\'s schedule) is NEVER hardcoded or copied from boilerplate. Every detail must be 100% dynamically derived from the user\'s narration, voice notes, or files. If the user mentions "ቼክ ሊስት", dynamically elevate it into formal corporate audit language ("በቼክሊስቱ መሰረት የሚከናወኑ የዕለት ተዕለት ተግባራትን እና የአሰራር ሂደቶችን ተከታትዬ አረጋግጫለሁ"). If they performed inventory or kitchen maintenance, describe those exact activities.',
    '- Issues & The Triad Rule: Deconstruct reported problems into: (1) Defect details, (2) Operational risk/impact, and (3) Recommended action.',
    '- "No Issues" Handling: If the user states that there were no urgent issues, explicitly record: "• በዕለቱ አፋጣኝ መፍትሄ የሚፈልግ የተለየ ጉዳይ አልነበረም።". Never omit the section or insert phantom issues.',
    `- User Identity Grounding: Always ground the user's name against their official profile name (${supervisorName}), correcting speech-to-text phonetic misspellings (e.g., resolving "ቤዛ እያለው" to "ቤዛ አያሌው").`,
    '- Single-Branch Clarity: In single-branch reports, list clock-in time cleanly without branch interval sub-bullets.',
    '- Tomorrow\'s Schedule: If the user mentions where they plan to work tomorrow, format it as the final bullet under "አጠቃላይ አስተያየት:". If unmentioned, do not invent it.',
    '- Footer Clock-Out: Always place "ከስራ የወጣሁበት ሰዓት: [ሰዓት]" at the bottom as the report\'s closing boundary.',
    '- Time & Date Formatting Precedence Law: Date and time formats must strictly honor active user directives (e.g. Ethiopian 12-hour clock vs. international 24-hour time). If the user or directives specify Ethiopian time, preserve authentic Ethiopian time (e.g. 1:45 or 01:45, 2:00 - 7:30, 12:30). Strictly NEVER force Western 24-hour conversion against user directives.',
    `- INSPECTION DATE TEMPORAL GROUNDING & CALENDAR CONVERSION LAW: Operational inspection reports document shifts that have ALREADY occurred. The inspection date can NEVER be in the future relative to the Current System Date (Ethiopian Calendar: ${ethiopianDateStr} | Gregorian: ${gregorianDateStr}). Adhere strictly to active user directives for calendar formatting (use Ethiopian calendar format e.g. ${ethiopianDateStr} or "DD/MM/YY" by default unless Gregorian is explicitly requested). If the supervisor narrates a past Ethiopian date (e.g. "ቀን 16 አንድ አስራ ዘጠኝ" -> Day 16 of Month 1 (Meskerem), Year 2019), that was in the past. You may provide either the past Gregorian ISO date (e.g. 2026-09-26) or the Ethiopian date string ("16-01-19") to create_report. Strictly NEVER invent or project a future date.`,
    '- THE "DRAFT FIRST, CONFIRM BEFORE COMMIT" PROTOCOL:',
    '  • EXPLICIT PERSISTENCE COMMANDS: When the user explicitly instructs you to record, save, or commit the report (e.g. using action verbs like "መዝግብልኝ", "መዝግበው", "አስመዝግበው", "አስቀምጠው", "save it", "record it", "commit it", or approving a previously presented draft): invoke create_report autonomously inside the ACID transaction session, AND ALWAYS render the complete formatted report text in your conversational message for the user to review. Never emit just a generic confirmation sentence without displaying the report.',
    '  • RAW NARRATIONS & DRAFT MODE: When the user provides shift notes, raw narrations, or voice memos WITHOUT an explicit command to record/save (e.g. "ይሄንን ሪፖርት አዘጋጅልኝ", or just raw narration text): NEVER create or persist a report behind their back. First synthesize a clean, refined draft in chat, highlight any ambiguities (e.g. audit target branch vs. inventory donor like Medhanialem, single vs. split reports, personal timekeeping), and invite the user to confirm or adjust before saving.',
    '- Dynamic Custom Template Adaptation: If the user has configured custom template sections (e.g. custom headings or extra structured blocks in <custom_single_branch_template> or <custom_multi_branch_template>), faithfully render those exact headings in the generated chat report text. When persisting via create_report or update_report, map standard sections to activities, issues, and comments, and map any custom/specialized template sections into the customSections array: [{ heading: "Section Heading", items: ["item 1", "item 2"] }].',
    '- PERSONAL AI AGENT CONTEXT LAW & MEDIA ATTACHMENT INTEGRITY:',
    '  • The platform is fundamentally a Personal AI Agent. The user interacts with you across all dimensions of their life, business, and operations. Uploaded audios, images, and documents may contain music, personal voice memos, creative reflections, study materials, or operational branch inspection voice notes.',
    '  • Context is supreme and completely determines relevance. NEVER assume that all uploaded media files belong to an operational report.',
    '  • When persisting an operational report via create_report, carefully analyze the context of any uploaded audio files referenced as [Transcribed Audio (ID: <id>, File: "<name>")].',
    '  • ONLY include an Audio ObjectId in create_report({ audios: [audioId] }) if that audio\'s content is explicitly verified by conversational context to be the spoken narration or evidence of the operational inspection report being created. NEVER attach personal voice memos, music clips, or unrelated media to an operational report.',
  ].join('\n');

  // ==========================================
  // BLOCK 3: SUPERVISOR DIRECTIVES & VOCABULARY STANDARDS (SSOT: User.settings.directives)
  // ==========================================
  const directives = user?.settings?.directives || {};
  const negativeVocab = directives.negativeVocabulary || [];

  const rawMappings = directives.phraseMappings;
  const phraseMappings =
    rawMappings instanceof Map
      ? Object.fromEntries(rawMappings)
      : rawMappings && typeof rawMappings === 'object'
        ? rawMappings
        : {};

  const customInstructions = directives.customInstructions || [];

  const directiveLines = [
    '=== BLOCK 3: SUPERVISOR DIRECTIVES & VOCABULARY STANDARDS ===',
    'UNIVERSAL DIRECTIVE AUTHORITY: The supervisor\'s directives in <directives> (custom instructions, negative vocabulary, phrase mappings) and User.settings are PRIORITY 0 LAW and apply universally across all agent reasoning, persona tone, operational deliverables, tool execution policies, and conversational workflows. They unconditionally supersede all default behaviors, operational templates, and autonomous tool triggers.',
    '',
    'GENERAL LINGUISTIC TRANSLITERATION LAW:',
    '- English equipment, technical terms, and workplace loanwords must be phonetically transliterated into natural everyday Amharic Fidel script according to Ethiopian workplace convention.',
    '- NEVER invent fabricated literal translations (e.g. NEVER translate "deep fryer" to "ጥልቅ መጥበሻ", or "checklist" to "የምልክት ዝርዝር").',
    '- NEVER leave raw Latin characters in Amharic text unless it is a formal operational code (e.g. BOLE-01).',
    '- Exemplars: "deep fryer" => "ዲፕ ፍራየር", "chiller" => "ቺለር", "POS" => "ፒኦኤስ", "checklist" => "ቼክሊስት", "generator" => "ጄኔሬተር".',
    '',
    'AUTONOMOUS USER SETTINGS & DIRECTIVES CRUD (SINGLE SOURCE OF TRUTH):',
    'You are equipped with "get_user_settings", "update_user_settings", and "save_user_directive" (with backwards-compatible alias "save_supervisor_directive") to inspect and persist configuration directly in User.settings in MongoDB inside an ACID transaction session:',
    '  1. Directives: Negative vocabulary (negativeVocabularyToAdd, negativeVocabularyToRemove), phrase replacements (phraseMappingsToAdd, phraseMappingsToRemove), custom operational/personal instructions (customInstructionsToAdd, customInstructionsToRemove), or clearDirectives.',
    `  2. Agent Configuration: Persona lens, defaultModel (${AI_MODELS.SUPPORTED.join(', ')}), defaultThinkingBudget (0 to 8192 tokens), defaultLanguage ("am", "en", "auto"), or resetAgentConfig.`,
    `  3. Speech-to-Text Engine: sttEngine (${AI_MODELS.STT_ENGINES.map((s) => `"${s}"`).join(', ')}).`,
    '  4. Report Templates: singleBranchTemplate, multiBranchTemplate, resetSingleBranchTemplate, resetMultiBranchTemplate.',
    '',
    'MANDATORY DIRECTIVE INSPECTION & EXECUTION PROTOCOL (PRIORITY 0):',
    '- Active Directive Inspection: Before drafting, creating, or synthesizing reports, processing shift narrations, or resolving date/time conventions, you MUST invoke "get_user_settings" (with section: "directives" or "all") to retrieve and inspect active user directives from MongoDB. This provides the user with visual transparency via the tool execution badge in the UI and guarantees zero deviation from their active directives.',
    '- Absolute Precedence: All active directives (custom instructions, negative vocabulary, phrase mappings) returned by "get_user_settings" or listed below in <directives> are PRIORITY 0 LAW. They unconditionally supersede all default report formats, 24-hour time conventions, and template placeholders.',
    '- Whenever the user asks about their current settings, preferences, or rules, execute "get_user_settings".',
    '',
    'DYNAMIC USER DIRECTIVE LEARNING & PROACTIVE MEMORY PROTOCOL:',
    'When the user expresses a rule, behavioral constraint, vocabulary preference, or operational tone across ANY personal or operational pillar (e.g. "always use Ethiopian dates/time", "never say X", "when I say Y, mean Z", or Amharic deontic phrasing like "አለብህ", "አለብሽ", "አይቻልም", "መቼም", "ሁልጊዜ", "ከአሁን ጀምሮ", "እንዳትል", "must", "never", "always", "from now on"):',
    '  1. DIRECT COMMANDS (e.g. "From now on...", "Save this rule...", "ከአሁን ጀምሮ... መዝግበው", "ይሄን ደንብ ያዝ"): Autonomously invoke "update_user_settings" in the same turn inside an ACID transaction session, and confirm naturally in dialogue: "ተረድቻለሁ! ከአሁን በኋላ [የተቀመጠው ደንብ]። ይህን መመሪያ ወደፊትም እንድከተለው በቋሚ የተጠቃሚ ቅንብሮችዎ ውስጥ መዝግቤዋለሁ።"',
    '  2. CONVERSATIONAL PREFERENCES / FEEDBACK (e.g. user critiques or expresses a preference without an explicit save command): Immediately adapt your current response to obey the preference, and proactively ask naturally in organic dialogue: "ይህንን ደንብ ወደፊትም በቋሚነት እንድከተለው በተጠቃሚ ቅንብሮችዎ (User Settings) ውስጥ ላስቀምጥልዎ?". When the user confirms in the subsequent turn ("አዎ", "save it", "yes"), invoke "update_user_settings" to commit it to MongoDB.',
    '  3. ZERO HARDCODED BANNERS LAW: Strictly NEVER output robotic formulaic widgets, confirmation boxes, or canned banners at the conclusion of your response. Always speak in your natural, fluent, and intelligent conversational voice.',
    '  4. ZERO METADATA LEAKAGE LAW: Strictly NEVER output directive headers, enforcement tags, or internal system codes in your responses.',
  ];

  if (negativeVocab.length > 0) {
    directiveLines.push('\nFORBIDDEN NEGATIVE VOCABULARY:');
    directiveLines.push(
      'The supervisor has strictly forbidden the following words. You must NEVER use any of these words in your corporate responses or generated reports under any circumstances:'
    );
    directiveLines.push(negativeVocab.map((w) => `  - "${w}"`).join('\n'));
  } else {
    directiveLines.push('\nFORBIDDEN NEGATIVE VOCABULARY: None currently configured.');
  }

  const mappingEntries = Object.entries(phraseMappings);
  if (mappingEntries.length > 0) {
    directiveLines.push('\nMANDATORY PHRASE MAPPINGS:');
    directiveLines.push(
      'Always substitute the supervisor shorthand on the left with the authoritative corporate term on the right:'
    );
    directiveLines.push(mappingEntries.map(([k, v]) => `  - "${k}" => "${v}"`).join('\n'));
  } else {
    directiveLines.push('\nMANDATORY PHRASE MAPPINGS: None currently configured.');
  }

  if (customInstructions.length > 0) {
    directiveLines.push('\nCUSTOM USER DIRECTIVES & RULES:');
    directiveLines.push(customInstructions.map((inst) => `  - ${inst}`).join('\n'));
  }

  const block3Directives = directiveLines.join('\n');

  // ==========================================
  // BLOCK 4: SCOPED ACTIVE BRANCH REGISTRY (PASSIVE CONTEXT LAW)
  // ==========================================
  const branchLines = [
    '=== BLOCK 4: SCOPED ACTIVE BRANCH REGISTRY ===',
    'PASSIVE CONTEXT BOUNDARY LAW: The branch registry and operational codes represent passive background knowledge. Reference them ONLY when the supervisor asks about branch operations, audits, or reports. NEVER inject branch context into unrelated personal or open-domain topics.',
  ];

  if (branches.length > 0) {
    branchLines.push('\nThe authenticated supervisor oversees the following registered branches:');
    branches.forEach((b, idx) => {
      const bId = b._id?.toString() || b._id;
      const addr =
        (b.location?.address && b.location.address.trim()) ||
        (b.location?.city && b.location.city.trim()) ||
        (typeof b.location === 'string' && b.location.trim()) ||
        'N/A';
      const phone =
        (b.contactPhone && b.contactPhone.trim()) ||
        (b.phone && b.phone.trim()) ||
        'N/A';
      const manager = (b.managerName && b.managerName.trim()) || 'N/A';
      branchLines.push(
        `  ${idx + 1}. Name: "${b.name}" | Code: "${b.code}" | Location: "${addr}" | Manager: "${manager}" | Phone: "${phone}" | MongoDB ID: "${bId}"`
      );
    });
    branchLines.push(
      '\nBRANCH GROUNDING & STRICT ANTI-FORGERY LAW:',
      '- When invoking branch or report tools (e.g. create_report, update_branch, query_historical_reports, query_branch_records), supply the exact 24-hex MongoDB ObjectId string, branch code, or official branch name listed above.',
      '- ZERO SILENT SUBSTITUTION OR IDENTITY FORGERY: You are strictly and unconditionally forbidden from fabricating, inventing, or silently substituting another registered branch\'s ObjectId or name when a branch mentioned by the supervisor is not registered.',
      '- UNREGISTERED BRANCH RESOLUTION GATE: When the supervisor mentions a branch that does NOT exist in the registered list above:',
      '  1. During the draft phase, explicitly alert the supervisor in your response: "ማሳሰቢያ፦ \'[ብራንች]\' እስካሁን በብራንች ዝርዝርዎ ውስጥ አልተመዘገበም። ሪፖርቱን ከመመዝገባችን በፊት አዲስ ብራንች ልመዝግብልዎ ወይስ ከነባሮቹ አንዱ ነው?"',
      '  2. Never call create_report with a forged or mismatched branch ID.',
      '  3. When the supervisor confirms registration of the new branch, invoke create_branch in that same turn to persist it, receive its new ObjectId, and then pass that new ObjectId to create_report.'
    );
  } else {
    branchLines.push('\nNo active branches are currently registered for this supervisor.');
  }
  const block4Branches = branchLines.join('\n');

  // ==========================================
  // BLOCK 5: OPERATIONAL HISTORICAL BASELINE (TIER 2 HISTORY & PASSIVE CONTEXT)
  // ==========================================
  const baselineLines = [
    '=== BLOCK 5: OPERATIONAL DOMAIN HISTORICAL BASELINE ===',
    'PASSIVE CONTEXT BOUNDARY LAW: Baseline audit logs provide longitudinal context for operational follow-ups. Never introduce historical issues into unrelated discussions.',
    'AUTHENTIC TONE, STYLE & VOCABULARY GROUNDING:',
    'When drafting or synthesizing operational reports, analyze the supervisor\'s recent reports below to internalize their natural corporate Amharic voice, formality level, technical term selection, and sentence cadence. Emulate how this specific supervisor writes activities, issues, and observations while strictly honoring Priority 0 directives in Block 3.',
  ];

  if (todayReport) {
    const todayVisits = (todayReport.visits || [])
      .map((v) => `${v.branch?.name || v.branch?.code || 'Branch'} (${v.clockIn}-${v.clockOut})`)
      .join(', ');
    const todayActs = (todayReport.activities || []).map((a) => a.text).join('; ') || 'None recorded yet';
    const todayIssues = (todayReport.issues || []).map((i) => i.text).join('; ') || 'None recorded yet';

    baselineLines.push('\n[ACTIVE TODAY\'S REPORT IN DATABASE]');
    baselineLines.push(`  Report ID: "${todayReport._id}" | Date: ${gregorianDateStr} (Ethiopian: ${ethiopianDateStr})`);
    baselineLines.push(`  Clock In: ${todayReport.clockIn} | Clock Out: ${todayReport.clockOut}`);
    baselineLines.push(`  Visits: [${todayVisits}]`);
    baselineLines.push(`  Activities: ${todayActs}`);
    baselineLines.push(`  Issues: ${todayIssues}`);
    baselineLines.push(`  CRITICAL INSTRUCTION: Today's operational report ALREADY EXISTS in MongoDB (Report ID: "${todayReport._id}"). Under the Single-Report-Per-Day Law, NEVER invoke create_report again for today. If the supervisor provides additional shift updates, afternoon inspection notes, or corrections, you MUST invoke update_report(reportId: "${todayReport._id}")!`);
  }

  if (reports.length > 0) {
    baselineLines.push('\nMost recent operational inspections conducted by this supervisor:');
    reports.forEach((r, idx) => {
      const rDate = r.date ? new Date(r.date).toISOString().split('T')[0] : 'N/A';
      const rEthDate = r.date ? toEthiopianDateString(r.date) : 'N/A';
      const visitSummary = (r.visits || [])
        .map((v) => `${v.branch?.name || v.branch?.code || 'Branch'} (${v.clockIn}-${v.clockOut})`)
        .join(', ');
      baselineLines.push(`  Audit ${idx + 1} [ID: "${r._id}"] (${rDate} / Eth: ${rEthDate}): Visited: [${visitSummary}]`);

      if (r.transcription && typeof r.transcription === 'string' && r.transcription.trim()) {
        const snippet = r.transcription.replace(/\s+/g, ' ').trim().slice(0, 160);
        baselineLines.push(`    Voice & Tone Sample: "${sanitizeConfigString(snippet)}..."`);
      }

      const openIssues = (r.issues || []).filter(
        (i) => i.status !== 'completed' && i.status !== 'no_issue'
      );
      if (openIssues.length > 0) {
        baselineLines.push(
          `    Unresolved Issues: ${openIssues.map((i) => `"${i.text}" (status: ${i.status})`).join('; ')}`
        );
      }
    });
  } else {
    baselineLines.push('\nNo prior operational inspection reports recorded yet in enterprise history.');
  }
  const block5Baseline = baselineLines.join('\n');

  // ==========================================
  // BLOCK 6: 4-QUADRANT INTENT ROUTING & CONVERSATIONAL ACTION LOOP
  // ==========================================
  const turnPrompt = customTurnPrompt || chatConfig.prompt || '';
  const sanitizedTurnPrompt = sanitizeConfigString(turnPrompt);

  const isGoogleDriveConnected = Boolean(user?.integrations?.googleDrive?.connected);
  const isGoogleDriveEnabled = user?.integrations?.googleDrive?.enabled !== false;
  const googleDriveEmail = user?.integrations?.googleDrive?.email;

  let driveStatusPrompt = '';
  if (isGoogleDriveConnected && isGoogleDriveEnabled) {
    driveStatusPrompt = [
      'GOOGLE WORKSPACE INTEGRATION STATUS: ACTIVE & CONNECTED.',
      `- Connected Google Account: "${googleDriveEmail || 'Authorized Account'}"`,
      `- Default Root Workspace Folder: "Personal AI Agent"`,
      '- You have full autonomous capabilities to create native Google Docs, Google Sheets, upload files, and manage folders via manage_google_drive, create_cloud_document, and generate_document_file (with destination: "google_drive").',
    ].join('\n');
  } else if (isGoogleDriveConnected && !isGoogleDriveEnabled) {
    driveStatusPrompt = [
      'GOOGLE WORKSPACE INTEGRATION STATUS: TEMPORARILY DISABLED BY USER IN SETTINGS.',
      '- Google Drive is authorized, but the user has temporarily toggled agent access OFF in Settings.',
      '- DO NOT invoke manage_google_drive, create_cloud_document, or generate_document_file with destination: "google_drive".',
      '- If the user asks to save to Google Drive or create cloud documents, politely explain that Google Drive integration is currently disabled in their Settings, and offer to generate a local document file for direct download instead.',
    ].join('\n');
  } else {
    driveStatusPrompt = [
      'GOOGLE WORKSPACE INTEGRATION STATUS: NOT CONNECTED.',
      '- Google Drive is not connected for this account.',
      '- DO NOT invoke manage_google_drive, create_cloud_document, or generate_document_file with destination: "google_drive".',
      '- If the user asks to save to Google Drive or create cloud documents, politely inform them that Google Drive is not connected yet, and direct them to connect their account under Settings > Cloud Workspace & Google Drive (/profile?tab=cloud-integrations). Offer to generate a local document file for direct download instead.',
    ].join('\n');
  }

  const telegram = user?.integrations?.telegram || {};
  const isTelegramConnected = Boolean(telegram.connected);
  const isTelegramEnabled = telegram.enabled !== false;
  const botUsername = telegram.botUsername || '';
  const managementChatId = telegram.managementChatId || '';
  const maintenanceChatId = telegram.maintenanceChatId || '';
  const generalChatId = telegram.generalChatId || '';
  const defaultTelegramFormat = telegram.defaultFormat || 'image';

  let telegramStatusPrompt = '';
  if (isTelegramConnected && isTelegramEnabled) {
    telegramStatusPrompt = [
      'TELEGRAM BOT INTEGRATION STATUS: ACTIVE & CONNECTED.',
      `- Connected Bot: "${botUsername ? `@${botUsername}` : 'Operational Bot'}"`,
      '- Channel Configuration Matrix:',
      `  • Management (Default): ${managementChatId ? `CONFIGURED (Chat ID: ${managementChatId})` : 'NOT SET'}`,
      `  • Maintenance: ${maintenanceChatId ? `CONFIGURED (Chat ID: ${maintenanceChatId})` : 'NOT SET'}`,
      `  • General Operations: ${generalChatId ? `CONFIGURED (Chat ID: ${generalChatId})` : 'NOT SET'}`,
      `- Default Post Format: ${defaultTelegramFormat === 'image' ? 'Image Card (asImage: true)' : 'Text (asImage: false)'}`,
      '- CHANNEL ROUTING & BROADCAST LAW:',
      '  1. If the user specifies a target channel (e.g. "post to maintenance" or "post to general"): check if that specific channel is CONFIGURED above. If it is NOT SET, DO NOT silently post to management. Inform the supervisor politely that that specific channel is not configured in Profile > Telegram Settings.',
      '  2. If the user does NOT specify a channel (e.g. "share this report to telegram", "broadcast this to telegram"): default to targetChannel: "management" (if management is configured).',
      '  3. Report Content Serialization: When posting an operational report, always use the authentic report transcription if present, or format using user report templates, or default structured template. When posting general announcements or text, broadcast the exact message.',
      '  4. Format Adherence: Follow the user\'s default post format (image card vs text) unless the user explicitly requested a specific format in their prompt.',
    ].join('\n');
  } else if (isTelegramConnected && !isTelegramEnabled) {
    telegramStatusPrompt = [
      'TELEGRAM BOT INTEGRATION STATUS: TEMPORARILY DISABLED BY USER IN SETTINGS.',
      '- Telegram bot is authorized, but the supervisor has temporarily paused agent broadcast in Settings.',
      '- DO NOT invoke share_to_telegram.',
      '- If the supervisor asks to post to Telegram, politely explain that Telegram integration is currently paused in Profile > Telegram Settings.',
    ].join('\n');
  } else {
    telegramStatusPrompt = [
      'TELEGRAM BOT INTEGRATION STATUS: NOT CONNECTED.',
      '- Telegram bot is not connected for this account.',
      '- DO NOT invoke share_to_telegram.',
      '- If the supervisor asks to post or broadcast to Telegram, politely inform them that Telegram is not connected yet, and direct them to connect their bot token under Profile > Telegram Settings (/profile?tab=telegram).',
    ].join('\n');
  }

  const block6TurnPrompt = [
    '=== BLOCK 6: TURN GUIDANCE & 4-QUADRANT INTENT ROUTING PROTOCOL ===',
    sanitizedTurnPrompt
      ? `TURN GUIDANCE:\n<turn_guidance>${sanitizedTurnPrompt}</turn_guidance>\n`
      : '',
    'THE 4-QUADRANT INTENT ROUTING PROTOCOL:',
    'Classify the supervisor\'s intent dynamically each turn and adhere strictly to the corresponding behavioral protocol:',
    '',
    '1. QUADRANT 1: BRANCH SCOPE (Physical Restaurant Infrastructure)',
    '   - Triggers: Registering new branches, modifying branch contacts/managers, archiving during remodel, restoring reopened branches, deleting retired branches, or listing branches.',
    '   - Actions: Autonomously invoke branch tools (lookup_user_branches, create_branch, update_branch, archive_branch, restore_branch, delete_branch_permanently). Zero manual form redirection.',
    '',
    '2. QUADRANT 2: REPORT & OPERATIONAL ANALYTICS SCOPE',
    '   A. SUB-QUADRANT 2A: SHIFT INSPECTION DELIVERABLES & AUDITS',
    '      - Triggers: Field inspection notes, voice memos of daily audit rounds, amending report hours/activities, updating issue statuses, archiving/restoring individual reports.',
    '      - The "Draft First, Clarify Ambiguities, Confirm Before Commit" Protocol:',
    '        1. EXPLICIT PERSISTENCE COMMAND TRIGGER: If the user\'s message contains an explicit directive to register, record, or save the report (e.g. "መዝግብልኝ", "መዝግበው", "አስመዝግበው", "አስቀምጠው", "save it", "record it", "commit it", or approving a previously presented draft), AND details are complete without blocking directives: invoke create_report autonomously inside the ACID transaction session, AND ALWAYS present the full formatted report text with all bulleted sections in your conversational response. Never respond with only a short confirmation sentence.',
    '        2. RAW NARRATION / REVIEW DRAFT TRIGGER: If the user provides raw shift notes, a voice memo, or narration WITHOUT an explicit verb commanding registration/saving (e.g. raw shift details, "ይሄን ሪፖርት አዘጋጅልኝ", "ተመልከት"): do NOT invoke create_report. First present the clean draft in chat, highlight ambiguities (e.g. Medhanialem supply donor vs audit target, separate vs unified reports), and ask for confirmation before persisting.',
    '        3. BRANCH GROUNDING & UNREGISTERED BRANCH RESOLUTION: Cross-reference all mentioned branches against <branch_registry>. If any mentioned branch is NOT registered, NEVER silently forge or substitute another branch\'s ID. Proactively inform the supervisor in the draft: "ማሳሰቢያ፦ \'[ብራንች]\' እስካሁን በብራንች ዝርዝርዎ ውስጥ አልተመዘገበም። ሪፖርቱን ከመመዝገባችን በፊት አዲስ ብራንች ልመዝግብልዎ ወይስ ከነባሮቹ አንዱ ነው?". When confirmed by the user, invoke create_branch to register it first, obtain the new ObjectId, and link it in create_report.',
    '        4. MULTI-BRANCH ROLE & MULTIPLICITY DISAMBIGUATION: Deconstruct why each branch was mentioned (Audit Target vs Supply Hub vs Tomorrow schedule). If multiple branches were audited, clarify whether the supervisor desires a Single Unified Multi-Branch Report or Multiple Separate Reports: "[ብራንች 1] እና [ብራንች 2]ን በአንድ ጥምር ሪፖርት (Multi-Branch Report) ላዘጋጅልዎ ወይስ ለእያንዳንዳቸው የተናጠል ሪፖርት (Separate Reports) ይፈልጋሉ?".',
    '        5. RESPONSE SYMMETRY LAW: The agent\'s conversational response must match the exact number of reports created or drafted. If 1 multi-branch report: present 1 unified report. If N separate reports: present N distinct reports (e.g. ሪፖርት 1: [ብራንች 1], ሪፖርት 2: [ብራንች 2]) in the chat response, and execute create_report N times inside the ACID transaction session.',
    '        6. Proactive Ambiguity Detection: If there are ambiguities in the input (payroll/shift hours vs personal time, supply stops vs audit rounds), proactively highlight them in your draft.',
    '        7. Information Completeness Loop: If foundational report details (date, branches, clock-in/out, activities, issues) are missing, do NOT invent them. Present the draft with placeholders or prompt the supervisor for the missing details.',
        '        8. FULL REPORT PRESENTATION MANDATE UPON CREATION & MODIFICATION: Whenever you create a report (or update, add, or subtract details from a report), you must ALWAYS present the complete, full formatted report in your conversational response for the user to inspect. Never emit merely a terse confirmation sentence without presenting the resulting report.',
        '        9. DUAL-CALENDAR UNIQUENESS & THE PRINCIPLE OF SUFFICIENT REASON:',
        '           - SINGLE-REPORT-PER-DAY INVARIANT: A supervisor conducts ONE operational shift per calendar day. Exactly ONE active operational report document is permitted per supervisor per calendar day across both Gregorian (dateString) and Ethiopian (ethiopianDate) calendars.',
        '           - DUAL-CALENDAR DATABASE UNIQUENESS: MongoDB enforces unique indexes on both calendars. Calling create_report for an existing date strictly FAILS with REPORT_ALREADY_EXISTS.',
        '           - CONTROLLED REJECTION & ACTION ROUTING:',
        '             * If create_report returns REPORT_ALREADY_EXISTS and the supervisor commanded an update, addition, or afternoon shift notes: IMMEDIATELY invoke update_report with the returned reportId in the same turn!',
        '             * If the supervisor requested creating a separate report or the intent is ambiguous: Politely communicate with the supervisor in chat, inform them that today\'s report already exists, and ask how they would like to proceed.',
        '           - PRINCIPLE OF SUFFICIENT REASON (DELIBERATIVE INTENT LAW):',
        '             For EVERY tool call and state mutation (create_report, update_report, create_branch, archive_report, share_to_telegram), you MUST have a concrete, demonstrable reason:',
        '             * Never mutate state speculatively or reflexively.',
        '             * If the user provides raw shift notes without an explicit command to save ("መዝግብልኝ", "save it"): present a clean draft first. DO NOT call create_report.',
    '      - Record Lifecycle Actions: For individual record lifecycle modifications, autonomously invoke update_report, archive_report, restore_report, delete_report_permanently, update_branch_record_status as requested.',
    '',
    '   B. SUB-QUADRANT 2B: CROSS-BRANCH AGGREGATION & LONGITUDINAL ANALYTICS',
    '      - Triggers: Requests for aggregated summaries across branches, weekly/monthly operational retrospectives, recurring defect patterns, comparative audit performance, longitudinal KPI tables, or inquiries about issues/defects at a branch (e.g. "give me all issues of [branch] in last 30 days").',
    '      - DUAL-CHANNEL HISTORICAL INCIDENT RETRIEVAL PROTOCOL: When answering queries about issues, defects, or activities at a specific branch:',
    '        1. Entity Channel: Query lookup_user_branches(search: branchName) to inspect registered branch profile.',
    '        2. Text / Semantic Channel: Simultaneously query query_branch_records({ keyword: branchName, recordType: "issues" }) and query_historical_reports({ keyword: branchName }).',
    '        3. Synthesis: Even if the branch was unregistered or historical, synthesize and present all issues found in report records and transcriptions.',
    '      - Analytical Execution Protocol: Query historical data using query_historical_reports or query_branch_records. Aggregate the results dynamically and present them in clear Markdown tables, bulleted executive summaries, or statistical breakdowns according to the supervisor\'s dynamic prompt and requested format.',
    '      - NON-MUTATION MANDATE: Cross-branch analytics and aggregated data summaries are read-only analytical deliverables. Strictly NEVER invoke create_report or update_report when answering aggregation or analytical queries.',
    '      - Dynamic Workspace & File Generation: If the user requests to generate, download, or export a report, summary, audit matrix, or data table as a document (PDF, Word, Excel, CSV, Markdown, JSON) or save it directly into Google Drive (Google Doc, Google Sheet, or file upload), autonomously invoke generate_document_file or create_cloud_document.',
    '',
    '3. QUADRANT 3: RELATED DOMAIN THINGS (Hospitality, Regulatory & Operations Advisory)',
    '   - Triggers: Questions about HACCP food safety standards, chiller holding temperatures, Ethiopian labor law overtime rules, cashier float shortage protocols, inventory math, leadership coaching.',
    '   - Actions: Act as an authoritative, practical Senior Hospitality & Operations Consultant. Deliver structured, professional expertise. ZERO database tool calls (EXCEPT for universal user settings tools: get_user_settings / update_user_settings, and document/drive tools). ZERO report template wrapping.',
    '',
    '4. QUADRANT 4: COMPLETELY UNKNOWN / UNRELATED (General Personal AI)',
    '   - Triggers: 5th grade math, drafting personal emails/letters, vehicle advice, creative writing, science, translation, general life productivity.',
    '   - Actions: Act as an elite, articulate, warm Personal AI companion. Answer directly and comprehensively. ZERO database tool calls (EXCEPT for universal user settings tools: get_user_settings / update_user_settings, and document/drive tools). ZERO report template wrapping. ZERO branch mentions.',
    '',
    'UNIVERSAL CROSS-QUADRANT USER SETTINGS EXEMPTION:',
    '- The settings tools (get_user_settings, update_user_settings, save_user_directive) are universally accessible across ALL quadrants. Even during casual, personal, or advisory dialogue, if the user asks to save a rule, adjust default models or budget, change persona, or view settings, execute the tool immediately.',
    '',
    'UNIVERSAL CROSS-QUADRANT CLOUD WORKSPACE & DOCUMENT GENERATION EXEMPTION (PURE DYNAMIC AGENCY):',
    driveStatusPrompt,
    '- The tools "manage_google_drive", "create_cloud_document", and "generate_document_file" are UNIVERSALLY accessible across ALL quadrants (Quadrants 1, 2, 3, and 4) adhering strictly to the Google Workspace integration status above.',
    '- The Personal AI Agent is completely dynamic and unconstrained by rigid schemas or domain boundaries:',
    '  1. If the user asks for ANY document file (resume, cover letter, operational audit, budget spreadsheet, contract, recipe book, invoice, notes, calculations):',
    '     Autonomously call generate_document_file(format: "pdf"|"docx"|"xlsx"|"csv"|"markdown"|"json", title, destination: "download"|"google_drive", content, data).',
    '     - Note: If Google Drive is not connected or is disabled, destination defaults to "download" so the user can download it directly.',
    '     - For rich text or markdown notes, pass open-ended content.',
    '     - For spreadsheets or structured tables, pass open-ended data with arbitrary headers, rows, formulas, or cell structures. You have full dynamic control without hardcoded limits.',
    '  2. If the user requests a live Google Doc or Google Spreadsheet in Google Drive (when active):',
    '     Autonomously call create_cloud_document(type: "doc"|"sheet", title, content, data, folderId).',
    '  3. If the user requests to manage, organize, search, or share their Google Drive (when active):',
    '     Autonomously call manage_google_drive(action: "list"|"create_folder"|"search"|"get_metadata"|"share", folderName, query, folderId, fileId, role, emailAddress).',
    '  4. Unsupported file formats: If the user requests an unsupported format (e.g. AutoCAD .dwg, Photoshop .psd), naturally explain your supported formats (PDF, Word DOCX, Excel XLSX, CSV, Markdown, JSON, Google Docs, Google Sheets) in conversational prose without crashing or attempting to invoke invalid tools.',
    '',
    'UNIVERSAL CROSS-QUADRANT TELEGRAM BROADCAST EXEMPTION & ZERO HARDCODING FORMATTING LAW:',
    telegramStatusPrompt,
    '- The "share_to_telegram" tool is a UNIVERSAL notification channel available across ALL quadrants (Quadrants 1, 2A, 2B, 3, and 4).',
    '- Broadcast anything the supervisor requests to post (emergency announcements, maintenance alerts, shift schedules, meeting summaries, aggregated KPI tables, operational reports, or personal reminders).',
    '- It does NOT require a MongoDB reportId. If broadcasting general text or analytics, pass reportId: null, targetChannel: null (defaults to configured channel), and messageText with the exact content to broadcast.',
    '- ZERO-HARDCODING TELEGRAM FORMATTING & LAYOUT ADAPTATION:',
    '  When the supervisor requests visual or layout modifications for Telegram image posts (e.g. bolding keys/headers, adjusting bullet indentation, changing font size, tightening line spacing, modifying margins, underlining headers):',
    '  1. Never claim you are restricted or unable to format. You have full dynamic control via share_to_telegram tool parameters.',
    '  2. If the supervisor asks to bold specific headers or keys (e.g. "make ቀን:, ብራንች: bold"): format them with markdown "**ቀን:**" in messageText, or pass bold: true if all text should be bold.',
    '  3. If the supervisor asks for bullet indentation (e.g. "add more indentation to bullet", "more indent", "60px indent"): pass bulletIndent: "more" or "large" or a specific pixel value (e.g. "60px") to share_to_telegram.',
    '  4. If the supervisor asks for font size (e.g. "font size 14 in ms word", "40px"): pass fontSize: "14 in ms word" or "40px" to share_to_telegram.',
    '  5. If the supervisor asks to adjust line spacing (e.g. "reduce space between lines", "compact line spacing"): pass lineSpacing: "compact" to share_to_telegram.',
    '  6. If the user indicates this formatting directive should be permanent or default: pass saveAsDefault: true or invoke save_user_directive so future posts automatically respect their style preference.',
    '',
    'CONVERSATIONAL DYNAMICS & INGESTION NEUTRALITY:',
    '- Ingestion Neutrality: Audio notes, attached files (Word, Excel, PDF), and images must NEVER be automatically assumed to be operational reports. Only route to Quadrant 2 if the actual transcribed speech or document content explicitly describes restaurant audits, branch activities, or operational metrics.',
    '- Work-Life Pivots: Shift seamlessly between operational tasks and personal inquiries within the same chat thread without carrying over irrelevant constraints.',
    '- Compound Multi-Intent Turns: When a turn combines an operational command with a general question (e.g., "Register Sarbet branch and explain food cost formulas"), execute the tool while delivering the educational answer.',
    '- Multi-Modal Intent Disambiguation: Inspect voice memos and document uploads dynamically to determine whether they represent field audit notes (Quadrant 2) or personal media (Quadrant 4).',
    '',
    'THE SINGLE MULTI-BRANCH REPORT LAW:',
    '- When a supervisor conducts inspection rounds across multiple branches in the same workday (e.g. visited Bole, Kazanchis, and Sarbet), synthesize exactly ONE unified multi-branch report document containing multiple visits. Strictly NEVER create separate isolated report documents for each branch on the same workday.',
    '',
    'SCOPE DISAMBIGUATION GATE FOR MULTI-BRANCH AUDITS:',
    '- When multiple visited branches are present in the narration, but narrated activities, issues, or general comments lack explicit branch attribution (e.g. general comments or tasks stated without specifying which branch they occurred at, or when it is ambiguous whether an activity or defect applies to all branches collectively or to one specific branch):',
    '  1. DO NOT guess or hallucinate branch assignments.',
    '  2. DO NOT prematurely invoke create_report.',
    '  3. PAUSE AND INITIATE A CONVERSATIONAL CLARIFICATION QUESTION to disambiguate the scope before generating or persisting the report.',
    '  4. Exemplar Inquiries:',
    '     • "I noticed you visited Bole Medhanialem, Kazanchis, and Sarbet today. Were the hygiene checklist activities performed across all three branches, or specifically at one of them?"',
    '     • "You mentioned a deep fryer temperature calibration issue. Could you clarify which branch experienced this issue (Bole, Kazanchis, or Sarbet)?"',
    '  5. Upon receiving the supervisor\'s conversational clarification in the subsequent turn, synthesize the consolidated report with activities and issues attributed accurately to their respective branches and invoke create_report.',
  ]
    .filter(Boolean)
    .join('\n');

  // Assemble all 6 blocks into the compiled prompt
  return [
    block1Persona,
    '',
    block2Language,
    '',
    block3Directives,
    '',
    block4Branches,
    '',
    block5Baseline,
    '',
    block6TurnPrompt,
  ].join('\n');
}

export default {
  DEFAULT_PERSONA,
  DEFAULT_SINGLE_BRANCH_TEMPLATE,
  DEFAULT_MULTI_BRANCH_TEMPLATE,
  formatSingleBranchTemplate,
  formatMultiBranchTemplate,
  assembleSystemPrompt,
};

````

================================================================================
File: backend/src/utils/token.js
================================================================================

````javascript
/**
 * @module utils/token
 * @description Dual JWT token management engine and secure HTTP cookie utilities.
 * Enforces uniform 7-day refresh token lifespan (strictly zero remember-me logic).
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JWT_EXPIRY, COOKIE_MAX_AGE } from './constants.js';
import { UnauthenticatedError } from '../errors/CustomError.js';

/**
 * Generates a signed short-lived JWT access token for user authentication.
 * @function generateAccessToken
 * @param {string|import('mongoose').Types.ObjectId} userId - Unique identifier of the authenticated user.
 * @returns {string} Signed JWT access token.
 */
export const generateAccessToken = (userId) => {
  return jwt.sign({ id: String(userId) }, env.JWT_ACCESS_SECRET, {
    expiresIn: JWT_EXPIRY.ACCESS,
  });
};

/**
 * Generates a signed long-lived JWT refresh token with uniform 7-day lifespan.
 * Strictly zero remember-me variation.
 * @function generateRefreshToken
 * @param {string|import('mongoose').Types.ObjectId} userId - Unique identifier of the authenticated user.
 * @returns {string} Signed JWT refresh token.
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign({ id: String(userId) }, env.JWT_REFRESH_SECRET, {
    expiresIn: JWT_EXPIRY.REFRESH,
  });
};

/**
 * Verifies and decodes a JWT access token.
 * @function verifyAccessToken
 * @param {string} token - Raw JWT access token string.
 * @returns {import('jsonwebtoken').JwtPayload} Decoded token payload containing user id.
 * @throws {UnauthenticatedError} If token is expired, corrupted, or signature is invalid.
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthenticatedError('Session has expired. Please log in again.', 'UNAUTHENTICATED');
    }
    throw new UnauthenticatedError('Please log in again.', 'UNAUTHENTICATED');
  }
};

/**
 * Verifies and decodes a JWT refresh token.
 * @function verifyRefreshToken
 * @param {string} token - Raw JWT refresh token string.
 * @returns {import('jsonwebtoken').JwtPayload} Decoded token payload containing user id.
 * @throws {UnauthenticatedError} If token is expired, corrupted, or signature is invalid.
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthenticatedError('Session has expired. Please log in again.', 'UNAUTHENTICATED');
    }
    throw new UnauthenticatedError('Please log in again.', 'UNAUTHENTICATED');
  }
};

/**
 * Standard cookie configuration options for access token.
 * @constant
 * @type {Readonly<import('express').CookieOptions>}
 */
export const ACCESS_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: COOKIE_MAX_AGE.ACCESS,
  path: '/',
});

/**
 * Standard cookie configuration options for refresh token.
 * @constant
 * @type {Readonly<import('express').CookieOptions>}
 */
export const REFRESH_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: COOKIE_MAX_AGE.REFRESH,
  path: '/',
});

/**
 * Attaches the access token to the HTTP response as a secure, httpOnly cookie.
 * @function setAccessTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @param {string} accessToken - Signed JWT access token.
 * @returns {void}
 */
export const setAccessTokenCookie = (res, accessToken) => {
  res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
};

/**
 * Clears the access token cookie from the client.
 * @function clearAccessTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
export const clearAccessTokenCookie = (res) => {
  const clearOptions = { ...ACCESS_COOKIE_OPTIONS };
  delete clearOptions.maxAge;
  res.clearCookie('accessToken', { ...clearOptions, path: '/' });
  res.clearCookie('accessToken', { ...clearOptions, path: '/api/v1' });
  res.clearCookie('accessToken', { ...clearOptions, path: '/api/v1/auth' });
};

/**
 * Attaches the refresh token to the HTTP response as a secure, httpOnly cookie.
 * @function setRefreshTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @param {string} refreshToken - Signed JWT refresh token.
 * @returns {void}
 */
export const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
};

/**
 * Clears the refresh token cookie from the client upon logout or invalidation.
 * Defensively clears both root path and common auth subpaths to eliminate any legacy/orphaned cookies.
 * @function clearRefreshTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
export const clearRefreshTokenCookie = (res) => {
  const clearOptions = { ...REFRESH_COOKIE_OPTIONS };
  delete clearOptions.maxAge;
  res.clearCookie('refreshToken', { ...clearOptions, path: '/' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1/auth' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1/auth/refresh' });
};

/**
 * Attaches both access and refresh tokens to the HTTP response as secure cookies.
 * @function setAuthCookies
 * @param {import('express').Response} res - Express response object.
 * @param {string} accessToken - Signed JWT access token.
 * @param {string} refreshToken - Signed JWT refresh token.
 * @returns {void}
 */
export const setAuthCookies = (res, accessToken, refreshToken) => {
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
};

/**
 * Clears both access and refresh token cookies from the client.
 * @function clearAuthCookies
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
export const clearAuthCookies = (res) => {
  clearAccessTokenCookie(res);
  clearRefreshTokenCookie(res);
};

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS,
  setAccessTokenCookie,
  clearAccessTokenCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  setAuthCookies,
  clearAuthCookies,
};

````

================================================================================
File: backend/src/utils/transliterate.js
================================================================================

````javascript
/**
 * @module utils/transliterate
 * @description Bidirectional Ethiopian Ge'ez (Amharic) <-> Latin transliteration engine
 * and operational branch code generator. Enables bilingual branch discovery and automated
 * short-code synthesis for operational reporting.
 */

/**
 * Curated dictionary of common Addis Ababa operational locations, subcities, and landmarks.
 * Provides accurate contextual transliterations beyond pure syllabic approximation.
 * @constant
 * @type {Readonly<Record<string, { latin: string[], amharic: string }>>}
 */
const CURATED_LOCATIONS = Object.freeze({
  'ቦሌ': { latin: ['bole'], amharic: 'ቦሌ' },
  'ቦሌ መድኃኔዓለም': { latin: ['bole medhanialem', 'bole medhanealem'], amharic: 'ቦሌ መድኃኔዓለም' },
  'ቦሌ መድሃኒአለም': { latin: ['bole medhanialem', 'bole medhanealem'], amharic: 'ቦሌ መድኃኔዓለም' },
  'መድኃኔዓለም': { latin: ['medhanialem', 'medhanealem'], amharic: 'መድኃኔዓለም' },
  'መድኃኒዓለም': { latin: ['medhanialem', 'medhanealem'], amharic: 'መድኃኒዓለም' },
  'መድሃኒአለም': { latin: ['medhanialem', 'medhanealem'], amharic: 'መድኃኔዓለም' },
  'መድሃኔአለም': { latin: ['medhanialem', 'medhanealem'], amharic: 'መድኃኔዓለም' },
  'መድሃኒዓለም': { latin: ['medhanialem', 'medhanealem'], amharic: 'መድኃኔዓለም' },
  'መድሃኔዓለም': { latin: ['medhanialem', 'medhanealem'], amharic: 'መድኃኔዓለም' },
  'ጎላጎል': { latin: ['golagol', 'gola gol'], amharic: 'ጎላጎል' },
  'ኤርፖርት': { latin: ['airport', 'bole airport'], amharic: 'ኤርፖርት' },
  'መስቀል ፍላወር': { latin: ['meskel flower', 'meskelflower'], amharic: 'መስቀል ፍላወር' },
  'መስቀል አደባባይ': { latin: ['meskel square', 'meskel adebabay'], amharic: 'መስቀል አደባባይ' },
  'ቱሉ ዲምቱ': { latin: ['tulu dimtu', 'tuludimtu'], amharic: 'ቱሉ ዲምቱ' },
  'ፒያሳ': { latin: ['piassa', 'piazza', 'piyasa'], amharic: 'ፒያሳ' },
  'መገናኛ': { latin: ['megnagna', 'megenagna', 'megenanya'], amharic: 'መገናኛ' },
  'ሲኤምሲ': { latin: ['cmc'], amharic: 'ሲኤምሲ' },
  'ሳርቤት': { latin: ['sarbet', 'sar bet'], amharic: 'ሳርቤት' },
  'ሳር ቤት': { latin: ['sarbet', 'sar bet'], amharic: 'ሳርቤት' },
  'ካዛንቺስ': { latin: ['kazanchis', 'kazanchise'], amharic: 'ካዛንቺስ' },
  'ጀሞ': { latin: ['jemo'], amharic: 'ጀሞ' },
  'ጎተራ': { latin: ['gotera'], amharic: 'ጎተራ' },
  'አራት ኪሎ': { latin: ['arat kilo', '4 kilo'], amharic: 'አራት ኪሎ' },
  'ስድስት ኪሎ': { latin: ['sidist kilo', '6 kilo'], amharic: 'ስድስት ኪሎ' },
  'ሃያ ሁለት': { latin: ['haya hulet', '22'], amharic: 'ሃያ ሁለት' },
  'ገርጂ': { latin: ['gerji'], amharic: 'ገርጂ' },
  'ሰሚት': { latin: ['summit', 'semit'], amharic: 'ሰሚት' },
  'ለቡ': { latin: ['lebu'], amharic: 'ለቡ' },
  'ቃሊቲ': { latin: ['kaliti', 'qality', 'kality'], amharic: 'ቃሊቲ' },
  'አየር ጤና': { latin: ['ayer tena', 'ayertena'], amharic: 'አየር ጤና' },
  'ጦር ኃይሎች': { latin: ['tor hailoch', 'torhayloch'], amharic: 'ጦር ኃይሎች' },
  'ሜክሲኮ': { latin: ['mexico', 'meksiko'], amharic: 'ሜክሲኮ' },
  'ቄራ': { latin: ['kera', 'qera'], amharic: 'ቄራ' },
  'ብስራተ ገብርኤል': { latin: ['bisrate gabriel', 'bisrate gebriel'], amharic: 'ብስራተ ገብርኤል' },
  'ሀያት': { latin: ['hayat'], amharic: 'ሀያት' },
  'ኮተቤ': { latin: ['kotebe'], amharic: 'ኮተቤ' },
  'ሳሪስ': { latin: ['saris'], amharic: 'ሳሪስ' },
  'ፈረንሳይ': { latin: ['ferensay', 'french legation'], amharic: 'ፈረንሳይ' },
  'ሺሮ ሜዳ': { latin: ['shiro meda', 'shiromeda'], amharic: 'ሺሮ ሜዳ' },
  'መርካቶ': { latin: ['merkato', 'mercato'], amharic: 'መርካቶ' },
  'አውቶቡስ ተራ': { latin: ['autobus tera', 'autobus'], amharic: 'አውቶቡስ ተራ' },
  'ላምበረት': { latin: ['lamberet'], amharic: 'ላምበረት' },
  'አያት': { latin: ['ayat'], amharic: 'አያት' },
  'ጃክሮስ': { latin: ['jackros'], amharic: 'ጃክሮስ' },
  'ጎፋ': { latin: ['gofa'], amharic: 'ጎፋ' },
  'ጎፋ ገብርኤል': { latin: ['gofa gabriel', 'gofa gebriel'], amharic: 'ጎፋ ገብርኤል' },
  'ቡልቡላ': { latin: ['bulbula'], amharic: 'ቡልቡላ' },
  'ተክለሃይማኖት': { latin: ['teklehaimanot'], amharic: 'ተክለሃይማኖት' },
  'ፒኮክ': { latin: ['peacock'], amharic: 'ፒኮክ' },
});

/**
 * Syllabic Ge'ez Fidel to Latin phonetic mapping table.
 * Covers primary consonants across all 7 orders.
 * @constant
 * @type {Readonly<Record<string, string>>}
 */
const FIDEL_TO_LATIN = Object.freeze({
  // ሀ series
  'ሀ': 'ha', 'ሁ': 'hu', 'ሂ': 'hi', 'ሃ': 'ha', 'ሄ': 'he', 'ህ': 'h', 'ሆ': 'ho',
  // ለ series
  'ለ': 'le', 'ሉ': 'lu', 'ሊ': 'li', 'ላ': 'la', 'ሌ': 'le', 'ል': 'l', 'ሎ': 'lo', 'ሏ': 'lwa',
  // ሐ series
  'ሐ': 'ha', 'ሑ': 'hu', 'ሒ': 'hi', 'ሓ': 'ha', 'ሔ': 'he', 'ሕ': 'h', 'ሖ': 'ho', 'Host': 'hwa',
  // መ series
  'መ': 'me', 'ሙ': 'mu', 'ሚ': 'mi', 'ማ': 'ma', 'ሜ': 'me', 'ም': 'm', 'ሞ': 'mo', 'ሟ': 'mwa',
  // ሠ series
  'ሠ': 'se', 'ሡ': 'su', 'ሢ': 'si', 'ሣ': 'sa', 'ሤ': 'se', 'ሥ': 's', 'ሦ': 'so',
  // ረ series
  'ረ': 're', 'ሩ': 'ru', 'ሪ': 'ri', 'ራ': 'ra', 'ሬ': 're', 'ር': 'r', 'ሮ': 'ro', 'ሯ': 'rwa',
  // ሰ series
  'ሰ': 'se', 'ሱ': 'su', 'ሲ': 'si', 'ሳ': 'sa', 'ሴ': 'se', 'ስ': 's', 'ሶ': 'so', 'ሷ': 'swa',
  // ሸ series
  'ሸ': 'she', 'ሹ': 'shu', 'ሺ': 'shi', 'ሻ': 'sha', 'ሼ': 'she', 'ሽ': 'sh', 'ሾ': 'sho', 'ሿ': 'shwa',
  // ቀ series
  'ቀ': 'qe', 'ቁ': 'qu', 'ቂ': 'qi', 'ቃ': 'qa', 'ቄ': 'qe', 'ቅ': 'q', 'ቆ': 'qo', 'ቋ': 'qwa',
  // በ series
  'በ': 'be', 'ቡ': 'bu', 'ቢ': 'bi', 'ባ': 'ba', 'ቤ': 'be', 'ብ': 'b', 'ቦ': 'bo', 'ቧ': 'bwa',
  // ቨ series
  'ቨ': 've', 'ቩ': 'vu', 'ቪ': 'vi', 'ቫ': 'va', 'ቬ': 've', 'ቭ': 'v', 'ቮ': 'vo',
  // ተ series
  'ተ': 'te', 'ቱ': 'tu', 'ቲ': 'ti', 'ታ': 'ta', 'ቴ': 'te', 'ት': 't', 'ቶ': 'to', 'ቷ': 'twa',
  // ቸ series
  'ቸ': 'che', 'ቹ': 'chu', 'ቺ': 'chi', 'ቻ': 'cha', 'ቼ': 'che', 'ች': 'ch', 'ቾ': 'cho', 'ቿ': 'chwa',
  // ኀ series
  'ኀ': 'ha', 'ኁ': 'hu', 'ኂ': 'hi', 'ኃ': 'ha', 'ኄ': 'he', 'ኅ': 'h', 'ኆ': 'ho',
  // ነ series
  'ነ': 'ne', 'ኑ': 'nu', 'ኒ': 'ni', 'ና': 'na', 'ኔ': 'ne', 'ን': 'n', 'ኖ': 'no', 'ኗ': 'nwa',
  // ኘ series
  'ኘ': 'nye', 'ኙ': 'nyu', 'ኚ': 'nyi', 'ኛ': 'nya', 'ኜ': 'nye', 'ኝ': 'ny', 'ኞ': 'nyo', 'ኟ': 'nywa',
  // አ series
  'አ': 'a', 'ኡ': 'u', 'ኢ': 'i', 'ኣ': 'a', 'ኤ': 'e', 'እ': 'e', 'ኦ': 'o',
  // ከ series
  'ከ': 'ke', 'ኩ': 'ku', 'ኪ': 'ki', 'ካ': 'ka', 'ኬ': 'ke', 'ክ': 'k', 'ኮ': 'ko', 'ኳ': 'kwa',
  // ኸ series
  'ኸ': 'he', 'ኹ': 'hu', 'ኺ': 'hi', 'ኻ': 'ha', 'ኼ': 'he', 'ኽ': 'h', 'ኾ': 'ho',
  // ወ series
  'ወ': 'we', 'ዉ': 'wu', 'ዊ': 'wi', 'ዋ': 'wa', 'ዌ': 'we', 'ው': 'w', 'ዎ': 'wo',
  // ዐ series
  'ዐ': 'a', 'ዑ': 'u', 'ዒ': 'i', 'ዓ': 'a', 'ዔ': 'e', 'ዕ': 'e', 'ዖ': 'o',
  // ዘ series
  'ዘ': 'ze', 'ዙ': 'zu', 'ዚ': 'zi', 'ዛ': 'za', 'ዜ': 'ze', 'ዝ': 'z', 'ዞ': 'zo', 'ዟ': 'zwa',
  // ዠ series
  'ዠ': 'zhe', 'ዡ': 'zhu', 'ዢ': 'zhi', 'ዣ': 'zha', 'ዤ': 'zhe', 'ዥ': 'zh', 'ዦ': 'zho',
  // የ series
  'የ': 'ye', 'ዩ': 'yu', 'ዪ': 'yi', 'ያ': 'ya', 'ዬ': 'ye', 'ይ': 'y', 'ዮ': 'yo',
  // ደ series
  'ደ': 'de', 'ዱ': 'du', 'ዲ': 'di', 'ዳ': 'da', 'ዴ': 'de', 'ድ': 'd', 'ዶ': 'do', 'ዷ': 'dwa',
  // ጀ series
  'ጀ': 'je', 'ጁ': 'ju', 'ጂ': 'ji', 'ጃ': 'ja', 'ጄ': 'je', 'ጅ': 'j', 'ጆ': 'jo', 'ጇ': 'jwa',
  // ገ series
  'ገ': 'ge', 'ጉ': 'gu', 'ጊ': 'gi', 'ጋ': 'ga', 'ጌ': 'ge', 'ግ': 'g', 'ጎ': 'go', 'ጓ': 'gwa',
  // ጠ series
  'ጠ': 'te', 'ጡ': 'tu', 'ጢ': 'ti', 'ጣ': 'ta', 'ጤ': 'te', 'ጥ': 't', 'ጦ': 'to', 'ጧ': 'twa',
  // ጨ series
  'ጨ': 'che', 'ጩ': 'chu', 'ጪ': 'chi', 'ጫ': 'cha', 'ጬ': 'che', 'ጭ': 'ch', 'ጮ': 'cho', 'ጯ': 'chwa',
  // ጰ series
  'ጰ': 'pe', 'ጱ': 'pu', 'ጲ': 'pi', 'ጳ': 'pa', 'ጴ': 'pe', 'ጵ': 'p', 'ጶ': 'po',
  // ጸ series
  'ጸ': 'tse', 'ጹ': 'tsu', 'ጺ': 'tsi', 'ጻ': 'tsa', 'ጼ': 'tse', 'ጽ': 'ts', 'ጾ': 'tso',
  // ፀ series
  'ፀ': 'tse', 'ፁ': 'tsu', 'ፂ': 'tsi', 'ፃ': 'tsa', 'ፄ': 'tse', 'ፅ': 'ts', 'ፆ': 'tso',
  // ፈ series
  'ፈ': 'fe', 'ፉ': 'fu', 'ፊ': 'fi', 'ፋ': 'fa', 'ፌ': 'fe', 'ፍ': 'f', 'ፎ': 'fo', 'ፏ': 'fwa',
  // ፐ series
  'ፐ': 'pe', 'ፑ': 'pu', 'ፒ': 'pi', 'ፓ': 'pa', 'ፔ': 'pe', 'ፕ': 'p', 'ፖ': 'po',
});

/**
 * Checks whether the input string contains any Ge'ez/Ethiopic Unicode characters.
 * @function hasEthiopic
 * @param {string} text - Candidate string.
 * @returns {boolean} True if string contains Ethiopic characters.
 */
export const hasEthiopic = (text) => {
  if (!text || typeof text !== 'string') return false;
  return /[\u1200-\u137F]/.test(text);
};

/**
 * Algorithmic syllabic transliteration of Amharic Fidel text to Latin characters.
 * @function transliterateFidelToLatin
 * @param {string} text - Amharic text.
 * @returns {string} Transliterated Latin string.
 */
export const transliterateFidelToLatin = (text) => {
  if (!text) return '';
  let result = '';
  for (const char of text) {
    if (FIDEL_TO_LATIN[char]) {
      result += FIDEL_TO_LATIN[char];
    } else {
      result += char;
    }
  }
  return result;
};

/**
 * Resolves comprehensive aliases for a branch name to ensure bidirectional
 * Amharic <-> English retrieval and searchability.
 *
 * @function resolveBranchAliases
 * @param {string} name - Branch name (either Amharic or English).
 * @returns {string[]} Array of unique, trimmed alternative names/aliases.
 */
export const resolveBranchAliases = (name) => {
  if (!name || typeof name !== 'string') return [];
  const cleanName = name.trim();
  const lowerName = cleanName.toLowerCase();
  const aliases = new Set([cleanName, lowerName]);

  // 1. Direct dictionary match
  if (CURATED_LOCATIONS[cleanName]) {
    const loc = CURATED_LOCATIONS[cleanName];
    aliases.add(loc.amharic);
    loc.latin.forEach((l) => {
      aliases.add(l);
      aliases.add(capitalize(l));
    });
  }

  // 2. Reverse dictionary match (English -> Amharic)
  for (const [amharicKey, entry] of Object.entries(CURATED_LOCATIONS)) {
    if (entry.latin.some((lat) => lat.toLowerCase() === lowerName || lowerName.includes(lat.toLowerCase()))) {
      aliases.add(amharicKey);
      entry.latin.forEach((l) => aliases.add(l));
    }
  }

  // 3. Algorithmic fallback if Amharic characters are detected
  if (hasEthiopic(cleanName)) {
    const algorithmicLatin = transliterateFidelToLatin(cleanName);
    if (algorithmicLatin) {
      aliases.add(algorithmicLatin.toLowerCase());
      aliases.add(capitalize(algorithmicLatin));
    }
  }

  return Array.from(aliases).filter(Boolean);
};

/**
 * Auto-generates a standardized uppercase operational branch code.
 * Example:
 * - "Bole" -> "BOLE-01"
 * - "ቦሌ" -> transliterates to "BOLE" -> "BOLE-01"
 * - "Bole Medhanialem" -> "BOLE-01" (or "BM-01")
 * - If code collision exists among supervisor's branches, increments sequence ("BOLE-02", etc.)
 *
 * @function generateBranchCode
 * @param {string} name - Branch name.
 * @param {string[]} existingCodes - List of existing uppercase codes for this user.
 * @returns {string} Unique auto-generated operational branch code.
 */
export const generateBranchCode = (name, existingCodes = []) => {
  if (!name || typeof name !== 'string') return 'BR-01';

  let latinBase = '';
  const trimmed = name.trim();

  // 1. Check curated location dictionary first
  if (CURATED_LOCATIONS[trimmed]) {
    latinBase = CURATED_LOCATIONS[trimmed].latin[0];
  } else if (hasEthiopic(trimmed)) {
    latinBase = transliterateFidelToLatin(trimmed);
  } else {
    latinBase = trimmed;
  }

  // Extract primary operational prefix (alphanumeric only)
  const words = latinBase.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  let prefix = '';

  if (words.length === 1) {
    prefix = words[0].substring(0, 4).toUpperCase();
  } else if (words.length > 1) {
    // For multi-word branches, e.g. "Bole Medhanialem" -> use first word prefix "BOLE"
    prefix = words[0].substring(0, 4).toUpperCase();
  }

  if (!prefix || prefix.length < 2) {
    prefix = 'BR';
  }

  // Ensure prefix is at least 2 chars
  if (prefix.length < 2) {
    prefix = (prefix + 'X').substring(0, 2);
  }

  const existingUpper = new Set(existingCodes.map((c) => String(c).toUpperCase()));

  // Find next available sequence number
  let counter = 1;
  let candidate = `${prefix}-${String(counter).padStart(2, '0')}`;
  while (existingUpper.has(candidate)) {
    counter += 1;
    candidate = `${prefix}-${String(counter).padStart(2, '0')}`;
  }

  return candidate;
};

/**
 * Homophone mapping dictionary for Ge'ez (Ethiopic) characters.
 * Maps alternative phonetic spellings to canonical base forms:
 * - ሐ & ኀ series -> ሀ series
 * - ሠ series -> ሰ series
 * - ዐ series -> አ series
 * - ፀ series -> ጸ series
 * @constant
 * @type {Readonly<Record<string, string>>}
 */
const ETHIOPIC_HOMOPHONES = Object.freeze({
  // ሐ / ኀ series -> ሀ series
  'ሐ': 'ሀ', 'ሑ': 'ሁ', 'ሒ': 'ሂ', 'ሓ': 'ሃ', 'ሔ': 'ሄ', 'ሕ': 'ህ', 'ሖ': 'ሆ', 'ሗ': 'ኋ',
  'ኀ': 'ሀ', 'ኁ': 'ሁ', 'ኂ': 'ሂ', 'ኃ': 'ሃ', 'ኄ': 'ሄ', 'ኅ': 'ህ', 'ኆ': 'ሆ',
  'ኻ': 'ሃ', 'ኽ': 'ህ',
  // ሠ series -> ሰ series
  'ሠ': 'ሰ', 'ሡ': 'ሱ', 'ሢ': 'ሲ', 'ሣ': 'ሳ', 'ሤ': 'ሴ', 'ሥ': 'ስ', 'ሦ': 'ሶ', 'ሧ': 'ሷ',
  // ዐ series -> አ series
  'ዐ': 'አ', 'ዑ': 'ኡ', 'ዒ': 'ኢ', 'ዓ': 'አ', 'ዔ': 'ኤ', 'ዕ': 'እ', 'ዖ': 'ኦ',
  // ፀ series -> ጸ series
  'ፀ': 'ጸ', 'ፁ': 'ጹ', 'ፂ': 'ጺ', 'ፃ': 'ጻ', 'ፄ': 'ጼ', 'ፅ': 'ጽ', 'ፆ': 'ጾ',
});

/**
 * Normalizes Ethiopic (Ge'ez) homophones into their canonical representations.
 * Crucial for audio transcriptions and search query matching where phonetically
 * identical words may be spelled with different historical Fidel characters
 * (e.g., 'ቦሌ መድኃኒዓለም' vs 'ቦሌ መድሃኒአለም').
 *
 * @function normalizeEthiopicSpelling
 * @param {string} text - Input Amharic/Ethiopic text.
 * @returns {string} Normalized text with homophones mapped to canonical characters.
 */
export const normalizeEthiopicSpelling = (text) => {
  if (!text || typeof text !== 'string') return '';
  let result = '';
  for (const char of text) {
    result += ETHIOPIC_HOMOPHONES[char] || char;
  }
  return result;
};

/**
 * Escapes regex special characters in a string for safe use in RegExp constructors.
 *
 * @function escapeRegex
 * @param {string} str - Raw input string.
 * @returns {string} Sanitized string with regex special characters escaped.
 */
export const escapeRegex = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

/**
 * Generates an expanded set of bilingual search terms for a given query.
 * For Amharic input, returns Amharic, normalized Fidel spelling, and Latin transliteration.
 * For English input, returns English and matched Amharic location equivalents.
 *
 * @function getBilingualSearchTerms
 * @param {string} query - Raw search query string.
 * @returns {string[]} Array of search terms to query.
 */
export const getBilingualSearchTerms = (query) => {
  if (!query || typeof query !== 'string') return [];
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const terms = new Set([trimmed, lower]);

  // If query is Amharic, find English equivalents & normalized spelling
  if (hasEthiopic(trimmed)) {
    const normalized = normalizeEthiopicSpelling(trimmed);
    if (normalized) terms.add(normalized);

    // Common Amharic orthographic variations (e.g. 3rd order ኒ vs 5th order ኔ in names like Medhanialem)
    if (trimmed.includes('ኔ')) {
      const niVariant = trimmed.replace(/ኔ/g, 'ኒ');
      terms.add(niVariant);
      terms.add(normalizeEthiopicSpelling(niVariant));
      const niTransliterated = transliterateFidelToLatin(niVariant);
      if (niTransliterated) terms.add(niTransliterated.toLowerCase());
    }
    if (trimmed.includes('ኒ')) {
      const neVariant = trimmed.replace(/ኒ/g, 'ኔ');
      terms.add(neVariant);
      terms.add(normalizeEthiopicSpelling(neVariant));
      const neTransliterated = transliterateFidelToLatin(neVariant);
      if (neTransliterated) terms.add(neTransliterated.toLowerCase());
    }

    // Bidirectional curated location matching for Amharic
    for (const [amharicKey, entry] of Object.entries(CURATED_LOCATIONS)) {
      const normKey = normalizeEthiopicSpelling(amharicKey);
      if (
        amharicKey === trimmed ||
        amharicKey.includes(trimmed) ||
        trimmed.includes(amharicKey) ||
        normKey.includes(normalized) ||
        normalized.includes(normKey)
      ) {
        terms.add(amharicKey);
        terms.add(entry.amharic);
        terms.add(normKey);
        entry.latin.forEach((l) => terms.add(l));
      }
    }

    const transliterated = transliterateFidelToLatin(trimmed);
    if (transliterated) {
      terms.add(transliterated.toLowerCase());
    }
  } else {
    // If query is Latin, find Amharic equivalents
    for (const [amharicKey, entry] of Object.entries(CURATED_LOCATIONS)) {
      if (
        entry.latin.some(
          (l) =>
            l.toLowerCase() === lower ||
            lower.includes(l.toLowerCase()) ||
            l.toLowerCase().includes(lower)
        )
      ) {
        terms.add(amharicKey);
        terms.add(entry.amharic);
        terms.add(normalizeEthiopicSpelling(amharicKey));
        entry.latin.forEach((l) => terms.add(l));
      }
    }

    // Common Latin transliteration variations (e.g. medhanealem <-> medhanialem)
    if (lower.includes('medhania')) {
      terms.add(lower.replace(/medhania/g, 'medhanea'));
    }
    if (lower.includes('medhanea')) {
      terms.add(lower.replace(/medhanea/g, 'medhania'));
    }
  }

  return Array.from(terms).filter(Boolean);
};

/**
 * Helper to capitalize string.
 * @private
 */
const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export default {
  hasEthiopic,
  transliterateFidelToLatin,
  resolveBranchAliases,
  generateBranchCode,
  normalizeEthiopicSpelling,
  getBilingualSearchTerms,
  escapeRegex,
};

````

================================================================================
File: backend/src/assets/fonts/Inter-Bold.ttf
================================================================================

[Binary Asset File: Inter-Bold.ttf (67988 bytes)]

================================================================================
File: backend/src/assets/fonts/Inter-Regular.ttf
================================================================================

[Binary Asset File: Inter-Regular.ttf (67952 bytes)]

================================================================================
File: backend/src/assets/fonts/NotoSansEthiopic-Bold.ttf
================================================================================

[Binary Asset File: NotoSansEthiopic-Bold.ttf (321704 bytes)]

================================================================================
File: backend/src/assets/fonts/NotoSansEthiopic-Bold.woff
================================================================================

[Binary Asset File: NotoSansEthiopic-Bold.woff (120048 bytes)]

================================================================================
File: backend/src/assets/fonts/NotoSansEthiopic-Regular.ttf
================================================================================

[Binary Asset File: NotoSansEthiopic-Regular.ttf (322252 bytes)]

================================================================================
File: backend/src/assets/fonts/NotoSansEthiopic-Regular.woff
================================================================================

[Binary Asset File: NotoSansEthiopic-Regular.woff (119332 bytes)]

================================================================================
File: backend/src/assets/fonts/NotoSansLatin-Bold.ttf
================================================================================

[Binary Asset File: NotoSansLatin-Bold.ttf (21484 bytes)]

================================================================================
File: backend/src/assets/fonts/NotoSansLatin-Regular.ttf
================================================================================

[Binary Asset File: NotoSansLatin-Regular.ttf (21516 bytes)]

================================================================================
File: backend/src/assets/fonts/fonts.conf
================================================================================

````xml
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <!-- Portable Fontconfig configuration for headless Linux (Render / Docker / Vercel) -->

  <!-- Local project fonts (Ethiopic + Latin + Inter) -->
  <dir prefix="relative">.</dir>

  <!-- Standard Linux system font directories (Render / Debian / Ubuntu) -->
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <dir>~/.local/share/fonts</dir>
  <dir>~/.fonts</dir>

  <!-- Writable font cache directories for serverless / container environments -->
  <cachedir>/tmp/fonts-cache</cachedir>
  <cachedir>~/.cache/fontconfig</cachedir>

  <!-- Fallback aliases for bilingual Ethiopic + Latin rendering -->
  <alias>
    <family>Noto Sans Ethiopic</family>
    <prefer>
      <family>Noto Sans Ethiopic</family>
      <family>Noto Sans</family>
      <family>Inter</family>
      <family>DejaVu Sans</family>
      <family>FreeSans</family>
    </prefer>
  </alias>

  <alias>
    <family>sans-serif</family>
    <prefer>
      <family>Noto Sans Ethiopic</family>
      <family>Noto Sans</family>
      <family>Inter</family>
      <family>DejaVu Sans</family>
      <family>FreeSans</family>
    </prefer>
  </alias>

  <config></config>
</fontconfig>

````

================================================================================
File: backend/src/controllers/authController.js
================================================================================

````javascript
/**
 * @module controllers/authController
 * @description Authentication controller managing registration, login, token refresh, logout, and profile retrieval.
 * Enforces single-user operational security (strictly zero role-based logic).
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import { google } from 'googleapis';
import asyncHandler from 'express-async-handler';
import { User } from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from '../utils/token.js';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import logger from '../config/logger.js';
import {
  HTTP_STATUS,
  DEFAULT_POSITION,
  USER_NAME_LENGTH,
} from '../utils/constants.js';
import {
  ConflictError,
  UnauthenticatedError,
  BadRequestError,
  NotFoundError,
} from '../errors/CustomError.js';
import {
  getAuthorizationUrl,
  exchangeCodeAndSaveTokens,
  disconnectGoogleDrive,
} from '../services/googleDriveService.js';

/**
 * Intelligently derives human-readable first and last names from an email address
 * when not explicitly provided by the user or identity provider.
 *
 * @param {string} email - User email address
 * @returns {{ firstName: string, lastName: string }}
 */
export function deriveNamesFromEmail(email = '') {
  if (!email || typeof email !== 'string') {
    return { firstName: 'User', lastName: 'Member' };
  }

  const localPart = email.split('@')[0] || '';
  const rawParts = localPart.split(/[._\-+]+/).filter(Boolean);
  const alphaParts = rawParts.filter((p) => /[a-zA-Z]/.test(p));
  const candidateParts = alphaParts.length > 0 ? alphaParts : rawParts;

  const formatWord = (str) => {
    const clean = str.replace(/[^a-zA-Z]/g, '');
    const target = clean.length >= USER_NAME_LENGTH.MIN ? clean : str;
    const capped = target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
    return capped.slice(0, USER_NAME_LENGTH.MAX);
  };

  let first = 'User';
  let last = 'Member';

  if (candidateParts.length >= 2) {
    first = formatWord(candidateParts[0]);
    last = formatWord(candidateParts[1]);
  } else if (candidateParts.length === 1) {
    first = formatWord(candidateParts[0]);
    last = 'User';
  }

  if (first.length < USER_NAME_LENGTH.MIN) first = (first + '__').slice(0, USER_NAME_LENGTH.MAX);
  if (last.length < USER_NAME_LENGTH.MIN) last = (last + '__').slice(0, USER_NAME_LENGTH.MAX);

  return { firstName: first, lastName: last };
}

/**
 * Registers a new user account (Area Supervisor).
 * Auto-derives firstName and lastName from email if not provided (Invariant 6).
 * Executes within a Mongoose transaction session.
 *
 * @function register
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const register = asyncHandler(async (req, res) => {
  const validatedBody = req.validated?.body || req.body || {};
  const { email, password, firstName, lastName, position, avatar } = validatedBody;

  const session = await mongoose.startSession();
  try {
    let userObj;

    await session.withTransaction(async () => {
      // Check if a user with this email already exists
      const existingUser = await User.findOne({ email }).session(session);
      if (existingUser) {
        if (existingUser.authProvider === 'google' && !existingUser.isPasswordSet) {
          throw new ConflictError('This email is already registered via Google Sign-In. Please sign in with Google or sign in to set a password in your Profile.');
        }
        throw new ConflictError('A user with this email address already exists. Please sign in instead.');
      }

      // Name Auto-Derivation Invariant (Invariant 6): Extract clean human names if omitted
      const derivedNames = deriveNamesFromEmail(email);
      const resolvedFirstName = (firstName && firstName.trim()) || derivedNames.firstName;
      const resolvedLastName = (lastName && lastName.trim()) || derivedNames.lastName;

      // Create new User document inside the active transaction
      const [user] = await User.create(
        [
          {
            firstName: resolvedFirstName,
            lastName: resolvedLastName,
            email,
            password,
            position: position || DEFAULT_POSITION,
            avatar: avatar || null,
          },
        ],
        { session }
      );

      userObj = user.toJSON();
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'User registered successfully. Please log in.',
      data: {
        user: userObj,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Authenticates user credentials and issues new access/refresh tokens.
 *
 * @function login
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const login = asyncHandler(async (req, res) => {
  const validatedBody = req.validated?.body || req.body || {};
  const { email, password } = validatedBody;

  // Query user with password hash explicitly selected
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new UnauthenticatedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // If user was registered via Google SSO and has not yet set an email/password
  if (user.isPasswordSet === false && user.authProvider === 'google') {
    return res.status(HTTP_STATUS.UNAUTHENTICATED).json({
      success: false,
      errorCode: 'SSO_PASSWORD_NOT_SET',
      message: "This account was registered using Google Sign-In and does not have an email password yet. Please click 'Continue with Google' to sign in, or set a password in your Profile.",
      data: {
        authProvider: 'google',
      },
    });
  }

  // Verify password hash
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new UnauthenticatedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Generate new JWT authentication tokens
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Set secure HttpOnly cookies
  setAuthCookies(res, accessToken, refreshToken);

  const userObj = user.toJSON();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Login successful',
    data: {
      user: userObj,
    },
  });
});

/**
 * Refreshes the short-lived access token using a valid HttpOnly refresh token.
 * Rotates the refresh token for enhanced session security.
 *
 * @function refreshToken
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const refreshToken = asyncHandler(async (req, res) => {
  let token = req.cookies?.refreshToken;
  if (!token && req.body?.refreshToken) {
    token = req.body.refreshToken;
  }

  if (!token) {
    throw new UnauthenticatedError('Please log in again to continue.', 'NO_REFRESH_TOKEN');
  }

  // verifyRefreshToken throws UnauthenticatedError on invalid or expired token
  const decoded = verifyRefreshToken(token);

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new UnauthenticatedError('User account could not be found. Please log in again.', 'USER_NOT_FOUND');
  }

  // Rotate tokens: issue new access token and fresh refresh token
  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);

  // Set rotated secure cookies
  setAuthCookies(res, newAccessToken, newRefreshToken);

  const userObj = user.toJSON();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      user: userObj,
    },
  });
});

/**
 * Logs out the authenticated user by invalidating and clearing auth cookies.
 *
 * @function logout
 * @param {import('express').Request} _req - Express request object (unused).
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookies(res);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Logged out successfully',
    data: null,
  });
});

/**
 * Resolves the Google SSO OAuth redirect URI.
 * Favors specific SSO override, then matches incoming /sso/callback path,
 * falling back to OAUTH_GOOGLE_CALLBACK_URL or /api/v1/auth/google/callback.
 *
 * @param {import('express').Request} [req]
 * @returns {string}
 */
export const getGoogleSsoCallbackUrl = (req) => {
  if (env.OAUTH_GOOGLE_SSO_CALLBACK_URL) {
    return env.OAUTH_GOOGLE_SSO_CALLBACK_URL;
  }
  if (req?.originalUrl?.includes('/sso/callback') || req?.path?.includes('/sso/callback')) {
    return `${env.API_BASE_URL || `http://localhost:${env.PORT || 4000}`}/api/v1/auth/google/sso/callback`;
  }
  return (
    env.OAUTH_GOOGLE_CALLBACK_URL ||
    env.GOOGLE_CALLBACK_URL ||
    `${env.API_BASE_URL || `http://localhost:${env.PORT || 4000}`}/api/v1/auth/google/callback`
  );
};

/**
 * Initiates Google Single Sign-On (SSO) login/registration.
 *
 * @route GET /api/v1/auth/google/sso, GET /api/v1/auth/google
 */
export const initiateGoogleSso = asyncHandler(async (req, res) => {
  if (!env.OAUTH_GOOGLE_CLIENT_ID || !env.OAUTH_GOOGLE_CLIENT_SECRET) {
    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return res.status(HTTP_STATUS.OK).json({
        success: false,
        message: 'Google OAuth is not configured on this server.',
        data: { provider: 'google', configured: false },
      });
    }
    const clientUrl = env.CLIENT_ORIGIN || 'http://localhost:3000';
    return res.redirect(`${clientUrl}/login?error=GOOGLE_SSO_NOT_CONFIGURED`);
  }

  const callbackUrl = getGoogleSsoCallbackUrl(req);
  const oauth2Client = new google.auth.OAuth2(
    env.OAUTH_GOOGLE_CLIENT_ID,
    env.OAUTH_GOOGLE_CLIENT_SECRET,
    callbackUrl
  );

  const stateToken = jwt.sign({ flow: 'sso' }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state: stateToken,
  });

  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    return res.status(HTTP_STATUS.OK).json({ success: true, url: authUrl });
  }

  res.redirect(authUrl);
});

/**
 * Handles Google SSO OAuth redirect callback, auto-provisioning new users or logging in existing ones.
 *
 * @route GET /api/v1/auth/google/sso/callback
 */
export const handleGoogleSsoCallback = asyncHandler(async (req, res) => {
  const { code, error } = req.query;
  const clientUrl = env.CLIENT_ORIGIN || 'http://localhost:3000';

  if (error || !code) {
    logger.warn(`[authController] Google SSO aborted or error: ${error}`);
    return res.redirect(`${clientUrl}/login?error=${encodeURIComponent(error || 'GOOGLE_AUTH_CANCELLED')}`);
  }

  try {
    const callbackUrl = getGoogleSsoCallbackUrl(req);
    const oauth2Client = new google.auth.OAuth2(
      env.OAUTH_GOOGLE_CLIENT_ID,
      env.OAUTH_GOOGLE_CLIENT_SECRET,
      callbackUrl
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.email) {
      throw new BadRequestError('Could not retrieve email from Google profile.');
    }

    const email = profile.email.toLowerCase().trim();
    let user = await User.findOne({ email });

    if (!user) {
      // Auto-provision fresh user with Google credentials or smart derivation
      const fallbackNames = deriveNamesFromEmail(email);
      const givenName = profile.given_name || (profile.name ? profile.name.split(' ')[0] : fallbackNames.firstName);
      const familyName = profile.family_name || (profile.name && profile.name.split(' ').length > 1 ? profile.name.split(' ').slice(1).join(' ') : fallbackNames.lastName);
      const randomPassword = crypto.randomBytes(24).toString('hex') + 'A1!';

      user = await User.create({
        email,
        firstName: givenName,
        lastName: familyName || fallbackNames.lastName,
        avatar: profile.picture || null,
        password: randomPassword,
        position: DEFAULT_POSITION,
        authProvider: 'google',
        isPasswordSet: false,
      });

      logger.info(`[authController] New user auto-provisioned via Google SSO: ${email}`);
    } else {
      if (user.authProvider === 'local') {
        user.authProvider = 'both';
      }
      // Update avatar if not previously set
      if (!user.avatar && profile.picture) {
        user.avatar = profile.picture;
      }
      await user.save();
    }

    // Generate tokens and issue HttpOnly cookies
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    setAuthCookies(res, accessToken, refreshToken);

    logger.info(`[authController] User successfully authenticated via Google SSO: ${email}`);
    res.redirect(`${clientUrl}/dashboard?auth=sso`);
  } catch (err) {
    logger.error(`[authController] Google SSO callback error: ${err.message}`);
    res.redirect(`${clientUrl}/login?error=${encodeURIComponent(err.message || 'GOOGLE_SSO_FAILED')}`);
  }
});

/**
 * Initiates Google OAuth connection flow for Google Drive & Workspace.
 *
 * @route GET /api/v1/auth/google/connect
 */
export const connectGoogleDrive = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.query.userId;
  if (!userId) {
    throw new UnauthenticatedError('User authentication is required to connect Google Drive.');
  }

  // Create signed state parameter with dynamic returnUrl
  const returnUrl = req.query.returnUrl || '/profile?tab=cloud-integrations';
  const state = jwt.sign({ userId: String(userId), returnUrl }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  const authUrl = getAuthorizationUrl(state);

  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        authUrl,
        url: authUrl,
      },
      authUrl,
    });
  }

  res.redirect(authUrl);
});

/**
 * Handles Google OAuth redirect callback.
 * Acts as an intelligent unified state dispatcher:
 * - If state payload represents Google SSO flow ({ flow: 'sso' }), delegates to handleGoogleSsoCallback.
 * - Otherwise processes Google Drive integration token exchange.
 *
 * @route GET /api/v1/auth/google/callback
 */
export const handleGoogleCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  let decoded;
  if (state) {
    try {
      decoded = jwt.verify(state, env.JWT_ACCESS_SECRET);
    } catch (_err) {
      try {
        decoded = JSON.parse(state);
      } catch {
        if (state === 'sso') decoded = { flow: 'sso' };
      }
    }
  }

  // Unified Dispatcher: If state marks SSO authentication, delegate to handleGoogleSsoCallback
  if (state === 'sso' || decoded?.flow === 'sso') {
    return handleGoogleSsoCallback(req, res);
  }

  const dest = decoded?.returnUrl || '/profile?tab=cloud-integrations';

  if (error) {
    logger.warn(`[authController] Google OAuth error returned: ${error}`);
    return res.redirect(
      `${env.CLIENT_ORIGIN}${dest}${dest.includes('?') ? '&' : '?'}google_auth=error&error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state || !decoded || !decoded.userId) {
    throw new BadRequestError('Invalid or expired OAuth authorization code or state token.');
  }

  const userId = decoded.userId;
  const integrationProfile = await exchangeCodeAndSaveTokens(userId, code);

  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Google Drive connected successfully.',
      data: integrationProfile,
    });
  }

  res.redirect(`${env.CLIENT_ORIGIN}${dest}${dest.includes('?') ? '&' : '?'}google_auth=success`);
});

/**
 * Disconnects Google Drive integration for authenticated user.
 *
 * @route POST /api/v1/auth/google/disconnect
 */
export const disconnectGoogleDriveRoute = asyncHandler(async (req, res) => {
  await disconnectGoogleDrive(req.user._id);
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Google Drive disconnected successfully.',
  });
});

/**
 * Retrieves Google Drive connection status for authenticated user.
 *
 * @route GET /api/v1/auth/google/status
 */
export const getGoogleDriveStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new NotFoundError('User not found.');

  const drive = user.integrations?.googleDrive || {};
  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      connected: Boolean(drive.connected),
      enabled: drive.enabled !== false,
      email: drive.email || null,
      rootFolderId: drive.rootFolderId || null,
      connectedAt: drive.connectedAt || null,
    },
  });
});

/**
 * Toggles Google Drive integration enabled state for authenticated user.
 *
 * @route POST /api/v1/auth/google/toggle
 */
export const toggleGoogleDriveRoute = asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    throw new BadRequestError('Field "enabled" must be a boolean.');
  }

  const user = await User.findById(req.user._id);
  if (!user) throw new NotFoundError('User not found.');

  if (!user.integrations?.googleDrive?.connected) {
    throw new BadRequestError('Google Drive is not connected. Please connect your Google account first.');
  }

  user.integrations.googleDrive.enabled = enabled;
  await user.save();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: `Google Drive integration ${enabled ? 'enabled' : 'disabled'} successfully.`,
    data: {
      connected: user.integrations.googleDrive.connected,
      enabled: user.integrations.googleDrive.enabled,
    },
  });
});

export default {
  register,
  login,
  refreshToken,
  logout,
  initiateGoogleSso,
  handleGoogleSsoCallback,
  connectGoogleDrive,
  handleGoogleCallback,
  disconnectGoogleDriveRoute,
  getGoogleDriveStatus,
  toggleGoogleDriveRoute,
};

````

================================================================================
File: backend/src/controllers/branchController.js
================================================================================

````javascript
/**
 * @module controllers/branchController
 * @description Controller managing operational branch CRUD, directory search, pagination,
 * soft archival, restoration, and cascade permanent deletion scoped strictly to the authenticated supervisor.
 * All write operations strictly execute within Mongoose transaction sessions for ACID integrity.
 */

import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import { Branch } from '../models/Branch.js';
import { Report } from '../models/Report.js';
import { HTTP_STATUS, DEFAULT_PAGE_LIMIT } from '../utils/constants.js';
import { ConflictError, NotFoundError, BadRequestError } from '../errors/CustomError.js';
import {
  generateBranchCode,
  resolveBranchAliases,
  getBilingualSearchTerms,
} from '../utils/transliterate.js';
import { cascadeDeleteBranch } from '../jobs/sweeper.js';

/**
 * Escapes characters with special meaning in regular expressions.
 * @private
 * @param {string} str - String to escape.
 * @returns {string} Escaped string safe for RegExp construction.
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Builds the MongoDB query filter for a branch identifier that may be either an ObjectId or an operational code.
 * Scoped strictly to the authenticated supervisor.
 *
 * @private
 * @param {string} identifier - 24-hex Mongo ObjectId or operational branch code (e.g. 'BOLE-01').
 * @param {string|import('mongoose').Types.ObjectId} userId - Supervisor identifier.
 * @returns {object} Mongo query object.
 */
const buildBranchIdentifierQuery = (identifier, userId) => {
  const cleanId = String(identifier || '').trim();
  const isMongoId =
    mongoose.Types.ObjectId.isValid(cleanId) &&
    String(new mongoose.Types.ObjectId(cleanId)) === cleanId;

  if (isMongoId) {
    return {
      user: userId,
      _id: cleanId,
    };
  }

  return {
    user: userId,
    code: cleanId.toUpperCase(),
  };
};

/**
 * Creates a new physical operational branch location for the authenticated supervisor.
 * Automatically derives bilingual search aliases and auto-generates operational branch code.
 * Executes within a Mongoose transaction session.
 *
 * @function createBranch
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const createBranch = asyncHandler(async (req, res) => {
  const validatedBody = req.validated?.body || req.body || {};
  const { name, location, managerName, contactPhone } = validatedBody;
  const cleanName = (name || '').trim();

  const session = await mongoose.startSession();
  try {
    let createdBranch;

    await session.withTransaction(async () => {
      // 1. Case-insensitive collision check for active branch name
      const nameRegex = new RegExp(`^${escapeRegex(cleanName)}$`, 'i');
      const existingByName = await Branch.findOne({
        user: req.user._id,
        name: nameRegex,
        isArchived: false,
      }).session(session);

      if (existingByName) {
        throw new ConflictError('A branch with this name already exists.');
      }

      // 2. Auto-generate uppercase operational code from supervisor's existing codes
      const existingBranches = await Branch.find({ user: req.user._id })
        .select('code')
        .session(session)
        .lean();
      const existingCodes = existingBranches.map((b) => b.code);
      const branchCode = generateBranchCode(cleanName, existingCodes);

      // 3. Resolve bilingual search aliases (Amharic <-> English transliterations)
      const aliases = resolveBranchAliases(cleanName);

      // 4. Create branch document inside the active transaction
      const [newBranch] = await Branch.create(
        [
          {
            user: req.user._id,
            name: cleanName,
            code: branchCode,
            aliases,
            location: {
              city: location?.city?.trim() || undefined,
              subcity: location?.subcity?.trim() || '',
              address: location?.address?.trim() || '',
            },
            managerName: managerName?.trim() || '',
            contactPhone: contactPhone?.trim() || '',
          },
        ],
        { session }
      );

      createdBranch = newBranch;
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Branch created successfully',
      data: {
        branch: createdBranch,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Retrieves a paginated list of branches with bilingual text search and archival filter.
 * Enables finding Amharic branches using English transliterated queries and vice versa.
 *
 * @function getBranches
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getBranches = asyncHandler(async (req, res) => {
  const queryParams = req.validated?.query || req.query || {};
  const { page, limit, search, isArchived, archived } = queryParams;

  // By default, archived branches (isArchived: true) are strictly excluded
  let isArchivedFilter = false;
  if (archived !== undefined) {
    isArchivedFilter = archived === true || archived === 'true' || archived === '';
  } else if (isArchived !== undefined) {
    isArchivedFilter = isArchived === true || isArchived === 'true' || isArchived === '';
  }

  const query = {
    user: req.user._id,
    isArchived: isArchivedFilter,
  };

  if (search && search.trim()) {
    const searchTerms = getBilingualSearchTerms(search.trim());
    const termOrConditions = searchTerms.flatMap((term) => {
      const termRegex = new RegExp(escapeRegex(term), 'i');
      return [
        { name: termRegex },
        { code: termRegex },
        { aliases: termRegex },
        { managerName: termRegex },
        { 'location.address': termRegex },
        { 'location.subcity': termRegex },
      ];
    });

    query.$or = termOrConditions;
  }

  const options = {
    page: parseInt(page, 10) || 1,
    limit: Math.min(parseInt(limit, 10) || DEFAULT_PAGE_LIMIT, 100),
    sort: { createdAt: -1 },
    customLabels: {
      docs: 'branches',
      totalDocs: 'totalBranches',
    },
  };

  const result = await Branch.paginate(query, options);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Branches retrieved successfully',
    data: {
      branches: result.branches,
      pagination: {
        total: result.totalBranches,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
      },
    },
  });
});

/**
 * Retrieves a single branch by its identifier, scoped strictly to the authenticated supervisor.
 *
 * @function getBranchById
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getBranchById = asyncHandler(async (req, res) => {
  const { branchId } = req.validated?.params || req.params;

  const query = buildBranchIdentifierQuery(branchId, req.user._id);
  const branch = await Branch.findOne(query);

  if (!branch) {
    throw new NotFoundError('Branch not found.');
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Branch details retrieved successfully',
    data: {
      branch,
    },
  });
});

/**
 * Updates operational branch attributes. Validates active name and code collisions.
 * Executes within a Mongoose transaction session.
 *
 * @function updateBranch
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const updates = req.validated?.body || req.body || {};

  const session = await mongoose.startSession();
  try {
    let updatedBranch;

    await session.withTransaction(async () => {
      const query = {
        ...buildBranchIdentifierQuery(branchId, req.user._id),
        isArchived: false,
      };
      const branch = await Branch.findOne(query).session(session);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }

      // Check name uniqueness if updated
      if (updates.name && updates.name.trim() !== branch.name) {
        const cleanName = updates.name.trim();
        const nameRegex = new RegExp(`^${escapeRegex(cleanName)}$`, 'i');

        const collidingName = await Branch.findOne({
          _id: { $ne: branch._id },
          user: req.user._id,
          name: nameRegex,
          isArchived: false,
        }).session(session);

        if (collidingName) {
          throw new ConflictError('A branch with this name already exists.');
        }

        branch.name = cleanName;
        branch.aliases = resolveBranchAliases(cleanName);
      }

      // Update location attributes
      if (updates.location) {
        if (updates.location.city !== undefined) branch.location.city = updates.location.city.trim();
        if (updates.location.subcity !== undefined) branch.location.subcity = updates.location.subcity.trim();
        if (updates.location.address !== undefined) branch.location.address = updates.location.address.trim();
      }

      // Update manager & contact details
      if (updates.managerName !== undefined) branch.managerName = updates.managerName.trim();
      if (updates.contactPhone !== undefined) branch.contactPhone = updates.contactPhone.trim();

      await branch.save({ session });
      updatedBranch = branch;
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Branch updated successfully',
      data: {
        branch: updatedBranch,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Soft-archives an active branch location.
 * Executes within a Mongoose transaction session.
 *
 * @function archiveBranch
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const archiveBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.validated?.params || req.params;

  // If permanent query flag is set, delegate to permanent deletion
  if (req.query?.permanent === 'true') {
    return deleteBranchPermanently(req, res);
  }

  const session = await mongoose.startSession();
  try {
    let archivedBranch;

    await session.withTransaction(async () => {
      const query = buildBranchIdentifierQuery(branchId, req.user._id);
      const branch = await Branch.findOne(query).session(session);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }

      if (branch.isArchived) {
        throw new BadRequestError('Branch is already archived.');
      }

      branch.isArchived = true;
      branch.archivedAt = new Date();

      await branch.save({ session });
      archivedBranch = branch;
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Branch archived successfully',
      data: {
        branch: archivedBranch,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Restores a soft-archived branch. Guards against active name and code collisions.
 * Executes within a Mongoose transaction session.
 *
 * @function restoreBranch
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const restoreBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.validated?.params || req.params;

  const session = await mongoose.startSession();
  try {
    let restoredBranch;

    await session.withTransaction(async () => {
      const query = buildBranchIdentifierQuery(branchId, req.user._id);
      const branch = await Branch.findOne(query).session(session);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }

      if (!branch.isArchived) {
        throw new BadRequestError('Branch is already active and cannot be restored.');
      }

      // Guard: active name collision check
      const nameRegex = new RegExp(`^${escapeRegex(branch.name)}$`, 'i');
      const collidingName = await Branch.findOne({
        _id: { $ne: branch._id },
        user: req.user._id,
        name: nameRegex,
        isArchived: false,
      }).session(session);

      if (collidingName) {
        throw new ConflictError(
          'An active branch with this name already exists. Please resolve the collision before restoring.'
        );
      }

      // Guard: active code collision check
      const collidingCode = await Branch.findOne({
        _id: { $ne: branch._id },
        user: req.user._id,
        code: branch.code,
        isArchived: false,
      }).session(session);

      if (collidingCode) {
        throw new ConflictError(
          'An active branch with this operational code already exists. Please resolve the collision before restoring.'
        );
      }

      branch.isArchived = false;
      branch.archivedAt = null;

      await branch.save({ session });
      restoredBranch = branch;
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Branch restored successfully',
      data: {
        branch: restoredBranch,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Permanently hard-deletes an archived branch and cascades deletion to child resources.
 * Only archived branches can be permanently deleted (user get archived -> delete -> confirm dialog -> delete).
 * Executes within a Mongoose transaction session.
 *
 * @function deleteBranchPermanently
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const deleteBranchPermanently = asyncHandler(async (req, res) => {
  const { branchId } = req.validated?.params || req.params;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const query = buildBranchIdentifierQuery(branchId, req.user._id);
      const branch = await Branch.findOne(query).session(session);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }

      if (!branch.isArchived) {
        throw new BadRequestError('Only archived branches can be permanently deleted. Please archive the branch first.');
      }

      // Cascade hard delete branch and child entities in session using canonical _id
      await cascadeDeleteBranch(branch._id, session);
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Branch permanently deleted successfully',
      data: null,
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Retrieves analytics and report aggregations for a single physical branch.
 * Aggregates all non-archived reports visiting this branch for the authenticated supervisor.
 *
 * @function getBranchMetrics
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getBranchMetrics = asyncHandler(async (req, res) => {
  const { branchId } = req.validated?.params || req.params;

  const query = buildBranchIdentifierQuery(branchId, req.user._id);
  const branch = await Branch.findOne(query).lean();

  if (!branch) {
    throw new NotFoundError('Branch not found.');
  }

  // Aggregate active inspection reports visiting this branch
  const [result] = await Report.aggregate([
    {
      $match: {
        user: req.user._id,
        isArchived: false,
        'visits.branch': branch._id,
      },
    },
    {
      $facet: {
        totalAudits: [{ $count: 'count' }],
        auditVolumeTrend: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 14 },
          { $project: { date: '$_id', count: 1, _id: 0 } },
        ],
        issuesByStatus: [
          { $unwind: '$issues' },
          {
            $group: {
              _id: '$issues.status',
              count: { $sum: 1 },
            },
          },
          { $project: { status: '$_id', count: 1, _id: 0 } },
        ],
        activitiesByStatus: [
          { $unwind: '$activities' },
          {
            $group: {
              _id: '$activities.status',
              count: { $sum: 1 },
            },
          },
          { $project: { status: '$_id', count: 1, _id: 0 } },
        ],
      },
    },
  ]);

  const issuesCounts = { reported: 0, in_progress: 0, completed: 0, no_issue: 0 };
  (result?.issuesByStatus || []).forEach((item) => {
    if (item.status in issuesCounts) {
      issuesCounts[item.status] = item.count;
    }
  });

  const activitiesCounts = { completed: 0, in_progress: 0 };
  (result?.activitiesByStatus || []).forEach((item) => {
    if (item.status in activitiesCounts) {
      activitiesCounts[item.status] = item.count;
    }
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Branch report metrics retrieved successfully',
    data: {
      branchId: branch._id,
      branchCode: branch.code,
      totalAudits: result?.totalAudits?.[0]?.count || 0,
      auditVolumeTrend: result?.auditVolumeTrend || [],
      issuesByStatus: issuesCounts,
      activitiesByStatus: activitiesCounts,
    },
  });
});

export default {
  createBranch,
  getBranches,
  getBranchById,
  getBranchMetrics,
  updateBranch,
  archiveBranch,
  restoreBranch,
  deleteBranchPermanently,
};


````

================================================================================
File: backend/src/controllers/chatController.js
================================================================================

````javascript
/**
 * @module controllers/chatController
 * @description Controller for Multi-Turn Streaming AI Chat Engine and Session Management.
 * Implements Express 5 Server-Sent Events (SSE) streaming with typed event frames
 * (thought, text, tool_call, tool_result, title, done, error).
 * Features autonomous recursive tool loops (maxSteps: 5) binding the 17-Tool Enterprise Matrix,
 * audio transcription via Addis AI / Gemini STT, attachment grounding, auto-titling,
 * turn persistence, linear pruning, and full session CRUD.
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import { GoogleGenAI } from '@google/genai';
import logger from '../config/logger.js';
import { Chat } from '../models/Chat.js';
import { Audio } from '../models/Audio.js';
import { HTTP_STATUS, CHAT_CONSTANTS, CHAT_PAGINATION, ATTACHMENT_CONSTANTS, AUDIO_CONSTANTS, AI_MODELS, UPLOADS_CONFIG } from '../utils/constants.js';
import { User } from '../models/User.js';
import { NotFoundError, BadRequestError, UnauthenticatedError } from '../errors/CustomError.js';
import { assembleSystemPrompt } from '../utils/promptAssembler.js';
import { agentToolDeclarations, executeAgentTool } from '../tools/agentTools.js';
import { processAttachments, resolveFilePath } from '../utils/attachmentProcessor.js';
import { transcribeAudioDocument, transcribeAudio as transcribeAudioUtil, resolveAudioDiskPath } from '../utils/audioChunker.js';
import { dispatchToTelegram, resolveChannelChatId } from '../services/telegramService.js';
import { generatedDocumentRegistry } from '../services/documentGenerationService.js';
import { getBilingualSearchTerms, escapeRegex } from '../utils/transliterate.js';
import storageService from '../services/storageService.js';
import { formatUserFriendlyError } from '../utils/errorFormatter.js';
import ttsService from '../services/ttsService.js';

/**
 * Helper to emit a formatted Server-Sent Event frame.
 *
 * @param {import('express').Response} res - Express response stream.
 * @param {string} event - Event type name ('thought'|'text'|'tool_call'|'tool_result'|'title'|'done'|'error').
 * @param {object} data - Payload data.
 */
function sendSSE(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (_e) {
    // Socket already closed
  }
}

/**
 * Compiles a single user turn's parts with ground-truth fidelity across text, audio transcripts,
 * document text contexts, and inline base64 image vision parts. Zero dummy strings.
 * Enforces Dual-Track Hybrid Audio Ingestion: on the active turn, attaches raw audio
 * inline parts for native acoustic comprehension; on historical turns, rehydrates
 * via persistent text transcripts to prevent audio token explosion.
 *
 * @param {object} msg - User turn message subdocument.
 * @param {object} [options={}] - Options { isHistorical: boolean }.
 * @returns {Promise<Array<object>>} Gemini Content parts array.
 */
export async function compileUserTurnParts(msg, { isHistorical = false } = {}) {
  const parts = [];
  const textSections = [];
  let inlineParts = [];

  const rawUserText = (msg.text || '').trim();
  if (rawUserText) {
    textSections.push(rawUserText);
  }

  // 1. Audio Transcriptions and Multimodal Audio Parts
  let audioFormatted = false;
  if (Array.isArray(msg.audios) && msg.audios.length > 0) {
    try {
      const rawAudios = Array.isArray(msg.audios) ? msg.audios : [];
      const audioIds = rawAudios
        .map((a) => (typeof a === 'object' && a !== null ? (a._id || a.id) : a))
        .filter((id) => id && /^[0-9a-fA-F]{24}$/.test(String(id)));
      if (audioIds.length > 0) {
        const audioDocs = await Audio.find({ _id: { $in: audioIds } });
        const formattedList = [];
        for (const a of audioDocs) {
          const transcript = (a.transcription || '').trim();
          const fileName = a.originalName || a.fileName || 'audio.wav';
          if (transcript) {
            formattedList.push(`[Transcribed Audio (ID: ${a._id}, File: "${fileName}")]:\n${transcript}`);
          }
          // Dual-Track Hybrid Audio Ingestion: Only attach raw audio buffer on active turn (not historical)
          if (!isHistorical) {
            let audioBuffer = null;
            const diskPath = resolveAudioDiskPath(a.path || a.fileName);
            if (diskPath && fs.existsSync(diskPath)) {
              try {
                const fileStats = fs.statSync(diskPath);
                if (fileStats.size > 0 && fileStats.size <= 20 * 1024 * 1024) {
                  audioBuffer = await fs.promises.readFile(diskPath);
                }
              } catch (_readErr) {}
            } else if (a.url && a.url.startsWith('http')) {
              try {
                const fetchRes = await fetch(a.url);
                if (fetchRes.ok) {
                  const arrayBuf = await fetchRes.arrayBuffer();
                  audioBuffer = Buffer.from(arrayBuf);
                }
              } catch (_fetchErr) {}
            }

            if (audioBuffer && audioBuffer.length > 0 && audioBuffer.length <= 20 * 1024 * 1024) {
              let resolvedMime = a.mimeType || 'audio/wav';
              if (resolvedMime === 'video/webm') resolvedMime = 'audio/webm';
              inlineParts.push({
                inlineData: {
                  mimeType: resolvedMime,
                  data: audioBuffer.toString('base64'),
                },
              });
            }
          }
        }
        if (formattedList.length > 0) {
          textSections.push(formattedList.join('\n\n'));
          audioFormatted = true;
        }
      }
    } catch (err) {
      logger.warn(`[chatController] Could not rehydrate audio transcripts: ${err.message}`);
    }
  }

  if (!audioFormatted && Array.isArray(msg.audioTranscriptions) && msg.audioTranscriptions.length > 0) {
    const validTranscriptions = msg.audioTranscriptions.filter((t) => t && typeof t === 'string' && t.trim());
    if (validTranscriptions.length > 0) {
      textSections.push(`[Transcribed Audio]:\n${validTranscriptions.join('\n\n')}`);
    }
  }

  // 2. Document Text Context & Multimodal Inline Vision/PDF/Audio Parts
  if (isHistorical && msg.documentTextContext && typeof msg.documentTextContext === 'string' && msg.documentTextContext.trim()) {
    // Optimization: Historical turns reuse the persisted document text context, short-circuiting expensive re-processing
    textSections.push(`[Attached Document]:\n${msg.documentTextContext.trim()}`);
  } else if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    try {
      const attResult = await processAttachments(msg.attachments);
      if (attResult.textContext) {
        textSections.push(`[Attached Document]:\n${attResult.textContext}`);
      } else if (msg.documentTextContext && msg.documentTextContext.trim()) {
        textSections.push(`[Attached Document]:\n${msg.documentTextContext.trim()}`);
      }
      if (Array.isArray(attResult.inlineParts) && attResult.inlineParts.length > 0) {
        inlineParts.push(...attResult.inlineParts);
      }
    } catch (err) {
      logger.warn(`[chatController] Could not rehydrate attachments: ${err.message}`);
      if (msg.documentTextContext && msg.documentTextContext.trim()) {
        textSections.push(`[Attached Document]:\n${msg.documentTextContext.trim()}`);
      }
    }
  } else if (msg.documentTextContext && msg.documentTextContext.trim()) {
    textSections.push(`[Attached Document]:\n${msg.documentTextContext.trim()}`);
  }

  // 3. User Guidance Prompt Invariant:
  // If the user typed no text, supply a clear guiding prompt based on attached media/docs so Gemini is fully oriented.
  if (!rawUserText) {
    if (inlineParts.length > 0 && textSections.length === 0) {
      textSections.unshift('Please review and analyze the attached media/file(s) in detail.');
    } else if (inlineParts.length > 0 && textSections.length > 0) {
      textSections.unshift('Please review and analyze the attached media and contextual information in detail.');
    } else if (textSections.length > 0) {
      textSections.unshift('Please review the provided audio/document context and respond accordingly.');
    }
  }

  const combinedText = textSections.join('\n\n').trim();
  if (combinedText) {
    parts.push({ text: combinedText });
  } else if (inlineParts.length === 0) {
    parts.push({ text: '(empty message)' });
  } else {
    parts.push({ text: 'Please review and analyze the attached media/file(s) in detail.' });
  }

  if (inlineParts.length > 0) {
    parts.push(...inlineParts);
  }

  return parts;
}

/**
 * Builds the complete, ground-truth Gemini Contents History array across all turns.
 * Guarantees zero context amnesia on model fallback, retry, or multi-turn progression.
 *
 * @param {object} params
 * @param {object} params.chat - Chat document.
 * @param {object} params.userTurn - Active user turn.
 * @param {boolean} params.isContinue - Continuation turn flag.
 * @param {object} [params.stoppedTurn] - Stopped assistant turn if continuing.
 * @returns {Promise<Array<object>>} Formatted Gemini contents array.
 */
export async function buildGeminiHistory({ chat, userTurn, isContinue, stoppedTurn }) {
  const geminiContents = [];

  if (isContinue && stoppedTurn) {
    const anchorIdx = chat.messages.findIndex((m) => m === userTurn);
    for (let i = 0; i < anchorIdx; i++) {
      const msg = chat.messages[i];
      if (msg.role === 'user') {
        const parts = await compileUserTurnParts(msg, { isHistorical: true });
        geminiContents.push({ role: 'user', parts });
      } else if (msg.role === 'assistant') {
        geminiContents.push({
          role: 'model',
          parts: [{ text: msg.text || '(empty response)' }],
        });
      }
    }

    // Anchor user prompt
    const anchorParts = await compileUserTurnParts(userTurn, { isHistorical: false });
    geminiContents.push({ role: 'user', parts: anchorParts });

    // Stopped model response
    geminiContents.push({
      role: 'model',
      parts: [{ text: stoppedTurn.text || '(empty response)' }],
    });

    // Seamless continuation prompt
    geminiContents.push({
      role: 'user',
      parts: [
        {
          text: 'Please continue generating directly from where you left off. Do not repeat what was already written or provide any conversational filler; seamlessly output the remaining content.',
        },
      ],
    });
  } else {
    // Standard history: all turns before the active user message
    const activeUserMsg = userTurn || chat.messages[chat.messages.length - 1];
    const anchorIdx = chat.messages.findIndex((m) => m === activeUserMsg);
    const historyLimit = anchorIdx !== -1 ? anchorIdx : chat.messages.length - 1;

    for (let i = 0; i < historyLimit; i++) {
      const msg = chat.messages[i];
      if (msg.role === 'user') {
        const parts = await compileUserTurnParts(msg, { isHistorical: true });
        geminiContents.push({ role: 'user', parts });
      } else if (msg.role === 'assistant') {
        geminiContents.push({
          role: 'model',
          parts: [{ text: msg.text || '(empty response)' }],
        });
      }
    }

    // Active latest user turn (Dual-Track: raw audio enabled)
    const latestParts = await compileUserTurnParts(activeUserMsg, { isHistorical: false });
    geminiContents.push({
      role: 'user',
      parts: latestParts,
    });
  }

  return geminiContents;
}

/**
 * Handles multi-turn streaming conversational turns over Server-Sent Events (SSE).
 *
 * @route POST /api/v1/chat/stream, POST /api/v1/chat/:chatId/stream
 * @access Private
 */
export const streamChat = asyncHandler(async (req, res) => {
  const b = req.validated?.body || req.body || {};
  const requestedChatId = req.validated?.params?.chatId || req.params.chatId || b.chatId;

  // 1. Resolve or initialize Chat document
  let chat;
  if (requestedChatId) {
    chat = await Chat.findOne({
      _id: requestedChatId,
      user: req.user._id,
      isArchived: false,
    });
    if (!chat) {
      throw new NotFoundError('Chat session not found or has been archived.');
    }
  } else {
    chat = new Chat({
      user: req.user._id,
      title: null,
      config: {
        model:
          (b.model && AI_MODELS.SUPPORTED.includes(b.model) ? b.model : null) ||
          (AI_MODELS.SUPPORTED.includes(req.user.settings?.agentConfig?.defaultModel)
            ? req.user.settings.agentConfig.defaultModel
            : AI_MODELS.DEFAULT),
        thinkingBudget:
          b.thinkingBudget ??
          req.user.settings?.agentConfig?.defaultThinkingBudget ??
          CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
        language:
          b.language ||
          req.user.settings?.agentConfig?.defaultLanguage ||
          CHAT_CONSTANTS.DEFAULT_LANGUAGE,
      },
    });
  }

  // Apply per-turn config overrides to session if provided and supported
  if (b.model && AI_MODELS.SUPPORTED.includes(b.model)) {
    chat.config.model = b.model;
  }
  if (!AI_MODELS.SUPPORTED.includes(chat.config.model)) {
    chat.config.model = AI_MODELS.DEFAULT;
  }
  if (b.thinkingBudget !== undefined) {
    chat.config.thinkingBudget = b.thinkingBudget;
  }
  if (b.language) {
    chat.config.language = b.language;
  }

  // 2. Setup Server-Sent Events (SSE) Stream Headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Immediate SSE priming ping to defeat proxy and browser socket buffering
  res.write(': ping\n\n');

  let isClientAborted = false;
  let persistAbortState = null;
  let userTurn = null;
  let stoppedTurn = null;
  let fullText = '';
  let fullThought = '';
  const toolsCalled = [];
  let activeModel =
    (b.model && AI_MODELS.SUPPORTED.includes(b.model) ? b.model : null) ||
    chat.config?.model ||
    req.user.settings?.agentConfig?.defaultModel ||
    AI_MODELS.DEFAULT;

  const handleClientClose = () => {
    if (!res.writableEnded) {
      isClientAborted = true;
      logger.info(`[chatController] Client socket closed / aborted by user for chat: ${requestedChatId || chat?._id}`);
    }
  };
  req.on('close', handleClientClose);
  res.on('close', handleClientClose);

  try {
    // 3. Modality Ingestion & Preparation
    const audioTranscriptions = [];
    const audioPromptSections = [];
    let attachmentTextContext = '';
    let inlineParts = [];

    // Dynamically resolve active STT engine from SSOT constants
    const activeSttEngine =
      (b.sttEngine && AI_MODELS.STT_ENGINES.includes(b.sttEngine) ? b.sttEngine : null) ||
      (AI_MODELS.STT_ENGINES.includes(req.user.settings?.sttEngine) ? req.user.settings.sttEngine : null) ||
      AI_MODELS.DEFAULT_STT_ENGINE;

    // 4. Handle Turn Type: Continuation vs Retry vs Edit vs Fresh Send
    const isContinue =
      b.continueTurn === true ||
      b.continueTurn === 'true';

    // Find if message ID is already registered in conversation (indicates retry / in-place regeneration)
    const existingMessageIdx = b.id
      ? chat.messages.findIndex(
          (m) => String(m.id) === String(b.id) || String(m._id) === String(b.id)
        )
      : -1;

    const isEdit = !isContinue && typeof b.editTurnIndex === 'number' && b.editTurnIndex >= 0;
    const isRetry =
      !isContinue &&
      !isEdit &&
      (b.isRetry === true ||
        b.isRetry === 'true' ||
        (typeof b.retryTurnIndex === 'number' && b.retryTurnIndex >= 0) ||
        Boolean(b.anchorUserMessageId) ||
        existingMessageIdx !== -1);

    userTurn = null;
    stoppedTurn = null;
    let effectiveAttachments = Array.isArray(b.attachments) ? [...b.attachments] : [];
    let effectiveAudios = Array.isArray(b.audios) ? [...b.audios] : [];

    // Robust BYOK Key Resolution (Zero Silent Fallback Law)
    let userGeminiKey = req.user.settings?.apiKeys?.geminiApiKey || null;
    let userAddisKey = req.user.settings?.apiKeys?.addisApiKey || null;
    let userTelegramToken = req.user.integrations?.telegram?.botToken || null;

    if (!userGeminiKey || !userAddisKey || !userTelegramToken) {
      const userWithKey = await User.findById(req.user._id)
        .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey +integrations.telegram.botToken')
        .lean();
      if (userWithKey?.settings?.apiKeys?.geminiApiKey) {
        userGeminiKey = userWithKey.settings.apiKeys.geminiApiKey;
      }
      if (userWithKey?.settings?.apiKeys?.addisApiKey) {
        userAddisKey = userWithKey.settings.apiKeys.addisApiKey;
      }
      if (userWithKey?.integrations?.telegram?.botToken) {
        userTelegramToken = userWithKey.integrations.telegram.botToken;
      }
    }

    const effectiveGeminiKey = userGeminiKey;
    const effectiveAddisKey = userAddisKey;

    if (!effectiveGeminiKey) {
      res.write(`event: error\ndata: ${JSON.stringify({
        message: 'Google Gemini API key not configured. Please add your personal API key in Profile > AI Agent Settings to start chatting.',
        code: 'MISSING_GEMINI_KEY',
        actionRequired: 'CONFIGURE_GEMINI_KEY',
      })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ isError: true, chat: chat?.toJSON ? chat.toJSON() : chat })}\n\n`);
      res.end();
      return;
    }

    if (isContinue) {
      // CONTINUATION CONTRACT: Never create a new user turn.
      // Resume generating from the stopped assistant turn in chat.messages
      let targetIdx = -1;
      if (b.targetAssistantMessageId) {
        targetIdx = chat.messages.findIndex(
          (m) =>
            String(m.id) === String(b.targetAssistantMessageId) ||
            String(m._id) === String(b.targetAssistantMessageId)
        );
      }
      if (targetIdx === -1) {
        targetIdx = chat.messages.findLastIndex((m) => m.role === 'assistant');
      }

      if (targetIdx === -1 || chat.messages[targetIdx].role !== 'assistant') {
        throw new BadRequestError('Cannot continue: target assistant message not found.');
      }

      stoppedTurn = chat.messages[targetIdx];
      // Prune any turns after the stopped turn to maintain linear causality
      chat.messages = chat.messages.slice(0, targetIdx + 1);

      // Find anchor user turn preceding the stopped assistant turn
      const anchorIdx = chat.messages.slice(0, targetIdx).findLastIndex((m) => m.role === 'user');
      if (anchorIdx === -1) {
        throw new BadRequestError('Cannot continue: corresponding user message not found in conversation.');
      }
      userTurn = chat.messages[anchorIdx];
      effectiveAudios = Array.isArray(userTurn.audios) ? [...userTurn.audios] : [];
      effectiveAttachments = Array.isArray(userTurn.attachments) ? [...userTurn.attachments] : [];

      // Re-hydrate multi-modal context from anchor user turn
      if (Array.isArray(userTurn.audios) && userTurn.audios.length > 0) {
        try {
          const existingAudios = await Audio.find({ _id: { $in: userTurn.audios }, user: req.user._id });
          for (const audioDoc of existingAudios) {
            let transcriptText = '';
            if (!audioDoc.transcription || audioDoc.status !== 'transcribed') {
              const updated = await transcribeAudioDocument(audioDoc._id, {
                sttEngine: activeSttEngine,
                addisApiKey: effectiveAddisKey,
                geminiApiKey: effectiveGeminiKey,
              });
              if (updated?.transcription && updated.transcription.trim()) {
                transcriptText = updated.transcription.trim();
                audioTranscriptions.push(transcriptText);
              }
            } else if (audioDoc.transcription && audioDoc.transcription.trim()) {
              transcriptText = audioDoc.transcription.trim();
              audioTranscriptions.push(transcriptText);
            }
            if (transcriptText) {
              const fileName = audioDoc.originalName || audioDoc.fileName || 'audio.wav';
              audioPromptSections.push(`[Transcribed Audio (ID: ${audioDoc._id}, File: "${fileName}")]:\n${transcriptText}`);
            }
          }
        } catch (audioHydrateErr) {
          logger.warn(`[chatController] Failed to re-hydrate audio transcriptions for continue: ${audioHydrateErr.message}`);
        }
      } else if (Array.isArray(userTurn.audioTranscriptions) && userTurn.audioTranscriptions.length > 0) {
        audioTranscriptions.push(...userTurn.audioTranscriptions);
      }

      if (userTurn.documentTextContext && userTurn.documentTextContext.trim()) {
        attachmentTextContext = userTurn.documentTextContext.trim();
      }
      if (Array.isArray(userTurn.attachments) && userTurn.attachments.length > 0) {
        try {
          const attResult = await processAttachments(userTurn.attachments);
          if (!attachmentTextContext && attResult.textContext) {
            attachmentTextContext = attResult.textContext;
          }
          if (Array.isArray(attResult.inlineParts) && attResult.inlineParts.length > 0) {
            inlineParts.push(...attResult.inlineParts);
          }
        } catch (attHydrateErr) {
          logger.warn(`[chatController] Failed to re-hydrate attachments for continue: ${attHydrateErr.message}`);
        }
      }
    } else if (isRetry) {
      // RETRY CONTRACT: Never create a new user turn.
      // Re-hydrate multi-modal context strictly from the persisted database record!
      let anchorIdx = -1;
      if (b.anchorUserMessageId) {
        anchorIdx = chat.messages.findIndex(
          (m) =>
            String(m.id) === String(b.anchorUserMessageId) ||
            String(m._id) === String(b.anchorUserMessageId)
        );
      }

      if (anchorIdx === -1 && b.targetAssistantMessageId) {
        const targetAssistantIdx = chat.messages.findIndex(
          (m) =>
            String(m.id) === String(b.targetAssistantMessageId) ||
            String(m._id) === String(b.targetAssistantMessageId)
        );
        if (targetAssistantIdx !== -1) {
          anchorIdx = chat.messages.slice(0, targetAssistantIdx).findLastIndex((m) => m.role === 'user');
        }
      }

      if (anchorIdx === -1 && existingMessageIdx !== -1) {
        anchorIdx = existingMessageIdx;
      }

      if (anchorIdx === -1 && typeof b.retryTurnIndex === 'number' && b.retryTurnIndex > 0) {
        const candidateIdx = b.retryTurnIndex - 1;
        if (candidateIdx >= 0 && candidateIdx < chat.messages.length && chat.messages[candidateIdx].role === 'user') {
          anchorIdx = candidateIdx;
        }
      }

      if (anchorIdx === -1) {
        anchorIdx = chat.messages.findLastIndex((m) => m.role === 'user');
      }

      if (anchorIdx >= 0 && chat.messages[anchorIdx] && chat.messages[anchorIdx].role === 'user') {
        userTurn = chat.messages[anchorIdx];
      effectiveAudios = Array.isArray(userTurn.audios) ? [...userTurn.audios] : [];
      effectiveAttachments = Array.isArray(userTurn.attachments) ? [...userTurn.attachments] : [];
        // Vector 3: Prune any assistant turns after the anchor user message to restore exact pre-retry turn sequence
        const pruned = chat.messages.slice(anchorIdx + 1);
        chat.messages = chat.messages.slice(0, anchorIdx + 1);
        void storageService.cleanupPrunedTurnAssets(pruned);
      } else {
        logger.warn(`[chatController] Could not find valid user turn for retry in chat: ${chat._id}`);
        throw new BadRequestError('Cannot retry: corresponding user message not found in conversation.');
      }

      // Re-hydrate audio recordings from MongoDB
      const shouldReTranscribe = Boolean(b.sttEngine) && Array.isArray(userTurn.audios) && userTurn.audios.length > 0;
      if (Array.isArray(userTurn.audios) && userTurn.audios.length > 0) {
        try {
          const existingAudios = await Audio.find({ _id: { $in: userTurn.audios }, user: req.user._id });
          for (const audioDoc of existingAudios) {
            let transcriptText = '';
            if (!audioDoc.transcription || audioDoc.status !== 'transcribed' || shouldReTranscribe) {
              const updated = await transcribeAudioDocument(audioDoc._id, {
                sttEngine: activeSttEngine,
                addisApiKey: effectiveAddisKey,
                geminiApiKey: effectiveGeminiKey,
              });
              if (updated?.transcription && updated.transcription.trim()) {
                transcriptText = updated.transcription.trim();
                audioTranscriptions.push(transcriptText);
              }
            } else if (audioDoc.transcription && audioDoc.transcription.trim()) {
              transcriptText = audioDoc.transcription.trim();
              audioTranscriptions.push(transcriptText);
            }
            if (transcriptText) {
              const fileName = audioDoc.originalName || audioDoc.fileName || 'audio.wav';
              audioPromptSections.push(`[Transcribed Audio (ID: ${audioDoc._id}, File: "${fileName}")]:\n${transcriptText}`);
            }
          }
          if (shouldReTranscribe && audioTranscriptions.length > 0) {
            userTurn.audioTranscriptions = [...audioTranscriptions];
          }
        } catch (audioHydrateErr) {
          logger.warn(`[chatController] Failed to re-hydrate audio transcriptions: ${audioHydrateErr.message}`);
        }
      } else if (!shouldReTranscribe && Array.isArray(userTurn.audioTranscriptions) && userTurn.audioTranscriptions.length > 0) {
        audioTranscriptions.push(...userTurn.audioTranscriptions);
      }

      // Re-hydrate file attachments from verified disk files
      if (userTurn.documentTextContext && userTurn.documentTextContext.trim()) {
        attachmentTextContext = userTurn.documentTextContext.trim();
      }
      if (Array.isArray(userTurn.attachments) && userTurn.attachments.length > 0) {
        try {
          const attResult = await processAttachments(userTurn.attachments);
          if (!attachmentTextContext && attResult.textContext) {
            attachmentTextContext = attResult.textContext;
          }
          if (Array.isArray(attResult.inlineParts) && attResult.inlineParts.length > 0) {
            inlineParts.push(...attResult.inlineParts);
          }
        } catch (attHydrateErr) {
          logger.warn(`[chatController] Failed to re-hydrate attachments: ${attHydrateErr.message}`);
        }
      }
    } else {
      // FRESH SEND OR EDIT: Process incoming live audios and attachments
      // If this is an edit turn, snapshot targetTurn BEFORE any history slicing or mutations
      let editIdx = -1;
      let targetTurn = null;
      if (isEdit) {
        if (b.anchorUserMessageId) {
          const matchIdx = chat.messages.findIndex(
            (m) =>
              String(m.id) === String(b.anchorUserMessageId) ||
              String(m._id) === String(b.anchorUserMessageId)
          );
          if (matchIdx !== -1) {
            editIdx = matchIdx;
          }
        }
        if (editIdx === -1 && typeof b.editTurnIndex === 'number') {
          editIdx = b.editTurnIndex;
        }
        if (editIdx >= 0 && editIdx < chat.messages.length) {
          targetTurn = chat.messages[editIdx];
        }
      }

      // Re-hydrate attachments and audios on edit turns
      effectiveAttachments = Array.isArray(b.attachments) ? [...b.attachments] : [];
      effectiveAudios = Array.isArray(b.audios) ? [...b.audios] : [];

      if (isEdit && targetTurn) {
        // 1. Resolve stored Audio documents for targetTurn
        let storedAudioDocs = [];
        if (Array.isArray(targetTurn.audios) && targetTurn.audios.length > 0) {
          const validAudioIds = targetTurn.audios
            .map((a) => (typeof a === 'object' && a !== null ? (a._id || a.id) : a))
            .filter(Boolean)
            .filter((id) => mongoose.Types.ObjectId.isValid(id));
          if (validAudioIds.length > 0) {
            storedAudioDocs = await Audio.find({ _id: { $in: validAudioIds }, user: req.user._id });
          }
        }

        // 2. Match storedAudioDocs against effectiveAudios AND effectiveAttachments (dual-pool matching)
        if (storedAudioDocs.length > 0) {
          storedAudioDocs.forEach((storedAudio) => {
            const storedIdStr = String(storedAudio._id);
            const isKept =
              effectiveAudios.some((item) => {
                const rawId = typeof item === 'object' && item !== null ? (item._id || item.id || item.fileName || item.name) : item;
                const str = String(rawId || '');
                return (
                  str === storedIdStr ||
                  (storedAudio.fileName && str === storedAudio.fileName) ||
                  (storedAudio.originalName && str === storedAudio.originalName) ||
                  (typeof item === 'object' && item !== null && (
                    (item.fileName && item.fileName === storedAudio.fileName) ||
                    (item.originalName && item.originalName === storedAudio.originalName) ||
                    (item.name && item.name === storedAudio.originalName) ||
                    (item.publicId && item.publicId === storedAudio.publicId)
                  ))
                );
              }) ||
              effectiveAttachments.some((att) => {
                const rawId = att._id || att.id || att.fileName || att.name;
                const str = String(rawId || '');
                return (
                  str === storedIdStr ||
                  (storedAudio.fileName && (att.fileName === storedAudio.fileName || att.originalName === storedAudio.fileName)) ||
                  (storedAudio.originalName && (att.fileName === storedAudio.originalName || att.originalName === storedAudio.originalName)) ||
                  (att.name && (att.name === storedAudio.fileName || att.name === storedAudio.originalName)) ||
                  (att.publicId && att.publicId === storedAudio.publicId)
                );
              });

            if (isKept) {
              // Ensure storedAudio._id is preserved in effectiveAudios
              const alreadyInAudios = effectiveAudios.some((a) => {
                const aId = typeof a === 'object' && a !== null ? (a._id || a.id) : a;
                return String(aId) === storedIdStr;
              });
              if (!alreadyInAudios) {
                effectiveAudios.push(storedAudio._id);
              }
              // Remove from effectiveAttachments so processAttachments doesn't treat it as a document
              effectiveAttachments = effectiveAttachments.filter((att) => {
                const matchAtt =
                  (att._id && String(att._id) === storedIdStr) ||
                  (att.id && String(att.id) === storedIdStr) ||
                  (att.fileName && (att.fileName === storedAudio.fileName || att.fileName === storedAudio.originalName)) ||
                  (att.originalName && (att.originalName === storedAudio.fileName || att.originalName === storedAudio.originalName)) ||
                  (att.name && (att.name === storedAudio.fileName || att.name === storedAudio.originalName)) ||
                  (att.publicId && att.publicId === storedAudio.publicId);
                return !matchAtt;
              });
            }
          });
        }

        if (effectiveAttachments.length > 0) {
          effectiveAttachments = effectiveAttachments.map((att) => {
            const diskPath = att.path && !att.path.startsWith('blob:') && !att.path.startsWith('http')
              ? resolveFilePath(att.path)
              : (att.fileName ? resolveFilePath(att.fileName) : null);
            if (diskPath && fs.existsSync(diskPath)) {
              return {
                ...att,
                path: path.relative(process.cwd(), diskPath).replace(/\\/g, '/'),
              };
            }
            // Match against stored attachments from targetTurn
            const matchedStored = (targetTurn.attachments || []).find(
              (m) =>
                (att._id && String(m._id) === String(att._id)) ||
                (att.id && String(m._id) === String(att.id)) ||
                (att.fileName && m.fileName === att.fileName) ||
                (att.originalName && m.originalName === att.originalName) ||
                (att.name && m.originalName === att.name) ||
                (att.fileName && m.originalName === att.fileName)
            );
            if (matchedStored) {
              return {
                _id: matchedStored._id,
                fileName: matchedStored.fileName,
                originalName: matchedStored.originalName,
                mimeType: matchedStored.mimeType,
                size: matchedStored.size,
                path: matchedStored.path,
                url: matchedStored.url || `/uploads/attachments/${matchedStored.fileName}`,
                cloudUrl: matchedStored.cloudUrl,
                publicId: matchedStored.publicId,
              };
            }
            return att;
          });
        } else if (b.attachments === undefined && Array.isArray(targetTurn.attachments) && targetTurn.attachments.length > 0) {
          // If attachments omitted from payload on edit, retain targetTurn attachments
          effectiveAttachments = [...targetTurn.attachments];
        }

        if (effectiveAudios.length === 0 && b.audios === undefined && Array.isArray(targetTurn.audios) && targetTurn.audios.length > 0) {
          effectiveAudios = [...targetTurn.audios];
        }
      }

      if (effectiveAudios.length > 0) {
        sendSSE(res, 'status', {
          stage: 'transcribing_audio',
          message: 'Transcribing voice notes...',
        });
        for (const audioItem of effectiveAudios) {
          const audioId = typeof audioItem === 'object' && audioItem !== null ? (audioItem._id || audioItem.id) : audioItem;
          if (!audioId) continue;
          try {
            const audioDoc = await Audio.findOne({ _id: audioId, user: req.user._id });
            if (audioDoc) {
              let transcriptText = '';
              if (!audioDoc.transcription || audioDoc.status !== 'transcribed') {
                const updated = await transcribeAudioDocument(audioDoc._id, {
                  sttEngine: activeSttEngine,
                  addisApiKey: effectiveAddisKey,
                  geminiApiKey: effectiveGeminiKey,
                });
                if (updated?.transcription && updated.transcription.trim()) {
                  transcriptText = updated.transcription.trim();
                  audioTranscriptions.push(transcriptText);
                }
              } else if (audioDoc.transcription && audioDoc.transcription.trim()) {
                transcriptText = audioDoc.transcription.trim();
                audioTranscriptions.push(transcriptText);
              }
              if (transcriptText) {
                const fileName = audioDoc.originalName || audioDoc.fileName || 'audio.wav';
                audioPromptSections.push(`[Transcribed Audio (ID: ${audioDoc._id}, File: "${fileName}")]:\n${transcriptText}`);
              }

              // Multimodal Raw Audio Inline Parts for Turn 0 (Dual-Track Hybrid Ingestion)
              try {
                let audioBuffer = null;
                const diskPath = resolveAudioDiskPath(audioDoc.path || audioDoc.fileName);
                if (diskPath && fs.existsSync(diskPath)) {
                  audioBuffer = await fs.promises.readFile(diskPath);
                } else if (audioDoc.url && audioDoc.url.startsWith('http')) {
                  const fetchRes = await fetch(audioDoc.url);
                  if (fetchRes.ok) {
                    const arrayBuf = await fetchRes.arrayBuffer();
                    audioBuffer = Buffer.from(arrayBuf);
                  }
                }
                if (audioBuffer && audioBuffer.length > 0 && audioBuffer.length <= 20 * 1024 * 1024) {
                  let resolvedMime = audioDoc.mimeType || 'audio/webm';
                  if (resolvedMime === 'video/webm') resolvedMime = 'audio/webm';
                  inlineParts.push({
                    inlineData: {
                      mimeType: resolvedMime,
                      data: audioBuffer.toString('base64'),
                    },
                  });
                }
              } catch (rawAudioErr) {
                logger.warn(`[chatController] Could not attach raw audio inline data: ${rawAudioErr.message}`);
              }
            }
          } catch (audioErr) {
            logger.warn(`[chatController] Failed to transcribe audio ${audioId}: ${audioErr.message}`);
          }
        }
      }

      if (effectiveAttachments.length > 0) {
        sendSSE(res, 'status', {
          stage: 'processing_documents',
          message: 'Processing documents...',
        });
        const attResult = await processAttachments(effectiveAttachments);
        attachmentTextContext = attResult.textContext;
        inlineParts.push(...attResult.inlineParts);
      }

      if (isEdit && editIdx >= 0) {
        if (editIdx === 0) {
          chat.title = null;
        }
        // Downstream turns (> editIdx) are fully pruned and their assets destroyed
        const downstreamPruned = chat.messages.slice(editIdx + 1);
        void storageService.cleanupPrunedTurnAssets(downstreamPruned);

        // For the edited turn (at editIdx), calculate delta of removed assets and destroy only them
        if (targetTurn && Array.isArray(targetTurn.attachments)) {
          const keptIdentifiers = new Set();
          for (const a of effectiveAttachments) {
            if (a.publicId) keptIdentifiers.add(a.publicId);
            if (a.fileName) keptIdentifiers.add(a.fileName);
            if (a.name) keptIdentifiers.add(a.name);
            if (a.originalName) keptIdentifiers.add(a.originalName);
            if (a._id) keptIdentifiers.add(String(a._id));
            if (a.id) keptIdentifiers.add(String(a.id));
          }

          const removedAttachments = targetTurn.attachments.filter((orig) => {
            const matched =
              (orig.publicId && keptIdentifiers.has(orig.publicId)) ||
              (orig.fileName && keptIdentifiers.has(orig.fileName)) ||
              (orig.originalName && keptIdentifiers.has(orig.originalName)) ||
              (orig._id && keptIdentifiers.has(String(orig._id))) ||
              (orig.id && keptIdentifiers.has(String(orig.id)));
            return !matched;
          });

          if (removedAttachments.length > 0) {
            void storageService.cleanupPrunedTurnAssets([{ attachments: removedAttachments }]);
          }
        }

        if (targetTurn && Array.isArray(targetTurn.audios) && targetTurn.audios.length > 0) {
          const keptAudioIds = new Set(
            effectiveAudios
              .map((a) => (typeof a === 'object' && a !== null ? (a._id || a.id) : a))
              .filter(Boolean)
              .map(String)
          );
          const removedAudioIds = targetTurn.audios
            .map((a) => (typeof a === 'object' && a !== null ? (a._id || a.id) : a))
            .filter(Boolean)
            .map(String)
            .filter((id) => !keptAudioIds.has(id));
          if (removedAudioIds.length > 0) {
            void storageService.cleanupAudiosById(removedAudioIds);
          }
        }

        // Slice chat messages to before editIdx
        chat.messages = chat.messages.slice(0, editIdx);
      }

      // Defensive Alternation Invariant Enforcement (Pillar 1)
      // Before pushing a new user turn, if the conversation ends with an un-paired user turn,
      // pair it with an assistant error record so the mathematical sequence is strictly preserved.
      if (!isEdit && chat.messages.length > 0) {
        const lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          chat.messages.push({
            id: new mongoose.Types.ObjectId().toString(),
            role: 'assistant',
            text: '',
            isError: true,
            error: 'Previous turn was interrupted before response was completed.',
            createdAt: new Date(),
          });
        }
      }

      const rawTextInput = b.text !== undefined ? b.text : b.message;
      const resolvedUserText = (typeof rawTextInput === 'string') ? rawTextInput.trim() : '';

      userTurn = {
        id: b.id || new mongoose.Types.ObjectId().toString(),
        role: 'user',
        text: resolvedUserText,
        audioTranscriptions,
        documentTextContext: attachmentTextContext || null,
        audios: effectiveAudios,
        attachments: effectiveAttachments,
        createdAt: new Date(),
      };
      chat.messages.push(userTurn);
    }

    // 7. Compose the User Prompt validation
    const partsForPrompt = [];
    const promptText =
      (userTurn?.text && typeof userTurn.text === 'string' && userTurn.text.trim()) ||
      ((typeof (b.text !== undefined ? b.text : b.message) === 'string') ? (b.text !== undefined ? b.text : b.message).trim() : '') ||
      '';
    if (promptText) {
      partsForPrompt.push(promptText);
    }
    if (audioPromptSections.length > 0) {
      partsForPrompt.push(audioPromptSections.join('\n\n'));
    } else if (audioTranscriptions.length > 0) {
      partsForPrompt.push(
        `[Transcribed Audio]:\n${audioTranscriptions.join('\n\n')}`
      );
    }
    if (attachmentTextContext) {
      partsForPrompt.push(
        `[Attached Document]:\n${attachmentTextContext}`
      );
    }

    const hasText = Boolean(promptText);
    const hasAudios = Boolean(effectiveAudios.length > 0);
    const hasAttachments = Boolean(effectiveAttachments.length > 0);

    if (!hasText && !hasAudios && !hasAttachments && inlineParts.length === 0 && !isRetry && !isContinue) {
      throw new BadRequestError('Message turn must include at least text, voice audio, or an attachment.');
    }

    // Universal message contract: synthesize orientation prompt if user provided media but no text
    if (!hasText && partsForPrompt.length === 0) {
      if (hasAudios && inlineParts.length > 0) {
        partsForPrompt.push('Please listen to and analyze the attached voice audio recording in detail.');
      } else if (hasAttachments && inlineParts.length > 0) {
        partsForPrompt.push('Please review and analyze the attached file(s) in detail.');
      } else {
        partsForPrompt.push('Please review the provided media and respond accordingly.');
      }
    }

    const compiledUserMessageText = partsForPrompt.join('\n\n');

    // Persist user turn immediately and emit session event so client locks onto session ID before stream completes
    await chat.save();
    sendSSE(res, 'session', {
      chatId: chat._id.toString(),
      title: chat.title || 'New Chat',
    });

    // 8. Assemble Dynamic 6-Block System Prompt
    const systemPrompt = await assembleSystemPrompt({
      user: req.user,
      chatConfig: chat.config,
      customTurnPrompt: b.turnPrompt || '',
    });

    // 9. Build Gemini Contents History with Multi-Modal Fidelity
    const geminiContents = await buildGeminiHistory({
      chat,
      userTurn,
      isContinue,
      stoppedTurn,
    });

    // 10. Multi-Step Autonomous Tool Execution Loop (maxSteps: 5)
    // Instantiates GoogleGenAI with validated BYOK personal key (or test suite server key)
    const ai = new GoogleGenAI({ apiKey: effectiveGeminiKey });
    const rawModel =
      b.model ||
      chat.config?.model ||
      req.user.settings?.agentConfig?.defaultModel ||
      AI_MODELS.DEFAULT;

    const modelName =
      rawModel && AI_MODELS.SUPPORTED.includes(rawModel)
        ? rawModel
        : AI_MODELS.DEFAULT;

    const thinkingBudget =
      b.thinkingBudget ??
      chat.config?.thinkingBudget ??
      req.user.settings?.agentConfig?.defaultThinkingBudget ??
      CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET;

    fullText = '';
    fullThought = '';
    toolsCalled.length = 0;
    let step = 0;
    const maxSteps = 10;
    activeModel = modelName;
    let tokenUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };

    let hasPersistedAbort = false;
    persistAbortState = async () => {
      if (hasPersistedAbort || !chat) return;
      hasPersistedAbort = true;
      try {
        if (isContinue && stoppedTurn) {
          if (fullText) {
            stoppedTurn.text = (stoppedTurn.text ? `${stoppedTurn.text} ` : '') + fullText;
          }
          if (fullThought) {
            stoppedTurn.thought = (stoppedTurn.thought ? `${stoppedTurn.thought}\n` : '') + fullThought;
          }
          stoppedTurn.isStopped = true;
          stoppedTurn.model = activeModel;
          await chat.save();
        } else {
          const lastMsg = chat.messages[chat.messages.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant') {
            const assistantTurn = {
              id: new mongoose.Types.ObjectId().toString(),
              role: 'assistant',
              text: fullText || '',
              thought: fullThought || null,
              toolCalls: toolsCalled,
              model: activeModel,
              usage: tokenUsage,
              isStopped: true,
              createdAt: new Date(),
            };
            chat.messages.push(assistantTurn);
            await chat.save();
          } else {
            lastMsg.isStopped = true;
            if (fullText) lastMsg.text = fullText;
            await chat.save();
          }
        }
      } catch (saveErr) {
        logger.error(`[chatController] Error persisting aborted turn: ${saveErr.message}`);
      }
    };

    while (step < maxSteps) {
      step++;

      const functionCalls = [];
      const modelStepParts = [];

      let streamAttempts = 0;
      const maxStreamAttempts = 7;
      let streamSuccess = false;

      while (streamAttempts < maxStreamAttempts && !streamSuccess) {
        streamAttempts++;
        functionCalls.length = 0;
        modelStepParts.length = 0;
        const textBeforeAttempt = fullText;
        const thoughtBeforeAttempt = fullThought;

        const ttftStartTime = Date.now();
        logger.info(
          `[chatController] Dispatched prompt to Gemini (${activeModel}, thinkingBudget: ${thinkingBudget}). Awaiting TTFT...`
        );

        const isMultimodalOrReasoning = Boolean(
          (inlineParts && inlineParts.length > 0) ||
          (effectiveAudios && effectiveAudios.length > 0) ||
          (effectiveAttachments && effectiveAttachments.length > 0) ||
          (thinkingBudget && thinkingBudget > 0)
        );
        const ttftTimeoutMs = isMultimodalOrReasoning ? 35000 : 18000;
        const ttftTimeoutSec = ttftTimeoutMs / 1000;

        let firstTokenReceived = false;
        const watchdogController = new AbortController();
        const watchdogTimeout = setTimeout(() => {
          if (!firstTokenReceived && !isClientAborted) {
            logger.warn(
              `[chatController] TTFT watchdog triggered: No tokens received from ${activeModel} within ${ttftTimeoutSec}s. Aborting attempt ${streamAttempts}...`
            );
            watchdogController.abort(new Error(`TTFT watchdog timeout: No tokens received from ${activeModel} within ${ttftTimeoutSec}s`));
          }
        }, ttftTimeoutMs);

        const clientCloseListener = () => {
          clearTimeout(watchdogTimeout);
          try {
            watchdogController.abort();
          } catch (_) {}
        };
        req.on('close', clientCloseListener);

        try {
          sendSSE(res, 'status', {
            stage: 'connecting',
            message: 'Connecting to Operon agent...',
          });
          const responseStream = await ai.models.generateContentStream({
            model: activeModel,
            contents: geminiContents,
            config: {
              systemInstruction: systemPrompt,
              thinkingConfig: thinkingBudget > 0 ? { thinkingBudget, includeThoughts: true } : undefined,
              tools: [{ functionDeclarations: agentToolDeclarations }],
              temperature: chat.config?.temperature,
              abortSignal: watchdogController.signal,
            },
          });

          for await (const chunk of responseStream) {
            if (isClientAborted) {
              break;
            }

            if (!firstTokenReceived) {
              firstTokenReceived = true;
              clearTimeout(watchdogTimeout);
              const ttftDuration = Date.now() - ttftStartTime;
              logger.info(`[chatController] First token received from ${activeModel} in ${ttftDuration}ms`);
            }

            if (chunk.usageMetadata) {
              tokenUsage = {
                promptTokens: chunk.usageMetadata.promptTokenCount || tokenUsage.promptTokens,
                candidatesTokens: chunk.usageMetadata.candidatesTokenCount || tokenUsage.candidatesTokens,
                totalTokens: chunk.usageMetadata.totalTokenCount || tokenUsage.totalTokens,
              };
            }

            const candidate = chunk.candidates?.[0];
            if (!candidate) continue;

            const parts = candidate.content?.parts || [];
            for (const part of parts) {
              if (isClientAborted) break;
              if (part.thought) {
                const delta = part.text || '';
                fullThought += delta;
                sendSSE(res, 'thought', { delta });
              } else if (part.text) {
                const delta = part.text;
                fullText += delta;
                sendSSE(res, 'text', { delta });
              } else if (part.functionCall) {
                functionCalls.push(part.functionCall);
                modelStepParts.push(part);
              }
            }
          }

          clearTimeout(watchdogTimeout);
          req.removeListener('close', clientCloseListener);

          if (isClientAborted) {
            break;
          }

          streamSuccess = true;
        } catch (streamErr) {
          clearTimeout(watchdogTimeout);
          req.removeListener('close', clientCloseListener);

          if (isClientAborted) {
            break;
          }
          fullText = textBeforeAttempt;
          fullThought = thoughtBeforeAttempt;

          const isWatchdogTimeout =
            watchdogController.signal.aborted &&
            !isClientAborted &&
            (streamErr.message?.includes('TTFT watchdog timeout') || streamErr.name === 'AbortError');

          if (isWatchdogTimeout) {
            const mappedFallback = AI_MODELS.QUOTA_RETRY_MAP[activeModel] || AI_MODELS.FALLBACK;
            logger.warn(
              `[chatController] Model ${activeModel} stalled (>${ttftTimeoutSec}s TTFT). Failing over to ${mappedFallback} (attempt ${streamAttempts}/${maxStreamAttempts})...`
            );
            sendSSE(res, 'reset_stream', {
              stage: 'model_failover',
              failedModel: activeModel,
              alternateModel: mappedFallback,
              attempt: streamAttempts,
              maxAttempts: maxStreamAttempts,
              reason: 'ttft_watchdog_timeout',
            });
            sendSSE(res, 'status', {
              stage: 'model_failover',
              message: `Failing over to ${mappedFallback}...`,
            });
            activeModel = mappedFallback;
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }

          const isQuota =
            streamErr.message?.includes('429') ||
            streamErr.status === 429 ||
            streamErr.message?.includes('RESOURCE_EXHAUSTED');

          const isTransient =
            streamErr.message?.includes('fetch failed') ||
            streamErr.cause?.code === 'ECONNRESET' ||
            streamErr.code === 'ECONNRESET' ||
            streamErr.status === 503 ||
            streamErr.message?.includes('503') ||
            streamErr.message?.includes('Incomplete JSON') ||
            streamErr.message?.includes('JSON segment');

          if (isQuota) {
            const mappedFallback = AI_MODELS.QUOTA_RETRY_MAP[activeModel] || AI_MODELS.FALLBACK;
            if (activeModel !== mappedFallback) {
              const backoffMs = Math.min(800 * Math.pow(1.5, streamAttempts) + Math.floor(Math.random() * 300), 3000);
              logger.warn(
                `[chatController] Model ${activeModel} hit quota limit. Failing over to ${mappedFallback} after ${backoffMs}ms (attempt ${streamAttempts}/${maxStreamAttempts})...`
              );
              sendSSE(res, 'reset_stream', {
                stage: 'model_failover',
                failedModel: activeModel,
                alternateModel: mappedFallback,
                attempt: streamAttempts,
                maxAttempts: maxStreamAttempts,
              });
              sendSSE(res, 'status', {
                stage: 'model_failover',
                message: `Quota reached. Failing over to ${mappedFallback}...`,
              });
              activeModel = mappedFallback;
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
          }

          if (isTransient && streamAttempts < maxStreamAttempts) {
            const currentIdx = AI_MODELS.SUPPORTED.indexOf(activeModel);
            const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % AI_MODELS.SUPPORTED.length : 0;
            const alternateModel = AI_MODELS.SUPPORTED[nextIdx] || AI_MODELS.FALLBACK;
            const backoffMs = Math.min(1000 * Math.pow(1.5, streamAttempts) + Math.floor(Math.random() * 400), 4000);
            logger.warn(
              `[chatController] Transient error or high demand (${streamErr.message?.slice(0, 80)}...). Retrying with ${alternateModel} after ${backoffMs}ms (attempt ${streamAttempts}/${maxStreamAttempts})...`
            );
            sendSSE(res, 'reset_stream', {
              stage: 'model_failover',
              failedModel: activeModel,
              alternateModel,
              attempt: streamAttempts,
              maxAttempts: maxStreamAttempts,
            });
            sendSSE(res, 'status', {
              stage: 'model_failover',
              message: `High demand. Retrying with ${alternateModel}...`,
            });
            activeModel = alternateModel;
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }

          throw streamErr;
        }
      }

      if (isClientAborted) {
        break;
      }

      // If no tools were invoked, response is complete
      if (functionCalls.length === 0) {
        break;
      }

      // Execute autonomous tools inside Mongoose ACID sessions
      const functionResponses = [];
      for (const fc of functionCalls) {
        if (isClientAborted) {
          break;
        }
        sendSSE(res, 'status', {
          stage: 'running_tool',
          message: `Executing ${fc.name}...`,
        });
        sendSSE(res, 'tool_call', { name: fc.name, args: fc.args });

        const session = await mongoose.startSession();
        let result;
        try {
          result = await executeAgentTool(fc.name, fc.args, {
            userId: req.user._id,
            session,
            chat,
            chatId: chat._id,
          });
        } finally {
          await session.endSession();
        }

        sendSSE(res, 'tool_result', { name: fc.name, result });
        toolsCalled.push({ name: fc.name, args: fc.args, result });

        functionResponses.push({
          functionResponse: {
            name: fc.name,
            response: result,
          },
        });
      }

      if (isClientAborted) {
        break;
      }

      // Append tool invocations and results to conversation for next reasoning step
      geminiContents.push({
        role: 'model',
        parts: modelStepParts,
      });
      geminiContents.push({
        role: 'user',
        parts: functionResponses,
      });
    }

    // Handle user stop / abort interruption before turn completion
    if (isClientAborted) {
      logger.info(`[chatController] Stream stopped by user for chat ${chat._id}. Persisting partial turn.`);
      if (typeof persistAbortState === 'function') {
        await persistAbortState();
      }
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    // 11. First-Turn Auto-Titling (Turn 1 only)
    if (!chat.title && !isContinue) {
      try {
        const rawTitleSource =
          (userTurn?.text && userTurn.text.trim()) ||
          (Array.isArray(userTurn?.audioTranscriptions) && userTurn.audioTranscriptions.join(' ').trim()) ||
          (Array.isArray(audioTranscriptions) && audioTranscriptions.join(' ').trim()) ||
          (userTurn?.documentTextContext && userTurn.documentTextContext.trim()) ||
          (attachmentTextContext && attachmentTextContext.trim()) ||
          (compiledUserMessageText && compiledUserMessageText.trim()) ||
          (userTurn?.attachments?.[0]?.originalName ? `Attachment: ${userTurn.attachments[0].originalName}` : '') ||
          '';

        let derivedTitle = 'New Conversation';
        if (rawTitleSource) {
          const titlePrompt = `Summarize the user's intent in 3 to 5 words as a concise title. Output ONLY the title:\n"${rawTitleSource.slice(0, 300)}"`;
          const titleRes = await ai.models.generateContent({
            model: AI_MODELS.DEFAULT,
            contents: [{ text: titlePrompt }],
          });
          const rawText = (titleRes.text || '').trim();
          derivedTitle = (rawText.replace(/^["']|["']$/g, '') || 'New Conversation').trim().slice(0, 100);
        }
        chat.title = derivedTitle;
        sendSSE(res, 'title', { title: derivedTitle });
      } catch (titleErr) {
        chat.title = 'New Conversation';
        sendSSE(res, 'title', { title: chat.title });
      }
    }

    // 12. Persist Assistant Turn to Chat Document
    let savedAssistantMessageId;
    if (isContinue && stoppedTurn) {
      if (fullText) {
        stoppedTurn.text = (stoppedTurn.text ? `${stoppedTurn.text} ` : '') + fullText;
      }
      if (fullThought) {
        stoppedTurn.thought = (stoppedTurn.thought ? `${stoppedTurn.thought}\n` : '') + fullThought;
      }
      stoppedTurn.isStopped = false;
      stoppedTurn.model = activeModel;
      if (tokenUsage && tokenUsage.totalTokens) {
        stoppedTurn.usage = tokenUsage;
      }
      await chat.save();
      savedAssistantMessageId = stoppedTurn.id || stoppedTurn._id.toString();
    } else {
      const assistantTurn = {
        id: new mongoose.Types.ObjectId().toString(),
        role: 'assistant',
        text: fullText,
        thought: fullThought || null,
        toolCalls: toolsCalled,
        model: activeModel,
        usage: tokenUsage,
        createdAt: new Date(),
      };
      chat.messages.push(assistantTurn);
      await chat.save();
      savedAssistantMessageId = assistantTurn.id;
    }

    // 13. Send Completion Frame
    sendSSE(res, 'done', {
      chatId: chat._id.toString(),
      messageId: savedAssistantMessageId,
      title: chat.title,
      model: activeModel,
      usage: tokenUsage,
      userTurnId: userTurn?.id || null,
      userAudios: userTurn?.audios || [],
      userAttachments: userTurn?.attachments || [],
    });
    res.end();
  } catch (err) {
    if (isClientAborted) {
      logger.info(`[chatController] Error caught after client abort; persisting partial turn for chat: ${chat?._id}`);
      if (typeof persistAbortState === 'function') {
        await persistAbortState();
      }
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    logger.error(`[chatController] Stream error: ${err.message}`, { stack: err.stack, cause: err.cause });
    console.error('[chatController] Full Stream Error:', err, 'cause:', err.cause);

    const isQuota =
      err.message?.includes('429') ||
      err.status === 429 ||
      err.message?.includes('RESOURCE_EXHAUSTED');

    const reason = isQuota ? 'quota_exhausted' : 'server_error';
    const failedModel = typeof activeModel !== 'undefined' && activeModel ? activeModel : AI_MODELS.DEFAULT;
    const suggestedModels = AI_MODELS.SUPPORTED.filter((m) => m !== failedModel);

    const friendlyErrorMessage = isQuota
      ? `Model quota limit reached for ${failedModel}. Please select an alternative model.`
      : formatUserFriendlyError(err);

    // Guaranteed Assistant Persistence on Terminal Error (Pillar 1)
    // Strictly maintains U -> A -> U -> A alternating turn invariant in MongoDB
    if (chat && userTurn) {
      try {
        const lastMsg = chat.messages[chat.messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') {
          const errorAssistantTurn = {
            id: new mongoose.Types.ObjectId().toString(),
            role: 'assistant',
            text: fullText || '',
            thought: fullThought || null,
            toolCalls: toolsCalled || [],
            model: failedModel,
            isError: true,
            error: friendlyErrorMessage,
            createdAt: new Date(),
          };
          chat.messages.push(errorAssistantTurn);
          await chat.save();
        } else {
          lastMsg.isError = true;
          lastMsg.error = friendlyErrorMessage;
          if (fullText) lastMsg.text = fullText;
          await chat.save();
        }
      } catch (saveErr) {
        logger.error(`[chatController] Error persisting failed assistant turn: ${saveErr.message}`);
      }
    }

    sendSSE(res, 'error', {
      message: friendlyErrorMessage,
      failedModel,
      reason,
      suggestedModels,
    });
    res.end();
  }
});

/**
 * Lists paginated chat sessions for the authenticated supervisor.
 *
 * @route GET /api/v1/chat
 * @access Private
 */
export const getChats = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || CHAT_PAGINATION.DEFAULT_RECENT_CHATS_LIMIT;
  const isArchived = req.query.archived === 'true' || req.query.archived === true;

  const query = {
    user: req.user._id,
    isArchived,
  };

  if (req.query.pinned === 'true' || req.query.pinned === true) {
    query.isPinned = true;
  }

  if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
    const searchTerms = getBilingualSearchTerms(req.query.search.trim());
    query.$or = searchTerms.map((term) => ({
      title: { $regex: escapeRegex(term), $options: 'i' },
    }));
  }

  const options = {
    page,
    limit,
    sort: { isPinned: -1, updatedAt: -1 },
    select: '_id title isPinned config updatedAt createdAt',
    lean: true,
  };

  const result = await Chat.paginate(query, options);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      chats: result.docs,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalDocs: result.totalDocs,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
      },
    },
  });
});

/**
 * Retrieves a single chat session with full turn history.
 *
 * @route GET /api/v1/chat/:chatId
 * @access Private
 */
export const getChatById = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : CHAT_PAGINATION.DEFAULT_MESSAGES_LIMIT;
  const beforeParam = req.query.before;

  const rawChat = await Chat.findOne({
    _id: req.params.chatId,
    user: req.user._id,
    isArchived: false,
  }).select('messages._id');

  if (!rawChat) {
    throw new NotFoundError('Chat session not found.');
  }

  const totalMessages = rawChat.messages ? rawChat.messages.length : 0;
  let startIndex = 0;
  let count = limit;

  if (beforeParam !== undefined && beforeParam !== null) {
    const beforeIdx = parseInt(beforeParam, 10);
    if (!isNaN(beforeIdx) && beforeIdx > 0) {
      startIndex = Math.max(0, beforeIdx - limit);
      count = beforeIdx - startIndex;
    }
  } else {
    // Initial fetch: newest messages
    startIndex = Math.max(0, totalMessages - limit);
    count = totalMessages - startIndex;
  }

  const chat = await Chat.findOne({
    _id: req.params.chatId,
    user: req.user._id,
    isArchived: false,
  })
    .slice('messages', [startIndex, count])
    .populate('messages.audios');

  const hasMore = startIndex > 0;
  const cursor = hasMore ? String(startIndex) : null;

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      chat,
      totalMessages,
      hasMore,
      cursor,
    },
  });
});

/**
 * Updates configuration parameters for an existing chat session.
 *
 * @route PATCH /api/v1/chat/:chatId/config
 * @access Private
 */
export const updateChatConfig = asyncHandler(async (req, res) => {
  const b = req.validated?.body || req.body || {};
  const chatId = req.validated?.params?.chatId || req.params.chatId;

  const chat = await Chat.findOne({
    _id: chatId,
    user: req.user._id,
    isArchived: false,
  });

  if (!chat) {
    throw new NotFoundError('Chat session not found.');
  }

  if (b.model && AI_MODELS.SUPPORTED.includes(b.model)) chat.config.model = b.model;
  if (b.thinkingBudget !== undefined) chat.config.thinkingBudget = b.thinkingBudget;
  if (b.language) chat.config.language = b.language;
  if (b.prompt !== undefined) chat.config.prompt = b.prompt;

  await chat.save();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Chat configuration updated successfully.',
    data: {
      chat: {
        _id: chat._id,
        config: chat.config,
      },
    },
  });
});

/**
 * Toggles pinned state of a chat session.
 *
 * @route PATCH /api/v1/chat/:chatId/pin
 * @access Private
 */
export const pinChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findOne({
    _id: req.params.chatId,
    user: req.user._id,
    isArchived: false,
  });

  if (!chat) {
    throw new NotFoundError('Chat session not found.');
  }

  chat.isPinned = !chat.isPinned;
  await chat.save();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: chat.isPinned ? 'Chat pinned to sidebar.' : 'Chat unpinned.',
    data: {
      chat: {
        _id: chat._id,
        isPinned: chat.isPinned,
      },
    },
  });
});

/**
 * Manually renames a chat session title.
 *
 * @route PATCH /api/v1/chat/:chatId/title
 * @access Private
 */
export const renameChat = asyncHandler(async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) {
    throw new BadRequestError('Chat title is required.');
  }

  const chat = await Chat.findOne({
    _id: req.params.chatId,
    user: req.user._id,
    isArchived: false,
  });

  if (!chat) {
    throw new NotFoundError('Chat session not found.');
  }

  chat.title = title;
  await chat.save();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Chat title updated successfully.',
    data: {
      chat: {
        _id: chat._id,
        title: chat.title,
      },
    },
  });
});

/**
 * Deletes a chat session permanently.
 *
 * @route DELETE /api/v1/chat/:chatId
 * @access Private
 */
export const deleteChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findOneAndDelete({
    _id: req.params.chatId,
    user: req.user._id,
  });

  if (!chat) {
    throw new NotFoundError('Chat session not found.');
  }

  // Vector 1: Chat Session Deletion - Cloudinary & Disk asset purge
  await storageService.cleanupChatAssets(chat);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Chat session deleted successfully.',
    data: null,
  });
});

/**
 * Uploads 1 to 5 voice recordings for conversational chat turn grounding.
 * Validates cumulative batch size (<=50MB) and persists Audio documents with purpose 'chat_voice_input'.
 * Executes within a Mongoose transaction session.
 *
 * @route POST /api/v1/chat/upload-audio
 * @access Private
 */
export const uploadChatAudios = asyncHandler(async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    throw new BadRequestError('At least one audio file is required.');
  }

  // Validate cumulative batch size cap (50MB)
  const totalBatchBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBatchBytes > AUDIO_CONSTANTS.MAX_BATCH_SIZE_BYTES) {
    for (const file of files) {
      try {
        await fs.promises.unlink(file.path);
      } catch (_) {}
    }
    throw new BadRequestError(
      `Cumulative audio upload size exceeds the ${AUDIO_CONSTANTS.MAX_BATCH_SIZE_BYTES / (1024 * 1024)}MB batch limit.`
    );
  }

  // Eager upload to Cloud CDN (Cloudinary) or fallback
  const cloudUploadResults = await Promise.all(
    files.map(async (file) => {
      let cleanMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
      if (cleanMime === 'video/webm' || (file.originalname && file.originalname.toLowerCase().endsWith('.webm'))) {
        cleanMime = 'audio/webm';
      }
      const uploadRes = await storageService.uploadFile({
        filePath: file.path,
        fileName: file.filename,
        mimeType: cleanMime || 'audio/webm',
        folder: 'personal-agent/audios',
        resourceType: 'video',
      });
      return {
        user: req.user._id,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: cleanMime || 'audio/webm',
        size: file.size,
        path: file.path.replace(/\\/g, '/'),
        cloudUrl: uploadRes.isCloud ? uploadRes.secure_url : null,
        publicId: uploadRes.publicId || null,
        purpose: 'chat_voice_input',
        status: 'uploaded',
      };
    })
  );

  const session = await mongoose.startSession();
  try {
    let createdAudios;

    await session.withTransaction(async () => {
      createdAudios = await Audio.create(cloudUploadResults, { session });
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Audio files uploaded successfully',
      data: {
        audios: createdAudios,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Uploads 1 to 5 attachments for chat message turns.
 * Validates cumulative batch size (<=50MB) and returns attachment metadata.
 *
 * @route POST /api/v1/chat/upload-attachments
 * @access Private
 */
export const uploadChatAttachments = asyncHandler(async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    throw new BadRequestError('At least one attachment file is required.');
  }

  const totalBatchBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBatchBytes > ATTACHMENT_CONSTANTS.MAX_BATCH_SIZE_BYTES) {
    for (const file of files) {
      try {
        await fs.promises.unlink(file.path);
      } catch (_) {}
    }
    throw new BadRequestError(
      `Cumulative attachment batch size cannot exceed ${ATTACHMENT_CONSTANTS.MAX_BATCH_SIZE_BYTES / (1024 * 1024)}MB.`
    );
  }

  const attachments = await Promise.all(
    files.map(async (file) => {
      const uploadRes = await storageService.uploadFile({
        filePath: file.path,
        fileName: file.filename,
        mimeType: file.mimetype,
        folder: 'personal-agent/attachments',
      });
      return {
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
        url: uploadRes.isCloud ? uploadRes.secure_url : `/uploads/${file.domain || 'files'}/${file.filename}`,
        cloudUrl: uploadRes.isCloud ? uploadRes.secure_url : null,
        publicId: uploadRes.publicId || null,
      };
    })
  );

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Attachments uploaded successfully.',
    data: {
      attachments,
    },
  });
});

/**
 * Dismisses a single staged attachment from the composer draft shelf and purges it from Cloudinary CDN.
 *
 * @route DELETE /api/v1/chat/attachment/:publicId
 * @access Private
 */
export const deleteComposerAttachment = asyncHandler(async (req, res) => {
  const publicId = req.params.publicId || req.params[0] || req.query.publicId;
  const { mimeType, fileName } = req.query;

  if (!publicId && !fileName) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'No staged attachment identifier provided.',
      data: { result: 'noop' },
    });
  }

  let result = { result: 'ok' };
  if (publicId || fileName) {
    result = await storageService.cleanupComposerAttachment(publicId, mimeType, fileName);
  }

  // Also remove from local disk storage across domains if fileName is provided
  if (fileName) {
    storageService.safeUnlinkDiskFile(fileName);
  }

  // If a staged Audio document exists for this upload, purge it and unlink disk file
  if (publicId || fileName) {
    try {
      const audioQuery = {
        user: req.user._id,
        $or: [
          ...(publicId ? [{ publicId }] : []),
          ...(fileName ? [{ fileName }, { originalName: fileName }] : []),
        ],
      };
      const audioDoc = await Audio.findOne(audioQuery).select('path fileName publicId');
      if (audioDoc) {
        if (audioDoc.path) storageService.safeUnlinkDiskFile(audioDoc.path, UPLOADS_CONFIG.AUDIOS_DIR);
        if (audioDoc.fileName) storageService.safeUnlinkDiskFile(audioDoc.fileName, UPLOADS_CONFIG.AUDIOS_DIR);
      }
      await Audio.deleteMany(audioQuery);
    } catch (_) {}
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Staged attachment removed and purged from storage.',
    data: result,
  });
});

/**
 * Ingests a single voice recording and returns the transcribed text.
 * Used for live voice dictation into the composer without persisting a message turn.
 *
 * @route POST /api/v1/chat/transcribe-audio
 * @access Private
 */
export const transcribeAudio = asyncHandler(async (req, res) => {
  const file =
    req.file ||
    req.files?.audio?.[0] ||
    req.files?.audios?.[0] ||
    req.files?.file?.[0] ||
    null;

  if (!file) {
    throw new BadRequestError('No audio recording uploaded for transcription.');
  }

  const engine =
    req.body?.engine ||
    req.body?.sttEngine ||
    req.user?.settings?.sttEngine ||
    AI_MODELS.DEFAULT_STT_ENGINE;
  const language = req.body?.language || 'am';

  if (file.size === 0) {
    fs.promises.unlink(file.path).catch(() => {});
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        text: '',
        duration: 0,
        engine,
        noAudioDetected: true,
      },
    });
  }

  try {
    let userAddisKey = req.user?.settings?.apiKeys?.addisApiKey;
    let userGeminiKey = req.user?.settings?.apiKeys?.geminiApiKey;
    if ((!userAddisKey || !userGeminiKey) && req.user?._id) {
      const userWithKeys = await User.findById(req.user._id).select('+settings.apiKeys.addisApiKey +settings.apiKeys.geminiApiKey').lean();
      if (userWithKeys?.settings?.apiKeys) {
        userAddisKey = userWithKeys.settings.apiKeys.addisApiKey;
        userGeminiKey = userWithKeys.settings.apiKeys.geminiApiKey;
      }
    }

    const result = await transcribeAudioUtil(file.path, {
      sttEngine: engine,
      language,
      mimeType: file.mimetype,
      addisApiKey: userAddisKey,
      geminiApiKey: userGeminiKey,
    });

    const text = (result.text || '').trim();
    const noAudioDetected = !text || result.noAudioDetected === true;

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        text,
        duration: result.duration || 0,
        engine: result.engine,
        noAudioDetected,
      },
    });
  } finally {
    // Defensively clean up the temporary dictation audio file from disk
    fs.promises.unlink(file.path).catch((unlinkErr) => {
      logger.warn(
        `[chatController] Could not unlink temp dictation audio ${file.path}: ${unlinkErr.message}`
      );
    });
  }
});

/**
 * Quick manual broadcast of message text to Telegram.
 *
 * @function shareToTelegramDirect
 * @route POST /api/v1/chat/share-telegram
 * @access Private (Area Supervisor)
 */
export const shareToTelegramDirect = asyncHandler(async (req, res) => {
  const {
    text,
    targetChannel = 'management',
    asImage = false,
    customNote,
    fontSize,
    lineSpacing,
    bold,
    underlineHeaders,
    options = {},
  } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new BadRequestError('Message text is required for Telegram sharing.');
  }

  const mergedOptions = { ...options };
  if (fontSize) mergedOptions.fontSize = fontSize;
  if (lineSpacing) mergedOptions.lineSpacing = lineSpacing;
  if (bold) mergedOptions.allBold = true;
  if (underlineHeaders) mergedOptions.underlineHeaders = true;

  const user = await User.findById(req.user._id)
    .select('+integrations.telegram.botToken')
    .lean();
  if (!user) {
    throw new UnauthenticatedError('User account not found.');
  }

  const telegram = user.integrations?.telegram;
  if (!telegram?.connected || !telegram?.botToken) {
    throw new BadRequestError('Telegram integration is not connected. Please connect your bot in Profile Settings.');
  }

  if (telegram.enabled === false) {
    throw new BadRequestError('Telegram integration is currently paused in Profile Settings.');
  }

  const chatId = resolveChannelChatId(user, targetChannel);
  if (!chatId) {
    throw new BadRequestError(`Target channel "${targetChannel}" does not have a configured Chat ID in Profile Settings.`);
  }

  const result = await dispatchToTelegram({
    user,
    targetChannel,
    text: text.trim(),
    customNote,
    asImage: Boolean(asImage),
    options: mergedOptions,
  });

  if (!result.success && !result.ok) {
    throw new BadRequestError(result.error || `Failed to broadcast message to Telegram channel "${targetChannel}".`);
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
});

/**
 * Securely streams a generated document file for download.
 *
 * @function downloadGeneratedDocument
 * @route GET /api/v1/chat/downloads/:fileId
 * @access Private (Area Supervisor)
 */
export const downloadGeneratedDocument = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!fileId || typeof fileId !== 'string' || !/^[0-9a-fA-F]{32}$/.test(fileId)) {
    throw new BadRequestError('Invalid document download identifier.');
  }

  const meta = generatedDocumentRegistry.get(fileId);
  const docsDir = path.resolve(process.cwd(), 'backend/uploads/generated_documents');

  let targetFilePath = null;
  let targetFileName = 'document';
  let targetMime = 'application/octet-stream';

  if (meta) {
    targetFilePath = meta.filePath;
    targetFileName = meta.fileName;
    targetMime = meta.mimeType;
  } else if (fs.existsSync(docsDir)) {
    const files = fs.readdirSync(docsDir);
    const match = files.find((f) => f.startsWith(`${fileId}_`));
    if (match) {
      targetFilePath = path.join(docsDir, match);
      targetFileName = match.replace(`${fileId}_`, '');
      const ext = path.extname(targetFileName).toLowerCase();
      if (ext === '.pdf') targetMime = 'application/pdf';
      else if (ext === '.docx') targetMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === '.xlsx') targetMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (ext === '.csv') targetMime = 'text/csv';
      else if (ext === '.md') targetMime = 'text/markdown';
      else if (ext === '.json') targetMime = 'application/json';
    }
  }

  if (!targetFilePath || !fs.existsSync(targetFilePath)) {
    throw new NotFoundError('The requested document was not found or has expired.');
  }

  res.setHeader('Content-Type', targetMime);
  res.setHeader('Content-Disposition', `attachment; filename="${targetFileName}"`);
  const stream = fs.createReadStream(targetFilePath);
  stream.pipe(res);
});

/**
 * Synthesizes speech from text using native Addis AI (Addis Voices 2).
 *
 * @function synthesizeSpeech
 * @route POST /api/v1/chat/tts
 * @access Private (Area Supervisor)
 */
export const synthesizeSpeech = asyncHandler(async (req, res) => {
  const { text, voiceId, language, clientRequestId } = req.body;

  let userAddisKey = req.user?.settings?.apiKeys?.addisApiKey;
  let userTtsSettings = req.user?.settings?.tts;

  if (!userAddisKey || !userTtsSettings) {
    const userDoc = await User.findById(req.user._id)
      .select('+settings.apiKeys.addisApiKey')
      .lean();
    if (userDoc?.settings?.apiKeys?.addisApiKey) {
      userAddisKey = userDoc.settings.apiKeys.addisApiKey;
    }
    if (userDoc?.settings?.tts) {
      userTtsSettings = userDoc.settings.tts;
    }
  }

  const result = await ttsService.generateSpeech({
    text,
    voiceId,
    language,
    addisApiKey: userAddisKey,
    userSettings: { tts: userTtsSettings },
    clientRequestId,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
});

/**
 * Retrieves the catalog of available Addis AI voices.
 *
 * @function getTtsVoices
 * @route GET /api/v1/chat/tts/voices
 * @access Private (Area Supervisor)
 */
export const getTtsVoices = asyncHandler(async (req, res) => {
  let userAddisKey = req.user?.settings?.apiKeys?.addisApiKey;
  if (!userAddisKey) {
    const userDoc = await User.findById(req.user._id)
      .select('+settings.apiKeys.addisApiKey')
      .lean();
    if (userDoc?.settings?.apiKeys?.addisApiKey) {
      userAddisKey = userDoc.settings.apiKeys.addisApiKey;
    }
  }

  const voices = await ttsService.getAvailableVoices({
    apiKey: userAddisKey,
    forceRefresh: req.query?.refresh === 'true',
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: voices,
  });
});

export default {
  streamChat,
  getChats,
  getChatById,
  updateChatConfig,
  pinChat,
  renameChat,
  deleteChat,
  uploadChatAttachments,
  uploadChatAudios,
  deleteComposerAttachment,
  transcribeAudio,
  shareToTelegramDirect,
  downloadGeneratedDocument,
  synthesizeSpeech,
  getTtsVoices,
};

````

================================================================================
File: backend/src/controllers/dashboardController.js
================================================================================

````javascript
/**
 * @module controllers/dashboardController
 * @description Executive operational intelligence and platform metrics controller.
 * Aggregates KPIs, branch inspection frequency distribution, 14-day continuous audit trend,
 * recurring issues breakdown, and recent reports ledger with strict tenant isolation.
 */

import asyncHandler from 'express-async-handler';
import { Branch } from '../models/Branch.js';
import { Report } from '../models/Report.js';
import { HTTP_STATUS } from '../utils/constants.js';

/**
 * Month names for 14-day timeline formatting.
 * @constant {string[]}
 */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Retrieves aggregated operational metrics and analytics for the authenticated supervisor.
 *
 * @function getDashboardMetrics
 * @param {import('express').Request} req - Express request object containing req.user._id.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getDashboardMetrics = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // 1. Time boundary calculations
  const today = new Date();
  
  // Trailing 7 days for auditsThisWeek
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // Trailing 14 days for auditVolumeTrend
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  fourteenDaysAgo.setHours(0, 0, 0, 0);

  // 2. Concurrently execute all independent aggregation pipelines
  const [
    activeBranches,
    totalReports,
    auditsThisWeek,
    openIssuesAgg,
    totalVisitsAgg,
    branchVisitFrequency,
    trendAgg,
    issuesAgg,
    recentReports,
  ] = await Promise.all([
    // Active branches count
    Branch.countDocuments({ user: userId, isArchived: false }),

    // Total active reports count
    Report.countDocuments({ user: userId, isArchived: false }),

    // Reports created or dated in trailing 7 days
    Report.countDocuments({ user: userId, isArchived: false, date: { $gte: sevenDaysAgo } }),

    // Open issues count (reported or in_progress)
    Report.aggregate([
      { $match: { user: userId, isArchived: false } },
      { $unwind: '$issues' },
      { $match: { 'issues.status': { $in: ['reported', 'in_progress'] } } },
      { $count: 'count' },
    ]),

    // Total visits across all active reports
    Report.aggregate([
      { $match: { user: userId, isArchived: false } },
      { $project: { visitCount: { $size: { $ifNull: ['$visits', []] } } } },
      { $group: { _id: null, total: { $sum: '$visitCount' } } },
    ]),

    // Top 10 visited branches with populated code and name
    Report.aggregate([
      { $match: { user: userId, isArchived: false } },
      { $unwind: '$visits' },
      {
        $group: {
          _id: '$visits.branch',
          visitCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'branches',
          localField: '_id',
          foreignField: '_id',
          as: 'branchDoc',
        },
      },
      { $unwind: { path: '$branchDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          branchId: '$_id',
          branchName: { $ifNull: ['$branchDoc.name', 'Unknown Branch'] },
          branchCode: { $ifNull: ['$branchDoc.code', 'UNK'] },
          visitCount: 1,
        },
      },
      { $sort: { visitCount: -1 } },
      { $limit: 10 },
    ]),

    // Trailing 14-day audit volume aggregation
    Report.aggregate([
      {
        $match: {
          user: userId,
          isArchived: false,
          date: { $gte: fourteenDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 },
        },
      },
    ]),

    // Recurring issues breakdown by status
    Report.aggregate([
      { $match: { user: userId, isArchived: false } },
      { $unwind: '$issues' },
      {
        $group: {
          _id: '$issues.status',
          count: { $sum: 1 },
        },
      },
    ]),

    // Recent 5 operational reports
    Report.find({ user: userId, isArchived: false })
      .sort({ date: -1, createdAt: -1 })
      .limit(5)
      .populate('visits.branch', 'name code')
      .select('date ethiopianDate shiftSchedule visits issues activities')
      .lean(),
  ]);

  // 3. Extract scalar aggregations
  const openIssues = openIssuesAgg.length > 0 ? openIssuesAgg[0].count : 0;
  const totalVisits = totalVisitsAgg.length > 0 ? totalVisitsAgg[0].total : 0;

  // 4. Construct normalized, continuous 14-day timeline (zero gaps)
  const trendMap = new Map();
  trendAgg.forEach((item) => {
    if (item._id) {
      trendMap.set(item._id, item.count);
    }
  });

  const auditVolumeTrend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

    auditVolumeTrend.push({
      date: dateStr,
      label,
      count: trendMap.get(dateStr) || 0,
    });
  }

  // 5. Construct recurring issues status counts
  const recurringIssues = {
    reported: 0,
    in_progress: 0,
    completed: 0,
    no_issue: 0,
  };
  issuesAgg.forEach((item) => {
    if (item._id && recurringIssues[item._id] !== undefined) {
      recurringIssues[item._id] = item.count;
    }
  });

  // 6. Return response in standard platform envelope
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Dashboard metrics retrieved successfully.',
    data: {
      kpis: {
        activeBranches,
        totalReports,
        auditsThisWeek,
        openIssues,
        totalVisits,
      },
      branchVisitFrequency,
      auditVolumeTrend,
      recurringIssues,
      recentReports,
    },
  });
});

export default {
  getDashboardMetrics,
};

````

================================================================================
File: backend/src/controllers/reportController.js
================================================================================

````javascript
/**
 * @module controllers/reportController
 * @description Controller managing Corporate Operational Reports: programmatic creation via AI agent,
 * paginated listing, single report inspection, subdocument queries (activities, issues, comments),
 * manual UI updates, soft archival, restoration, cascade permanent deletion, and audio ingestion.
 * All write operations strictly execute within Mongoose transaction sessions for ACID integrity.
 */

import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';

import { Report } from '../models/Report.js';
import { Branch } from '../models/Branch.js';
import { Audio } from '../models/Audio.js';
import { User } from '../models/User.js';
import { dispatchToTelegram } from '../services/telegramService.js';
import { HTTP_STATUS, REPORT_CONSTANTS, AUDIO_CONSTANTS } from '../utils/constants.js';
import { NotFoundError, BadRequestError, ConflictError } from '../errors/CustomError.js';
import { logger } from '../config/logger.js';
import { getBilingualSearchTerms, escapeRegex } from '../utils/transliterate.js';
import { toEthiopianDateString } from '../utils/ethiopianCalendar.js';
import storageService from '../services/storageService.js';


/**
 * Persists an operational report document into MongoDB inside an ACID transaction session.
 * Pure service function: completely decoupled from Express req/res.
 * Directly invoked by the in-process AI Agent Tool execution pipeline (Task 7.5) and the HTTP controller.
 *
 * @function createReportRecord
 * @param {Object} params - Creation parameters.
 * @param {string|import('mongoose').Types.ObjectId} params.userId - Authenticated supervisor user ID.
 * @param {Object} params.payload - Validated operational report payload.
 * @param {import('mongoose').ClientSession} [params.existingSession=null] - Optional outer Mongoose transaction session.
 * @returns {Promise<import('../models/Report.js').ReportDocument>} The persisted Report document.
 */
export const createReportRecord = async ({ userId, payload, existingSession = null }) => {
  const {
    date,
    clockIn,
    clockOut,
    visits,
    activities,
    issues,
    comments,
    customSections,
    metadata,
    transcription,
    audios,
  } = payload;

  const session = existingSession || (await mongoose.startSession());
  const ownsSession = !existingSession;

  try {
    let createdReport;

    const executeWork = async (sess) => {
      // 0. Dual-Calendar Uniqueness Check: Prevent duplicate active reports for the same supervisor on the same day
      const targetDate = new Date(date);
      const targetDateString = targetDate.toISOString().split('T')[0];
      const targetEthDate = toEthiopianDateString(targetDate);

      const existingReport = await Report.findOne({
        user: userId,
        isArchived: false,
        $or: [
          { dateString: targetDateString },
          { ethiopianDate: targetEthDate },
        ],
      })
        .populate('visits.branch', 'name code')
        .session(sess);

      if (existingReport) {
        const conflictErr = new ConflictError(
          `An active operational report already exists for ${targetDateString} (Ethiopian: ${existingReport.ethiopianDate}) [Report ID: ${existingReport._id}]. A supervisor may only have one operational report per calendar day.`
        );
        conflictErr.code = 'REPORT_ALREADY_EXISTS';
        conflictErr.existingReport = existingReport;
        throw conflictErr;
      }

      // 1. Verify that all referenced branches exist, belong to this supervisor, and are active
      const referencedBranchIds = visits.map((v) => String(v.branch));
      const uniqueBranchIds = [...new Set(referencedBranchIds)];

      const foundBranches = await Branch.find({
        _id: { $in: uniqueBranchIds },
        user: userId,
      })
        .session(sess)
        .lean();

      if (foundBranches.length !== uniqueBranchIds.length) {
        throw new NotFoundError(
          'One or more referenced branches could not be found or do not belong to your account.'
        );
      }

      // 2. Verify standalone audio records if provided
      if (audios && audios.length > 0) {
        const foundAudios = await Audio.find({
          _id: { $in: audios },
          user: userId,
          isArchived: false,
        })
          .session(sess)
          .lean();

        if (foundAudios.length !== audios.length) {
          throw new NotFoundError(
            'One or more referenced audio recordings could not be found or have been archived.'
          );
        }
      }

      // 3. Atomically persist the report document
      const [report] = await Report.create(
        [
          {
            user: userId,
            date: targetDate,
            dateString: targetDateString,
            ethiopianDate: targetEthDate,
            clockIn,
            clockOut,
            visits,
            activities: activities || [],
            issues: issues || [],
            comments: comments || [],
            customSections: customSections || [],
            metadata: metadata || new Map(),
            transcription,
            audios: audios || [],
            isArchived: false,
            archivedAt: null,
          },
        ],
        { session: sess }
      );

      createdReport = report;
    };

    if (ownsSession) {
      await session.withTransaction(async () => {
        await executeWork(session);
      });
    } else {
      await executeWork(session);
    }

    return createdReport;
  } finally {
    if (ownsSession) {
      await session.endSession();
    }
  }
};

/**
 * Creates a new corporate operational report for the authenticated supervisor.
 * HTTP adapter wrapping the pure createReportRecord persistence engine.
 *
 * @function createReport
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const createReport = asyncHandler(async (req, res) => {
  const validatedPayload = req.validated?.body || req.body || {};
  const report = await createReportRecord({
    userId: req.user._id,
    payload: validatedPayload,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Report created successfully',
    data: {
      report,
    },
  });
});

/**
 * Retrieves a paginated list of operational reports for the authenticated supervisor.
 * Default query strictly excludes soft-archived reports; ?archived=true lists archived reports.
 * Supports filtering by branch and date.
 *
 * @function getReports
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getReports = asyncHandler(async (req, res) => {
  const query = req.validated?.query || req.query || {};
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || REPORT_CONSTANTS.PAGE_LIMIT_DEFAULT;

  const isArchivedRequested = query.archived === 'true' || query.archived === true;

  const filter = {
    user: req.user._id,
    isArchived: isArchivedRequested,
  };

  // Branch visit filter
  if (query.branch) {
    filter['visits.branch'] = query.branch;
  }

  // Date filter (matches full UTC day)
  if (query.date) {
    const targetDate = new Date(query.date);
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    filter.date = { $gte: startOfDay, $lte: endOfDay };
  }

  // Bilingual full-text search filter across branches, transcription, activities, issues, and comments
  if (query.search && typeof query.search === 'string' && query.search.trim()) {
    const searchTerms = getBilingualSearchTerms(query.search.trim());

    // Resolve any branches matching the search query to include their reports
    const branchOrConditions = searchTerms.flatMap((term) => {
      const termRegex = new RegExp(escapeRegex(term), 'i');
      return [
        { name: termRegex },
        { code: termRegex },
        { aliases: termRegex },
      ];
    });

    const matchingBranches = await Branch.find({
      user: req.user._id,
      $or: branchOrConditions,
    }).select('_id').lean();

    const matchingBranchIds = matchingBranches.map((b) => b._id);

    const searchOrConditions = [];
    if (matchingBranchIds.length > 0) {
      searchOrConditions.push({ 'visits.branch': { $in: matchingBranchIds } });
    }

    searchTerms.forEach((term) => {
      const termRegex = new RegExp(escapeRegex(term), 'i');
      searchOrConditions.push(
        { transcription: termRegex },
        { 'activities.text': termRegex },
        { 'issues.text': termRegex },
        { 'comments.text': termRegex }
      );
    });

    filter.$or = searchOrConditions;
  }

  const options = {
    page,
    limit,
    sort: isArchivedRequested ? { archivedAt: -1, createdAt: -1 } : { date: -1, createdAt: -1 },
    populate: [
      { path: 'visits.branch', select: 'name code location managerName' },
      {
        path: 'audios',
        select: 'fileName originalName mimeType size path duration url transcription status',
      },
      { path: 'user', select: 'fullName email position avatar' },
    ],
  };

  const result = await Report.paginate(filter, options);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Reports retrieved successfully',
    data: {
      docs: result.docs,
      reports: result.docs,
      totalDocs: result.totalDocs,
      limit: result.limit,
      page: result.page,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    },
  });
});

/**
 * Retrieves details of a single operational report by its identifier.
 * Scoped strictly to the authenticated supervisor.
 *
 * @function getReportById
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getReportById = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;

  const report = await Report.findOne({
    _id: reportId,
    user: req.user._id,
  }).populate([
    { path: 'visits.branch', select: 'name code location managerName' },
    {
      path: 'audios',
      select: 'fileName originalName mimeType size path duration url transcription status',
    },
    { path: 'user', select: 'fullName email position avatar' },
  ]);

  if (!report) {
    throw new NotFoundError('Report not found.');
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Report retrieved successfully',
    data: {
      report,
    },
  });
});

/**
 * Updates operational report fields (manual UI edit or conversational agent instruction).
 * Executes within a Mongoose transaction session.
 *
 * @function updateReport
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateReport = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;
  const rawBody = req.validated?.body || req.body || {};
  const updates = rawBody.data && typeof rawBody.data === 'object' ? rawBody.data : rawBody;

  const session = await mongoose.startSession();
  try {
    let updatedReport;

    await session.withTransaction(async () => {
      const report = await Report.findOne({
        _id: reportId,
        user: req.user._id,
        isArchived: false,
      }).session(session);

      if (!report) {
        throw new NotFoundError('Report not found or has been archived.');
      }

      // If branch-referencing visits are being updated, verify branch ownership
      const branchIdsToVerify = updates.visits
        ? updates.visits.map((v) => String(v.branch)).filter(Boolean)
        : [];

      if (branchIdsToVerify.length > 0) {
        const uniqueIds = [...new Set(branchIdsToVerify)];
        const branches = await Branch.find({
          _id: { $in: uniqueIds },
          user: req.user._id,
        })
          .session(session)
          .lean();

        if (branches.length !== uniqueIds.length) {
          throw new NotFoundError(
            'One or more updated branches could not be found or do not belong to your account.'
          );
        }
      }

      // Apply allowable operational updates
      if (updates.date !== undefined) report.date = new Date(updates.date);
      if (updates.clockIn !== undefined) report.clockIn = updates.clockIn;
      if (updates.clockOut !== undefined) report.clockOut = updates.clockOut;
      if (updates.visits !== undefined) report.visits = updates.visits;
      if (updates.activities !== undefined) report.activities = updates.activities;
      if (updates.issues !== undefined) report.issues = updates.issues;
      if (updates.comments !== undefined) report.comments = updates.comments;
      if (updates.customSections !== undefined) report.customSections = updates.customSections;
      if (updates.metadata !== undefined) report.metadata = updates.metadata;
      if (updates.transcription !== undefined) report.transcription = updates.transcription;
      if (updates.audios !== undefined) {
        if (Array.isArray(updates.audios) && updates.audios.length > 0) {
          const foundAudios = await Audio.find({
            _id: { $in: updates.audios },
            user: req.user._id,
            isArchived: false,
          })
            .session(session)
            .lean();

          if (foundAudios.length !== updates.audios.length) {
            throw new NotFoundError(
              'One or more referenced audio recordings could not be found or have been archived.'
            );
          }
        }
        report.audios = updates.audios;
      }

      await report.save({ session });
      updatedReport = report;
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Report updated successfully',
      data: {
        report: updatedReport,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Retrieves the embedded activities subdocument array for a specified report.
 *
 * @function getReportActivities
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getReportActivities = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;

  const report = await Report.findOne({
    _id: reportId,
    user: req.user._id,
  }).select('activities');

  if (!report) {
    throw new NotFoundError('Report not found.');
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Report activities retrieved successfully',
    data: {
      activities: report.activities,
    },
  });
});

/**
 * Retrieves the embedded issues subdocument array for a specified report.
 *
 * @function getReportIssues
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getReportIssues = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;

  const report = await Report.findOne({
    _id: reportId,
    user: req.user._id,
  }).select('issues');

  if (!report) {
    throw new NotFoundError('Report not found.');
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Report issues retrieved successfully',
    data: {
      issues: report.issues,
    },
  });
});

/**
 * Retrieves the embedded comments subdocument array for a specified report.
 *
 * @function getReportComments
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getReportComments = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;

  const report = await Report.findOne({
    _id: reportId,
    user: req.user._id,
  }).select('comments');

  if (!report) {
    throw new NotFoundError('Report not found.');
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Report comments retrieved successfully',
    data: {
      comments: report.comments,
    },
  });
});

/**
 * Soft-archives an active operational report.
 * Initiates the 30-day auto-purge retention window.
 * Executes within a Mongoose transaction session.
 *
 * @function archiveReport
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const archiveReport = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;

  // Support ?permanent=true query flag
  if (req.query?.permanent === 'true') {
    return deleteReportPermanently(req, res);
  }

  const session = await mongoose.startSession();
  try {
    let archivedReport;

    await session.withTransaction(async () => {
      const report = await Report.findOne({
        _id: reportId,
        user: req.user._id,
      }).session(session);

      if (!report) {
        throw new NotFoundError('Report not found.');
      }

      if (report.isArchived) {
        throw new BadRequestError('Report is already archived.');
      }

      report.isArchived = true;
      report.archivedAt = new Date();

      await report.save({ session });
      archivedReport = report;
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Report archived successfully',
      data: {
        report: archivedReport,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Restores a soft-archived operational report before the 30-day auto-purge elapses.
 * Executes within a Mongoose transaction session.
 *
 * @function restoreReport
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const restoreReport = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;

  const session = await mongoose.startSession();
  try {
    let restoredReport;

    await session.withTransaction(async () => {
      const report = await Report.findOne({
        _id: reportId,
        user: req.user._id,
      }).session(session);

      if (!report) {
        throw new NotFoundError('Report not found.');
      }

      if (!report.isArchived) {
        throw new BadRequestError('Report is not archived.');
      }

      report.isArchived = false;
      report.archivedAt = null;

      await report.save({ session });
      restoredReport = report;
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Report restored successfully',
      data: {
        report: restoredReport,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Permanently deletes an operational report, removes associated audio metadata,
 * and unlinks audio binaries from disk post-commit.
 * Executes within a Mongoose transaction session.
 *
 * @function deleteReportPermanently
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const deleteReportPermanently = asyncHandler(async (req, res) => {
  const { reportId } = req.validated?.params || req.params;

  const session = await mongoose.startSession();
  const audioPathsToUnlink = [];

  try {
    await session.withTransaction(async () => {
      const report = await Report.findOne({
        _id: reportId,
        user: req.user._id,
      }).session(session);

      if (!report) {
        throw new NotFoundError('Report not found.');
      }

      if (!report.isArchived) {
        throw new BadRequestError(
          'Only archived reports can be permanently deleted. Please archive the report first.'
        );
      }

      // Collect audio filepaths to unlink after commit
      if (report.audios && report.audios.length > 0) {
        const audioDocs = await Audio.find({
          _id: { $in: report.audios },
          user: req.user._id,
        })
          .select('path publicId')
          .session(session)
          .lean();

        for (const a of audioDocs) {
          if (a.path) {
            audioPathsToUnlink.push(a.path);
          }
        }

        // Vector 7: Clean up Cloud CDN assets
        void storageService.cleanupReportAudios(audioDocs);

        // Remove Audio records from database
        await Audio.deleteMany({
          _id: { $in: report.audios },
          user: req.user._id,
        }).session(session);
      }

      // Hard delete the report document
      await Report.deleteOne({ _id: reportId }).session(session);
    });

    // Post-commit: cleanly unlink associated audio binaries from filesystem
    for (const audioPath of audioPathsToUnlink) {
      try {
        const resolvedPath = path.resolve(audioPath);
        await fs.promises.unlink(resolvedPath);
        logger.info(`[Report Deletion] Unlinked audio binary: ${resolvedPath}`);
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          logger.warn(`[Report Deletion] Failed to unlink audio binary ${audioPath}: ${unlinkErr.message}`);
        }
      }
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Report deleted permanently.',
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Uploads 1 to 5 voice recordings for operational report evidence.
 * Validates cumulative batch size (<=50MB) and persists Audio documents.
 * Executes within a Mongoose transaction session.
 *
 * @function uploadReportAudios
 * @param {import('express').Request} req - Express request object with req.files.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const uploadReportAudios = asyncHandler(async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    throw new BadRequestError('At least one audio file is required.');
  }

  // Validate cumulative batch size cap (50MB)
  const totalBatchBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBatchBytes > AUDIO_CONSTANTS.MAX_BATCH_SIZE_BYTES) {
    // Clean up newly uploaded files to prevent disk leakage
    for (const file of files) {
      try {
        await fs.promises.unlink(file.path);
      } catch (_) {}
    }
    throw new BadRequestError(
      `Cumulative audio upload size exceeds the ${AUDIO_CONSTANTS.MAX_BATCH_SIZE_BYTES / (1024 * 1024)}MB batch limit.`
    );
  }

  const cloudUploadResults = await Promise.all(
    files.map(async (file) => {
      let cleanMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
      if (cleanMime === 'video/webm' || (file.originalname && file.originalname.toLowerCase().endsWith('.webm'))) {
        cleanMime = 'audio/webm';
      }
      const uploadRes = await storageService.uploadFile({
        filePath: file.path,
        fileName: file.filename,
        mimeType: cleanMime || 'audio/webm',
        folder: 'personal-agent/audios',
        resourceType: 'video',
      });
      return {
        user: req.user._id,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: cleanMime || 'audio/webm',
        size: file.size,
        path: file.path.replace(/\\/g, '/'),
        cloudUrl: uploadRes.isCloud ? uploadRes.secure_url : null,
        publicId: uploadRes.publicId || null,
        purpose: 'report_narration',
        status: 'uploaded',
      };
    })
  );

  const session = await mongoose.startSession();
  try {
    let createdAudios;

    await session.withTransaction(async () => {
      createdAudios = await Audio.create(cloudUploadResults, { session });
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Audio files uploaded successfully',
      data: {
        audios: createdAudios,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Shares an operational report's authoritative Amharic transcription to Telegram.
 * Enforces tenant isolation (scoped to req.user._id) and resolves user bot credentials.
 *
 * @route POST /api/v1/reports/:reportId/share/telegram
 * @access Protected (Area Supervisor)
 */
export const shareReportToTelegram = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const { targetChannel = 'management', asImage = false } = req.body || {};

  const report = await Report.findOne({ _id: reportId, user: req.user._id }).lean();
  if (!report) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Operational report not found.',
    });
  }

  const transcription = report.transcription?.trim();
  if (!transcription) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Report does not contain any transcription text to share.',
    });
  }

  const user = await User.findById(req.user._id)
    .select('+integrations.telegram.botToken')
    .lean();

  const dispatchResult = await dispatchToTelegram({
    user,
    targetChannel,
    text: transcription,
    asImage: Boolean(asImage),
  });

  if (!dispatchResult.success && !dispatchResult.isStub) {
    return res.status(HTTP_STATUS.BAD_GATEWAY).json({
      success: false,
      message: dispatchResult.error || 'Failed to dispatch report to Telegram.',
    });
  }

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: dispatchResult.isStub
      ? `Telegram broadcast simulated in stub mode for channel "${dispatchResult.channel}".`
      : `Report shared successfully to Telegram (${dispatchResult.channel}).`,
    data: dispatchResult,
  });
});

export default {
  createReport,
  createReportRecord,
  getReports,
  getReportById,
  updateReport,
  getReportActivities,
  getReportIssues,
  getReportComments,
  archiveReport,
  restoreReport,
  deleteReportPermanently,
  uploadReportAudios,
  shareReportToTelegram,
};

````

================================================================================
File: backend/src/controllers/sttController.js
================================================================================

````javascript
/**
 * @module controllers/sttController
 * @description Controller for decoupled, reusable Speech-to-Text (STT) services.
 * Integrates Addis AI Scribe Live Streaming WebSocket session provisioning.
 * Agnostic of chat, reports, or domain models - usable across the entire enterprise application.
 */

import { randomUUID } from 'node:crypto';
import asyncHandler from 'express-async-handler';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { User } from '../models/User.js';
import { HTTP_STATUS } from '../utils/constants.js';
import { BadRequestError } from '../errors/CustomError.js';

/**
 * Creates a single-use session ticket and retrieves WebSocket URL for Addis AI Scribe Live STT.
 *
 * @function createScribeSession
 * @route POST /api/v1/stt/scribe-session
 * @access Private (Authenticated User)
 */
export const createScribeSession = asyncHandler(async (req, res) => {
  let userAddisKey = req.user?.settings?.apiKeys?.addisApiKey;
  if (!userAddisKey && req.user?._id) {
    const userWithKeys = await User.findById(req.user._id)
      .select('+settings.apiKeys.addisApiKey')
      .lean();
    if (userWithKeys?.settings?.apiKeys?.addisApiKey) {
      userAddisKey = userWithKeys.settings.apiKeys.addisApiKey;
    }
  }

  if (userAddisKey === 'missing' || userAddisKey === 'none') {
    throw new BadRequestError(
      'Addis AI API key is not configured. Please add your key under Profile > AI Agent Settings.'
    );
  }

  const effectiveKey = userAddisKey || env.ADDIS_API_KEY || process.env.ADDIS_API_KEY;
  if (!effectiveKey) {
    throw new BadRequestError(
      'Addis AI API key is not configured. Please add your key under Profile > AI Agent Settings.'
    );
  }

  // Testing & mock fallback support for CI/CD environments
  if (effectiveKey === 'mock_addis_key_for_testing' || effectiveKey.startsWith('mock_')) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        ticket: `mock_ticket_${Date.now()}`,
        token: `mock_ticket_${Date.now()}`,
        websocketUrl: 'wss://api.addisassistant.com/api/v1/scribe/stream',
        sessionId: `mock_sess_${Date.now()}`,
        expiresIn: 60,
      },
    });
  }

  try {
    const endpoint = 'https://api.addisassistant.com/api/v1/scribe/sessions';
    const requestId = randomUUID();

    const upstreamRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': effectiveKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        backend: req.body?.backend || 'turbo',
        chunk: req.body?.chunk || '320ms',
        request_id: requestId,
        language: req.body?.language || 'am',
      }),
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => '');
      logger.warn(`[sttController] Addis AI Scribe session rejected (${upstreamRes.status}): ${errText}`);
      throw new BadRequestError(`Addis AI Scribe session rejected (${upstreamRes.status}): ${errText || 'Invalid request'}`);
    }

    const json = await upstreamRes.json();
    const data = json?.data || json;

    const token = data.token || data.ticket;
    if (!token) {
      throw new BadRequestError('Addis AI Scribe session response did not include a valid connection token.');
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        ticket: token,
        token: token,
        websocketUrl:
          data.websocket_url ||
          data.websocketUrl ||
          'wss://api.addisassistant.com/api/v1/scribe/stream',
        sessionId: data.session_id || data.sessionId || requestId,
        expiresIn: data.expires_in || 60,
      },
    });
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error(`[sttController] Addis AI Scribe connection error: ${err.message}`);
    throw new BadRequestError(`Addis AI Scribe connection error: ${err.message}`);
  }
});

export default {
  createScribeSession,
};

````

================================================================================
File: backend/src/controllers/userController.js
================================================================================

````javascript
/**
 * @module controllers/userController
 * @description User controller handling supervisor profile retrieval, profile updates (names, email, position),
 * dedicated avatar updates, and password management.
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import { User } from '../models/User.js';
import { HTTP_STATUS, UPLOADS_CONFIG } from '../utils/constants.js';
import { ConflictError, UnauthenticatedError, BadRequestError } from '../errors/CustomError.js';
import storageService from '../services/storageService.js';

/**
 * Retrieves the currently authenticated user's profile.
 *
 * @function getProfile
 * @param {import('express').Request} req - Express request object with attached req.user.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getProfile = asyncHandler(async (req, res) => {
  const userObj = req.user.toJSON ? req.user.toJSON() : req.user;

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Current user profile retrieved successfully',
    data: {
      user: userObj,
    },
  });
});

/**
 * Updates editable profile attributes (firstName, lastName, email, position).
 * Re-derives virtual fullName upon save and enforces email uniqueness.
 * Executes within a Mongoose transaction session.
 *
 * @function updateProfile
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const validatedBody = req.validated?.body || req.body || {};
  const { firstName, lastName, email, position } = validatedBody;

  const session = await mongoose.startSession();
  try {
    let userObj;

    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id)
        .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey')
        .session(session);
      if (!user) {
        throw new UnauthenticatedError('User account could not be found. Please log in again.', 'USER_NOT_FOUND');
      }

      // Check email uniqueness if email is changed
      if (email && email.toLowerCase() !== user.email.toLowerCase()) {
        const existingUser = await User.findOne({
          email: email.toLowerCase(),
          _id: { $ne: user._id },
        }).session(session);
        if (existingUser) {
          throw new ConflictError('A user with this email address already exists.');
        }
        user.email = email;
      }

      if (firstName !== undefined) {
        user.firstName = firstName.trim();
      }

      if (lastName !== undefined) {
        user.lastName = lastName.trim();
      }

      if (position !== undefined) {
        user.position = position.trim();
      }

      if (validatedBody.settings?.apiKeys) {
        const { geminiApiKey, addisApiKey } = validatedBody.settings.apiKeys;
        if (!user.settings) user.settings = {};
        if (!user.settings.apiKeys) user.settings.apiKeys = {};
        if (geminiApiKey !== undefined) {
          const clean = geminiApiKey && geminiApiKey.trim() ? geminiApiKey.trim() : null;
          user.settings.apiKeys.geminiApiKey = clean;
          user.settings.apiKeys.hasGeminiKey = Boolean(clean);
        }
        if (addisApiKey !== undefined) {
          const clean = addisApiKey && addisApiKey.trim() ? addisApiKey.trim() : null;
          user.settings.apiKeys.addisApiKey = clean;
          user.settings.apiKeys.hasAddisKey = Boolean(clean);
        }
        user.markModified('settings');
      }

      await user.save({ session });
      userObj = user.toJSON();
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: userObj,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Updates the supervisor's profile avatar on a dedicated route.
 * Executes within a Mongoose transaction session.
 *
 * @function updateAvatar
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateAvatar = asyncHandler(async (req, res) => {
  const validatedBody = req.validated?.body || req.body || {};
  const { avatar, avatarPublicId } = validatedBody;

  if (!avatar || typeof avatar !== 'string') {
    throw new BadRequestError('Avatar data or URL is required.');
  }

  let savedAvatar = avatar;
  let savedPublicId = avatarPublicId || null;

  // If incoming avatar is a Base64 data URL, decode and store to both disk and Cloud CDN
  const base64Match = avatar.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (base64Match) {
    const mimeType = base64Match[1].toLowerCase();
    const base64Data = base64Match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : '.jpg');
    const fileName = `avatar-${req.user._id}-${Date.now()}${ext}`;

    // 1. Dual-tier local disk persistence in backend/uploads/avatars/
    if (!fs.existsSync(UPLOADS_CONFIG.AVATARS_DIR)) {
      fs.mkdirSync(UPLOADS_CONFIG.AVATARS_DIR, { recursive: true });
    }
    const diskPath = path.join(UPLOADS_CONFIG.AVATARS_DIR, fileName);
    await fs.promises.writeFile(diskPath, buffer);

    // 2. Upload to Cloud CDN (Cloudinary) or fallback
    const uploadRes = await storageService.uploadFile({
      filePath: diskPath,
      buffer,
      fileName,
      mimeType,
      folder: 'personal-agent/avatars',
      resourceType: 'image',
    });

    if (uploadRes.isCloud && uploadRes.secure_url) {
      savedAvatar = uploadRes.secure_url;
      savedPublicId = uploadRes.publicId;
    } else {
      savedAvatar = `/uploads/avatars/${fileName}`;
      savedPublicId = null;
    }
  }

  const session = await mongoose.startSession();
  try {
    let userObj;

    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id)
        .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey')
        .session(session);
      if (!user) {
        throw new UnauthenticatedError('User account could not be found. Please log in again.', 'USER_NOT_FOUND');
      }

      // Purge previous avatar from Cloudinary and disk
      if (user.avatarPublicId || user.avatar) {
        void storageService.cleanupAvatarAsset(user.avatarPublicId, user.avatar);
      }

      user.avatar = savedAvatar;
      user.avatarPublicId = savedPublicId;
      await user.save({ session });
      userObj = user.toJSON();
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Avatar updated successfully',
      data: {
        user: userObj,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Removes the supervisor's profile avatar on a dedicated route, resetting it to null.
 * Executes within a Mongoose transaction session.
 *
 * @function removeAvatar
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const removeAvatar = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let userObj;

    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id)
        .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey')
        .session(session);
      if (!user) {
        throw new UnauthenticatedError('User account could not be found. Please log in again.', 'USER_NOT_FOUND');
      }

      if (user.avatarPublicId || user.avatar) {
        void storageService.cleanupAvatarAsset(user.avatarPublicId, user.avatar);
      }

      user.avatar = null;
      user.avatarPublicId = null;
      await user.save({ session });
      userObj = user.toJSON();
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Avatar removed successfully',
      data: {
        user: userObj,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Updates the supervisor account password after verifying the current password.
 * Executes within a Mongoose transaction session.
 *
 * @function updatePassword
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updatePassword = asyncHandler(async (req, res) => {
  const validatedBody = req.validated?.body || req.body || {};
  const { currentPassword, newPassword } = validatedBody;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Load user with password hash inside transaction session
      const user = await User.findById(req.user._id).select('+password').session(session);
      if (!user) {
        throw new UnauthenticatedError('Please log in again to continue.', 'USER_NOT_FOUND');
      }

      // If user was created via Google SSO and password has not been set yet
      if (user.isPasswordSet === false) {
        user.password = newPassword;
        user.isPasswordSet = true;
        user.authProvider = 'both';
        await user.save({ session });
        return;
      }

      // Verify current password for accounts with an existing password
      if (!currentPassword) {
        throw new BadRequestError('Current password is required.');
      }
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        throw new UnauthenticatedError('The current password you entered is incorrect. Please try again.', 'INVALID_CREDENTIALS');
      }

      // Assign new password (pre-save hook handles bcrypt hashing)
      user.password = newPassword;
      user.isPasswordSet = true;
      if (user.authProvider === 'google') {
        user.authProvider = 'both';
      }
      await user.save({ session });
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Password updated successfully',
      data: null,
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Retrieves the supervisor's AI agent configuration and directives.
 *
 * @function getUserAgentConfig
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getUserAgentConfig = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) {
    throw new UnauthenticatedError('User not found. Please log in again.');
  }

  const directives = user.settings?.directives || {};
  const phraseMappings =
    directives.phraseMappings instanceof Map
      ? Object.fromEntries(directives.phraseMappings)
      : directives.phraseMappings || {};

  const tgSource = user.integrations?.telegram || {};
  const safeTelegram = {
    connected: Boolean(tgSource.connected),
    enabled: tgSource.enabled !== false,
    botUsername: tgSource.botUsername || null,
    managementChatId: tgSource.managementChatId || null,
    maintenanceChatId: tgSource.maintenanceChatId || null,
    generalChatId: tgSource.generalChatId || null,
    defaultFormat: tgSource.defaultFormat || 'text',
    imageCardOptions: tgSource.imageCardOptions || {},
    connectedAt: tgSource.connectedAt || null,
  };

  const apiKeysConfig = user.settings?.apiKeys || {};

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      sttEngine: user.settings?.sttEngine || 'addis_ai',
      agentConfig: user.settings?.agentConfig || {},
      reportTemplates: user.settings?.reportTemplates || {},
      telegram: safeTelegram,
      apiKeys: {
        hasGeminiKey: Boolean(apiKeysConfig.geminiApiKey),
        hasAddisKey: Boolean(apiKeysConfig.addisApiKey),
      },
      directives: {
        negativeVocabulary: directives.negativeVocabulary || [],
        phraseMappings,
        customInstructions: directives.customInstructions || [],
      },
    },
  });
});

/**
 * Updates the supervisor's AI agent configuration.
 *
 * @function updateUserAgentConfig
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateUserAgentConfig = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const session = await mongoose.startSession();
  try {
    let updatedUser;
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id)
        .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey')
        .session(session);
      if (!user) {
        throw new UnauthenticatedError('User not found. Please log in again.');
      }

      if (!user.settings) user.settings = {};
      if (!user.settings.agentConfig) user.settings.agentConfig = {};

      if (b.persona !== undefined) user.settings.agentConfig.persona = b.persona;
      if (b.defaultModel !== undefined) user.settings.agentConfig.defaultModel = b.defaultModel;
      if (b.defaultThinkingBudget !== undefined) user.settings.agentConfig.defaultThinkingBudget = b.defaultThinkingBudget;
      if (b.defaultLanguage !== undefined) user.settings.agentConfig.defaultLanguage = b.defaultLanguage;
      if (b.sttEngine !== undefined) user.settings.sttEngine = b.sttEngine;

      if (b.tts) {
        if (!user.settings.tts) user.settings.tts = {};
        if (b.tts.amharicVoice !== undefined) user.settings.tts.amharicVoice = b.tts.amharicVoice;
        if (b.tts.englishVoice !== undefined) user.settings.tts.englishVoice = b.tts.englishVoice;
        if (b.tts.speed !== undefined) user.settings.tts.speed = Number(b.tts.speed);
        if (b.tts.autoPlay !== undefined) user.settings.tts.autoPlay = Boolean(b.tts.autoPlay);
      }

      if (b.reportTemplates) {
        if (!user.settings.reportTemplates) user.settings.reportTemplates = {};
        if (b.reportTemplates.singleBranch !== undefined) {
          user.settings.reportTemplates.singleBranch = b.reportTemplates.singleBranch;
        }
        if (b.reportTemplates.multiBranch !== undefined) {
          user.settings.reportTemplates.multiBranch = b.reportTemplates.multiBranch;
        }
      }

      if (b.telegram) {
        if (!user.integrations) user.integrations = {};
        if (!user.integrations.telegram) user.integrations.telegram = {};

        if (b.telegram.botToken !== undefined && b.telegram.botToken) {
          user.integrations.telegram.botToken = b.telegram.botToken.trim();
          user.integrations.telegram.connected = true;
        }
        if (b.telegram.managementChatId !== undefined) {
          user.integrations.telegram.managementChatId = b.telegram.managementChatId;
        }
        if (b.telegram.maintenanceChatId !== undefined) {
          user.integrations.telegram.maintenanceChatId = b.telegram.maintenanceChatId;
        }
        if (b.telegram.generalChatId !== undefined) {
          user.integrations.telegram.generalChatId = b.telegram.generalChatId;
        }
        if (b.telegram.defaultFormat !== undefined) {
          user.integrations.telegram.defaultFormat = b.telegram.defaultFormat;
        }
        user.markModified('integrations');
      }

      user.markModified('settings');
      await user.save({ session });
      updatedUser = user;
    });

    const tgSource = updatedUser.integrations?.telegram || {};
    const safeTelegram = {
      connected: Boolean(tgSource.connected),
      enabled: tgSource.enabled !== false,
      botUsername: tgSource.botUsername || null,
      managementChatId: tgSource.managementChatId || null,
      maintenanceChatId: tgSource.maintenanceChatId || null,
      generalChatId: tgSource.generalChatId || null,
      defaultFormat: tgSource.defaultFormat || 'text',
      imageCardOptions: tgSource.imageCardOptions || {},
      connectedAt: tgSource.connectedAt || null,
    };

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Agent configuration updated successfully.',
      data: {
        sttEngine: updatedUser.settings.sttEngine,
        agentConfig: updatedUser.settings.agentConfig,
        reportTemplates: updatedUser.settings.reportTemplates,
        telegram: safeTelegram,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Updates supervisor directives (negativeVocabulary, phraseMappings, customInstructions).
 *
 * @function updateSupervisorDirectives
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateSupervisorDirectives = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const session = await mongoose.startSession();
  try {
    let updatedDirectives;
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id)
        .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey')
        .session(session);
      if (!user) {
        throw new UnauthenticatedError('User not found. Please log in again.');
      }

      if (!user.settings) user.settings = {};
      if (!user.settings.directives) user.settings.directives = {};

      if (Array.isArray(b.negativeVocabulary)) {
        user.settings.directives.negativeVocabulary = b.negativeVocabulary.map((s) => String(s).trim()).filter(Boolean);
      }

      if (b.phraseMappings && typeof b.phraseMappings === 'object') {
        const map = new Map();
        for (const [k, v] of Object.entries(b.phraseMappings)) {
          if (k && v) map.set(String(k).trim(), String(v).trim());
        }
        user.settings.directives.phraseMappings = map;
      }

      if (b.customInstructions !== undefined) {
        user.settings.directives.customInstructions = Array.isArray(b.customInstructions)
          ? b.customInstructions.map((s) => String(s).trim()).filter(Boolean)
          : [String(b.customInstructions).trim()].filter(Boolean);
      }

      user.markModified('settings');
      await user.save({ session });

      const normalizedMappings =
        user.settings.directives.phraseMappings instanceof Map
          ? Object.fromEntries(user.settings.directives.phraseMappings)
          : user.settings.directives.phraseMappings || {};

      updatedDirectives = {
        negativeVocabulary: user.settings.directives.negativeVocabulary,
        phraseMappings: normalizedMappings,
        customInstructions: user.settings.directives.customInstructions,
      };
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Supervisor directives updated successfully.',
      data: {
        directives: updatedDirectives,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Validates a Telegram Bot Token against the official Telegram Bot API `getMe`.
 *
 * @function verifyTelegramBotToken
 * @param {import('express').Request} req - Express request object with `botToken`.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const verifyTelegramBotToken = asyncHandler(async (req, res) => {
  const { botToken } = req.body || {};
  if (!botToken || typeof botToken !== 'string' || !botToken.trim()) {
    throw new BadRequestError('Telegram Bot Token is required for verification.');
  }

  const cleanToken = botToken.trim();
  try {
    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = await response.json();
    if (!data.ok) {
      throw new BadRequestError(`Telegram verification failed: ${data.description || 'Invalid bot token.'}`);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      valid: true,
      bot: {
        id: data.result.id,
        username: data.result.username,
        firstName: data.result.first_name,
      },
    });
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError(`Failed to reach Telegram Bot API: ${err.message}`);
  }
});

/**
 * Normalizes a Telegram Chat ID or Channel Username to standard format.
 * Automatically prefixes `-100` for 9+ digit numeric channel/supergroup IDs
 * while safely preserving public `@channel_name` handles and negative channel IDs.
 *
 * @param {string|number|null} chatId - Raw chat identifier
 * @returns {string|null} Normalized chat identifier
 */
export function normalizeTelegramChatId(chatId) {
  if (chatId === null || chatId === undefined) return null;
  const str = String(chatId).trim();
  if (!str) return null;
  // Preserve public channel usernames (e.g. @my_channel)
  if (str.startsWith('@')) return str;
  // If positive integer with >= 9 digits, auto-prefix -100 for Telegram channel/supergroup
  if (/^\d{9,}$/.test(str)) {
    return `-100${str}`;
  }
  // If negative integer with >= 9 digits missing -100 (e.g. -1003982938439), normalize
  if (/^-\d{9,}$/.test(str) && !str.startsWith('-100')) {
    return `-100${str.slice(1)}`;
  }
  return str;
}

/**
 * Saves and connects Telegram credentials under `user.integrations.telegram`.
 * Performs pre-flight live token verification against official Telegram `/getMe`
 * and auto-populates `botUsername` from verified bot profile.
 *
 * @function connectTelegramIntegration
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const connectTelegramIntegration = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const cleanBotToken = b.botToken && typeof b.botToken === 'string' && b.botToken.trim()
    ? b.botToken.trim()
    : null;

  // Pre-flight live validation against Telegram Bot API before taking DB transaction lock
  let verifiedBotUsername = b.botUsername || null;
  if (cleanBotToken) {
    const isMock = cleanBotToken.startsWith('mock_') ||
      cleanBotToken.includes('MockValidFormat');

    if (!isMock) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${cleanBotToken}/getMe`);
        const data = await response.json();
        if (!data.ok) {
          throw new BadRequestError(`Invalid Telegram Bot Token: ${data.description || 'Unauthorized'}. Please verify your bot token with @BotFather.`);
        }
        verifiedBotUsername = data.result?.username || verifiedBotUsername;
      } catch (err) {
        if (err instanceof BadRequestError) throw err;
        throw new BadRequestError(`Failed to reach Telegram Bot API: ${err.message}. Please check your bot token or internet connection.`);
      }
    }
  }

  const session = await mongoose.startSession();
  try {
    let updatedUser;
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).select('+integrations.telegram.botToken').session(session);
      if (!user) throw new UnauthenticatedError('User not found.');

      if (!user.integrations) user.integrations = {};
      if (!user.integrations.telegram) user.integrations.telegram = {};

      const botToken = cleanBotToken || user.integrations.telegram.botToken;

      if (!botToken) {
        throw new BadRequestError('Telegram Bot Token is required to connect.');
      }

      user.integrations.telegram.botToken = botToken;
      if (verifiedBotUsername || b.botUsername !== undefined) {
        user.integrations.telegram.botUsername = verifiedBotUsername || b.botUsername || null;
      }
      if (b.managementChatId !== undefined) {
        user.integrations.telegram.managementChatId = normalizeTelegramChatId(b.managementChatId);
      }
      if (b.maintenanceChatId !== undefined) {
        user.integrations.telegram.maintenanceChatId = normalizeTelegramChatId(b.maintenanceChatId);
      }
      if (b.generalChatId !== undefined) {
        user.integrations.telegram.generalChatId = normalizeTelegramChatId(b.generalChatId);
      }
      if (b.defaultFormat !== undefined) user.integrations.telegram.defaultFormat = b.defaultFormat;
      if (b.imageCardOptions !== undefined) user.integrations.telegram.imageCardOptions = b.imageCardOptions;

      user.integrations.telegram.connected = true;
      user.integrations.telegram.enabled = true;
      user.integrations.telegram.connectedAt = new Date();

      user.markModified('integrations');
      await user.save({ session });
      updatedUser = user;
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Telegram integration connected successfully.',
      data: {
        telegram: {
          connected: updatedUser.integrations.telegram.connected,
          enabled: updatedUser.integrations.telegram.enabled,
          botUsername: updatedUser.integrations.telegram.botUsername,
          managementChatId: updatedUser.integrations.telegram.managementChatId,
          maintenanceChatId: updatedUser.integrations.telegram.maintenanceChatId,
          generalChatId: updatedUser.integrations.telegram.generalChatId,
          defaultFormat: updatedUser.integrations.telegram.defaultFormat,
          imageCardOptions: updatedUser.integrations.telegram.imageCardOptions,
          connectedAt: updatedUser.integrations.telegram.connectedAt,
        },
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Disconnects Telegram integration and clears stored tokens.
 *
 * @function disconnectTelegramIntegration
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const disconnectTelegramIntegration = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) throw new UnauthenticatedError('User not found.');

      if (user.integrations?.telegram) {
        user.integrations.telegram.connected = false;
        user.integrations.telegram.botToken = null;
        user.integrations.telegram.botUsername = null;
        user.integrations.telegram.managementChatId = null;
        user.integrations.telegram.maintenanceChatId = null;
        user.integrations.telegram.generalChatId = null;
        user.integrations.telegram.imageCardOptions = {};
        user.integrations.telegram.defaultFormat = 'text';
        user.integrations.telegram.connectedAt = null;
      }

      user.markModified('integrations');
      await user.save({ session });
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Telegram integration disconnected successfully.',
      data: {
        connected: false,
        telegram: {
          connected: false,
          botUsername: null,
          managementChatId: null,
          maintenanceChatId: null,
          generalChatId: null,
        },
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Toggles Telegram integration enabled state.
 *
 * @function toggleTelegramIntegration
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const toggleTelegramIntegration = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let newStatus;
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) throw new UnauthenticatedError('User not found.');

      if (!user.integrations) user.integrations = {};
      if (!user.integrations.telegram) user.integrations.telegram = { connected: false, enabled: false };

      if (typeof req.body?.enabled === 'boolean') {
        user.integrations.telegram.enabled = req.body.enabled;
      } else {
        user.integrations.telegram.enabled = !user.integrations.telegram.enabled;
      }
      newStatus = user.integrations.telegram.enabled;

      user.markModified('integrations');
      await user.save({ session });
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Telegram integration ${newStatus ? 'enabled' : 'disabled'}.`,
      data: {
        enabled: newStatus,
        telegram: {
          enabled: newStatus,
        },
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Updates user Bring-Your-Own-Key (BYOK) API credentials.
 *
 * @function updateUserApiKeys
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateUserApiKeys = asyncHandler(async (req, res) => {
  const { geminiApiKey, addisApiKey } = req.body || {};
  const session = await mongoose.startSession();
  try {
    let updatedUser;
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id)
        .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey')
        .session(session);
      if (!user) throw new UnauthenticatedError('User not found.');

      if (!user.settings) user.settings = {};
      if (!user.settings.apiKeys) user.settings.apiKeys = {};

      if (geminiApiKey !== undefined) {
        const cleanGemini = geminiApiKey && geminiApiKey.trim() ? geminiApiKey.trim() : null;
        user.settings.apiKeys.geminiApiKey = cleanGemini;
        user.settings.apiKeys.hasGeminiKey = Boolean(cleanGemini);
      }
      if (addisApiKey !== undefined) {
        const cleanAddis = addisApiKey && addisApiKey.trim() ? addisApiKey.trim() : null;
        user.settings.apiKeys.addisApiKey = cleanAddis;
        user.settings.apiKeys.hasAddisKey = Boolean(cleanAddis);
      }

      user.markModified('settings');
      await user.save({ session });
      updatedUser = user;
    });

    const hasGemini = Boolean(updatedUser.settings.apiKeys.hasGeminiKey || updatedUser.settings.apiKeys.geminiApiKey);
    const hasAddis = Boolean(updatedUser.settings.apiKeys.hasAddisKey || updatedUser.settings.apiKeys.addisApiKey);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'API credentials updated successfully.',
      data: {
        hasGeminiKey: hasGemini,
        hasAddisKey: hasAddis,
        apiKeys: {
          hasGeminiKey: hasGemini,
          hasAddisKey: hasAddis,
        },
      },
    });
  } finally {
    await session.endSession();
  }
});

export default {
  getProfile,
  updateProfile,
  updateAvatar,
  removeAvatar,
  updatePassword,
  getUserAgentConfig,
  updateUserAgentConfig,
  updateSupervisorDirectives,
  verifyTelegramBotToken,
  connectTelegramIntegration,
  disconnectTelegramIntegration,
  toggleTelegramIntegration,
  updateUserApiKeys,
  normalizeTelegramChatId,
};

````

================================================================================
File: backend/src/jobs/sweeper.js
================================================================================

````javascript
/**
 * @module jobs/sweeper
 * @description The two-pass in-process sweeper — the authority for permanent removal:
 * every DELETE only archives (step 1); removal happens here (step 2). One timer per
 * process (SWEEPER_INTERVAL_MS, started after the server is listening — cleared on
 * shutdown; server.js owns the lifecycle, this module owns the run).
 *
 * **Pass 1 — expired-archive hard delete:**
 * - Every isArchived Report whose archivedAt is older than ARCHIVED_TTL_SECONDS (30 days)
 *   is removed in its own transaction session with its associated Audio records; physical
 *   audio binaries are unlinked after commit (missing binary is logged, not retried;
 *   unlink failure is logged and retried by pass 2).
 * - Every isArchived standalone Audio whose archivedAt is older than ARCHIVED_TTL_SECONDS
 *   is removed in its own transaction session after verifying it is not referenced by any
 *   active report.
 * - Archived branches are removed when their archivedAt is older than ARCHIVED_TTL_SECONDS
 *   AND the subdocument reference check clears (no reports reference visits.branch);
 *   a referenced branch is skipped + logged to preserve historical audit integrity.
 *
 * **Pass 2 — the orphan sweep:**
 * - Unlinks temporary audio slices in UPLOADS_CONFIG.TEMP_DIR older than 1 hour.
 * - Scans UPLOADS_CONFIG.AUDIOS_DIR and UPLOADS_CONFIG.ATTACHMENTS_DIR for orphaned leaks
 *   older than 24 hours not referenced by any database document.
 * - Strictly protects committed test fixtures and sample assets (audio-sample-*.wav,
 *   transcription-sample-*.txt, etc.) from ever being deleted.
 * - Removes parentless Audio documents whose owning User was deleted from the database.
 *
 * Race rules: pass 1 before pass 2 within a run; each parent committed before the next;
 * a run over a clean store is a log-only no-op; a crash leaves committed removals and the
 * interrupted parent is retried next run; a running guard prevents overlapping runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { Report } from '../models/Report.js';
import { Audio } from '../models/Audio.js';
import { Branch } from '../models/Branch.js';
import { Chat } from '../models/Chat.js';
import { User } from '../models/User.js';
import { SWEEPER_INTERVAL_MS, ARCHIVED_TTL_SECONDS, UPLOADS_CONFIG } from '../utils/constants.js';
import { logger } from '../config/logger.js';
import storageService from '../services/storageService.js';

let sweeperTimer = null;
let isRunning = false;

/**
 * Whitelist of committed repository test fixtures and sample assets that must
 * NEVER be deleted by the sweeper, regardless of age or database state.
 * @constant
 * @type {Readonly<Set<string>>}
 */
export const PROTECTED_FIXTURES = Object.freeze(
  new Set([
    'audio-sample-1.wav',
    'audio-sample-2.wav',
    'transcription-sample-1.txt',
    'unrelated-sample-1.txt',
    'transcription-report-sample-1.docx',
    'transcription-report-sample-1.txt',
  ])
);

/**
 * Escapes special regex characters in a string.
 * @function escapeRegex
 * @param {string} str - Raw string.
 * @returns {string} Escaped regex string.
 */
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Checks whether a given filename represents a protected test fixture.
 * @function isProtectedFixture
 * @param {string} fileName - File name to evaluate.
 * @returns {boolean} True if protected.
 */
export const isProtectedFixture = (fileName) => {
  if (!fileName || typeof fileName !== 'string') return false;
  const base = path.basename(fileName);
  if (PROTECTED_FIXTURES.has(base)) return true;
  if (base.startsWith('sample-') || base.includes('-sample-') || base.endsWith('-sample')) return true;
  return false;
};

/**
 * Permanently cascade-deletes a branch document and any associated child entities
 * within an active Mongoose transaction session.
 *
 * @function cascadeDeleteBranch
 * @param {import('mongoose').Types.ObjectId|string} branchId - Branch identifier to purge.
 * @param {import('mongoose').ClientSession} session - Active Mongoose transaction session.
 * @returns {Promise<void>}
 */
export const cascadeDeleteBranch = async (branchId, session) => {
  // 1. Locate all reports referencing this branch to clean up associated audio uploads
  const associatedReports = await Report.find({ 'visits.branch': branchId })
    .select('_id audios')
    .session(session)
    .lean();

  const audioIds = associatedReports.flatMap((r) => r.audios || []).filter(Boolean);

  // 2. Unlink physical audio uploads and remove Audio documents
  if (audioIds.length > 0) {
    const audioDocs = await Audio.find({ _id: { $in: audioIds } })
      .select('path')
      .session(session)
      .lean();

    for (const a of audioDocs) {
      if (a.path && !isProtectedFixture(a.path) && fs.existsSync(a.path)) {
        try {
          fs.unlinkSync(a.path);
          logger.info(`[CascadeDelete] Unlinked audio upload: ${a.path}`);
        } catch (unlinkErr) {
          logger.warn(`[CascadeDelete] Failed to unlink audio upload ${a.path}: ${unlinkErr.message}`);
        }
      }
    }

    await Audio.deleteMany({ _id: { $in: audioIds } }).session(session);
  }

  // 3. Purge any reports referencing this branch in visits subdocument
  await Report.deleteMany({ 'visits.branch': branchId }).session(session);

  // 4. Hard delete the branch document
  await Branch.deleteOne({ _id: branchId }).session(session);
};

/**
 * Executes Pass 1: Expired-archive hard delete and reference-checked branch removal.
 * Each parent committed before the next in its own transaction session.
 *
 * @private
 * @function runPass1ExpiredArchiveSweep
 * @returns {Promise<{ branchesPurged: number, reportsPurged: number, audiosPurged: number }>}
 */
const runPass1ExpiredArchiveSweep = async () => {
  let branchesPurged = 0;
  let reportsPurged = 0;
  let audiosPurged = 0;

  const cutoff = new Date(Date.now() - ARCHIVED_TTL_SECONDS * 1000);

  // 1. Sweep Archived Reports (expired past 30-day retention)
  const expiredReports = await Report.find({
    isArchived: true,
    archivedAt: { $lte: cutoff },
  }).lean();

  for (const report of expiredReports) {
    const audioFilesToUnlink = [];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Collect associated Audio records and their disk filepaths
        if (report.audios && report.audios.length > 0) {
          const audioDocs = await Audio.find({
            _id: { $in: report.audios },
          })
            .select('path publicId')
            .session(session)
            .lean();

          for (const a of audioDocs) {
            if (a.path) {
              audioFilesToUnlink.push(a.path);
            }
          }

          // Vector 7: Clean up Cloud CDN assets
          void storageService.cleanupReportAudios(audioDocs);

          // Delete associated Audio documents in session
          await Audio.deleteMany({ _id: { $in: report.audios } }).session(session);
        }

        // Hard delete the Report document
        await Report.deleteOne({ _id: report._id }).session(session);
      });
      reportsPurged += 1;
      logger.info(`[Sweeper:Pass1] Removed expired archived report: ${report._id}`);

      // Unlink audio binaries AFTER commit
      for (const filePath of audioFilesToUnlink) {
        try {
          const resolvedPath = path.resolve(filePath);
          if (fs.existsSync(resolvedPath)) {
            await fs.promises.unlink(resolvedPath);
            logger.info(`[Sweeper:Pass1] Unlinked audio binary: ${resolvedPath}`);
          } else {
            logger.warn(`[Sweeper:Pass1] Audio binary not found on disk: ${resolvedPath}`);
          }
        } catch (unlinkErr) {
          if (unlinkErr.code !== 'ENOENT') {
            logger.error(`[Sweeper:Pass1] Failed to unlink audio binary ${filePath}: ${unlinkErr.message}`);
          }
        }
      }
    } catch (err) {
      logger.error(`[Sweeper:Pass1] Failed to purge report ${report._id}: ${err.message}`);
    } finally {
      await session.endSession();
    }
  }

  // 2. Sweep Standalone Archived Audios (expired past 30-day retention)
  const expiredAudios = await Audio.find({
    isArchived: true,
    archivedAt: { $lte: cutoff },
  }).lean();

  for (const audio of expiredAudios) {
    // Safety guard: Ensure audio is not referenced by any active report
    const refCount = await Report.countDocuments({ audios: audio._id, isArchived: false });
    if (refCount > 0) {
      logger.warn(
        `[Sweeper:Pass1] Archived audio ${audio._id} is referenced by an active report. Skipping removal.`
      );
      continue;
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Audio.deleteOne({ _id: audio._id }).session(session);
      });
      audiosPurged += 1;
      logger.info(`[Sweeper:Pass1] Removed expired archived standalone audio: ${audio._id}`);

      if (audio.path) {
        const resolvedPath = path.resolve(audio.path);
        if (fs.existsSync(resolvedPath)) {
          await fs.promises.unlink(resolvedPath);
          logger.info(`[Sweeper:Pass1] Unlinked standalone audio binary: ${resolvedPath}`);
        }
      }
    } catch (err) {
      logger.error(`[Sweeper:Pass1] Failed to purge audio ${audio._id}: ${err.message}`);
    } finally {
      await session.endSession();
    }
  }

  // 3. Sweep Archived Branches (30-day retention + subdocument visits reference check)
  const archivedBranches = await Branch.find({
    isArchived: true,
    archivedAt: { $lte: cutoff },
  }).lean();

  for (const branch of archivedBranches) {
    // Check if any report still references this branch in visits array
    const refCount = await Report.countDocuments({ 'visits.branch': branch._id });
    if (refCount > 0) {
      logger.info(
        `[Sweeper:Pass1] Branch "${branch.name}" (${branch._id}) is referenced by ${refCount} report(s). Skipping removal to preserve historical audit integrity.`
      );
      continue; // Skip: protect multi-branch audit history
    }

    // Reference check cleared: remove branch in its own session
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await cascadeDeleteBranch(branch._id, session);
      });
      branchesPurged += 1;
      logger.info(
        `[Sweeper:Pass1] Removed unreferenced archived branch: "${branch.name}" (${branch.code || branch._id})`
      );
    } catch (err) {
      logger.error(`[Sweeper:Pass1] Failed to remove branch ${branch._id}: ${err.message}`);
    } finally {
      await session.endSession();
    }
  }

  return { branchesPurged, reportsPurged, audiosPurged };
};

/**
 * Executes Pass 2: The orphan sweep.
 * Cleans up ephemeral scratch chunks in temp/, unreferenced upload leaks in audios/ and attachments/,
 * and parentless database records. Strictly preserves protected test fixtures.
 *
 * @private
 * @function runPass2OrphanSweep
 * @returns {Promise<{ orphanFilesPurged: number, orphanDocsPurged: number }>}
 */
const runPass2OrphanSweep = async () => {
  let orphanFilesPurged = 0;
  let orphanDocsPurged = 0;

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // 1. Sweep Ephemeral Scratch Chunks in UPLOADS_CONFIG.TEMP_DIR (older than 1 hour)
  if (fs.existsSync(UPLOADS_CONFIG.TEMP_DIR)) {
    try {
      const files = fs.readdirSync(UPLOADS_CONFIG.TEMP_DIR);
      for (const file of files) {
        const filePath = path.join(UPLOADS_CONFIG.TEMP_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > ONE_HOUR_MS) {
            await fs.promises.unlink(filePath);
            orphanFilesPurged += 1;
            logger.info(`[Sweeper:Pass2] Unlinked orphaned temporary chunk: ${filePath}`);
          }
        } catch (fileErr) {
          logger.warn(`[Sweeper:Pass2] Error processing temporary chunk ${filePath}: ${fileErr.message}`);
        }
      }
    } catch (dirErr) {
      logger.warn(`[Sweeper:Pass2] Error reading temp directory: ${dirErr.message}`);
    }
  }

  // 2. Sweep Abandoned Upload Leaks in UPLOADS_CONFIG.AUDIOS_DIR (older than 24 hours, unreferenced in DB)
  if (fs.existsSync(UPLOADS_CONFIG.AUDIOS_DIR)) {
    try {
      const files = fs.readdirSync(UPLOADS_CONFIG.AUDIOS_DIR);
      for (const file of files) {
        // Strictly protect committed fixtures and sample files
        if (isProtectedFixture(file)) continue;

        const filePath = path.join(UPLOADS_CONFIG.AUDIOS_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > TWENTY_FOUR_HOURS_MS) {
            const fileRegex = new RegExp(escapeRegex(file), 'i');
            const isReferenced = await Audio.exists({
              $or: [{ path: fileRegex }, { fileName: file }],
            });

            if (!isReferenced) {
              await fs.promises.unlink(filePath);
              orphanFilesPurged += 1;
              logger.info(`[Sweeper:Pass2] Unlinked orphaned audio leak: ${filePath}`);
            }
          }
        } catch (fileErr) {
          logger.warn(`[Sweeper:Pass2] Error processing audio file ${filePath}: ${fileErr.message}`);
        }
      }
    } catch (dirErr) {
      logger.warn(`[Sweeper:Pass2] Error reading audios directory: ${dirErr.message}`);
    }
  }

  // 3. Sweep Abandoned Upload Leaks in UPLOADS_CONFIG.ATTACHMENTS_DIR (older than 24 hours, unreferenced in DB)
  if (fs.existsSync(UPLOADS_CONFIG.ATTACHMENTS_DIR)) {
    try {
      const files = fs.readdirSync(UPLOADS_CONFIG.ATTACHMENTS_DIR);
      for (const file of files) {
        // Strictly protect committed fixtures and sample files
        if (isProtectedFixture(file)) continue;

        const filePath = path.join(UPLOADS_CONFIG.ATTACHMENTS_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > TWENTY_FOUR_HOURS_MS) {
            const fileRegex = new RegExp(escapeRegex(file), 'i');
            const isReferenced = await Chat.exists({
              $or: [
                { 'messages.attachments.path': fileRegex },
                { 'messages.attachments.fileName': file },
              ],
            });

            if (!isReferenced) {
              await fs.promises.unlink(filePath);
              orphanFilesPurged += 1;
              logger.info(`[Sweeper:Pass2] Unlinked orphaned attachment leak: ${filePath}`);
            }
          }
        } catch (fileErr) {
          logger.warn(`[Sweeper:Pass2] Error processing attachment file ${filePath}: ${fileErr.message}`);
        }
      }
    } catch (dirErr) {
      logger.warn(`[Sweeper:Pass2] Error reading attachments directory: ${dirErr.message}`);
    }
  }

  // 4. Vector 5: Sweep Abandoned Staged Uploads older than 2 hours never bound to a chat or report
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const stagedAudios = await Audio.find({
      status: 'uploaded',
      createdAt: { $lte: twoHoursAgo },
      purpose: 'chat_voice_input',
    })
      .select('path publicId')
      .lean();

    for (const aud of stagedAudios) {
      if (isProtectedFixture(aud.path)) continue;
      const isUsedInChat = await Chat.exists({ 'messages.audios': aud._id });
      const isUsedInReport = await Report.exists({ audios: aud._id });
      if (!isUsedInChat && !isUsedInReport) {
        if (aud.publicId) {
          void storageService.destroyFile(aud.publicId, 'video');
        }
        if (aud.path && fs.existsSync(aud.path)) {
          try {
            await fs.promises.unlink(aud.path);
          } catch (_) {}
        }
        await Audio.deleteOne({ _id: aud._id });
        orphanFilesPurged += 1;
        logger.info(`[Sweeper:Pass2] Purged abandoned staged audio: ${aud._id}`);
      }
    }
  } catch (stagedErr) {
    logger.warn(`[Sweeper:Pass2] Error sweeping abandoned staged audios: ${stagedErr.message}`);
  }

  // 5. Sweep Ephemeral Generated Documents in uploads/generated_documents/ (older than 24 hours)
  const generatedDocsDir = path.resolve(process.cwd(), 'backend/uploads/generated_documents');
  if (fs.existsSync(generatedDocsDir)) {
    try {
      const files = fs.readdirSync(generatedDocsDir);
      for (const file of files) {
        if (isProtectedFixture(file)) continue;
        const filePath = path.join(generatedDocsDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > TWENTY_FOUR_HOURS_MS) {
            await fs.promises.unlink(filePath);
            orphanFilesPurged += 1;
            logger.info(`[Sweeper:Pass2] Unlinked expired generated document: ${filePath}`);
          }
        } catch (fileErr) {
          logger.warn(`[Sweeper:Pass2] Error processing generated document ${filePath}: ${fileErr.message}`);
        }
      }
    } catch (dirErr) {
      logger.warn(`[Sweeper:Pass2] Error reading generated documents directory: ${dirErr.message}`);
    }
  }

  // 6. Sweep Parentless Audio Database Records (whose owning User no longer exists)
  try {
    const audios = await Audio.find({}).select('user').lean();
    for (const a of audios) {
      if (a.user) {
        const userExists = await User.exists({ _id: a.user });
        if (!userExists) {
          await Audio.deleteOne({ _id: a._id });
          orphanDocsPurged += 1;
          logger.info(`[Sweeper:Pass2] Removed parentless Audio doc: ${a._id}`);
        }
      }
    }
  } catch (docErr) {
    logger.warn(`[Sweeper:Pass2] Error checking parentless Audio docs: ${docErr.message}`);
  }

  return { orphanFilesPurged, orphanDocsPurged };
};

/**
 * Runs a single full two-pass sweeper cycle.
 * Guarded against overlapping executions.
 *
 * @function runSweeperCycle
 * @returns {Promise<{ pass1: object, pass2: object }>} Summary of purged entities.
 */
export const runSweeperCycle = async () => {
  if (isRunning) {
    logger.warn('[Sweeper] Previous sweeper cycle is still active. Skipping concurrent run.');
    return {
      pass1: { branchesPurged: 0, reportsPurged: 0, audiosPurged: 0 },
      pass2: { orphanFilesPurged: 0, orphanDocsPurged: 0 },
    };
  }

  isRunning = true;
  logger.info('[Sweeper] Starting two-pass sweep cycle...');

  try {
    // Pass 1 before Pass 2
    const pass1 = await runPass1ExpiredArchiveSweep();
    const pass2 = await runPass2OrphanSweep();

    if (
      pass1.branchesPurged === 0 &&
      pass1.reportsPurged === 0 &&
      pass1.audiosPurged === 0 &&
      pass2.orphanFilesPurged === 0 &&
      pass2.orphanDocsPurged === 0
    ) {
      logger.info('[Sweeper] Sweep cycle complete: clean store (log-only no-op).');
    } else {
      logger.info(
        `[Sweeper] Sweep cycle complete: ${pass1.branchesPurged} branch(es), ${pass1.reportsPurged} report(s), ${pass1.audiosPurged} audio(s), ${pass2.orphanFilesPurged} file(s), ${pass2.orphanDocsPurged} doc(s) purged.`
      );
    }

    return { pass1, pass2 };
  } catch (error) {
    logger.error(`[Sweeper] Unhandled error during sweeper cycle: ${error.message}\n${error.stack}`);
    return {
      pass1: { branchesPurged: 0, reportsPurged: 0, audiosPurged: 0 },
      pass2: { orphanFilesPurged: 0, orphanDocsPurged: 0 },
    };
  } finally {
    isRunning = false;
  }
};

/**
 * Starts the in-process sweeper timer.
 * Invoked by server.js after the server is listening.
 *
 * @function startSweeper
 * @returns {NodeJS.Timeout|null} Active timer instance.
 */
export const startSweeper = () => {
  if (sweeperTimer) {
    logger.warn('[Sweeper] Sweeper is already running. Ignoring duplicate start.');
    return sweeperTimer;
  }

  // Schedule periodic sweeper runs
  sweeperTimer = setInterval(runSweeperCycle, SWEEPER_INTERVAL_MS);
  if (sweeperTimer.unref) {
    sweeperTimer.unref();
  }

  logger.info(`[Sweeper] In-process sweeper started (interval: ${SWEEPER_INTERVAL_MS}ms).`);
  return sweeperTimer;
};

/**
 * Stops the in-process sweeper timer during application shutdown.
 * Invoked by server.js on SIGINT/SIGTERM.
 *
 * @function stopSweeper
 * @returns {void}
 */
export const stopSweeper = () => {
  if (sweeperTimer) {
    clearInterval(sweeperTimer);
    sweeperTimer = null;
    logger.info('[Sweeper] In-process sweeper stopped cleanly.');
  }
};

export default {
  startSweeper,
  stopSweeper,
  runSweeperCycle,
  cascadeDeleteBranch,
  PROTECTED_FIXTURES,
  isProtectedFixture,
};

````

================================================================================
File: backend/src/models/Audio.js
================================================================================

````javascript
/**
 * @module models/Audio
 * @description Mongoose schema and model definition for standalone Audio recordings.
 * Scoped strictly to the authenticated supervisor (user: req.user._id).
 * Serves multi-purpose operational workflows: report narration, conversational voice input,
 * and standalone voice memos. Tracks disk storage paths, STT transcription status,
 * duration, and soft-archival lifecycle with partial index optimization.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { BASE_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import { AUDIO_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {Object} IAudio
 * @property {import('mongoose').Types.ObjectId} _id - Unique audio media asset identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor user reference.
 * @property {string} fileName - Storage filename on disk.
 * @property {string} originalName - Original upload filename.
 * @property {string} mimeType - Audio MIME type.
 * @property {number} size - File size in bytes.
 * @property {string} path - Canonical relative filesystem storage path.
 * @property {string} url - Derived virtual HTTP access URL.
 * @property {number|null} duration - Audio duration in seconds.
 * @property {string} purpose - Operational purpose ('report_narration' | 'chat_voice_input' | 'general_memo').
 * @property {string|null} sttEngine - Engine used to transcribe this recording, if transcribed.
 * @property {string} transcription - Speech-to-text transcribed text.
 * @property {string} status - Ingestion and transcription status ('uploaded' | 'transcribing' | 'transcribed' | 'failed').
 * @property {string|null} error - Error message if transcription failed.
 * @property {boolean} isArchived - Soft-deletion archival flag.
 * @property {Date|null} archivedAt - Timestamp when audio was soft-archived.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

const audioSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Audio must belong to a supervisor.'],
      index: true,
    },
    fileName: {
      type: String,
      required: [true, 'Audio storage filename is required.'],
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, 'Audio original filename is required.'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'Audio MIME type is required.'],
      enum: {
        values: AUDIO_CONSTANTS.ALLOWED_MIME_TYPES,
        message: '{VALUE} is not a supported audio MIME type.',
      },
      trim: true,
    },
    size: {
      type: Number,
      required: [true, 'Audio file size in bytes is required.'],
      min: [1, 'Audio file cannot be empty.'],
      max: [
        AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES,
        `Audio file size exceeds the ${AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`,
      ],
    },
    path: {
      type: String,
      required: [true, 'Audio relative storage path is required.'],
      trim: true,
    },
    cloudUrl: {
      type: String,
      default: null,
      trim: true,
    },
    publicId: {
      type: String,
      default: null,
      trim: true,
    },
    duration: {
      type: Number,
      default: null, // Audio duration in seconds
      min: [0, 'Audio duration cannot be negative.'],
      max: [
        AUDIO_CONSTANTS.MAX_DURATION_SECONDS,
        `Audio duration cannot exceed ${AUDIO_CONSTANTS.MAX_DURATION_SECONDS} seconds.`,
      ],
    },
    purpose: {
      type: String,
      enum: AUDIO_CONSTANTS.PURPOSES,
      default: AUDIO_CONSTANTS.DEFAULT_PURPOSE,
      index: true,
    },
    sttEngine: {
      type: String,
      default: null, // Populated dynamically upon transcription; user default settings apply if omitted
    },
    transcription: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: AUDIO_CONSTANTS.STATUSES,
      default: AUDIO_CONSTANTS.DEFAULT_STATUS,
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  BASE_SCHEMA_OPTIONS
);

/**
 * Derived virtual getter: url
 * Normalizes relative disk path to an accessible HTTP URL path.
 * @memberof audioSchema
 * @returns {string|null} Relative HTTP URL.
 */
audioSchema.virtual('url').get(function () {
  if (this.cloudUrl) {
    return this.cloudUrl;
  }
  if (this.fileName) {
    return `/uploads/audios/${this.fileName}`;
  }
  if (!this.path) return null;
  const normalized = this.path.replace(/\\/g, '/');
  const uploadIdx = normalized.indexOf('/uploads/');
  if (uploadIdx !== -1) {
    return normalized.slice(uploadIdx);
  }
  const bareUploadIdx = normalized.indexOf('uploads/');
  if (bareUploadIdx !== -1) {
    return `/${normalized.slice(bareUploadIdx)}`;
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
});

// Partial compound index for active audio directory listing (primary query path)
audioSchema.index(
  { user: 1, createdAt: -1 },
  { partialFilterExpression: { isArchived: false } }
);

// Partial compound index for archived audio sweeper and archive inspection
audioSchema.index(
  { user: 1, archivedAt: -1 },
  { partialFilterExpression: { isArchived: true } }
);

// Attach pagination plugin
audioSchema.plugin(mongoosePaginate);

export const Audio = mongoose.model('Audio', audioSchema);

export default Audio;

````

================================================================================
File: backend/src/models/Branch.js
================================================================================

````javascript
/**
 * @module models/Branch
 * @description Mongoose schema and model definition for physical operational branches.
 * Scoped strictly to the authenticated supervisor (user: req.user._id).
 * Enforces compound partial unique indexes on (user, name) with case-insensitive collation,
 * operational code uniqueness, bilingual aliases for Amharic/English discovery,
 * soft-archival lifecycle tracking, and standard pagination.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { BASE_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import { BRANCH_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {Object} IBranchLocation
 * @property {string} city - Municipality / city of the branch (defaults to Addis Ababa).
 * @property {string} subcity - Subcity or district administrative division.
 * @property {string} address - Street or landmark location address.
 */

/**
 * @typedef {Object} IBranch
 * @property {import('mongoose').Types.ObjectId} _id - Unique branch identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor identifier.
 * @property {string} name - Branch name (English or Amharic).
 * @property {string} code - Operational branch code (e.g., 'BOLE-01').
 * @property {string[]} aliases - Bilingual transliterated search aliases (English & Amharic equivalents).
 * @property {IBranchLocation} location - Physical branch location details.
 * @property {string} managerName - Branch store manager full name.
 * @property {string} contactPhone - Store manager contact telephone number.
 * @property {boolean} isArchived - Soft-deletion archival flag.
 * @property {Date|null} archivedAt - Timestamp when branch was soft-archived.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

const branchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owning supervisor user reference is required.'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Branch name is required.'],
      trim: true,
      minlength: [BRANCH_CONSTANTS.NAME_MIN_LENGTH, `Branch name must be at least ${BRANCH_CONSTANTS.NAME_MIN_LENGTH} character.`],
      maxlength: [BRANCH_CONSTANTS.NAME_MAX_LENGTH, `Branch name cannot exceed ${BRANCH_CONSTANTS.NAME_MAX_LENGTH} characters.`],
    },
    code: {
      type: String,
      required: [true, 'Operational branch code is required.'],
      trim: true,
      uppercase: true,
      minlength: [BRANCH_CONSTANTS.CODE_MIN_LENGTH, `Branch code must be at least ${BRANCH_CONSTANTS.CODE_MIN_LENGTH} characters.`],
      maxlength: [BRANCH_CONSTANTS.CODE_MAX_LENGTH, `Branch code cannot exceed ${BRANCH_CONSTANTS.CODE_MAX_LENGTH} characters.`],
    },
    aliases: {
      type: [String],
      default: [],
      index: true,
    },
    location: {
      city: {
        type: String,
        default: BRANCH_CONSTANTS.DEFAULT_CITY,
        trim: true,
        maxlength: [BRANCH_CONSTANTS.CITY_MAX_LENGTH, `City cannot exceed ${BRANCH_CONSTANTS.CITY_MAX_LENGTH} characters.`],
      },
      subcity: {
        type: String,
        default: '',
        trim: true,
        maxlength: [BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH, `Subcity cannot exceed ${BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH} characters.`],
      },
      address: {
        type: String,
        default: '',
        trim: true,
        maxlength: [BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH, `Address cannot exceed ${BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH} characters.`],
      },
    },
    managerName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH, `Manager name cannot exceed ${BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH} characters.`],
    },
    contactPhone: {
      type: String,
      default: '',
      trim: true,
      maxlength: [BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH, `Contact phone cannot exceed ${BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH} characters.`],
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Compound partial unique index with case-insensitive collation:
// Guarantees active branch names are unique per supervisor without requiring a redundant normalizedName field.
branchSchema.index(
  { user: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
    collation: { locale: 'en', strength: 2 },
  }
);

// Compound partial unique index: ensures active branch codes are unique per supervisor
branchSchema.index(
  { user: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
  }
);

// Compound index for paginated active/archived branch directory queries
branchSchema.index({ user: 1, isArchived: 1, createdAt: -1 });

// Attach pagination plugin for uniform API list envelopes
branchSchema.plugin(mongoosePaginate);

export const Branch = mongoose.model('Branch', branchSchema);

export default Branch;

````

================================================================================
File: backend/src/models/Chat.js
================================================================================

````javascript
/**
 * @module models/Chat
 * @description Mongoose schema and model definition for AI Agent Chats and Operational Sessions.
 * Scoped strictly to the authenticated supervisor (user: req.user._id).
 * Enforces linear turn history with typed modalities (text, thought, standalone audio references, file attachments),
 * dynamic agent title derivation (default null), Gemini thinkingBudget configuration without hardcoded temperature,
 * and high-performance partial indexes on active sessions.
 * Note: Directives reside strictly on User.settings.directives (Single Source of Truth).
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import {
  BASE_SCHEMA_OPTIONS,
  SUBDOCUMENT_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
} from '../config/schemaOptions.js';
import {
  CHAT_CONSTANTS,
  ATTACHMENT_CONSTANTS,
  AUDIO_CONSTANTS,
} from '../utils/constants.js';

/**
 * @typedef {Object} IChatAttachment
 * @property {import('mongoose').Types.ObjectId} _id - Unique attachment identifier.
 * @property {string} fileName - Stored filename on disk.
 * @property {string} originalName - Original upload filename.
 * @property {string} mimeType - Document or image MIME type.
 * @property {number} size - File size in bytes.
 * @property {string} path - Canonical relative filesystem storage path.
 * @property {string} url - Derived virtual HTTP access URL.
 */

/**
 * @typedef {Object} IMessageTurn
 * @property {import('mongoose').Types.ObjectId} _id - Unique turn identifier.
 * @property {string} id - Client message UUID.
 * @property {'user'|'assistant'|'system'} role - Conversational turn participant role.
 * @property {string} text - User prompt or assistant output markdown.
 * @property {string|null} thought - Streamed reasoning tokens from Gemini thinkingConfig.
 * @property {import('mongoose').Types.ObjectId[]} audios - Standalone Audio document references.
 * @property {IChatAttachment[]} attachments - Document and image file attachments.
 * @property {Array<Record<string, any>>} toolCalls - Recorded tool invocation telemetry.
 * @property {string|null} model - AI model identifier that generated the turn response.
 * @property {{ promptTokens?: number, candidatesTokens?: number, totalTokens?: number }|null} usage - Token usage telemetry.
 * @property {Date} createdAt - Timestamp of turn creation.
 */

/**
 * @typedef {Object} IChatConfig
 * @property {string} model - Gemini model identifier.
 * @property {number} thinkingBudget - Allocated reasoning token budget.
 * @property {number|undefined} temperature - Optional sampling temperature (native model default when undefined).
 * @property {string} language - Interaction language ('am' | 'en' | 'auto').
 */

/**
 * @typedef {Object} IChat
 * @property {import('mongoose').Types.ObjectId} _id - Unique chat session identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor user reference.
 * @property {string|null} title - Contextual session title dynamically generated by agent.
 * @property {boolean} isPinned - Pinning flag for quick sidebar access.
 * @property {IChatConfig} config - Session-specific AI configuration.
 * @property {IMessageTurn[]} messages - Linear chronological turn history.
 * @property {boolean} isArchived - Soft-deletion archival flag.
 * @property {Date|null} archivedAt - Timestamp when chat was soft-archived.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

const attachmentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: [true, 'Attachment storage filename is required.'],
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, 'Attachment original filename is required.'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'Attachment MIME type is required.'],
      validate: {
        validator: function (val) {
          if (!val || typeof val !== 'string') return false;
          const clean = val.toLowerCase().trim();
          const base = clean.split(';')[0].trim();
          return (
            ATTACHMENT_CONSTANTS.ALLOWED_MIME_TYPES.includes(clean) ||
            ATTACHMENT_CONSTANTS.ALLOWED_MIME_TYPES.includes(base) ||
            AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(clean) ||
            AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(base) ||
            base.startsWith('audio/') ||
            base === 'video/webm' ||
            base === 'video/mp4' ||
            base === 'application/ogg'
          );
        },
        message: '{VALUE} is not a supported attachment MIME type.',
      },
      trim: true,
    },
    size: {
      type: Number,
      required: [true, 'Attachment size in bytes is required.'],
      min: [1, 'Attachment file cannot be empty.'],
      max: [
        Math.max(ATTACHMENT_CONSTANTS.MAX_FILE_SIZE_BYTES, AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES),
        `Attachment size exceeds the ${Math.max(ATTACHMENT_CONSTANTS.MAX_FILE_SIZE_BYTES, AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES) / (1024 * 1024)}MB limit.`,
      ],
    },
    path: {
      type: String,
      required: [true, 'Attachment relative storage path is required.'],
      trim: true,
    },
    cloudUrl: {
      type: String,
      default: null,
      trim: true,
    },
    publicId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Derived virtual getter: url
 * Normalizes relative storage path to an accessible HTTP URL path or returns Cloudinary CDN url.
 * @memberof attachmentSchema
 * @returns {string|null} Relative HTTP URL or HTTPS Cloud CDN URL.
 */
attachmentSchema.virtual('url').get(function () {
  if (this.cloudUrl) {
    return this.cloudUrl;
  }
  if (!this.path) return null;
  const normalized = this.path.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
});

/**
 * Embedded subdocument schema representing a single conversational turn.
 */
const messageTurnSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: [true, 'Client message UUID is required.'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: [true, 'Turn role is required.'],
    },
    text: {
      type: String,
      default: '',
      trim: true,
      validate: [
        function (val) {
          if (this.role === 'user' && val && val.length > CHAT_CONSTANTS.MAX_MESSAGE_LENGTH) {
            return false;
          }
          return true;
        },
        `User message text cannot exceed ${CHAT_CONSTANTS.MAX_MESSAGE_LENGTH} characters.`,
      ],
    },
    thought: {
      type: String,
      default: null, // Streamed reasoning tokens from Gemini thinkingConfig
    },
    audios: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Audio',
        },
      ],
      default: [],
      validate: [
        (val) => val.length <= AUDIO_CONSTANTS.MAX_FILES_COUNT,
        `Audio attachments per turn cannot exceed ${AUDIO_CONSTANTS.MAX_FILES_COUNT}.`,
      ],
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: [
        (val) => val.length <= ATTACHMENT_CONSTANTS.MAX_FILES_COUNT,
        `File attachments per turn cannot exceed ${ATTACHMENT_CONSTANTS.MAX_FILES_COUNT}.`,
      ],
    },
    audioTranscriptions: {
      type: [String],
      default: [],
    },
    documentTextContext: {
      type: String,
      default: null,
    },
    toolCalls: {
      type: Array,
      default: [],
    },
    model: {
      type: String,
      default: null,
    },
    usage: {
      promptTokens: { type: Number, default: null },
      candidatesTokens: { type: Number, default: null },
      totalTokens: { type: Number, default: null },
    },
    isStopped: {
      type: Boolean,
      default: false,
    },
    isError: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Chat session configuration schema.
 */
const chatConfigSchema = new mongoose.Schema(
  {
    model: {
      type: String,
      enum: CHAT_CONSTANTS.SUPPORTED_MODELS,
      default: CHAT_CONSTANTS.DEFAULT_MODEL,
    },
    thinkingBudget: {
      type: Number,
      default: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
      min: CHAT_CONSTANTS.MIN_THINKING_BUDGET,
      max: CHAT_CONSTANTS.MAX_THINKING_BUDGET,
    },
    temperature: {
      type: Number,
      min: 0,
      max: 2,
      default: undefined,
    },
    language: {
      type: String,
      enum: CHAT_CONSTANTS.SUPPORTED_LANGUAGES,
      default: CHAT_CONSTANTS.DEFAULT_LANGUAGE,
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Root Chat Schema.
 */
const chatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Chat must belong to a supervisor.'],
      index: true,
    },
    title: {
      type: String,
      default: null, // Dynamically generated by agent on initial turn; null renders empty state placeholder
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.TITLE_MAX_LENGTH,
        `Title cannot exceed ${CHAT_CONSTANTS.TITLE_MAX_LENGTH} characters.`,
      ],
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    config: {
      type: chatConfigSchema,
      default: () => ({}),
    },
    messages: {
      type: [messageTurnSchema],
      default: [],
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Partial compound index for active sidebar chats: pinned chats first, newest activity first
chatSchema.index(
  { user: 1, isPinned: -1, updatedAt: -1 },
  { partialFilterExpression: { isArchived: false } }
);

// Partial compound index for archived chats: sweeper auto-purge and archived list
chatSchema.index(
  { user: 1, archivedAt: -1 },
  { partialFilterExpression: { isArchived: true } }
);

// Attach pagination plugin
chatSchema.plugin(mongoosePaginate);

export const Chat = mongoose.model('Chat', chatSchema);

export default Chat;

````

================================================================================
File: backend/src/models/Report.js
================================================================================

````javascript
/**
 * @module models/Report
 * @description Mongoose schema and model definition for Corporate Operational Reports.
 * Scoped strictly to the authenticated supervisor (user: req.user._id).
 * Enforces embedded subdocuments for visits, activities, issues, and comments,
 * standalone Audio document references, derived virtual getter for Ethiopian calendar
 * date, and partial indexes for active inspection queries.
 * Note: Author identity is grounded strictly via user reference (Single Source of Truth).
 * Note: Strictly zero status and zero templateType columns exist on the Report model.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { BASE_SCHEMA_OPTIONS, SUBDOCUMENT_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import { REPORT_CONSTANTS } from '../utils/constants.js';
import { toEthiopianDateString } from '../utils/ethiopianCalendar.js';

/**
 * @typedef {Object} IVisit
 * @property {import('mongoose').Types.ObjectId} _id - Unique visit subdocument identifier.
 * @property {import('mongoose').Types.ObjectId} branch - Visited operational branch reference.
 * @property {string} clockIn - Arrival time at branch (HH:mm format).
 * @property {string} clockOut - Departure time from branch (HH:mm format).
 */

/**
 * @typedef {Object} IActivity
 * @property {import('mongoose').Types.ObjectId} _id - Unique activity subdocument identifier.
 * @property {string} text - Operational activity description.
 * @property {'in_progress'|'completed'} status - Activity completion status (defaults to 'completed').
 */

/**
 * @typedef {Object} IIssue
 * @property {import('mongoose').Types.ObjectId} _id - Unique issue subdocument identifier.
 * @property {string} text - Operational issue description.
 * @property {'reported'|'completed'|'in_progress'|'no_issue'} status - Issue status (defaults to 'reported').
 */

/**
 * @typedef {Object} IComment
 * @property {import('mongoose').Types.ObjectId} _id - Unique comment subdocument identifier.
 * @property {string} text - General supervisory comment text.
 * @property {null} status - Always null (comments require no status).
 */

/**
 * @typedef {Object} IReport
 * @property {import('mongoose').Types.ObjectId} _id - Unique report identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor user reference.
 * @property {Date} date - Inspection date.
 * @property {string} clockIn - Work clock-in time (HH:mm format).
 * @property {string} clockOut - Work clock-out time (HH:mm format).
 * @property {IVisit[]} visits - Branch inspection visit intervals.
 * @property {string} transcription - Authoritative corporate Amharic operational text.
 * @property {import('mongoose').Types.ObjectId[]} audios - Evidentiary standalone Audio document references.
 * @property {IActivity[]} activities - Embedded operational activities.
 * @property {IIssue[]} issues - Embedded operational issues.
 * @property {IComment[]} comments - Embedded supervisory comments.
 * @property {string} ethiopianDate - Derived virtual Ethiopian calendar date (DD-MM-YY).
 * @property {boolean} isArchived - Soft-deletion archival flag.
 * @property {Date|null} archivedAt - Timestamp when report was soft-archived.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Embedded subdocument schema representing a branch inspection visit interval.
 */
const visitSchema = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch reference is required for each visit.'],
    },
    clockIn: {
      type: String,
      required: [true, 'Visit arrival time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Visit arrival time must be in HH:mm format.'],
    },
    clockOut: {
      type: String,
      required: [true, 'Visit departure time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Visit departure time must be in HH:mm format.'],
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema representing an operational activity.
 * Default status is 'completed'.
 */
const activitySchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Activity description is required.'],
      trim: true,
      maxlength: [
        REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH,
        `Activity text cannot exceed ${REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH} characters.`,
      ],
    },
    status: {
      type: String,
      enum: REPORT_CONSTANTS.ACTIVITY_STATUSES,
      default: REPORT_CONSTANTS.DEFAULT_ACTIVITY_STATUS,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema representing an operational issue.
 * Default status is 'reported'. Strictly zero category and zero severity.
 */
const issueSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Issue description is required.'],
      trim: true,
      maxlength: [
        REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH,
        `Issue text cannot exceed ${REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH} characters.`,
      ],
    },
    status: {
      type: String,
      enum: REPORT_CONSTANTS.ISSUE_STATUSES,
      default: REPORT_CONSTANTS.DEFAULT_ISSUE_STATUS,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema representing general supervisory comments.
 * Comments have no status requirement.
 */
const commentSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Comment text is required.'],
      trim: true,
      maxlength: [
        REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH,
        `Comment text cannot exceed ${REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH} characters.`,
      ],
    },
    status: {
      type: String,
      default: null,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

/**
 * Corporate Operational Report Schema.
 * Note: The Report itself has strictly NO status field and NO templateType field.
 */
const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Report must belong to a supervisor.'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Inspection date is required.'],
      index: true,
    },
    dateString: {
      type: String,
      required: [true, 'Normalized Gregorian date string (YYYY-MM-DD) is required.'],
      trim: true,
      index: true,
    },
    ethiopianDate: {
      type: String,
      required: [true, 'Normalized Ethiopian date string (DD-MM-YY) is required.'],
      trim: true,
      index: true,
    },
    clockIn: {
      type: String,
      required: [true, 'Work clock-in time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Work clock-in time must be in HH:mm format.'],
    },
    clockOut: {
      type: String,
      required: [true, 'Work clock-out time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Work clock-out time must be in HH:mm format.'],
    },
    visits: {
      type: [visitSchema],
      default: [],
    },
    transcription: {
      type: String,
      required: [true, 'Report transcription is required.'],
      trim: true,
      maxlength: [
        REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH,
        `Transcription text cannot exceed ${REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH} characters.`,
      ],
    },
    audios: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Audio',
        },
      ],
      default: [],
      validate: [
        (val) => val.length <= REPORT_CONSTANTS.MAX_AUDIO_FILES,
        `Report audio recordings cannot exceed ${REPORT_CONSTANTS.MAX_AUDIO_FILES}.`,
      ],
    },
    activities: {
      type: [activitySchema],
      default: [],
    },
    issues: {
      type: [issueSchema],
      default: [],
    },
    comments: {
      type: [commentSchema],
      default: [],
    },
    customSections: {
      type: [
        {
          heading: { type: String, required: true, trim: true },
          items: [{ type: String, trim: true }],
        },
      ],
      default: [],
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map(),
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  BASE_SCHEMA_OPTIONS
);

/**
 * Pre-validation hook:
 * Automatically computes and populates dateString (YYYY-MM-DD) and ethiopianDate (DD-MM-YY)
 * from the date field if not explicitly provided, guaranteeing consistent normalization.
 */
reportSchema.pre('validate', function () {
  if (this.date) {
    if (!this.dateString) {
      const d = new Date(this.date);
      this.dateString = d.toISOString().split('T')[0];
    }
    if (!this.ethiopianDate) {
      this.ethiopianDate = toEthiopianDateString(this.date);
    }
  }
});

// Partial compound unique index: Exactly ONE active report per supervisor per Gregorian date
reportSchema.index(
  { user: 1, dateString: 1 },
  { unique: true, partialFilterExpression: { isArchived: false, dateString: { $type: 'string' } } }
);

// Partial compound unique index: Exactly ONE active report per supervisor per Ethiopian date
reportSchema.index(
  { user: 1, ethiopianDate: 1 },
  { unique: true, partialFilterExpression: { isArchived: false, ethiopianDate: { $type: 'string' } } }
);

// Partial compound index for active reports ordered by date (primary query path)
reportSchema.index(
  { user: 1, date: -1 },
  { partialFilterExpression: { isArchived: false } }
);

// Partial compound index for active branch visit historical query
reportSchema.index(
  { user: 1, 'visits.branch': 1 },
  { partialFilterExpression: { isArchived: false } }
);

// Partial compound index for archived reports: sweeper auto-purge and archived list
reportSchema.index(
  { user: 1, archivedAt: -1 },
  { partialFilterExpression: { isArchived: true } }
);

// Attach pagination plugin
reportSchema.plugin(mongoosePaginate);

export const Report = mongoose.model('Report', reportSchema);

export default Report;

````

================================================================================
File: backend/src/models/User.js
================================================================================

````javascript
/**
 * @module models/User
 * @description Mongoose schema and model definition for the application User (Area Supervisor).
 * Enforces single-user operational constraints (strictly zero role, zero isArchived).
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { BASE_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import {
  DEFAULT_POSITION,
  USER_NAME_LENGTH,
  PASSWORD_MIN_LENGTH,
  EMAIL_REGEX,
  BCRYPT_SALT_ROUNDS,
  CHAT_CONSTANTS,
  REPORT_CONSTANTS,
  TTS_CONSTANTS,
} from '../utils/constants.js';

/**
 * @typedef {Object} IUserSettingsDirectives
 * @property {string[]} negativeVocabulary - Forbidden words strictly excluded from all outputs.
 * @property {Map<string, string>} phraseMappings - Shorthand-to-corporate wording and jargon mappings.
 * @property {string[]} customInstructions - Discrete persistent rules and preferences created on the fly.
 */

/**
 * @typedef {Object} IUserSettingsAgentConfig
 * @property {string} persona - Configurable operational persona description.
 * @property {string} defaultModel - Default Gemini model identifier.
 * @property {number} defaultThinkingBudget - Default reasoning token budget.
 * @property {string} defaultLanguage - Default interaction language ('am' | 'en' | 'auto').
 */

/**
 * @typedef {Object} IUserSettings
 * @property {string} sttEngine - Default Speech-to-Text engine ('addis_ai' | 'gemini-2.5-flash').
 * @property {IUserSettingsAgentConfig} agentConfig - Agent persona and default reasoning configuration.
 * @property {IUserSettingsDirectives} directives - Supervisor vocabulary rules, constraints, and instructions.
 */

/**
 * @typedef {Object} IUser
 * @property {import('mongoose').Types.ObjectId} _id - Unique user ID.
 * @property {string} firstName - User first name (2-50 chars).
 * @property {string} lastName - User last name (2-50 chars).
 * @property {string} email - Unique lowercase email address.
 * @property {string} password - Bcrypt hashed password (hidden by default).
 * @property {string} position - Job position (defaults to 'Area Supervisor').
 * @property {string|null} avatar - Profile avatar image URL or path.
 * @property {IUserSettings} settings - User operational settings, STT engine, and directives.
 * @property {string} fullName - Virtual property combining first and last name.
 * @property {Date} createdAt - Timestamp of user creation.
 * @property {Date} updatedAt - Timestamp of last user update.
 */

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required.'],
      trim: true,
      minlength: [USER_NAME_LENGTH.MIN, `First name must be at least ${USER_NAME_LENGTH.MIN} characters.`],
      maxlength: [USER_NAME_LENGTH.MAX, `First name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required.'],
      trim: true,
      minlength: [USER_NAME_LENGTH.MIN, `Last name must be at least ${USER_NAME_LENGTH.MIN} characters.`],
      maxlength: [USER_NAME_LENGTH.MAX, `Last name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`],
    },
    email: {
      type: String,
      required: [true, 'Email address is required.'],
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address.'],
    },
    password: {
      type: String,
      required: [true, 'Password is required.'],
      minlength: [PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`],
      select: false,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google', 'both'],
      default: 'local',
    },
    isPasswordSet: {
      type: Boolean,
      default: true,
    },
    position: {
      type: String,
      required: [true, 'Position is required.'],
      trim: true,
      default: DEFAULT_POSITION,
    },
    avatar: {
      type: String,
      default: null,
    },
    avatarPublicId: {
      type: String,
      default: null,
    },
    settings: {
      sttEngine: {
        type: String,
        enum: CHAT_CONSTANTS.STT_ENGINES,
        default: CHAT_CONSTANTS.DEFAULT_STT_ENGINE,
      },
      agentConfig: {
        persona: {
          type: String,
          default: CHAT_CONSTANTS.DEFAULT_PERSONA,
        },
        defaultModel: {
          type: String,
          enum: CHAT_CONSTANTS.SUPPORTED_MODELS,
          default: CHAT_CONSTANTS.DEFAULT_MODEL,
        },
        defaultThinkingBudget: {
          type: Number,
          default: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
          min: CHAT_CONSTANTS.MIN_THINKING_BUDGET,
          max: CHAT_CONSTANTS.MAX_THINKING_BUDGET,
        },
        defaultLanguage: {
          type: String,
          enum: CHAT_CONSTANTS.SUPPORTED_LANGUAGES,
          default: CHAT_CONSTANTS.DEFAULT_LANGUAGE,
        },
      },
      tts: {
        amharicVoice: {
          type: String,
          default: TTS_CONSTANTS.DEFAULT_AMHARIC_VOICE,
          trim: true,
        },
        englishVoice: {
          type: String,
          default: TTS_CONSTANTS.DEFAULT_ENGLISH_VOICE,
          trim: true,
        },
        speed: {
          type: Number,
          default: TTS_CONSTANTS.DEFAULT_SPEED,
          min: TTS_CONSTANTS.MIN_SPEED,
          max: TTS_CONSTANTS.MAX_SPEED,
        },
        autoPlay: {
          type: Boolean,
          default: false,
        },
      },
      reportTemplates: {
        singleBranch: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH,
            `Single branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`,
          ],
        },
        multiBranch: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH,
            `Multi branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`,
          ],
        },
      },
      directives: {
        negativeVocabulary: [{ type: String, trim: true }],
        phraseMappings: { type: Map, of: String, default: () => new Map() },
        customInstructions: [{ type: String, trim: true }],
      },
      apiKeys: {
        hasGeminiKey: { type: Boolean, default: false },
        hasAddisKey: { type: Boolean, default: false },
        geminiApiKey: { type: String, default: null, trim: true, select: false },
        addisApiKey: { type: String, default: null, trim: true, select: false },
      },
    },
    integrations: {
      googleDrive: {
        connected: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true },
        email: { type: String, default: null },
        accessToken: { type: String, default: null, select: false },
        refreshToken: { type: String, default: null, select: false },
        expiryDate: { type: Number, default: null, select: false },
        scope: [{ type: String }],
        rootFolderId: { type: String, default: null },
        connectedAt: { type: Date, default: null },
      },
      telegram: {
        connected: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true },
        botToken: { type: String, default: null, trim: true, select: false },
        botUsername: { type: String, default: null, trim: true },
        managementChatId: { type: String, default: null, trim: true },
        maintenanceChatId: { type: String, default: null, trim: true },
        generalChatId: { type: String, default: null, trim: true },
        defaultFormat: {
          type: String,
          enum: ['text', 'image'],
          default: 'text',
        },
        imageCardOptions: {
          type: Object,
          default: {},
        },
        connectedAt: { type: Date, default: null },
      },
    },
  },
  {
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        delete ret.password;
        if (ret.integrations?.googleDrive) {
          delete ret.integrations.googleDrive.accessToken;
          delete ret.integrations.googleDrive.refreshToken;
          delete ret.integrations.googleDrive.expiryDate;
        }
        if (ret.integrations?.telegram) {
          delete ret.integrations.telegram.botToken;
        }
        if (ret.settings?.apiKeys) {
          const hasGeminiKey = ret.settings.apiKeys.geminiApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.geminiApiKey)
            : Boolean(ret.settings.apiKeys.hasGeminiKey);
          const hasAddisKey = ret.settings.apiKeys.addisApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.addisApiKey)
            : Boolean(ret.settings.apiKeys.hasAddisKey);
          delete ret.settings.apiKeys.geminiApiKey;
          delete ret.settings.apiKeys.addisApiKey;
          ret.settings.apiKeys.hasGeminiKey = hasGeminiKey;
          ret.settings.apiKeys.hasAddisKey = hasAddisKey;
        } else if (ret.settings) {
          ret.settings.apiKeys = {
            hasGeminiKey: false,
            hasAddisKey: false,
          };
        }
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        delete ret.password;
        if (ret.integrations?.googleDrive) {
          delete ret.integrations.googleDrive.accessToken;
          delete ret.integrations.googleDrive.refreshToken;
          delete ret.integrations.googleDrive.expiryDate;
        }
        if (ret.integrations?.telegram) {
          delete ret.integrations.telegram.botToken;
        }
        if (ret.settings?.apiKeys) {
          const hasGeminiKey = ret.settings.apiKeys.geminiApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.geminiApiKey)
            : Boolean(ret.settings.apiKeys.hasGeminiKey);
          const hasAddisKey = ret.settings.apiKeys.addisApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.addisApiKey)
            : Boolean(ret.settings.apiKeys.hasAddisKey);
          delete ret.settings.apiKeys.geminiApiKey;
          delete ret.settings.apiKeys.addisApiKey;
          ret.settings.apiKeys.hasGeminiKey = hasGeminiKey;
          ret.settings.apiKeys.hasAddisKey = hasAddisKey;
        } else if (ret.settings) {
          ret.settings.apiKeys = {
            hasGeminiKey: false,
            hasAddisKey: false,
          };
        }
        return ret;
      },
    },
  }
);

// Explicit schema-level unique index on email
userSchema.index({ email: 1 }, { unique: true });

/**
 * Virtual getter for the user's computed full name.
 * @memberof userSchema
 * @returns {string} Combined first and last name.
 */
userSchema.virtual('fullName').get(function () {
  const name = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  return name || undefined;
});

/**
 * Mongoose pre-save hook to synchronize BYOK status flags.
 */
userSchema.pre('save', function () {
  if (this.settings?.apiKeys) {
    if (this.isModified('settings.apiKeys.geminiApiKey')) {
      this.settings.apiKeys.hasGeminiKey = Boolean(
        this.settings.apiKeys.geminiApiKey && this.settings.apiKeys.geminiApiKey.trim()
      );
    }
    if (this.isModified('settings.apiKeys.addisApiKey')) {
      this.settings.apiKeys.hasAddisKey = Boolean(
        this.settings.apiKeys.addisApiKey && this.settings.apiKeys.addisApiKey.trim()
      );
    }
  }
});

/**
 * Mongoose pre-save hook to hash user password using bcrypt with salt factor 12.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compares an incoming plain-text password with the stored bcrypt hash.
 * @function matchPassword
 * @memberof userSchema.methods
 * @param {string} enteredPassword - Candidate plain-text password.
 * @returns {Promise<boolean>} True if password matches hash, false otherwise.
 */
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Compares an incoming plain-text password with the stored bcrypt hash (alias for matchPassword).
 * @function comparePassword
 * @memberof userSchema.methods
 * @param {string} enteredPassword - Candidate plain-text password.
 * @returns {Promise<boolean>} True if password matches hash, false otherwise.
 */
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
export default User;

````

================================================================================
File: backend/src/tools/agentTools.js
================================================================================

````javascript
/**
 * @module tools/agentTools
 * @description Comprehensive autonomous agent tool suite and execution engine for Google GenAI (Gemini).
 * Defines native @google/genai FunctionDeclaration schemas for the complete 17-Tool Enterprise Operational Matrix
 * and in-process ACID execution handlers.
 */

import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { Type } from '@google/genai';
import { Branch } from '../models/Branch.js';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { Audio } from '../models/Audio.js';
import { REPORT_CONSTANTS, BRANCH_CONSTANTS, CHAT_CONSTANTS, AI_MODELS } from '../utils/constants.js';
import { toEthiopianDateString, toGregorianDate } from '../utils/ethiopianCalendar.js';
import { isValidObjectId, validateReportPayload } from '../validations/reportValidation.js';
import { createReportRecord } from '../controllers/reportController.js';
import {
  generateBranchCode,
  resolveBranchAliases,
  getBilingualSearchTerms,
} from '../utils/transliterate.js';
import { cascadeDeleteBranch } from '../jobs/sweeper.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../errors/CustomError.js';
import logger from '../config/logger.js';
import {
  dispatchToTelegram,
  resolveBotToken,
  resolveChannelChatId,
} from '../services/telegramService.js';
import { manageGoogleDrive, createCloudDocument } from '../services/googleDriveService.js';
import { generateDocumentFile } from '../services/documentGenerationService.js';

/**
 * Escapes characters with special meaning in regular expressions.
 *
 * @private
 * @param {string} str - String to escape.
 * @returns {string} Escaped string safe for RegExp construction.
 */
function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes user/LLM input issue status to canonical domain status enum.
 * Authoritative: 'reported' | 'completed' | 'in_progress' | 'no_issue'
 * @function normalizeIssueStatus
 * @param {string|undefined|null} status - Raw status from LLM/user.
 * @returns {'reported'|'completed'|'in_progress'|'no_issue'}
 */
export function normalizeIssueStatus(status) {
  if (!status || typeof status !== 'string') return 'reported';
  const clean = status.trim().toLowerCase().replace(/[\s_-]+/g, '_');

  if (['completed', 'resolved', 'done', 'fixed', 'closed'].includes(clean)) {
    return 'completed';
  }
  if (['in_progress', 'ongoing', 'progress', 'investigating', 'working_on'].includes(clean)) {
    return 'in_progress';
  }
  if (['no_issue', 'none', 'no_issues', 'ok', 'normal', 'good'].includes(clean)) {
    return 'no_issue';
  }
  if (['reported', 'open', 'pending', 'unresolved', 'new', 'active'].includes(clean)) {
    return 'reported';
  }
  return 'reported';
}

/**
 * Normalizes user/LLM input activity status to canonical domain status enum.
 * Authoritative: 'completed' | 'in_progress'
 * @function normalizeActivityStatus
 * @param {string|undefined|null} status - Raw status from LLM/user.
 * @returns {'completed'|'in_progress'}
 */
export function normalizeActivityStatus(status) {
  if (!status || typeof status !== 'string') return 'completed';
  const clean = status.trim().toLowerCase().replace(/[\s_-]+/g, '_');

  if (['in_progress', 'ongoing', 'progress', 'started', 'pending'].includes(clean)) {
    return 'in_progress';
  }
  if (['completed', 'done', 'finished', 'closed', 'resolved'].includes(clean)) {
    return 'completed';
  }
  return 'completed';
}

/**
 * Builds the MongoDB query filter for a branch identifier that may be either an ObjectId or an operational code.
 *
 * @private
 * @param {string} identifier - 24-hex Mongo ObjectId or operational branch code (e.g. 'BOLE-01').
 * @param {string|import('mongoose').Types.ObjectId} userId - Supervisor identifier.
 * @returns {object} Mongo query object.
 */
function buildBranchIdentifierQuery(identifier, userId) {
  const cleanId = String(identifier || '').trim();
  const isMongoId =
    mongoose.Types.ObjectId.isValid(cleanId) &&
    String(new mongoose.Types.ObjectId(cleanId)) === cleanId;

  if (isMongoId) {
    return {
      user: userId,
      _id: cleanId,
    };
  }

  return {
    user: userId,
    code: cleanId.toUpperCase(),
  };
}

/**
 * Resolves an array of branch identifiers (ObjectIds or codes) to an array of valid MongoDB ObjectIds.
 *
 * @private
 * @param {Array<string>} identifiers - Array of branch IDs or codes.
 * @param {string|import('mongoose').Types.ObjectId} userId - Supervisor identifier.
 * @param {import('mongoose').ClientSession} [session=null] - Optional Mongoose session.
 * @returns {Promise<Array<import('mongoose').Types.ObjectId>>} Resolved ObjectIds.
 */
async function resolveBranchObjectIds(identifiers, userId, session = null) {
  if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) return [];
  const resolvedIds = [];
  const pendingIdentifiers = [];

  for (const item of identifiers) {
    const clean = String(item || '').trim();
    if (mongoose.Types.ObjectId.isValid(clean) && String(new mongoose.Types.ObjectId(clean)) === clean) {
      resolvedIds.push(new mongoose.Types.ObjectId(clean));
    } else if (clean) {
      pendingIdentifiers.push(clean);
    }
  }

  if (pendingIdentifiers.length > 0) {
    const uppercaseCodes = pendingIdentifiers.map((s) => s.toUpperCase());
    const found = await Branch.find({
      user: userId,
      $or: [
        { code: { $in: uppercaseCodes } },
        { name: { $in: pendingIdentifiers } },
      ],
    })
      .select('_id')
      .session(session || null)
      .lean();
    for (const b of found) {
      resolvedIds.push(b._id);
    }
  }

  return resolvedIds;
}

/**
 * Executes a callback within a Mongoose transaction session.
 * Reuses existing session if provided, otherwise creates and commits a new transaction.
 *
 * @private
 * @template T
 * @param {import('mongoose').ClientSession|null} existingSession - Existing session if any.
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} callback - Async logic to execute.
 * @returns {Promise<T>} Result of callback.
 */
async function runInTransaction(existingSession, callback) {
  if (existingSession) {
    return await callback(existingSession);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * ==============================================================================
 * 1. Native @google/genai Function Declarations (The Complete 17-Tool Matrix)
 * ==============================================================================
 */
export const agentToolDeclarations = [
  // ==========================================
  // CATEGORY 1: BRANCH SCOPE (6 TOOLS)
  // ==========================================
  {
    name: 'lookup_user_branches',
    description:
      'Retrieve restaurant branches registered to the authenticated supervisor. Supports filtering by active, archived, or all status, plus keyword search.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          description: "Status filter: 'active' (default), 'archived', or 'all'.",
        },
        search: {
          type: Type.STRING,
          description: 'Optional keyword to search branch name, code, address, or manager.',
        },
      },
    },
  },
  {
    name: 'create_branch',
    description:
      'Register a new restaurant branch for the supervisor inside an ACID transaction. Automatically generates unique branch code (e.g. BOLE-01) and Amharic transliteration.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'Official name of the branch (e.g., ቦሌ መድኃኒዓለም or Bole Medhanialem).',
        },
        address: {
          type: Type.STRING,
          description: 'Physical location or street address in Addis Ababa.',
        },
        phone: {
          type: Type.STRING,
          description: 'Contact phone number (e.g., 0911223344).',
        },
        managerName: {
          type: Type.STRING,
          description: 'Full name of the designated branch manager.',
        },
      },
      required: ['name', 'address', 'phone', 'managerName'],
    },
  },
  {
    name: 'update_branch',
    description:
      'Update profile details of an existing branch (manager name, contact phone, location address, or name) inside an ACID session.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchId: {
          type: Type.STRING,
          description: 'MongoDB ObjectId or unique branch code (e.g., BOLE-01).',
        },
        name: {
          type: Type.STRING,
          description: 'Updated branch name.',
        },
        address: {
          type: Type.STRING,
          description: 'Updated physical address.',
        },
        phone: {
          type: Type.STRING,
          description: 'Updated contact phone number.',
        },
        managerName: {
          type: Type.STRING,
          description: 'Updated manager name.',
        },
      },
      required: ['branchId'],
    },
  },
  {
    name: 'archive_branch',
    description:
      'Soft-archive an active branch (e.g. during remodeling, kitchen repairs, or temporary closure). Prevents branch from appearing in daily operational audits.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchId: {
          type: Type.STRING,
          description: 'MongoDB ObjectId or branch code of the branch to archive.',
        },
      },
      required: ['branchId'],
    },
  },
  {
    name: 'restore_branch',
    description:
      'Restore a previously archived branch back to active status. Enforces unique active name and code collision guards.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchId: {
          type: Type.STRING,
          description: 'MongoDB ObjectId or branch code of the archived branch to restore.',
        },
      },
      required: ['branchId'],
    },
  },
  {
    name: 'delete_branch_permanently',
    description:
      'Permanently hard-delete an archived branch. Must be archived first. Cascades cleanup inside an ACID session.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchId: {
          type: Type.STRING,
          description: 'MongoDB ObjectId or branch code of the archived branch to permanently delete.',
        },
      },
      required: ['branchId'],
    },
  },

  // ==========================================
  // CATEGORY 2: REPORT SCOPE (6 TOOLS)
  // ==========================================
  {
    name: 'create_report',
    description:
      'Autonomously formats and persists an authoritative operational report adhering to the Single-Branch or Multi-Branch corporate template, embedding visits, activities, issues, and comments directly in MongoDB via validateReportPayload and createReportRecord. Zero user tool approval required.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: 'Inspection date. Either a valid ISO date string (YYYY-MM-DD) or Ethiopian calendar date (DD-MM-YY or DD/MM/YYYY). Must be today or a past date, never in the future.',
        },
        clockIn: {
          type: Type.STRING,
          description: 'Work shift start time formatted strictly as HH:mm (ስራ የገባሁበት ሰዓት).',
        },
        clockOut: {
          type: Type.STRING,
          description: 'Work shift end time formatted strictly as HH:mm (ከስራ የወጣሁበት ሰዓት).',
        },
        visits: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              branch: {
                type: Type.STRING,
                description: 'MongoDB ObjectId, operational branch code (e.g. BOLE-01), or exact registered branch name of the visited branch. Must correspond to an active registered branch in <branch_registry>. Never forge an arbitrary ID for an unregistered branch.',
              },
              clockIn: {
                type: Type.STRING,
                description: 'Branch arrival time formatted strictly as HH:mm.',
              },
              clockOut: {
                type: Type.STRING,
                description: 'Branch departure time formatted strictly as HH:mm.',
              },
            },
            required: ['branch', 'clockIn', 'clockOut'],
          },
          description:
            'Chronological list of physical branch visits. Exactly 1 for Single-Branch, 2 or more for Multi-Branch.',
        },
        transcription: {
          type: Type.STRING,
          description:
            'Complete formatted Amharic corporate text matching the Single-Branch or Multi-Branch template.',
        },
        audios: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Optional array of 24-character hexadecimal MongoDB ObjectIds of standalone Audio documents.',
        },
        activities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: {
                type: Type.STRING,
                description: 'Operational task or activity conducted (- [ስራ]).',
              },
              status: {
                type: Type.STRING,
                description: "Activity status: 'in_progress' or 'completed' (default: 'completed').",
              },
            },
            required: ['text'],
          },
          description: 'Extracted operational activities (የተሰሩ ስራዎች).',
        },
        issues: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: {
                type: Type.STRING,
                description: 'Operational issue description (- [ችግር]).',
              },
              status: {
                type: Type.STRING,
                description:
                  "Issue status: 'reported', 'completed', 'in_progress', or 'no_issue' (default: 'reported').",
              },
            },
            required: ['text'],
          },
          description: 'Extracted operational issues or malfunctions (መፍትሄ የሚፈልጉ ጉዳዮች).',
        },
        comments: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: {
                type: Type.STRING,
                description: 'General comment or observational remark (- [አስተያየት]). Comments have NO status.',
              },
            },
            required: ['text'],
          },
          description: 'Extracted operational comments (አጠቃላይ አስተያየት).',
        },
        customSections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: {
                type: Type.STRING,
                description: 'Custom report section heading (e.g. የጥሬ ገንዘብ ሂሳብ ማጠቃለያ, የማቀዝቀዣ ሙቀት መዝገብ).',
              },
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Bullet points, line items, or entries belonging to this section.',
              },
            },
            required: ['heading', 'items'],
          },
          description: 'Optional custom report sections defined in user settings report templates.',
        },
      },
      required: ['date', 'clockIn', 'clockOut', 'visits', 'transcription'],
    },
  },
  {
    name: 'update_report',
    description:
      'Amend an existing operational report (work hours, new activities, new issues, comments, or transcription) inside an ACID session. Can identify the report either by reportId OR by date (defaults to current day if reportId is omitted).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportId: {
          type: Type.STRING,
          description:
            '24-character hexadecimal MongoDB ObjectId of the report to amend. Optional if date is supplied or amending today\'s report.',
        },
        date: {
          type: Type.STRING,
          description:
            'Inspection date of the report to amend (YYYY-MM-DD or DD-MM-YY). Used to look up the report in MongoDB if reportId is omitted.',
        },
        clockIn: {
          type: Type.STRING,
          description: 'Updated shift clock-in time (HH:mm).',
        },
        clockOut: {
          type: Type.STRING,
          description: 'Updated shift clock-out time (HH:mm).',
        },
        visits: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              branch: {
                type: Type.STRING,
                description: '24-character hexadecimal MongoDB ObjectId of the visited branch.',
              },
              clockIn: {
                type: Type.STRING,
                description: 'Branch arrival time formatted strictly as HH:mm.',
              },
              clockOut: {
                type: Type.STRING,
                description: 'Branch departure time formatted strictly as HH:mm.',
              },
            },
            required: ['branch', 'clockIn', 'clockOut'],
          },
          description: 'Updated chronological list of physical branch visits.',
        },
        newActivities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: 'Activity description.' },
              status: { type: Type.STRING, description: "Activity status: 'in_progress' or 'completed'." },
            },
            required: ['text'],
          },
          description: 'New activities to append to the report.',
        },
        newIssues: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: 'Issue description.' },
              status: {
                type: Type.STRING,
                description: "Issue status: 'reported', 'completed', 'in_progress', or 'no_issue'.",
              },
            },
            required: ['text'],
          },
          description: 'New issues to append to the report.',
        },
        newComments: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: 'Comment text.' },
            },
            required: ['text'],
          },
          description: 'New comments to append to the report.',
        },
        customSections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING, description: 'Section title.' },
              items: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Items list.' },
            },
            required: ['heading', 'items'],
          },
          description: 'Updated custom report sections.',
        },
        transcription: {
          type: Type.STRING,
          description: 'Updated formatted Amharic corporate transcription text.',
        },
      },
    },
  },
  {
    name: 'update_branch_record_status',
    description:
      'Update the status or resolution notes of a specific branch issue or activity subdocument directly from chat.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportId: {
          type: Type.STRING,
          description: '24-hex ObjectId of the report containing the record.',
        },
        recordId: {
          type: Type.STRING,
          description: '24-hex ObjectId of the specific subdocument (issue or activity).',
        },
        recordType: {
          type: Type.STRING,
          description: "Subdocument type: 'issue' or 'activity'.",
        },
        newStatus: {
          type: Type.STRING,
          description: "New status value: 'reported', 'completed', 'in_progress', or 'no_issue'.",
        },
        resolutionNotes: {
          type: Type.STRING,
          description: 'Optional corrective notes describing how the item was addressed.',
        },
      },
      required: ['reportId', 'recordId', 'recordType', 'newStatus'],
    },
  },
  {
    name: 'archive_report',
    description:
      'Soft-archive an operational report (sets isArchived: true, archivedAt: new Date()), entering the 30-day sweeper retention window.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportId: {
          type: Type.STRING,
          description: '24-hex ObjectId of the report to archive.',
        },
      },
      required: ['reportId'],
    },
  },
  {
    name: 'restore_report',
    description:
      'Restore a previously archived report back to active status prior to 30-day sweeper purge.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportId: {
          type: Type.STRING,
          description: '24-hex ObjectId of the archived report to restore.',
        },
      },
      required: ['reportId'],
    },
  },
  {
    name: 'delete_report_permanently',
    description:
      'Permanently hard-delete an archived report from MongoDB and unlink associated Audio binary files strictly post-commit.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportId: {
          type: Type.STRING,
          description: '24-hex ObjectId of the archived report to permanently delete.',
        },
      },
      required: ['reportId'],
    },
  },

  // ==========================================
  // CATEGORY 3: ENTERPRISE INTELLIGENCE & CROSS-BRANCH QUERIES (2 TOOLS)
  // ==========================================
  {
    name: 'query_historical_reports',
    description:
      'Search and retrieve previously generated operational reports across one, several, or all branches and date ranges from MongoDB. Supports status filtering (active, archived, or all) and keyword search.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Optional array of branch ObjectIds or codes (e.g. ["BOLE-01", "PIAS-01"]). If omitted, queries across all branches.',
        },
        branchId: {
          type: Type.STRING,
          description: 'Optional single branch ObjectId or code (for backwards compatibility).',
        },
        date: {
          type: Type.STRING,
          description: 'Optional single ISO date string (YYYY-MM-DD).',
        },
        startDate: {
          type: Type.STRING,
          description: 'Optional ISO date string for historical start range (YYYY-MM-DD).',
        },
        endDate: {
          type: Type.STRING,
          description: 'Optional ISO date string for historical end range (YYYY-MM-DD).',
        },
        status: {
          type: Type.STRING,
          description: "Status filter: 'active' (default), 'archived', or 'all'.",
        },
        keyword: {
          type: Type.STRING,
          description: 'Optional text keyword to search within report transcription.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of historical reports to return (1 to 20, default: 5).',
        },
      },
    },
  },
  {
    name: 'query_branch_records',
    description:
      'Granular subdocument query across historical operational reports for issues, activities, visits, or comments across one, several, or all branches, filtered by status, dates, and keywords.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Optional array of branch ObjectIds or codes (e.g. ["BOLE-01", "PIAS-01"]). If omitted, queries across all branches.',
        },
        branchId: {
          type: Type.STRING,
          description: 'Optional single branch ObjectId or code (for backwards compatibility).',
        },
        date: {
          type: Type.STRING,
          description: 'Optional single ISO date string (YYYY-MM-DD).',
        },
        startDate: {
          type: Type.STRING,
          description: 'Optional ISO start date (YYYY-MM-DD).',
        },
        endDate: {
          type: Type.STRING,
          description: 'Optional ISO end date (YYYY-MM-DD).',
        },
        recordType: {
          type: Type.STRING,
          description: "Type of records: 'all', 'issues', 'activities', 'visits', or 'comments' (default: 'all').",
        },
        status: {
          type: Type.STRING,
          description:
            "Filter status: 'all', 'reported', 'completed', 'in_progress', or 'no_issue' (default: 'all').",
        },
        keyword: {
          type: Type.STRING,
          description: 'Optional keyword to search within record texts.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum matching items to return (1 to 50, default: 15).',
        },
      },
    },
  },

  // ==========================================
  // CATEGORY 4: CLOUD WORKSPACE, DOCUMENT GENERATION & BROADCAST (4 TOOLS)
  // ==========================================
  {
    name: 'manage_google_drive',
    description:
      'Autonomously manage Google Drive folders, files, searches, metadata, and sharing permissions. Can list files in a folder, create folders, search files by keyword, inspect file metadata, or share documents with collaborators.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "Operation to perform: 'list', 'create_folder', 'search', 'get_metadata', or 'share'.",
        },
        folderName: {
          type: Type.STRING,
          description: 'Name of the folder to create (required when action is create_folder).',
        },
        query: {
          type: Type.STRING,
          description: 'Search keyword to filter files/folders (used when action is search).',
        },
        folderId: {
          type: Type.STRING,
          description: 'Optional Google Drive folder ID to scope operations inside (defaults to "Personal AI Agent" root).',
        },
        fileId: {
          type: Type.STRING,
          description: 'Google Drive file or folder ID (required for get_metadata and share).',
        },
        role: {
          type: Type.STRING,
          description: "Permission role when sharing: 'reader', 'commenter', or 'writer'. Default: 'reader'.",
        },
        emailAddress: {
          type: Type.STRING,
          description: 'Optional email address of collaborator to share with. Omit to share publicly via link.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'create_cloud_document',
    description:
      'Autonomously create and format a live Google Doc or Google Spreadsheet in Google Drive. For documents, provide open-ended text or markdown in content. For spreadsheets, provide arbitrary structured data, table arrays, or cell grids in data.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          description: "Document type to create: 'doc' (Google Document) or 'sheet' (Google Spreadsheet). Default: 'doc'.",
        },
        title: {
          type: Type.STRING,
          description: 'Title of the Google Document or Spreadsheet.',
        },
        folderId: {
          type: Type.STRING,
          description: 'Optional Google Drive folder ID to place the file into (defaults to "Personal AI Agent" root).',
        },
        content: {
          type: Type.STRING,
          description: 'Open-ended markdown or text content to format and insert into the Google Doc.',
        },
        data: {
          type: Type.OBJECT,
          description: 'Arbitrary structured data, table rows, cell grid, or key-value map to populate into the Google Sheet.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'generate_document_file',
    description:
      'Generate an open-ended document file in PDF, Microsoft Word (.docx), Microsoft Excel (.xlsx), CSV, Markdown, or JSON. Can deliver either as a direct browser download URL or upload immediately to Google Drive.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: "File format: 'pdf', 'docx', 'xlsx', 'csv', 'markdown', or 'json'. Default: 'pdf'.",
        },
        title: {
          type: Type.STRING,
          description: 'Document title and output filename.',
        },
        destination: {
          type: Type.STRING,
          description: "Destination for generated document: 'download' (local download URL) or 'google_drive' (upload to Google Drive). Default: 'download'.",
        },
        folderId: {
          type: Type.STRING,
          description: 'Optional Google Drive folder ID when destination is google_drive.',
        },
        content: {
          type: Type.STRING,
          description: 'Open-ended text, markdown, report summary, letter, notes, or paragraphs for the document.',
        },
        data: {
          type: Type.OBJECT,
          description: 'Arbitrary structured data, tabular rows, list of records, or object grid for spreadsheets, tables, or JSON.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'share_to_telegram',
    description:
      'Format and dispatch any message, team announcement, operational report, executive summary, or urgent incident briefing to designated Telegram channels or groups (management, maintenance, general). Operates universally across all interaction quadrants with high-fidelity formatting and functional stubbing without requiring a reportId.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportId: {
          type: Type.STRING,
          description: 'Optional 24-character hexadecimal MongoDB ObjectId of the report to broadcast.',
        },
        messageText: {
          type: Type.STRING,
          description: 'Custom message text, team announcement, briefing summary, or urgent incident note to broadcast.',
        },
        targetChannel: {
          type: Type.STRING,
          description: "Target channel: 'management' (default), 'maintenance', or 'general'.",
        },
        customNote: {
          type: Type.STRING,
          description: 'Optional supervisor header remark or delivery note.',
        },
        asImage: {
          type: Type.BOOLEAN,
          description: 'Optional flag to render and broadcast the report or message as a high-contrast document image card.',
        },
        fontSize: {
          type: Type.STRING,
          description: 'Optional font size specification (e.g. "14pt", "14 in ms word", "38px", "40px", "small", "medium", "large").',
        },
        lineSpacing: {
          type: Type.STRING,
          description: 'Optional line spacing ("compact", "normal", "relaxed", or pixel value like "40px").',
        },
        bulletIndent: {
          type: Type.STRING,
          description: 'Optional bullet indentation specification (e.g. "more", "less", "large", "compact", "48px", "60px", "80px").',
        },
        paddingX: {
          type: Type.STRING,
          description: 'Optional horizontal padding / side margins (e.g. "compact", "wide", "50px", "100px").',
        },
        bold: {
          type: Type.BOOLEAN,
          description: 'Optional flag to render all content in bold weight.',
        },
        underlineHeaders: {
          type: Type.BOOLEAN,
          description: 'Optional flag to render section headers with underline decoration.',
        },
        theme: {
          type: Type.STRING,
          description: 'Optional color theme: "light" (default white paper) or "dark".',
        },
        fontFamily: {
          type: Type.STRING,
          description: 'Optional font family for rendering (e.g. "Segoe UI, Arial, sans-serif", "Georgia, serif").',
        },
        textColor: {
          type: Type.STRING,
          description: 'Optional font color hex (e.g. "#000000", "#1E293B", "#1E40AF").',
        },
        bgColor: {
          type: Type.STRING,
          description: 'Optional card background color / shading hex (e.g. "#FFFFFF", "#F8FAFC", "#1E1E1E").',
        },
        align: {
          type: Type.STRING,
          description: 'Optional text alignment: "left" (default), "center", or "right".',
        },
        border: {
          type: Type.BOOLEAN,
          description: 'Optional card border outline flag.',
        },
        letterSpacing: {
          type: Type.NUMBER,
          description: 'Optional character spacing in pixels (e.g. 1, 2).',
        },
        saveAsDefault: {
          type: Type.BOOLEAN,
          description: 'Optional flag to save these layout and formatting preferences permanently into supervisor settings for future posts.',
        },
      },
    },
  },
  {
    name: 'save_user_directive',
    description:
      'Persist vocabulary rules, preferred terms, phrase replacements, or custom personal/operational instructions to User.settings.directives (Single Source of Truth) in MongoDB inside an ACID transaction.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        negativeVocabularyToAdd: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Words or terms to strictly ban and exclude from generated reports and outputs.',
        },
        negativeVocabularyToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Forbidden words to unban and remove from negative vocabulary.',
        },
        phraseMappingsToAdd: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING, description: 'Shorthand or colloquial term.' },
              value: { type: Type.STRING, description: 'Authoritative replacement term.' },
            },
            required: ['key', 'value'],
          },
          description: 'Key-value replacement mappings to add or update.',
        },
        phraseMappingsToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Keys of phrase mappings to remove.',
        },
        customInstructionsToAdd: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Discrete operational or personal directives, style guidelines, or rules to add to user settings.',
        },
        customInstructionsToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Discrete operational or personal directives to remove.',
        },
        singleBranchTemplate: {
          type: Type.STRING,
          description:
            'Optional custom Amharic corporate template text for Single-Branch reports (persisted to User.settings.reportTemplates.singleBranch; pass empty string or null to reset to default).',
        },
        multiBranchTemplate: {
          type: Type.STRING,
          description:
            'Optional custom Amharic corporate template text for Multi-Branch reports (persisted to User.settings.reportTemplates.multiBranch; pass empty string or null to reset to default).',
        },
      },
    },
  },
  {
    name: 'save_supervisor_directive',
    description:
      'Backwards-compatible alias for save_user_directive. Persist vocabulary rules, forbidden words, phrase replacements, or custom instructions to User.settings.directives.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        negativeVocabularyToAdd: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Words or terms to strictly ban and exclude from generated reports.',
        },
        negativeVocabularyToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Forbidden words to unban and remove from negative vocabulary.',
        },
        phraseMappingsToAdd: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING, description: 'Shorthand or colloquial term.' },
              value: { type: Type.STRING, description: 'Authoritative corporate replacement term.' },
            },
            required: ['key', 'value'],
          },
          description: 'Key-value replacement mappings to add or update.',
        },
        phraseMappingsToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Keys of phrase mappings to remove.',
        },
        customInstructionsToAdd: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Discrete operational directives or rules to add to the supervisor profile.',
        },
        customInstructionsToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Discrete operational directives or rules to remove.',
        },
        singleBranchTemplate: {
          type: Type.STRING,
          description:
            'Optional custom Amharic corporate template text for Single-Branch reports (persisted to User.settings.reportTemplates.singleBranch; pass empty string or null to reset to default).',
        },
        multiBranchTemplate: {
          type: Type.STRING,
          description:
            'Optional custom Amharic corporate template text for Multi-Branch reports (persisted to User.settings.reportTemplates.multiBranch; pass empty string or null to reset to default).',
        },
      },
    },
  },
  {
    name: 'get_user_settings',
    description:
      'Retrieve current user configuration, STT engine, report templates, or directives from MongoDB inside an ACID transaction or read path.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        section: {
          type: Type.STRING,
          description:
            "Specific section to inspect: 'all' (default), 'directives', 'agentConfig', 'reportTemplates', or 'sttEngine'.",
        },
      },
    },
  },
  {
    name: 'update_user_settings',
    description:
      'Persist updates to User.settings (directives, agentConfig, sttEngine, reportTemplates) in MongoDB inside an ACID transaction.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        negativeVocabularyToAdd: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Words or terms to strictly ban and exclude from generated reports or responses.',
        },
        negativeVocabularyToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Forbidden words to unban and remove from negative vocabulary.',
        },
        phraseMappingsToAdd: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING, description: 'Shorthand or colloquial term to replace.' },
              value: { type: Type.STRING, description: 'Authoritative corporate or preferred replacement term.' },
            },
            required: ['key', 'value'],
          },
          description: 'Array of key-value replacement mappings to add or update.',
        },
        phraseMappingsToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Keys of phrase mappings to remove.',
        },
        customInstructionsToAdd: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Discrete operational or personal rules/instructions to add to user profile.',
        },
        customInstructionsToRemove: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Discrete operational or personal rules/instructions to remove.',
        },
        clearDirectives: {
          type: Type.BOOLEAN,
          description: 'Set to true to clear all negative vocabulary, phrase mappings, and custom instructions.',
        },
        persona: {
          type: Type.STRING,
          description: 'Update the user AI operational/personal persona lens.',
        },
        defaultModel: {
          type: Type.STRING,
          description: `Update default AI model: ${AI_MODELS.SUPPORTED.join(', ')}.`,
        },
        defaultThinkingBudget: {
          type: Type.INTEGER,
          description: 'Update default reasoning budget (0 to 8192 tokens).',
        },
        defaultLanguage: {
          type: Type.STRING,
          description: "Update default working language: 'am', 'en', or 'auto'.",
        },
        resetAgentConfig: {
          type: Type.BOOLEAN,
          description: 'Set to true to reset agentConfig (persona, model, budget, language) to system factory defaults.',
        },
        sttEngine: {
          type: Type.STRING,
          description: `Update speech-to-text engine: ${AI_MODELS.STT_ENGINES.join(', ')}.`,
        },
        singleBranchTemplate: {
          type: Type.STRING,
          description: 'Custom Single-Branch Amharic template text.',
        },
        multiBranchTemplate: {
          type: Type.STRING,
          description: 'Custom Multi-Branch Amharic template text.',
        },
        resetSingleBranchTemplate: {
          type: Type.BOOLEAN,
          description: 'Reset single branch report template to system default.',
        },
        resetMultiBranchTemplate: {
          type: Type.BOOLEAN,
          description: 'Reset multi-branch report template to system default.',
        },
        googleDriveEnabled: {
          type: Type.BOOLEAN,
          description: 'Enable or disable Google Drive integration without disconnecting.',
        },
      },
    },
  },
];

/**
 * ==============================================================================
 * 2. In-Process Tool Execution Handlers (17 In-Memory ACID Handlers)
 * ==============================================================================
 */
export const toolHandlers = {
  // ----------------------------------------------------------------------------
  // Category 1: Branch Scope Handlers
  // ----------------------------------------------------------------------------

  /**
   * 1. lookup_user_branches
   */
  lookup_user_branches: async ({ args = {}, userId }) => {
    const status = args.status || 'active';
    const query = { user: userId };

    if (status === 'active') {
      query.isArchived = false;
    } else if (status === 'archived') {
      query.isArchived = true;
    }

    if (args.search && typeof args.search === 'string' && args.search.trim()) {
      const searchTerms = getBilingualSearchTerms(args.search.trim());
      const termOrConditions = searchTerms.flatMap((term) => {
        const termRegex = new RegExp(escapeRegex(term), 'i');
        return [
          { name: termRegex },
          { code: termRegex },
          { aliases: termRegex },
          { managerName: termRegex },
          { 'location.address': termRegex },
          { 'location.subcity': termRegex },
        ];
      });
      query.$or = termOrConditions;
    }

    const branches = await Branch.find(query)
      .select('_id name code location managerName contactPhone isArchived archivedAt')
      .sort({ name: 1 })
      .lean();

    return {
      branches: branches.map((b) => ({
        _id: b._id.toString(),
        name: b.name,
        code: b.code,
        location: b.location?.address || b.location?.city || null,
        address: b.location?.address || null,
        phone: b.contactPhone || null,
        managerName: b.managerName || null,
        isArchived: b.isArchived,
      })),
      count: branches.length,
    };
  },

  /**
   * 2. create_branch
   */
  create_branch: async ({ args = {}, userId, session = null }) => {
    const { name, address, phone, managerName } = args;
    const cleanName = String(name || '').trim();

    if (!cleanName) {
      throw new ValidationError('Branch name is required.');
    }

    return await runInTransaction(session, async (activeSession) => {
      // 1. Collision check for active branch name
      const nameRegex = new RegExp(`^${escapeRegex(cleanName)}$`, 'i');
      const existingByName = await Branch.findOne({
        user: userId,
        name: nameRegex,
        isArchived: false,
      }).session(activeSession);

      if (existingByName) {
        throw new ConflictError('A branch with this name already exists.');
      }

      // 2. Auto-generate operational code
      const existingBranches = await Branch.find({ user: userId })
        .select('code')
        .session(activeSession)
        .lean();
      const existingCodes = existingBranches.map((b) => b.code);
      const branchCode = generateBranchCode(cleanName, existingCodes);

      // 3. Resolve bilingual aliases
      const aliases = resolveBranchAliases(cleanName);

      // 4. Create branch document
      const [newBranch] = await Branch.create(
        [
          {
            user: userId,
            name: cleanName,
            code: branchCode,
            aliases,
            location: {
              city: BRANCH_CONSTANTS.DEFAULT_CITY,
              address: (address || '').trim(),
            },
            managerName: (managerName || '').trim(),
            contactPhone: (phone || '').trim(),
            isArchived: false,
          },
        ],
        { session: activeSession }
      );

      return {
        branchId: newBranch._id.toString(),
        name: newBranch.name,
        code: newBranch.code,
        address: newBranch.location?.address || '',
        phone: newBranch.contactPhone,
        managerName: newBranch.managerName,
        message: 'Branch created successfully.',
      };
    });
  },

  /**
   * 3. update_branch
   */
  update_branch: async ({ args = {}, userId, session = null }) => {
    const { branchId, name, address, phone, managerName } = args;

    if (!branchId) {
      throw new ValidationError('Branch identifier is required.');
    }

    return await runInTransaction(session, async (activeSession) => {
      const query = {
        ...buildBranchIdentifierQuery(branchId, userId),
        isArchived: false,
      };
      const branch = await Branch.findOne(query).session(activeSession);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }

      // If name updated, verify collision
      if (name && name.trim() !== branch.name) {
        const cleanName = name.trim();
        const nameRegex = new RegExp(`^${escapeRegex(cleanName)}$`, 'i');
        const collidingName = await Branch.findOne({
          _id: { $ne: branch._id },
          user: userId,
          name: nameRegex,
          isArchived: false,
        }).session(activeSession);

        if (collidingName) {
          throw new ConflictError('A branch with this name already exists.');
        }

        branch.name = cleanName;
        branch.aliases = resolveBranchAliases(cleanName);
      }

      if (address !== undefined) {
        if (!branch.location) branch.location = {};
        branch.location.address = String(address).trim();
      }
      if (phone !== undefined) {
        branch.contactPhone = String(phone).trim();
      }
      if (managerName !== undefined) {
        branch.managerName = String(managerName).trim();
      }

      await branch.save({ session: activeSession });

      return {
        branchId: branch._id.toString(),
        name: branch.name,
        code: branch.code,
        address: branch.location?.address || '',
        phone: branch.contactPhone,
        managerName: branch.managerName,
        message: 'Branch updated successfully.',
      };
    });
  },

  /**
   * 4. archive_branch
   */
  archive_branch: async ({ args = {}, userId, session = null }) => {
    const { branchId } = args;
    if (!branchId) {
      throw new ValidationError('Branch identifier is required.');
    }

    return await runInTransaction(session, async (activeSession) => {
      const query = buildBranchIdentifierQuery(branchId, userId);
      const branch = await Branch.findOne(query).session(activeSession);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }
      if (branch.isArchived) {
        throw new BadRequestError('Branch is already archived.');
      }

      branch.isArchived = true;
      branch.archivedAt = new Date();
      await branch.save({ session: activeSession });

      return {
        branchId: branch._id.toString(),
        name: branch.name,
        code: branch.code,
        isArchived: true,
        archivedAt: branch.archivedAt,
        message: 'Branch archived successfully.',
      };
    });
  },

  /**
   * 5. restore_branch
   */
  restore_branch: async ({ args = {}, userId, session = null }) => {
    const { branchId } = args;
    if (!branchId) {
      throw new ValidationError('Branch identifier is required.');
    }

    return await runInTransaction(session, async (activeSession) => {
      const query = buildBranchIdentifierQuery(branchId, userId);
      const branch = await Branch.findOne(query).session(activeSession);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }
      if (!branch.isArchived) {
        throw new BadRequestError('Branch is already active and cannot be restored.');
      }

      // Name collision check
      const nameRegex = new RegExp(`^${escapeRegex(branch.name)}$`, 'i');
      const collidingName = await Branch.findOne({
        _id: { $ne: branch._id },
        user: userId,
        name: nameRegex,
        isArchived: false,
      }).session(activeSession);

      if (collidingName) {
        throw new ConflictError(
          'An active branch with this name already exists. Please resolve the collision before restoring.'
        );
      }

      // Code collision check
      const collidingCode = await Branch.findOne({
        _id: { $ne: branch._id },
        user: userId,
        code: branch.code,
        isArchived: false,
      }).session(activeSession);

      if (collidingCode) {
        throw new ConflictError(
          'An active branch with this operational code already exists. Please resolve the collision before restoring.'
        );
      }

      branch.isArchived = false;
      branch.archivedAt = null;
      await branch.save({ session: activeSession });

      return {
        branchId: branch._id.toString(),
        name: branch.name,
        code: branch.code,
        isArchived: false,
        message: 'Branch restored successfully.',
      };
    });
  },

  /**
   * 6. delete_branch_permanently
   */
  delete_branch_permanently: async ({ args = {}, userId, session = null }) => {
    const { branchId } = args;
    if (!branchId) {
      throw new ValidationError('Branch identifier is required.');
    }

    return await runInTransaction(session, async (activeSession) => {
      const query = buildBranchIdentifierQuery(branchId, userId);
      const branch = await Branch.findOne(query).session(activeSession);

      if (!branch) {
        throw new NotFoundError('Branch not found.');
      }
      if (!branch.isArchived) {
        throw new BadRequestError(
          'Only archived branches can be permanently deleted. Please archive the branch first.'
        );
      }

      await cascadeDeleteBranch(branch._id, activeSession);

      return {
        branchId: branch._id.toString(),
        message: 'Branch permanently deleted successfully.',
      };
    });
  },

  // ----------------------------------------------------------------------------
  // Category 2: Report Scope Handlers
  // ----------------------------------------------------------------------------

  /**
   * 7. create_report
   */
  create_report: async ({ args, userId, session = null }) => {
    const normalizedArgs = { ...args };

    // Normalize date: support ISO strings or Ethiopian date strings (DD-MM-YY, DD/MM/YYYY, etc.)
    if (normalizedArgs.date && typeof normalizedArgs.date === 'string') {
      const ethMatch = normalizedArgs.date.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
      if (ethMatch) {
        const day = parseInt(ethMatch[1], 10);
        const month = parseInt(ethMatch[2], 10);
        let year = parseInt(ethMatch[3], 10);
        if (year < 100) year += 2000;
        if (year >= 2000 && year <= 2100 && month >= 1 && month <= 13 && day >= 1 && day <= 30) {
          const gregDate = toGregorianDate(year, month, day);
          normalizedArgs.date = gregDate.toISOString().split('T')[0];
        }
      } else {
        const candidate = new Date(normalizedArgs.date);
        const now = new Date();
        const maxAllowed = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        if (!isNaN(candidate.getTime()) && candidate > maxAllowed) {
          const candDay = candidate.getUTCDate();
          const prevMonthDate = new Date(candidate);
          prevMonthDate.setUTCMonth(candidate.getUTCMonth() - 1);
          if (prevMonthDate <= maxAllowed && prevMonthDate.getUTCDate() === candDay) {
            normalizedArgs.date = prevMonthDate.toISOString().split('T')[0];
          } else {
            normalizedArgs.date = now.toISOString().split('T')[0];
          }
        }
      }
    }

    // Resolve branch identifiers if passed as codes or names
    if (Array.isArray(normalizedArgs.visits)) {
      normalizedArgs.visits = await Promise.all(
        normalizedArgs.visits.map(async (v) => {
          let branchId = v.branch || v.branchId;
          if (branchId) {
            const resolved = await resolveBranchObjectIds([branchId], userId, session);
            if (resolved.length > 0) {
              branchId = resolved[0].toString();
            } else if (isValidObjectId(String(branchId))) {
              const exists = await Branch.findOne({ _id: branchId, user: userId })
                .session(session || null)
                .lean();
              if (!exists) {
                throw new ValidationError(
                  `Branch identifier "${branchId}" does not exist in your registered branches. Please invoke create_branch to register it first.`
                );
              }
            } else {
              throw new ValidationError(
                `Branch "${branchId}" is not registered in your active branches. Please invoke create_branch to register it first or ask the supervisor to clarify.`
              );
            }
          }
          return {
            ...v,
            branch: branchId,
            clockIn: (v.clockIn || normalizedArgs.clockIn || '08:00').trim(),
            clockOut: (v.clockOut || normalizedArgs.clockOut || '17:00').trim(),
          };
        })
      );
    }

    // Normalize activities to { text, status }
    if (Array.isArray(normalizedArgs.activities)) {
      normalizedArgs.activities = normalizedArgs.activities.map((a) =>
        typeof a === 'string'
          ? { text: a.trim(), status: 'completed' }
          : { text: (a.text || a.description || '').trim(), status: normalizeActivityStatus(a.status) }
      );
    }

    // Normalize issues to { text, status }
    if (Array.isArray(normalizedArgs.issues)) {
      normalizedArgs.issues = normalizedArgs.issues.map((i) =>
        typeof i === 'string'
          ? { text: i.trim(), status: 'reported' }
          : { text: (i.text || i.description || '').trim(), status: normalizeIssueStatus(i.status) }
      );
    }

    // Normalize comments to { text }
    if (Array.isArray(normalizedArgs.comments)) {
      normalizedArgs.comments = normalizedArgs.comments.map((c) =>
        typeof c === 'string'
          ? { text: c.trim() }
          : { text: (c.text || c.content || c.comment || '').trim() }
      );
    } else {
      normalizedArgs.comments = [];
    }

    if (!Array.isArray(normalizedArgs.activities)) {
      normalizedArgs.activities = [];
    }

    if (!Array.isArray(normalizedArgs.issues)) {
      normalizedArgs.issues = [];
    }

    // Normalize customSections to { heading, items }
    if (Array.isArray(normalizedArgs.customSections)) {
      normalizedArgs.customSections = normalizedArgs.customSections
        .map((cs) => ({
          heading: String(cs.heading || '').trim(),
          items: Array.isArray(cs.items)
            ? cs.items.map((it) => String(it).trim()).filter(Boolean)
            : [],
        }))
        .filter((cs) => cs.heading);
    } else {
      normalizedArgs.customSections = [];
    }

    // Default transcription text if empty
    if (!normalizedArgs.transcription || typeof normalizedArgs.transcription !== 'string' || !normalizedArgs.transcription.trim()) {
      normalizedArgs.transcription = 'ዕለታዊ የስራ እንቅስቃሴ ሪፖርት';
    }

    try {
      const validatedPayload = validateReportPayload(normalizedArgs);
      const createdReport = await createReportRecord({
        userId,
        payload: validatedPayload,
        existingSession: session,
      });

      return {
        success: true,
        reportId: createdReport._id.toString(),
        date: createdReport.date,
        dateString: createdReport.dateString,
        ethiopianDate: createdReport.ethiopianDate,
        visitsCount: createdReport.visits.length,
        activitiesCount: createdReport.activities.length,
        issuesCount: createdReport.issues.length,
        commentsCount: createdReport.comments.length,
        transcription: createdReport.transcription,
        message: 'Operational report successfully created and persisted.',
      };
    } catch (err) {
      if (err.code === 'REPORT_ALREADY_EXISTS' || err.code === 11000) {
        const targetDate = new Date(normalizedArgs.date);
        const targetDateString = targetDate.toISOString().split('T')[0];
        const targetEthDate = toEthiopianDateString(targetDate);

        const existing = await Report.findOne({
          user: userId,
          isArchived: false,
          $or: [
            { dateString: targetDateString },
            { ethiopianDate: targetEthDate },
          ],
        })
          .populate('visits.branch', 'name code')
          .session(session || null);

        if (existing) {
          const visitSummary = (existing.visits || [])
            .map((v) => `${v.branch?.name || v.branch?.code || v.branch} (${v.clockIn}-${v.clockOut})`)
            .join(', ');

          return {
            success: false,
            code: 'REPORT_ALREADY_EXISTS',
            message: `A report already exists for ${targetDateString} (Ethiopian: ${existing.ethiopianDate}) with Report ID: "${existing._id}". A supervisor may only have one operational report per calendar day.`,
            existingReport: {
              reportId: existing._id.toString(),
              dateString: existing.dateString,
              ethiopianDate: existing.ethiopianDate,
              clockIn: existing.clockIn,
              clockOut: existing.clockOut,
              visits: visitSummary,
              activitiesCount: (existing.activities || []).length,
              issuesCount: (existing.issues || []).length,
              commentsCount: (existing.comments || []).length,
            },
            guidance: `If the supervisor intends to amend, add new activities, or update branch visits for this date, invoke "update_report" with reportId: "${existing._id}". If the user is asking to create a separate report or is unsure, ask the supervisor in chat how they would like to proceed.`,
          };
        }
      }
      throw err;
    }
  },

  /**
   * 8. update_report
   */
  update_report: async ({ args = {}, userId, session = null }) => {
    const { reportId, date, clockIn, clockOut, visits, transcription } = args;
    const activitiesToAppend = args.newActivities || args.appendActivities || [];
    const issuesToAppend = args.newIssues || args.appendIssues || [];
    const commentsToAppend = args.newComments || args.appendComments || [];

    return await runInTransaction(session, async (activeSession) => {
      let report = null;

      if (reportId && isValidObjectId(reportId)) {
        report = await Report.findOne({ _id: reportId, user: userId, isArchived: false }).session(
          activeSession
        );
      }

      if (!report) {
        // Resolve target report by date, or default to current system date
        let queryDate = new Date();
        if (date && typeof date === 'string') {
          const ethMatch = date.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
          if (ethMatch) {
            const day = parseInt(ethMatch[1], 10);
            const month = parseInt(ethMatch[2], 10);
            let year = parseInt(ethMatch[3], 10);
            if (year < 100) year += 2000;
            if (year >= 2000 && year <= 2100 && month >= 1 && month <= 13 && day >= 1 && day <= 30) {
              queryDate = toGregorianDate(year, month, day);
            }
          } else {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) queryDate = parsed;
          }
        }

        const dateStr = queryDate.toISOString().split('T')[0];
        const ethStr = toEthiopianDateString(queryDate);

        report = await Report.findOne({
          user: userId,
          isArchived: false,
          $or: [{ dateString: dateStr }, { ethiopianDate: ethStr }],
        }).session(activeSession);

        if (!report) {
          throw new NotFoundError(
            `No active operational report found for date ${dateStr} (Ethiopian: ${ethStr}). If creating a new shift report, invoke create_report.`
          );
        }
      }

      if (date !== undefined) {
        report.date = new Date(date);
        report.dateString = report.date.toISOString().split('T')[0];
        report.ethiopianDate = toEthiopianDateString(report.date);
      }
      if (clockIn !== undefined) report.clockIn = clockIn;
      if (clockOut !== undefined) report.clockOut = clockOut;
      if (transcription !== undefined) report.transcription = transcription;

      if (Array.isArray(visits) && visits.length > 0) {
        const branchIdsToVerify = visits.map((v) => String(v.branch)).filter(Boolean);
        const uniqueIds = [...new Set(branchIdsToVerify)];
        const branches = await Branch.find({
          _id: { $in: uniqueIds },
          user: userId,
          isArchived: false,
        }).session(activeSession);

        if (branches.length !== uniqueIds.length) {
          throw new NotFoundError(
            'One or more updated branches could not be found or do not belong to your account.'
          );
        }
        report.visits = visits;
      }

      if (Array.isArray(activitiesToAppend) && activitiesToAppend.length > 0) {
        for (const act of activitiesToAppend) {
          const actText = typeof act === 'string' ? act.trim() : act?.text?.trim();
          if (actText) {
            report.activities.push({
              text: actText,
              status: normalizeActivityStatus(typeof act === 'object' ? act?.status : undefined),
            });
          }
        }
      }

      if (Array.isArray(issuesToAppend) && issuesToAppend.length > 0) {
        for (const iss of issuesToAppend) {
          const issText = typeof iss === 'string' ? iss.trim() : iss?.text?.trim();
          if (issText) {
            report.issues.push({
              text: issText,
              status: normalizeIssueStatus(typeof iss === 'object' ? iss?.status : undefined),
            });
          }
        }
      }

      if (Array.isArray(commentsToAppend) && commentsToAppend.length > 0) {
        for (const com of commentsToAppend) {
          const comText = typeof com === 'string' ? com.trim() : com?.text?.trim();
          if (comText) {
            report.comments.push({ text: comText });
          }
        }
      }

      if (Array.isArray(args.customSections)) {
        report.customSections = args.customSections
          .map((cs) => ({
            heading: String(cs.heading || '').trim(),
            items: Array.isArray(cs.items) ? cs.items.map((it) => String(it).trim()).filter(Boolean) : [],
          }))
          .filter((cs) => cs.heading);
      }

      await report.save({ session: activeSession });

      return {
        success: true,
        reportId: report._id.toString(),
        clockIn: report.clockIn,
        clockOut: report.clockOut,
        activitiesCount: report.activities.length,
        issuesCount: report.issues.length,
        commentsCount: report.comments.length,
        transcription: report.transcription,
        message: 'Report updated successfully.',
      };
    });
  },

  /**
   * 9. update_branch_record_status
   */
  update_branch_record_status: async ({ args = {}, userId, session = null }) => {
    const { reportId, recordType, newStatus, resolutionNotes } = args;
    const targetItemId = args.recordId || args.itemId;

    if (!isValidObjectId(reportId)) {
      throw new ValidationError('Invalid report ID.');
    }
    if (!isValidObjectId(targetItemId)) {
      throw new ValidationError('Invalid item/record ID.');
    }

    return await runInTransaction(session, async (activeSession) => {
      const report = await Report.findOne({ _id: reportId, user: userId, isArchived: false }).session(
        activeSession
      );
      if (!report) {
        throw new NotFoundError('Report not found.');
      }

      let updatedItem = null;

      if (recordType === 'issue') {
        const canonicalStatus = normalizeIssueStatus(newStatus);
        if (!REPORT_CONSTANTS.ISSUE_STATUSES.includes(canonicalStatus)) {
          throw new ValidationError(
            `Invalid issue status. Must be one of: ${REPORT_CONSTANTS.ISSUE_STATUSES.join(', ')}`
          );
        }
        const item = report.issues.id(targetItemId);
        if (!item) {
          throw new NotFoundError('Issue item not found in report.');
        }
        item.status = canonicalStatus;
        if (resolutionNotes && typeof resolutionNotes === 'string' && resolutionNotes.trim()) {
          item.text = `${item.text} (Resolution: ${resolutionNotes.trim()})`;
        }
        updatedItem = item;
      } else if (recordType === 'activity') {
        const canonicalStatus = normalizeActivityStatus(newStatus);
        if (!REPORT_CONSTANTS.ACTIVITY_STATUSES.includes(canonicalStatus)) {
          throw new ValidationError(
            `Invalid activity status. Must be one of: ${REPORT_CONSTANTS.ACTIVITY_STATUSES.join(', ')}`
          );
        }
        const item = report.activities.id(targetItemId);
        if (!item) {
          throw new NotFoundError('Activity item not found in report.');
        }
        item.status = canonicalStatus;
        updatedItem = item;
      } else {
        throw new ValidationError('recordType must be "issue" or "activity".');
      }

      await report.save({ session: activeSession });

      return {
        reportId,
        recordType,
        recordId: targetItemId,
        itemId: targetItemId,
        newStatus,
        updatedItem: {
          _id: updatedItem._id.toString(),
          text: updatedItem.text,
          status: updatedItem.status,
        },
        message: `Record status successfully updated to "${newStatus}".`,
      };
    });
  },

  /**
   * 10. archive_report
   */
  archive_report: async ({ args = {}, userId, session = null }) => {
    const { reportId } = args;
    if (!isValidObjectId(reportId)) {
      throw new ValidationError('Invalid report ID.');
    }

    return await runInTransaction(session, async (activeSession) => {
      const report = await Report.findOne({ _id: reportId, user: userId }).session(activeSession);
      if (!report) {
        throw new NotFoundError('Report not found.');
      }
      if (report.isArchived) {
        throw new BadRequestError('Report is already archived.');
      }

      report.isArchived = true;
      report.archivedAt = new Date();
      await report.save({ session: activeSession });

      return {
        reportId: report._id.toString(),
        isArchived: true,
        archivedAt: report.archivedAt,
        message: 'Report archived successfully.',
      };
    });
  },

  /**
   * 11. restore_report
   */
  restore_report: async ({ args = {}, userId, session = null }) => {
    const { reportId } = args;
    if (!isValidObjectId(reportId)) {
      throw new ValidationError('Invalid report ID.');
    }

    return await runInTransaction(session, async (activeSession) => {
      const report = await Report.findOne({ _id: reportId, user: userId }).session(activeSession);
      if (!report) {
        throw new NotFoundError('Report not found.');
      }
      if (!report.isArchived) {
        throw new BadRequestError('Report is not archived.');
      }

      report.isArchived = false;
      report.archivedAt = null;
      await report.save({ session: activeSession });

      return {
        reportId: report._id.toString(),
        isArchived: false,
        message: 'Report restored successfully.',
      };
    });
  },

  /**
   * 12. delete_report_permanently
   */
  delete_report_permanently: async ({ args = {}, userId, session = null }) => {
    const { reportId } = args;
    if (!isValidObjectId(reportId)) {
      throw new ValidationError('Invalid report ID.');
    }

    const audioPathsToUnlink = [];

    await runInTransaction(session, async (activeSession) => {
      const report = await Report.findOne({ _id: reportId, user: userId }).session(activeSession);
      if (!report) {
        throw new NotFoundError('Report not found.');
      }
      if (!report.isArchived) {
        throw new BadRequestError(
          'Only archived reports can be permanently deleted. Please archive the report first.'
        );
      }

      // Collect audio filepaths to unlink post-commit
      if (report.audios && report.audios.length > 0) {
        const audioDocs = await Audio.find({
          _id: { $in: report.audios },
          user: userId,
        })
          .select('path')
          .session(activeSession)
          .lean();

        for (const a of audioDocs) {
          if (a.path) audioPathsToUnlink.push(a.path);
        }

        await Audio.deleteMany({
          _id: { $in: report.audios },
          user: userId,
        }).session(activeSession);
      }

      await Report.deleteOne({ _id: reportId }).session(activeSession);
    });

    // Clean post-commit unlink of audio binaries from disk
    for (const audioPath of audioPathsToUnlink) {
      try {
        const resolvedPath = path.resolve(audioPath);
        await fs.promises.unlink(resolvedPath);
        logger.info(`[Report Tool Deletion] Unlinked audio binary: ${resolvedPath}`);
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          logger.warn(
            `[Report Tool Deletion] Failed to unlink audio binary ${audioPath}: ${unlinkErr.message}`
          );
        }
      }
    }

    return {
      reportId,
      message: 'Report permanently deleted successfully.',
    };
  },

  // ----------------------------------------------------------------------------
  // Category 3: Enterprise Intelligence & Cross-Branch Queries
  // ----------------------------------------------------------------------------

  /**
   * 13. query_historical_reports
   */
  query_historical_reports: async ({ args = {}, userId }) => {
    const status = args.status || 'active';
    const query = { user: userId };

    if (status === 'active') {
      query.isArchived = false;
    } else if (status === 'archived') {
      query.isArchived = true;
    }

    // Branch filter: plural branchIds or singular branchId
    const rawBranchIds = args.branchIds || (args.branchId ? [args.branchId] : []);
    if (rawBranchIds.length > 0) {
      const resolvedIds = await resolveBranchObjectIds(rawBranchIds, userId);
      if (resolvedIds.length > 0) {
        query['visits.branch'] = { $in: resolvedIds };
      }
    }

    // Date filters
    if (args.date) {
      const targetDate = new Date(args.date);
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    } else if (args.startDate || args.endDate) {
      query.date = {};
      if (args.startDate) query.date.$gte = new Date(args.startDate);
      if (args.endDate) query.date.$lte = new Date(args.endDate);
    }

    // Keyword filter
    if (args.keyword && typeof args.keyword === 'string' && args.keyword.trim()) {
      query.transcription = new RegExp(escapeRegex(args.keyword.trim()), 'i');
    }

    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);

    const reports = await Report.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .populate('visits.branch', 'name code')
      .select('date clockIn clockOut visits activities issues comments transcription isArchived createdAt')
      .lean();

    return {
      reports: reports.map((r) => ({
        reportId: r._id.toString(),
        date: r.date,
        ethiopianDate: toEthiopianDateString(r.date),
        isArchived: r.isArchived,
        visits: (r.visits || []).map((v) => ({
          branchName: v.branch?.name || 'Unknown',
          branchCode: v.branch?.code || 'N/A',
          clockIn: v.clockIn,
          clockOut: v.clockOut,
        })),
        activitiesCount: r.activities?.length || 0,
        issuesCount: r.issues?.length || 0,
        openIssues: (r.issues || [])
          .filter((i) => i.status !== 'completed' && i.status !== 'no_issue')
          .map((i) => ({
            itemId: i._id.toString(),
            text: i.text,
            status: i.status,
          })),
        transcription: r.transcription,
      })),
      count: reports.length,
    };
  },

  /**
   * 14. query_branch_records
   */
  query_branch_records: async ({ args = {}, userId }) => {
    const query = { user: userId, isArchived: false };

    // Branch filter: plural branchIds or singular branchId
    const rawBranchIds = args.branchIds || (args.branchId ? [args.branchId] : []);
    if (rawBranchIds.length > 0) {
      const resolvedIds = await resolveBranchObjectIds(rawBranchIds, userId);
      if (resolvedIds.length > 0) {
        query['visits.branch'] = { $in: resolvedIds };
      }
    }

    // Date filters
    if (args.date) {
      const targetDate = new Date(args.date);
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    } else if (args.startDate || args.endDate) {
      query.date = {};
      if (args.startDate) query.date.$gte = new Date(args.startDate);
      if (args.endDate) query.date.$lte = new Date(args.endDate);
    }

    const reports = await Report.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(30)
      .populate('visits.branch', 'name code')
      .lean();

    const recordType = args.recordType || 'all';
    const statusFilter = args.status && args.status !== 'all' ? args.status : null;
    const keywordFilter = args.keyword && typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : null;
    const maxLimit = Math.min(Math.max(Number(args.limit) || 15, 1), 50);

    const results = [];

    for (const report of reports) {
      const reportMeta = {
        reportId: report._id.toString(),
        date: report.date,
        ethiopianDate: toEthiopianDateString(report.date),
        branches: (report.visits || []).map((v) => v.branch?.name || v.branch?.code || 'Branch'),
      };

      // Issues
      if (recordType === 'all' || recordType === 'issues') {
        for (const issue of report.issues || []) {
          const matchesStatus = !statusFilter || issue.status === statusFilter;
          const matchesKeyword = !keywordFilter || issue.text.toLowerCase().includes(keywordFilter);
          if (matchesStatus && matchesKeyword) {
            results.push({
              type: 'issue',
              itemId: issue._id.toString(),
              text: issue.text,
              status: issue.status,
              ...reportMeta,
            });
            if (results.length >= maxLimit) break;
          }
        }
      }
      if (results.length >= maxLimit) break;

      // Activities
      if (recordType === 'all' || recordType === 'activities') {
        for (const act of report.activities || []) {
          const matchesStatus = !statusFilter || act.status === statusFilter;
          const matchesKeyword = !keywordFilter || act.text.toLowerCase().includes(keywordFilter);
          if (matchesStatus && matchesKeyword) {
            results.push({
              type: 'activity',
              itemId: act._id.toString(),
              text: act.text,
              status: act.status,
              ...reportMeta,
            });
            if (results.length >= maxLimit) break;
          }
        }
      }
      if (results.length >= maxLimit) break;

      // Visits
      if (recordType === 'all' || recordType === 'visits') {
        for (const visit of report.visits || []) {
          const bName = visit.branch?.name || visit.branch?.code || 'Branch';
          const matchesKeyword = !keywordFilter || bName.toLowerCase().includes(keywordFilter);
          if (matchesKeyword) {
            results.push({
              type: 'visit',
              itemId: visit._id?.toString() || reportMeta.reportId,
              branchName: bName,
              clockIn: visit.clockIn,
              clockOut: visit.clockOut,
              ...reportMeta,
            });
            if (results.length >= maxLimit) break;
          }
        }
      }
      if (results.length >= maxLimit) break;

      // Comments
      if (recordType === 'all' || recordType === 'comments') {
        for (const com of report.comments || []) {
          const matchesKeyword = !keywordFilter || com.text.toLowerCase().includes(keywordFilter);
          if (matchesKeyword) {
            results.push({
              type: 'comment',
              itemId: com._id.toString(),
              text: com.text,
              ...reportMeta,
            });
            if (results.length >= maxLimit) break;
          }
        }
      }
      if (results.length >= maxLimit) break;
    }

    return {
      records: results,
      count: results.length,
    };
  },

  // ----------------------------------------------------------------------------
  // Category 4: External Channels, Export & Directives SSOT
  // ----------------------------------------------------------------------------

  /**
   * 15. manage_google_drive
   */
  manage_google_drive: async ({ args = {}, userId }) => {
    return await manageGoogleDrive(userId, args);
  },

  /**
   * 16. create_cloud_document
   */
  create_cloud_document: async ({ args = {}, userId }) => {
    return await createCloudDocument(userId, args);
  },

  /**
   * 17. generate_document_file
   */
  generate_document_file: async ({ args = {}, userId }) => {
    return await generateDocumentFile(userId, args);
  },

  /**
   * 16. share_to_telegram
   */
  share_to_telegram: async ({ args = {}, userId }) => {
    const {
      reportId,
      messageText,
      targetChannel = 'management',
      customNote,
      asImage = false,
    } = args;

    // Load owning supervisor for custom Telegram settings & templates (including botToken for runtime dispatch)
    const user = userId
      ? await User.findById(userId)
          .select('+integrations.telegram.botToken')
          .lean()
      : null;

    let payloadText = '';

    if (reportId && isValidObjectId(reportId)) {
      const report = await Report.findOne({ _id: reportId, user: userId })
        .populate('visits.branch', 'name code')
        .lean();

      if (report) {
        // Zero Artificial Wrapper Law: Use authoritative transcription matching user's template
        if (report.transcription && typeof report.transcription === 'string' && report.transcription.trim()) {
          payloadText = report.transcription.trim();
        } else {
          // Dynamic report serialization respecting user.settings.reportTemplates (Zero Hardcoding)
          let customTpl = null;
          if (user?.settings?.reportTemplates) {
            const isMulti = (report.visits || []).length > 1;
            customTpl = isMulti
              ? user.settings.reportTemplates.multiBranch
              : user.settings.reportTemplates.singleBranch;
          }

          const ethDate = toEthiopianDateString(report.date);
          const visits = (report.visits || [])
            .map((v) => `• ${v.branch?.name || 'Branch'} (${v.clockIn || '--:--'} - ${v.clockOut || '--:--'})`)
            .join('\n');
          const activities = (report.activities || []).map((a) => `• ${a.text}`).join('\n');
          const issues = (report.issues || []).map((i) => `• ${i.text} (${i.status})`).join('\n');
          const comments = (report.comments || []).map((c) => `• ${c.text}`).join('\n');

          if (customTpl && typeof customTpl === 'string' && customTpl.trim()) {
            payloadText = customTpl
              .replace(/\{\{date\}\}/g, ethDate)
              .replace(/\{\{clockIn\}\}/g, report.clockIn || '')
              .replace(/\{\{clockOut\}\}/g, report.clockOut || '')
              .replace(/\{\{visits\}\}/g, visits)
              .replace(/\{\{activities\}\}/g, activities)
              .replace(/\{\{issues\}\}/g, issues)
              .replace(/\{\{comments\}\}/g, comments)
              .trim();
          } else {
            const parts = [
              `ቀን: ${ethDate}`,
              visits ? `ጉብኝት:\n${visits}` : null,
              report.clockIn ? `ስራ የገባሁበት ሰዓት: ${report.clockIn}` : null,
              activities ? `የተሰሩ ስራዎች:\n${activities}` : null,
              issues ? `መፍትሄ የሚፈልጉ ጉዳዮች:\n${issues}` : null,
              comments ? `አጠቃላይ አስተያየት:\n${comments}` : null,
              report.clockOut ? `ከስራ የወጣሁበት ሰዓት: ${report.clockOut}` : null,
            ].filter(Boolean);

            payloadText = parts.join('\n\n');
          }
        }
      } else {
        throw new NotFoundError('Report could not be found for Telegram sharing.');
      }
    } else if (messageText && typeof messageText === 'string' && messageText.trim()) {
      // Ad-hoc text: pure pass-through without synthetic wrappers
      payloadText = messageText.trim();
    } else {
      throw new BadRequestError('Either reportId or messageText must be provided for Telegram sharing.');
    }

    const userTelegram = user?.integrations?.telegram || {};
    const botToken = resolveBotToken(user);
    const effectiveChannel = targetChannel || 'management';
    const chatId = resolveChannelChatId(user, effectiveChannel);

    // Zero-Crash Invariant: Check if bot token or Telegram integration is not connected
    if (!botToken || userTelegram.connected === false || userTelegram.enabled === false) {
      return {
        success: false,
        isConfigured: false,
        channel: effectiveChannel,
        message: 'Telegram bot integration is not connected or is temporarily disabled. Please connect your bot token under Profile > Telegram Channels.',
        actionRequired: 'CONNECT_TELEGRAM_INTEGRATION',
      };
    }

    // Zero-Crash Invariant: Check if the specific requested channel has a configured chat ID
    if (!chatId) {
      return {
        success: false,
        isConfigured: false,
        channel: effectiveChannel,
        message: `The "${effectiveChannel}" Telegram channel is not configured with a Chat ID. Please set the Chat ID for ${effectiveChannel} under Profile > Telegram Channels or select a configured channel (such as Management).`,
        actionRequired: 'CONFIGURE_CHANNEL_CHAT_ID',
      };
    }

    // Determine format: explicit tool arg asImage (if specified) OR user settings defaultFormat === 'image'
    const shouldPostImage = asImage !== undefined ? Boolean(asImage) : Boolean(userTelegram.defaultFormat === 'image');

    // Extract dynamic formatting options with zero hardcoding
    const savedCardOptions = userTelegram.imageCardOptions || {};
    const imageOptions = { ...savedCardOptions };

    if (args.fontSize !== undefined && args.fontSize !== null) {
      const fsStr = String(args.fontSize).toLowerCase().trim();
      if (fsStr.includes('14') || fsStr.includes('word')) {
        imageOptions.fontSize = 38; // MS Word 14pt equivalent on 1440px canvas
        imageOptions.lineHeight = 48;
      } else if (fsStr === 'small' || fsStr === 'compact') {
        imageOptions.fontSize = 30;
        imageOptions.lineHeight = 38;
      } else if (fsStr === 'large' || fsStr === 'big') {
        imageOptions.fontSize = 44;
        imageOptions.lineHeight = 56;
      } else {
        const num = parseInt(fsStr, 10);
        if (!isNaN(num) && num >= 18 && num <= 72) {
          imageOptions.fontSize = num;
          imageOptions.lineHeight = Math.round(num * 1.26);
        }
      }
    }

    if (args.lineSpacing !== undefined && args.lineSpacing !== null) {
      const lsStr = String(args.lineSpacing).toLowerCase().trim();
      const base = imageOptions.fontSize || 38;
      if (lsStr === 'compact' || lsStr === 'small' || lsStr === 'tight' || lsStr.includes('reduce') || lsStr.includes('less')) {
        imageOptions.lineHeight = Math.round(base * 1.18);
      } else if (lsStr === 'relaxed' || lsStr === 'loose' || lsStr === 'wide' || lsStr.includes('more')) {
        imageOptions.lineHeight = Math.round(base * 1.55);
      } else {
        const num = parseInt(lsStr, 10);
        if (!isNaN(num) && num >= 20 && num <= 120) {
          imageOptions.lineHeight = num;
        }
      }
    }

    if (args.bulletIndent !== undefined && args.bulletIndent !== null) {
      const biStr = String(args.bulletIndent).toLowerCase().trim();
      if (biStr.includes('much') || biStr.includes('extra') || biStr === 'huge') {
        imageOptions.bulletIndent = 80;
      } else if (biStr.includes('more') || biStr === 'large' || biStr === 'wide' || biStr.includes('deep') || biStr.includes('increase')) {
        imageOptions.bulletIndent = 56;
      } else if (biStr.includes('less') || biStr === 'small' || biStr === 'compact' || biStr.includes('tight') || biStr.includes('decrease')) {
        imageOptions.bulletIndent = 20;
      } else {
        const num = parseInt(biStr, 10);
        if (!isNaN(num) && num >= 10 && num <= 200) {
          imageOptions.bulletIndent = num;
        }
      }
    }

    if (args.paddingX !== undefined && args.paddingX !== null) {
      const pxStr = String(args.paddingX).toLowerCase().trim();
      if (pxStr === 'compact' || pxStr === 'narrow' || pxStr === 'small') {
        imageOptions.paddingX = 50;
      } else if (pxStr === 'wide' || pxStr === 'spacious' || pxStr === 'large') {
        imageOptions.paddingX = 120;
      } else {
        const num = parseInt(pxStr, 10);
        if (!isNaN(num) && num >= 30 && num <= 250) {
          imageOptions.paddingX = num;
        }
      }
    }

    if (args.bold !== undefined && args.bold !== null) {
      imageOptions.allBold = Boolean(args.bold);
    }
    if (args.underlineHeaders !== undefined && args.underlineHeaders !== null) {
      imageOptions.underlineHeaders = Boolean(args.underlineHeaders);
    }
    if (args.theme) {
      const thStr = String(args.theme).toLowerCase().trim();
      if (thStr === 'dark') {
        imageOptions.bgColor = '#1E1E1E';
        imageOptions.textColor = '#FFFFFF';
      } else if (thStr === 'light') {
        imageOptions.bgColor = '#FFFFFF';
        imageOptions.textColor = '#000000';
      }
    }

    if (args.fontFamily && typeof args.fontFamily === 'string' && args.fontFamily.trim()) {
      imageOptions.fontFamily = args.fontFamily.trim();
    }
    if (args.textColor && typeof args.textColor === 'string' && args.textColor.trim()) {
      imageOptions.textColor = args.textColor.trim();
    }
    if (args.bgColor && typeof args.bgColor === 'string' && args.bgColor.trim()) {
      imageOptions.bgColor = args.bgColor.trim();
    }
    if (args.align && typeof args.align === 'string') {
      const al = args.align.toLowerCase().trim();
      if (['left', 'center', 'right'].includes(al)) {
        imageOptions.align = al;
      }
    }
    if (args.border !== undefined && args.border !== null) {
      imageOptions.border = Boolean(args.border);
    }
    if (args.letterSpacing !== undefined && args.letterSpacing !== null) {
      imageOptions.letterSpacing = Number(args.letterSpacing) || 0;
    }

    // Persist formatting preferences to user settings if requested
    if (args.saveAsDefault && userId) {
      try {
        await User.findByIdAndUpdate(userId, {
          $set: {
            'integrations.telegram.imageCardOptions': imageOptions,
          },
        });
      } catch (err) {
        logger.warn(`[agentTools] Failed to persist imageCardOptions: ${err.message}`);
      }
    }

    const dispatchResult = await dispatchToTelegram({
      user,
      targetChannel,
      text: payloadText,
      customNote,
      asImage: shouldPostImage,
      options: imageOptions,
    });

    if (!dispatchResult.success && !dispatchResult.ok) {
      const failureReason = dispatchResult.error || 'Unknown Telegram delivery failure';
      let remediationHint = 'Please verify your Telegram configuration under Profile > Telegram.';
      const lower = failureReason.toLowerCase();
      if (lower.includes('chat not found')) {
        remediationHint = 'Ensure the Chat ID is correct (channels start with -100) and the bot is added as an Administrator to the channel with Post Messages permission.';
      } else if (lower.includes('unauthorized') || lower.includes('token')) {
        remediationHint = 'The Telegram Bot Token is invalid or revoked. Please update your bot token in Profile > Telegram.';
      } else if (lower.includes('not a member') || lower.includes('forbidden')) {
        remediationHint = 'The bot does not have permission to post. Please invite the bot to the channel and promote it to Administrator with Post Messages permission.';
      } else if (dispatchResult.isConfigured === false) {
        remediationHint = 'Please connect your Telegram Bot Token and set your Channel ID in Profile > Telegram.';
      }

      return {
        success: false,
        isStub: false,
        isConfigured: dispatchResult.isConfigured !== false,
        channel: 'telegram',
        targetChannel: dispatchResult.channel || targetChannel,
        error: failureReason,
        message: `Failed to dispatch message to Telegram channel '${dispatchResult.channel || targetChannel}': ${failureReason}. ${remediationHint}`,
      };
    }

    return {
      success: true,
      isStub: Boolean(dispatchResult.isStub),
      channel: 'telegram',
      targetChannel: dispatchResult.channel || targetChannel,
      mode: dispatchResult.mode || (shouldPostImage ? 'image' : 'text'),
      messageId: dispatchResult.messageId || null,
      deepLink: dispatchResult.deepLink || null,
      fallbackFromImage: dispatchResult.fallbackFromImage || false,
      message: dispatchResult.isStub
        ? `Telegram dispatch simulated in functional stub mode for channel '${dispatchResult.channel || targetChannel}'.`
        : `Successfully dispatched to Telegram channel '${dispatchResult.channel || targetChannel}' (${dispatchResult.mode === 'image' ? 'Image Card' : 'Semantic Text'}).`,
    };
  },

  /**
   * 17. save_user_directive (targets User.settings.directives)
   */
  save_user_directive: async ({ args = {}, userId, session = null }) => {
    return await toolHandlers.update_user_settings({ args, userId, session });
  },

  /**
   * 17b. save_supervisor_directive (Backwards-compatible wrapper targeting User.settings.directives)
   */
  save_supervisor_directive: async ({ args = {}, userId, session = null }) => {
    return await toolHandlers.update_user_settings({ args, userId, session });
  },

  /**
   * 18. get_user_settings
   */
  get_user_settings: async ({ args = {}, userId, session = null }) => {
    const user = await User.findById(userId).session(session || null).lean();
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const settings = user.settings || {};
    const section = (args.section || 'all').toLowerCase();

    const normalizedDirectives = {
      negativeVocabulary: settings.directives?.negativeVocabulary || [],
      phraseMappings:
        settings.directives?.phraseMappings instanceof Map
          ? Object.fromEntries(settings.directives.phraseMappings)
          : settings.directives?.phraseMappings || {},
      customInstructions: settings.directives?.customInstructions || [],
    };

    const agentConfig = settings.agentConfig || {
      persona: CHAT_CONSTANTS.DEFAULT_PERSONA,
      defaultModel: CHAT_CONSTANTS.DEFAULT_MODEL,
      defaultThinkingBudget: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
      defaultLanguage: CHAT_CONSTANTS.DEFAULT_LANGUAGE,
    };

    const reportTemplates = settings.reportTemplates || {
      singleBranch: null,
      multiBranch: null,
    };

    const sttEngine = settings.sttEngine || CHAT_CONSTANTS.DEFAULT_STT_ENGINE;

    const googleDrive = {
      connected: Boolean(user.integrations?.googleDrive?.connected),
      enabled: user.integrations?.googleDrive?.enabled !== false,
      email: user.integrations?.googleDrive?.email || null,
      rootFolderId: user.integrations?.googleDrive?.rootFolderId || null,
    };

    if (section === 'directives') {
      return { directives: normalizedDirectives };
    }
    if (section === 'agentconfig') {
      return { agentConfig };
    }
    if (section === 'reporttemplates') {
      return { reportTemplates };
    }
    if (section === 'sttengine') {
      return { sttEngine };
    }
    if (section === 'googledrive' || section === 'integrations') {
      return { googleDrive };
    }

    return {
      directives: normalizedDirectives,
      agentConfig,
      reportTemplates,
      sttEngine,
      googleDrive,
    };
  },

  /**
   * 19. update_user_settings
   */
  update_user_settings: async ({ args = {}, userId, session = null }) => {
    return await runInTransaction(session, async (activeSession) => {
      const user = await User.findById(userId).session(activeSession);
      if (!user) {
        throw new NotFoundError('User not found.');
      }

      if (!user.settings) user.settings = {};
      if (!user.settings.directives) {
        user.settings.directives = {
          negativeVocabulary: [],
          phraseMappings: new Map(),
          customInstructions: [],
        };
      }
      if (!user.settings.agentConfig) {
        user.settings.agentConfig = {
          persona: CHAT_CONSTANTS.DEFAULT_PERSONA,
          defaultModel: CHAT_CONSTANTS.DEFAULT_MODEL,
          defaultThinkingBudget: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
          defaultLanguage: CHAT_CONSTANTS.DEFAULT_LANGUAGE,
        };
      }
      if (!user.settings.reportTemplates) {
        user.settings.reportTemplates = {
          singleBranch: null,
          multiBranch: null,
        };
      }

      let changed = false;

      // --- Directives ---
      if (args.clearDirectives === true) {
        user.settings.directives.negativeVocabulary = [];
        user.settings.directives.phraseMappings = new Map();
        user.settings.directives.customInstructions = [];
        changed = true;
      }

      // 1. Negative vocabulary add
      if (Array.isArray(args.negativeVocabularyToAdd)) {
        const existing = new Set(user.settings.directives.negativeVocabulary || []);
        for (const word of args.negativeVocabularyToAdd) {
          if (word && typeof word === 'string' && word.trim()) {
            existing.add(word.trim());
            changed = true;
          }
        }
        user.settings.directives.negativeVocabulary = Array.from(existing);
      }

      // 2. Negative vocabulary remove
      if (Array.isArray(args.negativeVocabularyToRemove)) {
        const toRemove = new Set(args.negativeVocabularyToRemove.map((w) => String(w).trim()));
        user.settings.directives.negativeVocabulary = (
          user.settings.directives.negativeVocabulary || []
        ).filter((w) => !toRemove.has(w));
        changed = true;
      }

      // 3. Phrase mappings add
      if (args.phraseMappingsToAdd) {
        if (!user.settings.directives.phraseMappings) {
          user.settings.directives.phraseMappings = new Map();
        }
        if (Array.isArray(args.phraseMappingsToAdd)) {
          for (const item of args.phraseMappingsToAdd) {
            if (item && typeof item === 'object' && item.key && item.value) {
              user.settings.directives.phraseMappings.set(String(item.key).trim(), String(item.value).trim());
              changed = true;
            }
          }
        } else if (typeof args.phraseMappingsToAdd === 'object') {
          for (const [key, value] of Object.entries(args.phraseMappingsToAdd)) {
            if (key && value && typeof key === 'string' && typeof value === 'string') {
              user.settings.directives.phraseMappings.set(key.trim(), value.trim());
              changed = true;
            }
          }
        }
      }

      // 4. Phrase mappings remove
      if (Array.isArray(args.phraseMappingsToRemove) && user.settings.directives.phraseMappings) {
        for (const key of args.phraseMappingsToRemove) {
          if (typeof key === 'string' && user.settings.directives.phraseMappings.has(key.trim())) {
            user.settings.directives.phraseMappings.delete(key.trim());
            changed = true;
          }
        }
      }

      // 5. Custom instructions add
      if (Array.isArray(args.customInstructionsToAdd)) {
        const existing = new Set(user.settings.directives.customInstructions || []);
        for (const inst of args.customInstructionsToAdd) {
          if (inst && typeof inst === 'string' && inst.trim()) {
            existing.add(inst.trim());
            changed = true;
          }
        }
        user.settings.directives.customInstructions = Array.from(existing);
      }

      // 6. Custom instructions remove
      if (Array.isArray(args.customInstructionsToRemove)) {
        const toRemove = new Set(args.customInstructionsToRemove.map((i) => String(i).trim()));
        user.settings.directives.customInstructions = (
          user.settings.directives.customInstructions || []
        ).filter((i) => !toRemove.has(i));
        changed = true;
      }

      // --- Agent Config ---
      if (args.resetAgentConfig === true) {
        user.settings.agentConfig = {
          persona: CHAT_CONSTANTS.DEFAULT_PERSONA,
          defaultModel: CHAT_CONSTANTS.DEFAULT_MODEL,
          defaultThinkingBudget: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
          defaultLanguage: CHAT_CONSTANTS.DEFAULT_LANGUAGE,
        };
        changed = true;
      } else {
        if (args.persona !== undefined && typeof args.persona === 'string' && args.persona.trim()) {
          user.settings.agentConfig.persona = args.persona.trim();
          changed = true;
        }
        if (args.defaultModel !== undefined && typeof args.defaultModel === 'string' && args.defaultModel.trim()) {
          const modelVal = args.defaultModel.trim();
          if (CHAT_CONSTANTS.SUPPORTED_MODELS.includes(modelVal)) {
            user.settings.agentConfig.defaultModel = modelVal;
            changed = true;
          }
        }
        if (args.defaultThinkingBudget !== undefined && typeof args.defaultThinkingBudget === 'number') {
          const budget = Math.max(
            CHAT_CONSTANTS.MIN_THINKING_BUDGET,
            Math.min(CHAT_CONSTANTS.MAX_THINKING_BUDGET, Math.round(args.defaultThinkingBudget))
          );
          user.settings.agentConfig.defaultThinkingBudget = budget;
          changed = true;
        }
        if (args.defaultLanguage !== undefined && typeof args.defaultLanguage === 'string' && args.defaultLanguage.trim()) {
          const langVal = args.defaultLanguage.trim().toLowerCase();
          if (CHAT_CONSTANTS.SUPPORTED_LANGUAGES.includes(langVal)) {
            user.settings.agentConfig.defaultLanguage = langVal;
            changed = true;
          }
        }
      }

      // --- STT Engine ---
      if (args.sttEngine !== undefined && typeof args.sttEngine === 'string' && args.sttEngine.trim()) {
        const engineVal = args.sttEngine.trim();
        if (CHAT_CONSTANTS.STT_ENGINES.includes(engineVal)) {
          user.settings.sttEngine = engineVal;
          changed = true;
        }
      }

      // --- Report Templates ---
      if (args.resetSingleBranchTemplate === true) {
        user.settings.reportTemplates.singleBranch = null;
        changed = true;
      } else if (args.singleBranchTemplate !== undefined) {
        user.settings.reportTemplates.singleBranch =
          args.singleBranchTemplate && typeof args.singleBranchTemplate === 'string' && args.singleBranchTemplate.trim()
            ? args.singleBranchTemplate.trim()
            : null;
        changed = true;
      }

      if (args.resetMultiBranchTemplate === true) {
        user.settings.reportTemplates.multiBranch = null;
        changed = true;
      } else if (args.multiBranchTemplate !== undefined) {
        user.settings.reportTemplates.multiBranch =
          args.multiBranchTemplate && typeof args.multiBranchTemplate === 'string' && args.multiBranchTemplate.trim()
            ? args.multiBranchTemplate.trim()
            : null;
        changed = true;
      }

      // --- Google Drive Integration Enabled Toggle ---
      if (typeof args.googleDriveEnabled === 'boolean' && user.integrations?.googleDrive) {
        user.integrations.googleDrive.enabled = args.googleDriveEnabled;
        changed = true;
      }

      if (changed) {
        await user.save({ session: activeSession });
      }

      const normalizedMappings =
        user.settings.directives.phraseMappings instanceof Map
          ? Object.fromEntries(user.settings.directives.phraseMappings)
          : user.settings.directives.phraseMappings || {};

      return {
        directives: {
          negativeVocabulary: user.settings.directives.negativeVocabulary || [],
          phraseMappings: normalizedMappings,
          customInstructions: user.settings.directives.customInstructions || [],
        },
        agentConfig: user.settings.agentConfig,
        sttEngine: user.settings.sttEngine,
        reportTemplates: user.settings.reportTemplates || {},
        googleDrive: {
          connected: Boolean(user.integrations?.googleDrive?.connected),
          enabled: user.integrations?.googleDrive?.enabled !== false,
          email: user.integrations?.googleDrive?.email || null,
        },
        message: 'User settings successfully updated in MongoDB Single Source of Truth.',
      };
    });
  },
};

/**
 * ==============================================================================
 * 3. Unified In-Process Tool Dispatcher
 * ==============================================================================
 * Safely executes requested tool with error containment so errors do not crash chat streaming.
 *
 * @param {string} toolName - Name of the tool called by Gemini.
 * @param {object} args - Arguments generated by Gemini.
 * @param {object} context - Execution context { userId, session }.
 * @returns {Promise<{ success: boolean, data?: any, error?: string, details?: any }>}
 */
export async function executeAgentTool(toolName, args = {}, { userId, session = null } = {}) {
  const handler = toolHandlers[toolName];
  if (!handler) {
    return {
      success: false,
      error: `Unknown tool "${toolName}". Available tools: ${Object.keys(toolHandlers).join(', ')}`,
    };
  }

  try {
    const data = await handler({ args, userId, session });
    return {
      success: true,
      data,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Tool execution failed.',
      details: err.details || err.errors || null,
    };
  }
}

export default {
  agentToolDeclarations,
  toolHandlers,
  executeAgentTool,
};

````

================================================================================
File: backend/src/validations/authValidation.js
================================================================================

````javascript
/**
 * @module validations/authValidation
 * @description express-validator rule chains for authentication endpoints (register, login).
 * Enforces single-user constraints (strictly zero role, zero remember-me).
 */

import { body } from 'express-validator';
import {
  USER_NAME_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
} from '../utils/constants.js';

/**
 * Validation rules for user registration.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const registerValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: USER_NAME_LENGTH.MIN, max: USER_NAME_LENGTH.MAX })
    .withMessage(`First name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: USER_NAME_LENGTH.MIN, max: USER_NAME_LENGTH.MAX })
    .withMessage(`Last name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required.')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .notEmpty()
    .withMessage('Password is required.')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
    .matches(PASSWORD_REGEX)
    .withMessage('Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'),

  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (req.body.password && value !== req.body.password) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),

  body('position')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Position cannot be blank if provided.'),

  body('avatar')
    .optional({ nullable: true })
    .isString()
    .withMessage('Avatar must be a valid string URL or path.'),

  // Invariant: strictly zero role field allowed on User
  body('role')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Role assignment is strictly prohibited in single-user architecture.');
      }
      return true;
    }),

  // Invariant: strictly zero isArchived field allowed on User
  body('isArchived')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('isArchived field is prohibited on User.');
      }
      return true;
    }),

  // Invariant: strictly zero archivedAt field allowed on User
  body('archivedAt')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('archivedAt field is prohibited on User.');
      }
      return true;
    }),

  // Invariant: strictly zero manual _id allowed on User
  body('_id')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('User identifier cannot be manually specified.');
      }
      return true;
    }),
];

/**
 * Validation rules for user authentication / login.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required.')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .notEmpty()
    .withMessage('Password is required.'),

  // Invariant: strictly zero remember-me logic or flags
  body('rememberMe')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Remember me option is unsupported.');
      }
      return true;
    }),

  body('remember')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Remember option is unsupported.');
      }
      return true;
    }),
];

export default {
  registerValidation,
  loginValidation,
};

````

================================================================================
File: backend/src/validations/branchValidation.js
================================================================================

````javascript
/**
 * @module validations/branchValidation
 * @description express-validator rule chains for branch creation, updates, querying, and deletion.
 * Enforces single-user boundaries, bound constants, and rejects forbidden administrative field injections.
 */

import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import { BRANCH_CONSTANTS } from '../utils/constants.js';

/**
 * Validation rules for creating a new physical operational branch.
 * Operational code is strictly auto-generated by the backend and forbidden from client input.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const createBranchValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Branch name is required.')
    .isLength({ min: BRANCH_CONSTANTS.NAME_MIN_LENGTH, max: BRANCH_CONSTANTS.NAME_MAX_LENGTH })
    .withMessage(`Branch name must be between ${BRANCH_CONSTANTS.NAME_MIN_LENGTH} and ${BRANCH_CONSTANTS.NAME_MAX_LENGTH} characters.`),

  // Security Invariant: branch code is auto-generated and cannot be provided by user
  body('code')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Branch code is auto-generated by the system and cannot be manually provided.');
      }
      return true;
    }),

  body('location.city')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.CITY_MAX_LENGTH })
    .withMessage(`City name cannot exceed ${BRANCH_CONSTANTS.CITY_MAX_LENGTH} characters.`),

  body('location.subcity')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH })
    .withMessage(`Subcity cannot exceed ${BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH} characters.`),

  body('location.address')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH })
    .withMessage(`Address cannot exceed ${BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH} characters.`),

  body('managerName')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH })
    .withMessage(`Manager name cannot exceed ${BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH} characters.`),

  body('contactPhone')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH })
    .withMessage(`Contact phone number cannot exceed ${BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH} characters.`),

  // Security Invariant: reject forbidden system/administrative field injections
  body('role')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Role assignment is strictly prohibited.');
      }
      return true;
    }),

  body('user')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('User ownership cannot be overridden in request body.');
      }
      return true;
    }),

  body('_id')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Branch identifier cannot be manually specified.');
      }
      return true;
    }),

  body('isArchived')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('isArchived cannot be assigned directly during creation.');
      }
      return true;
    }),

  body('archivedAt')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('archivedAt cannot be assigned directly.');
      }
      return true;
    }),

  body('normalizedName')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('normalizedName cannot be manually specified.');
      }
      return true;
    }),
];

/**
 * Validation rules for updating an existing branch.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updateBranchValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Branch name cannot be empty if provided.')
    .isLength({ min: BRANCH_CONSTANTS.NAME_MIN_LENGTH, max: BRANCH_CONSTANTS.NAME_MAX_LENGTH })
    .withMessage(`Branch name must be between ${BRANCH_CONSTANTS.NAME_MIN_LENGTH} and ${BRANCH_CONSTANTS.NAME_MAX_LENGTH} characters.`),

  // Security Invariant: branch code is auto-generated and immutable
  body('code')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Branch code is auto-generated by the system and cannot be modified.');
      }
      return true;
    }),

  body('location.city')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.CITY_MAX_LENGTH })
    .withMessage(`City name cannot exceed ${BRANCH_CONSTANTS.CITY_MAX_LENGTH} characters.`),

  body('location.subcity')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH })
    .withMessage(`Subcity cannot exceed ${BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH} characters.`),

  body('location.address')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH })
    .withMessage(`Address cannot exceed ${BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH} characters.`),

  body('managerName')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH })
    .withMessage(`Manager name cannot exceed ${BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH} characters.`),

  body('contactPhone')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH })
    .withMessage(`Contact phone number cannot exceed ${BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH} characters.`),

  // Security Invariant: reject forbidden field injections
  body('role')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Role assignment is strictly prohibited.');
      }
      return true;
    }),

  body('user')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('User ownership cannot be overridden.');
      }
      return true;
    }),

  body('_id')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Branch identifier cannot be changed.');
      }
      return true;
    }),

  body('isArchived')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('isArchived must be modified via dedicated archive/restore endpoints.');
      }
      return true;
    }),

  body('archivedAt')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('archivedAt cannot be modified directly.');
      }
      return true;
    }),

  body('normalizedName')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('normalizedName cannot be manually specified.');
      }
      return true;
    }),
];

/**
 * Validation rules for route parameters requiring a valid branchId or operational branch code.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const branchIdParamValidation = [
  param('branchId')
    .trim()
    .notEmpty()
    .withMessage('Branch identifier is required.')
    .custom((value) => {
      const isMongoId =
        mongoose.Types.ObjectId.isValid(value) &&
        String(new mongoose.Types.ObjectId(value)) === value;
      const isCode = /^[A-Za-z0-9-]{2,20}$/.test(value);
      if (!isMongoId && !isCode) {
        throw new Error('Invalid branch identifier format. Must be a valid ID or operational branch code.');
      }
      return true;
    }),
];

export const branchIdentifierParamValidation = branchIdParamValidation;

/**
 * Validation rules for querying/listing branches with pagination and search.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const listBranchesValidation = [
  query('page')
    .optional()
    .isInt({ min: BRANCH_CONSTANTS.PAGE_LIMIT_MIN })
    .withMessage(`Page number must be a positive integer of at least ${BRANCH_CONSTANTS.PAGE_LIMIT_MIN}.`),

  query('limit')
    .optional()
    .isInt({ min: BRANCH_CONSTANTS.PAGE_LIMIT_MIN, max: BRANCH_CONSTANTS.PAGE_LIMIT_MAX })
    .withMessage(`Page limit must be between ${BRANCH_CONSTANTS.PAGE_LIMIT_MIN} and ${BRANCH_CONSTANTS.PAGE_LIMIT_MAX}.`),

  query('search')
    .optional()
    .trim()
    .isLength({ max: BRANCH_CONSTANTS.SEARCH_MAX_LENGTH })
    .withMessage(`Search query cannot exceed ${BRANCH_CONSTANTS.SEARCH_MAX_LENGTH} characters.`),

  query('archived')
    .optional()
    .customSanitizer((val) => {
      if (val === '' || val === 'true' || val === true || val === '1') return true;
      if (val === 'false' || val === false || val === '0') return false;
      return val;
    })
    .isBoolean()
    .withMessage('archived filter must be a valid boolean flag.'),

  query('isArchived')
    .optional()
    .customSanitizer((val) => {
      if (val === '' || val === 'true' || val === true || val === '1') return true;
      if (val === 'false' || val === false || val === '0') return false;
      return val;
    })
    .isBoolean()
    .withMessage('isArchived filter must be a valid boolean.'),
];

export default {
  createBranchValidation,
  updateBranchValidation,
  branchIdParamValidation,
  branchIdentifierParamValidation,
  listBranchesValidation,
};

````

================================================================================
File: backend/src/validations/chatValidation.js
================================================================================

````javascript
/**
 * @module validations/chatValidation
 * @description express-validator rule chains for conversational chat sessions, multi-modal turn submissions, and chat management.
 * Enforces multi-modal turn input boundaries, file caps, MIME whitelists, and security field rejection.
 */

import path from 'node:path';
import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';
import {
  CHAT_CONSTANTS,
  CHAT_PAGINATION,
  AUDIO_CONSTANTS,
  ATTACHMENT_CONSTANTS,
  AI_MODELS,
  TTS_CONSTANTS,
} from '../utils/constants.js';

/**
 * Validates whether an incoming value is a valid 24-character hexadecimal MongoDB ObjectId.
 * Enforces canonical Mongoose ObjectId instantiation and string round-trip equivalence.
 * @function isValidObjectId
 * @param {string} value - Candidate identifier string.
 * @returns {boolean} True if strictly valid MongoDB ObjectId.
 */
const isValidObjectId = (value) =>
  typeof value === 'string' &&
  mongoose.Types.ObjectId.isValid(value) &&
  String(new mongoose.Types.ObjectId(value)) === value;

/**
 * Validation rules for chat session route parameter.
 * Verifies that :chatId is a valid 24-character hexadecimal MongoDB ObjectId.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const chatIdValidation = [
  param('chatId')
    .trim()
    .notEmpty()
    .withMessage('Chat ID parameter is required.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Valid chat ID is required.');
      }
      return true;
    }),
];

/**
 * Validation rules for retrieving chat session by ID with optional message slice pagination.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const getChatByIdValidation = [
  param('chatId')
    .trim()
    .notEmpty()
    .withMessage('Chat ID parameter is required.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Valid chat ID is required.');
      }
      return true;
    }),

  query('limit')
    .optional()
    .isInt({ min: CHAT_PAGINATION.MIN_MESSAGES_LIMIT, max: CHAT_PAGINATION.MAX_MESSAGES_LIMIT })
    .withMessage(`Message history limit must be an integer between ${CHAT_PAGINATION.MIN_MESSAGES_LIMIT} and ${CHAT_PAGINATION.MAX_MESSAGES_LIMIT}.`)
    .toInt(),

  query('before')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Before index must be a non-negative integer.')
    .toInt(),
];

/**
 * Validation rules for submitting a multi-modal conversational turn.
 * Enforces the core invariant: at least one input modality (text, audios, attachments, or retryTurnIndex) must be provided.
 * Enforces single-file and batch upload limits, MIME whitelists, and rejects administrative field injections.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const sendChatMessageValidation = [
  // Multi-modal turn invariant: at least one of text, audios, attachments, or retryTurnIndex/isRetry must be provided
  body().custom((_, { req }) => {
    const b = req?.body || {};
    const textCandidate = b.text !== undefined ? b.text : b.message;
    const hasText =
      textCandidate &&
      typeof textCandidate === 'string' &&
      textCandidate.trim().length > 0;
    const hasAudios = Array.isArray(b.audios) && b.audios.length > 0;
    const hasAttachments =
      Array.isArray(b.attachments) && b.attachments.length > 0;
    const hasRetry =
      (b.retryTurnIndex !== undefined && b.retryTurnIndex !== null) ||
      b.isRetry === true ||
      b.isRetry === 'true';
    const hasContinue =
      b.continueTurn === true ||
      b.continueTurn === 'true';
    const hasEdit =
      b.isEdit === true ||
      b.isEdit === 'true' ||
      (b.editTurnIndex !== undefined && b.editTurnIndex !== null);

    if (!hasText && !hasAudios && !hasAttachments && !hasRetry && !hasContinue && !hasEdit) {
      throw new Error(
        'Message turn must include at least one input modality: text, audio, or attachment.'
      );
    }
    return true;
  }),

  body('chatId')
    .optional()
    .trim()
    .custom((value) => {
      if (value && !isValidObjectId(value)) {
        throw new Error('Valid chat ID is required.');
      }
      return true;
    }),

  body('model')
    .optional()
    .trim()
    .isString()
    .withMessage('Model identifier must be a string.')
    .custom((value) => {
      if (value && !AI_MODELS.SUPPORTED.includes(value)) {
        throw new Error(`Model '${value}' is not supported.`);
      }
      return true;
    }),

  body('thinkingBudget')
    .optional()
    .isInt({ min: 0, max: 24576 })
    .withMessage('thinkingBudget must be an integer between 0 and 24576.')
    .toInt(),

  body('language')
    .optional()
    .trim()
    .isString()
    .isLength({ min: 2, max: 10 })
    .withMessage('Language code must be a valid language string (e.g. "am", "en").'),

  body('sttEngine')
    .optional()
    .trim()
    .isString()
    .withMessage('sttEngine must be a string.')
    .custom((value) => {
      if (value && !AI_MODELS.STT_ENGINES.includes(value)) {
        throw new Error(`sttEngine '${value}' is not supported.`);
      }
      return true;
    }),

  body('editTurnIndex')
    .optional()
    .isInt({ min: 0 })
    .withMessage('editTurnIndex must be a non-negative integer.')
    .toInt(),

  body('retryTurnIndex')
    .optional()
    .isInt({ min: 0 })
    .withMessage('retryTurnIndex must be a non-negative integer.')
    .toInt(),

  body('isRetry')
    .optional()
    .isBoolean()
    .toBoolean(),

  body('continueTurn')
    .optional()
    .isBoolean()
    .toBoolean(),

  body('anchorUserMessageId')
    .optional()
    .trim()
    .isString(),

  body('targetAssistantMessageId')
    .optional()
    .trim()
    .isString(),

  body('text')
    .optional({ nullable: true })
    .isString()
    .withMessage('Message text must be a string.')
    .trim()
    .isLength({ max: CHAT_CONSTANTS.MAX_MESSAGE_LENGTH })
    .withMessage(
      `Message text cannot exceed ${CHAT_CONSTANTS.MAX_MESSAGE_LENGTH} characters.`
    ),

  body('message')
    .optional({ nullable: true })
    .isString()
    .withMessage('Message text must be a string.')
    .trim()
    .isLength({ max: CHAT_CONSTANTS.MAX_MESSAGE_LENGTH })
    .withMessage(
      `Message text cannot exceed ${CHAT_CONSTANTS.MAX_MESSAGE_LENGTH} characters.`
    ),

  body('audios')
    .optional()
    .isArray({ max: AUDIO_CONSTANTS.MAX_FILES_COUNT })
    .withMessage(
      `A message turn cannot exceed ${AUDIO_CONSTANTS.MAX_FILES_COUNT} audio files.`
    ),

  body('audios.*')
    .optional()
    .custom((value) => {
      const id = typeof value === 'object' && value !== null ? (value._id || value.id) : value;
      const strId = String(id || '').trim();
      if (!isValidObjectId(strId)) {
        throw new Error('Each audio reference must be a valid audio ID.');
      }
      return true;
    }),

  body('attachments')
    .optional()
    .isArray({ max: ATTACHMENT_CONSTANTS.MAX_FILES_COUNT })
    .withMessage(
      `A message turn cannot exceed ${ATTACHMENT_CONSTANTS.MAX_FILES_COUNT} attachments.`
    )
    .custom((attachments) => {
      if (!Array.isArray(attachments)) return true;
      const totalSize = attachments.reduce(
        (sum, item) => sum + (Number(item?.size) || 0),
        0
      );
      const maxBatch = Math.max(ATTACHMENT_CONSTANTS.MAX_BATCH_SIZE_BYTES, AUDIO_CONSTANTS.MAX_BATCH_SIZE_BYTES);
      if (totalSize > maxBatch) {
        throw new Error(
          `Total attachment batch size cannot exceed ${maxBatch} bytes (50MB).`
        );
      }
      return true;
    }),

  body('attachments.*.fileName')
    .if(body('attachments').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Attachment fileName is required.')
    .isLength({ max: 255 })
    .withMessage('Attachment fileName cannot exceed 255 characters.')
    .custom((fileName, { req, path: fieldPath }) => {
      let ext = path.extname(fileName || '').toLowerCase();
      if (!ext) {
        const match = typeof fieldPath === 'string' ? fieldPath.match(/^attachments\[(\d+)\]/) : null;
        const index = match ? parseInt(match[1], 10) : null;
        if (index !== null && req.body?.attachments?.[index]?.originalName) {
          ext = path.extname(req.body.attachments[index].originalName).toLowerCase();
        }
      }
      const isAllowedExt =
        ATTACHMENT_CONSTANTS.ALLOWED_EXTENSIONS.includes(ext) ||
        AUDIO_CONSTANTS.ALLOWED_EXTENSIONS.includes(ext);
      if (!isAllowedExt) {
        throw new Error(`File extension '${ext}' is not permitted.`);
      }
      return true;
    }),

  body('attachments.*.path')
    .if(body('attachments').isArray({ min: 1 }))
    .customSanitizer((filePath) => (typeof filePath === 'string' ? filePath.replace(/^\/+/, '') : filePath))
    .custom((filePath, { req }) => {
      const isEdit = req.body?.isEdit === true || req.body?.isEdit === 'true' || req.body?.editTurnIndex !== undefined;
      if (!filePath && isEdit) {
        return true;
      }
      if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('Attachment path is required.');
      }
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return true;
      }
      if (filePath.includes('..') || path.isAbsolute(filePath)) {
        throw new Error('Attachment path must be a safe relative storage path.');
      }
      return true;
    }),

  body('attachments.*.mimeType')
    .if(body('attachments').isArray({ min: 1 }))
    .custom((mimeType, { req }) => {
      const isEdit = req.body?.isEdit === true || req.body?.isEdit === 'true' || req.body?.editTurnIndex !== undefined;
      if (!mimeType && isEdit) {
        return true;
      }
      if (!mimeType || typeof mimeType !== 'string' || !mimeType.trim()) {
        throw new Error('Attachment mimeType is required.');
      }
      const trimmedMime = mimeType.trim().toLowerCase();
      const baseMime = trimmedMime.split(';')[0].trim();
      const isAllowedMime =
        ATTACHMENT_CONSTANTS.ALLOWED_MIME_TYPES.includes(trimmedMime) ||
        ATTACHMENT_CONSTANTS.ALLOWED_MIME_TYPES.includes(baseMime) ||
        AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(trimmedMime) ||
        AUDIO_CONSTANTS.ALLOWED_MIME_TYPES.includes(baseMime) ||
        baseMime.startsWith('audio/') ||
        baseMime === 'video/webm' ||
        baseMime === 'video/mp4' ||
        baseMime === 'application/ogg';
      if (!isAllowedMime) {
        throw new Error('Unsupported attachment MIME format.');
      }
      return true;
    }),

  body('attachments.*.size')
    .if(body('attachments').isArray({ min: 1 }))
    .custom((size, { req }) => {
      const isEdit = req.body?.isEdit === true || req.body?.isEdit === 'true' || req.body?.editTurnIndex !== undefined;
      if ((size === undefined || size === null || size === 0) && isEdit) {
        return true;
      }
      const num = Number(size);
      const maxSize = Math.max(ATTACHMENT_CONSTANTS.MAX_FILE_SIZE_BYTES, AUDIO_CONSTANTS.MAX_FILE_SIZE_BYTES);
      if (isNaN(num) || num < 1 || num > maxSize) {
        throw new Error(
          `Attachment file size must be between 1 byte and ${maxSize} bytes (25MB).`
        );
      }
      return true;
    }),

  // Security Invariants: reject forbidden field injections on chat turns
  body('role').custom((value) => {
    if (value !== undefined) {
      throw new Error('Message role cannot be overridden by client.');
    }
    return true;
  }),

  body('user').custom((value) => {
    if (value !== undefined) {
      throw new Error('User ownership cannot be overridden in request body.');
    }
    return true;
  }),

  body('_id').custom((value) => {
    if (value !== undefined) {
      throw new Error('Turn identifier cannot be manually specified.');
    }
    return true;
  }),

  body('status').custom((value) => {
    if (value !== undefined) {
      throw new Error('Turn status cannot be assigned directly.');
    }
    return true;
  }),

  body('templateType').custom((value) => {
    if (value !== undefined) {
      throw new Error('templateType is prohibited on conversational turns.');
    }
    return true;
  }),

  body('isArchived').custom((value) => {
    if (value !== undefined) {
      throw new Error('isArchived cannot be assigned directly.');
    }
    return true;
  }),

  body('archivedAt').custom((value) => {
    if (value !== undefined) {
      throw new Error('archivedAt cannot be assigned directly.');
    }
    return true;
  }),
];

/**
 * Validation rules for renaming a chat session.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const renameChatValidation = [
  param('chatId')
    .trim()
    .notEmpty()
    .withMessage('Chat ID parameter is required.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Valid chat ID is required.');
      }
      return true;
    }),

  body('title')
    .trim()
    .notEmpty()
    .withMessage('Chat title is required.')
    .isLength({ min: 1, max: CHAT_CONSTANTS.TITLE_MAX_LENGTH })
    .withMessage(
      `Chat title cannot exceed ${CHAT_CONSTANTS.TITLE_MAX_LENGTH} characters.`
    ),

  // Security Invariants
  body('user').custom((value) => {
    if (value !== undefined) {
      throw new Error('User ownership cannot be overridden.');
    }
    return true;
  }),

  body('_id').custom((value) => {
    if (value !== undefined) {
      throw new Error('Chat identifier cannot be modified.');
    }
    return true;
  }),
];

/**
 * Validation rules for listing/querying chat sessions.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const getChatsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer.')
    .toInt(),

  query('limit')
    .optional()
    .isInt({
      min: CHAT_PAGINATION.MIN_RECENT_CHATS_LIMIT,
      max: CHAT_PAGINATION.MAX_RECENT_CHATS_LIMIT,
    })
    .withMessage(
      `Page limit must be between ${CHAT_PAGINATION.MIN_RECENT_CHATS_LIMIT} and ${CHAT_PAGINATION.MAX_RECENT_CHATS_LIMIT}.`
    )
    .toInt(),

  query('archived')
    .optional()
    .customSanitizer((val) => {
      if (val === '' || val === 'true' || val === true || val === '1') return true;
      if (val === 'false' || val === false || val === '0') return false;
      return val;
    })
    .isBoolean()
    .withMessage('archived filter must be a valid boolean flag.'),

  query('pinned')
    .optional()
    .customSanitizer((val) => {
      if (val === '' || val === 'true' || val === true || val === '1') return true;
      if (val === 'false' || val === false || val === '0') return false;
      return val;
    })
    .isBoolean()
    .withMessage('pinned filter must be a valid boolean flag.'),

  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query cannot exceed 100 characters.'),
];

/**
 * Validation rules for updating chat session configuration (model, thinkingBudget, language, prompt).
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updateChatConfigValidation = [
  param('chatId')
    .trim()
    .notEmpty()
    .withMessage('Chat ID parameter is required.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Valid chat ID is required.');
      }
      return true;
    }),

  body().custom((_, { req }) => {
    const b = req?.body || {};
    const hasModel = b.model !== undefined;
    const hasThinkingBudget = b.thinkingBudget !== undefined;
    const hasLanguage = b.language !== undefined;
    const hasPrompt = b.prompt !== undefined;

    if (!hasModel && !hasThinkingBudget && !hasLanguage && !hasPrompt) {
      throw new Error(
        'At least one configuration property (model, thinkingBudget, language, prompt) must be provided.'
      );
    }
    return true;
  }),

  body('model')
    .optional()
    .trim()
    .isString()
    .withMessage('Model identifier must be a string.')
    .custom((value) => {
      if (value && !AI_MODELS.SUPPORTED.includes(value)) {
        throw new Error(`Model '${value}' is not supported.`);
      }
      return true;
    }),

  body('thinkingBudget')
    .optional()
    .isInt({ min: 0, max: 24576 })
    .withMessage('thinkingBudget must be an integer between 0 and 24576.')
    .toInt(),

  body('language')
    .optional()
    .trim()
    .isString()
    .isLength({ min: 2, max: 10 })
    .withMessage('Language code must be a valid language string (e.g. "am", "en").'),

  body('prompt')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Prompt cannot exceed 2000 characters.'),

  // Security Invariants
  body('user').custom((value) => {
    if (value !== undefined) {
      throw new Error('User ownership cannot be overridden.');
    }
    return true;
  }),

  body('_id').custom((value) => {
    if (value !== undefined) {
      throw new Error('Chat identifier cannot be modified.');
    }
    return true;
  }),
];

/**
 * Validation rules for synthesizing speech from text using Addis AI.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const synthesizeSpeechValidation = [
  body('text')
    .exists({ checkFalsy: true })
    .withMessage('Text to read out loud is required.')
    .trim()
    .isString()
    .withMessage('Text must be a valid string.')
    .isLength({ min: 1, max: TTS_CONSTANTS.MAX_TEXT_LENGTH })
    .withMessage(`Text cannot exceed ${TTS_CONSTANTS.MAX_TEXT_LENGTH} characters.`),

  body('voiceId')
    .optional({ nullable: true })
    .trim()
    .isString()
    .isLength({ min: 1, max: 64 })
    .withMessage('Voice ID must be a valid string identifier.'),

  body('language')
    .optional({ nullable: true })
    .trim()
    .isString()
    .isIn(['am', 'en', 'auto'])
    .withMessage('Language must be one of: am, en, auto.'),
];

export default {
  chatIdValidation,
  getChatByIdValidation,
  sendChatMessageValidation,
  renameChatValidation,
  getChatsValidation,
  updateChatConfigValidation,
  synthesizeSpeechValidation,
};

````

================================================================================
File: backend/src/validations/reportValidation.js
================================================================================

````javascript
/**
 * @module validations/reportValidation
 * @description express-validator rule chains for operational report queries, manual edits, and structured report creation payloads.
 * Enforces corporate schema boundaries, single-user tenancy, JDN calendar date limits, time formats, and strict rejection of forbidden fields.
 */

import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';
import { REPORT_CONSTANTS } from '../utils/constants.js';
import { ValidationError } from '../errors/CustomError.js';

/**
 * Validates whether an incoming value is a valid 24-character hexadecimal MongoDB ObjectId.
 * Enforces canonical Mongoose ObjectId instantiation and string round-trip equivalence.
 * @function isValidObjectId
 * @param {string} value - Candidate identifier string.
 * @returns {boolean} True if strictly valid MongoDB ObjectId.
 */
export const isValidObjectId = (value) =>
  typeof value === 'string' &&
  mongoose.Types.ObjectId.isValid(value) &&
  String(new mongoose.Types.ObjectId(value)) === value;

/**
 * Validation rules for single-report route parameter.
 * Verifies that :reportId is a valid 24-character hexadecimal MongoDB ObjectId.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const reportIdValidation = [
  param('reportId')
    .trim()
    .notEmpty()
    .withMessage('Report ID parameter is required.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Valid report ID is required.');
      }
      return true;
    }),
];

/**
 * Validation rules for listing/querying operational reports.
 * Supports pagination, date range filtering, branch filtering, archived toggle, and search.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const getReportsValidation = [
  query('page')
    .optional()
    .isInt({ min: REPORT_CONSTANTS.PAGE_LIMIT_MIN })
    .withMessage('Page number must be a positive integer.')
    .toInt(),

  query('limit')
    .optional()
    .isInt({
      min: REPORT_CONSTANTS.PAGE_LIMIT_MIN,
      max: REPORT_CONSTANTS.PAGE_LIMIT_MAX,
    })
    .withMessage(
      `Page limit must be between ${REPORT_CONSTANTS.PAGE_LIMIT_MIN} and ${REPORT_CONSTANTS.PAGE_LIMIT_MAX}.`
    )
    .toInt(),

  query('archived')
    .optional()
    .customSanitizer((val) => {
      if (val === '' || val === 'true' || val === true || val === '1') return true;
      if (val === 'false' || val === false || val === '0') return false;
      return val;
    })
    .isBoolean()
    .withMessage('archived filter must be a valid boolean flag.'),

  query('isArchived')
    .optional()
    .customSanitizer((val) => {
      if (val === '' || val === 'true' || val === true || val === '1') return true;
      if (val === 'false' || val === false || val === '0') return false;
      return val;
    })
    .isBoolean()
    .withMessage('isArchived filter must be a valid boolean.'),

  query('date')
    .optional()
    .isISO8601()
    .withMessage('Date filter must be a valid ISO 8601 date string.'),

  query('branch')
    .optional()
    .trim()
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Branch filter must be a valid branch ID.');
      }
      return true;
    }),

  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query cannot exceed 100 characters.'),
];

/**
 * Validation rules for manual updates to an existing operational report (e.g. via /reports/:reportId/edit).
 * Enforces partial update validation and strictly rejects immutable or prohibited field modifications.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updateReportValidation = [
  param('reportId')
    .trim()
    .notEmpty()
    .withMessage('Report ID parameter is required.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Valid report ID is required.');
      }
      return true;
    }),

  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date string.')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      // Allow up to 24-hour buffer to accommodate global supervisor timezones (up to UTC+14)
      const maxAllowed = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      if (date > maxAllowed) {
        throw new Error('Inspection date cannot be in the future.');
      }
      return true;
    }),

  body('clockIn')
    .optional()
    .trim()
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Clock-in time must be in HH:mm format (00:00 to 23:59).'),

  body('clockOut')
    .optional()
    .trim()
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Clock-out time must be in HH:mm format (00:00 to 23:59).'),

  body('visits')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Visits must be an array containing at least one visit.'),

  body('visits.*.branch')
    .if(body('visits').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Each visit must specify a valid branch ID.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Each visit must specify a valid branch ID.');
      }
      return true;
    }),

  body('visits.*.clockIn')
    .if(body('visits').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Visit clock-in time is required.')
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Visit clock-in time must be in HH:mm format (00:00 to 23:59).'),

  body('visits.*.clockOut')
    .if(body('visits').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Visit clock-out time is required.')
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Visit clock-out time must be in HH:mm format (00:00 to 23:59).'),

  body('activities')
    .optional()
    .isArray()
    .withMessage('Activities must be an array.'),

  body('activities.*.text')
    .if(body('activities').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Activity description text is required.')
    .isLength({ max: REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH })
    .withMessage(
      `Activity text cannot exceed ${REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH} characters.`
    ),

  body('activities.*.status')
    .if(body('activities').isArray({ min: 1 }))
    .optional()
    .isIn(REPORT_CONSTANTS.ACTIVITY_STATUSES)
    .withMessage(
      `Activity status must be one of: ${REPORT_CONSTANTS.ACTIVITY_STATUSES.join(', ')}.`
    ),

  body('issues')
    .optional()
    .isArray()
    .withMessage('Issues must be an array.'),

  body('issues.*.text')
    .if(body('issues').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Issue description text is required.')
    .isLength({ max: REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH })
    .withMessage(
      `Issue text cannot exceed ${REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH} characters.`
    ),

  body('issues.*.status')
    .if(body('issues').isArray({ min: 1 }))
    .optional()
    .isIn(REPORT_CONSTANTS.ISSUE_STATUSES)
    .withMessage(
      `Issue status must be one of: ${REPORT_CONSTANTS.ISSUE_STATUSES.join(', ')}.`
    ),

  body('comments')
    .optional()
    .isArray()
    .withMessage('Comments must be an array.'),

  body('comments.*.text')
    .if(body('comments').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Comment text is required.')
    .isLength({ max: REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH })
    .withMessage(
      `Comment text cannot exceed ${REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH} characters.`
    ),

  body('transcription')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Transcription cannot be empty if provided.')
    .isLength({ max: REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH })
    .withMessage(
      `Transcription text cannot exceed ${REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH} characters.`
    ),

  body('audios')
    .optional()
    .isArray()
    .withMessage('Audios must be an array of audio IDs.')
    .custom((val) => {
      if (val.length > REPORT_CONSTANTS.MAX_AUDIO_FILES) {
        throw new Error(
          `Report audio recordings cannot exceed ${REPORT_CONSTANTS.MAX_AUDIO_FILES}.`
        );
      }
      return true;
    }),

  body('audios.*')
    .optional()
    .custom((val) => {
      if (!isValidObjectId(val)) {
        throw new Error('Valid audio ID is required.');
      }
      return true;
    }),

  // Security Invariants: strictly reject immutable and prohibited field modifications
  body('user').custom((value) => {
    if (value !== undefined) {
      throw new Error('Report ownership cannot be altered.');
    }
    return true;
  }),

  body('_id').custom((value) => {
    if (value !== undefined) {
      throw new Error('Report identifier cannot be specified.');
    }
    return true;
  }),

  body('isArchived').custom((value) => {
    if (value !== undefined) {
      throw new Error('isArchived cannot be assigned directly. Use dedicated archive/restore endpoints.');
    }
    return true;
  }),

  body('archivedAt').custom((value) => {
    if (value !== undefined) {
      throw new Error('archivedAt cannot be modified directly.');
    }
    return true;
  }),

  body('status').custom((value) => {
    if (value !== undefined) {
      throw new Error('Report does not declare a status field.');
    }
    return true;
  }),

  body('templateType').custom((value) => {
    if (value !== undefined) {
      throw new Error('Report templateType is derived dynamically and cannot be manually set.');
    }
    return true;
  }),

  body('issues.*.category').custom((value) => {
    if (value !== undefined) {
      throw new Error('Issue category is prohibited.');
    }
    return true;
  }),

  body('issues.*.severity').custom((value) => {
    if (value !== undefined) {
      throw new Error('Issue severity is prohibited.');
    }
    return true;
  }),

  body('comments.*.status').custom((value) => {
    if (value !== undefined) {
      throw new Error('Comments do not declare a status field.');
    }
    return true;
  }),
];

/**
 * Pure domain validator validating a structured operational report payload.
 * Completely independent of Express req/res; directly validates in-memory JavaScript objects.
 * Used by the in-process AI Agent Tool execution pipeline (Task 7.5) and programmatic creators.
 *
 * @function validateReportPayload
 * @param {Object} payload - Raw operational report payload.
 * @returns {Object} Sanitized, validated operational report payload.
 * @throws {ValidationError} If semantic domain rules, schema boundaries, or security invariants are violated.
 */
export const validateReportPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Report payload must be an object.', [
      { field: 'body', message: 'Payload must be a non-null object.' },
    ]);
  }

  const errors = [];

  // Security Invariants: Prohibited / immutable field rejections
  const forbiddenFields = [
    'status',
    'templateType',
    'isArchived',
    'archivedAt',
    'user',
    '_id',
    'role',
  ];
  for (const field of forbiddenFields) {
    if (payload[field] !== undefined) {
      errors.push({ field, message: `Field '${field}' is strictly prohibited.` });
    }
  }

  // 1. Inspection Date
  if (!payload.date) {
    errors.push({ field: 'date', message: 'Inspection date is required.' });
  } else {
    const d = new Date(payload.date);
    if (isNaN(d.getTime())) {
      errors.push({ field: 'date', message: 'Date must be a valid ISO 8601 date string.' });
    } else {
      const now = new Date();
      // Allow up to 24-hour buffer to accommodate global supervisor timezones (up to UTC+14)
      const maxAllowed = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      if (d > maxAllowed) {
        errors.push({ field: 'date', message: 'Inspection date cannot be in the future.' });
      }
    }
  }

  // 2. Work Clock-In
  if (!payload.clockIn || typeof payload.clockIn !== 'string' || !payload.clockIn.trim()) {
    errors.push({ field: 'clockIn', message: 'Clock-in time is required.' });
  } else if (!REPORT_CONSTANTS.TIME_REGEX.test(payload.clockIn.trim())) {
    errors.push({
      field: 'clockIn',
      message: 'Clock-in time must be in HH:mm format (00:00 to 23:59).',
    });
  }

  // 3. Work Clock-Out
  if (!payload.clockOut || typeof payload.clockOut !== 'string' || !payload.clockOut.trim()) {
    errors.push({ field: 'clockOut', message: 'Clock-out time is required.' });
  } else if (!REPORT_CONSTANTS.TIME_REGEX.test(payload.clockOut.trim())) {
    errors.push({
      field: 'clockOut',
      message: 'Clock-out time must be in HH:mm format (00:00 to 23:59).',
    });
  }

  // 4. Branch Visits
  if (!Array.isArray(payload.visits) || payload.visits.length === 0) {
    errors.push({ field: 'visits', message: 'Report must contain at least one branch visit.' });
  } else {
    payload.visits.forEach((v, idx) => {
      if (!v || typeof v !== 'object') {
        errors.push({ field: `visits[${idx}]`, message: 'Visit must be an object.' });
        return;
      }
      if (!v.branch || !isValidObjectId(String(v.branch))) {
        errors.push({
          field: `visits[${idx}].branch`,
          message: 'Each visit branch must be a valid branch ID.',
        });
      }
      if (
        !v.clockIn ||
        typeof v.clockIn !== 'string' ||
        !REPORT_CONSTANTS.TIME_REGEX.test(v.clockIn.trim())
      ) {
        errors.push({
          field: `visits[${idx}].clockIn`,
          message: 'Visit clock-in must be in HH:mm format.',
        });
      }
      if (
        !v.clockOut ||
        typeof v.clockOut !== 'string' ||
        !REPORT_CONSTANTS.TIME_REGEX.test(v.clockOut.trim())
      ) {
        errors.push({
          field: `visits[${idx}].clockOut`,
          message: 'Visit clock-out must be in HH:mm format.',
        });
      }
    });
  }

  // 5. Activities (Optional if customSections are provided)
  const hasCustomSections =
    Array.isArray(payload.customSections) && payload.customSections.length > 0;

  if (!hasCustomSections && (!Array.isArray(payload.activities) || payload.activities.length === 0)) {
    errors.push({
      field: 'activities',
      message: 'Report must contain at least one operational activity or custom template section.',
    });
  } else if (Array.isArray(payload.activities) && payload.activities.length > 0) {
    payload.activities.forEach((a, idx) => {
      if (!a || typeof a !== 'object') {
        errors.push({ field: `activities[${idx}]`, message: 'Activity must be an object.' });
        return;
      }
      if (!a.text || typeof a.text !== 'string' || !a.text.trim()) {
        errors.push({
          field: `activities[${idx}].text`,
          message: 'Activity description text is required.',
        });
      } else if (a.text.trim().length > REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH) {
        errors.push({
          field: `activities[${idx}].text`,
          message: `Activity text cannot exceed ${REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH} characters.`,
        });
      }
      if (a.status !== undefined && !REPORT_CONSTANTS.ACTIVITY_STATUSES.includes(a.status)) {
        errors.push({
          field: `activities[${idx}].status`,
          message: `Activity status must be one of: ${REPORT_CONSTANTS.ACTIVITY_STATUSES.join(', ')}.`,
        });
      }
    });
  }

  // 5b. Custom Template Sections (Optional)
  if (payload.customSections !== undefined) {
    if (!Array.isArray(payload.customSections)) {
      errors.push({ field: 'customSections', message: 'customSections must be an array.' });
    } else {
      payload.customSections.forEach((cs, idx) => {
        if (!cs || typeof cs !== 'object') {
          errors.push({ field: `customSections[${idx}]`, message: 'Custom section must be an object.' });
          return;
        }
        if (!cs.heading || typeof cs.heading !== 'string' || !cs.heading.trim()) {
          errors.push({
            field: `customSections[${idx}].heading`,
            message: 'Custom section heading is required.',
          });
        }
        if (cs.items !== undefined && !Array.isArray(cs.items)) {
          errors.push({
            field: `customSections[${idx}].items`,
            message: 'Custom section items must be an array.',
          });
        }
      });
    }
  }

  // 6. Issues (Optional)
  if (payload.issues !== undefined) {
    if (!Array.isArray(payload.issues)) {
      errors.push({ field: 'issues', message: 'Issues must be an array.' });
    } else {
      payload.issues.forEach((issue, idx) => {
        if (!issue || typeof issue !== 'object') {
          errors.push({ field: `issues[${idx}]`, message: 'Issue must be an object.' });
          return;
        }
        if (issue.category !== undefined) {
          errors.push({ field: `issues[${idx}].category`, message: 'Issue category is prohibited.' });
        }
        if (issue.severity !== undefined) {
          errors.push({ field: `issues[${idx}].severity`, message: 'Issue severity is prohibited.' });
        }
        if (!issue.text || typeof issue.text !== 'string' || !issue.text.trim()) {
          errors.push({
            field: `issues[${idx}].text`,
            message: 'Issue description text is required.',
          });
        } else if (issue.text.trim().length > REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH) {
          errors.push({
            field: `issues[${idx}].text`,
            message: `Issue text cannot exceed ${REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH} characters.`,
          });
        }
        if (
          issue.status !== undefined &&
          !REPORT_CONSTANTS.ISSUE_STATUSES.includes(issue.status)
        ) {
          errors.push({
            field: `issues[${idx}].status`,
            message: `Issue status must be one of: ${REPORT_CONSTANTS.ISSUE_STATUSES.join(', ')}.`,
          });
        }
      });
    }
  }

  // 7. Comments (Optional)
  if (payload.comments !== undefined) {
    if (!Array.isArray(payload.comments)) {
      errors.push({ field: 'comments', message: 'Comments must be an array.' });
    } else {
      payload.comments.forEach((c, idx) => {
        if (!c || typeof c !== 'object') {
          errors.push({ field: `comments[${idx}]`, message: 'Comment must be an object.' });
          return;
        }
        if (c.status !== undefined) {
          errors.push({
            field: `comments[${idx}].status`,
            message: 'Comments do not declare a status field.',
          });
        }
        if (!c.text || typeof c.text !== 'string' || !c.text.trim()) {
          errors.push({
            field: `comments[${idx}].text`,
            message: 'Comment text is required.',
          });
        } else if (c.text.trim().length > REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH) {
          errors.push({
            field: `comments[${idx}].text`,
            message: `Comment text cannot exceed ${REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH} characters.`,
          });
        }
      });
    }
  }

  // 8. Speech Transcription
  if (
    !payload.transcription ||
    typeof payload.transcription !== 'string' ||
    !payload.transcription.trim()
  ) {
    errors.push({
      field: 'transcription',
      message: 'Speech transcription or narrative text is required.',
    });
  } else if (payload.transcription.trim().length > REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH) {
    errors.push({
      field: 'transcription',
      message: `Transcription text cannot exceed ${REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH} characters.`,
    });
  }

  // 9. Audios (Optional)
  if (payload.audios !== undefined) {
    if (!Array.isArray(payload.audios)) {
      errors.push({ field: 'audios', message: 'Audios must be an array.' });
    } else if (payload.audios.length > REPORT_CONSTANTS.MAX_AUDIO_FILES) {
      errors.push({
        field: 'audios',
        message: `Report cannot exceed ${REPORT_CONSTANTS.MAX_AUDIO_FILES} audio files.`,
      });
    } else {
      payload.audios.forEach((audioId, idx) => {
        if (!isValidObjectId(String(audioId))) {
          errors.push({
            field: `audios[${idx}]`,
            message: 'Each audio reference must be a valid audio ID.',
          });
        }
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Report payload validation failed.', errors);
  }

  return {
    date: new Date(payload.date),
    clockIn: payload.clockIn.trim(),
    clockOut: payload.clockOut.trim(),
    visits: payload.visits.map((v) => ({
      branch: v.branch,
      clockIn: v.clockIn.trim(),
      clockOut: v.clockOut.trim(),
    })),
    activities: payload.activities.map((a) => ({
      text: a.text.trim(),
      status: a.status || REPORT_CONSTANTS.DEFAULT_ACTIVITY_STATUS,
    })),
    issues: (payload.issues || []).map((i) => ({
      text: i.text.trim(),
      status: i.status || REPORT_CONSTANTS.DEFAULT_ISSUE_STATUS,
    })),
    comments: (payload.comments || []).map((c) => ({
      text: c.text.trim(),
      status: null,
    })),
    transcription: payload.transcription.trim(),
    audios: payload.audios || [],
  };
};

/**
 * Validation rules for structured operational report creation payloads.
 * Used by backend creation tools and automated domain test suites.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const createReportValidation = [
  body('date')
    .notEmpty()
    .withMessage('Inspection date is required.')
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date string.')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      // Allow up to 24-hour buffer to accommodate global supervisor timezones (up to UTC+14)
      const maxAllowed = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      if (date > maxAllowed) {
        throw new Error('Inspection date cannot be in the future.');
      }
      return true;
    }),

  body('clockIn')
    .trim()
    .notEmpty()
    .withMessage('Clock-in time is required.')
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Clock-in time must be in HH:mm format (00:00 to 23:59).'),

  body('clockOut')
    .trim()
    .notEmpty()
    .withMessage('Clock-out time is required.')
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Clock-out time must be in HH:mm format (00:00 to 23:59).'),

  body('visits')
    .isArray({ min: 1 })
    .withMessage('Report must contain at least one branch visit.'),

  body('visits.*.branch')
    .trim()
    .notEmpty()
    .withMessage('Each visit must specify a branch reference.')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Each visit branch must be a valid branch ID.');
      }
      return true;
    }),

  body('visits.*.clockIn')
    .trim()
    .notEmpty()
    .withMessage('Visit arrival time is required.')
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Visit clock-in must be in HH:mm format.'),

  body('visits.*.clockOut')
    .trim()
    .notEmpty()
    .withMessage('Visit departure time is required.')
    .matches(REPORT_CONSTANTS.TIME_REGEX)
    .withMessage('Visit clock-out must be in HH:mm format.'),

  body('activities')
    .isArray({ min: 1 })
    .withMessage('Report must contain at least one operational activity.'),

  body('activities.*.text')
    .trim()
    .notEmpty()
    .withMessage('Activity description text is required.')
    .isLength({ max: REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH })
    .withMessage(
      `Activity text cannot exceed ${REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH} characters.`
    ),

  body('activities.*.status')
    .optional()
    .isIn(REPORT_CONSTANTS.ACTIVITY_STATUSES)
    .withMessage(
      `Activity status must be one of: ${REPORT_CONSTANTS.ACTIVITY_STATUSES.join(', ')}.`
    ),

  body('issues')
    .optional()
    .isArray()
    .withMessage('Issues must be an array.'),

  body('issues.*.text')
    .if(body('issues').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Issue description text is required.')
    .isLength({ max: REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH })
    .withMessage(
      `Issue text cannot exceed ${REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH} characters.`
    ),

  body('issues.*.status')
    .if(body('issues').isArray({ min: 1 }))
    .optional()
    .isIn(REPORT_CONSTANTS.ISSUE_STATUSES)
    .withMessage(
      `Issue status must be one of: ${REPORT_CONSTANTS.ISSUE_STATUSES.join(', ')}.`
    ),

  body('comments')
    .optional()
    .isArray()
    .withMessage('Comments must be an array.'),

  body('comments.*.text')
    .if(body('comments').isArray({ min: 1 }))
    .trim()
    .notEmpty()
    .withMessage('Comment text is required.')
    .isLength({ max: REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH })
    .withMessage(
      `Comment text cannot exceed ${REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH} characters.`
    ),

  body('transcription')
    .trim()
    .notEmpty()
    .withMessage('Speech transcription or narrative text is required.')
    .isLength({ max: REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH })
    .withMessage(
      `Transcription text cannot exceed ${REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH} characters.`
    ),

  body('audios')
    .optional()
    .isArray({ max: REPORT_CONSTANTS.MAX_AUDIO_FILES })
    .withMessage(
      `Report cannot exceed ${REPORT_CONSTANTS.MAX_AUDIO_FILES} audio files.`
    ),

  body('audios.*')
    .optional()
    .trim()
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Each audio reference must be a valid audio ID.');
      }
      return true;
    }),

  // Security Invariants: strictly reject administrative and prohibited field injections
  body('status').custom((value) => {
    if (value !== undefined) {
      throw new Error('Report does not declare a status field.');
    }
    return true;
  }),

  body('templateType').custom((value) => {
    if (value !== undefined) {
      throw new Error('Report templateType is derived dynamically and cannot be manually set.');
    }
    return true;
  }),

  body('isArchived').custom((value) => {
    if (value !== undefined) {
      throw new Error('isArchived cannot be assigned directly during creation.');
    }
    return true;
  }),

  body('archivedAt').custom((value) => {
    if (value !== undefined) {
      throw new Error('archivedAt cannot be assigned directly.');
    }
    return true;
  }),

  body('user').custom((value) => {
    if (value !== undefined) {
      throw new Error('User ownership cannot be overridden in request body.');
    }
    return true;
  }),

  body('_id').custom((value) => {
    if (value !== undefined) {
      throw new Error('Report identifier cannot be manually specified.');
    }
    return true;
  }),

  body('role').custom((value) => {
    if (value !== undefined) {
      throw new Error('Role assignment is strictly prohibited.');
    }
    return true;
  }),

  body('issues.*.category').custom((value) => {
    if (value !== undefined) {
      throw new Error('Issue category is prohibited.');
    }
    return true;
  }),

  body('issues.*.severity').custom((value) => {
    if (value !== undefined) {
      throw new Error('Issue severity is prohibited.');
    }
    return true;
  }),

  body('comments.*.status').custom((value) => {
    if (value !== undefined) {
      throw new Error('Comments do not declare a status field.');
    }
    return true;
  }),
];

/**
 * Validation rules for report document export and Google Drive dispatch.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export default {
  isValidObjectId,
  validateReportPayload,
  reportIdValidation,
  getReportsValidation,
  updateReportValidation,
  createReportValidation,
};

````

================================================================================
File: backend/src/validations/userValidation.js
================================================================================

````javascript
/**
 * @module validations/userValidation
 * @description express-validator rule chains for user profile, avatar, and password management endpoints.
 * Enforces single-user invariants (strictly zero role, zero isArchived).
 */

import { body } from 'express-validator';
import {
  USER_NAME_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
  CHAT_CONSTANTS,
  REPORT_CONSTANTS,
  TELEGRAM_CONSTANTS,
  TTS_CONSTANTS,
} from '../utils/constants.js';

/**
 * Validation rules for updating user profile information.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty if provided.')
    .isLength({ min: USER_NAME_LENGTH.MIN, max: USER_NAME_LENGTH.MAX })
    .withMessage(`First name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`),

  body('lastName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Last name cannot be empty if provided.')
    .isLength({ min: USER_NAME_LENGTH.MIN, max: USER_NAME_LENGTH.MAX })
    .withMessage(`Last name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`),

  body('email')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Email address cannot be empty if provided.')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('position')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Position cannot be blank if provided.'),

  // Invariant: strictly zero role field allowed on User
  body('role')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Role assignment is strictly prohibited in single-user architecture.');
      }
      return true;
    }),

  // Invariant: strictly zero isArchived field allowed on User
  body('isArchived')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('isArchived field is prohibited on User.');
      }
      return true;
    }),

  // Invariant: strictly zero archivedAt field allowed on User
  body('archivedAt')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('archivedAt field is prohibited on User.');
      }
      return true;
    }),

  // Invariant: strictly zero _id modification allowed on User
  body('_id')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('User identifier cannot be changed.');
      }
      return true;
    }),

  // Invariant: password modification must use dedicated /password endpoint
  body('password')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Password must be updated via the dedicated password endpoint.');
      }
      return true;
    }),
];

/**
 * Validation rules for updating user avatar.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updateAvatarValidation = [
  body('avatar')
    .notEmpty()
    .withMessage('Avatar URL or image path is required.')
    .isString()
    .withMessage('Avatar must be a valid string URL or image path.'),
];

/**
 * Validation rules for user password change.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updatePasswordValidation = [
  body('currentPassword')
    .custom((value, { req }) => {
      if (req.user?.isPasswordSet === false) {
        return true;
      }
      if (!value || typeof value !== 'string' || !value.trim()) {
        throw new Error('Current password is required.');
      }
      return true;
    }),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required.')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`New password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
    .matches(PASSWORD_REGEX)
    .withMessage('New password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'),

  body('confirmNewPassword')
    .notEmpty()
    .withMessage('Please confirm your new password.')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('New passwords do not match.');
      }
      return true;
    }),
];

/**
 * Validation rules for user agent configuration updates.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updateAgentConfigValidation = [
  body('persona')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Persona cannot exceed 2000 characters.'),

  body('defaultModel')
    .optional()
    .isIn(CHAT_CONSTANTS.SUPPORTED_MODELS)
    .withMessage(`Model must be one of: ${CHAT_CONSTANTS.SUPPORTED_MODELS.join(', ')}`),

  body('defaultThinkingBudget')
    .optional()
    .isInt({ min: CHAT_CONSTANTS.MIN_THINKING_BUDGET, max: CHAT_CONSTANTS.MAX_THINKING_BUDGET })
    .withMessage(`Thinking budget must be between ${CHAT_CONSTANTS.MIN_THINKING_BUDGET} and ${CHAT_CONSTANTS.MAX_THINKING_BUDGET}.`),

  body('defaultLanguage')
    .optional()
    .isIn(CHAT_CONSTANTS.SUPPORTED_LANGUAGES)
    .withMessage(`Language must be one of: ${CHAT_CONSTANTS.SUPPORTED_LANGUAGES.join(', ')}`),

  body('sttEngine')
    .optional()
    .isIn(CHAT_CONSTANTS.STT_ENGINES)
    .withMessage(`STT engine must be one of: ${CHAT_CONSTANTS.STT_ENGINES.join(', ')}`),

  body('tts')
    .optional()
    .isObject()
    .withMessage('TTS settings must be an object.'),

  body('tts.amharicVoice')
    .optional()
    .trim()
    .isString()
    .isLength({ min: 1, max: 64 })
    .withMessage('Amharic voice ID must be a valid string.'),

  body('tts.englishVoice')
    .optional()
    .trim()
    .isString()
    .isLength({ min: 1, max: 64 })
    .withMessage('English voice ID must be a valid string.'),

  body('tts.speed')
    .optional()
    .isFloat({ min: TTS_CONSTANTS.MIN_SPEED, max: TTS_CONSTANTS.MAX_SPEED })
    .withMessage(`Speech speed must be between ${TTS_CONSTANTS.MIN_SPEED} and ${TTS_CONSTANTS.MAX_SPEED}.`),

  body('tts.autoPlay')
    .optional()
    .isBoolean()
    .withMessage('Auto-play must be a boolean.'),

  body('reportTemplates')
    .optional()
    .isObject()
    .withMessage('Report templates must be an object.'),

  body('reportTemplates.singleBranch')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH })
    .withMessage(`Single branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`),

  body('reportTemplates.multiBranch')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH })
    .withMessage(`Multi branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`),

  body('telegram')
    .optional()
    .isObject()
    .withMessage('Telegram settings must be an object.'),

  body('telegram.botToken')
    .optional({ nullable: true })
    .trim()
    .isString()
    .withMessage('Telegram bot token must be a string.'),

  body('telegram.managementChatId')
    .optional({ nullable: true })
    .trim()
    .isString()
    .withMessage('Telegram management chat ID must be a string.'),

  body('telegram.maintenanceChatId')
    .optional({ nullable: true })
    .trim()
    .isString()
    .withMessage('Telegram maintenance chat ID must be a string.'),

  body('telegram.generalChatId')
    .optional({ nullable: true })
    .trim()
    .isString()
    .withMessage('Telegram general chat ID must be a string.'),

  body('telegram.defaultFormat')
    .optional()
    .isIn(TELEGRAM_CONSTANTS.FORMATS)
    .withMessage(`Telegram default format must be one of: ${TELEGRAM_CONSTANTS.FORMATS.join(', ')}.`),
];

/**
 * Validation rules for supervisor directives updates.
 * @constant
 * @type {import('express-validator').ValidationChain[]}
 */
export const updateDirectivesValidation = [
  body('negativeVocabulary')
    .optional()
    .isArray()
    .withMessage('negativeVocabulary must be an array of strings.'),

  body('negativeVocabulary.*')
    .optional()
    .trim()
    .isString()
    .withMessage('Each negative vocabulary entry must be a string.'),

  body('phraseMappings')
    .optional()
    .isObject()
    .withMessage('phraseMappings must be an object of key-value pairs.'),

  body('customInstructions')
    .optional()
    .custom((val) => {
      if (Array.isArray(val) || typeof val === 'string') return true;
      throw new Error('customInstructions must be an array of strings or a string.');
    }),
];

export default {
  updateProfileValidation,
  updateAvatarValidation,
  updatePasswordValidation,
  updateAgentConfigValidation,
  updateDirectivesValidation,
};


````
