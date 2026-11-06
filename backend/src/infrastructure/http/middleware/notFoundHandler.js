/**
 * @module infrastructure/http/middleware/notFoundHandler
 * @description Catches all unmatched routes and forwards a NotFoundError to the error pipeline.
 */

import { NotFoundError } from '../../../shared/errors/AppError.js';

/**
 * 404 Not Found catch-all middleware.
 * @function notFoundHandler
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 */
export const notFoundHandler = (req, _res, next) => {
  next(new NotFoundError(`The requested endpoint or resource '${req.originalUrl}' was not found.`));
};

export default notFoundHandler;
