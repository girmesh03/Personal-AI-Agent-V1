/**
 * @module routes/index
 * @description Central API v1 router consolidating and mounting domain route modules.
 * Strictly adheres to Protocol 20 & 36 (JSDoc), Protocol 35 (canonical health check & endpoints),
 * and Protocol 71 (universal JSDoc consistency and strong type contracts).
 */

import express from 'express';
import { HTTP_STATUS } from '../utils/constants.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';

/**
 * Central Express router instance for API v1.
 * @type {import('express').Router}
 */
const router = express.Router();

// Mount Authentication domain router
router.use('/auth', authRoutes);

// Mount User domain router
router.use('/users', userRoutes);

/**
 * Root API v1 operational status canary ping.
 * @route GET /api/v1/ping
 * @access Public
 * @controller inline handler
 * @governs Protocol 35
 */
router.get('/ping', (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Operon API v1 operational',
    timestamp: new Date().toISOString(),
  });
});

export default router;
