/**
 * @module routes/healthRoutes
 * @description Health and readiness verification routes.
 */

import express from 'express';
import { getHealth, getReadiness } from '../controllers/healthController.js';

const router = express.Router();

router.get('/', getHealth);
router.get('/ready', getReadiness);

export default router;
