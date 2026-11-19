/**
 * @module routes/index
 * @description Central API v1 router consolidating and mounting domain route modules.
 */

import express from 'express';
import { HTTP_STATUS } from '../utils/constants.js';

const router = express.Router();

/**
 * Root API v1 operational status ping.
 * @route GET /api/v1/ping
 * @access Public
 */
router.get('/ping', (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Operon API v1 operational',
    timestamp: new Date().toISOString(),
  });
});

export default router;
