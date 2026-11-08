/**
 * @module middleware/notFoundHandler
 * @description Catches all unmatched API routes and forwards a NotFoundError to the centralized error pipeline.
 */

import { NotFoundError } from '../errors/AppError.js';

/**
 * 404 Not Found catch-all middleware.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 */
export const notFoundHandler = (req, _res, next) => {
  next(new NotFoundError(`The requested endpoint '${req.method} ${req.originalUrl}' was not found on this server.`));
};

export default notFoundHandler;
