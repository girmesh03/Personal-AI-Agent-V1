/**
 * @module infrastructure/http/routes
 * @description Consolidated API v1 route registry.
 */

import { Router } from 'express';
import { HTTP_STATUS } from '../../utils/constants.js';
import { env } from '../../config/env.js';
import { isDbConnected, getDbStatus } from '../database/connection.js';
import authRoutes from '../../modules/identity/http/authRoutes.js';
import profileRoutes from '../../modules/identity/http/profileRoutes.js';
import assetRoutes from '../../modules/assets/http/assetRoutes.js';

const router = Router();

/**
 * Health check endpoint for API v1.
 * Route: GET /api/v1/health
 */
router.get('/health', (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'UP',
    database: isDbConnected() ? 'CONNECTED' : 'DISCONNECTED',
    dbState: getDbStatus(),
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: env.NODE_ENV,
  });
});

/**
 * Authentication and identity routes.
 * Mounts: /api/v1/auth/*
 */
router.use('/auth', authRoutes);

/**
 * User profile and BYOK credential routes.
 * Mounts: /api/v1/users/* (with /api/v1/user fallback)
 */
router.use('/users', profileRoutes);
router.use('/user', profileRoutes);

/**
 * Private asset and document ingestion routes.
 * Mounts: /api/v1/assets/*
 */
router.use('/assets', assetRoutes);

export default router;
