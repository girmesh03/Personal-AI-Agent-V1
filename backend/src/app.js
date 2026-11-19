/**
 * @module app
 * @description Core Express 5 application setup, security middleware pipeline, and route mounting.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { env } from './config/env.js';
import { logStream } from './config/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HTTP_STATUS } from './utils/constants.js';
import apiV1Routes from './routes/index.js';

/**
 * Express application instance.
 * @type {import('express').Express}
 */
const app = express();

// 1. Helmet security headers
app.use(helmet());

// 2. CORS configuration with credentials support
/**
 * Origins loaded and parsed from environment CLIENT_ORIGIN.
 * @type {string[]}
 */
const configuredOrigins = env.CLIENT_ORIGIN
  ? env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

/**
 * Full whitelist of permitted client origins.
 * @type {string[]}
 */
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
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. Cookie parser for authentication tokens
app.use(cookieParser());

// 4. Response compression
app.use(compression());

// 5. JSON body parser with 10MB payload limit
app.use(express.json({ limit: '10mb' }));

// 6. URL-encoded body parser
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 7. HTTP request logger streaming to Winston
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logStream.write(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

/**
 * Canonical system health check endpoint (Protocol 35).
 * @route GET /api/v1/health
 * @access Public
 * @controller inline handler
 * @governs Protocol 35
 */
app.get('/api/v1/health', (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: env.NODE_ENV,
  });
});

// 8a. Initialize canonical req.validated container (Protocol 60)
app.use((req, _res, next) => {
  req.validated = { body: {}, query: {}, params: {} };
  next();
});

// 9. API v1 Router Mount
app.use('/api/v1', apiV1Routes);

// 10. Unmatched Route Handler (404)
app.use(notFoundHandler);

// 11. Global Error Handler
app.use(errorHandler);

export default app;
