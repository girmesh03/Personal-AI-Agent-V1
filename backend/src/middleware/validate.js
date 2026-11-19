/**
 * @module middleware/validate
 * @description Generic schema validation middleware powered by Zod 4.
 * Strictly adheres to Protocol 18 (unified validation), Protocol 39 (strict validation hygiene),
 * Protocol 40 (mandatory pre-handler request validation), and Protocol 60 (strict validated data access via req.validated).
 */

import { ValidationError } from '../errors/CustomError.js';

/**
 * Creates an Express middleware handler that validates incoming request data against a Zod schema.
 * Formats parse issues into structured field errors and forwards a typed ValidationError.
 * Attaches sanitized and validated payload strictly to req.validated[source] and req[source].
 *
 * @function validate
 * @param {import('zod').ZodType} schema - Zod schema to validate against.
 * @param {'body'|'query'|'params'} [source='body'] - Request property to inspect and validate.
 * @returns {import('express').RequestHandler} Express middleware handler.
 */
export const validate = (schema, source = 'body') => {
  return (req, _res, next) => {
    const payload = req[source] !== undefined ? req[source] : {};
    const result = schema.safeParse(payload);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.length > 0 ? issue.path.join('.') : 'root',
        message: issue.message,
      }));

      return next(new ValidationError('Request validation failed', details));
    }

    // Attach validated, sanitized data strictly to req.validated and req[source] (Protocol 60)
    req.validated = req.validated || { body: {}, query: {}, params: {} };
    req.validated[source] = result.data;

    // Safely populate req[source] (handles getter-only properties in Express 5 such as req.query)
    try {
      req[source] = result.data;
    } catch {
      Object.defineProperty(req, source, {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    next();
  };
};

export default validate;

