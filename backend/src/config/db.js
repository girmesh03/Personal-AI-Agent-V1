/**
 * @module config/db
 * @description MongoDB connection engine with exponential backoff initial connection retries and graceful shutdown.
 */

import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Reconnection backoff configuration for initial startup.
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

// Avoid recursive reconnect races on disconnect: native Mongoose/Mongo driver topology monitoring handles connection recovery
mongoose.connection.on('disconnected', () => {
  if (isShuttingDown) {
    logger.info('MongoDB disconnected cleanly during application shutdown');
  } else {
    logger.warn('MongoDB disconnected. Topology monitor will handle reconnection automatically.');
  }
});

export default {
  connectDB,
  disconnectDB,
};
