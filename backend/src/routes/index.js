/**
 * @module routes/index
 * @description Central API v1 router consolidating and mounting all domain route modules.
 */

import express from 'express';
import healthRoutes from './healthRoutes.js';

const router = express.Router();

// Mount system health and readiness routes (/api/v1/health)
router.use('/health', healthRoutes);

export default router;
