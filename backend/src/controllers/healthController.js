/**
 * @module controllers/healthController
 * @description System health, liveness, and readiness check controller.
 */

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../utils/constants.js';

/**
 * Returns overall system health and connected services status.
 *
 * @param {import('express').Request} _req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
export const getHealth = (_req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  res.status(HTTP_STATUS.OK).json({
    status: isDbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime() * 100) / 100,
    environment: env.NODE_ENV,
    services: {
      database: {
        status: isDbConnected ? 'connected' : 'disconnected',
        name: mongoose.connection.name || 'operon-v1',
      },
    },
  });
};

/**
 * Kubernetes / load-balancer readiness probe.
 * Returns 200 if database is fully ready, 503 if disconnected.
 *
 * @param {import('express').Request} _req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
export const getReadiness = (_req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    return res.status(HTTP_STATUS.OK).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: 'connected',
        },
      },
    });
  }

  return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
    status: 'unready',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: 'disconnected',
      },
    },
  });
};

export default {
  getHealth,
  getReadiness,
};
