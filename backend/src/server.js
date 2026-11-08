/**
 * @module server
 * @description Main HTTP server bootstrap, database initialization, and graceful process management.
 */

import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';

let server;

/**
 * Initializes database connection and starts HTTP listener.
 *
 * @returns {Promise<http.Server>} Active HTTP server instance.
 */
export const startServer = async () => {
  try {
    // 1. Establish database connection before accepting traffic
    await connectDB();

    // 2. Initialize HTTP server
    server = http.createServer(app);

    server.listen(env.PORT, () => {
      logger.info('==================================================');
      logger.info('  Operon / Personal AI Agent V1 Backend Running');
      logger.info(`  Port:        ${env.PORT}`);
      logger.info(`  Environment: ${env.NODE_ENV}`);
      logger.info(`  Client URL:  ${env.CLIENT_ORIGIN}`);
      logger.info(`  Health:      http://localhost:${env.PORT}/api/v1/health`);
      logger.info('==================================================');
    });

    return server;
  } catch (error) {
    logger.error(`[FATAL] Server initialization failed: ${error.message}\n${error.stack}`);
    process.exit(1);
  }
};

/**
 * Gracefully shuts down the HTTP server and database connections.
 *
 * @param {string} signal - The termination signal received (e.g. SIGTERM, SIGINT).
 * @returns {Promise<void>}
 */
export const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

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

// Bind process termination signals
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
