/**
 * @module app
 * @description Core Express 5 application setup, security middleware pipeline, and central route mounting.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiV1Routes from './routes/index.js';

const app = express();

// 1. Helmet security headers
app.use(helmet());

// 2. Strict CORS configuration with credentials support
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-Request-Id'],
  })
);

// 3. Cookie parser for HttpOnly session authentication tokens
app.use(cookieParser());

// 4. JSON body parser with 10MB payload limit
app.use(express.json({ limit: '10mb' }));

// 5. URL-encoded body parser
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. HTTP request logger via centralized Winston logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// 7. API v1 Central Router Mount (all domain routes mounted under /api/v1)
app.use('/api/v1', apiV1Routes);

// 8. Catch-all unmatched route handler (404)
app.use(notFoundHandler);

// 9. Centralized safe error translation middleware
app.use(errorHandler);

export default app;
