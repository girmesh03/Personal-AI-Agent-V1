/**
 * @module infrastructure/http/middleware/validate
 * @description Zod-based request validation middleware for Express routes.
 * Parses and validates req.body, req.query, and req.params against provided schemas.
 */

import { BadRequestError } from '../../../shared/errors/AppError.js';

/**
 * Creates an Express middleware to validate request components with Zod schemas.
 *
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 * @returns {import('express').RequestHandler}
 */
export const validate = (schemas = {}) => {
  return (req, _res, next) => {
    try {
      const validated = {};
      const schemaMap = (schemas && typeof schemas.safeParse === 'function' && schemas.shape)
        ? schemas.shape
        : (schemas || {});

      if (schemaMap.body) {
        const parsedBody = schemaMap.body.safeParse(req.body);
        if (!parsedBody.success) {
          const details = parsedBody.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          }));
          const firstMessage = details[0]?.message || 'Invalid request body.';
          throw new BadRequestError(firstMessage, 'VALIDATION_ERROR', details);
        }
        req.body = parsedBody.data;
        validated.body = parsedBody.data;
      }

      if (schemaMap.query) {
        const parsedQuery = schemaMap.query.safeParse(req.query);
        if (!parsedQuery.success) {
          const details = parsedQuery.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          }));
          const firstMessage = details[0]?.message || 'Invalid query parameters.';
          throw new BadRequestError(firstMessage, 'VALIDATION_ERROR', details);
        }
        try {
          req.query = parsedQuery.data;
        } catch (_e) {
          Object.defineProperty(req, 'query', {
            value: parsedQuery.data,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        }
        validated.query = parsedQuery.data;
      }

      if (schemaMap.params) {
        const parsedParams = schemaMap.params.safeParse(req.params);
        if (!parsedParams.success) {
          const details = parsedParams.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          }));
          const firstMessage = details[0]?.message || 'Invalid URL parameters.';
          throw new BadRequestError(firstMessage, 'VALIDATION_ERROR', details);
        }
        try {
          req.params = parsedParams.data;
        } catch (_e) {
          Object.defineProperty(req, 'params', {
            value: parsedParams.data,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        }
        validated.params = parsedParams.data;
      }

      req.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validate;
