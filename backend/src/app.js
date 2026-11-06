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
import { notFoundHandler } from './infrastructure/http/middleware/notFoundHandler.js';
import { errorHandler } from './infrastructure/http/middleware/errorHandler.js';
import { HTTP_STATUS } from './utils/constants.js';
import { isDbConnected, getDbStatus } from './infrastructure/database/connection.js';
import apiV1Routes from './infrastructure/http/routes.js';

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);

// 3. Cookie parser for session and authentication tokens
app.use(cookieParser());

// 4. JSON body parser with 10MB payload limit
app.use(express.json({ limit: '10mb' }));

// 5. URL-encoded body parser
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. HTTP request logger via Morgan (silenced in test environment)
if (env.NODE_ENV === 'production') {
  app.use(morgan('combined', { stream: logStream }));
} else if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 7. System Health Check endpoints (root and API mounts)
app.get(['/health', '/api/health', '/api/v1/health'], (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'UP',
    database: isDbConnected() ? 'CONNECTED' : 'DISCONNECTED',
    dbState: getDbStatus(),
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: env.NODE_ENV,
  });
});

// NOTE: Public static upload serving (`express.static('/uploads')`) is strictly PROHIBITED in V1.
// All asset access must pass through authenticated, owner-scoped download routes.

// 8. API v1 Router Mount
app.use('/api/v1', apiV1Routes);

// 9. Unmatched Route Handler (404)
app.use(notFoundHandler);

// 10. Global Error Handler (4-argument signature)
app.use(errorHandler);

export default app;
