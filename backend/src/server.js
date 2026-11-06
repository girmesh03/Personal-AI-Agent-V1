/**
 * @module server
 * @description Main HTTP server bootstrap, lifecycle management, and graceful process shutdown.
 */

import http from 'node:http';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

let server = null;

/**
 * Initializes and starts the HTTP server.
 * @function startServer
 * @param {number} [portOverride] - Optional port to bind to.
 * @returns {Promise<http.Server>} Running HTTP server instance.
 */
export const startServer = (portOverride = null) => {
  const port = portOverride ?? env.PORT;

  return new Promise((resolve, reject) => {
    try {
      server = http.createServer(app);

      server.listen(port, () => {
        logger.info(`==================================================`);
        logger.info(`  Personal AI Agent V1 (Operon) Server Running`);
        logger.info(`  Port:        ${port}`);
        logger.info(`  Environment: ${env.NODE_ENV}`);
        logger.info(`  Client URL:  ${env.CLIENT_ORIGIN}`);
        logger.info(`  Health:      http://localhost:${port}/api/v1/health`);
        logger.info(`==================================================`);
        resolve(server);
      });

      server.on('error', (err) => {
        logger.error(`[SERVER_START_ERROR] Failed to start HTTP server: ${err.message}`, err);
        reject(err);
      });
    } catch (err) {
      logger.error(`[SERVER_INITIALIZE_ERROR] Synchronous server error: ${err.message}`, err);
      reject(err);
    }
  });
};

/**
 * Gracefully terminates the running HTTP server.
 * @function stopServer
 * @returns {Promise<void>}
 */
export const stopServer = () => {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }

    server.close((err) => {
      if (err) {
        logger.error(`[SERVER_SHUTDOWN_ERROR] Error closing HTTP server: ${err.message}`, err);
        reject(err);
        return;
      }
      logger.info('HTTP server closed successfully.');
      server = null;
      resolve();
    });
  });
};

/**
 * Handles graceful shutdown signals (SIGTERM / SIGINT).
 * @param {string} signal - Received OS signal name.
 */
const handleShutdown = async (signal) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  try {
    await stopServer();
    logger.info('Graceful shutdown completed.');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during graceful shutdown on ${signal}: ${err.message}`, err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Auto-start if executed directly (and not during automated test execution)
const isDirectExecution =
  process.argv[1] &&
  (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].endsWith('server.js'));

if (isDirectExecution && env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    logger.error(`Fatal server launch error: ${err.message}`, err);
    process.exit(1);
  });
}

export default server;
