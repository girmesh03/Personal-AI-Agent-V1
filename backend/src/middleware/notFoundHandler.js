/**
 * @module middleware/notFoundHandler
 * @description Catches all unmatched routes and forwards a NotFoundError to the error pipeline.
 */

import { NotFoundError } from '../errors/CustomError.js';

/**
 * 404 Not Found catch-all middleware.
 *
 * @function notFoundHandler
 * @param {import('express').Request} _req - Express request object (unused).
 * @param {import('express').Response} _res - Express response object (unused).
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 */
export const notFoundHandler = (_req, _res, next) => {
  next(new NotFoundError('The requested endpoint or resource was not found.'));
};

export default notFoundHandler;
